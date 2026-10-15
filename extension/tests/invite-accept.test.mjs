import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createInviteWatcher } from '../lib/invite';
import { mockInvitePage } from './mock-invite.mjs';

// harness.mjs evaluated watchInvite with these globals swapped for fakes and armed it
// once; the module takes them as env instead. Its settings read always saw {}.
function makeWatcher(doc, win, store = {}) {
  const { watchInvite } = createInviteWatcher({
    document: doc, location: win.location, getComputedStyle: win.getComputedStyle,
    setInterval: win.setInterval, clearInterval: win.clearInterval,
    setTimeout: () => 0, // the note's auto-remove timer would keep node alive
    console: win.console,
    getValue: (k, d) => (k === 'settings' ? {} : (k in store ? store[k] : d)),
    setValue: (k, v) => { store[k] = v; },
  });
  watchInvite();
  return watchInvite;
}

// watchInvite polls on a 1s interval; drive that clock by hand so the tests are
// instant and deterministic rather than sleeping.
function fakeClock(pump) {
  let now = 0;
  const timers = [];
  const win = {
    setInterval: (fn) => { const t = { fn, dead: false }; timers.push(t); return t; },
    clearInterval: (t) => { if (t) t.dead = true; },
  };
  const realNow = Date.now;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1000;
      Date.now = () => now;
      if (pump) pump();
      timers.filter((t) => !t.dead).forEach((t) => t.fn());
    }
  };
  const restore = () => { Date.now = realNow; };
  return { win, tick, restore, alive: () => timers.some((t) => !t.dead) };
}

function run(opts, ticks = 40, store = {}) {
  const page = mockInvitePage(opts);
  const clock = fakeClock(page.truth.pump);
  Object.assign(page.win, { setInterval: clock.win.setInterval, clearInterval: clock.win.clearInterval });
  const nav = [];
  Object.defineProperty(page.win.location, 'href', {
    get: () => page.win.location._href, set: (v) => nav.push(v), configurable: true,
  });
  page.win.location._href = 'https://studio.youtube.com' + page.win.location.pathname;
  page.nav = nav;
  page.store = store;
  const watchInvite = makeWatcher(page.doc, page.win, store);
  try {
    watchInvite();
    clock.tick(ticks);
  } finally {
    clock.restore();
  }
  return { ...page, alive: clock.alive() };
}

test('a single request skips the list and is accepted', () => {
  const { truth } = run({ titles: ['Only Video'], skipList: true });
  assert.deepEqual(truth.accepted, ['Only Video']);
  assert.deepEqual(truth.declined, []);
});

test('every request in the list is accepted', () => {
  const { truth } = run({ titles: ['Video A', 'Video B', 'Video C'] });
  assert.deepEqual(truth.opened, ['Video A', 'Video B', 'Video C']);
  assert.deepEqual(truth.accepted, ['Video A', 'Video B', 'Video C']);
});

test('the two real BLXD requests are both accepted', () => {
  const { truth } = run({ titles: ['TrapSoul Mix - BLXD, Nessy J. SZA', 'New TrapSoul Mix | SZA, Chris Brown'] });
  assert.equal(truth.accepted.length, 2);
});

test('Decline is never clicked', () => {
  const { truth } = run({ titles: ['Video A', 'Video B'] });
  assert.deepEqual(truth.declined, []);
});

test('rows in the page behind the dialog are never clicked', () => {
  // the main content table uses the same ytcp-video-row element; its rows throw if clicked
  assert.doesNotThrow(() => run({ titles: ['Video A'] }));
});

test('the watcher stops once every request is handled', () => {
  const { alive, truth } = run({ titles: ['Video A', 'Video B'] });
  assert.equal(truth.accepted.length, 2);
  assert.equal(alive, false, 'the interval must be cleared, not left polling forever');
});

