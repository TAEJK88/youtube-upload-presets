import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import type { ClaimsOp } from '../lib/claims/ops';
import { createClaimsPage } from '../lib/claims/page';
import { useMemoryClaims } from '../lib/claims/store';
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

  it('ticks the copyright module in the 800 ms interval, in its own try', () => {
    expect(studio).toMatch(/try \{\s*claims\.tick\(\);\s*\} catch \(e\) \{\s*console\.error\('\[ytup\] copyright tick', e\);\s*\}/);
  });
});
