import { defaultPresets, type Preset } from './presets';
import { load, save } from './storage';

// Old trapsoul preset: clips without a .txt got "TrapSoul Mix | - ..." → wrap {artists} in [[ ]].
export function fixLegacyTrapsoulTitles(list: Preset[]): Preset[] {
  for (const p of list || []) {
    if (!p || p.id !== 'trapsoul') continue;
    if (p.title === 'TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}') p.title = 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}';
    if (typeof p.description === 'string') {
      p.description = p.description
        .replace('TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}', 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}')
        .replace('Tracklist:\n{txt}', '[[Tracklist:\n{txt}]]')
        .replace('[[[[Tracklist:', '[[Tracklist:').replace('{txt}]]]]', '{txt}]]');
    }
  }
  return list;
}

// Append new steps only — SCHEMA_VERSION follows the list length.
// legacy = the flag name used before schemaVersion existed (flag set = step already done).
interface Migration { legacy?: string; run(): Promise<void> }

export const MIGRATIONS: Migration[] = [
  { // 1: add the Playlist preset for existing installs
    legacy: 'addedPlaylist',
    async run() {
      const list = await load('presets', defaultPresets());
      if (!list.some((x) => x.id === 'playlist')) await save('presets', [defaultPresets()[1], ...list]);
    },
  },
  { // 2: add the TrapSoul preset and make it the main one
    legacy: 'addedTrapsoul',
    async run() {
      const list = await load('presets', defaultPresets());
      if (!list.some((x) => x.id === 'trapsoul')) await save('presets', [defaultPresets()[0], ...list]);
      await save('activeId', 'trapsoul');
    },
  },
  { // 3: wrap {artists} / {txt} of the old trapsoul preset in [[ ]]
    async run() { await save('presets', fixLegacyTrapsoulTitles(await load('presets', defaultPresets()))); },
  },
  { // 4: producer / label names that used to be hard-coded become settings (v4.5.0)
    legacy: 'migratedOwnNames',
    async run() {
      const s = await load<Record<string, unknown>>('settings', {});
      if (s.producer === undefined) await save('settings', { ...s, producer: 'ThaiBeats' });
      const c = await load<Record<string, unknown>>('cfg', {});
      if (c.ownNames === undefined) await save('cfg', { ...c, ownNames: 'THAIBEATS, EXMGE' });
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function runMigrations(): Promise<void> {
  // A fresh install skips every step: its defaults are already right.
  const freshInstall = (await load<unknown>('presets', undefined)) === undefined;
  if (freshInstall) return save('schemaVersion', SCHEMA_VERSION);
  let from = await load<number | null>('schemaVersion', null);
  if (from === null) {
    // Installed before schemaVersion existed: read how far the old flags got.
    from = 0;
    for (const [i, m] of MIGRATIONS.entries()) if (m.legacy && (await load(m.legacy, false))) from = i + 1;
  }
  for (let i = from; i < MIGRATIONS.length; i++) {
    const m = MIGRATIONS[i];
    if (m) {
      try { await m.run(); } catch (e) { console.error('[Upload Studio] migration ' + (i + 1), e); }
    }
  }
  await save('schemaVersion', SCHEMA_VERSION);
}
