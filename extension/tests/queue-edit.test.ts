import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as messages from '../lib/messages';
import { SCHEMA_VERSION } from '../lib/migrations';
import { defaultPresets } from '../lib/presets';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as files from '../lib/studio/queue-files';
import * as Q from '../lib/studio/queue-runner';
import { editQueue, followStoredChanges, handleQueueAdd, handleQueueEdit } from '../lib/studio/queue-edit';
import { activeId, disposeState, flushState, initState } from '../lib/studio/state';
import { createContentUi } from '../lib/studio/content-ui';
import { restoreQueue } from '../lib/studio/queue-store';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// Duration probing needs a real <video>; it is not what these tests are about.
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));

const calls: string[] = [];
const ui = {
  item() {}, run() {}, queue: () => void calls.push('queue'), schedule() {}, presetPreview() {},
  toast: (m: string) => void calls.push(`toast:${m}`), openDrawer() {}, notifyDone() {}, setTitleMark() {},
  confirmStart: async () => false,
} satisfies PageUi;
const item = (id: string, status: Q.QueueItem['status'], extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});
const qfile = (name: string, qid: string, body = '') => Object.assign(new File([body], name), { qid, src: 'bridge' as const });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('document', makeDocument());
  vi.stubGlobal('location', { pathname: '/' });
  setPageUi(ui);
  calls.length = 0;
  Q.queue.splice(0);
});
afterEach(() => vi.unstubAllGlobals());

