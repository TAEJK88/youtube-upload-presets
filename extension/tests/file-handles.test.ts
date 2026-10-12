import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHandles } from '../lib/file-handles';
import { fakeChrome } from './fake-files';

afterEach(() => vi.restoreAllMocks());

// One page of the extension with its keeper, in a fake Chrome (tests/fake-files.ts).
const pageWith = (chrome: ReturnType<typeof fakeChrome>, kind: 'panel' | 'frame' = 'panel') => {
  const page = chrome.page(kind);
  const files = createHandles(page.load, page.list);
  return { page, files, gc: () => page.gc(files.held().values()) };
};

describe('the fake Chrome: a grant lives only while a handle object does', () => {
  it('a file read once and dropped loses read access at the next collection (the bug)', async () => {
    const chrome = fakeChrome();
    const panel = chrome.page();
    await panel.put('a', panel.pick('/v/a.mp4'));
    expect(await (await panel.load('a'))!.queryPermission()).toBe('granted');
    panel.gc();
    expect(chrome.refs('/v/a.mp4')).toBe(0);
    expect(await (await panel.load('a'))!.queryPermission()).toBe('prompt');
  });
});

describe('held handles', () => {
  it('a handle kept at intake keeps the read access through collections', async () => {
    const chrome = fakeChrome();
    const { page, files, gc } = pageWith(chrome);
    const h = page.pick('/v/a.mp4');
    await page.put('a', h);
    files.keep('a', h);
    gc();
    gc();
    expect(chrome.refs('/v/a.mp4')).toBe(1);
    expect(await files.states(['a'])).toEqual([{ id: 'a', state: 'granted' }]);
    expect(await (await files.get('a'))!.getFile()).toBeInstanceOf(File);
  });

  it('a handle read from the store is kept from then on: the same object every time', async () => {
    const chrome = fakeChrome();
    const adder = chrome.page();
    await adder.put('a', adder.pick('/v/a.mp4'));
    const { files, gc } = pageWith(chrome);
    const first = await files.get('a');
    adder.close(); // the page that added it is gone: this one's object is the last
    gc();
    expect(await files.get('a')).toBe(first);
    expect(chrome.refs('/v/a.mp4')).toBe(1);
    expect(await files.states(['a', 'nope'])).toEqual([{ id: 'a', state: 'granted' }, { id: 'nope', state: 'missing' }]);
  });

  it('a request inside a click grants silently, and the grant stays because the handle is held', async () => {
    const chrome = fakeChrome();
    const adder = chrome.page();
    await adder.put('a', adder.pick('/v/a.mp4'));
    await adder.put('b', adder.pick('/v/b.mp4'));
    adder.close(); // an extension reload: every handle gone
    const { page, files, gc } = pageWith(chrome);
    expect((await files.states(['a', 'b'])).map((s) => s.state)).toEqual(['prompt', 'prompt']);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await page.click(() => files.request(['a', 'b']))).toEqual([
      { id: 'a', before: 'prompt', after: 'granted' }, { id: 'b', before: 'prompt', after: 'granted' },
    ]);
    expect(info.mock.calls.map((c) => c.join(' '))).toEqual(['[ytup] regrant a: prompt -> granted', '[ytup] regrant b: prompt -> granted']);
    gc();
    expect((await files.states(['a', 'b'])).map((s) => s.state)).toEqual(['granted', 'granted']);
  });

  it('a request that changes nothing says so: an older Chrome, or no click', async () => {
    for (const [chrome, inClick] of [[fakeChrome({ silentGrant: false }), true], [fakeChrome(), false]] as const) {
      const adder = chrome.page();
      await adder.put('a', adder.pick('/v/a.mp4'));
      adder.close();
      const { page, files } = pageWith(chrome);
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const ask = () => files.request(['a']);
      expect(await (inClick ? page.click(ask) : ask())).toEqual([{ id: 'a', before: 'prompt', after: 'prompt' }]);
      expect(info).toHaveBeenCalledWith('[ytup] regrant a: prompt -> prompt');
      info.mockRestore();
    }
  });

  it('a file already readable is not asked for; a blocked one is, and stays blocked', async () => {
    const chrome = fakeChrome();
    const { page, files } = pageWith(chrome);
    for (const id of ['a', 'b']) {
      const h = page.pick(`/v/${id}.mp4`);
      await page.put(id, h);
      files.keep(id, h);
    }
    chrome.block('/v/b.mp4');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await page.click(() => files.request(['a', 'b', 'gone']))).toEqual([
      { id: 'a', before: 'granted', after: 'granted' }, { id: 'b', before: 'denied', after: 'denied' }, { id: 'gone', before: 'missing', after: 'missing' },
    ]);
    expect(chrome.requests).toEqual(['/v/b.mp4']);
  });

  it('one handle that fails does not stop the others, and the error is named in the log', async () => {
    const ok = { queryPermission: async () => 'prompt', requestPermission: async () => 'granted' } as unknown as FileSystemFileHandle;
    const noAsk = { queryPermission: async () => 'prompt', requestPermission: async () => { throw new DOMException('no gesture', 'SecurityError'); } } as unknown as FileSystemFileHandle;
    const noQuery = { queryPermission: async () => { throw new DOMException('gone', 'InvalidStateError'); } } as unknown as FileSystemFileHandle;
    const all: Record<string, FileSystemFileHandle> = { ok, noAsk, noQuery };
    const files = createHandles(async (id) => { if (id === 'db') throw new DOMException('idb', 'UnknownError'); return all[id]; }, async () => []);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await files.request(['db', 'noQuery', 'noAsk', 'ok'])).toEqual([
      { id: 'db', before: 'error', after: 'error' }, { id: 'noQuery', before: 'error', after: 'error' },
      { id: 'noAsk', before: 'prompt', after: 'prompt', error: 'SecurityError' }, { id: 'ok', before: 'prompt', after: 'granted' },
    ]);
    expect(warn.mock.calls.map((c) => c.join(' '))).toEqual(['[ytup] file access: db UnknownError', '[ytup] file access: noQuery InvalidStateError']);
    expect(info.mock.calls.map((c) => c.join(' '))).toEqual([
      '[ytup] regrant db: error -> error', '[ytup] regrant noQuery: error -> error',
      '[ytup] regrant noAsk: prompt -> prompt (SecurityError)', '[ytup] regrant ok: prompt -> granted',
    ]);
  });

  it('lets go of a file once it is neither queued nor stored; one still stored is on its way in', async () => {
    const chrome = fakeChrome();
    const { page, files, gc } = pageWith(chrome);
    for (const id of ['a', 'b', 'c']) {
      const h = page.pick(`/v/${id}.mp4`);
      await page.put(id, h);
      files.keep(id, h);
    }
    chrome.remove('b'); // the Studio tab let go of it (files:delete)
    await files.prune(['a']);
    expect([...files.held().keys()]).toEqual(['a', 'c']); // c: stored, not in the queue yet
    gc();
    expect([chrome.refs('/v/a.mp4'), chrome.refs('/v/b.mp4'), chrome.refs('/v/c.mp4')]).toEqual([1, 0, 1]);
    files.release(['c']);
    expect([...files.held().keys()]).toEqual(['a']);
  });

  it('a store that can\'t be listed lets go of nothing', async () => {
    const files = createHandles(async () => undefined, async () => { throw new Error('idb'); });
    files.keep('a', {} as FileSystemFileHandle);
    await files.prune([]);
    expect(files.held().size).toBe(1);
  });
});

