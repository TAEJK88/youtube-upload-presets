import { getLang, setLang } from '../i18n';
import { sendMessage } from '../messages';
import { SCHEMA_VERSION } from '../migrations';
import { defaultPresets, type Preset } from '../presets';
import { applySettingsPatch, countersDiff, defaultSettings, mergeSettings, settingsDiff, type Settings } from '../settings';
import { load as loadStored } from '../storage';
import type { StorePatch } from '../store-writer';
import { createMemoryStore, createSyncStore, type SyncStore } from '../sync-store';

// The userscript kept settings, presets, counters and activeId in top-level variables
// and read storage synchronously. The ported page code still does both, so this module
// holds the same values as live objects, mirrored from chrome.storage.local: edits made
// in the side panel show up here without a reload, and save() writes through.

// Every key the page code reads or writes with load() / save().
export const STATE_KEYS = ['settings', 'autoApply', 'autoNext', 'presets', 'activeId', 'counters', 'queueMemo', 'uploads', 'queue'];

// In memory until initState() runs, so modules work in tests without chrome.storage.
let kv: SyncStore = createMemoryStore();
export const load = <T>(key: string, fallback: T): T => kv.get(key, fallback);
export const onStored = (key: string, fn: (value: unknown) => void) => kv.onChange(key, fn);

// settings and counters are written by the side panel too. Once initState() has run, a
// save sends only what changed to the background (lib/store-writer.ts), and the change
// stays applied on top of what storage holds until the background's write comes back.
type Patcher = (p: StorePatch) => Promise<void>;
interface Pending { p: StorePatch; done: boolean }
let patcher: Patcher | null = null;
const pending: Pending[] = [];
const patchWrites = new Set<Promise<void>>();
// The Studio content script shows a failed patch on the page while the queue runs.
let patchFailed: ((key: StorePatch['key']) => void) | null = null;
export const setPatchFailed = (fn: typeof patchFailed): void => void (patchFailed = fn);

export const save = (key: string, value: unknown): void => {
  if (!patcher || (key !== 'settings' && key !== 'counters')) return kv.set(key, value);
  const p: StorePatch = key === 'settings'
    ? { key, patch: settingsDiff(effectiveSettings(), value as Settings) }
    : { key, patch: countersDiff(effectiveCounters(), value as Record<string, number>) };
  if (!Object.keys(p.patch).length) return;
  const entry: Pending = { p, done: false };
  pending.push(entry);
  const w = patcher(p).then(
    // Kept until storage holds it, so the value never flips back meanwhile. Its echo may
    // already have come (and gone) while it was pending: read storage again, then drop it.
    async () => {
      entry.done = true;
      if (!pending.includes(entry)) return; // disposeState() ran meanwhile
      await kv.reread(p.key).catch((e) => console.error(`[ytup] storage re-read failed for ${key}`, e));
      dropDone(p.key);
      refresh(p.key);
    },
    (e) => {
      console.error(`[ytup] storage write failed for ${key}`, e);
      const i = pending.indexOf(entry);
      if (i >= 0) pending.splice(i, 1); // gone already if disposeState() ran meanwhile
      refresh(key);
      try {
        patchFailed?.(p.key);
      } catch (err) {
        console.error('[ytup] patch failure report', err);
      }
    },
  );
  patchWrites.add(w);
  void w.finally(() => patchWrites.delete(w));
};

export const flushState = async (): Promise<void> => {
  await kv.flush();
  while (patchWrites.size) await Promise.all([...patchWrites]);
};

export const settings: Settings = defaultSettings();
export const presets: Preset[] = defaultPresets();
// A primitive: importers read it through the live ES module binding.
export let activeId: string = presets[0]!.id;
export const counters: Record<string, number> = {};
export const saveSettings = () => save('settings', settings);
// Alt+1…9 in the page and the side panel's default-preset choice (a plain value: last write wins).
export function setActiveId(id: string): void {
  activeId = id;
  save('activeId', id);
}

// @port-begin
export const presetById = (id: string): Preset => presets.find((p) => p.id === id) || presets[0]!;
export const active = () => presetById(activeId);
// @port-end

