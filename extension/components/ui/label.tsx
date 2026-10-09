import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// The drawer's .lbl: a field caption with an optional muted note on the right.
export function Label({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="label" className={cn('mt-3 mb-1.5 flex items-baseline justify-between gap-2 text-xs text-fg2 first:mt-0 [&>span+span]:text-fg3', className)} {...props} />;
}