describe('two pages', () => {
  it('the side panel closes during a run: the bridge still holds the files it was asked for', async () => {
    const chrome = fakeChrome();
    const panel = pageWith(chrome);
    const h = panel.page.pick('/v/a.mp4');
    await panel.page.put('a', h);
    panel.files.keep('a', h);
    const bridge = pageWith(chrome, 'frame');
    await bridge.files.get('a');
    panel.page.close();
    bridge.gc();
    expect(await bridge.files.states(['a'])).toEqual([{ id: 'a', state: 'granted' }]);
    // The Studio tab reloads: the bridge frame goes with it, and nothing holds the file.
    bridge.page.close();
    const again = pageWith(chrome, 'frame');
    expect(await again.files.states(['a'])).toEqual([{ id: 'a', state: 'prompt' }]);
  });

  it('two panels (two windows) each hold their own object for the same file', async () => {
    const chrome = fakeChrome();
    const one = pageWith(chrome);
    const h = one.page.pick('/v/a.mp4');
    await one.page.put('a', h);
    one.files.keep('a', h);
    const two = pageWith(chrome);
    await two.files.states(['a']);
    expect(chrome.refs('/v/a.mp4')).toBe(2);
    one.page.close();
    two.gc();
    expect(await two.files.states(['a'])).toEqual([{ id: 'a', state: 'granted' }]);
  });
});
