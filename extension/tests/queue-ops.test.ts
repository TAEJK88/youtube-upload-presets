import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { clearDone, removeItem, retryItem, stopQueue } from '../lib/studio/queue-ops';
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
  it('stop asks the run to end after the current video', () => {
    stopQueue();
    expect(Q.stopReq).toBe(true);
    expect(calls).toEqual(['toast:Will stop after the current video finishes']);
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
    expect(calls).toEqual([]);
  });

  it('retry puts a failed item back in line without its draft id', () => {
    Q.queue.push(item('a', 'error', { draftId: 'abcdefghijk' }));
    retryItem('a');
    expect(Q.queue[0]).toMatchObject({ status: 'pending', draftId: '' });
  });

  it('clear done removes finished items only', () => {
    Q.queue.push(item('a', 'done'), item('b', 'error'), item('c', 'done'));
    clearDone();
    expect(Q.queue.map((i) => i.id)).toEqual(['b']);
  });
});
