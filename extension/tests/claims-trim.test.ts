// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsOp } from '../lib/claims/ops';
import { useMemoryClaims, load } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';

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
const row = (videoId: string, claimId: string, extra = {}) => ({
  videoId, video: 'Mix ' + videoId, privacy: 'public', length: 600, claimId, song: 'Song ' + claimId, artists: '', label: '', claimant: 'Co',
  type: 'audio', status: 'active', impact: 'blocked', segments: [[10, 20]], claimedSec: 10, canTrim: true, options: 'trim', own: false, hasImpact: true, publishAt: 0, ...extra,
});
const claim = (claimId: string, options = ['NON_TAKEDOWN_CLAIM_OPTION_TRIM']) => ({
  claimId, status: 'RECEIVED_CLAIM_STATUS_ACTIVE', asset: { metadata: { title: 'Song ' + claimId } }, nontakedownClaimActions: { options },
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // happy-dom has no layout (and no offsetParent at all, which visible() would read as "shown"):
  // an element in the document is "visible", a removed one is not
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) { return (this.isConnected ? [{}] : []) as unknown as DOMRectList; });
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.isConnected ? document.body : null; } });
  history.replaceState(null, '', `/video/v1/claims`);
  document.documentElement.lang = 'en';
  document.body.innerHTML = '';
  ops.length = 0;
  useMemoryClaims({ [`claimScan:${CH}`]: { date: '', total: 2, channel: CH, channelName: 'C', rows: [row('v1', 'c1'), row('v1', 'c2'), row('v2', 'c3')] } }, async (op) => void ops.push(op));
  C.setClaimsUi(ui);
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  // The lock is refused unless a test says otherwise: a step that got it would change pages and
  // stay busy for 15 s (5955), into the next test.
  C.setClaimsLock({ acquire: async () => false, release: vi.fn(), worker: async () => true, holds: async () => false });
  await C.initClaimsLock();
});
afterEach(() => {
  delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent;
  C.setClaimsUi(null);
  setYoutubei(null);
  vi.restoreAllMocks();
});

describe('starting a trim run', () => {
  it('trims the first claim of each video now and queues the rest as follow-ups', () => {
    C.trimFromPanel(['v1:c1', 'v1:c2', 'v2:c3']);
    const run = load<{ active: boolean; mode: string; items: { key: string; state: string }[] }>(`trimRun:${CH}`, null as never);
    expect(run.active).toBe(true);
    expect(run.mode).toBe('auto'); // autoSaveTrim defaults on
    expect(run.items.map((i) => [i.key, i.state])).toEqual([['v1:c1', 'pending'], ['v1:c2', 'later'], ['v2:c3', 'pending']]);
    expect(Object.keys(load(`followUp:${CH}`, {}))).toEqual(['v1']);
    expect(ops.find((o) => o.op === 'merge' && o.key === `trimResults:${CH}`)).toMatchObject({ entries: { 'v1:c2': { state: 'later' } } });
  });

  it('refuses a second batch while one runs', () => {
    C.trimFromPanel(['v2:c3']);
    C.trimFromPanel(['v2:c3']);
    expect(ui.toast).toHaveBeenCalledWith('Previous batch still trimming');
  });

  it('nothing picked: says so', () => {
    C.trimFromPanel([]);
    expect(ui.log).toHaveBeenCalledWith('No claims selected', 'warn');
  });
});

