import { Switch } from '@/components/ui/switch';
import { chKey } from '@/lib/claims/keys';
import type { ClaimsState } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import { apRules } from '@/lib/panel/claims';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { useAsk } from '../../ask';
import { Icon } from '../../Icon';
import { useClaims } from '../../panel';
import { saveFailed } from '../../save-failed';

// The pane's Auto-pilot switch (UI.apTog 6197, UI.apSub 6253) and toggleAutopilot() (5875–5904).
// On/off is a write to autopilot:<channel>; the background's alarm and the tab's tick do the rest (D25).
// Off limits while the tab's channel is 'unknown': the background refuses that key (isClaimsOp).
export function AutopilotSwitch({ data, state }: { data: ClaimsData; state: ClaimsState }) {
  const ask = useAsk();
  const { addLog } = useClaims();
  const c = data.cfg;
  const on = !!data.autopilot.on;
  const key = chKey('autopilot', data.ch);
  const toggle = async () => {
    if (on) {
      await claimsWrite({ op: 'set', key, value: { on: false, next: 0 } });
      return addLog(L('🤖 ปิด Auto-pilot ของ ', '🤖 Auto-pilot turned off for ') + state.channelName, 'ok');
    }
    const go = await ask({
      title: L(`เปิด Auto-pilot ให้ช่อง ${state.channelName}?`, `Turn on Auto-pilot for channel ${state.channelName}?`),
      icon: 'robot',
      body: (
        <div className="leading-relaxed">
          <div>{L('สคริปต์จะสแกนและ ', 'The script will scan and ')}<b>{L('บันทึกการตัดโดยไม่ถาม', 'save trims without asking')}</b>{L(' — การตัดย้อนกลับไม่ได้', ' — trims cannot be undone')}</div>
          <ul className="my-2.5 list-disc pl-5">{apRules(c).map((r) => <li key={r}>{r}</li>)}</ul>
          <div className="text-xs text-fg3">{L('ต้องเปิดแท็บ YouTube Studio ของช่องนี้ค้างไว้ 1 แท็บ และเครื่องไม่หลับ ระหว่างที่คิวอัปโหลดยังทำงาน Auto-pilot จะรอ', 'Keep 1 YouTube Studio tab for this channel open and the computer awake. Auto-pilot waits while the upload queue is running')}</div>
        </div>
      ),
      ok: L('เปิด', 'Turn on'),
      cancel: L('ยกเลิก', 'Cancel'),
    });
    if (go !== true) return;
    await claimsWrite({ op: 'set', key, value: { on: true, next: 0 } });
    addLog(L('🤖 เปิด Auto-pilot ของ ', '🤖 Auto-pilot turned on for ') + state.channelName, 'ok');
  };
  return (
    <label className="flex items-center gap-3">
      <Switch checked={on} disabled={data.ch === 'unknown'} onCheckedChange={() => void toggle().catch(saveFailed)} aria-label="Auto-pilot" />
      <span>
        <b className="flex items-center gap-1.5 text-[13px]"><Icon name="robot" size={16} />Auto-pilot</b>
        <small className="block text-xs text-fg3">{on ? L(`เปิด · สแกน + ตัดทุก ${c.apEveryHours} ชม.`, `On · scan + trim every ${c.apEveryHours} h`) : L('ปิด · สแกนและตัดอัตโนมัติตามรอบเวลา', 'Off · scan and trim automatically on a schedule')}</small>
      </span>
    </label>
  );
}
