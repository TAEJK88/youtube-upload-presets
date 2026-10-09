import { browser } from 'wxt/browser';
import { isStudioUrl } from './panel-scope';

// One Studio tab runs the upload queue at a time. The holder's tab id lives in
// storage.session, so it survives the service worker being stopped. storage.session is
// cleared when the browser closes AND when the extension is reloaded or updated, which is
// the safety net for a stale lock. A holder whose tab is gone, or is no longer on Studio,
// doesn't count. Known limitation: a live Studio tab whose runner died (content script
// gone) keeps the lock until that tab navigates away, closes, or reloads.
const KEY = 'runnerTabId';

// Calls run one after another, so two tabs can't both see "free" and both take it.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

async function holder(): Promise<number | null> {
  const id = (await browser.storage.session.get(KEY))[KEY];
  if (typeof id !== 'number') return null;
  const onStudio = await browser.tabs.get(id).then((t) => isStudioUrl(t?.url), () => false);
  if (onStudio) return id;
  await browser.storage.session.remove(KEY);
  return null;
}

export const acquireRunner = (tabId: number) =>
  serial(async () => {
    const h = await holder();
    if (h !== null && h !== tabId) return false;
    await browser.storage.session.set({ [KEY]: tabId });
    return true;
  });

export const releaseRunner = (tabId: number) =>
  serial(async () => {
    if ((await holder()) === tabId) await browser.storage.session.remove(KEY);
  });

export const runnerElsewhere = (tabId: number) =>
  serial(async () => {
    const h = await holder();
    return h !== null && h !== tabId;
  });

// Any live holder at all: the background refuses a backup import while a run is going.
export const runnerHeld = () => serial(async () => (await holder()) !== null);
// The error message backup:write rejects with then; the panel says "stop the queue first".
export const RUNNER_HELD = 'runner-held';

// Called once from the background: a closed holder tab frees the lock right away.
export function registerRunnerLock() {
  browser.tabs.onRemoved.addListener((tabId) => {
    releaseRunner(tabId).catch(console.error);
  });
}