test('a page with no requests accepts nothing and gives up', () => {
  const { truth, alive } = run({ titles: [] }, 185);
  assert.deepEqual(truth.accepted, []);
  assert.equal(alive, false);
});

test('a non-invite Studio URL never arms the watcher', () => {
  const { truth } = run({ titles: ['Video A'], url: 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/videos/upload' });
  assert.deepEqual(truth.opened, [], 'must not touch an ordinary content page');
});

test('the un-redirected collaboration URL arms the watcher', () => {
  const { truth } = run({ titles: ['Video A'], url: 'https://studio.youtube.com/channel/UC1/collaboration/UC2?si=x' });
  assert.deepEqual(truth.accepted, ['Video A']);
});

test('a slow next request is not abandoned', () => {
  // observed live: after an accept, YouTube leaves "Oops, something went wrong"
  // on the list for a few seconds before the next request appears. Finishing on
  // the first empty poll would stop at one.
  const { truth } = run({ titles: ['Video A', 'Video B', 'Video C'], gapTicks: 5 });
  assert.deepEqual(truth.accepted, ['Video A', 'Video B', 'Video C']);
});

test('a gap longer than the idle window ends the run cleanly', () => {
  const { truth, alive } = run({ titles: ['Video A', 'Video B'], gapTicks: 40 });
  assert.deepEqual(truth.accepted, ['Video A'], 'stops rather than polling forever');
  assert.equal(alive, false);
});

/* ---------- picking up the next request ----------
   Observed live: YouTube offers one request per page load. After an accept the
   list sticks on "Oops, something went wrong", and reloading that URL brings
   nothing — only reopening the original /collaboration/ link does. The script
   never sees that link (YouTube redirects first), so it rebuilds it from the
   channel id in the path and inviterChannelId in the query. */

test('after accepting, the original invite link is reopened for the next request', () => {
  const r = run({ titles: ['Video A'], skipList: true });
  assert.deepEqual(r.truth.accepted, ['Video A']);
  assert.deepEqual(r.nav, ['https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/collaboration/UCSd21ggmlMhbvaMT5IGxajA'],
    'must rebuild the /collaboration/ link, not reload the list URL');
});

test('the round counter advances so the loop is bounded', () => {
  const store = {};
  run({ titles: ['Video A'], skipList: true }, 40, store);
  assert.equal(store.inviteAcceptRound.n, 1);
});

test('the round limit stops the loop', () => {
  const store = { inviteAcceptRound: { n: 15, at: Date.now() } };
  const r = run({ titles: ['Video A'], skipList: true }, 40, store);
  assert.deepEqual(r.nav, [], 'must not reopen the link once the limit is reached');
  assert.equal(store.inviteAcceptRound, null);
});

test('a visit that accepts nothing does not reopen the link', () => {
  const r = run({ titles: [] }, 185);
  assert.deepEqual(r.nav, []);
});

// Changed from the userscript (P5-invite-settle): the inviter seen when the watcher starts is
// kept, from the query or from the /collaboration/<inviter> link itself.
test('the un-redirected /collaboration/ link is reopened from its own path', () => {
  const r = run({ titles: ['Video A'], skipList: true,
    url: 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/collaboration/UCSd21ggmlMhbvaMT5IGxajA' });
  assert.deepEqual(r.truth.accepted, ['Video A']);
  assert.deepEqual(r.nav, ['https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/collaboration/UCSd21ggmlMhbvaMT5IGxajA']);
});

test('THE BUG: the link is reopened although YouTube dropped inviterChannelId when the card closed', () => {
  // seen live 2026-10-15: after each accept the URL was plain /videos/upload?filter=…, so the
  // next request waited until the link was opened by hand
  const r = run({ titles: ['Video A'], skipList: true, dropQuery: true });
  assert.deepEqual(r.truth.accepted, ['Video A']);
  assert.deepEqual(r.nav, ['https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/collaboration/UCSd21ggmlMhbvaMT5IGxajA']);
});

test('a page whose inviter is unknown is not reopened', () => {
  const r = run({ titles: ['Video A'], skipList: true, url: 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/videos/upload?d=acd' });
  assert.deepEqual(r.truth.accepted, ['Video A']);
  assert.deepEqual(r.nav, [], 'no inviter to rebuild the link from');
});

/* ---------- the errored request list that covers the invite ----------
   Seen live every run: "Collaboration requests" sticks on "Oops, something went
   wrong" with no rows and floats over the invite card, leaving Accept dimmed. */

test('an empty errored request list is dismissed, then the invite is accepted', () => {
  const r = run({ titles: ['Video A'], skipList: true, deadList: true });
  assert.equal(r.truth.closedDeadList, true, 'the useless box must be closed');
  assert.deepEqual(r.truth.accepted, ['Video A'], 'and the card underneath accepted');
});

test('a request list with rows is never dismissed', () => {
  const r = run({ titles: ['Video A', 'Video B'] });
  assert.notEqual(r.truth.closedDeadList, true);
  assert.deepEqual(r.truth.accepted, ['Video A', 'Video B']);
});

/* ---------- giving the page time to load (P5-invite-settle) ----------
   Reported 2026-10-15: on accepting, "there is no time for the data to show up, so it
   errors". The card and the request list appear before what is in them has loaded; the
   userscript clicked on the first poll that saw them. */

test('Accept waits until the card has loaded instead of clicking the moment it shows', () => {
  const r = run({ titles: ['Only Video'], skipList: true, loadTicks: 4 });
  assert.equal(r.truth.tooEarly, 0, 'no click on a card that is still loading');
  assert.deepEqual(r.truth.accepted, ['Only Video']);
});

test('every request in the list is accepted when each card loads slowly', () => {
  const r = run({ titles: ['Video A', 'Video B', 'Video C'], loadTicks: 4 }, 80);
  assert.equal(r.truth.tooEarly, 0);
  assert.deepEqual(r.truth.accepted, ['Video A', 'Video B', 'Video C']);
});

test('a request list still loading its rows is not closed as empty', () => {
  const r = run({ titles: ['Video A', 'Video B'], loadTicks: 5 }, 60);
  assert.notEqual(r.truth.closedDeadList, true, 'a list without rows yet may only be loading');
  assert.deepEqual(r.truth.accepted, ['Video A', 'Video B']);
});

/* ---------- what was accepted, for the Collab list (P5-invite-two-step) ----------
   YouTube gives one invite link per pair of channels; the card's URL names the video
   (…&v=<id>), so the watcher notes each video it saw accepted, and a visit that found no
   request left. */

const ME = 'UCcpMHMjwVRDTH1Bg7DWeYvA';
const INVITER = 'UCSd21ggmlMhbvaMT5IGxajA';

test('each accepted video is noted under the invited channel and the inviter', () => {
  const store = {};
  run({ titles: ['Video A', 'Video B'], withV: true }, 40, store);
  assert.deepEqual(Object.keys(store.inviteAccepted[ME][INVITER].videos).sort(), ['id-VideoA', 'id-VideoB']);
});

test('a card closed without a v in its URL notes nothing', () => {
  const store = {};
  run({ titles: ['Video A'], skipList: true }, 40, store);
  assert.equal(store.inviteAccepted, undefined);
});

test('a reopened link that brings no request gives up after 60 s and notes that none is left', () => {
  const store = { inviteAcceptRound: { n: 1, at: Date.now() } };
  const r = run({ titles: [] }, 65, store);
  assert.equal(r.alive, false, 'a reopen round with nothing must not wait 180 s');
  assert.equal(typeof store.inviteAccepted[ME][INVITER].clearedAt, 'number');
});

test('a first visit with no request still waits the full 180 s', () => {
  const r = run({ titles: [] }, 65);
  assert.equal(r.alive, true);
});
