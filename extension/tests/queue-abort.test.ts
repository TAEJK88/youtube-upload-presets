import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import * as messages from '../lib/messages';
import { createContentUi, startFromPanel } from '../lib/studio/content-ui';
import { pageToast } from '../lib/studio/page-toast';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { setBridge } from '../lib/studio/queue-files';
import { followOtherTab } from '../lib/studio/queue-store';
import * as Q from '../lib/studio/queue-runner';
import { SEL } from '../lib/studio/sel';
import { load, save } from '../lib/studio/state';
import * as D from '../lib/studio/upload-dialog';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// A run aborted on its way back from the back/forward cache (queue-sync watchLockLifecycle),
// with the real queue saves (queue-store): the other tab's results in storage must survive
// the aborted run until it is gone and this tab has read them back (review I1).
// The harness is queue-run-flow's: Studio's dialog faked at the automation layer.
const studio = vi.hoisted(() => ({
  open: false,
  click: (() => {}) as () => void,
  onVisibility: (() => {}) as () => void,
}));
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));
vi.mock('../lib/studio/page-toast', () => ({ pageToast: vi.fn() }));
vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
  isVisible: () => true,
  detailsOpen: () => studio.open,
  uploadDialogOpen: () => studio.open,
  getTitleBox: () => ({ textContent: 'from Studio' }),
  fillDetails: async () => true,
  getDialog: () => ({
    querySelector: (s: string) =>
      s === SEL.doneButton
        ? { hasAttribute: () => false, querySelector: () => ({ disabled: false, getAttribute: () => null, click: () => studio.click() }) }
        : null,
  }),
}));
vi.mock('../lib/studio/upload-dialog', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/upload-dialog')>()),
  openFilePicker: async () => ({ input: {} }),
  injectUploadFile: async () => ((studio.open = true), true),
  closeStudioUploadDialog: vi.fn(() => { studio.open = false; }),
  goToVisibility: async () => (studio.onVisibility(), true),
  ackNoticeDialogs: () => false,
  closeAfterDialogs: () => {},
  dialogError: () => '',
  uploadProgressText: () => '',
}));

const calls: string[] = [];
const recorder: PageUi = {
  item: (it) => void calls.push(`item:${it.file.name}:${it.status}`),
  run: () => {}, queue: () => {}, schedule: () => {}, presetPreview: () => {},
  toast: (msg) => void calls.push(`toast:${msg}`),
  openDrawer: () => {}, notifyDone: () => {}, setTitleMark: () => {},
  confirmStart: async () => true,
};

let n = 0;
const qfile = (name: string) => Object.assign(new File(['x'], name), { qid: `flow-${++n}`, src: 'bridge' as const });
// A test that fails before resolving its deferred would leave a run hanging on it into
// the next test: afterEach lets every one go.
const open: (() => void)[] = [];
const deferred = <T,>(fallback?: T) => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  open.push(() => resolve(fallback as T));
  return { promise, resolve };
};