describe('trimOne on the claims page', () => {
  // Studio's claims page, enough of it: a row with Take action → the option list → Continue →
  // the trim editor with Save → the "Confirm changes" dialog with its checkbox.
  function studioPage() {
    document.body.innerHTML = `
      <ytcr-video-content-list-row><span>Song c1</span><button>Take action</button></ytcr-video-content-list-row>`;
    document.querySelector('button')!.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', `<tp-yt-paper-dialog id="opts"><button><span>Trim out segment</span></button><button id="cont">Continue</button></tp-yt-paper-dialog>`);
      document.querySelector('#cont')!.addEventListener('click', () => {
        document.querySelector('#opts')!.remove();
        document.body.insertAdjacentHTML('beforeend', `<ytcr-editing-tool-dialog>Start time 0:10 End time 0:20<div id="continue-button"><button>Save</button></div></ytcr-editing-tool-dialog>`);
        document.querySelector('#continue-button button')!.addEventListener('click', () => {
          document.querySelector('ytcr-editing-tool-dialog')!.remove();
          document.body.insertAdjacentHTML('beforeend', `<div role="dialog" id="cf">Confirm changes<label><input type="checkbox">I acknowledge</label><button disabled>Confirm changes</button></div>`);
          const box = document.querySelector<HTMLInputElement>('#cf input')!;
          const ok = document.querySelector<HTMLButtonElement>('#cf button')!;
          box.addEventListener('click', () => { ok.disabled = false; });
          ok.addEventListener('click', () => document.querySelector('#cf')!.remove());
        });
      });
    });
  }

  it('auto mode: Take action → Trim out segment → Continue → Save → I acknowledge → Confirm changes; saved', async () => {
    setYoutubei(async () => ({ receivedClaims: [claim('c1')] }));
    studioPage();
    const off = C.installConfirmWatch();
    // the run as startTrimRun left it (not started here: its trimStep would run trimOne too)
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: '', items: [{ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'Song c1', video: 'Mix v1', state: 'pending', msg: '' }] } },
      async (op) => void ops.push(op));
    await C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'Song c1', video: 'Mix v1', state: 'pending', msg: '' }, 'auto');
    off();
    expect(ops.find((o) => o.op === 'merge' && o.key === `trimResults:${CH}` && 'v1:c1' in o.entries)).toMatchObject({ entries: { 'v1:c1': { state: 'saved', msg: '0:10–0:20' } } });
    expect(ops.some((o) => o.op === 'songs' && o.songs.fn === 'trimmed')).toBe(true);
    expect(ops.some((o) => o.op === 'list' && o.key === `trimQueue:${CH}` && o.del?.includes('v1:c1'))).toBe(true);
  });

  it('a claim already released is "gone"; one without the Trim option fails', async () => {
    setYoutubei(async () => ({ receivedClaims: [] }));
    await C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: '', video: 'Mix v1', state: 'pending', msg: '' }, 'auto');
    expect(ops.find((o) => o.op === 'merge' && o.key === `trimResults:${CH}`)).toMatchObject({ entries: { 'v1:c1': { state: 'gone', msg: 'Released' } } });
    expect(ops).toContainEqual({ op: 'list', key: `trimQueue:${CH}`, del: ['v1:c1'] }); // a claim that is gone leaves the "to trim" list too
    setYoutubei(async () => ({ receivedClaims: [claim('c1', [])] }));
    await C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: '', video: 'Mix v1', state: 'pending', msg: '' }, 'auto');
    expect(JSON.stringify(ops)).toContain('Trim option no longer available');
  });

  it('Studio not in English: refuses before clicking anything', async () => {
    document.documentElement.lang = 'th';
    await expect(C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: '', video: '', state: 'pending', msg: '' }, 'auto'))
      .rejects.toThrow('Studio is not set to English — switch to English and try again');
  });
});

