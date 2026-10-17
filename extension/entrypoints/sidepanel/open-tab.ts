import { browser } from 'wxt/browser';

// A Studio page (a video, its edit or monetization tab) in a new browser tab, beside the panel.
export const openTab = (url: string) => void browser.tabs.create({ url });
