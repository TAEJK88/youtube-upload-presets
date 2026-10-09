import { describe, expect, it } from 'vitest';
import { importSongs, markSongTrimmed, recordSongs } from '../lib/claims/songs';
import type { Songs } from '../lib/claims/types';

const row = (song: string, videoId: string, extra = {}) => ({ song, artists: 'A', label: '', claimant: 'Co', type: 'audio', videoId, video: 'Mix ' + videoId, impact: '', ...extra });

describe('song history reducers', () => {
  it('recordSongs adds new songs, counts them, and merges claimants and videos', () => {
    const db: Songs = {};
    expect(recordSongs(db, [row('S', 'v1'), row('S', 'v2', { claimant: 'Other' }), row('(ไม่ทราบชื่อ)', 'v3')], 'Chan', '2026-10-01T00:00:00Z')).toBe(1);
    const e = db['s|a']!;
    expect(e.claimants).toEqual(['Co', 'Other']);
    expect(Object.keys(e.videos)).toEqual(['v1', 'v2']);
    expect(e.videos.v1!.channel).toBe('Chan');
    expect(recordSongs(db, [row('S', 'v1')], 'Chan', '2026-10-02T00:00:00Z')).toBe(0);
    expect(db['s|a']!.lastSeen).toBe('2026-10-02T00:00:00Z');
  });

  it('markSongTrimmed counts a video once', () => {
    const db: Songs = {};
    recordSongs(db, [row('S', 'v1')], 'Chan', '2026-10-01T00:00:00Z');
    markSongTrimmed(db, { song: 'S', videoId: 'v1' });
    markSongTrimmed(db, { song: 'S', videoId: 'v1' });
    expect(db['s|a']!.trimmed).toBe(1);
    expect(db['s|a']!.videos.v1!.status).toBe('trimmed');
  });

  it('importSongs reads the old script CSV, and refuses a file without a song column', () => {
    const db: Songs = {};
    const csv = 'song,artists,claimants,claim_type,videos_trimmed,channels,first_seen,last_seen,videos\nS,A,Co; X,audio,2,Chan,2026-01-01,2026-02-01,Mix 1 | Mix 2\n';
    expect(importSongs(db, csv, '2026-10-01T00:00:00Z')).toBe(1);
    expect(db['s|a']).toMatchObject({ claimants: ['Co', 'X'], trimmed: 2, firstSeen: '2026-01-01T00:00:00Z' });
    expect(Object.values(db['s|a']!.videos).map((v) => v.video)).toEqual(['Mix 1', 'Mix 2']);
    expect(importSongs(db, 'title\nx', '2026-10-01T00:00:00Z')).toBe(-1);
  });
});
