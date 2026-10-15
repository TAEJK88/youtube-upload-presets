import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import type { ClaimsOp } from '../lib/claims/ops';
import { createClaimsPage } from '../lib/claims/page';
import { flushClaims, save, useMemoryClaims, write } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
beforeEach(() => {
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.stubGlobal('document', { documentElement: { lang: 'en' }, querySelector: () => null });
  useMemoryClaims();
  resetCfg();
});
afterEach(() => {
  C.setClaimsUi(null);
  setYoutubei(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the copyright module in the Studio tab', () => {
  it('broadcasts its state when it changes, once', () => {
    const send = vi.fn(async (..._: unknown[]) => undefined);
    const page = createClaimsPage({ send: send as never, toast: () => {}, refreshCfg: async () => {} });
    C.setClaimsUi(page.ui);
    page.tick();
    page.tick();
    expect(send.mock.calls.filter(([t]) => t === 'claims:state')).toHaveLength(1);
    C.log('hello', 'ok');
    expect(send).toHaveBeenCalledWith('claims:log', expect.objectContaining({ msg: 'hello', type: 'ok' }));
    page.ui.show('claims');
    expect(send).toHaveBeenCalledWith('claims:show', 'claims');
    page.dispose();
    C.setClaimsUi(null);
  });

  // Port review I2: with broadcast() here instead, nothing of the copyright module would ever run.
  it('the tick is the ported tick: a due Auto-pilot cycle starts from it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const ops: ClaimsOp[] = [];
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
    const lock = (mine: boolean) => ({ worker: async () => mine, acquire: async () => false, release() {}, holds: async () => false });
    C.setClaimsLock(lock(true));
    await C.initClaimsLock();
    const page = createClaimsPage({ send: (async () => undefined) as never, toast: () => {}, refreshCfg: async () => {} });
    page.tick();
    expect(ops[0]).toMatchObject({ op: 'merge', key: `autopilot:${CH}` });
    page.dispose();
    C.setClaimsLock(lock(false));
  });

  it('while Studio has no context yet, reads ytcfg again every 10 s', () => {
    vi.useFakeTimers();
    const refreshCfg = vi.fn(async () => {});
    const page = createClaimsPage({ send: (async () => undefined) as never, toast: () => {}, refreshCfg });
    page.tick();
    page.tick();
    expect(refreshCfg).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_001);
    page.tick();
    expect(refreshCfg).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    page.dispose();
  });

  it('after dispose (extension reloaded), nothing is sent', () => {
    const send = vi.fn(async () => undefined);
    const page = createClaimsPage({ send: send as never, toast: () => {}, refreshCfg: async () => {} });
    page.dispose();
    page.tick();
    page.ui.log('x', '');
    page.ui.show('ads');
    expect(send).not.toHaveBeenCalled();
  });

  // Final review m5: the scan says "complete" and opens the list while the panel still shows the
  // old scan. Said where the action started: a toast (the page's, sent on to the panel) and an
  // error line in the activity log, which is also the card's "Needs attention".
  it('a copyright write the background refused is said in a toast and in the activity log', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    useMemoryClaims({}, async () => { throw new Error('claims:op: not allowed from this sender'); });
    const send = vi.fn(async (..._: unknown[]) => undefined);
    const toast = vi.fn();
    const page = createClaimsPage({ send: send as never, toast, refreshCfg: async () => {} });
    C.setClaimsUi(page.ui);
    save(`claimScan:${CH}`, { rows: [] });
    await new Promise((r) => setTimeout(r, 0));
    const msg = "Couldn't save (claims:op: not allowed from this sender)";
    expect(toast.mock.calls).toEqual([[msg]]);
    expect(send).toHaveBeenCalledWith('claims:log', expect.objectContaining({ msg, type: 'err' }));
    expect(C.computeStatus()).toMatchObject({ kind: 'err', detail: msg });
    // after the teardown (extension reloaded) nothing more is said
    page.dispose();
    save(`claimScan:${CH}`, { rows: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(toast).toHaveBeenCalledTimes(1);
  });

  // 4a re-review (c): a run writes a result per step; against a background that stopped answering
  // that would be a toast per write, stacking in the panel.
  it('the same failed-write message is said once a minute at most; another message is said at once', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const toast = vi.fn();
    const send = vi.fn(async (..._: unknown[]) => undefined);
    const page = createClaimsPage({ send: send as never, toast, refreshCfg: async () => {} });
    C.setClaimsUi(page.ui);
    let fail = new Error('claims:op on trimResults:UC1 timed out (it may still be applied)');
    useMemoryClaims({}, async () => { throw fail; });
    const failOnce = async () => { write({ op: 'set', key: 'logOpen', value: Math.random() }); await vi.advanceTimersByTimeAsync(0); await flushClaims(); };
    await failOnce();
    await failOnce();
    await failOnce();
    const logs = () => send.mock.calls.filter(([t]) => t === 'claims:log').length;
    expect(toast).toHaveBeenCalledTimes(1);
    expect(logs()).toBe(1);
    fail = new Error('claims:op: not allowed from this sender'); // a different failure
    await failOnce();
    expect(toast).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_001);
    await failOnce(); // the same text, a minute later
    expect(toast).toHaveBeenCalledTimes(3);
    expect(logs()).toBe(3);
    page.dispose();
    C.setClaimsUi(null);
    vi.useRealTimers();
  });

  // Task 5 review m4: cachedCfg() is a snapshot; a tab whose first read came before Studio had
  // its context would say "not loaded" until something else read ytcfg again.
  it('a scan from the panel reads ytcfg again first, then scans with what it read', async () => {
    const ops: ClaimsOp[] = [];
    useMemoryClaims({}, async (op) => void ops.push(op));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const read = vi.fn(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: { client: {} } }));
    setYoutubei(async () => ({ videos: [] }));
    const page = createClaimsPage({ send: (async () => undefined) as never, toast: () => {}, refreshCfg: () => refreshCfg(read) });
    await page.scan('collab');
    await vi.waitFor(() => expect(ops.some((o) => o.op === 'set' && o.key === `collabScan:${CH}`)).toBe(true));
    expect(read).toHaveBeenCalledTimes(1);
    await page.scan('nothing');
    expect(read).toHaveBeenCalledTimes(1); // not a scan: nothing is read
    page.dispose();
  });

  it('disposed while ytcfg is being read (extension reloaded): no scan starts', async () => {
    const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
    C.setClaimsUi(ui);
    let done!: () => void;
    const page = createClaimsPage({ send: (async () => undefined) as never, toast: () => {}, refreshCfg: () => new Promise<void>((r) => { done = r; }) });
    const p = page.scan('claims');
    page.dispose();
    done();
    await p;
    expect(ui.log).not.toHaveBeenCalled(); // not even "Studio hasn't finished loading"
    expect(C.scanning).toBe(false);
  });

  it('a failing ytcfg read still lets the scan say why it cannot start', async () => {
    const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const page = createClaimsPage({ send: (async () => undefined) as never, toast: () => {}, refreshCfg: async () => { throw new Error('getCfg: timed out'); } });
    C.setClaimsUi(ui);
    await page.scan('claims');
    expect(ui.log).toHaveBeenCalledWith("Studio hasn't finished loading — try again in a few seconds", 'warn');
    expect(warn).toHaveBeenCalledWith('[ytup] ytcfg before a scan', expect.any(Error));
    page.dispose();
  });
});

