// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const handlers = vi.hoisted(() => new Map<string, (m: unknown) => void>());
vi.mock('../lib/messages', async (orig) => ({
  ...(await orig<object>()),
  sendMessage: vi.fn(async () => ({ items: [] })),
  onMessage: (type: string, fn: (m: unknown) => void) => { handlers.set(type, fn); return () => {}; },
}));

import { sendMessage } from '../lib/messages';
import { PanelProvider, usePanel } from '../entrypoints/sidepanel/panel';
import { Banners } from '../entrypoints/sidepanel/shell/Banners';

const studio = (id: number, windowId: number) => ({ id, windowId, url: 'https://studio.youtube.com/channel/UC1', title: `T${id}`, active: true });
let tabs: Record<number, ReturnType<typeof studio> | undefined>;

function Probe() {
  const p = usePanel();
  return <div data-testid="p">{`${p.target?.tabId ?? '-'}|${p.runner?.tabId ?? '-'}|${p.elsewhere}`}</div>;
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(async () => {
  fakeBrowser.reset();
  tabs = { 3: studio(3, 1), 9: studio(9, 2) };
  vi.spyOn(browser.windows, 'getCurrent').mockResolvedValue({ id: 1 } as never);
  vi.spyOn(browser.tabs, 'query').mockImplementation((async () => [tabs[3]]) as never);
  vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) => { if (!tabs[id]) throw new Error('No tab'); return tabs[id]; }) as never);
  await browser.storage.session.set({ runnerTabId: 9 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('runner elsewhere', () => {
  it('clears when the runner tab navigates away from Studio, or is closed', async () => {
    render(<PanelProvider><Probe /></PanelProvider>);
    await flush();
    expect(screen.getByTestId('p').textContent).toBe('3|9|true');
    tabs[9] = { ...studio(9, 2), url: 'https://www.youtube.com/' };
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(9, { url: 'https://www.youtube.com/' }, tabs[9] as never); });
    await flush();
    expect(screen.getByTestId('p').textContent).toBe('3|-|false');
  });

  it('clears when the runner tab is removed', async () => {
    render(<PanelProvider><Probe /></PanelProvider>);
    await flush();
    tabs[9] = undefined;
    await act(async () => { await fakeBrowser.tabs.onRemoved.trigger(9, { windowId: 2, isWindowClosing: false }); });
    await flush();
    expect(screen.getByTestId('p').textContent).toBe('3|-|false');
  });

  it('ignores an out-of-order runnerTab() answer', async () => {
    render(<PanelProvider><Probe /></PanelProvider>);
    await flush();
    expect(screen.getByTestId('p').textContent).toBe('3|9|true');
    const old = tabs[9];
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    vi.spyOn(browser.tabs, 'get').mockImplementationOnce((async () => { await slow; return old; }) as never); // first check: slow, sees the old tab
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(9, { url: 'https://studio.youtube.com/x' }, tabs[9] as never); });
    tabs[9] = undefined; // the runner is gone before the second (fast) check
    await act(async () => { await fakeBrowser.tabs.onRemoved.trigger(9, { windowId: 2, isWindowClosing: false }); });
    await flush();
    expect(screen.getByTestId('p').textContent).toBe('3|-|false');
    release();
    await flush();
    expect(screen.getByTestId('p').textContent).toBe('3|-|false');
  });

  it('"Go to that tab" on a missing tab clears the banner', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PanelProvider><Banners /></PanelProvider>);
    await flush();
    vi.spyOn(browser.tabs, 'update').mockRejectedValue(new Error('No tab with id: 9'));
    tabs[9] = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Go to that tab' }));
    await flush();
    expect(err).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Go to that tab' })).toBeNull();
  });
});

describe('the "reload this tab" banner', () => {
  it('a reload whose first broadcast looks like the old page\'s still re-checks the tab', async () => {
    const now = vi.spyOn(Date, 'now');
    let t = 1_000_000;
    now.mockImplementation(() => t);
    let up = true;
    vi.mocked(sendMessage).mockImplementation((async (type: string) => {
      if (type === 'queue:view' && !up) throw new Error('Could not establish connection. Receiving end does not exist.');
      return { items: [] };
    }) as never);
    function Link() { return <div data-testid="link">{usePanel().link}</div>; }
    render(<PanelProvider><Link /></PanelProvider>);
    await flush();
    const onState = handlers.get('queue:state')!;
    const s = { running: false, stopping: false, prog: null, rev: 0, channel: { id: 'UC1', name: 'Mine', avatar: '', handle: '', label: 'Mine', problem: '' } };
    await act(async () => onState({ data: s, sender: { tab: { id: 3 } } }));
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(screen.getByTestId('link').textContent).toBe('ok');
    // the tab reloads; its new script registers late, after the grace period
    up = false;
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'loading' }, tabs[3] as never); });
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'complete' }, tabs[3] as never); });
    t += 10_000;
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(screen.getByTestId('link').textContent).toBe('noScript');
    // the new script is up and broadcasts the same rev and channel as the old one
    up = true;
    await act(async () => onState({ data: s, sender: { tab: { id: 3 } } }));
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(screen.getByTestId('link').textContent).toBe('ok');
  });
});
