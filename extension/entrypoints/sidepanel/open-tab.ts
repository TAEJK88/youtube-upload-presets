import { browser } from 'wxt/browser';

// The one way the panel's UI opens a page in a new browser tab, beside the panel: a Studio page (a
// video, its edit or monetization tab, a channel), or the release page of an update. A refused tab
// (the window closed, the URL not allowed) is logged, not left as an unhandled rejection.
// A tabs.create that is one step of a promise chain handling its own result stays in that chain.
export const openTab = (url: string) => void browser.tabs.create({ url }).catch((e) => console.error('[ytup] open tab failed', url, e));
