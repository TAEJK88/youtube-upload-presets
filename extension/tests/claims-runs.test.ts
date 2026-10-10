// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsOp } from '../lib/claims/ops';
import { load, useMemoryClaims } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import { save as saveState, settings } from '../lib/studio/state';

vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
import * as C from '../lib/claims/claims';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const ops: ClaimsOp[] = [];
const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
const NOT_IN_SCAN = 'The chosen videos are not in the latest scan — scan again and try again';
const noLock = { acquire: async () => false, release: vi.fn(), worker: async () => true, holds: async () => false };
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ops.length = 0;
  Q.queue.splice(0);
  C.setClaimsUi(ui);
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  C.setClaimsLock({ acquire: async () => true, release: vi.fn(), worker: async () => true, holds: async () => false });
  await C.initClaimsLock();
});
afterEach(() => { C.setClaimsUi(null); setYoutubei(null); vi.restoreAllMocks(); });

describe('ads run', () => {
  beforeEach(() => useMemoryClaims({ [`adsScan:${CH}`]: { date: '', total: 2, rows: [{ videoId: 'a', video: 'A' }, { videoId: 'b', video: 'B' }] } }, async (op) => void ops.push(op)));

  it('starts from the stored scan; a video already on is recorded as such', async () => {
    C.setClaimsLock(noLock); // the run's own step waits: adsOne is called here
    C.adsFromPanel(['a']);
    expect(load<{ items: unknown[] }>(`adsRun:${CH}`, null as never).items).toEqual([{ videoId: 'a', video: 'A', state: 'pending', msg: '' }]);
    setYoutubei(async () => ({ videos: [{ videoId: 'a', monetization: { adMonetization: { userSetMonetization: 'X_ON' } } }] }));
    await C.adsOne({ videoId: 'a', video: 'A', state: 'pending', msg: '' });
    expect(ops).toContainEqual(expect.objectContaining({ op: 'merge', key: `adsResults:${CH}`, entries: { a: expect.objectContaining({ state: 'on', msg: 'Already on' }) } }));
    expect(ops).toContainEqual({ op: 'runItem', key: `adsRun:${CH}`, by: 'videoId', id: 'a', state: 'on', msg: 'Already on', onlyActive: false });
  });

  it('a failed upload left in the queue does not hold the ads run back', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal('location', { pathname: '/channel/x/videos', href: '' });
    Q.queue.push({ id: 'q', status: 'error' } as Q.QueueItem);
    C.adsFromPanel(['a']); // starts the run and its first step
    await vi.waitFor(() => expect(location.href).toBe('/video/a/monetization')); // went to the next video's page
    await vi.advanceTimersByTimeAsync(15_000); // the step frees itself if the page didn't change (5389)
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for the upload queue before changing pages', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem);
    C.adsFromPanel(['a']); // starts the run and its first step
    await vi.waitFor(() => expect(C.computeStatus().stepDetail ?? C.adsStage.detail).toContain('Waiting for the upload queue to clear'));
    expect(location.pathname).toBe('/channel/x/videos');
  });

  // Safety I2: the lock is one for all Studio tabs. A run that only waits must not keep the upload
  // queue (or a copyright job on another channel) from starting in another tab.
  it('a run that waits for the upload queue gives the job back, and takes it again when the queue is clear', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    vi.stubGlobal('location', { pathname: '/channel/x/videos', href: '' });
    const acquire = vi.fn(async () => true);
    const release = vi.fn();
    C.setClaimsLock({ worker: async () => true, acquire, release, holds: async () => false });
    await C.initClaimsLock();
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem); // waiting, not started
    C.adsFromPanel(['a']);
    for (let i = 0; i < 40; i++) { C.claimsTick(); await vi.advanceTimersByTimeAsync(800); }
    expect(C.adsStage.detail).toContain('Waiting for the upload queue to clear');
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(location.href).toBe('');
    Q.queue.splice(0);
    for (let i = 0; i < 5; i++) { C.claimsTick(); await vi.advanceTimersByTimeAsync(800); }
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(location.href).toBe('/video/a/monetization');
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a Stop that lands while the ads step waits for the lock: no page change', async () => {
    vi.stubGlobal('location', { pathname: '/channel/x/videos', href: '' });
    let grant!: (v: boolean) => void;
    C.setClaimsLock({ acquire: () => new Promise<boolean>((r) => { grant = r; }), release: vi.fn(), worker: async () => true, holds: async () => false });
    C.adsFromPanel(['a']);
    C.stopAll();
    expect(load<{ active: boolean }>(`adsRun:${CH}`, null as never).active).toBe(false);
    expect(ops).toContainEqual({ op: 'merge', key: `adsRun:${CH}`, entries: { active: false } });
    grant(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(location.href).toBe('');
    vi.unstubAllGlobals();
  });

  it('claims:ads with anything but a list of ids does nothing', () => {
    C.setClaimsLock(noLock);
    for (const bad of ['a', 42, null, [1]]) C.adsFromPanel(bad);
    expect(load(`adsRun:${CH}`, null)).toBe(null);
  });

  it('claims:ads with no chosen video in the stored scan (replaced since, or another channel): says so, no run', () => {
    C.setClaimsLock(noLock);
    ui.log.mockClear();
    C.adsFromPanel(['zz']);
    expect(ui.log.mock.calls).toEqual([[NOT_IN_SCAN, 'warn']]);
    expect(load(`adsRun:${CH}`, null)).toBe(null);
    ui.log.mockClear();
    C.adsFromPanel(['a']); // one that is: no such line
    expect(ui.log).not.toHaveBeenCalledWith(NOT_IN_SCAN, 'warn');
  });
});

