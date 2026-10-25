import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLang } from '../lib/i18n';
import { applySettingsPatch, countersDiff, defaultSettings, settingsDiff } from '../lib/settings';
import { BACKUP_SCHEMA, parseBackup } from '../lib/backup';
import { SCHEMA_VERSION } from '../lib/migrations';
import { claimsOpInOrder, ensureLang, mayWrite, moveLegacyQueueInOrder, patchStore, schemaVersionInOrder, writeBackupInOrder } from '../lib/store-writer';

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

  it('a file of your own with a weekly schedule: stored as cleaned here, bad values left out', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me', lang: 'en', schedule: { on: true, start: 'W', every: 1, unit: 'day', mode: 'week', perWeek: 2 } } });
    const { data, presets } = file({ schedule: { on: true, start: 'F', every: 2, unit: 'day', mode: 'week', perWeek: 9, from: '09:00', to: '09:10', seed: 5 } });
    await writeBackupInOrder({ data, presets, own: true });
    expect(((await browser.storage.local.get('settings')).settings as { schedule: object }).schedule)
      .toEqual({ on: true, start: 'F', every: 2, unit: 'day', mode: 'week', seed: 5 });
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

  it('a move file of your own adds its upload history and channels to what storage holds', async () => {
    const row = (file: string, date: string) => ({ date, channel: 'UC1', channelName: 'One', videoId: '', title: file, file, size: 10, txt: '', description: '', publishAt: null, visibility: 'PUBLIC' });
    const one = { id: 'UC1', name: 'One', avatar: '', handle: '@one' };
    const two = { id: 'UC2', name: 'Two', avatar: 'https://yt3.ggpht.com/x', handle: '@two' };
    await browser.storage.local.set({ settings: { lang: 'en' }, uploads: [row('new.mp4', '2026-10-03T00:00:00.000Z')], channels: [one] });
    const { data, presets } = file({ delay: 5 });
    data.move = { lang: 'th', uploads: [row('old.mp4', '2026-10-01T00:00:00.000Z')], channels: [two] };
    await writeBackupInOrder({ data, presets, own: false });
    let got = await browser.storage.local.get(['uploads', 'channels', 'settings']);
    expect(got.uploads).toEqual([row('new.mp4', '2026-10-03T00:00:00.000Z')]); // someone else's file: untouched
    expect(got.channels).toEqual([one]);
    expect(got.settings).toMatchObject({ lang: 'en' });
    await writeBackupInOrder({ data, presets, own: true });
    await writeBackupInOrder({ data, presets, own: true }); // a second import adds nothing twice
    got = await browser.storage.local.get(['uploads', 'channels', 'settings']);
    expect(got.uploads).toEqual([row('new.mp4', '2026-10-03T00:00:00.000Z'), row('old.mp4', '2026-10-01T00:00:00.000Z')]);
    expect(got.channels).toEqual([one, two]);
    expect(got.settings).toMatchObject({ lang: 'th', delay: 5 });
  });

  it('a move import still works when the stored history and channel list are damaged', async () => {
    await browser.storage.local.set({ settings: { lang: 'en' }, uploads: 'junk', channels: [null] });
    const { data, presets } = file({ delay: 5 });
    data.move = { uploads: [{ date: '2026-10-01T00:00:00.000Z', channel: 'UC1', file: 'a.mp4' }], channels: [{ id: 'UC2', name: 'Two' }] };
    await writeBackupInOrder({ data, presets, own: true });
    const got = await browser.storage.local.get(['uploads', 'channels']);
    expect((got.uploads as { file: string }[]).map((u) => u.file)).toEqual(['a.mp4']);
    expect(got.channels).toEqual([{ id: 'UC2', name: 'Two', avatar: '', handle: '' }]);
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

  // P5-week-schedule: the week fields are not in the defaults (old data without them is the
  // interval mode), so each has its own rule.
  it('a settings patch takes the weekly schedule\'s fields and refuses bad values', async () => {
    const stored = async () => ((await browser.storage.local.get('settings')).settings as { schedule: Record<string, unknown> }).schedule;
    await browser.storage.local.set({ settings: { producer: 'Me' } });
    await patchStore({ key: 'settings', patch: { schedule: { mode: 'week', perWeek: 4, from: '08:00', to: '12:00', seed: 77, anchor: '2026-10-13T19:00' } } });
    const good = { ...defaultSettings().schedule, mode: 'week', perWeek: 4, from: '08:00', to: '12:00', seed: 77, anchor: '2026-10-13T19:00' };
    expect(await stored()).toEqual(good);
    for (const bad of [
      { mode: 'month' }, { perWeek: 0 }, { perWeek: 8 }, { perWeek: 2.5 }, { perWeek: '3' }, { seed: Number.NaN }, { seed: Infinity }, { seed: '1' },
      { from: '8:00' }, { to: '25:00' }, { anchor: 7 },
      { from: '12:00' }, { from: '11:50' }, { to: '08:00' }, { to: '08:14' }, { from: '13:00', to: '12:00' }, // no window left
    ]) await patchStore({ key: 'settings', patch: { schedule: bad } } as never);
    expect(await stored()).toEqual(good);
    await patchStore({ key: 'settings', patch: { schedule: { from: '11:45', mode: 'every' } } });
    expect(await stored()).toEqual({ ...good, from: '11:45', mode: 'every' });
  });

  it('a window end alone is checked against the default other end while none is stored', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me' } });
    await patchStore({ key: 'settings', patch: { schedule: { from: '21:30' } } });
    expect(((await browser.storage.local.get('settings')).settings as { schedule: object }).schedule).toEqual(defaultSettings().schedule);
    await patchStore({ key: 'settings', patch: { schedule: { from: '20:00' } } });
    expect(((await browser.storage.local.get('settings')).settings as { schedule: object }).schedule).toEqual({ ...defaultSettings().schedule, from: '20:00' });
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
  });

  // Review m1: chrome.runtime messages are JSON, so `value: undefined` arrives as no `value`.
  // Like the userscript's save(k, undefined) (a later load(k, d) gives d), it removes the key.
  it('set without a value, after the message boundary, removes the key; null is stored', async () => {
    const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v));
    await browser.storage.local.set({ 'trimRun:UC1': { active: true, items: [] }, logOpen: true });
    await claimsOpInOrder(wire({ op: 'set', key: 'trimRun:UC1', value: undefined }));
    expect(await browser.storage.local.get('trimRun:UC1')).toEqual({});
    const set = vi.spyOn(browser.storage.local, 'set'); // fakeBrowser reads a stored null back as undefined
    await claimsOpInOrder(wire({ op: 'set', key: 'logOpen', value: null }));
    expect(set).toHaveBeenCalledWith({ logOpen: null });
    set.mockRestore();
  });

  // Review I1: the song reducers index objects by videoId; '__proto__' would reach Object.prototype.
  it('a songs op cannot reach Object.prototype, and row fields must be strings', async () => {
    const wire = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
    const row = { song: 'S', artists: 'A', label: '', claimant: 'Co', type: 'audio', videoId: 'v1', video: 'PWN', impact: 'x' };
    for (const videoId of ['__proto__', 'constructor', 'prototype']) {
      await expect(claimsOpInOrder(wire({ op: 'songs', songs: { fn: 'record', rows: [{ ...row, videoId }], chName: 'C', now: 'n' } })))
        .rejects.toThrow('claims:op: malformed');
      await expect(claimsOpInOrder(wire({ op: 'songs', songs: { fn: 'trimmed', song: 'S', videoId } }))).rejects.toThrow('claims:op: malformed');
    }
    await claimsOpInOrder(wire({ op: 'songs', songs: { fn: 'record', rows: [row], chName: 'C', now: 'n' } }));
    await claimsOpInOrder(wire({ op: 'songs', songs: { fn: 'trimmed', song: 'S', videoId: 'v1' } }));
    const probe = {} as Record<string, unknown>;
    expect([probe.video, probe.impact, probe.status]).toEqual([undefined, undefined, undefined]);
    for (const bad of [{ artists: 5 }, { claimant: { x: 1 } }, { videoId: 7 }, { song: null }]) {
      await expect(claimsOpInOrder(wire({ op: 'songs', songs: { fn: 'record', rows: [{ ...row, ...bad }], chName: 'C', now: 'n' } })))
        .rejects.toThrow('claims:op: malformed');
    }
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

// Older builds kept every channel's queue in one 'queue' key; the first Studio tab whose
// channel is known moves it to that channel's key, one tab at a time.
describe('moving the old queue key', () => {
  const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
  const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
  const it1 = { id: 'v1', file: { name: '1.mp4' } };
  const it2 = { id: 'v2', file: { name: '2.mp4' } };

  it("moves the items ahead of the channel's own, removes the old key, and answers how many", async () => {
    await browser.storage.local.set({ queue: [it1, it2], [`queue:${A}`]: [{ id: 'a1' }] });
    expect(await moveLegacyQueueInOrder(A)).toBe(2);
    const got = await browser.storage.local.get(null);
    expect(got[`queue:${A}`]).toEqual([it1, it2, { id: 'a1' }]);
    expect('queue' in got).toBe(false);
  });

  it('two tabs at once: the first takes the items, the other gets none, nothing doubles', async () => {
    await browser.storage.local.set({ queue: [it1, it2] });
    expect(await Promise.all([moveLegacyQueueInOrder(A), moveLegacyQueueInOrder(B)])).toEqual([2, 0]);
    const got = await browser.storage.local.get(null);
    expect(got[`queue:${A}`]).toEqual([it1, it2]);
    expect(`queue:${B}` in got).toBe(false);
    expect('queue' in got).toBe(false);
  });

  it('nothing to move: answers 0 and writes nothing; an empty old list is just removed', async () => {
    const set = vi.spyOn(browser.storage.local, 'set');
    expect(await moveLegacyQueueInOrder(A)).toBe(0);
    await browser.storage.local.set({ queue: [] });
    set.mockClear();
    expect(await moveLegacyQueueInOrder(A)).toBe(0);
    expect(set).not.toHaveBeenCalled();
    expect('queue' in (await browser.storage.local.get(null))).toBe(false);
    set.mockRestore();
  });

  it('an old key it does not understand is left alone', async () => {
    await browser.storage.local.set({ queue: { not: 'a list' } });
    expect(await moveLegacyQueueInOrder(A)).toBe(0);
    expect((await browser.storage.local.get('queue')).queue).toEqual({ not: 'a list' });
  });
});
