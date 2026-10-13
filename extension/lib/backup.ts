import { browser } from 'wxt/browser';
import { isChannelId } from './claims/keys';
import { VISIBILITIES, type Visibility } from './constants';
import { fixLegacyTrapsoulTitles, runMigrations } from './migrations';
import type { Preset } from './presets';
import { withWeek } from './schedule-week';
import type { Settings } from './settings';
import type { StoredChannel } from './studio/channels';
import type { UploadRecord } from './studio/queue-runner';

// Backup file = presets + settings, JSON. Same format as the userscript's
// Settings → Backup / share, so a userscript export imports here unchanged.
// Excluded: locked channel, language, upload history, copyright history.
// The last userscript version also exports a "move file": the same file with a `move`
// part holding the language, the upload history and the channel list (call 8).
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

const str = (v: unknown) => (typeof v === 'string' ? v : '');
// A key or an id from the file is never the name of something every object has (__proto__,
// constructor…): assigning to one would change the object, not add a value to it.
const inherited = (k: string) => k in Object.prototype;
const plainId = (v: unknown): v is string => isChannelId(v) && !inherited(v);
// A date exactly as toISOString() gives it, which is what logUpload writes: the right shape
// alone ("2026-99-99T…") would make the queue card throw when it formats the date.
const isoTime = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) && new Date(t).toISOString() === v ? t : NaN;
};
const DAY = 86_400_000;
const MAX_TIME = 8.64e15; // the largest time a Date holds

// The move file's upload history ('uploads': newest first, 1000 at most, as the runner keeps it).
// A row needs a date, a channel and a file name: the "already uploaded" warning goes by file,
// size and channel (user.js 1809), and a row's video id is often '' (2055). The same upload is
// taken once: by video id when it has one, otherwise by date, channel, file and size. Rows
// already stored win. Each row is built field by field: nothing else in the file comes along.
// A row dated more than a day after `now` is refused: it would stay on top, and in the 1000,
// for ever. Stored rows are not cleaned, but one that is not a row at all is skipped.
const uploadKey = (u: { videoId: string; date: string; channel: string; file: string; size: number }) =>
  (u.videoId ? 'v:' + u.videoId : `f:${u.date}|${u.channel}|${u.file}|${u.size}`);
const isRow = (u: unknown): u is UploadRecord => isObj(u) && typeof u.date === 'string' && typeof u.channel === 'string' && typeof u.file === 'string';
export function cleanUploads(list: unknown, have: UploadRecord[] = [], now = Date.now()): UploadRecord[] {
  const out = Array.isArray(have) ? have.filter(isRow) : [];
  const seen = new Set(out.map(uploadKey));
  for (const u of Array.isArray(list) ? list : []) {
    if (!isObj(u) || !(isoTime(u.date) <= now + DAY) || !plainId(u.channel) || !str(u.file)) continue;
    const row: UploadRecord = {
      date: str(u.date), channel: u.channel, channelName: str(u.channelName), videoId: plainId(u.videoId) ? u.videoId : '', title: str(u.title),
      file: str(u.file), size: Number.isFinite(u.size) ? (u.size as number) : 0, txt: str(u.txt), description: str(u.description),
      publishAt: Number.isFinite(u.publishAt) && Math.abs(u.publishAt as number) <= MAX_TIME ? (u.publishAt as number) : null, visibility: str(u.visibility),
    };
    if (seen.has(uploadKey(row))) continue;
    seen.add(uploadKey(row));
    out.push(row);
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 1000);
}

