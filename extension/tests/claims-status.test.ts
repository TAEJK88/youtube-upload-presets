import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import { useMemoryClaims } from '../lib/claims/store';
import { PROTOCOL } from '../lib/messages';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
beforeEach(async () => {
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.stubGlobal('document', { documentElement: { lang: 'en' }, querySelector: () => null }); // getChannel() reads the page
  C.invalidateCounts(); // getCounts() keeps its answer 3 s (COUNTS_TTL)
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
});
afterEach(() => vi.unstubAllGlobals());

describe('computeStatus / claimsState', () => {
  it('idle, never scanned', () => {
    useMemoryClaims();
    expect(C.computeStatus()).toEqual({ icon: '✓', kind: 'idle', title: 'Ready', detail: 'Click "Scan claims" to check this channel' });
    expect(C.claimsState().proto).toBe(PROTOCOL); // the panel takes a state of its own build only
    expect(C.claimsState()).toMatchObject({ channel: CH, ready: true, english: true, busyRun: false, busyScan: false, waiting: 0 });
  });

  it('not ready until Studio has its context', () => {
    useMemoryClaims();
    resetCfg();
    expect(C.claimsState().ready).toBe(false);
  });

  it('a trim run in progress shows its claim, progress and steps', () => {
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, started: '', items: [
      { key: 'v:1', videoId: 'v', video: 'Mix', song: 'S1', state: 'saved', msg: '' },
      { key: 'v:2', videoId: 'v', video: 'Mix', song: 'S2', state: 'pending', msg: '' },
    ] } });
    const s = C.computeStatus();
    expect(s.title).toBe('Trimming claim 2 of 2');
    expect(s.detail).toBe('Mix — S2');
    expect(s.progress).toBe(0.5);
    expect(s.steps).toEqual(['Open video', 'Check claim', 'Take action', 'Trim editor', 'Save', 'Confirm']);
    expect(C.claimsState().busyRun).toBe(true);
  });

  it('counts come from the last scan and the song history', () => {
    useMemoryClaims({ [`claimScan:${CH}`]: { date: new Date().toISOString(), total: 3, rows: [{ videoId: 'a' }, { videoId: 'a' }, { videoId: 'b' }] }, songHistory: { x: {}, y: {} } });
    expect(C.claimsState().counts).toMatchObject({ hasScan: true, claims: 3, claimVideos: 2, songs: 2 });
  });

  it('counts the claimed songs without copying the history (review m4)', () => {
    const songHistory = Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['k' + i, { title: 't' + i, videos: {} }]));
    useMemoryClaims({ songHistory });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect(C.claimsState().counts.songs).toBe(500);
    // nothing as large as the history went through structuredClone
    expect(clone.mock.calls.some(([v]) => v && typeof v === 'object' && Object.keys(v as object).length === 500)).toBe(false);
    clone.mockRestore();
  });

  it('the upload queue holds copyright work back only with waiting or in-flight videos, not failed ones, nor a run in another tab', () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: Date.now() + 3600e3 } });
    const item = (status: Q.QueueItem['status']) => ({ id: status, status }) as Q.QueueItem;
    Q.queue.splice(0, Q.queue.length, item('error'), item('done'));
    expect(C.claimsState().uploadBusy).toBe(false);
    expect(C.computeStatus().detail).toMatch(/^Next scan \+ trim in/);
    Q.queue.push(item('pending'));
    expect(C.claimsState().uploadBusy).toBe(true);
    expect(C.computeStatus().detail).toBe('⏸ Waiting for the upload queue to finish'); // the card says why
    Q.setOtherTabRuns(true); // another tab is uploading them
    expect(C.claimsState().uploadBusy).toBe(false);
    Q.setOtherTabRuns(false);
    Q.queue.splice(0);
  });

  it('Studio in Thai is reported', () => {
    vi.stubGlobal('document', { documentElement: { lang: 'th' }, querySelector: () => null });
    useMemoryClaims();
    expect(C.claimsState().english).toBe(false);
  });

  // 4a review m11: workerHere's first writer is the ported tick, from the worker lease
  it('a tick that throws tells the user once per page (userscript 6363–6371) and still throws for the caller to log', () => {
    useMemoryClaims();
    const toast = vi.fn();
    C.setClaimsUi({ show() {}, log() {}, toast, status() { throw new Error('boom'); } }); // the tick ends in renderStatus()
    expect(() => C.claimsTick()).toThrow('boom');
    expect(() => C.claimsTick()).toThrow('boom');
    expect(toast.mock.calls).toEqual([['⚠ The copyright section stopped: boom — try reloading the page']]);
    C.setClaimsUi(null);
  });

  it("a tab that isn't the channel's worker reports workerHere: false and shows where a run is running", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, started: '', items: [{ key: 'v:1', videoId: 'v', video: 'Mix', song: 'S1', state: 'pending', msg: '' }] } });
    const lock = (mine: boolean) => ({ worker: async () => mine, acquire: async () => false, release: () => {}, holds: async () => false });
    C.setClaimsLock(lock(false)); // another tab is this channel's worker
    await C.initClaimsLock();
    C.claimsTick();
    expect(C.claimsState().workerHere).toBe(false);
    expect(C.computeStatus()).toMatchObject({ stepIdx: -1, stepDetail: '↪ Running in another Studio tab' });
    C.setClaimsLock(lock(true)); // the lease is this tab's
    await C.initClaimsLock();
    useMemoryClaims(); // no run: the tick starts no step
    C.claimsTick();
    expect(C.claimsState().workerHere).toBe(true);
    vi.restoreAllMocks();
  });

  it('claimsStatus() for the FAB never throws', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, items: 'broken' } });
    expect(C.claimsStatus()).toBe(null);
    expect(err).toHaveBeenCalledWith('[ytup] copyright status', expect.any(TypeError));
    err.mockRestore();
  });
});
