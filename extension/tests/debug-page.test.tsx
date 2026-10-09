// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DebugPage } from '../entrypoints/debug/DebugPage';
import { DEBUG_LOG_KEY } from '../lib/debug-log';
import { setLang } from '../lib/i18n';

const files = { listIds: async () => [], getHandle: async () => undefined };
const section = (name: string) => screen.getByRole('heading', { name }).closest('section')!;
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  fakeBrowser.reset();
  setLang('en');
  vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ manifest_version: 3, name: 'x', version: '5.0.0', permissions: ['storage'] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('debug page', () => {
  it('every section loads on its own: a broken background and tabs API leave the rest', async () => {
    vi.spyOn(browser.tabs, 'query').mockRejectedValue(new Error('tabs broke'));
    await browser.storage.local.set({ schemaVersion: 4, presets: [{ id: 'a' }] });
    render(<DebugPage ping={() => Promise.reject(new Error('Receiving end does not exist'))} files={files} />);
    await settle();
    for (const h of ['Overview', 'Error log', 'Stored data', 'Studio tabs', 'Stored files', 'Actions']) expect(screen.getByRole('heading', { name: h })).toBeTruthy();
    expect(section('Overview').textContent).toContain('5.0.0');
    expect(section('Overview').textContent).toContain('no answer: Error: Receiving end does not exist');
    expect(within(section('Studio tabs')).getByRole('alert').textContent).toBe('This section failed: Error: tabs broke');
    expect(section('Stored data').textContent).toContain('presets');
    expect(section('Stored files').textContent).toContain('No stored files');
  });

  it('the log: newest first, filtered by context, stack on demand, live, and Clear log clears only the log', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    await browser.storage.local.set({
      presets: [],
      [DEBUG_LOG_KEY]: [
        { t: 1, ctx: 'panel', level: 'error', msg: 'first', stack: 'at first()' },
        { t: 2, ctx: 'studio', level: 'warn', msg: 'second' },
      ],
    });
    render(<DebugPage ping={async () => 5} files={files} />);
    await settle();
    const log = section('Error log');
    expect([...log.querySelectorAll('li')].map((li) => li.textContent)).toEqual([expect.stringContaining('second'), expect.stringContaining('first')]);
    await act(async () => fireEvent.change(within(log).getByRole('combobox', { name: 'Context' }), { target: { value: 'panel' } }));
    expect(log.querySelectorAll('li').length).toBe(1);
    await act(async () => fireEvent.click(within(log).getByRole('button', { name: /first/ })));
    expect(log.querySelector('pre')!.textContent).toBe('at first()');
    await act(async () => browser.storage.local.set({ [DEBUG_LOG_KEY]: [{ t: 3, ctx: 'panel', level: 'error', msg: 'third' }] }));
    await settle();
    expect(log.textContent).toContain('third');
    await act(async () => fireEvent.click(within(log).getByRole('button', { name: 'Clear log' })));
    await settle();
    expect(log.textContent).toContain('No entries');
    expect(await browser.storage.local.get(null)).toEqual({ presets: [] });
  });

  it('Copy diagnostic report copies every section and the log', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    await browser.storage.local.set({ [DEBUG_LOG_KEY]: [{ t: 1, ctx: 'background', level: 'error', msg: 'bg broke' }] });
    const write = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    render(<DebugPage ping={async () => 5} files={files} />);
    await settle();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic report' })));
    await settle();
    const report = JSON.parse(write.mock.calls[0]![0]);
    expect(Object.keys(report)).toEqual(['generatedAt', 'overview', 'storage', 'studioTabs', 'files', 'log']);
    expect(report.log[0].msg).toBe('bg broke');
    expect(screen.getByRole('status').textContent).toBe('Copied');
  });

  it('Re-run migrations sends ensureMigrated and shows the answer', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    const ping = vi.fn(async () => 5);
    render(<DebugPage ping={ping} files={files} />);
    await settle();
    ping.mockClear();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Re-run migrations (ensureMigrated)' })));
    await settle();
    expect(ping).toHaveBeenCalledTimes(1);
    expect(section('Actions').textContent).toContain('ensureMigrated → 5');
  });
});
