import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as messages from '../lib/messages';
import { SCHEMA_VERSION } from '../lib/migrations';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { otherTabRunning, queue, setOtherTabRuns, type QueueItem } from '../lib/studio/queue-runner';
import { adoptQueueChannel, createLockFollower, elsewhere, mayEdit, resumeQueue, watchLockLifecycle, watchRunLifecycle } from '../lib/studio/queue-sync';
import { moveLegacyQueueInOrder } from '../lib/store-writer';
import { disposeState, initState } from '../lib/studio/state';

// The Studio content script's startup and edit gate, without WXT's defineContentScript.
const item = (name: string, status: QueueItem['status']): QueueItem => ({
  id: 'id-' + name, src: 'bridge', file: { name, size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0,
});

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const KEY = 'queue:' + CH;
const toasts: string[] = [];
const sent: string[] = [];
let otherTab = false;
let runnerCh = ''; // the lock holder's channel, as the background answers runner:channel
beforeEach(async () => {
  disposeState();
  fakeBrowser.reset();
  queue.splice(0);
  toasts.length = 0;
  sent.length = 0;
  runnerCh = '';
  const noop = () => {};
  setPageUi({
    item: noop, run: noop, queue: noop, schedule: noop, presetPreview: noop, openDrawer: noop, notifyDone: noop,
    setTitleMark: noop, confirmStart: async () => false, toast: (m) => void toasts.push(m),
  } satisfies PageUi);
  vi.spyOn(messages, 'sendMessage').mockImplementation((async (type: string, data: unknown) => {
    sent.push(type + ':' + JSON.stringify(data));
    if (type === 'queue:migrate') return moveLegacyQueueInOrder(data as string); // the background's answer
    if (type === 'runner:channel') return runnerCh;
    return type === 'runner:elsewhere' ? otherTab : undefined;
  }) as typeof messages.sendMessage);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, [KEY]: [item('A.mp4', 'uploading'), item('B.mp4', 'pending')] });
  await initState(async () => SCHEMA_VERSION);
});
afterEach(() => {
  vi.restoreAllMocks();
  setOtherTabRuns(false);
});

describe('startup', () => {
  it('releases a lock left by a reload first, then cuts the interrupted item', async () => {
    otherTab = false;
    await resumeQueue(CH);
    expect(sent).toEqual(['runner:release:"queue"', `queue:migrate:"${CH}"`, 'runner:elsewhere:"queue"']);
    expect(queue.map((i) => i.status)).toEqual(['error', 'pending']);
  });

  // The holder's channel comes from the lock itself (written with it), not from a marker a tab writes afterwards.
  it("a stale marker of another channel doesn't let a same-channel tab cut a live run", async () => {
    otherTab = true;
    runnerCh = CH;
    await browser.storage.local.set({ queueRunner: 'UCbbbbbbbbbbbbbbbbbbbbbb' }); // what an earlier run left
    await resumeQueue(CH);
    expect(queue.map((i) => i.status)).toEqual(['uploading', 'pending']);
  });

  it("leaves another tab's running item alone (markInterrupted = !elsewhere)", async () => {
    otherTab = true;
    await resumeQueue(CH);
    expect(queue.map((i) => i.status)).toEqual(['uploading', 'pending']);
    expect(otherTabRunning()).toBe(true);
  });
});

