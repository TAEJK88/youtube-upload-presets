// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { ClaimsContext, LiveContext, PanelContext, type ClaimsApi } from '../entrypoints/sidepanel/panel';
import { PaneBoundary } from '../entrypoints/sidepanel/PaneBoundary';
import { CopyrightTab } from '../entrypoints/sidepanel/tabs/CopyrightTab';
import { COMPACT_FROM } from '../entrypoints/sidepanel/tabs/copyright/video-picks';
import { SONGS_CSV_MAX } from '../lib/claims/ops';
import { downloadCsv } from '../lib/panel/download';
import { claimsStateWith, fakeClaims, fakeLive, fakePanel, renderPanel } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RELOAD = 'This tab is not connected to the extension yet — reload this tab';
const counts = { hasScan: true, scanDate: '', claims: 4, claimVideos: 2, songs: 9, hasAdsScan: false, adsTodo: 0 };
const scanning = claimsStateWith({ busyScan: true,
  status: { icon: '🔍', kind: 'busy', title: "Scanning this channel's claims", detail: 'Reading claim details 1 / 3: Mix', progress: 1 / 3 } });

// The Tools tab's sub-tabs: one per tool (THAIB-1).
const tab = (name: RegExp | string) => screen.getByRole('tab', { name }) as HTMLButtonElement;
const pick = (name: RegExp | string) => fireEvent.mouseDown(tab(name));
const active = (name: RegExp | string) => tab(name).getAttribute('data-state') === 'active';
// The tool in sight: the innermost open panel (a Tools group, or Copyright's sub-tab inside it).
// The others stay mounted, hidden, and text queries see them.
const pane = () => within(screen.getAllByRole('tabpanel').at(-1)!);
// The tools other than Claims open once the channel's data is read (Songs is hidden while Ads off or Collab shows).
const ready = () => waitFor(() => expect((screen.getByRole('tab', { name: /Songs/, hidden: true }) as HTMLButtonElement).disabled).toBe(false));

