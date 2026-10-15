// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { PresetsFooter, PresetsTab } from '../entrypoints/sidepanel/tabs/PresetsTab';
import { toPanelData } from '../lib/panel/data';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { ClaimsContext, LiveContext, PanelContext } from '../entrypoints/sidepanel/panel';
import { fakeClaims, fakeLive, fakePanel, renderPanel } from './panel-fake';
import type { PanelApi } from '../entrypoints/sidepanel/panel';
import type { Preset } from '../lib/presets';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
beforeEach(() => vi.mocked(toast).mockClear());
afterEach(cleanup);

// The stored list (and default) coming back from storage: the panel re-renders with new data.
const echo = (view: ReturnType<typeof renderPanel>, api: PanelApi, presets: Preset[], activeId = api.data!.activeId, ui = <PresetsTab />) =>
  view.rerender(
    <PanelContext.Provider value={{ ...api, data: { ...api.data!, presets, activeId } }}>
      <LiveContext.Provider value={fakeLive()}><ClaimsContext.Provider value={fakeClaims()}>
        <AskProvider>{ui}</AskProvider>
      </ClaimsContext.Provider></LiveContext.Provider>
    </PanelContext.Provider>,
  );
// happy-dom's setRangeText assigns `this.value`, which React's value tracker sees (so no
// onChange); a browser changes the value natively. Do it the browser's way here.
const nativeRangeText = (f: HTMLInputElement) => {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  f.setRangeText = function (this: HTMLInputElement, text: string, start?: number, end?: number) {
    const v = this.value;
    setValue.call(this, v.slice(0, start) + text + v.slice(end));
  } as HTMLInputElement['setRangeText'];
};
const item = (label: string) => screen.getByText(label).closest('[role="button"]') as HTMLElement;

