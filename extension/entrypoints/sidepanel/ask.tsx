import { createContext, useCallback, useContext, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';

// The drawer's ask() (3204–3237): a confirm box in the panel instead of the browser's
// confirm(). Resolves true = main button, false = second button, null = dismissed (Esc,
// click outside, Cancel) — and when there is no second button, dismissing answers false.
// A question replaced by a newer one, or closed some other way, resolves null: callers must
// test `=== true` / `=== false` / `== null` deliberately and never treat null as false.
// The main button is selected when the question opens and Enter answers yes. focus: 'cancel'
// (P5-ask-cancel) is for a yes that cannot be undone: Cancel is selected, Enter answers as
// Cancel does, and yes needs a click or a Tab to it.
export interface AskOptions {
  title: string;
  body?: ReactNode;
  ok?: string;
  no?: string | null;
  cancel?: string;
  danger?: boolean;
  icon?: string;
  focus?: 'cancel';
}
type Ask = (o: AskOptions) => Promise<boolean | null>;
const AskContext = createContext<Ask | null>(null);
export function useAsk(): Ask {
  const ask = useContext(AskContext);
  if (!ask) throw new Error('useAsk() must be used inside <AskProvider>');
  return ask;
}

// Cancel selected by the box, not by a key press: :focus-visible would not draw its ring after a click.
const SELECTED = 'focus:outline-2 focus:outline-offset-2 focus:outline-fg2';

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
  const onCancel = open?.focus === 'cancel';
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !/^(TEXTAREA|BUTTON)$/.test((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      finish(onCancel ? dismissed : true);
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
            {/* keyed: autoFocus only acts on mount, and a question can replace one that opened on the other button */}
            <div key={open.focus ?? 'ok'} className="mt-5 flex justify-end gap-2">
              {open.no ? (
                <>
                  <Button autoFocus={onCancel} variant="ghost" className={onCancel ? SELECTED : undefined} onClick={() => finish(null)}>{cancel}</Button>
                  <Button onClick={() => finish(false)}>{open.no}</Button>
                </>
              ) : (
                <Button autoFocus={onCancel} className={onCancel ? SELECTED : undefined} onClick={() => finish(false)}>{cancel}</Button>
              )}
              <Button autoFocus={!onCancel} variant={open.danger ? 'danger' : 'go'} onClick={() => finish(true)}>{ok}</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AskContext.Provider>
  );
}