describe('Tools tab', () => {
  it('shows the status card, Scan, the three groups and a sub-tab per Copyright tool, with counts', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts }) }));
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Copyright 4 claims', 'Ads off', 'Collab', 'Claim list (4)', 'Songs (9)', 'Fix tracklist', 'Options']);
    expect(active(/Copyright/)).toBe(true);
    expect(active('Claim list (4)')).toBe(true);
  });

  it('a job on the card names its group, and that group shows a dot', async () => {
    const ads = claimsStateWith({ busyRun: true, status: { icon: '💰', kind: 'busy', title: 'Turning on ads: video 1 of 2', detail: '' } });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: ads }));
    await ready();
    expect(screen.getByText('Turning on ads: video 1 of 2').nextElementSibling!.textContent).toBe('Ads off');
    const dots = screen.getAllByRole('tab').filter((t) => t.querySelector('[data-busy]')).map((t) => t.textContent);
    expect(dots).toEqual(['Ads off']);
  });

  it('nothing running: no group tag, no dot', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts }) }));
    await ready();
    expect(document.querySelector('[data-busy]')).toBe(null);
    expect(screen.getByText('Ready').nextElementSibling).toBe(null);
  });

  it('Copyright opens again on the tool it was left on', async () => {
    await fakeBrowser.storage.local.set({ 'adsScan:UC1': { date: '2026-01-01', total: 0, rows: [] } });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    pick(/Songs/);
    pick(/Ads off/);
    expect(active(/Ads off/)).toBe(true);
    expect(screen.queryByRole('tab', { name: /Songs/ })).toBe(null); // Copyright's bar hides with its group
    pick(/Copyright/);
    expect(active(/Songs/)).toBe(true);
  });

  it("Ads off's Change in Options opens Copyright → Options", async () => {
    await fakeBrowser.storage.local.set({ 'adsScan:UC1': { date: '2026-01-01', total: 0, rows: [] } });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    pick(/Ads off/);
    fireEvent.click(pane().getByRole('button', { name: 'Change in Options' }));
    expect(active(/Copyright/)).toBe(true);
    expect(active(/Options/)).toBe(true);
  });

  it('before a scan, Claims has no count', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    expect(tab('Claim list')).toBeTruthy();
    expect(tab('Songs (0)')).toBeTruthy();
  });

  it('Scan claims asks the bound tab', () => {
    const api = fakePanel();
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: /Scan claims/ }));
    expect(api.send).toHaveBeenCalledWith('claims:scan', 'claims');
  });

  it('a scan the tab never got says so once, through the shared helper (review m10)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ send: vi.fn(async () => { throw new Error('no receiver'); }) as never });
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: /Scan claims/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(RELOAD, { id: 'not-connected' }));
  });

  it('while scanning, Scan is disabled and the card shows the progress; the tools stay', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: scanning }));
    expect(screen.getByText('Reading claim details 1 / 3: Mix')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33');
    expect((screen.getByRole('button', { name: /Scan claims/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(tab(/tracklist/)).toBeTruthy();
  });

  // Scans take no lock (D26): the buttons follow the bound tab, the card follows the tab that works.
  it("another tab's copyright job shows in the card, but this tab's Scan stays, with this tab's counts", () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({
      state: claimsStateWith({ counts }), // this tab: idle
      live: claimsStateWith({ channel: 'UC2', busyRun: true, status: { icon: '✂️', kind: 'busy', title: 'Trimming claim 1 of 2', detail: '' } }),
    }));
    expect(screen.getByText('Trimming claim 1 of 2')).toBeTruthy();
    expect(screen.queryByText('Ready')).toBe(null);
    expect((screen.getByRole('button', { name: /Scan claims/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(tab('Claim list (4)')).toBeTruthy();
  });

  it('another tab holding the lock, idle: this tab\'s counts, not that tab\'s', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts }), live: claimsStateWith({ counts: { ...counts, claims: 7, songs: 1 } }) }));
    expect(tab('Claim list (4)')).toBeTruthy();
    expect(tab('Songs (9)')).toBeTruthy();
  });

  it('the card says its kind: the icon and the edge take the kind\'s colour', () => {
    const card = (kind: string, icon = '⚠') => {
      cleanup();
      renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ status: { icon, kind, title: 'Card', detail: 'More' } }) }));
      const title = screen.getByText('Card');
      return { icon: title.previousElementSibling!.className, box: title.parentElement!.parentElement!, detail: screen.getByText('More').className };
    };
    for (const [kind, tone] of [['err', 'err'], ['busy', 'info'], ['wait', 'warn'], ['ok', 'ok']] as const) {
      const c = card(kind);
      expect(c.icon).toContain(`text-${tone}`);
      expect(c.box.className).toContain(`border-${tone}/`);
    }
    const idle = card('idle', '✓');
    expect(idle.icon).toContain('text-fg2');
    expect(idle.box.className).not.toMatch(/border-(err|info|warn|ok)/);
    expect(idle.detail).toContain('text-fg2'); // the userscript's .de (2825)
    // the card changes about every 0.8 s during a scan: not a live region
    expect(idle.box.hasAttribute('role')).toBe(false);
    expect(idle.box.closest('[aria-live]')).toBe(null);
  });

  it('a step detail without steps is not shown', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ status: { icon: '✓', kind: 'idle', title: 'Ready', detail: '', stepDetail: 'Orphan' } }) }));
    expect(screen.queryByText('Orphan')).toBe(null);
  });

  it('a run shows its steps, the current one marked, and a moving bar when no number is known', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ busyRun: true,
      status: { icon: '✂', kind: 'busy', title: 'Trimming 1 / 2', detail: 'Mix', progress: null, steps: ['Open', 'Trim', 'Save'], stepIdx: 1, stepDetail: 'Waiting for the editor' } }) }));
    expect(screen.getByText('✓ Open')).toBeTruthy();
    expect(screen.getByText('● Trim').className).toContain('font-semibold');
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Waiting for the editor')).toBeTruthy();
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });

  it('Studio in Thai: the warning shows', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ english: false }) }));
    expect(screen.getByText(/Studio is set to Thai/)).toBeTruthy();
  });

  it('Studio in English: no warning', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    expect(screen.queryByText(/Studio is set to Thai/)).toBe(null);
  });

  it('no Studio tab bound: no card, and nothing to scan or open', () => {
    renderPanel(<CopyrightTab />, fakePanel({ target: null, link: 'noTab' }), undefined, fakeClaims({ state: null, live: null }));
    expect(screen.queryByText('Ready')).toBe(null);
    expect((screen.getByRole('button', { name: /Scan claims/ }) as HTMLButtonElement).disabled).toBe(true);
    for (const name of [/Songs/, /tracklist/, /Ads/, /Collab/, /Options/]) expect(tab(name).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Upload history/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('the tools open once the channel\'s data is read', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    expect(tab(/Songs/).disabled).toBe(true);
    await ready();
    expect(screen.getByRole('heading', { name: 'Copyright claims — Mine' })).toBeTruthy(); // Claims shows its list
  });

  it('a scan that ended in the bound tab opens its list', async () => {
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    pick(/Songs/);
    r.rerender(wrap({ ...claims, shown: { view: 'claims', n: 1 } }));
    expect(await screen.findByRole('heading', { name: 'Copyright claims — Mine' })).toBeTruthy();
    expect(active(/Claim list/)).toBe(true);
  });

  it('each sub-tab shows its tool', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    for (const [name, title] of [
      [/Songs/, '🎵 Previously claimed songs'], [/tracklist/, '📝 Choose a video to fix its tracklist'], [/Options/, 'Copyright settings'], [/Claim list/, 'Copyright claims — Mine'],
    ] as const) {
      pick(name);
      expect(active(name)).toBe(true);
      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(title);
    }
    // Ads and Collab before their first scan: the button that reads the list
    pick(/Ads/);
    expect(screen.getByRole('button', { name: /Check for ads off/ })).toBeTruthy();
    pick(/Collab/);
    expect(screen.getByRole('button', { name: /Read video list/ })).toBeTruthy();
  });

  it('follows the channel\'s stored data: a scan stored later shows in the open view', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    expect(screen.getByRole('heading', { name: 'Copyright claims — Mine' })).toBeTruthy();
    await act(async () => { await fakeBrowser.storage.local.set({ 'claimScan:UC1': { date: '', total: 0, rows: [], channel: 'UC1', channelName: 'Scanned as' } }); });
    expect(await screen.findByRole('heading', { name: 'Copyright claims — Scanned as' })).toBeTruthy();
    // another channel's key is not this tab's
    await act(async () => { await fakeBrowser.storage.local.set({ 'claimScan:UC2': { date: '', total: 0, rows: [], channel: 'UC2', channelName: 'Other' } }); });
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Copyright claims — Scanned as' })).toBeTruthy();
  });

  it('the bound tab moves to another channel: the first channel\'s data is gone at once, and stays gone if the read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': { date: '', total: 0, rows: [], channel: 'UC1', channelName: 'First' } });
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    expect(screen.getByRole('heading', { name: 'Copyright claims — First' })).toBeTruthy();

    let fail!: (e: Error) => void;
    vi.spyOn(fakeBrowser.storage.local, 'get').mockReturnValue(new Promise((_, no) => { fail = no; }) as never);
    const moved = claimsStateWith({ channel: 'UC2', channelName: 'Second' });
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    // the read of UC2 is pending: no view over UC1's data, and nothing to open
    expect(screen.queryByRole('heading', { name: /Copyright claims/ })).toBe(null);
    for (const name of [/Songs/, /tracklist/]) expect(tab(name).disabled).toBe(true);
    await act(async () => { fail(new Error('storage gone')); });
    expect(screen.queryByRole('heading', { name: /Copyright claims/ })).toBe(null);
    expect(tab(/Songs/).disabled).toBe(true);
  });

  it('the activity log opens, and keeps that choice', async () => {
    const send = vi.spyOn(await import('../lib/messages'), 'sendMessage').mockResolvedValue(undefined as never);
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ log: [{ at: Date.UTC(2026, 0, 1, 10, 5), msg: 'Scan complete ✓', type: 'ok' }] }));
    expect(screen.queryByText(/Scan complete ✓/)).toBe(null);
    const toggle = screen.getByRole('button', { name: 'Show activity ▾' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByText(/Scan complete ✓/).className).toContain('text-ok');
    expect(screen.getByRole('button', { name: 'Hide activity ▴' }).getAttribute('aria-expanded')).toBe('true');
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'set', key: 'logOpen', value: true });
    fireEvent.click(screen.getByRole('button', { name: 'Hide activity ▴' }));
    expect(screen.queryByText(/Scan complete ✓/)).toBe(null);
    expect(send).toHaveBeenLastCalledWith('claims:op', { op: 'set', key: 'logOpen', value: false });
  });

  it('a stored open log starts open; a line shows its time', async () => {
    await fakeBrowser.storage.local.set({ logOpen: true });
    const at = new Date(2026, 0, 1, 9, 5).getTime();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ log: [{ at, msg: 'Scan failed: boom', type: 'err' }, { at, msg: 'Scanning…', type: '' }] }));
    expect((await screen.findByText('09:05 Scan failed: boom')).className).toContain('text-err');
    // this panel's click wins over what is stored (the write's echo comes later)
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockResolvedValue(undefined as never);
    fireEvent.click(screen.getByRole('button', { name: 'Hide activity ▴' }));
    expect(screen.queryByText(/Scan failed: boom/)).toBe(null);
  });

  it('with no Studio tab bound, the stored log choice and the song count still show', async () => {
    await fakeBrowser.storage.local.set({ logOpen: true, songHistory: { a: {}, b: {}, c: {} } });
    renderPanel(<CopyrightTab />, fakePanel({ target: null, link: 'noTab' }), undefined,
      fakeClaims({ state: null, live: null, log: [{ at: 0, msg: 'Scan complete ✓', type: 'ok' }] }));
    expect(await screen.findByText(/Scan complete ✓/)).toBeTruthy();
    expect(tab('Songs (3)')).toBeTruthy();
    // …and follow storage (another panel window, a scan in some Studio tab)
    await act(async () => { await fakeBrowser.storage.local.set({ logOpen: false, songHistory: { a: {} } }); });
    await waitFor(() => expect(tab('Songs (1)')).toBeTruthy());
    expect(screen.queryByText(/Scan complete ✓/)).toBe(null);
  });

  it('a song history that is not an object counts as none', async () => {
    await fakeBrowser.storage.local.set({ songHistory: ['x', 'y'] });
    renderPanel(<CopyrightTab />, fakePanel({ target: null, link: 'noTab' }), undefined, fakeClaims({ state: null, live: null }));
    await act(async () => {});
    expect(tab('Songs (0)')).toBeTruthy();
  });

  it('a log choice the background never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockRejectedValue(new Error('gone'));
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: 'Show activity ▾' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't save (gone)", { id: 'save-failed' }));
    expect(toast).not.toHaveBeenCalledWith(RELOAD); // a background write: reloading the Studio tab wouldn't help
  });

  it('Upload history saves the stored uploads as a CSV', async () => {
    await fakeBrowser.storage.local.set({ uploads: [{ date: '2026-01-01', channel: 'UC1', channelName: 'Mine', title: 'A "mix"', file: 'a.mp4', videoId: 'abc', visibility: 'PRIVATE', publishAt: null }] });
    const saved = captureDownload();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Upload history/ })));
    await waitFor(() => expect(saved.name).toMatch(/^uploads-\d{4}-\d\d-\d\d\.csv$/));
    const text = await saved.blob!.text();
    expect(text.split('\n')[0]).toContain('"date","channel","title","file","video_id","url","visibility","publish_at"');
    expect(text.split('\n')[1]).toBe('"2026-01-01","Mine","A ""mix""","a.mp4","abc","https://youtu.be/abc","PRIVATE",""');
  });

  it('Upload history with nothing stored (or not a list) still saves the header row', async () => {
    await fakeBrowser.storage.local.set({ uploads: 'x' });
    const saved = captureDownload();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Upload history/ })));
    await waitFor(() => expect(saved.blob).toBeTruthy());
    expect((await saved.blob!.text()).split('\n')).toHaveLength(1);
  });

  it('an Upload history that could not be read says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: /Upload history/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't export (quota)"));
  });

  it('a render error stays inside the pane', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = fakeClaims({ state: claimsStateWith({ status: null as never }) });
    renderPanel(<PaneBoundary><CopyrightTab /></PaneBoundary>, fakePanel(), undefined, broken);
    expect(screen.getByRole('alert').textContent).toContain('This tab hit an error');
  });
});

