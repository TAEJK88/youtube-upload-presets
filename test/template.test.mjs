import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, settings } from './harness.mjs';

test('render drops an [[ ]] block when a variable inside it is empty', () => {
  assert.equal(S.render('Mix[[ | {artists}]] {year}', { artists: '', year: '2026' }), 'Mix 2026');
  assert.equal(S.render('Mix[[ | {artists}]] {year}', { artists: 'SZA', year: '2026' }), 'Mix | SZA 2026');
});

test('render keeps an [[ ]] block only when every variable inside it is filled', () => {
  assert.equal(S.render('[[{a} and {b}]]', { a: 'x', b: '' }), '');
  assert.equal(S.render('[[{a} and {b}]]', { a: 'x', b: 'y' }), 'x and y');
});

test('render leaves an unknown variable in the text verbatim', () => {
  // this is why unknownVars() exists: a typo would otherwise be published as-is
  assert.equal(S.render('by {artist}', { artists: 'SZA' }), 'by {artist}');
});

test('render collapses three or more blank lines down to one', () => {
  assert.equal(S.render('a\n\n\n\nb', {}), 'a\n\nb');
});

test('unknownVars reports typos from the title, description and tags', () => {
  assert.deepEqual(S.unknownVars({ title: 'x {artist}', description: '', tags: [] }), ['{artist}']);
  assert.deepEqual(S.unknownVars({ title: '', description: '{trackcount} {nope}', tags: [] }), ['{nope}']);
  assert.deepEqual(S.unknownVars({ title: '', description: '', tags: ['{producer}', '{bogus}'] }), ['{bogus}']);
});

test('unknownVars is quiet when every variable is a known one', () => {
  const p = { title: '{name} {bpm}', description: '{txt} {producer}', tags: ['{year}', '{artists}'] };
  assert.deepEqual(S.unknownVars(p), []);
});

test('unknownVars reports each unknown name once', () => {
  assert.deepEqual(S.unknownVars({ title: '{oops} {oops}', description: '{oops}', tags: [] }), ['{oops}']);
});

test('clean strips the angle brackets YouTube rejects', () => {
  assert.equal(S.clean('a <b> c'), 'a b c');
});

test('buildVars pulls the BPM out of the filename and drops it from {name}', () => {
  const v = S.buildVars('Midnight_Drive 140bpm.mp4', 1);
  assert.equal(v.bpm, '140');
  assert.equal(v.name, 'Midnight Drive');
  assert.equal(v.filename, 'Midnight_Drive 140bpm');
});

test('buildVars leaves {bpm} empty when the filename has no BPM', () => {
  assert.equal(S.buildVars('Just A Name.mp4', 1).bpm, '');
});

test('buildVars honours the year override, and falls back to this year', () => {
  settings.year = '1999';
  assert.equal(S.buildVars('a.mp4', 1).year, '1999');
  settings.year = '';
  assert.equal(S.buildVars('a.mp4', 1).year, String(new Date().getFullYear()));
});

test('buildVars falls back to the channel name when no producer is set', () => {
  settings.producer = '';
  assert.equal(S.buildVars('a.mp4', 1).producer, 'Test Channel');
  settings.producer = 'ThaiBeats';
  assert.equal(S.buildVars('a.mp4', 1).producer, 'ThaiBeats');
  settings.producer = '';
});

test('parseTracks strips mm:ss and hh:mm:ss timestamps and leading track numbers', () => {
  const r = S.parseTracks('00:00 BLXD - One\n01:02:03 SZA - Two\n3. Kehlani - Three');
  assert.equal(r.track1, 'BLXD - One');
  assert.equal(r.trackcount, '3');
  assert.deepEqual(r.artistList, ['BLXD', 'SZA', 'Kehlani']);
});

