import { createContext, useCallback, useContext, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
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
// Cancel does, and yes needs a click or a Tab to it. On a short panel the yes button appears
// where the button that asked was, and the second click of a double-click would answer yes: so
// a pointer click on another answer is ignored when it was pressed in the first HASTY_MS, or
// is not a first click (detail > 1), and Cancel stays selected.
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
const HASTY_MS = 800; // past the systems' double-click time (400–500 ms by default)
const SELECTED = 'focus:outline-2 focus:outline-offset-2 focus:outline-fg2';

export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<AskOptions | null>(null);
  const resolver = useRef<((v: boolean | null) => void) | null>(null);
  const [asked, setAsked] = useState(0); // counts the questions: each one starts with its own selected button
  const openedAt = useRef(0);
  const hasty = useRef(false); // the last press on an answer came too soon
  const cancelButton = useRef<HTMLButtonElement>(null);
  const finish = useCallback((v: boolean | null) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(null);
    r?.(v);
  }, []);
  const ask = useCallback<Ask>((o) => new Promise((resolve) => {
    resolver.current?.(null); // a new question closes the one still open (askClose?.(null))
    resolver.current = resolve;
    openedAt.current = performance.now();
    setAsked((n) => n + 1);
    setOpen(o);
  }), []);
  const dismissed = open?.no ? null : false;
  const onCancel = open?.focus === 'cancel';
  const soon = () => performance.now() - openedAt.current < HASTY_MS;
  // Judged by the press, not the release; cancelled, a press moves no focus to the button under it.
  const press = (e: PointerEvent | MouseEvent) => {
    if (!onCancel) return;
    hasty.current = soon();
    if (hasty.current || e.detail > 1) e.preventDefault();
  };
  // A keyboard click has detail 0: Tab + Enter is never hasty.
  const answer = (v: boolean) => (e: MouseEvent) => {
    if (onCancel && e.detail > 0 && (hasty.current || e.detail > 1 || soon())) return cancelButton.current?.focus();
    finish(v);
  };
  const guarded = (v: boolean) => ({ onPointerDown: press, onMouseDown: press, onClick: answer(v) });
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
            {/* keyed: autoFocus only acts on mount, and a question can replace one still open */}
            <div key={asked} className="mt-5 flex justify-end gap-2">
              {open.no ? (
                <>
                  <Button ref={cancelButton} autoFocus={onCancel} variant="ghost" className={onCancel ? SELECTED : undefined} onClick={() => finish(null)}>{cancel}</Button>
                  <Button {...guarded(false)}>{open.no}</Button>
                </>
              ) : (
                <Button ref={cancelButton} autoFocus={onCancel} className={onCancel ? SELECTED : undefined} onClick={() => finish(false)}>{cancel}</Button>
              )}
              <Button autoFocus={!onCancel} variant={open.danger ? 'danger' : 'go'} {...guarded(true)}>{ok}</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AskContext.Provider>
  );
}
