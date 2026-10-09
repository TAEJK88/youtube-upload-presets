// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTRA_ICONS } from '../entrypoints/sidepanel/Icon';
import { setLang } from '../lib/i18n';

// The panel's dark/light theme: a per-device view preference in the extension origin's
// localStorage ('ytup-theme'), applied to <html data-theme> before first paint by
// entrypoints/sidepanel/theme.ts, which main.tsx (panel and debug page) imports right after
// the crash guard.
const KEY = 'ytup-theme';
const html = () => document.documentElement;
// A fresh copy of the module: importing it is what applies the stored theme.
const themeMod = async () => {
  vi.resetModules();
  return import('../entrypoints/sidepanel/theme');
};
const toggleMod = () => import('../entrypoints/sidepanel/ThemeToggle');

beforeEach(() => {
  localStorage.clear();
  delete html().dataset.theme;
  setLang('en');
});
afterEach(async () => {
  cleanup();
  (await import('../entrypoints/sidepanel/theme')).disposeTheme();
  vi.restoreAllMocks();
  localStorage.clear();
  delete html().dataset.theme;
});

describe('theme on load', () => {
  it('dark by default', async () => {
    await themeMod();
    expect(html().dataset.theme).toBe('dark');
  });
  it('applies the stored theme', async () => {
    localStorage.setItem(KEY, 'light');
    await themeMod();
    expect(html().dataset.theme).toBe('light');
  });
  it('an unknown stored value is dark', async () => {
    localStorage.setItem(KEY, 'sepia');
    await themeMod();
    expect(html().dataset.theme).toBe('dark');
  });
  it('a localStorage that throws falls back to dark, and the toggle still works without it', async () => {
    const deny = () => { throw new DOMException('denied', 'SecurityError'); };
    const setItem = vi.fn(deny);
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: deny, setItem } });
    try {
      const t = await themeMod();
      expect(html().dataset.theme).toBe('dark');
      expect(() => t.setTheme('light')).not.toThrow();
      expect(setItem).toHaveBeenCalledWith(KEY, 'light');
      expect(html().dataset.theme).toBe('light');
    } finally {
      Object.defineProperty(window, 'localStorage', desc);
    }
  });
  it('no localStorage at all (the getter throws) is dark too', async () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    try {
      await themeMod();
      expect(html().dataset.theme).toBe('dark');
    } finally {
      Object.defineProperty(window, 'localStorage', desc);
    }
  });
});

describe('the toggle', () => {
  it('flips data-theme, persists, and names what it will do (sun in dark, moon in light)', async () => {
    await themeMod();
    const { ThemeToggle } = await toggleMod();
    render(<ThemeToggle />);
    const b = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(b.getAttribute('title')).toBe('Switch to light theme');
    expect(b.querySelector('path')!.getAttribute('d')).toBe(EXTRA_ICONS.light_mode);
    fireEvent.click(b);
    expect(html().dataset.theme).toBe('light');
    expect(localStorage.getItem(KEY)).toBe('light');
    const back = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(back.querySelector('path')!.getAttribute('d')).toBe(EXTRA_ICONS.dark_mode);
    fireEvent.click(back);
    expect(html().dataset.theme).toBe('dark');
    expect(localStorage.getItem(KEY)).toBe('dark');
  });
  it('in Thai', async () => {
    await themeMod();
    const { ThemeToggle } = await toggleMod();
    (await import('../lib/i18n')).setLang('th'); // the copy the fresh modules use
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'สลับเป็นธีมสว่าง' }));
    expect(screen.getByRole('button', { name: 'สลับเป็นธีมมืด' })).toBeTruthy();
  });
  it('follows a change made in another page of the extension (storage event)', async () => {
    await themeMod();
    const { ThemeToggle } = await toggleMod();
    render(<ThemeToggle />);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'light' }));
    });
    expect(html().dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'x' }));
    });
    expect(html().dataset.theme).toBe('light');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null })); // localStorage.clear() elsewhere
    });
    expect(html().dataset.theme).toBe('dark');
  });
});

