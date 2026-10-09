import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { createContentUi, startFromPanel, storeWriteFailed } from '../lib/studio/content-ui';
import { pageToast } from '../lib/studio/page-toast';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { setBridge } from '../lib/studio/queue-files';
import { removeItem } from '../lib/studio/queue-ops';
import { persistQueue } from '../lib/studio/queue-store';
import * as Q from '../lib/studio/queue-runner';
import { SEL } from '../lib/studio/sel';
import { presetById, save, settings } from '../lib/studio/state';
import * as D from '../lib/studio/upload-dialog';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// A whole item through uploadOne(), with Studio's dialog faked at the automation layer:
// the file goes in, the details page shows, Save closes the dialog.
const studio = vi.hoisted(() => ({
  open: false,
  click: (() => {}) as () => void,
  onVisibility: (() => {}) as () => void,
}));
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));
vi.mock('../lib/studio/page-toast', () => ({ pageToast: vi.fn() }));
vi.mock('../lib/studio/queue-store', () => ({ persistQueue: vi.fn() }));
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
  setBridge(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the item being processed', () => {
  it('cannot be removed while its file is being fetched, and still finishes', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const id = Q.queue[0]!.id;
    const file = deferred<File>(new File(['x'], 'A.mp4'));
    const asked = deferred<void>();
    setBridge({ getFile: () => (asked.resolve(), file.promise) });
    const run = Q.runQueue();
    await asked.promise; // the run is now waiting for A's file
    expect(Q.currentItemId()).toBe(id);
    removeItem(id);
    expect(Q.queue.map((i) => i.id)).toEqual([id]);
    expect(send).not.toHaveBeenCalledWith('files:delete', expect.anything());
    file.resolve(new File(['x'], 'A.mp4'));
    await run;
    expect(Q.queue[0]!.status).toBe('done');
    expect(Q.currentItemId()).toBe(null);
  });
});

// uploadOne() reads the draft id while waiting for Save without telling the UI; a reload
// in that wait must still find it in storage. The running tab's tick saves it.
describe('a draft id the run picked up', () => {
  it('is saved by the tick while this tab runs the queue', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const ui = createContentUi();
    setPageUi(ui);
    ui.setConfirmed(true);
    const file = deferred<File>(new File(['x'], 'A.mp4'));
    const asked = deferred<void>();
    setBridge({ getFile: () => (asked.resolve(), file.promise) });
    const run = Q.runQueue();
    await asked.promise; // running
    ui.tick();
    vi.mocked(persistQueue).mockClear();
    Q.queue[0]!.draftId = 'abcdefghijk';
    ui.tick();
    expect(persistQueue).toHaveBeenCalledTimes(1);
    file.resolve(new File(['x'], 'A.mp4'));
    await run;
  });
});

