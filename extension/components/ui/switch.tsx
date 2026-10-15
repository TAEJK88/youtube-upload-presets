import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn('inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line2 transition-colors data-[state=checked]:bg-fg disabled:opacity-40', className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-on-fg" />
    </SwitchPrimitive.Root>
  );
}
