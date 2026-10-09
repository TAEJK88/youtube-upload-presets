import { L } from '@/lib/i18n';
import { Icon } from '../Icon';

// The copyright scanner / trimmer / autopilot arrive in Phase 4.
export function CopyrightTab() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-fg3">
      <Icon name="shield" size={24} />
      <span>{L('การสแกนและตัดส่วนที่ติดลิขสิทธิ์จะมาในเวอร์ชันถัดไปของส่วนขยาย', 'Copyright scan and trim arrive in a later version of the extension')}</span>
    </div>
  );
}