describe('stop and the lock', () => {
  it('Stop ends the run and cancels queued follow-ups', () => {
    C.trimFromPanel(['v1:c1', 'v1:c2']);
    C.stopAll();
    expect(ops).toContainEqual({ op: 'merge', key: `trimRun:${CH}`, entries: { active: false } });
    expect(load(`followUp:${CH}`, null)).toEqual({});
    expect(ui.log).toHaveBeenCalledWith('Cancelled 1 queued follow-up trims', 'warn');
  });

  it('a step that changes pages takes the lock first, and waits when another tab holds it', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    const acquire = vi.fn(async () => false);
    C.setClaimsLock({ acquire, release: vi.fn(), worker: async () => true, holds: async () => false });
    C.startTrimRun([row('v2', 'c3')], 'auto'); // its trimStep asks for the lock
    await vi.waitFor(() => expect(C.trimStage.detail).toBe('⏸ Waiting for another Studio tab to finish (page change needed)')); // the card says why
    expect(acquire).toHaveBeenCalled();
    expect(location.pathname).toBe('/channel/x/videos'); // did not navigate
  });

  it('a Stop that lands while the step waits for the lock: no page change', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    let grant!: (v: boolean) => void;
    C.setClaimsLock({ acquire: () => new Promise<boolean>((r) => { grant = r; }), release: vi.fn(), worker: async () => true, holds: async () => false });
    C.startTrimRun([row('v2', 'c3')], 'auto'); // its trimStep now waits for the lock
    C.stopAll();
    grant(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(location.pathname).toBe('/channel/x/videos');
  });

  it('the job is let go after a tick with no run left', async () => {
    const release = vi.fn();
    C.setClaimsLock({ acquire: async () => true, release, worker: async () => true, holds: async () => true });
    await C.initClaimsLock(); // a page back from its own reload holds the job
    C.claimsTick();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('a tab whose holder closed takes over the run (the userscript waited 20 s for the lease)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: '', items: [{ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'S', video: 'Mix v1', state: 'pending', msg: '' }] } });
    const acquire = vi.fn(async () => false); // asked; the test stops there
    // the closed tab's lease is free: this tab is the channel's worker now
    C.setClaimsLock({ acquire, release: vi.fn(), worker: async () => true, holds: async () => false });
    await C.initClaimsLock();
    C.claimsTick();
    await vi.advanceTimersByTimeAsync(2500); // tick → trimStep after 2.5 s (6330–6332)
    expect(acquire).toHaveBeenCalled();
    vi.useRealTimers();
  });

  // 4a T4 review r2 / m8
  it("the worker answer expires: older than the renew interval, the tab isn't the worker until a fresh one", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    let answer!: (v: boolean) => void;
    C.setClaimsLock({ worker: () => new Promise<boolean>((r) => { answer = r; }), acquire: async () => true, release: vi.fn(), holds: async () => false });
    const init = C.initClaimsLock();
    answer(true);
    await init;
    await vi.advanceTimersByTimeAsync(16_000); // the background never answers the renewals: past the 15 s an answer is trusted
    C.claimsTick();
    expect(ops).toEqual([]); // no cycle on a stale "yes"
    answer(true);
    await vi.advanceTimersByTimeAsync(0);
    C.claimsTick();
    expect(ops[0]).toMatchObject({ op: 'merge', key: `autopilot:${CH}` }); // fresh: the cycle starts
    vi.useRealTimers();
  });

  // Chrome runs a hidden tab's timers once a minute after five minutes: every tick would find its
  // last answer too old, ask, and be gone before the answer came. The userscript's lease was
  // read and taken in the tick itself.
  it('a tab that ticks once a minute still works: it ticks again when the fresh answer comes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    const worker = vi.fn(async () => true);
    C.setClaimsLock({ worker, acquire: async () => false, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    await vi.advanceTimersByTimeAsync(60_000);
    C.claimsTick(); // the answer is a minute old: asked again, nothing started on the old one
    expect(ops).toEqual([]);
    await vi.advanceTimersByTimeAsync(0); // the answer: yes
    expect(ops[0]).toMatchObject({ op: 'merge', key: `autopilot:${CH}` });
    expect(worker).toHaveBeenCalledTimes(2); // and that tick asked nothing more
    vi.useRealTimers();
  });

  it("no lease is asked while the channel is 'unknown'", async () => {
    resetCfg();
    await refreshCfg(async () => ({ INNERTUBE_CONTEXT: {} })); // Studio has loaded (the tick gets as far as the lease)…
    history.replaceState(null, '', '/video/v1/claims'); // …with no channel in the address and none from ytcfg
    expect(C.currentChannel()).toBe('unknown');
    const worker = vi.fn(async () => true);
    C.setClaimsLock({ worker, acquire: async () => true, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    C.claimsTick();
    await C.autopilotDue('unknown');
    expect(worker).not.toHaveBeenCalled();
  });

  // 4a T3 review m4
  it('a result whose write timed out is not done again: the item is skipped and its result re-sent', async () => {
    const run = { active: true, mode: 'auto', started: 's1', items: [
      { key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'S', video: 'Mix v1', state: 'pending', msg: '' }] };
    useMemoryClaims({ [`trimRun:${CH}`]: run }, async (op) => void ops.push(op));
    const acquire = vi.fn(async () => true);
    C.setClaimsLock({ worker: async () => true, acquire, release: vi.fn(), holds: async () => false });
    C.setResult(run.items[0] as never, 'saved', '0:10–0:20');
    useMemoryClaims({ [`trimRun:${CH}`]: run }, async (op) => void ops.push(op)); // the write timed out: the copy is storage's again
    ops.length = 0;
    await C.trimStep(); // nothing left to do here: it must not trim v1:c1 a second time
    expect(acquire).not.toHaveBeenCalled();
    // the run has ended meanwhile (trimStep found nothing left): the re-send must land all the same,
    // so it is not for active runs only (port review I1)
    expect(load<{ active: boolean }>(`trimRun:${CH}`, null as never).active).toBe(false);
    ops.length = 0;
    C.claimsTick();
    expect(ops).toEqual([{ op: 'runItem', key: `trimRun:${CH}`, by: 'key', id: 'v1:c1', state: 'saved', msg: '0:10–0:20', onlyActive: false }]);
    expect(load<{ items: { state: string }[] }>(`trimRun:${CH}`, null as never).items[0]!.state).toBe('saved');
    C.claimsTick(); // landed: nothing more is sent
    C.claimsTick();
    expect(ops).toHaveLength(1);
  });

  it('a reloaded page that holds the lock goes on with the run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: '', items: [{ key: 'v2:c3', videoId: 'v2', claimId: 'c3', song: 'S', video: 'Mix v2', state: 'pending', msg: '' }] } });
    const release = vi.fn();
    C.setClaimsLock({ acquire: async () => true, release, worker: async () => true, holds: async () => true });
    await C.initClaimsLock();
    C.setClaimsLock({ acquire: async () => true, release, worker: async () => false, holds: async () => true });
    await C.initClaimsLock();
    C.claimsTick(); // not the worker here, so no step is on its way: the run is active, the job stays
    expect(release).not.toHaveBeenCalled();
    C.setClaimsLock({ acquire: async () => true, release, worker: async () => true, holds: async () => true });
    await C.initClaimsLock();
    C.claimsTick(); // the step is on its way
    expect(release).not.toHaveBeenCalled();
    // the step itself is not this test's: it finds the lock refused and ends, leaving nothing behind
    C.setClaimsLock({ acquire: async () => false, release, worker: async () => true, holds: async () => false });
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
  });
});

// Review round (4b P, safety and port reviews): the glue around the port.
describe('the lock, the lease and the settle (review round)', () => {
  let runs = 0; // each its own run: what a page settled is remembered per run (`started`)
  const pendingRun = (videoId = 'v2', claimId = 'c3') => ({ active: true, mode: 'auto', started: 'review-' + ++runs, channel: CH,
    items: [{ key: `${videoId}:${claimId}`, videoId, claimId, song: 'S', video: 'Mix ' + videoId, state: 'pending', msg: '' }] });

  // Safety I1: the lease lapsed while this tab held the job (a hidden tab, a slow page load) and
  // another tab on the channel took it. That tab is refused the lock for ever; this one must take
  // the lease back, or the run never moves.
  it('a tab that holds the job for an active run takes the lease back, at startup and when it asks again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    useMemoryClaims({ [`trimRun:${CH}`]: pendingRun() });
    const worker = vi.fn(async (_ch: string, force: boolean) => force); // the other tab's lease is fresh: only a forced ask takes it
    const acquire = vi.fn(async () => false); // asked; the step is not this test's
    C.setClaimsLock({ worker, acquire, release: vi.fn(), holds: async () => true });
    await C.initClaimsLock();
    expect(worker.mock.calls).toEqual([[CH, false], [CH, true]]);
    await vi.advanceTimersByTimeAsync(11_000); // past the 10 s between asks
    C.claimsTick();
    expect(worker.mock.calls.at(-1)).toEqual([CH, true]);
    expect(C.claimsState().workerHere).toBe(true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(acquire).toHaveBeenCalled(); // the run moves
    vi.useRealTimers();
  });

  it('a tab that does not hold the job never forces the lease, run or no run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    useMemoryClaims({ [`trimRun:${CH}`]: pendingRun() });
    const worker = vi.fn(async (_ch: string, force: boolean) => force);
    C.setClaimsLock({ worker, acquire: async () => false, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    for (let i = 0; i < 30; i++) { C.claimsTick(); await vi.advanceTimersByTimeAsync(800); }
    expect(worker.mock.calls.length).toBeGreaterThan(2);
    expect(worker.mock.calls.every(([, force]) => force === false)).toBe(true);
    expect(C.claimsState().workerHere).toBe(false);
    vi.useRealTimers();
  });

  // Safety I3: a page frozen mid-step in the back/forward cache and restored after the run went on
  // elsewhere would click on. It starts over instead (the queue has the same guard, watchLockLifecycle).
  it('back from the back/forward cache with the job held or a step in flight: the page reloads', async () => {
    const reload = vi.fn();
    const off = C.installBackGuard(reload);
    const show = (persisted: boolean) => { const ev = new Event('pageshow'); Object.defineProperty(ev, 'persisted', { value: persisted }); window.dispatchEvent(ev); };
    show(true); // nothing held, nothing in flight
    expect(reload).not.toHaveBeenCalled();
    useMemoryClaims({ [`trimRun:${CH}`]: pendingRun('v1', 'c1') });
    C.setClaimsLock({ worker: async () => true, acquire: async () => false, release: vi.fn(), holds: async () => true });
    await C.initClaimsLock(); // the job is this tab's, between two steps
    show(false); // an ordinary page show
    expect(reload).not.toHaveBeenCalled();
    show(true);
    expect(reload).toHaveBeenCalledTimes(1);
    let grant!: (v: boolean) => void;
    C.setClaimsLock({ worker: async () => true, acquire: () => new Promise<boolean>((r) => { grant = r; }), release: vi.fn(), holds: async () => false });
    const step = C.trimStep(); // a step in flight, still asking for the lock: the job is not held
    await vi.waitFor(() => expect(grant).toBeTypeOf('function'));
    show(true);
    expect(reload).toHaveBeenCalledTimes(2);
    off();
    show(true);
    expect(reload).toHaveBeenCalledTimes(2);
    grant(false);
    await step;
  });

  // Safety m1 / port I2: the job is not let go under a step that is still clicking.
  it('the job stays while a step is busy, also after its run was stopped; it goes at the next idle tick', async () => {
    useMemoryClaims({ [`trimRun:${CH}`]: pendingRun('v1', 'c1') });
    const release = vi.fn();
    C.setClaimsLock({ worker: async () => true, acquire: async () => true, release, holds: async () => false });
    let thaw!: (v: unknown) => void;
    setYoutubei(() => new Promise((r) => { thaw = r; }));
    const step = C.trimStep(); // on /video/v1/claims: the step is in trimOne
    await vi.waitFor(() => expect(thaw).toBeTypeOf('function'));
    C.stopAll();
    C.claimsTick();
    expect(release).not.toHaveBeenCalled();
    thaw({ receivedClaims: [] });
    await step;
    C.claimsTick();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('the job stays during an ads run and a Collab run', async () => {
    const release = vi.fn();
    for (const name of ['adsRun', 'collabRun']) {
      useMemoryClaims({ [`${name}:${CH}`]: { active: true, started: 's', handles: ['@a'], items: [{ videoId: 'a', video: 'A', state: 'pending', msg: '' }] } });
      C.setClaimsLock({ worker: async () => false, acquire: async () => false, release, holds: async () => true }); // not the worker: no step starts
      await C.initClaimsLock();
      C.claimsTick();
    }
    expect(release).not.toHaveBeenCalled();
  });

  // Port review: right after a step's page change ytcfg can be late, the channel reads 'unknown'
  // and no run is found under it. That is not "no run left".
  it("the job is not let go while the channel is 'unknown'", async () => {
    useMemoryClaims({ [`trimRun:${CH}`]: pendingRun() });
    resetCfg();
    await refreshCfg(async () => ({ INNERTUBE_CONTEXT: {} }));
    history.replaceState(null, '', '/video/v2/claims');
    const release = vi.fn();
    C.setClaimsLock({ worker: async () => true, acquire: async () => true, release, holds: async () => true });
    await C.initClaimsLock();
    C.claimsTick();
    expect(release).not.toHaveBeenCalled();
  });

  // Safety m3: runner:release is fire-and-forget; if it was lost the background would keep the job
  // for an idle tab. The tab asks once after each release.
  it('after letting the job go the tab asks whether it is really gone, and lets it go again if not', async () => {
    const release = vi.fn();
    let held = true;
    const holds = vi.fn(async () => held);
    const worker = vi.fn(async (_ch: string, _force: boolean) => false);
    C.setClaimsLock({ worker, acquire: async () => true, release, holds });
    await C.initClaimsLock();
    expect(worker.mock.calls).toEqual([[CH, false]]); // the job without a run takes no lease by force
    C.claimsTick(); // no run: released (the message is lost: the background still says "held")
    expect(release).toHaveBeenCalledTimes(1);
    C.claimsTick(); // asks
    await new Promise((r) => setTimeout(r, 0));
    expect(holds).toHaveBeenCalledTimes(2);
    held = false;
    C.claimsTick(); // released again
    expect(release).toHaveBeenCalledTimes(2);
    C.claimsTick(); // asks: gone this time
    await new Promise((r) => setTimeout(r, 0));
    C.claimsTick();
    C.claimsTick();
    expect(release).toHaveBeenCalledTimes(2);
    expect(holds).toHaveBeenCalledTimes(3);
  });

  // Port review (lock side): the content script awaits this before the FAB and the queue wiring.
  it('startup does not wait for a background that does not answer: 5 s each, and the job is asked about again later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    let n = 0;
    const holds = vi.fn(() => (n++ ? Promise.resolve(false) : new Promise<boolean>(() => {})));
    C.setClaimsLock({ worker: () => new Promise<boolean>(() => {}), acquire: async () => false, release: vi.fn(), holds });
    let done = false;
    void C.initClaimsLock().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    C.claimsTick();
    expect(holds).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // Port I2 / safety m2: an ask that fails is "no".
  it('a failed runner:acquire is not the lock: the step waits and changes no page', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    C.setClaimsLock({ worker: async () => true, acquire: async () => { throw new Error('no answer'); }, release: vi.fn(), holds: async () => false });
    C.startTrimRun([row('v2', 'c3')], 'auto');
    await vi.waitFor(() => expect(C.trimStage.detail).toBe('⏸ Waiting for another Studio tab to finish (page change needed)'));
    expect(location.pathname).toBe('/channel/x/videos');
  });

  it('a failed runner:worker is not the lease: no cycle, and an earlier "yes" is dropped', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    let fail = true;
    C.setClaimsLock({ worker: async () => { if (fail) throw new Error('no answer'); return true; }, acquire: async () => false, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    C.claimsTick();
    await C.autopilotDue(CH);
    expect(ops).toEqual([]);
    useMemoryClaims(); // no Auto-pilot from here on: only the lease
    fail = false;
    await C.initClaimsLock();
    C.claimsTick();
    expect(C.claimsState().workerHere).toBe(true);
    fail = true;
    await vi.advanceTimersByTimeAsync(11_000);
    C.claimsTick(); // asks again; the answer fails
    await vi.advanceTimersByTimeAsync(0);
    C.claimsTick();
    expect(C.claimsState().workerHere).toBe(false);
    vi.useRealTimers();
  });

  it('before the content script wired the lock, nothing is granted', async () => {
    vi.resetModules(); // a page whose script has only just loaded: its own copies of the modules
    const Fresh = await import('../lib/claims/claims');
    (await import('../lib/claims/store')).useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    await (await import('../lib/studio/channel')).refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
    expect(Fresh.claimsState()).toMatchObject({ channel: CH, ready: true });
    await Fresh.initClaimsLock();
    Fresh.claimsTick();
    await Fresh.trimStep();
    expect(ops).toEqual([]);
  });

  // Safety m1: the nudge is for this tab's channel only, and never takes the lease by force.
  it("the alarm's nudge asks for this channel's lease only, unforced", async () => {
    const worker = vi.fn(async () => false);
    C.setClaimsLock({ worker, acquire: async () => false, release: vi.fn(), holds: async () => false });
    await C.autopilotDue('UCbbbbbbbbbbbbbbbbbbbbbb');
    await C.autopilotDue(42);
    expect(worker).not.toHaveBeenCalled();
    await C.autopilotDue(CH);
    expect(worker.mock.calls).toEqual([[CH, false]]);
  });

  it('claims:trim with anything but a list of keys does nothing', () => {
    for (const bad of ['v1:c1', 42, null, [1], { 0: 'v1:c1' }]) expect(() => C.trimFromPanel(bad)).not.toThrow();
    expect(ui.log).not.toHaveBeenCalled();
    expect(load(`trimRun:${CH}`, null)).toBe(null);
  });

  // Port I1: the last item's result was lost and the run has ended meanwhile. The re-send must
  // still land (an op for active runs only would be ignored, and sent again every tick for ever).
  it('a result settled after its run ended is not remembered (the userscript wrote none)', () => {
    const run = { ...pendingRun('v1', 'c1'), active: false };
    useMemoryClaims({ [`trimRun:${CH}`]: run }, async (op) => void ops.push(op));
    C.setResult(run.items[0] as never, 'saved', 'x');
    useMemoryClaims({ [`trimRun:${CH}`]: run }, async (op) => void ops.push(op));
    ops.length = 0;
    C.claimsTick();
    expect(ops.filter((o) => o.op === 'runItem')).toEqual([]);
  });
});

describe('pickRow (6074–6090)', () => {
  const cl = (claimId: string, title: string, status = 'RECEIVED_CLAIM_STATUS_ACTIVE') => ({ claimId, status, asset: { metadata: { title } } });
  const el = (t: string) => ({ innerText: t }) as HTMLElement;
  it('one row; unique title; same title by order; by index; by active index; else null', () => {
    const a = cl('a', 'Song A'), b = cl('b', 'Song B'), b2 = cl('b2', 'Song B'), x = cl('x', 'Gone', 'RECEIVED_CLAIM_STATUS_INACTIVE');
    const rA = el('Song A · Co'), rB = el('song  b · Co'), rB2 = el('Song B · Other'), rU = el('???');
    expect(C.pickRow([rU], [a, b], b, 'Song B')).toBe(rU);
    expect(C.pickRow([rA, rB], [a, b], b, 'Song B')).toBe(rB);
    expect(C.pickRow([rA, rB, rB2], [a, b, b2], b2, 'Song B')).toBe(rB2);
    expect(C.pickRow([rA, rB, rB2], [a, b, b2], b, 'Song B')).toBe(rB);
    expect(C.pickRow([rU, el('??'), el('?')], [a, b, b2], b, '')).toMatchObject({ innerText: '??' }); // by index
    expect(C.pickRow([el('1'), el('2')], [x, a, b], b, '')).toMatchObject({ innerText: '2' }); // by index among the active ones
    expect(C.pickRow([rB, rB2], [a, b, b2, x], b, 'Song Z')).toBe(null);
  });
});

describe('the tick (6310–6354)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('no cycle with Auto-pilot off, nor before its time', () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: false, next: 0 } }, async (op) => void ops.push(op));
    C.claimsTick();
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: Date.now() + 60_000 } }, async (op) => void ops.push(op));
    C.claimsTick();
    expect(ops).toEqual([]);
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: Date.now() - 1 } }, async (op) => void ops.push(op));
    C.claimsTick(); // due
    expect(ops[0]).toMatchObject({ op: 'merge', key: `autopilot:${CH}` });
  });

  it('a waiting upload holds the cycle, the follow-up check and the step back', async () => {
    await vi.advanceTimersByTimeAsync(11 * 60_000); // past any follow-up time an earlier test left (fuNext is the module's)
    const acquire = vi.fn(async () => false);
    C.setClaimsLock({ worker: async () => true, acquire, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    const api = vi.fn(async () => ({ receivedClaims: [] }));
    setYoutubei(api);
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem);
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 },
      [`followUp:${CH}`]: { v9: { video: 'V', pending: [{ key: 'v9:c9', claimId: 'c9', song: 'S', tries: 0 }], lastClaimId: null, lastSavedAt: 0 } } }, async (op) => void ops.push(op));
    C.claimsTick();
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: 's', items: [{ key: 'v2:c3', videoId: 'v2', claimId: 'c3', song: 'S', video: 'V', state: 'pending', msg: '' }] } }, async (op) => void ops.push(op));
    C.claimsTick();
    await vi.advanceTimersByTimeAsync(2500);
    expect(ops).toEqual([]);
    expect(api).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    Q.queue.splice(0);
    C.claimsTick(); // the queue is clear: the step is called
    await vi.advanceTimersByTimeAsync(2500);
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('a tab that is not the worker starts no step', async () => {
    const acquire = vi.fn(async () => false);
    C.setClaimsLock({ worker: async () => false, acquire, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: 's', items: [{ key: 'v2:c3', videoId: 'v2', claimId: 'c3', song: 'S', video: 'V', state: 'pending', msg: '' }] } });
    C.claimsTick();
    await vi.advanceTimersByTimeAsync(2500);
    expect(acquire).not.toHaveBeenCalled();
  });

  it('a manual trim on the claims page is saved for you only with the setting on', async () => {
    let clicks = 0;
    document.body.innerHTML = '<ytcr-editing-tool-dialog><div id="continue-button"><button>Save</button></div></ytcr-editing-tool-dialog>';
    document.querySelector('button')!.addEventListener('click', () => { clicks++; });
    useMemoryClaims({ cfg: { autoSaveManualTrim: false } });
    C.claimsTick();
    await vi.advanceTimersByTimeAsync(1500);
    expect(clicks).toBe(0);
    useMemoryClaims({ cfg: { autoSaveManualTrim: true } });
    C.claimsTick();
    await vi.advanceTimersByTimeAsync(1500);
    expect(clicks).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
  });
});

describe('a trim step changes pages (5950–5958)', () => {
  it("opens the video's claims page, once it has the lock", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal('location', { pathname: '/channel/x/videos', href: '' });
    C.setClaimsLock({ worker: async () => true, acquire: async () => true, release: vi.fn(), holds: async () => false });
    C.startTrimRun([row('v2', 'c3')], 'auto');
    await vi.waitFor(() => expect(location.href).toBe('/video/v2/claims'));
    expect(C.trimStage.idx).toBe(0);
    await vi.advanceTimersByTimeAsync(15_000); // the step frees itself if the page didn't change
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for the upload queue instead', async () => {
    vi.stubGlobal('location', { pathname: '/channel/x/videos', href: '' });
    C.setClaimsLock({ worker: async () => true, acquire: async () => true, release: vi.fn(), holds: async () => false });
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem);
    C.startTrimRun([row('v2', 'c3')], 'auto');
    await vi.waitFor(() => expect(C.trimStage.detail).toContain('Waiting for the upload queue to clear'));
    expect(location.href).toBe('');
    Q.queue.splice(0);
    vi.unstubAllGlobals();
  });
});
