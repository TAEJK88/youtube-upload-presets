import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// The drawer's .btn family (Design B): glass secondary buttons, an --fg primary ("go").
export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-line2 bg-transparent text-fg hover:bg-surface2',
        go: 'border-transparent bg-fg text-on-fg hover:bg-fg-hover active:bg-fg-active disabled:bg-surface2 disabled:text-fg3 disabled:opacity-100',
        ghost: 'border-transparent bg-transparent text-fg2 hover:bg-surface2 hover:text-fg',
        danger: 'border-transparent bg-err text-on-err hover:bg-err-hover',
        ghostDanger: 'border-transparent bg-transparent text-fg2 hover:text-err',
      },
      size: {
        default: 'h-9 rounded-[12px] px-3.5 text-[13px]',
        sm: 'h-8 rounded-[10px] px-2.5 text-xs',
        icon: 'size-8 rounded-[10px] p-0',
        lg: 'rounded-[14px] px-4 py-2.5 text-[13.5px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type={type} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