describe('the Studio content script', () => {
  const studio = readFileSync(join(__dirname, '..', 'entrypoints/studio.content.ts'), 'utf8');

  it('sets the copyright UI, answers claims:view / claims:scan, and undoes it on teardown', () => {
    expect(studio).toContain('const claims = createClaimsPage({ toast: (m) => ui.toast(m), refreshCfg: () => refreshCfg(readCfg) });');
    expect(studio).toContain('setClaimsUi(claims.ui);');
    expect(studio).toMatch(/stop\.add\(\(\) => \{\s*claims\.dispose\(\);\s*setClaimsUi\(null\);\s*\}\);/);
    expect(studio).toContain("onMessage('claims:view', () => claimsState());");
    // a scan takes minutes: the message is answered at once (void), the scan reports by broadcast
    expect(studio).toContain("onMessage('claims:scan', ({ data }) => void claims.scan(data));");
  });

  // 4a review m11: the first callers of runner:worker and runner:holds. The lease and the lock
  // are asked before the handlers that start work are there.
  it('wires the worker lease and the automation lock to the background, then the panel\'s and the alarm\'s messages', () => {
    expect(studio).toContain("worker: (ch, force) => sendMessage('runner:worker', { ch, force }),");
    // asked through heldAcquire since Phase 5 (call 7; userscript-here.test.ts, studio-wiring.test.ts)
    expect(studio).toContain("acquire: heldAcquire(() => sendMessage('runner:acquire', 'claims'), userscriptHere, sayUserscript, releaseClaims, holdsClaims),");
    expect(studio).toContain("const releaseClaims = () => void sendMessage('runner:release', 'claims').catch(() => {});");
    expect(studio).toContain('release: releaseClaims,');
    expect(studio).toContain("const holdsClaims = () => sendMessage('runner:holds', 'claims');");
    expect(studio).toContain('holds: holdsClaims,');
    const at = (s: string) => { const i = studio.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    const init = at('await initClaimsLock();');
    expect(at('setClaimsLock({')).toBeLessThan(init);
    for (const h of [
      "onMessage('claims:trim', ({ data }) => unlessUserscript(() => trimFromPanel(data)));",
      "onMessage('claims:ads', ({ data }) => unlessUserscript(() => adsFromPanel(data)));",
      "onMessage('claims:collab', ({ data }) => unlessUserscript(() => collabFromPanel(data)));",
      "onMessage('claims:stop', () => stopAll());",
      "onMessage('claims:autopilot', ({ data }) => void autopilotDue(data).catch((e) => console.error('[ytup] autopilot nudge', e)));",
    ]) expect(at(h)).toBeGreaterThan(init);
    expect(studio).toContain('setCfgRefresh(() => refreshCfg(readCfg));');
    expect(studio).toContain('stop.add(() => setCfgRefresh(async () => {}));');
    expect(studio).toContain('setChannelSwitcher((t, next) => sw.switchToChannel(t, next));');
    expect(studio).toContain('stop.add(installConfirmWatch());');
    // the wait for the background is over: the extension may have gone meanwhile
    expect(studio).toMatch(/await initClaimsLock\(\);\s*if \(ctx\.isInvalid\) return;/);
    // a page back from the back/forward cache mid-step starts over (safety review I3)
    expect(studio).toContain('stop.add(installBackGuard());');
  });

  it('ticks the copyright module in the 800 ms interval, in its own try', () => {
    expect(studio).toMatch(/try \{\s*claims\.tick\(\);\s*\} catch \(e\) \{\s*console\.error\('\[ytup\] copyright tick', e\);\s*\}/);
  });
});
