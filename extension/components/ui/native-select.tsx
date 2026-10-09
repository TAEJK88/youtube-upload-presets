import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';

// The drawer used plain <select>s; so does the panel (keyboard and screen readers for free).
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn(fieldClass, 'h-9 w-auto pr-7', className)} {...props} />;
}
