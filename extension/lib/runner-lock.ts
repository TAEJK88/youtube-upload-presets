import { browser } from 'wxt/browser';

// One Studio tab runs the upload queue at a time. The holder's tab id lives in
// storage.session, so it survives the service worker being stopped and is gone when the
// browser closes. A holder whose tab no longer exists doesn't count.
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
  if (await browser.tabs.get(id).then((t) => !!t, () => false)) return id;
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
