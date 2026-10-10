import { describe, expect, it } from 'vitest';
import { claimedVideos, doneKeys, rowKey, selectWhere, songList } from '../lib/panel/claims';
import type { ClaimRow, Songs } from '../lib/claims/types';

const r = (id: string, extra: Partial<ClaimRow> = {}): ClaimRow => ({
  videoId: id, video: 'V' + id, privacy: 'public', length: 1000, claimId: 'c' + id, song: 'S', artists: '', label: '', claimant: '',
  type: '', status: '', impact: '', segments: [], claimedSec: 100, canTrim: true, options: '', own: false, hasImpact: false, publishAt: 0, ...extra,
});
const NOW = 1_000_000;

describe('claim list picks (showClaims chips 4921–4927)', () => {
  const rows = [r('1', { own: true }), r('2', { hasImpact: true, publishAt: NOW + 1 }), r('3', { claimedSec: 300 }), r('4', { canTrim: false }), r('5')];
  const results = { [rowKey(rows[4]!)]: { state: 'saved', msg: '', date: '' } };
  it('only rows that can be trimmed and are not done are touched', () => {
    expect(selectWhere('all', rows, results, NOW)).toEqual({ add: ['1:c1', '2:c2', '3:c3'], del: [] });
    expect(selectWhere('notOwn', rows, results, NOW)).toEqual({ add: ['2:c2', '3:c3'], del: ['1:c1'] });
    expect(selectWhere('impact', rows, results, NOW)).toEqual({ add: ['2:c2'], del: ['1:c1', '3:c3'] });
    expect(selectWhere('scheduledImpact', rows, results, NOW).add).toEqual(['2:c2']);
    expect(selectWhere('scheduledImpact', rows, results, NOW + 1).add).toEqual([]); // released by now
    expect(selectWhere('short', rows, results, NOW).add).toEqual(['1:c1', '2:c2']); // < 20%
    expect(selectWhere('none', rows, results, NOW)).toEqual({ add: [], del: ['1:c1', '2:c2', '3:c3'] });
  });
  it('a video of unknown length is not "short"', () => {
    expect(selectWhere('short', [r('1', { length: 0, claimedSec: 0 })], {}, NOW)).toEqual({ add: [], del: ['1:c1'] });
  });
  it('a claim gone by itself counts as done; a failed one does not', () => {
    const res = { '1:c1': { state: 'gone', msg: '', date: '' }, '2:c2': { state: 'failed', msg: '', date: '' } };
    expect(selectWhere('all', rows.slice(0, 2), res, NOW).add).toEqual(['2:c2']);
  });
  it('picked rows already trimmed or gone leave the list', () => {
    expect(doneKeys(rows, results, ['5:c5', '1:c1'])).toEqual(['5:c5']);
  });
  it('the tracklist picker lists each claimed video once', () => {
    expect(claimedVideos({ date: '', total: 0, channel: '', channelName: '', rows: [r('1'), r('1'), r('2')] }).map((x) => x.videoId)).toEqual(['1', '2']);
    expect(claimedVideos(null)).toEqual([]);
  });
});

describe('song list (showSongs draw() 5195–5204)', () => {
  const songs = {
    a: { title: 'Beta', artists: 'Zed', label: 'L1', claimants: ['Co'], types: [], firstSeen: '', lastSeen: '2026-01-02', videos: { v1: {}, v2: {} }, trimmed: 0 },
    b: { title: 'Alpha', artists: 'Ann', label: '', claimants: [], types: [], firstSeen: '', lastSeen: '2026-03-01', videos: { v1: {} }, trimmed: 0 },
  } as unknown as Songs;
  it('sorts and searches like the drawer', () => {
    expect(songList(songs, '', 'count').map((e) => e.title)).toEqual(['Beta', 'Alpha']);
    expect(songList(songs, '', 'recent').map((e) => e.title)).toEqual(['Alpha', 'Beta']);
    expect(songList(songs, '', 'title').map((e) => e.title)).toEqual(['Alpha', 'Beta']);
    expect(songList(songs, '', 'artist').map((e) => e.title)).toEqual(['Alpha', 'Beta']);
    expect(songList(songs, 'co', 'count').map((e) => e.key)).toEqual(['a']); // claimant matches
    expect(songList(songs, '  L1 ', 'count').map((e) => e.key)).toEqual(['a']); // label, any case, spaces
    expect(songList(songs, 'nothing', 'count')).toEqual([]);
    expect(songList(songs, '', 'count')[0]).toMatchObject({ key: 'a', n: 2 });
  });
});
