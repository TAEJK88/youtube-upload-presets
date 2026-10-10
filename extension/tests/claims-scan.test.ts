import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import type { ClaimsOp } from '../lib/claims/ops';
import { disposeClaimsStore, load, useMemoryClaims } from '../lib/claims/store';
import type { ClaimScan } from '../lib/claims/types';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const ops: ClaimsOp[] = [];
const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
const videos = [
  { videoId: 'v1', title: 'Mix 1', privacy: 'VIDEO_PRIVACY_PUBLIC', lengthSeconds: '600', copyrightSummary: { activeThirdPartyClaimsCount: '1' },
    allRestrictions: { summary: { impacts: ['VIDEO_RESTRICTION_IMPACT_MONETIZATION_DISABLED'] } } },
  { videoId: 'v2', title: 'Clean', privacy: 'VIDEO_PRIVACY_PRIVATE', lengthSeconds: '300' },
];
const claims = () => ({
  contentOwners: [{ contentOwnerId: 'o1', displayName: 'Label Co' }],
  receivedClaims: [{ claimId: 'c1', contentOwnerIds: ['o1'], type: 'CLAIM_TYPE_AUDIO', status: 'RECEIVED_CLAIM_STATUS_ACTIVE',
    asset: { metadata: { soundRecording: { title: 'Song', artists: ['Mine Artist'] } } },
    nontakedownClaimActions: { options: ['NON_TAKEDOWN_CLAIM_OPTION_TRIM'] } }],
});
let api: Record<string, (body: any) => unknown>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.stubGlobal('document', { documentElement: { lang: 'en' }, querySelector: () => null }); // channelName() reads the page
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ops.length = 0;
  ui.show.mockClear();
  ui.log.mockClear();
  api = {
    'creator/list_creator_videos': () => ({ videos }),
    'creator/list_creator_received_claims': () => claims(),
    'copyright/get_creator_received_claim_matches': () => ({ matches: { claimMatches: [{ videoSegment: { startMillis: '60000', endMillis: '90000' } }] } }),
  };
  useMemoryClaims({ cfg: { ownNames: 'mine artist' } }, async (op) => void ops.push(op));
  C.setClaimsUi(ui);
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: { client: {} } }));
  setYoutubei(async (path, body) => api[path]!(body));
});
afterEach(() => {
  C.setClaimsUi(null);
  setYoutubei(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const run = async <T>(p: Promise<T>) => { await vi.runAllTimersAsync(); return p; };
const lastLog = () => ui.log.mock.calls.at(-1);

describe('scanClaims', () => {
  it('stores the claimed videos as rows, records the songs, and opens the list', async () => {
    const rows = await run(C.scanClaims());
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ videoId: 'v1', song: 'Song', artists: 'Mine Artist', claimant: 'Label Co', segments: [[60, 90]],
      claimedSec: 30, canTrim: true, own: true, hasImpact: true, impact: 'disabled', privacy: 'public' });
    const set = ops.find((o) => o.op === 'set' && o.key === `claimScan:${CH}`) as Extract<ClaimsOp, { op: 'set' }>;
    expect(set.value).toMatchObject({ total: 2, channel: CH });
    expect(ops.some((o) => o.op === 'songs')).toBe(true);
    expect(ui.show).toHaveBeenCalledWith('claims');
    expect(C.scanning).toBe(false);
  });

  it('reads every page: the next request carries the page token, and the total is the sum', async () => {
    const bodies: any[] = [];
    api['creator/list_creator_videos'] = (body) => {
      bodies.push(body);
      return body.pageToken ? { videos: [{ videoId: 'v3', title: 'Third' }] } : { videos, nextPageToken: 'page-2' };
    };
    expect(await run(C.scanClaims({ show: false }))).toHaveLength(1);
    expect(bodies.map((b) => b.pageToken)).toEqual([undefined, 'page-2']);
    const set = ops.find((o) => o.op === 'set') as Extract<ClaimsOp, { op: 'set' }>;
    expect(set.value).toMatchObject({ total: 3 });
  });

  it('a null where a field may be missing reads as missing, as in the userscript', async () => {
    api['creator/list_creator_videos'] = () => ({ nextPageToken: null, videos: [videos[0],
      { videoId: 'v2', title: null, privacy: null, copyrightSummary: null, allRestrictions: null, monetization: null, scheduledPublishingDetails: null }] });
    api['creator/list_creator_received_claims'] = () => ({ ...claims(), contentOwners: null,
      receivedClaims: [{ ...claims().receivedClaims[0], matchDetails: null, nontakedownClaimActions: null }] });
    api['copyright/get_creator_received_claim_matches'] = () => ({ matches: null });
    const rows = await run(C.scanClaims({ show: false }));
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ videoId: 'v1', claimant: 'o1', segments: [], canTrim: false });
    expect(ui.log.mock.calls.some(([m]) => /Unexpected answer/.test(m))).toBe(false);
    const set = ops.find((o) => o.op === 'set') as Extract<ClaimsOp, { op: 'set' }>;
    expect(set.value).toMatchObject({ total: 2 });
  });

  it('before Studio has its context: says so, changes nothing', async () => {
    resetCfg();
    expect(await C.scanClaims()).toBe(null);
    expect(ui.log).toHaveBeenCalledWith("Studio hasn't finished loading — try again in a few seconds", 'warn');
    expect(ops).toEqual([]);
  });

  it('the MAIN world not answering ends the scan as an error, and scanning is reset', async () => {
    setYoutubei(async () => { throw new Error('youtubei: timed out after 30000 ms'); });
    expect(await run(C.scanClaims())).toBe(null);
    expect(ui.log).toHaveBeenLastCalledWith('Scan failed: youtubei: timed out after 30000 ms', 'err');
    expect(C.scanning).toBe(false);
    expect(ops).toEqual([]);
  });

  it('extension reloaded mid-scan: the orphaned writes go nowhere quietly', async () => {
    const p = C.scanClaims();
    disposeClaimsStore(); // the content script's teardown
    await expect(run(p)).resolves.toBeTruthy();
  });

  it('takes no lock: it runs while another tab uploads and while this tab has videos waiting', async () => {
    Q.setOtherTabRuns(true);
    Q.queue.push({ id: 'p', status: 'pending' } as Q.QueueItem);
    try {
      expect(await run(C.scanClaims({ show: false }))).toHaveLength(1);
      expect(ops.map((o) => o.op)).toEqual(['set', 'songs']);
    } finally {
      Q.setOtherTabRuns(false);
      Q.queue.splice(0);
    }
  });

  // Final review m2: the 30 s limit and the answer check can fail every detail call. The scan is
  // stored as the userscript stored it (a video whose claims can't be read is skipped, 4785), and
  // the last line and the status card say it is incomplete.
  it('videos whose claim details could not be read: stored as before, and the scan says it is incomplete', async () => {
    api['creator/list_creator_received_claims'] = () => { throw new Error('youtubei: timed out after 30000 ms'); };
    const scan = C.scanClaims({ show: false });
    await vi.advanceTimersByTimeAsync(3000); // not run(): the card's 12 s must not be over yet
    expect(await scan).toEqual([]);
    const set = ops.find((o) => o.op === 'set') as Extract<ClaimsOp, { op: 'set' }>;
    expect(set.value).toMatchObject({ total: 2, rows: [] });
    const msg = "Couldn't read the claim details of 1 of 1 videos — this scan is incomplete";
    expect(lastLog()).toEqual([msg, 'err']);
    expect(C.computeStatus()).toMatchObject({ kind: 'err', title: 'Needs attention', detail: msg }); // not the green "Scan complete"
    // counted per scan
    api['creator/list_creator_received_claims'] = () => claims();
    expect(await run(C.scanClaims({ show: false }))).toHaveLength(1);
    expect(lastLog()![0]).toMatch(/^Scan complete ✓/);
  });

  it('a write that timed out may still land: the scan is done, and the copy keeps what it wrote', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    useMemoryClaims({}, () => new Promise<void>(() => {})); // the background never answers
    const rows = await run(C.scanClaims({ show: false }));
    expect(rows).toHaveLength(1);
    expect(ui.log.mock.calls.some(([m]) => /^Scan failed/.test(m))).toBe(false);
    expect(ui.log.mock.calls.some(([m]) => /^Scan complete ✓/.test(m))).toBe(true);
    expect(err).toHaveBeenCalledWith(`[ytup] write failed for claimScan:${CH}`, expect.objectContaining({ message: expect.stringMatching(/may still be applied/) }));
    expect(load<ClaimScan | null>(`claimScan:${CH}`, null)?.rows).toHaveLength(1);
  });
});

