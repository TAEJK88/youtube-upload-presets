import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { asTarget, runnerTab, watchTabs } from '../lib/panel/target';

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
    expect(await runnerTab()).toEqual({ tabId: 9, windowId: 2, title: 'A' });
    get.mockRejectedValue(new Error('No tab with id: 9'));
    expect(await runnerTab()).toBe(null);
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
});
