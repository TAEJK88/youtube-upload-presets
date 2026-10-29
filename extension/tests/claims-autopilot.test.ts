// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsOp } from '../lib/claims/ops';
import { load, useMemoryClaims } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';

vi.mock('../lib/studio/automation', async (orig) => ({ ...(await orig<typeof import('../lib/studio/automation')>()), sleep: async () => {} }));
import * as C from '../lib/claims/claims';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const NOW = Date.UTC(2026, 9, 9);
const r = (id: string, extra = {}) => ({ videoId: 'v' + id, claimId: 'c' + id, canTrim: true, own: false, hasImpact: true, length: 1000, claimedSec: 100, publishAt: 0, ...extra });
const ops: ClaimsOp[] = [];
beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ops.length = 0;
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  // The lock is refused here: a step that got it would change pages and stay busy for 15 s (5955),
  // into the next test. These tests are about the cycle; the steps are claims-trim's.
  C.setClaimsLock({ worker: async () => true, acquire: async () => false, release: vi.fn(), holds: async () => false });
  await C.initClaimsLock();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setYoutubei(null); vi.restoreAllMocks(); });

describe('apPick (5825–5844)', () => {
  it('skips own music, no-impact, too long, done, already queued; scheduled first; at most N', () => {
    useMemoryClaims({
      cfg: { apMaxPct: '25', apMaxPerCycle: '3' },
      [`trimResults:${CH}`]: { 'v5:c5': { state: 'saved' } },
      [`followUp:${CH}`]: { v6: { video: '', pending: [{ claimId: 'c6', key: 'v6:c6', song: '', tries: 0 }], lastClaimId: null, lastSavedAt: 0 } },
    });
    const rows = [r('1', { own: true }), r('2', { hasImpact: false }), r('3', { claimedSec: 300 }), r('9', { canTrim: false }), r('4'), r('5'), r('6'),
      r('7', { publishAt: NOW + 3600e3 }), r('8'), r('10')];
    expect(C.apPick(rows as never).map((x) => x.videoId)).toEqual(['v7', 'v4', 'v8']); // past v5 (done) and v6 (queued); v10 is one too many
  });
});

// One claimed video with one trimmable claim, as Studio's API answers it.
const studioApi = async (path: string) => ({
  'creator/list_creator_videos': { videos: [{ videoId: 'v1', title: 'Mix', lengthSeconds: '1000', copyrightSummary: { activeThirdPartyClaimsCount: '1' },
    allRestrictions: { summary: { impacts: ['VIDEO_RESTRICTION_IMPACT_MONETIZATION_DISABLED'] } } }] },
  'creator/list_creator_received_claims': { receivedClaims: [{ claimId: 'c1', status: 'RECEIVED_CLAIM_STATUS_ACTIVE', asset: { metadata: { title: 'S' } },
    nontakedownClaimActions: { options: ['NON_TAKEDOWN_CLAIM_OPTION_TRIM'] } }] },
  'copyright/get_creator_received_claim_matches': { matches: { claimMatches: [{ videoSegment: { startMillis: '0', endMillis: '10000' } }] } },
} as Record<string, unknown>)[path];

