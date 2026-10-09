import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SCHEMA_VERSION } from '../lib/migrations';
import { setPageUi } from '../lib/studio/page-ui';
import { otherTabRunning, queue, runQueue, setOtherTabRuns, setRunnerLock, type QueueItem } from '../lib/studio/queue-runner';
import { setBridge } from '../lib/studio/queue-files';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';
import { followOtherTab, installUnloadGuard, persistQueue, restoreQueue } from '../lib/studio/queue-store';
import { disposeState, flushState, initState } from '../lib/studio/state';

const item = (name: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}): QueueItem => ({
  id: 'id-' + name, src: 'bridge', file: { name, size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});

beforeEach(async () => {
  disposeState(); // initState() is idempotent: start each test from a fresh store
  fakeBrowser.reset();
  queue.splice(0);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
});
afterEach(() => {
  vi.useRealTimers();
  setOtherTabRuns(false);
});

describe('queue store', () => {
  it('restores the stored queue; an interrupted upload comes back as an error', async () => {
    await browser.storage.local.set({ queue: [item('A.mp4', 'done'), item('B.mp4', 'uploading', { draftId: 'abcdefghijk' }), item('C.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    expect(queue.map((i) => i.status)).toEqual(['done', 'error', 'pending']);
    expect(queue[1]!.msg).toBe('The page reloaded during the upload — check Content for a leftover draft, then retry (abcdefghijk)');
    await flushState(); // written back, so the side panel shows the error too
    expect(((await browser.storage.local.get('queue')).queue as QueueItem[]).map((i) => i.status)).toEqual(['done', 'error', 'pending']);
  });

  it("leaves another tab's running upload alone", async () => {
    await browser.storage.local.set({ queue: [item('B.mp4', 'uploading')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false);
    expect(queue[0]!.status).toBe('uploading');
  });

  it('writes changes back, a moment later', async () => {
    vi.useFakeTimers();
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue.push(item('A.mp4', 'pending'));
    persistQueue();
    vi.advanceTimersByTime(300);
    await flushState();
    expect((await browser.storage.local.get('queue')).queue).toEqual([item('A.mp4', 'pending')]);
  });

  it("writes nothing while another tab runs the queue (that tab's copy is the real one)", async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ queue: [item('A.mp4', 'uploading')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false);
    persistQueue(); // a save already waiting when the other tab took the lock
    setOtherTabRuns(true);
    queue.push(item('B.mp4', 'pending'));
    persistQueue();
    vi.advanceTimersByTime(1000);
    await flushState();
    expect((await browser.storage.local.get('queue')).queue).toEqual([item('A.mp4', 'uploading')]);
  });

  // The cached flag can be stale-true when this tab wins the runner lock; this tab's own
  // saves must not be skipped because of it.
  it('still writes while this tab runs the queue, even with the flag stale', async () => {
    vi.stubGlobal('document', makeDocument());
    vi.stubGlobal('location', { pathname: '/channel/UCabcdefghijklmn/videos' });
    Object.assign(document, { hasFocus: () => true });
    setBridge(null); // the item fails fast at getQueueFile
    setRunnerLock({ acquire: async () => true, release: () => {} });
    const noop = () => {};
    setPageUi({
      item: () => persistQueue(), run: noop, queue: noop, schedule: noop, presetPreview: noop, toast: noop,
      openDrawer: noop, notifyDone: noop, setTitleMark: noop, confirmStart: async () => true,
    });
    const confirm = settings.confirmStart;
    settings.confirmStart = false;
    try {
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true);
      queue.push(item('A.mp4', 'pending'));
      setOtherTabRuns(true);
      await runQueue();
      setOtherTabRuns(false); // the refresh after the run (studio.content: .finally(elsewhere))
      await vi.waitFor(async () => {
        await flushState();
        const saved = (await browser.storage.local.get('queue')).queue as QueueItem[] | undefined;
        expect(saved?.[0]?.status).toBe('error');
      });
    } finally {
      settings.confirmStart = confirm;
      setRunnerLock({ acquire: async () => true, release: () => {} });
      vi.unstubAllGlobals();
    }
  });

  it('writes a waiting change at once when the page goes away, or the script is torn down', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', new EventTarget());
    try {
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true);
      const dispose = installUnloadGuard();
      queue.push(item('A.mp4', 'uploading', { draftId: 'abcdefghijk' }));
      persistQueue();
      window.dispatchEvent(new Event('pagehide')); // no timer advanced: the 300 ms never pass
      await flushState();
      expect((await browser.storage.local.get('queue')).queue).toEqual([item('A.mp4', 'uploading', { draftId: 'abcdefghijk' })]);

      queue[0]!.status = 'review';
      persistQueue();
      dispose();
      await flushState();
      expect(((await browser.storage.local.get('queue')).queue as QueueItem[])[0]!.status).toBe('review');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('follows changes from elsewhere', async () => {
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    await browser.storage.local.set({ queue: [item('Z.mp4', 'pending')] });
    expect(queue.map((i) => i.file.name)).toEqual(['Z.mp4']);
  });

  it('a save from another window while ours waits keeps both edits (3b M3)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true }; // this window's edit, saved 300 ms later
    persistQueue();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending'), item('B.mp4', 'pending', { title: 'theirs', titleEdited: true })] });
    await vi.advanceTimersByTimeAsync(0); // the other window's save arrives
    expect(queue.map((i) => i.title)).toEqual(['mine', 'theirs']);
    await vi.advanceTimersByTimeAsync(300);
    await flushState();
    expect(((await browser.storage.local.get('queue')).queue as QueueItem[]).map((i) => i.title)).toEqual(['mine', 'theirs']);
  });

  it('two foreign saves while ours waits: the second one counts, not ours (review I3)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true };
    persistQueue();
    const theirs = (title: string) => [item('A.mp4', 'pending'), item('B.mp4', 'pending', { title, titleEdited: true })];
    await browser.storage.local.set({ queue: theirs('x') });
    await vi.advanceTimersByTimeAsync(0);
    await browser.storage.local.set({ queue: theirs('y') });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.map((i) => i.title)).toEqual(['mine', 'y']);
  });

  it('an edit of ours already saved does not beat a newer foreign edit of that item (review I3)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true };
    persistQueue();
    await vi.advanceTimersByTimeAsync(300);
    await flushState(); // our save of A has landed
    queue[1] = { ...queue[1]!, title: 'b here', titleEdited: true }; // a new edit waits
    persistQueue();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending', { title: 'theirs', titleEdited: true }), item('B.mp4', 'pending')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.map((i) => i.title)).toEqual(['theirs', 'b here']);
  });

  it('a save dropped because another tab started running is no longer waiting: its saves replace our copy (review m2)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true };
    persistQueue();
    setOtherTabRuns(true); // within the 300 ms, another tab starts the queue
    persistQueue(); // blocked: nothing will be saved
    await browser.storage.local.set({ queue: [item('A.mp4', 'uploading')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.map((i) => i.status)).toEqual(['uploading']);
  });

  it('with no save of ours waiting, a foreign save replaces the copy as before', async () => {
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    await browser.storage.local.set({ queue: [item('B.mp4', 'pending')] });
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.map((i) => i.file.name)).toEqual(['B.mp4']);
  });

  // The running tab closed mid-run: its items stay 'uploading' in storage, and no tab
  // would ever move them on. The mirror tab cuts them like a reload does.
  describe('the other tab stops running', () => {
    const stored = async () => ((await browser.storage.local.get('queue')).queue as QueueItem[]).map((i) => i.status);
    beforeEach(async () => {
      await browser.storage.local.set({ queue: [item('A.mp4', 'done'), item('B.mp4', 'uploading'), item('C.mp4', 'review'), item('D.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false);
    });

    it('marks its unfinished items interrupted and saves them', async () => {
      await followOtherTab(true);
      expect(otherTabRunning()).toBe(true);
      expect(queue.map((i) => i.status)).toEqual(['done', 'uploading', 'review', 'pending']);
      await followOtherTab(false);
      expect(otherTabRunning()).toBe(false);
      expect(queue.map((i) => i.status)).toEqual(['done', 'error', 'error', 'pending']);
      expect(queue[1]!.msg).toMatch(/^The page reloaded during the upload/);
      await flushState();
      expect(await stored()).toEqual(['done', 'error', 'error', 'pending']);
    });

    it('does nothing without a flip from true to false', async () => {
      await followOtherTab(false);
      await followOtherTab(false);
      expect(queue.map((i) => i.status)).toEqual(['done', 'uploading', 'review', 'pending']);
    });

    // The running tab flushes its final 'done' before releasing the lock; this tab's copy
    // can still say 'uploading', so the cut is made on a fresh read of storage.
    it('cuts what storage holds now, not its own stale copy', async () => {
      await followOtherTab(true);
      await browser.storage.local.set({ queue: [item('A.mp4', 'done'), item('B.mp4', 'done'), item('C.mp4', 'done'), item('D.mp4', 'pending')] });
      queue.splice(0, queue.length, item('A.mp4', 'done'), item('B.mp4', 'uploading'), item('C.mp4', 'review'), item('D.mp4', 'pending'));
      await followOtherTab(false);
      expect(await stored()).toEqual(['done', 'done', 'done', 'pending']);
      expect(queue.map((i) => i.status)).toEqual(['done', 'done', 'done', 'pending']);
    });
  });
});
