import { afterEach, describe, expect, it, vi } from 'vitest';
import { stopOnInvalidated } from '../lib/content-lifecycle';
import { browserEnv, createInviteWatcher } from '../lib/invite';
import { createMemoryStore } from '../lib/sync-store';

// The entrypoints (defineContentScript) are not unit-tested; what they wire is: the
// injected timers in browserEnv, and stopOnInvalidated for the teardown on invalidation.
afterEach(() => vi.unstubAllGlobals());

describe('browserEnv timers', () => {
  it('the watchers use the injected timers, not the page globals', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', { href: 'https://studio.youtube.com/', pathname: '/', search: '', hash: '' });
    const globalSet = vi.spyOn(globalThis, 'setInterval');
    const timers = { setInterval: vi.fn(() => 7 as never), clearInterval: vi.fn(), setTimeout: vi.fn(() => 8) };
    const env = browserEnv(createMemoryStore(), timers);
    createInviteWatcher(env).armSpaPoll();
    expect(timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(globalSet).not.toHaveBeenCalled();
    env.setTimeout(() => {}, 5);
    env.clearInterval(7 as never);
    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5);
    expect(timers.clearInterval).toHaveBeenCalledWith(7);
  });

  it('defaults to the globals', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', {});
    const globalSet = vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as never);
    browserEnv(createMemoryStore()).setInterval(() => {}, 10);
    expect(globalSet).toHaveBeenCalledWith(expect.any(Function), 10);
  });
});

describe('stopOnInvalidated', () => {
  const makeCtx = () => {
    let cb = () => {};
    return { isInvalid: false, onInvalidated: (fn: () => void) => void (cb = fn), invalidate() { this.isInvalid = true; cb(); } };
  };

  it('runs every teardown once on invalidation, then logs', () => {
    const ctx = makeCtx();
    const log = { info: vi.fn() };
    const calls: string[] = [];
    const stop = stopOnInvalidated(ctx, log);
    stop.add(() => calls.push('state'));
    stop.add(() => { throw new Error('boom'); });
    stop.add(() => calls.push('bridge'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(calls).toEqual([]);
    ctx.invalidate();
    ctx.invalidate();
    expect(calls).toEqual(['bridge', 'state']);
    expect(log.info).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith('[ytup] extension reloaded — page automation stopped');
  });

  it('stops something added after the context was already invalidated', () => {
    const ctx = makeCtx();
    const stop = stopOnInvalidated(ctx, { info: () => {} });
    ctx.invalidate();
    const late = vi.fn();
    stop.add(late);
    expect(late).toHaveBeenCalledOnce();
  });
});
