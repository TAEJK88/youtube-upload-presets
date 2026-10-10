// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
const handlers = vi.hoisted(() => new Map<string, (m: unknown) => void>());
vi.mock('../lib/messages', async (orig) => ({
  ...(await orig<object>()),
  sendMessage: vi.fn(async () => ({ items: [] })),
  onMessage: (type: string, fn: (m: unknown) => void) => { handlers.set(type, fn); return () => {}; },
}));

import { toast } from 'sonner';
import { setLang } from '../lib/i18n';
import { sendMessage } from '../lib/messages';
import { PanelProvider, useClaims, useLive, usePanel } from '../entrypoints/sidepanel/panel';
import type { ClaimsState } from '../lib/claims/types';
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

describe('the queue view follows storage', () => {
  const views = () => vi.mocked(sendMessage).mock.calls.filter((c) => c[0] === 'queue:view').length;
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 200)); });
  it('is asked for again when the song history changes (the cards\' "previously claimed" chips), not for other keys', async () => {
    render(<PanelProvider><Probe /></PanelProvider>);
    await settle();
    await settle(); // the bind's fetch, then the one the stored data pokes
    const before = views();
    await act(async () => { await browser.storage.local.set({ logOpen: true }); });
    await settle();
    expect(views()).toBe(before);
    await act(async () => { await browser.storage.local.set({ songHistory: { k: {} } }); });
    await settle();
    expect(views()).toBe(before + 1);
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

// The automation lock's jobs (D21): `elsewhere` is another tab running the queue,
// `busyElsewhere` another tab holding the lock for anything.
describe("the lock holder's jobs", () => {
  function Jobs() {
    const p = usePanel();
    const live = useLive();
    return <div data-testid="j">{`${p.elsewhere}|${p.busyElsewhere}|${live.liveState?.running ?? '-'}`}</div>;
  }
  const queueState = (running: boolean) => ({ running, stopping: false, prog: null, rev: 0, channel: { id: 'UC1', name: 'Mine', avatar: '', handle: '', label: 'Mine', problem: '' } });

  it('another tab doing copyright work only: busy, not running the queue, and its queue state is not the live one', async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    render(<PanelProvider><Jobs /></PanelProvider>);
    await flush();
    const onState = handlers.get('queue:state')!;
    await act(async () => onState({ data: queueState(true), sender: { tab: { id: 9 } } }));
    await act(async () => onState({ data: queueState(false), sender: { tab: { id: 3 } } }));
    await flush();
    expect(screen.getByTestId('j').textContent).toBe('false|true|false');
  });

  it('the bound tab holding the lock itself is neither', async () => {
    await browser.storage.session.set({ runnerTabId: 3, runnerJobs: ['queue', 'claims'] });
    render(<PanelProvider><Jobs /></PanelProvider>);
    await flush();
    expect(screen.getByTestId('j').textContent).toBe('false|false|-');
  });

  it('a change of jobs alone moves the banner: the queue run ends, the copyright work goes on', async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['queue', 'claims'] });
    render(<PanelProvider><Banners /></PanelProvider>);
    await flush();
    expect(screen.getByText('Another Studio tab is running the queue — change the queue there')).toBeTruthy();
    await act(async () => { await browser.storage.session.set({ runnerJobs: ['claims'] }); });
    await flush();
    expect(screen.queryByText('Another Studio tab is running the queue — change the queue there')).toBe(null);
    expect(screen.getByText('Another Studio tab is busy with copyright work — wait for it, or press Stop in the Copyright tab')).toBeTruthy();
  });
});

describe('a failing queue:view', () => {
  it('says so in the panel\'s language', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(sendMessage).mockImplementation((async (type: string) => {
      if (type === 'queue:view') throw new Error('boom');
      return { items: [] };
    }) as never);
    setLang('th');
    render(<PanelProvider><Probe /></PanelProvider>);
    await flush();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(toast).toHaveBeenCalledWith('อ่านคิวจากแท็บ Studio ไม่สำเร็จ (boom)');
    setLang('en');
    err.mockRestore();
  });
});

describe('files that need a re-grant', () => {
  function Grant() {
    const p = usePanel();
    return (
      <>
        <div data-testid="g">{`${p.lost.join(',')}|${p.grantRev}`}</div>
        <button onClick={() => p.setLost(['a', 'b'])}>lost</button>
        <button onClick={() => p.setLost([], true)}>granted</button>
      </>
    );
  }
  it('are shared with the whole panel; each re-grant moves grantRev', async () => {
    render(<PanelProvider><Grant /></PanelProvider>);
    await flush();
    expect(screen.getByTestId('g').textContent).toBe('|0');
    fireEvent.click(screen.getByText('lost'));
    expect(screen.getByTestId('g').textContent).toBe('a,b|0');
    fireEvent.click(screen.getByText('lost')); // the same ids: no change
    expect(screen.getByTestId('g').textContent).toBe('a,b|0');
    fireEvent.click(screen.getByText('granted'));
    expect(screen.getByTestId('g').textContent).toBe('|1');
    fireEvent.click(screen.getByText('granted')); // a re-grant that changed nothing still re-reads previews
    expect(screen.getByTestId('g').textContent).toBe('|2');
  });
});

