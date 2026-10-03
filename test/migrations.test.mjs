import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from './harness.mjs';

const OLD_TRAPSOUL_TITLE = 'TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}';

test('a fresh install skips every migration and just records the schema version', () => {
  const { store, DEFAULT_PRESETS } = migrate({});
  assert.equal(store.schemaVersion, 4);
  assert.equal(store.presets, undefined, 'nothing written: the defaults are already right');
  assert.equal(store.settings, undefined, 'a new user does not inherit the old producer name');
  assert.equal(store.cfg, undefined, 'a new user does not inherit the old label names');
  assert.ok(DEFAULT_PRESETS.length > 0);
});

test('an install from before the schema version runs every outstanding step', () => {
  const { store, presets } = migrate({ presets: [{ id: 'mine', label: 'Mine', title: '{name}' }] });
  assert.equal(store.schemaVersion, 4);
  assert.ok(presets.some((p) => p.id === 'playlist'), 'playlist preset added');
  assert.ok(presets.some((p) => p.id === 'trapsoul'), 'trapsoul preset added');
  assert.ok(presets.some((p) => p.id === 'mine'), 'the user preset survives');
  assert.equal(store.activeId, 'trapsoul');
  assert.equal(store.settings.producer, 'ThaiBeats');
  assert.equal(store.cfg.ownNames, 'THAIBEATS, EXMGE');
});

test('the old addedPlaylist / addedTrapsoul flags are read as "already done"', () => {
  const { store, presets } = migrate({
    presets: [{ id: 'mine', label: 'Mine', title: '{name}' }],
    activeId: 'mine',
    addedPlaylist: true,
    addedTrapsoul: true,
  });
  assert.equal(presets.length, 1, 'presets are not re-added');
  assert.equal(store.activeId, 'mine', 'the chosen main preset is not reset to trapsoul');
  assert.equal(store.settings.producer, 'ThaiBeats', 'the later steps still run');
});

test('an already-migrated install is left completely alone', () => {
  const before = {
    presets: [{ id: 'mine', label: 'Mine', title: '{name}' }],
    activeId: 'mine',
    schemaVersion: 4,
    settings: { producer: 'Someone Else' },
  };
  const { store } = migrate(before);
  assert.equal(store.settings.producer, 'Someone Else');
  assert.equal(store.activeId, 'mine');
});

test('a migrated install that already set its own producer name keeps it', () => {
  const { store } = migrate({
    presets: [{ id: 'mine', label: 'Mine' }],
    addedPlaylist: true,
    addedTrapsoul: true,
    settings: { producer: 'My Own Name' },
    cfg: { ownNames: 'MY LABEL' },
  });
  assert.equal(store.settings.producer, 'My Own Name');
  assert.equal(store.cfg.ownNames, 'MY LABEL');
});

test('the pre-[[ ]] trapsoul strings are rewritten once', () => {
  const { presets } = migrate({
    presets: [{ id: 'trapsoul', label: 'TrapSoul', title: OLD_TRAPSOUL_TITLE, description: 'Tracklist:\n{txt}' }],
    addedPlaylist: true,
    addedTrapsoul: true,
  });
  const p = presets.find((x) => x.id === 'trapsoul');
  assert.equal(p.title, 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}');
  assert.equal(p.description, '[[Tracklist:\n{txt}]]');
});

test('running the migrations twice changes nothing the second time', () => {
  const first = migrate({ presets: [{ id: 'mine', label: 'Mine', title: '{name}' }] });
  const second = migrate(first.store);
  assert.deepEqual(second.store, first.store);
});

test('a preset list that is already wrapped in [[ ]] is not double-wrapped', () => {
  const wrapped = '[[Tracklist:\n{txt}]]';
  const { presets } = migrate({
    presets: [{ id: 'trapsoul', label: 'T', title: 'TrapSoul Mix[[ | {artists}]]', description: wrapped }],
    addedPlaylist: true,
    addedTrapsoul: true,
  });
  assert.equal(presets.find((x) => x.id === 'trapsoul').description, wrapped);
});
