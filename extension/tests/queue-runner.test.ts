import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as messages from '../lib/messages';
import * as Q from '../lib/studio/queue-runner';
import { resetCfg } from '../lib/studio/channel';
import { pageFiles, setBridge } from '../lib/studio/queue-files';
import { stopQueue } from '../lib/studio/queue-ops';
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
// What the panel sends with queue:start: the channel and the pending items its summary showed.
const confirmed = (channelId = 'UCabcdefghijklmn') => ({ channelId, ids: Q.queue.filter((i) => i.status === 'pending').map((i) => i.id), editRev: Q.getEditRev(), asked: true });

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

describe('channel check reads ytcfg again (preflight / start)', () => {
  const lockTo = (id: string) => { settings.lockChannel = { id, name: 'Mine' }; };
  beforeEach(() => vi.stubGlobal('location', { pathname: '/' })); // no UC id in the URL: ytcfg decides
  afterEach(() => { settings.lockChannel = null; Q.setCfgReader(null); resetCfg(); });

  it('startSummary refreshes the channel before checking it', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    lockTo('UCmine0000000001');
    const read = vi.fn(async () => ({ CHANNEL_ID: 'UCmine0000000001' }));
    Q.setCfgReader(read);
    const s = await Q.startSummary();
    expect(read).toHaveBeenCalledWith(['CHANNEL_ID']);
    expect(s).toMatchObject({ pendingN: 1, channel: { id: 'UCmine0000000001' } });
  });

  it('startQueue refreshes the channel before runQueue checks it', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    lockTo('UCmine0000000001');
    Q.setCfgReader(async () => ({ CHANNEL_ID: 'UCother000000001' }));
    calls.length = 0;
    await Q.startQueue(confirmed('UCother000000001'));
    expect(calls).toEqual(['openDrawer:', 'toast:⛔ Currently on channel "UCother000000001" but locked to "Mine"']);
  });
});

describe('runner lock', () => {
  afterEach(() => { Q.setRunnerLock({ acquire: async () => true, release: () => {} }); settings.confirmStart = true; });

  it('does not run while another Studio tab holds the lock', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    settings.confirmStart = false;
    Q.setRunnerLock({ acquire: async () => false, release: () => {} });
    calls.length = 0;
    await Q.runQueue();
    expect(Q.running).toBe(false);
    expect(calls).toEqual(['toast:Another Studio tab is already running the queue']);
  });
});

describe('a run that ends early (addendum C)', () => {
  const lockCalls: string[] = [];
  beforeEach(() => {
    lockCalls.length = 0;
    setBridge(null); // nothing can be read: every item fails at getQueueFile
    Q.setRunnerLock({ acquire: async () => (lockCalls.push('acquire'), true), release: () => void lockCalls.push('release') });
    setPageUi({ ...recorder, confirmStart: async () => true });
    Object.assign(document, { hasFocus: () => true }); // the end-of-run title mark asks
  });
  afterEach(() => Q.setRunnerLock({ acquire: async () => true, release: () => {} }));

  it('fails the item cleanly when the bridge is down', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    calls.length = 0;
    await Q.runQueue();
    expect(Q.queue[0]).toMatchObject({ status: 'error', msg: 'Could not get the file from the side panel (bridge not ready)' });
    expect(lockCalls).toEqual(['acquire', 'release']);
    expect(calls).toContain('notifyDone:Queue stopped — needs attention ⚠️');
    expect(Q.running).toBe(false);
  });

  it('stops before the pause between items when asked to, and frees the lock', async () => {
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    setPageUi({
      ...recorder,
      confirmStart: async () => true,
      item: (it) => { if (it.status === 'error') Q.requestStop(); }, // Stop pressed while A fails
    });
    calls.length = 0;
    const delay = settings.delay;
    settings.delay = 60; // the pause must not run at all: the run ends well inside a second
    const t0 = Date.now();
    try {
      await Q.runQueue();
    } finally {
      settings.delay = delay;
    }
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(Q.queue.map((i) => i.status)).toEqual(['error', 'pending']);
    expect(lockCalls).toEqual(['acquire', 'release']);
    expect(calls).toContain('toast:Queue stopped (0 video(s) done)');
    expect(Q.running).toBe(false);
  });
});

