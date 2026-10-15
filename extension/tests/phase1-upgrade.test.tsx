// @vitest-environment happy-dom
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { App } from '../entrypoints/sidepanel/App';
import { RootBoundary } from '../entrypoints/sidepanel/RootBoundary';
import { setLang } from '../lib/i18n';
import { runMigrations } from '../lib/migrations';
import { readPanelData } from '../lib/panel/data';
import { fakePanel, renderPanel } from './panel-fake';

// The user's blank panel came right after upgrading from the Phase 1 build. These are the
// stored shapes such an install can hold; the panel must come up on each after migrations.

const PHASE1: Record<string, Record<string, unknown>> = {
  'Phase 1 fresh install (schemaVersion 4 only)': { schemaVersion: 4 },
  'userscript-era data with glass keys and legacy autoApply / autoNext': {
    schemaVersion: 4,
    settings: { lang: 'th', glass: 0.6, glassV2: true, producer: 'ThaiBeats' },
    autoApply: false, autoNext: true,
    presets: [{ id: 'mine', label: 'Mine' }], // an old preset with only id and label
    activeId: 'gone', cfg: { ownNames: 'A' }, counters: { mine: 3 },
  },
  'before schemaVersion existed (legacy flags)': { presets: [{ id: 'x', label: 'X', title: '{name}' }], addedPlaylist: true },
};

beforeEach(() => {
  fakeBrowser.reset();
});
afterEach(() => {
  cleanup();
  setLang('en');
  vi.restoreAllMocks();
});

describe('upgrading from the Phase 1 build', () => {
  for (const [name, stored] of Object.entries(PHASE1)) {
    it(`the panel renders: ${name}`, async () => {
      await browser.storage.local.set(stored);
      await runMigrations();
      const data = await readPanelData();
      setLang(data.settings.lang ?? 'en');
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderPanel(<RootBoundary><App /></RootBoundary>, fakePanel({ data, lang: data.settings.lang }));
      await act(async () => {});
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getAllByRole('tab').length).toBe(4);
      expect(err).not.toHaveBeenCalled();
    });
  }
});
