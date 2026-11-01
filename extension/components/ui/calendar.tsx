import type { ComponentProps } from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { enGB, th } from 'react-day-picker/locale';
import { buttonVariants } from '@/components/ui/button';
import { locale } from '@/lib/i18n';
import { ICONS } from '@/lib/studio/dom';
import { cn } from '@/lib/utils';

// shadcn's Calendar (react-day-picker 9), in the panel's tokens and language.
export function Calendar({ className, classNames, ...props }: ComponentProps<typeof DayPicker>) {
  const d = getDefaultClassNames();
  return (
    <DayPicker
      locale={locale() === 'th-TH' ? th : enGB}
      showOutsideDays
      className={cn('p-1 text-[13px]', className)}
      classNames={{
        root: cn('w-fit', d.root),
        months: cn('relative flex flex-col', d.months),
        month: cn('flex flex-col gap-2', d.month),
        nav: cn('absolute inset-x-0 top-0 flex items-center justify-between', d.nav),
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'z-10', d.button_previous),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'z-10', d.button_next),
        month_caption: cn('flex h-8 items-center justify-center', d.month_caption),
        caption_label: cn('font-medium', d.caption_label),
        month_grid: cn('border-collapse', d.month_grid),
        weekdays: cn('flex', d.weekdays),
        weekday: cn('w-9 text-xs font-normal text-fg3', d.weekday),
        week: cn('mt-1 flex', d.week),
        day: cn('size-9 p-0 text-center', d.day),
        day_button: cn('size-9 cursor-pointer rounded-[10px] hover:bg-surface2 disabled:cursor-default disabled:opacity-40', d.day_button),
        today: cn('[&>button]:font-semibold [&>button]:text-tint', d.today),
        selected: cn('[&>button]:bg-fg [&>button]:text-on-fg [&>button]:hover:bg-fg-hover', d.selected),
        outside: cn('text-fg3 opacity-60', d.outside),
        disabled: cn('text-fg3', d.disabled),
        hidden: cn('invisible', d.hidden),
        ...classNames,
      }}
      components={{
        // 'chev' points down: a quarter turn makes it point back or on.
        Chevron: ({ orientation }) => (
          <svg viewBox="0 -960 960 960" width={18} height={18} aria-hidden="true" className={orientation === 'left' ? 'rotate-90' : orientation === 'right' ? '-rotate-90' : ''}>
            <path d={ICONS.chev} fill="currentColor" />
          </svg>
        ),
      }}
      {...props}
    />
  );
}
