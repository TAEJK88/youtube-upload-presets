import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';
import { counters, save, settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// Duration probing needs a real <video>; it is not what these tests are about.
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));

const calls: string[] = [];
const recorder: PageUi = {
  item: (it) => void calls.push(`item:${it.file.name}:${it.status}`),
  run: () => void calls.push('run'),
  queue: () => void calls.push('queue'),
  schedule: () => void calls.push('schedule'),
  presetPreview: () => void calls.push('presetPreview'),
  toast: (msg) => void calls.push(`toast:${msg}`),
  openDrawer: (tab) => void calls.push(`openDrawer:${tab ?? ''}`),
  notifyDone: (title) => void calls.push(`notifyDone:${title}`),
  setTitleMark: (mark) => void calls.push(`mark:${mark}`),
  confirmStart: async () => false,
};

let n = 0;
const qfile = (name: string, body = 'x', type = '') =>
  Object.assign(new File([body], name, { type }), { qid: `id-${++n}`, src: 'bridge' as const });

beforeEach(() => {
  vi.stubGlobal('document', makeDocument());
  vi.stubGlobal('location', { pathname: '/channel/UCabcdefghijklmn/videos' });
  setPageUi(recorder);
  Q.queue.splice(0);
  calls.length = 0;
  for (const k of Object.keys(counters)) delete counters[k];
  save('uploads', []);
  save('queueMemo', {});
});
afterEach(() => vi.unstubAllGlobals());

describe('addFiles', () => {
  it('queues videos in natural name order and pairs .txt / thumbnails by base name', async () => {
    await Q.addFiles([qfile('Mix 10.mp4'), qfile('Mix 2.mp4'), qfile('mix 2.txt', '00:00 A - B'), qfile('Mix 10.jpg', 'img', 'image/jpeg')]);
    expect(Q.queue.map((i) => i.file.name)).toEqual(['Mix 2.mp4', 'Mix 10.mp4']);
    const [two, ten] = Q.queue;
    expect(two!.txt).toBe('00:00 A - B');
    expect(two!.txtName).toBe('mix 2.txt');
    expect(ten!.thumb).toMatchObject({ name: 'Mix 10.jpg', src: 'bridge' });
    expect(ten!.thumb!.id).toMatch(/^id-/);
    expect(two!.id).toMatch(/^id-/);
    expect(two!.src).toBe('bridge');
    expect(two!.status).toBe('pending');
    expect(calls).toContain('toast:Added 2 video(s) · 1 .txt description file(s) · 1 thumbnail file(s)');
    expect(calls.at(-1)).toBe('queue');
  });

  it('skips a video already in the queue and flags one uploaded to this channel before', async () => {
    save('uploads', [{ file: 'Old.mp4', size: 1, channel: 'UCabcdefghijklmn', title: 'Old upload', videoId: 'abcdefghijk' }]);
    await Q.addFiles([qfile('Old.mp4')]);
    await Q.addFiles([qfile('Old.mp4')]);
    expect(Q.queue).toHaveLength(1);
    expect(Q.queue[0]!.prev).toMatchObject({ title: 'Old upload' });
    expect(calls.filter((c) => c.startsWith('toast:'))).toEqual([
      'toast:Added 1 video(s) · 1 already uploaded to this channel (red badge)',
      'toast:1 already in the queue',
    ]);
  });

  it('restores edits remembered for the same file', async () => {
    save('queueMemo', { 'Clip.mp4|1': { title: 'My title', t: Date.now() } });
    await Q.addFiles([qfile('Clip.mp4')]);
    expect(Q.queue[0]).toMatchObject({ title: 'My title', titleEdited: true });
  });
});

describe('assignNumbers', () => {
  it('numbers pending clips per preset after the saved counter', async () => {
    counters.trapsoul = 4;
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    Q.assignNumbers();
    expect(Q.queue.map((i) => i.n)).toEqual([5, 6]);
  });
});

describe('schedule slots', () => {
  afterEach(() => { vi.useRealTimers(); settings.schedule = { on: false, start: '', every: 1, unit: 'day' }; });

  it('spaces clips one step apart from the start time', async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 7, 6, 0) });
    settings.schedule = { on: true, start: '2026-10-07T08:00', every: 1, unit: 'day' };
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    expect(Q.queue.map(Q.itemPublishAt)).toEqual([new Date(2026, 9, 7, 8, 0).getTime(), new Date(2026, 9, 8, 8, 0).getTime()]);
  });

  it('moves a start that is too soon to the first slot still allowed', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 7, 7, 50) });
    settings.schedule = { on: true, start: '2026-10-07T08:00', every: 1, unit: 'hour' };
    expect(Q.effectiveStart()).toBe(new Date(2026, 9, 7, 9, 0).getTime());
    expect(Q.startIsPast()).toBe(true);
  });
});

describe('runQueue', () => {
  it('says so when nothing is waiting', async () => {
    await Q.runQueue();
    expect(calls).toEqual(['toast:No videos waiting in the queue']);
  });

  it('does not start without a confirmation from the panel', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    calls.length = 0;
    await Q.runQueue(); // confirmStart answers false; settings.confirmStart is on by default
    expect(Q.running).toBe(false);
    expect(Q.queue[0]!.status).toBe('pending');
  });

  it('refuses a channel other than the locked one', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    calls.length = 0;
    settings.lockChannel = { id: 'UCsomethingelse1', name: 'Other' };
    await Q.runQueue();
    settings.lockChannel = null;
    expect(calls).toEqual(['openDrawer:', 'toast:⛔ Currently on channel "UCabcdefghijklmn" but locked to "Other"']);
  });
});
