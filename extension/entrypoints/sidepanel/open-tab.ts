import { browser } from 'wxt/browser';

// A Studio page (a video, its edit or monetization tab) in a new browser tab, beside the panel.
// A refused tab (the window closed, the URL not allowed) is logged, as the update banner's is.
export const openTab = (url: string) => void browser.tabs.create({ url }).catch((e) => console.error('[ytup] open tab failed', url, e));
