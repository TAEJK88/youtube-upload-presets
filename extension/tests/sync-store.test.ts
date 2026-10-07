import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createMemoryStore, createSyncStore } from '../lib/sync-store';

beforeEach(() => fakeBrowser.reset());

describe('createSyncStore', () => {
  it('starts from what is stored, for the listed keys only', async () => {
    await browser.storage.local.set({ counters: { trapsoul: 3 }, other: 1 });
    const kv = await createSyncStore(['counters', 'uploads']);
    expect(kv.get('counters', {})).toEqual({ trapsoul: 3 });
    expect(kv.get('uploads', [])).toEqual([]);
    expect(kv.get('other', 'fallback')).toBe('fallback');
  });

  it('set() is visible at once and reaches storage', async () => {
    const kv = await createSyncStore(['activeId']);
    kv.set('activeId', 'lofi');
    expect(kv.get('activeId')).toBe('lofi');
    await kv.flush();
    expect((await browser.storage.local.get('activeId')).activeId).toBe('lofi');
  });

  it('hands out copies, like GM_getValue', async () => {
    const kv = await createSyncStore(['counters']);
    kv.set('counters', { a: 1 });
    kv.get<Record<string, number>>('counters').a = 99;
    expect(kv.get('counters')).toEqual({ a: 1 });
  });

  it('picks up changes made elsewhere and reports them', async () => {
    const kv = await createSyncStore(['settings']);
    const seen = vi.fn();
    kv.onChange('settings', seen);
    await browser.storage.local.set({ settings: { delay: 9 } });
    expect(kv.get('settings')).toEqual({ delay: 9 });
    expect(seen).toHaveBeenCalledWith({ delay: 9 });
  });

  it('does not report its own writes as changes', async () => {
    const kv = await createSyncStore(['counters']);
    const seen = vi.fn();
    kv.onChange('counters', seen);
    kv.set('counters', { a: 1 });
    kv.set('counters', { a: 2 });
    await kv.flush();
    expect(seen).not.toHaveBeenCalled();
    expect(kv.get('counters')).toEqual({ a: 2 });
  });

  it('a change made elsewhere during its own write wins once both land', async () => {
    const kv = await createSyncStore(['activeId']);
    const seen = vi.fn();
    kv.onChange('activeId', seen);
    kv.set('activeId', 'mine');
    await browser.storage.local.set({ activeId: 'theirs' });
    await kv.flush();
    expect(kv.get('activeId')).toBe('theirs');
    expect(seen).toHaveBeenCalledWith('theirs');
  });

  it('ignores keys it does not mirror', async () => {
    const kv = await createSyncStore(['a']);
    await browser.storage.local.set({ b: 1 });
    expect(kv.get('b', 0)).toBe(0);
  });
});

describe('createMemoryStore', () => {
  it('keeps values in memory and hands out copies', () => {
    const kv = createMemoryStore({ list: [1] });
    kv.get<number[]>('list').push(2);
    expect(kv.get('list')).toEqual([1]);
    kv.set('x', null);
    expect(kv.get('x', 'fallback')).toBe(null);
    expect(kv.get('missing', 'fallback')).toBe('fallback');
  });
});