describe('presets tab', () => {
  it('edits the default preset and previews it', () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    const title = screen.getByLabelText('Video title') as HTMLInputElement;
    expect(title.value).toBe('TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}');
    // the preview fills four names from the preset's artist pool
    const names = screen.getByText(/^TrapSoul Mix \| /).textContent!.replace(/^TrapSoul Mix \| | - Dark.*$/g, '').split(', ');
    expect(names).toHaveLength(4);
    expect(api.data!.presets[0]!.artistPriority).toEqual(expect.arrayContaining(names));
    fireEvent.change(title, { target: { value: '{name} {oops}' } });
    const saved = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    expect(saved[0]!.title).toBe('{name} {oops}');
    expect(saved.slice(1)).toEqual(api.data!.presets.slice(1));
  });

  it('edits the artist pool as chips', () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    const pool = () => vi.mocked(api.write.presets).mock.calls.at(-1)![0][0]!.artistPriority!;
    const before = api.data!.presets[0]!.artistPriority!;
    const add = screen.getByLabelText('Add an artist') as HTMLInputElement;
    fireEvent.change(add, { target: { value: 'Tems, sza, Giveon,' } }); // a comma adds; a name already there is not added twice
    expect(pool()).toEqual([...before, 'Tems', 'Giveon']);
    fireEvent.change(add, { target: { value: 'Drake' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(pool().at(-1)).toBe('Drake');
    fireEvent.click(screen.getByLabelText('Remove SZA'));
    expect(pool()).not.toContain('SZA');
  });

  it('warns about unknown variables', () => {
    const presets = toPanelData({}).presets;
    presets[0]!.title = '{name} {oops}';
    renderPanel(<PresetsTab />, fakePanel({ data: toPanelData({ presets }) }));
    expect(screen.getByText(/Unknown variable \{oops\}/)).toBeTruthy();
  });

  it('set as default, and the EP counter', async () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    fireEvent.click(screen.getByText('🎧 Playlist + Tracklist'));
    // the success toast waits for the write
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Set as default' })));
    expect(api.write.activeId).toHaveBeenCalledWith('playlist');
    expect(toast).toHaveBeenCalledWith('Set "🎧 Playlist + Tracklist" as the default preset');
    const ep = screen.getByRole('spinbutton', { name: 'Next EP' });
    fireEvent.focus(ep);
    fireEvent.change(ep, { target: { value: '12' } });
    fireEvent.blur(ep);
    expect(api.write.counter).toHaveBeenCalledWith('playlist', 11);
  });

  it('delete asks first and keeps one preset', async () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    expect(screen.getByText('Delete preset "🌑 TrapSoul Mix"?')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!));
    // one write: the stored default never names a preset that is gone, and Studio tabs see one change
    const [list, id] = vi.mocked(api.write.presetsAndActive).mock.calls[0]!;
    expect(list.some((p) => p.id === 'trapsoul')).toBe(false);
    expect(id).toBe('playlist');
    expect(api.write.activeId).not.toHaveBeenCalled();
    expect(api.write.presets).not.toHaveBeenCalled();
  });

  it('footer: apply to the open dialog, reset after asking', async () => {
    const api = fakePanel();
    renderPanel(<PresetsFooter />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to open window' }));
    expect(api.send).toHaveBeenCalledWith('fill:apply', undefined);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' })));
    expect(screen.getByText('Reset all presets?')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Reset to defaults' }).at(-1)!));
    expect(api.write.presetsAndActive).toHaveBeenCalledWith(expect.any(Array), 'trapsoul');
    expect(api.write.presets).not.toHaveBeenCalled();
    expect(api.write.activeId).not.toHaveBeenCalled();
  });

  it('a failed write says so instead of the success toast', async () => {
    const api = fakePanel();
    vi.mocked(api.write.activeId).mockRejectedValueOnce(new Error('quota'));
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Set as default' })));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/^Set /));
  });

  it('delete answered "no" (or replaced) writes nothing; a failed write says so', async () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(api.write.presetsAndActive).not.toHaveBeenCalled();
    vi.mocked(api.write.presetsAndActive).mockRejectedValueOnce(new Error('quota'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!));
    expect(api.write.presets).not.toHaveBeenCalled();
    expect(api.write.activeId).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    expect((screen.getByLabelText('Preset name') as HTMLInputElement).value).toBe('🌑 TrapSoul Mix');
  });

  it('a new preset is edited once its write comes back', () => {
    const api = fakePanel();
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const list = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    expect(list.at(-1)!.label).toBe('✨ New preset');
    // the stored list has not echoed back yet: the editor still shows the default preset
    expect((screen.getByLabelText('Preset name') as HTMLInputElement).value).toBe('🌑 TrapSoul Mix');
    const echoed = { ...api, data: { ...api.data!, presets: list } };
    view.rerender(
      <PanelContext.Provider value={echoed}>
        <LiveContext.Provider value={fakeLive()}><ClaimsContext.Provider value={fakeClaims()}>
          <AskProvider><PresetsTab /></AskProvider>
        </ClaimsContext.Provider></LiveContext.Provider>
      </PanelContext.Provider>,
    );
    const label = screen.getByLabelText('Preset name') as HTMLInputElement;
    expect(label.value).toBe('✨ New preset');
    expect(document.activeElement).toBe(label);
    // selected, so typing replaces the name (the drawer's fLabel.select())
    expect(label.selectionStart).toBe(0);
    expect(label.selectionEnd).toBe(label.value.length);
  });

  it('a variable chip inserts into the field last focused', () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    const tags = screen.getByLabelText('Tags') as HTMLInputElement;
    // happy-dom's setRangeText assigns `this.value`, which React's value tracker sees (so no
    // onChange); a browser changes the value natively. Do it the browser's way here.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    tags.setRangeText = function (this: HTMLInputElement, text: string, start?: number, end?: number) {
      const v = this.value;
      setValue.call(this, v.slice(0, start) + text + v.slice(end));
    } as HTMLInputElement['setRangeText'];
    fireEvent.focus(tags);
    tags.setSelectionRange(tags.value.length, tags.value.length);
    fireEvent.click(screen.getByRole('button', { name: '{bpm}' }));
    expect(vi.mocked(api.write.presets).mock.calls.at(-1)![0][0]!.tags.at(-1)).toBe('{artists}{bpm}');
  });

  it('footer: a failed apply says so', async () => {
    const api = fakePanel({ send: vi.fn(async () => { throw new Error('no Studio tab'); }) as unknown as PanelApi['send'] });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel(<PresetsFooter />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apply to open window' })));
    expect(toast).toHaveBeenCalledWith("Couldn't apply to the open window (no Studio tab)");
    err.mockRestore();
  });

  it('a failed New forgets the new preset: a later click does not grab the name field', async () => {
    const api = fakePanel();
    vi.mocked(api.write.presets).mockRejectedValueOnce(new Error('quota'));
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'New' })));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    expect(document.activeElement).not.toBe(screen.getByLabelText('Preset name'));
    // and the next edit does not write the preset that was never stored
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'x' } });
    expect(vi.mocked(api.write.presets).mock.calls.at(-1)![0].length).toBe(api.data!.presets.length);
  });

  it('the selected preset deleted elsewhere: the editor moves to the default, a keystroke never writes into it', () => {
    const api = fakePanel();
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    const title = screen.getByLabelText('Video title') as HTMLInputElement;
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: 'typing' } });
    const without = api.data!.presets.filter((x) => x.id !== 'playlist');
    echo(view, api, without);
    expect(item('🌑 TrapSoul Mix').getAttribute('aria-current')).toBe('true');
    const now = screen.getByLabelText('Video title') as HTMLInputElement;
    expect(now.value).toBe(without[0]!.title);
    fireEvent.change(now, { target: { value: now.value + '!' } });
    expect(vi.mocked(api.write.presets).mock.calls.at(-1)![0][0]!.title).toBe(without[0]!.title + '!');
  });

  it('an echo of an older write does not undo a newer one still in flight', () => {
    const api = fakePanel();
    let first: Preset[] = [];
    vi.mocked(api.write.presets)
      .mockImplementationOnce(async (l) => { first = l; })
      .mockImplementationOnce(() => new Promise(() => {})); // still in flight
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.click(screen.getByRole('button', { name: '🌐 Public' }));
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'a, b' } });
    echo(view, api, first);
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'x' } });
    const last = vi.mocked(api.write.presets).mock.calls.at(-1)![0][0]!;
    expect(last).toMatchObject({ visibility: 'PUBLIC', tags: ['a', 'b'], title: 'x' });
  });

  it('reset moves the editor to the default preset; a failed reset says so', async () => {
    const api = fakePanel();
    renderPanel(<><PresetsTab /><PresetsFooter /></>, api);
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' })));
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Reset to defaults' }).at(-1)!));
    expect((screen.getByLabelText('Preset name') as HTMLInputElement).value).toBe('🌑 TrapSoul Mix');
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    vi.mocked(api.write.presetsAndActive).mockRejectedValueOnce(new Error('quota'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' })));
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Reset to defaults' }).at(-1)!));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    expect((screen.getByLabelText('Preset name') as HTMLInputElement).value).toBe('🎧 Playlist + Tracklist');
  });

  it('scrolls only the list box to the selected preset', () => {
    const api = fakePanel();
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    renderPanel(<PresetsTab />, api);
    const items = screen.getAllByTitle(/= set as default preset$/);
    const box = items[0]!.parentElement!;
    Object.defineProperty(box, 'clientHeight', { value: 80 });
    items.forEach((el, i) => {
      Object.defineProperty(el, 'offsetTop', { value: i * 40 });
      Object.defineProperty(el, 'offsetHeight', { value: 40 });
    });
    fireEvent.click(items[4]!);
    expect(box.scrollTop).toBe(156);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keyboard and screen readers: Space selects, the selection and visibility are announced', () => {
    renderPanel(<PresetsTab />, fakePanel());
    expect(item('🌑 TrapSoul Mix').getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(item('🎧 Playlist + Tracklist'), { key: ' ' });
    expect(item('🎧 Playlist + Tracklist').getAttribute('aria-current')).toBe('true');
    expect(item('🌑 TrapSoul Mix').getAttribute('aria-current')).toBeNull();
    const vis = ['🔒 Private', '🔗 Unlisted', '🌐 Public'].map((n) => screen.getByRole('button', { name: n }).getAttribute('aria-pressed'));
    expect(vis.filter((v) => v === 'true').length).toBe(1);
    expect(vis.every((v) => v === 'true' || v === 'false')).toBe(true);
  });

  it('duplicate writes a copy and edits it once it comes back', () => {
    const api = fakePanel();
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const list = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    const src = api.data!.presets.find((x) => x.id === 'playlist')!;
    expect(list.at(-1)).toEqual({ ...src, id: list.at(-1)!.id, label: '🎧 Playlist + Tracklist (copy)' });
    expect(list.at(-1)!.id).not.toBe('playlist');
    echo(view, api, list);
    expect((screen.getByLabelText('Preset name') as HTMLInputElement).value).toBe('🎧 Playlist + Tracklist (copy)');
  });

  it('a failed EP counter write says so', async () => {
    const api = fakePanel();
    vi.mocked(api.write.counter).mockRejectedValueOnce(new Error('quota'));
    renderPanel(<PresetsTab />, api);
    const ep = screen.getByRole('spinbutton', { name: 'Next EP' });
    fireEvent.focus(ep);
    fireEvent.change(ep, { target: { value: '5' } });
    await act(async () => fireEvent.blur(ep));
    expect(api.write.counter).toHaveBeenCalledWith('trapsoul', 4);
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
  });

  it('deleting a preset that is not the default keeps the default and edits it', async () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    expect(screen.getByText('Delete preset "🎧 Playlist + Tracklist"?')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!));
    expect(api.write.activeId).not.toHaveBeenCalled();
    expect(api.write.presetsAndActive).not.toHaveBeenCalled();
    const saved = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    expect(saved.map((x) => x.id)).toEqual(api.data!.presets.map((x) => x.id).filter((id) => id !== 'playlist'));
    expect(item('🌑 TrapSoul Mix').getAttribute('aria-current')).toBe('true');
  });

  it('after switching presets, a chip still goes to the kind of field last focused', () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    fireEvent.focus(screen.getByLabelText('Tags'));
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    const tags = screen.getByLabelText('Tags') as HTMLInputElement;
    nativeRangeText(tags);
    tags.setSelectionRange(tags.value.length, tags.value.length);
    fireEvent.click(screen.getByRole('button', { name: '{bpm}' }));
    const saved = vi.mocked(api.write.presets).mock.calls.at(-1)![0].find((x) => x.id === 'playlist')!;
    expect(saved.tags.at(-1)!.endsWith('{bpm}')).toBe(true);
  });

  // An external list (another panel window, an import) that arrived while a write of ours was
  // in flight: the next keystroke builds on it, not on the list from before.
  const imported = (api: PanelApi) => api.data!.presets.map((x) => (x.id === 'playlist' ? { ...x, label: 'Imported' } : x));

  it('a failed write: the list that came from storage meanwhile is what the next edit builds on', async () => {
    const api = fakePanel();
    let reject!: (e: Error) => void;
    vi.mocked(api.write.presets).mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'mine' } });
    echo(view, api, imported(api));
    await act(async () => reject(new Error('quota')));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'again' } });
    const last = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    expect(last.find((x) => x.id === 'playlist')!.label).toBe('Imported');
    expect(last[0]!.title).toBe('again');
  });

  it('an import that lands while a write of ours is in flight is not undone by the next edit', async () => {
    const api = fakePanel();
    let resolve!: () => void;
    vi.mocked(api.write.presets).mockImplementationOnce(() => new Promise<void>((r) => { resolve = r; }));
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'mine' } });
    echo(view, api, imported(api));
    await act(async () => resolve());
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'again' } });
    expect(vi.mocked(api.write.presets).mock.calls.at(-1)![0].find((x) => x.id === 'playlist')!.label).toBe('Imported');
  });

  it('a write that throws at once still lets later lists from storage in', async () => {
    const api = fakePanel();
    vi.mocked(api.write.presets).mockImplementationOnce(() => { throw new Error('boom'); });
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'mine' } });
    await act(async () => {});
    expect(toast).toHaveBeenCalledWith("Couldn't save (boom)", { id: 'save-failed' });
    echo(view, api, imported(api));
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'again' } });
    expect(vi.mocked(api.write.presets).mock.calls.at(-1)![0].find((x) => x.id === 'playlist')!.label).toBe('Imported');
  });

  it('the selected preset deleted elsewhere and then brought back: the editor stays on the default', () => {
    const api = fakePanel();
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    echo(view, api, api.data!.presets.filter((x) => x.id !== 'playlist'));
    echo(view, api, [...api.data!.presets]);
    expect(item('🌑 TrapSoul Mix').getAttribute('aria-current')).toBe('true');
    expect((screen.getByLabelText('Preset name') as HTMLInputElement).value).toBe('🌑 TrapSoul Mix');
  });

  it('New: an unrelated echo before the new preset arrives does not take the editor back to the default', () => {
    const api = fakePanel();
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const list = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    echo(view, api, [...api.data!.presets]); // e.g. a counters change re-read before the New lands
    echo(view, api, list);
    const label = screen.getByLabelText('Preset name') as HTMLInputElement;
    expect(label.value).toBe('✨ New preset');
    expect(document.activeElement).toBe(label);
    expect(label.selectionEnd).toBe(label.value.length);
  });

  it('a failed delete of the default keeps it in the list the next keystroke writes', async () => {
    const api = fakePanel();
    vi.mocked(api.write.presetsAndActive).mockRejectedValueOnce(new Error('quota'));
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'typed' } });
    const last = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    expect(last.map((x) => x.id)).toEqual(api.data!.presets.map((x) => x.id));
    expect(last.find((x) => x.id === 'trapsoul')!.title).toBe('typed');
  });

  it('our own older echo, read while two writes were in flight, is not adopted once both land', async () => {
    const api = fakePanel();
    let first: Preset[] = [];
    const done: (() => void)[] = [];
    vi.mocked(api.write.presets)
      .mockImplementationOnce((l) => new Promise<void>((r) => { first = l; done.push(r); }))
      .mockImplementationOnce(() => new Promise<void>((r) => { done.push(r); }));
    const view = renderPanel(<PresetsTab />, api);
    fireEvent.click(screen.getByRole('button', { name: '🌐 Public' })); // W1
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'a, b' } }); // W2
    echo(view, api, first); // E1 read while both are in flight
    await act(async () => done.forEach((r) => r())); // both land before E2 is read
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'x' } });
    const last = vi.mocked(api.write.presets).mock.calls.at(-1)![0][0]!;
    expect(last).toMatchObject({ visibility: 'PUBLIC', tags: ['a', 'b'], title: 'x' });
  });

  it('a later write of ours fails: the echo of the earlier one that landed is what the next edit builds on', async () => {
    const api = fakePanel();
    let first: Preset[] = [];
    let ok!: () => void;
    let fail!: (e: Error) => void;
    vi.mocked(api.write.presets)
      .mockImplementationOnce((l) => new Promise<void>((r) => { first = l; ok = r; }))
      .mockImplementationOnce(() => new Promise<void>((_, r) => { fail = r; }));
    const view = renderPanel(<PresetsTab />, api);
    const tags = api.data!.presets[0]!.tags;
    fireEvent.click(screen.getByRole('button', { name: '🌐 Public' })); // W1
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'a, b' } }); // W2
    await act(async () => ok());
    echo(view, api, first); // E1, while W2 is still in flight
    await act(async () => fail(new Error('quota')));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'x' } });
    const last = vi.mocked(api.write.presets).mock.calls.at(-1)![0][0]!;
    expect(last).toMatchObject({ visibility: 'PUBLIC', tags, title: 'x' });
  });

  it('a failed New started from another preset goes back to that preset', async () => {
    const api = fakePanel();
    vi.mocked(api.write.presets).mockRejectedValueOnce(new Error('quota'));
    renderPanel(<PresetsTab />, api);
    fireEvent.click(item('🎧 Playlist + Tracklist'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'New' })));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    expect((screen.getByLabelText('Preset name') as HTMLInputElement).value).toBe('🎧 Playlist + Tracklist');
  });
});