describe('apCycle (5847–5873)', () => {
  it('schedules the next cycle without touching `on`, scans, and trims what it picked', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    await C.apCycle();
    expect(ops[0]).toEqual({ op: 'merge', key: `autopilot:${CH}`, entries: { next: NOW + 6 * 3600e3, last: NOW } });
    expect(load<{ on: boolean }>(`autopilot:${CH}`, null as never).on).toBe(true);
    const run = load<{ mode: string; items: { key: string }[] }>(`trimRun:${CH}`, null as never);
    expect(run.mode).toBe('auto');
    expect(run.items.map((i) => i.key)).toEqual(['v1:c1']);
  });

  // audit 1: Stop during the scan; the trims the cycle picked must not start
  it('Stop during the scan: no trim run starts', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(async (path) => { C.stopAll(); return studioApi(path); });
    await C.apCycle();
    expect(load(`trimRun:${CH}`, null)).toBe(null);
  });

  it('Stop during the scan: no ads run starts', async () => {
    useMemoryClaims({ cfg: { apAdsOn: true }, [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(async (_path: string, body?: Record<string, unknown>) => {
      if (!(body?.mask as Record<string, unknown> | undefined)?.monetization) return { videos: [] }; // no claims: the cycle goes on to ads
      C.stopAll();
      return { videos: [{ videoId: 'adsvideo001', title: 'A', monetization: { adMonetization: { userSetMonetization: 'X_OFF', effectiveStatus: 'X_OFF' } } }] };
    });
    await C.apCycle();
    expect(load(`adsRun:${CH}`, null)).toBe(null);
  });

  // 4a T6 review m7
  it('reads ytcfg again before it scans', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    const order: string[] = [];
    C.setCfgRefresh(async () => void order.push('cfg'));
    setYoutubei(async (path) => { order.push('api'); return studioApi(path); });
    await C.apCycle();
    expect(order[0]).toBe('cfg');
    C.setCfgRefresh(async () => {});
  });

  // The next cycle is already scheduled when ytcfg is read: a read that fails (the MAIN world
  // didn't answer) must not lose this one. The scan goes on with the copy it has, as claims:scan does.
  it('a failing ytcfg read does not end the cycle', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    C.setCfgRefresh(async () => { throw new Error('getCfg: timed out after 10000 ms'); });
    setYoutubei(studioApi);
    await C.apCycle();
    expect(load<{ items: unknown[] }>(`trimRun:${CH}`, null as never).items).toHaveLength(1);
    C.setCfgRefresh(async () => {});
  });

  // Safety m5: the cycle's times were written for the channel the tick saw. If the fresh ytcfg
  // names another one, the scan and the trims would be that one's: the cycle ends there.
  it('a ytcfg read that names another channel ends the cycle before it scans', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const OTHER = 'UCbbbbbbbbbbbbbbbbbbbbbb';
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    const api = vi.fn(studioApi);
    setYoutubei(api);
    C.setCfgRefresh(() => refreshCfg(async () => ({ CHANNEL_ID: OTHER, INNERTUBE_CONTEXT: {} })));
    await C.apCycle();
    expect(C.currentChannel()).toBe(OTHER);
    expect(api).not.toHaveBeenCalled();
    expect(ops.map((o) => (o as { key?: string }).key)).toEqual([`autopilot:${CH}`]);
    C.setCfgRefresh(async () => {});
  });

  // 4a re-review (b): a scan whose detail calls all failed is the userscript's, with a warning.
  // It returns [] and replaces the stored scan; the cycle goes on as after any scan with nothing
  // to trim. (No "stop on an incomplete scan": that would be new behaviour, see the planning report.)
  const detailsFail = async (path: string) => {
    if (path === 'creator/list_creator_received_claims') throw new Error('youtubei: timed out after 30000 ms');
    return studioApi(path);
  };
  it('after a scan whose detail calls all failed: no trim run, the scan is replaced, the log says it is incomplete', async () => {
    const lines: string[] = [];
    C.setClaimsUi({ show() {}, status() {}, toast() {}, log: (msg, type) => void lines.push(`${type}:${msg}`) });
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 }, [`claimScan:${CH}`]: { date: 'old', total: 1, rows: [{ videoId: 'x' }] } }, async (op) => void ops.push(op));
    const api = vi.fn(detailsFail);
    setYoutubei(api as never);
    await C.apCycle();
    expect((api.mock.calls as unknown as [string, { mask?: { monetization?: unknown } }?][]).some(([, body]) => body?.mask?.monetization)).toBe(false); // no ads scan without the setting
    expect(load(`trimRun:${CH}`, null)).toBe(null); // nothing to trim: no run
    const scan = load<{ date: string; rows: unknown[] }>(`claimScan:${CH}`, null as never);
    expect(scan.date).not.toBe('old'); // replaced, as the userscript did
    expect(scan.rows).toEqual([]);
    const incomplete = lines.findIndex((l) => l === "err:Couldn't read the claim details of 1 of 1 videos — this scan is incomplete");
    const nothing = lines.findIndex((l) => l.startsWith('ok:🤖 Nothing to trim, next check '));
    expect(incomplete).toBeGreaterThanOrEqual(0);
    expect(nothing).toBeGreaterThan(incomplete);
    expect(load(`adsRun:${CH}`, null)).toBe(null); // apAdsOn is off by default
    C.setClaimsUi(null);
  });

  it('…and with "Also turn on ads" on, the cycle still goes on to the ads scan and can start an ads run', async () => {
    useMemoryClaims({ cfg: { apAdsOn: true }, [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(async (path: string, body?: Record<string, unknown>) => {
      const mask = (body?.mask ?? {}) as Record<string, unknown>;
      if (path === 'creator/list_creator_videos' && mask.monetization) {
        return { videos: [{ videoId: 'adsvideo001', title: 'A', monetization: { adMonetization: { userSetMonetization: 'X_OFF', effectiveStatus: 'X_OFF' } } }] };
      }
      return detailsFail(path);
    });
    await C.apCycle();
    await vi.waitFor(() => expect(load<{ active: boolean } | null>(`adsRun:${CH}`, null)?.active).toBe(true));
    expect(load(`trimRun:${CH}`, null)).toBe(null);
  });

  it('the alarm nudge asks the background afresh before it ticks (a moved lease runs nothing)', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    let mine = true;
    C.setClaimsLock({ worker: async () => mine, acquire: async () => true, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock(); // this tab was the worker
    mine = false; // the lease moved to another tab since
    await C.autopilotDue(CH);
    await new Promise((r) => setTimeout(r, 0));
    expect(ops).toEqual([]);
  });

  it('the alarm nudge runs the tick on that channel only', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    await C.autopilotDue('UCother');
    expect(ops).toEqual([]);
    await C.autopilotDue(CH); // due: the tick starts the cycle, whose first write is the next time
    await vi.waitFor(() => expect(ops[0]).toMatchObject({ op: 'merge', key: `autopilot:${CH}` }));
  });

  // Two Studio tabs on one channel, one alarm (4a D21's worker lease): the background answers
  // "worker" to one of them (runner-lock.test.ts proves that); here the other tab's side.
  it('two tabs on one channel, one alarm: only the worker runs the cycle', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    C.setClaimsLock({ worker: async () => false, acquire: async () => true, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock(); // the other tab is this channel's worker
    await C.autopilotDue(CH);
    C.claimsTick(); // nor does its own tick start one
    await new Promise((r) => setTimeout(r, 0));
    expect(ops).toEqual([]);
  });

  // The userscript's queue was per tab: an upload in a tab on channel X didn't stop Auto-pilot in a
  // tab on channel Y. Here the cycle runs (scan, pick, start the run); only its page changes wait for
  // the automation lock, with the reason on the card.
  it('a queue run in another tab (another channel) does not stop the cycle; the trim step waits for the lock', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    Q.setOtherTabRuns(true); // tab A uploads; its items are in the shared queue
    Q.queue.splice(0, Q.queue.length, { id: 'a', status: 'uploading' } as Q.QueueItem, { id: 'b', status: 'pending' } as Q.QueueItem);
    const acquire = vi.fn(async () => false); // A holds the lock for 'queue'
    C.setClaimsLock({ worker: async () => true, acquire, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    await C.apCycle();
    expect(load<{ active: boolean }>(`trimRun:${CH}`, null as never).active).toBe(true);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalled());
    expect(C.trimStage.detail).toBe('⏸ Waiting for another Studio tab to finish (page change needed)');
    expect(location.pathname).toBe(`/channel/${CH}/videos`);
    Q.setOtherTabRuns(false);
    Q.queue.splice(0);
  });
});