// Older builds kept every channel's items in one 'queue' key (store-writer moveLegacyQueueInOrder).
describe('the old one-key queue', () => {
  const MOVED = 'Your queue from the older version moved to this channel (2 videos)';
  beforeEach(async () => {
    otherTab = false;
    await browser.storage.local.remove(KEY);
    await browser.storage.local.set({ queue: [item('A.mp4', 'uploading'), item('B.mp4', 'pending')] });
  });

  it('moves to this channel on load, once, and says so', async () => {
    await resumeQueue(CH);
    expect(queue.map((i) => i.status)).toEqual(['error', 'pending']);
    expect(toasts).toEqual([MOVED]);
    expect('queue' in (await browser.storage.local.get(null))).toBe(false);
    await resumeQueue(CH);
    expect(toasts).toEqual([MOVED]);
  });

  it('stays where it is while the channel is not known, and moves once it is', async () => {
    await resumeQueue('');
    expect(sent).toEqual(['runner:release:"queue"', 'runner:elsewhere:"queue"']);
    expect(queue).toEqual([]);
    queue.push(item('C.mp4', 'pending')); // queued before the channel was known
    await adoptQueueChannel(CH);
    expect(queue.map((i) => i.file.name)).toEqual(['A.mp4', 'B.mp4', 'C.mp4']);
    expect(toasts).toEqual([MOVED]);
    await vi.waitFor(async () => expect(((await browser.storage.local.get(KEY))[KEY] as QueueItem[]).length).toBe(3));
  });

  it('two tabs loading at once: one gets the items and the toast, the other nothing', async () => {
    const counts: number[] = [];
    const real = vi.mocked(messages.sendMessage).getMockImplementation()!;
    vi.mocked(messages.sendMessage).mockImplementation((async (type: string, data: unknown) => {
      const r = await real(type as never, data as never);
      if (type === 'queue:migrate') counts.push(r as number);
      return r;
    }) as typeof messages.sendMessage);
    await Promise.all([resumeQueue(CH), resumeQueue(CH)]);
    expect(counts.sort()).toEqual([0, 2]);
    expect(toasts).toEqual([MOVED]);
    expect(((await browser.storage.local.get(KEY))[KEY] as QueueItem[]).map((i) => i.file.name).sort()).toEqual(['A.mp4', 'B.mp4']);
  });

  it('the interrupted item of the old key comes back as an error, in the channel key', async () => {
    await resumeQueue(CH);
    await vi.waitFor(async () => {
      const saved = (await browser.storage.local.get(KEY))[KEY] as QueueItem[];
      expect(saved.map((i) => i.status)).toEqual(['error', 'pending']);
    });
  });

  it('an old key this build does not understand: left alone, no toast', async () => {
    await browser.storage.local.set({ queue: { not: 'a list' } });
    disposeState(); // the cache of beforeEach still holds the removed channel key
    await initState(async () => SCHEMA_VERSION);
    await resumeQueue(CH);
    expect((await browser.storage.local.get('queue')).queue).toEqual({ not: 'a list' });
    expect(queue).toEqual([]);
    expect(toasts).toEqual([]);
  });

  it('a failing move is logged and the tab still loads its own key', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await browser.storage.local.set({ [KEY]: [item('OWN.mp4', 'pending')] });
    const real = vi.mocked(messages.sendMessage).getMockImplementation()!;
    vi.mocked(messages.sendMessage).mockImplementation((async (type: string, data: unknown) => {
      if (type === 'queue:migrate') throw new Error('no background');
      return real(type as never, data as never);
    }) as typeof messages.sendMessage);
    await resumeQueue(CH);
    expect(queue.map((i) => i.file.name)).toEqual(['OWN.mp4']);
    expect(toasts).toEqual([]);
    expect(err).toHaveBeenCalled();
  });

  it('asks for the move once: ticks while adopting must wait do not ask again', async () => {
    await browser.storage.local.remove('queue'); // nothing to move: the answer is 0
    otherTab = true; // a tab of unknown channel runs the queue: adopting waits
    await resumeQueue('');
    for (let i = 0; i < 3; i++) await adoptQueueChannel(CH);
    expect(queue).toEqual([]);
    setOtherTabRuns(false);
    await adoptQueueChannel(CH);
    expect(sent.filter((m) => m.startsWith('queue:migrate'))).toHaveLength(1);
    expect(queue.map((i) => i.file.name)).toEqual([]);
    expect(toasts).toEqual([]);
  });

  it('a second tick while the move is under way waits for it too', async () => {
    await resumeQueue('');
    queue.push(item('C.mp4', 'pending'));
    await Promise.all([adoptQueueChannel(CH), adoptQueueChannel(CH)]);
    expect(queue.map((i) => i.file.name)).toEqual(['A.mp4', 'B.mp4', 'C.mp4']);
    expect(toasts).toEqual([MOVED]);
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

  it("allows it while the running tab is on another channel; refuses on the same one", async () => {
    otherTab = true;
    runnerCh = 'UCaaaaaaaaaaaaaaaaaaaaaa';
    await resumeQueue('UCbbbbbbbbbbbbbbbbbbbbbb');
    expect(await mayEdit()).toBe(true);
    await resumeQueue('UCaaaaaaaaaaaaaaaaaaaaaa');
    expect(await mayEdit()).toBe(false);
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
    const d = { release: vi.fn(), acquire: vi.fn(async () => acquired), running: () => running, abort: vi.fn(), stop: vi.fn(), toast: vi.fn() };
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
    expect(d.toast).toHaveBeenCalledWith('Another Studio tab is already running the queue or copyright work');
  });

  // Review m4: no answer from the background is not "another tab holds it".
  it('back from the cache mid-run, the lock message fails: stops after the current video, no abort', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { d, show } = setup(true, true);
    d.acquire.mockRejectedValueOnce(new Error('Extension context invalidated.'));
    await show(true);
    expect(d.stop).toHaveBeenCalledTimes(1);
    expect(d.abort).not.toHaveBeenCalled();
    expect(d.toast).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
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
      release: () => {}, acquire: async () => false, running: () => true, abort, stop: () => {}, toast: (m) => void toasts.push(m),
    });
    const show = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(show, 'persisted', { value: true });
    target.dispatchEvent(show);
    await vi.waitFor(() => expect(abort).toHaveBeenCalled());
    expect(toasts).toEqual(['Another Studio tab is already running the queue or copyright work']);
    stop();
  });
});

