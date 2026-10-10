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
  // A hostile or broken file must not hold the panel, nor the background's one writer (T8 review I2).
  describe('importSongs stays linear in the size of the file', () => {
    const NOW = '2026-10-01T00:00:00Z';
    const timed = (csv: string, db: Songs = {}) => {
      const t = performance.now();
      const n = importSongs(db, csv, NOW);
      return { n, ms: performance.now() - t, db };
    };
    it('one song claimed in 20,000 videos', () => {
      const names = Array.from({ length: 20_000 }, (_, i) => 'v' + i);
      const r = timed('song,videos\nS,' + names.join('|') + '\n');
      expect(Object.keys(r.db['s|']!.videos)).toHaveLength(20_000);
      expect(r.ms).toBeLessThan(1000);
    });
    it('one song repeated on 20,000 rows, each adding a video, a claimant and a type', () => {
      const rows = Array.from({ length: 20_000 }, (_, i) => `S,c${i},t${i},v${i}`);
      const r = timed('song,claimants,claim_type,videos\n' + rows.join('\n') + '\n');
      expect(r.n).toBe(20_000);
      const e = r.db['s|']!;
      expect([Object.keys(e.videos).length, e.claimants.length, e.types.length]).toEqual([20_000, 20_000, 20_000]);
      expect(r.ms).toBeLessThan(1000);
    });
    it('20,000 claimants and types in one row, a long channel list, a header of 20,000 columns', () => {
      const many = (p: string) => Array.from({ length: 20_000 }, (_, i) => p + i).join(';');
      const head = Array.from({ length: 20_000 }, (_, i) => 'x' + i).join(',') + ',song,claimants,claim_type,channels,videos';
      const cells = ','.repeat(20_000);
      const rows = Array.from({ length: 200 }, (_, i) => `${cells}S${i},,,${many('ch')},${Array.from({ length: 100 }, (_, j) => 'v' + j).join('|')}`);
      const r = timed(`${head}\n${cells}S,${many('c')},${many('t')},,\n${rows.join('\n')}\n`);
      expect(r.db['s|']!.claimants).toHaveLength(20_000);
      expect(r.db['s|']!.types).toHaveLength(20_000);
      expect(r.db['s0|']!.videos['import:v0:0']!.channel).toBe('ch0');
      expect(r.ms).toBeLessThan(1500);
    });
    it('a header of 200,000 columns, most of the columns it looks for missing', () => {
      const head = 'song,' + Array.from({ length: 200_000 }, (_, i) => 'x' + i).join(',');
      const r = timed(head + '\n' + Array.from({ length: 5000 }, (_, i) => 'S' + i).join('\n') + '\n');
      expect(r.n).toBe(5000);
      expect(r.ms).toBeLessThan(1000);
    });
    it('a column named twice is read from its first place, as before', () => {
      const db: Songs = {};
      importSongs(db, 'song,artists,song\nFirst,A,Second\n', NOW);
      expect(Object.keys(db)).toEqual(['first|a']);
    });
    it('a video replaced under its key is no longer counted as there (T8 re-review R1)', () => {
      const db: Songs = {};
      // "mix a" takes the key of "Mix A" (same place, same name but for case); "Mix A" is then new again
      importSongs(db, 'song,videos\nS,Mix A\nS,mix a\nS,x | Mix A\n', NOW);
      expect(Object.entries(db['s|']!.videos).map(([k, v]) => [k, v.video])).toEqual([['import:mix a:0', 'mix a'], ['import:x:0', 'x'], ['import:mix a:1', 'Mix A']]);
    });
    it('two stored videos of one name: replacing one leaves the name there (T8 re-review R1)', () => {
      const db: Songs = {};
      importSongs(db, 'song,videos\nS,Same\n', NOW);
      recordSongs(db, [row('S', 'v1', { video: 'Same', artists: '' })], 'Chan', NOW);
      importSongs(db, 'song,videos\nS,same\nS,x | Same\n', NOW);
      expect(Object.entries(db['s|']!.videos).map(([k, v]) => [k, v.video])).toEqual([['import:same:0', 'same'], ['v1', 'Same'], ['import:x:0', 'x']]);
    });
    it('a stored song with no videos object fails only a row that names videos, as before (T8 re-review R4)', () => {
      const broken = () => ({ 's|': { title: 'S', artists: '', label: '', claimants: [], types: [], firstSeen: NOW, lastSeen: NOW, trimmed: 0 } }) as unknown as Songs;
      const db = broken();
      expect(importSongs(db, 'song,claimants\nS,Co\nT,\n', NOW)).toBe(2);
      expect(db['s|']!.claimants).toEqual(['Co']);
      expect(() => importSongs(broken(), 'song,videos\nS,Mix 1\n', NOW)).toThrow(TypeError);
    });
    it('still adds each video, claimant and type once: within a row, across rows, and against what is stored', () => {
      const db: Songs = {};
      recordSongs(db, [row('S', 'v1', { video: 'Mix 1', artists: '' })], 'Chan', NOW);
      const csv = 'song,claimants,claim_type,channels,videos\nS,Co; New; New,audio; video; video,Other; Third,Mix 1 | Mix 2 | Mix 2\nS,New,video,Other,Mix 2 | Mix 3\n';
      expect(importSongs(db, csv, NOW)).toBe(2);
      const e = db['s|']!;
      expect(e.claimants).toEqual(['Co', 'New']);
      expect(e.types).toEqual(['audio', 'video']);
      expect(e.videos).toEqual({
        v1: { video: 'Mix 1', channel: 'Chan', status: 'claimed', impact: '' },
        'import:mix 2:1': { video: 'Mix 2', channel: 'Other', status: 'claimed' },
        'import:mix 3:1': { video: 'Mix 3', channel: 'Other', status: 'claimed' },
      });
      // a second import of the same file changes nothing
      const before = JSON.stringify(db);
      importSongs(db, csv, NOW);
      expect(JSON.stringify(db)).toBe(before);
    });
  });
});
