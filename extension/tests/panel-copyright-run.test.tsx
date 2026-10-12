// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { App } from '../entrypoints/sidepanel/App';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { ClaimsContext, PanelContext } from '../entrypoints/sidepanel/panel';
import { CopyrightTab } from '../entrypoints/sidepanel/tabs/CopyrightTab';
import type { ClaimsState } from '../lib/claims/types';
import type { LinkStatus } from '../lib/panel/view-sync';
import * as messages from '../lib/messages';
import { claimsStateWith, fakeClaims, fakePanel, renderPanel } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));

const row = { videoId: 'v1', video: 'Mix 1', privacy: 'public', length: 600, claimId: 'c1', song: 'Song', artists: '', label: '', claimant: 'Co', type: '', status: '',
  impact: 'blocked', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: 'trim', own: false, hasImpact: true, publishAt: 0 };
const scan = { date: '2026-10-01T00:00:00Z', total: 1, channel: 'UC1', channelName: 'Mine', rows: [row] };
const counts = { hasScan: true, scanDate: '', claims: 1, claimVideos: 1, songs: 0, hasAdsScan: false, adsTodo: 0 };
const trimming = claimsStateWith({ busyRun: true, status: { icon: '✂️', kind: 'busy', title: 'Trimming claim 1 of 2', detail: '' } });
const RELOAD = ['This tab is not connected to the extension yet — reload this tab', { id: 'not-connected' }] as const;
const deaf = () => fakePanel({ send: vi.fn(async () => { throw new Error('no receiver'); }) as never });
const ready = () => vi.waitFor(() => expect((screen.getByRole('button', { name: /Claim list/ }) as HTMLButtonElement).disabled).toBe(false));
beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Copyright tab, runs', () => {
  const openTrim = async (stored: Record<string, unknown> = {}, state: Partial<ClaimsState> = {}, api = fakePanel()) => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan, 'trimQueue:UC1': ['v1:c1'], ...stored });
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ state: claimsStateWith({ counts, ...state }) }));
    fireEvent.click(await screen.findByRole('button', { name: /Claim list \(1\)/ }));
    return api;
  };

  it('Trim selected asks first, then sends the picks to the tab', async () => {
    const api = await openTrim();
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    expect(await screen.findByText('Trim 1 claims in 1 videos?')).toBeTruthy();
    expect(screen.getByText(/totalling 0:30 using YouTube's "Trim out segment" tool/)).toBeTruthy();
    expect(screen.getByText(/Fully automatic: Save → "I acknowledge" → Confirm changes for every claim/)).toBeTruthy();
    expect(screen.queryByText(/your own music/)).toBe(null);
    expect(screen.queryByText(/Upload queue still has files/)).toBe(null);
    expect(screen.queryByText(/Studio is not set to English/)).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: 'Start trim' }));
    await vi.waitFor(() => expect(api.send).toHaveBeenCalledWith('claims:trim', ['v1:c1']));
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy(); // the list closed, as the modal did
  });

  // P5-ask-cancel: a trim cannot be undone, so the question opens on Cancel.
  it('the trim question opens with Cancel selected: Enter starts no trim', async () => {
    const api = await openTrim();
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    await screen.findByText('Trim 1 claims in 1 videos?');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.setup().keyboard('{Enter}');
    await vi.waitFor(() => expect(screen.queryByText('Trim 1 claims in 1 videos?')).toBe(null));
    expect(api.send).not.toHaveBeenCalledWith('claims:trim', expect.anything());
    expect(screen.getByRole('button', { name: '✂ Trim selected (1)' })).toBeTruthy(); // the list stays open
  });

  // On a short panel "Start trim" appears where "Trim selected" was: a double-click must not answer yes.
  it('a double-click on Trim selected does not start the trim: the question stays open', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const api = await openTrim();
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }), { detail: 1 });
    now += 150;
    fireEvent.click(await screen.findByRole('button', { name: 'Start trim' }), { detail: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('Trim 1 claims in 1 videos?')).toBeTruthy();
    expect(api.send).not.toHaveBeenCalledWith('claims:trim', expect.anything());
    now += 500;
    fireEvent.click(screen.getByRole('button', { name: 'Start trim' }), { detail: 1 });
    await vi.waitFor(() => expect(api.send).toHaveBeenCalledWith('claims:trim', ['v1:c1']));
  });

  it('a double-click on the Auto-pilot switch that lands on "Turn on" does not turn it on', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    fireEvent.click(await screen.findByRole('switch', { name: /Auto-pilot/ }), { detail: 1 });
    now += 150;
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }), { detail: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('Turn on Auto-pilot for channel Mine?')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('the question warns about your own music, a busy upload queue and Studio not in English, and says review mode', async () => {
    await openTrim({ 'claimScan:UC1': { ...scan, rows: [{ ...row, own: true }] }, cfg: { autoSaveTrim: false } }, { uploadBusy: true, english: false });
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    expect(await screen.findByText(/1 items are claims on your own music/)).toBeTruthy();
    expect(screen.getByText(/Upload queue still has files/)).toBeTruthy();
    expect(screen.getByText(/Studio is not set to English, buttons won't be found/)).toBeTruthy();
    expect(screen.getByText(/Review mode: you click Save and confirm each trim yourself/)).toBeTruthy();
  });

  it('Cancel sends nothing and leaves the list open', async () => {
    const api = await openTrim();
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByText('Trim 1 claims in 1 videos?')).toBe(null));
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.getByText(/Copyright claims — Mine/)).toBeTruthy();
  });

  // ask() answers null to a question another one replaced: only a pressed "Start trim" starts it.
  it('a trim question replaced by a newer one starts nothing', async () => {
    const api = await openTrim();
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    await screen.findByText('Trim 1 claims in 1 videos?');
    fireEvent.click(screen.getByRole('button', { name: '✂ Trim selected (1)', hidden: true })); // the first answers null
    await new Promise((r) => setTimeout(r, 0));
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.getByText(/Copyright claims — Mine/)).toBeTruthy(); // and the list stays
  });

  it('only the picks that are in the scan and not done are sent', async () => {
    vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    const api = await openTrim({
      'claimScan:UC1': { ...scan, rows: [row, { ...row, claimId: 'c2' }] },
      'trimQueue:UC1': ['v1:c1', 'v1:c2', 'old:claim'], // c2 is trimmed already; the last is from an older scan
      'trimResults:UC1': { 'v1:c2': { state: 'saved', msg: '', date: '' } },
    });
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start trim' }));
    await vi.waitFor(() => expect(api.send).toHaveBeenCalledWith('claims:trim', ['v1:c1']));
  });

  it('with nothing picked the button is off; a pick already trimmed is not counted', async () => {
    await openTrim({ 'trimQueue:UC1': [] });
    expect((await screen.findByRole('button', { name: '✂ Trim selected (0)' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never); // the list drops the done pick through the background
    await openTrim({ 'trimQueue:UC1': ['v1:c1'], 'trimResults:UC1': { 'v1:c1': { state: 'saved', msg: '', date: '' } } });
    expect((await screen.findByRole('button', { name: '✂ Trim selected (0)' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a trim the tab never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await openTrim({}, {}, deaf());
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start trim' }));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(...RELOAD));
  });

  it('Stop shows while a run is active elsewhere, and goes to the tab holding the lock', () => {
    const holder = vi.fn(async () => undefined);
    const api = fakePanel({ runner: { tabId: 9, windowId: 1, title: 'B', jobs: ['claims'] }, busyElsewhere: true, sendTo: vi.fn(() => holder) as never });
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ state: claimsStateWith(), live: trimming }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(api.sendTo).toHaveBeenCalledWith(9);
    expect(holder).toHaveBeenCalledWith('claims:stop', undefined);
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy(); // scans take no lock: this tab's Scan stays
  });

  it('a run in the bound tab: Stop goes to it; Scan, Ads off and the lists hide', () => {
    const api = fakePanel();
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ state: trimming }));
    for (const name of [/Scan claims/, /Ads off/, /Claim list/, /Claimed songs/, 'Collab']) expect(screen.queryByRole('button', { name })).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(api.send).toHaveBeenCalledWith('claims:stop', undefined);
  });

  it('Stop also shows while follow-up trims wait, beside Scan; not when nothing runs or waits', () => {
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ waiting: 2 }) }));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
    r.unmount();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    expect(screen.queryByRole('button', { name: 'Stop' })).toBe(null);
  });

  // The holder's tab is asked only while it runs a copyright job: a queue run elsewhere is not ours to stop.
  it('follow-ups waiting here while another tab runs the queue: Stop goes to this tab, never to the queue\'s', () => {
    const queueTab = vi.fn(async () => undefined);
    const api = fakePanel({ runner: { tabId: 9, windowId: 1, title: 'B', jobs: ['queue'] }, elsewhere: true, sendTo: vi.fn(() => queueTab) as never });
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ state: claimsStateWith({ waiting: 2 }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(api.send).toHaveBeenCalledWith('claims:stop', undefined);
    expect(queueTab).not.toHaveBeenCalled();
  });

  it('a Stop the tab never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel(<CopyrightTab />, deaf(), undefined, fakeClaims({ state: trimming }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(...RELOAD));
  });

  it('Auto-pilot on asks with the rules, then writes autopilot:<ch> and logs it', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    const claims = fakeClaims();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    const sw = await screen.findByRole('switch', { name: /Auto-pilot/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Off · scan and trim automatically on a schedule')).toBeTruthy();
    fireEvent.click(sw);
    expect(await screen.findByText('Turn on Auto-pilot for channel Mine?')).toBeTruthy();
    expect(screen.getByText('Every 6 hours: rescan this channel')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('claims:op', { op: 'set', key: 'autopilot:UC1', value: { on: true, next: 0 } }));
    await vi.waitFor(() => expect(claims.addLog).toHaveBeenCalledWith('🤖 Auto-pilot turned on for Mine', 'ok'));
  });

  it('the Auto-pilot question opens with Cancel selected: Enter does not turn it on', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    const claims = fakeClaims();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    fireEvent.click(await screen.findByRole('switch', { name: /Auto-pilot/ }));
    await screen.findByText('Turn on Auto-pilot for channel Mine?');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.setup().keyboard('{Enter}');
    await vi.waitFor(() => expect(screen.queryByText('Turn on Auto-pilot for channel Mine?')).toBe(null));
    expect(send).not.toHaveBeenCalled();
    expect(claims.addLog).not.toHaveBeenCalled();
  });

  it('Auto-pilot: Cancel writes nothing; off needs no question', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    fireEvent.click(await screen.findByRole('switch', { name: /Auto-pilot/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByText('Turn on Auto-pilot for channel Mine?')).toBe(null));
    expect(send).not.toHaveBeenCalled();
    r.unmount();
    await fakeBrowser.storage.local.set({ 'autopilot:UC1': { on: true, next: 5 }, cfg: { apEveryHours: '12' } });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    const sw = await screen.findByRole('switch', { name: /Auto-pilot/ });
    await vi.waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByText('On · scan + trim every 12 h')).toBeTruthy();
    fireEvent.click(sw);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('claims:op', { op: 'set', key: 'autopilot:UC1', value: { on: false, next: 0 } }));
    await vi.waitFor(() => expect(claims.addLog).toHaveBeenCalledWith('🤖 Auto-pilot turned off for Mine', 'ok'));
  });

  it('an Auto-pilot question replaced by a newer one writes nothing', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    const claims = fakeClaims();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    fireEvent.click(await screen.findByRole('switch', { name: /Auto-pilot/ }));
    await screen.findByText('Turn on Auto-pilot for channel Mine?');
    fireEvent.click(screen.getByRole('switch', { name: /Auto-pilot/, hidden: true })); // the first answers null
    await new Promise((r) => setTimeout(r, 0));
    expect(send).not.toHaveBeenCalled();
    expect(claims.addLog).not.toHaveBeenCalled();
  });

  it('an Auto-pilot switch the background never got says so, and logs nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(messages, 'sendMessage').mockRejectedValue(new Error('gone'));
    const claims = fakeClaims();
    await fakeBrowser.storage.local.set({ 'autopilot:UC1': { on: true, next: 5 } });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    const sw = await screen.findByRole('switch', { name: /Auto-pilot/ });
    await vi.waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(sw);
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't save (gone)", { id: 'save-failed' }));
    expect(claims.addLog).not.toHaveBeenCalled();
  });

  it("the Auto-pilot switch is off limits while the tab's channel is 'unknown'", async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ channel: 'unknown' }) }));
    const sw = (await screen.findByRole('switch', { name: /Auto-pilot/ })) as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    fireEvent.click(sw);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Turn on Auto-pilot/)).toBe(null);
    expect(send).not.toHaveBeenCalled();
  });

  it('with no Studio tab bound there is no Auto-pilot switch', () => {
    renderPanel(<CopyrightTab />, fakePanel({ target: null, link: 'noTab' }), undefined, fakeClaims({ state: null, live: null }));
    expect(screen.queryByRole('switch')).toBe(null);
  });
});

