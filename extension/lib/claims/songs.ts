import { parseCSV, songNorm } from './core';
import type { ClaimRow, SongEntry, Songs } from './types';

export type SongRow = Pick<ClaimRow, 'song' | 'artists' | 'label' | 'claimant' | 'type' | 'videoId' | 'video' | 'impact'>;

// @port-begin
  function recordSongs(db: Songs, rows: SongRow[], chName: string, now: string): number {
    let added = 0;
    for (const r of rows) {
      if (!r.song || r.song === '(ไม่ทราบชื่อ)') continue;
      const key = songNorm(r.song) + '|' + songNorm(r.artists);
      let e = db[key];
      if (!e) {
        e = db[key] = { title: r.song, artists: r.artists || '', label: r.label || '', claimants: [], types: [], firstSeen: now, lastSeen: now, videos: {}, trimmed: 0 };
        added++;
      }
      e.lastSeen = now;
      if (r.claimant && !e.claimants.includes(r.claimant)) e.claimants.push(r.claimant);
      if (r.type && !e.types.includes(r.type)) e.types.push(r.type);
      if (r.label && !e.label) e.label = r.label;
      const v = e.videos[r.videoId] || (e.videos[r.videoId] = { video: r.video, channel: chName, status: 'claimed' });
      v.video = r.video;
      v.impact = r.impact || '';
    }
    return added;
  }
  function markSongTrimmed(db: Songs, item: { song: string; videoId: string }): void {
    const t = songNorm(item.song);
    for (const e of Object.values(db)) {
      if (songNorm(e.title) === t && e.videos[item.videoId] && e.videos[item.videoId]!.status !== 'trimmed') {
        e.videos[item.videoId]!.status = 'trimmed';
        e.trimmed = (e.trimmed || 0) + 1;
      }
    }
  }
  function importSongs(db: Songs, text: string, now: string): number {
    const rows = parseCSV(text);
    const head = (rows.shift() || []).map((x) => x.trim());
    const cols = new Map(head.map((h, i): [string, number] => [h, i]).reverse());
    const col = (n: string) => cols.get(n) ?? -1;
    if (col('song') < 0) return -1;
    let n = 0;
    const seen = new Map<SongEntry, { claimants: Set<string>; types: Set<string>; videos: Map<string, number> }>();
    const hadOf = (e: SongEntry) => {
      let h = seen.get(e);
      if (!h) {
        h = { claimants: new Set(e.claimants), types: new Set(e.types), videos: new Map() };
        for (const x of Object.values(e.videos || {})) h.videos.set(x.video, (h.videos.get(x.video) || 0) + 1);
        seen.set(e, h);
      }
      return h;
    };
    for (const r of rows) {
      const g = (name: string) => (col(name) >= 0 ? r[col(name)] || '' : '');
      const title = g('song').trim();
      if (!title) continue;
      const key = songNorm(title) + '|' + songNorm(g('artists'));
      const e = db[key] || (db[key] = { title, artists: g('artists'), label: g('label'), claimants: [], types: [],
        firstSeen: (g('first_seen') || now.slice(0, 10)) + 'T00:00:00Z',
        lastSeen: (g('last_seen') || now.slice(0, 10)) + 'T00:00:00Z', videos: {}, trimmed: +g('videos_trimmed') || 0 });
      const had = hadOf(e);
      const channel = g('channels').split(';')[0] || '';
      g('claimants').split(';').map((x) => x.trim()).filter(Boolean).forEach((c) => { if (!had.claimants.has(c)) { had.claimants.add(c); e.claimants.push(c); } });
      g('claim_type').split(';').map((x) => x.trim()).filter(Boolean).forEach((c) => { if (!had.types.has(c)) { had.types.add(c); e.types.push(c); } });
      g('videos').split('|').map((x) => x.trim()).filter(Boolean).forEach((v, i) => {
        const k = 'import:' + songNorm(v) + ':' + i;
        if (!had.videos.get(v)) {
          const old = e.videos[k];
          if (old) had.videos.set(old.video, had.videos.get(old.video)! - 1);
          e.videos[k] = { video: v, channel, status: 'claimed' };
          had.videos.set(v, 1);
        }
      });
      n++;
    }
    return n;
  }
// @port-end

export { recordSongs, markSongTrimmed, importSongs };
