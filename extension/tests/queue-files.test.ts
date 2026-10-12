import { afterEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { bridgeFiles, probeBridge, dropFiles, getQueueFile, pageFiles, setBridge } from '../lib/studio/queue-files';
import { fakeBridge } from './bridge-fake';

afterEach(() => { setBridge(null); vi.restoreAllMocks(); });

describe('queue files', () => {
  it('page files get unguessable ids and stay in this page', async () => {
    const [a] = pageFiles([new File(['v'], 'A.mp4')]);
    expect(a!.qid).toMatch(/^[0-9a-f-]{36}$/);
    expect(a!.src).toBe('page');
    expect(await getQueueFile(a!.qid, 'page')).toBe(a);
  });

  it('a page file lost to a reload says to add it again', async () => {
    await expect(getQueueFile('gone', 'page')).rejects.toThrow("Studio's own upload dialog");
  });

  it('bridge files come through the bridge by id', async () => {
    setBridge(fakeBridge(async (id) => new File(['v'], id + '.mp4')));
    const { files, failed } = await bridgeFiles(['x']);
    expect(files.map((f) => [f.name, f.qid, f.src])).toEqual([['x.mp4', 'x', 'bridge']]);
    expect(failed).toEqual([]);
  });

  it('turns bridge codes into sentences', async () => {
    setBridge(fakeBridge(async (id) => { throw new Error(id); }));
    await expect(getQueueFile('permission', 'bridge')).rejects.toThrow('Re-grant access');
    await expect(getQueueFile('denied', 'bridge')).rejects.toThrow('The browser blocked reading this file');
    await expect(getQueueFile('missing', 'bridge')).rejects.toThrow('no longer available');
    await expect(getQueueFile('read', 'bridge')).rejects.toThrow('moved or renamed');
    await expect(getQueueFile('bridge not ready', 'bridge')).rejects.toThrow('(bridge not ready)');
    const { failed } = await bridgeFiles(['missing']);
    expect(failed).toEqual([{ id: 'missing', reason: 'This file is no longer available — add it again' }]);
  });

  it('a blocked file says to add it again, not to re-grant (R2-m2)', async () => {
    setBridge(fakeBridge(async () => { throw new Error('denied'); }));
    await expect(getQueueFile('x', 'bridge')).rejects.toThrow('The browser blocked reading this file — remove it from the queue and add it again');
  });

  it('dropping forgets page files, asks the background to delete stored handles, and the bridge to let go of them', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const bridge = fakeBridge(async (id) => new File(['v'], id));
    setBridge(bridge);
    const [a] = pageFiles([new File(['v'], 'A.mp4')]);
    dropFiles([{ id: a!.qid, src: 'page' }, { id: 'h1', src: 'bridge' }]);
    await expect(getQueueFile(a!.qid, 'page')).rejects.toThrow();
    expect(send).toHaveBeenCalledWith('files:delete', ['h1']);
    expect(bridge.release).toHaveBeenCalledWith(['h1']);
    // Nothing from the panel: no message, and the bridge is not asked.
    send.mockClear();
    bridge.release.mockClear();
    dropFiles([{ id: a!.qid, src: 'page' }]);
    expect(send).not.toHaveBeenCalled();
    expect(bridge.release).not.toHaveBeenCalled();
  });

  it('a file the bridge has no read access to is reported to the side panel (its banner shows for it)', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    setBridge(fakeBridge(async (id) => { throw new Error(id === 'p' ? 'permission' : 'denied'); }));
    await expect(getQueueFile('p', 'bridge')).rejects.toThrow('Re-grant access');
    expect(send.mock.calls).toEqual([['files:lost', ['p']]]);
    await expect(getQueueFile('d', 'bridge')).rejects.toThrow('The browser blocked');
    expect(send).toHaveBeenCalledTimes(1); // a blocked file is not something a re-grant fixes
  });

  it('before a run the bridge takes every file of the run; it answers whatever it says about a file', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const access: Record<string, 'granted' | 'missing' | 'denied' | 'error'> = { a: 'granted', b: 'missing', c: 'denied', d: 'error' };
    const bridge = fakeBridge(async () => { throw new Error('not read by the probe'); }, (id) => access[id]!);
    setBridge(bridge);
    // 'denied' (a blocked prompt) fails that item only, as the panel lets Start through.
    expect(await probeBridge(['a', 'b', 'c', 'd'])).toBe('answers');
    expect(bridge.hold.mock.calls).toEqual([[['a', 'b', 'c', 'd']]]);
    expect(send).not.toHaveBeenCalled();
  });

  it('files without read permission are told apart: the run must wait for a re-grant, and the panel is told which before the answer', async () => {
    const order: string[] = [];
    vi.spyOn(messages, 'sendMessage').mockImplementation((async (type: string, ids: string[]) => {
      await new Promise((r) => setTimeout(r, 5)); // the panel takes a moment
      order.push(`${type}:${ids.join(',')}`);
    }) as never);
    setBridge(fakeBridge(async () => new File(['v'], 'x'), (id) => (id === 'b' ? 'granted' : 'prompt')));
    expect(await probeBridge(['a', 'b', 'c']).then((p) => (order.push(p), p))).toBe('permission');
    expect(order).toEqual(['files:lost:a,c', 'permission']);
  });

  it('with no side panel to tell, the answer is the same', async () => {
    vi.spyOn(messages, 'sendMessage').mockRejectedValue(new Error('Could not establish connection'));
    setBridge(fakeBridge(async () => new File(['v'], 'x'), () => 'prompt'));
    expect(await probeBridge(['a'])).toBe('permission');
  });

  it('the bridge does not answer when absent, broken or silent', async () => {
    setBridge(null);
    expect(await probeBridge(['x'])).toBe('silent');
    setBridge({ ...fakeBridge(async () => new File(['v'], 'x')), hold: async () => { throw new Error('bridge not ready'); } });
    expect(await probeBridge(['x'])).toBe('silent');
    setBridge({ ...fakeBridge(async () => new File(['v'], 'x')), hold: () => new Promise<never>(() => {}) });
    expect(await probeBridge(['x'], 20)).toBe('silent');
  });
});
