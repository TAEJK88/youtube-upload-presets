// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { ClaimsContext, LiveContext, PanelContext } from '../entrypoints/sidepanel/panel';
import { AdsView } from '../entrypoints/sidepanel/tabs/copyright/AdsView';
import { CollabView } from '../entrypoints/sidepanel/tabs/copyright/CollabView';
import { setLang } from '../lib/i18n';
import { claimsWrite, toClaimsData, type ClaimsData } from '../lib/panel/claims-data';
import { adsInitial, adsWhere, collabWhere } from '../lib/panel/claims-runs';
import { claimsStateWith, fakeClaims, fakeLive, fakePanel, renderPanel } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
// The handles are written through the background (claims:op); here the write is watched.
vi.mock('../lib/panel/claims-data', async (orig) => ({ ...(await orig<typeof import('../lib/panel/claims-data')>()), claimsWrite: vi.fn(async () => undefined) }));

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(toast).mockClear();
  vi.mocked(claimsWrite).mockReset().mockResolvedValue(undefined as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setLang('en');
});

const RELOAD = 'This tab is not connected to the extension yet — reload this tab';
const ads = [
  { videoId: 'a', video: 'A', privacy: 'public', length: 1, ineligible: false, status: '' },
  { videoId: 'b', video: 'B', privacy: 'private', length: 1, ineligible: false, status: '' },
  { videoId: 'c', video: 'C', privacy: 'public', length: 1, ineligible: true, status: '' },
];
const vids = [{ videoId: 'x', video: 'Lofi Mix', privacy: 'public', length: 1 }, { videoId: 'y', video: 'Jazz', privacy: 'private', length: 1 }];

describe('ads and Collab picks', () => {
  it('starts with the eligible ones not turned on yet (5293)', () => {
    expect(adsInitial({ date: '', total: 3, rows: ads }, { b: { state: 'on', msg: '', date: '' } })).toEqual(['a']);
    // one that failed is tried again
    expect(adsInitial({ date: '', total: 3, rows: ads }, { a: { state: 'failed', msg: 'x', date: '' } })).toEqual(['a', 'b']);
  });
  it('the chips (5323–5326)', () => {
    expect(adsWhere('settings', ads)).toEqual(['a', 'b']);
    expect(adsWhere('public', ads)).toEqual(['a']);
    expect(adsWhere('all', ads)).toEqual(['a', 'b', 'c']);
    expect(adsWhere('none', ads)).toEqual([]);
  });
  it('Collab chips act on the rows the search shows (5517–5538)', () => {
    const res = { y: { state: 'failed', msg: '', date: '' } };
    expect(collabWhere('shown', vids, res, 'lofi')).toEqual({ add: ['x'], del: [] });
    expect(collabWhere('public', vids, res, '')).toEqual({ add: ['x'], del: ['y'] });
    expect(collabWhere('never', vids, res, '')).toEqual({ add: ['x'], del: ['y'] });
    expect(collabWhere('failed', vids, res, '')).toEqual({ add: ['y'], del: ['x'] });
    expect(collabWhere('none', vids, res, ' JAZZ ')).toEqual({ add: [], del: ['y'] });
  });
});

const state = claimsStateWith();
const adsData = (over: Record<string, unknown> = {}) =>
  toClaimsData('UC1', { 'adsScan:UC1': { date: '2026-01-01T00:00:00.000Z', total: 9, rows: ads }, ...over });
const collabData = (over: Record<string, unknown> = {}) =>
  toClaimsData('UC1', { 'collabScan:UC1': { date: '2026-01-01T00:00:00.000Z', total: 2, rows: vids }, ...over });
