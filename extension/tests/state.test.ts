import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getLang, setLang } from '../lib/i18n';
import { SCHEMA_VERSION } from '../lib/migrations';
import { defaultPresets } from '../lib/presets';
import * as state from '../lib/studio/state';
import { patchStore } from '../lib/store-writer';

const P = (id: string) => ({ ...defaultPresets()[0]!, id, label: id });
const current = () => Promise.resolve(SCHEMA_VERSION);

beforeEach(() => fakeBrowser.reset());
afterEach(() => {
  state.disposeState();
  setLang('en');
});

describe('state before initState', () => {
  it('holds the userscript defaults and an in-memory store', () => {
    expect(state.settings.pace).toBe('slow');
    expect(state.presets.map((p) => p.id)).toEqual(defaultPresets().map((p) => p.id));
    expect(state.activeId).toBe('trapsoul');
    expect(state.load('uploads', [])).toEqual([]);
  });
});

describe('initState', () => {
  it('loads storage into the live objects', async () => {
    await browser.storage.local.set({
      schemaVersion: SCHEMA_VERSION, presets: [P('a'), P('b')], activeId: 'b',
      counters: { a: 2 }, settings: { delay: 9 },
    });
    await state.initState(current);
    expect(state.settings.delay).toBe(9);
    expect(state.settings.pace).toBe('slow'); // defaults still fill the gaps
    expect(state.presets.map((p) => p.id)).toEqual(['a', 'b']);
    expect(state.activeId).toBe('b');
    expect(state.counters).toEqual({ a: 2 });
    expect(state.presetById('nope').id).toBe('a');
    expect(state.active().id).toBe('b');
  });

  it('follows changes made elsewhere without replacing the objects', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: [P('a')], counters: {} });
    await state.initState(current);
    const { settings, presets, counters } = state;
    await browser.storage.local.set({ settings: { delay: 5 }, presets: [P('x'), P('y')], activeId: 'y', counters: { x: 4 } });
    expect(state.settings).toBe(settings);
    expect(settings.delay).toBe(5);
    expect(state.presets).toBe(presets);
    expect(presets.map((p) => p.id)).toEqual(['x', 'y']);
    expect(state.activeId).toBe('y');
    expect(state.counters).toBe(counters);
    expect(counters).toEqual({ x: 4 });
  });

  it('save() writes through to chrome.storage', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
    await state.initState(current, 10_000, patchStore);
    state.counters.trapsoul = 7;
    state.save('counters', state.counters);
    state.settings.schedule.start = '2026-10-07T08:00';
    state.saveSettings();
    await state.flushState();
    const got = await browser.storage.local.get(['counters', 'settings']);
    expect(got.counters).toEqual({ trapsoul: 7 });
    expect((got.settings as { schedule: { start: string } }).schedule.start).toBe('2026-10-07T08:00');
  });

  it('asks the background to migrate when storage is behind', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION - 1 });
    const ensure = vi.fn(async () => {
      await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
      return SCHEMA_VERSION;
    });
    await state.initState(ensure);
    expect(ensure).toHaveBeenCalledOnce();
  });

  it('refuses to read storage it does not understand', async () => {
    await browser.storage.local.set({ schemaVersion: 1 });
    await expect(state.initState(async () => 1)).rejects.toThrow(`expects ${SCHEMA_VERSION}`);
  });

  it('settings and counters go to the background as patches, and a concurrent change survives', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { producer: 'Me' }, counters: { a: 1 } });
    const sent: unknown[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await state.initState(current, 10_000, async (p) => {
      sent.push(structuredClone(p));
      await gate; // the background is slow
      await patchStore(p);
    });
    state.settings.schedule.start = '2026-10-10T08:00';
    state.saveSettings();
    expect(sent).toEqual([{ key: 'settings', patch: { schedule: { start: '2026-10-10T08:00' } } }]);
    // the side panel turns notifications off before the background stored the page's patch
    await patchStore({ key: 'settings', patch: { notify: false } });
    expect(state.settings.schedule.start).toBe('2026-10-10T08:00'); // the pending patch stays on top
    expect(state.settings.notify).toBe(false);
    release();
    await state.flushState();
    const got = (await browser.storage.local.get('settings')).settings;
    expect(got).toMatchObject({ producer: 'Me', notify: false, schedule: { start: '2026-10-10T08:00' } });
    state.counters.b = 2;
    state.save('counters', state.counters);
    await state.flushState();
    expect(sent.at(-1)).toEqual({ key: 'counters', patch: { b: 2 } });
    expect((await browser.storage.local.get('counters')).counters).toEqual({ a: 1, b: 2 });
  });

  it('a finished patch does not hide a later change made elsewhere', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { schedule: { on: true, start: 'W', every: 1, unit: 'day' } } });
    let stored!: () => void;
    const written = new Promise<void>((r) => (stored = r));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await state.initState(current, 10_000, async (p) => {
      await patchStore(p); // the background stores X and its echo arrives…
      stored();
      await gate; // …while the page still waits for the answer
    });
    state.settings.schedule.start = 'X';
    state.saveSettings();
    await written;
    // the side panel moves the schedule on; its event arrives while P is still pending
    await patchStore({ key: 'settings', patch: { schedule: { start: 'Y' } } });
    release();
    await state.flushState();
    expect((await browser.storage.local.get('settings')).settings).toMatchObject({ schedule: { start: 'Y' } });
    expect(state.settings.schedule.start).toBe('Y');
  });

  it('a failed patch puts back what storage holds', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { delay: 3 } });
    await state.initState(current, 10_000, async () => { throw new Error('no background'); });
    state.settings.delay = 9;
    state.saveSettings();
    await state.flushState();
    expect(state.settings.delay).toBe(3);
  });

  it('a patch from before disposeState that fails later leaves the new pending patches alone', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { delay: 3 } });
    let fail!: (e: Error) => void;
    await state.initState(current, 10_000, () => new Promise<void>((_, rej) => (fail = rej)));
    state.settings.delay = 5;
    state.saveSettings();
    state.disposeState();
    let done!: () => void;
    await state.initState(current, 10_000, () => new Promise<void>((r) => (done = r))); // still on its way
    state.settings.delay = 9;
    state.saveSettings();
    fail(new Error('old background gone'));
    await new Promise((r) => setTimeout(r, 0));
    expect(state.settings.delay).toBe(9);
    done();
    await state.flushState();
  });

  it('applies the stored language and follows a change', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { lang: 'th' } });
    await state.initState(current);
    expect(getLang()).toBe('th');
    await browser.storage.local.set({ settings: { lang: 'en' } });
    expect(getLang()).toBe('en');
  });
});

