import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { buildReport, filterLog, overview, reportFileName, settle, storedData, storedFiles, studioTabs, withTimeout } from '../lib/debug/report';
import { DEBUG_LOG_KEY, type LogEntry } from '../lib/debug-log';
import { SCHEMA_VERSION } from '../lib/migrations';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ manifest_version: 3, name: 'x', version: '5.0.0', permissions: ['storage'], host_permissions: ['https://studio.youtube.com/*'] });
});

describe('debug report sections', () => {
  it('withTimeout rejects a promise that never settles', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 3000);
    const seen = p.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await seen).toBe('no answer within 3000 ms');
    vi.useRealTimers();
  });

  it('settle turns a failure into an inline error instead of throwing', async () => {
    expect(await settle(async () => 1)).toEqual({ ok: true, value: 1 });
    expect(await settle(async () => { throw new TypeError('x'); })).toEqual({ ok: false, error: 'TypeError: x' });
  });

  it('overview: stored vs build schema, and whether the background answers', async () => {
    await browser.storage.local.set({ schemaVersion: 4 });
    const ok = await overview(async () => 5);
    expect(ok.schemaVersion).toEqual({ stored: 4, build: SCHEMA_VERSION });
    expect(ok.background).toMatchObject({ ok: true, result: 5 });
    expect(ok.permissions).toEqual(['storage']);
    expect(ok.version).toBe('5.0.0');
    const broken = await overview(() => Promise.reject(new Error('Could not establish connection')));
    expect(broken.background).toMatchObject({ ok: false, error: 'Error: Could not establish connection' });
  });

  it('stored data: every local key with its JSON size, and the runner lock', async () => {
    await browser.storage.local.set({ b: [1, 2], a: 'xy' });
    await browser.storage.session.set({ runnerTabId: 7 });
    const d = await storedData();
    expect(d.local).toEqual([{ key: 'a', bytes: 4, value: 'xy' }, { key: 'b', bytes: 5, value: [1, 2] }]);
    expect(d.session).toEqual({ runnerTabId: 7 });
  });

  it('stored data: a failing storage.session read stays in its own field', async () => {
    await browser.storage.local.set({ a: 1 });
    vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('session broke'));
    const d = await storedData();
    expect(d.local).toEqual([{ key: 'a', bytes: 1, value: 1 }]);
    expect(d.session).toEqual({ error: 'Error: session broke' });
  });

  it('studio tabs: which answer, within the timeout, and which holds the lock', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 1, title: 'A', url: 'https://studio.youtube.com/a' },
      { id: 2, title: 'B', url: 'https://studio.youtube.com/b' },
    ] as never);
    await browser.storage.session.set({ runnerTabId: 2 });
    const tabs = await studioTabs(async (id) => {
      if (id === 2) throw new Error('Receiving end does not exist');
      return { items: [1, 2, 3] };
    });
    expect(tabs).toMatchObject([
      { id: 1, title: 'A', runner: false, answer: { ok: true, items: 3 } },
      { id: 2, runner: true, answer: { ok: false, error: 'Error: Receiving end does not exist' } },
    ]);
  });

  it('stored files: name, permission and whether the queue uses it', async () => {
    const handle = (name: string) => ({ name, kind: 'file', queryPermission: async () => 'prompt' }) as unknown as FileSystemFileHandle;
    await browser.storage.local.set({ queue: [{ id: 'in-queue', src: 'bridge', thumb: { id: 't1', src: 'bridge' } }] });
    const files = await storedFiles({
      listIds: async () => ['in-queue', 'stray'],
      getHandle: async (id) => (id === 'stray' ? undefined : handle('a.mp4')),
    });
    expect(files).toEqual({
      count: 2,
      files: [
        { id: 'in-queue', name: 'a.mp4', permission: 'prompt', queued: true },
        { id: 'stray', error: 'missing', queued: false },
      ],
    });
  });

  it('the log filter: newest first, by context and level', () => {
    const log: LogEntry[] = [
      { t: 1, ctx: 'panel', level: 'error', msg: 'a' },
      { t: 2, ctx: 'studio', level: 'warn', msg: 'b' },
      { t: 3, ctx: 'panel', level: 'warn', msg: 'c' },
    ];
    expect(filterLog(log, {}).map((e) => e.msg)).toEqual(['c', 'b', 'a']);
    expect(filterLog(log, { ctx: 'panel' }).map((e) => e.msg)).toEqual(['c', 'a']);
    expect(filterLog(log, { ctx: 'panel', level: 'warn' }).map((e) => e.msg)).toEqual(['c']);
  });

  it('the report holds every section and the log; one failing section does not sink it', async () => {
    await browser.storage.local.set({ schemaVersion: 5, [DEBUG_LOG_KEY]: [{ t: 1, ctx: 'panel', level: 'error', msg: 'boom' }] });
    vi.spyOn(browser.tabs, 'query').mockRejectedValue(new Error('no tabs api'));
    const r = await buildReport({ ping: async () => 5, pingTab: async () => ({ items: [] }), files: { listIds: async () => [], getHandle: async () => undefined } });
    expect(Object.keys(r)).toEqual(['generatedAt', 'overview', 'storage', 'studioTabs', 'files', 'log']);
    expect(r.overview.ok).toBe(true);
    expect(r.studioTabs).toEqual({ ok: false, error: 'Error: no tabs api' });
    expect(r.log.map((e) => e.msg)).toEqual(['boom']);
    // the log is in the report once, not again inside the stored data
    expect(JSON.stringify(r.storage)).not.toContain('boom');
  });

  it('report file name', () => {
    expect(reportFileName(new Date(2026, 9, 9, 14, 5))).toBe('ytup-debug-2026-10-09-1405.json');
  });
});
