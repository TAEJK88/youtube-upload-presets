import { L } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { SubView } from './SubView';

// openSettings() (6275–6307). The title and Close only: the fields come with 4b unit J.
export function CopyrightSettings({ onClose }: { data: ClaimsData; onClose(): void }) {
  return (
    <SubView title={L('ตั้งค่าลิขสิทธิ์', 'Copyright settings')} onClose={onClose}>
      {null}
    </SubView>
  );
}
