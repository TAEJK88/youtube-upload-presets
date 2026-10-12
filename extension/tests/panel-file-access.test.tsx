// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { useFileAccess } from '../entrypoints/sidepanel/file-access';
import { PanelContext, type PanelApi } from '../entrypoints/sidepanel/panel';
import { Banners } from '../entrypoints/sidepanel/shell/Banners';
import { QueueFooter } from '../entrypoints/sidepanel/tabs/QueueFooter';
import { handles } from '../lib/file-handles';
import * as fileStore from '../lib/file-store';
import { setLang } from '../lib/i18n';
import type { QueueView } from '../lib/studio/queue-view';
import { fakeChrome } from './fake-files';
import { fakePanel, viewWith } from './panel-fake';

// The side panel's banner, Re-grant button and Start, over a fake Chrome in which a file's
// read access lasts only while some page holds a handle object for it (tests/fake-files.ts).
vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
const bus = vi.hoisted(() => ({ lost: (_ids: string[], _tabId: number | undefined) => {} }));
vi.mock('../lib/panel/bus', async (orig) => ({
  ...(await orig<typeof import('../lib/panel/bus')>()),
  installBus: () => {},
  onFilesLost: (fn: typeof bus.lost) => { bus.lost = fn; return () => {}; },
}));

const BANNER = 'Files in the queue need read access again — the browser has withdrawn it';
const TOAST = 'The queued files need read access again — click "Re-grant access" in the side panel, then start again';
const ALWAYS = 'Always allow file access (one-time setup)';
const stuck = (n: number) => `The browser still does not allow reading ${n} file(s) — remove those videos from the queue and add the files again`;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const SUMMARY = { pendingN: 2, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: ['i0', 'i1'], editRev: 0, sig: 's', times: [], vis: 'PRIVATE', noTxt: 0, noThumb: 0, badTime: [], prevUp: [], badTl: [], needsConfirm: false };

// One Chrome, and the side panel page open in it right now.
function world(opts?: Parameters<typeof fakeChrome>[0]) {
  const chrome = fakeChrome(opts);
  const w = {
    chrome,
    page: chrome.page(),
    open() {
      w.page = chrome.page();
      vi.spyOn(fileStore, 'getHandle').mockImplementation((id) => w.page.load(id));
      vi.spyOn(fileStore, 'getHandles').mockImplementation((ids) => Promise.all(ids.map((id) => w.page.load(id))));
      vi.spyOn(fileStore, 'listIds').mockImplementation(() => w.page.list());
    },
    // A drop on the panel: stored, and held from then on (lib/panel/intake.ts storeHandles).
    async add(ids: string[]) {
      for (const id of ids) {
        const h = w.page.pick(`/v/${id}.mp4`);
        await w.page.put(id, h);
        handles.keep(id, h);
      }
    },
    // Everything not held is collected.
    gc: () => w.page.gc(handles.held().values()),
    // The panel closes (or the extension reloads): every handle object of the page is gone.
    close() {
      cleanup();
      handles.release([...handles.held().keys()]);
      w.page.close();
    },
    click: async (name: RegExp | string) => w.page.click(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
      await flush();
      await flush();
    }),
  };
  w.open();
  return w;
}

const sent: string[] = [];
function Panel({ view, onPreflight }: { view: QueueView; onPreflight?: () => void }) {
  const access = useFileAccess(view, (tabId) => tabId === 1, () => {});
  const send = (async (type: string) => {
    sent.push(type);
    if (type === 'queue:preflight') { onPreflight?.(); return SUMMARY; }
    return undefined;
  }) as unknown as PanelApi['send'];
  return (
    <PanelContext.Provider value={{ ...fakePanel({ view, send }), ...access }}>
      <AskProvider><Banners /><QueueFooter /><span data-testid="rev">{access.grantRev}</span></AskProvider>
    </PanelContext.Provider>
  );
}
const two = () => viewWith([{}, {}]);
const startButton = () => screen.getByRole('button', { name: /Upload \d video\(s\)/ }) as HTMLButtonElement;
const banner = () => screen.queryByText(BANNER);
const rev = () => Number(screen.getByTestId('rev').textContent);

