import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInviter, C } from './harness.mjs';
import { mockStudio } from './mock-studio.mjs';

// Drive the real inviteCollaborators() against the mock and report both what the
// script concluded and what the mock actually persisted.
async function invite(opts, handles = ['@thaibeats']) {
  const { doc, page, truth } = mockStudio(opts);
  const api = makeInviter(doc);
  const res = await api.inviteCollaborators(handles, page);
  return { res, truth, outcome: C.inviteOutcome(res) };
}

test('happy path: the invite is saved and reported as done', async () => {
  const { res, truth, outcome } = await invite({ save: 'ok' });
  assert.deepEqual(res.links.map((x) => x.handle), ['@thaibeats']);
  assert.equal(res.saved, true);
  assert.deepEqual(truth.savedHandles, ['@thaibeats']);
  assert.equal(outcome.state, 'done');
});

test('THE BUG: a Save that never enables is reported as failed, not done', async () => {
  // v4.11.0 read the invite link, clicked a disabled Save, ignored the result
  // and reported success. Nothing reached YouTube.
  const { res, truth, outcome } = await invite({ save: 'stuck' });
  assert.deepEqual(res.links.map((x) => x.handle), ['@thaibeats'], 'the link is still read');
  assert.deepEqual(truth.savedHandles, [], 'nothing was persisted');
  assert.equal(res.saved, false);
  assert.equal(outcome.state, 'failed');
  assert.match(outcome.msg, /never became clickable/);
});

test('a Save that is clicked but leaves the dialog open is reported as failed', async () => {
  const { res, truth, outcome } = await invite({ save: 'noclose' });
  assert.equal(res.saved, false);
  assert.equal(outcome.state, 'failed');
  assert.match(outcome.msg, /did not close/);
  assert.deepEqual(truth.savedHandles, ['@thaibeats'], 'the mock did persist, but the script cannot tell');
});

test('a disabled Save is never actually clicked', async () => {
  const { truth } = await invite({ save: 'stuck' });
  assert.equal(truth.blockedSaveClicks, 0, 'clickIn must skip a disabled button, not click it');
});

test('nothing to invite: the dialog is cancelled, not saved', async () => {
  const { res, truth, outcome } = await invite({ save: 'ok' }, ['@nosuchchannel']);
  assert.deepEqual(res.links, []);
  assert.equal(truth.cancelled, true);
  assert.deepEqual(truth.savedHandles, []);
  assert.equal(outcome.state, 'failed');
  assert.match(outcome.msg, /not found/);
});

/* ---------- Studio markup drift ---------- */

test('a newline between the handle and the sub count still matches', async () => {
  const { res, truth } = await invite({ save: 'ok', sep: '\n' });
  assert.deepEqual(res.links.map((x) => x.handle), ['@thaibeats']);
  assert.deepEqual(truth.savedHandles, ['@thaibeats']);
});

test('#search-input being the paper-input wrapper still types into the real input', async () => {
  const { res, truth } = await invite({ save: 'ok', search: 'host' });
  assert.deepEqual(res.links.map((x) => x.handle), ['@thaibeats']);
  assert.deepEqual(truth.savedHandles, ['@thaibeats']);
});

test('a handle that is a prefix of another picks the exact channel', async () => {
  const { res } = await invite({ save: 'ok' }, ['@thaibeats']);
  assert.deepEqual(res.links.map((x) => x.handle), ['@thaibeats'],
    'must not select @thaibeatsofficial');
});

/* ---------- already-a-collaborator ---------- */

test('a channel already listed by handle is skipped, and skipping alone is success', async () => {
  const { res, truth, outcome } = await invite({ save: 'ok', already: ['@thaibeats'] });
  assert.deepEqual(res.skipped, ['@thaibeats']);
  assert.deepEqual(res.links, []);
  assert.deepEqual(truth.savedHandles, []);
  assert.equal(outcome.state, 'done');
});

test('a channel already listed by display name is skipped', async () => {
  const { res, outcome } = await invite({ save: 'ok', already: ['Thai Beats'] });
  assert.deepEqual(res.skipped, ['@thaibeats']);
  assert.equal(outcome.state, 'done');
});

/* ---------- several handles in one dialog ---------- */

test('two handles are both invited and saved together', async () => {
  const { res, truth, outcome } = await invite({ save: 'ok' }, ['@thaibeats', '@lofiproducer']);
  assert.deepEqual(res.links.map((x) => x.handle), ['@thaibeats', '@lofiproducer']);
  assert.deepEqual(truth.savedHandles, ['@thaibeats', '@lofiproducer']);
  assert.equal(outcome.state, 'done');
});

test('one good handle and one bad: the good one saves, the bad one is reported', async () => {
  const { res, truth, outcome } = await invite({ save: 'ok' }, ['@thaibeats', '@nosuchchannel']);
  assert.deepEqual(res.links.map((x) => x.handle), ['@thaibeats']);
  assert.deepEqual(truth.savedHandles, ['@thaibeats']);
  assert.equal(outcome.state, 'done');
  assert.match(outcome.msg, /@nosuchchannel: channel not found/);
});
