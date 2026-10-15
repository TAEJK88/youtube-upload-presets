import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';

// One of the pane's modals (openModal 4851) as a tool of the Tools tab (D23): its title, its
// content, its footer row, and Back when it sits on top of another view (the tracklist editor).
export function SubView({ title, sub, children, footer, onClose }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode; onClose?(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  // A view opened over another one: the button that opened it is gone, so focus goes to the title,
  // as a dialog's would. A view opened by its sub-tab leaves focus on the tab (arrow keys keep working).
  useEffect(() => {
    if (onClose && !box.current?.contains(document.activeElement)) head.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={box} className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <h3 ref={head} tabIndex={-1} className="min-w-0 flex-1 text-[15px] font-semibold break-words outline-none">{title}</h3>
        {onClose && <Button size="sm" onClick={onClose}>{L('← กลับ', '← Back')}</Button>}
      </div>
      {sub && <div className="text-xs break-words text-fg3">{sub}</div>}
      {children}
      {/* A modal's button row stayed in sight under its scrolling table; here it sticks to the pane's bottom edge (the pane's own padding is covered). */}
      {footer && <div className="sticky -bottom-[18px] -mx-[18px] -mb-[18px] flex flex-wrap items-center gap-2 border-t border-line bg-bg px-[18px] py-3">{footer}</div>}
    </div>
  );
}
