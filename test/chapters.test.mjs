import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from './harness.mjs';

const ok = (desc, duration = 600) => S.checkTracklist(desc, desc.length, duration);
const VALID = '0:00 A\n0:10 B\n0:20 C';

test('fmtTs formats seconds as mm:ss and hh:mm:ss', () => {
  assert.equal(S.fmtTs(0), '0:00');
  assert.equal(S.fmtTs(90), '1:30');
  assert.equal(S.fmtTs(3661), '1:01:01');
});

test('a tracklist meeting every chapter rule reports nothing', () => {
  const r = ok(VALID);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.count, 3);
});

test('a description with no timestamps is not treated as chapters', () => {
  const r = ok('Just a description\nwith no times');
  assert.deepEqual(r.errors, []);
  assert.equal(r.count, 0);
});

test('the first timestamp must be 0:00', () => {
  const r = ok('0:05 A\n0:20 B\n0:40 C');
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /First timestamp must be 0:00/);
});

test('fewer than three chapters is an error', () => {
  const r = ok('0:00 A\n0:20 B');
  assert.ok(r.errors.some((e) => /at least 3 timestamps/.test(e)), r.errors.join(' | '));
});

test('a chapter shorter than ten seconds is an error', () => {
  const r = ok('0:00 A\n0:05 B\n0:20 C');
  assert.ok(r.errors.some((e) => /only 5s long/.test(e)), r.errors.join(' | '));
});

test('a chapter exactly ten seconds long is accepted', () => {
  assert.deepEqual(ok(VALID).errors, []);
});

test('timestamps must increase', () => {
  const r = ok('0:00 A\n0:30 B\n0:20 C');
  assert.ok(r.errors.length >= 1, 'out-of-order timestamps should error');
});

test('a timestamp past the end of the video is an error', () => {
  const r = ok('0:00 A\n0:10 B\n0:40 C', 30);
  assert.ok(r.errors.some((e) => /longer than the video|past|exceed/i.test(e)) || r.errors.length >= 1, r.errors.join(' | '));
});

test('a final chapter shorter than ten seconds is an error', () => {
  const r = ok('0:00 A\n0:10 B\n0:40 C', 45);
  assert.ok(r.errors.some((e) => /Last chapter/.test(e)), r.errors.join(' | '));
});

test('video length of zero skips the length checks', () => {
  assert.deepEqual(ok('0:00 A\n0:10 B\n0:40 C', 0).errors, []);
});

test('an impossible seconds value is an error, not a chapter', () => {
  const r = ok('0:00 A\n0:75 B\n0:90 C');
  assert.ok(r.errors.length >= 1, 'seconds above 59 should error');
});

test('a repeated song name is a warning, not an error', () => {
  const r = ok('0:00 Song A\n0:20 song a\n0:40 B');
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /Duplicate song/.test(w)), r.warnings.join(' | '));
});

test('a description over the character limit warns that the tail is cut', () => {
  const r = S.checkTracklist(VALID, 6000, 600);
  assert.ok(r.warnings.some((w) => /5000/.test(w)), r.warnings.join(' | '));
});

test('bracketed and parenthesised timestamps are recognised', () => {
  assert.equal(ok('[0:00] A\n[0:10] B\n[0:20] C').count, 3);
  assert.equal(ok('(0:00) A\n(0:10) B\n(0:20) C').count, 3);
});

test('hh:mm:ss timestamps are recognised', () => {
  const r = ok('0:00 A\n0:10 B\n1:00:00 C', 4000);
  assert.deepEqual(r.errors, []);
  assert.equal(r.count, 3);
});

test('fixChapters sets the first timestamp to 0:00 and keeps the rest of the line', () => {
  const r = S.fixChapters('Tracklist:\n00:05 A - One\n03:00 B\n06:00 C');
  assert.equal(r.text, 'Tracklist:\n0:00 A - One\n03:00 B\n06:00 C');
  assert.equal(r.changes.length, 1);
  assert.deepEqual(ok(r.text).errors, []);
});

test('fixChapters sorts timestamp lines without moving other lines', () => {
  const r = S.fixChapters('Intro text\n0:00 A\n6:00 C\nmiddle\n3:00 B');
  assert.equal(r.text, 'Intro text\n0:00 A\n3:00 B\nmiddle\n6:00 C');
  assert.deepEqual(ok(r.text).errors, []);
});

test('fixChapters keeps hh:mm:ss form for the first timestamp', () => {
  assert.equal(S.fixChapters('0:00:07 A\n0:10:00 B\n1:00:00 C').text, '0:00:00 A\n0:10:00 B\n1:00:00 C');
});

test('fixChapters reports nothing to fix for valid lists and text without times', () => {
  assert.deepEqual(S.fixChapters('0:00 A\n0:10 B\n0:20 C').changes, []);
  assert.deepEqual(S.fixChapters('no times here').changes, []);
});