// The move file's channel list. The avatar becomes an <img src> in the panel: https only,
// and stored as the URL parser read it. A channel added by its id has no name until it is
// opened in Studio (user.js 3373, panel/channels.ts withChannel): it is kept, and a stored
// one without a name takes the file's entry.
const httpsUrl = (v: unknown) => {
  const u = typeof v === 'string' && URL.canParse(v) ? new URL(v) : null;
  return u?.protocol === 'https:' ? u.href : '';
};
export function cleanChannels(list: unknown, have: StoredChannel[] = []): StoredChannel[] {
  const out = Array.isArray(have) ? have.filter((c) => isObj(c) && typeof c.id === 'string') : [];
  const seen = new Set(out.map((c) => c.id));
  for (const c of Array.isArray(list) ? list : []) {
    if (!isObj(c) || !plainId(c.id)) continue;
    const ch: StoredChannel = { id: c.id, name: str(c.name), avatar: httpsUrl(c.avatar), handle: str(c.handle) };
    const at = out.findIndex((x) => x.id === ch.id && !x.name && ch.name);
    if (at >= 0) out[at] = ch;
    if (seen.has(ch.id)) continue;
    seen.add(ch.id);
    out.push(ch);
  }
  return out;
}

// What the import question tells the user about a move file: what would pass the cleaning.
export function movePreview(data: Record<string, unknown>, now = Date.now()): { uploads: number; channels: number; lang: 'th' | 'en' | null } | null {
  if (!isObj(data.move)) return null;
  const m = data.move;
  return { uploads: cleanUploads(m.uploads, [], now).length, channels: cleanChannels(m.channels).length, lang: m.lang === 'th' || m.lang === 'en' ? m.lang : null };
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

// What the side panel sends for an import: the parsed file and whether it is the user's
// own. The background turns it into BackupWrites in its write queue (store-writer), against
// what storage holds then, so a settings patch queued before it is not undone.
export interface BackupImport { data: Record<string, unknown>; presets: Preset[]; own: boolean }

export interface BackupWrites {
  presets: Preset[];
  activeId: string;
  schemaVersion: number;
  settings?: Settings;
  cfg?: Record<string, unknown>;
  counters?: Record<string, number>;
  uploads?: UploadRecord[];
  channels?: StoredChannel[];
}

// cur.settings must come from loadSettings() (not a raw storage read): lang is always
// the current one, taken from cur.settings and never from the file (see the `lang` skip below),
// except from the move part of the user's own file (call 18).
export function applyBackup(
  data: Record<string, unknown>, presets: Preset[], own: boolean,
  cur: { settings: Settings; cfg: Record<string, unknown>; uploads?: UploadRecord[]; channels?: StoredChannel[] },
  now = Date.now(),
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
      if (!Object.hasOwn(base, k) || k === 'lockChannel' || k === 'lang' || (!own && PERSONAL_SETTINGS.includes(k))) continue;
      if (k === 'schedule') {
        // The file's schedule replaces the one here: without week fields it is the interval mode.
        if (isObj(v)) next.schedule = withWeek({ on: !!v.on, start: typeof v.start === 'string' ? v.start : '', every: Math.max(1, parseInt(String(v.every), 10) || 1), unit: v.unit === 'hour' ? 'hour' : 'day' }, v);
        continue;
      }
      if (typeof v === typeof base[k]) next[k] = v; // the type must match the current value
    }
    w.settings = next as unknown as Settings;
  }
  if (isObj(data.claimsCfg)) {
    const c = { ...cur.cfg };
    for (const [k, v] of Object.entries(data.claimsCfg)) {
      if (inherited(k) || (!own && k === 'ownNames')) continue;
      if (['string', 'boolean', 'number'].includes(typeof v)) c[k] = v;
    }
    w.cfg = c;
  }
  if (own && isObj(data.counters)) {
    w.counters = Object.fromEntries(Object.entries(data.counters).filter(([k, v]) => !inherited(k) && Number.isFinite(v))) as Record<string, number>;
  }
  // The last userscript's "everything for the extension" export (call 8): personal, own file only.
  if (own && isObj(data.move)) {
    const m = data.move;
    if (Array.isArray(m.uploads)) w.uploads = cleanUploads(m.uploads, cur.uploads, now);
    if (Array.isArray(m.channels)) w.channels = cleanChannels(m.channels, cur.channels);
    if (m.lang === 'th' || m.lang === 'en') w.settings = { ...(w.settings ?? cur.settings), lang: m.lang };
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
