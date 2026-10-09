import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteHandle, getHandle, listIds, putHandle } from '../lib/file-store';

// Real FileSystemFileHandles only exist in Chrome; a plain cloneable object
// stands in for one here — the store only needs structured clone.
const fake = (name: string) => ({ kind: 'file', name }) as unknown as FileSystemFileHandle;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

describe('file-store', () => {
  it('returns undefined for an unknown id', async () => {
    expect(await getHandle('nope')).toBeUndefined();
  });

  it('stores and reads back a handle by item id', async () => {
    await putHandle('a', fake('clip01.mp4'));
    expect(await getHandle('a')).toEqual({ kind: 'file', name: 'clip01.mp4' });
  });

  it('lists ids and deletes', async () => {
    await putHandle('a', fake('a.mp4'));
    await putHandle('b', fake('b.mp4'));
    expect((await listIds()).sort()).toEqual(['a', 'b']);
    await deleteHandle('a');
    expect(await listIds()).toEqual(['b']);
  });

  it('overwrites an existing id', async () => {
    await putHandle('a', fake('old.mp4'));
    await putHandle('a', fake('new.mp4'));
    expect((await getHandle('a'))?.name).toBe('new.mp4');
  });

  it('does not leak the connection when the write throws synchronously', async () => {
    await expect(putHandle('x', (() => {}) as unknown as FileSystemFileHandle)).rejects.toThrow();
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase('ytup-files');
      r.onsuccess = () => resolve();
      r.onblocked = () => reject(new Error('blocked: a connection is still open'));
      r.onerror = () => reject(r.error);
    });
    await putHandle('a', fake('after.mp4'));
    expect((await getHandle('a'))?.name).toBe('after.mp4');
  });
});
