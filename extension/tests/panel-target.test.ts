import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { asTarget, runnerTab, watchRunner, watchTabs } from '../lib/panel/target';
import { JOBS_KEY, LOCK_KEY } from '../lib/runner-lock';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('target', () => {
  it('only a Studio tab is a target', () => {
    expect(asTarget({ id: 3, windowId: 1, url: 'https://studio.youtube.com/channel/UC1', title: 'Studio' })).toEqual({
      tabId: 3, windowId: 1, url: 'https://studio.youtube.com/channel/UC1', title: 'Studio',
    });
    expect(asTarget({ id: 3, windowId: 1, url: 'https://www.youtube.com/' })).toBe(null);
    expect(asTarget(undefined)).toBe(null);
  });

  it('the runner tab comes from the lock; a closed or non-Studio tab is nobody', async () => {
    expect(await runnerTab()).toBe(null);
    await browser.storage.session.set({ runnerTabId: 9 });
    const get = vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: 9, windowId: 2, url: 'https://studio.youtube.com/', title: 'A' } as never);
    expect(await runnerTab()).toEqual({ tabId: 9, windowId: 2, title: 'A', jobs: ['queue'] });
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    expect(await runnerTab()).toEqual({ tabId: 9, windowId: 2, title: 'A', jobs: ['claims'] });
    get.mockRejectedValue(new Error('No tab with id: 9'));
    expect(await runnerTab()).toBe(null);
  });

  it('the runner tab is read with the lock module\'s own keys, and a discarded tab is nobody (review m10)', async () => {
    await browser.storage.session.set({ [LOCK_KEY]: 9, [JOBS_KEY]: ['claims'] });
    const get = vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: 9, windowId: 2, url: 'https://studio.youtube.com/', title: 'A', discarded: true } as never);
    expect(await runnerTab()).toBe(null); // Memory Saver: no script runs there (holder() says the same)
    get.mockResolvedValue({ id: 9, windowId: 2, url: 'https://studio.youtube.com/', title: 'A', discarded: false } as never);
    expect(await runnerTab()).toEqual({ tabId: 9, windowId: 2, title: 'A', jobs: ['claims'] });
    const src = readFileSync(new URL('../lib/panel/target.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/'runnerTabId'|'runnerJobs'/); // no second copy of the key names
  });

  it('the runner is re-checked when the lock or its jobs change, not for other session keys', async () => {
    const fn = vi.fn();
    const off = watchRunner(fn);
    await browser.storage.session.set({ [LOCK_KEY]: 9 });
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    await browser.storage.session.set({ [JOBS_KEY]: ['claims'] });
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    await browser.storage.session.set({ claimsWorkers: {} });
    await browser.storage.local.set({ [LOCK_KEY]: 9 });
    await new Promise((r) => setTimeout(r, 0));
    expect(fn).toHaveBeenCalledTimes(2);
    off();
  });

  it('tab events of this window only', async () => {
    const seen: string[] = [];
    const off = watchTabs(1, (e) => seen.push(e));
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 2 });
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 1 });
    await fakeBrowser.tabs.onUpdated.trigger(4, { status: 'loading' }, { active: true, windowId: 1 } as never);
    await fakeBrowser.tabs.onUpdated.trigger(4, { status: 'complete' }, { active: true, windowId: 1 } as never);
    await fakeBrowser.tabs.onUpdated.trigger(4, { title: 'New title' }, { active: true, windowId: 1 } as never);
    await fakeBrowser.tabs.onUpdated.trigger(5, { status: 'complete' }, { active: false, windowId: 1 } as never);
    await fakeBrowser.tabs.onUpdated.trigger(4, { url: 'https://www.youtube.com/' }, { active: true, windowId: 1 } as never);
    off();
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 1 });
    expect(seen).toEqual(['switched', 'loading', 'loaded', 'titled', 'switched']);
  });

  it('a full navigation to a new URL reports the load too (its script is gone until it completes)', async () => {
    const seen: string[] = [];
    const off = watchTabs(1, (e) => seen.push(e));
    await fakeBrowser.tabs.onUpdated.trigger(4, { status: 'loading', url: 'https://studio.youtube.com/channel/UC2' }, { active: true, windowId: 1 } as never);
    off();
    expect(seen).toEqual(['switched', 'loading']);
  });
});