describe('editQueue', () => {
  it('title: typed by hand, kept through renumbering; reset regenerates it', async () => {
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'title', id: 'a', title: 'Mine' });
    expect(Q.queue[0]).toMatchObject({ title: 'Mine', titleEdited: true });
    Q.assignNumbers();
    expect(Q.queue[0]!.title).toBe('Mine');
    await editQueue({ op: 'resetTitle', id: 'a' });
    expect(Q.queue[0]!.titleEdited).toBe(false);
    expect(Q.queue[0]!.title).not.toBe('Mine');
    expect(calls).toEqual(['queue', 'queue']);
  });

  it('artists: empty goes back to automatic', async () => {
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'artists', id: 'a', artists: 'SZA' });
    expect(Q.queue[0]).toMatchObject({ artists: 'SZA', artistsEdited: true });
    await editQueue({ op: 'artists', id: 'a', artists: '  ' });
    expect(Q.queue[0]!.artistsEdited).toBe(false);
  });

  it('release time: set by hand, null goes back to the queue time', async () => {
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'publishAt', id: 'a', at: 1_900_000_000_000 });
    expect(Q.queue[0]).toMatchObject({ publishAt: 1_900_000_000_000, publishEdited: true });
    await editQueue({ op: 'publishAt', id: 'a', at: null });
    expect(Q.queue[0]).toMatchObject({ publishAt: null, publishEdited: false });
  });

  it('nothing changes on an item that is uploading, done, or being fetched for upload', async () => {
    Q.queue.push(item('a', 'uploading'), item('b', 'done'));
    await editQueue({ op: 'title', id: 'a', title: 'x' });
    await editQueue({ op: 'title', id: 'b', title: 'x' });
    expect(Q.queue.map((i) => i.title)).toEqual(['', '']);
    expect(calls).toEqual([]);
  });

  it('move swaps with a neighbour that can still change, never past one that cannot', async () => {
    Q.queue.push(item('a', 'done'), item('b', 'pending'), item('c', 'error'));
    await editQueue({ op: 'move', id: 'b', by: -1 });
    expect(Q.queue.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    await editQueue({ op: 'move', id: 'b', by: 1 });
    expect(Q.queue.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('preset per item and for all items not yet uploaded', async () => {
    Q.queue.push(item('a', 'pending', { titleEdited: true }), item('b', 'done', { presetId: 'lofi' }), item('c', 'error'));
    await editQueue({ op: 'preset', id: 'a', presetId: 'lofi' });
    expect(Q.queue[0]).toMatchObject({ presetId: 'lofi', titleEdited: false });
    await editQueue({ op: 'presetAll', presetId: 'shorts' });
    expect(Q.queue.map((i) => i.presetId)).toEqual(['shorts', 'lofi', 'shorts']);
  });

  it('attach: a .txt is read and let go, a thumbnail replaces the old one', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    vi.spyOn(files, 'bridgeFiles').mockResolvedValue({
      files: [qfile('a.txt', 't1', '0:00 X - Y'), qfile('a.jpg', 'i1')], failed: [],
    });
    Q.queue.push(item('a', 'pending', { titleEdited: true, thumb: { id: 'old', src: 'bridge', name: 'o.jpg', size: 1, type: '' } }));
    await editQueue({ op: 'attach', id: 'a', fileIds: ['t1', 'i1'] });
    expect(Q.queue[0]).toMatchObject({ txt: '0:00 X - Y', txtName: 'a.txt', titleEdited: false, thumb: { id: 'i1', name: 'a.jpg' } });
    expect(drop.mock.calls.flat(2).map((r) => r.id).sort()).toEqual(['old', 't1']);
  });

  it('attach lets go of the files the bridge could not read', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    vi.spyOn(files, 'bridgeFiles').mockResolvedValue({ files: [qfile('a.jpg', 'i1')], failed: [{ id: 't1', reason: 'gone' }] });
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'attach', id: 'a', fileIds: ['t1', 'i1'] });
    expect(calls).toContain('toast:Could not add 1 file(s): gone');
    expect(drop.mock.calls.flat(2).map((r) => r.id)).toEqual(['t1']);
    expect(Q.queue[0]!.thumb?.id).toBe('i1');
  });

  it('attach to an item that started uploading meanwhile lets every file go', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    vi.spyOn(files, 'bridgeFiles').mockImplementation(async () => {
      Q.queue[0]!.status = 'uploading';
      return { files: [qfile('a.txt', 't1')], failed: [] };
    });
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'attach', id: 'a', fileIds: ['t1'] });
    expect(Q.queue[0]!.txt).toBe('');
    expect(drop).toHaveBeenCalledWith([{ id: 't1', src: 'bridge' }]);
  });

  it('dropping the thumbnail lets its file go; dropping the .txt resets the title', async () => {
    vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    Q.queue.push(item('a', 'pending', { txt: 'x', txtName: 'a.txt', titleEdited: true, thumb: { id: 'i', src: 'bridge', name: 'a.jpg', size: 1, type: '' } }));
    await editQueue({ op: 'dropThumb', id: 'a' });
    expect(Q.queue[0]!.thumb).toBe(null);
    expect(drop).toHaveBeenCalledWith([{ id: 'i', src: 'bridge' }]);
    await editQueue({ op: 'dropTxt', id: 'a' });
    expect(Q.queue[0]).toMatchObject({ txt: '', txtName: '', titleEdited: false });
  });

  it('fix tracklist rewrites the .txt and says what changed', async () => {
    Q.queue.push(item('a', 'pending', { txt: '0:05 A - One\n3:00 B - Two\n6:00 C - Three' }));
    await editQueue({ op: 'fixTracklist', id: 'a' });
    expect(Q.queue[0]!.txt.startsWith('0:00')).toBe(true);
    expect(calls.some((c) => c.startsWith('toast:Tracklist fixed: '))).toBe(true);
  });

  it('presetAll and move leave alone the item the run is fetching a file for', async () => {
    vi.spyOn(Q, 'currentItemId').mockReturnValue('a');
    Q.queue.push(item('a', 'pending'), item('b', 'pending'));
    await editQueue({ op: 'presetAll', presetId: 'lofi' });
    expect(Q.queue.map((i) => i.presetId)).toEqual(['trapsoul', 'lofi']);
    await editQueue({ op: 'move', id: 'b', by: -1 });
    expect(Q.queue.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('an edit after the summary refuses the start', () => {
  const QUEUE_CHANGED = 'toast:The queue changed after you confirmed — click Start again to see the new summary';
  const preflight = async () => {
    Q.queue.push(item('a', 'pending'));
    const s = await Q.startSummary();
    if ('error' in s) throw new Error(s.error);
    return { channelId: s.channel.id, ids: s.ids, editRev: s.editRev };
  };
  beforeEach(() => vi.stubGlobal('location', { pathname: '/channel/UCabcdefghijklmn/videos' }));

  it('a release time changed after the preflight', async () => {
    const seen = await preflight();
    await editQueue({ op: 'publishAt', id: 'a', at: 1_900_000_000_000 });
    calls.length = 0;
    await Q.startQueue(seen);
    expect(calls).toEqual([QUEUE_CHANGED]);
    expect(Q.queue[0]!.status).toBe('pending');
  });

  it('no edit: the start gets past the binding', async () => {
    const seen = await preflight();
    calls.length = 0;
    await Q.startQueue(seen);
    expect(calls).not.toContain(QUEUE_CHANGED);
  });

  it('a preset deleted after the preflight', async () => {
    disposeState();
    fakeBrowser.reset();
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
    await initState(async () => SCHEMA_VERSION);
    Q.queue.push(item('a', 'pending', { presetId: 'lofi' }));
    const s = await Q.startSummary();
    if ('error' in s) throw new Error(s.error);
    const off = followStoredChanges();
    await browser.storage.local.set({ presets: defaultPresets().filter((p) => p.id !== 'lofi') });
    await vi.waitFor(() => expect(Q.queue[0]!.presetId).toBe(activeId));
    off();
    calls.length = 0;
    await Q.startQueue({ channelId: s.channel.id, ids: s.ids, editRev: s.editRev });
    expect(calls).toContain(QUEUE_CHANGED);
    disposeState();
  });
});

describe('edit guards', () => {
  it('an unknown preset id changes nothing', async () => {
    Q.queue.push(item('a', 'pending'), item('b', 'pending'));
    await editQueue({ op: 'preset', id: 'a', presetId: 'nope' });
    await editQueue({ op: 'presetAll', presetId: 'nope' });
    expect(Q.queue.map((i) => i.presetId)).toEqual(['trapsoul', 'trapsoul']);
    expect(calls).toEqual([]);
  });

  it('attach reads every .txt before it changes the item: a run that takes it mid-read leaves it alone', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    vi.spyOn(files, 'bridgeFiles').mockResolvedValue({ files: [qfile('a.txt', 't1'), qfile('a.jpg', 'i1')], failed: [] });
    vi.spyOn(Q, 'readText').mockImplementation(async () => {
      Q.queue[0]!.status = 'uploading';
      return 'text';
    });
    Q.queue.push(item('a', 'pending', { titleEdited: true }));
    await editQueue({ op: 'attach', id: 'a', fileIds: ['t1', 'i1'] });
    expect(Q.queue[0]).toMatchObject({ txt: '', txtName: '', thumb: null, titleEdited: true });
    expect(drop.mock.calls.flat(2).map((r) => r.id).sort()).toEqual(['i1', 't1']);
  });
});

describe('handleQueueEdit', () => {
  const yes = async () => true;
  const no = async () => false;

  it('refused: the files the panel stored for an attach are let go, nothing is edited', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    Q.queue.push(item('a', 'pending'));
    await handleQueueEdit({ op: 'attach', id: 'a', fileIds: ['t1', 'i1'] }, no);
    expect(drop).toHaveBeenCalledWith([{ id: 't1', src: 'bridge' }, { id: 'i1', src: 'bridge' }]);
    await handleQueueEdit({ op: 'title', id: 'a', title: 'X' }, no);
    expect(Q.queue[0]!.title).toBe('');
  });

  it('applies when allowed', async () => {
    Q.queue.push(item('a', 'pending'));
    await handleQueueEdit({ op: 'title', id: 'a', title: 'X' }, yes);
    expect(Q.queue[0]!.title).toBe('X');
  });

  it('malformed payloads are dropped', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    Q.queue.push(item('a', 'pending'));
    for (const bad of [null, 'x', {}, { op: 'nope', id: 'a' }, { op: 'title', id: 1, title: 'X' }, { op: 'title', id: 'a' },
      { op: 'move', id: 'a', by: 2 }, { op: 'attach', id: 'a', fileIds: 'x' }, { op: 'attach', id: 'a', fileIds: [1] },
      { op: 'publishAt', id: 'a', at: 'soon' }, { op: 'presetAll' }]) {
      await handleQueueEdit(bad, yes);
    }
    expect(Q.queue[0]).toMatchObject({ title: '' });
    expect(Q.queue[0]!.publishAt).toBeFalsy();
    expect(drop).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe('handleQueueAdd', () => {
  it('refused: the files the panel stored are let go', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    const bridge = vi.spyOn(files, 'bridgeFiles');
    await handleQueueAdd(['x1', 'x2'], async () => false);
    expect(drop).toHaveBeenCalledWith([{ id: 'x1', src: 'bridge' }, { id: 'x2', src: 'bridge' }]);
    expect(bridge).not.toHaveBeenCalled();
  });

  it('files the bridge could not read are let go', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    vi.spyOn(files, 'bridgeFiles').mockResolvedValue({ files: [], failed: [{ id: 'x1', reason: 'gone' }] });
    await handleQueueAdd(['x1'], async () => true);
    expect(drop).toHaveBeenCalledWith([{ id: 'x1', src: 'bridge' }]);
    expect(calls).toContain('toast:Could not add 1 file(s): gone');
  });

  // The panel deletes every handle when queue:add rejects, so the tab must not reject once it
  // has taken files: what the queue keeps stays, the rest addQueued has let go.
  it('a failure after videos were queued: no rejection, a toast, the queue shown', async () => {
    const vid = qfile('Mix 1.mp4', 'v1');
    const txt = qfile('Mix 1.txt', 't1');
    vi.spyOn(files, 'bridgeFiles').mockResolvedValue({ files: [vid, txt], failed: [] });
    vi.spyOn(Q, 'addQueued').mockImplementation(async () => {
      Q.queue.push(item('v1', 'pending'));
      throw new Error('boom');
    });
    await expect(handleQueueAdd(['v1', 't1'], async () => true)).resolves.toBeUndefined();
    expect(calls).toEqual(['toast:Could not add 1 file(s): boom', 'queue']);
  });
});

// A .txt that can't be read is one failed file: the rest of the drop is added as usual,
// with its summary (and the remembered edits restored), and the count is that one file.
describe('handleQueueAdd with a .txt that cannot be read', () => {
  it('says so for that file only; the videos and the other .txt are added with the summary', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    const a = qfile('A.mp4', 'va'), at = qfile('A.txt', 'ta', '00:00 X - Y'), b = qfile('B.mp4', 'vb'), bt = qfile('B.txt', 'tb');
    bt.arrayBuffer = () => Promise.reject(new DOMException('changed', 'NotReadableError'));
    vi.spyOn(files, 'bridgeFiles').mockResolvedValue({ files: [a, at, b, bt], failed: [] });
    await expect(handleQueueAdd(['va', 'ta', 'vb', 'tb'], async () => true)).resolves.toBeUndefined();
    expect(calls).toContain('toast:Could not add 1 file(s): changed');
    expect(calls).toContain('toast:Added 2 video(s) · 1 .txt description file(s)');
    expect(Q.queue.map((i) => [i.id, i.txt])).toEqual([['va', '00:00 X - Y'], ['vb', '']]);
    expect(drop.mock.calls.flat(2).map((r) => r.id).sort()).toEqual(['ta', 'tb']);
  });
});

describe('followStoredChanges', () => {
  afterEach(() => disposeState());

  it('a deleted preset: items not being uploaded move to the default preset', async () => {
    disposeState();
    fakeBrowser.reset();
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
    await initState(async () => SCHEMA_VERSION);
    Q.queue.push(item('a', 'pending', { presetId: 'lofi' }), item('b', 'uploading', { presetId: 'lofi' }), item('c', 'error', { presetId: 'lofi' }));
    const off = followStoredChanges();
    await browser.storage.local.set({ presets: defaultPresets().filter((p) => p.id !== 'lofi') });
    await vi.waitFor(() => expect(calls).toContain('queue'));
    off();
    expect(Q.queue.map((i) => i.presetId)).toEqual([activeId, 'lofi', activeId]);
    expect(Q.queue[0]!.title).not.toBe('');
  });

  it('at load: items whose preset was deleted while no Studio tab was open move to the default preset', async () => {
    disposeState();
    fakeBrowser.reset();
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: defaultPresets().filter((p) => p.id !== 'lofi') });
    await initState(async () => SCHEMA_VERSION);
    Q.queue.push(item('a', 'pending', { presetId: 'lofi' }), item('b', 'done', { presetId: 'lofi' }));
    const off = followStoredChanges();
    await vi.waitFor(() => expect(calls).toContain('queue'));
    off();
    expect(Q.queue.map((i) => i.presetId)).toEqual([activeId, activeId]);
  });

  it('a change that leaves the queue as it is writes nothing (an idle tab keeps its copy to itself)', async () => {
    disposeState();
    fakeBrowser.reset();
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
    await initState(async () => SCHEMA_VERSION);
    Q.queue.push(item('a', 'pending'));
    Q.assignNumbers();
    const off = followStoredChanges();
    await new Promise((r) => setTimeout(r, 10));
    calls.length = 0;
    await browser.storage.local.set({ settings: { notify: false } });
    await new Promise((r) => setTimeout(r, 10));
    off();
    expect(calls).not.toContain('queue');
  });

  // Two idle Studio tabs: B (this module) hears a title-template keystroke while A has a
  // card edit on its way to storage. B works the new titles out in memory and writes
  // nothing, so it cannot land its copy over A's edit.
  it('a title-template change in an idle tab: titles follow in memory, the queue is not written', async () => {
    disposeState();
    fakeBrowser.reset();
    const stored = item('a', 'pending', { n: 1, title: 'old' });
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, queue: [stored] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    setPageUi(createContentUi());
    const off = followStoredChanges();
    await new Promise((r) => setTimeout(r, 400)); // the load-time requeue, and any save it makes
    await flushState();
    const writes: unknown[] = [];
    const spy = (ch: Record<string, { newValue?: unknown }>) => { if (ch.queue) writes.push(ch.queue.newValue); };
    browser.storage.onChanged.addListener(spy);
    try {
      const presets = defaultPresets().map((p) => (p.id === 'trapsoul' ? { ...p, title: 'NEW {n}' } : p));
      await browser.storage.local.set({ presets });
      await vi.waitFor(() => expect(Q.queue[0]!.title).toBe('NEW 1'));
      // Tab A's card edit reaches storage; B mirrors it.
      const edited = { ...stored, title: 'Mine', titleEdited: true };
      await browser.storage.local.set({ queue: [edited] });
      await new Promise((r) => setTimeout(r, 400)); // past B's 300 ms save, had it scheduled one
      await flushState();
      expect(writes).toEqual([[edited]]); // A's write only
      expect((await browser.storage.local.get('queue')).queue).toEqual([edited]);
      expect(Q.queue[0]!.title).toBe('Mine');
    } finally {
      browser.storage.onChanged.removeListener(spy);
      off();
      setPageUi(ui);
    }
  });
});
