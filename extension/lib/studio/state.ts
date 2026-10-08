import { getLang, setLang } from '../i18n';
import { sendMessage } from '../messages';
import { SCHEMA_VERSION } from '../migrations';
import { defaultPresets, type Preset } from '../presets';
import { defaultSettings, loadSettings, type Settings } from '../settings';
import { load as loadStored } from '../storage';
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
export const save = (key: string, value: unknown): void => kv.set(key, value);
export const onStored = (key: string, fn: (value: unknown) => void) => kv.onChange(key, fn);
export const flushState = () => kv.flush();

export const settings: Settings = defaultSettings();
export const presets: Preset[] = defaultPresets();
// A primitive: importers read it through the live ES module binding.
export let activeId: string = presets[0]!.id;
export const counters: Record<string, number> = {};
export const saveSettings = () => save('settings', settings);

// @port-begin
export const presetById = (id: string): Preset => presets.find((p) => p.id === id) || presets[0]!;
export const active = () => presetById(activeId);
// @port-end

// Swap an object's contents but keep its identity (other modules hold references).
function replace(target: object, next: object) {
  for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
  Object.assign(target, next);
}
function refreshSettings() {
  // Same merge as the userscript: defaults (with the pre-settings autoApply/autoNext keys) ← stored
  const legacy = { autoApply: load('autoApply', true), autoNext: load('autoNext', false) };
  replace(settings, Object.assign(defaultSettings(legacy), load<Partial<Settings>>('settings', {})));
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
  replace(counters, load('counters', {}));
}

// Loads everything once the background's migrations have brought storage to this
// version. `ensureMigrated` and its timeout are injectable for tests. Calling it again
// while a load is done or in flight returns the same promise (one store, one set of
// listeners); disposeState() lets it run afresh.
let starting: Promise<void> | null = null;
let generation = 0;
let unsubscribe: (() => void)[] = [];

export function initState(ensureMigrated = () => sendMessage('ensureMigrated', undefined), timeoutMs = 10_000): Promise<void> {
  if (starting) return starting;
  const gen = generation;
  const p = start(ensureMigrated, timeoutMs, gen);
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

async function start(ensureMigrated: () => Promise<number>, timeoutMs: number, gen: number): Promise<void> {
  let v = await loadStored<number | null>('schemaVersion', null);
  if (v !== SCHEMA_VERSION) v = await migrated(ensureMigrated, timeoutMs);
  if (v !== SCHEMA_VERSION) throw new Error(`[ytup] storage schema is ${v}, this build expects ${SCHEMA_VERSION}`);
  await loadSettings(); // stores the one-time defaults (glassV2, lang) exactly as the userscript did at load
  const store = await createSyncStore(STATE_KEYS);
  if (gen !== generation) return void store.dispose(); // disposeState() ran while loading
  kv = store;
  refreshSettings();
  refreshPresets();
  refreshActiveId();
  refreshCounters();
  unsubscribe = [
    ...['settings', 'autoApply', 'autoNext'].map((k) => kv.onChange(k, refreshSettings)),
    kv.onChange('presets', () => { refreshPresets(); refreshActiveId(); }),
    kv.onChange('activeId', refreshActiveId),
    kv.onChange('counters', refreshCounters),
  ];
}

// Stops following storage and goes back to the in-memory store, so initState() can run
// again. Used when the extension is reloaded under a live page.
export function disposeState(): void {
  generation++;
  starting = null;
  for (const off of unsubscribe) off();
  unsubscribe = [];
  kv.dispose();
  kv = createMemoryStore();
}
