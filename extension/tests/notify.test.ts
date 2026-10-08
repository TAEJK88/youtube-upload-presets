import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { NOTIFY_ICON, notifyQueueDone } from '../lib/notify';

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
