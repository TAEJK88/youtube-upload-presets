import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { followPanelTab, PANEL_TAB_KEY, PANEL_TAB_MS, requestPanelTab, type PanelTabRequest } from '../lib/panel-tab';

beforeEach(() => { fakeBrowser.reset(); vi.restoreAllMocks(); });
const NOW = 1_700_000_000_000;
const stored = async () => (await browser.storage.session.get(PANEL_TAB_KEY))[PANEL_TAB_KEY];
const settle = () => new Promise((r) => setTimeout(r, 0));
const follow = (tabId: number, now = NOW) => {
  const got: PanelTabRequest[] = [];
  return { got, off: followPanelTab(tabId, (r) => got.push(r), () => now) };
};

// P5-row-tab-choice: the userscript's openDrawer(tab), from the background to the side panel.
describe('requestPanelTab (background)', () => {
  it('stores the tab to show, for which Studio tab, and when', async () => {
    await requestPanelTab(7, 'claims', NOW);
    expect(await stored()).toEqual({ tabId: 7, tab: 'claims', at: NOW });
  });

  it('stores nothing for no tab or a name the panel does not have', async () => {
    await requestPanelTab(7, undefined, NOW);
    await requestPanelTab(7, 'drawer', NOW);
    await requestPanelTab(7, { tab: 'queue' }, NOW);
    expect(await stored()).toBeUndefined();
  });
});

describe('followPanelTab (side panel)', () => {
  it('a panel that opens because of the request finds it', async () => {
    await requestPanelTab(7, 'queue', NOW - 500);
    const f = follow(7);
    await settle();
    expect(f.got.map((r) => r.tab)).toEqual(['queue']);
  });

  it('an open panel is told when the request is made', async () => {
    const f = follow(7);
    await settle();
    await requestPanelTab(7, 'claims', NOW);
    await settle();
    expect(f.got).toEqual([{ tabId: 7, tab: 'claims', at: NOW }]);
  });

  it("only the panel bound to that Studio tab: another tab's request is not taken, at open or later", async () => {
    await requestPanelTab(8, 'queue', NOW);
    const f = follow(7);
    await settle();
    await requestPanelTab(9, 'claims', NOW);
    await settle();
    expect(f.got).toEqual([]);
  });

  it('a request older than PANEL_TAB_MS is not taken: a panel opened minutes later keeps its own tab', async () => {
    await requestPanelTab(7, 'claims', NOW - PANEL_TAB_MS - 1);
    const f = follow(7);
    await settle();
    expect(f.got).toEqual([]);
    await requestPanelTab(7, 'claims', NOW - PANEL_TAB_MS);
    await settle();
    expect(f.got).toHaveLength(1);
  });

  it('what is stored in another shape is not taken', async () => {
    for (const v of [null, 'queue', { tabId: 7, tab: 'drawer', at: NOW }, { tabId: '7', tab: 'queue', at: NOW }, { tabId: 7, tab: 'queue' }]) {
      await browser.storage.session.set({ [PANEL_TAB_KEY]: v });
      const f = follow(7);
      await settle();
      expect(f.got).toEqual([]);
      f.off();
    }
  });

  it('stops when disposed, also for a read still on its way', async () => {
    await requestPanelTab(7, 'queue', NOW);
    const add = vi.spyOn(browser.storage.onChanged, 'addListener');
    const remove = vi.spyOn(browser.storage.onChanged, 'removeListener');
    const f = follow(7);
    f.off();
    expect(remove).toHaveBeenCalledWith(add.mock.calls[0]![0]);
    await settle();
    await requestPanelTab(7, 'claims', NOW);
    await settle();
    expect(f.got).toEqual([]);
  });
});
