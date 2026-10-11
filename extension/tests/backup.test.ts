import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyBackup, BACKUP_SCHEMA, buildBackup, movePreview, parseBackup, writeBackup } from '../lib/backup';
import { MIGRATIONS, SCHEMA_VERSION } from '../lib/migrations';
import type { Preset } from '../lib/presets';
import { defaultSettings } from '../lib/settings';

beforeEach(() => fakeBrowser.reset());

const mine: Preset = { id: 'mine', label: 'Mine', title: '{name}', description: '', tags: ['a'], visibility: 'PUBLIC' };
const exported = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'yt-upload-presets', format: 1, version: '4.26.1', exportedAt: '2026-10-05T00:00:00.000Z',
    presets: [mine], activeId: 'mine', counters: { mine: 7, bad: 'x' },
    settings: { producer: 'Them', delay: 5, pace: 'slower', lockChannel: { id: 'UC1', name: 'X' }, lang: 'th', bogus: 1, notify: 'yes',
      schedule: { on: true, start: '2026-10-06T10:00', every: '3', unit: 'week' } },
    claimsCfg: { ownNames: 'THEIR LABEL', apEveryHours: '12', nested: { no: 1 } },
    ...over,
  });
const cur = () => ({ settings: { ...defaultSettings(), producer: 'Me', lang: 'en' as const }, cfg: { ownNames: 'MY LABEL' } });

describe('parseBackup', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, reason: 'json' });
  });
  it('rejects JSON that is not our backup', () => {
    expect(parseBackup('{"app":"other","presets":[]}')).toEqual({ ok: false, reason: 'notBackup' });
    expect(parseBackup(exported({ presets: [{ id: 'x' }] }))).toEqual({ ok: false, reason: 'notBackup' });
  });
  it('rejects a newer format', () => {
    expect(parseBackup(exported({ format: 2 }))).toEqual({ ok: false, reason: 'newerFormat', format: 2 });
  });
  it('cleans presets', () => {
    const r = parseBackup(exported({ presets: [{ id: 'p', label: 'P', tags: ['t', 3], visibility: 'NOPE', artistMax: '0' }] }));
    expect(r.ok && r.presets[0]).toMatchObject({ title: '{name}', description: '', tags: ['t'], artistPriority: [], artistMax: 4, visibility: 'PRIVATE' });
  });
});

describe('applyBackup', () => {
  const parsed = () => { const r = parseBackup(exported()); if (!r.ok) throw new Error('fixture'); return r; };

  it('someone else\'s file: general settings only, personal values kept', () => {
    const { data, presets } = parsed();
    const w = applyBackup(data, presets, false, cur());
    expect(w.presets.map((p) => p.id)).toEqual(['mine']);
    expect(w.activeId).toBe('mine');
    expect(w.schemaVersion).toBe(BACKUP_SCHEMA);
    expect(w.settings).toMatchObject({ producer: 'Me', delay: 5, pace: 'slower', lang: 'en', lockChannel: null });
    expect(w.settings?.schedule).toEqual(defaultSettings().schedule);
    expect(w.settings).not.toHaveProperty('bogus');
    expect(w.settings?.notify).toBe(true); // wrong type in the file is ignored
    expect(w.cfg).toEqual({ ownNames: 'MY LABEL', apEveryHours: '12' });
    expect(w.counters).toBeUndefined();
  });

  it('my own file: personal values too, schedule sanitized, counters filtered', () => {
    const { data, presets } = parsed();
    const w = applyBackup(data, presets, true, cur());
    expect(w.settings?.producer).toBe('Them');
    expect(w.settings?.schedule).toEqual({ on: true, start: '2026-10-06T10:00', every: 3, unit: 'day' });
    expect(w.cfg?.ownNames).toBe('THEIR LABEL');
    expect(w.counters).toEqual({ mine: 7 });
  });

  it('falls back to the first preset when activeId is unknown', () => {
    const r = parseBackup(exported({ activeId: 'gone' }));
    if (!r.ok) throw new Error('fixture');
    expect(applyBackup(r.data, r.presets, false, cur()).activeId).toBe('mine');
  });

  it('a v4.28.0 export whose main preset is a pattern learnt from a video lands on the first preset', () => {
    const r = parseBackup(exported({ version: '4.28.0', activeId: 'v:dQw4w9WgXcQ' }));
    if (!r.ok) throw new Error('fixture');
    expect(applyBackup(r.data, r.presets, true, cur()).activeId).toBe('mine');
  });

  it('a key every object has (__proto__, constructor…) is not taken as a setting, a copyright setting or an EP number', () => {
    const text = exported().replace('"settings":{', '"settings":{"__proto__":{"polluted":1},"constructor":{"x":1},')
      .replace('"claimsCfg":{', '"claimsCfg":{"__proto__":"x","constructor":"x","toString":"x",')
      .replace('"counters":{', '"counters":{"__proto__":5,"constructor":6,');
    const r = parseBackup(text);
    if (!r.ok) throw new Error('fixture');
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(Object.getPrototypeOf(w.settings)).toBe(Object.prototype);
    expect(Object.keys(w.settings!).sort()).toEqual(Object.keys(cur().settings).sort());
    expect(Object.getOwnPropertyNames(w.cfg)).toEqual(['ownNames', 'apEveryHours']);
    expect(Object.getOwnPropertyNames(w.counters)).toEqual(['mine']);
  });

  it('keeps cur.settings.lang and ignores the file\'s lang', () => {
    const { data, presets } = parsed();
    expect(applyBackup(data, presets, true, cur()).settings?.lang).toBe('en'); // file says 'th'
  });
});

