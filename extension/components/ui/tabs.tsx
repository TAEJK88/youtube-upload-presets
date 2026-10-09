import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

// Design B: pill tabs in one glass box, the selected one white.
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('grid grid-cols-4 gap-1 rounded-[14px] bg-white/[0.07] p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'group flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] py-2 text-[13.5px] font-medium text-white/75 hover:bg-white/[0.06] hover:text-white',
        'data-[state=active]:bg-[#f4f4f5] data-[state=active]:font-semibold data-[state=active]:text-[#0b0b0c] [&_svg]:opacity-80 data-[state=active]:[&_svg]:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