describe('stop during a run', () => {
  beforeEach(() => {
    setBridge(null);
    Object.assign(document, { hasFocus: () => true }); // the end-of-run title mark asks
  });

  it('says the run will stop after the current video', async () => {
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    setPageUi({ ...recorder, confirmStart: async () => true, item: (it) => { if (it.status === 'error') stopQueue(); } });
    calls.length = 0;
    await Q.runQueue();
    expect(calls).toContain('toast:Will stop after the current video finishes');
    expect(Q.queue.map((i) => i.status)).toEqual(['error', 'pending']);
  });
});

describe('startQueue checks the file bridge first (addendum B.3)', () => {
  const lockCalls: string[] = [];
  beforeEach(() => {
    lockCalls.length = 0;
    Q.setRunnerLock({ acquire: async () => (lockCalls.push('acquire'), true), release: () => void lockCalls.push('release') });
    setPageUi({ ...recorder, confirmStart: async () => true });
    Object.assign(document, { hasFocus: () => true }); // the end-of-run title mark asks
  });
  afterEach(() => { setBridge(null); Q.setRunnerLock({ acquire: async () => true, release: () => {} }); });

  it('refuses to start while the bridge does not answer', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    setBridge(null);
    calls.length = 0;
    await Q.startQueue(confirmed());
    expect(calls).toEqual(["toast:The side panel's file access is not answering — reload the Studio tab, then start again"]);
    expect(lockCalls).toEqual([]);
    expect(Q.queue[0]!.status).toBe('pending');
  });

  it('starts once the bridge answers, even with bad news about a file', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    setBridge({ getFile: async () => { throw new Error('missing'); } });
    await Q.startQueue(confirmed());
    expect(lockCalls).toEqual(['acquire', 'release']);
    expect(Q.queue[0]).toMatchObject({ status: 'error', msg: 'This file is no longer available — add it again' });
  });

  it('refuses to start while the files lack read permission: Re-grant first, not N failed items', async () => {
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    setBridge({ getFile: async () => { throw new Error('permission'); } });
    calls.length = 0;
    await Q.startQueue(confirmed());
    expect(calls).toEqual(['toast:The queued files need read access again — click "Re-grant access" in the side panel, then start again']);
    expect(lockCalls).toEqual([]);
    expect(Q.queue.map((i) => i.status)).toEqual(['pending', 'pending']);
  });
});


describe('start is bound to what the user confirmed', () => {
  const lockCalls: string[] = [];
  beforeEach(() => {
    lockCalls.length = 0;
    Q.setRunnerLock({ acquire: async () => (lockCalls.push('acquire'), true), release: () => void lockCalls.push('release') });
    setPageUi({ ...recorder, confirmStart: async () => true });
    setBridge({ getFile: async () => { throw new Error('missing'); } }); // answers: the probe passes
    Object.assign(document, { hasFocus: () => true }); // the end-of-run title mark asks
  });
  afterEach(() => { setBridge(null); Q.setRunnerLock({ acquire: async () => true, release: () => {} }); });

  it('the summary names the channel and the pending items, in order', async () => {
    await Q.addFiles([qfile('B.mp4'), qfile('A.mp4')]);
    const s = await Q.startSummary();
    expect(s).toMatchObject({ channel: { id: 'UCabcdefghijklmn' }, ids: Q.queue.map((i) => i.id) });
  });

  it('refuses when the channel changed since the summary', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    calls.length = 0;
    await Q.startQueue(confirmed('UCsomethingelse1'));
    expect(calls).toEqual(['toast:The channel changed after you confirmed — click Start again to see the new summary']);
    expect(lockCalls).toEqual([]);
    expect(Q.queue[0]!.status).toBe('pending');
  });

  it('refuses when an item was added since the summary', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const seen = confirmed();
    await Q.addFiles([qfile('B.mp4')]);
    calls.length = 0;
    await Q.startQueue(seen);
    expect(calls).toEqual(['toast:The queue changed after you confirmed — click Start again to see the new summary']);
    expect(lockCalls).toEqual([]);
    expect(Q.queue.map((i) => i.status)).toEqual(['pending', 'pending']);
  });

  it('runs when the channel and the items match', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    await Q.startQueue(confirmed());
    expect(lockCalls).toEqual(['acquire', 'release']);
    expect(Q.queue[0]!.status).toBe('error'); // the bridge said 'missing': it ran
  });
});