describe('Copyright tab, the home buttons of the Ads, Collab and settings views', () => {
  // The views themselves are units H and J: here only that each button opens its view.
  for (const [what, label, withList, key, title] of [
    ['ads', 'Ads off', 'Ads off (3)', 'adsScan:UC1', /Videos with ads off — Mine/],
    ['collab', 'Collab', 'Collab', 'collabScan:UC1', /Collab — Mine/],
  ] as const) {
    it(`${label} with no list scans first; with a list it opens it, and Close gives the button its focus back`, async () => {
      const api = fakePanel();
      const r = renderPanel(<CopyrightTab />, api, undefined, fakeClaims());
      await ready();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(api.send).toHaveBeenCalledWith('claims:scan', what);
      expect(screen.queryByRole('heading', { level: 3 })).toBe(null);
      r.unmount();
      await fakeBrowser.storage.local.set({ [key]: { date: '2026-01-01', total: 3, rows: [] } });
      const api2 = fakePanel();
      renderPanel(<CopyrightTab />, api2, undefined, fakeClaims({ state: claimsStateWith({ counts: { ...counts, hasAdsScan: true, adsTodo: 3 } }) }));
      await ready();
      fireEvent.click(screen.getByRole('button', { name: withList }));
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(api2.send).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: withList }));
    });
  }

  it('an ads or Collab scan the tab never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel(<CopyrightTab />, deaf(), undefined, fakeClaims());
    await ready();
    for (const name of ['Ads off', 'Collab']) {
      vi.mocked(toast).mockClear();
      fireEvent.click(screen.getByRole('button', { name }));
      await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(...RELOAD));
    }
  });

  it('Copyright settings opens its view; Close goes back and gives the button its focus back (K review m3)', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Copyright settings' }));
    expect(screen.getByRole('heading', { name: 'Copyright settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { level: 3 })).toBe(null);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copyright settings' }));
  });

  it('with no Studio tab the three buttons are off', () => {
    renderPanel(<CopyrightTab />, fakePanel({ target: null, link: 'noTab' }), undefined, fakeClaims({ state: null, live: null }));
    for (const name of ['Ads off', 'Collab', 'Copyright settings']) expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// A trim, ads or Collab step loads a new page each time: the bound tab's state is null for a moment,
// or says 'unknown' before ytcfg is there (4a T8 review R3, 4a re-review R1 and (a)).
describe('Copyright tab, an open view through a page load of the bound tab', () => {
  const tabView = (state: ClaimsState | null, tabId: number | null = 1, link: LinkStatus = 'ok') => (
    <PanelContext.Provider value={fakePanel({ link, target: tabId === null ? null : { tabId, windowId: 1, url: 'https://studio.youtube.com/', title: 'Studio' } })}>
      <ClaimsContext.Provider value={fakeClaims({ state, live: state })}>
        <AskProvider><CopyrightTab /></AskProvider>
      </ClaimsContext.Provider>
    </PanelContext.Provider>
  );
  const on = (channel: string) => claimsStateWith({ channel, counts });
  const openList = async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan, 'claimScan:UC2': { ...scan, channel: 'UC2', channelName: 'Other' } });
    const r = render(tabView(on('UC1')));
    fireEvent.click(await screen.findByRole('button', { name: /Claim list \(1\)/ }));
    expect(await screen.findByText(/Copyright claims — Mine/)).toBeTruthy();
    return r;
  };

  it("state null then back on the same channel (a trim step's page load): the view is still open, and stayed rendered", async () => {
    const { rerender } = await openList();
    const list = screen.getByText('Mix 1');
    rerender(tabView(null)); // the new page hasn't answered yet
    expect(screen.getByText(/Copyright claims — Mine/)).toBeTruthy();
    rerender(tabView(on('UC1')));
    expect(screen.getByText(/Copyright claims — Mine/)).toBeTruthy();
    expect(screen.getByText('Mix 1')).toBe(list); // never unmounted: a pasted tracklist would have survived
  });

  it("a passing 'unknown' changes nothing either", async () => {
    const { rerender } = await openList();
    const list = screen.getByText('Mix 1');
    rerender(tabView(on('unknown')));
    expect(screen.getByText(/Copyright claims — Mine/)).toBeTruthy();
    rerender(tabView(on('UC1')));
    expect(screen.getByText('Mix 1')).toBe(list);
  });

  it('a different real channel closes the view; so does another bound tab, and no bound tab', async () => {
    const { rerender } = await openList();
    rerender(tabView(on('UC2')));
    expect(await screen.findByRole('button', { name: /Scan claims/ })).toBeTruthy(); // back home: another channel's
    expect(screen.queryByText(/Copyright claims/)).toBe(null);
    cleanup();
    const again = await openList();
    again.rerender(tabView(null, 2)); // the panel is bound to another tab, which hasn't answered
    expect(screen.queryByText(/Copyright claims — Mine/)).toBe(null);
    again.rerender(tabView(on('UC1'), 2)); // …and when it does, on the same channel, the list is not reopened
    await ready();
    expect(screen.queryByText(/Copyright claims — Mine/)).toBe(null);
    cleanup();
    const third = await openList();
    third.rerender(tabView(null, null));
    expect(screen.queryByText(/Copyright claims — Mine/)).toBe(null);
    expect((screen.getByRole('button', { name: /Scan claims/ }) as HTMLButtonElement).disabled).toBe(true); // nothing kept from the old tab
  });

  it('on the tab itself, the card and the counts stay through the load', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    const { rerender } = render(tabView(on('UC1')));
    await ready();
    rerender(tabView(null));
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claim list (1)' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Auto-pilot/ })).toBeTruthy();
    // the counts a page gives before it knows its channel are nobody's
    rerender(tabView(claimsStateWith({ channel: 'unknown', counts: { ...counts, claims: 7 } })));
    expect(screen.getByRole('button', { name: 'Claim list (1)' })).toBeTruthy();
  });

  // The link says 'noScript' for a moment in a slow page load, and for good after the extension was
  // reloaded: the panel can't tell which. The channel, its data and an open view are kept; the
  // tab's card and buttons are not what a page that is gone last said (4a m1; 4b Q review m1).
  it('a tab without its script: no card of the old page, Scan there and off; an open view stays', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    const busy = claimsStateWith({ counts, busyScan: true, status: { icon: '🔍', kind: 'busy', title: 'Scanning 27%', detail: '' } });
    const { rerender } = render(tabView(busy));
    expect(screen.getByText('Scanning 27%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null);
    rerender(tabView(null, 1, 'noScript'));
    expect(screen.queryByText('Scanning 27%')).toBe(null);
    expect((screen.getByRole('button', { name: /Scan claims/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Stop' })).toBe(null);
    rerender(tabView(busy)); // the page answered after all
    expect(screen.getByText('Scanning 27%')).toBeTruthy();
    cleanup();
    const list = await openList();
    list.rerender(tabView(null, 1, 'noScript'));
    expect(screen.getByText(/Copyright claims — Mine/)).toBeTruthy();
  });
});

describe('the Copyright tab in the tab bar', () => {
  const tab = () => screen.getByRole('tab', { name: /Copyright/ });
  const dot = () => !!tab().querySelector('[data-run]');
  it('shows ● while a copyright run is active, here or in the tab holding the lock (tabCount.claims, 6255)', () => {
    const r = renderPanel(<App />, fakePanel(), undefined, fakeClaims());
    expect(dot()).toBe(false);
    r.unmount();
    renderPanel(<App />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith(), live: trimming }));
    expect(dot()).toBe(true);
  });

  // The tab bar is four equal columns the label already fills: a dot in the row pushed the label out
  // of its pill at 320px. It sits in the corner instead, in the label's own colour (4b Q review I1).
  it('the mark takes no room in the tab\'s row and has the label\'s colour', () => {
    renderPanel(<App />, fakePanel(), undefined, fakeClaims({ state: trimming }));
    const mark = tab().querySelector('[data-run]')!;
    expect(mark.className.split(' ')).toEqual(expect.arrayContaining(['absolute', 'bg-current']));
    expect(mark.textContent).toBe('');
    expect(tab().className.split(' ')).toContain('relative');
  });
});
