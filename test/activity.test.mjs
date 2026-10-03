import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from './harness.mjs';

test('parseUploadPct reads the percentage out of Studio\'s English string', () => {
  assert.equal(S.parseUploadPct('Uploading 45% … 3 minutes left'), 0.45);
});

test('parseUploadPct reads the Thai string', () => {
  assert.equal(S.parseUploadPct('กำลังอัปโหลด 45% · เหลืออีก 3 นาที'), 0.45);
});

test('parseUploadPct returns null when there is no percentage', () => {
  assert.equal(S.parseUploadPct('Upload complete'), null);
  assert.equal(S.parseUploadPct(''), null);
  assert.equal(S.parseUploadPct(undefined), null);
});

test('parseUploadPct handles the endpoints', () => {
  assert.equal(S.parseUploadPct('0%'), 0);
  assert.equal(S.parseUploadPct('100%'), 1);
});

test('parseUploadPct clamps a nonsense value instead of exceeding 1', () => {
  assert.equal(S.parseUploadPct('250%'), 1);
});

test('parseUploadPct tolerates a space before the sign', () => {
  assert.equal(S.parseUploadPct('Uploading 7 %'), 0.07);
});
