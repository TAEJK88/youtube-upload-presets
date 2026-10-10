import { Button } from '@/components/ui/button';
import type { ClaimsLogLine } from '@/lib/claims/types';
import { L, locale } from '@/lib/i18n';

// The pane's activity section (6215, logBox 6184, log() 6178): newest first, HH:MM.
const TONE: Record<string, string> = { ok: 'text-ok', err: 'text-err', warn: 'text-warn' };
export function ActivityLog({ open, lines, onToggle }: { open: boolean; lines: ClaimsLogLine[]; onToggle(): void }) {
  return (
    <>
      <div className="flex items-center">
        <b className="flex-1 text-[13px] font-medium">{L('กิจกรรม', 'Activity')}</b>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
          {open ? L('ซ่อนกิจกรรม ▴', 'Hide activity ▴') : L('แสดงกิจกรรม ▾', 'Show activity ▾')}
        </Button>
      </div>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-[12px] bg-tint/5 p-2 font-mono text-xs leading-relaxed break-words">
          {lines.map((l, i) => (
            <div key={l.at + ':' + i} className={TONE[l.type] ?? 'text-fg2'}>
              {new Date(l.at).toLocaleTimeString(locale()).slice(0, 5) + '  '}{l.msg}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
