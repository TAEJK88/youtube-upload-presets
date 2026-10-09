import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLang } from '../lib/i18n';
import { applySettingsPatch, countersDiff, defaultSettings, settingsDiff } from '../lib/settings';
import { BACKUP_SCHEMA, parseBackup } from '../lib/backup';
import { SCHEMA_VERSION } from '../lib/migrations';
import { claimsOpInOrder, ensureLang, mayWrite, patchStore, schemaVersionInOrder, writeBackupInOrder } from '../lib/store-writer';

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

describe('writeBackupInOrder', () => {
  const file = (settings: Record<string, unknown>) => {
    const r = parseBackup(JSON.stringify({ app: 'yt-upload-presets', format: 1, presets: [{ id: 'mine', label: 'Mine' }], activeId: 'mine', settings }));
    if (!r.ok) throw new Error('fixture');
    return r;
  };

  it('applies the file to what storage holds when its turn comes, so a runner patch queued before it survives', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me', lang: 'en', schedule: { on: true, start: 'W', every: 1, unit: 'day' } } });
    const { data, presets } = file({ delay: 5, producer: 'Them', schedule: { on: false, start: 'F', every: 2, unit: 'day' } });
    // the runner moves the schedule on after the panel read the file, before the import is written
    await Promise.all([
      patchStore({ key: 'settings', patch: { schedule: { start: 'Z' } } }),
      writeBackupInOrder({ data, presets, own: false }),
    ]);
    const got = (await browser.storage.local.get('settings')).settings;
    expect(got).toMatchObject({ delay: 5, producer: 'Me', lang: 'en', schedule: { on: true, start: 'Z' } });
  });

  it('a file with the old glass / glassV2 settings leaves neither in storage', async () => {
    await browser.storage.local.set({ schemaVersion: 5, presets: [], settings: { lang: 'en' } });
    const { data, presets } = file({ glass: 0.8, glassV2: true, delay: 4 });
    await writeBackupInOrder({ data, presets, own: true });
    const got = (await browser.storage.local.get('settings')).settings as Record<string, unknown>;
    expect(got.delay).toBe(4);
    expect(got).not.toHaveProperty('glass');
    expect(got).not.toHaveProperty('glassV2');
  });

  it('ensureMigrated never sees the backup\'s schemaVersion while an import is being written', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: [], settings: { lang: 'en' } });
    const seen: Promise<number>[] = [];
    // asked at the worst moment: right as the import has stored BACKUP_SCHEMA
    const ask = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes.schemaVersion?.newValue === BACKUP_SCHEMA) seen.push(schemaVersionInOrder());
    };
    browser.storage.onChanged.addListener(ask);
    const { data, presets } = file({ delay: 4 });
    const imported = writeBackupInOrder({ data, presets, own: true });
    seen.push(schemaVersionInOrder());
    await imported;
    browser.storage.onChanged.removeListener(ask);
    expect(seen.length).toBe(2);
    expect(await Promise.all(seen)).toEqual([SCHEMA_VERSION, SCHEMA_VERSION]);
  });
});

describe('who may write, and what', () => {
  const ext = 'chrome-extension://abc/';
  const panel = { url: 'chrome-extension://abc/sidepanel.html' };
  const studio = { tab: { id: 3 }, url: 'https://studio.youtube.com/channel/UC1/videos' };
  const www = { tab: { id: 4 }, url: 'https://www.youtube.com/watch?v=x' };
  const bridge = { tab: { id: 3 }, url: 'chrome-extension://abc/file-bridge.html' };

  it('store:patch: the panel and Studio tabs only; backup:write: extension pages only', () => {
    expect(mayWrite('store:patch', panel, ext)).toBe(true);
    expect(mayWrite('store:patch', studio, ext)).toBe(true);
    expect(mayWrite('store:patch', www, ext)).toBe(false);
    expect(mayWrite('store:patch', bridge, ext)).toBe(false);
    expect(mayWrite('store:patch', { url: 'chrome-extension://other/x.html' }, ext)).toBe(false);
    expect(mayWrite('backup:write', panel, ext)).toBe(true);
    expect(mayWrite('backup:write', studio, ext)).toBe(false);
    expect(mayWrite('backup:write', www, ext)).toBe(false);
    expect(mayWrite('backup:write', bridge, ext)).toBe(false);
  });

  it('files:delete (forget stored file handles): the panel and Studio tabs only', () => {
    expect(mayWrite('files:delete', panel, ext)).toBe(true);
    expect(mayWrite('files:delete', studio, ext)).toBe(true);
    expect(mayWrite('files:delete', www, ext)).toBe(false);
    expect(mayWrite('files:delete', bridge, ext)).toBe(false);
  });

  it('a settings patch keeps only known keys of the right type', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me' } });
    await patchStore({ key: 'settings', patch: {
      notify: false, schedule: 'x', autoAcceptInvite: 'yes', bogus: 1, delay: Number.NaN, lang: 'fr',
      lockChannel: { id: 'UC1' },
    } } as never);
    await patchStore({ key: 'settings', patch: { schedule: { on: true, every: '2', unit: 'hour' }, lang: 'th', lockChannel: { id: 'UC1', name: 'Mine' } } } as never);
    expect((await browser.storage.local.get('settings')).settings).toEqual({
      producer: 'Me', notify: false, lang: 'th', lockChannel: { id: 'UC1', name: 'Mine' },
      schedule: { ...defaultSettings().schedule, on: true, unit: 'hour' },
    });
    await patchStore({ key: 'settings', patch: { lockChannel: null } });
    expect((await browser.storage.local.get('settings')).settings).toMatchObject({ lockChannel: null });
  });

  it('a settings patch keeps only known own keys: __proto__ and junk schedule keys are dropped', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me' } });
    // as the message arrives: JSON gives "__proto__" an own key
    const patch = JSON.parse('{"__proto__":{"schedule":"x"},"constructor":{},"toString":"x","schedule":{"0":"x","__proto__":{"on":true},"toString":"x"}}');
    await patchStore({ key: 'settings', patch } as never);
    await patchStore({ key: 'settings', patch: { schedule: { '0': 'x' } } } as never);
    const got = (await browser.storage.local.get('settings')).settings as Record<string, unknown>;
    expect(Object.keys(got)).toEqual(['producer']);
    expect(got).toEqual({ producer: 'Me' });
  });

  it('a malformed patch is refused before anything is written', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me' }, counters: { a: 1 } });
    await expect(patchStore(null as never)).rejects.toThrow('store:patch');
    await expect(patchStore({ key: 'settings', patch: 'x' } as never)).rejects.toThrow('store:patch');
    await expect(patchStore({ key: 'counters', patch: [1] } as never)).rejects.toThrow('store:patch');
    await patchStore({ key: 'counters', patch: { b: '5', c: 2 } } as never);
    expect(await browser.storage.local.get(['settings', 'counters'])).toEqual({ settings: { producer: 'Me' }, counters: { a: 1, c: 2 } });
  });

  it('an import is cleaned again here; one with no usable presets is refused, nothing written', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: [{ id: 'keep', label: 'Keep' }], settings: { lang: 'en' } });
    await expect(writeBackupInOrder({ data: {}, presets: [], own: true })).rejects.toThrow('backup:write');
    await expect(writeBackupInOrder({ data: {}, presets: [{ id: 1 }] as never, own: true })).rejects.toThrow('backup:write');
    await expect(writeBackupInOrder({ data: null, presets: [{ id: 'a', label: 'A' }], own: true } as never)).rejects.toThrow('backup:write');
    expect((await browser.storage.local.get('presets')).presets).toEqual([{ id: 'keep', label: 'Keep' }]);
    await writeBackupInOrder({ data: {}, presets: [{ id: 'a', label: 'A', tags: 'x' }] as never, own: true });
    expect((await browser.storage.local.get('presets')).presets).toMatchObject([{ id: 'a', label: 'A', tags: [], title: '{name}' }]);
  });
});

