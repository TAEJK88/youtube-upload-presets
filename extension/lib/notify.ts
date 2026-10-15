import { browser } from 'wxt/browser';
import type { QueueDoneNote } from './messages';
import { requestPanelTab } from './panel-tab';

// chrome.notifications needs an icon and the extension ships none yet: a 48 px red dot.
export const NOTIFY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAkUlEQVR42u3awRGAIAxEURuyHPsv5duCSoDNuod/ZebdIOHgvI7OVR/Iw6QADLYNQHHLAExuGoDFlQLYVAmAzQ0BEOkTALFeARDtHwDE8wbQJE8AzQpACkDTAggggAACCMADkLtQAAWAvMgUAJlKKAAymVMAtB/uWozXLRYcFismiyWfxZrVZtFt89XA5rPH1m6gmwOtMYiAEgAAAABJRU5ErkJggg==';

const PREFIX = 'queue:';

export const sidePanelOpenIn = async (windowId: number) =>
  (await browser.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).some((c) => c.windowId === windowId);

// "Queue finished" on the desktop — unless the user is already looking at that Studio
// tab with the side panel open (the userscript skipped it when its drawer was open).
export async function notifyQueueDone(
  n: QueueDoneNote,
  tab: { id?: number; windowId?: number } | undefined,
  panelOpen: (windowId: number) => Promise<boolean> = sidePanelOpenIn,
): Promise<boolean> {
  if (tab?.id === undefined) return false;
  if (n.focused && tab.windowId !== undefined && (await panelOpen(tab.windowId))) return false;
  await browser.notifications.create(PREFIX + tab.id, { type: 'basic', iconUrl: NOTIFY_ICON, title: n.title, message: n.text, silent: true });
  return true;
}

// A click brings that tab forward and opens the side panel there, on the Upload tab
// (openDrawer('queue'), 3264); a panel already open there switches to it. sidePanel.open()
// goes first: it needs the click's user gesture.
export async function openFromNotification(id: string): Promise<void> {
  if (!id.startsWith(PREFIX)) return;
  const tabId = Number(id.slice(PREFIX.length));
  const opened = browser.sidePanel.open({ tabId }).catch((e) => console.warn('[ytup] open panel from notification', e));
  const asked = requestPanelTab(tabId, 'queue').catch((e) => console.warn('[ytup] panel tab from notification', e));
  const tab = await browser.tabs.update(tabId, { active: true }).catch(() => undefined);
  if (tab?.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
  await browser.notifications.clear(id);
  await opened;
  await asked;
}
