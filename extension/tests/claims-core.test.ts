import { describe, expect, it } from 'vitest';
import { claimInfo, claimedSongsIn, claimsCsvRows, csvText, DEFAULTS, fmt, parseCSV, privacyOf, short, songsCsvRows } from '../lib/claims/core';
import type { ClaimScan, Songs } from '../lib/claims/types';

describe('copyright helpers', () => {
  it('formats like the userscript', () => {
    expect(fmt(65)).toBe('1:05');
    expect(fmt(3725)).toBe('1:02:05');
    expect(short('VIDEO_RESTRICTION_IMPACT_MONETIZATION_DISABLED')).toBe('monetization disabled');
    expect(privacyOf('VIDEO_PRIVACY_PUBLIC')).toBe('public');
    expect(DEFAULTS.apEveryHours).toBe('6');
  });

  it('claimInfo walks nested metadata for title, artists and label', () => {
    expect(claimInfo({ asset: { metadata: { soundRecording: { title: ' Song ', artists: [{ name: 'A' }, 'B'], recordLabel: 'L' } } } }))
      .toEqual({ title: 'Song', artists: ['A', 'B'], label: 'L' });
    expect(claimInfo(null)).toEqual({ title: '', artists: [], label: '' });
  });

  it('parseCSV reads quotes, escaped quotes, CRLF and a BOM', () => {
    expect(parseCSV('﻿song,artists\r\n"A, B","x ""y"""\n\n')).toEqual([['song', 'artists'], ['A, B', 'x "y"']]);
  });

  it('claimedSongsIn finds tracklist lines whose song was claimed before', () => {
    const songs = { 'k': { title: 'Midnight Rain', artists: 'Lena', videos: { v1: {}, v2: {} } } } as unknown as Songs;
    expect(claimedSongsIn('00:00 Lena - Midnight Rain (Remix)\n03:00 Other - Thing', songs))
      .toEqual([{ line: 'Lena - Midnight Rain (Remix)', song: 'Midnight Rain', artists: 'Lena', times: 2 }]);
    expect(claimedSongsIn('', songs)).toEqual([]);
  });

  it('CSV text quotes every cell and starts with a BOM', () => {
    expect(csvText([['a', 'b "c"'], [1, null]])).toBe('﻿"a","b ""c"""\n"1",""');
  });

  it('CSV text defuses third-party cells a spreadsheet would run as a formula', () => {
    expect(csvText([['=HYPERLINK("x")', '+1', '-a', '@b', '\tc', '\rd']])).toBe('﻿"\'=HYPERLINK(""x"")","\'+1","\'-a","\'@b","\'\tc","\'\rd"');
    expect(csvText([['Song = Title', 12, 'a-b']])).toBe('﻿"Song = Title","12","a-b"');
  });

  it('the claims and songs CSVs keep the userscript columns', () => {
    const scan = { date: '2026-10-01T00:00:00Z', total: 1, channel: 'UC1', channelName: 'C', rows: [{
      videoId: 'v1', video: 'Mix', privacy: 'public', length: 600, claimId: 'c1', song: 'S', artists: 'A', label: 'L', claimant: 'Co',
      type: 'audio', status: 'active', impact: 'blocked', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: 'trim', own: false,
      hasImpact: true, publishAt: 0 }] } as ClaimScan;
    expect(claimsCsvRows(scan)[1]).toEqual(['Mix', 'https://studio.youtube.com/video/v1/claims', 'public', '10:00', 'S', 'A', 'L', 'Co', 'no',
      'audio', 'active', 'blocked', '1:00-1:30', '0:30', 'yes', 'trim', 'c1', '']);
    expect(claimsCsvRows(scan)[0]!.at(-1)).toBe('tracklist_song');
    expect(claimsCsvRows({ ...scan, rows: [{ ...scan.rows[0]!, tracklist: '00:50 Kellys Brown - I Know It All' }] })[1]!.at(-1)).toBe('00:50 Kellys Brown - I Know It All');
    expect(songsCsvRows({})[0]![0]).toBe('song');
  });
});
