import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ClaimsOp } from '../lib/claims/ops';
import { disposeClaimsStore, flushClaims, initClaimsStore, useMemoryClaims, write } from '../lib/claims/store';
import type { QueueState } from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';
import { forgetClaimed, queueView, watchClaimedSongs } from '../lib/studio/queue-view';
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

beforeEach(() => {
  vi.stubGlobal('document', makeDocument());
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
  it('copies the items and adds what only the runner knows', () => {
    Q.queue.push(item('a', 'pending', { txt: '0:00 A - One\n3:00 B - Two\n6:00 C - Three' }), item('b', 'done'));
    const v = queueView(state);
    expect(v.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(v.items[0]!.tracklist?.count).toBe(3);
    expect(v.items[0]!.usesArtists).toBe(true); // the trapsoul preset title has {artists}
    expect(v.items[0]!.artists).toBe('A, B, C');
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
    forgetClaimed(); // …which is what the store's change listener calls
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

  // The memory store has no change events, so the link from the store to forgetClaimed() is pinned in the source.
  it('forgets its checks when the stored song history changes', () => {
    expect(watchClaimedSongs).toBeTypeOf('function');
    const src = readFileSync(new URL('../lib/studio/queue-view.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/onClaimsStored\('songHistory',\s*forgetClaimed\)/);
    const content = readFileSync(new URL('../entrypoints/studio.content.ts', import.meta.url), 'utf8');
    expect(content).toMatch(/stop\.add\(watchClaimedSongs\(\)\)/);
  });
});
