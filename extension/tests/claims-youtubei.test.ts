import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listScheduled } from '../lib/claims/claims';
import { useMemoryClaims } from '../lib/claims/store';
import { loadClaimsData, wireClaims } from '../lib/claims/wiring';
import type { QueueState } from '../lib/messages';
import { setYoutubei, yti } from '../lib/claims/youtubei';
import { NO_SAPISID, YTI_PATHS } from '../lib/main-ops';
import { youtubei } from '../lib/main-youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';
import { queueView } from '../lib/studio/queue-view';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

const NOW = Date.UTC(2026, 9, 9, 12);
beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubGlobal('location', { pathname: '/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos' });
  useMemoryClaims();
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: 'UCaaaaaaaaaaaaaaaaaaaaaa', INNERTUBE_CONTEXT: { client: {} } }));
});
afterEach(() => {
  setYoutubei(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('youtubei in the MAIN world', () => {
  it('answers only the copyright endpoints', async () => {
    await expect(youtubei('account/delete', {})).rejects.toThrow('youtubei: account/delete is not allowed');
    expect(YTI_PATHS).toContain('creator/list_creator_received_claims');
  });

  it('the allow-list is exact and the body a plain object; nothing is fetched otherwise', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const path of ['creator/list_creator_videos/../../account/delete', 'creator/list_creator_videos?x=1',
      'x/creator/list_creator_videos', 'creator/list_creator_video', 42 as unknown as string]) {
      await expect(youtubei(path, {})).rejects.toThrow('is not allowed');
    }
    for (const body of [[], null, 'x', 1, new Date(), new Map()]) {
      await expect(youtubei('creator/list_creator_videos', body as never)).rejects.toThrow('youtubei: the body must be an object');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a missing SAPISID cookie becomes a sentence in the tab', async () => {
    setYoutubei(async () => { throw new Error(NO_SAPISID); });
    await expect(yti('creator/list_creator_videos', {})).rejects.toThrow('Not signed in (SAPISID cookie not found)');
  });

  it('a call before the MAIN world is wired says Studio is still loading', async () => {
    await expect(yti('creator/list_creator_videos', {})).rejects.toThrow("Studio hasn't finished loading — try again in a few seconds");
  });
});

describe('listScheduled (the queue avoids these slots)', () => {
  it("lists the channel's future scheduled videos, earliest first", async () => {
    const call = vi.fn(async (_path: string, body: Record<string, unknown>) => (body.pageToken ? { videos: [] } : {
      videos: [
        { videoId: 'v1', title: 'Later', scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW + 7200e3) / 1000), status: 'SCHEDULED_PUBLISHING_STATUS_SCHEDULED' }] } },
        { videoId: 'v2', title: 'Sooner', scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW + 3600e3) / 1000), status: 'X_SCHEDULED' }] } },
        { videoId: 'v3', title: 'Past', scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW - 1e3) / 1000), status: 'X_SCHEDULED' }] } },
        { videoId: 'v4', title: 'Live' },
      ],
      nextPageToken: 't2',
    }));
    setYoutubei(call);
    expect(await listScheduled()).toEqual([
      { videoId: 'v2', title: 'Sooner', at: NOW + 3600e3 },
      { videoId: 'v1', title: 'Later', at: NOW + 7200e3 },
    ]);
    expect(call.mock.calls[0]![1]).toMatchObject({ filter: { and: { operands: [{ channelIdIs: { value: 'UCaaaaaaaaaaaaaaaaaaaaaa' } }, {}] } }, pageSize: 50 });
  });

  it('nothing until Studio has its context', async () => {
    resetCfg();
    expect(await listScheduled()).toBe(null);
  });
});

describe('wireClaims (deferred item 9: the schedule avoids the channel\'s scheduled videos)', () => {
  it("gives the queue runner the copyright module's listScheduled, over Studio's API; undone on teardown", async () => {
    const call = vi.fn(async () => ({ videos: [{ videoId: 'v', title: 'T',
      scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW + 3600e3) / 1000), status: 'X_SCHEDULED' }] } }] }));
    const off = wireClaims(call);
    expect(Q.Claims?.listScheduled).toBe(listScheduled);
    expect(await Q.Claims!.listScheduled!()).toEqual([{ videoId: 'v', title: 'T', at: NOW + 3600e3 }]);
    expect(call).toHaveBeenCalledWith('creator/list_creator_videos', expect.any(Object));
    off();
    expect(Q.Claims).toBe(null);
    await expect(yti('creator/list_creator_videos', {})).rejects.toThrow("Studio hasn't finished loading");
  });
});

