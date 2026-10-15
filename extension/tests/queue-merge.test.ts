import { describe, expect, it } from 'vitest';
import { mergeQueue } from '../lib/studio/queue-merge';
import type { QueueItem } from '../lib/studio/queue-runner';

// A title other than the id is one the user typed (titleEdited), as a card edit sets it.
const it_ = (id: string, title = id): QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title,
  titleEdited: title !== id, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0,
});
const ids = (l: QueueItem[]) => l.map((i) => i.id);

describe('mergeQueue (two windows editing within 300 ms, 3b M3)', () => {
  const base = [it_('a'), it_('b'), it_('c')];

  it('keeps both edits when each side changed a different item', () => {
    const local = [it_('a', 'mine'), it_('b'), it_('c')];
    const foreign = [it_('a'), it_('b', 'theirs'), it_('c')];
    expect(mergeQueue(base, local, foreign).map((i) => i.title)).toEqual(['mine', 'theirs', 'c']);
  });

  it('this side wins an item both sides changed (its save lands last)', () => {
    expect(mergeQueue(base, [it_('a', 'mine'), it_('b'), it_('c')], [it_('a', 'theirs'), it_('b'), it_('c')])[0]!.title).toBe('mine');
  });

  it('keeps items added on either side, ours after theirs', () => {
    expect(ids(mergeQueue(base, [...base, it_('L')], [...base, it_('F')]))).toEqual(['a', 'b', 'c', 'F', 'L']);
  });

  it('an item removed on either side stays removed', () => {
    expect(ids(mergeQueue(base, [it_('a'), it_('c')], base))).toEqual(['a', 'c']);
    expect(ids(mergeQueue(base, base, [it_('b'), it_('c')]))).toEqual(['b', 'c']);
  });

  it("keeps this side's order when it moved items, the foreign order otherwise", () => {
    expect(ids(mergeQueue(base, [it_('c'), it_('a'), it_('b')], [...base, it_('F')]))).toEqual(['c', 'a', 'b', 'F']);
    expect(ids(mergeQueue(base, [it_('a', 'x'), it_('b'), it_('c')], [it_('b'), it_('a'), it_('c')]))).toEqual(['b', 'a', 'c']);
  });

  it('a title or number recomputed in memory is not an edit (after a preset or counter change)', () => {
    const mk = (id: string, extra: Partial<QueueItem> = {}): QueueItem => ({ ...it_(id, 'old ' + id), titleEdited: false, ...extra });
    const base = [mk('a'), mk('b')];
    const local = [mk('a', { title: 'new a', titleEdited: true }), mk('b', { title: 'new b', n: 7 })];
    const foreign = [mk('a', { title: 'new a' }), mk('b', { title: 'new b', publishAt: 123, publishEdited: true })];
    expect(mergeQueue(base, local, foreign)[1]!.publishAt).toBe(123);
    // An edited title is an edit.
    expect(mergeQueue(base, local, foreign)[0]!.titleEdited).toBe(true);
  });
});
