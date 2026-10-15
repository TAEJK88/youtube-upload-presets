import { cn } from '@/lib/utils';

// A thin white bar (.progress / .tbx-bar). null = no percentage known: a moving stripe.
export function Progress({ value, className }: { value: number | null; className?: string }) {
  return (
    <div role="progressbar" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100} className={cn('relative h-1 overflow-hidden rounded-full bg-line2', className)}>
      {value === null
        ? <i className="absolute inset-y-0 w-1/3 animate-[ytup-ind_1.2s_ease-in-out_infinite] rounded-full bg-fg" />
        : <i className="absolute inset-y-0 left-0 rounded-full bg-fg transition-[width]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
      <style>{'@keyframes ytup-ind{0%{left:-33%}100%{left:100%}}'}</style>
    </div>
  );
}