// Studio's answers come through the MAIN world, where any page script can answer first.
describe('scanClaims with forged answers', () => {
  const failsWith = async (re: RegExp) => {
    expect(await run(C.scanClaims())).toBe(null);
    expect(lastLog()![0]).toMatch(re);
    expect(lastLog()![1]).toBe('err');
    expect(ops).toEqual([]);
    expect(C.scanning).toBe(false);
  };

  it('a video list that is not a list, or not an object at all, ends the scan and stores nothing', async () => {
    for (const answer of [{ videos: { length: 1, 0: videos[0] } }, null, 'x', [videos], new Date()]) {
      api['creator/list_creator_videos'] = () => answer;
      await failsWith(/^Scan failed: Unexpected answer from creator\/list_creator_videos/);
    }
  });

  it('video ids that would not make safe keys end the scan', async () => {
    for (const videoId of ['__proto__', 'constructor', 'toString', '../x', 'a b', '', 7, 'x'.repeat(65)]) {
      api['creator/list_creator_videos'] = () => ({ videos: [{ ...videos[0], videoId }] });
      await failsWith(/^Scan failed: Unexpected answer from creator\/list_creator_videos \(videos\[0\]\.videoId\)$/);
    }
  });

  it('a title that is not text, or text past its bound, ends the scan', async () => {
    for (const title of [{ toString: 'x' }, ['a'], 5, 'x'.repeat(10_001)]) {
      api['creator/list_creator_videos'] = () => ({ videos: [{ ...videos[0], title }] });
      await failsWith(/^Scan failed: Unexpected answer from creator\/list_creator_videos/);
    }
  });

  it('too many videos in one page, or a page token that is not text, end the scan', async () => {
    api['creator/list_creator_videos'] = () => ({ videos: Array.from({ length: 1001 }, (_, i) => ({ videoId: 'v' + i })) });
    await failsWith(/^Scan failed: Unexpected answer from creator\/list_creator_videos \(videos\)$/);
    api['creator/list_creator_videos'] = () => ({ videos, nextPageToken: { x: 1 } });
    await failsWith(/^Scan failed: Unexpected answer from creator\/list_creator_videos \(nextPageToken\)$/);
  });

  it('a forged claim list skips that video: no row with a bad claim id or owner is stored', async () => {
    for (const forged of [
      { ...claims(), contentOwners: [{ contentOwnerId: '__proto__', displayName: 'x' }] },
      { ...claims(), receivedClaims: [{ ...claims().receivedClaims[0], claimId: '__proto__' }] },
      { ...claims(), receivedClaims: [{ ...claims().receivedClaims[0], claimId: { id: 1 } }] },
      { ...claims(), receivedClaims: [{ ...claims().receivedClaims[0], claimId: 'c'.repeat(201) }] },
      { ...claims(), contentOwners: [{ contentOwnerId: 'o'.repeat(201) }] },
      { ...claims(), receivedClaims: { 0: claims().receivedClaims[0] } },
    ]) {
      ops.length = 0;
      api['creator/list_creator_received_claims'] = () => forged;
      expect(await run(C.scanClaims({ show: false }))).toEqual([]);
      expect(ui.log.mock.calls.some(([m, t]) => /^Mix 1: Unexpected answer from creator\/list_creator_received_claims/.test(m) && t === 'err')).toBe(true);
      const set = ops.find((o) => o.op === 'set') as Extract<ClaimsOp, { op: 'set' }>;
      expect((set.value as ClaimScan).rows).toEqual([]);
    }
  });

  // Final review m9: owner ids are only checked to be strings; the names were looked up in a plain {}.
  it('an owner id naming a built-in is shown as the id, like any owner without a name', async () => {
    api['creator/list_creator_received_claims'] = () => ({ ...claims(), contentOwners: [],
      receivedClaims: [{ ...claims().receivedClaims[0], contentOwnerIds: ['constructor', 'toString', 'o9'] }] });
    const rows = await run(C.scanClaims({ show: false }));
    expect(rows![0]!.claimant).toBe('constructor, toString, o9');
  });

  it("a forged CHANNEL_ID isn't used for the keys: the channel comes from the address", async () => {
    for (const id of ['__proto__', '../x', 'UCshort', { x: 1 }]) {
      resetCfg();
      await refreshCfg(async () => ({ CHANNEL_ID: id, INNERTUBE_CONTEXT: { client: {} } }));
      expect(C.currentChannel()).toBe(CH);
    }
  });
});

