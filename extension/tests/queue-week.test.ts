import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import type { QueueState } from '../lib/messages';
import { weekConfig, weekSlots } from '../lib/schedule-week';
import type { Schedule } from '../lib/settings';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { setBridge } from '../lib/studio/queue-files';
import * as Q from '../lib/studio/queue-runner';
import { queueView } from '../lib/studio/queue-view';
import { SEL } from '../lib/studio/sel';
import { save, settings } from '../lib/studio/state';
import { fakeBridge } from './bridge-fake';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// The weekly schedule (P5-week-schedule) in the place that gives the queue its times. The
// last test takes one item through uploadOne(), with Studio's dialog faked as in
// queue-run-flow.test.ts and the date picker (setSchedule) answering "done".
const studio = vi.hoisted(() => ({ open: false, set: [] as number[] }));
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));
vi.mock('../lib/studio/page-toast', () => ({ pageToast: vi.fn() }));
vi.mock('../lib/studio/queue-store', () => ({ persistQueue: vi.fn() }));
vi.mock('../lib/studio/schedule', () => ({ setSchedule: async (d: Date) => (studio.set.push(d.getTime()), '') }));
vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
  isVisible: () => true,
  detailsOpen: () => studio.open,
  uploadDialogOpen: () => studio.open,
  getTitleBox: () => ({ textContent: 'from Studio' }),
  fillDetails: async () => true,
  getDialog: () => ({
    querySelector: (s: string) =>
      s === SEL.doneButton
        ? { hasAttribute: () => false, querySelector: () => ({ disabled: false, getAttribute: () => null, click: () => { studio.open = false; } }) }
        : null,
  }),
}));
vi.mock('../lib/studio/upload-dialog', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/upload-dialog')>()),
  openFilePicker: async () => ({ input: {} }),
  injectUploadFile: async () => ((studio.open = true), true),
  closeStudioUploadDialog: vi.fn(() => { studio.open = false; }),
  goToVisibility: async () => true,
  ackNoticeDialogs: () => false,
  closeAfterDialogs: () => {},
  dialogError: () => '',
  uploadProgressText: () => '',
}));

const ui: PageUi = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast() {}, openDrawer() {}, notifyDone() {},
  setTitleMark() {}, confirmStart: async () => true,
};
const item = (id: string, extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 1, title: 't',
  titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});
const state = { running: false, stopping: false, prog: null, rev: 1 } as unknown as QueueState;