// Swap an object's contents but keep its identity (other modules hold references).
function replace(target: object, next: object) {
  for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
  Object.assign(target, next);
}
function effectiveSettings(): Settings {
  let stored = load<Record<string, unknown>>('settings', {});
  for (const { p } of pending) if (p.key === 'settings') stored = applySettingsPatch(stored, p.patch);
  // Same merge as the userscript: defaults (with the pre-settings autoApply/autoNext keys) ← stored
  return mergeSettings(stored as Partial<Settings>, { autoApply: load('autoApply', true), autoNext: load('autoNext', false) });
}
function effectiveCounters(): Record<string, number> {
  let c = load<Record<string, number>>('counters', {});
  for (const { p } of pending) if (p.key === 'counters') c = { ...c, ...p.patch };
  return c;
}
// A stored value arrived: patches the background has written are in it now.
function dropDone(key: StorePatch['key']) {
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.done && pending[i]!.p.key === key) pending.splice(i, 1);
}
function refreshSettings() {
  replace(settings, effectiveSettings());
  if (settings.lang && settings.lang !== getLang()) setLang(settings.lang);
}
function refreshPresets() {
  presets.splice(0, presets.length, ...load('presets', defaultPresets()));
}
function refreshActiveId() {
  // Deliberate deviation from the userscript: an empty preset list (an external write) must not throw.
  activeId = load('activeId', presets[0]?.id ?? '');
}
function refreshCounters() {
  replace(counters, effectiveCounters());
}
const refresh = (key: string) => (key === 'settings' ? refreshSettings() : refreshCounters());

// Loads everything once the background's migrations have brought storage to this
// version. `ensureMigrated` and its timeout are injectable for tests. Calling it again
// while a load is done or in flight returns the same promise (one store, one set of
// listeners); disposeState() lets it run afresh.
let starting: Promise<void> | null = null;
let generation = 0;
let unsubscribe: (() => void)[] = [];

export function initState(
  ensureMigrated = () => sendMessage('ensureMigrated', undefined),
  timeoutMs = 10_000,
  patch: Patcher = (p) => sendMessage('store:patch', p),
): Promise<void> {
  if (starting) return starting;
  const gen = generation;
  const p = start(ensureMigrated, timeoutMs, gen, patch);
  starting = p;
  p.catch(() => {
    if (starting === p) starting = null; // a failed start may be retried
  });
  return p;
}

async function migrated(ensureMigrated: () => Promise<number>, timeoutMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('[ytup] background did not answer ensureMigrated')), timeoutMs);
  });
  try {
    return await Promise.race([ensureMigrated(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function start(ensureMigrated: () => Promise<number>, timeoutMs: number, gen: number, patch: Patcher): Promise<void> {
  let v = await loadStored<number | null>('schemaVersion', null);
  if (v !== SCHEMA_VERSION) v = await migrated(ensureMigrated, timeoutMs);
  if (v !== SCHEMA_VERSION) throw new Error(`[ytup] storage schema is ${v}, this build expects ${SCHEMA_VERSION}`);
  const store = await createSyncStore(STATE_KEYS);
  if (gen !== generation) return void store.dispose(); // disposeState() ran while loading
  kv = store;
  patcher = patch;
  refreshSettings();
  refreshPresets();
  refreshActiveId();
  refreshCounters();
  unsubscribe = [
    kv.onChange('settings', () => { dropDone('settings'); refreshSettings(); }),
    ...['autoApply', 'autoNext'].map((k) => kv.onChange(k, refreshSettings)),
    kv.onChange('presets', () => { refreshPresets(); refreshActiveId(); }),
    kv.onChange('activeId', refreshActiveId),
    kv.onChange('counters', () => { dropDone('counters'); refreshCounters(); }),
  ];
}

// Stops following storage and goes back to the in-memory store, so initState() can run
// again. Used when the extension is reloaded under a live page.
export function disposeState(): void {
  generation++;
  starting = null;
  for (const off of unsubscribe) off();
  unsubscribe = [];
  patcher = null; pending.length = 0;
  kv.dispose();
  kv = createMemoryStore();
}
