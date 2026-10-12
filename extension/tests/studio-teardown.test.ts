import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../lib/i18n';
import { getDetailsHost, uploadDialogOpen } from '../lib/studio/automation';
import { installManualFill } from '../lib/studio/manual-fill';
import { setPageUi } from '../lib/studio/page-ui';
import { installQuickActions } from '../lib/studio/quick-actions';
import { closeStudioUploadDialog } from '../lib/studio/upload-dialog';
import * as Q from '../lib/studio/queue-runner';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { El, makeDocument } from './fake-dom.mjs';

// What the Studio content script stops when the extension is reloaded under a live page.
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));
vi.mock('../lib/studio/upload-dialog', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/upload-dialog')>()),
  closeStudioUploadDialog: vi.fn(),
}));
vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  getDetailsHost: vi.fn(() => null),
  uploadDialogOpen: vi.fn(() => false),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Q.queue.splice(0);
});

describe('intercept', () => {
  // A file <input> inside Studio's dialog that is also the document, so a `change`
  // dispatched on it reaches the document-level capture listener with it as the target.
  class FakeInput extends EventTarget {
    type = 'file';
    value = 'C:\\fakepath\\a.mp4';
    files = [new File(['a'], 'a.mp4'), new File(['b'], 'b.mp4')];
    closest() { return this; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }

  // Did the intercept take this multi-file pick? It stops every later listener.
  const pick = (doc: FakeInput) => {
    let reachedStudio = false;
    const studio = () => { reachedStudio = true; };
    doc.addEventListener('change', studio);
    doc.dispatchEvent(new Event('change'));
    doc.removeEventListener('change', studio);
    return !reachedStudio;
  };

  beforeEach(() => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('location', { pathname: '/' });
  });

  it('takes a multi-file pick until disposed, then leaves it to Studio', () => {
    const doc = new FakeInput();
    vi.stubGlobal('document', doc);
    const dispose = Q.installIntercept();
    expect(pick(doc)).toBe(true);
    expect(doc.value).toBe('');

    dispose();
    doc.value = 'C:\\fakepath\\a.mp4';
    expect(pick(doc)).toBe(false);
    expect(doc.value).toBe('C:\\fakepath\\a.mp4');
  });

  it('leaves a multi-file drop to Studio while another tab runs the queue', () => {
    const doc = new FakeInput();
    vi.stubGlobal('document', doc);
    vi.mocked(closeStudioUploadDialog).mockClear();
    const dispose = Q.installIntercept();
    Q.setOtherTabRuns(true);
    try {
      const ev = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { files: doc.files } });
      let reachedStudio = false;
      doc.addEventListener('drop', () => { reachedStudio = true; });
      doc.dispatchEvent(ev);
      expect(reachedStudio).toBe(true);
      expect(ev.defaultPrevented).toBe(false);
      expect(closeStudioUploadDialog).not.toHaveBeenCalled();
      expect(Q.queue).toHaveLength(0);
    } finally {
      Q.setOtherTabRuns(false);
      dispose();
    }
  });

  it("leaves a multi-file pick to Studio while another tab runs the queue", () => {
    const doc = new FakeInput();
    vi.stubGlobal('document', doc);
    vi.mocked(closeStudioUploadDialog).mockClear();
    const dispose = Q.installIntercept();
    Q.setOtherTabRuns(true);
    try {
      expect(pick(doc)).toBe(false);
      expect(doc.value).toBe('C:\\fakepath\\a.mp4');
      expect(closeStudioUploadDialog).not.toHaveBeenCalled();
      expect(Q.queue).toHaveLength(0);
    } finally {
      Q.setOtherTabRuns(false);
      dispose();
    }
  });

  // P5-row-intercept-second-tab: Studio then uploads those files itself, without presets, and the
  // page says why. Only for a pick the intercept would have taken (2194–2195, 2206–2208).
  describe('says why a pick was left to Studio while another tab runs the queue', () => {
    const SAID = "Another Studio tab is running the upload queue — these files were left to YouTube's own upload and get no preset";
    let calls: string[] = [];
    let dispose = () => {};
    let doc: FakeInput;
    const drop = (files: File[] = doc.files) => doc.dispatchEvent(Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { files } }));
    let later = 0;
    beforeEach(() => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now + (later += 60_000)); // each test's pick is another pick, also after the tests above
      setLang('en');
      calls = [];
      setPageUi({
        item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, notifyDone() {}, setTitleMark() {}, confirmStart: async () => false,
        toast: (m) => void calls.push(`toast:${m}`), openDrawer: (tab) => void calls.push(`openDrawer:${tab ?? ''}`),
      });
      doc = new FakeInput();
      vi.stubGlobal('document', doc);
      dispose = Q.installIntercept();
      Q.setOtherTabRuns(true);
    });
    afterEach(() => {
      Q.setOtherTabRuns(false);
      settings.intercept = true;
      dispose();
    });

    it('one toast for a multi-file pick, and one for a multi-file drop', () => {
      expect(pick(doc)).toBe(false);
      expect(calls).toEqual([`toast:${SAID}`]);
      vi.advanceTimersByTime(5000);
      drop();
      expect(calls).toEqual([`toast:${SAID}`, `toast:${SAID}`]);
      expect(Q.queue).toHaveLength(0);
    });

    it('in Thai', () => {
      setLang('th');
      pick(doc);
      expect(calls).toEqual(['toast:มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — ไฟล์เหล่านี้จึงปล่อยให้ YouTube อัปโหลดเอง และจะไม่ได้ใช้พรีเซ็ต']);
    });

    it('not for a single file: that was never taken', () => {
      doc.files = [new File(['a'], 'a.mp4')];
      pick(doc);
      drop();
      drop([]);
      expect(calls).toEqual([]);
    });

    it('not when the intercept is switched off in Settings', () => {
      settings.intercept = false;
      pick(doc);
      drop();
      expect(calls).toEqual([]);
    });

    it("not outside Studio's upload dialog, and not for another kind of input", () => {
      doc.closest = () => null as never;
      pick(doc);
      drop();
      doc.closest = () => doc;
      doc.type = 'text';
      pick(doc);
      expect(calls).toEqual([]);
    });

    it('once for one pick: a drop that Studio turns into a change of its input is said once', () => {
      drop();
      pick(doc);
      expect(calls).toEqual([`toast:${SAID}`]);
    });

    it('no other tab runs: the pick is taken, the panel is asked for the Upload tab, nothing is said', () => {
      Q.setOtherTabRuns(false);
      expect(pick(doc)).toBe(true);
      expect(calls).toEqual(['toast:Added 2 video(s)', 'openDrawer:queue']);
    });
  });
});

