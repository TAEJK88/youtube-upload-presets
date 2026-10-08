import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { setBridge } from '../lib/studio/queue-files';
import { removeItem } from '../lib/studio/queue-ops';
import * as Q from '../lib/studio/queue-runner';
import { SEL } from '../lib/studio/sel';
import { save } from '../lib/studio/state';
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
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

let send: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal('document', Object.assign(makeDocument(), { hasFocus: () => true }));
  vi.stubGlobal('location', { pathname: '/channel/UCabcdefghijklmn/videos' });
  send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
  setPageUi(recorder);
  Q.queue.splice(0);
  calls.length = 0;
  Object.assign(studio, { open: false, click: () => { studio.open = false; }, onVisibility: () => {} });
  vi.mocked(D.closeStudioUploadDialog).mockClear();
  save('uploads', []);
});
afterEach(() => {
  setBridge(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the item being processed', () => {
  it('cannot be removed while its file is being fetched, and still finishes', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const id = Q.queue[0]!.id;
    const file = deferred<File>();
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
