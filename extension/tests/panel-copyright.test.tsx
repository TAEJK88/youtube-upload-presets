// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { ClaimsContext, LiveContext, PanelContext, type ClaimsApi } from '../entrypoints/sidepanel/panel';
import { PaneBoundary } from '../entrypoints/sidepanel/PaneBoundary';
import { CopyrightTab } from '../entrypoints/sidepanel/tabs/CopyrightTab';
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

describe('Copyright tab', () => {
  it('shows the status card and the buttons, with counts', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts }) }));
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Claim list \(4\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Claimed songs \(9\)/ })).toBeTruthy();
  });

  it('before a scan, the claim list has no count', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    expect(screen.getByRole('button', { name: 'Claim list' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claimed songs (0)' })).toBeTruthy();
  });

  it('Scan claims asks the bound tab', () => {
    const api = fakePanel();
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: /Scan claims/ }));
    expect(api.send).toHaveBeenCalledWith('claims:scan', 'claims');
  });

  it('a scan the tab never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ send: vi.fn(async () => { throw new Error('no receiver'); }) as never });
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: /Scan claims/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(RELOAD));
  });

  it('while scanning, the buttons hide and the card shows the progress', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: scanning }));
    expect(screen.getByText('Reading claim details 1 / 3: Mix')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33');
    expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null);
    expect(screen.queryByRole('button', { name: /Claim list/ })).toBe(null);
    expect(screen.getByRole('button', { name: /Fix tracklist/ })).toBeTruthy(); // the second row stays
  });

  it('another tab running copyright work: its card shows, with this tab\'s counts', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts }), live: { ...scanning, busyScan: false, busyRun: true } }));
    expect(screen.getByText("Scanning this channel's claims")).toBeTruthy();
    expect(screen.queryByText('Ready')).toBe(null);
    expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null);
  });

  it('another tab holding the lock, idle: this tab\'s counts, not that tab\'s', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts }), live: claimsStateWith({ counts: { ...counts, claims: 7, songs: 1 } }) }));
    expect(screen.getByRole('button', { name: 'Claim list (4)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claimed songs (9)' })).toBeTruthy();
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
    for (const name of [/Scan claims/, /Claim list/, /Claimed songs/, /Fix tracklist/]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByRole('button', { name: /Upload history/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('the lists open once the channel\'s data is read', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    const list = screen.getByRole('button', { name: /Claim list/ }) as HTMLButtonElement;
    expect(list.disabled).toBe(true);
    await waitFor(() => expect(list.disabled).toBe(false));
  });

  const ready = () => waitFor(() => expect((screen.getByRole('button', { name: /Claim list/ }) as HTMLButtonElement).disabled).toBe(false));

  it('a scan that ended in the bound tab opens its list', async () => {
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    r.rerender(wrap({ ...claims, shown: { view: 'claims', n: 1 } }));
    expect(await screen.findByRole('heading', { name: 'Copyright claims — Mine' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null); // the list's view took the tab
  });

  it('each view opens with its title and closes back to the tab', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    for (const [button, title] of [
      [/Claim list/, 'Copyright claims — Mine'], [/Claimed songs/, '🎵 Previously claimed songs'], [/Fix tracklist/, '📝 Choose a video to fix its tracklist'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('heading', { name: title })).toBe(null);
      expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
    }
  });

  it('follows the channel\'s stored data: a scan stored later shows in the open view', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Claim list/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /Claim list/ }));
    expect(screen.getByRole('heading', { name: 'Copyright claims — First' })).toBeTruthy();

    let fail!: (e: Error) => void;
    vi.spyOn(fakeBrowser.storage.local, 'get').mockReturnValue(new Promise((_, no) => { fail = no; }) as never);
    const moved = claimsStateWith({ channel: 'UC2', channelName: 'Second' });
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    // the read of UC2 is pending: no view over UC1's data, and nothing to open
    expect(screen.queryByRole('heading', { name: /Copyright claims/ })).toBe(null);
    for (const name of [/Claim list/, /Claimed songs/, /Fix tracklist/]) expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fail(new Error('storage gone')); });
    expect(screen.queryByRole('heading', { name: /Copyright claims/ })).toBe(null);
    expect((screen.getByRole('button', { name: /Claim list/ }) as HTMLButtonElement).disabled).toBe(true);
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
    expect(screen.getByRole('button', { name: 'Claimed songs (3)' })).toBeTruthy();
    // …and follow storage (another panel window, a scan in some Studio tab)
    await act(async () => { await fakeBrowser.storage.local.set({ logOpen: false, songHistory: { a: {} } }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Claimed songs (1)' })).toBeTruthy());
    expect(screen.queryByText(/Scan complete ✓/)).toBe(null);
  });

  it('a song history that is not an object counts as none', async () => {
    await fakeBrowser.storage.local.set({ songHistory: ['x', 'y'] });
    renderPanel(<CopyrightTab />, fakePanel({ target: null, link: 'noTab' }), undefined, fakeClaims({ state: null, live: null }));
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Claimed songs (0)' })).toBeTruthy();
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
  const b = screen.getByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  fireEvent.click(b);
  return api;
};
const SAVE_FAILED = ["Couldn't save (gone)", { id: 'save-failed' }] as const;

describe('views', () => {
  it('the claim list ticks through the background', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    const send = await mockSend();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts: { hasScan: true, scanDate: '', claims: 1, claimVideos: 1, songs: 0, hasAdsScan: false, adsTodo: 0 } }) }));
    fireEvent.click(await screen.findByRole('button', { name: /Claim list \(1\)/ }));
    fireEvent.click(await screen.findByTitle('Add to trim list'));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['v1:c1'] });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
  });

  it('a finished scan from this panel opens the list', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ shown: { view: 'claims', n: 1 } }));
    expect(await screen.findByText(/Copyright claims — Mine/)).toBeTruthy();
  });
});

