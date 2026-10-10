import type { ClaimsData } from '@/lib/panel/claims-data';

// showTracklistFix() (4980–5040) as a view: arrives with Task 8.
export function TracklistFix(_: { data: ClaimsData; videoId: string; onPick(videoId: string): void; onClose(): void }) {
  return null;
}
