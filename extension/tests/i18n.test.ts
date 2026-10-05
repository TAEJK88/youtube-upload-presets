import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getLang, initI18n, L, locale, resolveLang, setLang } from '../lib/i18n';

beforeEach(() => fakeBrowser.reset());
afterEach(() => setLang('en'));

describe('i18n', () => {
  it('defaults to English', () => {
    expect(getLang()).toBe('en');
    expect(L('ไทย', 'English')).toBe('English');
    expect(locale()).toBe('en-GB');
  });

  it('switches to Thai', () => {
    setLang('th');
    expect(L('ไทย', 'English')).toBe('ไทย');
    expect(locale()).toBe('th-TH');
  });

  it('resolveLang: a saved language wins', () => {
    expect(resolveLang({ lang: 'th' }, false)).toBe('th');
    expect(resolveLang({ lang: 'en' }, true)).toBe('en');
  });

  it('resolveLang: new installs start in English, installs from before v4.6.0 stay Thai', () => {
    expect(resolveLang(undefined, false)).toBe('en');
    expect(resolveLang({}, true)).toBe('th');
  });

  it('initI18n reads storage', async () => {
    await browser.storage.local.set({ settings: { lang: 'th' } });
    expect(await initI18n()).toBe('th');
    expect(getLang()).toBe('th');
  });
});
