import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';

// One of the pane's modals (openModal 4851) as a view of the Copyright tab (D23): its title, its
// content, its footer row, and Close back to the tab.
export function SubView({ title, sub, children, footer, onClose }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode; onClose(): void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold break-words">{title}</h3>
        <Button size="sm" onClick={onClose}>{L('ปิด', 'Close')}</Button>
      </div>
      {sub && <div className="text-xs break-words text-fg3">{sub}</div>}
      {children}
      {/* A modal's button row stayed in sight under its scrolling table; here it sticks to the pane's bottom edge (the pane's own padding is covered). */}
      {footer && <div className="sticky -bottom-[18px] -mx-[18px] -mb-[18px] flex flex-wrap items-center gap-2 border-t border-line bg-bg px-[18px] py-3">{footer}</div>}
    </div>
  );
}
