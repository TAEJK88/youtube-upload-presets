import type { ClaimsState } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { SubView } from './SubView';

// showClaims() (4860–4936) as a view: its content arrives with Task 8.
export function ClaimList({ data, state, onClose }: { data: ClaimsData; state: ClaimsState; onClose(): void; onTracklist(videoId: string): void }) {
  const name = data.scan?.channelName || state.channelName;
  return <SubView title={L(`Claim ลิขสิทธิ์ — ${name}`, `Copyright claims — ${name}`)} onClose={onClose}>{null}</SubView>;
}
