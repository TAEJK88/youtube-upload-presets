import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ClaimsOp } from '../lib/claims/ops';
import { disposeClaimsStore, flushClaims, initClaimsStore, useMemoryClaims, write } from '../lib/claims/store';
import { PROTOCOL, type QueueState } from '../lib/messages';
import { defaultPresets } from '../lib/presets';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';
import { forgetClaimed, queueView } from '../lib/studio/queue-view';
import { settings } from '../lib/studio/state';
import { claimsOpInOrder } from '../lib/store-writer';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// The real function, counted.
const claimedCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../lib/claims/core', async (orig) => {
  const real = await orig<typeof import('../lib/claims/core')>();
  return { ...real, claimedSongsIn: (...a: Parameters<typeof real.claimedSongsIn>) => (claimedCalls.n++, real.claimedSongsIn(...a)) };
});

const ui = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast() {}, openDrawer() {}, notifyDone() {},
  setTitleMark() {}, confirmStart: async () => false,
} satisfies PageUi;
const item = (id: string, status: Q.QueueItem['status'], extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 1, title: 't',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});
const state = { running: false, stopping: false, prog: null, rev: 1 } as unknown as QueueState;
let userscriptRoot = false; // the page has the Tampermonkey userscript's #ytp-root

beforeEach(() => {
  userscriptRoot = false;
  vi.stubGlobal('document', Object.assign(makeDocument(), { getElementById: (id: string) => (userscriptRoot && id === 'ytp-root' ? {} : null) }));
  vi.stubGlobal('location', { pathname: '/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos' });
  setPageUi(ui);
  Q.queue.splice(0);
  settings.schedule = { on: false, start: '', every: 1, unit: 'day' };
});
afterEach(() => {
  vi.unstubAllGlobals();
  useMemoryClaims();
  forgetClaimed(); // the memory store has no change events
});