describe('initState lifecycle', () => {
  it('is idempotent: a second call shares the first, so there is one store and one refresh per change', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: [P('a')] });
    const added = vi.spyOn(browser.storage.onChanged, 'addListener');
    const first = state.initState(current);
    const second = state.initState(current);
    expect(second).toBe(first);
    await Promise.all([first, second]);
    await state.initState(current); // already ready: no-op
    expect(added).toHaveBeenCalledTimes(1);
    const splice = vi.spyOn(state.presets, 'splice');
    await browser.storage.local.set({ presets: [P('x')] });
    expect(splice).toHaveBeenCalledTimes(1);
    expect(state.presets.map((p) => p.id)).toEqual(['x']);
  });

  it('disposeState stops following storage, and initState works again afterwards', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: [P('a')], counters: { a: 1 } });
    await state.initState(current);
    state.disposeState();
    await browser.storage.local.set({ counters: { a: 2 } });
    expect(state.counters).toEqual({ a: 1 }); // no longer following
    state.save('counters', { a: 3 }); // back on the in-memory store: nothing reaches storage
    await state.flushState();
    expect((await browser.storage.local.get('counters')).counters).toEqual({ a: 2 });
    await state.initState(current);
    expect(state.counters).toEqual({ a: 2 });
    await browser.storage.local.set({ counters: { a: 5 } });
    expect(state.counters).toEqual({ a: 5 });
  });

  it('a disposeState during the load wins: the late store is dropped', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, counters: { a: 1 } });
    const p = state.initState(current);
    state.disposeState();
    await p;
    await browser.storage.local.set({ counters: { a: 9 } });
    expect(state.counters).not.toEqual({ a: 9 });
  });

  it('an external write of no presets does not throw and clears activeId', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: [P('a')] });
    await state.initState(current);
    expect(state.activeId).toBe('a'); // nothing stored: falls back to the first preset
    await browser.storage.local.set({ presets: [] });
    expect(state.presets).toEqual([]);
    expect(state.activeId).toBe('');
  });

  it('rejects when the background never answers ensureMigrated, and can be retried', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION - 1 });
    await expect(state.initState(() => new Promise<number>(() => {}), 20)).rejects.toThrow(
      '[ytup] background did not answer ensureMigrated',
    );
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
    await expect(state.initState(current, 20)).resolves.toBeUndefined();
  });

  it('merges the legacy top-level autoApply / autoNext keys into settings', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, autoApply: false, autoNext: true });
    await state.initState(current);
    expect(state.settings.autoApply).toBe(false);
    expect(state.settings.autoNext).toBe(true);
  });
});
