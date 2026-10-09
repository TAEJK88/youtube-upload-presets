import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// The drawer's .chip: rounded, outlined; `tone` colours problems (Design B: amber on a tint).
export function Badge({ className, tone, ...props }: ComponentProps<'span'> & { tone?: 'bad' | 'warn' }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-line2 px-2 py-0.5 text-xs text-fg2',
        tone === 'bad' && 'border-transparent bg-warn/[0.12] text-warn',
        tone === 'warn' && 'text-warn',
        className,
      )}
      {...props}
    />
  );
}
