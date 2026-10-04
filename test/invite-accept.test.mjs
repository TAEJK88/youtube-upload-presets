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

function run(opts, ticks = 40) {
  const page = mockInvitePage(opts);
  const clock = fakeClock(page.truth.pump);
  Object.assign(page.win, { setInterval: clock.win.setInterval, clearInterval: clock.win.clearInterval });
  const watchInvite = makeWatcher(page.doc, page.win);
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
  const { truth } = run({ titles: ['Video A'], url: 'https://studio.youtube.com/channel/UC1/videos/upload' });
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
