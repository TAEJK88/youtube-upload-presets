import { describe, expect, it } from 'vitest';
import { CONNECT, fileOps, isBridgeConnect, readHandle } from '../lib/file-bridge';
import { createHandles } from '../lib/file-handles';
import { fakeChrome } from './fake-files';

const handle = (perm: PermissionState, getFile: () => Promise<File>) =>
  ({ kind: 'file', name: 'clip.mp4', queryPermission: async () => perm, getFile }) as unknown as FileSystemFileHandle;

describe('readHandle', () => {
  it('rejects with "missing" when the item has no stored handle', async () => {
    await expect(readHandle(undefined)).rejects.toThrow('missing');
  });

  it('rejects with "permission" when read access is not granted', async () => {
    await expect(readHandle(handle('prompt', async () => new File([], 'x')))).rejects.toThrow('permission');
  });

  it('rejects with "denied" when the user blocked read access', async () => {
    await expect(readHandle(handle('denied', async () => new File([], 'x')))).rejects.toThrow('denied');
  });

  it('rejects with "read" when the file is gone or unreadable', async () => {
    const gone = handle('granted', async () => { throw new DOMException('A requested file could not be found', 'NotFoundError'); });
    await expect(readHandle(gone)).rejects.toThrow('read');
  });

  it('returns the File when granted', async () => {
    const f = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
    expect(await readHandle(handle('granted', async () => f))).toBe(f);
  });
});

// The bridge frame in a fake Chrome (tests/fake-files.ts): a grant lives only while some page
// holds a handle object for the file.
describe('what the bridge frame answers', () => {
  const setup = async (ids: string[]) => {
    const chrome = fakeChrome();
    const panel = chrome.page();
    for (const id of ids) await panel.put(id, panel.pick(`/v/${id}.mp4`));
    const frame = chrome.page('frame');
    const files = createHandles(frame.load, frame.list);
    return { chrome, panel, frame, files, ops: fileOps(files), gc: () => frame.gc(files.held().values()) };
  };

  it('keeps the handle of a file it handed over: the next read works after the panel closed', async () => {
    const { panel, ops, gc } = await setup(['a']);
    expect((await ops.getFile('a')).name).toBe('a.mp4');
    panel.close();
    gc();
    expect((await ops.getFile('a')).name).toBe('a.mp4');
  });

  it('Start: takes every file of the run at once, so a later item cannot lose read access mid-run', async () => {
    const { chrome, panel, ops, gc } = await setup(['a', 'b', 'c']);
    chrome.block('/v/c.mp4');
    expect(await ops.hold(['a', 'b', 'c', 'gone'])).toEqual(['granted', 'granted', 'denied', 'missing']);
    panel.close(); // the side panel is closed during the run
    gc();
    expect((await ops.getFile('b')).name).toBe('b.mp4');
    await expect(ops.getFile('c')).rejects.toThrow('denied');
  });

  it('Start after an extension reload: every file is at "prompt", and the frame cannot ask', async () => {
    const { chrome, panel, ops } = await setup(['a', 'b']);
    panel.close();
    expect(await ops.hold(['a', 'b'])).toEqual(['prompt', 'prompt']);
    await expect(ops.getFile('a')).rejects.toThrow('permission');
    expect(chrome.requests).toEqual([]);
  });

  it('lets go of a file the queue is done with, and of one another tab removed', async () => {
    const { chrome, panel, files, ops, gc } = await setup(['a', 'b', 'c']);
    await ops.hold(['a', 'b', 'c']);
    panel.close();
    chrome.remove('c'); // removed in another Studio tab: only the store says so
    await ops.release(['a']);
    expect([...files.held().keys()]).toEqual(['b']);
    gc();
    expect([chrome.refs('/v/a.mp4'), chrome.refs('/v/b.mp4'), chrome.refs('/v/c.mp4')]).toEqual([0, 1, 0]);
  });
});

describe('isBridgeConnect', () => {
  const parent = {} as Window;
  const port = {} as MessagePort;
  const event = (over: Partial<{ origin: string; source: unknown; data: unknown; ports: MessagePort[] }> = {}) =>
    ({ origin: 'https://studio.youtube.com', source: parent, data: { ch: CONNECT }, ports: [port], ...over }) as unknown as MessageEvent;

  it('accepts the valid case', () => {
    expect(isBridgeConnect(event(), parent)).toBe(true);
  });

  it('rejects the wrong origin', () => {
    expect(isBridgeConnect(event({ origin: 'https://evil.example' }), parent)).toBe(false);
  });

  it('rejects when the source is not the parent window', () => {
    expect(isBridgeConnect(event({ source: {} }), parent)).toBe(false);
  });

  it('rejects the wrong channel', () => {
    expect(isBridgeConnect(event({ data: { ch: 'nope' } }), parent)).toBe(false);
  });

  it('rejects a missing port', () => {
    expect(isBridgeConnect(event({ ports: [] }), parent)).toBe(false);
  });
});
