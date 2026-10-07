import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatStudioDate, formatStudioTime, parseClock } from '../lib/studio/schedule';

// setSchedule() itself drives Studio's date picker and is checked by hand (Phase 2b).
// These pin the text it types and the way it reads Studio's answer back.
afterEach(() => vi.unstubAllGlobals());
const studioIn = (lang: string) => vi.stubGlobal('document', { documentElement: { lang } });

describe('parseClock', () => {
  it('reads 24-hour, 12-hour and Thai clock text as minutes after midnight', () => {
    expect(parseClock('08:00')).toBe(480);
    expect(parseClock('8:00')).toBe(480);
    expect(parseClock('8:00 AM')).toBe(480);
    expect(parseClock('7:30 PM')).toBe(1170);
    expect(parseClock('12:00 AM')).toBe(0);
    expect(parseClock('12:15 PM')).toBe(735);
    expect(parseClock('7:30 หลังเที่ยง')).toBe(1170);
    expect(parseClock('19.05')).toBe(1145);
  });
  it('returns null when there is no time', () => {
    expect(parseClock('')).toBe(null);
    expect(parseClock('soon')).toBe(null);
  });
});

describe('formatStudioTime', () => {
  const at = new Date(2026, 9, 7, 8, 5);
  it('copies the padding of a bare HH:MM sample', () => {
    expect(formatStudioTime(at, '19:00')).toBe('08:05');
    expect(formatStudioTime(at, '7:00')).toBe('8:05');
  });
  it("otherwise formats in Studio's language", () => {
    studioIn('en-US');
    expect(formatStudioTime(at, '7:00 PM')).toBe('8:05 AM');
  });
});

describe('formatStudioDate', () => {
  const at = new Date(2026, 9, 7, 8, 5);
  it("formats in Studio's language with the Gregorian year", () => {
    studioIn('en-US');
    expect(formatStudioDate(at, 'Oct 2, 2026')).toBe('Oct 7, 2026');
  });
  it('switches to the Buddhist year when Studio shows one', () => {
    studioIn('th');
    expect(formatStudioDate(at, '2 ต.ค. 2569')).toBe('7 ต.ค. 2569');
  });
});
