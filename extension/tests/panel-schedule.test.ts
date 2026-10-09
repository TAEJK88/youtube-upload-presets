import { describe, expect, it } from 'vitest';
import { everyOf, nextAt, tomorrow19, withinHour } from '../lib/panel/schedule-quick';

// 2026-10-09 17:50 local
const now = new Date(2026, 9, 9, 17, 50).getTime();

describe('schedule quick picks (the drawer\'s chips)', () => {
  it('tomorrow 19:00', () => expect(tomorrow19(now)).toBe('2026-10-10T19:00'));
  it('the next 18:00 skips today once it is less than 15 minutes away', () => {
    expect(nextAt(18, now)).toBe('2026-10-10T18:00');
    expect(nextAt(20, now)).toBe('2026-10-09T20:00');
  });
  it('within an hour, on a quarter', () => expect(withinHour(now)).toBe('2026-10-09T19:00'));
  it('every: at least 1', () => {
    expect(everyOf('3')).toBe(3);
    expect(everyOf('0')).toBe(1);
    expect(everyOf('')).toBe(1);
  });
});
