import type { Schedule } from './settings';

// The weekly schedule (P5-week-schedule): N videos a week on days and times that vary from week
// to week, instead of one every N days. Everything here is worked out from the stored settings
// alone (no clock, no Math.random), so a video keeps its time however often the queue is read.
//
// - Weeks are 7-day blocks counted from the local calendar day of `anchor` (the start the user
//   picked). The 7 days are cut into perWeek near-equal runs and each run gives one day, so the
//   days are spread out: 3 a week is never three days in a row. Where the longer runs fall
//   changes too, so no day of the block always has a video.
// - Up to 3 a week, two videos in a row are never on adjacent days, across two blocks too.
// - A block's days differ from the block before (fewer than 7 a week).
// - Each time is a 15-minute step of the window, as Studio's time list has them, and differs
//   from the video before when the window holds more than one step.
// - On the anchor's own day a video is not before the anchor: its time is drawn from the steps
//   still ahead, and when the window is already over that day gets no video (the first block
//   then has one fewer).
// - A day is a calendar day (new Date(y, m, d + n)), never 24 hours of milliseconds, so a
//   clock change leaves the times of day alone.
export interface WeekConfig { anchor: number; perWeek: number; from: number; to: number; seed: number } // from / to: minutes after midnight
export interface WeekSlots {
  notBefore(t: number): number; // the first release time at or after t
  after(t: number): number; // the one after t
}

export const WEEK = { perWeek: 3, from: '17:00', to: '21:00' } as const;
const STEP = 15; // minutes: Studio's time list

export const minutesOf = (v: unknown) => {
  const m = typeof v === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// From before to, and wide enough to hold one of Studio's steps.
export const windowOk = (from: unknown, to: unknown) => {
  const a = minutesOf(from);
  const b = minutesOf(to);
  return a !== null && b !== null && b - a >= STEP;
};

// The week fields of settings.schedule, each on its own. Settings cross a message boundary and
// come out of backup files: anything else is not stored.
const FIELDS: Record<string, (v: unknown) => boolean> = {
  mode: (v) => v === 'every' || v === 'week',
  perWeek: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7,
  from: (v) => minutesOf(v) !== null,
  to: (v) => minutesOf(v) !== null,
  seed: (v) => typeof v === 'number' && Number.isFinite(v),
  anchor: (v) => typeof v === 'string',
};
export const weekField = (k: string, v: unknown) => Object.hasOwn(FIELDS, k) && FIELDS[k]!(v);

// from and to are one value: when `next` holds no window, both go back to what `was` had.
export function keepWindow(next: Record<string, unknown>, was: Record<string, unknown>) {
  if (windowOk(next.from ?? WEEK.from, next.to ?? WEEK.to)) return;
  for (const k of ['from', 'to']) {
    if (Object.hasOwn(was, k)) next[k] = was[k];
    else delete next[k];
  }
}

// `base` with the good week fields of `v` (a file's schedule).
export function withWeek<T extends object>(base: T, v: Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(FIELDS)) if (Object.hasOwn(v, k) && weekField(k, v[k])) out[k] = v[k];
  keepWindow(out, base as Record<string, unknown>);
  return out as T;
}

// What the box shows and the times are made from: the stored values, or the defaults for
// anything missing or unusable.
export function weekPrefs(s: Partial<Schedule>): { perWeek: number; from: string; to: string } {
  const ok = windowOk(s.from ?? WEEK.from, s.to ?? WEEK.to);
  return {
    perWeek: weekField('perWeek', s.perWeek) ? s.perWeek! : WEEK.perWeek,
    from: ok ? s.from ?? WEEK.from : WEEK.from,
    to: ok ? s.to ?? WEEK.to : WEEK.to,
  };
}

// null without a start. The run moves `start` on after each upload; the weeks stay counted from
// `anchor`, so the videos still waiting keep their times. An anchor after the start is stale.
export function weekConfig(s: Schedule): WeekConfig | null {
  const start = new Date(s.start).getTime();
  if (!Number.isFinite(start)) return null;
  const anchor = new Date(s.anchor ?? '').getTime();
  const p = weekPrefs(s);
  return {
    anchor: anchor <= start ? anchor : start,
    perWeek: p.perWeek, from: minutesOf(p.from)!, to: minutesOf(p.to)!,
    seed: weekField('seed', s.seed) ? s.seed! : 0,
  };
}

