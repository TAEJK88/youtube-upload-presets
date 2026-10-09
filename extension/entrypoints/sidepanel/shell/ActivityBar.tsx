import { Progress } from '@/components/ui/progress';
import { activityFrom, emojiIconName } from '@/lib/activity';
import { L } from '@/lib/i18n';
import type { TabKey } from '../App';
import { Icon } from '../Icon';
import { useLive, usePanel } from '../panel';

// The drawer's activity bar (actBar 3304–3312, activity() / renderActivity() 4079–4136):
// what is running right now, on every tab; click to go to it. Hidden when idle.
export function ActivityBar({ onGo }: { onGo(tab: TabKey): void }) {
  const { view } = usePanel();
  const { liveState } = useLive();
  const items = view?.items ?? [];
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const a = activityFrom(
    {
      running: !!liveState?.running,
      inFlight: items.some((i) => i.status === 'uploading' || i.status === 'review'),
      total: items.length,
      done: count('done'),
      errors: count('error'),
    },
    null, // the copyright module's status arrives in Phase 4
    liveState?.prog ?? null,
  );
  if (!a) return null;
  const title = a.task === 'upload' && a.count ? L(`กำลังอัปโหลด ${a.count.at}/${a.count.of}`, `Uploading ${a.count.at}/${a.count.of}`) : a.title;
  const pct = a.progress === null ? null : Math.round(a.progress * 100);
  const go = () => onGo(a.tab);
  const ic = emojiIconName(a.icon); // emojiIcon(a.icon, 15) (4122)
  return (
    <div
      role="button"
      tabIndex={0}
      title={a.detail}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
      className="mx-[18px] mt-3 cursor-pointer rounded-[14px] border border-tint/10 bg-tint/5 px-3 py-2.5 hover:bg-surface2"
    >
      <div className="flex items-center gap-2 text-[13px]">
        <span className="grid w-5 place-items-center text-fg2">{ic ? <Icon name={ic} size={15} /> : a.icon}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span className="text-xs text-fg2">{pct === null ? '' : `${pct}%`}</span>
      </div>
      <Progress value={pct} className="mt-2" />
    </div>
  );
}
