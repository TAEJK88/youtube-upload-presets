import { browser } from 'wxt/browser';
import { resolveLang } from '../i18n';
import { defaultPresets, type Preset } from '../presets';
import { mergeSettings, type Settings } from '../settings';
import type { StoredChannel } from '../studio/channels';

// What the panel shows from chrome.storage.local, merged the same way the page merges it
// (lib/studio/state.ts), and followed live.
export interface PanelData {
  settings: Settings;
  presets: Preset[];
  activeId: string;
  counters: Record<string, number>;
  channels: StoredChannel[];
}

export const DATA_KEYS = ['settings', 'autoApply', 'autoNext', 'presets', 'activeId', 'counters', 'channels'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function toPanelData(raw: Record<string, unknown>): PanelData {
  const stored = isObj(raw.settings) ? (raw.settings as Partial<Settings>) : undefined;
  const settings = mergeSettings(stored, {
    autoApply: typeof raw.autoApply === 'boolean' ? raw.autoApply : undefined,
    autoNext: typeof raw.autoNext === 'boolean' ? raw.autoNext : undefined,
  });
  if (settings.lang === undefined) settings.lang = resolveLang(stored, raw.presets !== undefined);
  const presets = Array.isArray(raw.presets) ? (raw.presets as Preset[]) : defaultPresets();
  return {
    settings,
    presets,
    activeId: typeof raw.activeId === 'string' ? raw.activeId : presets[0]?.id ?? '',
    counters: isObj(raw.counters) ? (raw.counters as Record<string, number>) : {},
    channels: Array.isArray(raw.channels) ? (raw.channels as StoredChannel[]) : [],
  };
}

export const readPanelData = async () => toPanelData(await browser.storage.local.get(DATA_KEYS));

export function watchPanelData(fn: (d: PanelData) => void): () => void {
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && DATA_KEYS.some((k) => k in changes)) void readPanelData().then(fn);
  };
  browser.storage.onChanged.addListener(changed);
  return () => browser.storage.onChanged.removeListener(changed);
}

// presetById(): an unknown id falls back to the first preset.
export const presetIn = (d: PanelData, id: string): Preset => d.presets.find((p) => p.id === id) || d.presets[0]!;