// Tuesday 2026-10-13, 09:00. The start is 10:00 that day; 3 a week between 17:00 and 21:00.
const NOW = new Date(2026, 9, 13, 9, 0).getTime();
// The interval fields stay stored and are not used: 6 hours would make "taken" 3 hours wide.
const week: Schedule = { on: true, start: '2026-10-13T10:00', every: 6, unit: 'hour', mode: 'week', perWeek: 3, from: '17:00', to: '21:00', seed: 20261013, anchor: '2026-10-13T10:00' };
// What the generator gives for these settings, from the start on.
const slots = (n: number, s: Schedule = week) => {
  const w = weekSlots(weekConfig(s)!);
  const out: number[] = [];
  for (let t = w.notBefore(new Date(s.anchor!).getTime()); out.length < n; t = w.after(t)) out.push(t);
  return out;
};
const times = () => Q.queue.map(Q.itemPublishAt);
let chan = 0;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubGlobal('document', Object.assign(makeDocument(), { getElementById: () => null, hasFocus: () => true, title: 'Channel content' }));
  // the runner keeps the channel's scheduled videos per channel: each test has its own
  vi.stubGlobal('location', { pathname: `/channel/UCweek${String(++chan).padStart(18, '0')}/videos` });
  vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
  setPageUi(ui);
  Q.queue.splice(0);
  settings.schedule = { ...week };
  studio.open = false;
  studio.set = [];
  save('uploads', []);
});
afterEach(() => {
  Q.setClaims(null);
  setBridge(null);
  Q.queue.splice(0);
  settings.schedule = { on: false, start: '', every: 1, unit: 'day' };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the weekly schedule in the queue', () => {
  it('each waiting video gets the next generated time, on different days', () => {
    Q.queue.push(item('a'), item('b'), item('c'), item('d'), item('e'), item('f'), item('g'));
    const want = slots(7);
    expect(times()).toEqual(want);
    expect(new Set(want.map((t) => new Date(t).toDateString())).size).toBe(7);
    const v = queueView(state);
    expect(v.items.map((i) => i.at)).toEqual(want);
    expect(v.schedule).toMatchObject({ on: true, set: true, start: want[0], late: false, times: want, skipped: 0 });
    expect(v.items.every((i) => i.timeProblem === '')).toBe(true);
  });

  it('a video keeps its time when one is added or removed after it; the ones after a removed video move up', () => {
    Q.queue.push(item('a'), item('b'), item('c'), item('d'));
    const want = slots(5);
    expect(times()).toEqual(want.slice(0, 4));
    Q.queue.push(item('e'));
    expect(times()).toEqual(want);
    Q.queue.splice(2, 1); // c
    expect(times()).toEqual(want.slice(0, 4));
    Q.queue.splice(3, 1);
    expect(times()).toEqual(want.slice(0, 3));
  });

  it('another seed (Shuffle) gives other times; the same settings the same ones', () => {
    Q.queue.push(item('a'), item('b'), item('c'), item('d'));
    const was = times();
    settings.schedule = { ...week, seed: 99 };
    expect(times()).not.toEqual(was);
    expect(times()).toEqual(slots(4, { ...week, seed: 99 }));
    settings.schedule = { ...week };
    expect(times()).toEqual(was);
  });

  it('a time the channel already uses is skipped: the video moves to the next generated time', async () => {
    Q.queue.push(item('a'), item('b'), item('c'));
    const want = slots(5);
    // one video of the channel 11 hours from the second time, one a whole day from the fourth
    Q.setClaims({ listScheduled: async () => [{ videoId: 'x', at: want[1]! - 11 * 3600e3 }, { videoId: 'y', at: want[3]! + 86400e3 }] });
    await Q.refreshChanSched(true);
    expect(times()).toEqual([want[0], want[2], want[3]]);
    expect(queueView(state).schedule).toMatchObject({ skipped: 1, taken: [want[1]! - 11 * 3600e3, want[3]! + 86400e3], times: [want[0], want[2], want[3]] });
    expect(Q.stepMs()).toBe(86400e3); // "the same day": less than half of it apart
  });

  it('a time edited on a card stays, and the others go around it', () => {
    const want = slots(4);
    Q.queue.push(item('a'), item('b', { publishEdited: true, publishAt: want[0]! + 3600e3 }), item('c'));
    expect(times()).toEqual([want[1], want[0]! + 3600e3, want[2]]);
    expect(Q.queueSlots().skipped).toBe(1);
  });

  it('a start that has passed: the queue goes on with the times still ahead, the same ones', () => {
    const want = slots(12);
    Q.queue.push(item('a'), item('b'));
    vi.setSystemTime(want[4]! - 10 * 60e3); // 10 minutes before the fifth time: too close
    expect(Q.startIsPast()).toBe(true);
    expect(Q.effectiveStart()).toBe(want[5]);
    expect(times()).toEqual([want[5], want[6]]);
    expect(queueView(state).schedule).toMatchObject({ late: true, start: want[5] });
    vi.setSystemTime(want[4]! - 15 * 60e3); // exactly 15 minutes ahead is allowed
    expect(Q.effectiveStart()).toBe(want[4]);
    // "Use this time" stores that time as the start; the anchor stays, so nothing moves
    settings.schedule.start = Q.toLocalInput(want[4]!);
    expect(Q.startIsPast()).toBe(false);
    expect(times()).toEqual([want[4], want[5]]);
  });

  it('the interval mode is as before, with week fields stored or not', () => {
    Q.queue.push(item('a'), item('b'));
    const start = new Date(2026, 9, 13, 10, 0).getTime();
    for (const mode of ['every', undefined] as const) {
      settings.schedule = { ...week, mode, every: 1, unit: 'day' };
      expect(times()).toEqual([start, start + 86400e3]);
      settings.schedule = { ...week, mode };
      expect(times()).toEqual([start, start + 6 * 3600e3]);
      expect(Q.stepMs()).toBe(6 * 3600e3);
    }
  });

  it('switched off, or no start: no times', () => {
    Q.queue.push(item('a'));
    settings.schedule = { ...week, on: false };
    expect(times()).toEqual([null]);
    settings.schedule = { ...week, start: '' };
    expect(times()).toEqual([null]);
    expect(queueView(state).schedule).toMatchObject({ set: false, start: 0, times: [] });
  });

  it('an uploaded video keeps its time, the start moves to the next generated time and the rest stay put', async () => {
    const want = slots(3);
    Q.queue.push(item('a'), item('b'), item('c'));
    Q.queue[1]!.status = 'error'; // only a is uploaded
    Q.queue[2]!.status = 'error';
    setBridge(fakeBridge(async () => new File(['x'], 'a.mp4')));
    settings.confirmStart = false;
    try {
      await Q.runQueue();
    } finally {
      settings.confirmStart = true;
    }
    expect(Q.queue[0]).toMatchObject({ status: 'done', publishFinal: want[0] });
    expect(studio.set).toEqual([want[0]]); // what Studio's date picker was given
    expect(settings.schedule).toMatchObject({ start: Q.toLocalInput(want[1]!), anchor: week.anchor, seed: week.seed, mode: 'week' });
    Q.queue[1]!.status = 'pending';
    Q.queue[2]!.status = 'pending';
    expect(times()).toEqual(want);
    // cleared and queued again: the next videos go on from there
    Q.queue.splice(0, 1);
    expect(times()).toEqual([want[1], want[2]]);
  });
});