describe("the crash guard's plain-DOM fallback", () => {
  // It reads <html data-theme> (set by theme.ts before anything can fail) instead of
  // prefers-color-scheme, so it matches the panel; unset means dark, the panel's default.
  const box = () => document.getElementById('ytup-crash')!;
  afterEach(() => box()?.remove());
  it('is light in the light theme, dark otherwise, whatever the OS prefers', async () => {
    const { render: show } = await import('../entrypoints/sidepanel/crash-kit');
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('light') }));
    try {
      html().dataset.theme = 'light';
      show('h', 'd', 'c');
      expect(box().style.background).toMatch(/#ffffff|rgb\(255, 255, 255\)/);
      expect(box().style.color).toMatch(/#111111|rgb\(17, 17, 17\)/);
      html().dataset.theme = 'dark';
      show('h', 'd', 'c');
      expect(box().style.background).toMatch(/#0b0b0c|rgb\(11, 11, 12\)/);
      delete html().dataset.theme;
      show('h', 'd', 'c');
      expect(box().style.background).toMatch(/#0b0b0c|rgb\(11, 11, 12\)/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('wiring', () => {
  const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  it('panel and debug page import the theme right after the crash guard', () => {
    expect(src('entrypoints/sidepanel/main.tsx')).toMatch(/^(\/\/[^\n]*\n)*import \{[^}]*\} from '\.\/crash-guard';\nimport '\.\/theme';[^\n]*\n/);
    expect(src('entrypoints/debug/main.tsx')).toMatch(/^(\/\/[^\n]*\n)*import \{[^}]*\} from '\.\.\/sidepanel\/crash-guard';\nimport '\.\.\/sidepanel\/theme';[^\n]*\n/);
  });
  it('the stylesheet has a light palette (the userscript\'s tokens) next to the dark one', () => {
    const css = src('entrypoints/sidepanel/style.css');
    const light = css.match(/\[data-theme='light'\]\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(light).toContain('color-scheme: light');
    for (const t of ['--bg: #ffffff', '--surface: #f7f7f9', '--surface2: #efeff3', '--line: #e4e4ea', '--line2: #d6d6de', '--fg: #111114',
      '--fg2: #5d5d6b', '--fg3: #8d8d9a', '--ok: #16a34a', '--warn: #d97706', '--err: #dc2626', '--info: #2563eb', '--muted: #9a9aa6', '--popover: #ffffff']) {
      expect(light).toContain(t);
    }
  });
  // A colour written into a component assumes one theme (white text, white washes, a dark
  // hex): each is a token in style.css instead. Allowed, with the reason:
  const ALLOWED = [
    'bg-black/30', // the dialog's overlay dims whatever is behind it, in either theme
    'bg-black/75 px-1 text-xs text-white', // the duration on a video thumbnail, as YouTube shows it
    'bg-black/80 px-1 text-xs text-white', // the same badge in the Presets tab's YouTube preview
    'shadow-[0_30px_80px_-20px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.07)]', // dialog depth; the inset highlight just vanishes on white
  ];
  const COLOUR = /(?:^|[\s'"`:])(?:[\w-]+:)*(?:bg|text|border|ring|shadow|outline|fill|stroke|from|to)-(?:white|black)\b|#[0-9a-fA-F]{3,8}\b|rgba?\(/g;
  const files = (dir: string): string[] =>
    readdirSync(join(__dirname, '..', dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []);
  it('the panel and debug page components use colour tokens, not colours that assume dark', () => {
    const found: string[] = [];
    // crash-kit.ts is the plain-DOM fallback (inline styles, no stylesheet): tested on its own below.
    for (const f of [...files('components'), ...files('entrypoints/sidepanel'), ...files('entrypoints/debug')].filter((f) => !f.endsWith('crash-kit.ts'))) {
      let text = src(f);
      for (const a of ALLOWED) text = text.replaceAll(a, '');
      text.split('\n').forEach((line, i) => {
        if (line.trim().startsWith('//')) return;
        for (const m of line.matchAll(COLOUR)) found.push(`${f}:${i + 1} ${m[0].trim()}`);
      });
    }
    expect(found).toEqual([]);
  });
});