// The pane's modals as views (D23): showClaims 4860–4936, showSongs 5190–5251, showTracklistFix 4980–5040.
const row = (videoId: string, claimId: string, over: Record<string, unknown> = {}) => ({
  videoId, video: 'Mix ' + videoId, privacy: 'public', length: 600, claimId, song: 'Song ' + claimId, artists: 'A', label: 'Lab', claimant: 'Co',
  type: 'audio', status: 'active', impact: 'blocked', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: 'trim', own: false, hasImpact: true, publishAt: 0, ...over,
});
const scanOf = (rows: unknown[]) => ({ date: '2026-10-01T00:00:00Z', total: 5, channel: 'UC1', channelName: 'Mine', rows });
const scan = scanOf([row('v1', 'c1')]);
const mockSend = async () => vi.spyOn(await import('../lib/messages'), 'sendMessage').mockResolvedValue(undefined as never);
const open = async (name: RegExp, claims = fakeClaims(), api = fakePanel()) => {
  renderPanel(<CopyrightTab />, api, undefined, claims);
  await ready();
  pick(name);
  return api;
};
const SAVE_FAILED = ["Couldn't save (gone)", { id: 'save-failed' }] as const;

describe('views', () => {
  it('the claim list ticks through the background', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    const send = await mockSend();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts: { hasScan: true, scanDate: '', claims: 1, claimVideos: 1, songs: 0, hasAdsScan: false, adsTodo: 0 } }) }));
    expect(tab('Claim list (1)')).toBeTruthy();
    fireEvent.click(await screen.findByTitle('Add to trim list'));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['v1:c1'] });
  });

  it('a finished scan from this panel opens the list', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ shown: { view: 'claims', n: 1 } }));
    expect(await screen.findByText(/Copyright claims — Mine/)).toBeTruthy();
  });

  it('a finished ads or Collab scan opens its sub-tab', async () => {
    await fakeBrowser.storage.local.set({ 'adsScan:UC1': { date: '2026-01-01', total: 0, rows: [] }, 'collabScan:UC1': { date: '2026-01-01', total: 0, rows: [] } });
    const ads = renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ shown: { view: 'ads', n: 1 } }));
    expect(await screen.findByText(/Videos with ads off — Mine/)).toBeTruthy();
    expect(active(/Ads/)).toBe(true);
    ads.unmount();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ shown: { view: 'collab', n: 1 } }));
    expect(await screen.findByText(/Collab — Mine/)).toBeTruthy();
    expect(active(/Collab/)).toBe(true);
  });

  // The views read data.adsScan / data.collabScan: without a stored list the sub-tab offers to read one (K review m3).
  it('an ads or Collab list asked for with no stored scan offers its scan', async () => {
    for (const [view, button] of [['ads', /Check for ads off/], ['collab', /Read video list/]] as const) {
      const api = fakePanel();
      const r = renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ shown: { view, n: 1 } }));
      await ready();
      expect(screen.queryByRole('heading', { level: 3 })).toBe(null);
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(api.send).toHaveBeenCalledWith('claims:scan', view);
      r.unmount();
    }
  });

  it('Ads and Collab scans wait while the tab is busy', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: scanning }));
    await ready();
    pick(/Ads/);
    expect((screen.getByRole('button', { name: /Check for ads off/ }) as HTMLButtonElement).disabled).toBe(true);
    pick(/Collab/);
    expect((screen.getByRole('button', { name: /Read video list/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('moving between the tools', () => {
  const moved = claimsStateWith({ channel: 'UC2', channelName: 'Second' });
  const both = () => fakeBrowser.storage.local.set({
    'claimScan:UC1': scanOf([row('v1', 'c1')]), 'claimScan:UC2': scanOf([row('w1', 'k1')]), uploads: [{ videoId: 'v1', txt: '00:00 A - One' }],
  });

  it('the bound tab moves to another channel: an open tool goes back to Claims, on the new channel', async () => {
    await both();
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    pick(/Songs/);
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    await ready(); // the new channel's data is read
    expect(active(/Claim list/)).toBe(true);
    expect(await pane().findByText('Mix w1')).toBeTruthy();
    expect(screen.queryByText('Mix v1')).toBe(null); // nor in the hidden tools
  });

  it('…and an open tracklist editor does not carry its video to the new channel', async () => {
    await both();
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    pick(/tracklist/);
    fireEvent.click(await screen.findByRole('button', { name: /Mix v1/ }));
    expect(screen.getByRole('heading', { name: '📝 Tracklist after copyright trim' })).toBeTruthy();
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    await ready();
    pick(/tracklist/);
    expect(screen.queryByRole('heading', { name: /Tracklist after copyright trim/ })).toBe(null);
    expect(screen.queryByDisplayValue('00:00 A - One')).toBe(null);
  });

  // THAIB-1 review: the bar sits under the status card. A pane scrolled past it comes back to the
  // bar; one that shows the bar does not move, so the bar just clicked stays under the pointer.
  it('a tool opens with the sub-tab bar in sight, and does not move a pane that shows it', async () => {
    await both();
    const { container } = renderPanel(<div data-pane-scroll=""><CopyrightTab /></div>, fakePanel(), undefined, fakeClaims());
    const scroller = container.querySelector<HTMLElement>('[data-pane-scroll]')!;
    await ready();
    const BAR = 120; // the bar's offset in the pane
    vi.spyOn(screen.getByRole('tablist', { name: 'Tools' }), 'getBoundingClientRect').mockImplementation(() => ({ top: BAR - scroller.scrollTop }) as DOMRect);
    const at = (from: number, go: () => void) => { scroller.scrollTop = from; go(); return scroller.scrollTop; };
    const click = (name: RegExp | string) => () => fireEvent.click(pane().getAllByRole('button', { name })[0]!);
    expect(at(50, () => pick(/Songs/))).toBe(50); // the bar was in sight: nothing jumps
    expect(at(300, () => pick(/Claim list/))).toBe(BAR); // scrolled past it: back to the bar
    expect(at(300, click('📝 Tracklist after trim'))).toBe(BAR); // from far down the list
    expect(at(300, click('← Back'))).toBe(BAR);
    expect(at(300, click(/Mix v1/))).toBe(BAR); // picker to editor
  });

  // THAIB-1 review 3: the scroll follows the tool that shows, so a tool picked before the data
  // lands (a finished scan's) is brought into sight when it does.
  it('a tool picked before the data lands opens with the bar in sight once it shows', async () => {
    await both();
    const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
    let land = () => {};
    const gate = new Promise<void>((ok) => { land = ok; });
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(((k: never) => gate.then(() => get(k))) as never);
    const { container } = renderPanel(<div data-pane-scroll=""><CopyrightTab /></div>, fakePanel(), undefined, fakeClaims({ shown: { view: 'ads', n: 1 } }));
    const scroller = container.querySelector<HTMLElement>('[data-pane-scroll]')!;
    const BAR = 120;
    vi.spyOn(screen.getByRole('tablist', { name: 'Tools' }), 'getBoundingClientRect').mockImplementation(() => ({ top: BAR - scroller.scrollTop }) as DOMRect);
    await act(async () => {});
    scroller.scrollTop = 300; // scrolled down the claim list while the data loads
    await act(async () => { land(); });
    await ready();
    expect(active(/Ads/)).toBe(true);
    expect(scroller.scrollTop).toBe(BAR);
  });

  it('a tool opened by its sub-tab leaves focus on the tab; the tracklist editor takes it to its title', async () => {
    await both();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    for (const name of [/Songs/, /tracklist/]) {
      tab(name).focus();
      pick(name);
      expect(document.activeElement).toBe(tab(name));
    }
    fireEvent.click(await screen.findByRole('button', { name: /Mix v1/ }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '📝 Tracklist after copyright trim' }));
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('heading', { name: '📝 Choose a video to fix its tracklist' })).toBeTruthy();
  });

  it('a list opened by a scan that ended while another panel tab is showing leaves that tab\'s scroll alone', async () => {
    await both();
    const claims = fakeClaims();
    const tree = (c: ClaimsApi) => (
      <PanelContext.Provider value={api}><LiveContext.Provider value={fakeLive()}><ClaimsContext.Provider value={c}><AskProvider>
        <div data-pane-scroll=""><div data-state="inactive"><CopyrightTab /></div></div>
      </AskProvider></ClaimsContext.Provider></LiveContext.Provider></PanelContext.Provider>
    );
    const api = fakePanel();
    const { container, rerender } = render(tree(claims));
    await ready();
    pick(/Songs/);
    const scroller = container.querySelector<HTMLElement>('[data-pane-scroll]')!;
    scroller.scrollTop = 300;
    rerender(tree({ ...claims, shown: { view: 'claims', n: 1 } }));
    expect(await screen.findByRole('heading', { name: 'Copyright claims — Mine' })).toBeTruthy();
    expect(scroller.scrollTop).toBe(300);
  });
});

describe('claim list', () => {
  const rows = [
    row('v1', 'c1', { own: true, claimedSec: 330, publishAt: Date.now() + 864e5 }), row('v1', 'c2', { canTrim: false, impact: '' }),
    row('v2', 'c3'), row('v2', 'c4', { segments: [] }),
  ];
  const stored = (over: Record<string, unknown> = {}) => fakeBrowser.storage.local.set({ 'claimScan:UC1': scanOf(rows), ...over });
  const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[];

  it('before a scan it says so, with the channel\'s name', async () => {
    await open(/Claim list/);
    expect(screen.getByText('Channel Mine not scanned yet — press "Scan claims" first')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBe(null);
  });

  it('a scan without claims says so', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scanOf([]) });
    await open(/Claim list/);
    expect(screen.getByText('No claims found 🎉')).toBeTruthy();
    expect(screen.getByText(/0 claims in 0 videos \(of 5 total\) · scanned /)).toBeTruthy();
  });

  it('one card per claim: the video, the song, the range, the impact', async () => {
    await stored();
    await open(/Claim list/);
    expect(screen.getByText(/4 claims in 2 videos \(of 5 total\) · scanned /)).toBeTruthy();
    expect(screen.getByText(/1 look like your own songs \(★\)/)).toBeTruthy();
    expect(boxes()).toHaveLength(4);
    const first = boxes()[0]!.closest('[data-claim]') as HTMLElement;
    expect(first.dataset.claim).toBe('v1:c1');
    expect(first.textContent).toContain('Mix v1');
    expect(first.textContent).toContain('public · 10:00');
    expect(first.textContent).toContain('⏰ Scheduled ');
    expect(first.textContent).toContain('Song c1 · A · Lab');
    expect(first.textContent).toContain('★ Your own song');
    expect(first.textContent).toContain('1:00–1:30');
    expect(screen.getByText('5:30 (55% of video)').className).toContain('text-err'); // half or more of the video
    expect(screen.getAllByText('0:30 (5% of video)')[0]!.className).not.toContain('text-err');
    expect(first.textContent).toContain('blocked');
    const second = boxes()[1]!.closest('[data-claim]') as HTMLElement;
    expect(second.textContent).toContain('No impact');
    expect(second.textContent).toContain('No Trim option');
    expect(second.textContent).not.toContain('⏰'); // this claim's row has no release time
    expect(boxes()[3]!.closest('[data-claim]')!.textContent).toContain('?'); // no range known
    // the checkbox is named by what it does, and described by its video and song
    const desc = boxes()[0]!.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent).join(' | ');
    expect(desc).toBe('Mix v1 | Song c1 · A · Lab');
  });

  it('a claim that can\'t be trimmed, or is done, can\'t be ticked, and says why', async () => {
    await stored({ 'trimQueue:UC1': ['v2:c3', 'v2:c4'], 'trimResults:UC1': { 'v2:c3': { state: 'saved', msg: '', date: '' }, 'v2:c4': { state: 'failed', msg: 'no button', date: '' } } });
    await mockSend();
    await open(/Claim list/);
    const [a, b, c, d] = boxes();
    expect([a!.disabled, b!.disabled, c!.disabled, d!.disabled]).toEqual([false, true, true, false]);
    expect(b!.title).toBe('YouTube offers no Trim option for this claim');
    expect(c!.title).toBe('Already handled');
    expect([a!.checked, c!.checked, d!.checked]).toEqual([false, false, true]); // a done claim shows unticked even while still on the stored list
    expect(screen.getByText('✅ Trimmed').className).toContain('text-ok');
    const failed = screen.getByText(/❌ Failed/);
    expect(failed.textContent).toBe('❌ Failed — no button');
    expect(failed.className).toContain('text-err');
  });

  it('unticking takes the claim off the list', async () => {
    await stored({ 'trimQueue:UC1': ['v2:c3'] });
    const send = await mockSend();
    await open(/Claim list/);
    fireEvent.click(boxes()[2]!);
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', del: ['v2:c3'] });
  });

  it('a pick chip ticks what matches and unticks the rest, among the claims that can be ticked', async () => {
    await stored();
    const send = await mockSend();
    await open(/Claim list/);
    fireEvent.click(screen.getByRole('button', { name: 'Not my own songs' }));
    expect(send).toHaveBeenLastCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['v2:c3', 'v2:c4'], del: ['v1:c1'] });
    fireEvent.click(screen.getByRole('button', { name: '⏰ Scheduled + affected' }));
    expect(send).toHaveBeenLastCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['v1:c1'], del: ['v2:c3', 'v2:c4'] });
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(send).toHaveBeenLastCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: [], del: ['v1:c1', 'v2:c3', 'v2:c4'] });
    for (const name of ['All trimmable', 'Affects video (revenue/restricted/blocked)', 'Claimed range < 20%']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('a pick chip leaves a done claim alone', async () => {
    await stored({ 'trimResults:UC1': { 'v2:c3': { state: 'saved', msg: '', date: '' } } });
    const send = await mockSend();
    await open(/Claim list/);
    fireEvent.click(screen.getByRole('button', { name: 'All trimmable' }));
    expect(send).toHaveBeenLastCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['v1:c1', 'v2:c4'], del: [] });
  });

  it('a pick that gets done while the list is open leaves the stored list too', async () => {
    await stored({ 'trimQueue:UC1': ['v2:c3'] });
    const send = await mockSend();
    await open(/Claim list/);
    expect(send).not.toHaveBeenCalled();
    await act(async () => { await fakeBrowser.storage.local.set({ 'trimResults:UC1': { 'v2:c3': { state: 'saved', msg: '', date: '' } } }); });
    await waitFor(() => expect(send).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', del: ['v2:c3'] }));
  });

  it('picks that are done already leave the stored list when it opens', async () => {
    await stored({ 'trimQueue:UC1': ['v1:c1', 'v2:c3'], 'trimResults:UC1': { 'v2:c3': { state: 'gone', msg: '', date: '' } } });
    const send = await mockSend();
    await open(/Claim list/);
    await waitFor(() => expect(send).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', del: ['v2:c3'] }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a tick the background never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await stored();
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockRejectedValue(new Error('gone'));
    await open(/Claim list/);
    fireEvent.click(boxes()[0]!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(...SAVE_FAILED));
  });

  it('the list is the bound tab\'s channel\'s: ticks are written under that channel only', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan, 'claimScan:UC2': scanOf([row('w1', 'k1')]) });
    const send = await mockSend();
    const moved = claimsStateWith({ channel: 'UC2', channelName: 'Second' });
    await open(/Claim list/, fakeClaims({ state: moved }));
    expect(screen.queryByText('Mix v1')).toBe(null);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC2', add: ['w1:k1'] });
  });

  it('⬇ CSV saves the scan, named by its date', async () => {
    await stored();
    const saved = captureDownload();
    await open(/Claim list/);
    fireEvent.click(screen.getByRole('button', { name: '⬇ CSV' }));
    expect(saved.name).toBe('youtube-claims-2026-10-01.csv');
    const lines = (await saved.blob!.text()).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('"Mix v1","https://studio.youtube.com/video/v1/claims","public","10:00","Song c1"');
  });

  it('Rescan asks the bound tab', async () => {
    await stored();
    const api = await open(/Claim list/);
    fireEvent.click(screen.getByRole('button', { name: '↻ Rescan' }));
    expect(api.send).toHaveBeenCalledWith('claims:scan', 'claims');
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
  });

  it('a rescan the tab never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await stored();
    await open(/Claim list/, fakeClaims(), fakePanel({ send: vi.fn(async () => { throw new Error('no receiver'); }) as never }));
    fireEvent.click(screen.getByRole('button', { name: '↻ Rescan' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(RELOAD, { id: 'not-connected' }));
  });

  it('the video\'s title opens its claims page in Studio', async () => {
    await stored();
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    await open(/Claim list/);
    const link = screen.getAllByRole('link', { name: 'Mix v1' })[0]!;
    expect(link.getAttribute('href')).toBe('https://studio.youtube.com/video/v1/claims');
    fireEvent.click(link);
    expect(create).toHaveBeenCalledWith({ url: 'https://studio.youtube.com/video/v1/claims' });
  });

  it('"Tracklist after trim" is offered once per video and opens that video\'s tracklist', async () => {
    await stored();
    await open(/Claim list/);
    const buttons = screen.getAllByRole('button', { name: '📝 Tracklist after trim' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(screen.getByRole('heading', { name: '📝 Tracklist after copyright trim' })).toBeTruthy();
    expect(screen.getByText(/Mix v2 · original length 10:00/)).toBeTruthy();
  });

  it('folds away and back like the video lists; the ticks hold and the bar counts the trimmable picks', async () => {
    await stored({ 'trimQueue:UC1': ['v2:c3'] });
    await mockSend();
    await open(/Claim list/);
    const head = screen.getByRole('button', { name: /^Claims \(4\) · 1 picked$/ });
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(head.getAttribute('aria-controls')!)!.hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('button', { name: '✂ Trim selected (1)' })).toBeTruthy(); // the step under it is in reach
    fireEvent.click(head);
    expect(boxes()[2]!.checked).toBe(true);
  });

  it('compact rows keep what a trim is decided on: the song, the impact, a big share, no Trim option, the tracklist', async () => {
    await stored({ 'trimResults:UC1': { 'v2:c3': { state: 'saved', msg: '', date: '' }, 'v2:c4': { state: 'failed', msg: 'no button', date: '' } } });
    await mockSend();
    await open(/Claim list/);
    fireEvent.click(screen.getByRole('button', { name: '☰ Compact rows' }));
    const rowOf = (n: number) => boxes()[n]!.closest('[data-claim]') as HTMLElement;
    const first = rowOf(0);
    expect(first.dataset.claim).toBe('v1:c1');
    expect(first.className).toContain('border-warn/35'); // own song: the warning edge stays
    expect(within(first).getByRole('img', { name: /^⏰ Scheduled / })).toBeTruthy();
    expect(within(first).getByRole('img', { name: '★ Your own song' })).toBeTruthy();
    expect(within(first).getByRole('img', { name: 'blocked' }).textContent).toBe('⛔'); // what "Affects video" picks by
    const share = within(first).getByRole('img', { name: '5:30 (55% of video)' }); // half the video or more
    expect([share.textContent, share.className.includes('text-err')]).toEqual(['55%', true]);
    expect(first.textContent).toContain('Song c1 · A · Lab · Co');
    expect(first.textContent).not.toContain('1:00–1:30'); // the range is on the full card
    expect(within(rowOf(2)).queryByRole('img', { name: /% of video/ })).toBe(null); // a small share is not marked
    const second = rowOf(1);
    expect(second.textContent).toContain('No Trim option'); // in words: the disabled box's reason has no hover on touch
    expect(within(second).queryByRole('img', { name: 'No impact' })).toBe(null);
    expect(boxes()[1]!.disabled).toBe(true);
    expect(screen.getByRole('img', { name: '✅ Trimmed' })).toBeTruthy();
    expect(screen.getByText(/❌ Failed/).textContent).toBe('❌ Failed — no button');
    const desc = boxes()[0]!.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent).join(' | ');
    expect(desc).toBe('Mix v1 | Song c1 · A · Lab');
    const tracklist = screen.getAllByRole('button', { name: '📝 Tracklist after trim' }); // once per video, as on the full cards
    expect(tracklist.map((b) => b.textContent)).toEqual(['📝', '📝']);
    fireEvent.click(tracklist[1]!);
    expect(screen.getByRole('heading', { name: '📝 Tracklist after copyright trim' })).toBeTruthy();
  });

  it('on a compact row a success is an icon; a reason, or a state with no label, stays in words', async () => {
    await stored({ 'trimResults:UC1': {
      'v1:c1': { state: 'skipped', msg: 'video processing', date: '' }, 'v1:c2': { state: 'odd', msg: '', date: '' },
      'v2:c3': { state: 'gone', msg: '', date: '' }, 'v2:c4': { state: 'skipped', msg: '', date: '' },
    } });
    await mockSend();
    await open(/Claim list/);
    fireEvent.click(screen.getByRole('button', { name: '☰ Compact rows' }));
    expect(screen.getByText(/⏭ Skipped — video processing/).className).toContain('text-warn');
    expect(screen.getByText('odd')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'odd' })).toBe(null); // no letter passed off as an icon
    expect(screen.getByRole('img', { name: '✅ Claim gone' }).textContent).toBe('✅');
    expect(screen.getByRole('img', { name: '⏭ Skipped' }).textContent).toBe('⏭');
    fireEvent.click(screen.getByRole('button', { name: '▤ Full rows' }));
    expect(screen.getByText(/⏭ Skipped — video processing/)).toBeTruthy();
    expect(screen.getByText('✅ Claim gone').className).toContain('text-ok');
  });

  it('queued behind this video\'s last trim stays in words on a compact row; pending keeps the card\'s text colour', async () => {
    await stored({ 'trimResults:UC1': { 'v2:c3': { state: 'later', msg: '', date: '' }, 'v2:c4': { state: 'pending', msg: '', date: '' } } });
    await mockSend();
    await open(/Claim list/);
    expect(screen.getByText('⏳ Pending').className).not.toContain('text-fg2'); // as before: no tone of its own
    fireEvent.click(screen.getByRole('button', { name: '☰ Compact rows' }));
    expect(screen.getByText(/^⏳ Queued — will trim after/)).toBeTruthy(); // not a bare ⏳, which pending also shows
    expect(screen.getByRole('img', { name: '⏳ Pending' }).textContent).toBe('⏳');
  });

  it('the full card keeps its order: the release time under the meta, the star beside the claimant', async () => {
    await stored();
    await open(/Claim list/);
    const first = boxes()[0]!.closest('[data-claim]') as HTMLElement;
    const text = first.textContent!;
    expect(text.indexOf('⏰ Scheduled')).toBeLessThan(text.indexOf('Song c1'));
    expect(within(first).getByText('Co').textContent).toBe('Co★ Your own song');
    expect(within(first).getAllByText('★ Your own song')).toHaveLength(1);
  });

  it('a compact row with no claimant ends at the song, with no stray separator', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scanOf([row('v1', 'c1', { claimant: '' })]) });
    await open(/Claim list/);
    fireEvent.click(screen.getByRole('button', { name: '☰ Compact rows' }));
    expect(screen.getByText('Song c1').parentElement!.textContent).toBe('Song c1 · A · Lab');
  });

  it(`a scan of ${COMPACT_FROM} claims or more starts compact`, async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scanOf(Array.from({ length: COMPACT_FROM }, (_, i) => row('v' + i, 'c' + i))) });
    await open(/Claim list/);
    expect(screen.getByRole('button', { name: '▤ Full rows' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `Claims (${COMPACT_FROM}) · 0 picked` })).toBeTruthy();
  });
});

