import { SCHEDULE_MIN_LEAD } from '../constants';
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
