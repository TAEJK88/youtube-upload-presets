import { ICONS } from '@/lib/studio/dom';

// The userscript's embedded Material Symbols Rounded paths (no icon font to load).
export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} aria-hidden="true" className={className}>
      <path d={ICONS[name] || ICONS.info} fill="currentColor" />
    </svg>
  );
}
