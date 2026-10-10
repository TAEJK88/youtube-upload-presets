import { L } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { SubView } from './SubView';

// showSongs() (5190–5251) as a view: its content arrives with Task 8.
export function Songs({ onClose }: { data: ClaimsData; onClose(): void }) {
  return <SubView title={L('🎵 เพลงที่เคยโดน claim', '🎵 Previously claimed songs')} onClose={onClose}>{null}</SubView>;
}