describe("the queue's schedule and the channel's scheduled videos (deferred item 9, end to end)", () => {
  const ui = {
    item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast() {}, openDrawer() {}, notifyDone() {},
    setTitleMark() {}, confirmStart: async () => false,
  } satisfies PageUi;
  const item = (id: string): Q.QueueItem => ({
    id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 1, title: 't',
    titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0,
  });
  const state = { running: false, stopping: false, prog: null, rev: 1 } as unknown as QueueState;
  const scheduled = (at: number) => ({ videos: [{ videoId: 'x', title: 'X', scheduledPublishingDetails:
    { scheduledPublishings: [{ scheduledTimeSeconds: String(at / 1000), status: 'S_SCHEDULED' }] } }] });
  // Each test runs on its own channel: the runner caches the scheduled list per channel.
  const onChannel = (id: string) => vi.stubGlobal('location', { pathname: `/channel/${id}/videos` });
  let start = 0;
  let off = () => {};
  beforeEach(() => {
    vi.stubGlobal('document', makeDocument());
    setPageUi(ui);
    Q.queue.splice(0);
    start = new Date(Date.now() + 86400e3).setMinutes(0, 0, 0);
    settings.schedule = { on: true, start: Q.toLocalInput(start), every: 1, unit: 'day' };
    Q.queue.push(item('a'), item('b'));
  });
  afterEach(() => {
    off();
    Q.queue.splice(0);
    settings.schedule = { on: false, start: '', every: 1, unit: 'day' };
  });

  it('a slot the channel already uses is skipped (wireClaims → refreshChanSched → queueView)', async () => {
    onChannel('UCe2e0000000000000000001');
    let at = start;
    off = wireClaims(async () => scheduled(at));
    await Q.refreshChanSched(true);
    const v = queueView(state);
    expect(v.schedule).toMatchObject({ skipped: 1, taken: [start] });
    expect(v.items.map((i) => i.at)).toEqual([start + 86400e3, start + 2 * 86400e3]);
    // The start reads the list again, inside the 5-minute cache too.
    at = start + 86400e3;
    expect(await Q.startSummary()).toMatchObject({ times: [start, start + 2 * 86400e3] });
    expect(queueView(state).schedule).toMatchObject({ skipped: 1, taken: [start + 86400e3] });
  });

  it('youtubei timing out leaves no taken slots, and the start summary still comes', async () => {
    onChannel('UCe2e0000000000000000002');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    off = wireClaims(async () => { throw new Error('youtubei: timed out after 30000 ms'); });
    const s = await Q.startSummary();
    expect(s).toMatchObject({ pendingN: 2, times: [start, start + 86400e3] });
    expect(queueView(state).schedule).toMatchObject({ skipped: 0, taken: [] });
    expect(warn).toHaveBeenCalledWith('[YT Presets] scheduled list', expect.any(Error));
  });

  it('a silent MAIN world holds the start summary ~10 s, not the 30 s call; a late answer still lands', async () => {
    onChannel('UCe2e0000000000000000003');
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let answer: (v: unknown) => void = () => {};
    off = wireClaims(() => new Promise((r) => { answer = r; }));
    let done = false;
    const p = Q.startSummary().then((s) => { done = true; return s; });
    await vi.advanceTimersByTimeAsync(Q.START_SCHED_WAIT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ pendingN: 2, times: [start, start + 86400e3] }); // the slots known so far
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('scheduled list still loading'));
    answer(scheduled(start));
    await vi.advanceTimersByTimeAsync(0);
    expect(queueView(state).schedule).toMatchObject({ skipped: 1, taken: [start] });
  });
});

describe('the Studio content script', () => {
  const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  const studio = src('entrypoints/studio.content.ts');

  it("wires the copyright module to Studio's API on its own 30 s client, undone on teardown", () => {
    expect(studio).toContain("const yt = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH, 30_000);");
    expect(studio).toContain("stop.add(() => yt.dispose('extension reloaded'));");
    expect(studio).toContain("stop.add(wireClaims((path, body) => yt('youtubei', path, body)));");
  });

  it('goes on when the copyright data fails to load (the upload queue still starts)', async () => {
    expect(studio).toMatch(/\n {4}await loadClaimsData\(\);\n/);
    expect(studio).not.toContain('await initClaimsStore(');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('storage read failed');
    expect(await loadClaimsData(async () => { throw boom; })).toBe(false);
    expect(err).toHaveBeenCalledWith('[ytup] copyright data is off:', boom);
    expect(await loadClaimsData(async () => {})).toBe(true);
  });
});
