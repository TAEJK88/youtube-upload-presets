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
  activeId = load('activeId', presets[0]!.id);
}
function refreshCounters() {
  replace(counters, load('counters', {}));
}

// Loads everything once the background's migrations have brought storage to this
// version. `ensureMigrated` is injectable for tests.
export async function initState(ensureMigrated = () => sendMessage('ensureMigrated', undefined)): Promise<void> {
  let v = await loadStored<number | null>('schemaVersion', null);
  if (v !== SCHEMA_VERSION) v = await ensureMigrated();
  if (v !== SCHEMA_VERSION) throw new Error(`[ytup] storage schema is ${v}, this build expects ${SCHEMA_VERSION}`);
  await loadSettings(); // stores the one-time defaults (glassV2, lang) exactly as the userscript did at load
  kv = await createSyncStore(STATE_KEYS);
  refreshSettings();
  refreshPresets();
  refreshActiveId();
  refreshCounters();
  for (const k of ['settings', 'autoApply', 'autoNext']) kv.onChange(k, refreshSettings);
  kv.onChange('presets', () => { refreshPresets(); refreshActiveId(); });
  kv.onChange('activeId', refreshActiveId);
  kv.onChange('counters', refreshCounters);
}