describe('Collab run', () => {
  beforeEach(() => useMemoryClaims({ [`collabScan:${CH}`]: { date: '', total: 1, rows: [{ videoId: 'v', video: 'V' }] }, [`collabLinks:${CH}`]: { '@me2': 'https://www.youtube.com/x' } }, async (op) => void ops.push(op)));

  // chainAcceptInvites (5576–5592): the channels this browser knows are in the state store
  // (its in-memory store in tests); @me2 is ours, on another channel id.
  const finish = () => {
    C.setClaimsLock(noLock); // the run's own step waits: the result is set here
    C.collabFromPanel({ videoIds: ['v'], handles: ['@me2'] });
    C.setCollabResult({ videoId: 'v', video: 'V', state: 'pending', msg: '' }, 'done', 'ok');
    C.stopCollabRun();
  };
  beforeEach(() => saveState('channels', [{ id: 'UCother', name: 'Me 2', avatar: '', handle: '@me2' }]));

  it('ends by switching to your own invited channel to accept it', () => {
    const sw = vi.fn();
    C.setChannelSwitcher(sw);
    settings.autoAcceptInvite = true;
    finish();
    expect(sw).toHaveBeenCalledWith({ handle: '@me2', name: 'Me 2' }, 'https://www.youtube.com/x');
  });

  it('not with auto-accept off, nor while the upload queue has work', () => {
    const sw = vi.fn();
    C.setChannelSwitcher(sw);
    settings.autoAcceptInvite = false;
    finish();
    settings.autoAcceptInvite = true;
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem); // uploadBusy()
    finish();
    expect(sw).not.toHaveBeenCalled();
  });

  // Safety m4: uploadBusy() leaves a queue running in another tab to that tab; the switch is for
  // every Studio tab, so it does not happen under that upload either.
  it('nor while another Studio tab is uploading', () => {
    const sw = vi.fn();
    C.setChannelSwitcher(sw);
    settings.autoAcceptInvite = true;
    ui.log.mockClear();
    Q.setOtherTabRuns(true);
    finish();
    Q.setOtherTabRuns(false);
    expect(sw).not.toHaveBeenCalled();
    expect(ui.log.mock.calls).toContainEqual(['Upload queue is running — not switching channels to accept the invite yet', 'warn']);
  });

  it('a refused lock: the Collab step waits and says why', async () => {
    C.setClaimsLock(noLock);
    C.collabFromPanel({ videoIds: ['v'], handles: ['@me2'] });
    await vi.waitFor(() => expect(C.collabStage.detail).toBe('⏸ Waiting for another Studio tab to finish (page change needed)'));
  });

  it('claims:collab: only the chosen videos; no handles, a non-list or a handle that is not one: no run', () => {
    C.setClaimsLock(noLock);
    useMemoryClaims({ [`collabScan:${CH}`]: { date: '', total: 2, rows: [{ videoId: 'v', video: 'V' }, { videoId: 'w', video: 'W' }] } }, async (op) => void ops.push(op));
    C.collabFromPanel({ videoIds: ['w'], handles: [] });
    C.collabFromPanel({ videoIds: 'w', handles: ['@a'] });
    C.collabFromPanel({ videoIds: ['w'], handles: '@a' });
    C.collabFromPanel(null);
    // the panel sends parseHandles() output: one @name each, no spaces or commas, a sane length
    for (const bad of ['a', '@a b', '@a,@b', '@', '', '@' + 'x'.repeat(100)]) C.collabFromPanel({ videoIds: ['w'], handles: ['@ok', bad] });
    expect(load(`collabRun:${CH}`, null)).toBe(null);
    ui.log.mockClear();
    C.collabFromPanel({ videoIds: ['zz'], handles: ['@a'] }); // not in the stored scan: said, no run
    expect(ui.log.mock.calls).toEqual([[NOT_IN_SCAN, 'warn']]);
    expect(load(`collabRun:${CH}`, null)).toBe(null);
    C.collabFromPanel({ videoIds: ['w'], handles: ['@a', '@ไทย.b_c-d'] });
    expect(load<{ items: { videoId: string }[]; handles: string[] }>(`collabRun:${CH}`, null as never)).toMatchObject({ handles: ['@a', '@ไทย.b_c-d'], items: [{ videoId: 'w' }] });
    expect(load<{ items: unknown[] }>(`collabRun:${CH}`, null as never).items).toHaveLength(1);
    C.stopAll();
    expect(ops).toContainEqual({ op: 'merge', key: `collabRun:${CH}`, entries: { active: false } });
    expect(load<{ active: boolean }>(`collabRun:${CH}`, null as never).active).toBe(false);
  });
});

