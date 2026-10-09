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

  it("Overview's Refresh asks the background again and shows the new answer; no Re-run migrations button", async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    const ping = vi.fn(async () => 5);
    render(<DebugPage ping={ping} files={files} />);
    await settle();
    expect(screen.queryByRole('button', { name: /Re-run migrations/ })).toBeNull();
    ping.mockClear();
    ping.mockRejectedValueOnce(new Error('gone'));
    await act(async () => fireEvent.click(within(section('Overview')).getByRole('button', { name: 'Refresh' })));
    await settle();
    expect(ping).toHaveBeenCalledTimes(1);
    expect(section('Overview').textContent).toContain('no answer: Error: gone');
  });

  it('a repeated entry shows once with ×N', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    await browser.storage.local.set({ [DEBUG_LOG_KEY]: [{ t: 1, ctx: 'studio', level: 'error', msg: 'storm', count: 42 }, { t: 2, ctx: 'panel', level: 'warn', msg: 'once' }] });
    render(<DebugPage ping={async () => 5} files={files} />);
    await settle();
    const items = [...section('Error log').querySelectorAll('li')].map((li) => li.textContent);
    expect(items[1]).toContain('×42');
    expect(items[0]).not.toContain('×');
  });

  it('an expanded stack stays with its entry when a newer entry arrives', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    const a = { t: 1, ctx: 'panel', level: 'error', msg: 'expanded one', stack: 'at expanded()' };
    const b = { t: 2, ctx: 'studio', level: 'error', msg: 'neighbour', stack: 'at neighbour()' };
    await browser.storage.local.set({ [DEBUG_LOG_KEY]: [a, b] });
    render(<DebugPage ping={async () => 5} files={files} />);
    await settle();
    const log = section('Error log');
    await act(async () => fireEvent.click(within(log).getByRole('button', { name: /expanded one/ })));
    expect([...log.querySelectorAll('pre')].map((p) => p.textContent)).toEqual(['at expanded()']);
    // the background logs something: every position shifts by one
    await act(async () => browser.storage.local.set({ [DEBUG_LOG_KEY]: [a, b, { t: 3, ctx: 'background', level: 'warn', msg: 'newer', stack: 'at newer()' }] }));
    await settle();
    expect(log.querySelectorAll('li').length).toBe(3);
    expect([...log.querySelectorAll('pre')].map((p) => p.textContent)).toEqual(['at expanded()']);
    expect(within(log).getByRole('button', { name: /expanded one/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('loading the page writes nothing', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ id: 1, title: 'S', url: 'https://studio.youtube.com/x' }] as never);
    await browser.storage.local.set({ schemaVersion: 5, presets: [], [DEBUG_LOG_KEY]: [{ t: 1, ctx: 'panel', level: 'error', msg: 'x' }] });
    await browser.storage.session.set({ runnerTabId: 1 });
    const writes = [
      vi.spyOn(browser.storage.local, 'set'), vi.spyOn(browser.storage.local, 'remove'), vi.spyOn(browser.storage.local, 'clear'),
      vi.spyOn(browser.storage.session, 'set'), vi.spyOn(browser.storage.session, 'remove'), vi.spyOn(browser.storage.session, 'clear'),
    ];
    render(<DebugPage ping={async () => 5} pingTab={async () => ({ items: [] })} files={files} />);
    await settle();
    expect(section('Stored data').textContent).toContain('presets');
    for (const w of writes) expect(w).not.toHaveBeenCalled();
  });

  it('a failing storage.session read leaves the stored keys listed', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    await browser.storage.local.set({ presets: [] });
    vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('session broke'));
    render(<DebugPage ping={async () => 5} files={files} />);
    await settle();
    const stored = section('Stored data');
    expect(stored.textContent).toContain('presets');
    expect(stored.textContent).toContain('session broke');
  });
});
