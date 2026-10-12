import { browser } from 'wxt/browser';

// "Show this tab" for the side panel of one Studio tab: the userscript's openDrawer(tab) (3488).
// The page asks the background (openPanel) or the background decides itself (a click on the
// "queue finished" notification); the background, its one writer, stores the request in
// storage.session, where a panel that is already open is told of the change and one that opens
// because of the request finds it. Nothing removes it: a panel takes it only for the tab it is
// bound to and only while it is fresh, so one opened later keeps its own tab.
export const PANEL_TABS = ['queue', 'presets', 'claims', 'settings'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];
export const isPanelTab = (v: unknown): v is PanelTab => PANEL_TABS.includes(v as PanelTab);

export const PANEL_TAB_KEY = 'panelTab';
export const PANEL_TAB_MS = 10_000; // a panel opened by the request reads it well within this
export interface PanelTabRequest { tabId: number; tab: PanelTab; at: number }

// Background. No tab (the FAB while nothing runs, Alt+P) or an unknown one: nothing is asked.
export async function requestPanelTab(tabId: number, tab: unknown, now = Date.now()): Promise<void> {
  if (isPanelTab(tab)) await browser.storage.session.set({ [PANEL_TAB_KEY]: { tabId, tab, at: now } satisfies PanelTabRequest });
}

// Side panel: `show` gets each fresh request for `tabId`, the one already there first.
export function followPanelTab(tabId: number, show: (r: PanelTabRequest) => void, now: () => number = Date.now): () => void {
  let alive = true;
  const take = (v: unknown) => {
    const r = v as Partial<PanelTabRequest> | null;
    if (!alive || !r || typeof r !== 'object' || r.tabId !== tabId || !isPanelTab(r.tab) || typeof r.at !== 'number') return;
    if (now() - r.at <= PANEL_TAB_MS) show(r as PanelTabRequest);
  };
  const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'session' && PANEL_TAB_KEY in changes) take(changes[PANEL_TAB_KEY]!.newValue);
  };
  browser.storage.onChanged.addListener(changed);
  void browser.storage.session.get(PANEL_TAB_KEY).then((got) => take(got[PANEL_TAB_KEY])).catch((e) => console.error('[ytup] panel tab request', e));
  return () => {
    alive = false;
    browser.storage.onChanged.removeListener(changed);
  };
}
