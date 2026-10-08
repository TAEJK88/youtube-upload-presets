import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLang } from '../lib/i18n';
import { runMigrations } from '../lib/migrations';
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
    await browser.storage.local.set({ settings: { producer: 'ThaiBeats', delay: 9, lang: 'en' } });
    const s = await loadSettings();
    expect(s.producer).toBe('ThaiBeats');
    expect(s.delay).toBe(9);
  });

  it('fills a missing lang from whether presets exist, without writing', async () => {
    setLang('en'); // loadSettings must ignore this and read storage instead
    await browser.storage.local.set({ settings: { delay: 4 }, presets: [{ id: 'x' }] });
    expect((await loadSettings()).lang).toBe('th');
    expect((await browser.storage.local.get('settings')).settings).toEqual({ delay: 4 });
  });

  it('no stored lang and no presets → lang defaults to en', async () => {
    setLang('th');
    await browser.storage.local.set({ settings: {} });
    expect((await loadSettings()).lang).toBe('en');
  });

  it('has no panel opacity any more', () => {
    expect(defaultSettings()).not.toHaveProperty('glass');
  });

  it('migration 5 drops the stored glass keys and keeps the rest', async () => {
    await browser.storage.local.set({ presets: [{ id: 'x' }], schemaVersion: 4, settings: { glass: 60, glassV2: true, delay: 7 } });
    await runMigrations();
    const got = await browser.storage.local.get(['settings', 'schemaVersion']);
    expect(got.settings).toEqual({ delay: 7 });
    expect(got.schemaVersion).toBe(5);
  });
});
