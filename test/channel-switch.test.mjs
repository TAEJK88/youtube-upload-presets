import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSwitcher } from './harness.mjs';
import { makeDocument } from './fake-dom.mjs';

// www.youtube.com/channel_switcher redirects to /account, which lists every channel
// as ytd-account-item-renderer > tp-yt-paper-icon-item. Captured live: a channel you
// OWN switches straight away, while one you only MANAGE first opens a
// yt-confirm-dialog-renderer whose #confirm-button says "Got it". Missing that
// confirmation is why switching to a manager channel silently did nothing.
function switcherPage(channels) {
  const doc = makeDocument();
  const state = { clicked: null, confirmed: false };
  const el = (tag, attrs = {}, text) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const popup = el('ytd-popup-container');
  doc.body.append(popup);
  const showConfirm = () => {
    const dlg = el('yt-confirm-dialog-renderer');
    const host = el('yt-button-renderer', { id: 'confirm-button' });
    const btn = el('button', {}, 'Got it');
    btn.onclick = () => { state.confirmed = true; };
    host.append(btn);
    dlg.append(el('div', {}, 'Your private activity would still be attributed to your personal account'), host);
    popup.append(dlg);
  };

  for (const c of channels) {
    const row = el(SEL_ITEM);
    const inner = el('tp-yt-paper-icon-item');
    inner.textContent = `${c.name} ${c.handle} ${c.manager ? "You're a manager • " : ''}${c.subs || '100 subscribers'}`;
    inner.onclick = () => { state.clicked = c.handle; if (c.manager) showConfirm(); };
    row.append(inner);
    doc.body.append(row);
  }
  return { doc, state };
}
const SEL_ITEM = 'ytd-account-item-renderer';

function fakeClock() {
  let now = 0;
  const timers = [];
  const win = {
    location: { hostname: 'www.youtube.com', pathname: '/account', search: '', hash: '' },
    setInterval: (fn) => { const t = { fn, dead: false }; timers.push(t); return t; },
    clearInterval: (t) => { if (t) t.dead = true; },
  };
  const real = Date.now;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) { now += 500; Date.now = () => now; timers.filter((t) => !t.dead).forEach((t) => t.fn()); }
  };
  return { win, tick, restore: () => { Date.now = real; }, alive: () => timers.some((t) => !t.dead) };
}

const CHANNELS = [
  { name: 'Coffeetables Mix', handle: '@coffeetablesmix' },
  { name: 'BLXD', handle: '@BLXDofficial' },
  { name: 'soulvybe', handle: '@soulvybe' },
  { name: 'soulvibe', handle: '@soulvibe4217' },
  { name: 'THAIBEATS', handle: '@thaibeats' },
  { name: 'Nessy J.', handle: '@NessyJ.official', manager: true },
  { name: 'PLEASU3AM', handle: '@PLEASU3AM', manager: true },
];

function run(want, ticks = 12) {
  const page = switcherPage(CHANNELS);
  const clock = fakeClock();
  const store = { pendingChannelSwitch: { at: 0, handle: want.handle, name: want.name, next: 'https://studio.youtube.com/x' } };
  Date.now = () => 1;
  makeSwitcher(page.doc, clock.win, store);
  try { clock.tick(ticks); } finally { clock.restore(); }  // makeSwitcher already armed it
  return { ...page.state, store };
}

test('an owned channel is picked and needs no confirmation', () => {
  const r = run({ handle: '@thaibeats' });
  assert.equal(r.clicked, '@thaibeats');
  assert.equal(r.confirmed, false, 'owned channels show no popup');
});

test('THE BUG: a manager channel also gets its "Got it" confirmed', () => {
  // clicking the row alone left the switch half-done and nothing happened
  const r = run({ handle: '@NessyJ.official' });
  assert.equal(r.clicked, '@NessyJ.official');
  assert.equal(r.confirmed, true, 'the manager notice must be confirmed or the switch never completes');
});

