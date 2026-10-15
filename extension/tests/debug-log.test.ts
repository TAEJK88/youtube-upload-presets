import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { appendLog, clearLog, DEBUG_LOG_KEY, flushLog, installDebugCapture, LOG_CAP, memoryLog, readLog, resetLogForTests } from '../lib/debug-log';
import { createSyncStore } from '../lib/sync-store';
import { exportBackup } from '../lib/panel/backup-io';
import { runMigrations, SCHEMA_VERSION } from '../lib/migrations';

beforeEach(() => {
  fakeBrowser.reset();
  resetLogForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const stored = async () => ((await browser.storage.local.get(DEBUG_LOG_KEY))[DEBUG_LOG_KEY] ?? []) as { msg: string; ctx: string; level: string; stack?: string }[];

describe('debug log', () => {
  it('batches appends into one storage write after ~500 ms', async () => {
    vi.useFakeTimers();
    const set = vi.spyOn(browser.storage.local, 'set');
    appendLog('panel', 'error', 'one');
    appendLog('panel', 'warn', 'two');
    expect(set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(set).toHaveBeenCalledTimes(1);
    expect((await stored()).map((e) => e.msg)).toEqual(['one', 'two']);
  });

  it('keeps the newest 300 entries and truncates msg / stack', async () => {
    await browser.storage.local.set({ [DEBUG_LOG_KEY]: Array.from({ length: 299 }, (_, i) => ({ t: i, ctx: 'background', level: 'info', msg: `old ${i}` })) });
    appendLog('panel', 'error', 'x'.repeat(5000), 'y'.repeat(9000));
    appendLog('panel', 'error', 'last');
    await flushLog();
    const log = await stored();
    expect(log.length).toBe(LOG_CAP);
    expect(log[0]!.msg).toBe('old 1');
    expect(log.at(-2)!.msg.length).toBe(2000);
    expect(log.at(-2)!.stack!.length).toBe(4000);
    expect(log.at(-1)!.msg).toBe('last');
  });

  it('never throws when storage fails, and keeps the entries in memory', async () => {
    vi.spyOn(browser.storage.local, 'set').mockRejectedValue(new Error('quota'));
    expect(() => appendLog('studio', 'error', 'kept')).not.toThrow();
    await expect(flushLog()).resolves.toBeUndefined();
    expect(memoryLog().map((e) => e.msg)).toContain('kept');
  });

  it('is a silent no-op once the extension context is gone (content scripts after a reload)', async () => {
    const set = vi.spyOn(browser.storage.local, 'set');
    const rt = browser.runtime as { id?: string };
    const id = rt.id;
    rt.id = undefined; // what chrome.runtime.id reads after the context is invalidated
    try {
      appendLog('studio', 'error', 'late');
      await flushLog();
      expect(set).not.toHaveBeenCalled();
    } finally {
      rt.id = id;
    }
  });

  it('collapses consecutive identical entries (same ctx, level, msg) into one with a count', async () => {
    appendLog('studio', 'error', 'storm', 'at first()');
    appendLog('studio', 'error', 'storm', 'at later()');
    appendLog('studio', 'error', 'storm');
    appendLog('panel', 'error', 'storm'); // another context: a new entry
    appendLog('panel', 'warn', 'storm'); // another level: a new entry
    appendLog('panel', 'warn', 'storm');
    await flushLog();
    const log = await stored();
    expect(log.map((e) => [e.ctx, e.level, e.msg, (e as { count?: number }).count])).toEqual([
      ['studio', 'error', 'storm', 3],
      ['panel', 'error', 'storm', undefined],
      ['panel', 'warn', 'storm', 2],
    ]);
    expect(log[0]!.stack).toBe('at first()'); // the first occurrence's time and stack
    expect(memoryLog().map((e) => e.count)).toEqual([3, undefined, 2]);
  });

  it('keeps collapsing across flushes: a storm stays one stored entry', async () => {
    appendLog('studio', 'error', 'storm');
    await flushLog();
    appendLog('studio', 'error', 'storm');
    appendLog('studio', 'error', 'storm');
    await flushLog();
    expect((await stored()).map((e) => [e.msg, (e as { count?: number }).count])).toEqual([['storm', 3]]);
    appendLog('studio', 'error', 'other');
    appendLog('studio', 'error', 'storm'); // not consecutive any more
    await flushLog();
    expect((await stored()).map((e) => e.msg)).toEqual(['storm', 'other', 'storm']);
  });

  it('cutting to the cap drops info entries before warn and error ones', async () => {
    const old = Array.from({ length: LOG_CAP }, (_, i) => ({ t: i, ctx: 'background', level: i < 2 ? 'error' : i % 2 ? 'info' : 'warn', msg: `old ${i}` }));
    await browser.storage.local.set({ [DEBUG_LOG_KEY]: old });
    appendLog('panel', 'info', 'chatter 1');
    appendLog('panel', 'info', 'chatter 2');
    appendLog('panel', 'error', 'the one that matters');
    await flushLog();
    const log = await stored();
    expect(log.length).toBe(LOG_CAP);
    // the two old errors stay; the three oldest info lines (old 3, 5, 7) go
    expect(log.slice(0, 3).map((e) => e.msg)).toEqual(['old 0', 'old 1', 'old 2']);
    expect(log.map((e) => e.msg)).not.toContain('old 3');
    expect(log.map((e) => e.msg)).not.toContain('old 7');
    expect(log.map((e) => e.msg)).toContain('old 9');
    expect(log.at(-1)!.msg).toBe('the one that matters');
  });

  it('with only warn and error entries left, the oldest go first', async () => {
    await browser.storage.local.set({ [DEBUG_LOG_KEY]: Array.from({ length: LOG_CAP }, (_, i) => ({ t: i, ctx: 'background', level: 'warn', msg: `w ${i}` })) });
    appendLog('panel', 'error', 'new');
    await flushLog();
    const log = await stored();
    expect(log.length).toBe(LOG_CAP);
    expect(log[0]!.msg).toBe('w 1');
    expect(log.at(-1)!.msg).toBe('new');
  });

  it('a storm writes at most once every 2 s per context (the first write still after ~500 ms)', async () => {
    vi.useFakeTimers();
    const set = vi.spyOn(browser.storage.local, 'set');
    appendLog('studio', 'error', 'first');
    await vi.advanceTimersByTimeAsync(600);
    expect(set).toHaveBeenCalledTimes(1);
    // the storm: a new line every 100 ms for 5 s
    for (let i = 0; i < 50; i++) {
      appendLog('studio', 'error', `line ${i % 3}`);
      await vi.advanceTimersByTimeAsync(100);
    }
    // 5.6 s after the first write began: writes at ~2.5 s and ~4.5 s, not ten
    expect(set.mock.calls.length).toBeLessThanOrEqual(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await stored()).length).toBe(51); // nothing lost: the last batch went out too
    // quiet again: the next lone entry is written ~500 ms after it, once 2 s have passed
    await vi.advanceTimersByTimeAsync(5000);
    const before = set.mock.calls.length;
    appendLog('studio', 'warn', 'lone');
    await vi.advanceTimersByTimeAsync(600);
    expect(set.mock.calls.length).toBe(before + 1);
  });

  it('readLog / clearLog', async () => {
    appendLog('debug', 'info', 'a');
    await flushLog();
    expect((await readLog()).map((e) => e.msg)).toEqual(['a']);
    await clearLog();
    expect(await readLog()).toEqual([]);
  });
});

describe('installDebugCapture', () => {
  it('logs console.error / warn and [ytup] info lines, and still calls the console', async () => {
    const target = new EventTarget();
    const orig = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() };
    const con = { ...orig } as unknown as Console;
    installDebugCapture('background', { target, console: con });
    con.error('[ytup] boom', new Error('bad'));
    con.warn('careful');
    con.info('[ytup] note');
    con.info('not ours');
    con.log('[ytup] logged');
    expect(orig.error).toHaveBeenCalledWith('[ytup] boom', expect.any(Error));
    expect(orig.info).toHaveBeenCalledWith('not ours');
    await flushLog();
    const log = await stored();
    expect(log.map((e) => [e.level, e.msg])).toEqual([
      ['error', '[ytup] boom Error: bad'],
      ['warn', 'careful'],
      ['info', '[ytup] note'],
      ['info', '[ytup] logged'],
    ]);
    expect(log[0]!.stack).toContain('bad');
    expect(log.every((e) => e.ctx === 'background')).toBe(true);
  });

  it('never makes the console throw, whatever it is given, and still prints it', () => {
    const orig = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() };
    const con = { ...orig } as unknown as Console;
    installDebugCapture('panel', { target: new EventTarget(), console: con });
    const cyclic = Object.create(null) as Record<string, unknown>;
    cyclic.self = cyclic; // JSON.stringify throws, and String() has no toString to call
    const badName = new Error('x');
    Object.defineProperty(badName, 'name', { get() { throw new Error('getter'); } });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    for (const a of [cyclic, badName, proxy]) {
      expect(() => con.error('[ytup] odd', a)).not.toThrow();
      const last = orig.error.mock.lastCall!; // by identity: matchers would touch the revoked Proxy
      expect(last[0]).toBe('[ytup] odd');
      expect(last[1] === a).toBe(true);
    }
  });

  it('logs error and unhandledrejection events', async () => {
    const target = new EventTarget();
    installDebugCapture('panel', { target, console: { error() {}, warn() {}, info() {}, log() {} } as unknown as Console });
    const err = Object.assign(new Event('error'), { error: new TypeError('nope'), message: 'Uncaught TypeError: nope' });
    target.dispatchEvent(err);
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('rejected') }));
    await flushLog();
    expect((await stored()).map((e) => e.msg)).toEqual(['TypeError: nope', 'Unhandled rejection: Error: rejected']);
  });
});

describe('the debugLog key and the rest of the extension', () => {
  it('a SyncStore ignores it', async () => {
    const store = await createSyncStore(['settings']);
    const fn = vi.fn();
    store.onChange('settings', fn);
    appendLog('studio', 'error', 'x');
    await flushLog();
    expect(fn).not.toHaveBeenCalled();
    expect(() => store.get('settings')).not.toThrow();
    store.dispose();
  });

  it('a backup export leaves it out', async () => {
    appendLog('panel', 'error', 'secret-ish');
    await flushLog();
    const { json } = await exportBackup('1.0.0');
    expect(json).not.toContain('debugLog');
    expect(json).not.toContain('secret-ish');
  });

  it('migrations run unchanged with it present (no schema bump: the key is optional)', async () => {
    await browser.storage.local.set({ schemaVersion: 4, presets: [{ id: 'a', label: 'A' }], [DEBUG_LOG_KEY]: [] });
    await runMigrations();
    expect((await browser.storage.local.get('schemaVersion')).schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(5);
  });
});
