import { browser } from 'wxt/browser';

// Sentinel wrapper for null values since chrome.storage treats null as delete
const NULL_SENTINEL = { __isNull: true };

// Same contract as the userscript's load()/save() over GM_getValue/GM_setValue,
// now async over chrome.storage.local. Keys are unchanged.
export async function load<T>(key: string, fallback: T): Promise<T> {
  const all = await browser.storage.local.get();
  if (!(key in all)) return fallback;
  const value = all[key];
  // Handle our null sentinel
  if (typeof value === 'object' && value !== null && (value as Record<string, unknown>).__isNull === true) {
    return null as T;
  }
  return value as T;
}

export const save = (key: string, value: unknown): Promise<void> => {
  // Wrap null in a sentinel object
  const toStore = value === null ? NULL_SENTINEL : value;
  return browser.storage.local.set({ [key]: toStore });
};
