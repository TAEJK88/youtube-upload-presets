// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
const handlers = vi.hoisted(() => new Map<string, (m: unknown) => void>());
vi.mock('../lib/messages', async (orig) => ({
  ...(await orig<object>()),
  sendMessage: vi.fn(async () => ({ items: [], proto: (await orig<typeof import('../lib/messages')>()).PROTOCOL })),
  onMessage: (type: string, fn: (m: unknown) => void) => { handlers.set(type, fn); return () => {}; },
}));

import { toast } from 'sonner';
import { setLang } from '../lib/i18n';
import { PROTOCOL, sendMessage } from '../lib/messages';
import { PanelProvider, useClaims, useLive, usePanel } from '../entrypoints/sidepanel/panel';
import type { ClaimsState } from '../lib/claims/types';
import { Banners } from '../entrypoints/sidepanel/shell/Banners';
import { QueueTab } from '../entrypoints/sidepanel/tabs/QueueTab';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { viewWith } from './panel-fake';

const studio = (id: number, windowId: number) => ({ id, windowId, url: 'https://studio.youtube.com/channel/UC1', title: `T${id}`, active: true });
let tabs: Record<number, ReturnType<typeof studio> | undefined>;

function Probe() {
  const p = usePanel();
  return <div data-testid="p">{`${p.target?.tabId ?? '-'}|${p.runner?.tabId ?? '-'}|${p.elsewhere}`}</div>;
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const VIEW = { items: [], proto: PROTOCOL }; // queue:view from a tab running this build

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
      return VIEW;
    }) as never);
    function Link() { return <div data-testid="link">{usePanel().link}</div>; }
    render(<PanelProvider><Link /></PanelProvider>);
    await flush();
    const onState = handlers.get('queue:state')!;
    const s = { proto: PROTOCOL, running: false, stopping: false, prog: null, rev: 0, channel: { id: 'UC1', name: 'Mine', avatar: '', handle: '', label: 'Mine', problem: '' } };
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
  const queueState = (running: boolean) => ({ proto: PROTOCOL, running, stopping: false, prog: null, rev: 0, channel: { id: 'UC1', name: 'Mine', avatar: '', handle: '', label: 'Mine', problem: '' } });

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
      return VIEW;
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
  const cs = (name: string, busyRun = false) => ({ channelName: name, busyRun, status: { icon: '✓', kind: 'idle', title: 'Ready', detail: '' }, counts: {}, proto: PROTOCOL }) as unknown as ClaimsState;
  const text = (id: string) => screen.getByTestId(id).textContent;

  it('the bound tab, and the lock holder while it runs a copyright job; other tabs ignored', async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : VIEW)) as never);
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
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : VIEW)) as never);
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
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : VIEW)) as never);
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
    await act(async () => { answer(VIEW); });
    await flush();
    expect(asked()).toBe(1);
    expect(text('c')).toBe('bound|bound|0|-');
  });

  // Final review m1: a scan's "Scanning… 27%" stayed on the card for good when the tab came back
  // without the extension's script.
  it('a bound tab that comes back without the script drops its state', async () => {
    let script = true;
    vi.mocked(sendMessage).mockImplementation((async (type: string) => {
      if (!script) throw new Error('Could not establish connection. Receiving end does not exist.');
      return type === 'claims:view' ? cs('scanning') : VIEW;
    }) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    expect(text('c')).toBe('scanning|scanning|0|-');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      script = false;
      await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'loading' }, tabs[3] as never); });
      await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'complete' }, tabs[3] as never); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(text('c')).toBe('scanning|scanning|0|-'); // still within the grace period: the page may be loading
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(text('c')).toBe('-|-|0|-');
    } finally {
      vi.useRealTimers();
    }
  });

  // Re-review R1: Chrome reports history.pushState as 'loading' with the new address, then
  // 'complete', with the same page and script. Dropping the state there blinked the card and
  // closed an open claim list or tracklist editor (CopyrightTab closes its view when the
  // channel goes away) on every click inside Studio.
  it("an in-page navigation of Studio keeps the bound tab's state throughout", async () => {
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : VIEW)) as never);
    const seen: string[] = [];
    function Seen() {
      seen.push(useClaims().state?.channelName ?? '-');
      return null;
    }
    render(<PanelProvider><ClaimsProbe /><Seen /></PanelProvider>);
    await flush();
    expect(text('c')).toBe('bound|bound|0|-');
    seen.length = 0;
    const url = 'https://studio.youtube.com/channel/UC1/analytics';
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'loading', url }, { ...tabs[3], url } as never); });
    await flush();
    await deliver('claims:state', cs('bound, later'), 3); // the page is still there and still reports
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'complete' }, { ...tabs[3], url } as never); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); }); // the view is asked 120 ms after the load
    expect(seen).not.toContain('-');
    expect(seen).toContain('bound, later');
  });

  it('a reload of the bound tab: the new page answers once it is linked', async () => {
    let page = 'scanning';
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs(page) : VIEW)) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    expect(text('c')).toBe('scanning|scanning|0|-');
    page = 'reloaded';
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'loading' }, tabs[3] as never); });
    await act(async () => { await fakeBrowser.tabs.onUpdated.trigger(3, { status: 'complete' }, tabs[3] as never); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(text('c')).toBe('reloaded|reloaded|0|-');
  });

  // 4b final review m2: the holder only broadcasts changes, and review mode waiting for the user's
  // Save changes nothing. On another channel that left the panel with no Stop.
  describe('the lock holder in another tab is asked for its state', () => {
    let holder: string;
    const perTab = () => vi.mocked(sendMessage).mockImplementation((async (type: string, _d: unknown, tabId: number) =>
      (type === 'claims:view' ? cs(tabId === 9 ? holder : 'bound', tabId === 9) : VIEW)) as never);
    const askedHolder = () => vi.mocked(sendMessage).mock.calls.filter(([t, , id]) => t === 'claims:view' && id === 9).length;
    beforeEach(() => { holder = 'holder'; vi.mocked(sendMessage).mockClear(); });

    it('while it does copyright work: known without waiting for a broadcast', async () => {
      await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
      perTab();
      render(<PanelProvider><ClaimsProbe /></PanelProvider>);
      await flush();
      expect(text('c')).toBe('bound|holder|0|-');
      expect(askedHolder()).toBe(1);
    });

    it('not while it only runs the queue, and not when it is the bound tab', async () => {
      await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['queue'] });
      perTab();
      render(<PanelProvider><ClaimsProbe /></PanelProvider>);
      await flush();
      expect(askedHolder()).toBe(0);
      expect(text('c')).toBe('bound|bound|0|-');
    });

    it('an answer that is not a copyright state (an older build) is not taken; a holder that does not answer is only logged', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
      vi.mocked(sendMessage).mockImplementation((async (type: string, _d: unknown, tabId: number) =>
        (type !== 'claims:view' ? VIEW : tabId === 9 ? { channelName: 'old holder' } : cs('bound'))) as never);
      render(<PanelProvider><ClaimsProbe /></PanelProvider>);
      await flush();
      expect(text('c')).toBe('bound|bound|0|-');
      cleanup();
      vi.mocked(sendMessage).mockImplementation((async (type: string, _d: unknown, tabId: number) => {
        if (type !== 'claims:view') return VIEW;
        if (tabId === 9) throw new Error('No response');
        return cs('bound');
      }) as never);
      render(<PanelProvider><ClaimsProbe /></PanelProvider>);
      await flush();
      expect(text('c')).toBe('bound|bound|0|-');
      expect(err).toHaveBeenCalledWith('[ytup] claims:view failed', expect.any(Error));
    });

    it("a holder that let the lock go and took it again is asked again: its old state is not shown", async () => {
      await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
      perTab();
      render(<PanelProvider><ClaimsProbe /></PanelProvider>);
      await flush();
      expect(text('c')).toBe('bound|holder|0|-');
      await act(async () => { await browser.storage.session.remove(['runnerTabId', 'runnerJobs']); });
      await flush();
      expect(text('c')).toBe('bound|bound|0|-');
      holder = 'holder, next run';
      await act(async () => { await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] }); });
      await flush();
      expect(text('c')).toBe('bound|holder, next run|0|-');
    });
  });

  it("a holder that let the lock go and took it again doesn't show its old state", async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : VIEW)) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    await deliver('claims:state', cs('holder', true), 9);
    expect(text('c')).toBe('bound|holder|0|-');
    await act(async () => { await browser.storage.session.remove(['runnerTabId', 'runnerJobs']); });
    await flush();
    expect(text('c')).toBe('bound|bound|0|-');
    await act(async () => { await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] }); });
    await flush();
    expect(text('c')).toBe('bound|bound|0|-'); // what it answers now (here: the same as the bound tab), not 'holder'
  });
});

