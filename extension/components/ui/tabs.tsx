import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

// Design B: pill tabs in one glass box, the selected one --fg filled.
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('grid grid-cols-4 gap-1 rounded-[14px] bg-tint/[0.07] p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'group flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] py-2 text-[13.5px] font-medium text-tint/75 hover:bg-tint/[0.06] hover:text-tint',
        'data-[state=active]:bg-fg data-[state=active]:font-semibold data-[state=active]:text-on-fg [&_svg]:opacity-80 data-[state=active]:[&_svg]:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
