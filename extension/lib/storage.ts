import { browser } from 'wxt/browser';

// Same contract as the userscript's load()/save() over GM_getValue/GM_setValue,
// now async over chrome.storage.local. Keys are unchanged.
export async function load<T>(key: string, fallback: T): Promise<T> {
  const got = await browser.storage.local.get(key);
  return got[key] === undefined ? fallback : (got[key] as T);
}

export const save = (key: string, value: unknown): Promise<void> => browser.storage.local.set({ [key]: value });

// The upload queue: one key per channel (queue:<channelId>). Older builds kept every
// channel's items in the one 'queue' key; the background moves them (store-writer moveLegacyQueueInOrder).
export const QUEUE_PREFIX = 'queue:';
export const LEGACY_QUEUE_KEY = 'queue';
export const queueKey = (channelId: string) => QUEUE_PREFIX + channelId;
export const isQueueKey = (key: string) => key === LEGACY_QUEUE_KEY || key.startsWith(QUEUE_PREFIX);
