import { sendMessage } from '../messages';
import { createMemoryStore, createSyncStore, type SyncStore } from '../sync-store';
import { CH_PREFIXES, GLOBAL_KEYS } from './keys';
import { applyOp, opKey, type ClaimsOp } from './ops';

// The copyright data as the Studio tab reads it, like lib/studio/state.ts holds the settings:
// a synchronous copy of chrome.storage.local (the ported code reads storage synchronously, as
// GM_getValue did), here of the per-channel keys and the four global ones. Writes are ops to
// the background, the one writer (D20); the tab applies the same op to its copy at once, so
// the ported code reads its own write back, and takes the stored value once the background is done.
type Send = (op: ClaimsOp) => Promise<void>;
let kv: SyncStore = createMemoryStore();
let send: Send = async () => {};
let starting: Promise<void> | null = null;
let generation = 0; // bumped by disposeClaimsStore()

export function initClaimsStore(s: Send = (op) => sendMessage('claims:op', op)): Promise<void> {
  if (starting) return starting;
  const gen = generation;
  const p = (async () => {
    const store = await createSyncStore([...GLOBAL_KEYS], CH_PREFIXES);
    if (generation !== gen) return void store.dispose(); // disposed while loading
    kv = store;
    send = s;
  })();
  starting = p;
  p.catch(() => {
    if (starting === p) starting = null;
  });
  return p;
}

// Extension reloaded under the page: back to an empty copy whose writes go nowhere.
export function disposeClaimsStore(): void {
  generation++;
  starting = null;
  kv.dispose();
  kv = createMemoryStore();
  send = async () => {};
}

// Tests: a copy holding `initial`, writes handed to `s`.
export function useMemoryClaims(initial: Record<string, unknown> = {}, s: Send = async () => {}): void {
  disposeClaimsStore();
  kv = createMemoryStore(initial);
  send = s;
}

export const load = <T>(key: string, fallback: T): T => kv.get(key, fallback);
// How many entries the object stored at `key` has, without copying it (the song history is large).
export const count = (key: string): number => kv.peek(key, (v) => (v && typeof v === 'object' ? Object.keys(v).length : 0));
// The stored value itself, not a copy, for telling whether it changed: every change (a write
// here, its result, a change from elsewhere, a new store) puts another object there. Never edit it.
export const storedRef = (key: string): unknown => kv.peek(key, (v) => v);
export const onClaimsStored = (key: string, fn: (value: unknown) => void) => kv.onChange(key, fn);
export const flushClaims = () => kv.flush();

// The background answers an op in milliseconds; it may wait behind a settings import in the
// same queue. A promise that never settles would hold the key's events back and flushClaims()
// forever (the messaging library has no timeout), so after 30 s, the youtubei calls' limit
// (D22), the op counts as failed: the copy is read from storage again, and if the op lands
// later its storage change comes in like anyone else's. So a timed-out op may still be applied:
// code reading load() right after one must not take it as not done (4b run steps).
export const SEND_TIMEOUT_MS = 30_000;
function timed(p: Promise<void>, key: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`claims:op on ${key} timed out (it may still be applied)`)), SEND_TIMEOUT_MS);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

// A write the background refused or did not answer in time. The store logs it and takes the
// stored value back (sync-store expect); the Studio content script also says it to the user
// (page.ts), as state.ts setPatchFailed does for the settings.
let writeFailed: ((key: string, e: unknown) => void) | null = null;
export const setWriteFailed = (fn: typeof writeFailed): void => void (writeFailed = fn);

export function write(op: ClaimsOp): void {
  const key = opKey(op);
  const next = applyOp(kv.get(key), op);
  const done = timed(send(op), key);
  done.catch((e) => {
    try {
      writeFailed?.(key, e);
    } catch (err) {
      console.error('[ytup] claims write failure report', err);
    }
  });
  try {
    kv.expect(key, next, done);
  } catch (e) {
    void done.catch(() => {});
    console.error('[ytup] claims write', key, e);
  }
}
// The userscript's save(key, value) for these keys: a whole-value write.
export const save = (key: string, value: unknown): void => write({ op: 'set', key, value });
