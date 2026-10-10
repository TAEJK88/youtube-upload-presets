import { Progress } from '@/components/ui/progress';
import { emojiIconName } from '@/lib/activity';
import type { ClaimsStatus } from '@/lib/claims/types';
import { cn } from '@/lib/utils';
import { Icon } from '../../Icon';

// renderStatus()'s card (6235–6243): title with its icon, the detail, a progress bar (no
// number: indeterminate), and the steps of a run with the current one marked.
const TONE: Record<string, string> = { busy: 'border-info/35', wait: 'border-warn/35', err: 'border-err/35', ok: 'border-ok/35', idle: '' };
export function StatusCard({ s }: { s: ClaimsStatus }) {
  const ic = emojiIconName(s.icon);
  const idx = s.stepIdx ?? -1;
  return (
    <div className={cn('rounded-[14px] border border-tint/10 bg-tint/5 px-3 py-2.5', TONE[s.kind])} role="status">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className="grid w-5 shrink-0 place-items-center text-fg2">{ic ? <Icon name={ic} size={17} /> : s.icon}</span>
        <span className="min-w-0 flex-1 break-words">{s.title}</span>
      </div>
      {s.detail && <div className="mt-1 text-xs break-words whitespace-pre-line text-fg3">{s.detail}</div>}
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
