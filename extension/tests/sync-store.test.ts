import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createMemoryStore, createSyncStore } from '../lib/sync-store';

beforeEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

const local = () => browser.storage.local;
const origGet = () => local().get.bind(local());
const tick = () => new Promise((r) => setTimeout(r, 0));
const external = (changes: Record<string, unknown>, area = 'local') =>
  fakeBrowser.storage.onChanged.trigger(
    Object.fromEntries(Object.entries(changes).map(([k, newValue]) => [k, { newValue }])) as never,
    area as never,
  );

describe('createSyncStore', () => {
  it('starts from what is stored, for the listed keys only', async () => {
    await browser.storage.local.set({ counters: { trapsoul: 3 }, other: 1 });
    const kv = await createSyncStore(['counters', 'uploads']);
    expect(kv.get('counters', {})).toEqual({ trapsoul: 3 });
    expect(kv.get('uploads', [])).toEqual([]);
    expect(() => kv.get('other', 'fallback')).toThrow('unknown key');
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

  it('a failed write is reconciled with storage and logged', async () => {
    await local().set({ activeId: 'old' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(local(), 'set').mockRejectedValueOnce(new Error('quota'));
    const kv = await createSyncStore(['activeId']);
    kv.set('activeId', 'new');
    expect(kv.get('activeId')).toBe('new');
    await kv.flush();
    expect(kv.get('activeId')).toBe('old');
    expect(err.mock.calls.some((c) => c[0] === '[ytup] storage write failed for activeId')).toBe(true);
  });

  it('a failing re-read is logged, never an unhandled rejection; flush still resolves', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kv = await createSyncStore(['activeId']);
    vi.spyOn(local(), 'set').mockRejectedValueOnce(new Error('quota'));
    vi.spyOn(local(), 'get').mockRejectedValueOnce(new Error('gone'));
    kv.set('activeId', 'new');
    await expect(kv.flush()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledTimes(2);
  });

  it('a write from another context while the initial read is pending is not lost', async () => {
    await local().set({ settings: { delay: 1 } });
    const get = origGet();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(local(), 'get').mockImplementationOnce((async (k: never) => {
      const r = await get(k);
      await gate;
      return r;
    }) as never);
    const p = createSyncStore(['settings']);
    await tick();
    await local().set({ settings: { delay: 9 } });
    release();
    const kv = await p;
    expect(kv.get('settings')).toEqual({ delay: 9 });
  });

  it('throws on a key it does not mirror, and ignores its storage events', async () => {
    const kv = await createSyncStore(['a']);
    await browser.storage.local.set({ b: 1 });
    expect(() => kv.get('b')).toThrow('SyncStore: unknown key b');
    expect(() => kv.set('b', 1)).toThrow('SyncStore: unknown key b');
  });

  it('dispose() stops listening and makes set() throw', async () => {
    const kv = await createSyncStore(['a']);
    kv.dispose();
    await local().set({ a: 1 });
    expect(kv.get('a', 0)).toBe(0);
    expect(() => kv.set('a', 2)).toThrow('SyncStore: disposed');
  });

  it('a throwing onChange listener does not stop the others', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kv = await createSyncStore(['a']);
    const seen = vi.fn();
    kv.onChange('a', () => {
      throw new Error('boom');
    });
    kv.onChange('a', seen);
    await local().set({ a: 1 });
    expect(seen).toHaveBeenCalledWith(1);
    expect(err).toHaveBeenCalled();
  });

  it('set(key, undefined) deletes', async () => {
    await local().set({ a: 1 });
    const kv = await createSyncStore(['a']);
    const seen = vi.fn();
    kv.onChange('a', seen);
    kv.set('a', undefined);
    expect(kv.get('a', 'fb')).toBe('fb');
    await kv.flush();
    expect(await local().get('a')).toEqual({});
    expect(seen).not.toHaveBeenCalled();
  });

  it('a genuine external write equal to our earlier write is not dropped as an echo', async () => {
    await local().set({ k: 'old' });
    const kv = await createSyncStore(['k']);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(local(), 'set').mockImplementationOnce(() => gate); // our write never lands
    kv.set('k', 'lofi');
    await local().set({ k: 'x' }); // another context writes while ours is in flight
    release();
    await kv.flush(); // re-read applies 'x'
    expect(kv.get('k')).toBe('x');
    external({ k: 'lofi' }); // genuine external write of the same value
    expect(kv.get('k')).toBe('lofi');
  });

  it('an event arriving during a settle re-read is not overwritten by the older read', async () => {
    await local().set({ k: 'old' });
    const kv = await createSyncStore(['k']);
    const get = origGet();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const getSpy = vi.spyOn(local(), 'get').mockImplementationOnce((async (k: never) => {
      const r = await get(k);
      await gate;
      return r;
    }) as never);
    vi.spyOn(local(), 'set').mockImplementationOnce(async () => {});
    kv.set('k', 'A');
    external({ k: 'X' }); // marks stale
    const f = kv.flush();
    await vi.waitFor(() => expect(getSpy).toHaveBeenCalled());
    external({ k: 'Y' }); // lands while the re-read (which saw 'old') is pending
    release();
    await f;
    expect(kv.get('k')).toBe('Y');
  });

  it('ignores events from other storage areas', async () => {
    const kv = await createSyncStore(['a']);
    external({ a: 1 }, 'sync');
    expect(kv.get('a', 0)).toBe(0);
  });

  it('onChange unsubscribe stops notifications', async () => {
    const kv = await createSyncStore(['a']);
    const seen = vi.fn();
    const off = kv.onChange('a', seen);
    off();
    await local().set({ a: 1 });
    expect(seen).not.toHaveBeenCalled();
  });

  it('a stale re-read racing a newer local write keeps the newer local value', async () => {
    await local().set({ k: 'old' });
    const kv = await createSyncStore(['k']);
    const get = origGet();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const getSpy = vi.spyOn(local(), 'get').mockImplementationOnce((async (k: never) => {
      const r = await get(k);
      await gate;
      return r;
    }) as never);
    // Neither write produces a storage event, so only the in-flight guard protects 'B'.
    vi.spyOn(local(), 'set')
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {});
    kv.set('k', 'A');
    external({ k: 'X' }); // marks stale
    const f = kv.flush();
    await vi.waitFor(() => expect(getSpy).toHaveBeenCalled());
    kv.set('k', 'B');
    release();
    await f;
    await kv.flush();
    expect(kv.get('k')).toBe('B');
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

  it('set(key, undefined) deletes, so get returns the fallback', () => {
    const kv = createMemoryStore({ a: 1 });
    kv.set('a', undefined);
    expect(kv.get('a', 'fb')).toBe('fb');
  });
});

describe('key prefixes', () => {
  it('reads every stored key under a prefix, and nothing else', async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { rows: [] }, 'trimRun:UC1': null, other: 1 });
    const kv = await createSyncStore(['cfg'], ['claimScan:']);
    expect(kv.get('claimScan:UC1')).toEqual({ rows: [] });
    expect(kv.get('claimScan:UC2', 'none')).toBe('none'); // known (prefix), not stored
    expect(() => kv.get('trimRun:UC1')).toThrow('unknown key');
    expect(() => kv.get('other')).toThrow('unknown key');
  });

  it('a prefixed key written after start shows up', async () => {
    const kv = await createSyncStore([], ['claimScan:']);
    const seen = vi.fn();
    kv.onChange('claimScan:UC9', seen);
    external({ 'claimScan:UC9': { date: 'd' } });
    expect(kv.get('claimScan:UC9')).toEqual({ date: 'd' });
    expect(seen).toHaveBeenCalledWith({ date: 'd' });
  });
});

describe('expect(): a write someone else makes for us', () => {
  it('shows the value at once and keeps it through an older echo', async () => {
    await browser.storage.local.set({ cfg: { a: 0 } });
    const kv = await createSyncStore(['cfg']);
    let finish!: () => void;
    const done = new Promise<void>((r) => { finish = r; });
    kv.expect('cfg', { a: 1 }, done);
    expect(kv.get('cfg')).toEqual({ a: 1 });
    external({ cfg: { a: 0 } }); // an event from before our write
    expect(kv.get('cfg')).toEqual({ a: 1 });
    await browser.storage.local.set({ cfg: { a: 1, b: 2 } }); // the writer merged with something else
    finish();
    await kv.flush();
    expect(kv.get('cfg')).toEqual({ a: 1, b: 2 }); // read again once the writer is done
  });

  it('a failed write is reconciled with storage', async () => {
    await browser.storage.local.set({ cfg: { a: 0 } });
    const kv = await createSyncStore(['cfg']);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    kv.expect('cfg', { a: 1 }, Promise.reject(new Error('refused')));
    await kv.flush();
    expect(kv.get('cfg')).toEqual({ a: 0 });
  });

  it('the memory store just takes the value', () => {
    const kv = createMemoryStore();
    kv.expect('cfg', { a: 1 }, Promise.resolve());
    expect(kv.get('cfg')).toEqual({ a: 1 });
  });
});
