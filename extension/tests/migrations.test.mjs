import { test } from 'vitest';
import assert from 'node:assert/strict';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { runMigrations } from '../lib/migrations';
import { defaultPresets } from '../lib/presets';
import { load } from '../lib/storage';

// Runs the migrations against a fresh fake chrome.storage and hands back what they wrote.
async function migrate(initial = {}) {
  fakeBrowser.reset();
  await browser.storage.local.set(initial);
  await runMigrations();
  const store = await browser.storage.local.get(null);
  return { store, presets: await load('presets', defaultPresets()), DEFAULT_PRESETS: defaultPresets() };
}

const OLD_TRAPSOUL_TITLE = 'TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}';

test('a fresh install skips every migration and just records the schema version', async () => {
  const { store, DEFAULT_PRESETS } = await migrate({});
  assert.equal(store.schemaVersion, 4);
  assert.equal(store.presets, undefined, 'nothing written: the defaults are already right');
  assert.equal(store.settings, undefined, 'a new user does not inherit the old producer name');
  assert.equal(store.cfg, undefined, 'a new user does not inherit the old label names');
  assert.ok(DEFAULT_PRESETS.length > 0);
});

test('an install from before the schema version runs every outstanding step', async () => {
  const { store, presets } = await migrate({ presets: [{ id: 'mine', label: 'Mine', title: '{name}' }] });
  assert.equal(store.schemaVersion, 4);
  assert.ok(presets.some((p) => p.id === 'playlist'), 'playlist preset added');
  assert.ok(presets.some((p) => p.id === 'trapsoul'), 'trapsoul preset added');
  assert.ok(presets.some((p) => p.id === 'mine'), 'the user preset survives');
  assert.equal(store.activeId, 'trapsoul');
  assert.equal(store.settings.producer, 'ThaiBeats');
  assert.equal(store.cfg.ownNames, 'THAIBEATS, EXMGE');
});

test('the old addedPlaylist / addedTrapsoul flags are read as "already done"', async () => {
  const { store, presets } = await migrate({
    presets: [{ id: 'mine', label: 'Mine', title: '{name}' }],
    activeId: 'mine',
    addedPlaylist: true,
    addedTrapsoul: true,
  });
  assert.equal(presets.length, 1, 'presets are not re-added');
  assert.equal(store.activeId, 'mine', 'the chosen main preset is not reset to trapsoul');
  assert.equal(store.settings.producer, 'ThaiBeats', 'the later steps still run');
});

test('an already-migrated install is left completely alone', async () => {
  const before = {
    presets: [{ id: 'mine', label: 'Mine', title: '{name}' }],
    activeId: 'mine',
    schemaVersion: 4,
    settings: { producer: 'Someone Else' },
  };
  const { store } = await migrate(before);
  assert.equal(store.settings.producer, 'Someone Else');
  assert.equal(store.activeId, 'mine');
});

test('a migrated install that already set its own producer name keeps it', async () => {
  const { store } = await migrate({
    presets: [{ id: 'mine', label: 'Mine' }],
    addedPlaylist: true,
    addedTrapsoul: true,
    settings: { producer: 'My Own Name' },
    cfg: { ownNames: 'MY LABEL' },
  });
  assert.equal(store.settings.producer, 'My Own Name');
  assert.equal(store.cfg.ownNames, 'MY LABEL');
});

test('the pre-[[ ]] trapsoul strings are rewritten once', async () => {
  const { presets } = await migrate({
    presets: [{ id: 'trapsoul', label: 'TrapSoul', title: OLD_TRAPSOUL_TITLE, description: 'Tracklist:\n{txt}' }],
    addedPlaylist: true,
    addedTrapsoul: true,
  });
  const p = presets.find((x) => x.id === 'trapsoul');
  assert.equal(p.title, 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}');
  assert.equal(p.description, '[[Tracklist:\n{txt}]]');
});

test('running the migrations twice changes nothing the second time', async () => {
  const first = await migrate({ presets: [{ id: 'mine', label: 'Mine', title: '{name}' }] });
  const second = await migrate(first.store);
  assert.deepEqual(second.store, first.store);
});

test('a preset list that is already wrapped in [[ ]] is not double-wrapped', async () => {
  const wrapped = '[[Tracklist:\n{txt}]]';
  const { presets } = await migrate({
    presets: [{ id: 'trapsoul', label: 'T', title: 'TrapSoul Mix[[ | {artists}]]', description: wrapped }],
    addedPlaylist: true,
    addedTrapsoul: true,
  });
  assert.equal(presets.find((x) => x.id === 'trapsoul').description, wrapped);
});