describe('the move file', () => {
  const up = (file: string, date: string, over: Record<string, unknown> = {}) =>
    ({ date, channel: 'UC1', channelName: 'One', videoId: '', title: 'T ' + file, file, size: 10, txt: '', description: '', publishAt: null, visibility: 'PUBLIC', ...over });
  const move = (m: Record<string, unknown>) => {
    const r = parseBackup(exported({ move: m }));
    if (!r.ok) throw new Error('fixture');
    return r;
  };

  it('my file: upload history is added to what is there, newest first, 1000 at most', () => {
    // the file's rows are out of order, and one is newer than what is stored
    const r = move({ uploads: [up('a.mp4', '2026-10-01T00:00:00.000Z'), up('d.mp4', '2026-10-04T00:00:00.000Z'), up('b.mp4', '2026-10-02T00:00:00.000Z')] });
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: [up('c.mp4', '2026-10-03T00:00:00.000Z')] as never });
    expect(w.uploads!.map((u) => u.file)).toEqual(['d.mp4', 'c.mp4', 'b.mp4', 'a.mp4']);
    const many = move({ uploads: Array.from({ length: 1200 }, (_, i) => up(`v${i}.mp4`, new Date(Date.UTC(2020, 0, 1) + i * 1000).toISOString())) });
    // v0 is the oldest and comes first in the file: the oldest 200 are the ones cut
    const kept = applyBackup(many.data, many.presets, true, cur()).uploads!;
    expect(kept).toHaveLength(1000);
    expect(kept[0]!.file).toBe('v1199.mp4');
    expect(kept.at(-1)!.file).toBe('v200.mp4');
    expect(kept.some((u) => u.file === 'v0.mp4')).toBe(false);
  });

  it('a row without a video id is kept: the "already uploaded" warning goes by file, size and channel', () => {
    const r = move({ uploads: [up('a.mp4', '2026-10-01T00:00:00.000Z', { videoId: '' })] });
    expect(applyBackup(r.data, r.presets, true, cur()).uploads).toEqual([up('a.mp4', '2026-10-01T00:00:00.000Z')]);
  });

  it('the same upload is taken once: by video id when it has one, otherwise by date, channel, file and size', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ uploads: [
      up('a.mp4', d, { videoId: 'vidA', title: 'from the file' }), // same video id as a stored row
      up('b.mp4', d),                                              // same date, channel, file, size as a stored row
      up('b.mp4', d, { size: 11 }),                                // another size: another upload
      up('b.mp4', d, { channel: 'UC2' }),                          // another channel: another upload
      up('c.mp4', d), up('c.mp4', d),                              // twice in the file
    ] });
    const have = [up('a-renamed.mp4', d, { videoId: 'vidA', title: 'already here' }), up('b.mp4', d)];
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: have as never });
    expect(w.uploads).toHaveLength(5);
    expect(w.uploads!.find((u) => u.videoId === 'vidA')!.title).toBe('already here'); // what is stored wins
    expect(w.uploads!.filter((u) => u.file === 'b.mp4')).toHaveLength(3);
    expect(w.uploads!.filter((u) => u.file === 'c.mp4')).toHaveLength(1);
  });

  it('a row that is not an upload record is left out, and odd fields are made safe', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ uploads: [up('ok.mp4', d, { size: 'big', publishAt: 'soon', extra: { x: 1 }, videoId: 7 }), { videoId: 'x' }, null, 'x', up('', d), up('nodate.mp4', ''), up('nochannel.mp4', d, { channel: '' })] });
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(w.uploads).toEqual([up('ok.mp4', d, { size: 0 })]);
  });

  it('a row needs a date as the script writes it and a real channel id; a video id that is not one is dropped, the row kept', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ uploads: [
      up('tomorrow.mp4', 'tomorrow'), up('zzz.mp4', 'zzzz'), up('local.mp4', '10/1/2026, 9:00:00 AM'), // would sort above every real date
      up('month99.mp4', '2026-99-99T99:99:99.999Z'), up('feb30.mp4', '2026-02-30T00:00:00.000Z'), up('zero.mp4', '0000-00-00T00:00:00.000Z'), // the right shape, not a date
      up('ch.mp4', d, { channel: 'not an id!' }), up('proto.mp4', d, { channel: '__proto__' }), up('ctor.mp4', d, { channel: 'constructor' }),
      up('vid.mp4', d, { videoId: 'x"><script>' }), up('vidproto.mp4', d, { videoId: '__proto__' }),
    ] });
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(w.uploads).toEqual([up('vid.mp4', d), up('vidproto.mp4', d)]);
  });

  it('a stored row carries only the fields of an upload record, as its own keys', () => {
    const text = exported().replace(/\}$/, `,"move":{"uploads":[{"__proto__":{"polluted":1},"constructor":"x","date":"2026-10-01T00:00:00.000Z","channel":"UC1","file":"a.mp4"}],"channels":[{"__proto__":{"polluted":1},"id":"UC2","name":"Two"}]}}`);
    const r = parseBackup(text);
    if (!r.ok) throw new Error('fixture');
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(Object.keys(w.uploads![0]!).sort()).toEqual(['channel', 'channelName', 'date', 'description', 'file', 'publishAt', 'size', 'title', 'txt', 'videoId', 'visibility']);
    expect(Object.getPrototypeOf(w.uploads![0])).toBe(Object.prototype);
    expect(Object.keys(w.channels![0]!).sort()).toEqual(['avatar', 'handle', 'id', 'name']);
    expect(Object.getPrototypeOf(w.channels![0])).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('my file: channels are added after the ones already known; only real channel ids and https avatars', () => {
    const r = move({ channels: [
      { id: 'UC2', name: 'Two', avatar: 'https://yt3.ggpht.com/x', handle: '@two' },
      { id: 'UC1', name: 'One, from the file', avatar: '', handle: '' },
      { id: 'UC3', name: 'Three', avatar: 'javascript:alert(1)', handle: 7 },
      { id: 'not an id!', name: 'Bad' }, null,
    ] });
    const w = applyBackup(r.data, r.presets, true, { ...cur(), channels: [{ id: 'UC1', name: 'One', avatar: '', handle: '@one' }] });
    expect(w.channels).toEqual([
      { id: 'UC1', name: 'One', avatar: '', handle: '@one' },
      { id: 'UC2', name: 'Two', avatar: 'https://yt3.ggpht.com/x', handle: '@two' },
      { id: 'UC3', name: 'Three', avatar: '', handle: '' },
    ]);
  });

  // The userscript's "add a channel by id" stores a channel with no name (user.js 3373), and so
  // does the panel's (panel/channels.ts withChannel); it gets its name when opened in Studio.
  it('a channel without a name is kept, as the panel itself stores one; a named one in the file fills in a nameless stored one', () => {
    const r = move({ channels: [{ id: 'UC4' }, { id: 'UC5', name: '', avatar: '' }, { id: 'UC6', name: 7 }, { id: 'UC1', name: 'One', avatar: 'https://yt3.ggpht.com/1', handle: '@one' }, { id: 'UC2' }] });
    const have = [{ id: 'UC1', name: '', avatar: '', handle: '' }, { id: 'UC2', name: 'Two', avatar: '', handle: '@two' }];
    expect(applyBackup(r.data, r.presets, true, { ...cur(), channels: have }).channels).toEqual([
      { id: 'UC1', name: 'One', avatar: 'https://yt3.ggpht.com/1', handle: '@one' }, // filled in, in its place
      { id: 'UC2', name: 'Two', avatar: '', handle: '@two' },                        // a stored name is never emptied
      { id: 'UC4', name: '', avatar: '', handle: '' }, { id: 'UC5', name: '', avatar: '', handle: '' }, { id: 'UC6', name: '', avatar: '', handle: '' },
    ]);
    expect(movePreview(r.data)!.channels).toBe(5);
  });

  it('a publish time that is not a date is dropped, the row kept', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ uploads: [up('a.mp4', d, { publishAt: 1e300 }), up('b.mp4', d, { publishAt: -8.64e15 - 1 }), up('c.mp4', d, { publishAt: 8.64e15 }), up('d.mp4', d, { publishAt: 1790000000000 })] });
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(w.uploads!.map((u) => [u.file, u.publishAt])).toEqual([['a.mp4', null], ['b.mp4', null], ['c.mp4', 8.64e15], ['d.mp4', 1790000000000]]);
  });

  it('a row dated more than a day after now is refused: it would sit on top for ever', () => {
    const now = Date.parse('2026-10-12T12:00:00.000Z');
    const r = move({ uploads: [up('far.mp4', '9999-12-31T23:59:59.999Z'), up('late.mp4', '2026-10-13T12:00:00.001Z'), up('edge.mp4', '2026-10-13T12:00:00.000Z'), up('past.mp4', '2026-10-01T00:00:00.000Z')] });
    expect(applyBackup(r.data, r.presets, true, cur(), now).uploads!.map((u) => u.file)).toEqual(['edge.mp4', 'past.mp4']);
    expect(movePreview(r.data, now)!.uploads).toBe(2);
    expect(movePreview(r.data, Date.parse('2026-09-01T00:00:00.000Z'))!.uploads).toBe(0);
  });

  it('damaged stored history or channels do not stop the import: a non-list counts as empty, a row of the wrong shape is skipped', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ uploads: [up('a.mp4', d)], channels: [{ id: 'UC2', name: 'Two' }] });
    const two = { id: 'UC2', name: 'Two', avatar: '', handle: '' };
    let w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: 'junk' as never, channels: { 0: 'x' } as never });
    expect(w.uploads).toEqual([up('a.mp4', d)]);
    expect(w.channels).toEqual([two]);
    const stored = up('s.mp4', '2026-10-02T00:00:00.000Z');
    const one = { id: 'UC1', name: 'One', avatar: '', handle: '' };
    w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: [null, 'x', 7, { videoId: 'v' }, { date: 5, channel: 'UC1', file: 'n.mp4' }, stored] as never, channels: [null, 'x', { name: 'no id' }, { id: 7 }, one] as never });
    expect(w.uploads).toEqual([stored, up('a.mp4', d)]);
    expect(w.channels).toEqual([one, two]);
  });

  it('an avatar is a link that parses as https, stored as parsed, nothing else; a channel id is never a prototype name', () => {
    const r = move({ channels: [
      { id: 'UC5', name: 'http', avatar: 'http://yt3.ggpht.com/x' }, { id: 'UC6', name: 'data', avatar: 'data:image/svg+xml,<svg/>' },
      { id: 'UC7', name: 'upper', avatar: 'HTTPS://yt3.ggpht.com/x' }, { id: 'UC8', name: 'broken', avatar: 'https://' },
      { id: 'UC9', name: 'spaced', avatar: ' https://yt3.ggpht.com/x' },
      { id: '__proto__', name: 'Proto' }, { id: 'constructor', name: 'Ctor' }, { id: 'toString', name: 'Str' },
    ] });
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(w.channels!.map((c) => [c.id, c.avatar])).toEqual([['UC5', ''], ['UC6', ''], ['UC7', 'https://yt3.ggpht.com/x'], ['UC8', ''], ['UC9', 'https://yt3.ggpht.com/x']]);
  });

  it('my file: the language comes along; any other value does not', () => {
    const th = move({ lang: 'th' });
    expect(applyBackup(th.data, th.presets, true, cur()).settings?.lang).toBe('th');
    const bad = move({ lang: 'fr' });
    expect(applyBackup(bad.data, bad.presets, true, cur()).settings?.lang).toBe('en');
    // a file with no settings of its own still brings its language, on top of the current settings
    const bare = parseBackup(exported({ settings: undefined, move: { lang: 'th' } }));
    if (!bare.ok) throw new Error('fixture');
    expect(applyBackup(bare.data, bare.presets, true, cur()).settings).toEqual({ ...cur().settings, lang: 'th' });
  });

  it("someone else's file: nothing of the move part is taken", () => {
    const r = move({ lang: 'th', uploads: [up('a.mp4', '2026-10-01T00:00:00.000Z')], channels: [{ id: 'UC2', name: 'Two', avatar: '', handle: '' }] });
    const w = applyBackup(r.data, r.presets, false, cur());
    expect(w.uploads).toBeUndefined();
    expect(w.channels).toBeUndefined();
    expect(w.settings?.lang).toBe('en');
  });

  it('a file without a move part writes neither key', () => {
    const r = parseBackup(exported());
    if (!r.ok) throw new Error('fixture');
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: [up('c.mp4', '2026-10-03T00:00:00.000Z')] as never });
    expect('uploads' in w).toBe(false);
    expect('channels' in w).toBe(false);
    expect(movePreview(r.data)).toBeNull();
  });

  it('a move part of the wrong shape is ignored, piece by piece', () => {
    for (const m of [[], 'x', 7, null]) {
      const r = parseBackup(exported({ move: m }));
      if (!r.ok) throw new Error('fixture');
      const w = applyBackup(r.data, r.presets, true, cur());
      expect('uploads' in w).toBe(false);
      expect(movePreview(r.data)).toBeNull();
    }
    const r = move({ uploads: { length: 1, 0: up('a.mp4', '2026-10-01T00:00:00.000Z') }, channels: 'UC2', lang: ['th'] });
    const w = applyBackup(r.data, r.presets, true, cur());
    expect('uploads' in w).toBe(false);
    expect('channels' in w).toBe(false);
    expect(w.settings?.lang).toBe('en');
    expect(movePreview(r.data)).toEqual({ uploads: 0, channels: 0, lang: null });
  });

  it('the preview counts what would be imported, not what the file holds', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ lang: 'th', uploads: [up('a.mp4', d), up('a.mp4', d), null, up('', d)], channels: [{ id: 'UC2', name: 'Two' }, { id: 'bad id!' }] });
    expect(movePreview(r.data)).toEqual({ uploads: 1, channels: 1, lang: 'th' });
    expect(movePreview(move({ lang: 'fr' }).data)).toEqual({ uploads: 0, channels: 0, lang: null });
  });
});

