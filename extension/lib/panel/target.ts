import { browser } from 'wxt/browser';
import { isStudioUrl } from '../panel-scope';
import { isJob, JOBS_KEY, LOCK_KEY, type Job } from '../runner-lock';

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

// The tab holding the automation lock (lib/runner-lock.ts, storage.session), and what for.
// Stop goes there; the panel says so when it isn't the bound tab. A tab that is gone or left
// Studio is nobody, and so is a discarded one (no script runs there). A lock written before jobs
// existed was the queue's.
export interface RunnerTab { tabId: number; windowId: number; title: string; jobs: Job[] }

export async function runnerTab(): Promise<RunnerTab | null> {
  const got = await browser.storage.session.get([LOCK_KEY, JOBS_KEY]);
  const id = got[LOCK_KEY];
  if (typeof id !== 'number') return null;
  const tab = await browser.tabs.get(id).catch(() => undefined);
  const t = tab?.discarded ? null : asTarget(tab);
  const jobs = Array.isArray(got[JOBS_KEY]) ? (got[JOBS_KEY] as unknown[]).filter(isJob) : ['queue' as Job];
  return t && { tabId: t.tabId, windowId: t.windowId, title: t.title, jobs };
}

// fn runs when the lock moves or its jobs change, and when any tab navigates (a new URL) or closes: the runner
// tab may have left Studio or be gone, and runnerTab() re-checks it.
export function watchRunner(fn: () => void): () => void {
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === 'session' && (LOCK_KEY in changes || JOBS_KEY in changes)) fn();
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
