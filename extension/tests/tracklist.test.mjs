import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as S from '../lib/tracklist';

test('parseTime reads mm:ss and hh:mm:ss', () => {
  assert.equal(S.parseTime('02:30'), 150);
  assert.equal(S.parseTime('01:00:00'), 3600);
  assert.equal(S.parseTime('1:02:03'), 3723);
});

test('fixTracklist removes a track that is mostly cut and shifts the ones after it', () => {
  const r = S.fixTracklist('00:00 A\n01:00 B\n02:00 C', [[60, 120]], 180);
  assert.equal(r.text, '00:00 A\n01:00 C');
  assert.deepEqual(r.removed, ['B']);
  assert.equal(r.kept, 2);
});

test('fixTracklist keeps a track that is cut by less than half', () => {
  const r = S.fixTracklist('00:00 A\n01:40 B', [[0, 40]], 200);
  // A runs 0-100 and loses 40s (40%), so it stays; B shifts back by the same 40s
  assert.equal(r.text, '00:00 A\n01:00 B');
  assert.deepEqual(r.removed, []);
  assert.equal(r.kept, 2);
});

test('fixTracklist forces the first surviving chapter to 00:00', () => {
  // YouTube rejects a chapter list that does not start at zero
  const r = S.fixTracklist('00:00 A\n01:00 B', [[0, 60]], 120);
  assert.deepEqual(r.removed, ['A']);
  assert.ok(r.text.startsWith('00:00 B'), r.text);
});

test('fixTracklist merges overlapping claim segments instead of double-counting them', () => {
  const r = S.fixTracklist('00:00 A\n01:40 B', [[10, 40], [20, 50]], 200);
  // merged to a single 10-50 cut = 40s removed, so B lands at 100-40 = 60s
  assert.equal(r.text, '00:00 A\n01:00 B');
});

test('fixTracklist switches to hh:mm:ss once the video runs past an hour', () => {
  const r = S.fixTracklist('00:00 A\n01:00:00 B', [], 4000);
  assert.equal(r.text, '00:00:00 A\n01:00:00 B');
});

test('fixTracklist stays on mm:ss for a short video', () => {
  const r = S.fixTracklist('00:00 A\n02:00 B', [], 240);
  assert.equal(r.text, '00:00 A\n02:00 B');
});

test('fixTracklist keeps the separator each line used', () => {
  const r = S.fixTracklist('00:00 - A\n02:00 - B', [], 240);
  assert.equal(r.text, '00:00 - A\n02:00 - B');
});

test('fixTracklist leaves lines that are not timestamped alone', () => {
  const r = S.fixTracklist('Tracklist:\n00:00 A\n02:00 B', [], 240);
  assert.equal(r.text, 'Tracklist:\n00:00 A\n02:00 B');
  assert.equal(r.kept, 2);
});

test('fixTracklist handles no segments and no video length', () => {
  const r = S.fixTracklist('00:00 A', [], 0);
  assert.equal(r.text, '00:00 A');
  assert.equal(r.kept, 1);
  assert.deepEqual(r.removed, []);
});

test('fixTracklist returns empty output for empty input', () => {
  const r = S.fixTracklist('', [[0, 10]], 100);
  assert.equal(r.text, '');
  assert.equal(r.kept, 0);
});
