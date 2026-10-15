import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatStudioDate, formatStudioTime, parseClock, setSchedule } from '../lib/studio/schedule';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { El, makeDocument } from './fake-dom.mjs';

// setSchedule() itself drives Studio's date picker and is checked by hand (Phase 2b).
// These pin the text it types and the way it reads Studio's answer back, and what it does when
// the calendar does not open (P5-draft-retry).
vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
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

describe('a calendar that does not open', () => {
  const el = (tag: string, id: string) => { const e = new El(tag); e.id = id; return e; };
  const page = (visibilityState: string) => {
    const doc = makeDocument();
    const dlg = el('ytcp-uploads-dialog', 'dlg');
    const first = el('div', 'datepicker-trigger');
    dlg.append(el('div', 'schedule-radio-button'), first);
    doc.body.append(dlg);
    vi.stubGlobal('document', Object.assign(doc, { visibilityState }));
    return { dlg, first };
  };

  it('each click goes to the date field that is in the dialog now, not to one Studio has drawn again', async () => {
    const { dlg, first } = page('visible');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const again = el('div', 'datepicker-trigger');
    const clicks: string[] = [];
    first.onclick = () => { clicks.push('first'); first.remove(); dlg.append(again); }; // drawn again after the first click
    again.onclick = () => clicks.push('again');
    expect(await setSchedule(new Date(2026, 9, 20, 19, 0))).toBe('Could not open the calendar');
    expect(clicks).toEqual(['first', 'again', 'again']);
    expect(warn).toHaveBeenCalledWith('[ytup] calendar: not open after 3 clicks · tab visible · date field was drawn again · 0 calendar input(s) in the page, none visible');
    warn.mockRestore();
  });

  it('says when the tab was in the background', async () => {
    page('hidden');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await setSchedule(new Date(2026, 9, 20, 19, 0))).toBe('Could not open the calendar (the Studio tab was in the background)');
    expect(warn).toHaveBeenCalledWith('[ytup] calendar: not open after 3 clicks · tab hidden · date field still in the page · 0 calendar input(s) in the page, none visible');
    warn.mockRestore();
  });
});
