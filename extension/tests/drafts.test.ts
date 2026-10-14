import { describe, expect, it } from 'vitest';
import { failedByDraft } from '../lib/drafts';

const card = (id: string, status: string, draftId?: string) => ({ id, status, draftId });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('the failed videos, by what "Resume drafts" can do with them', () => {
  it('resumable: failed with a draft id no other card names; in queue order', () => {
    const r = failedByDraft([card('a', 'error', 'aaaaaaaaaaa'), card('b', 'pending'), card('c', 'error', 'ccccccccccc'), card('d', 'error')]);
    expect(ids(r.resumable)).toEqual(['a', 'c']);
    expect(ids(r.plain)).toEqual(['d']);
    expect(ids(r.shared)).toEqual([]);
  });

  it('a draft id on another card, whatever that card\'s status, is shared and not resumable', () => {
    const r = failedByDraft([card('a', 'error', 'xxxxxxxxxxx'), card('b', 'error', 'xxxxxxxxxxx'), card('c', 'error', 'yyyyyyyyyyy'), card('d', 'done', 'yyyyyyyyyyy')]);
    expect(ids(r.resumable)).toEqual([]);
    expect(ids(r.shared)).toEqual(['a', 'b', 'c']);
  });

  it('only failed videos: one waiting, uploading or done with a draft id is none of the three', () => {
    const r = failedByDraft([card('a', 'pending', 'aaaaaaaaaaa'), card('b', 'uploading', 'bbbbbbbbbbb'), card('c', 'done', 'ccccccccccc')]);
    expect([r.resumable, r.shared, r.plain].flat()).toEqual([]);
  });

  it('two failed videos without a draft id do not "share" one', () => {
    const r = failedByDraft([card('a', 'error'), card('b', 'error', '')]);
    expect(ids(r.plain)).toEqual(['a', 'b']);
    expect(ids(r.shared)).toEqual([]);
  });
});