describe('addQueued lets go of the files no item uses', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps new videos and thumbnails; drops a read .txt, unmatched files and a replaced thumbnail', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const oldThumb = qfile('A.jpg', 'img', 'image/jpeg');
    await Q.addQueued([qfile('A.mp4'), oldThumb]);
    expect(send).not.toHaveBeenCalled();
    const vid = qfile('B.mp4');
    const txt = qfile('B.txt', '00:00 X - Y');
    const newThumb = qfile('a.png', 'img', 'image/png'); // same base name as A: replaces A.jpg
    const stray = qfile('Nothing.jpg', 'img', 'image/jpeg');
    await Q.addQueued([vid, txt, newThumb, stray]);
    expect(send.mock.calls).toEqual([['files:delete', [txt.qid, stray.qid, oldThumb.qid]]]);
    expect(Q.queue.map((i) => [i.id, i.thumb?.id ?? null])).toEqual([[Q.queue[0]!.id, newThumb.qid], [vid.qid, null]]);
  });

  it('a .txt that cannot be read: the video already queued keeps its file, the .txt is let go, the error goes on', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const vid = qfile('Mix 1.mp4');
    const txt = qfile('Mix 1.txt');
    txt.arrayBuffer = () => Promise.reject(new DOMException('changed', 'NotReadableError'));
    await expect(Q.addQueued([vid, txt])).rejects.toThrow('changed');
    expect(Q.queue.some((i) => i.id === vid.qid)).toBe(true);
    expect(send.mock.calls).toEqual([['files:delete', [txt.qid]]]);
  });
});

describe('minors', () => {
  const lockCalls: string[] = [];
  beforeEach(() => {
    lockCalls.length = 0;
    Q.setRunnerLock({ acquire: async () => (lockCalls.push('acquire'), true), release: () => void lockCalls.push('release') });
    setPageUi({ ...recorder, confirmStart: async () => true });
    Object.assign(document, { hasFocus: () => true });
  });
  afterEach(() => { setBridge(null); Q.setRunnerLock({ acquire: async () => true, release: () => {} }); });

  it('probes the bridge when a later pending item comes from it, not only the first', async () => {
    await Q.addFiles(pageFiles([new File(['x'], 'A.mp4')]));
    await Q.addFiles([qfile('B.mp4')]);
    setBridge(null);
    calls.length = 0;
    await Q.startQueue(confirmed());
    expect(calls).toEqual(["toast:The side panel's file access is not answering — reload the Studio tab, then start again"]);
    expect(lockCalls).toEqual([]);
  });

  it('a missing thumbnail fails the item with a message that names the thumbnail', async () => {
    const thumb = qfile('A.jpg', 'img', 'image/jpeg');
    await Q.addFiles([qfile('A.mp4'), thumb]);
    setBridge({ getFile: async (id) => { if (id === thumb.qid) throw new Error('missing'); return new File(['x'], 'A.mp4'); } });
    await Q.runQueue();
    expect(Q.queue[0]).toMatchObject({ status: 'error', msg: 'Thumbnail "A.jpg": This file is no longer available — add it again' });
  });
});
