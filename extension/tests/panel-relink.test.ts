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
    expect(m.missing).toEqual(['c.mp4']); // same name, other size: not this video
    expect(m.unused).toBe(2);
  });

  it('nothing matches: no pairs, every lost item missing, every pick unused', () => {
    const m = matchLost([lost('A', 'a.mp4')], [pick('z.mp4')]);
    expect(m).toEqual({ pairs: [], missing: ['a.mp4'], unused: 1 });
  });

  it('duplicate names: each picked file goes to one item, in queue order', () => {
    const [p1, p2] = [pick('mix.mp4', 9), pick('mix.mp4', 9)];
    expect(matchLost([lost('A', 'mix.mp4', 9), lost('B', 'mix.mp4', 9)], [p1, p2]).pairs).toEqual([{ id: 'A', handle: p1.handle }, { id: 'B', handle: p2.handle }]);
    const one = matchLost([lost('A', 'mix.mp4'), lost('B', 'mix.mp4')], [p1]);
    expect(one.pairs).toEqual([{ id: 'A', handle: p1.handle }]);
    expect(one.missing).toEqual(['mix.mp4']);
  });

  it('stores each handle under its item id, keeps it, and sends the ids', async () => {
    const put = vi.fn(async (_id: string, _h: FileSystemFileHandle) => {});
    const deliver = vi.fn(async (_ids: string[]) => {});
    const [a, b] = [pick('a.mp4').handle, pick('b.mp4').handle];
    await relinkFiles([{ id: 'A', handle: a }, { id: 'B', handle: b }], deliver, put, async () => {});
    expect(put.mock.calls).toEqual([['A', a], ['B', b]]);
    expect(deliver).toHaveBeenCalledWith(['A', 'B']);
    expect([...handles.held()]).toEqual([['A', a], ['B', b]]);
  });

  it('a tab that does not take them gets the handles forgotten again', async () => {
    const del = vi.fn(async (_id: string) => {});
    await expect(relinkFiles([{ id: 'A', handle: pick('a.mp4').handle }], async () => { throw new Error('no receiver'); }, async () => {}, del)).rejects.toThrow('no receiver');
    expect(del).toHaveBeenCalledWith('A');
    expect(handles.held().size).toBe(0);
  });

  it('the summary says how many matched and names what is still missing', () => {
    expect(relinkSummary(2, 3, ['c.mp4'], 1)).toBe('Re-added 2 of 3 lost files · still missing: c.mp4 · 1 picked file(s) matched no lost video and were not added');
    expect(relinkSummary(1, 1, [], 0)).toBe('Re-added 1 of 1 lost files');
    expect(relinkSummary(0, 7, ['1', '2', '3', '4', '5', '6', '7'], 0)).toBe('Re-added 0 of 7 lost files · still missing: 1, 2, 3, 4, 5 and 2 more');
  });
});
