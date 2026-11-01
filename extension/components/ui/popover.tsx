import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn's Popover, on the panel's raised surface (as DialogContent).
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 rounded-[16px] border border-raised-line bg-raised p-2 text-fg shadow-(--raised-shadow) outline-none', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
