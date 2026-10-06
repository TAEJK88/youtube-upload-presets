import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as S from '../lib/activity';

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

const IDLE_Q = { running: false, inFlight: false, total: 0, done: 0, errors: 0 };
const BUSY_CLAIMS = { kind: 'busy', icon: '✂️', title: 'Trimming claim 2 of 5', detail: 'some video', progress: 0.4 };

test('activityFrom returns null when nothing is running', () => {
  assert.equal(S.activityFrom(IDLE_Q, null, null), null);
});

test('activityFrom reports the upload while the queue runs', () => {
  const q = { running: true, inFlight: true, total: 12, done: 3, errors: 0 };
  const a = S.activityFrom(q, null, { pct: 0.45, text: 'Uploading 45%' });
  assert.equal(a.task, 'upload');
  assert.equal(a.tab, 'queue');
  assert.deepEqual(a.count, { at: 4, of: 12 });
  assert.equal(a.detail, 'Uploading 45%');
  assert.ok(Math.abs(a.progress - 0.2875) < 1e-9, `progress was ${a.progress}`);
});

test('activityFrom falls back to whole clips when the percentage is unreadable', () => {
  const q = { running: true, inFlight: true, total: 12, done: 3, errors: 0 };
  const a = S.activityFrom(q, null, { pct: null, text: '' });
  assert.equal(a.progress, 3 / 12);
  assert.equal(a.detail, '');
});

test('activityFrom counts errored clips in the title index but not the bar', () => {
  const q = { running: true, inFlight: true, total: 10, done: 2, errors: 3 };
  const a = S.activityFrom(q, null, { pct: null, text: '' });
  assert.deepEqual(a.count, { at: 6, of: 10 });
  assert.equal(a.progress, 2 / 10);
});

test('activityFrom lets the upload outrank a busy claims run', () => {
  const q = { running: true, inFlight: true, total: 2, done: 0, errors: 0 };
  assert.equal(S.activityFrom(q, BUSY_CLAIMS, null).task, 'upload');
});

test('activityFrom reports a claims run when the queue is idle', () => {
  const a = S.activityFrom(IDLE_Q, BUSY_CLAIMS, null);
  assert.equal(a.task, 'claims');
  assert.equal(a.tab, 'claims');
  assert.equal(a.icon, '✂️');
  assert.equal(a.title, 'Trimming claim 2 of 5');
  assert.equal(a.progress, 0.4);
  assert.equal(a.count, null);
});

test('activityFrom treats a waiting claims status as running', () => {
  const a = S.activityFrom(IDLE_Q, { kind: 'wait', icon: '⏳', title: 'Waiting', detail: '' }, null);
  assert.equal(a.task, 'claims');
  assert.equal(a.progress, null, 'no progress field means indeterminate');
});

test('activityFrom ignores idle and ok claims statuses', () => {
  assert.equal(S.activityFrom(IDLE_Q, { kind: 'idle', icon: '✓', title: 'Ready' }, null), null);
  assert.equal(S.activityFrom(IDLE_Q, { kind: 'ok', icon: '🤖', title: 'Auto-pilot is on' }, null), null);
});

test('activityFrom reports an in-flight clip even when running is false', () => {
  const q = { running: false, inFlight: true, total: 1, done: 0, errors: 0 };
  assert.equal(S.activityFrom(q, null, null).task, 'upload');
});

test('activityFrom gives indeterminate progress for an empty queue', () => {
  const q = { running: true, inFlight: false, total: 0, done: 0, errors: 0 };
  assert.equal(S.activityFrom(q, null, null).progress, null);
});
