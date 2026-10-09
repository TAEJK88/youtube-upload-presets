import { describe, expect, it } from 'vitest';
import { needingGrant, queuedFileIds, regrant } from '../lib/panel/regrant';
import type { QueueItem } from '../lib/studio/queue-runner';

const item = (id: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}) =>
  ({ id, src: 'bridge', status, thumb: null, ...extra }) as QueueItem;
const handle = (state: PermissionState, after: PermissionState = state) =>
  ({ queryPermission: async () => state, requestPermission: async () => after }) as unknown as FileSystemFileHandle;
const throwing = { queryPermission: async () => { throw new Error('gone'); }, requestPermission: async () => { throw new DOMException('no gesture', 'SecurityError'); } } as unknown as FileSystemFileHandle;

describe('re-grant', () => {
  it('only files of items still to upload, from the panel', () => {
    expect(queuedFileIds([
      item('a', 'pending', { thumb: { id: 't', src: 'bridge', name: 'a.jpg', size: 1, type: '' } }),
      item('b', 'error'), item('c', 'done'), item('d', 'pending', { src: 'page' }), item('e', 'uploading'), item('f', 'review'),
      item('g', 'pending', { src: 'page', thumb: { id: 'u', src: 'page', name: 'g.jpg', size: 1, type: '' } }),
    ])).toEqual(['a', 't', 'b']);
  });

  it('finds the handles that lost permission, and asks for all of them', async () => {
    const handles: Record<string, FileSystemFileHandle> = { a: handle('granted'), b: handle('prompt', 'granted'), c: handle('prompt', 'denied') };
    const get = async (id: string) => handles[id];
    expect(await needingGrant(['a', 'b', 'c', 'gone'], get)).toEqual(['b', 'c']);
    expect(await regrant(['b', 'c'], get)).toBe(1);
  });

  it('one handle that fails does not stop the others', async () => {
    const handles: Record<string, FileSystemFileHandle> = { x: throwing, b: handle('prompt', 'granted') };
    const get = async (id: string) => { if (id === 'db') throw new Error('idb'); return handles[id]; };
    expect(await needingGrant(['db', 'x', 'b'], get)).toEqual(['b']);
    expect(await regrant(['db', 'x', 'b'], get)).toBe(1);
  });
});
