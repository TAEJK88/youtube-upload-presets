import { browser } from 'wxt/browser';
import { save } from './storage';

// The userscript read and wrote storage synchronously (GM_getValue / GM_setValue), and the
// ported page code still does. A SyncStore keeps a copy of chosen chrome.storage.local keys
// in memory: get() is synchronous, set() updates the copy at once and writes through, and
// changes made elsewhere (the side panel, another tab) flow back in via storage.onChanged.
export interface SyncStore {
  get<T>(key: string, fallback?: T): T;
  set(key: string, value: unknown): void;
  // Called when another context changed the key (never for this store's own writes).
  onChange(key: string, fn: (value: unknown) => void): () => void;
  // Resolves once every write issued so far has reached storage.
  flush(): Promise<void>;
  // Stops listening to storage; later set() calls throw.
  dispose(): void;
}

// Like GM_getValue: every get() hands out a fresh copy, so callers can't edit the cache.
const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function createSyncStore(keyList: string[]): Promise<SyncStore> {
  const keys = new Set(keyList);
  const cache = new Map<string, unknown>();
  const listeners = new Map<string, Set<(v: unknown) => void>>();
  const inflight = new Map<string, number>(); // writes of ours not yet confirmed per key
  const stale = new Set<string>(); // keys to re-read: changed elsewhere, or our write failed
  const written = new Map<string, unknown>(); // last value we wrote, to recognise a late echo
  const writes = new Set<Promise<void>>();
  let buffer: [string, unknown][] | undefined = []; // events arriving before the first read
  let live = true;

  const apply = (key: string, value: unknown) => {
    if (same(cache.get(key), value)) return;
    if (value === undefined) cache.delete(key);
    else cache.set(key, value);
    for (const fn of listeners.get(key) ?? []) {
      try {
        fn(copy(value));
      } catch (e) {
        console.error('[ytup] onChange listener for', key, e);
      }
    }
  };

  const onEvent = (key: string, newValue: unknown) => {
    if (!keys.has(key)) return;
    // While our own write is in flight this event may be its echo or an older value;
    // re-read once the write lands instead of guessing.
    if (inflight.get(key)) return void stale.add(key);
    if (written.has(key) && same(written.get(key), newValue)) return; // late echo of our own write
    written.delete(key);
    apply(key, newValue);
  };

  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (buffer) buffer.push([key, newValue]);
      else onEvent(key, newValue);
    }
  };

  // Listen before the first read so a write from another context during it is not lost.
  browser.storage.onChanged.addListener(onChanged);
  try {
    const stored = await browser.storage.local.get(keyList);
    for (const [k, v] of Object.entries(stored)) if (v !== undefined && keys.has(k)) cache.set(k, v);
  } catch (e) {
    browser.storage.onChanged.removeListener(onChanged);
    throw e;
  }
  const early = buffer;
  buffer = undefined;
  for (const [k, v] of early) onEvent(k, v); // newer than the read: replay on top of it

  const settle = async (key: string) => {
    const left = (inflight.get(key) ?? 1) - 1;
    if (left) return void inflight.set(key, left);
    inflight.delete(key);
    if (!stale.delete(key)) return;
    const got = await browser.storage.local.get(key);
    if (live && !inflight.get(key)) apply(key, got[key]);
  };

  const known = (key: string) => {
    if (!keys.has(key)) throw new Error(`SyncStore: unknown key ${key}`);
  };

  return {
    get: <T>(key: string, fallback?: T): T => {
      known(key);
      return cache.has(key) ? copy(cache.get(key) as T) : (fallback as T);
    },
    set(key, value) {
      known(key);
      if (!live) throw new Error('SyncStore: disposed');
      if (value === undefined) cache.delete(key);
      else cache.set(key, copy(value));
      written.set(key, value);
      inflight.set(key, (inflight.get(key) ?? 0) + 1);
      const w = (value === undefined ? browser.storage.local.remove(key) : save(key, value))
        .catch((e) => {
          console.error(`[ytup] storage write failed for ${key}`, e);
          stale.add(key); // the cache is ahead of storage: settle() re-reads it
          written.delete(key);
        })
        .then(() => settle(key))
        .catch((e) => console.error(`[ytup] storage re-read failed for ${key}`, e));
      writes.add(w);
      void w.finally(() => writes.delete(w));
    },
    onChange(key, fn) {
      known(key);
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(fn);
      return () => listeners.get(key)?.delete(fn);
    },
    // Never rejects: write and re-read failures are logged, and the cache reconciled with storage.
    async flush() {
      while (writes.size) await Promise.all([...writes]);
    },
    dispose() {
      live = false;
      browser.storage.onChanged.removeListener(onChanged);
    },
  };
}

// The same contract over a plain object: what the state module uses until initState()
// runs, and what tests use instead of chrome.storage.
export function createMemoryStore(initial: Record<string, unknown> = {}): SyncStore {
  const data = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  return {
    get: <T>(key: string, fallback?: T): T => (data.has(key) ? copy(data.get(key) as T) : (fallback as T)),
    set: (key, value) => void data.set(key, copy(value)),
    onChange: () => () => {},
    flush: async () => {},
    dispose: () => {},
  };
}
