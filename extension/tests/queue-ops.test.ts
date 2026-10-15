import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { clearDone, removeItem, resumeDrafts, retryItem, stopQueue } from '../lib/studio/queue-ops';
import * as Q from '../lib/studio/queue-runner';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

const calls: string[] = [];
const ui = {
  item: () => {}, run: () => {}, queue: () => void calls.push('queue'), schedule: () => {}, presetPreview: () => {},
  toast: (m: string) => void calls.push(`toast:${m}`), openDrawer: () => {}, notifyDone: () => {}, setTitleMark: () => {},
  confirmStart: async () => false,
} satisfies PageUi;

const item = (id: string, status: Q.QueueItem['status'], extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});

beforeEach(() => {
  vi.restoreAllMocks();
  // retry renumbers, and titles read the current channel from the page
  vi.stubGlobal('document', makeDocument());
  vi.stubGlobal('location', { pathname: '/' });
  setPageUi(ui);
  calls.length = 0;
  Q.queue.splice(0);
});
afterEach(() => vi.unstubAllGlobals());

describe('queue ops', () => {
  it('stop says so when nothing runs in this tab', () => {
    stopQueue();
    expect(calls).toEqual(['toast:Nothing is running in this Studio tab']);
  });

  it('remove takes the item out and lets its files go', () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    Q.queue.push(item('a', 'pending', { thumb: { id: 't', src: 'bridge', name: 'a.jpg', size: 1, type: '' } }), item('b', 'pending'));
    removeItem('a');
    expect(Q.queue.map((i) => i.id)).toEqual(['b']);
    expect(send).toHaveBeenCalledWith('files:delete', ['a', 't']);
    expect(calls).toEqual(['queue']);
  });

  it.each(['uploading', 'review'] as const)('remove leaves an item that is %s alone', (status) => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    Q.queue.push(item('a', status));
    removeItem('a');
    expect(Q.queue.map((i) => i.id)).toEqual(['a']);
    expect(send).not.toHaveBeenCalled();
    expect(calls).toEqual(["toast:Can't remove the video that is being uploaded"]);
  });

  it('retry puts a failed item back in line without its draft id', () => {
    Q.queue.push(item('a', 'error', { draftId: 'abcdefghijk' }));
    retryItem('a');
    expect(Q.queue[0]).toMatchObject({ status: 'pending', draftId: '' });
  });

  it('retry on the draft puts it back in line with its draft id (P5-draft-retry)', () => {
    Q.queue.push(item('a', 'error', { draftId: 'abcdefghijk' }), item('b', 'done', { draftId: 'bbbbbbbbbbb' }));
    retryItem('a', true);
    retryItem('b', true); // only a failed video is retried
    expect(Q.queue[0]).toMatchObject({ status: 'pending', draftId: 'abcdefghijk' });
    expect(Q.queue[1]).toMatchObject({ status: 'done' });
  });

  describe('Resume drafts (P5-draft-retry)', () => {
    it('every failed video with a draft waits again with its draft id; the others are left and said once', () => {
      Q.queue.push(
        item('a', 'error', { draftId: 'aaaaaaaaaaa' }), item('b', 'error'), item('c', 'pending'),
        item('d', 'error', { draftId: 'ddddddddddd' }), item('e', 'error', { draftId: 'xxxxxxxxxxx' }), item('f', 'error', { draftId: 'xxxxxxxxxxx' }),
        item('g', 'error'), item('h', 'done', { draftId: 'hhhhhhhhhhh' }),
      );
      expect(resumeDrafts()).toBe(2);
      expect(Q.queue.map((i) => `${i.id}:${i.status}:${i.draftId ?? ''}`)).toEqual([
        'a:pending:aaaaaaaaaaa', 'b:error:', 'c:pending:', 'd:pending:ddddddddddd', 'e:error:xxxxxxxxxxx', 'f:error:xxxxxxxxxxx', 'g:error:', 'h:done:hhhhhhhhhhh',
      ]);
      expect(calls).toEqual(['queue', 'toast:Left as errors: 2 with no draft (use Retry on the card to upload the file) · 2 whose draft id is on more than one card']);
    });

    it('nothing is said when every failed video was put back in line', () => {
      Q.queue.push(item('a', 'error', { draftId: 'aaaaaaaaaaa' }));
      expect(resumeDrafts()).toBe(1);
      expect(calls).toEqual(['queue']);
    });

    it('nothing to resume: answers 0 and says what is left', () => {
      Q.queue.push(item('a', 'error'));
      expect(resumeDrafts()).toBe(0);
      expect(Q.queue[0]!.status).toBe('error');
      expect(calls).toEqual(['queue', 'toast:Left as errors: 1 with no draft (use Retry on the card to upload the file)']);
    });
  });

  it('clear done removes finished items only', () => {
    Q.queue.push(item('a', 'done'), item('b', 'error'), item('c', 'done'));
    clearDone();
    expect(Q.queue.map((i) => i.id)).toEqual(['b']);
  });
});