// renderPanel's tree, for a rerender with new data (another tree would remount the view).
function mount(ui: (d: ClaimsData) => ReactElement, data: ClaimsData, api = fakePanel()) {
  const live = fakeLive();
  const claims = fakeClaims();
  const wrap = (d: ClaimsData) => (
    <PanelContext.Provider value={api}>
      <LiveContext.Provider value={live}>
        <ClaimsContext.Provider value={claims}>
          <AskProvider>{ui(d)}</AskProvider>
        </ClaimsContext.Provider>
      </LiveContext.Provider>
    </PanelContext.Provider>
  );
  const r = renderPanel(ui(data), api, live, claims);
  return { ...r, api, to: (d: ClaimsData) => r.rerender(wrap(d)) };
}
const box = (name: string | RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('Ads view', () => {
  it('lists the videos with ads off, the eligible ones ticked, and says what was turned on or failed', () => {
    renderPanel(<AdsView data={adsData({ 'adsResults:UC1': { b: { state: 'on', msg: '', date: '' }, c: { state: 'failed', msg: 'No switch', date: '' } } })} state={state} busy={false} idle />);
    expect(screen.getByRole('heading', { name: '💰 Videos with ads off — Mine' })).toBeTruthy();
    expect(screen.getByText(/^3 of 9 videos · 2 only turned off in settings · checked /)).toBeTruthy();
    expect([box('A').checked, box('B').checked, box('C').checked]).toEqual([true, false, false]);
    expect(screen.getByText('⚠ YouTube says ineligible')).toBeTruthy();
    expect(screen.getAllByText('Ads off (setting)').length).toBe(2);
    expect(screen.getByText('✅ Turned on')).toBeTruthy();
    expect(screen.getByText('❌ No switch')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBe(null); // a sub-tab: nothing to close
  });

  it('Turn on ads (N) sends the ticked ids in the list\'s order', () => {
    const api = fakePanel();
    renderPanel(<AdsView data={adsData()} state={state} busy={false} idle />, api);
    expect(button('💰 Turn on ads (2)')).toBeTruthy();
    fireEvent.click(box('C'));
    fireEvent.click(box('A'));
    expect(button('💰 Turn on ads (2)')).toBeTruthy();
    fireEvent.click(box('A')); // ticked last, first in the list
    fireEvent.click(button('💰 Turn on ads (3)'));
    expect(api.send).toHaveBeenCalledWith('claims:ads', ['a', 'b', 'c']);
  });

  it('a newer scan under the open view (Recheck) starts the ticks again from its own rows', () => {
    const next = [{ videoId: 'n1', video: 'New 1', privacy: 'public', length: 1, ineligible: false, status: '' }, { videoId: 'n2', video: 'New 2', privacy: 'public', length: 1, ineligible: true, status: '' }];
    const v = mount((d) => <AdsView data={d} state={state} busy={false} idle />, adsData());
    fireEvent.click(box('C'));
    v.to(adsData()); // the same scan again (another key changed): the ticks stay
    expect(button('💰 Turn on ads (3)')).toBeTruthy();
    v.to(adsData({ 'adsScan:UC1': { date: '2026-02-02T00:00:00.000Z', total: 9, rows: next } }));
    expect([box('New 1').checked, box('New 2').checked]).toEqual([true, false]);
    fireEvent.click(button('💰 Turn on ads (1)'));
    expect(v.api.send).toHaveBeenCalledWith('claims:ads', ['n1']);
  });

  it('the chips tick exactly their rows; with nothing ticked the button is off', () => {
    const api = fakePanel();
    renderPanel(<AdsView data={adsData()} state={state} busy={false} idle />, api);
    fireEvent.click(button('Public only'));
    expect([box('A').checked, box('B').checked, box('C').checked]).toEqual([true, false, false]);
    fireEvent.click(button('All'));
    expect(button('💰 Turn on ads (3)')).toBeTruthy();
    fireEvent.click(button('Only off in settings'));
    expect([box('A').checked, box('B').checked, box('C').checked]).toEqual([true, true, false]);
    fireEvent.click(button('None'));
    expect(button('💰 Turn on ads (0)').disabled).toBe(true);
    expect(api.send).not.toHaveBeenCalled();
  });

  it('Recheck asks the tab for a new ads scan', () => {
    const api = fakePanel();
    renderPanel(<AdsView data={adsData()} state={state} busy={false} idle />, api);
    fireEvent.click(button('↻ Recheck'));
    expect(api.send).toHaveBeenCalledWith('claims:scan', 'ads');
  });

  it('a tab that does not take the message is said once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ send: vi.fn(async () => { throw new Error('No response'); }) as never });
    renderPanel(<AdsView data={adsData()} state={state} busy={false} idle />, api);
    fireEvent.click(button('💰 Turn on ads (2)'));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(RELOAD, { id: 'not-connected' }));
  });

  it('an empty list says every video has ads on', () => {
    renderPanel(<AdsView data={adsData({ 'adsScan:UC1': { date: '2026-01-01', total: 0, rows: [] } })} state={state} busy={false} idle />);
    expect(screen.getByText('🎉 All videos have ads on')).toBeTruthy();
    expect(button('💰 Turn on ads (0)').disabled).toBe(true);
  });

  it('in Thai', () => {
    setLang('th');
    renderPanel(<AdsView data={adsData()} state={state} busy={false} idle />);
    expect(screen.getByRole('heading', { name: '💰 คลิปที่ปิดโฆษณา — Mine' })).toBeTruthy();
    expect(button('💰 เปิดโฆษณา (2)')).toBeTruthy();
    expect(button('↻ เช็กใหม่')).toBeTruthy();
  });
  // THAIB-1 review: the list stays open while its run goes on; nothing new starts from it meanwhile.
  it('while the tab is busy, Turn on ads and Recheck are off and send nothing', () => {
    const api = fakePanel();
    renderPanel(<AdsView data={adsData()} state={state} busy idle={false} />, api);
    expect(button('💰 Turn on ads (2)').disabled).toBe(true);
    expect(button('↻ Recheck').disabled).toBe(true);
    fireEvent.click(button('💰 Turn on ads (2)'));
    expect(api.send).not.toHaveBeenCalled();
  });
  // THAIB-1 review 2: the list stays mounted after its run; a second press must not redo the batch.
  it('a video the run turned on leaves the picks; a failed one stays, and a tick by hand still holds', () => {
    const v = mount((d) => <AdsView data={d} state={state} busy={false} idle />, adsData());
    expect(button('💰 Turn on ads (2)')).toBeTruthy(); // A and B: eligible, not on
    const results = { 'adsResults:UC1': { a: { state: 'on', msg: '', date: '' }, b: { state: 'failed', msg: 'No switch', date: '' } } };
    v.to(adsData(results));
    expect([box('A').checked, box('B').checked]).toEqual([false, true]);
    expect(button('💰 Turn on ads (1)')).toBeTruthy();
    fireEvent.click(box('A')); // ticked again on purpose
    v.to(adsData(results)); // the same results read again
    expect(box('A').checked).toBe(true);
  });
});

