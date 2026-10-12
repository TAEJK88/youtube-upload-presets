import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allowAll, tally } from '../lib/file-allow';
import { createHandles } from '../lib/file-handles';
import { fakeChrome, type Answer, type FakeHandle } from './fake-files';

// The "Allow file access" page's click, over a fake Chrome whose tab shows one question per
// requestPermission() call (tests/fake-files.ts).
const info = () => vi.mocked(console.info).mock.calls.map((c) => c.join(' '));

// Files stored by a page that is gone (an extension reload), and the allow page open in a tab.
async function tabWith(ids: string[], answers: Answer[] = [], broken: string[] = []) {
  const chrome = fakeChrome();
  const adder = chrome.page();
  for (const id of ids) await adder.put(id, adder.pick(`/v/${id}.mp4`));
  adder.close();
  chrome.answers.push(...answers);
  const page = chrome.page('tab');
  const load = async (id: string) => {
    const h = await page.load(id);
    if (h && broken.includes(id)) h.requestPermission = async () => { chrome.requests.push(h.path); throw new DOMException('gone', 'NotFoundError'); };
    return h as FakeHandle | undefined;
  };
  const files = createHandles(load, page.list);
  const click = () => page.click(() => allowAll(ids, files));
  return { chrome, page, files, click };
}

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('allowAll: one question, then a look at every file, then the next', () => {
  it('"Allow on every visit" on the first question: the rest are readable and nothing else is asked', async () => {
    const { chrome, click } = await tabWith(['a', 'b', 'c'], ['always']);
    expect(await click()).toEqual([{ id: 'a', state: 'granted' }, { id: 'b', state: 'granted' }, { id: 'c', state: 'granted' }]);
    expect(chrome.requests).toEqual(['/v/a.mp4']);
    expect(info()).toEqual(['[ytup] regrant a: prompt -> granted']);
  });

  it('"Allow this time" answers one file: the next file is asked, one at a time', async () => {
    const { chrome, click } = await tabWith(['a', 'b'], ['once', 'once']);
    expect((await click()).map((s) => s.state)).toEqual(['granted', 'granted']);
    expect(chrome.requests).toEqual(['/v/a.mp4', '/v/b.mp4']);
    expect(info()).toEqual(['[ytup] regrant a: prompt -> granted', '[ytup] regrant b: prompt -> granted']);
  });

  it('a dismissed question ends the round: no question for the files after it', async () => {
    const { chrome, click } = await tabWith(['a', 'b', 'c'], ['dismiss', 'once', 'once']);
    expect((await click()).map((s) => s.state)).toEqual(['prompt', 'prompt', 'prompt']);
    expect(chrome.requests).toEqual(['/v/a.mp4']);
    expect(info()).toEqual(['[ytup] regrant a: prompt -> prompt']);
  });

  it('…also when it is not the first: allowed, dismissed, and the third is not asked', async () => {
    const { chrome, click } = await tabWith(['a', 'b', 'c'], ['once', 'dismiss', 'once']);
    expect((await click()).map((s) => s.state)).toEqual(['granted', 'prompt', 'prompt']);
    expect(chrome.requests).toEqual(['/v/a.mp4', '/v/b.mp4']);
  });

  it('"Don\'t allow" ends the round too', async () => {
    const { chrome, click } = await tabWith(['a', 'b'], ['deny', 'once']);
    expect((await click()).map((s) => s.state)).toEqual(['denied', 'prompt']);
    expect(chrome.requests).toEqual(['/v/a.mp4']);
  });

  it('readable, waiting and blocked files together: only the waiting ones are asked', async () => {
    const { chrome, page, files, click } = await tabWith(['a', 'b', 'c', 'd'], ['once', 'deny']);
    const fresh = page.pick('/v/a.mp4'); // added again meanwhile: readable
    files.keep('a', fresh);
    chrome.block('/v/b.mp4');
    expect(await click()).toEqual([{ id: 'a', state: 'granted' }, { id: 'b', state: 'denied' }, { id: 'c', state: 'granted' }, { id: 'd', state: 'denied' }]);
    expect(chrome.requests).toEqual(['/v/c.mp4', '/v/d.mp4']);
    expect(info()).toEqual(['[ytup] regrant c: prompt -> granted', '[ytup] regrant d: prompt -> denied']);
  });

  it('a request that throws is logged with its error and ends the round; the look after it is returned', async () => {
    const { chrome, click } = await tabWith(['a', 'b'], ['once'], ['a']);
    expect(await click()).toEqual([{ id: 'a', state: 'prompt' }, { id: 'b', state: 'prompt' }]);
    expect(chrome.requests).toEqual(['/v/a.mp4']);
    expect(info()).toEqual(['[ytup] regrant a: prompt -> prompt (NotFoundError)']);
  });

  it('no stored file: nothing is asked', async () => {
    const { chrome, click } = await tabWith([]);
    expect(await click()).toEqual([]);
    expect(chrome.requests).toEqual([]);
  });

  it('keeps the handles it asked on: the access outlives a collection', async () => {
    const { chrome, page, files, click } = await tabWith(['a', 'b'], ['once', 'once']);
    await click();
    page.gc(files.held().values());
    expect([chrome.state('/v/a.mp4'), chrome.state('/v/b.mp4')]).toEqual(['granted', 'granted']);
  });
});

describe('tally', () => {
  it('counts what the browser says about each file', () => {
    expect(tally([])).toEqual({ total: 0, granted: 0, prompt: 0, denied: 0, other: 0 });
    expect(tally([{ id: 'a', state: 'granted' }, { id: 'b', state: 'prompt' }, { id: 'c', state: 'denied' }, { id: 'd', state: 'error' }, { id: 'e', state: 'prompt' }, { id: 'f', state: 'missing' }]))
      .toEqual({ total: 6, granted: 1, prompt: 2, denied: 1, other: 2 });
  });
});
