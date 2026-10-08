import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLang } from '../lib/i18n';
import { applySettingsPatch, countersDiff, defaultSettings, settingsDiff } from '../lib/settings';
import { ensureLang, patchStore } from '../lib/store-writer';

beforeEach(() => {
  fakeBrowser.reset();
  setLang('en');
});

describe('settings patches', () => {
  it('a diff names only the changed keys, and schedule by its own keys', () => {
    const a = defaultSettings();
    const b = { ...a, notify: false, schedule: { ...a.schedule, start: '2026-10-10T08:00' } };
    expect(settingsDiff(a, b)).toEqual({ notify: false, schedule: { start: '2026-10-10T08:00' } });
    expect(settingsDiff(a, structuredClone(a))).toEqual({});
  });

  it('a patch merges into what is stored, schedule one level deeper', () => {
    const stored = { producer: 'Me', schedule: { on: true, start: 'x', every: 2, unit: 'hour' } };
    expect(applySettingsPatch(stored, { notify: false, schedule: { start: 'y' } })).toEqual({
      producer: 'Me', notify: false, schedule: { on: true, start: 'y', every: 2, unit: 'hour' },
    });
    // nothing stored yet: the schedule's other keys come from the defaults
    expect(applySettingsPatch({}, { schedule: { on: true } })).toEqual({ schedule: { ...defaultSettings().schedule, on: true } });
  });

  it('counters diff keeps the changed presets only', () => {
    expect(countersDiff({ a: 1, b: 2 }, { a: 1, b: 3, c: 0 })).toEqual({ b: 3, c: 0 });
  });
});

describe('patchStore', () => {
  it('two writers no longer undo each other', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me' }, counters: { a: 1 } });
    // the page moves the schedule while the panel turns notifications off
    await Promise.all([
      patchStore({ key: 'settings', patch: { schedule: { start: '2026-10-10T08:00' } } }),
      patchStore({ key: 'settings', patch: { notify: false } }),
      patchStore({ key: 'counters', patch: { b: 4 } }),
    ]);
    const got = await browser.storage.local.get(['settings', 'counters']);
    expect(got.settings).toMatchObject({ producer: 'Me', notify: false, schedule: { start: '2026-10-10T08:00' } });
    expect(got.counters).toEqual({ a: 1, b: 4 });
  });

  it('refuses keys it does not own', async () => {
    await expect(patchStore({ key: 'queue', patch: {} } as never)).rejects.toThrow('store:patch');
  });
});

describe('ensureLang', () => {
  it('stores the language the install started in, once', async () => {
    setLang('th');
    await ensureLang();
    expect((await browser.storage.local.get('settings')).settings).toEqual({ lang: 'th' });
    setLang('en');
    await ensureLang();
    expect((await browser.storage.local.get('settings')).settings).toEqual({ lang: 'th' });
  });
});
