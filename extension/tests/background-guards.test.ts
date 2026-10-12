import { readdirSync, readFileSync, statSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The background's handlers as it registers them, called with the senders Chrome would hand
// over: who may write, who may take the lock, and what a run in progress refuses (final review
// I2: each guard was tested in its own module, the line that applies it was not).
type Handler = (m: { data: unknown; sender: unknown }) => unknown;
const handlers = vi.hoisted(() => new Map<string, Handler>());
vi.mock('../lib/messages', async (orig) => ({
  ...(await orig<object>()),
  onMessage: (type: string, fn: Handler) => { handlers.set(type, fn); return () => {}; },
}));
vi.mock('../lib/debug-capture/background', () => ({}));
// The background's update checks, as it starts them: each test waits for its own to finish, and
// `before` is what was stored at the moment the check was called.
const checks = vi.hoisted(() => [] as { done: Promise<unknown>; before: Promise<Record<string, unknown>> }[]);
vi.mock('../lib/update-check', async (orig) => {
  const real = await orig<typeof import('../lib/update-check')>();
  const { browser } = await import('wxt/browser');
  return {
    ...real,
    checkForUpdate: (...a: Parameters<typeof real.checkForUpdate>) => {
      const before = browser.storage.local.get(null);
      const done = real.checkForUpdate(...a);
      checks.push({ done: done.catch(() => {}), before });
      return done;
    },
  };
});

import background from '../entrypoints/background';
import { BACKUP_SCHEMA } from '../lib/backup';
import { PANEL_TAB_KEY } from '../lib/panel-tab';
import { RUNNER_HELD } from '../lib/runner-lock';

const CH = 'UC' + 'a'.repeat(22);
const studio = (id: number) => ({ tab: { id, url: 'https://studio.youtube.com/channel/' + CH }, url: 'https://studio.youtube.com/channel/' + CH });
const watchPage = (id: number) => ({ tab: { id, url: 'https://www.youtube.com/watch?v=x' }, url: 'https://www.youtube.com/watch?v=x' });
const panel = () => ({ url: browser.runtime.getURL('/sidepanel.html' as never) });
const ask = async (type: string, data: unknown, sender: unknown) => handlers.get(type)!({ data, sender });
// The background checks for updates when it starts: every test here gets this answer, never
// GitHub's. The stub stays for the whole file, and no test ends before its own checks have
// (a check still on its way when the stub came off would call the real fetch).
const LATEST = 'https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest';
const github = vi.fn(async (..._req: Parameters<typeof fetch>) => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }));
vi.stubGlobal('fetch', github);
let starts = 0;
const start = () => { starts++; background.main!(); };

beforeEach(() => {
  github.mockClear();
  checks.length = 0;
  starts = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fakeBrowser.reset();
  handlers.clear();
  const sidePanel = { setPanelBehavior: async () => {}, setOptions: async () => {}, open: async () => {} };
  Object.assign(browser, { sidePanel });
  vi.spyOn(browser.tabs, 'get').mockImplementation(async (id) => ({ id, url: 'https://studio.youtube.com/', discarded: false }) as never);
  start();
});
afterEach(async () => {
  await vi.waitFor(() => expect(checks).toHaveLength(starts));
  await Promise.all(checks.map((c) => c.done));
});

describe('the background refuses', () => {
  it('claims:op from a page that is not Studio', async () => {
    const op = { op: 'set', key: 'logOpen', value: true };
    await expect(ask('claims:op', op, watchPage(4))).rejects.toThrow('claims:op: not allowed from this sender');
    expect(await browser.storage.local.get('logOpen')).toEqual({});
    await ask('claims:op', op, studio(3));
    expect(await browser.storage.local.get('logOpen')).toEqual({ logOpen: true });
  });

  it('runner:acquire from a tab that is not on Studio', async () => {
    expect(await ask('runner:acquire', 'queue', watchPage(4))).toBe(false);
    expect(await browser.storage.session.get('runnerTabId')).toEqual({});
    expect(await ask('runner:acquire', 'queue', studio(3))).toBe(true);
    expect(await browser.storage.session.get(['runnerTabId', 'runnerJobs'])).toEqual({ runnerTabId: 3, runnerJobs: ['queue'] });
  });

  it('runner:worker for something that is not a channel id, or from a tab that is not on Studio', async () => {
    await expect(ask('runner:worker', { ch: 'not a channel', force: false }, studio(3))).rejects.toThrow('runner:worker: malformed');
    await expect(ask('runner:worker', null, studio(3))).rejects.toThrow('runner:worker: malformed');
    expect(await ask('runner:worker', { ch: CH, force: true }, watchPage(4))).toBe(false);
    expect(await browser.storage.session.get('claimsWorkers')).toEqual({});
    expect(await ask('runner:worker', { ch: CH, force: false }, studio(3))).toBe(true);
    expect((await browser.storage.session.get('claimsWorkers')).claimsWorkers).toMatchObject({ [CH]: { tabId: 3 } });
  });

  it('backup:write while a tab holds the lock', async () => {
    const imp = { data: { schemaVersion: BACKUP_SCHEMA, settings: { producer: 'Imported' } }, presets: [{ id: 'p1', label: 'One' }], own: true };
    await ask('runner:acquire', 'claims', studio(3));
    await expect(ask('backup:write', imp, panel())).rejects.toThrow(RUNNER_HELD);
    expect(await browser.storage.local.get('presets')).toEqual({});
    await ask('runner:release', 'all', studio(3));
    await ask('backup:write', imp, panel());
    expect((await browser.storage.local.get('presets')).presets).toHaveLength(1);
  });
});