describe('claims:op', () => {
  it('applies ops one at a time to what storage holds', async () => {
    await browser.storage.local.set({ 'trimResults:UC1': { a: { state: 'saved' } } });
    await Promise.all([
      claimsOpInOrder({ op: 'merge', key: 'trimResults:UC1', entries: { b: { state: 'gone' } } }),
      claimsOpInOrder({ op: 'merge', key: 'trimResults:UC1', entries: { c: { state: 'failed' } } }),
    ]);
    expect(Object.keys((await browser.storage.local.get('trimResults:UC1'))['trimResults:UC1'] as object)).toEqual(['a', 'b', 'c']);
    await claimsOpInOrder({ op: 'set', key: 'trimRun:UC1', value: undefined });
    expect(await browser.storage.local.get('trimRun:UC1')).toEqual({});
  });

  it('refuses malformed ops and keys outside the copyright data', async () => {
    await expect(claimsOpInOrder({ op: 'set', key: 'settings', value: {} })).rejects.toThrow('claims:op: malformed');
    await expect(claimsOpInOrder({ op: 'merge', key: 'cfg', entries: JSON.parse('{"__proto__":{}}') })).rejects.toThrow('claims:op: malformed');
  });


  // Review m6: the SyncStore keeps any key under a copyright prefix; the writer is the check.
  it('refuses keys that only look like copyright keys', async () => {
    for (const key of ['claimScan:', 'claimScan:../x', 'claimScan:UC1/x', 'claimScan:UC 1', 'claimScan', 'tabLock:UC1', 'cfg:UC1', 'songHistory:x', '__proto__']) {
      await expect(claimsOpInOrder({ op: 'set', key, value: {} })).rejects.toThrow('claims:op: malformed');
    }
    await expect(claimsOpInOrder({ op: 'set', key: 'claimScan:' + 'x'.repeat(65), value: {} })).rejects.toThrow('claims:op: malformed');
    await expect(claimsOpInOrder({ op: 'list', key: 'trimQueue:../x', add: ['a'] })).rejects.toThrow('claims:op: malformed');
    await expect(claimsOpInOrder({ op: 'runItem', key: 'trimRun:', by: 'key', id: 'a', state: 's', msg: '' })).rejects.toThrow('claims:op: malformed');
    expect(await browser.storage.local.get(null)).toEqual({});
    await claimsOpInOrder({ op: 'set', key: 'claimScan:UCabc_-1', value: { rows: [] } });
    await claimsOpInOrder({ op: 'set', key: 'logOpen', value: true });
    expect(await browser.storage.local.get(null)).toEqual({ 'claimScan:UCabc_-1': { rows: [] }, logOpen: true });
  });
  it('only the side panel and Studio tabs may send it', () => {
    const ext = 'chrome-extension://abc/';
    expect(mayWrite('claims:op', { url: ext + 'sidepanel.html' }, ext)).toBe(true);
    expect(mayWrite('claims:op', { tab: {}, url: 'https://studio.youtube.com/channel/UC1' }, ext)).toBe(true);
    expect(mayWrite('claims:op', { tab: {}, url: 'https://www.youtube.com/' }, ext)).toBe(false);
    expect(mayWrite('claims:op', { url: ext + 'file-bridge.html', tab: {} }, ext)).toBe(false);
  });
});
