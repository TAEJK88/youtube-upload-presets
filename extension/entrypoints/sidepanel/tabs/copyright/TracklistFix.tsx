import { L } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { SubView } from './SubView';

// showTracklistFix() (4980–5040) as a view: its content arrives with Task 8.
export function TracklistFix({ onClose }: { data: ClaimsData; videoId: string; onPick(videoId: string): void; onClose(): void }) {
  return <SubView title={L('📝 เลือกคลิปที่จะแก้ tracklist', '📝 Choose a video to fix its tracklist')} onClose={onClose}>{null}</SubView>;
}
