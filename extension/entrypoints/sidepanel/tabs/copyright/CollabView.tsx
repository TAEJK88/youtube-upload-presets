import type { ClaimsState } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { SubView } from './SubView';

// showCollab() (5486–5546). The title and Close only: the list and its buttons come with 4b unit H.
export function CollabView({ state, onClose }: { data: ClaimsData; state: ClaimsState; onClose(): void }) {
  return (
    <SubView title={L(`🤝 Collab — ${state.channelName}`, `🤝 Collab — ${state.channelName}`)} onClose={onClose}>
      {null}
    </SubView>
  );
}