describe('claimed songs', () => {
  const song = (title: string, over: Record<string, unknown> = {}) => ({
    title, artists: 'Lena', label: 'Lab', claimants: ['Co'], types: ['audio'], firstSeen: '2026-01-01T00:00:00Z', lastSeen: '2026-01-02T00:00:00Z',
    videos: { v1: { video: 'Mix 1', channel: 'Mine', status: 'claimed' } }, trimmed: 0, ...over,
  });
  const songs = {
    'beta|lena': song('Beta', { videos: { v1: { video: 'Mix 1', channel: 'Mine', status: 'trimmed' }, v2: { video: 'Mix 2', channel: 'Other', status: 'claimed' } }, trimmed: 1 }),
    'alpha|ann': song('Alpha', { artists: 'Ann', label: '', claimants: [], types: [], lastSeen: '2026-03-01T00:00:00Z' }),
  };
  const stored = () => fakeBrowser.storage.local.set({ songHistory: songs });
  const titles = () => [...document.querySelectorAll('[data-song] > div > b')].map((b) => b.textContent);
  const csv = (text: string) => new File([text], 'claimed-songs.csv', { type: 'text/csv' });
  const pick = (f: File) => act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>('input[type=file]')!, { target: { files: [f] } }); });

  it('with no history it says how to get one', async () => {
    await open(/Songs/);
    expect(screen.getByText('No data yet — press "Scan claims" or import a CSV from the old script')).toBeTruthy();
    expect(screen.getByText('0 songs')).toBeTruthy();
  });

  it('one card per song, most claimed first', async () => {
    await stored();
    await open(/Songs/);
    expect(titles()).toEqual(['Beta', 'Alpha']);
    expect(screen.getByText('2 songs')).toBeTruthy();
    const beta = document.querySelector('[data-song="beta|lena"]')!;
    expect(beta.textContent).toContain('audio');
    expect(beta.textContent).toContain('Lena · Lab');
    expect(beta.textContent).toContain('Co');
    expect(beta.textContent).toContain('2 videos');
    expect(beta.textContent).toContain('✂ Trimmed 1');
    expect(beta.textContent).toContain('Mine, Other · ');
    const alpha = document.querySelector('[data-song="alpha|ann"]')!;
    expect(alpha.textContent).toContain('Ann');
    expect(alpha.textContent).toContain('—'); // no claimant known
    expect(alpha.textContent).not.toContain('✂');
  });

  it('sorts by the chosen order and searches song, artist, label and claimant', async () => {
    await stored();
    await open(/Songs/);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'title' } });
    expect(titles()).toEqual(['Alpha', 'Beta']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search song, artist, label or claimant…' }), { target: { value: 'co' } });
    expect(titles()).toEqual(['Beta']);
    expect(screen.getByText('1 of 2 songs')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching songs')).toBeTruthy();
  });

  it('removing a song asks once, then goes through the background', async () => {
    await stored();
    const send = await mockSend();
    await open(/Songs/);
    const del = screen.getAllByRole('button', { name: 'Remove from history' });
    fireEvent.click(del[0]!);
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(del[1]!); // another song: the first is no longer armed
    expect(screen.getAllByRole('button', { name: 'Sure?' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sure?' }));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'songs', songs: { fn: 'delete', key: 'alpha|ann' } });
    expect(screen.queryByRole('button', { name: 'Sure?' })).toBe(null);
  });

  it('Delete all asks once, then clears through the background', async () => {
    await stored();
    const send = await mockSend();
    await open(/Songs/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Press again to delete all' }));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'songs', songs: { fn: 'clear' } });
    expect(screen.getByRole('button', { name: 'Delete all' })).toBeTruthy();
  });

  it('a removal the background never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await stored();
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockRejectedValue(new Error('gone'));
    await open(/Songs/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Press again to delete all' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(...SAVE_FAILED));
  });

  it('the list follows the stored history', async () => {
    await stored();
    await open(/Songs/);
    await act(async () => { await fakeBrowser.storage.local.set({ songHistory: { 'alpha|ann': songs['alpha|ann'] } }); });
    await waitFor(() => expect(titles()).toEqual(['Alpha']));
  });

  it('Import CSV hands the file\'s text to the background and says how many songs it holds', async () => {
    const send = await mockSend();
    await open(/Songs/);
    const text = 'song,artists\nOne,A\nTwo,B\n,C\n';
    await pick(csv(text));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Imported 2 songs into history'));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'songs', songs: { fn: 'import', text, now: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) } });
  });

  it('a file that is not a song history is refused, and nothing is written', async () => {
    const send = await mockSend();
    await open(/Songs/);
    await pick(csv('video,url\nA,B\n'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('This is not a song history CSV (needs a song column)'));
    expect(send).not.toHaveBeenCalled();
  });

  it('an import the background never got says so, and does not claim it worked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockRejectedValue(new Error('gone'));
    await open(/Songs/);
    await pick(csv('song\nOne\n'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(...SAVE_FAILED));
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('a file over the limit is refused before it is read', async () => {
    const send = await mockSend();
    await open(/Songs/);
    const f = csv('song\nOne\n');
    Object.defineProperty(f, 'size', { value: SONGS_CSV_MAX + 1 });
    const text = vi.spyOn(f, 'text');
    await pick(f);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('This file is too large — the limit is 16 MB'));
    expect(text).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('a file at the limit is read', async () => {
    const send = await mockSend();
    await open(/Songs/);
    const f = csv('song\nOne\n');
    Object.defineProperty(f, 'size', { value: SONGS_CSV_MAX });
    await pick(f);
    await waitFor(() => expect(send).toHaveBeenCalled());
  });

  it('a file that could not be read says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = await mockSend();
    await open(/Songs/);
    const f = csv('song\nOne\n');
    vi.spyOn(f, 'text').mockRejectedValue(new Error('boom'));
    await pick(f);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't read the file (boom)"));
    expect(send).not.toHaveBeenCalled();
  });

  it('the file box is emptied after a pick, so the same file can be picked again', async () => {
    await mockSend();
    await open(/Songs/);
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const cleared = vi.fn();
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: cleared });
    await pick(csv('song\nOne\n'));
    expect(cleared).toHaveBeenCalledWith('');
  });

  it('a song\'s channels are listed once each; no artist shows a dash', async () => {
    await fakeBrowser.storage.local.set({ songHistory: { 'solo|': song('Solo', {
      artists: '', label: 'Lab', videos: { a: { video: 'A', channel: 'Mine', status: 'claimed' }, b: { video: 'B', channel: 'Mine', status: 'claimed' }, c: { video: 'C', channel: '', status: 'claimed' } },
    }) } });
    await open(/Songs/);
    const card = document.querySelector('[data-song="solo|"]')!;
    expect(card.textContent).toContain('— · Lab');
    expect(card.textContent).toContain('Mine · ');
    expect(card.textContent).not.toContain('Mine, Mine');
  });

  it('values an imported file got wrong are not shown raw: no "Invalid Date", no negative trim count', async () => {
    await fakeBrowser.storage.local.set({ songHistory: { 'bad|': song('Bad', { lastSeen: '<b>x</b>T00:00:00Z', trimmed: -5 }) } });
    await open(/Songs/);
    const card = document.querySelector('[data-song="bad|"]')!;
    expect(card.textContent).not.toContain('Invalid Date');
    expect(card.textContent).not.toContain('✂');
    expect(card.textContent).toContain('Mine'); // the channel still shows, without a date after it
    expect(card.textContent).not.toContain('Mine · ');
  });

  it('⬇ CSV saves the history', async () => {
    await stored();
    const saved = captureDownload();
    await open(/Songs/);
    fireEvent.click(screen.getByRole('button', { name: '⬇ CSV' }));
    expect(saved.name).toMatch(/^claimed-songs-\d{4}-\d\d-\d\d\.csv$/);
    const lines = (await saved.blob!.text()).split('\n');
    expect(lines[0]).toContain('"song","artists","label","claimants"');
    expect(lines[1]).toContain('"Beta","Lena","Lab","Co","audio","2","1","Mine; Other"');
  });
});

describe('tracklist fix', () => {
  const rows = [row('v1', 'c1', { segments: [[180, 360]] }), row('v1', 'c2', { segments: [[400, 420]] }), row('v2', 'c3')];
  const TXT = '00:00 A - One\n03:00 B - Two\n06:00 C - Three';
  const stored = (over: Record<string, unknown> = {}) => fakeBrowser.storage.local.set({
    'claimScan:UC1': scanOf(rows), uploads: [{ videoId: 'v1', txt: TXT }], ...over,
  });
  const out = () => (screen.getByRole('textbox', { name: 'New tracklist' }) as HTMLTextAreaElement).value;
  const src = () => screen.getByRole('textbox', { name: 'Original tracklist' }) as HTMLTextAreaElement;
  const toEditor = async (name = /Mix v1/) => {
    await open(/tracklist/);
    fireEvent.click(await screen.findByRole('button', { name }));
    await act(async () => {});
  };

  it('with no claimed video it says to scan first', async () => {
    await open(/tracklist/);
    expect(screen.getByText('No claimed videos yet — press "Scan claims" first')).toBeTruthy();
  });

  it('lists each claimed video once, and says where its tracklist will come from', async () => {
    await stored();
    await open(/tracklist/);
    const picks = await screen.findAllByRole('button', { name: /^Mix v/ });
    expect(picks).toHaveLength(2);
    await waitFor(() => expect(picks[0]!.textContent).toContain('10:00 · Tracklist from upload history'));
    expect(picks[1]!.textContent).toContain('10:00 · Paste tracklist manually');
  });

  it('the editor starts from the uploaded tracklist; ticking a range shows the tracklist after the cut', async () => {
    await stored();
    await toEditor();
    expect(screen.getByRole('heading', { name: '📝 Tracklist after copyright trim' })).toBeTruthy();
    expect(screen.getByText(/Mix v1 · original length 10:00/)).toBeTruthy();
    expect(screen.getByText(/tracklist pulled from upload history/)).toBeTruthy();
    expect(src().value).toBe(TXT);
    expect(screen.getByText('Tick the trimmed (or to-be-trimmed) ranges to see the result')).toBeTruthy();
    const ranges = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(ranges.map((c) => c.checked)).toEqual([false, false]);
    expect(ranges[0]!.closest('label')!.textContent).toBe('3:00–6:00 · Song c1');
    fireEvent.click(ranges[0]!);
    expect(out()).toBe('00:00 A - One\n03:00 C - Three');
    expect(screen.getByText('Trim 1 ranges · remove 1 songs: B - Two · 2 songs left')).toBeTruthy();
  });

  it('ranges already trimmed start ticked', async () => {
    await stored({ 'trimResults:UC1': { 'v1:c1': { state: 'saved', msg: '', date: '' } } });
    await toEditor();
    const ranges = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(ranges.map((c) => c.checked)).toEqual([true, false]);
    expect(ranges[0]!.closest('label')!.textContent).toBe('3:00–6:00 · Song c1 (trimmed)');
    expect(out()).toBe('00:00 A - One\n03:00 C - Three');
  });

  it('a video never uploaded from here: paste the tracklist, or drop a .txt', async () => {
    await stored();
    await toEditor(/Mix v2/);
    expect(screen.queryByText(/pulled from upload history/)).toBe(null);
    expect(src().value).toBe('');
    fireEvent.change(src(), { target: { value: '00:00 X - Y' } });
    expect(out()).toBe('00:00 X - Y');
    await act(async () => { fireEvent.drop(src(), { dataTransfer: { files: [new File([TXT], 'list.txt', { type: 'text/plain' })] } }); });
    await waitFor(() => expect(out()).toBe(TXT));
    await waitFor(() => expect(src().value).toBe(TXT));
  });

  it('several ranges can be ticked together', async () => {
    await stored();
    await toEditor();
    const ranges = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(ranges[0]!);
    fireEvent.click(ranges[1]!);
    expect(ranges.map((c) => c.checked)).toEqual([true, true]);
    expect(screen.getByText(/^Trim 2 ranges/)).toBeTruthy();
    fireEvent.click(ranges[0]!);
    expect(ranges.map((c) => c.checked)).toEqual([false, true]);
  });

  it('the last song is measured against the video\'s length', async () => {
    // the last song runs 6:00–10:00; cutting 6:20–9:20 takes more than half of it
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scanOf([row('v1', 'c1', { segments: [[380, 560]] })]), uploads: [{ videoId: 'v1', txt: TXT }] });
    await toEditor();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(out()).toBe('00:00 A - One\n03:00 B - Two');
  });

  it('a box emptied by hand stays empty (the uploaded tracklist does not come back)', async () => {
    await stored();
    await toEditor();
    fireEvent.change(src(), { target: { value: '' } });
    expect(src().value).toBe('');
    expect(out()).toBe('');
  });

  it('a .txt dropped on the box is taken here only: the panel\'s queue drop never sees it', async () => {
    await stored();
    const over = vi.fn();
    const drop = vi.fn();
    renderPanel(<div onDragOver={over} onDrop={drop}><CopyrightTab /></div>, fakePanel(), undefined, fakeClaims());
    await ready();
    pick(/tracklist/);
    fireEvent.click(await screen.findByRole('button', { name: /Mix v2/ }));
    await act(async () => {});
    const files = { files: [new File([TXT], 'list.txt', { type: 'text/plain' })], types: ['Files'] };
    expect(fireEvent.dragOver(src(), { dataTransfer: files })).toBe(false); // a drop is allowed here
    let unhandled = true;
    await act(async () => { unhandled = fireEvent.drop(src(), { dataTransfer: files }); });
    expect(unhandled).toBe(false); // the browser must not open the file
    await waitFor(() => expect(src().value).toBe(TXT));
    expect(over).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    // anything else dropped there is the panel's, as everywhere
    await act(async () => { fireEvent.drop(src(), { dataTransfer: { files: [new File(['x'], 'clip.mp4', { type: 'video/mp4' })], types: ['Files'] } }); });
    expect(drop).toHaveBeenCalledTimes(1);
    expect(src().value).toBe(TXT);
  });

  it('a .txt dropped while typing in the box shows in the box at once', async () => {
    await stored();
    await toEditor(/Mix v2/);
    src().focus();
    fireEvent.change(src(), { target: { value: 'typed' } });
    await act(async () => { fireEvent.drop(src(), { dataTransfer: { files: [new File([TXT], 'list.txt', { type: 'text/plain' })] } }); });
    await waitFor(() => expect(src().value).toBe(TXT));
    expect(document.activeElement).toBe(src());
    expect(out()).toBe(TXT);
  });

  it('a copy the browser refused says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await stored();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    try {
      await toEditor();
      fireEvent.click(screen.getByRole('button', { name: '📋 Copy new tracklist' }));
      await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't copy the tracklist (denied)"));
      expect(toast).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a claim with no range known says to rescan', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scanOf([row('v1', 'c1', { segments: [] })]) });
    await toEditor();
    expect(screen.getByText('No time range data — rescan claims first')).toBeTruthy();
  });

  it('Copy puts the new tracklist on the clipboard and says so', async () => {
    await stored();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      await toEditor();
      fireEvent.click(screen.getAllByRole('checkbox')[0]!);
      fireEvent.click(screen.getByRole('button', { name: '📋 Copy new tracklist' }));
      expect(writeText).toHaveBeenCalledWith('00:00 A - One\n03:00 C - Three');
      await waitFor(() => expect(toast).toHaveBeenCalledWith('New tracklist copied — paste it into the video description'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('upload history that could not be read leaves the editor usable', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await stored();
    await open(/tracklist/);
    const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(((k: unknown) => (k === 'uploads' ? Promise.reject(new Error('quota')) : get(k as never))) as never);
    fireEvent.click(await screen.findByRole('button', { name: /Mix v1/ }));
    await act(async () => {});
    expect(err).toHaveBeenCalledWith('[ytup] upload history', expect.any(Error));
    expect(src().value).toBe('');
    fireEvent.change(src(), { target: { value: '00:00 X - Y' } });
    expect(out()).toBe('00:00 X - Y');
  });

  it('Back returns to the picker', async () => {
    await stored();
    await toEditor();
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('heading', { name: '📝 Choose a video to fix its tracklist' })).toBeTruthy();
  });
});

// THAIB-1 review: what the sub-tabs must keep, give back and refuse.
describe('Tools tab review fixes', () => {
  const rows2 = [row('v1', 'c1', { segments: [[180, 360]] }), row('v2', 'c2')];
  const stored = () => fakeBrowser.storage.local.set({ 'claimScan:UC1': scanOf(rows2), 'trimQueue:UC1': ['v1:c1'], uploads: [{ videoId: 'v1', txt: '00:00 A - One' }] });
  const hours = () => screen.getByRole('textbox', { name: 'Run every N hours' }) as HTMLInputElement;
  const src = () => screen.getByRole('textbox', { name: 'Original tracklist' }) as HTMLTextAreaElement;

  it('while a scan or run is on, the claim list offers no Rescan and no Trim', async () => {
    await stored();
    const api = fakePanel();
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ state: scanning }));
    await ready();
    const trim = await screen.findByRole('button', { name: '✂ Trim selected (1)' }) as HTMLButtonElement;
    expect(trim.disabled).toBe(true);
    expect((screen.getByRole('button', { name: '↻ Rescan' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(trim);
    expect(screen.queryByRole('dialog')).toBe(null);
    expect(api.send).not.toHaveBeenCalled();
  });

  it('what was typed in a tool survives a switch to another tool, and a scan that opens its list', async () => {
    await stored();
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    pick(/Options/);
    fireEvent.change(hours(), { target: { value: '12' } });
    pick(/tracklist/);
    fireEvent.click(await screen.findByRole('button', { name: /Mix v1/ }));
    await act(async () => {});
    fireEvent.change(src(), { target: { value: '00:00 Typed - Here' } });
    pick(/Claim list/);
    r.rerender(wrap({ ...claims, shown: { view: 'claims', n: 1 } })); // a scan ended: its list opens
    pick(/Options/);
    expect(hours().value).toBe('12');
    pick(/tracklist/);
    expect(src().value).toBe('00:00 Typed - Here');
  });

  it('an edit in Options survives a cfg change made elsewhere; Cancel starts again from what is stored', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    pick(/Options/);
    fireEvent.change(hours(), { target: { value: '12' } });
    await act(async () => { await fakeBrowser.storage.local.set({ cfg: { apEveryHours: '3' } }); }); // another panel window saved
    expect(hours().value).toBe('12');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(hours().value).toBe('3');
  });

  it('Back in the tracklist editor gives the focus to the video it came from', async () => {
    await stored();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    pick(/tracklist/);
    fireEvent.click(await screen.findByRole('button', { name: /Mix v2/ }));
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Mix v2/ }));
  });

  it('a Studio tab running a copyright job elsewhere keeps this list from starting one', async () => {
    await fakeBrowser.storage.local.set({ 'adsScan:UC1': { date: '2026-01-01', total: 1, rows: [{ videoId: 'a', video: 'A', privacy: 'public', length: 1, ineligible: false, status: '' }] } });
    const elsewhere = claimsStateWith({ channel: 'UC2', busyRun: true, status: { icon: '✂️', kind: 'busy', title: 'Trimming claim 1 of 2', detail: '' } });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith(), live: elsewhere }));
    await ready();
    pick(/Ads/);
    expect((screen.getByRole('button', { name: '💰 Turn on ads (1)' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a tool is built the first time it shows, then kept', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    const songs = () => screen.queryByRole('heading', { name: /Previously claimed songs/, hidden: true });
    expect(songs()).toBe(null); // never opened: not there, hidden or not
    pick(/Songs/);
    expect(songs()).toBeTruthy();
    pick(/Claim list/);
    expect(songs()).toBeTruthy(); // hidden, still mounted
  });

  // The ch effect also sends an open tool back to Claims; without the channel's data the tab shows
  // Claims in the same render, not a selected tool with nothing under it.
  it('with the channel\'s data gone, the selected tool falls back to Claims', async () => {
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    pick(/Songs/);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockReturnValue(new Promise(() => {}) as never); // the next read never lands
    const moved = claimsStateWith({ channel: 'UC2', channelName: 'Second' });
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    expect(active(/Claim list/)).toBe(true);
    expect(screen.getAllByRole('tabpanel').at(-1)!.contains(screen.getByRole('button', { name: /Scan claims/ }))).toBe(true);
    expect(screen.queryByRole('heading', { name: /Previously claimed songs/ })).toBe(null);
  });
  // At Chrome's narrowest panel (320px) three tabs a row cut "Claim list (3)" to "Claim lis…" and
  // the Thai labels lost their counts (measured in Chrome). The groups take a third of the bar each;
  // Copyright's tools sit in a size container: two a row, four from 448px of it. happy-dom has no
  // layout or container queries, so this pins the classes; the widths are in the comments by the bars.
  it("three groups a row; Copyright's tools two a row when narrow, four from 448px of bar", async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    const groups = screen.getByRole('tablist', { name: 'Tools' });
    expect(groups.classList.contains('grid-cols-3')).toBe(true);
    expect(within(groups).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Copyright', 'Ads off', 'Collab']);
    const bar = screen.getByRole('tablist', { name: 'Copyright tools' });
    expect(bar.parentElement!.classList.contains('@container')).toBe(true);
    expect(bar.classList.contains('grid-cols-2')).toBe(true);
    expect(bar.classList.contains('@min-[448px]:grid-cols-4')).toBe(true);
    expect([...bar.classList].filter((c) => /^grid-cols-/.test(c))).toEqual(['grid-cols-2']); // no unconditional 3 or 4
    expect(within(bar).getAllByRole('tab')).toHaveLength(4);
  });

  // THAIB-1 review 3: a new channel remounts every tool, so only what shows there is built again.
  it('on another channel the tools opened on the last one are not built until they show', async () => {
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    pick(/Songs/);
    pick(/Claim list/);
    const moved = claimsStateWith({ channel: 'UC2', channelName: 'Second' });
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    await ready();
    expect(screen.queryByRole('heading', { name: /Previously claimed songs/, hidden: true })).toBe(null);
    pick(/Songs/);
    expect(screen.getByRole('heading', { name: /Previously claimed songs/ })).toBeTruthy();
  });

  // THAIB-1 review 3: scans take no lock (D26): another tab's run holds back Trim and Turn on ads,
  // not Rescan or Recheck, as it does not hold back Scan claims.
  it('another Studio tab running a job leaves Rescan and Recheck on, and Trim and Turn on ads off', async () => {
    const r1 = { videoId: 'a', video: 'A', privacy: 'public', length: 1, ineligible: false, status: '' };
    await fakeBrowser.storage.local.set({ 'adsScan:UC1': { date: '2026-01-01', total: 1, rows: [r1] } });
    const elsewhere = claimsStateWith({ channel: 'UC2', busyRun: true, status: { icon: '✂️', kind: 'busy', title: 'Trimming claim 1 of 2', detail: '' } });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith(), live: elsewhere }));
    await ready();
    pick(/Ads/);
    expect((screen.getByRole('button', { name: '↻ Recheck' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '💰 Turn on ads (1)' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('downloadCsv', () => {
  it('saves the rows under the name, through a link that is removed again', async () => {
    const saved = captureDownload();
    downloadCsv([['a', 'b'], [1, null]], 'x.csv');
    expect(saved.name).toBe('x.csv');
    expect(saved.blob!.type).toBe('text/csv');
    expect(await saved.blob!.text()).toBe('﻿"a","b"\n"1",""');
    expect(document.querySelector('a[download]')).toBe(null);
  });

  it('frees the file\'s URL once the browser has had time to save it', () => {
    vi.useFakeTimers();
    try {
      captureDownload();
      downloadCsv([['a']], 'x.csv');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10_000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    } finally {
      vi.useRealTimers();
    }
  });
});

// renderPanel()'s tree again with another ClaimsApi (a broadcast arriving).
const wrap = (claims: ClaimsApi) => (
  <PanelContext.Provider value={fakePanel()}>
    <LiveContext.Provider value={fakeLive()}>
      <ClaimsContext.Provider value={claims}>
        <AskProvider><CopyrightTab /></AskProvider>
      </ClaimsContext.Provider>
    </LiveContext.Provider>
  </PanelContext.Provider>
);

// What a click on the download link would save.
function captureDownload() {
  const saved: { name: string; blob: Blob | null } = { name: '', blob: null };
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { saved.blob = b as Blob; return 'blob:x'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.name = this.download; });
  return saved;
}
