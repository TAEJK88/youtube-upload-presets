import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from './harness.mjs';

/* ---------- parseHandles ---------- */

test('handles are split on commas and spaces and get a leading @', () => {
  assert.deepEqual(C.parseHandles('thaibeats, @other  third'), ['@thaibeats', '@other', '@third']);
});

test('an empty handle box yields no handles', () => {
  assert.deepEqual(C.parseHandles('  , ,  '), []);
});

/* ---------- collabRowMatches ----------
   #channel-info is rendered by Studio with no guaranteed separator: it can read
   "@handle", "@handle · 1.2K subscribers" or "@handle\n1.2K subscribers". */

test('a search row matches when it is only the handle', () => {
  assert.ok(C.collabRowMatches('@thaibeats', '@thaibeats'));
});

test('a search row matches with a middot and subscriber count after the handle', () => {
  assert.ok(C.collabRowMatches('@thaibeats · 1.2K subscribers', '@thaibeats'));
});

test('a search row matches when Studio puts the subscriber count on its own line', () => {
  assert.ok(C.collabRowMatches('@thaibeats\n1.2K subscribers', '@thaibeats'));
});

test('a search row matches regardless of case', () => {
  assert.ok(C.collabRowMatches('@ThaiBeats · 1.2K subscribers', '@thaibeats'));
});

test('a handle that is only a prefix of the row handle does not match', () => {
  assert.equal(C.collabRowMatches('@thaibeatsofficial · 1.2K subscribers', '@thaibeats'), false);
});

test('a different channel does not match', () => {
  assert.equal(C.collabRowMatches('@someoneelse · 300 subscribers', '@thaibeats'), false);
});

test('an empty row does not match', () => {
  assert.equal(C.collabRowMatches('', '@thaibeats'), false);
});

/* ---------- acceptLabelMatches ---------- */

test('the Accept button is recognised from its text', () => {
  assert.ok(C.acceptLabelMatches('', 'Accept'));
  assert.ok(C.acceptLabelMatches('', 'ACCEPT INVITATION'));
  assert.ok(C.acceptLabelMatches('', 'ยอมรับคำเชิญ'));
});

test('a label broken across lines by the Polymer template still matches', () => {
  assert.ok(C.acceptLabelMatches('', '\n        Accept\n        invitation\n      '));
});

test('an aria-label that does not match falls back to the button text', () => {
  // the old code read (aria-label || textContent), so a descriptive aria-label hid the text
  assert.ok(C.acceptLabelMatches('Accept invitation from Thai Beats', 'Accept'));
});

test('unrelated buttons are not treated as Accept', () => {
  assert.equal(C.acceptLabelMatches('', 'Accept all cookies'), false);
  assert.equal(C.acceptLabelMatches('', 'Decline'), false);
  assert.equal(C.acceptLabelMatches('', 'Cancel'), false);
  assert.equal(C.acceptLabelMatches('', ''), false);
});

/* ---------- inviteOutcome ----------
   A video counts as done only when YouTube actually persisted the invitation. */

const link = (handle) => ({ handle, link: `https://studio.youtube.com/invite/${handle}` });
const res = (over = {}) => Object.assign({ links: [], errors: [], skipped: [], saved: null }, over);

test('reading an invite link but failing to save is NOT success', () => {
  // this is the reported bug: the run said done while nothing changed on YouTube
  const o = C.inviteOutcome(res({ links: [link('@thaibeats')], saved: false, errors: ['could not save'] }));
  assert.equal(o.state, 'failed');
  assert.match(o.msg, /could not save/);
});

test('an invite that saved is success and names the channel', () => {
  const o = C.inviteOutcome(res({ links: [link('@thaibeats')], saved: true }));
  assert.equal(o.state, 'done');
  assert.match(o.msg, /@thaibeats/);
});

test('a channel that was already a collaborator is success with nothing to save', () => {
  const o = C.inviteOutcome(res({ skipped: ['@thaibeats'], saved: null }));
  assert.equal(o.state, 'done');
  assert.match(o.msg, /Already added/);
});

test('an already-added channel alongside an error is not success', () => {
  const o = C.inviteOutcome(res({ skipped: ['@a'], errors: ['@b: channel not found'] }));
  assert.equal(o.state, 'failed');
  assert.match(o.msg, /channel not found/);
});

