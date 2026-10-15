// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTRA_ICONS } from '../entrypoints/sidepanel/Icon';
import { setLang } from '../lib/i18n';

// The panel's dark/light theme: a per-device view preference in the extension origin's
// localStorage ('ytup-theme'), applied to <html data-theme> before first paint by
// lib/theme.ts, which main.tsx (panel and debug page) imports right after
// the crash guard.
const KEY = 'ytup-theme';
const html = () => document.documentElement;
// A fresh copy of the module: importing it is what applies the stored theme.
const themeMod = async () => {
  vi.resetModules();
  return import('../lib/theme');
};
const toggleMod = () => import('../entrypoints/sidepanel/ThemeToggle');

beforeEach(() => {
  localStorage.clear();
  delete html().dataset.theme;
  setLang('en');
});
afterEach(async () => {
  cleanup();
  (await import('../lib/theme')).disposeTheme();
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
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'light', storageArea: localStorage }));
    });
    expect(html().dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'x', storageArea: localStorage }));
    });
    expect(html().dataset.theme).toBe('light');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage })); // localStorage.clear() elsewhere
    });
    expect(html().dataset.theme).toBe('dark');
  });
  it('ignores sessionStorage events (a same-origin frame clearing its sessionStorage)', async () => {
    localStorage.setItem(KEY, 'light');
    await themeMod();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: sessionStorage }));
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'dark', storageArea: sessionStorage }));
    });
    expect(html().dataset.theme).toBe('light');
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
  const files = (dir: string): string[] =>
    readdirSync(join(__dirname, '..', dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []);
  it('panel, debug page and allow page import the theme right after the crash guard', () => {
    expect(src('entrypoints/sidepanel/main.tsx')).toMatch(/^(\/\/[^\n]*\n)*import \{[^}]*\} from '\.\/crash-guard';\nimport '@\/lib\/theme';[^\n]*\n/);
    for (const page of ['debug', 'allow']) {
      expect(src(`entrypoints/${page}/main.tsx`), page).toMatch(/^(\/\/[^\n]*\n)*import \{[^}]*\} from '\.\.\/sidepanel\/crash-guard';\nimport '@\/lib\/theme';[^\n]*\n/);
    }
  });
  it('components/ never import from an entrypoint (useTheme lives in lib/)', () => {
    const bad = files('components').filter((f) => /from '(@\/|(\.\.\/)+)entrypoints\//.test(src(f)));
    expect(bad).toEqual([]);
  });
  // The entry <script type="module"> is render-blocking, so a stored light theme is set before
  // Chrome paints the empty page with the dark defaults. Vite rewrites the entry tag and drops
  // the attribute from index.html, so a plugin in wxt.config.ts puts it on the built tag.
  // 30 s: importing wxt.config loads WXT and Vite, which took over the default 5 s on a busy machine.
  it('the built panel, debug page and allow page entry scripts are render-blocking', { timeout: 30_000 }, async () => {
    const { renderBlocking } = await import('../wxt.config');
    const { handler } = renderBlocking().transformIndexHtml as { handler: (html: string, ctx: { filename: string }) => string };
    const built = '<head>\n    <script type="module" crossorigin src="/chunks/sidepanel-x.js"></script>\n    <link rel="modulepreload" crossorigin href="/chunks/a.js">\n</head>';
    for (const page of ['sidepanel', 'debug', 'allow']) {
      expect(handler(built, { filename: `/x/entrypoints/${page}/index.html` })).toContain('<script type="module" blocking="render" crossorigin src="/chunks/sidepanel-x.js"></script>');
    }
    expect(handler(built, { filename: '/x/entrypoints/file-bridge/index.html' })).toBe(built);
  });
  const css = () => src('entrypoints/sidepanel/style.css');
  const block = (sel: RegExp) => Object.fromEntries([...(css().match(sel)?.[1] ?? '').matchAll(/^\s*([\w-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2]!.trim()]));
  const LIGHT = /:root\[data-theme='light'\]\s*\{([^}]*)\}/;
  const DARK = /:root\s*\{([^}]*)\}/;
  it("the stylesheet has a light palette (the userscript's tokens) next to the dark one", () => {
    // The userscript's values, except --fg3, --ok, --warn and --err: one step darker so 12px text
    // clears 4.5:1 on white and on --surface (style.css says why).
    expect(block(LIGHT)).toMatchObject({
      'color-scheme': 'light', '--bg': '#ffffff', '--surface': '#f7f7f9', '--surface2': '#efeff3', '--line': '#e4e4ea', '--line2': '#d6d6de', '--fg': '#111114',
      '--fg2': '#5d5d6b', '--fg3': '#6e6e7a', '--ok': '#15803d', '--warn': '#b45309', '--err': '#b91c1c', '--info': '#2563eb', '--muted': '#9a9aa6', '--popover': '#ffffff',
      '--raised-shadow': '0 24px 60px -12px rgba(15, 15, 25, 0.28), 0 2px 6px rgba(15, 15, 25, 0.06)', // the userscript's light --shadow
    });
  });
  // WCAG contrast of two colours; `over` is a translucent layer of `fg` on `bg` (bg-err/[0.08]).
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const over = (fg: number[], bg: number[], alpha: number) => fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha));
  it('light error text clears 4.5:1 at 12px: on the page, the surfaces, its own tinted box and the log', () => {
    const t = block(LIGHT);
    const err = rgb(t['--err']!);
    const bg = rgb(t['--bg']!);
    for (const on of [bg, rgb(t['--surface']!), rgb(t['--surface2']!), over(err, bg, 0.08), over(err, bg, 0.09), over(rgb(t['--tint']!), bg, 0.05)]) {
      expect(ratio(err, on)).toBeGreaterThanOrEqual(4.5);
    }
    // the danger button: its label on --err, and a hover that still differs from it
    expect(ratio(rgb(t['--on-err']!), err)).toBeGreaterThanOrEqual(4.5);
    expect(t['--err-hover']).not.toBe(t['--err']);
    expect(ratio(rgb(t['--on-err']!), rgb(t['--err-hover']!))).toBeGreaterThanOrEqual(4.5);
  });
  // Dark is the default and the drawer's look: every token pinned, so an edit to :root that
  // changes dark fails here instead of going unnoticed.
  it('the dark palette is unchanged', () => {
    expect(block(DARK)).toEqual({
      'color-scheme': 'dark', '--bg': '#0c0c0e', '--surface': 'rgba(255, 255, 255, 0.05)', '--surface2': 'rgba(255, 255, 255, 0.09)',
      '--line': 'rgba(255, 255, 255, 0.09)', '--line2': 'rgba(255, 255, 255, 0.16)', '--fg': '#f4f4f5', '--fg2': '#bcbcc4', '--fg3': '#8a8a94',
      '--ok': '#4ade80', '--warn': '#fbbf24', '--err': '#f87171', '--info': '#93c5fd', '--muted': '#66666e', '--popover': '#151517',
      '--tint': '#ffffff', '--on-fg': '#0b0b0c', '--on-fg2': '#55555c', '--fg-hover': '#ffffff', '--fg-active': '#d8d8dc', '--on-err': '#0b0b0c',
      '--err-hover': '#fca5a5', '--raised': '#0f0f12', '--raised-line': 'rgba(255, 255, 255, 0.12)',
      '--raised-shadow': '0 30px 80px -20px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
    });
  });
  it('the dialog takes its shadow from the theme', () => {
    expect(src('components/ui/dialog.tsx')).toContain('shadow-(--raised-shadow)');
  });
  // A colour written into a component assumes one theme (white text, white washes, a dark
  // hex): each is a token in style.css instead. Allowed, with the reason:
  const ALLOWED = [
    'bg-black/30', // the dialog's overlay dims whatever is behind it, in either theme
    'bg-black/75 px-1 text-xs text-white', // the duration on a video thumbnail, as YouTube shows it
    'bg-black/80 px-1 text-xs text-white', // the same badge in the Presets tab's YouTube preview
  ];
  // CSS named colours (CSS Color 4), for inline styles and arbitrary Tailwind values.
  const NAMED = ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue '
    + 'chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki '
    + 'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise '
    + 'darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod '
    + 'gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue '
    + 'lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray '
    + 'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple '
    + 'mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite '
    + 'navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink '
    + 'plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue '
    + 'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen')
    .split(' ').join('|');
  // Tailwind's palettes (v4, with 4.2's mauve, olive, mist and taupe) and every utility that takes a colour.
  const PALETTE = 'slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
  const UTIL = 'bg|text-shadow|text|border(?:-[xytrblse])?|inset-ring|ring-offset|ring|inset-shadow|drop-shadow|shadow|outline|fill|stroke|from|via|to|divide|caret|accent|decoration|placeholder';
  const COLOURS = [
    // a palette colour, white or black as a utility, with any variant or ! in front
    new RegExp(`(?:^|[\\s'"\`:!])(?:${UTIL})-(?:white|black|(?:${PALETTE})-\\d{2,3})\\b`, 'g'),
    // a named colour as an arbitrary value: bg-[white], text-[color:red]
    new RegExp(`-\\[(?:color:)?(?:${NAMED})\\]`, 'gi'),
    // a named colour in an inline style or CSS text: { color: 'white' }, background-color: red
    new RegExp(`\\b(?:color|background(?:-?color)?|border(?:-?(?:top|right|bottom|left))?(?:-?color)?|outline(?:-?color)?|fill|stroke|(?:box|text)-?shadow|caret-?color|accent-?color|text-?decoration-?color)\\s*:\\s*['"\`]?[^'"\`;}\\n]*?\\b(?:${NAMED})\\b`, 'gi'),
    /#[0-9a-fA-F]{3,8}\b/g, // hex
    /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g, // colour functions
  ];
  const colours = (line: string) => COLOURS.flatMap((re) => [...line.matchAll(re)].map((m) => m[0].trim()));
  it('the scan catches each kind of literal colour, and not the tokens', () => {
    for (const bad of ['text-zinc-400', 'bg-red-500/50', 'hover:divide-white', 'caret-black', 'accent-sky-600', 'decoration-rose-300', 'via-white',
      'border-x-gray-200', 'ring-offset-black', 'placeholder:text-neutral-500', '!text-white', '[&_svg]:fill-black', 'text-shadow-black', 'bg-[color:white]', 'bg-[white]',
      "style={{ color: 'white' }}", 'style={{ backgroundColor: "rebeccapurple" }}', "{ border: '1px solid red' }", 'style="background-color: black"',
      '#fff', 'rgba(0,0,0,.5)', 'hsl(0 0% 100%)', 'hsla(0,0%,0%,.1)', 'oklch(0.7 0.1 200)', 'oklab(1 0 0)']) {
      expect(colours(`<div className="x" ${bad} />`), bad).not.toEqual([]);
    }
    for (const ok of ['text-fg3', 'bg-tint/[0.08]', 'border-raised-line', "style={{ background: 'var(--raised)', border: '1px solid var(--raised-line)' }}",
      'text-xs', 'bg-warn/10', 'shadow-(--raised-shadow)', 'label(x)', 'bg-surface2', "color: 'inherit'", 'text-redact']) {
      expect(colours(`<div className="x" ${ok} />`), ok).toEqual([]);
    }
  });
  it('the panel, debug page and allow page components use colour tokens, not colours that assume dark', () => {
    const found: string[] = [];
    // crash-kit.ts is the plain-DOM fallback (inline styles, no stylesheet): tested on its own below.
    for (const f of [...files('components'), ...files('entrypoints/sidepanel'), ...files('entrypoints/debug'), ...files('entrypoints/allow')].filter((f) => !f.endsWith('crash-kit.ts'))) {
      let text = src(f);
      for (const a of ALLOWED) text = text.replaceAll(a, '');
      text.split('\n').forEach((line, i) => {
        if (line.trim().startsWith('//')) return;
        for (const c of colours(line)) found.push(`${f}:${i + 1} ${c}`);
      });
    }
    expect(found).toEqual([]);
  });
});
