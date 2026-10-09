import { useSyncExternalStore } from 'react';
import { currentTheme, subscribeTheme } from './theme';

// The current theme, re-rendering on change: for the toggle and the Toaster. Apart from
// theme.ts, which has no React so it can run before React loads.
export const useTheme = () => useSyncExternalStore(subscribeTheme, currentTheme);