test('parseTracks splits collaborators on x, ft., feat., & and commas', () => {
  const r = S.parseTracks('00:00 BLXD x Chris Brown - One\n01:00 SZA & Kehlani - Two\n02:00 A, B - Three');
  assert.deepEqual(r.artistList, ['BLXD', 'Chris Brown', 'SZA', 'Kehlani', 'A', 'B']);
});

test('parseTracks picks up a featured artist from the song title', () => {
  const r = S.parseTracks('00:00 BLXD - Waiting On Me (ft. Brent Faiyaz)');
  assert.deepEqual(r.artistList, ['BLXD', 'Brent Faiyaz']);
});

test('parseTracks orders artists by track count when no priority is given', () => {
  const r = S.parseTracks('00:00 BLXD - One\n01:00 SZA - Two\n02:00 BLXD - Three');
  assert.deepEqual(r.artistList, ['BLXD', 'SZA']);
});

test('parseTracks puts priority artists first, ignoring the ones not in the tracklist', () => {
  const r = S.parseTracks('00:00 BLXD - One\n01:00 SZA - Two\n02:00 BLXD - Three', ['SZA', 'Nobody']);
  assert.deepEqual(r.artistList, ['SZA', 'BLXD']);
});

test('parseTracks counts a line with no artist separator but takes no artist from it', () => {
  const r = S.parseTracks('00:00 Intro\n01:00 BLXD - One');
  assert.equal(r.trackcount, '2');
  assert.deepEqual(r.artistList, ['BLXD']);
});

test('parseTracks returns an empty trackcount for empty input', () => {
  const r = S.parseTracks('');
  assert.equal(r.trackcount, '');
  assert.equal(r.track1, '');
  assert.deepEqual(r.artistList, []);
});

test('makeTitle drops artists one at a time until the title fits in 100 chars', () => {
  const txt = ['00:00 Alexander Hamilton - A', '01:00 Benjamin Franklin - B',
    '02:00 Christopher Columbus - C', '03:00 Dwight Eisenhower - D'].join('\n');
  const p = { title: 'A Very Long Playlist Title Goes Here[[ | {artists}]] - Dark & Smokey R&B {year}', artistMax: 4 };
  const vars = S.buildVars('mix.mp4', 1, txt, { preset: p });
  assert.equal(vars._artists.length, 4);
  const t = S.makeTitle(p, vars);
  assert.ok(t.length <= S.TITLE_MAX, `title was ${t.length} chars: ${t}`);
  assert.ok(t.includes('Alexander Hamilton'), 'keeps the highest-priority artist');
  assert.ok(!t.includes('Dwight Eisenhower'), 'drops the last artist to fit');
});

test('makeTitle hard-truncates a title with no artists to spare', () => {
  const p = { title: 'x'.repeat(150) };
  const t = S.makeTitle(p, S.buildVars('a.mp4', 1, '', { preset: p }));
  assert.equal(t.length, S.TITLE_MAX);
});

test('renderTitle collapses runs of whitespace', () => {
  assert.equal(S.renderTitle('a   b\n\nc', {}), 'a b c');
});

test('renderTags splits on commas and " x ", dedupes and drops blanks', () => {
  const p = { tags: ['rnb', 'rnb', '{artists}', ' , ', 'a x b'] };
  assert.deepEqual(S.renderTags(p, { artists: 'SZA, Kehlani' }), ['rnb', 'SZA', 'Kehlani', 'a', 'b']);
});

test('renderDesc appends the .txt contents when the preset has no {txt}', () => {
  const p = { description: 'Hello' };
  assert.equal(S.renderDesc(p, { txt: 'one\ntwo' }), 'Hello\n\none\ntwo');
});

test('renderDesc does not append the .txt twice when {txt} is already used', () => {
  const p = { description: 'Tracklist:\n{txt}' };
  assert.equal(S.renderDesc(p, { txt: 'one' }), 'Tracklist:\none');
});

test('renderDesc caps the description at the YouTube limit', () => {
  const p = { description: 'y'.repeat(6000) };
  assert.equal(S.renderDesc(p, {}).length, S.DESC_MAX);
});
