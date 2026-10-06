import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyBackup, BACKUP_SCHEMA, buildBackup, parseBackup, writeBackup } from '../lib/backup';
import { MIGRATIONS, runMigrations, SCHEMA_VERSION } from '../lib/migrations';
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

  it('keeps cur.settings.lang and ignores the file\'s lang', () => {
    const { data, presets } = parsed();
    expect(applyBackup(data, presets, true, cur()).settings?.lang).toBe('en'); // file says 'th'
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