// mulberry32
function rng(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every way to take one day from each of perWeek runs of a block (days 0–6). The runs are
// floor(7 / perWeek) days long or one more, in any order: with the longer runs always in the
// same place, 4 a week would have a video on the block's first day every week.
function patterns(perWeek: number): number[][] {
  const small = Math.floor(7 / perWeek);
  const found = new Map<string, number[]>(); // two cuts can give the same days
  const walk = (at: number, long: number, head: number[]) => {
    const left = perWeek - head.length;
    if (!left) return void found.set(head.join(), head);
    for (const size of [small, small + 1]) {
      if (size === small ? left === long : !long) continue; // `long` of the runs left are the longer ones
      for (let d = at; d < at + size; d++) {
        if (perWeek > 3 || !head.length || d - head[head.length - 1]! >= 2) walk(at + size, long - (size - small), [...head, d]);
      }
    }
  };
  walk(0, 7 - small * perWeek, []);
  return [...found.values()];
}

interface Block { pat: number; step: number; steps: number[] } // the days (an index into the patterns), the last video's step, each video's step (-1: none)

export function weekSlots(c: WeekConfig): WeekSlots {
  const a = new Date(c.anchor);
  const [y, m, d] = [a.getFullYear(), a.getMonth(), a.getDate()];
  const first = Math.ceil(c.from / STEP) * STEP;
  const count = Math.floor((c.to - first) / STEP) + 1; // steps in the window
  const day0From = Math.max(0, Math.ceil(((c.anchor - new Date(y, m, d).getTime()) / 60e3 - first) / STEP)); // the first step not before the anchor
  const all = patterns(c.perWeek);
  const tight = c.perWeek <= 3;

  // Block k follows from the block before it only, and draws from its own stream, so the
  // blocks before the one asked for are passed through without building a single date.
  const block = (k: number, prev: Block): Block => {
    const r = rng(c.seed ^ Math.imul(k + 1, 0x9e3779b1));
    const last = prev.pat < 0 ? -1 : all[prev.pat]![c.perWeek - 1]!;
    const ok = (i: number) => i !== prev.pat && !(tight && last === 6 && all[i]![0] === 0);
    let n = 0;
    for (let i = 0; i < all.length; i++) if (ok(i)) n++;
    let pat = 0; // 7 a week: the one pattern there is
    for (let i = 0, pick = Math.floor(r() * n); n && i < all.length; i++) {
      if (ok(i) && pick-- === 0) { pat = i; break; }
    }
    let step = prev.step;
    const steps = all[pat]!.map((day) => {
      const lo = k === 0 && day === 0 ? day0From : 0;
      const free = count - lo;
      if (free <= 0) return -1;
      const skip = step >= lo && free > 1; // not the time of the video before
      let s = lo + Math.floor(r() * (free - (skip ? 1 : 0)));
      if (skip && s >= step) s++;
      step = s;
      return s;
    });
    return { pat, step, steps };
  };

  const none: Block = { pat: -1, step: -1, steps: [] };
  let from = -1; // the first block built
  let next = 0;
  let prev = none;
  let slots: number[] = [];
  const build = (b: number) => {
    prev = none;
    for (let k = 0; k < b; k++) prev = block(k, prev);
    from = next = b;
    slots = [];
  };
  const extend = () => {
    const b = block(next, prev);
    all[b.pat]!.forEach((day, i) => {
      if (b.steps[i]! >= 0) slots.push(new Date(y, m, d + 7 * next + day, 0, first + STEP * b.steps[i]!).getTime());
    });
    prev = b;
    next++;
  };
  const notBefore = (t: number) => {
    const at = new Date(t);
    const b = Math.max(0, Math.floor((Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) - Date.UTC(y, m, d)) / 86400e3 / 7));
    if (from < 0 || b < from) build(b);
    while (!slots.length || slots[slots.length - 1]! < t) extend();
    return slots.find((s) => s >= t)!;
  };
  return { notBefore, after: (t) => notBefore(t + 1) };
}

// The sequence for these settings, or null in the interval mode. Kept while the settings that
// make it stay the same: the queue's times are read again on every change the panel hears.
let kept: { key: string; slots: WeekSlots } | null = null;
export function weekOf(s: Schedule): WeekSlots | null {
  const c = s.mode === 'week' ? weekConfig(s) : null;
  if (!c) return null;
  const key = JSON.stringify(c);
  if (kept?.key !== key) kept = { key, slots: weekSlots(c) };
  return kept.slots;
}
