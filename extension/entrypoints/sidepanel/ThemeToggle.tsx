import { useSyncExternalStore } from 'react';
import { L } from '@/lib/i18n';
import { IconButton } from './fields';
import { currentTheme, setTheme, subscribeTheme } from './theme';

export const useTheme = () => useSyncExternalStore(subscribeTheme, currentTheme);

// The header's theme switch: a sun in dark (go light), a moon in light (go dark).
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useTheme() === 'dark';
  return (
    <IconButton
      icon={dark ? 'light_mode' : 'dark_mode'}
      title={dark ? L('สลับเป็นธีมสว่าง', 'Switch to light theme') : L('สลับเป็นธีมมืด', 'Switch to dark theme')}
      className={className}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    />
  );
}