describe('moving between the tab and its views', () => {
  const ready = () => waitFor(() => expect((screen.getByRole('button', { name: /Claim list/ }) as HTMLButtonElement).disabled).toBe(false));
  const moved = claimsStateWith({ channel: 'UC2', channelName: 'Second' });
  const both = () => fakeBrowser.storage.local.set({
    'claimScan:UC1': scanOf([row('v1', 'c1')]), 'claimScan:UC2': scanOf([row('w1', 'k1')]), uploads: [{ videoId: 'v1', txt: '00:00 A - One' }],
  });

  it('the bound tab moves to another channel: an open list closes instead of reopening on the new channel', async () => {
    await both();
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Claim list/ }));
    expect(screen.getByText('Mix v1')).toBeTruthy();
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    await ready(); // the new channel's data is read
    expect(screen.queryByRole('heading', { name: /Copyright claims/ })).toBe(null);
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
  });

  it('…and an open tracklist editor does not carry its video to the new channel', async () => {
    await both();
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Fix tracklist/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Mix v1/ }));
    expect(screen.getByRole('heading', { name: '📝 Tracklist after copyright trim' })).toBeTruthy();
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    await ready();
    expect(screen.queryByRole('heading', { name: /Tracklist after copyright trim/ })).toBe(null);
    expect(screen.queryByDisplayValue('00:00 A - One')).toBe(null);
  });

  it('a view opens at its top, and so does the tab on the way back', async () => {
    await both();
    const { container } = renderPanel(<div data-pane-scroll=""><CopyrightTab /></div>, fakePanel(), undefined, fakeClaims());
    const scroller = container.querySelector<HTMLElement>('[data-pane-scroll]')!;
    await ready();
    const at = (name: RegExp | string, role = 'button') => { scroller.scrollTop = 300; fireEvent.click(screen.getAllByRole(role, { name })[0]!); return scroller.scrollTop; };
    expect(at(/Claim list/)).toBe(0);
    expect(at('📝 Tracklist after trim')).toBe(0); // from far down the list
    expect(at('Close')).toBe(0);
    expect(at(/Fix tracklist/)).toBe(0);
    expect(at(/Mix v1/)).toBe(0); // picker to editor
  });

  it('opening a view moves focus to its title; Close gives it back to the button that opened it', async () => {
    await both();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    await ready();
    for (const [button, title] of [[/Claim list/, 'Copyright claims — Mine'], [/Fix tracklist/, '📝 Choose a video to fix its tracklist']] as const) {
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: title }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: button }));
    }
    // the picker's video opens the editor: focus follows to its title
    fireEvent.click(screen.getByRole('button', { name: /Fix tracklist/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Mix v1/ }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '📝 Tracklist after copyright trim' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Fix tracklist/ }));
    // the songs view starts in its search box, as the userscript's did
    fireEvent.click(screen.getByRole('button', { name: /Claimed songs/ }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search song, artist, label or claimant…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Claimed songs/ }));
  });

  it('a view closed by a channel change does not pull focus to a button', async () => {
    await both();
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Claim list/ }));
    r.rerender(wrap({ ...claims, state: moved, live: moved }));
    await ready();
    expect(document.activeElement).toBe(document.body);
    // …nor after an earlier Close: that Close is not remembered
    fireEvent.click(screen.getByRole('button', { name: /Claim list/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Claim list/ }));
    r.rerender(wrap(claims));
    await ready();
    expect(document.activeElement).toBe(document.body);
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

  it('Rescan closes the list and asks the bound tab', async () => {
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
    await waitFor(() => expect(toast).toHaveBeenCalledWith(RELOAD));
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
    await open(/Claimed songs/);
    expect(screen.getByText('No data yet — press "Scan claims" or import a CSV from the old script')).toBeTruthy();
    expect(screen.getByText('0 songs')).toBeTruthy();
  });

  it('one card per song, most claimed first', async () => {
    await stored();
    await open(/Claimed songs/);
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
    await open(/Claimed songs/);
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
    await open(/Claimed songs/);
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
    await open(/Claimed songs/);
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
    await open(/Claimed songs/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Press again to delete all' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(...SAVE_FAILED));
  });

  it('the list follows the stored history', async () => {
    await stored();
    await open(/Claimed songs/);
    await act(async () => { await fakeBrowser.storage.local.set({ songHistory: { 'alpha|ann': songs['alpha|ann'] } }); });
    await waitFor(() => expect(titles()).toEqual(['Alpha']));
  });

  it('Import CSV hands the file\'s text to the background and says how many songs it holds', async () => {
    const send = await mockSend();
    await open(/Claimed songs/);
    const text = 'song,artists\nOne,A\nTwo,B\n,C\n';
    await pick(csv(text));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Imported 2 songs into history'));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'songs', songs: { fn: 'import', text, now: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) } });
  });

  it('a file that is not a song history is refused, and nothing is written', async () => {
    const send = await mockSend();
    await open(/Claimed songs/);
    await pick(csv('video,url\nA,B\n'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('This is not a song history CSV (needs a song column)'));
    expect(send).not.toHaveBeenCalled();
  });

  it('an import the background never got says so, and does not claim it worked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockRejectedValue(new Error('gone'));
    await open(/Claimed songs/);
    await pick(csv('song\nOne\n'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(...SAVE_FAILED));
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('a file over the limit is refused before it is read', async () => {
    const send = await mockSend();
    await open(/Claimed songs/);
    const f = csv('song\nOne\n');
    Object.defineProperty(f, 'size', { value: SONGS_CSV_MAX + 1 });
    const text = vi.spyOn(f, 'text');
    await pick(f);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('This file is too large — the limit is 5 MB'));
    expect(text).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('a file at the limit is read', async () => {
    const send = await mockSend();
    await open(/Claimed songs/);
    const f = csv('song\nOne\n');
    Object.defineProperty(f, 'size', { value: SONGS_CSV_MAX });
    await pick(f);
    await waitFor(() => expect(send).toHaveBeenCalled());
  });

  it('a file that could not be read says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = await mockSend();
    await open(/Claimed songs/);
    const f = csv('song\nOne\n');
    vi.spyOn(f, 'text').mockRejectedValue(new Error('boom'));
    await pick(f);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't read the file (boom)"));
    expect(send).not.toHaveBeenCalled();
  });

  it('the file box is emptied after a pick, so the same file can be picked again', async () => {
    await mockSend();
    await open(/Claimed songs/);
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
    await open(/Claimed songs/);
    const card = document.querySelector('[data-song="solo|"]')!;
    expect(card.textContent).toContain('— · Lab');
    expect(card.textContent).toContain('Mine · ');
    expect(card.textContent).not.toContain('Mine, Mine');
  });

  it('values an imported file got wrong are not shown raw: no "Invalid Date", no negative trim count', async () => {
    await fakeBrowser.storage.local.set({ songHistory: { 'bad|': song('Bad', { lastSeen: '<b>x</b>T00:00:00Z', trimmed: -5 }) } });
    await open(/Claimed songs/);
    const card = document.querySelector('[data-song="bad|"]')!;
    expect(card.textContent).not.toContain('Invalid Date');
    expect(card.textContent).not.toContain('✂');
    expect(card.textContent).toContain('Mine'); // the channel still shows, without a date after it
    expect(card.textContent).not.toContain('Mine · ');
  });

  it('⬇ CSV saves the history', async () => {
    await stored();
    const saved = captureDownload();
    await open(/Claimed songs/);
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
    await open(/Fix tracklist/);
    fireEvent.click(await screen.findByRole('button', { name }));
    await act(async () => {});
  };

  it('with no claimed video it says to scan first', async () => {
    await open(/Fix tracklist/);
    expect(screen.getByText('No claimed videos yet — press "Scan claims" first')).toBeTruthy();
  });

  it('lists each claimed video once, and says where its tracklist will come from', async () => {
    await stored();
    await open(/Fix tracklist/);
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
    const b = screen.getByRole('button', { name: /Fix tracklist/ }) as HTMLButtonElement;
    await waitFor(() => expect(b.disabled).toBe(false));
    fireEvent.click(b);
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
    await open(/Fix tracklist/);
    const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(((k: unknown) => (k === 'uploads' ? Promise.reject(new Error('quota')) : get(k as never))) as never);
    fireEvent.click(await screen.findByRole('button', { name: /Mix v1/ }));
    await act(async () => {});
    expect(err).toHaveBeenCalledWith('[ytup] upload history', expect.any(Error));
    expect(src().value).toBe('');
    fireEvent.change(src(), { target: { value: '00:00 X - Y' } });
    expect(out()).toBe('00:00 X - Y');
  });

  it('Close returns to the tab', async () => {
    await stored();
    await toEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
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