// Unit D's module is reached only through these lines (4b Z): the listeners at the top level,
// the sync once the stored data is ready, the notice's click.
// P5-row-tab-choice: the page's openDrawer(tab). sidePanel.open() needs the click's user gesture,
// so it is called before anything is awaited; the tab to show is stored for the panel after it.
describe('openPanel', () => {
  const stored = async () => (await browser.storage.session.get(PANEL_TAB_KEY))[PANEL_TAB_KEY];

  it("opens the sender's panel at once, then stores the tab to show for that Studio tab", async () => {
    const order: string[] = [];
    const open = vi.fn(async () => void order.push('open'));
    Object.assign(browser.sidePanel, { open });
    const set = browser.storage.session.set.bind(browser.storage.session);
    vi.spyOn(browser.storage.session, 'set').mockImplementation(async (v) => (order.push('ask'), set(v)));
    const done = ask('openPanel', 'claims', studio(7));
    expect(open).toHaveBeenCalledWith({ tabId: 7 }); // in the handler's first turn
    await done;
    expect(order).toEqual(['open', 'ask']);
    expect(await stored()).toEqual({ tabId: 7, tab: 'claims', at: expect.any(Number) });
  });

  it('with no tab named (the Studio button while nothing runs, Alt+P) it only opens', async () => {
    const open = vi.fn(async () => {});
    Object.assign(browser.sidePanel, { open });
    await ask('openPanel', undefined, studio(7));
    await ask('openPanel', 'drawer', studio(7));
    expect(open).toHaveBeenCalledTimes(2);
    expect(await stored()).toBeUndefined();
  });

  it('a panel that is already open is told the tab even when Chrome refuses to open one, and the page still gets the refusal', async () => {
    Object.assign(browser.sidePanel, { open: async () => { throw new Error('may only be called in response to a user gesture'); } });
    await expect(ask('openPanel', 'queue', studio(7))).rejects.toThrow('user gesture');
    expect(await stored()).toMatchObject({ tabId: 7, tab: 'queue' });
  });

  it('not from a tab: nothing', async () => {
    const open = vi.fn(async () => {});
    Object.assign(browser.sidePanel, { open });
    await ask('openPanel', 'queue', panel());
    expect(open).not.toHaveBeenCalled();
    expect(await stored()).toBeUndefined();
  });
});

describe('the background wires Auto-pilot', () => {
  const alarms = async () => (await browser.alarms.getAll()).map((a) => a.name).sort();

  it("a change of autopilot:<ch> arms that channel's alarm", async () => {
    await browser.storage.local.set({ ['autopilot:' + CH]: { on: true, next: Date.now() + 3600e3 } });
    await vi.waitFor(async () => expect(await alarms()).toEqual(['ap:' + CH, 'update-check']));
  });

  it('at start the alarms are brought in line with what is stored', async () => {
    await browser.alarms.create('ap:UCgone', { when: Date.now() + 3600e3 }); // a channel with no key (any more)
    start();
    await vi.waitFor(async () => expect(await alarms()).toEqual(['update-check'])); // the update check's own alarm stays
  });

  it('a click on the "Auto-pilot is due" notice opens Studio on that channel', async () => {
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    await fakeBrowser.notifications.onClicked.trigger('apdue:' + CH);
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith({ url: 'https://studio.youtube.com/channel/' + CH }));
  });

  it('registered at the top level with no argument, after the lock; the sync waits for `ready`', () => {
    const src = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
    const after = src.slice(src.indexOf('registerRunnerLock(() => void tellStudioTabs());'));
    expect(after).toMatch(/\n  registerAutopilotAlarms\(\);\n/); // two spaces: defineBackground's own level; `send` is for the tests
    expect(after).toMatch(/\n  void ready\.then\(\(\) => syncAutopilotAlarms\(\)\)\.catch\(/);
    expect(src.match(/registerAutopilotAlarms\(/g)).toHaveLength(1);
    expect(src).toMatch(/\n  browser\.notifications\.onClicked\.addListener\(\(id\) => void openFromAutopilotNote\(id\)\.catch\(/);
  });
});

describe('the update check', () => {
  it('asks GitHub once when the background starts, and not again for a second start the same day', async () => {
    await vi.waitFor(() => expect(github).toHaveBeenCalledTimes(1));
    expect(github.mock.calls[0]![0]).toBe(LATEST);
    handlers.clear();
    start(); // the service worker was stopped and started again
    await new Promise((r) => setTimeout(r, 20));
    expect(github).toHaveBeenCalledTimes(1);
  });

  it('waits for the stored data to be ready (the migrations) before it asks', async () => {
    await vi.waitFor(() => expect(checks).toHaveLength(1));
    expect(await checks[0]!.before).toHaveProperty('schemaVersion');
    const src = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/\n  void ready\.then\(\(\) => checkForUpdate\(\)\)\.catch\(/);
    expect(src.match(/checkForUpdate\(/g)).toHaveLength(1);
  });

  it('is registered at the top level, and is the only user of api.github.com', () => {
    const src = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/^  registerUpdateCheck\(\);$/m); // two spaces: defineBackground's own body, not a callback
    const root = new URL('../', import.meta.url);
    const walk = (dir: string): string[] => readdirSync(new URL(dir, root)).flatMap((f) =>
      statSync(new URL(dir + f, root)).isDirectory() ? walk(dir + f + '/') : [dir + f]);
    const users = ['lib/', 'entrypoints/', 'components/'].flatMap(walk)
      .filter((p) => readFileSync(new URL(p, root), 'utf8').includes('api.github.com'));
    expect(users).toEqual(['lib/update-check.ts']);
  });
});
