import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DEFAULTS } from '@/lib/claims/core';
import type { ClaimsCfg } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { settingsSections } from '@/lib/panel/claims-settings';
import { TextField } from '../../fields';
import { useClaims } from '../../panel';
import { saveFailed } from '../../save-failed';
import { SubView } from './SubView';

// openSettings() (6275–6307): checkboxes for the on/off settings, text for the rest (as the
// userscript, numbers stay strings); Save writes them in one merge, Reset asks twice. A write
// that fails leaves the view open with what was typed.
export function CopyrightSettings({ data, onClose }: { data: ClaimsData; onClose(): void }) {
  const { addLog } = useClaims();
  const [c, setC] = useState<ClaimsCfg>(data.cfg);
  const [armed, setArmed] = useState(false);
  const set = (k: keyof ClaimsCfg, v: string | boolean) => setC((x) => ({ ...x, [k]: v }));
  const save = async () => {
    await claimsWrite({ op: 'merge', key: 'cfg', entries: { ...c } });
    onClose();
    toast(L('บันทึกการตั้งค่าแล้ว', 'Settings saved'));
  };
  const reset = async () => {
    if (!armed) return setArmed(true);
    await claimsWrite({ op: 'set', key: 'cfg', value: {} });
    onClose();
    addLog(L('คืนค่าตั้งค่าลิขสิทธิ์แล้ว', 'Copyright settings reset'), 'ok');
  };
  return (
    <SubView title={L('ตั้งค่าลิขสิทธิ์', 'Copyright settings')} onClose={onClose}
      footer={<>
        <Button size="sm" variant="danger" onClick={() => void reset().catch(saveFailed)}>{armed ? L('กดอีกครั้งเพื่อคืนค่า', 'Click again to reset') : L('คืนค่าเริ่มต้น', 'Reset to defaults')}</Button>
        <span className="flex-1" />
        <Button size="sm" onClick={onClose}>{L('ยกเลิก', 'Cancel')}</Button>
        <Button size="sm" variant="go" onClick={() => void save().catch(saveFailed)}>{L('บันทึก', 'Save')}</Button>
      </>}
    >
      {settingsSections().map((sc) => (
        <div key={sc.title} className="flex flex-col gap-3">
          <h4 className="mt-2 text-xs font-semibold tracking-[.03em] text-fg3">{sc.title}</h4>
          {sc.items.map(([k, label, hint]) => typeof DEFAULTS[k] === 'boolean' ? (
            <label key={k} className="flex gap-2.5 text-[13px]">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-fg" checked={c[k] as boolean} onChange={(e) => set(k, e.target.checked)} aria-label={label} />
              <span className="min-w-0 break-words">{label}{hint && <span className="mt-0.5 block text-xs text-fg3">{hint}</span>}</span>
            </label>
          ) : (
            // The modal put the help beside the label; a 320px panel has no room for that.
            <label key={k} className="flex flex-col gap-1 text-[13px]">
              <span className="break-words">{label}</span>
              <TextField value={String(c[k])} onValue={(v) => set(k, v)} aria-label={label} />
              {hint && <span className="text-xs break-words text-fg3">{hint}</span>}
            </label>
          ))}
        </div>
      ))}
    </SubView>
  );
}
