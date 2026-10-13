import { SCHEDULE_MIN_LEAD } from '../constants';
import { minutesOf } from '../schedule-week';
import { pad } from '../template';
import { toLocalInput } from './format';

// The schedule box's quick picks and the interval field (3604–3628).
export function tomorrow19(now = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return toLocalInput(d.getTime());
}

// atToday(): today at that hour, or tomorrow when that is less than 15 minutes away.
export function nextAt(hour: number, now = Date.now()): string {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() < now + SCHEDULE_MIN_LEAD) d.setDate(d.getDate() + 1);
  return toLocalInput(d.getTime());
}

// An hour from now, rounded up to the quarter.
export const withinHour = (now = Date.now()) => toLocalInput(Math.ceil((now + 3600e3) / 900e3) * 900e3);
export const everyOf = (text: string) => Math.max(1, parseInt(text, 10) || 1);

// The stored start in ms, or null while it is empty or not a date (a cleared datetime-local
// field saves ''; fmtWhen() throws on NaN).
export function startAt(start: string | undefined): number | null {
  const t = new Date(start || '').getTime();
  return Number.isFinite(t) ? t : null;
}

// The weekly schedule (P5-week-schedule). The seed picks the days and times; a new one is the
// only place chance comes in (lib/schedule-week.ts works everything out from it).
export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;

// Its from–to fields: the end being changed is taken, and the other one moves along so that one
// of Studio's 15-minute steps always fits between them. null while the field is empty.
export function windowWith(from: string, to: string, moved: 'from' | 'to'): { from: string; to: string } | null {
  let a = minutesOf(from);
  let b = minutesOf(to);
  if (a === null || b === null) return null;
  if (moved === 'from') {
    a = Math.min(a, 24 * 60 - 16);
    b = Math.max(b, a + 15);
  } else {
    b = Math.max(b, 15);
    a = Math.min(a, b - 15);
  }
  const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return { from: hhmm(a), to: hhmm(b) };
}
