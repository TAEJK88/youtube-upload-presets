// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduleBox } from '../entrypoints/sidepanel/tabs/ScheduleBox';
import { setLang } from '../lib/i18n';
import { toPanelData } from '../lib/panel/data';
import { fmtWhen, toLocalInput } from '../lib/panel/format';
import { newSeed, windowWith } from '../lib/panel/schedule-quick';
import { fakePanel, renderPanel, viewWith } from './panel-fake';

afterEach(() => {
  cleanup();
  setLang('en');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// The schedule box's second mode (P5-week-schedule): N videos a week between two times.
const START = '2030-01-01T08:00';
const sched = (over: Record<string, unknown> = {}) => toPanelData({ settings: { schedule: { on: true, start: START, every: 1, unit: 'day', ...over } } });
const week = (over: Record<string, unknown> = {}) => sched({ mode: 'week', perWeek: 3, from: '17:00', to: '21:00', seed: 7, anchor: START, ...over });
const box = (data: ReturnType<typeof sched>, view: ReturnType<typeof viewWith> | null = viewWith()) => {
  const api = fakePanel({ data, view });
  renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
  return { api, last: () => vi.mocked(api.write.settings).mock.calls.at(-1)?.[0], calls: () => vi.mocked(api.write.settings).mock.calls.length };
};
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
// crypto.getRandomValues, giving `n`
const random = (n: number) => vi.spyOn(crypto, 'getRandomValues').mockImplementation(((a: Uint32Array) => { a[0] = n; return a; }) as never);

describe('schedule box: the weekly schedule', () => {
  it('the interval mode is the default and shows no week fields', () => {
    box(sched());
    expect(screen.getByRole('group', { name: 'Release pattern' })).toBeTruthy();
    expect(pressed('Every …')).toBe('true');
    expect(pressed('Per week')).toBe('false');
    expect(screen.getByRole('spinbutton', { name: 'Every' })).toBeTruthy();
    expect(screen.queryByLabelText('Videos a week')).toBe(null);
    expect(screen.queryByRole('button', { name: 'Shuffle' })).toBe(null);
  });

  it('turning it on for the first time stores a seed and counts the weeks from the start', () => {
    const rnd = random(123456789);
    const { last } = box(sched());
    fireEvent.click(screen.getByRole('button', { name: 'Per week' }));
    expect(last()).toEqual({ schedule: { mode: 'week', anchor: START, seed: 123456789 } });
    expect(rnd).toHaveBeenCalledTimes(1);
  });

  it('turning it on again keeps the seed there is; the anchor is the start of now', () => {
    const rnd = random(1);
    const { last } = box(sched({ mode: 'every', seed: 42, anchor: '2029-01-01T08:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Per week' }));
    expect(last()).toEqual({ schedule: { mode: 'week', anchor: START } });
    expect(rnd).not.toHaveBeenCalled();
  });

  it('week mode: its fields, with the defaults while nothing is stored; no interval fields', () => {
    box(sched({ mode: 'week' }));
    expect(pressed('Per week')).toBe('true');
    expect((screen.getByLabelText('Videos a week') as HTMLSelectElement).value).toBe('3');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('17:00');
    expect((screen.getByLabelText('Until') as HTMLInputElement).value).toBe('21:00');
    expect((screen.getByLabelText('From') as HTMLInputElement).type).toBe('time');
    expect((screen.getByLabelText('First video releases') as HTMLInputElement).value).toBe(START);
    expect(screen.getByRole('button', { name: 'Tomorrow 19:00' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: 'Every' })).toBe(null);
    expect(screen.queryByRole('combobox', { name: 'Every' })).toBe(null);
    expect(screen.getByText(/Days and times are drawn anew each week/)).toBeTruthy();
    expect(screen.getByText(/Videos upload as private/)).toBeTruthy();
  });

  it('the fields show what is stored and write their own value', () => {
    const { last } = box(week({ perWeek: 5, from: '08:15', to: '12:00' }));
    expect((screen.getByLabelText('Videos a week') as HTMLSelectElement).value).toBe('5');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('08:15');
    expect((screen.getByLabelText('Until') as HTMLInputElement).value).toBe('12:00');
    expect([...(screen.getByLabelText('Videos a week') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    fireEvent.change(screen.getByLabelText('Videos a week'), { target: { value: '7' } });
    expect(last()).toEqual({ schedule: { perWeek: 7 } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:30' } });
    expect(last()).toEqual({ schedule: { from: '09:30', to: '12:00' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '10:00' } });
    expect(last()).toEqual({ schedule: { from: '08:15', to: '10:00' } });
  });

  it('the window keeps one 15-minute step: the other end moves along; a cleared field writes nothing', () => {
    const { last, calls } = box(week());
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '21:30' } });
    expect(last()).toEqual({ schedule: { from: '21:30', to: '21:45' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '16:00' } });
    expect(last()).toEqual({ schedule: { from: '15:45', to: '16:00' } });
    const n = calls();
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '' } });
    expect(calls()).toBe(n);
  });

  it('windowWith: the end being changed is taken, the day\'s edges hold', () => {
    expect(windowWith('18:00', '21:00', 'from')).toEqual({ from: '18:00', to: '21:00' });
    expect(windowWith('20:50', '21:00', 'from')).toEqual({ from: '20:50', to: '21:05' });
    expect(windowWith('23:50', '21:00', 'from')).toEqual({ from: '23:44', to: '23:59' });
    expect(windowWith('17:00', '17:10', 'to')).toEqual({ from: '16:55', to: '17:10' });
    expect(windowWith('17:00', '00:05', 'to')).toEqual({ from: '00:00', to: '00:15' });
    expect(windowWith('', '21:00', 'from')).toBe(null);
    expect(windowWith('17:00', 'x', 'to')).toBe(null);
  });

  it('Shuffle stores a new seed and nothing else', () => {
    random(4000000000);
    const { last } = box(week());
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(last()).toEqual({ schedule: { seed: 4000000000 } });
  });

  it('newSeed is a whole number from crypto.getRandomValues, another each time', () => {
    const seen = new Set(Array.from({ length: 20 }, newSeed));
    expect(seen.size).toBeGreaterThan(15);
    for (const n of seen) expect(Number.isInteger(n) && n >= 0 && n <= 0xffffffff).toBe(true);
  });

  it('a start set here is also where the weeks are counted from; "Use this time" leaves that alone', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 9, 17, 50));
    const start = Date.now() + 2 * 86400e3;
    const { last } = box(week({ start: '2026-01-01T08:00', anchor: '2026-01-01T08:00' }),
      viewWith([{}], { schedule: { on: true, set: true, start, late: true, times: [start], skipped: 0, taken: [] } }));
    fireEvent.change(screen.getByLabelText('First video releases'), { target: { value: '2031-02-03T04:05' } });
    expect(last()).toEqual({ schedule: { start: '2031-02-03T04:05', anchor: '2031-02-03T04:05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 19:00' }));
    expect(last()).toEqual({ schedule: { start: '2026-10-10T19:00', anchor: '2026-10-10T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    expect(last()).toEqual({ schedule: { start: toLocalInput(start) } });
  });

  it('switched on in week mode with no start: tomorrow 19:00, and the weeks count from it', () => {
    const { last } = box(week({ on: false, start: '', anchor: '' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule releases' }));
    const p = last()!.schedule!;
    expect(p).toEqual({ on: true, start: p.start, anchor: p.start });
    expect(p.start).toMatch(/T19:00$/);
  });

  it('back to the interval mode: only the mode is written, the week settings stay stored', () => {
    const { last } = box(week());
    fireEvent.click(screen.getByRole('button', { name: 'Every …' }));
    expect(last()).toEqual({ schedule: { mode: 'every' } });
  });

  it('a click on the mode it is already in writes nothing (the anchor must not move)', () => {
    const { calls } = box(week({ start: '2030-02-01T08:00' })); // the run moved the start on
    fireEvent.click(screen.getByRole('button', { name: 'Per week' }));
    expect(calls()).toBe(0);
    cleanup();
    const interval = box(sched());
    fireEvent.click(screen.getByRole('button', { name: 'Every …' }));
    expect(interval.calls()).toBe(0);
  });

  it('the summary: first and last time, how many a week and between which times', () => {
    const t = [Date.now() + 86400e3, Date.now() + 3 * 86400e3, Date.now() + 6 * 86400e3];
    const view = (times: number[]) => viewWith(times.map(() => ({})), { schedule: { on: true, set: true, start: times[0]!, late: false, times, skipped: 0, taken: [] } });
    box(week(), view(t));
    expect(screen.getByText(`${fmtWhen(t[0]!)} → ${fmtWhen(t[2]!)} · 3 a week, 17:00–21:00`)).toBeTruthy();
    cleanup();
    box(week({ perWeek: 1, from: '06:30', to: '07:00' }), view([t[0]!]));
    expect(screen.getByText(`Starts ${fmtWhen(t[0]!)} · 1 a week, 06:30–07:00`)).toBeTruthy();
    cleanup();
    // no view: the first time is the tab's to work out, so only where the times start from
    box(week(), null);
    expect(screen.getByText(`From ${fmtWhen(new Date(START).getTime())} · 3 a week, 17:00–21:00`)).toBeTruthy();
    cleanup();
    const taken = [t[1]!];
    box(week(), viewWith([{}, {}], { schedule: { on: true, set: true, start: t[0]!, late: false, times: [t[0]!, t[2]!], skipped: 1, taken } }));
    expect(screen.getByText(/ · 3 a week, 17:00–21:00 · 1 already scheduled on the channel \(next .*\) — skipped 1 slot\(s\)$/)).toBeTruthy();
  });

  it('in Thai', () => {
    setLang('th');
    const api = fakePanel({ data: week(), view: null, lang: 'th' });
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    expect(screen.getByRole('group', { name: 'รูปแบบการปล่อย' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ทุก ๆ …' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'รายสัปดาห์' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('คลิปต่อสัปดาห์')).toBeTruthy();
    expect(screen.getByLabelText('ตั้งแต่')).toBeTruthy();
    expect(screen.getByLabelText('ถึง')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'สุ่มใหม่' })).toBeTruthy();
    expect(screen.getByText(/^ตั้งแต่ .* · 3 คลิปต่อสัปดาห์ 17:00–21:00$/)).toBeTruthy();
    expect(screen.getByText(/วันและเวลาจะสุ่มใหม่ทุกสัปดาห์/)).toBeTruthy();
  });
});
