import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as messages from '../lib/messages';
import { SCHEMA_VERSION } from '../lib/migrations';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { otherTabRunning, queue, setOtherTabRuns, type QueueItem } from '../lib/studio/queue-runner';
import { elsewhere, mayEdit, resumeQueue, watchLockLifecycle } from '../lib/studio/queue-sync';
import { disposeState, initState } from '../lib/studio/state';

// The Studio content script's startup and edit gate, without WXT's defineContentScript.
const item = (name: string, status: QueueItem['status']): QueueItem => ({
  id: 'id-' + name, src: 'bridge', file: { name, size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0,
});

const toasts: string[] = [];
const sent: string[] = [];
let otherTab = false;
beforeEach(async () => {
  disposeState();
  fakeBrowser.reset();
  queue.splice(0);
  toasts.length = 0;
  sent.length = 0;
  const noop = () => {};
  setPageUi({
    item: noop, run: noop, queue: noop, schedule: noop, presetPreview: noop, openDrawer: noop, notifyDone: noop,
    setTitleMark: noop, confirmStart: async () => false, toast: (m) => void toasts.push(m),
  } satisfies PageUi);
  vi.spyOn(messages, 'sendMessage').mockImplementation((async (type: string, data: unknown) => {
    sent.push(type + ':' + JSON.stringify(data));
    return type === 'runner:elsewhere' ? otherTab : undefined;
  }) as typeof messages.sendMessage);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, queue: [item('A.mp4', 'uploading'), item('B.mp4', 'pending')] });
  await initState(async () => SCHEMA_VERSION);
});
afterEach(() => {
  vi.restoreAllMocks();
  setOtherTabRuns(false);
});

describe('startup', () => {
  it('releases a lock left by a reload first, then cuts the interrupted item', async () => {
    otherTab = false;
    await resumeQueue();
    expect(sent).toEqual(['runner:release:"queue"', 'runner:elsewhere:"queue"']);
    expect(queue.map((i) => i.status)).toEqual(['error', 'pending']);
  });

  it("leaves another tab's running item alone (markInterrupted = !elsewhere)", async () => {
    otherTab = true;
    await resumeQueue();
    expect(queue.map((i) => i.status)).toEqual(['uploading', 'pending']);
    expect(otherTabRunning()).toBe(true);
  });
});

describe('a failed runner:elsewhere', () => {
  it('keeps the cached flag and cuts nothing', async () => {
    queue.push(item('A.mp4', 'uploading'), item('B.mp4', 'pending'));
    setOtherTabRuns(true);
    vi.mocked(messages.sendMessage).mockImplementation((async () => { throw new Error('no background'); }) as typeof messages.sendMessage);
    expect(await elsewhere()).toBe(true);
    expect(otherTabRunning()).toBe(true);
    expect(queue.map((i) => i.status)).toEqual(['uploading', 'pending']);
  });
});

describe('mayEdit', () => {
  it('refuses while another tab runs the queue, and says so', async () => {
    otherTab = true;
    expect(await mayEdit()).toBe(false);
    expect(toasts).toEqual(['Another Studio tab is running the queue — change the queue there']);
  });

  it('allows it otherwise', async () => {
    otherTab = false;
    expect(await mayEdit()).toBe(true);
    expect(toasts).toEqual([]);
  });
});

// Final review M6: leaving Studio frees the lock (pagehide), but a page kept in the
// back/forward cache can come back with its run still going; it takes the lock again, or
// aborts the run at once when another tab took it meanwhile (3b R-M3).
describe('the runner lock across the back/forward cache', () => {
  const setup = (running: boolean, acquired: boolean) => {
    const win = new EventTarget();
    const d = { release: vi.fn(), acquire: vi.fn(async () => acquired), running: () => running, abort: vi.fn(), toast: vi.fn() };
    const off = watchLockLifecycle(win, d);
    const show = async (persisted: boolean) => {
      win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));
      await new Promise((r) => setTimeout(r, 0));
    };
    return { win, d, off, show };
  };

  it('pagehide frees the lock', () => {
    const { win, d } = setup(true, true);
    win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    expect(d.release).toHaveBeenCalledTimes(1);
  });

  it('back from the cache mid-run: takes the lock again', async () => {
    const { d, show } = setup(true, true);
    await show(true);
    expect(d.acquire).toHaveBeenCalledTimes(1);
    expect(d.abort).not.toHaveBeenCalled();
  });

  it('back from the cache mid-run, another tab took the lock: aborts the run and says so', async () => {
    const { d, show } = setup(true, false);
    await show(true);
    expect(d.abort).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith('Another Studio tab is already running the queue');
  });

  it('nothing to do for a fresh load or an idle page; off removes the listeners', async () => {
    const idle = setup(false, true);
    await idle.show(true);
    expect(idle.d.acquire).not.toHaveBeenCalled();
    const fresh = setup(true, true);
    await fresh.show(false);
    expect(fresh.d.acquire).not.toHaveBeenCalled();
    fresh.off();
    fresh.win.dispatchEvent(new Event('pagehide'));
    await fresh.show(true);
    expect(fresh.d.release).not.toHaveBeenCalled();
    expect(fresh.d.acquire).not.toHaveBeenCalled();
  });
});

describe('back from the back/forward cache', () => {
  it('another tab took the lock meanwhile: the run aborts at once', async () => {
    const target = new EventTarget();
    const abort = vi.fn();
    const stop = watchLockLifecycle(target, {
      release: () => {}, acquire: async () => false, running: () => true, abort, toast: (m) => void toasts.push(m),
    });
    const show = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(show, 'persisted', { value: true });
    target.dispatchEvent(show);
    await vi.waitFor(() => expect(abort).toHaveBeenCalled());
    expect(toasts).toEqual(['Another Studio tab is already running the queue']);
    stop();
  });
});
