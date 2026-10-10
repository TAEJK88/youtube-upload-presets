// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { ClaimsContext, LiveContext, PanelContext, type ClaimsApi } from '../entrypoints/sidepanel/panel';
import { PaneBoundary } from '../entrypoints/sidepanel/PaneBoundary';
import { CopyrightTab } from '../entrypoints/sidepanel/tabs/CopyrightTab';
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
    expect(screen.queryByRole('status')).toBe(null);
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

  it('a scan that ended in the bound tab opens its list', async () => {
    const claims = fakeClaims();
    const r = renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    await waitFor(() => expect((screen.getByRole('button', { name: /Claim list/ }) as HTMLButtonElement).disabled).toBe(false));
    r.rerender(wrap({ ...claims, shown: { view: 'claims', n: 1 } }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null)); // the list's view took the tab
  });

  it('the activity log opens, and keeps that choice', async () => {
    const send = vi.spyOn(await import('../lib/messages'), 'sendMessage').mockResolvedValue(undefined as never);
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ log: [{ at: Date.UTC(2026, 0, 1, 10, 5), msg: 'Scan complete ✓', type: 'ok' }] }));
    expect(screen.queryByText(/Scan complete ✓/)).toBe(null);
    const toggle = screen.getByRole('button', { name: 'Show activity ▾' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByText(/Scan complete ✓/).className).toContain('text-ok');
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
    expect(screen.getByRole('button', { name: 'Hide activity ▴' })).toBeTruthy();
  });

  it('a log choice the background never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockRejectedValue(new Error('gone'));
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: 'Show activity ▾' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(RELOAD));
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

  it('a render error stays inside the pane', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = fakeClaims({ state: claimsStateWith({ status: null as never }) });
    renderPanel(<PaneBoundary><CopyrightTab /></PaneBoundary>, fakePanel(), undefined, broken);
    expect(screen.getByRole('alert').textContent).toContain('This tab hit an error');
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
