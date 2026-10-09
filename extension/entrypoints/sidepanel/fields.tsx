import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

// The drawer saved on every keystroke and never overwrote a field while the user typed in
// it (`if (document.activeElement !== el) el.value = …`). These fields keep their own text
// while focused and follow the stored value otherwise.
function useFollow(value: string) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return { text, setText, focused };
}

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: string; onValue(v: string): void };

// `ref` is a plain prop in React 19 (the Presets tab inserts variables at the cursor).
export function TextField({ value, onValue, onFocus, onBlur, ref, ...rest }: InputProps) {
  const { text, setText, focused } = useFollow(value);
  return (
    <Input
      {...rest}
      ref={ref}
      value={text}
      onFocus={(e) => { focused.current = true; onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; onBlur?.(e); }}
      onChange={(e) => { setText(e.target.value); onValue(e.target.value); }}
    />
  );
}

export function AreaField({ value, onValue, onFocus, onBlur, ...rest }: Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & { value: string; onValue(v: string): void }) {
  const { text, setText, focused } = useFollow(value);
  return (
    <Textarea
      {...rest}
      value={text}
      onFocus={(e) => { focused.current = true; onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; onBlur?.(e); }}
      onChange={(e) => { setText(e.target.value); onValue(e.target.value); }}
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
    <section className={cn('mt-[22px] border-white/[0.08] first:mt-0 [&+&]:border-t [&+&]:pt-[18px]', className)}>
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