beforeEach(() => {
  sent.length = 0;
  vi.mocked(toast).mockClear();
  setLang('en');
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  handles.release([...handles.held().keys()]);
  vi.restoreAllMocks();
});

describe('read access to queued files in the side panel', () => {
  it('clips added and left alone stay readable: the panel holds their handles through every collection', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    w.gc();
    w.gc();
    expect([w.chrome.state('/v/i0.mp4'), w.chrome.state('/v/i1.mp4')]).toEqual(['granted', 'granted']);
    expect(banner()).toBe(null);
    await w.click(/Upload 2 video/);
    expect(sent).toEqual(['queue:preflight', 'queue:start']);
    expect(w.chrome.requests).toEqual([]); // nothing to ask for
  });

  it('after an extension reload: the banner, one Re-grant click with no prompt, and the access stays', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    w.close();
    w.open();
    render(<Panel view={two()} />);
    await flush();
    expect(banner()).toBeTruthy();
    expect(rev()).toBe(0);
    await w.click('Re-grant access (2 files)');
    expect(rev()).toBe(1); // the cards read their previews again
    expect(vi.mocked(console.info).mock.calls.map((c) => c.join(' '))).toEqual(['[ytup] regrant i0: prompt -> granted', '[ytup] regrant i1: prompt -> granted']);
    expect(banner()).toBe(null);
    expect(toast).not.toHaveBeenCalled();
    w.gc(); // the handles the click asked on are the held ones
    expect([w.chrome.state('/v/i0.mp4'), w.chrome.state('/v/i1.mp4')]).toEqual(['granted', 'granted']);
    await w.click(/Upload 2 video/);
    expect(sent).toEqual(['queue:preflight', 'queue:start']);
  });

  it('after an extension reload, Start alone is enough: no Re-grant click, its own click asks and the run starts', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    w.close();
    w.open();
    const atPreflight: string[] = [];
    render(<Panel view={two()} onPreflight={() => atPreflight.push(w.chrome.state('/v/i0.mp4'), w.chrome.state('/v/i1.mp4'))} />);
    await flush();
    expect(banner()).toBeTruthy();
    expect(startButton().disabled).toBe(false); // the banner does not hold Start back
    await w.click(/Upload 2 video/);
    expect(atPreflight).toEqual(['granted', 'granted']);
    expect(sent).toEqual(['queue:preflight', 'queue:start']);
    expect(banner()).toBe(null);
    expect(rev()).toBe(1); // previews come back after Start's grant too
    expect(toast).not.toHaveBeenCalled();
    w.gc();
    expect([w.chrome.state('/v/i0.mp4'), w.chrome.state('/v/i1.mp4')]).toEqual(['granted', 'granted']);
  });

  it('a Re-grant click that changes nothing says so, and what to do instead (an older Chrome)', async () => {
    const w = world({ silentGrant: false });
    await w.add(['i0', 'i1']);
    w.close();
    w.open();
    render(<Panel view={two()} />);
    await flush();
    await w.click('Re-grant access (2 files)');
    expect(vi.mocked(console.info).mock.calls.map((c) => c.join(' '))).toEqual(['[ytup] regrant i0: prompt -> prompt', '[ytup] regrant i1: prompt -> prompt']);
    expect(toast).toHaveBeenCalledWith(stuck(2));
    expect(screen.getByRole('button', { name: 'Re-grant access (2 files)' })).toBeTruthy();
    // Start is not held back; its click asks too, gets nothing, and sends nothing to the tab.
    vi.mocked(toast).mockClear();
    expect(startButton().disabled).toBe(false);
    await w.click(/Upload 2 video/);
    expect(sent).toEqual([]);
    expect(vi.mocked(toast).mock.calls).toEqual([[stuck(2)]]);
    expect(rev()).toBe(1); // the Re-grant click's; Start changed nothing
  });

  it('looks again when the panel becomes visible: access withdrawn meanwhile shows without the queue changing', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    expect(banner()).toBe(null);
    w.chrome.revokeAll(); // an extension tab (the debug page) was closed a few seconds ago
    await flush();
    expect(banner()).toBe(null); // nothing told the panel
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(screen.getByRole('button', { name: 'Re-grant access (2 files)' })).toBeTruthy();
  });

  it('…and when its window gets the focus', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    w.chrome.revokeAll();
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(banner()).toBeTruthy();
  });

  it('Start looks again and asks inside its own click: access withdrawn since the last look costs no extra step', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    const atPreflight: string[] = [];
    render(<Panel view={two()} onPreflight={() => atPreflight.push(w.chrome.state('/v/i0.mp4'), w.chrome.state('/v/i1.mp4'))} />);
    await flush();
    w.chrome.revokeAll();
    expect(startButton().disabled).toBe(false); // the panel's last look said granted
    await w.click(/Upload 2 video/);
    // Asked before anything went to the tab: the preflight and its question can outlast the click.
    expect(atPreflight).toEqual(['granted', 'granted']);
    expect(sent).toEqual(['queue:preflight', 'queue:start']);
    expect(banner()).toBe(null);
    expect(toast).not.toHaveBeenCalled();
  });

  it('Start that cannot get the access back sends nothing to the tab: the banner shows, and the toast names no button', async () => {
    const w = world({ silentGrant: false });
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    w.chrome.revokeAll();
    await w.click(/Upload 2 video/);
    expect(sent).toEqual([]);
    expect(screen.getByRole('button', { name: 'Re-grant access (2 files)' })).toBeTruthy();
    expect(vi.mocked(toast).mock.calls).toEqual([[stuck(2)]]);
    expect(startButton().disabled).toBe(false); // free to be pressed again
  });

  it('a blocked file shows in the banner but does not hold Start back: it fails its own item', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    w.chrome.block('/v/i1.mp4');
    render(<Panel view={two()} />);
    await flush();
    expect(screen.getByRole('button', { name: 'Re-grant access (1 files)' })).toBeTruthy();
    expect(startButton().disabled).toBe(false);
    await w.click(/Upload 2 video/);
    expect(sent).toEqual(['queue:preflight', 'queue:start']);
    expect(toast).not.toHaveBeenCalled();
    // The click on Re-grant asks, and says the block stays.
    await w.click('Re-grant access (1 files)');
    expect(toast).toHaveBeenCalledWith(stuck(1));
    expect(screen.getByRole('button', { name: 'Re-grant access (1 files)' })).toBeTruthy();
  });

  it('Start asks only for the files the run reads: not an error card\'s', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    w.close();
    w.open();
    render(<Panel view={viewWith([{}, { status: 'error' }])} />);
    await flush();
    await w.click('Re-grant access (2 files)');
    w.chrome.revokeAll();
    w.chrome.requests.length = 0;
    await w.click(/Upload 1 video/);
    expect(w.chrome.requests).toEqual(['/v/i0.mp4']);
    expect(sent).toEqual(['queue:preflight', 'queue:start']);
    expect(screen.getByRole('button', { name: 'Re-grant access (1 files)' })).toBeTruthy(); // the error card's file, found by Start's look
  });

  it('the banner\'s "Always allow" opens the allow page in a tab and asks nothing here; back from it, the banner is gone with no other click', async () => {
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    const w = world();
    await w.add(['i0', 'i1']);
    w.close();
    w.open();
    render(<Panel view={two()} />);
    await flush();
    expect(screen.getByRole('button', { name: 'Re-grant access (2 files)' })).toBeTruthy();
    await w.click(ALWAYS);
    expect(create).toHaveBeenCalledWith({ url: browser.runtime.getURL('/allow.html') });
    expect(w.chrome.requests).toEqual([]);
    expect(banner()).toBeTruthy(); // nothing changed yet
    expect(rev()).toBe(0);
    // In that tab: one question, answered "Allow on every visit".
    const tab = w.chrome.page('tab');
    w.chrome.answers.push('always');
    const h = (await tab.load('i0'))!;
    await tab.click(() => h.requestPermission());
    tab.close();
    window.dispatchEvent(new Event('focus')); // back in the Studio window
    await flush();
    expect(banner()).toBe(null);
    expect(rev()).toBe(1); // the cards read their previews again
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(rev()).toBe(1); // nothing came back this time
    expect(toast).not.toHaveBeenCalled();
    await w.click(/Upload 2 video/);
    expect(sent).toEqual(['queue:preflight', 'queue:start']);
  });

  it('"Always allow" also answers a Studio tab\'s report: the banner does not wait for a Re-grant click that has nothing to ask', async () => {
    vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    const w = world();
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    act(() => bus.lost(['i1'], 1));
    await flush();
    await w.click(ALWAYS);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(banner()).toBe(null);
    expect(toast).not.toHaveBeenCalled();
  });

  it('a Studio tab that could not read a file: the banner and its button are there when the tab\'s toast arrives', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    // This panel reads both files; the tab's bridge said 'permission' for one. The tab's toast
    // (TOAST) and the item's message name the Re-grant button: it must be on screen.
    act(() => bus.lost(['i1', 'not-queued'], 1));
    expect(TOAST).toContain('"Re-grant access"');
    expect(screen.getByRole('button', { name: 'Re-grant access (1 files)' })).toBeTruthy();
    await flush();
    expect(screen.getByRole('button', { name: 'Re-grant access (1 files)' })).toBeTruthy(); // the panel's own look does not take it away
    // A tab this panel does not follow is not listened to.
    act(() => bus.lost(['i0'], 7));
    expect(screen.getByRole('button', { name: 'Re-grant access (1 files)' })).toBeTruthy();
    // The click has nothing to ask Chrome for: it says so, in the log and to the user.
    await w.click('Re-grant access (1 files)');
    expect(vi.mocked(console.info).mock.calls.map((c) => c.join(' '))).toEqual(['[ytup] regrant i1: granted -> granted (a Studio tab could not read it)']);
    expect(toast).toHaveBeenCalledWith(stuck(1));
    expect(banner()).toBe(null);
  });

  it('a Studio tab that could not read a file this panel cannot read either: one click fixes it, no message', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    w.chrome.revokeAll();
    act(() => bus.lost(['i0', 'i1'], 1));
    await flush(); // the report makes the panel look again
    await w.click('Re-grant access (2 files)');
    expect(banner()).toBe(null);
    expect(toast).not.toHaveBeenCalled();
    expect(startButton().disabled).toBe(false);
  });

  it('a tab\'s report makes the panel look at every queued file again, not only the reported one', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    render(<Panel view={two()} />);
    await flush();
    w.chrome.revokeAll();
    act(() => bus.lost(['i0'], 1));
    await flush();
    expect(screen.getByRole('button', { name: 'Re-grant access (2 files)' })).toBeTruthy();
  });

  it('keeps holding a file that is stored but not in the queue view: just added, or being uploaded', async () => {
    const w = world();
    await w.add(['i0', 'i1', 'new']); // 'new' was dropped a moment ago: the view does not show it yet
    const { rerender } = render(<Panel view={two()} />);
    await flush();
    rerender(<Panel view={viewWith([{}, { status: 'uploading' }])} />); // i1 is in flight: not "queued" for the panel
    await flush();
    expect([...handles.held().keys()]).toEqual(['i0', 'i1', 'new']);
    w.gc();
    expect([w.chrome.state('/v/i1.mp4'), w.chrome.state('/v/new.mp4')]).toEqual(['granted', 'granted']);
  });

  it('lets go of the handles of files that left the queue', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    const { rerender } = render(<Panel view={two()} />);
    await flush();
    w.chrome.remove('i1'); // the tab removed the item and had its handle deleted
    rerender(<Panel view={viewWith([{}])} />);
    await flush();
    expect([...handles.held().keys()]).toEqual(['i0']);
    w.gc();
    expect([w.chrome.refs('/v/i0.mp4'), w.chrome.refs('/v/i1.mp4')]).toEqual([1, 0]);
  });

  it('two side panels (two windows): the second holds its own handles, so closing the first loses nothing', async () => {
    const w = world();
    await w.add(['i0', 'i1']);
    const second = w.chrome.page();
    const held = [await second.load('i0'), await second.load('i1')]; // what the other window's panel keeps
    w.close();
    second.gc(held as FileSystemFileHandle[]);
    expect([w.chrome.state('/v/i0.mp4'), w.chrome.state('/v/i1.mp4')]).toEqual(['granted', 'granted']);
  });
});
