import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWatcher } from './harness.mjs';
import { mockInvitePage } from './mock-invite.mjs';

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

test('a URL without inviterChannelId cannot be rebuilt, so it stops', () => {
  const r = run({ titles: ['Video A'], skipList: true,
    url: 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/collaboration/UCSd21ggmlMhbvaMT5IGxajA' });
  assert.deepEqual(r.truth.accepted, ['Video A']);
  assert.deepEqual(r.nav, [], 'no inviterChannelId to rebuild from');
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
