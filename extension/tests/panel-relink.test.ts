import { afterEach, describe, expect, it, vi } from 'vitest';
import { handles } from '../lib/file-handles';
import { lostItems, matchLost, relinkFiles, relinkSummary, type Picked } from '../lib/panel/relink';
import type { ViewItem } from '../lib/studio/queue-view';

const lost = (id: string, name: string, size = 0) => ({ id, file: { name, size, type: '' }, lost: true }) as ViewItem;
const pick = (name: string, size = 1): Picked => ({ handle: { kind: 'file', name } as unknown as FileSystemFileHandle, name, size });

afterEach(() => handles.release([...handles.held().keys()]));

describe('re-adding lost Studio-dialog files', () => {
  it('lostItems: only the items the tab marked lost', () => {
    expect(lostItems([lost('a', 'a.mp4'), { ...lost('b', 'b.mp4'), lost: false }, { ...lost('c', 'c.mp4'), lost: undefined }]).map((i) => i.id)).toEqual(['a']);
  });

  it('matches picked files to lost items by name, and by size when the item knows it', () => {
    const a = pick('a.mp4', 5);
    const b = pick('b.mp4', 7);
    const m = matchLost([lost('A', 'a.mp4', 5), lost('B', 'b.mp4'), lost('C', 'c.mp4', 3)], [b, pick('c.mp4', 4), a, pick('x.mp4')]);
    expect(m.pairs).toEqual([{ id: 'A', handle: a.handle }, { id: 'B', handle: b.handle }]);
    // C: same name, other size: not this video
    expect(m.unused).toBe(2);
  });

  it('nothing matches: no pairs, every pick unused', () => {
    const m = matchLost([lost('A', 'a.mp4')], [pick('z.mp4')]);
    expect(m).toEqual({ pairs: [], unused: 1 });
  });

  it('duplicate names: each picked file goes to one item, in queue order', () => {
    const [p1, p2] = [pick('mix.mp4', 9), pick('mix.mp4', 9)];
    expect(matchLost([lost('A', 'mix.mp4', 9), lost('B', 'mix.mp4', 9)], [p1, p2]).pairs).toEqual([{ id: 'A', handle: p1.handle }, { id: 'B', handle: p2.handle }]);
    const one = matchLost([lost('A', 'mix.mp4'), lost('B', 'mix.mp4')], [p1]);
    expect(one.pairs).toEqual([{ id: 'A', handle: p1.handle }]);
  });

  it('stores each handle under its item id, keeps it, sends the ids and answers what the tab took', async () => {
    const put = vi.fn(async (_id: string, _h: FileSystemFileHandle) => {});
    const del = vi.fn(async (_id: string) => {});
    const deliver = vi.fn(async (_ids: string[]) => ['A']);
    const [a, b] = [pick('a.mp4').handle, pick('b.mp4').handle];
    expect(await relinkFiles([{ id: 'A', handle: a }, { id: 'B', handle: b }], deliver, () => false, put, del)).toEqual(['A']);
    expect(put.mock.calls).toEqual([['A', a], ['B', b]]);
    expect(deliver).toHaveBeenCalledWith(['A', 'B']);
    expect(del.mock.calls).toEqual([['B']]); // not taken: forgotten again
    expect([...handles.held()]).toEqual([['A', a]]);
  });

  it('a tab that does not answer: the handles are forgotten, except an item the view now shows as a bridge file', async () => {
    const del = vi.fn(async (_id: string) => {});
    const pairs = [{ id: 'A', handle: pick('a.mp4').handle }, { id: 'B', handle: pick('b.mp4').handle }];
    // Stale view: A turned into a bridge file (another re-add) while this one was sent.
    await expect(relinkFiles(pairs, async () => { throw new Error('no receiver'); }, (id) => id === 'A', async () => {}, del)).rejects.toThrow('no receiver');
    expect(del.mock.calls).toEqual([['B']]);
    expect([...handles.held().keys()]).toEqual(['A']);
  });

  it('an answer that is not a list of ids counts as nothing taken (an older tab)', async () => {
    const del = vi.fn(async (_id: string) => {});
    expect(await relinkFiles([{ id: 'A', handle: pick('a.mp4').handle }], async () => undefined, () => false, async () => {}, del)).toEqual([]);
    expect(del).toHaveBeenCalledWith('A');
  });

  it('the summary counts what the tab took and names every lost video it did not', () => {
    const items = [lost('A', 'a.mp4'), lost('B', 'b.mp4'), lost('C', 'c.mp4')];
    expect(relinkSummary(items, ['A', 'C'], 1)).toBe('Re-added 2 of 3 lost files · still missing: b.mp4 · 1 picked file(s) matched no lost video and were not added');
    expect(relinkSummary(items.slice(0, 1), ['A'], 0)).toBe('Re-added 1 of 1 lost files');
    const seven = ['1', '2', '3', '4', '5', '6', '7'].map((n) => lost(n, n));
    expect(relinkSummary(seven, [], 0)).toBe('Re-added 0 of 7 lost files · still missing: 1, 2, 3, 4, 5 and 2 more');
  });
});
