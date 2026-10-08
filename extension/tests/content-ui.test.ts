import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { createContentUi } from '../lib/studio/content-ui';
import { setTitleMark } from '../lib/studio/page-notify';
import * as Q from '../lib/studio/queue-runner';
import { persistQueue } from '../lib/studio/queue-store';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

vi.mock('../lib/studio/queue-store', () => ({ persistQueue: vi.fn() }));

const item = (id: string, extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status: 'review', msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});

beforeEach(() => {
  vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
  vi.stubGlobal('document', makeDocument());
  vi.mocked(persistQueue).mockClear();
  Q.queue.splice(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Q.queue.splice(0);
});

describe('content ui', () => {
  // uploadOne() reads the draft id while waiting for Save without telling the UI; a reload
  // in that wait must still find it in storage.
  it('saves the queue when the tick sees a new draft id', () => {
    Q.queue.push(item('a'));
    const ui = createContentUi();
    ui.tick();
    vi.mocked(persistQueue).mockClear();
    ui.tick();
    expect(persistQueue).not.toHaveBeenCalled();
    Q.queue[0]!.draftId = 'abcdefghijk';
    ui.tick();
    expect(persistQueue).toHaveBeenCalledTimes(1);
  });

  // A run still in flight when the extension reloads ends later: its finally must not put
  // ✅/⚠️ back on a tab whose mark the teardown cleared.
  it('sets no title mark once torn down', () => {
    document.title = 'Channel content';
    const ui = createContentUi();
    ui.setTitleMark('(1/2) ⬆');
    expect(document.title).toBe('(1/2) ⬆ Channel content');
    ui.dispose();
    setTitleMark(''); // what the content script's teardown does
    ui.setTitleMark('⚠️');
    expect(document.title).toBe('Channel content');
  });
});
