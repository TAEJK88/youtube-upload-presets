import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { NOTIFY_ICON, notifyQueueDone, openFromNotification } from '../lib/notify';
import { PANEL_TAB_KEY } from '../lib/panel-tab';

beforeEach(() => { fakeBrowser.reset(); vi.restoreAllMocks(); });
const note = (focused: boolean) => ({ title: 'Upload finished ✅', text: 'Thai Beats · 2 done', focused });

describe('notifyQueueDone', () => {
  it('shows a notification for the Studio tab', async () => {
    const create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('queue:5' as never);
    expect(await notifyQueueDone(note(false), { id: 5, windowId: 1 }, async () => true)).toBe(true);
    expect(create).toHaveBeenCalledWith('queue:5', {
      type: 'basic', iconUrl: NOTIFY_ICON, title: 'Upload finished ✅', message: 'Thai Beats · 2 done', silent: true,
    });
  });

  it('stays quiet when the user is looking at the tab with the panel open', async () => {
    const create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('' as never);
    expect(await notifyQueueDone(note(true), { id: 5, windowId: 1 }, async () => true)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('still notifies a focused tab whose panel is closed', async () => {
    const create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('' as never);
    expect(await notifyQueueDone(note(true), { id: 5, windowId: 1 }, async () => false)).toBe(true);
    expect(create).toHaveBeenCalledOnce();
  });
});

// P5-row-tab-choice: the userscript's click handler was window.focus(); openDrawer('queue') (3264, 3267).
describe('openFromNotification', () => {
  const stored = async () => (await browser.storage.session.get(PANEL_TAB_KEY))[PANEL_TAB_KEY];
  const sidePanel = (open: () => Promise<void>) => Object.assign(browser, { sidePanel: { open: vi.fn(open) } }).sidePanel;

  it('opens the panel of that tab first (the click is the user gesture), asks for the Upload tab, and brings the tab forward', async () => {
    const order: string[] = [];
    const panel = sidePanel(async () => void order.push('open'));
    vi.spyOn(browser.storage.session, 'set').mockImplementation(async () => void order.push('ask'));
    vi.spyOn(browser.tabs, 'update').mockImplementation((async () => (order.push('tab'), { id: 5, windowId: 2 })) as never);
    const win = vi.spyOn(browser.windows, 'update').mockResolvedValue({} as never);
    const clear = vi.spyOn(browser.notifications, 'clear').mockResolvedValue(true as never);
    await openFromNotification('queue:5');
    expect(panel.open).toHaveBeenCalledWith({ tabId: 5 });
    expect(order).toEqual(['open', 'ask', 'tab']);
    expect(browser.storage.session.set).toHaveBeenCalledWith({ [PANEL_TAB_KEY]: { tabId: 5, tab: 'queue', at: expect.any(Number) } });
    expect(win).toHaveBeenCalledWith(2, { focused: true });
    expect(clear).toHaveBeenCalledWith('queue:5');
  });

  it('a panel that is already open is still told when Chrome refuses to open one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sidePanel(async () => { throw new Error('may only be called in response to a user gesture'); });
    vi.spyOn(browser.tabs, 'update').mockResolvedValue({ id: 5, windowId: 2 } as never);
    vi.spyOn(browser.windows, 'update').mockResolvedValue({} as never);
    await openFromNotification('queue:5');
    expect(await stored()).toMatchObject({ tabId: 5, tab: 'queue' });
  });

  it("another notification's click asks for nothing", async () => {
    const panel = sidePanel(async () => {});
    await openFromNotification('autopilot:UC1');
    expect(panel.open).not.toHaveBeenCalled();
    expect(await stored()).toBeUndefined();
  });
});
