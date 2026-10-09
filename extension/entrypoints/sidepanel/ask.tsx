import { createContext, useCallback, useContext, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';

// The drawer's ask() (3204–3237): a confirm box in the panel instead of the browser's
// confirm(). Resolves true = main button, false = second button, null = dismissed (Esc,
// click outside, Cancel) — and when there is no second button, dismissing answers false.
export interface AskOptions {
  title: string;
  body?: ReactNode;
  ok?: string;
  no?: string | null;
  cancel?: string;
  danger?: boolean;
  icon?: string;
}
type Ask = (o: AskOptions) => Promise<boolean | null>;
const AskContext = createContext<Ask>(async () => false);
export const useAsk = () => useContext(AskContext);

export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<AskOptions | null>(null);
  const resolver = useRef<((v: boolean | null) => void) | null>(null);
  const finish = useCallback((v: boolean | null) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(null);
    r?.(v);
  }, []);
  const ask = useCallback<Ask>((o) => new Promise((resolve) => {
    resolver.current?.(null); // a new question closes the one still open (askClose?.(null))
    resolver.current = resolve;
    setOpen(o);
  }), []);
  const dismissed = open?.no ? null : false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !/^(TEXTAREA|BUTTON)$/.test((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      finish(true);
    }
  };
  const ok = open?.ok ?? L('ตกลง', 'OK');
  const cancel = open?.cancel ?? L('ยกเลิก', 'Cancel');
  return (
    <AskContext.Provider value={ask}>
      {children}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) finish(dismissed); }}>
        {open && (
          <DialogContent onKeyDown={onKeyDown} {...(open.body ? {} : { 'aria-describedby': undefined })}>
            <DialogTitle className="flex items-center gap-2.5 text-[15px] font-semibold">
              <span className={open.danger ? 'grid size-8 place-items-center rounded-[10px] bg-err/15 text-err' : 'grid size-8 place-items-center rounded-[10px] bg-surface2 text-fg'}>
                <Icon name={open.icon ?? 'alert'} size={17} />
              </span>
              {open.title}
            </DialogTitle>
            {open.body ? <DialogDescription asChild><div className="mt-3 text-[13px] whitespace-pre-line text-fg2">{open.body}</div></DialogDescription> : null}
            <div className="mt-5 flex justify-end gap-2">
              {open.no ? (
                <>
                  <Button variant="ghost" onClick={() => finish(null)}>{cancel}</Button>
                  <Button onClick={() => finish(false)}>{open.no}</Button>
                </>
              ) : (
                <Button onClick={() => finish(false)}>{cancel}</Button>
              )}
              <Button autoFocus variant={open.danger ? 'danger' : 'go'} onClick={() => finish(true)}>{ok}</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AskContext.Provider>
  );
}
