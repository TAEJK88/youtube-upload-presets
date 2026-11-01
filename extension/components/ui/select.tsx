import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { ICONS } from '@/lib/studio/dom';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';

// shadcn's Select: the field looks like an Input, the list opens on the panel's raised surface
// (as PopoverContent) instead of the browser's own menu.
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

const icon = (d: string | undefined, className: string) => (
  <svg viewBox="0 -960 960 960" aria-hidden="true" className={className}>
    <path d={d} fill="currentColor" />
  </svg>
);

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(fieldClass, 'flex h-9 w-auto items-center justify-between gap-2 text-left data-[placeholder]:text-fg3 [&>span]:truncate', className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>{icon(ICONS.chev, 'size-4 shrink-0 text-fg3')}</SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={6}
        className={cn(
          'z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-y-auto rounded-[12px] border border-raised-line bg-raised p-1 text-fg shadow-(--raised-shadow)',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex cursor-default items-center rounded-[8px] py-1.5 pr-8 pl-2.5 text-[13px] outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2">{icon(ICONS.check, 'size-4')}</SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
