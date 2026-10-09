import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listScheduled } from '../lib/claims/claims';
import { useMemoryClaims } from '../lib/claims/store';
import { wireClaims } from '../lib/claims/wiring';
import { setYoutubei, yti } from '../lib/claims/youtubei';
import { NO_SAPISID, YTI_PATHS } from '../lib/main-ops';
import { youtubei } from '../lib/main-youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import * as Q from '../lib/studio/queue-runner';

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
