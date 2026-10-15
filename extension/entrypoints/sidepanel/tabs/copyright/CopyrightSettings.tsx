import { useId, useRef, useState } from 'react';
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
// that fails leaves the view open with what was typed; a click while one is on its way is ignored.
// The form stays mounted (a Tools sub-tab): it follows the stored cfg (another panel window, a
// Reset) and keeps only what was edited here on top; Save writes those edits alone, so it never
// puts back a value changed elsewhere. Cancel drops the edits in place (focus stays on it).
export function CopyrightSettings({ data }: { data: ClaimsData }) {
  const { addLog } = useClaims();
  const [c, setC] = useState<ClaimsCfg>(data.cfg);
  const [base, setBase] = useState<ClaimsCfg>(data.cfg); // what the form's values are edits against
  const edits = (): Partial<ClaimsCfg> => Object.fromEntries(Object.entries(c).filter(([k, v]) => v !== base[k as keyof ClaimsCfg]));
  // A change of the stored cfg (watchClaims keeps the object while the cfg key is untouched): the
  // form takes it, with its edits on top.
  const [seen, setSeen] = useState(data.cfg);
  if (data.cfg !== seen) {
    setSeen(data.cfg);
    setC({ ...data.cfg, ...edits() });
    setBase(data.cfg);
  }
  const [armed, setArmed] = useState(false);
  const id = useId(); // each help text's id, for its input's aria-describedby
  const busy = useRef(false);
  const once = (job: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    void job().catch(saveFailed).finally(() => { busy.current = false; });
  };
  const set = (k: keyof ClaimsCfg, v: string | boolean) => setC((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const saved = edits();
    await claimsWrite({ op: 'merge', key: 'cfg', entries: saved });
    // Only what was written stops being an edit: a change from elsewhere during the write stays the base.
    setBase((b) => ({ ...b, ...saved }));
    toast(L('บันทึกการตั้งค่าแล้ว', 'Settings saved'));
  };
  const reset = async () => {
    await claimsWrite({ op: 'set', key: 'cfg', value: {} });
    setC({ ...DEFAULTS });
    setBase({ ...DEFAULTS });
    setArmed(false);
    addLog(L('คืนค่าตั้งค่าลิขสิทธิ์แล้ว', 'Copyright settings reset'), 'ok');
  };
  return (
    <SubView title={L('ตั้งค่าลิขสิทธิ์', 'Copyright settings')}
      footer={<>
        <Button size="sm" variant="danger" onClick={() => (armed ? once(reset) : busy.current || setArmed(true))}>{armed ? L('กดอีกครั้งเพื่อคืนค่า', 'Click again to reset') : L('คืนค่าเริ่มต้น', 'Reset to defaults')}</Button>
        <span className="flex-1" />
        <Button size="sm" onClick={() => { setC(data.cfg); setBase(data.cfg); setArmed(false); }}>{L('ยกเลิก', 'Cancel')}</Button>
        <Button size="sm" variant="go" onClick={() => once(save)}>{L('บันทึก', 'Save')}</Button>
      </>}
    >
      {settingsSections().map((sc) => (
        <div key={sc.title} className="flex flex-col gap-3">
          <h4 className="mt-2 text-xs font-semibold tracking-[.03em] text-fg3">{sc.title}</h4>
          {sc.items.map(([k, label, hint]) => typeof DEFAULTS[k] === 'boolean' ? (
            <label key={k} className="flex gap-2.5 text-[13px]">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-fg" checked={c[k] as boolean} onChange={(e) => set(k, e.target.checked)} aria-label={label} aria-describedby={hint && id + k} />
              <span className="min-w-0 break-words">{label}{hint && <span id={id + k} className="mt-0.5 block text-xs text-fg3">{hint}</span>}</span>
            </label>
          ) : (
            // The modal put the help beside the label; a 320px panel has no room for that.
            <label key={k} className="flex flex-col gap-1 text-[13px]">
              <span className="break-words">{label}</span>
              <TextField value={String(c[k])} onValue={(v) => set(k, v)} aria-label={label} aria-describedby={hint && id + k} />
              {hint && <span id={id + k} className="text-xs break-words text-fg3">{hint}</span>}
            </label>
          ))}
        </div>
      ))}
    </SubView>
  );
}