// The follow-up trims of a video with several claims (5742–5820): one claim at a time, the next
// one only after YouTube has finished the last. This decides when an irreversible trim starts.
describe('follow-ups', () => {
  const NOW = Date.UTC(2026, 9, 10);
  const lines: string[] = [];
  const cl = (claimId: string, title: string, options = ['NON_TAKEDOWN_CLAIM_OPTION_TRIM']) => ({ claimId, status: 'RECEIVED_CLAIM_STATUS_ACTIVE', asset: { metadata: { title } }, nontakedownClaimActions: { options } });
  const fu = (over = {}) => ({ v1: { video: 'Mix', pending: [{ key: 'v1:c2', claimId: 'c2', song: 'S2', tries: 0 }, { key: 'v1:c3', claimId: 'c3', song: 'S3', tries: 0 }], lastClaimId: 'c1', lastSavedAt: NOW - 3600e3, ...over } });
  const item = (c: string) => ({ key: 'v1:' + c, videoId: 'v1', claimId: c, song: 'S', video: 'Mix', state: 'pending', msg: '' });
  const stored = () => load<Record<string, { pending: { claimId: string; tries: number }[]; lastClaimId: string | null; lastSavedAt: number }>>(`followUp:${CH}`, {});
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    lines.length = 0;
    C.setClaimsUi({ show() {}, status() {}, toast() {}, log: (m, t) => void lines.push(`${t}:${m}`) });
    C.setClaimsLock(noLock); // a run that starts here takes no step
  });
  afterEach(() => vi.useRealTimers());

  it('the previous trim is still processing (its claim is still active, under 48 h): waits', async () => {
    useMemoryClaims({ [`followUp:${CH}`]: fu() }, async (op) => void ops.push(op));
    setYoutubei(async () => ({ receivedClaims: [cl('c1', 'S1'), cl('c2', 'S2'), cl('c3', 'S3')] }));
    await C.fuCheck();
    expect(load(`trimRun:${CH}`, null)).toBe(null);
    expect(lines.some((l) => l.includes('previous trim still processing (1.0 h) — 2 claims waiting'))).toBe(true);
    expect(C.fuNext).toBe(NOW + 10 * 60e3); // the next check, followUpMinutes on
  });

  it('the previous claim is gone: the next claim with the Trim option starts a follow-up run; a released one is dropped as gone', async () => {
    useMemoryClaims({ [`followUp:${CH}`]: fu() }, async (op) => void ops.push(op));
    setYoutubei(async () => ({ receivedClaims: [cl('c3', 'S3')] })); // c1 processed, c2 released
    await C.fuCheck();
    const run = load<{ mode: string; items: { key: string; state: string }[] }>(`trimRun:${CH}`, null as never);
    expect(run.mode).toBe('auto');
    expect(run.items).toMatchObject([{ key: 'v1:c3', state: 'pending' }]); // pending, not "later": this is the follow-up
    expect(ops).toContainEqual(expect.objectContaining({ op: 'merge', key: `trimResults:${CH}`, entries: { 'v1:c2': expect.objectContaining({ state: 'gone', msg: 'Released' }) } }));
    expect(stored().v1!.pending.map((p) => p.claimId)).toEqual(['c3']);
  });

  it('no Trim option yet: waits; after 48 h it goes on though the last claim is still there', async () => {
    useMemoryClaims({ [`followUp:${CH}`]: fu() }, async (op) => void ops.push(op));
    setYoutubei(async () => ({ receivedClaims: [cl('c2', 'S2', []), cl('c3', 'S3', [])] }));
    await C.fuCheck();
    expect(load(`trimRun:${CH}`, null)).toBe(null);
    expect(lines.some((l) => l.includes('no Trim option yet'))).toBe(true);
    useMemoryClaims({ [`followUp:${CH}`]: fu({ lastSavedAt: NOW - 49 * 3600e3 }) }, async (op) => void ops.push(op));
    setYoutubei(async () => ({ receivedClaims: [cl('c1', 'S1'), cl('c2', 'S2', []), cl('c3', 'S3')] }));
    await C.fuCheck();
    expect(load<{ items: { key: string }[] }>(`trimRun:${CH}`, null as never).items.map((i) => i.key)).toEqual(['v1:c3']); // the one that can be trimmed
  });

  it('not during a trim run; a video that cannot be read is left for the next check', async () => {
    useMemoryClaims({ [`followUp:${CH}`]: fu(), [`trimRun:${CH}`]: { active: true, started: 'x', items: [] } }, async (op) => void ops.push(op));
    const api = vi.fn(async (): Promise<unknown> => ({ receivedClaims: [] }));
    setYoutubei(api);
    await C.fuCheck();
    expect(api).not.toHaveBeenCalled();
    useMemoryClaims({ [`followUp:${CH}`]: fu() }, async (op) => void ops.push(op));
    api.mockRejectedValue(new Error('timed out'));
    await C.fuCheck();
    expect(stored().v1!.pending).toHaveLength(2);
    expect(lines.some((l) => l === 'warn:Failed to check video Mix: timed out')).toBe(true);
  });

  it('a queued claim is added once, and found by video and claim', () => {
    useMemoryClaims({}, async (op) => void ops.push(op));
    C.fuAdd(item('c2'));
    C.fuAdd(item('c2'));
    C.fuAdd(item('c3'));
    expect(stored().v1).toMatchObject({ video: 'Mix', lastClaimId: null, lastSavedAt: 0 });
    expect(stored().v1!.pending.map((p) => p.claimId)).toEqual(['c2', 'c3']);
    expect([C.fuHas('v1', 'c2'), C.fuHas('v1', 'zz'), C.fuHas('v9', 'c2')]).toEqual([true, false, false]);
    expect(C.fuCount()).toBe(2);
  });

  it('results: a saved trim is what the next check waits for; three failures drop a claim; skipped and gone drop it; the last one ends the wait', () => {
    useMemoryClaims({ [`followUp:${CH}`]: fu() }, async (op) => void ops.push(op));
    C.setResult(item('c2'), 'later'); // still queued: nothing changes
    expect(stored().v1!.pending).toHaveLength(2);
    C.setResult(item('c2'), 'failed', 'x');
    C.setResult(item('c2'), 'failed', 'x');
    expect(stored().v1!.pending[0]).toMatchObject({ claimId: 'c2', tries: 2 });
    C.setResult(item('c2'), 'failed', 'x');
    expect(stored().v1!.pending.map((p) => p.claimId)).toEqual(['c3']);
    expect(stored().v1!.lastClaimId).toBe('c1'); // a failure is not a trim
    useMemoryClaims({ [`followUp:${CH}`]: fu({ lastSavedAt: 0 }) }, async (op) => void ops.push(op));
    C.setResult(item('c2'), 'saved', '0:10–0:20');
    expect(stored().v1).toMatchObject({ lastClaimId: 'c2', lastSavedAt: NOW });
    expect(stored().v1!.pending.map((p) => p.claimId)).toEqual(['c3']);
    expect(ops).toContainEqual({ op: 'songs', songs: { fn: 'trimmed', song: 'S', videoId: 'v1' } });
    C.setResult(item('c3'), 'skipped');
    expect(stored()).toEqual({}); // nothing left for the video
    useMemoryClaims({ [`followUp:${CH}`]: fu() }, async (op) => void ops.push(op));
    C.setResult(item('c3'), 'gone');
    expect(stored().v1!.pending.map((p) => p.claimId)).toEqual(['c2']);
  });
});
