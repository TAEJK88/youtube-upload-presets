import { Progress } from '@/components/ui/progress';
import { emojiIconName } from '@/lib/activity';
import type { ClaimsStatus } from '@/lib/claims/types';
import { cn } from '@/lib/utils';
import { Icon } from '../../Icon';

// renderStatus()'s card (6235–6243): title with its icon, the detail, a progress bar (no
// number: indeterminate), and the steps of a run with the current one marked. The kind colours
// the card's edge and its icon (.tbx-card.busy … and its .sti, 2822–2823, 3069–3070).
// Not a live region: during a scan the detail changes about every 0.8 s.
const TONE: Record<string, string> = { busy: 'border-info/35', wait: 'border-warn/35', err: 'border-err/35', ok: 'border-ok/35', idle: '' };
const ICON_TONE: Record<string, string> = { busy: 'text-info', wait: 'text-warn', err: 'text-err', ok: 'text-ok' };
export function StatusCard({ s }: { s: ClaimsStatus }) {
  const ic = emojiIconName(s.icon);
  const idx = s.stepIdx ?? -1;
  return (
    <div className={cn('rounded-[14px] border border-tint/10 bg-tint/5 px-3 py-2.5', TONE[s.kind])}>
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className={cn('grid w-5 shrink-0 place-items-center', ICON_TONE[s.kind] ?? 'text-fg2')}>{ic ? <Icon name={ic} size={17} /> : s.icon}</span>
        <span className="min-w-0 flex-1 break-words">{s.title}</span>
      </div>
      {s.detail && <div className="mt-1 text-xs break-words whitespace-pre-line text-fg2">{s.detail}</div>}
      {s.progress !== undefined && <Progress value={s.progress === null ? null : Math.round(s.progress * 100)} className="mt-2" />}
      {s.steps && (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
          {s.steps.map((t, i) => (
            <span key={i} className={i < idx ? 'text-ok' : i === idx ? 'font-semibold text-fg' : 'text-fg3'}>
              {(i < idx ? '✓ ' : i === idx ? '● ' : '') + t}
            </span>
          ))}
        </div>
      )}
      {s.steps && s.stepDetail && <div className="mt-1 text-xs break-words text-fg2">{s.stepDetail}</div>}
    </div>
  );
}
