import type { AdsRow, AdsScan, CollabRow, ResultEntry } from '../claims/types';

// The picks of the pane's ads and Collab lists, for the panel's views.
// showAds() starts with the eligible videos not turned on yet (5293).
export const adsInitial = (scan: AdsScan, results: Record<string, ResultEntry>) =>
  scan.rows.filter((r) => !r.ineligible && results[r.videoId]?.state !== 'on').map((r) => r.videoId);
// Its chips (5323–5326): the rows to tick, every other one unticked.
export type AdsPick = 'settings' | 'public' | 'all' | 'none';
export const adsWhere = (kind: AdsPick, rows: AdsRow[]) => rows.filter((r) =>
  kind === 'settings' ? !r.ineligible : kind === 'public' ? !r.ineligible && /public$/.test(r.privacy) : kind === 'all').map((r) => r.videoId);

// showCollab()'s search (5521) and chips (5534–5538): a chip ticks or unticks the rows the search shows.
export const collabShown = (rows: CollabRow[], q: string) => rows.filter((r) => !q.trim() || r.video.toLowerCase().includes(q.trim().toLowerCase()));
export type CollabPick = 'shown' | 'public' | 'never' | 'failed' | 'none';
export function collabWhere(kind: CollabPick, rows: CollabRow[], results: Record<string, ResultEntry>, q: string) {
  const shown = collabShown(rows, q);
  const yes = (r: CollabRow) => kind === 'shown' ? true : kind === 'public' ? /public$/.test(r.privacy)
    : kind === 'never' ? !results[r.videoId] : kind === 'failed' ? results[r.videoId]?.state === 'failed' : false;
  return { add: shown.filter(yes).map((r) => r.videoId), del: shown.filter((r) => !yes(r)).map((r) => r.videoId) };
}
