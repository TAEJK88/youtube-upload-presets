import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLang } from '../lib/i18n';
import { defaultSettings, loadSettings } from '../lib/settings';

beforeEach(() => fakeBrowser.reset());
afterEach(() => setLang('en'));

describe('settings', () => {
  it('defaults match the userscript', () => {
    const s = defaultSettings();
    expect(s.autoApply).toBe(true);
    expect(s.autoNext).toBe(false);
    expect(s.pace).toBe('slow');
    expect(s.category).toBe('Music');
    expect(s.monetization).toBe('on');
    expect(s.lockChannel).toBe(null);
    expect(s.schedule).toEqual({ on: false, start: '', every: 1, unit: 'day' });
  });

  it('reads the pre-settings autoApply / autoNext keys', async () => {
    await browser.storage.local.set({ autoApply: false, autoNext: true });
    const s = await loadSettings();
    expect(s.autoApply).toBe(false);
    expect(s.autoNext).toBe(true);
  });

  it('stored values override defaults', async () => {
    await browser.storage.local.set({ settings: { producer: 'ThaiBeats', delay: 9, glassV2: true, lang: 'en' } });
    const s = await loadSettings();
    expect(s.producer).toBe('ThaiBeats');
    expect(s.delay).toBe(9);
  });

  it('moves the old 72% glass default to 82% once and records the language', async () => {
    setLang('th');
    await browser.storage.local.set({ settings: { glass: 72 } });
    const s = await loadSettings();
    expect(s.glass).toBe(82);
    expect(s.glassV2).toBe(true);
    expect(s.lang).toBe('th');
    const { settings } = await browser.storage.local.get('settings');
    expect(settings).toMatchObject({ glass: 82, glassV2: true, lang: 'th' });
  });

  it('leaves a user-chosen glass value alone', async () => {
    await browser.storage.local.set({ settings: { glass: 60 } });
    expect((await loadSettings()).glass).toBe(60);
  });
});
