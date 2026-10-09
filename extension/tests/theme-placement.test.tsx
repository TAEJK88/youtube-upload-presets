// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DebugPage } from '../entrypoints/debug/DebugPage';
import { ChannelBar } from '../entrypoints/sidepanel/shell/ChannelBar';
import { setTheme } from '../entrypoints/sidepanel/theme';
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
