import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as messages from '../lib/messages';
import { SCHEMA_VERSION } from '../lib/migrations';
import { defaultPresets } from '../lib/presets';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as files from '../lib/studio/queue-files';
import * as Q from '../lib/studio/queue-runner';
import { editQueue, followStoredChanges } from '../lib/studio/queue-edit';
import { activeId, disposeState, initState } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

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
});
