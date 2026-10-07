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
}

// Like GM_getValue: every get() hands out a fresh copy, so callers can't edit the cache.
const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function createSyncStore(keys: string[]): Promise<SyncStore> {
  const stored = await browser.storage.local.get(keys);
  const cache = new Map<string, unknown>(Object.entries(stored).filter(([, v]) => v !== undefined));
  const listeners = new Map<string, Set<(v: unknown) => void>>();
  const inflight = new Map<string, number>(); // writes of ours not yet confirmed per key
  const stale = new Set<string>(); // keys that changed elsewhere while we were writing
  const writes = new Set<Promise<void>>();

  const apply = (key: string, value: unknown) => {
    if (same(cache.get(key), value)) return;
    if (value === undefined) cache.delete(key);
    else cache.set(key, value);
    for (const fn of listeners.get(key) ?? []) fn(copy(value));
  };

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (!keys.includes(key)) continue;
      // While our own write is in flight this event may be its echo or an older value;
      // re-read once the write lands instead of guessing.
      if (inflight.get(key)) stale.add(key);
      else apply(key, newValue);
    }
  });

  const settle = async (key: string) => {
    const left = (inflight.get(key) ?? 1) - 1;
    if (left) return void inflight.set(key, left);
    inflight.delete(key);
    if (!stale.delete(key)) return;
    const got = await browser.storage.local.get(key);
    if (!inflight.get(key)) apply(key, got[key]);
  };

  return {
    get: <T>(key: string, fallback?: T): T => (cache.has(key) ? copy(cache.get(key) as T) : (fallback as T)),
    set(key, value) {
      cache.set(key, copy(value));
      inflight.set(key, (inflight.get(key) ?? 0) + 1);
      const w = save(key, value)
        .catch((e) => console.error('[ytup] storage write', key, e))
        .then(() => settle(key));
      writes.add(w);
      void w.finally(() => writes.delete(w));
    },
    onChange(key, fn) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(fn);
      return () => listeners.get(key)?.delete(fn);
    },
    async flush() {
      while (writes.size) await Promise.all([...writes]);
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
  };
}
