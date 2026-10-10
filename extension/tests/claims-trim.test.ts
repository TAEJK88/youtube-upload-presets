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

  it("no lease is asked while the channel is 'unknown'", async () => {
    resetCfg();
    history.replaceState(null, '', '/video/v1/claims'); // no channel in the address, none from ytcfg
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
    C.setResult(run.items[0] as never, 'saved', '0:10–0:20');
    useMemoryClaims({ [`trimRun:${CH}`]: run }, async (op) => void ops.push(op)); // the write timed out: the copy is storage's again
    ops.length = 0;
    const acquire = vi.fn(async () => true);
    C.setClaimsLock({ worker: async () => true, acquire, release: vi.fn(), holds: async () => false });
    await C.trimStep(); // nothing left to do here: it must not trim v1:c1 a second time
    expect(acquire).not.toHaveBeenCalled();
    C.claimsTick();
    expect(ops).toContainEqual({ op: 'runItem', key: `trimRun:${CH}`, by: 'key', id: 'v1:c1', state: 'saved', msg: '0:10–0:20', onlyActive: true });
  });

  it('a reloaded page that holds the lock goes on with the run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: '', items: [{ key: 'v2:c3', videoId: 'v2', claimId: 'c3', song: 'S', video: 'Mix v2', state: 'pending', msg: '' }] } });
    const release = vi.fn();
    C.setClaimsLock({ acquire: async () => true, release, worker: async () => true, holds: async () => true });
    await C.initClaimsLock();
    C.claimsTick();
    expect(release).not.toHaveBeenCalled(); // the run is active: the job stays
    vi.useRealTimers();
  });
});
