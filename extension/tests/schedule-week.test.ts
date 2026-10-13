import { afterEach, describe, expect, it } from 'vitest';
import { weekConfig, weekField, weekOf, weekSlots, windowOk, withWeek, type WeekConfig } from '../lib/schedule-week';
import type { Schedule } from '../lib/settings';

// 2026-10-13 is a Tuesday; the start is 10:00, before the 17:00–21:00 window.
const anchor = new Date(2026, 9, 13, 10, 0).getTime();
const cfg = (over: Partial<WeekConfig> = {}): WeekConfig => ({ anchor, perWeek: 3, from: 17 * 60, to: 21 * 60, seed: 1, ...over });
const take = (c: WeekConfig, n: number, from = c.anchor) => {
  const w = weekSlots(c);
  const out: number[] = [];
  for (let t = w.notBefore(from); out.length < n; t = w.after(t)) out.push(t);
  return out;
};
const day0 = (c: WeekConfig) => { const a = new Date(c.anchor); return Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()); };
// The local calendar day of a slot, counted from the start's day.
const dayOf = (c: WeekConfig, t: number) => { const d = new Date(t); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - day0(c)) / 86400e3); };
const minOf = (t: number) => new Date(t).getHours() * 60 + new Date(t).getMinutes();
const blocks = (c: WeekConfig, slots: number[]) => {
  const out: number[][] = [];
  for (const t of slots) (out[Math.floor(dayOf(c, t) / 7)] ??= []).push(dayOf(c, t) % 7);
  return out;
};
const SEEDS = Array.from({ length: 60 }, (_, i) => (i * 2654435761) >>> 0);
const each = (fn: (c: WeekConfig, slots: number[]) => void, n = 84, over: Partial<WeekConfig> = {}) => {
  for (const seed of SEEDS) for (let perWeek = 1; perWeek <= 7; perWeek++) {
    const c = cfg({ seed, perWeek, ...over });
    fn(c, take(c, n));
  }
};