let send: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal('document', Object.assign(makeDocument(), { hasFocus: () => true, title: 'Channel content' }));
  vi.stubGlobal('location', { pathname: '/channel/UCabcdefghijklmn/videos' });
  send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
  setPageUi(recorder);
  Q.queue.splice(0);
  calls.length = 0;
  Object.assign(studio, { open: false, click: () => { studio.open = false; }, onVisibility: () => {} });
  vi.mocked(D.closeStudioUploadDialog).mockClear();
  vi.mocked(pageToast).mockClear();
  Q.setTornDown(false);
  save('uploads', []);
});
afterEach(async () => {
  open.splice(0).forEach((release) => release());
  await new Promise((r) => setTimeout(r, 0)); // a released run settles before the next test
  Q.setOtherTabRuns(false);
  Q.setTornDown(false);
  Q.abortRun(null);
  setBridge(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const MSG = 'Another Studio tab is already running the queue or copyright work';
const settle = () => new Promise((r) => setTimeout(r, 350)); // past the 300 ms queue save
const binding = () => ({ channelId: 'UCabcdefghijklmn', ids: Q.queue.filter((i) => i.status === 'pending').map((i) => i.id), editRev: Q.getEditRev(), sig: Q.startSig(), asked: true });

// A and B pending; this tab's run is fetching A's file when the abort comes. Meanwhile the
// other tab ran both: what it left in storage is `other`.
async function abortedMidItem() {
  await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
  const ui = createContentUi();
  setPageUi(ui);
  ui.setConfirmed(true);
  const file = deferred<File>(new File(['x'], 'A.mp4'));
  const asked = deferred<void>();
  const getFile = vi.fn(() => (asked.resolve(), file.promise));
  setBridge({ getFile });
  const run = Q.runQueue();
  await asked.promise;
  await settle();
  Q.abortRun(new Error(MSG));
  const other = Q.queue.map((it, i) => ({ ...it, status: i === 0 ? 'error' as const : 'done' as const }));
  save('queue', other);
  await browser.storage.local.set({ queue: other });
  return { ui, run, file, getFile, other };
}

describe('a run aborted coming back from the back/forward cache', () => {
  it('the other tab finishes and lets the lock go first: its results survive the aborted run, then this tab reads them', async () => {
    const { run, file, other } = await abortedMidItem();
    await followOtherTab(false); // the tick: the other tab's run is over
    // still a mirror while the aborted run leaves: the intercept keeps off Studio's file dialog (final review m12)
    expect(Q.otherTabRunning()).toBe(true);
    file.resolve(new File(['x'], 'A.mp4'));
    await expect(run).rejects.toThrow(MSG);
    await settle();
    expect(load('queue', [])).toEqual(other); // B stays done: no second upload of it
    await followOtherTab(false); // the next tick, with the aborted run gone
    expect(Q.queue.map((i) => i.status)).toEqual(['error', 'done']);
    expect(Q.abortedRun()).toBe(null);
  });

  // Re-review r1: a failed read in the read-back must not leave the abort set until a reload.
  it('a storage read that fails during the read-back is logged; the next tick reads again and clears the abort', async () => {
    const { run, file, other } = await abortedMidItem();
    file.resolve(new File(['x'], 'A.mp4'));
    await expect(run).rejects.toThrow(MSG);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.storage.local, 'get').mockRejectedValueOnce(new Error('storage gone'));
    await followOtherTab(false); // the read fails: logged, not thrown
    expect(err).toHaveBeenCalled();
    expect(Q.abortedRun()).not.toBe(null);
    await followOtherTab(false); // the next tick
    expect(Q.abortedRun()).toBe(null);
    expect(Q.queue.map((i) => i.status)).toEqual(other.map((i) => i.status));
  });

  it("a draft id the aborted run's tick picks up is not saved", async () => {
    const { ui, run, file, other } = await abortedMidItem();
    ui.tick();
    Q.queue[0]!.draftId = 'abcdefghijk';
    ui.tick();
    await settle();
    expect(load('queue', [])).toEqual(other);
    file.resolve(new File(['x'], 'A.mp4'));
    await expect(run).rejects.toThrow(MSG);
  });

  it('a Start while the aborted run is still in flight does not let it go on', async () => {
    const { ui, run, file, getFile } = await abortedMidItem();
    const click = vi.fn();
    studio.click = click;
    await startFromPanel(ui, binding());
    file.resolve(new File(['x'], 'A.mp4'));
    await expect(run).rejects.toThrow(MSG);
    expect(click).not.toHaveBeenCalled();
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(Q.queue[1]!.status).toBe('pending'); // this tab's (stale) copy: B was not started here
  });

  it('a Start before this tab read the other tab\'s results is refused; after, it runs as usual', async () => {
    const { ui, run, file } = await abortedMidItem();
    file.resolve(new File(['x'], 'A.mp4'));
    await expect(run).rejects.toThrow(MSG);
    vi.mocked(pageToast).mockClear();
    await startFromPanel(ui, binding());
    expect(vi.mocked(pageToast).mock.calls).toEqual([[MSG]]);
    expect(Q.running).toBe(false);
    await followOtherTab(false);
    await Q.addFiles([qfile('C.mp4')]);
    setBridge({ getFile: async (id: string) => new File(['x'], id) });
    await startFromPanel(ui, binding());
    expect(Q.queue.map((i) => i.status)).toEqual(['error', 'done', 'done']);
  });
});
