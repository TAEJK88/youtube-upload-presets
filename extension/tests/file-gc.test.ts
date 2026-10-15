import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { deleteFiles, sweepHandles } from '../lib/file-gc';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

// The background's files:delete handler (Task 6 review M6): only the side panel and Studio
// tabs may make it forget stored file handles.
describe('files:delete', () => {
  const ext = 'chrome-extension://abc/';
  const studio = { tab: { id: 3 }, url: 'https://studio.youtube.com/channel/UC1/videos' };
  const panel = { url: 'chrome-extension://abc/sidepanel.html' };
  const www = { tab: { id: 4 }, url: 'https://www.youtube.com/watch?v=x' };
  const bridge = { tab: { id: 3 }, url: 'chrome-extension://abc/file-bridge.html' };

  it('refuses a www.youtube.com tab and the file bridge; deletes nothing', async () => {
    const del = vi.fn(async (_id: string) => {});
    await expect(deleteFiles(['a'], www, ext, del)).rejects.toThrow('not allowed');
    await expect(deleteFiles(['a'], bridge, ext, del)).rejects.toThrow('not allowed');
    expect(del).not.toHaveBeenCalled();
  });

  it('a Studio tab and the panel delete each id; one failure does not keep the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const del = vi.fn(async (id: string) => { if (id === 'b') throw new Error('locked'); });
    await deleteFiles(['a', 'b', 'c'], studio, ext, del);
    expect(del.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    del.mockClear();
    await deleteFiles(['d'], panel, ext, del);
    expect(del).toHaveBeenCalledWith('d');
  });

  it('ignores a payload that is not a list of ids', async () => {
    const del = vi.fn(async (_id: string) => {});
    await deleteFiles('a', studio, ext, del);
    await deleteFiles([1], studio, ext, del);
    expect(del).not.toHaveBeenCalled();
  });
});

// Final review M5: handles left in IndexedDB that no stored queue item references.
describe('the orphaned-handle sweep', () => {
  const item = (id: string, thumb?: { id: string; src: 'bridge' | 'page' }) => ({ id, src: 'bridge', thumb: thumb ? { ...thumb, name: 't.jpg', size: 1, type: '' } : null });

  it('deletes the ids no queue item (or its thumbnail) uses', async () => {
    await browser.storage.local.set({ queue: [item('v1', { id: 't1', src: 'bridge' }), item('v2')] });
    const del = vi.fn(async (_id: string) => {});
    const n = await sweepHandles({ list: async () => ['v1', 't1', 'v2', 'orphan1', 'orphan2'], del });
    expect(del.mock.calls.map((c) => c[0])).toEqual(['orphan1', 'orphan2']);
    expect(n).toBe(2);
  });

  it('no stored queue: every handle is an orphan', async () => {
    const del = vi.fn(async (_id: string) => {});
    await sweepHandles({ list: async () => ['x'], del });
    expect(del).toHaveBeenCalledWith('x');
  });

  it('a stored queue it does not understand: deletes nothing', async () => {
    await browser.storage.local.set({ queue: { not: 'a list' } });
    const del = vi.fn(async (_id: string) => {});
    expect(await sweepHandles({ list: async () => ['x'], del })).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it('lists the handles before it reads the queue: one stored and queued meanwhile is kept', async () => {
    const del = vi.fn(async (_id: string) => {});
    const list = async () => {
      const ids = ['old'];
      await browser.storage.local.set({ queue: [item('old'), item('new')] }); // 'new' arrives after the listing
      return ids;
    };
    await sweepHandles({ list, del });
    expect(del).not.toHaveBeenCalled();
  });
});
