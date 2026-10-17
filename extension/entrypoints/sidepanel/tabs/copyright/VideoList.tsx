import { useId, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// The scanned video lists of Ads off and Collab: a bar that folds the whole list away (so the step
// under it is in reach) and switches the rows between full cards and one line each. Compact or full
// is the viewer's own choice, kept in this browser like the theme; unset, a long list starts compact.
export const COMPACT_KEY = 'ytup:videoListCompact';
export const COMPACT_FROM = 16; // rows: a list this long starts compact until the choice is made
const readCompact = (): boolean | null => {
  try {
    const v = localStorage.getItem(COMPACT_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
};
const openTab = (url: string) => void browser.tabs.create({ url });

// `picked`: how many are ticked, so the bar still says it with the list folded.
// `children` gets the row mode, for each <VideoRow compact>.
export function VideoList({ count, picked, children }: { count: number; picked: number; children: (compact: boolean) => ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(true);
  const [chosen, setChosen] = useState(readCompact);
  const compact = chosen ?? count >= COMPACT_FROM;
  const flip = () => {
    setChosen(!compact);
    try { localStorage.setItem(COMPACT_KEY, compact ? '0' : '1'); } catch { /* the choice lasts this view only */ }
  };
  return (
    <div className="t-acc flex flex-col" data-open={open}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="t-acc-head flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[10px] py-1 text-left text-xs text-fg2 hover:text-fg"
          aria-expanded={open} aria-controls={`${id}list`} onClick={() => setOpen(!open)}>
          <span className="t-acc-chevron shrink-0" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6.5L8 10.5L12 6.5" /></svg>
          </span>
          <span className="min-w-0 break-words">{L(`รายการคลิป (${count}) · เลือกแล้ว ${picked}`, `Video list (${count}) · ${picked} picked`)}</span>
        </button>
        <Button size="sm" variant="ghost" onClick={flip}>{compact ? L('▤ แถวเต็ม', '▤ Full rows') : L('☰ แถวย่อ', '☰ Compact rows')}</Button>
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

// A line under the title on a full card; on a compact row only its `icon`, with the text on hover.
export type RowNote = { text: string; tone?: string; icon?: string };

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
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-tint/[0.09] bg-tint/5 px-2.5 py-1.5 text-[13px]">
        {box}
        {link}
        {notes.filter((n) => n.icon).map((n) => <span key={n.text} role="img" aria-label={n.text} title={n.text} className={cn('shrink-0 text-xs', n.tone)}>{n.icon}</span>)}
        <span className="shrink-0 text-xs text-fg3 tabular-nums">{meta}</span>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
      {box}
      <div className="min-w-0 flex-1 break-words">
        {link}
        <div className="text-xs text-fg3">{meta}</div>
        {notes.map((n) => <div key={n.text} className={cn('text-xs', n.tone ?? 'text-fg2')}>{n.text}</div>)}
      </div>
    </div>
  );
}
