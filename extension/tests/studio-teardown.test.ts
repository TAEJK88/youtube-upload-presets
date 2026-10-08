import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../lib/i18n';
import { getDetailsHost, uploadDialogOpen } from '../lib/studio/automation';
import { installManualFill } from '../lib/studio/manual-fill';
import { installQuickActions } from '../lib/studio/quick-actions';
import * as Q from '../lib/studio/queue-runner';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { El, makeDocument } from './fake-dom.mjs';

// What the Studio content script stops when the extension is reloaded under a live page.
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));
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
