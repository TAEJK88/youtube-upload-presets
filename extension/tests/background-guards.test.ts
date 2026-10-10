import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import background from '../entrypoints/background';
import { BACKUP_SCHEMA } from '../lib/backup';
import { RUNNER_HELD } from '../lib/runner-lock';

const CH = 'UC' + 'a'.repeat(22);
const studio = (id: number) => ({ tab: { id, url: 'https://studio.youtube.com/channel/' + CH }, url: 'https://studio.youtube.com/channel/' + CH });
const watchPage = (id: number) => ({ tab: { id, url: 'https://www.youtube.com/watch?v=x' }, url: 'https://www.youtube.com/watch?v=x' });
const panel = () => ({ url: browser.runtime.getURL('/sidepanel.html' as never) });
const ask = async (type: string, data: unknown, sender: unknown) => handlers.get(type)!({ data, sender });

beforeEach(() => {
  fakeBrowser.reset();
  handlers.clear();
  const sidePanel = { setPanelBehavior: async () => {}, setOptions: async () => {}, open: async () => {} };
  Object.assign(browser, { sidePanel });
  vi.spyOn(browser.tabs, 'get').mockImplementation(async (id) => ({ id, url: 'https://studio.youtube.com/', discarded: false }) as never);
  background.main!();
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
