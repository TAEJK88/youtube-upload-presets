import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const fieldClass =
  'w-full min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-fg3 disabled:opacity-50 [color-scheme:dark]';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(fieldClass, 'h-9', className)} {...props} />;
}
