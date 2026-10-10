import { songNorm } from '../claims/core';
import type { ClaimRow, ClaimScan, ClaimsCfg, ResultEntry, SongEntry, Songs } from '../claims/types';
import { L } from '../i18n';

// The logic of the pane's claim list and song list, for the panel's views.
export const rowKey = (r: { videoId: string; claimId: string }) => r.videoId + ':' + r.claimId;
export const isDone = (res?: ResultEntry) => !!res && (res.state === 'saved' || res.state === 'gone');

// The chips (4922–4927): which trimmable, not-done rows to tick and which to untick.
export type Pick = 'all' | 'notOwn' | 'impact' | 'scheduledImpact' | 'short' | 'none';
const PICK: Record<Pick, (r: ClaimRow, now: number) => boolean> = {
  all: () => true,
  notOwn: (r) => !r.own,
  impact: (r) => r.hasImpact,
  scheduledImpact: (r, now) => r.hasImpact && r.publishAt > now,
  short: (r) => !!r.length && r.claimedSec / r.length < 0.2,
  none: () => false,
};
export function selectWhere(kind: Pick, rows: ClaimRow[], results: Record<string, ResultEntry>, now = Date.now()) {
  const add: string[] = [];
  const del: string[] = [];
  for (const r of rows) {
    if (!r.canTrim || isDone(results[rowKey(r)])) continue; // disabled checkboxes (4888)
    (PICK[kind](r, now) ? add : del).push(rowKey(r));
  }
  return { add, del };
}
// showClaims() drops picks that are done already (4886, 4911).
export const doneKeys = (rows: ClaimRow[], results: Record<string, ResultEntry>, picked: string[]) =>
  rows.map(rowKey).filter((k) => picked.includes(k) && isDone(results[k]));

// openTrimConfirm()'s numbers (5677–5679).
export const trimSummary = (rows: ClaimRow[]) => ({
  claims: rows.length,
  videos: new Set(rows.map((r) => r.videoId)).size,
  own: rows.filter((r) => r.own).length,
  total: rows.reduce((a, r) => a + r.claimedSec, 0),
});

// toggleAutopilot()'s rules (5884–5890).
export const apRules = (c: ClaimsCfg): string[] => [
  L(`ทุก ${c.apEveryHours} ชั่วโมง: สแกนช่องนี้ใหม่`, `Every ${c.apEveryHours} hours: rescan this channel`),
  c.apOnlyImpact ? L('เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)', 'Only claims that affect the video (no revenue / restricted / blocked)') : L('ทุก claim ที่ตัดได้', 'Every trimmable claim'),
  c.apSkipOwn ? L(`ไม่ตัดเพลงของตัวเอง (${c.ownNames})`, `Don't trim your own music (${c.ownNames})`) : L('รวมเพลงของตัวเองด้วย', 'Include your own music too'),
  L(`ข้าม claim ที่ยาวเกิน ${c.apMaxPct}% ของคลิป`, `Skip claims longer than ${c.apMaxPct}% of the video`),
  L(`สูงสุด ${c.apMaxPerCycle} claim ต่อรอบ · คลิปที่ตั้งเวลาปล่อยไว้จะถูกตัดก่อน`, `Up to ${c.apMaxPerCycle} claims per cycle · scheduled videos are trimmed first`),
];

// The tracklist picker (4984): each claimed video once.
export const claimedVideos = (scan: ClaimScan | null): ClaimRow[] => [...new Map((scan?.rows ?? []).map((r) => [r.videoId, r])).values()];

export type SongSort = 'count' | 'recent' | 'title' | 'artist';
export function songList(songs: Songs, q: string, sortBy: SongSort): (SongEntry & { key: string; n: number })[] {
  let list = Object.entries(songs).map(([key, e]) => Object.assign({ key, n: Object.keys(e.videos).length }, e));
  if (q) list = list.filter((e) => songNorm(e.title + ' ' + e.artists + ' ' + e.label + ' ' + e.claimants.join(' ')).includes(songNorm(q)));
  return list.sort((a, b) => sortBy === 'count' ? b.n - a.n || a.title.localeCompare(b.title)
    : sortBy === 'recent' ? b.lastSeen.localeCompare(a.lastSeen)
    : sortBy === 'artist' ? a.artists.localeCompare(b.artists) || a.title.localeCompare(b.title)
    : a.title.localeCompare(b.title));
}
