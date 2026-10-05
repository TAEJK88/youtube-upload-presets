import { browser } from 'wxt/browser';

// Same contract as the userscript's load()/save() over GM_getValue/GM_setValue,
// now async over chrome.storage.local. Keys are unchanged.
export async function load<T>(key: string, fallback: T): Promise<T> {
  const got = await browser.storage.local.get(key);
  return got[key] === undefined ? fallback : (got[key] as T);
}

export const save = (key: string, value: unknown): Promise<void> => browser.storage.local.set({ [key]: value });
