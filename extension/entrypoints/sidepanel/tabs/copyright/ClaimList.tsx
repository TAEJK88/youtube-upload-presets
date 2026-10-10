import type { ClaimsState } from '@/lib/claims/types';
import type { ClaimsData } from '@/lib/panel/claims-data';

// showClaims() (4860–4936) as a view: arrives with Task 8.
export function ClaimList(_: { data: ClaimsData; state: ClaimsState; onClose(): void; onTracklist(videoId: string): void }) {
  return null;
}
