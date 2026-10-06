import { browser } from 'wxt/browser';
import { VISIBILITIES, type Visibility } from './constants';
import { fixLegacyTrapsoulTitles, runMigrations } from './migrations';
import type { Preset } from './presets';
import type { Settings } from './settings';

// Backup file = presets + settings, JSON. Same format as the userscript's
// Settings → Backup / share, so a userscript export imports here unchanged.
// Excluded: locked channel, language, upload history, copyright history.
// Personal values (producer, schedule, own artist names, EP numbers) are only
// imported when the user confirms the file is their own.
export const BACKUP_APP = 'yt-upload-presets';
export const BACKUP_FORMAT = 1; // bump when older versions can no longer read the file fully
export const BACKUP_SCHEMA = 4; // the schema a format-1 backup represents (userscript v4.26.1)
export const PERSONAL_SETTINGS = ['producer', 'schedule'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// Normalise presets from a file (wrong types would break the panel).
export function cleanPresets(list: unknown): Preset[] | null {
  if (!Array.isArray(list) || !list.length) return null;
  const ids = new Set<string>();
  const out: Preset[] = [];
  for (const p of list) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id || typeof p.label !== 'string' || ids.has(p.id)) return null;
    ids.add(p.id);
    out.push({
      ...(p as unknown as Preset),
      title: typeof p.title === 'string' ? p.title : '{name}',
      description: typeof p.description === 'string' ? p.description : '',
      tags: strList(p.tags),
      artistPriority: strList(p.artistPriority),
      artistMax: Math.max(1, parseInt(String(p.artistMax), 10) || 4),
      visibility: VISIBILITIES.includes(p.visibility as Visibility) ? (p.visibility as Visibility) : 'PRIVATE',
    });
  }
  return out;
}

export type ParsedBackup =
  | { ok: true; data: Record<string, unknown>; presets: Preset[] }
  | { ok: false; reason: 'json' | 'notBackup' | 'newerFormat'; format?: number };

export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'json' }; }
  const presets = isObj(data) && data.app === BACKUP_APP ? cleanPresets(data.presets) : null;
  if (!isObj(data) || !presets) return { ok: false, reason: 'notBackup' };
  const format = Number(data.format) || 1;
  if (format > BACKUP_FORMAT) return { ok: false, reason: 'newerFormat', format };
  return { ok: true, data, presets };
}

export interface BackupWrites {
  presets: Preset[];
  activeId: string;
  schemaVersion: number;
  settings?: Settings;
  cfg?: Record<string, unknown>;
  counters?: Record<string, number>;
}

// cur.settings must come from loadSettings() (not a raw storage read): lang is always
// the current one, taken from cur.settings and never from the file (see the `lang` skip below).
export function applyBackup(
  data: Record<string, unknown>, presets: Preset[], own: boolean,
  cur: { settings: Settings; cfg: Record<string, unknown> },
): BackupWrites {
  const w: BackupWrites = {
    presets: fixLegacyTrapsoulTitles(presets),
    activeId: presets.some((p) => p.id === data.activeId) ? (data.activeId as string) : presets[0]!.id,
    // a format-1 file represents BACKUP_SCHEMA; writeBackup runs later migrations on top
    schemaVersion: BACKUP_SCHEMA,
  };
  if (isObj(data.settings)) {
    const base = cur.settings as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(data.settings)) {
      if (!(k in base) || k === 'lockChannel' || k === 'lang' || (!own && PERSONAL_SETTINGS.includes(k))) continue;
      if (k === 'schedule') {
        if (isObj(v)) next.schedule = { ...cur.settings.schedule, on: !!v.on, start: typeof v.start === 'string' ? v.start : '', every: Math.max(1, parseInt(String(v.every), 10) || 1), unit: v.unit === 'hour' ? 'hour' : 'day' };
        continue;
      }
      if (typeof v === typeof base[k]) next[k] = v; // the type must match the current value
    }
    w.settings = next as unknown as Settings;
  }
  if (isObj(data.claimsCfg)) {
    const c = { ...cur.cfg };
    for (const [k, v] of Object.entries(data.claimsCfg)) {
      if (!own && k === 'ownNames') continue;
      if (['string', 'boolean', 'number'].includes(typeof v)) c[k] = v;
    }
    w.cfg = c;
  }
  if (own && isObj(data.counters)) {
    w.counters = Object.fromEntries(Object.entries(data.counters).filter(([, v]) => Number.isFinite(v))) as Record<string, number>;
  }
  return w;
}

export async function writeBackup(w: BackupWrites): Promise<void> {
  await browser.storage.local.set(Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined)));
  await runMigrations(); // steps added after BACKUP_SCHEMA run on the imported data; 1–4 are already baked in
}

export interface BackupFile {
  app: string; format: number; version: string; exportedAt: string;
  presets: Preset[]; activeId: string; counters: Record<string, number>;
  settings: Partial<Settings>; claimsCfg: Record<string, unknown>;
}

export function buildBackup(
  s: { presets: Preset[]; activeId: string; counters: Record<string, number>; settings: Settings; cfg: Record<string, unknown> },
  version: string, now = new Date(),
): BackupFile {
  const settings: Partial<Settings> = { ...s.settings };
  delete settings.lockChannel;
  delete settings.lang;
  return {
    app: BACKUP_APP, format: BACKUP_FORMAT, version, exportedAt: now.toISOString(),
    presets: s.presets, activeId: s.activeId, counters: s.counters, settings, claimsCfg: s.cfg,
  };
}
