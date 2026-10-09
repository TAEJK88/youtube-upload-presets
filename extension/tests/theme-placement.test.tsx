// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DebugPage } from '../entrypoints/debug/DebugPage';
import { ChannelBar } from '../entrypoints/sidepanel/shell/ChannelBar';
import { setTheme } from '../lib/theme';
import { setLang } from '../lib/i18n';
import { fakePanel, renderPanel } from './panel-fake';

// Where the theme toggle is: the panel's header (the channel bar's top row) and the debug
// page's title row. Its behaviour is in theme.test.tsx.
beforeEach(() => {
  fakeBrowser.reset();
  setLang('en');
  setTheme('dark');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setTheme('dark');
  localStorage.clear();
});

describe('theme toggle placement', () => {
  it("in the panel header, next to the channel bar's buttons", () => {
    renderPanel(<ChannelBar />, fakePanel());
    const b = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(b.parentElement).toBe(screen.getByRole('button', { name: /Lock channel/ }).parentElement);
    fireEvent.click(b);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
  });

  // At Chrome's narrowest panel (320px) the toggle left the channel name ~4px wide. Below 380px
  // of panel the lock pill shows only its icon: the bar is a size container ('@container') and
  // the label is sr-only under a container query ('@max-[344px]', the bar's content box: 380 -
  // 2 x 18px padding). happy-dom has no layout or container queries, so this pins the classes
  // and the structure, not the widths: that the label is the pill's only text, carries the
  // narrow-hide class, and still names the button. The widths were measured in Chrome (see
  // theme-toggle-fix-report.md); a rename of the class or a new visible child fails here.
  it('below ~380px of panel the lock pill is icon-only, and keeps its name and title', () => {
    const d = fakePanel().data!;
    const cases = [
      { lang: 'en' as const, lock: null, name: 'Lock channel' },
      { lang: 'th' as const, lock: null, name: 'ล็อกช่อง' },
      { lang: 'en' as const, lock: { id: 'UC1', name: 'Mine' }, name: 'Locked' },
      { lang: 'th' as const, lock: { id: 'UC1', name: 'Mine' }, name: 'ล็อกแล้ว' },
    ];
    for (const c of cases) {
      setLang(c.lang);
      renderPanel(<ChannelBar />, fakePanel({ data: { ...d, settings: { ...d.settings, lockChannel: c.lock } } }));
      const pill = screen.getByRole('button', { name: c.name });
      expect(pill.getAttribute('title')).toBeTruthy();
      expect(pill.parentElement!.classList.contains('@container')).toBe(true);
      const label = pill.querySelector('span')!;
      expect(label.textContent).toBe(c.name);
      expect(label.classList.contains('@max-[344px]:sr-only')).toBe(true);
      // nothing else in the pill is text: the icon alone stays visible
      const visible = [...pill.childNodes].filter((n) => n !== label && (n.textContent ?? '').trim());
      expect(visible).toEqual([]);
      cleanup();
    }
  });

  it("on the debug page, in the title's row", () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ manifest_version: 3, name: 'x', version: '5.0.0' });
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    render(<DebugPage ping={() => new Promise(() => {})} files={{ listIds: async () => [], getHandle: async () => undefined }} />);
    const b = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(b.parentElement).toBe(screen.getByRole('heading', { level: 1 }).parentElement);
    fireEvent.click(b);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('in Thai on the debug page too', () => {
    setLang('th');
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ manifest_version: 3, name: 'x', version: '5.0.0' });
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    render(<DebugPage ping={() => new Promise(() => {})} files={{ listIds: async () => [], getHandle: async () => undefined }} />);
    expect(screen.getByRole('button', { name: 'สลับเป็นธีมสว่าง' })).toBeTruthy();
  });
});