test('errors with nothing invited report every error', () => {
  const o = C.inviteOutcome(res({ errors: ['@a: channel not found', '@b: invitation limit reached'] }));
  assert.equal(o.state, 'failed');
  assert.match(o.msg, /@a: channel not found · @b: invitation limit reached/);
});

test('a run where nothing at all happened is failed, not silently done', () => {
  const o = C.inviteOutcome(res());
  assert.equal(o.state, 'failed');
  assert.match(o.msg, /Nothing changed/);
});

test('a partial run that saved reports both the invite and the failure', () => {
  const o = C.inviteOutcome(res({ links: [link('@a')], errors: ['@b: channel not found'], saved: true }));
  assert.equal(o.state, 'done');
  assert.match(o.msg, /Invited @a/);
  assert.match(o.msg, /@b: channel not found/);
});

/* ---------- the invite-page URL gate ----------
   YouTube 302s the collaboration link to the channel's upload tab, dropping every
   trace of "collaboration" from the path. Captured from a real invite, which is
   why v4.11.0 (which tested location.pathname) never armed the accept watcher. */

const REAL_REDIRECT = '/channel/UC9J9cI0Us_zUkpcUJxIMlew/videos/upload'
  + '?d=acd&filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%7D&inviterChannelId=UCcpMHMjwVRDTH1Bg7DWeYvA';

test('the real redirected invite URL is recognised', () => {
  assert.ok(C.INVITE_URL.test(REAL_REDIRECT));
});

test('its pathname alone is NOT recognised — the regression that broke auto-accept', () => {
  assert.equal(C.INVITE_URL.test('/channel/UC9J9cI0Us_zUkpcUJxIMlew/videos/upload'), false);
});

test('the un-redirected collaboration link is still recognised', () => {
  assert.ok(C.INVITE_URL.test('/channel/UC9J9cI0Us_zUkpcUJxIMlew/collaboration/UCcpMHMjwVRDTH1Bg7DWeYvA?si=x'));
});

test('ordinary Studio pages do not arm the watcher', () => {
  for (const p of ['/channel/UC123/videos/upload', '/video/abc123/edit', '/channel/UC123/analytics',
    '/channel/UC123/editing', '/channel/UC123/monetization', '/']) {
    assert.equal(C.INVITE_URL.test(p), false, p);
  }
});

/* ---------- the channel switcher ----------
   Rows on www.youtube.com/account carry only a name and an @handle — no UC id —
   so switching has to match on the handle. Picking the wrong row switches the
   whole session to the wrong channel, so the boundary matters. */

const ROW = (name, handle, subs = '1,000 subscribers') => `${name} ${handle} ${subs}`;

test('a channel is matched by its handle', () => {
  assert.ok(C.switcherRowMatches(ROW('THAIBEATS', '@thaibeats'), '@thaibeats'));
});

test('the handle matches with or without the leading @', () => {
  assert.ok(C.switcherRowMatches(ROW('THAIBEATS', '@thaibeats'), 'thaibeats'));
});

test('a handle that is a prefix of another channel does not match it', () => {
  assert.equal(C.switcherRowMatches(ROW('Thai Beats Official', '@thaibeatsofficial'), '@thaibeats'), false);
});

test('a manager row still matches', () => {
  assert.ok(C.switcherRowMatches('Nessy J. @NessyJ.official You\'re a manager • 1,060 subscribers', '@NessyJ.official'));
});

test('handle matching ignores case', () => {
  assert.ok(C.switcherRowMatches(ROW('BLXD', '@BLXDofficial'), '@blxdofficial'));
});

test('a different channel does not match', () => {
  assert.equal(C.switcherRowMatches(ROW('BLXD', '@BLXDofficial'), '@thaibeats'), false);
});

test('with no handle it falls back to the channel name', () => {
  assert.ok(C.switcherRowMatches(ROW('Coffeetables Mix', '@coffeetablesmix'), '', 'Coffeetables Mix'));
  assert.equal(C.switcherRowMatches(ROW('Coffeetables Mix', '@coffeetablesmix'), '', 'soulvybe'), false);
});

test('with neither handle nor name nothing matches', () => {
  assert.equal(C.switcherRowMatches(ROW('THAIBEATS', '@thaibeats'), '', ''), false);
  assert.equal(C.switcherRowMatches('', '@thaibeats'), false);
});
