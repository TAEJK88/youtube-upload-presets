import { resolveLang, type Lang } from './i18n';
import { keepWindow } from './schedule-week';
import { load } from './storage';

// First clip goes out at `start`, each next one `every` hours/days later.
// mode 'week' (lib/schedule-week.ts; absent = 'every'): perWeek videos a week instead, on varied
// days, between `from` and `to` ("HH:MM"). `seed` picks the days and times, and the weeks are
// counted from `anchor`, the start as the user last set it.
export interface Schedule {
  on: boolean; start: string; every: number; unit: 'hour' | 'day';
  mode?: 'every' | 'week'; perWeek?: number; from?: string; to?: string; seed?: number; anchor?: string;
}

export interface Settings {
  autoApply: boolean; // manual single-file upload → fill in details
  autoNext: boolean; // click Next to the Visibility step
  autoSave: boolean; // queue mode: click Save
  thumb: boolean; // queue mode: upload the same-named image as thumbnail
  thumbWaitMin: number; // max minutes to wait for the upload before setting the thumbnail
  intercept: boolean; // route multi-file picks in Studio's dialog into the queue
  delay: number; // seconds to pause between files
  batch: number; // queue mode: after this many videos, wait until Studio has uploaded them; 0 = off
  dailyLimit: number; // the user's own daily number for the warning before Start (an estimate); 0 = off
  pace: 'normal' | 'slow' | 'slower'; // stretches every wait (x1 / x1.6 / x2.5)
  year: string; // {year}; empty = this year
  confirmStart: boolean; // confirm the channel before starting the queue
  category: string; // as Studio shows it; empty = don't set
  alteredContent: 'skip' | 'no' | 'yes'; // AI use
  paidPromotion: 'skip' | 'no' | 'yes';
  monetization: 'on' | 'off' | 'skip';
  adSuitability: 'none' | 'skip';
  producer: string; // {producer}; empty = current channel name
  lockChannel: { id: string; name: string } | null; // only allow uploads to this channel
  autoAcceptInvite: boolean;
  quickActions: boolean; // buttons under Studio's title/description
  notify: boolean; // desktop notification + sound when the queue ends
  schedule: Schedule;
  lang?: Lang;
}

export const defaultSettings = (legacy: { autoApply?: boolean; autoNext?: boolean } = {}): Settings => ({
  autoApply: legacy.autoApply ?? true,
  autoNext: legacy.autoNext ?? false,
  autoSave: true,
  thumb: true,
  thumbWaitMin: 120,
  intercept: true,
  delay: 3,
  batch: 15,
  dailyLimit: 15,
  pace: 'slow',
  year: '',
  confirmStart: true,
  category: 'Music',
  alteredContent: 'skip',
  paidPromotion: 'no',
  monetization: 'on',
  adSuitability: 'none',
  producer: '',
  lockChannel: null,
  autoAcceptInvite: true,
  quickActions: true,
  notify: true,
  schedule: { on: false, start: '', every: 1, unit: 'day' },
});

// What the userscript's settings object held: defaults (with the pre-settings
// autoApply / autoNext keys) ← stored.
export function mergeSettings(stored: Partial<Settings> | undefined, legacy: { autoApply?: boolean; autoNext?: boolean } = {}): Settings {
  return Object.assign(defaultSettings(legacy), stored ?? {});
}

// batch and dailyLimit are whole numbers in a range, wherever they come from (a store patch, a
// backup file). Only the ones the object has are touched.
export const BATCH_MAX = 50;
export const DAILY_LIMIT_MAX = 1000;
export const wholeIn = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
export function cleanLimits<T extends object>(s: T): T {
  const out = { ...s } as Record<string, unknown>;
  if (Object.hasOwn(s, 'batch')) out.batch = wholeIn(out.batch, BATCH_MAX);
  if (Object.hasOwn(s, 'dailyLimit')) out.dailyLimit = wholeIn(out.dailyLimit, DAILY_LIMIT_MAX);
  return out as T;
}

// Read-only: the background stores the language once (store-writer ensureLang) and is the
// only writer of settings (store:patch).
export async function loadSettings(): Promise<Settings> {
  const [autoApply, autoNext, stored] = await Promise.all([
    load('autoApply', true),
    load('autoNext', false),
    load<Partial<Settings>>('settings', {}),
  ]);
  const s = mergeSettings(stored, { autoApply, autoNext });
  // Same rule the userscript used: LANG was computed from storage at load.
  if (s.lang === undefined) s.lang = resolveLang(stored, (await load('presets', undefined)) !== undefined);
  return s;
}

// A change to settings as top-level keys; schedule is merged one level deeper, so the page
// moving schedule.start and the panel switching schedule.on don't overwrite each other.
export type SettingsPatch = Partial<Omit<Settings, 'schedule'>> & { schedule?: Partial<Schedule> };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function settingsDiff(before: Settings, after: Settings): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after) as (keyof Settings)[]) {
    if (k === 'schedule') {
      const s: Record<string, unknown> = {};
      for (const [sk, v] of Object.entries(after.schedule)) if (!same((before.schedule as unknown as Record<string, unknown>)[sk], v)) s[sk] = v;
      if (Object.keys(s).length) out.schedule = s;
    } else if (!same(before[k], after[k])) out[k] = after[k];
  }
  return out as SettingsPatch;
}

export function applySettingsPatch(stored: Record<string, unknown>, patch: SettingsPatch): Record<string, unknown> {
  const next: Record<string, unknown> = { ...stored, ...patch };
  if (patch.schedule) {
    const was: Record<string, unknown> = { ...defaultSettings().schedule, ...(isObj(stored.schedule) ? stored.schedule : {}) };
    const sch = { ...was, ...patch.schedule };
    keepWindow(sch, was); // week mode's from–to, changed one end at a time
    next.schedule = sch;
  }
  return next;
}

export function countersDiff(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k] !== v));
}
