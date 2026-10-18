// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { App } from '../entrypoints/sidepanel/App';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { LiveContext, PanelContext, type PanelApi } from '../entrypoints/sidepanel/panel';
import { ActivityBar } from '../entrypoints/sidepanel/shell/ActivityBar';
import { Banners } from '../entrypoints/sidepanel/shell/Banners';
import { ChannelBar } from '../entrypoints/sidepanel/shell/ChannelBar';
import { QueueFooter } from '../entrypoints/sidepanel/tabs/QueueFooter';
import { setLang } from '../lib/i18n';
import { ICONS } from '../lib/studio/dom';
import { toPanelData } from '../lib/panel/data';
import { claimsStateWith, fakeClaims, fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
beforeEach(() => {
  vi.mocked(toast).mockClear();
  setLang('en');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setLang('en');
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const twoChannels = () => toPanelData({ channels: [{ id: 'UC1', name: 'Mine', avatar: '', handle: '@mine' }, { id: 'UC2', name: 'Two', avatar: '', handle: '@two' }] });

describe('channel bar', () => {
  it('locks to the current channel, and unlocks', async () => {
    const api = fakePanel();
    renderPanel(<ChannelBar />, api);
    expect(screen.getByText('Mine')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lock channel/ }));
    expect(api.write.settings).toHaveBeenCalledWith({ lockChannel: { id: 'UC1', name: 'Mine' } });
    await flush();
    expect(toast).toHaveBeenCalledWith('Locked to channel "Mine". Uploads will be blocked on other channels');
    cleanup();
    const locked = fakePanel({ data: toPanelData({ settings: { lockChannel: { id: 'UC1', name: 'Mine' } } }) });
    renderPanel(<ChannelBar />, locked);
    fireEvent.click(screen.getByRole('button', { name: /Locked/ }));
    expect(locked.write.settings).toHaveBeenCalledWith({ lockChannel: null });
  });

  it('toasts the lock only after the write resolves', async () => {
    let done!: () => void;
    const api = fakePanel();
    vi.mocked(api.write.settings).mockImplementation(() => new Promise<void>((r) => { done = r; }));
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: /Lock channel/ }));
    expect(toast).not.toHaveBeenCalled();
    done();
    await flush();
    expect(toast).toHaveBeenCalledWith('Locked to channel "Mine". Uploads will be blocked on other channels');
  });

  it('a rejected lock or unlock write shows a failure toast, not the success one', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel();
    vi.mocked(api.write.settings).mockRejectedValue(new Error('boom'));
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: /Lock channel/ }));
    await flush();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Couldn't save (boom)", { id: 'save-failed' });
    expect(err).toHaveBeenCalled();
    cleanup();
    vi.mocked(toast).mockClear();
    const locked = fakePanel({ data: toPanelData({ settings: { lockChannel: { id: 'UC1', name: 'Mine' } } }) });
    vi.mocked(locked.write.settings).mockRejectedValue(new Error('boom'));
    renderPanel(<ChannelBar />, locked);
    fireEvent.click(screen.getByRole('button', { name: /Locked/ }));
    await flush();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Couldn't save (boom)", { id: 'save-failed' });
  });

  it('channel add clears the input only on success; add and remove failures toast', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ data: twoChannels() });
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    const input = screen.getByPlaceholderText('Channel ID UC… or channel link') as HTMLInputElement;
    const id = 'UCbbbbbbbbbbbbbbbbbbbbbb';
    vi.mocked(api.write.channels).mockRejectedValueOnce(new Error('boom'));
    fireEvent.change(input, { target: { value: id } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await flush();
    expect(input.value).toBe(id);
    expect(toast).toHaveBeenCalledWith("Couldn't save (boom)", { id: 'save-failed' });
    expect(err).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await flush();
    expect(input.value).toBe('');
    vi.mocked(toast).mockClear();
    vi.mocked(api.write.channels).mockRejectedValueOnce(new Error('nope'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from list' })[0]!);
    await flush();
    expect(toast).toHaveBeenCalledWith("Couldn't save (nope)", { id: 'save-failed' });
  });

  it('cannot lock without a channel id', () => {
    const api = fakePanel({ view: viewWith([], { channel: { id: '', name: '', avatar: '', handle: '', label: 'Unknown channel', problem: '' } }) });
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: /Lock channel/ }));
    expect(api.write.settings).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Could not detect the channel ID. Open the Dashboard or Content page first');
  });

  it('shows the lock problem instead of the id', () => {
    const problem = 'Currently on channel "Mine" but locked to "Other"';
    renderPanel(<ChannelBar />, fakePanel({ view: viewWith([], { channel: { ...state().channel, problem } }) }));
    expect(screen.getByText(problem)).toBeTruthy();
  });

  it('channel list: add by id or link, switch through the switcher, open this one in a new tab', () => {
    const api = fakePanel({ data: twoChannels() });
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    expect(screen.getByText(/this tab/)).toBeTruthy();
    const input = screen.getByPlaceholderText('Channel ID UC… or channel link');
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(toast).toHaveBeenCalledWith('No channel ID found (starts with UC, 24 characters)');
    fireEvent.change(input, { target: { value: 'https://youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const fn = vi.mocked(api.write.channels).mock.calls[0]![0];
    expect(fn([])).toEqual([{ id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: '', avatar: '', handle: '' }]);
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    expect(api.send).toHaveBeenCalledWith('channel:switch', { name: 'Two', handle: '@two', next: 'https://studio.youtube.com/channel/UC2/videos' });
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    fireEvent.click(screen.getByRole('button', { name: /New tab$/ }));
    expect(create).toHaveBeenCalledWith({ url: 'https://studio.youtube.com/channel/UC1/videos' });
  });

  it('a new tab the browser refuses is logged through the shared openTab, not left unhandled', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.tabs, 'create').mockRejectedValue(new Error('No window'));
    renderPanel(<ChannelBar />, fakePanel({ data: twoChannels() }));
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    fireEvent.click(screen.getByRole('button', { name: /New tab$/ }));
    await vi.waitFor(() => expect(err).toHaveBeenCalledWith('[ytup] open tab failed', 'https://studio.youtube.com/channel/UC1/videos', expect.any(Error)));
  });

  it('says so in the panel when the switch fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(async () => { throw new Error('channel:switch: next must be a Studio URL'); }) as unknown as PanelApi['send'];
    renderPanel(<ChannelBar />, fakePanel({ data: twoChannels(), send }));
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    await flush();
    expect(err).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Couldn't switch channels (channel:switch: next must be a Studio URL)");
  });

  it('looks up the @handle of a channel without one, remembers it and switches by it', async () => {
    const page = '"externalId":"UC2","vanityChannelUrl":"http://www.youtube.com/@two"';
    const get = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(page));
    const api = fakePanel({ data: toPanelData({ channels: [{ id: 'UC1', name: 'Mine', avatar: '', handle: '@mine' }, { id: 'UC2', name: 'Two', avatar: '', handle: '' }] }) });
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    await flush();
    expect(get).toHaveBeenCalledWith('https://www.youtube.com/channel/UC2', { credentials: 'omit' });
    const fn = vi.mocked(api.write.channels).mock.calls[0]![0];
    expect(fn([{ id: 'UC2', name: 'Two', avatar: '', handle: '' }])).toEqual([{ id: 'UC2', name: 'Two', avatar: '', handle: '@two' }]);
    expect(api.send).toHaveBeenCalledWith('channel:switch', { name: 'Two', handle: '@two', next: 'https://studio.youtube.com/channel/UC2/videos' });
  });

  it('does not switch by name when no @handle is found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no channel here'));
    const api = fakePanel({ data: toPanelData({ channels: [{ id: 'UC1', name: 'Mine', avatar: '', handle: '@mine' }, { id: 'UC2', name: 'Two', avatar: '', handle: '' }] }) });
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    await flush();
    expect(api.send).not.toHaveBeenCalled();
    expect(api.write.channels).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(`Couldn't find the @handle of "Two", so not switching (picking by name could open the wrong channel). Use YouTube's own Switch account instead`);
  });

  it('refuses to switch while a run is in progress, here or in another Studio tab — files waiting do not block it', () => {
    const running = "Upload queue is still running — switching channels now would stop it";
    const here = fakePanel({ data: twoChannels() });
    renderPanel(<ChannelBar />, here, fakeLive({ liveState: state({ running: true }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    expect(here.send).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(running);
    cleanup();
    vi.mocked(toast).mockClear();
    const other = fakePanel({ data: twoChannels(), elsewhere: true, runner: { tabId: 9, windowId: 2, title: 'Other', jobs: ['queue'] } });
    renderPanel(<ChannelBar />, other);
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    expect(other.send).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(running);
    cleanup();
    const queued = fakePanel({ data: twoChannels(), view: viewWith([{ status: 'pending' }, { status: 'pending' }]) });
    renderPanel(<ChannelBar />, queued);
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    expect(queued.send).toHaveBeenCalledWith('channel:switch', expect.objectContaining({ name: 'Two' }));
  });
});

describe('activity bar', () => {
  it('shows the run in progress and its share done', () => {
    const api = fakePanel({ view: viewWith([{ status: 'uploading' }, { status: 'pending' }]) });
    const go = vi.fn();
    renderPanel(<ActivityBar onGo={go} />, api, fakeLive({ liveState: state({ running: true, prog: { pct: 0.5, text: 'Uploading 50%' } }) }));
    expect(screen.getByText('Uploading 1/2')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    // The activity's emoji is drawn as its icon (emojiIcon(a.icon, 15), 4122).
    const bar = screen.getByRole('button', { name: /Uploading 1\/2/ });
    expect(bar.textContent).not.toContain('⬆');
    expect(bar.querySelector('svg path')?.getAttribute('d')).toBe(ICONS.upload);
    fireEvent.click(screen.getByRole('button', { name: /Uploading 1\/2/ }));
    expect(go).toHaveBeenCalledWith('queue');
  });

  it('is hidden when nothing runs', () => {
    renderPanel(<ActivityBar onGo={() => {}} />, fakePanel({ view: viewWith([{ status: 'pending' }]) }));
    expect(screen.queryByText(/Uploading/)).toBe(null);
  });

  it('the activity bar shows a copyright job when the queue is idle', () => {
    renderPanel(<ActivityBar onGo={() => {}} />, fakePanel(), fakeLive(), fakeClaims({
      live: claimsStateWith({ status: { icon: '🔍', kind: 'busy', title: "Scanning this channel's claims", detail: 'Reading video list…', progress: null } }),
    }));
    expect(screen.getByText("Scanning this channel's claims")).toBeTruthy();
  });

  it('the upload wins over a copyright job, and an idle copyright status shows nothing', () => {
    const busy = fakeClaims({ live: claimsStateWith({ status: { icon: '🔍', kind: 'busy', title: "Scanning this channel's claims", detail: '', progress: 0.5 } }) });
    renderPanel(<ActivityBar onGo={() => {}} />, fakePanel(), fakeLive({ liveState: state({ running: true }) }), busy);
    expect(screen.queryByText("Scanning this channel's claims")).toBe(null);
    cleanup();
    const { container } = renderPanel(<ActivityBar onGo={() => {}} />, fakePanel(), fakeLive(), fakeClaims());
    expect(container.textContent).toBe('');
  });
});

describe('banners', () => {
  const notConnected = 'This tab is not connected to the extension yet — reload this tab';
  it('"not connected": only once the link says noScript, and reloads the bound tab', () => {
    renderPanel(<Banners />, fakePanel({ link: 'loading' }));
    expect(screen.queryByText(notConnected)).toBe(null);
    cleanup();
    const reload = vi.spyOn(browser.tabs, 'reload').mockResolvedValue(undefined as never);
    renderPanel(<Banners />, fakePanel({ link: 'noScript' }));
    expect(screen.getByText(notConnected)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reload this tab' }));
    expect(reload).toHaveBeenCalledWith(1);
  });

  it('runner elsewhere: says so and goes to that tab', async () => {
    const update = vi.spyOn(browser.tabs, 'update').mockResolvedValue({} as never);
    const focus = vi.spyOn(browser.windows, 'update').mockResolvedValue({} as never);
    const api = fakePanel({ runner: { tabId: 9, windowId: 2, title: 'Other', jobs: ['queue'] }, elsewhere: true });
    renderPanel(<Banners />, api);
    expect(screen.getByText('Another Studio tab is running the queue — change the queue there')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to that tab' }));
    await flush();
    expect(update).toHaveBeenCalledWith(9, { active: true });
    expect(focus).toHaveBeenCalledWith(2, { focused: true });
    expect(api.refresh).toHaveBeenCalled();
    cleanup();
    renderPanel(<Banners />, fakePanel({ runner: { tabId: 1, windowId: 1, title: 'This', jobs: ['queue'] }, elsewhere: false }));
    expect(screen.queryByRole('button', { name: 'Go to that tab' })).toBe(null);
  });

  it('another tab busy with copyright work: its own banner, and Start is disabled', () => {
    renderPanel(<><Banners /><QueueFooter /></>, fakePanel({ runner: { tabId: 2, windowId: 1, title: 'B', jobs: ['claims'] }, busyElsewhere: true, view: viewWith([{}]) }));
    expect(screen.getByText('Another Studio tab is busy with copyright work — wait for it, or press Stop in the Tools tab')).toBeTruthy();
    expect(screen.queryByText('Another Studio tab is running the queue — change the queue there')).toBe(null);
    expect((screen.getByRole('button', { name: /Upload 1 video\(s\)/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  // What decides the list and what the click does: tests/panel-file-access.test.tsx.
  it('re-grant: one banner for every queued file without read access, one button for all of them', async () => {
    const api = fakePanel({ view: viewWith([{}, {}]), noAccess: [{ id: 'i0', state: 'prompt' }, { id: 'i1', state: 'denied' }] });
    renderPanel(<Banners />, api);
    expect(screen.getByText('Files in the queue need read access again — the browser has withdrawn it')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Re-grant access (2 files)' }));
    expect(api.regrant).toHaveBeenCalledTimes(1);
    // The once-and-for-all way, next to it: a short name, and both on a row of their own under
    // the text (two buttons do not fit beside it in a 320px panel; happy-dom has no layout, so
    // this pins the classes).
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    const always = screen.getByRole('button', { name: 'Always allow…' });
    await act(async () => fireEvent.click(always));
    expect(create).toHaveBeenCalledWith({ url: browser.runtime.getURL('/allow.html') });
    expect(api.regrant).toHaveBeenCalledTimes(1);
    const row = always.parentElement!;
    expect(row).toBe(screen.getByRole('button', { name: 'Re-grant access (2 files)' }).parentElement);
    expect(row.className).toContain('basis-full');
    expect(row.className).toContain('flex-wrap');
    expect(row.parentElement!.getAttribute('role')).toBe('status');
    expect(row.parentElement!.className).toContain('flex-wrap');
    create.mockRestore();
    setLang('th');
    cleanup();
    renderPanel(<Banners />, api);
    expect(screen.getByRole('button', { name: 'อนุญาตตลอดไป…' })).toBeTruthy();
    setLang('en');
    cleanup();
    renderPanel(<Banners />, fakePanel({ view: viewWith([{}, {}]) }));
    expect(screen.queryByRole('button', { name: /Re-grant access/ })).toBe(null);
    expect(screen.queryByRole('button', { name: /Always allow/ })).toBe(null);
  });

  it('banners are announced to screen readers', () => {
    renderPanel(<Banners />, fakePanel({ link: 'noScript' }));
    expect(screen.getByRole('status').textContent).toContain('This tab is not connected to the extension yet');
  });
});

// Call 7: the Studio tab starts nothing while the Tampermonkey userscript is in its page; the
// panel says why, first of all banners (it explains why Start does nothing).
describe('userscript banner', () => {
  const sentence = /^The Tampermonkey script is still on in this tab — turn it off in Tampermonkey, then reload this tab\./;
  it('shows while the tab says the userscript is in its page, and not otherwise', () => {
    renderPanel(<Banners />, fakePanel());
    expect(screen.queryByText(sentence)).toBe(null);
    cleanup();
    renderPanel(<Banners />, fakePanel({ view: null }));
    expect(screen.queryByText(sentence)).toBe(null);
    cleanup();
    renderPanel(<Banners />, fakePanel({ view: viewWith([], { userscript: true }) }));
    expect(screen.getByText(sentence)).toBeTruthy();
  });
  it('comes before the other banners', () => {
    renderPanel(<Banners />, fakePanel({ link: 'noScript', view: viewWith([], { userscript: true }) }));
    const all = screen.getAllByRole('status').map((b) => b.textContent);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatch(sentence);
  });
});

describe('update banner', () => {
  // The stored answer must not reach the other tests of this file, in either direction.
  beforeEach(() => { fakeBrowser.reset(); });
  afterEach(() => { fakeBrowser.reset(); });
  const REL = 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/v9.9.9';
  it('shows "Update available" with the two versions and opens the release page', async () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '5.0.0' } as never);
    await browser.storage.local.set({ updateCheck: { at: 1, latest: '9.9.9', url: REL } });
    const open = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    renderPanel(<Banners />, fakePanel());
    await flush();
    expect(screen.getByText('Update available: version 9.9.9 (you have 5.0.0)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Get the update' }));
    expect(open).toHaveBeenCalledWith({ url: REL });
  });
  it('a release page the browser refuses to open is logged through the shared openTab', async () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '5.0.0' } as never);
    await browser.storage.local.set({ updateCheck: { at: 1, latest: '9.9.9', url: REL } });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.tabs, 'create').mockRejectedValue(new Error('No window'));
    renderPanel(<Banners />, fakePanel());
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Get the update' }));
    await vi.waitFor(() => expect(err).toHaveBeenCalledWith('[ytup] open tab failed', REL, expect.any(Error)));
  });
  it('shows nothing when the stored version is not above the installed one, and follows a later check', async () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '5.0.0' } as never);
    await browser.storage.local.set({ updateCheck: { at: 1, latest: '5.0.0', url: REL } });
    renderPanel(<Banners />, fakePanel());
    await flush();
    expect(screen.queryByText(/Update available/)).toBeNull();
    await act(async () => { await browser.storage.local.set({ updateCheck: { at: 2, latest: '9.9.9', url: REL } }); });
    await flush();
    expect(screen.getByText(/Update available/)).toBeTruthy();
  });
});

describe('shell', () => {
  // Holds the api in state, with a children element made once: only context consumers
  // re-render when it changes.
  let setApi: (a: PanelApi) => void = () => {};
  function Host({ first, children }: { first: PanelApi; children: ReactNode }) {
    const [api, set] = useState(first);
    setApi = set;
    return (
      <PanelContext.Provider value={api}>
        <LiveContext.Provider value={fakeLive()}><AskProvider>{children}</AskProvider></LiveContext.Provider>
      </PanelContext.Provider>
    );
  }

  it('four tabs in the drawer\'s order, with the Upload count; labels follow a language change', () => {
    const api = fakePanel({ view: viewWith([{}, {}, {}]) });
    render(<Host first={api}><App /></Host>);
    expect(within(screen.getAllByRole('tablist')[0]!).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Upload3', 'Presets', 'Tools', 'Settings']);
    act(() => {
      setLang('th');
      setApi({ ...api, lang: 'th' });
    });
    expect(within(screen.getAllByRole('tablist')[0]!).getAllByRole('tab').map((t) => t.textContent)).toEqual(['อัปโหลด3', 'พรีเซ็ต', 'เครื่องมือ', 'ตั้งค่า']);
  });

  it('the Copyright tab opens on its status; the activity bar goes back to Upload', () => {
    renderPanel(<App />, fakePanel({ view: viewWith([{ status: 'uploading' }]) }), fakeLive({ liveState: state({ running: true }) }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Tools/ }));
    expect(screen.getByRole('tab', { name: /Tools/ }).getAttribute('data-state')).toBe('active');
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Uploading 1\/1/ }));
    expect(screen.getByRole('tab', { name: /Upload/ }).getAttribute('data-state')).toBe('active');
  });

  // P5-row-tab-choice: openDrawer(tab) (3488) — the Studio button during a run, the "queue finished"
  // notification, a multi-file pick in Studio's own dialog. The request is the background's, in
  // storage.session (lib/panel-tab.ts); the panel is bound to tab 1 (fakePanel).
  describe('a request to show a tab', () => {
    const active = () => within(screen.getAllByRole('tablist')[0]!).getAllByRole('tab').find((t) => t.getAttribute('data-state') === 'active')?.textContent;
    const request = (tabId: number, tab: string, at = Date.now()) => act(async () => {
      await browser.storage.session.set({ panelTab: { tabId, tab, at } });
      await new Promise((r) => setTimeout(r, 0));
    });
    beforeEach(() => fakeBrowser.reset());

    it('an open panel switches to it; a request for another Studio tab is not taken', async () => {
      renderPanel(<App />);
      await flush();
      expect(active()).toBe('Upload');
      await request(1, 'claims');
      expect(active()).toBe('Tools');
      await request(2, 'queue');
      expect(active()).toBe('Tools');
      await request(1, 'queue');
      expect(active()).toBe('Upload');
    });

    it('a panel that opens because of it shows that tab', async () => {
      await browser.storage.session.set({ panelTab: { tabId: 1, tab: 'claims', at: Date.now() - 800 } });
      renderPanel(<App />);
      await flush();
      expect(active()).toBe('Tools');
    });

    it('a panel opened long after it shows its own tab', async () => {
      await browser.storage.session.set({ panelTab: { tabId: 1, tab: 'claims', at: Date.now() - 60_000 } });
      renderPanel(<App />);
      await flush();
      expect(active()).toBe('Upload');
    });

    it("the user's own choice after it wins: the same request is not applied again when the panel binds to the tab again", async () => {
      const api = fakePanel();
      render(<Host first={api}><App /></Host>);
      await flush();
      await request(1, 'claims');
      expect(active()).toBe('Tools');
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Settings/ }));
      expect(active()).toBe('Settings');
      // the window's active tab moves to another Studio tab and back, within the request's 10 s
      act(() => setApi({ ...api, target: { ...api.target!, tabId: 2 } }));
      await flush();
      act(() => setApi(api));
      await flush();
      expect(active()).toBe('Settings');
    });

    // review B-1: the panel follows the tab it is bound to now, not the first one it was bound to
    it('bound to another Studio tab: that tab\'s request is taken, the first tab\'s no longer', async () => {
      const api = fakePanel();
      render(<Host first={api}><App /></Host>);
      await flush();
      act(() => setApi({ ...api, target: { ...api.target!, tabId: 2 } }));
      await flush();
      await request(2, 'claims');
      expect(active()).toBe('Tools');
      await request(1, 'settings');
      expect(active()).toBe('Tools');
    });

    it('no Studio tab bound: nothing is read or followed', async () => {
      const get = vi.spyOn(browser.storage.session, 'get');
      renderPanel(<App />, fakePanel({ target: null }));
      await flush();
      await request(1, 'claims');
      expect(get).not.toHaveBeenCalled();
      expect(active()).toBe('Upload');
    });
  });
});
