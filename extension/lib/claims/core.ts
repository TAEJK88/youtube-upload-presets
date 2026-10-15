import type { ClaimScan, ClaimsCfg, Songs } from './types';

// The userscript's copyright module (user.js 4592–6357), its pure parts: the side panel and
// the Studio tab both use them.

  const DEFAULTS: ClaimsCfg = {
    autoSaveTrim: true, // ตอนสคริปต์ตัดเอง: กด Save → ติ๊ก "I acknowledge" → Confirm changes
    autoSaveManualTrim: false, // ตอนเปิดหน้าตัดเองด้วยมือ: ให้สคริปต์กด Save ให้ (ปิดไว้ จะได้ปรับเวลาก่อนได้)
    followUpMinutes: '10',
    ownNames: '',
    apEveryHours: '6',
    apSkipOwn: true,
    apOnlyImpact: true,
    apMaxPct: '25',
    apMaxPerCycle: '10',
    apAdsOn: false,
  };
  const fmt = (sec: number) => {
    sec = Math.round(sec);
    const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
    return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0');
  };
  const short = (e: unknown) => String(e || '').replace(/^.*?(IMPACT|STATUS|OPTION)_/, '').replace(/_/g, ' ').toLowerCase();
  const privacyOf = (p: unknown) => String(p || '').replace(/^VIDEO_PRIVACY_/, '').replace(/_/g, ' ').toLowerCase(); // VIDEO_PRIVACY_PUBLIC → public
  function claimInfo(c: any) {
    const md = (c && c.asset && c.asset.metadata) || {};
    const found: { title: string; artists: string[]; label: string } = { title: '', artists: [], label: '' };
    (function walk(o: any, d: number): void {
      if (!o || typeof o !== 'object' || d > 5) return;
      for (const [k, v] of Object.entries(o)) {
        if (!found.title && /^(title|assetTitle)$/.test(k) && typeof v === 'string' && v.trim()) found.title = v.trim();
        else if (/^(artists|writers|performers)$/.test(k) && Array.isArray(v) && !found.artists.length) found.artists = v.map((x) => (typeof x === 'string' ? x : (x && (x.name || x.displayName)) || '')).filter(Boolean);
        else if (!found.label && /^(recordLabel|label|publisher)$/.test(k) && typeof v === 'string') found.label = v;
        else if (v && typeof v === 'object') walk(v, d + 1);
      }
    })(md, 0);
    return found;
  }
  const songNorm = (t: unknown) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  const titleKey = (t: unknown) => songNorm(String(t).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\b(ft|feat)\.?\b.*$/i, '')).replace(/[^\p{L}\p{N}]+/gu, '');
  function claimedSongsIn(txt: string, songs: Songs) {
    if (!txt) return [];
    const db = Object.values(songs);
    if (!db.length) return [];
    const idx = db.map((e) => ({ e, k: titleKey(e.title), arts: e.artists.split(',').map((a) => songNorm(a)).filter((a) => a.length > 1) }))
      .filter((x) => x.k.length >= 3);
    const hits: { line: string; song: string; artists: string; times: number }[] = [];
    for (const line of String(txt).split(/\r?\n/)) {
      const t = line.replace(/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*[-–|]?\s*/, '').replace(/^\d{1,3}\.\s*/, '').trim();
      if (!t) continue;
      const parts = t.split(/\s[-–]\s/);
      const song = parts.length > 1 ? parts.slice(1).join(' - ') : t;
      const k = titleKey(song);
      const low = songNorm(t);
      const hit = idx.find((x) => (x.k === k || (k.length >= 6 && x.k.length >= 6 && (k.includes(x.k) || x.k.includes(k)))) &&
        (!x.arts.length || x.arts.some((a) => low.includes(a))));
      if (hit) hits.push({ line: t, song: hit.e.title, artists: hit.e.artists, times: Object.keys(hit.e.videos).length });
    }
    return hits;
  }

// downloadCSV()'s text (user.js 2084–2085): a BOM, every cell quoted.
export const csvText = (rows: unknown[][]): string =>
  '﻿' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');

// claimsCSV() (4842–4846).
export function claimsCsvRows(scan: ClaimScan): unknown[][] {
  const head = ['video', 'video_url', 'privacy', 'video_length', 'song', 'artists', 'label', 'claimant', 'own_music',
    'type', 'status', 'impact', 'claimed_segments', 'claimed_total', 'can_trim', 'options', 'claim_id'];
  const lines = scan.rows.map((r) => [r.video, `https://studio.youtube.com/video/${r.videoId}/claims`, r.privacy, fmt(r.length),
    r.song, r.artists, r.label, r.claimant, r.own ? 'yes' : 'no', r.type, r.status, r.impact,
    r.segments.map((sg) => fmt(sg[0]) + '-' + fmt(sg[1])).join(' ; '), fmt(r.claimedSec), r.canTrim ? 'yes' : 'no', r.options, r.claimId]);
  return [head, ...lines];
}

// songsCSV() (5106–5112).
export function songsCsvRows(songs: Songs): unknown[][] {
  const head = ['song', 'artists', 'label', 'claimants', 'claim_type', 'videos_claimed', 'videos_trimmed', 'channels', 'first_seen', 'last_seen', 'videos'];
  const lines = Object.values(songs).map((e) => {
    const vids = Object.values(e.videos);
    return [e.title, e.artists, e.label, e.claimants.join('; '), e.types.join('; '), vids.length, e.trimmed || 0,
      [...new Set(vids.map((v) => v.channel))].join('; '), e.firstSeen.slice(0, 10), e.lastSeen.slice(0, 10), vids.map((v) => v.video).join(' | ')];
  });
  return [head, ...lines];
}

// uploadsCSV() (2079–2081).
export interface UploadRecordLike { date: string; channel: string; channelName?: string; title: string; file: string; videoId: string; visibility: string; publishAt: number | null }
export function uploadsCsvRows(list: UploadRecordLike[]): unknown[][] {
  const head = ['date', 'channel', 'title', 'file', 'video_id', 'url', 'visibility', 'publish_at'];
  const rows = list.map((u) => [u.date, u.channelName || u.channel, u.title, u.file, u.videoId,
    u.videoId ? 'https://youtu.be/' + u.videoId : '', u.visibility, u.publishAt ? new Date(u.publishAt).toISOString() : '']);
  return [head, ...rows];
}

export { DEFAULTS, fmt, short, privacyOf, claimInfo, songNorm, parseCSV, titleKey, claimedSongsIn };
