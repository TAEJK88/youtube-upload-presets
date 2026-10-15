import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyBackup, buildBackup, parseBackup } from '../lib/backup';
import { toPanelData } from '../lib/panel/data';
import type { Preset } from '../lib/presets';
import { BATCH_MAX, cleanLimits, DAILY_LIMIT_MAX, defaultSettings, loadSettings, mergeSettings } from '../lib/settings';
import { patchStore } from '../lib/store-writer';

beforeEach(() => fakeBrowser.reset());

// Settings → batch and dailyLimit (P5-upload-batches, P5-daily-limit): two whole numbers the
// userscript never had.
describe('batch and dailyLimit', () => {
  it('default to 15 and 15', () => {
    expect(defaultSettings()).toMatchObject({ batch: 15, dailyLimit: 15 });
  });

  it('settings stored before they existed get the defaults, on the page, in the panel and in the background', async () => {
    const old = { delay: 7, pace: 'normal' };
    expect(mergeSettings(old as never)).toMatchObject({ delay: 7, batch: 15, dailyLimit: 15 });
    expect(toPanelData({ settings: old }).settings).toMatchObject({ delay: 7, batch: 15, dailyLimit: 15 });
    await browser.storage.local.set({ settings: old });
    expect(await loadSettings()).toMatchObject({ delay: 7, batch: 15, dailyLimit: 15 });
  });

  it('cleanLimits: whole numbers from 0 to the maximum, and only the keys that are there', () => {
    expect(cleanLimits({ batch: 2.6, dailyLimit: -3 })).toEqual({ batch: 3, dailyLimit: 0 });
    expect(cleanLimits({ batch: 999, dailyLimit: 1e9 })).toEqual({ batch: BATCH_MAX, dailyLimit: DAILY_LIMIT_MAX });
    expect(cleanLimits({ batch: NaN, delay: 4 })).toEqual({ batch: 0, delay: 4 });
    expect(cleanLimits({ delay: 4 })).toEqual({ delay: 4 });
  });

  it('the single writer stores them in range, and refuses another type', async () => {
    await patchStore({ key: 'settings', patch: { batch: 500, dailyLimit: 2.4 } });
    expect((await browser.storage.local.get('settings')).settings).toMatchObject({ batch: BATCH_MAX, dailyLimit: 2 });
    await patchStore({ key: 'settings', patch: { batch: 0, dailyLimit: '9' as never } });
    expect((await browser.storage.local.get('settings')).settings).toMatchObject({ batch: 0, dailyLimit: 2 });
  });

  const preset: Preset = { id: 'mine', label: 'Mine', title: '{name}', description: '', tags: [], visibility: 'PRIVATE' };
  const file = (settings: Record<string, unknown>) => {
    const r = parseBackup(JSON.stringify({ app: 'yt-upload-presets', format: 1, presets: [preset], activeId: 'mine', settings }));
    if (!r.ok) throw new Error('fixture');
    return r;
  };
  const cur = () => ({ settings: { ...defaultSettings(), lang: 'en' as const }, cfg: {} });

  it('a backup carries them out and back in, for "My file" and for someone else\'s', () => {
    const out = buildBackup({ presets: [preset], activeId: 'mine', counters: {}, settings: { ...defaultSettings(), batch: 3, dailyLimit: 40 }, cfg: {} }, '5.0.0');
    expect(out.settings).toMatchObject({ batch: 3, dailyLimit: 40 });
    for (const own of [true, false]) {
      const { data, presets } = file(out.settings as Record<string, unknown>);
      expect(applyBackup(data, presets, own, cur()).settings).toMatchObject({ batch: 3, dailyLimit: 40 });
    }
  });

  it('a file without them (the userscript\'s, a move file) keeps what is set here; one out of range is brought into range', () => {
    const mineNow = { settings: { ...defaultSettings(), lang: 'en' as const, batch: 4, dailyLimit: 0 }, cfg: {} };
    const old = file({ delay: 9 });
    expect(applyBackup({ ...old.data, move: { uploads: [], channels: [] } }, old.presets, true, mineNow).settings).toMatchObject({ delay: 9, batch: 4, dailyLimit: 0 });
    const wild = file({ batch: 7000, dailyLimit: -1, delay: 9 });
    expect(applyBackup(wild.data, wild.presets, true, cur()).settings).toMatchObject({ batch: BATCH_MAX, dailyLimit: 0 });
    const wrong = file({ batch: '8', dailyLimit: null });
    expect(applyBackup(wrong.data, wrong.presets, true, cur()).settings).toMatchObject({ batch: 15, dailyLimit: 15 });
  });
});