test('the second manager channel behaves the same', () => {
  const r = run({ handle: '@PLEASU3AM' });
  assert.equal(r.clicked, '@PLEASU3AM');
  assert.equal(r.confirmed, true);
});

test('a near-identical handle is not picked by mistake', () => {
  assert.equal(run({ handle: '@soulvybe' }).clicked, '@soulvybe');
  assert.equal(run({ handle: '@soulvibe4217' }).clicked, '@soulvibe4217');
});

test('the pending switch is consumed so it cannot fire twice', () => {
  const r = run({ handle: '@thaibeats' });
  assert.equal(r.store.pendingChannelSwitch, null);
});

test('clicking a channel records that a switch just happened', () => {
  // the post-switch Oops reload depends on this marker
  const r = run({ handle: '@thaibeats' });
  assert.ok(r.store.channelSwitchedAt, 'must record the switch for the Oops recovery');
});

test('an unknown channel is never clicked', () => {
  const r = run({ handle: '@notmychannel' });
  assert.equal(r.clicked, null);
  assert.equal(r.confirmed, false);
});

/* ---------- recovering from the post-switch Oops ----------
   Observed live: YouTube lands on <channel url>?sttick=0 and that exact URL keeps
   reporting no permission, while the same channel without the query string loads
   fine. So a reload is useless — the retry has to drop the stale query. */

function oopsPage(href, text = "Oops, you don't have permission to view this page") {
  const doc = makeDocument();
  doc.body.textContent = text;
  const u = new URL(href);
  const nav = [];
  const win = {
    location: {
      hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash,
      origin: u.origin, href,
      set [Symbol.for('unused')](v) {},
    },
    setInterval: null, clearInterval: null,
  };
  // capture assignments to location.href
  Object.defineProperty(win.location, 'href', {
    get: () => href, set: (v) => nav.push(v), configurable: true,
  });
  return { doc, win, nav };
}

function runRecovery(href, stored, ticks = 3) {
  const page = oopsPage(href);
  const clock = fakeClock();
  page.win.setInterval = clock.win.setInterval;
  page.win.clearInterval = clock.win.clearInterval;
  page.win.location.hostname = 'studio.youtube.com';
  const store = { channelSwitchedAt: stored };
  Date.now = () => 1000;
  makeSwitcher(page.doc, page.win, store);
  try { clock.tick(ticks); } finally { clock.restore(); }  // makeSwitcher already armed it
  return { nav: page.nav, store };
}

test('THE BUG: the retry drops the stale ?sttick query instead of reloading', () => {
  const r = runRecovery('https://studio.youtube.com/channel/UCabc?sttick=0', { at: 1000, tries: 0, next: '' });
  assert.deepEqual(r.nav, ['https://studio.youtube.com/channel/UCabc'],
    'reloading the same URL Oopses forever; the clean one works');
});

test('the stored next URL is preferred when there is one', () => {
  const r = runRecovery('https://studio.youtube.com/channel/UCabc?sttick=0',
    { at: 1000, tries: 0, next: 'https://studio.youtube.com/channel/UCabc/videos/upload' });
  assert.deepEqual(r.nav, ['https://studio.youtube.com/channel/UCabc/videos/upload']);
});

test('it gives up rather than looping once the tries run out', () => {
  const r = runRecovery('https://studio.youtube.com/channel/UCabc?sttick=0', { at: 1000, tries: 2, next: '' });
  assert.deepEqual(r.nav, []);
  assert.equal(r.store.channelSwitchedAt, null);
});

test('it gives up when there is no different URL left to try', () => {
  const r = runRecovery('https://studio.youtube.com/channel/UCabc', { at: 1000, tries: 0, next: '' });
  assert.deepEqual(r.nav, [], 'navigating to the same URL would hang the recovery');
  assert.equal(r.store.channelSwitchedAt, null);
});

test('a stale switch marker is ignored', () => {
  const r = runRecovery('https://studio.youtube.com/channel/UCabc?sttick=0', { at: -200000, tries: 0, next: '' });
  assert.deepEqual(r.nav, []);
});