describe('pollers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', makeDocument());
    vi.mocked(getDetailsHost).mockClear();
    vi.mocked(uploadDialogOpen).mockClear();
  });

  it('manual fill stops polling once disposed', () => {
    const dispose = installManualFill();
    vi.advanceTimersByTime(2000);
    expect(uploadDialogOpen).toHaveBeenCalledTimes(2);
    dispose();
    vi.advanceTimersByTime(5000);
    expect(uploadDialogOpen).toHaveBeenCalledTimes(2);
  });

  it('quick actions stop placing bars and remove the ones on the page', () => {
    const dispose = installQuickActions();
    vi.advanceTimersByTime(1000);
    expect(getDetailsHost).toHaveBeenCalledTimes(1);
    const bar = new El('div');
    bar.className = 'ytp-qa';
    document.body.append(bar);

    dispose();
    expect(document.querySelectorAll('.ytp-qa')).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(getDetailsHost).toHaveBeenCalledTimes(1);
  });
});

describe('status labels', () => {
  afterEach(() => setLang('en'));

  it('follow the language set after the module loaded', () => {
    setLang('th');
    expect(Q.statusLabel('done')).toEqual({ text: 'เสร็จแล้ว', tone: 'ok' });
    setLang('en');
    expect(Q.statusLabel('review')).toEqual({ text: 'Waiting for you to Save', tone: 'warn' });
  });
});
