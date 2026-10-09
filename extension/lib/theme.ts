// The panel's dark/light theme: <html data-theme>, which style.css keys its tokens on.
// main.tsx (the panel's and the debug page's) imports this right after the crash guard, so
// the stored theme is set before first paint. A per-device view preference, so it lives in
// the extension origin's localStorage (synchronous, shared by the panel and debug.html), not
// in settings. Any localStorage failure means dark, the default.
export type Theme = 'dark' | 'light';
export const THEME_KEY = 'ytup-theme';

const parse = (v: string | null | undefined): Theme => (v === 'light' ? 'light' : 'dark');

function stored(): Theme {
  try {
    return parse(localStorage.getItem(THEME_KEY));
  } catch {
    return 'dark';
  }
}

const listeners = new Set<() => void>();
function apply(t: Theme): void {
  document.documentElement.dataset.theme = t;
  for (const l of listeners) l();
}

export const currentTheme = (): Theme => parse(document.documentElement.dataset.theme);

export function setTheme(t: Theme): void {
  apply(t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // not stored: this page keeps the theme until it reloads
  }
}

// For useSyncExternalStore.
export function subscribeTheme(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Another page of the extension (the debug page, a second panel) changed it, or cleared
// localStorage (key null). The event fires for sessionStorage too, where a same-origin
// frame's clear() also has key null: only localStorage counts.
const onStorage = (e: StorageEvent) => {
  if (e.storageArea === localStorage && (e.key === THEME_KEY || e.key === null)) apply(parse(e.newValue));
};

export function installTheme(): void {
  apply(stored());
  window.addEventListener('storage', onStorage);
}

// Tests: undo installTheme().
export function disposeTheme(): void {
  window.removeEventListener('storage', onStorage);
  listeners.clear();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installTheme();
