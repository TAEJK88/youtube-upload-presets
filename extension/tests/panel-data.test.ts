import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { readPanelData, toPanelData, watchPanelData } from '../lib/panel/data';
import { defaultPresets } from '../lib/presets';

beforeEach(() => fakeBrowser.reset());

describe('panel data', () => {
  it('fills the gaps the way the page does', () => {
    const d = toPanelData({ settings: { delay: 7 }, autoNext: true });
    expect(d.settings).toMatchObject({ delay: 7, autoNext: true, pace: 'slow', lang: 'en' });
    expect(d.presets.map((p) => p.id)).toEqual(defaultPresets().map((p) => p.id));
    expect(d.activeId).toBe('trapsoul');
    expect(d).toMatchObject({ counters: {}, channels: [] });
  });

  it('an install with presets but no stored language is Thai (resolveLang)', () => {
    expect(toPanelData({ presets: [{ id: 'x', label: 'X' }] }).settings.lang).toBe('th');
  });

  it('follows the keys it shows, not others', async () => {
    const seen: number[] = [];
    const off = watchPanelData((d) => seen.push(d.settings.delay));
    await browser.storage.local.set({ settings: { delay: 5 } });
    await browser.storage.local.set({ queue: [] });
    await new Promise((r) => setTimeout(r, 0));
    off();
    expect(seen).toEqual([5]);
    expect((await readPanelData()).settings.delay).toBe(5);
  });
});
