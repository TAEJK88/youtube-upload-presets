// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyOp, type ClaimsOp } from '../lib/claims/ops';
import { load, useMemoryClaims } from '../lib/claims/store';
import type { Run } from '../lib/claims/types';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import { scheduleOnEditPage } from '../lib/studio/reschedule-page';

vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
// The Visibility dialog's clicks are the page module's (its own tests); here the run around it.
vi.mock('../lib/studio/reschedule-page', () => ({ scheduleOnEditPage: vi.fn(async () => '') }));
import * as C from '../lib/claims/claims';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const DAY = 86400e3;
const T = Date.UTC(2027, 2, 2, 12); // Mix A's new time; Mix B's is two days later
const ops: ClaimsOp[] = [];
const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
const noLock = { acquire: async () => false, release: vi.fn(), worker: async () => true, holds: async () => false };
const page = vi.mocked(scheduleOnEditPage);
const run = () => load<Run | null>(`rescheduleRun:${CH}`, null);
const items = () => run()!.items.map((i) => [i.videoId, i.state, i.msg]);
// Studio's scheduled videos (list_creator_videos, as listScheduled reads them). A Save on a video's
// page moves it there, as Studio would; `kept: false` makes Studio not keep it.
let onChannel: Record<string, number> = {};
const OLD = { aaaaaaaaaaa: Date.UTC(2027, 0, 10), bbbbbbbbbbb: Date.UTC(2027, 0, 12) };
const studio = () => setYoutubei(async () => ({
  videos: Object.entries(onChannel).map(([videoId, t]) => ({ videoId, title: videoId, scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String(t / 1000), status: 'SCHEDULED_PUBLISHING_STATUS_SCHEDULED' }] } })),
}));
const saves = (kept = true) => page.mockImplementation(async (date: Date) => {
  const id = (location.pathname.match(/\/video\/([\w-]{11})\//) || [])[1]!;
  if (kept) onChannel = { ...onChannel, [id]: date.getTime() };
  return { error: '', dirty: false };
});
const go = (path: string) => vi.stubGlobal('location', { pathname: path, href: '' });
const lock = { acquire: async () => true, release: vi.fn(), worker: async () => true, holds: async () => false };
// The run started from the Content list: its own first step opens the first video's page; then
// the step that opened it frees itself (15 s), and each test drives the next steps itself.
async function started(list = two) {
  go('/channel/x/videos');
  expect(await C.startRescheduleRun(list)).toBe('');
  await vi.waitFor(() => expect(location.href).toBe(`/video/${list[0]!.videoId}/edit`));
  await vi.advanceTimersByTimeAsync(15_000);
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // setTimeout too: a step that opened a page frees itself 15 s later (afterEach runs that out)
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 29, 3), toFake: ['Date', 'setTimeout'] });
  ops.length = 0;
  Q.queue.splice(0);
  Q.setOtherTabRuns(false);
  page.mockReset();
  saves();
  onChannel = { ...OLD };
  studio();
  C.setClaimsUi(ui);
  ui.log.mockClear();
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  useMemoryClaims({}, async (op) => void ops.push(op));
  C.setClaimsLock(lock);
  await C.initClaimsLock();
});
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(15_000);
  C.stopAll();
  C.setClaimsUi(null);
  setYoutubei(null);
  Q.setClaims(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const two = [{ videoId: 'aaaaaaaaaaa', video: 'Mix A', at: T }, { videoId: 'bbbbbbbbbbb', video: 'Mix B', at: T + 2 * DAY }];

describe('Reschedule run (the Visibility dialog, one video at a time)', () => {
  it('stores the run with each new time, then opens the first video\'s edit page', async () => {
    go('/channel/x/videos');
    expect(await C.startRescheduleRun(two)).toBe('');
    expect(run()).toMatchObject({ active: true, items: [
      { videoId: 'aaaaaaaaaaa', video: 'Mix A', state: 'pending', msg: '', at: T },
      { videoId: 'bbbbbbbbbbb', video: 'Mix B', state: 'pending', msg: '', at: T + 2 * DAY },
    ] });
    await vi.waitFor(() => expect(location.href).toBe('/video/aaaaaaaaaaa/edit'));
    expect(page).not.toHaveBeenCalled();
  });

  it('on the video\'s page: sets its new time in the dialog, checks it with Studio, and goes on to the next', async () => {
    await started();
    go('/video/aaaaaaaaaaa/edit');
    await C.reschedStep();
    expect(page).toHaveBeenCalledWith(new Date(T), expect.any(Function), expect.any(Function));
    expect(items()).toEqual([['aaaaaaaaaaa', 'moved', ''], ['bbbbbbbbbbb', 'pending', '']]);
    await C.reschedStep();
    expect(location.href).toBe('/video/bbbbbbbbbbb/edit');
  });

  it('a video Studio did not take (page clean) is recorded with the reason, and the run moves on', async () => {
    await started();
    page.mockResolvedValueOnce({ error: 'Could not open the calendar', dirty: false });
    go('/video/aaaaaaaaaaa/edit');
    await C.reschedStep();
    expect(items()[0]).toEqual(['aaaaaaaaaaa', 'failed', 'Could not open the calendar']);
    await C.reschedStep();
    expect(location.href).toBe('/video/bbbbbbbbbbb/edit');
  });

  it('a change left unsaved in the page ends the run, and no other page is opened', async () => {
    await started();
    page.mockResolvedValueOnce({ error: 'Clicked Save but it did not save', dirty: true });
    go('/video/aaaaaaaaaaa/edit');
    await C.reschedStep();
    expect(items()[0]).toEqual(['aaaaaaaaaaa', 'failed', 'Clicked Save but it did not save — Mix A has unsaved changes in Studio, check it there']);
    expect(run()!.active).toBe(false);
    expect(ui.log).toHaveBeenCalledWith('Mix A has unsaved changes in Studio, check it there: Moved 0 · Failed 1 · Not done 1', 'ok');
    await C.reschedStep();
    expect(location.href).toBe(''); // "Leave site?" would hold the next page anyway
  });

  it('Stop pressed during the video (page clean): the video is left as not done', async () => {
    await started();
    page.mockImplementationOnce(async (_d, _s, stillOn) => { C.stopAll(); expect(stillOn()).toBe(false); return { error: 'Stopped', dirty: false }; });
    go('/video/aaaaaaaaaaa/edit');
    await C.reschedStep();
    expect(items()[0]).toEqual(['aaaaaaaaaaa', 'pending', '']);
  });

  it('a Save that Studio did not keep (its list still has the old time) is a failure, not a move', async () => {
    await started();
    saves(false);
    go('/video/aaaaaaaaaaa/edit');
    await C.reschedStep();
    expect(items()[0]).toEqual(['aaaaaaaaaaa', 'failed', "Saved, but Studio doesn't show the new time"]);
  });

  it('Stop ends the run: no further page is opened and the card says what was left', async () => {
    await started();
    C.stopAll();
    expect(run()!.active).toBe(false);
    go('/channel/x/videos');
    await C.reschedStep();
    expect(location.href).toBe('');
    expect(ui.log).toHaveBeenCalledWith('You stopped it: Moved 0 · Not done 2', 'ok');
  });

  // qa-1 (2026-10-29) saw the card say "Rescheduling" again after a Stop. Nothing in the code
  // turns a run back on: a tick, a late item result and a merge all leave a stopped run stopped.
  it('a stopped run stays stopped across a tick, a late item result and a merge', async () => {
    await started();
    C.stopAll();
    go('/video/aaaaaaaaaaa/edit');
    C.tick();
    await vi.advanceTimersByTimeAsync(3000);
    await C.reschedStep();
    expect(page).not.toHaveBeenCalled();
    const stopped = run()!;
    expect(stopped.active).toBe(false);
    const late = applyOp(stopped, { op: 'runItem', key: `rescheduleRun:${CH}`, by: 'videoId', id: 'aaaaaaaaaaa', state: 'failed', msg: 'x', onlyActive: false }) as Run;
    expect(late.active).toBe(false);
    const merged = applyOp(stopped, { op: 'merge', key: `rescheduleRun:${CH}`, entries: { items: stopped.items } }) as Run;
    expect(merged.active).toBe(false);
  });

  describe('each video is checked again right before its page is opened', () => {
    it('a new time that is now too soon fails with the reason, without opening the page', async () => {
      go('/channel/x/videos');
      expect(await C.startRescheduleRun([{ videoId: 'aaaaaaaaaaa', video: 'Mix A', at: Date.UTC(2026, 9, 29, 3, 10) }])).toBe('');
      await vi.waitFor(() => expect(items()[0]![1]).toBe('failed')); // the start's own step
      expect(items()[0]).toEqual(['aaaaaaaaaaa', 'failed', 'Release time must be at least 15 minutes in the future']);
      expect(location.href).toBe('');
    });
    it('a video no longer scheduled fails, without opening the page', async () => {
      await started();
      onChannel = { bbbbbbbbbbb: OLD.bbbbbbbbbbb };
      go('/channel/x/videos');
      await C.reschedStep();
      expect(items()[0]).toEqual(['aaaaaaaaaaa', 'failed', 'No longer scheduled']);
      expect(location.href).toBe('');
    });
    it('a video already at its new time (a Save that landed before a reload) is moved without its page', async () => {
      await started();
      onChannel = { ...OLD, aaaaaaaaaaa: T + 30_000 };
      go('/video/aaaaaaaaaaa/edit');
      await C.reschedStep();
      expect(page).not.toHaveBeenCalled();
      expect(items()[0]).toEqual(['aaaaaaaaaaa', 'moved', 'Already at the new time']);
    });
    it("a channel list that can't be read fails the video, without opening the page", async () => {
      await started();
      setYoutubei(async () => { throw new Error('network'); });
      go('/channel/x/videos');
      await C.reschedStep();
      expect(items()[0]).toEqual(['aaaaaaaaaaa', 'failed', "Couldn't read the current release times, try again"]);
      expect(location.href).toBe('');
    });
  });

  it('resumes after the page load: the stored run goes on with the video whose page this is', async () => {
    useMemoryClaims({ [`rescheduleRun:${CH}`]: { active: true, started: 'x', items: [
      { videoId: 'aaaaaaaaaaa', video: 'Mix A', state: 'moved', msg: '', at: T },
      { videoId: 'bbbbbbbbbbb', video: 'Mix B', state: 'pending', msg: '', at: T + 2 * DAY },
    ] } }, async (op) => void ops.push(op));
    go('/video/bbbbbbbbbbb/edit');
    await C.reschedStep();
    expect(page).toHaveBeenCalledWith(new Date(T + 2 * DAY), expect.any(Function), expect.any(Function));
    expect(items()).toEqual([['aaaaaaaaaaa', 'moved', ''], ['bbbbbbbbbbb', 'moved', '']]);
  });

  it('when the run ends with a video moved, the queue reads the channel again (its free slots go round the new times)', async () => {
    const listScheduled = vi.fn(async () => []);
    Q.setClaims({ listScheduled });
    useMemoryClaims({ [`rescheduleRun:${CH}`]: { active: true, started: 'y', items: [{ videoId: 'aaaaaaaaaaa', video: 'Mix A', state: 'moved', msg: '', at: T }] } }, async (op) => void ops.push(op));
    await C.reschedStep(); // nothing left: the run ends
    expect(run()!.active).toBe(false);
    expect(listScheduled).toHaveBeenCalled();
  });

  it('refuses to start while another copyright job runs', async () => {
    useMemoryClaims({ [`adsRun:${CH}`]: { active: true, started: 'z', items: [{ videoId: 'q', video: 'Q', state: 'pending', msg: '' }] } }, async (op) => void ops.push(op));
    expect(await C.startRescheduleRun(two)).toBe('Another job is still running — wait for it or press Stop first');
    expect(run()).toBe(null);
  });

  // The live test (2026-10-29): a run started while the upload queue had work was stored and would
  // have started by itself, hours later, once the queue emptied. Now it is refused at once.
  describe('a run that cannot go now is refused, never left to start later by itself', () => {
    it('an upload is running (here or in another tab): refused, and no run is stored', async () => {
      Q.setOtherTabRuns(true);
      expect(await C.startRescheduleRun(two)).toBe('An upload is running, try again when it finishes');
      expect(run()).toBe(null);
    });
    // The person's own run (2026-10-29) sat at "Waiting for the upload queue" behind 4 pending
    // items nobody was uploading: only a running upload counts, never items waiting in the list.
    it('videos waiting in the queue with no upload running do not hold the run back', async () => {
      Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem, { id: 'r', status: 'pending' } as Q.QueueItem);
      await started();
      expect(run()!.active).toBe(true);
      go('/video/aaaaaaaaaaa/edit'); // the page the run opened has loaded: its tick takes the step
      C.tick();
      await vi.advanceTimersByTimeAsync(0);
      C.tick();
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(page).toHaveBeenCalled());
      expect(items()[0]).toEqual(['aaaaaaaaaaa', 'moved', '']);
      expect(run()!.active).toBe(true);
      C.stopAll(); // before the tick's own next step opens another page
    });
    it('another Studio tab holds the automation lock: refused, and no run is stored', async () => {
      C.setClaimsLock(noLock);
      expect(await C.startRescheduleRun(two)).toBe("Another Studio tab is busy, try again when it's done");
      expect(run()).toBe(null);
    });
    it('an upload starts mid-run: the run ends instead of waiting', async () => {
      await started();
      Q.setOtherTabRuns(true);
      go('/channel/x/videos');
      await C.reschedStep();
      expect(run()!.active).toBe(false);
      expect(location.href).toBe('');
      expect(ui.log).toHaveBeenCalledWith('An upload is running, try again when it finishes: Moved 0 · Not done 2', 'ok');
    });
    it("the page's tick doesn't hold a run while an upload runs: it ends it", async () => {
      await started();
      Q.setOtherTabRuns(true);
      C.tick();
      expect(run()!.active).toBe(false);
    });
    it('another tab takes the lock mid-run: the run ends instead of waiting', async () => {
      await started();
      C.setClaimsLock(noLock);
      go('/channel/x/videos');
      await C.reschedStep();
      expect(run()!.active).toBe(false);
      expect(location.href).toBe('');
    });
    it('a slow run that keeps making progress is not taken for a leftover: the hour counts from the last finished video', async () => {
      useMemoryClaims({ [`rescheduleRun:${CH}`]: { active: true, started: new Date(Date.now() - 2 * 3600e3).toISOString(), lastAt: new Date(Date.now() - 5 * 60e3).toISOString(), items: [
        { videoId: 'aaaaaaaaaaa', video: 'Mix A', state: 'pending', msg: '', at: T },
      ] } }, async (op) => void ops.push(op));
      go('/video/aaaaaaaaaaa/edit');
      await C.reschedStep();
      expect(page).toHaveBeenCalled();
      expect(run()!.lastAt).toBe(new Date(Date.now()).toISOString()); // a finished video moves it on
    });
    // studio-watcher-1: settleLock gave the lock back between steps while idle items waited in the queue.
    it('videos waiting in the queue do not make the tab give the lock back between steps', async () => {
      const release = vi.fn();
      C.setClaimsLock({ ...lock, release });
      Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem);
      await started();
      go('/channel/x/videos');
      C.claimsTick();
      expect(release).not.toHaveBeenCalled();
      C.stopAll();
    });
    it('a run left active from an earlier session (over an hour old) is ended, not resumed', async () => {
      useMemoryClaims({ [`rescheduleRun:${CH}`]: { active: true, started: new Date(Date.now() - 2 * 3600e3).toISOString(), items: [
        { videoId: 'aaaaaaaaaaa', video: 'Mix A', state: 'pending', msg: '', at: T },
      ] } }, async (op) => void ops.push(op));
      go('/video/aaaaaaaaaaa/edit');
      await C.reschedStep();
      expect(page).not.toHaveBeenCalled();
      expect(run()!.active).toBe(false);
      expect(ui.log).toHaveBeenCalledWith('This reschedule was left from an earlier session — start it again if you still want it: Moved 0 · Not done 1', 'ok');
    });
  });
});
