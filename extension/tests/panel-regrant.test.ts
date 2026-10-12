import { describe, expect, it, vi } from 'vitest';
import { createHandles } from '../lib/file-handles';
import { needingGrant, queuedFileIds, runReads, stillLocked } from '../lib/panel/regrant';
import type { QueueItem } from '../lib/studio/queue-runner';

const item = (id: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}) =>
  ({ id, src: 'bridge', status, thumb: null, ...extra }) as QueueItem;
const handle = (state: PermissionState) => ({ queryPermission: async () => state }) as unknown as FileSystemFileHandle;
const throwing = { queryPermission: async () => { throw new Error('gone'); } } as unknown as FileSystemFileHandle;

describe('re-grant', () => {
  it('only files of items still to upload, from the panel', () => {
    expect(queuedFileIds([
      item('a', 'pending', { thumb: { id: 't', src: 'bridge', name: 'a.jpg', size: 1, type: '' } }),
      item('b', 'error'), item('c', 'done'), item('d', 'pending', { src: 'page' }), item('e', 'uploading'), item('f', 'review'),
      item('g', 'pending', { src: 'page', thumb: { id: 'u', src: 'page', name: 'g.jpg', size: 1, type: '' } }),
    ])).toEqual(['a', 't', 'b']);
  });

  it('the files a run reads: pending items\' videos, and their thumbnails when thumbnails are on', () => {
    const t = (id: string) => ({ id, src: 'bridge' as const, name: id + '.jpg', size: 1, type: '' });
    const items = [item('a', 'pending', { thumb: t('ta') }), item('b', 'error', { thumb: t('tb') }), item('c', 'done'), item('d', 'pending', { src: 'page' })];
    expect(runReads(items, true)).toEqual(['a', 'ta']);
    expect(runReads(items, false)).toEqual(['a']);
  });

  it('finds the queued files without read access; a file that is gone or can\'t be asked about is not one', async () => {
    const all: Record<string, FileSystemFileHandle> = { a: handle('granted'), b: handle('prompt'), c: handle('denied'), x: throwing };
    const files = createHandles(async (id) => { if (id === 'db') throw new Error('idb'); return all[id]; }, async () => []);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await needingGrant(['a', 'b', 'c', 'gone', 'db', 'x'], files)).toEqual([{ id: 'b', state: 'prompt' }, { id: 'c', state: 'denied' }]);
    vi.restoreAllMocks();
  });

  it('asks on the handles the panel holds, not on fresh reads of the store', async () => {
    const load = vi.fn(async () => handle('prompt'));
    const files = createHandles(load, async () => []);
    await needingGrant(['a'], files);
    await needingGrant(['a'], files);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('says what to do when a click did not give the access back', () => {
    expect(stillLocked(2)).toBe('The browser still does not allow reading 2 file(s) — remove those videos from the queue and add the files again');
  });
});
