import type { ClaimsState } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { SubView } from './SubView';

// showAds() (5289–5334). The title and Close only: the list and its buttons come with 4b unit H.
export function AdsView({ state, onClose }: { data: ClaimsData; state: ClaimsState; onClose(): void }) {
  return (
    <SubView title={L(`💰 คลิปที่ปิดโฆษณา — ${state.channelName}`, `💰 Videos with ads off — ${state.channelName}`)} onClose={onClose}>
      {null}
    </SubView>
  );
}
