import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Icon } from '../../Icon';
import { openTab } from '../../open-tab';

// The scanned video lists of Ads off and Collab: a bar that folds the whole list away (so the step
// under it is in reach) and switches the rows between full cards and one line each. Each time the
// view opens, a long scan starts compact and a short one full; the switch lasts while it is open.
export const COMPACT_FROM = 16; // scanned rows

// One tick on or off, for setPicked.
export const tick = (videoId: string, on: boolean) => (p: Set<string>) => {
  const n = new Set(p);
  if (on) n.add(videoId);
  else n.delete(videoId);
  return n;
};

// `total`: the rows the scan read, which sets the starting mode (not the search, or the rows would
// switch as one types). `count`: the rows shown. `picked`: how many are ticked, so the bar still
// says it with the list folded. `query`: the search, which unfolds the list when it changes (the
// rows it finds would be out of sight). `children` gets the row mode, for each <VideoRow compact>.
// Keyed by the scan's date where it is used, so a newer scan starts the fold and mode again.
export function VideoList({ total, count, picked, query = '', children }: { total: number; count: number; picked: number; query?: string; children: (compact: boolean) => ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(true);
  const [compact, setCompact] = useState(() => total >= COMPACT_FROM);
  const [searched, setSearched] = useState(query);
  if (searched !== query) {
    setSearched(query);
    setOpen(true);
  }
  return (
    <div className="t-acc flex flex-col" data-open={open}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[10px] py-1 text-left text-xs text-fg2 hover:text-fg"
          aria-expanded={open} aria-controls={`${id}list`} onClick={() => setOpen(!open)}>
          <span className="t-acc-chevron shrink-0"><Icon name="chev" size={14} /></span>
          <span className="min-w-0 break-words">{count === total
            ? L(`รายการคลิป (${total}) · เลือกแล้ว ${picked}`, `Video list (${total}) · ${picked} picked`)
            : L(`แสดง ${count} จาก ${total} คลิป · เลือกแล้ว ${picked}`, `Showing ${count} of ${total} videos · ${picked} picked`)}</span>
        </button>
        <Button size="sm" variant="ghost" onClick={() => setCompact(!compact)}>{compact ? L('▤ แถวเต็ม', '▤ Full rows') : L('☰ แถวย่อ', '☰ Compact rows')}</Button>
      </div>
      {/* Folded, the rows stay mounted (the ticks hold) but out of the tab order. */}
      <div id={`${id}list`} className="t-acc-panel" inert={!open}>
        <div className="t-acc-panel-inner">
          <div className={cn('flex flex-col pt-1.5', compact ? 'gap-1' : 'gap-2')}>{children(compact)}</div>
        </div>
      </div>
    </div>
  );
}

// A line under the title on a full card. On a compact row only its `icon` shows, with the text on
// hover, unless `keep`: a failure's reason stays readable there too (no hover on touch or keyboard).
export type RowNote = { text: string; tone?: string; icon?: string; keep?: boolean };

export function VideoRow({ compact, title, url, meta, notes, checked, onCheck }: {
  compact: boolean; title: string; url: string; meta: string; notes: RowNote[]; checked: boolean; onCheck(on: boolean): void;
}) {
  const id = useId();
  const box = <input type="checkbox" className={cn('size-4 shrink-0 accent-fg', !compact && 'mt-0.5')} checked={checked} aria-labelledby={id} onChange={(e) => onCheck(e.target.checked)} />;
  const link = (
    <a id={id} className={cn('font-medium underline-offset-2 hover:underline', compact && 'min-w-0 flex-1 truncate')} title={compact ? title : undefined} href={url}
      onClick={(e) => { e.preventDefault(); openTab(url); }}>{title}</a>
  );
  if (compact) {
    const kept = notes.filter((n) => n.keep);
    return (
      <div className="flex flex-col rounded-[10px] border border-tint/[0.09] bg-tint/5 px-2.5 py-1.5 text-[13px]">
        <div className="flex items-center gap-2">
          {box}
          {link}
          {notes.map((n, i) => n.icon && !n.keep && <span key={i} role="img" aria-label={n.text} title={n.text} className={cn('shrink-0 text-xs', n.tone)}>{n.icon}</span>)}
          <span className="shrink-0 text-xs text-fg3 tabular-nums">{meta}</span>
        </div>
        {kept.map((n, i) => <div key={i} className={cn('pl-6 text-xs break-words', n.tone ?? 'text-fg2')}>{n.text}</div>)}
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
      {box}
      <div className="min-w-0 flex-1 break-words">
        {link}
        <div className="text-xs text-fg3">{meta}</div>
        {notes.map((n, i) => <div key={i} className={cn('text-xs', n.tone ?? 'text-fg2')}>{n.text}</div>)}
      </div>
    </div>
  );
}
