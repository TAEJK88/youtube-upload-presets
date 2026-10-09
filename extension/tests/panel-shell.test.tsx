// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { App } from '../entrypoints/sidepanel/App';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { LiveContext, PanelContext, type PanelApi } from '../entrypoints/sidepanel/panel';
import { ActivityBar } from '../entrypoints/sidepanel/shell/ActivityBar';
import { Banners } from '../entrypoints/sidepanel/shell/Banners';
import { ChannelBar } from '../entrypoints/sidepanel/shell/ChannelBar';
import { setLang } from '../lib/i18n';
import * as fileStore from '../lib/file-store';
import { toPanelData } from '../lib/panel/data';
import { fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

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
    const other = fakePanel({ data: twoChannels(), elsewhere: true, runner: { tabId: 9, windowId: 2, title: 'Other' } });
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
    fireEvent.click(screen.getByRole('button', { name: /Uploading 1\/2/ }));
    expect(go).toHaveBeenCalledWith('queue');
  });

  it('is hidden when nothing runs', () => {
    renderPanel(<ActivityBar onGo={() => {}} />, fakePanel({ view: viewWith([{ status: 'pending' }]) }));
    expect(screen.queryByText(/Uploading/)).toBe(null);
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
    const api = fakePanel({ runner: { tabId: 9, windowId: 2, title: 'Other' }, elsewhere: true });
    renderPanel(<Banners />, api);
    expect(screen.getByText('Another Studio tab is running the queue — change the queue there')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to that tab' }));
    await flush();
    expect(update).toHaveBeenCalledWith(9, { active: true });
    expect(focus).toHaveBeenCalledWith(2, { focused: true });
    expect(api.refresh).toHaveBeenCalled();
    cleanup();
    renderPanel(<Banners />, fakePanel({ runner: { tabId: 1, windowId: 1, title: 'This' }, elsewhere: false }));
    expect(screen.queryByRole('button', { name: 'Go to that tab' })).toBe(null);
  });

  it('re-grant: counts the queued files that lost read access, asks for all of them in one click', async () => {
    const perm: Record<string, PermissionState> = { i0: 'prompt', t0: 'prompt', i1: 'granted', i2: 'prompt' };
    const request = vi.fn(async function (this: { id: string }) { perm[this.id] = 'granted'; return 'granted' as PermissionState; });
    vi.spyOn(fileStore, 'getHandle').mockImplementation(async (id) => ({
      id, queryPermission: async () => perm[id]!, requestPermission: request,
    }) as unknown as FileSystemFileHandle);
    const view = viewWith([
      { thumb: { id: 't0', src: 'bridge', name: 'Clip 1.jpg', size: 1, type: 'image/jpeg' } },
      { status: 'error' },
      { status: 'done' }, // done: its file is not needed any more
    ]);
    const api = fakePanel({ view });
    renderPanel(<Banners />, api);
    await flush();
    expect(screen.getByText('Files in the queue need read access again after a browser restart')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Re-grant access (2 files)' }));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Files in the queue need read access again after a browser restart')).toBe(null);
    expect(api.refresh).toHaveBeenCalled();
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
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Upload3', 'Presets', 'Copyright', 'Settings']);
    act(() => {
      setLang('th');
      setApi({ ...api, lang: 'th' });
    });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['อัปโหลด3', 'พรีเซ็ต', 'ลิขสิทธิ์', 'ตั้งค่า']);
  });

  it('the Copyright tab is a placeholder; the activity bar goes back to Upload', () => {
    renderPanel(<App />, fakePanel({ view: viewWith([{ status: 'uploading' }]) }), fakeLive({ liveState: state({ running: true }) }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Copyright/ }));
    expect(screen.getByRole('tab', { name: /Copyright/ }).getAttribute('data-state')).toBe('active');
    expect(screen.getByText('Copyright scan and trim arrive in a later version of the extension')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Uploading 1\/1/ }));
    expect(screen.getByRole('tab', { name: /Upload/ }).getAttribute('data-state')).toBe('active');
  });
});