describe('weekSlots (P5-week-schedule)', () => {
  it('every 7-day block from the start\'s day gets exactly perWeek different days', () => {
    each((c, slots) => {
      const b = blocks(c, slots).slice(0, -1); // the last block may be cut by n
      expect(b.length).toBeGreaterThan(5);
      for (const days of b) {
        expect(days).toHaveLength(c.perWeek);
        expect(new Set(days).size).toBe(c.perWeek);
      }
    });
  });

  // The 7 days cut into perWeek runs of floor(7 / perWeek) days or one more, in some order,
  // with one of the days in each run.
  const fits = (days: number[], perWeek: number) => {
    const small = Math.floor(7 / perWeek);
    const go = (i: number, at: number, big: number): boolean => (i === perWeek
      ? at === 7 && big === 0
      : [small, small + 1].some((size) => (size === small || big > 0) && days[i]! >= at && days[i]! < at + size && go(i + 1, at + size, big - (size - small))));
    return go(0, 0, 7 - small * perWeek);
  };

  it('spread out: one day in each of perWeek near-equal runs of the week', () => {
    expect(fits([0, 2, 5], 3)).toBe(true);
    expect(fits([0, 1, 2], 3)).toBe(false); // the check itself: three days in a row fit no cut
    expect(fits([0, 1, 5], 3)).toBe(false);
    expect(fits([0, 1, 2, 3], 4)).toBe(false);
    each((c, slots) => {
      for (const days of blocks(c, slots).slice(0, -1)) expect(fits(days, c.perWeek), `${c.perWeek}: ${days}`).toBe(true);
    });
    // so 3 a week is never three days in a row, and 7 a week is every day
    expect(blocks(cfg({ perWeek: 7 }), take(cfg({ perWeek: 7 }), 14))).toEqual([[0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]]);
  });

  it('up to 3 a week: two videos in a row are never on adjacent days, across weeks too', () => {
    each((c, slots) => {
      if (c.perWeek > 3) return;
      for (let i = 1; i < slots.length; i++) expect(dayOf(c, slots[i]!) - dayOf(c, slots[i - 1]!)).toBeGreaterThanOrEqual(2);
    });
  });

  it('the days of a week differ from the week before while fewer than 7 a week', () => {
    each((c, slots) => {
      if (c.perWeek === 7) return;
      const b = blocks(c, slots).slice(0, -1);
      for (let i = 1; i < b.length; i++) expect(b[i]).not.toEqual(b[i - 1]);
    });
  });

  it('times are 15-minute steps inside the window, and differ from the video before', () => {
    each((c, slots) => {
      slots.forEach((t, i) => {
        expect(minOf(t)).toBeGreaterThanOrEqual(c.from);
        expect(minOf(t)).toBeLessThanOrEqual(c.to);
        expect(minOf(t) % 15).toBe(0);
        expect(new Date(t).getSeconds() * 1000 + new Date(t).getMilliseconds()).toBe(0);
        if (i) expect(minOf(t)).not.toBe(minOf(slots[i - 1]!));
      });
    });
    // a window off the quarter: 17:05–17:40 holds 17:15 and 17:30 only, so they alternate
    const odd = take(cfg({ from: 17 * 60 + 5, to: 17 * 60 + 40, perWeek: 7 }), 6).map(minOf);
    expect(new Set(odd)).toEqual(new Set([17 * 60 + 15, 17 * 60 + 30]));
    odd.forEach((m, i) => { if (i) expect(m).not.toBe(odd[i - 1]); });
    // one step only: every video at that time
    expect(new Set(take(cfg({ from: 19 * 60, to: 19 * 60 + 14 }), 9).map(minOf))).toEqual(new Set([19 * 60]));
  });

  it('no day of the block is always on or always off while fewer than 7 a week', () => {
    for (let perWeek = 1; perWeek < 7; perWeek++) {
      const c = cfg({ perWeek });
      const b = blocks(c, take(c, perWeek * 300)).slice(0, -1);
      for (let d = 0; d < 7; d++) {
        const on = b.filter((days) => days.includes(d)).length;
        expect(on, `${perWeek} a week, day ${d}`).toBeGreaterThan(0);
        expect(on, `${perWeek} a week, day ${d}`).toBeLessThan(b.length);
      }
    }
  });

  it('uses the whole window and every weekday over time', () => {
    const c = cfg({ perWeek: 3 });
    const slots = take(c, 600);
    expect(new Set(slots.map(minOf)).size).toBe(17); // 17:00 … 21:00
    expect(new Set(slots.map((t) => new Date(t).getDay())).size).toBe(7);
  });

  it('strictly later each time, and never before the start', () => {
    each((c, slots) => {
      expect(slots[0]).toBeGreaterThanOrEqual(c.anchor);
      expect(weekSlots(c).notBefore(0)).toBe(slots[0]); // asked from long before: still the first
      for (let i = 1; i < slots.length; i++) expect(slots[i]).toBeGreaterThan(slots[i - 1]!);
    }, 40);
  });

  it('a start inside the window: a video on the start\'s day is at or after the start', () => {
    let onDay0 = 0;
    each((c, slots) => {
      expect(slots[0]).toBeGreaterThanOrEqual(c.anchor);
      if (dayOf(c, slots[0]!) === 0) onDay0++;
    }, 10, { anchor: new Date(2026, 9, 13, 20, 20).getTime() });
    expect(onDay0).toBeGreaterThan(50); // 7 a week alone is 60 of them
    // 20:20 leaves 20:30, 20:45 and 21:00
    const late = cfg({ anchor: new Date(2026, 9, 13, 20, 20).getTime(), perWeek: 7 });
    expect([20 * 60 + 30, 20 * 60 + 45, 21 * 60]).toContain(minOf(take(late, 1)[0]!));
  });

  it('a start after the window: the start\'s day gets no video, the rest of the week is unchanged', () => {
    for (const seed of SEEDS) {
      const early = cfg({ seed, perWeek: 7 });
      const after = cfg({ seed, perWeek: 7, anchor: new Date(2026, 9, 13, 21, 1).getTime() });
      const a = take(after, 20);
      expect(weekSlots(after).notBefore(0)).toBe(a[0]); // nothing before the start, whatever is asked
      expect(dayOf(after, a[0]!)).toBe(1);
      expect(blocks(after, a)[0]).toEqual([1, 2, 3, 4, 5, 6]);
      expect(blocks(early, take(early, 20))[0]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it('same inputs, same times, however far or from wherever they are asked', () => {
    each((c, slots) => {
      expect(take(c, 30)).toEqual(slots.slice(0, 30));
      // asked from the middle (the blocks before are not built), then again from the start
      const w = weekSlots(c);
      expect(w.notBefore(slots[50]!)).toBe(slots[50]);
      expect(w.after(slots[50]!)).toBe(slots[51]);
      expect(w.notBefore(slots[50]! - 1)).toBe(slots[50]);
      expect(w.notBefore(c.anchor)).toBe(slots[0]);
      expect(w.after(slots[3]!)).toBe(slots[4]);
      expect(take(c, 20, slots[60]!)).toEqual(slots.slice(60, 80));
    });
  });

  it('a start far in the past costs no slot per week gone by', () => {
    const old = cfg({ anchor: new Date(1902, 0, 1, 10, 0).getTime(), perWeek: 7 });
    const now = new Date(2026, 9, 13, 10, 0).getTime();
    const t0 = performance.now();
    const far = take(old, 5, now);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(far[0]).toBeGreaterThanOrEqual(now);
    expect(far[0]! - now).toBeLessThan(86400e3);
  });

  it('another seed gives other times; the same seed the same', () => {
    const a = take(cfg({ seed: 1 }), 12);
    expect(take(cfg({ seed: 1 }), 12)).toEqual(a);
    expect(take(cfg({ seed: 2 }), 12)).not.toEqual(a);
    let same = 0;
    for (const seed of SEEDS) if (JSON.stringify(take(cfg({ seed }), 6)) === JSON.stringify(a.slice(0, 6))) same++;
    expect(same).toBe(0);
  });

  describe('daylight saving (local calendar days, not 24 h of milliseconds)', () => {
    const tz = process.env.TZ;
    afterEach(() => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; });

    it('times stay inside the window on both sides of a clock change', () => {
      process.env.TZ = 'America/New_York';
      // clocks go back on Sunday 2026-11-01 and forward on Sunday 2027-03-14
      for (const start of [new Date(2026, 9, 26, 10, 0), new Date(2027, 2, 8, 10, 0)]) {
        expect(new Date(start.getTime() + 7 * 86400e3).getHours()).not.toBe(10); // the zone took effect
        for (const seed of SEEDS.slice(0, 20)) {
          const c = cfg({ anchor: start.getTime(), seed, perWeek: 7 });
          const slots = take(c, 21);
          expect(slots.map((t) => dayOf(c, t))).toEqual(Array.from({ length: 21 }, (_, i) => i));
          for (const t of slots) {
            expect(minOf(t)).toBeGreaterThanOrEqual(17 * 60);
            expect(minOf(t)).toBeLessThanOrEqual(21 * 60);
          }
        }
      }
    });
  });
});

describe('week settings', () => {
  const base: Schedule = { on: true, start: '2026-10-13T10:00', every: 1, unit: 'day' };

  it('each field alone: what is refused', () => {
    expect(weekField('mode', 'week')).toBe(true);
    expect(weekField('mode', 'every')).toBe(true);
    expect(weekField('mode', 'month')).toBe(false);
    for (const n of [1, 3, 7]) expect(weekField('perWeek', n)).toBe(true);
    for (const n of [0, 8, 2.5, '3', Number.NaN, null]) expect(weekField('perWeek', n)).toBe(false);
    for (const t of ['00:00', '17:00', '23:59']) expect(weekField('from', t)).toBe(true);
    for (const t of ['24:00', '7:00', '17:60', '17:00:00', 1020, '']) expect(weekField('to', t)).toBe(false);
    expect(weekField('seed', 4294967295)).toBe(true);
    for (const n of [Number.NaN, Infinity, '1', null]) expect(weekField('seed', n)).toBe(false);
    expect(weekField('anchor', '2026-10-13T10:00')).toBe(true);
    expect(weekField('anchor', 5)).toBe(false);
    expect(weekField('every', 3)).toBe(false); // not a week field
    expect(weekField('__proto__', 'week')).toBe(false);
  });

  it('the window: from before to, at least one 15-minute step wide', () => {
    expect(windowOk('17:00', '21:00')).toBe(true);
    expect(windowOk('17:00', '17:15')).toBe(true);
    expect(windowOk('17:00', '17:14')).toBe(false);
    expect(windowOk('21:00', '17:00')).toBe(false);
    expect(windowOk('17:00', '17:00')).toBe(false);
    expect(windowOk('17:00', undefined)).toBe(false);
  });

  it('withWeek takes the good week fields of a file or patch and keeps the window whole', () => {
    expect(withWeek(base, { mode: 'week', perWeek: 5, from: '08:00', to: '12:30', seed: 9, anchor: '2026-10-01T10:00', every: 9, junk: 1 }))
      .toEqual({ ...base, mode: 'week', perWeek: 5, from: '08:00', to: '12:30', seed: 9, anchor: '2026-10-01T10:00' });
    expect(withWeek(base, { mode: 'month', perWeek: 9, seed: Number.NaN, anchor: 1 })).toEqual(base);
    // a window that is not one: both ends stay as they were
    expect(withWeek(base, { from: '22:00' })).toEqual(base); // against the default 21:00
    expect(withWeek({ ...base, from: '08:00', to: '10:00' }, { to: '07:00' })).toEqual({ ...base, from: '08:00', to: '10:00' });
    expect(withWeek({ ...base, from: '08:00', to: '10:00' }, { from: '09:50' })).toEqual({ ...base, from: '08:00', to: '10:00' });
    expect(withWeek({ ...base, from: '08:00', to: '10:00' }, { from: '09:45' })).toEqual({ ...base, from: '09:45', to: '10:00' });
  });

  it('weekConfig: stored values or the defaults (3 a week, 17:00–21:00)', () => {
    expect(weekConfig(base)).toEqual({ perWeek: 3, from: 1020, to: 1260, seed: 0, anchor: new Date(2026, 9, 13, 10, 0).getTime() });
    expect(weekConfig({ ...base, perWeek: 9, from: '22:00', to: '08:00', seed: Number.NaN })).toMatchObject({ perWeek: 3, from: 1020, to: 1260, seed: 0 });
    expect(weekConfig({ ...base, perWeek: 1, from: '06:30', to: '07:00', seed: 7 })).toMatchObject({ perWeek: 1, from: 390, to: 420, seed: 7 });
  });

  it('weekConfig: the weeks are counted from the anchor while it is not after the start', () => {
    const at = (s: string) => new Date(s).getTime();
    expect(weekConfig({ ...base, start: '2026-10-20T18:00', anchor: '2026-10-13T10:00' })!.anchor).toBe(at('2026-10-13T10:00'));
    expect(weekConfig({ ...base, start: '2026-10-20T18:00', anchor: '2026-10-21T10:00' })!.anchor).toBe(at('2026-10-20T18:00'));
    expect(weekConfig({ ...base, start: '2026-10-20T18:00', anchor: 'x' })!.anchor).toBe(at('2026-10-20T18:00'));
    expect(weekConfig({ ...base, start: '' })).toBe(null);
  });

  it('weekOf: null unless the mode is week; the same settings give the same sequence object', () => {
    expect(weekOf(base)).toBe(null);
    expect(weekOf({ ...base, mode: 'every' })).toBe(null);
    const w = weekOf({ ...base, mode: 'week', seed: 5 });
    expect(w).not.toBe(null);
    expect(weekOf({ ...base, mode: 'week', seed: 5, on: false })).toBe(w);
    expect(weekOf({ ...base, mode: 'week', seed: 6 })).not.toBe(w);
    expect(weekOf({ ...base, mode: 'week', start: 'x' })).toBe(null);
  });
});
