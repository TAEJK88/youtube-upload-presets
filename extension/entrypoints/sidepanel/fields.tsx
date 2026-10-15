import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

// The drawer saved on every keystroke and never overwrote a field while the user typed in
// it (`if (document.activeElement !== el) el.value = …`). These fields keep their own text
// while focused and follow the stored value otherwise. A stored value that moved while the
// field was focused, from elsewhere (the run advancing the schedule start, another window),
// shows once the field is left, unless the user typed since; the echoes of the field's own
// writes are not such a change (one arriving late must not flash an older text).
function useFollow(value: string) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const sent = useRef(new Set<string>()); // written while focused
  const moved = useRef(false); // changed elsewhere while focused, not typed over since
  useEffect(() => {
    if (!focused.current) setText(value);
    else if (!sent.current.has(value)) moved.current = true;
  }, [value]);
  const focus = () => {
    focused.current = true;
    moved.current = false;
    sent.current.clear();
  };
  const blur = () => {
    focused.current = false;
    if (moved.current) setText(value);
    moved.current = false;
  };
  const typed = (v: string) => {
    moved.current = false;
    sent.current.add(v);
    setText(v);
  };
  return { text, setText, focused, focus, blur, typed };
}

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: string; onValue(v: string): void };

// `ref` is a plain prop in React 19 (the Presets tab inserts variables at the cursor).
export function TextField({ value, onValue, onFocus, onBlur, ref, ...rest }: InputProps) {
  const f = useFollow(value);
  return (
    <Input
      {...rest}
      ref={ref}
      value={f.text}
      onFocus={(e) => { f.focus(); onFocus?.(e); }}
      onBlur={(e) => { f.blur(); onBlur?.(e); }}
      onChange={(e) => { f.typed(e.target.value); onValue(e.target.value); }}
    />
  );
}

export function AreaField({ value, onValue, onFocus, onBlur, ...rest }: Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & { value: string; onValue(v: string): void }) {
  const f = useFollow(value);
  return (
    <Textarea
      {...rest}
      value={f.text}
      onFocus={(e) => { f.focus(); onFocus?.(e); }}
      onBlur={(e) => { f.blur(); onBlur?.(e); }}
      onChange={(e) => { f.typed(e.target.value); onValue(e.target.value); }}
    />
  );
}

// type=number inputs the drawer saved on `change` (blur or Enter), not on every keystroke.
export function NumberField({ value, onValue, ...rest }: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { value: string; onValue(v: string): void }) {
  const { text, setText, focused } = useFollow(value);
  const committed = useRef<string | null>(null); // Enter commits, and the blur after it must not
  const commit = () => {
    if (text === value || text === committed.current) return;
    committed.current = text;
    onValue(text);
  };
  return (
    <Input
      {...rest}
      type="number"
      className={cn('w-24', rest.className)}
      value={text}
      onFocus={() => { focused.current = true; committed.current = null; }}
      // Blur shows what is stored: a value the parent rejected or normalised must not stay
      // on screen (an async parent may flash the old value until `value` follows).
      onBlur={() => { focused.current = false; commit(); setText(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      onChange={(e) => { committed.current = null; setText(e.target.value); }}
    />
  );
}

// The drawer's .sec: a section heading with an icon, sections separated by a hairline.
export function Section({ title, icon, children, className }: { title?: string; icon?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-[22px] border-tint/[0.08] first:mt-0 [&+&]:border-t [&+&]:pt-[18px]', className)}>
      {title && (
        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold tracking-[.03em] text-fg3">
          {icon && <Icon name={icon} size={15} className="opacity-80" />}
          {title}
        </h4>
      )}
      {children}
    </section>
  );
}

// The drawer's .kv row: title + note on the left, the control on the right.
export function Kv({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <b className="block text-[13px] font-medium">{title}</b>
        {note && <small className="block text-xs text-fg3">{note}</small>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// The drawer's .hint line: an icon and muted text.
export function Hint({ icon = 'alert', children, className }: { icon?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-2 text-xs text-fg3', className)}>
      <Icon name={icon} size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// The drawer's iconBtn(): an icon-only button whose label is its title.
export function IconButton({ icon, title, className, ...rest }: Omit<ComponentProps<typeof Button>, 'children'> & { icon: string; title: string }) {
  return (
    <Button variant="ghost" size="icon" title={title} aria-label={title} className={className} {...rest}>
      <Icon name={icon} size={16} />
    </Button>
  );
}
