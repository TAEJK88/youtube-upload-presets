// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { PresetsFooter, PresetsTab } from '../entrypoints/sidepanel/tabs/PresetsTab';
import { toPanelData } from '../lib/panel/data';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { LiveContext, PanelContext } from '../entrypoints/sidepanel/panel';
import { fakeLive, fakePanel, renderPanel } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
beforeEach(() => vi.mocked(toast).mockClear());
afterEach(cleanup);

describe('presets tab', () => {
  it('edits the default preset and previews it', () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    const title = screen.getByLabelText('Video title') as HTMLInputElement;
    expect(title.value).toBe('TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}');
    // the preview fills the sample tracklist's artists
    expect(screen.getByText(/^TrapSoul Mix \| SZA, Chris Brown, Brent Faiyaz, Nessy J\. - /)).toBeTruthy();
    fireEvent.change(title, { target: { value: '{name} {oops}' } });
    const saved = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    expect(saved[0]!.title).toBe('{name} {oops}');
    expect(saved.slice(1)).toEqual(api.data!.presets.slice(1));
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
    expect(vi.mocked(api.write.presets).mock.calls[0]![0].some((p) => p.id === 'trapsoul')).toBe(false);
    expect(api.write.activeId).toHaveBeenCalledWith('playlist');
  });

  it('footer: apply to the open dialog, reset after asking', async () => {
    const api = fakePanel();
    renderPanel(<PresetsFooter />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to open window' }));
    expect(api.send).toHaveBeenCalledWith('fill:apply', undefined);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' })));
    expect(screen.getByText('Reset all presets?')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Reset to defaults' }).at(-1)!));
    expect(api.write.presets).toHaveBeenCalled();
    expect(api.write.activeId).toHaveBeenCalledWith('trapsoul');
  });

  it('a failed write says so instead of the success toast', async () => {
    const api = fakePanel();
    vi.mocked(api.write.activeId).mockRejectedValueOnce(new Error('quota'));
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Set as default' })));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/^Set /));
  });

  it('delete answered "no" (or replaced) writes nothing; a failed default write stops the delete', async () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(api.write.presets).not.toHaveBeenCalled();
    vi.mocked(api.write.activeId).mockRejectedValueOnce(new Error('quota'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!));
    expect(api.write.presets).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
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
        <LiveContext.Provider value={fakeLive()}>
          <AskProvider><PresetsTab /></AskProvider>
        </LiveContext.Provider>
      </PanelContext.Provider>,
    );
    const label = screen.getByLabelText('Preset name') as HTMLInputElement;
    expect(label.value).toBe('✨ New preset');
    expect(document.activeElement).toBe(label);
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
});