describe('scanAds', () => {
  it('lists the videos whose ads are off in settings, and marks the ineligible ones', async () => {
    api['creator/list_creator_videos'] = () => ({ videos: [
      { videoId: 'a', title: 'A', monetization: { adMonetization: { userSetMonetization: 'X_OFF', effectiveStatus: 'X_INELIGIBLE' } } },
      { videoId: 'b', title: 'B', monetization: { adMonetization: { userSetMonetization: 'X_OFF', effectiveStatus: 'X_OFF' } } },
      { videoId: 'c', title: 'C', monetization: { adMonetization: { userSetMonetization: 'X_ON' } } },
    ] });
    const rows = await run(C.scanAds({ show: false }));
    expect(rows!.map((r) => [r.videoId, r.ineligible])).toEqual([['a', true], ['b', false]]);
    expect(ui.show).not.toHaveBeenCalled();
  });
});

describe('scanCollab', () => {
  it('stores the video list and opens it', async () => {
    await run(C.scanCollab());
    const set = ops.find((o) => o.op === 'set' && o.key === `collabScan:${CH}`) as Extract<ClaimsOp, { op: 'set' }>;
    expect(set.value).toMatchObject({ total: 2, rows: [{ videoId: 'v1', video: 'Mix 1', privacy: 'public', length: 600 }, { videoId: 'v2' }] });
    expect(ui.show).toHaveBeenCalledWith('collab');
  });
});
