// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('../lib/messages', async (orig) => ({ ...(await orig<object>()), sendMessage: vi.fn(async () => ({ items: [] })), onMessage: vi.fn() }));

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
