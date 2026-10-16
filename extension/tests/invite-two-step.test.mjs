import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createInviteWatcher } from '../lib/invite';
import { makeDocument } from './fake-dom.mjs';

// P5-invite-two-step: seen 2026-10-15, an invite link given as the channel switch's destination
// landed on /collaboration/<inviter>?sttick=0 and no request ever showed, while the same link
// opened from the channel's own page went to the requests at once. So the switch goes to the
// channel's page, and the link is opened from there.
const LINK = 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/collaboration/UCsJN9DLhirdKVdnfTnJyfxg';

function setup(href, store = {}, body = '', session) {
  const doc = makeDocument();
  doc.body.textContent = body;
  const u = new URL(href);
  const nav = [];
  const location = { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin };
  Object.defineProperty(location, 'href', { get: () => href, set: (v) => nav.push(v), configurable: true });
  const timers = [];
  const w = createInviteWatcher({
    document: doc, location, getComputedStyle: () => ({ visibility: 'visible' }),
    setInterval: (fn) => { const t = { fn, dead: false }; timers.push(t); return t; },
    clearInterval: (t) => { if (t) t.dead = true; },
    setTimeout: () => 0, console: { info() {} }, session,
    getValue: (k, d) => (k in store ? store[k] : d), setValue: (k, v) => { store[k] = v; },
  });
  const tick = (n) => { for (let i = 0; i < n; i++) timers.filter((t) => !t.dead).forEach((t) => t.fn()); };
  return { w, nav, store, tick, location };
}

test('an invite link as the destination switches to the channel page and keeps the link', () => {
  const { w, store } = setup('https://studio.youtube.com/channel/UCsJN9DLhirdKVdnfTnJyfxg/videos');
  const calls = [];
  w.switchThenOpen({ switchToChannel: (t, next) => calls.push([t, next]) }, { handle: '@BLXDofficial' }, LINK);
  assert.deepEqual(calls, [[{ handle: '@BLXDofficial' }, 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA']]);
  assert.equal(store.inviteAfterSwitch.link, LINK);
  assert.equal(store.inviteAfterSwitch.channel, 'UCcpMHMjwVRDTH1Bg7DWeYvA');
});

test('any other destination is passed through unchanged', () => {
  const { w, store } = setup('https://studio.youtube.com/channel/UCsJN9DLhirdKVdnfTnJyfxg/videos');
  const calls = [];
  w.switchThenOpen({ switchToChannel: (t, next) => calls.push(next) }, { handle: '@x' }, 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/videos');
  assert.deepEqual(calls, ['https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/videos']);
  assert.equal(store.inviteAfterSwitch, undefined);
});

// the switcher picked the channel (channelSwitchedAt) after the link was left pending
const pending = (extra = {}) => ({
  inviteAfterSwitch: { at: Date.now() - 1000, channel: 'UCcpMHMjwVRDTH1Bg7DWeYvA', link: LINK, ...extra },
  channelSwitchedAt: { at: Date.now(), tries: 0, next: '' },
});
const tab = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

test('on the new channel page the link is opened after the page has settled', () => {
  const s = setup('https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA', pending());
  s.w.openAfterSwitch();
  s.tick(2);
  assert.deepEqual(s.nav, [], 'not before 3 calm polls');
  s.tick(1);
  assert.deepEqual(s.nav, [LINK]);
  assert.equal(s.store.inviteAfterSwitch, null, 'opened once');
});

test('not while the post-switch Oops page shows', () => {
  const s = setup('https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA?sttick=0', pending(), "Oops, you don't have permission to view this page");
  s.w.openAfterSwitch();
  s.tick(10);
  assert.deepEqual(s.nav, []);
  assert.ok(s.store.inviteAfterSwitch, 'kept for the page the Oops recovery loads next');
});

test('not on another channel', () => {
  const s = setup('https://studio.youtube.com/channel/UCsJN9DLhirdKVdnfTnJyfxg', pending());
  s.w.openAfterSwitch();
  s.tick(10);
  assert.deepEqual(s.nav, []);
});

test('an old pending link is ignored', () => {
  const s = setup('https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA', pending({ at: Date.now() - 600000 }));
  s.w.openAfterSwitch();
  s.tick(10);
  assert.deepEqual(s.nav, []);
});

test('the switching tab keeps a token; only that tab opens the link', () => {
  const session = tab();
  const { w, store } = setup('https://studio.youtube.com/channel/UCsJN9DLhirdKVdnfTnJyfxg/videos', {}, '', session);
  w.switchThenOpen({ switchToChannel() {} }, { handle: '@BLXDofficial' }, LINK);
  assert.ok(store.inviteAfterSwitch.token);
  assert.equal(session.getItem('ytup-invite-next'), store.inviteAfterSwitch.token);

  const other = setup('https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA', pending({ token: 'abc' }), '', tab());
  other.w.openAfterSwitch();
  other.tick(10);
  assert.deepEqual(other.nav, [], 'another Studio tab on the channel leaves it alone');
  assert.ok(other.store.inviteAfterSwitch);

  const mine = tab({ 'ytup-invite-next': 'abc' });
  const s = setup('https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA', pending({ token: 'abc' }), '', mine);
  s.w.openAfterSwitch();
  s.tick(3);
  assert.deepEqual(s.nav, [LINK]);
  assert.equal(mine.getItem('ytup-invite-next'), null);
});

test('not when the switcher never picked the channel (a later switch by hand)', () => {
  const store = pending();
  store.channelSwitchedAt = null;
  const s = setup('https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA', store);
  s.w.openAfterSwitch();
  s.tick(10);
  assert.deepEqual(s.nav, []);
  const old = pending();
  old.channelSwitchedAt.at = old.inviteAfterSwitch.at - 5000; // an earlier switch's marker
  const s2 = setup('https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA', old);
  s2.w.openAfterSwitch();
  s2.tick(10);
  assert.deepEqual(s2.nav, []);
});

test('a switch that landed on another channel drops the pending link', () => {
  const s = setup('https://studio.youtube.com/channel/UCsJN9DLhirdKVdnfTnJyfxg', pending());
  s.w.openAfterSwitch();
  s.tick(3);
  assert.equal(s.store.inviteAfterSwitch, null);
});