// D24: the copyright state of the bound tab, and of the lock holder while it runs a copyright job.
describe('copyright state routing', () => {
  function ClaimsProbe() {
    const c = useClaims();
    return (
      <div>
        <div data-testid="c">{`${c.state?.channelName ?? '-'}|${c.live?.channelName ?? '-'}|${c.log.length}|${c.log[0]?.msg ?? '-'}`}</div>
        <div data-testid="s">{c.shown ? `${c.shown.view}#${c.shown.n}` : '-'}</div>
        <button onClick={() => c.addLog('from the panel', 'ok')}>add</button>
      </div>
    );
  }
  const STUDIO = 'https://studio.youtube.com/channel/UC1';
  const deliver = (type: string, data: unknown, tabId: number, url = STUDIO) =>
    act(async () => { handlers.get(type)!({ data, sender: { tab: { id: tabId, url }, url } }); });
  const cs = (name: string, busyRun = false) => ({ channelName: name, busyRun, status: { icon: '✓', kind: 'idle', title: 'Ready', detail: '' } }) as unknown as ClaimsState;
  const text = (id: string) => screen.getByTestId(id).textContent;

  it('the bound tab, and the lock holder while it runs a copyright job; other tabs ignored', async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : { items: [] })) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    await deliver('claims:state', cs('other'), 5);
    expect(text('c')).toBe('bound|bound|0|-');
    await deliver('claims:state', cs('holder', true), 9);
    expect(text('c')).toBe('bound|holder|0|-');
    for (let i = 0; i < 81; i++) await deliver('claims:log', { at: i, msg: 'line ' + i, type: '' }, 3);
    await deliver('claims:log', { at: 0, msg: 'ignored', type: '' }, 5);
    expect(text('c')).toBe('bound|holder|80|line 80');
    fireEvent.click(screen.getByText('add'));
    expect(text('c')).toBe('bound|holder|80|from the panel');
  });

  it("the holder's state is not the live one while it only runs the queue", async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['queue'] });
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : { items: [] })) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    await deliver('claims:state', cs('holder'), 9);
    expect(text('c')).toBe('bound|bound|0|-');
  });

  it('a list to open comes from the bound tab only', async () => {
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    await deliver('claims:show', 'claims', 9);
    expect(text('s')).toBe('-');
    await deliver('claims:show', 'claims', 3);
    await deliver('claims:show', 'ads', 3);
    expect(text('s')).toBe('ads#2');
  });

  it('messages from a tab that is not on Studio, or that are not what a Studio tab sends, are ignored', async () => {
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : { items: [] })) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    await deliver('claims:state', cs('forged'), 3, 'https://www.youtube.com/watch?v=x');
    await deliver('claims:log', { at: 1, msg: 'forged', type: '' }, 3, 'https://www.youtube.com/');
    await deliver('claims:show', 'claims', 3, 'https://evil.example/');
    for (const bad of [null, 'x', { at: 1, msg: 5, type: '' }, { at: 1, msg: 'x', type: {} }]) await deliver('claims:log', bad, 3);
    for (const bad of ['songs', 1, null]) await deliver('claims:show', bad, 3);
    await deliver('claims:state', null, 3);
    await deliver('claims:state', { ...cs('no status'), status: 'x' }, 3);
    expect(text('c')).toBe('bound|bound|0|-');
    expect(text('s')).toBe('-');
  });

  it('asks the bound tab for its state only once the tab is linked', async () => {
    let answer!: (v: unknown) => void;
    vi.mocked(sendMessage).mockImplementation(((type: string) =>
      (type === 'queue:view' ? new Promise((r) => { answer = r; }) : Promise.resolve(cs('bound')))) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    const asked = () => vi.mocked(sendMessage).mock.calls.filter(([t]) => t === 'claims:view').length;
    expect(asked()).toBe(0);
    await act(async () => { answer({ items: [] }); });
    await flush();
    expect(asked()).toBe(1);
    expect(text('c')).toBe('bound|bound|0|-');
  });

  it("a holder that let the lock go and took it again doesn't show its old state", async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : { items: [] })) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    await deliver('claims:state', cs('holder', true), 9);
    expect(text('c')).toBe('bound|holder|0|-');
    await act(async () => { await browser.storage.session.remove(['runnerTabId', 'runnerJobs']); });
    await flush();
    expect(text('c')).toBe('bound|bound|0|-');
    await act(async () => { await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] }); });
    await flush();
    expect(text('c')).toBe('bound|bound|0|-'); // until it broadcasts again
  });
});
