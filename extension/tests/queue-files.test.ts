import { afterEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { bridgeAnswers, bridgeFiles, dropFiles, getQueueFile, pageFiles, setBridge } from '../lib/studio/queue-files';

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
    setBridge({ getFile: async (id) => new File(['v'], id + '.mp4') });
    const { files, failed } = await bridgeFiles(['x']);
    expect(files.map((f) => [f.name, f.qid, f.src])).toEqual([['x.mp4', 'x', 'bridge']]);
    expect(failed).toEqual([]);
  });

  it('turns bridge codes into sentences', async () => {
    setBridge({ getFile: async (id) => { throw new Error(id); } });
    await expect(getQueueFile('permission', 'bridge')).rejects.toThrow('Re-grant access');
    await expect(getQueueFile('missing', 'bridge')).rejects.toThrow('no longer available');
    await expect(getQueueFile('read', 'bridge')).rejects.toThrow('moved or renamed');
    await expect(getQueueFile('bridge not ready', 'bridge')).rejects.toThrow('(bridge not ready)');
    const { failed } = await bridgeFiles(['missing']);
    expect(failed).toEqual([{ id: 'missing', reason: 'This file is no longer available — add it again' }]);
  });

  it('dropping forgets page files and asks the background to delete stored handles', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const [a] = pageFiles([new File(['v'], 'A.mp4')]);
    dropFiles([{ id: a!.qid, src: 'page' }, { id: 'h1', src: 'bridge' }]);
    await expect(getQueueFile(a!.qid, 'page')).rejects.toThrow();
    expect(send).toHaveBeenCalledWith('files:delete', ['h1']);
  });

  it('the bridge answers when it hands over a file or says what is wrong with it', async () => {
    setBridge({ getFile: async (id) => new File(['v'], id) });
    expect(await bridgeAnswers('x')).toBe(true);
    for (const code of ['missing', 'permission', 'read']) {
      setBridge({ getFile: async () => { throw new Error(code); } });
      expect(await bridgeAnswers('x')).toBe(true);
    }
  });

  it('the bridge does not answer when absent, broken or silent', async () => {
    setBridge(null);
    expect(await bridgeAnswers('x')).toBe(false);
    setBridge({ getFile: async () => { throw new Error('bridge not ready'); } });
    expect(await bridgeAnswers('x')).toBe(false);
    setBridge({ getFile: () => new Promise<File>(() => {}) });
    expect(await bridgeAnswers('x', 20)).toBe(false);
  });
});