// What Chrome does to the page during a run (README item 94, capture of a card left mid-retry).
describe('the page lifecycle during a run', () => {
  const setup = () => {
    const doc = new EventTarget();
    const win = new EventTarget();
    let running = true;
    const off = watchRunLifecycle(doc, win, () => running, () => 'A.mp4');
    return { doc, win, off, stopRun: () => { running = false; } };
  };
  const hide = (persisted: boolean) => Object.assign(new Event('pagehide'), { persisted });

  it('says when the page is frozen, unloaded, or hidden while a run goes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { doc, win, off } = setup();
    doc.dispatchEvent(new Event('freeze'));
    win.dispatchEvent(hide(false));
    win.dispatchEvent(hide(true));
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.dispatchEvent(new Event('resume'));
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      '[ytup] draft retry: page freeze during "A.mp4" · tab visible',
      '[ytup] draft retry: page pagehide (unloading) during "A.mp4" · tab visible',
      '[ytup] draft retry: page pagehide (to the back/forward cache) during "A.mp4" · tab visible',
    ]);
    expect(info.mock.calls.map((c) => c[0])).toEqual([
      '[ytup] draft retry: page visibilitychange during "A.mp4" · tab visible',
      '[ytup] draft retry: page resume during "A.mp4" · tab visible',
    ]);
    off();
    vi.restoreAllMocks();
  });

  it('says nothing with no run going, nor once it is disposed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { doc, off, stopRun } = setup();
    stopRun();
    doc.dispatchEvent(new Event('freeze'));
    const second = setup();
    second.off();
    second.doc.dispatchEvent(new Event('freeze'));
    second.win.dispatchEvent(hide(false));
    expect(warn).not.toHaveBeenCalled();
    off();
    vi.restoreAllMocks();
  });
});

describe('following the lock by events (4a review m6)', () => {
  afterEach(() => vi.useRealTimers());

  it('asks about the lock every 30 s from the tick, and at once when told it changed', () => {
    vi.useFakeTimers();
    const ask = vi.fn(async () => false);
    const f = createLockFollower({ ask });
    for (let i = 0; i < 40; i++) { f.tick(); vi.advanceTimersByTime(800); } // 32 s of ticks
    expect(ask).toHaveBeenCalledTimes(2);
    f.now(); // runner:changed, focus
    expect(ask).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 38; i++) { f.tick(); vi.advanceTimersByTime(800); } // ticks up to 29.6 s: the 30 s count from the last ask
    expect(ask).toHaveBeenCalledTimes(3);
    f.tick();
    expect(ask).toHaveBeenCalledTimes(4);
  });

  it('an ask that fails is not an unhandled rejection, and the next one still goes out', async () => {
    const asked: ReturnType<typeof vi.spyOn>[] = [];
    const ask = vi.fn(() => {
      const p = Promise.reject(new Error('no answer'));
      asked.push(vi.spyOn(p, 'catch')); // the follower must take the rejection itself
      return p;
    });
    const f = createLockFollower({ ask, everyMs: 0 });
    f.now();
    f.tick();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(asked.map((c) => c.mock.calls.length)).toEqual([1, 1]);
    await Promise.resolve();
  });

  // The entrypoints run under WXT only, so their side of the link is pinned in the source.
  it('the tab asks on the tick through the follower, on focus and on runner:changed', () => {
    const src = readFileSync(new URL('../entrypoints/studio.content.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/const lockFollower = createLockFollower\(\{ ask: elsewhere \}\)/);
    expect(src).toMatch(/onMessage\('runner:changed', \(\) => lockFollower\.now\(\)\)/);
    expect(src).toMatch(/visibilityState === 'visible'\) lockFollower\.now\(\)/);
    expect(src).toMatch(/ctx\.setInterval\(\(\) => \{\s*lockFollower\.tick\(\);/);
  });

  it('the background tells every Studio tab when the lock changes, and looks at the holder when a tab changes page or is discarded', () => {
    const src = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/registerRunnerLock\(\(\) => void tellStudioTabs\(\)\)/);
    const tell = src.slice(src.indexOf('const tellStudioTabs'), src.indexOf('registerRunnerLock('));
    expect(tell).toMatch(/isStudioUrl\(t\.url\)/);
    expect(tell).toMatch(/sendMessage\('runner:changed', undefined, t\.id\)\.catch\(/);
    expect(tell).not.toMatch(/storage|acquireRunner|releaseRunner|runnerHeld|claimWorker/); // it only sends: a write to the lock from here would loop
    // 'complete' too: without the tabs permission a move to a site the extension can't read carries no url
    expect(src).toMatch(/if \(info\.url \|\| info\.status === 'complete' \|\| info\.discarded\) void runnerHeld\(\)\.catch\(/);
  });
});
