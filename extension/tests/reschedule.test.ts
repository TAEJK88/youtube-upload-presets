// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import { rescheduleApply, rescheduleList, shiftSlots } from '../lib/studio/reschedule';

// listScheduled is the channel read (list_creator_videos, tested in claims-youtubei); the run it
// starts is claims.ts's (tests/reschedule-run.test.ts).
vi.mock('../lib/claims/claims', async (orig) => ({ ...(await orig<typeof import('../lib/claims/claims')>()), listScheduled: vi.fn(), startRescheduleRun: vi.fn(async () => '') }));

const NOW = Date.UTC(2026, 9, 29, 3, 0); // 2026-10-29 03:00 UTC
const at = (d: string) => Date.parse(`${d}Z`);
const reads = vi.mocked(C.listScheduled);
const start = vi.mocked(C.startRescheduleRun);
const channel = [{ videoId: 'aaaaaaaaaaa', title: 'Mix A', at: at('2027-01-12T19:00') }, { videoId: 'bbbbbbbbbbb', title: 'Mix B', at: at('2027-01-10T19:00') }, { videoId: 'zzzzzzzzzzz', title: 'Other', at: at('2027-01-11T08:00') }];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  reads.mockReset().mockImplementation(async () => [...channel].sort((x, y) => x.at - y.at));
  start.mockReset().mockResolvedValue('');
});
afterEach(() => vi.useRealTimers());

describe('shiftSlots (new start for the earliest, same gaps)', () => {
  const slots = [
    { videoId: 'b', title: 'B', at: at('2027-01-12T19:00') },
    { videoId: 'a', title: 'A', at: at('2027-01-10T19:00') },
    { videoId: 'c', title: 'C', at: at('2027-01-14T07:30') },
  ];

  it('moves the earliest to the new start and every other one by the same offset', () => {
    expect(shiftSlots(slots, at('2027-03-02T19:00')).map((s) => [s.videoId, new Date(s.to).toISOString()])).toEqual([
      ['b', '2027-03-04T19:00:00.000Z'],
      ['a', '2027-03-02T19:00:00.000Z'],
      ['c', '2027-03-06T07:30:00.000Z'],
    ]);
  });

  it('can move the set earlier, as long as every slot stays in the future', () => {
    expect(shiftSlots(slots, at('2026-11-01T19:00')).map((s) => new Date(s.to).toISOString())).toEqual([
      '2026-11-03T19:00:00.000Z', '2026-11-01T19:00:00.000Z', '2026-11-05T07:30:00.000Z',
    ]);
  });

  it('refuses a new start in the past or less than 15 minutes ahead', () => {
    expect(() => shiftSlots(slots, NOW - 60e3)).toThrow('Release time must be at least 15 minutes in the future');
    expect(() => shiftSlots(slots, NOW + 10 * 60e3)).toThrow('Release time must be at least 15 minutes in the future');
    expect(() => shiftSlots(slots, NOW + 16 * 60e3)).not.toThrow();
  });

  it('refuses an empty set and a start that is not a time', () => {
    expect(() => shiftSlots([], at('2027-03-02T19:00'))).toThrow();
    expect(() => shiftSlots(slots, Number.NaN)).toThrow();
  });
});

describe('reschedule:list (the panel asks the Studio tab)', () => {
  it("answers the channel's scheduled videos, earliest first", async () => {
    expect(await rescheduleList()).toEqual({ videos: [channel[1], channel[2], channel[0]] });
  });
  it('a failed or impossible read answers an error, not an empty list', async () => {
    reads.mockRejectedValueOnce(new Error('network'));
    expect(await rescheduleList()).toEqual({ error: "Couldn't read the current release times, try again" });
    reads.mockResolvedValueOnce(null);
    expect(await rescheduleList()).toEqual({ error: "Couldn't read the current release times, try again" });
  });
});

describe('reschedule:apply (the panel sends the times it showed; the tab checks them, then starts the run)', () => {
  const t = at('2027-03-02T19:00');
  const A = channel[0]!, B = channel[1]!; // Mix A at Jan 12 19:00, Mix B at Jan 10 19:00
  const item = (v: { videoId: string; at: number }) => ({ videoId: v.videoId, at: v.at });

  it('matching times: the run gets exactly the confirmed targets (same gaps, earliest at the new start)', async () => {
    expect(await rescheduleApply({ items: [item(A), item(B)], start: t })).toEqual({ started: 2 });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith([
      { videoId: 'aaaaaaaaaaa', video: 'Mix A', at: t + 2 * 86400e3 },
      { videoId: 'bbbbbbbbbbb', video: 'Mix B', at: t },
    ]);
  });

  it('a time within a minute of the fresh one still matches; the shift is from the confirmed times', async () => {
    expect(await rescheduleApply({ items: [{ videoId: B.videoId, at: B.at + 30_000 }], start: t })).toEqual({ started: 1 });
    expect(start).toHaveBeenCalledWith([{ videoId: 'bbbbbbbbbbb', video: 'Mix B', at: t }]);
  });

  // reviewer-1's HIGH: the tab must not shift from a time the person never saw.
  it('the earliest picked video no longer scheduled: refused, nothing started', async () => {
    reads.mockResolvedValueOnce([A]);
    expect(await rescheduleApply({ items: [item(A), item(B)], start: t })).toEqual({ error: 'The release times changed, reload the list' });
    expect(start).not.toHaveBeenCalled();
  });

  it('one picked time moved since the list was shown: refused, nothing started', async () => {
    reads.mockResolvedValueOnce([A, { ...B, at: B.at + 2 * 60_000 }]);
    expect(await rescheduleApply({ items: [item(A), item(B)], start: t })).toEqual({ error: 'The release times changed, reload the list' });
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses a start under 15 minutes ahead before starting anything', async () => {
    expect(await rescheduleApply({ items: [item(A)], start: NOW + 10 * 60e3 })).toEqual({ error: 'Release time must be at least 15 minutes in the future' });
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses a malformed payload without reading or starting', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ videoId: `v${i}`, at: t }));
    for (const bad of [null, 'x', {}, { items: [], start: t }, { items: 'a', start: t }, { items: [{ videoId: 5, at: t }], start: t },
      { items: [{ videoId: 'a', at: '2027' }], start: t }, { items: [{ videoId: 'a', at: Number.NaN }], start: t }, { items: [null], start: t },
      { items: [item(A)], start: '2027' }, { items: [item(A)], start: Infinity }, { items: many, start: t },
      { items: [item(A), item(A)], start: t }, { videoIds: ['aaaaaaaaaaa'], start: t }]) {
      expect(await rescheduleApply(bad)).toEqual({ error: 'Malformed reschedule request' });
    }
    expect(reads).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('a failed read answers an error and starts nothing', async () => {
    reads.mockResolvedValueOnce(null);
    expect(await rescheduleApply({ items: [item(A)], start: t })).toEqual({ error: "Couldn't read the current release times, try again" });
    expect(start).not.toHaveBeenCalled();
  });

  it("the run refused to start (another job, a running upload, another tab): the tab's reason is the answer", async () => {
    start.mockResolvedValueOnce('An upload is running, try again when it finishes');
    expect(await rescheduleApply({ items: [item(A)], start: t })).toEqual({ error: 'An upload is running, try again when it finishes' });
  });
});
