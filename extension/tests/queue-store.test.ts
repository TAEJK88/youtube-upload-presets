import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SCHEMA_VERSION } from '../lib/migrations';
import { setPageUi } from '../lib/studio/page-ui';
import { getEditRev, otherTabRunning, queue, runQueue, setOtherTabRuns, setRunnerLock, type QueueItem } from '../lib/studio/queue-runner';
import { setBridge } from '../lib/studio/queue-files';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';
import { adoptChannel, followOtherTab, installUnloadGuard, persistQueue, restoreQueue, setRunnerChannel } from '../lib/studio/queue-store';
import { disposeState, flushState, initState, load } from '../lib/studio/state';

const item = (name: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}): QueueItem => ({
  id: 'id-' + name, src: 'bridge', file: { name, size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});
const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const KA = 'queue:' + A;
const KB = 'queue:' + B;
const KEY = KA; // the single-channel cases below
const stored = async (key: string) => (await browser.storage.local.get(key))[key] as QueueItem[];

beforeEach(async () => {
  disposeState(); // initState() is idempotent: start each test from a fresh store
  fakeBrowser.reset();
  queue.splice(0);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
});
afterEach(() => {
  vi.useRealTimers();
  setOtherTabRuns(false);
  setRunnerChannel('');
});

describe('queue store', () => {
  // Each channel's items live under their own key (queue:<channelId>); a tab reads and writes only its own.
  describe('one key per channel', () => {
    const save = async () => { persistQueue(); await vi.advanceTimersByTimeAsync(300); await flushState(); };

    it("a tab sees only its channel's key and writes only that key", async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')], [KB]: [item('B1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, B);
      expect(queue).toEqual([item('B1.mp4', 'pending')]);
      queue.push(item('B2.mp4', 'pending'));
      await save();
      expect(await stored(KB)).toEqual([item('B1.mp4', 'pending'), item('B2.mp4', 'pending')]);
      expect(await stored(KA)).toEqual([item('A1.mp4', 'pending')]);
      expect(await stored('queue')).toBeUndefined();
    });

    it('a key removed after the store loaded reads as an empty queue', async () => {
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      await browser.storage.local.remove(KA);
      await vi.waitFor(() => expect(load<QueueItem[] | null>(KA, null)).toBe(null));
      expect(() => restoreQueue(true, A)).not.toThrow();
      expect(queue).toEqual([]);
    });

    it("another channel's save doesn't show up here", async () => {
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, A);
      await browser.storage.local.set({ [KB]: [item('B1.mp4', 'pending')] });
      await vi.waitFor(() => expect(load<QueueItem[]>(KB, []).length).toBe(1));
      expect(queue).toEqual([item('A1.mp4', 'pending')]);
    });

    // The panel's Clear all / Remove / edits change this tab's in-memory queue (queue-ops).
    it("emptying this channel's queue leaves the other channel's items", async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')], [KB]: [item('B1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, B);
      queue.splice(0);
      await save();
      expect(await stored(KB)).toEqual([]);
      expect(await stored(KA)).toEqual([item('A1.mp4', 'pending')]);
    });

    it("two channels saving in turn never lose each other's items", async () => {
      vi.useFakeTimers();
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, A);
      queue.push(item('A1.mp4', 'pending'));
      await save();
      queue.splice(0); // the next tab: a Studio page on channel B
      restoreQueue(true, B);
      expect(queue).toEqual([]);
      queue.push(item('B1.mp4', 'pending'));
      await save();
      restoreQueue(true, A);
      expect(queue).toEqual([item('A1.mp4', 'pending')]);
      queue.push(item('A2.mp4', 'pending'));
      await save();
      expect(await stored(KA)).toEqual([item('A1.mp4', 'pending'), item('A2.mp4', 'pending')]);
      expect(await stored(KB)).toEqual([item('B1.mp4', 'pending')]);
    });

    it("a tab that runs the queue on channel A writes A and leaves B's key alone", async () => {
      vi.stubGlobal('document', makeDocument());
      vi.stubGlobal('location', { pathname: `/channel/${A}/videos` });
      Object.assign(document, { hasFocus: () => true });
      setBridge(null);
      setRunnerLock({ acquire: async () => true, release: () => {} });
      const noop = () => {};
      setPageUi({
        item: () => persistQueue(), run: noop, queue: noop, schedule: noop, presetPreview: noop, toast: noop,
        openDrawer: noop, notifyDone: noop, setTitleMark: noop, confirmStart: async () => true,
      });
      const confirm = settings.confirmStart;
      settings.confirmStart = false;
      try {
        await browser.storage.local.set({ [KB]: [item('B.mp4', 'pending')] });
        await initState(async () => SCHEMA_VERSION);
        restoreQueue(true, A);
        queue.push(item('A.mp4', 'pending'));
        setOtherTabRuns(true); // stale flag
        await runQueue();
        setOtherTabRuns(false);
        await vi.waitFor(async () => {
          await flushState();
          expect((await stored(KA))?.[0]).toMatchObject({ status: 'error' });
          expect(await stored(KB)).toEqual([item('B.mp4', 'pending')]);
        });
      } finally {
        settings.confirmStart = confirm;
        setRunnerLock({ acquire: async () => true, release: () => {} });
        vi.unstubAllGlobals();
      }
    });

    it("a mirror tab follows only its own channel's key", async () => {
      await browser.storage.local.set({ [KA]: [item('A.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false, A);
      await browser.storage.local.set({ [KA]: [item('A.mp4', 'done')], [KB]: [item('B.mp4', 'uploading')] });
      await vi.waitFor(() => expect(queue.map((i) => i.status)).toEqual(['done']));
    });

    it("followOtherTab cuts only this channel's unfinished items", async () => {
      await browser.storage.local.set({ [KA]: [item('A.mp4', 'uploading')], [KB]: [item('B.mp4', 'uploading')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false, A);
      await followOtherTab(true);
      await followOtherTab(false);
      expect(queue.map((i) => i.status)).toEqual(['error']);
      await flushState();
      expect((await stored(KA)).map((i) => i.status)).toEqual(['error']);
      expect((await stored(KB)).map((i) => i.status)).toEqual(['uploading']);
    });
  });

  // Studio's ytcfg not read yet: no key to save under, so nothing is saved until the channel is known.
  describe('a tab whose channel is not known yet', () => {
    it('shows nothing stored and saves nothing', async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      const set = vi.spyOn(browser.storage.local, 'set');
      restoreQueue(true, '');
      expect(queue).toEqual([]);
      queue.push(item('NEW.mp4', 'pending'));
      persistQueue();
      await vi.advanceTimersByTimeAsync(300);
      await flushState();
      expect(set).not.toHaveBeenCalled();
      set.mockRestore();
    });

    it("adoptChannel loads the channel's key, keeps the unsaved items, saves and follows it", async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')], [KB]: [item('B1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, '');
      queue.push(item('NEW.mp4', 'pending'));
      persistQueue();
      const rev = getEditRev();
      adoptChannel(A);
      expect(queue).toEqual([item('A1.mp4', 'pending'), item('NEW.mp4', 'pending')]);
      expect(getEditRev()).toBe(rev + 1); // a start summary taken before is refused
      await flushState();
      expect(await stored(KA)).toEqual([item('A1.mp4', 'pending'), item('NEW.mp4', 'pending')]);
      expect(await stored(KB)).toEqual([item('B1.mp4', 'pending')]);
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'done')] });
      await vi.waitFor(() => expect(queue.map((i) => i.status)).toEqual(['done']));
    });

    it('adoptChannel ignores an empty id, and a known channel stays (switching channels reloads Studio)', async () => {
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')], [KB]: [item('B1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, '');
      adoptChannel('');
      expect(queue).toEqual([]);
      adoptChannel(A);
      adoptChannel(B);
      expect(queue).toEqual([item('A1.mp4', 'pending')]);
    });

    it('adoptChannel waits while a tab of unknown channel runs the queue', async () => {
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false, '');
      setOtherTabRuns(true);
      adoptChannel(A);
      expect(queue).toEqual([]);
      setOtherTabRuns(false);
      adoptChannel(A);
      expect(queue).toEqual([item('A1.mp4', 'pending')]);
    });
  });

  // The runner lock stays global; only a tab on the running tab's channel is held back.
  describe("another channel's run", () => {
    const save = async () => { persistQueue(); await vi.advanceTimersByTimeAsync(300); await flushState(); };

    it("a tab on B saves its own key while A runs, and A's is untouched", async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'uploading')] });
      await initState(async () => SCHEMA_VERSION);
      setOtherTabRuns(true);
      setRunnerChannel(A); // the holder's channel, as the background answers it
      restoreQueue(false, B);
      queue.push(item('B1.mp4', 'pending'));
      await save();
      expect(await stored(KB)).toEqual([item('B1.mp4', 'pending')]);
      expect(await stored(KA)).toEqual([item('A1.mp4', 'uploading')]);
    });

    it("a second tab on A is still held back, and so is any tab when the runner's channel is unknown", async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'uploading')] });
      await initState(async () => SCHEMA_VERSION);
      setOtherTabRuns(true);
      setRunnerChannel(A); // the holder's channel, as the background answers it
      restoreQueue(false, A);
      queue.push(item('A2.mp4', 'pending'));
      await save();
      expect(await stored(KA)).toEqual([item('A1.mp4', 'uploading')]);
      setRunnerChannel(''); // a holder whose channel isn't known
      queue.splice(0);
      restoreQueue(false, B);
      queue.push(item('B1.mp4', 'pending'));
      await save();
      expect(await stored(KB)).toBeUndefined();
    });

    // The holder's channel is never cleared: it only counts while otherTabRunning() says a tab holds the lock.
    it('a marker left by a holder that closed or crashed holds nobody back', async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      setRunnerChannel(A);
      setOtherTabRuns(false); // runner:elsewhere answered false: nobody holds the lock
      restoreQueue(true, A);
      queue.push(item('A2.mp4', 'pending'));
      await save();
      expect((await stored(KA)).map((i) => i.file.name)).toEqual(['A1.mp4', 'A2.mp4']);
    });

    it("an A run that crashed leaves its uploading item to be cut by the next A tab, not held as 'running'", async () => {
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'uploading')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, A);
      expect(queue.map((i) => i.status)).toEqual(['error']);
      await flushState();
      expect((await stored(KA)).map((i) => i.status)).toEqual(['error']);
    });

    it("A's run ending changes nothing in a tab on B: no read-back, no cut, no write", async () => {
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'uploading')], [KB]: [item('B1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      setOtherTabRuns(true);
      setRunnerChannel(A); // the holder's channel, as the background answers it
      restoreQueue(false, B);
      const set = vi.spyOn(browser.storage.local, 'set');
      await followOtherTab(false);
      await flushState();
      expect(otherTabRunning()).toBe(false);
      expect(queue.map((i) => i.status)).toEqual(['pending']);
      expect(set).not.toHaveBeenCalled();
      set.mockRestore();
    });

    it("B edits while A runs reach B's key only, however often A's tab saves", async () => {
      vi.useFakeTimers();
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'uploading')], [KB]: [item('B1.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      setOtherTabRuns(true);
      setRunnerChannel(A); // the holder's channel, as the background answers it
      restoreQueue(false, B);
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'done')] }); // A's tab saves
      await vi.advanceTimersByTimeAsync(0);
      expect(queue.map((i) => i.file.name)).toEqual(['B1.mp4']);
      queue[0] = { ...queue[0]!, title: 'edited', titleEdited: true };
      await save();
      expect((await stored(KB))[0]!.title).toBe('edited');
      expect(await stored(KA)).toEqual([item('A1.mp4', 'done')]);
    });

    it("a tab on B loaded while A runs cuts B's own interrupted item", async () => {
      await browser.storage.local.set({ [KA]: [item('A1.mp4', 'uploading')], [KB]: [item('B1.mp4', 'uploading')] });
      await initState(async () => SCHEMA_VERSION);
      setOtherTabRuns(true);
      setRunnerChannel(A); // the holder's channel, as the background answers it
      restoreQueue(false, B);
      expect(queue.map((i) => i.status)).toEqual(['error']);
      await flushState();
      expect((await stored(KB)).map((i) => i.status)).toEqual(['error']);
      expect((await stored(KA)).map((i) => i.status)).toEqual(['uploading']);
    });
  });
  it('restores the stored queue; an interrupted upload comes back as an error', async () => {
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'done'), item('B.mp4', 'uploading', { draftId: 'abcdefghijk' }), item('C.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    expect(queue.map((i) => i.status)).toEqual(['done', 'error', 'pending']);
    expect(queue[1]!.msg).toBe('The page reloaded during the upload — check Content for a leftover draft, then retry (abcdefghijk)');
    await flushState(); // written back, so the side panel shows the error too
    expect(((await browser.storage.local.get(KEY))[KEY] as QueueItem[]).map((i) => i.status)).toEqual(['done', 'error', 'pending']);
  });

  // P5-draft-retry: what an earlier build stored when a dialog stayed open (lib/drafts.ts).
  describe('draft ids on cards that never handed a file to Studio', () => {
    const TAIL = ' · The file is already uploaded as a draft (M-A1h9Vno7M). Delete it in Content before retrying to avoid duplicates';
    const cascade = () => [
      item('118.mp4', 'error', { draftId: 'M-A1h9Vno7M', msg: 'Scheduling failed: Could not open the calendar' + TAIL }),
      item('119.mp4', 'error', { draftId: 'M-A1h9Vno7M', msg: 'An upload dialog is still open. Close it, then start again' + TAIL }),
    ];
    const repaired = [
      item('118.mp4', 'error', { draftId: 'M-A1h9Vno7M', msg: 'Scheduling failed: Could not open the calendar · The file is already a draft in Studio (M-A1h9Vno7M). Retry goes on with that draft, without uploading again' }),
      item('119.mp4', 'error', { draftId: '', msg: 'An upload dialog is still open. Close it, then start again · This file was not uploaded. Retry uploads it' }),
    ];

    it('are repaired when the queue is loaded, and written back for the side panel', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      await browser.storage.local.set({ [KEY]: cascade() });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, A);
      expect(queue).toEqual(repaired);
      await flushState();
      expect((await browser.storage.local.get(KEY))[KEY]).toEqual(repaired);
      expect(info).toHaveBeenCalledTimes(1);
      info.mockRestore();
    });

    it('a message that was only reworded is written back too', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      await browser.storage.local.set({ [KEY]: [cascade()[0]] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, A);
      await flushState();
      expect((await browser.storage.local.get(KEY))[KEY]).toEqual([repaired[0]]);
      vi.restoreAllMocks();
    });

    it('not in a tab that mirrors another tab\'s run: nothing is changed or written there', async () => {
      await browser.storage.local.set({ [KEY]: cascade() });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false, A);
      expect(queue).toEqual(cascade());
      await flushState();
      expect((await browser.storage.local.get(KEY))[KEY]).toEqual(cascade());
    });

    it('a queue with nothing to repair is not written', async () => {
      await browser.storage.local.set({ [KEY]: repaired });
      await initState(async () => SCHEMA_VERSION);
      const set = vi.spyOn(browser.storage.local, 'set');
      restoreQueue(true, A);
      await flushState();
      expect(set).not.toHaveBeenCalled();
      set.mockRestore();
    });
  });

  it("leaves another tab's running upload alone", async () => {
    await browser.storage.local.set({ [KEY]: [item('B.mp4', 'uploading')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false, A);
    expect(queue[0]!.status).toBe('uploading');
  });

  it('writes changes back, a moment later', async () => {
    vi.useFakeTimers();
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    queue.push(item('A.mp4', 'pending'));
    persistQueue();
    vi.advanceTimersByTime(300);
    await flushState();
    expect((await browser.storage.local.get(KEY))[KEY]).toEqual([item('A.mp4', 'pending')]);
  });

  it("writes nothing while another tab runs the queue (that tab's copy is the real one)", async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'uploading')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false, A);
    persistQueue(); // a save already waiting when the other tab took the lock
    setOtherTabRuns(true);
    queue.push(item('B.mp4', 'pending'));
    persistQueue();
    vi.advanceTimersByTime(1000);
    await flushState();
    expect((await browser.storage.local.get(KEY))[KEY]).toEqual([item('A.mp4', 'uploading')]);
  });

  // What a capture of a card left on "Retrying (1 of 2)" is read by (README item 94).
  describe('says what a card mid-retry was left as', () => {
    const RETRY_EN = 'Retrying on the draft (1 of 2)…';
    const RETRY_TH = 'ลองใหม่บนฉบับร่าง (ครั้งที่ 1 จาก 2)…';

    it('a skipped save, once per spell of skipped saves', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await browser.storage.local.set({ [KEY]: [item('A.mp4', 'uploading', { msg: RETRY_EN })] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false, A);
      warn.mockClear(); // the line of the load itself
      setOtherTabRuns(true);
      persistQueue();
      persistQueue();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(`[ytup] draft retry: queue not saved here (another tab runs the queue); storage keeps "A.mp4" as "${RETRY_EN}" · tab visible`);
      warn.mockRestore();
    });

    it('no line when nothing is uploading', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false, A);
      setOtherTabRuns(true);
      persistQueue();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it.each([['English', RETRY_EN], ['Thai', RETRY_TH]])('a page loaded on a card stored mid-retry (%s); it is still marked interrupted', async (_, msg) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await browser.storage.local.set({ [KEY]: [item('A.mp4', 'uploading', { msg, draftId: 'abcdefghijk' })] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, A);
      expect(warn).toHaveBeenCalledWith(`[ytup] draft retry: page loaded while "A.mp4" was mid-retry ("${msg}"); marked interrupted · tab visible`);
      expect(queue[0]!.status).toBe('error');
      warn.mockRestore();
    });

    it('not for an upload that was not retrying', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await browser.storage.local.set({ [KEY]: [item('A.mp4', 'uploading', { msg: 'Uploading…' })] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(true, A);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  // The cached flag can be stale-true when this tab wins the runner lock; this tab's own
  // saves must not be skipped because of it.
  it('still writes while this tab runs the queue, even with the flag stale', async () => {
    vi.stubGlobal('document', makeDocument());
    vi.stubGlobal('location', { pathname: `/channel/${A}/videos` });
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
      restoreQueue(true, A);
      queue.push(item('A.mp4', 'pending'));
      setOtherTabRuns(true);
      await runQueue();
      setOtherTabRuns(false); // the refresh after the run (studio.content: .finally(elsewhere))
      await vi.waitFor(async () => {
        await flushState();
        const saved = (await browser.storage.local.get(KEY))[KEY] as QueueItem[] | undefined;
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
      restoreQueue(true, A);
      const dispose = installUnloadGuard();
      queue.push(item('A.mp4', 'uploading', { draftId: 'abcdefghijk' }));
      persistQueue();
      window.dispatchEvent(new Event('pagehide')); // no timer advanced: the 300 ms never pass
      await flushState();
      expect((await browser.storage.local.get(KEY))[KEY]).toEqual([item('A.mp4', 'uploading', { draftId: 'abcdefghijk' })]);

      queue[0]!.status = 'review';
      persistQueue();
      dispose();
      await flushState();
      expect(((await browser.storage.local.get(KEY))[KEY] as QueueItem[])[0]!.status).toBe('review');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('follows changes from elsewhere', async () => {
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    await browser.storage.local.set({ [KEY]: [item('Z.mp4', 'pending')] });
    expect(queue.map((i) => i.file.name)).toEqual(['Z.mp4']);
  });

  it('a save from another window while ours waits keeps both edits (3b M3)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true }; // this window's edit, saved 300 ms later
    persistQueue();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending'), item('B.mp4', 'pending', { title: 'theirs', titleEdited: true })] });
    await vi.advanceTimersByTimeAsync(0); // the other window's save arrives
    expect(queue.map((i) => i.title)).toEqual(['mine', 'theirs']);
    await vi.advanceTimersByTimeAsync(300);
    await flushState();
    expect(((await browser.storage.local.get(KEY))[KEY] as QueueItem[]).map((i) => i.title)).toEqual(['mine', 'theirs']);
  });

  it('two foreign saves while ours waits: the second one counts, not ours (review I3)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true };
    persistQueue();
    const theirs = (title: string) => [item('A.mp4', 'pending'), item('B.mp4', 'pending', { title, titleEdited: true })];
    await browser.storage.local.set({ [KEY]: theirs('x') });
    await vi.advanceTimersByTimeAsync(0);
    await browser.storage.local.set({ [KEY]: theirs('y') });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.map((i) => i.title)).toEqual(['mine', 'y']);
  });

  it('an edit of ours already saved does not beat a newer foreign edit of that item (review I3)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true };
    persistQueue();
    await vi.advanceTimersByTimeAsync(300);
    await flushState(); // our save of A has landed
    queue[1] = { ...queue[1]!, title: 'b here', titleEdited: true }; // a new edit waits
    persistQueue();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending', { title: 'theirs', titleEdited: true }), item('B.mp4', 'pending')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.map((i) => i.title)).toEqual(['theirs', 'b here']);
  });

  it('a save dropped because another tab started running is no longer waiting: its saves replace our copy (review m2)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    queue[0] = { ...queue[0]!, title: 'mine', titleEdited: true };
    persistQueue();
    setOtherTabRuns(true); // within the 300 ms, another tab starts the queue
    persistQueue(); // blocked: nothing will be saved
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'uploading')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.map((i) => i.status)).toEqual(['uploading']);
  });

  it('with no save of ours waiting, a foreign save replaces the copy as before', async () => {
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true, A);
    await browser.storage.local.set({ [KEY]: [item('B.mp4', 'pending')] });
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.map((i) => i.file.name)).toEqual(['B.mp4']);
  });

  // The running tab closed mid-run: its items stay 'uploading' in storage, and no tab
  // would ever move them on. The mirror tab cuts them like a reload does.
  describe('the other tab stops running', () => {
    const stored = async () => ((await browser.storage.local.get(KEY))[KEY] as QueueItem[]).map((i) => i.status);
    beforeEach(async () => {
      await browser.storage.local.set({ [KEY]: [item('A.mp4', 'done'), item('B.mp4', 'uploading'), item('C.mp4', 'review'), item('D.mp4', 'pending')] });
      await initState(async () => SCHEMA_VERSION);
      restoreQueue(false, A);
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
      await browser.storage.local.set({ [KEY]: [item('A.mp4', 'done'), item('B.mp4', 'done'), item('C.mp4', 'done'), item('D.mp4', 'pending')] });
      queue.splice(0, queue.length, item('A.mp4', 'done'), item('B.mp4', 'uploading'), item('C.mp4', 'review'), item('D.mp4', 'pending'));
      await followOtherTab(false);
      expect(await stored()).toEqual(['done', 'done', 'done', 'pending']);
      expect(queue.map((i) => i.status)).toEqual(['done', 'done', 'done', 'pending']);
    });
  });

  // followOtherTab read storage before this tab heard the run's last save: what it read is
  // the base a later merge compares to (review m-b).
  it('what the stopped run left in storage is the base of the next merge', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false, A);
    await followOtherTab(true);
    // The run's final save, not yet heard here.
    const get = vi.spyOn(browser.storage.local, 'get').mockResolvedValueOnce({ [KEY]: [item('A.mp4', 'done'), item('B.mp4', 'pending')] } as never);
    await followOtherTab(false);
    get.mockRestore();
    expect(queue.map((i) => i.status)).toEqual(['done', 'pending']);
    queue[1] = { ...queue[1]!, title: 'mine', titleEdited: true }; // our edit waits
    persistQueue();
    await browser.storage.local.set({ [KEY]: [item('A.mp4', 'done', { title: 'theirs', titleEdited: true }), item('B.mp4', 'pending')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.map((i) => i.title)).toEqual(['theirs', 'mine']);
  });
});