describe('queueView', () => {
  it("says which build's shape it is (the panel refuses another)", () => {
    expect(queueView(state).proto).toBe(PROTOCOL);
    // 3 since the view has `userscript` (call 16): a tab of an older build would send none, and
    // the panel would read that as "no userscript here" instead of asking for a reload.
    // 4 since the state has `wait` and `paused` (P5-upload-batches, P5-daily-limit): an older tab
    // would send neither, and the panel would show a queue paused at the daily limit as idle.
    expect(PROTOCOL).toBe(4);
  });

  // Call 7: the panel's banner reads this; the page's guards read the same check.
  it('says whether the Tampermonkey userscript is in the page', () => {
    expect(queueView(state).userscript).toBe(false);
    userscriptRoot = true;
    expect(queueView(state).userscript).toBe(true);
  });

  it('copies the items and adds what only the runner knows', () => {
    Q.queue.push(item('a', 'pending', { txt: '0:00 A - One\n3:00 B - Two\n6:00 C - Three' }), item('b', 'done'));
    const v = queueView(state);
    expect(v.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(v.items[0]!.tracklist?.count).toBe(3);
    expect(v.items[0]!.usesArtists).toBe(true); // the trapsoul preset title has {artists}
    // {artists} is drawn from the preset's artist pool, not from the tracklist
    const names = v.items[0]!.artists.split(', ');
    expect(names).toHaveLength(4);
    expect(defaultPresets()[0]!.artistPriority).toEqual(expect.arrayContaining(names));
    expect(v.items[1]!.tracklist).toBe(null);
    expect(v.channel.id).toBe('UCaaaaaaaaaaaaaaaaaaaaaa');
    expect(v.state).toBe(state);
    v.items[0]!.title = 'changed'; // a copy: the panel can't reach the runner's items
    expect(Q.queue[0]!.title).toBe('t');
  });

  it('schedules: release times per item and the box summary', () => {
    const start = new Date(Date.now() + 86400e3);
    start.setMinutes(0, 0, 0);
    settings.schedule = { on: true, start: Q.toLocalInput(start.getTime()), every: 1, unit: 'day' };
    Q.queue.push(item('a', 'pending'), item('b', 'pending'));
    const v = queueView(state);
    expect(v.schedule).toMatchObject({ on: true, set: true, late: false, skipped: 0 });
    expect(v.items.map((i) => i.at)).toEqual([start.getTime(), start.getTime() + 86400e3]);
    expect(v.schedule.times).toEqual([start.getTime(), start.getTime() + 86400e3]);
  });

  it('a release time in the past is a problem only while the item can still change', () => {
    Q.queue.push(item('a', 'error', { publishEdited: true, publishAt: Date.now() - 1000 }), item('b', 'done', { publishFinal: Date.now() - 1000 }));
    settings.schedule = { on: true, start: Q.toLocalInput(Date.now() + 86400e3), every: 1, unit: 'day' };
    const [a, b] = queueView(state).items;
    expect(a!.timeProblem).toBe('Release time must be at least 15 minutes in the future');
    expect(b!.timeProblem).toBe('');
  });
  it('marks tracklist songs claimed before (Claims.claimedSongsIn)', () => {
    useMemoryClaims({ songHistory: { k: { title: 'Midnight Rain', artists: 'Lena', label: '', claimants: [], types: [], firstSeen: '', lastSeen: '', videos: { a: {}, b: {} }, trimmed: 0 } } });
    Q.queue.push(item('a', 'pending', { txt: '00:00 Lena - Midnight Rain\n03:00 X - Y' }), item('b', 'pending'));
    const [a, b] = queueView(state).items;
    expect(a!.claimed).toEqual([{ line: 'Lena - Midnight Rain', song: 'Midnight Rain', artists: 'Lena', times: 2 }]);
    expect(b!.claimed).toEqual([]); // no tracklist
  });

  const history = { k: { title: 'Midnight Rain', artists: 'Lena', label: '', claimants: [], types: [], firstSeen: '', lastSeen: '', videos: { a: {} }, trimmed: 0 } };

  it('checks a tracklist against the song history once, not on every view (review m4)', () => {
    useMemoryClaims({ songHistory: history });
    forgetClaimed();
    Q.queue.push(item('a', 'pending', { txt: '00:00 Lena - Midnight Rain' }), item('b', 'pending', { txt: '00:00 Lena - Midnight Rain' }), item('c', 'pending'));
    claimedCalls.n = 0;
    const first = queueView(state);
    queueView(state);
    queueView(state);
    expect(claimedCalls.n).toBe(1); // two cards share one tracklist text; three views
    expect(first.items[0]!.claimed).toHaveLength(1);
    expect(queueView(state).items[1]!.claimed).toEqual(first.items[0]!.claimed);
    first.items[0]!.claimed.length = 0; // the panel's copy: the cache is not handed out
    expect(queueView(state).items[0]!.claimed).toHaveLength(1);
  });

  it('a changed tracklist is checked again; a changed song history forgets every check', () => {
    useMemoryClaims({ songHistory: history });
    forgetClaimed();
    Q.queue.push(item('a', 'pending', { txt: '00:00 Lena - Midnight Rain' }));
    queueView(state);
    claimedCalls.n = 0;
    Q.queue[0]!.txt = '00:00 Other - Song';
    expect(queueView(state).items[0]!.claimed).toEqual([]);
    expect(claimedCalls.n).toBe(1);
    useMemoryClaims({ songHistory: {} }); // the history changed…
    forgetClaimed(); // …which claimedIn() does itself when the stored history is another object
    Q.queue[0]!.txt = '00:00 Lena - Midnight Rain';
    expect(queueView(state).items[0]!.claimed).toEqual([]);
  });

  // The real store over storage, the background's writer in process (4b C review I1).
  describe('with the stored song history', () => {
    const row = { song: 'Midnight Rain', artists: 'Lena', label: '', claimant: '', type: '', videoId: 'v1', video: 'V', impact: '' };
    const record: ClaimsOp = { op: 'songs', songs: { fn: 'record', rows: [row], chName: 'Mine', now: '2026-01-01T00:00:00.000Z' } };
    beforeEach(async () => {
      fakeBrowser.reset();
      disposeClaimsStore();
      await initClaimsStore(claimsOpInOrder);
      Q.queue.push(item('a', 'pending', { txt: '00:00 Lena - Midnight Rain' }));
      expect(queueView(state).items[0]!.claimed).toEqual([]); // checked, and kept
    });
    afterEach(disposeClaimsStore);

    it("this tab's own song write (a scan here) is seen by the next view, at once and after the write lands", async () => {
      write(record);
      expect(queueView(state).items[0]!.claimed).toHaveLength(1);
      await flushClaims();
      expect(queueView(state).items[0]!.claimed).toEqual([{ line: 'Lena - Midnight Rain', song: 'Midnight Rain', artists: 'Lena', times: 1 }]);
      claimedCalls.n = 0;
      queueView(state);
      expect(claimedCalls.n).toBe(0); // and it is kept again
    });

    it('a song write from elsewhere (the panel, another tab) is seen too', async () => {
      await claimsOpInOrder(record);
      await vi.waitFor(() => expect(queueView(state).items[0]!.claimed).toHaveLength(1));
    });

    it('a write that fails takes the check back with the stored history', async () => {
      disposeClaimsStore();
      await initClaimsStore(async () => { throw new Error('refused'); });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      write(record);
      expect(queueView(state).items[0]!.claimed).toHaveLength(1);
      await flushClaims();
      expect(queueView(state).items[0]!.claimed).toEqual([]);
      expect(await browser.storage.local.get('songHistory')).toEqual({});
      vi.restoreAllMocks();
    });
  });
});