describe('Collab view', () => {
  const handles = () => screen.getByRole('textbox', { name: 'Channels to invite' }) as HTMLInputElement;

  it('lists the videos unticked, with the stored handles, the invite links and past results', () => {
    renderPanel(<CollabView data={collabData({
      collabHandles: '@a, @b', 'collabLinks:UC1': { '@a': 'https://studio.youtube.com/invite/1' },
      'collabResults:UC1': { x: { state: 'done', msg: 'Invited @a', date: '' }, y: { state: 'failed', msg: 'No dialog', date: '' } },
    })} state={state} busy={false} idle />);
    expect(screen.getByRole('heading', { name: '🤝 Collab — Mine' })).toBeTruthy();
    expect(screen.getByText(/^2 videos · read .* covers every video\)$/)).toBeTruthy();
    expect(handles().value).toBe('@a, @b');
    expect([box('Lofi Mix').checked, box('Jazz').checked]).toEqual([false, false]);
    expect(screen.getByText('@a: https://studio.youtube.com/invite/1')).toBeTruthy();
    expect(screen.getByText('✅ Invited @a')).toBeTruthy();
    expect(screen.getByText('❌ No dialog')).toBeTruthy();
    expect(button('🤝 Invite (0 videos)').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Close' })).toBe(null); // a sub-tab: nothing to close
  });

  it('Invite without a handle says so and stays; with one it sends the ticked ids and the handles', () => {
    const api = fakePanel();
    renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />, api);
    fireEvent.click(box('Jazz'));
    fireEvent.click(button('🤝 Invite (1 videos)'));
    expect(toast).toHaveBeenCalledWith('Enter the @handle of the channel to invite first');
    expect(api.send).not.toHaveBeenCalled();
    fireEvent.change(handles(), { target: { value: 'a, @b' } });
    fireEvent.click(box('Lofi Mix'));
    fireEvent.click(button('🤝 Invite (2 videos)'));
    expect(api.send).toHaveBeenCalledWith('claims:collab', { videoIds: ['x', 'y'], handles: ['@a', '@b'] });
  });

  it('the handles are saved a moment after the typing stops, once', () => {
    vi.useFakeTimers();
    renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />);
    fireEvent.change(handles(), { target: { value: '@a' } });
    vi.advanceTimersByTime(300);
    fireEvent.change(handles(), { target: { value: '@ab' } });
    vi.advanceTimersByTime(399);
    expect(claimsWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(claimsWrite).toHaveBeenCalledTimes(1);
    expect(claimsWrite).toHaveBeenCalledWith({ op: 'set', key: 'collabHandles', value: '@ab' });
  });

  it('handles the timer saved are not written again when the view closes', () => {
    vi.useFakeTimers();
    const r = renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />);
    fireEvent.change(handles(), { target: { value: '@a' } });
    vi.advanceTimersByTime(400);
    r.unmount();
    expect(claimsWrite).toHaveBeenCalledTimes(1);
  });

  it('handles typed right before the side panel itself closes are saved (no React cleanup runs then)', () => {
    vi.useFakeTimers();
    renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />);
    fireEvent.change(handles(), { target: { value: '@gone' } });
    window.dispatchEvent(new Event('pagehide'));
    expect(claimsWrite).toHaveBeenCalledWith({ op: 'set', key: 'collabHandles', value: '@gone' });
    vi.advanceTimersByTime(1000);
    expect(claimsWrite).toHaveBeenCalledTimes(1);
  });

  it('a newer scan under the open view (Reload list) starts with nothing ticked', () => {
    const v = mount((d) => <CollabView data={d} state={state} busy={false} idle />, collabData());
    fireEvent.click(box('Jazz'));
    v.to(collabData({ collabHandles: '@a' })); // the same scan again: the tick stays
    expect(button('🤝 Invite (1 videos)')).toBeTruthy();
    v.to(collabData({ 'collabScan:UC1': { date: '2026-02-02T00:00:00.000Z', total: 1, rows: [{ videoId: 'n1', video: 'New 1', privacy: 'public', length: 1 }] } }));
    expect(box('New 1').checked).toBe(false);
    expect(button('🤝 Invite (0 videos)').disabled).toBe(true);
  });

  it('handles typed right before the view closes are still saved', () => {
    vi.useFakeTimers();
    const r = renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />);
    fireEvent.change(handles(), { target: { value: '@late' } });
    r.unmount();
    expect(claimsWrite).toHaveBeenCalledWith({ op: 'set', key: 'collabHandles', value: '@late' });
    vi.advanceTimersByTime(1000);
    expect(claimsWrite).toHaveBeenCalledTimes(1);
  });

  it('a handles write that fails is a failed save, not a tab that is not connected', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(claimsWrite).mockRejectedValue(new Error('boom'));
    const r = renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />);
    fireEvent.change(handles(), { target: { value: '@a' } });
    r.unmount();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't save (boom)", { id: 'save-failed' }));
    expect(toast).not.toHaveBeenCalledWith(RELOAD, expect.anything());
  });

  it('the search hides rows, and the chips act on the rows shown only', () => {
    renderPanel(<CollabView data={collabData({ 'collabResults:UC1': { y: { state: 'failed', msg: 'No dialog', date: '' } } })} state={state} busy={false} idle />);
    fireEvent.click(button('Failed only'));
    expect([box('Lofi Mix').checked, box('Jazz').checked]).toEqual([false, true]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search video titles…' }), { target: { value: 'lofi' } });
    expect(screen.queryByRole('checkbox', { name: 'Jazz' })).toBe(null);
    fireEvent.click(button('All shown'));
    expect(button('🤝 Invite (2 videos)')).toBeTruthy(); // Jazz is hidden and stays ticked
    fireEvent.click(button('None'));
    expect(button('🤝 Invite (1 videos)')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search video titles…' }), { target: { value: '' } });
    fireEvent.click(button('Not invited yet'));
    expect([box('Lofi Mix').checked, box('Jazz').checked]).toEqual([true, false]);
    fireEvent.click(button('Public only'));
    expect([box('Lofi Mix').checked, box('Jazz').checked]).toEqual([true, false]);
  });

  it('Copy puts the invite link on the clipboard and says whose it is', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderPanel(<CollabView data={collabData({ 'collabLinks:UC1': { '@a': 'https://l/1' } })} state={state} busy={false} idle />);
    fireEvent.click(button('Copy'));
    expect(writeText).toHaveBeenCalledWith('https://l/1');
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Copied @a's link"));
    vi.unstubAllGlobals();
  });

  it('a clipboard that refuses is said as a failed copy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    renderPanel(<CollabView data={collabData({ 'collabLinks:UC1': { '@a': 'https://l/1' } })} state={state} busy={false} idle />);
    fireEvent.click(button('Copy'));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't copy"));
    vi.unstubAllGlobals();
  });

  it('Reload list asks the tab for a new Collab scan; a tab that does not answer is said', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ send: vi.fn(async () => { throw new Error('No response'); }) as never });
    renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />, api);
    fireEvent.click(button('↻ Reload list'));
    expect(api.send).toHaveBeenCalledWith('claims:scan', 'collab');
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(RELOAD, { id: 'not-connected' }));
  });

  it('a channel with no videos says so', () => {
    renderPanel(<CollabView data={collabData({ 'collabScan:UC1': { date: '2026-01-01', total: 0, rows: [] } })} state={state} busy={false} idle />);
    expect(screen.getByText('This channel has no videos yet')).toBeTruthy();
  });

  it('in Thai', () => {
    setLang('th');
    renderPanel(<CollabView data={collabData()} state={state} busy={false} idle />);
    expect(screen.getByRole('textbox', { name: 'ช่องที่จะเชิญ' })).toBeTruthy();
    expect(button('🤝 เชิญ (0 คลิป)')).toBeTruthy();
    expect(button('↻ อ่านรายการใหม่')).toBeTruthy();
  });

  it('while the tab is busy, Invite and Reload list are off and send nothing', () => {
    const api = fakePanel();
    renderPanel(<CollabView data={collabData()} state={state} busy idle={false} />, api);
    fireEvent.change(handles(), { target: { value: '@a' } });
    fireEvent.click(box('Jazz'));
    expect(button('🤝 Invite (1 videos)').disabled).toBe(true);
    expect(button('↻ Reload list').disabled).toBe(true);
    fireEvent.click(button('🤝 Invite (1 videos)'));
    expect(api.send).not.toHaveBeenCalled();
  });

  it('a video the run invited leaves the picks; a failed one stays ticked to retry', () => {
    const v = mount((d) => <CollabView data={d} state={state} busy={false} idle />, collabData());
    fireEvent.click(box('Lofi Mix'));
    fireEvent.click(box('Jazz'));
    expect(button('🤝 Invite (2 videos)')).toBeTruthy();
    v.to(collabData({ 'collabResults:UC1': { x: { state: 'done', msg: '', date: '' }, y: { state: 'failed', msg: 'No dialog', date: '' } } }));
    expect([box('Lofi Mix').checked, box('Jazz').checked]).toEqual([false, true]);
    expect(button('🤝 Invite (1 videos)')).toBeTruthy();
  });
});