describe('writeBackup', () => {
  it('writes the keys and later migrations leave the imported presets alone', async () => {
    const r = parseBackup(exported());
    if (!r.ok) throw new Error('fixture');
    await writeBackup(applyBackup(r.data, r.presets, true, cur()));
    const got = await browser.storage.local.get(['presets', 'activeId', 'schemaVersion']);
    expect((got.presets as Preset[]).map((p) => p.id)).toEqual(['mine']);
    expect(got.activeId).toBe('mine');
    expect(got.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('runs a migration step added after BACKUP_SCHEMA on the imported data', async () => {
    const r = parseBackup(exported());
    if (!r.ok) throw new Error('fixture');
    let ran = false;
    MIGRATIONS.push({ async run() { ran = true; } });
    try {
      await writeBackup(applyBackup(r.data, r.presets, true, cur()));
    } finally {
      MIGRATIONS.pop();
    }
    expect(ran).toBe(true);
  });
});

describe('buildBackup', () => {
  it('round-trips through parseBackup and leaves out the locked channel and language', () => {
    const settings = { ...defaultSettings(), producer: 'Me', lockChannel: { id: 'UC1', name: 'X' }, lang: 'th' as const };
    const file = buildBackup({ presets: [mine], activeId: 'mine', counters: { mine: 2 }, settings, cfg: { ownNames: 'MY' } }, '5.0.0', new Date('2026-10-05T00:00:00Z'));
    expect(file).toMatchObject({ app: 'yt-upload-presets', format: 1, version: '5.0.0', exportedAt: '2026-10-05T00:00:00.000Z' });
    expect(file.settings).not.toHaveProperty('lockChannel');
    expect(file.settings).not.toHaveProperty('lang');
    const r = parseBackup(JSON.stringify(file));
    expect(r.ok && r.presets).toEqual([{ ...mine, artistPriority: [], artistMax: 4 }]);
  });
});
