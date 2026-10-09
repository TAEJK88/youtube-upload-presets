import { browser } from 'wxt/browser';
import { isStudioUrl } from '../panel-scope';

// The panel works with the Studio tab active in its own window (the background enables it
// on Studio tabs only).
export interface Target { tabId: number; windowId: number; url: string; title: string }
interface TabLike { id?: number; windowId?: number; url?: string; title?: string }

export const asTarget = (t: TabLike | undefined): Target | null =>
  t?.id !== undefined && t.windowId !== undefined && isStudioUrl(t.url)
    ? { tabId: t.id, windowId: t.windowId, url: t.url!, title: t.title ?? '' }
    : null;

export async function activeStudioTab(windowId: number): Promise<Target | null> {
  const [tab] = await browser.tabs.query({ active: true, windowId });
  return asTarget(tab);
}

export type TabEvent = 'switched' | 'loading' | 'loaded' | 'titled'; // titled: only the title changed
export function watchTabs(windowId: number, fn: (e: TabEvent) => void): () => void {
  const activated = (info: { windowId: number }) => {
    if (info.windowId === windowId) fn('switched');
  };
  const updated = (_id: number, info: { status?: string; url?: string; title?: string }, tab: { active?: boolean; windowId?: number }) => {
    if (!tab.active || tab.windowId !== windowId) return;
    // A full navigation reports its new URL and 'loading' in one event: the page's script is
    // gone until it completes, so both are told.
    if (info.url) {
      fn('switched');
      if (info.status === 'loading') fn('loading');
    } else if (info.status === 'loading') fn('loading');
    else if (info.status === 'complete') fn('loaded');
    else if (info.title) fn('titled');
  };
  browser.tabs.onActivated.addListener(activated);
  browser.tabs.onUpdated.addListener(updated);
  return () => {
    browser.tabs.onActivated.removeListener(activated);
    browser.tabs.onUpdated.removeListener(updated);
  };
}

// The tab holding the one-runner lock (lib/runner-lock.ts, storage.session). Stop goes there;
// the panel says so when it isn't the bound tab. A tab that is gone or left Studio is nobody.
export interface RunnerTab { tabId: number; windowId: number; title: string }

export async function runnerTab(): Promise<RunnerTab | null> {
  const id = (await browser.storage.session.get('runnerTabId')).runnerTabId;
  if (typeof id !== 'number') return null;
  const t = asTarget(await browser.tabs.get(id).catch(() => undefined));
  return t && { tabId: t.tabId, windowId: t.windowId, title: t.title };
}

// fn runs when the lock moves, and when any tab navigates (a new URL) or closes: the runner
// tab may have left Studio or be gone, and runnerTab() re-checks it.
export function watchRunner(fn: () => void): () => void {
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === 'session' && 'runnerTabId' in changes) fn();
  };
  const updated = (_id: number, info: { url?: string }) => {
    if (info.url) fn();
  };
  browser.storage.onChanged.addListener(changed);
  browser.tabs.onUpdated.addListener(updated);
  browser.tabs.onRemoved.addListener(fn);
  return () => {
    browser.storage.onChanged.removeListener(changed);
    browser.tabs.onUpdated.removeListener(updated);
    browser.tabs.onRemoved.removeListener(fn);
  };
}

export async function focusTab(t: { tabId: number; windowId: number }): Promise<void> {
  await browser.tabs.update(t.tabId, { active: true });
  await browser.windows.update(t.windowId, { focused: true });
}