// 4b final review I2: the build folder was updated and the extension not reloaded, so a panel read
// from the new files talks to a tab still running the old content script. That tab answers, in its
// own shape; on the 4a build the Upload pane then crashed on a field the old view did not have.
describe('a tab running another build of the extension', () => {
  const RELOAD = 'This tab is not connected to the extension yet — reload this tab';
  const STUDIO = { tab: { id: 3, url: 'https://studio.youtube.com/channel/UC1' }, url: 'https://studio.youtube.com/channel/UC1' };
  const later = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.mocked(toast).mockClear(); });
  afterEach(() => vi.useRealTimers());

  it('its queue view (no proto) is not rendered: the "reload this tab" banner, no crash, no toast', async () => {
    const old = viewWith([{ title: 'From the old build' }]) as unknown as Record<string, unknown>;
    delete old.proto;
    for (const it of old.items as Record<string, unknown>[]) delete it.claimed; // the field 4a added (QueueCard read it.claimed.length)
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'queue:view' ? old : undefined)) as never);
    render(<PanelProvider><AskProvider><Banners /><QueueTab /></AskProvider></PanelProvider>);
    await later(3000);
    expect(screen.getByText(RELOAD)).toBeTruthy();
    expect(screen.queryByText('From the old build')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
    expect(vi.mocked(sendMessage).mock.calls.some(([t]) => t === 'claims:view')).toBe(false); // only asked of a linked tab
  });

  it('a view of this build is rendered', async () => {
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'queue:view' ? viewWith([{ title: 'From this build' }]) : undefined)) as never);
    render(<PanelProvider><AskProvider><Banners /><QueueTab /></AskProvider></PanelProvider>);
    await later(3000);
    expect(screen.queryByText(RELOAD)).toBeNull();
    expect(screen.getByText('From this build')).toBeTruthy();
  });

  it('its claims:view answer in another shape is not taken', async () => {
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? { channelName: 'old', status: 'Ready' } : VIEW)) as never);
    function C() { return <div data-testid="c">{useClaims().state?.channelName ?? '-'}</div>; }
    render(<PanelProvider><C /></PanelProvider>);
    await later(500);
    expect(vi.mocked(sendMessage).mock.calls.some(([t]) => t === 'claims:view')).toBe(true);
    expect(screen.getByTestId('c').textContent).toBe('-');
  });

  it('a copyright state without proto is not taken: pushed, answered by the bound tab, answered by the lock holder', async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    const old = (name: string) => ({ channelName: name, status: { icon: '✓', kind: 'idle', title: 'Ready', detail: '' }, counts: {} }); // as 4a and 4b sent it
    vi.mocked(sendMessage).mockClear();
    vi.mocked(sendMessage).mockImplementation((async (type: string, _d: unknown, tabId: number) => (type === 'claims:view' ? old(`answer ${tabId}`) : VIEW)) as never);
    function C() { const c = useClaims(); return <div data-testid="c">{`${c.state?.channelName ?? '-'}|${c.live?.channelName ?? '-'}`}</div>; }
    render(<PanelProvider><C /></PanelProvider>);
    await later(500);
    expect(vi.mocked(sendMessage).mock.calls.filter(([t]) => t === 'claims:view').map(([, , id]) => id).sort()).toEqual([3, 9]);
    await act(async () => {
      handlers.get('claims:state')!({ data: old('push 3'), sender: STUDIO });
      handlers.get('claims:state')!({ data: old('push 9'), sender: { ...STUDIO, tab: { ...STUDIO.tab, id: 9 } } });
    });
    expect(screen.getByTestId('c').textContent).toBe('-|-');
  });

  it('its broadcasts (queue:state without this proto, claims:state in another shape) are dropped', async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['queue', 'claims'] });
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'queue:view' ? VIEW : undefined)) as never);
    function P() { return <div data-testid="x">{`${useLive().liveState?.running ?? '-'}|${useClaims().live?.channelName ?? '-'}`}</div>; }
    render(<PanelProvider><P /></PanelProvider>);
    await later(500);
    const channel = { id: 'UC1', name: 'Mine', avatar: '', handle: '', label: 'Mine', problem: '' };
    const from9 = { ...STUDIO, tab: { ...STUDIO.tab, id: 9 } };
    await act(async () => {
      handlers.get('queue:state')!({ data: { running: true, stopping: false, prog: null, rev: 0, channel }, sender: from9 });
      handlers.get('queue:state')!({ data: { proto: PROTOCOL + 1, running: true, stopping: false, prog: null, rev: 0, channel }, sender: from9 });
      handlers.get('queue:state')!({ data: null, sender: from9 });
      handlers.get('claims:state')!({ data: { channelName: 'old', status: {}, counts: {} }, sender: from9 });
      handlers.get('claims:state')!({ data: { channelName: 'other', status: {}, counts: {}, proto: PROTOCOL + 1 }, sender: from9 });
      handlers.get('claims:state')!({ data: { channelName: 'no status', counts: {}, proto: PROTOCOL }, sender: from9 });
    });
    expect(screen.getByTestId('x').textContent).toBe('-|-');
    await act(async () => {
      handlers.get('queue:state')!({ data: { proto: PROTOCOL, running: true, stopping: false, prog: null, rev: 0, channel }, sender: from9 });
      handlers.get('claims:state')!({ data: { channelName: 'now', status: {}, counts: {}, proto: PROTOCOL }, sender: from9 });
    });
    expect(screen.getByTestId('x').textContent).toBe('true|now');
  });
});
