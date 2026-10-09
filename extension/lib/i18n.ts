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

// The language is a setting the side panel changes; every context follows it at once
// (the userscript reloaded the page instead). Returns a disposer.
export function watchLang(onChange?: (l: Lang) => void): () => void {
  const fn = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !changes.settings) return;
    const l = (changes.settings.newValue as { lang?: unknown } | undefined)?.lang;
    if ((l !== 'th' && l !== 'en') || l === current) return;
    current = l;
    onChange?.(l);
  };
  browser.storage.onChanged.addListener(fn);
  return () => browser.storage.onChanged.removeListener(fn);
}
