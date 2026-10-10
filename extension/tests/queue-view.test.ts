import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryClaims } from '../lib/claims/store';
import type { QueueState } from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';
import { queueView } from '../lib/studio/queue-view';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

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
});