// queue:start: the page's own re-check (runQueue) asks again when it finds a reason to;
// that counts as a yes only when the panel really asked the user.
describe('queue:start from the panel', () => {
  const CONFIRM = 'Confirm the upload in the side panel first';
  const binding = (asked: boolean) => ({ channelId: 'UCabcdefghijklmn', ids: Q.queue.map((i) => i.id), editRev: Q.getEditRev(), sig: Q.startSig(), asked });
  let was: boolean;
  beforeEach(() => { was = settings.confirmStart; settings.confirmStart = true; });
  afterEach(() => { settings.confirmStart = was; });

  it('nothing was asked: the run that needs a confirmation refuses', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const ui = createContentUi();
    setPageUi(ui);
    const getFile = vi.fn(async (id: string) => new File(['x'], id));
    setBridge({ getFile });
    await startFromPanel(ui, binding(false));
    expect(send).toHaveBeenCalledWith('queue:toast', CONFIRM);
    expect(Q.queue[0]!.status).toBe('pending');
  });

  it('asked and confirmed: the run starts', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const ui = createContentUi();
    setPageUi(ui);
    setBridge({ getFile: async () => { throw new Error('missing'); } });
    await startFromPanel(ui, binding(true));
    expect(send).not.toHaveBeenCalledWith('queue:toast', CONFIRM);
    expect(Q.queue[0]!.status).toBe('error'); // it ran: the bridge said 'missing'
  });

  // The other window's panel changes something the summary showed: each part of startSig().
  const changes: [string, () => () => void][] = [
    ['the schedule', () => { const was = settings.schedule; settings.schedule = { ...was, on: !was.on }; return () => { settings.schedule = was; }; }],
    ['thumbnails on/off', () => { const was = settings.thumb; settings.thumb = !was; return () => { settings.thumb = was; }; }],
    ["the pending preset's visibility", () => {
      const p = presetById('trapsoul');
      const was = p.visibility;
      p.visibility = was === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
      return () => { p.visibility = was; };
    }],
  ];
  for (const [what, change] of changes) {
    it(`refuses when ${what} changed in another window after the summary (3b M11)`, async () => {
      await Q.addFiles([qfile('A.mp4')]);
      const ui = createContentUi();
      setPageUi(ui);
      setBridge({ getFile: async (id: string) => new File(['x'], id) });
      const b = binding(true);
      const undo = change();
      try {
        await startFromPanel(ui, b);
      } finally {
        undo();
      }
      expect(send).toHaveBeenCalledWith('queue:toast', 'Settings or presets changed after you confirmed — click Start again to see the new summary');
      expect(Q.queue[0]!.status).toBe('pending');
    });
  }
});

// The extension reloads while a run is in flight: the content script's teardown disposes
// the UI. The orphaned run must leave Studio alone from then on.
describe('a run after teardown', () => {
  const RELOADED = "The extension was reloaded during an upload — if Studio's upload dialog is still open, finish that upload and click Save yourself";

  it('does not click Save, keeps the dialog open and starts no next item', async () => {
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    const ui = createContentUi();
    setPageUi(ui);
    ui.setConfirmed(true);
    const getFile = vi.fn(async (id: string) => new File(['x'], id));
    setBridge({ getFile });
    const click = vi.fn();
    studio.click = click;
    studio.onVisibility = () => ui.dispose(); // torn down on the way to Save
    await expect(Q.runQueue()).rejects.toThrow('The extension was reloaded');
    expect(click).not.toHaveBeenCalled();
    expect(D.closeStudioUploadDialog).not.toHaveBeenCalled();
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(Q.queue[1]!.status).toBe('pending');
    expect(Q.running).toBe(false);
    expect(vi.mocked(pageToast).mock.calls).toEqual([[RELOADED]]); // and not the run's own end toast
  });

  it('does not fetch the next file once torn down', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const ui = createContentUi();
    setPageUi(ui);
    ui.setConfirmed(true);
    const getFile = vi.fn(async (id: string) => new File(['x'], id));
    setBridge({ getFile });
    Q.setRunnerLock({ acquire: async () => (ui.dispose(), true), release: () => {} });
    try {
      await expect(Q.runQueue()).rejects.toThrow('The extension was reloaded');
    } finally {
      Q.setRunnerLock({ acquire: async () => true, release: () => {} });
    }
    expect(getFile).not.toHaveBeenCalled();
    expect(D.closeStudioUploadDialog).not.toHaveBeenCalled();
  });
});

// A settings / counters patch the background could not store (lib/studio/state.ts).
describe('a failed store write', () => {
  const MSG = "Couldn't save a settings change — the schedule or EP numbers may be off for the rest of the run";

  it('shows a toast on the page while the queue runs, and not when idle', async () => {
    storeWriteFailed();
    expect(pageToast).not.toHaveBeenCalled();
    await Q.addFiles([qfile('A.mp4')]);
    const file = deferred<File>(new File(['x'], 'A.mp4'));
    const asked = deferred<void>();
    setBridge({ getFile: () => (asked.resolve(), file.promise) });
    const run = Q.runQueue();
    await asked.promise; // running
    storeWriteFailed();
    expect(vi.mocked(pageToast).mock.calls).toEqual([[MSG]]);
    file.resolve(new File(['x'], 'A.mp4'));
    await run;
  });
});
