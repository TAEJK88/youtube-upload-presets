import { browser } from 'wxt/browser';

// Every UI string is written as L('ไทย', 'English').
export type Lang = 'th' | 'en';

let current: Lang = 'en';

export const getLang = (): Lang => current;
export const setLang = (l: Lang): void => { current = l; };
export const L = (th: string, en: string): string => (current === 'en' ? en : th);
export const locale = () => (current === 'en' ? 'en-GB' : 'th-TH');

// New installs start in English; installs from before v4.6.0 (presets saved, no language) stay Thai.
export function resolveLang(settings: { lang?: unknown } | undefined, hasPresets: boolean): Lang {
  const l = settings?.lang;
  if (l === 'th' || l === 'en') return l;
  return hasPresets ? 'th' : 'en';
}

// Each entrypoint awaits this before building any UI string.
export async function initI18n(): Promise<Lang> {
  const { settings, presets } = await browser.storage.local.get(['settings', 'presets']);
  setLang(resolveLang(settings as { lang?: unknown } | undefined, presets !== undefined));
  return current;
}
