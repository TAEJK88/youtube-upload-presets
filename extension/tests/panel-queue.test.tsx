// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fileStore from '../lib/file-store';
import * as intake from '../lib/panel/intake';
import { QueueCard } from '../entrypoints/sidepanel/tabs/QueueCard';
import { QueueFooter } from '../entrypoints/sidepanel/tabs/QueueFooter';
import { QueueTab, usePanelDrop } from '../entrypoints/sidepanel/tabs/QueueTab';
import { ScheduleBox } from '../entrypoints/sidepanel/tabs/ScheduleBox';
import { AskProvider, useAsk } from '../entrypoints/sidepanel/ask';
import { PanelContext } from '../entrypoints/sidepanel/panel';
import { toPanelData } from '../lib/panel/data';
import { fmtWhen, toLocalInput } from '../lib/panel/format';
import type { QueueView, ViewItem } from '../lib/studio/queue-view';
import { fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

vi.mock('../lib/panel/intake', async (orig) => ({ ...(await orig<typeof import('../lib/panel/intake')>()), sendFiles: vi.fn(), dropHandles: vi.fn(), pickFiles: vi.fn(async () => []), pickFolder: vi.fn(async () => []) }));
vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
const RELOAD = 'This tab is not connected to the extension yet — reload this tab';
const TOO_MANY = `This folder has more than ${intake.MAX_FOLDER_FILES} files, so nothing was added — pick the folder that holds only the videos to upload`;
// A folder three levels down with one file more than a walk takes.
const hugeFolder = () => {
  const dir = (kids: unknown[]) => ({ kind: 'directory', name: 'd', async *values() { yield* kids; } });
  return dir([dir([dir(Array.from({ length: intake.MAX_FOLDER_FILES + 1 }, (_, i) => ({ kind: 'file', name: `f${i}.mp4` })))])]) as unknown as FileSystemHandle;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const one = (it: Partial<ViewItem>, over: Partial<QueueView> = {}) => {
  const view = viewWith([it], over);
  const api = fakePanel({ view });
  renderPanel(<QueueCard it={view.items[0]!} open={false} onOpen={() => {}} />, api);
  return api;
};

describe('queue card', () => {
  it('Remove is offered while waiting, and sends queue:remove', () => {
    const api = one({ status: 'pending' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from queue' }));
    expect(api.send).toHaveBeenCalledWith('queue:remove', 'i0');
  });

  it('no Remove while uploading, waiting for Save, or while its file is being fetched', () => {
    one({ status: 'uploading' });
    expect(screen.queryByRole('button', { name: 'Remove from queue' })).toBe(null);
    cleanup();
    one({ status: 'review' });
    expect(screen.queryByRole('button', { name: 'Remove from queue' })).toBe(null);
    cleanup();
    one({ status: 'pending' }, { current: 'i0' });
    expect(screen.queryByRole('button', { name: 'Remove from queue' })).toBe(null);
  });

  it('Retry with a leftover draft asks first', async () => {
    const api = one({ status: 'error', draftId: 'abcdefghijk', msg: 'boom' });
    expect(screen.getByRole('button', { name: 'Open draft' })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(screen.getByText('This video is already in Studio')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(api.send).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Deleted it, upload again' })));
    expect(api.send).toHaveBeenCalledWith('queue:retry', 'i0');
  });

  it('Remove and Retry that do not reach the tab say so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const [status, name] of [['pending', 'Remove from queue'], ['error', 'Retry']] as const) {
        const api = fakePanel({ view: viewWith([{ status }]) });
        vi.mocked(api.send).mockRejectedValue(new Error('no receiver'));
        renderPanel(<QueueCard it={api.view!.items[0]!} open={false} onOpen={() => {}} />, api);
        await act(async () => fireEvent.click(screen.getByRole('button', { name })));
        expect(toast).toHaveBeenCalledWith(RELOAD);
        cleanup();
        vi.mocked(toast).mockClear();
      }
    } finally {
      err.mockRestore();
    }
  });

  it('Retry without a draft goes straight away', () => {
    const api = one({ status: 'error' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.send).toHaveBeenCalledWith('queue:retry', 'i0');
  });

  it('the expand button opens the card once (the header click does the toggling)', () => {
    const view = viewWith([{ status: 'pending' }]);
    const onOpen = vi.fn();
    renderPanel(<QueueCard it={view.items[0]!} open={false} onOpen={onOpen} />, fakePanel({ view }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(onOpen.mock.calls).toEqual([[true]]);
  });

  it('expanded: edits go to the Studio tab as queue:edit', () => {
    const view = viewWith([{ status: 'pending', at: 1_900_000_000_000 }]);
    const api = fakePanel({ view });
    renderPanel(<QueueCard it={view.items[0]!} open onOpen={() => {}} />, api);
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'Mine' } });
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'title', id: 'i0', title: 'Mine' });
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'lofi' } });
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'preset', id: 'i0', presetId: 'lofi' });
    fireEvent.change(screen.getByLabelText('Artists'), { target: { value: 'SZA' } });
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'artists', id: 'i0', artists: 'SZA' });
  });

  it('tracklist chips and the fix button', () => {
    const api = one({ status: 'pending', txt: '0:05 A\n0:07 B', txtName: 'c.txt', tracklist: { errors: ['First timestamp must be 0:00 (currently 0:05)', 'Needs at least 3 timestamps (has 2)'], warnings: [], count: 2 }, fixChanges: ['First timestamp 0:05 → 0:00'] });
    expect(screen.getByText('c.txt · 2 lines')).toBeTruthy();
    expect(screen.getByText('Tracklist: 2 problem(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fix tracklist/ }));
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'fixTracklist', id: 'i0' });
  });

  it('a past release time is flagged while the item can change', () => {
    one({ status: 'pending', at: Date.now() - 1000, timeProblem: 'Release time must be at least 15 minutes in the future' });
    expect(screen.getByTitle('Release time must be at least 15 minutes in the future')).toBeTruthy();
  });

  it('the uploading item shows the run’s progress', () => {
    const view = viewWith([{ status: 'uploading' }]);
    renderPanel(<QueueCard it={view.items[0]!} open={false} onOpen={() => {}} />, fakePanel({ view }),
      fakeLive({ liveState: state({ running: true, prog: { pct: 0.42 } as never }) }));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
  });

  it('a card whose tracklist has songs claimed before shows the chip with them', () => {
    one({ txt: 'x', claimed: [{ line: 'Lena - Midnight Rain', song: 'Midnight Rain', artists: 'Lena', times: 2 }] });
    const chip = screen.getByText('1 song(s) previously claimed');
    expect(chip.closest('[title]')!.getAttribute('title')).toBe('Tracklist songs previously claimed:\n• Lena - Midnight Rain  (claimed on 2 video(s))');
    // 4a T8 m11: amber text on the amber tint was 3.8:1 in light; the text is the foreground, the amber stays on the icon
    const cls = chip.closest('[data-slot="badge"]')!.className.split(' ');
    expect(cls).toContain('text-fg');
    expect(cls).not.toContain('text-warn');
    expect(cls).toContain('[&>svg]:text-warn');
  });

  it('the chip\'s tooltip has one line per song', () => {
    one({ txt: 'x', claimed: [{ line: 'A - One', song: 'One', artists: 'A', times: 2 }, { line: 'B - Two', song: 'Two', artists: 'B', times: 1 }] });
    expect(screen.getByText('2 song(s) previously claimed').closest('[title]')!.getAttribute('title'))
      .toBe('Tracklist songs previously claimed:\n• A - One  (claimed on 2 video(s))\n• B - Two  (claimed on 1 video(s))');
  });

  it('no chip when none of its songs was claimed before', () => {
    one({ txt: 'x' });
    expect(screen.queryByText(/previously claimed/)).toBe(null);
  });
});

describe('queue card: attach failures', () => {
  const attach = async (impl: (files: FileSystemFileHandle[], deliver: (ids: string[]) => Promise<unknown>) => Promise<number>) => {
    vi.spyOn(intake, 'pickAttachments').mockResolvedValue([{ kind: 'file', name: 'a.txt' } as FileSystemFileHandle]);
    vi.mocked(intake.sendFiles).mockImplementation(impl);
    one({ status: 'pending' });
    await act(async () => void fireEvent.click(screen.getByText('Attach .txt / thumbnail')));
  };
  it('handles that could not be stored: "Could not add", not "not connected"', async () => {
    await attach(async () => { throw new Error('quota'); });
    expect(toast).toHaveBeenCalledWith('Could not add 1 file(s): quota');
  });
  it('a tab that did not take them: "not connected"', async () => {
    await attach(async (_files, deliver) => { await deliver(['id1']); return 1; });
    expect(toast).not.toHaveBeenCalled(); // delivered
    cleanup();
    vi.mocked(toast).mockClear();
    vi.mocked(intake.sendFiles).mockImplementation(async (_files, deliver) => { await deliver(['id1']); return 1; });
    const view = viewWith([{ status: 'pending' }]);
    const api = fakePanel({ view });
    vi.mocked(api.send).mockRejectedValue(new Error('Receiving end does not exist'));
    renderPanel(<QueueCard it={view.items[0]!} open={false} onOpen={() => {}} />, api);
    await act(async () => void fireEvent.click(screen.getByText('Attach .txt / thumbnail')));
    expect(toast).toHaveBeenCalledWith(RELOAD);
  });
  it('a folder with too many files dropped on a card next to a .txt: nothing is attached and a toast says why', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(intake.dropHandles).mockResolvedValueOnce([{ kind: 'file', name: 'a.txt' } as FileSystemHandle, hugeFolder()]);
    one({ status: 'pending' });
    const dataTransfer = { types: ['Files'], files: [new File(['x'], 'a.txt')], items: [{ webkitGetAsEntry: () => ({ isDirectory: false }) }] };
    await act(async () => void fireEvent.drop(screen.getByText('Attach .txt / thumbnail'), { dataTransfer }));
    expect(intake.dropHandles).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(TOO_MANY);
    expect(intake.sendFiles).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('queue card: thumbnail preview', () => {
  it('comes back after a re-grant', async () => {
    let perm: PermissionState = 'prompt';
    vi.spyOn(fileStore, 'getHandle').mockImplementation(async () => ({
      queryPermission: async () => perm, getFile: async () => new File(['img'], 'Clip 1.jpg', { type: 'image/jpeg' }),
    }) as unknown as FileSystemFileHandle);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumb');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const view = viewWith([{ thumb: { id: 't0', src: 'bridge', name: 'Clip 1.jpg', size: 3, type: 'image/jpeg' } }]);
    const card = (grantRev: number) => (
      <PanelContext.Provider value={fakePanel({ view, grantRev })}>
        <AskProvider><QueueCard it={view.items[0]!} open={false} onOpen={() => {}} /></AskProvider>
      </PanelContext.Provider>
    );
    const { container, rerender } = render(card(0));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(container.querySelector('img[src="blob:thumb"]')).toBe(null);
    perm = 'granted';
    rerender(card(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(create).toHaveBeenCalled();
    expect(container.querySelector('img[src="blob:thumb"]')).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe('queue card: move, failures, accessibility', () => {
  const cards = (items: Partial<ViewItem>[], over: Partial<QueueView> = {}) => {
    const view = viewWith(items, over);
    const api = fakePanel({ view });
    renderPanel(<>{view.items.map((it, i) => <QueueCard key={it.id} it={it} prev={view.items[i - 1]} next={view.items[i + 1]} open={false} onOpen={() => {}} />)}</>, api);
    const btn = (name: string) => screen.getAllByRole('button', { name }) as HTMLButtonElement[];
    return { api, up: btn('Move up'), down: btn('Move down') };
  };

  it('Move up / down send the move, and are off at the ends', () => {
    const { api, up, down } = cards([{ status: 'pending' }, { status: 'pending' }, { status: 'error' }]);
    expect(up.map((b) => b.disabled)).toEqual([true, false, false]);
    expect(down.map((b) => b.disabled)).toEqual([false, false, true]);
    fireEvent.click(up[1]!);
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'move', id: 'i1', by: -1 });
    fireEvent.click(down[1]!);
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'move', id: 'i1', by: 1 });
  });

  it('no move across the item whose file is being fetched, nor across a finished one', () => {
    const { up, down } = cards([{ status: 'pending' }, { status: 'pending' }, { status: 'pending' }, { status: 'done' }], { current: 'i1' });
    // i1 is the run's: no arrows on it; i0 can't go down past it, i2 can't go up past it nor down past done
    expect(up.map((b) => b.disabled)).toEqual([true, true]);
    expect(down.map((b) => b.disabled)).toEqual([true, true]);
  });

  it('an edit the tab does not take says so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = viewWith([{ status: 'pending' }]);
      const api = fakePanel({ view });
      vi.mocked(api.send).mockRejectedValue(new Error('no receiver'));
      renderPanel(<QueueCard it={view.items[0]!} open onOpen={() => {}} />, api);
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'Mine' } });
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(toast).toHaveBeenCalledWith(RELOAD);
    } finally {
      err.mockRestore();
    }
  });

  it('the expand button says whether the card is open', () => {
    const view = viewWith([{ status: 'pending' }]);
    renderPanel(<QueueCard it={view.items[0]!} open={false} onOpen={() => {}} />, fakePanel({ view }));
    expect(screen.getByRole('button', { name: 'Edit details' }).getAttribute('aria-expanded')).toBe('false');
    cleanup();
    renderPanel(<QueueCard it={view.items[0]!} open onOpen={() => {}} />, fakePanel({ view }));
    expect(screen.getByRole('button', { name: 'Collapse' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('an error message is tinted like the error card (.card.error .msg)', () => {
    one({ status: 'error', msg: 'boom' });
    expect(screen.getByText('boom').parentElement!.className).toContain('text-err');
  });
});

describe('upload tab', () => {
  it('stats, apply-to-all with the default preset, and the empty state', () => {
    const api = fakePanel({ view: viewWith([{ status: 'pending' }, { status: 'done' }, { status: 'error' }]) });
    renderPanel(<QueueTab />, api);
    const stats = screen.getByTestId('stats');
    expect(within(stats).getByText('Total').previousSibling?.textContent).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: /Apply to all/ }));
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'presetAll', presetId: 'trapsoul' });
    cleanup();
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([]) }));
    expect(screen.getByText('No videos in the queue yet')).toBeTruthy();
  });

  it('stats and progress: Queued counts waiting videos only; % is (done + errors) / total', () => {
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([{ status: 'done' }, { status: 'done' }, { status: 'error' }, { status: 'pending' }]) }));
    const stats = screen.getByTestId('stats');
    expect(within(stats).getByText('Queued').previousSibling?.textContent).toBe('1');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('75');
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('no progress bar while nothing is done and nothing runs; shown once running', () => {
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([{ status: 'pending' }, { status: 'error' }]) }));
    expect(screen.queryByRole('progressbar')).toBe(null);
    cleanup();
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([{ status: 'uploading' }, { status: 'pending' }]) }), fakeLive({ liveState: state({ running: true }) }));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('the drop zone: a click anywhere on it picks files', () => {
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([]) }));
    fireEvent.click(screen.getByText('Drop files or a folder anywhere on this panel'));
    expect(intake.pickFiles).toHaveBeenCalledTimes(1);
  });

  it('the drop zone: Space picks files; the folder button is not inside another control', async () => {
    const user = userEvent.setup();
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([]) }));
    const files = screen.getByRole('button', { name: /or click to select files/ });
    files.focus();
    await user.keyboard(' ');
    expect(intake.pickFiles).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    expect(intake.pickFiles).toHaveBeenCalledTimes(2);
    const folder = screen.getByRole('button', { name: 'pick a whole folder' });
    expect(folder.parentElement!.closest('button,[role=button]')).toBe(null);
    expect(files.parentElement!.closest('button,[role=button]')).toBe(null);
    await user.click(folder);
    expect(intake.pickFolder).toHaveBeenCalledTimes(1);
    expect(intake.pickFiles).toHaveBeenCalledTimes(2);
  });

  it('a picked folder with too many files: nothing is added and a toast says why', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(intake.pickFolder).mockImplementationOnce(() => intake.expandHandles([hugeFolder()]));
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([]) }));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'pick a whole folder' })));
    expect(toast).toHaveBeenCalledWith(TOO_MANY);
    expect(intake.sendFiles).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('Apply to all is off while the queue runs', () => {
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([{ status: 'uploading' }]) }), fakeLive({ liveState: state({ running: true }) }));
    expect((screen.getByRole('button', { name: /Apply to all/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a default preset that could not be saved, or an Apply to all the tab never got, says so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]) });
    vi.mocked(api.write.activeId).mockRejectedValue(new Error('quota'));
    vi.mocked(api.send).mockRejectedValue(new Error('Receiving end does not exist'));
    renderPanel(<QueueTab />, api);
    await act(async () => void fireEvent.change(screen.getByTitle('Preset for newly added videos'), { target: { value: 'lofi' } }));
    expect(toast).toHaveBeenCalledWith("Couldn't save (quota)", { id: 'save-failed' });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /Apply to all/ })));
    expect(toast).toHaveBeenCalledWith(RELOAD);
    err.mockRestore();
  });

  it('the default preset select writes activeId', () => {
    const api = fakePanel({ view: viewWith([]) });
    renderPanel(<QueueTab />, api);
    fireEvent.change(screen.getByTitle('Preset for newly added videos'), { target: { value: 'lofi' } });
    expect(api.write.activeId).toHaveBeenCalledWith('lofi');
    expect(vi.mocked(api.send)).not.toHaveBeenCalled();
  });
});

describe('the panel-wide drop target', () => {
  const Target = ({ onDropped }: { onDropped(): void }) => {
    const drop = usePanelDrop(onDropped);
    return <div data-testid="t" data-dropping={String(drop.dropping)} {...drop.handlers} />;
  };
  const dt = { types: ['Files'], items: [], files: [], dropEffect: 'none' };

  it('dropped files go to the Studio tab as queue:add; the Upload tab opens', async () => {
    const handle = { kind: 'file', name: 'A.mp4' } as FileSystemFileHandle;
    vi.mocked(intake.dropHandles).mockResolvedValue([handle]);
    vi.mocked(intake.sendFiles).mockImplementation(async (files, deliver) => (await deliver(['id1']), files.length));
    const api = fakePanel();
    const onDropped = vi.fn();
    render(<PanelContext.Provider value={api}><Target onDropped={onDropped} /></PanelContext.Provider>);
    const t = screen.getByTestId('t');
    fireEvent.dragOver(t, { dataTransfer: dt });
    expect(t.dataset.dropping).toBe('true');
    await act(async () => void fireEvent.drop(t, { dataTransfer: dt }));
    expect(t.dataset.dropping).toBe('false');
    expect(onDropped).toHaveBeenCalled();
    expect(vi.mocked(intake.sendFiles).mock.calls[0]![0]).toEqual([handle]);
    expect(api.send).toHaveBeenCalledWith('queue:add', ['id1']);
  });

  it('a dropped folder is read at every depth; one with too many files adds nothing and a toast says why', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deep = { kind: 'file', name: 'Deep.mp4' };
    const dir = (kids: unknown[]) => ({ kind: 'directory', name: 'd', async *values() { yield* kids; } });
    vi.mocked(intake.dropHandles).mockResolvedValueOnce([dir([dir([dir([dir([deep])])])]) as unknown as FileSystemHandle]);
    render(<PanelContext.Provider value={fakePanel()}><Target onDropped={() => {}} /></PanelContext.Provider>);
    await act(async () => void fireEvent.drop(screen.getByTestId('t'), { dataTransfer: dt }));
    expect(vi.mocked(intake.sendFiles).mock.calls[0]![0]).toEqual([deep]);
    expect(toast).not.toHaveBeenCalled();
    vi.mocked(intake.sendFiles).mockClear();
    vi.mocked(intake.dropHandles).mockResolvedValueOnce([hugeFolder()]);
    await act(async () => void fireEvent.drop(screen.getByTestId('t'), { dataTransfer: dt }));
    expect(toast).toHaveBeenCalledWith(TOO_MANY);
    expect(intake.sendFiles).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('a drag without files is not taken', () => {
    const onDropped = vi.fn();
    render(<PanelContext.Provider value={fakePanel()}><Target onDropped={onDropped} /></PanelContext.Provider>);
    fireEvent.drop(screen.getByTestId('t'), { dataTransfer: { ...dt, types: ['text/plain'] } });
    expect(onDropped).not.toHaveBeenCalled();
    expect(intake.dropHandles).not.toHaveBeenCalled();
  });
});

describe('schedule box', () => {
  const sched = (over: Record<string, unknown>) => toPanelData({ settings: { schedule: { on: true, start: '2030-01-01T08:00', every: 1, unit: 'day', ...over } } });
  const lateView = (start: number) => viewWith([], { schedule: { on: true, set: true, start, late: true, times: [start], skipped: 0, taken: [] } });

  it('off: says so; switching on picks tomorrow 19:00 when no start is set', () => {
    const api = fakePanel();
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    expect(screen.getByText("Off · videos are published using the preset's visibility")).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule releases' }));
    const patch = vi.mocked(api.write.settings).mock.calls[0]![0];
    expect(patch.schedule).toMatchObject({ on: true });
    expect(patch.schedule!.start).toMatch(/T19:00$/);
  });

  it('switching on keeps a start that is already set', () => {
    const api = fakePanel({ data: toPanelData({ settings: { schedule: { on: false, start: '2030-01-01T08:00', every: 1, unit: 'day' } } }) });
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule releases' }));
    expect(api.write.settings).toHaveBeenCalledWith({ schedule: { on: true } });
  });

  it('on and set: the summary, and a start time that has passed', () => {
    const start = Date.now() + 2 * 86400e3;
    const api = fakePanel({
      data: toPanelData({ settings: { schedule: { on: true, start: '2026-01-01T08:00', every: 1, unit: 'day' } } }),
      view: viewWith([{}, {}], { schedule: { on: true, set: true, start, late: true, times: [start, start + 86400e3], skipped: 0, taken: [] } }),
    });
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    expect(screen.getByText(/ → .* · every 1 days$/)).toBeTruthy();
    expect(screen.getByText(/has passed — the queue will start/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    expect(api.write.settings).toHaveBeenCalledWith({ schedule: { start: toLocalInput(start) } });
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 19:00' }));
    expect(vi.mocked(api.write.settings).mock.calls.at(-1)![0].schedule!.start).toMatch(/T19:00$/);
  });

  it('on but no start yet; the channel\'s scheduled videos and skipped slots', () => {
    const on = { schedule: { on: true, start: '', every: 2, unit: 'hour' } };
    renderPanel(<ScheduleBox open onOpen={() => {}} />, fakePanel({ data: toPanelData({ settings: on }), view: viewWith([]) }));
    expect(screen.getByText("Pick the first video's release time")).toBeTruthy();
    cleanup();
    const start = Date.now() + 86400e3;
    renderPanel(<ScheduleBox open onOpen={() => {}} />, fakePanel({
      data: toPanelData({ settings: { schedule: { ...on.schedule, start: '2030-01-01T08:00' } } }),
      view: viewWith([{}], { schedule: { on: true, set: true, start, late: false, times: [start], skipped: 1, taken: [start - 3600e3, start + 3600e3] } }),
    }));
    const sum = screen.getByText(/^Starts .* · every 2 hours · 2 already scheduled on the channel \(next .*\) — skipped 1 slot\(s\)$/);
    expect(sum.title).toBe([fmtWhen(start - 3600e3), fmtWhen(start + 3600e3)].join('\n')); // the channel's videos, not the queue's times
  });

  it('the header folds the box only while on, and not from the switch', () => {
    const onOpen = vi.fn();
    renderPanel(<ScheduleBox open onOpen={onOpen} />, fakePanel());
    fireEvent.click(screen.getByText('Schedule releases'));
    expect(onOpen).not.toHaveBeenCalled();
    cleanup();
    const api = fakePanel({ data: toPanelData({ settings: { schedule: { on: true, start: '2030-01-01T08:00', every: 1, unit: 'day' } } }) });
    renderPanel(<ScheduleBox open onOpen={onOpen} />, api);
    expect(screen.getByLabelText('First video releases')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule releases' }));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Schedule releases'));
    expect(onOpen).toHaveBeenCalledWith(false);
  });

  it('closed: no fields; the fields write every and unit', () => {
    const data = toPanelData({ settings: { schedule: { on: true, start: '2030-01-01T08:00', every: 1, unit: 'day' } } });
    renderPanel(<ScheduleBox open={false} onOpen={() => {}} />, fakePanel({ data }));
    expect(screen.queryByLabelText('First video releases')).toBe(null);
    cleanup();
    const api = fakePanel({ data });
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Every' }), { target: { value: '3' } });
    expect(api.write.settings).toHaveBeenLastCalledWith({ schedule: { every: 3 } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Every' }), { target: { value: 'hour' } });
    expect(api.write.settings).toHaveBeenLastCalledWith({ schedule: { unit: 'hour' } });
  });

  it('the fields show the stored every and unit; the start field writes the start', () => {
    const api = fakePanel({ data: sched({ every: 3, unit: 'hour' }) });
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    expect((screen.getByRole('spinbutton', { name: 'Every' }) as HTMLInputElement).value).toBe('3');
    expect((screen.getByRole('combobox', { name: 'Every' }) as HTMLSelectElement).value).toBe('hour');
    expect((screen.getByLabelText('First video releases') as HTMLInputElement).value).toBe('2030-01-01T08:00');
    fireEvent.change(screen.getByLabelText('First video releases'), { target: { value: '2031-02-03T04:05' } });
    expect(api.write.settings).toHaveBeenLastCalledWith({ schedule: { start: '2031-02-03T04:05' } });
  });

  it('each quick pick writes its own time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 9, 9, 17, 50));
      const api = fakePanel({ data: sched({}) });
      renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
      const pick = (name: string) => {
        fireEvent.click(screen.getByRole('button', { name }));
        return vi.mocked(api.write.settings).mock.calls.at(-1)![0];
      };
      expect(pick('Tomorrow 19:00')).toEqual({ schedule: { start: '2026-10-10T19:00' } });
      expect(pick('Next 18:00')).toEqual({ schedule: { start: '2026-10-10T18:00' } });
      expect(pick('Next 20:00')).toEqual({ schedule: { start: '2026-10-09T20:00' } });
      expect(pick('Within 1 hr')).toEqual({ schedule: { start: '2026-10-09T19:00' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('the late note shows the set time and the time the queue will use', () => {
    const start = Date.now() + 86400e3;
    const { container } = renderPanel(<ScheduleBox open onOpen={() => {}} />, fakePanel({ data: sched({ start: '2020-01-01T08:00' }), view: lateView(start) }));
    expect((container.firstChild as HTMLElement).className).toContain('border-warn'); // .sched.late
    expect(screen.getByText(`The set time (${fmtWhen(new Date('2020-01-01T08:00').getTime())}) has passed — the queue will start ${fmtWhen(start)} instead`)).toBeTruthy();
  });

  it('a start cleared while the late note shows: no note, and the panel keeps rendering', () => {
    // The stored start updates at once; the view's `late` only after the queue:view round trip.
    const start = Date.now() + 86400e3;
    const { container } = renderPanel(<ScheduleBox open onOpen={() => {}} />, fakePanel({ data: sched({ start: '' }), view: lateView(start) }));
    expect(screen.queryByText(/has passed/)).toBe(null);
    expect((container.firstChild as HTMLElement).className).not.toContain('border-warn');
    expect(screen.getByText("Pick the first video's release time")).toBeTruthy();
  });

  it('switched off: no late note while the view still says late', () => {
    renderPanel(<ScheduleBox open onOpen={() => {}} />, fakePanel({ data: sched({ on: false, start: '2020-01-01T08:00' }), view: lateView(Date.now() + 86400e3) }));
    expect(screen.queryByText(/has passed/)).toBe(null);
    expect(screen.queryByRole('button', { name: 'Use this time' })).toBe(null);
  });

  it('no view, or one from before the switch: the summary uses the stored start', () => {
    const line = `Starts ${fmtWhen(new Date('2030-01-01T08:00').getTime())} · every 2 hours`;
    renderPanel(<ScheduleBox open onOpen={() => {}} />, fakePanel({ data: sched({ every: 2, unit: 'hour' }), view: null }));
    expect(screen.getByText(line)).toBeTruthy();
    cleanup();
    renderPanel(<ScheduleBox open onOpen={() => {}} />, fakePanel({ data: sched({ every: 2, unit: 'hour' }), view: viewWith([]) }));
    expect(screen.getByText(line)).toBeTruthy();
  });

  it('a failed save is said, for every control', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const api = fakePanel({ data: sched({ start: '2020-01-01T08:00' }), view: lateView(Date.now() + 86400e3) });
      vi.mocked(api.write.settings).mockRejectedValue(new Error('gone'));
      renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
      await act(async () => {
        fireEvent.change(screen.getByLabelText('First video releases'), { target: { value: '2031-02-03T04:05' } });
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Every' }), { target: { value: '3' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Every' }), { target: { value: 'hour' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 19:00' }));
        fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
        fireEvent.click(screen.getByRole('switch', { name: 'Schedule releases' }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(api.write.settings).toHaveBeenCalledTimes(6);
      expect(err.mock.calls.filter(([m]) => m === '[ytup] store write failed')).toHaveLength(6);
    } finally {
      err.mockRestore();
    }
  });

  it('the header folds from the keyboard: a button with aria-expanded, only while on', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderPanel(<ScheduleBox open onOpen={onOpen} />, fakePanel({ data: sched({}) }));
    const head = screen.getByRole('button', { name: /^Schedule releases/ });
    expect(head.getAttribute('aria-expanded')).toBe('true');
    head.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenLastCalledWith(false);
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('switch', { name: 'Schedule releases' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    cleanup();
    renderPanel(<ScheduleBox open={false} onOpen={onOpen} />, fakePanel({ data: sched({}) }));
    expect(screen.getByRole('button', { name: /^Schedule releases/ }).getAttribute('aria-expanded')).toBe('false');
    cleanup();
    renderPanel(<ScheduleBox open onOpen={onOpen} />, fakePanel());
    expect(screen.queryByRole('button', { name: /^Schedule releases/ })).toBe(null);
  });
});

describe('upload footer', () => {
  it('Start shows the count, the schedule and the channel; Clear needs a finished video', () => {
    renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'pending' }, { status: 'pending' }], { schedule: { on: true, set: true, start: 1, late: false, times: [], skipped: 0, taken: [] } }) }));
    expect(screen.getByText('Upload 2 video(s) · scheduled')).toBeTruthy();
    expect(screen.getByText('To channel Mine')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Clear finished videos from the list' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Stop after the current video' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Start waits while queued files need read access again (the Re-grant banner shows)', () => {
    const view = viewWith([{ status: 'pending' }]);
    renderPanel(<QueueFooter />, fakePanel({ view, lost: ['i0'] }));
    expect((screen.getByRole('button', { name: /Upload 1 video\(s\)/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderPanel(<QueueFooter />, fakePanel({ view, lost: [] }));
    expect((screen.getByRole('button', { name: /Upload 1 video\(s\)/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Start waits only on files the run will read: not an error item\'s, nor a thumbnail with thumbnails off', () => {
    const thumb = { id: 't0', src: 'bridge' as const, name: 'Clip 1.jpg', size: 1, type: 'image/jpeg' };
    const view = viewWith([{ status: 'pending', thumb }, { status: 'error' }]);
    const startOn = (api: Parameters<typeof renderPanel>[1]) => {
      renderPanel(<QueueFooter />, api);
      const off = (screen.getByRole('button', { name: /Upload 1 video\(s\)/ }) as HTMLButtonElement).disabled;
      cleanup();
      return !off;
    };
    // The error card waits for Retry: its file is not read by this run.
    expect(startOn(fakePanel({ view, lost: ['i1'] }))).toBe(true);
    // A pending video's file is.
    expect(startOn(fakePanel({ view, lost: ['i0'] }))).toBe(false);
    // Its thumbnail only when thumbnails are on.
    const thumbs = (on: boolean) => toPanelData({ settings: { thumb: on } });
    expect(startOn(fakePanel({ view, lost: ['t0'], data: thumbs(false) }))).toBe(true);
    expect(startOn(fakePanel({ view, lost: ['t0'], data: thumbs(true) }))).toBe(false);
  });

  it('a channel that is not the locked one blocks Start', () => {
    const view = viewWith([{ status: 'pending' }], { channel: { ...state().channel, problem: 'Currently on channel "Mine" but locked to "Other"' } });
    renderPanel(<QueueFooter />, fakePanel({ view }));
    expect(screen.getByText('Channel does not match the locked one')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Channel does not match/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('while running: the progress title, Start off, Stop on', () => {
    renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'done' }, { status: 'uploading' }, { status: 'pending' }]) }), fakeLive({ state: state({ running: true }), liveState: state({ running: true }) }));
    expect((screen.getByRole('button', { name: /Uploading 2\/3/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Stop after the current video' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Start → summary → confirm → queue:start with what was confirmed', async () => {
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]) });
    vi.mocked(api.send).mockImplementation((async (type: string) =>
      type === 'queue:preflight'
        ? { pendingN: 1, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: ['i0'], editRev: 2, sig: 's', times: [], vis: 'PRIVATE', noTxt: 1, noThumb: 0, badTime: [], prevUp: [{ name: 'Clip 1.mp4', title: 'Old' }], badTl: [], needsConfirm: true }
        : undefined) as never);
    renderPanel(<QueueFooter />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Upload 1 video\(s\)/ })));
    expect(screen.getByText('1 already uploaded to this channel — they will be duplicated')).toBeTruthy();
    expect(screen.getByText('Clip 1.mp4: Old')).toBeTruthy();
    expect(screen.getByText('Per preset (PRIVATE)')).toBeTruthy();
    expect(screen.getByText('1 video(s)')).toBeTruthy(); // no .txt
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Upload 1 video(s)' }).at(-1)!));
    expect(api.send).toHaveBeenCalledWith('queue:start', { channelId: 'UC1', ids: ['i0'], editRev: 2, sig: 's', asked: true });
  });

  it('Cancel in the summary starts nothing', async () => {
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]) });
    vi.mocked(api.send).mockImplementation((async (type: string) =>
      type === 'queue:preflight'
        ? { pendingN: 1, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: ['i0'], editRev: 0, sig: 's', times: [], vis: 'PRIVATE', noTxt: 0, noThumb: 0, badTime: [], prevUp: [], badTl: [], needsConfirm: true }
        : undefined) as never);
    renderPanel(<QueueFooter />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Upload 1 video\(s\)/ })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(api.send).not.toHaveBeenCalledWith('queue:start', expect.anything());
  });

  it('another tab runs the queue: Start is off, Stop goes to that tab', async () => {
    const other = vi.fn(async () => undefined);
    const sendTo = vi.fn(() => other) as never;
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]), runner: { tabId: 7, windowId: 2, title: 'Other Studio', jobs: ['queue'] }, elsewhere: true, sendTo });
    renderPanel(<QueueFooter />, api, fakeLive({ state: state(), liveState: state({ running: true }) }));
    expect((screen.getByRole('button', { name: /Upload 1 video\(s\)/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop after the current video' })));
    expect(sendTo).toHaveBeenCalledWith(7);
    expect(other).toHaveBeenCalledWith('queue:stop', undefined);
    expect(api.send).not.toHaveBeenCalledWith('queue:stop', undefined);
  });

  const summaryReply = (api: ReturnType<typeof fakePanel>, needsConfirm = true) =>
    vi.mocked(api.send).mockImplementation((async (type: string) =>
      type === 'queue:preflight'
        ? { pendingN: 1, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: ['i0'], editRev: 0, sig: 's', times: [], vis: 'PRIVATE', noTxt: 0, noThumb: 0, badTime: [], prevUp: [], badTl: [], needsConfirm }
        : undefined) as never);

  // ask() resolves null when its question is replaced by another: null is not a yes.
  it('a summary replaced by another question (null) starts nothing', async () => {
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]) });
    summaryReply(api);
    const Other = () => {
      const ask = useAsk();
      return <button type="button" onClick={() => void ask({ title: 'Other question' })}>other</button>;
    };
    renderPanel(<><QueueFooter /><Other /></>, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Upload 1 video\(s\)/ })));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText('other')));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(screen.getByText('Other question')).toBeTruthy();
    expect(api.send).not.toHaveBeenCalledWith('queue:start', expect.anything());
  });

  it('Start is off while the tab is not linked', () => {
    renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'pending' }]), link: 'none' as never }));
    expect((screen.getByRole('button', { name: /Upload 1 video\(s\)/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the running title counts errors too', () => {
    renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'done' }, { status: 'error' }, { status: 'uploading' }]) }), fakeLive({ state: state({ running: true }), liveState: state({ running: true }) }));
    expect(screen.getByText('Uploading 3/3')).toBeTruthy();
  });

  it('a second click while the summary is being fetched is ignored', async () => {
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]) });
    let reply!: (v: unknown) => void;
    vi.mocked(api.send).mockImplementation(((type: string) => (type === 'queue:preflight' ? new Promise((r) => { reply = r; }) : Promise.resolve())) as never);
    renderPanel(<QueueFooter />, api);
    const start = screen.getByRole('button', { name: /Upload 1 video\(s\)/ }) as HTMLButtonElement;
    await act(async () => { fireEvent.click(start); fireEvent.click(start); });
    expect(vi.mocked(api.send).mock.calls.filter(([t]) => t === 'queue:preflight')).toHaveLength(1);
    expect(start.disabled).toBe(true);
    await act(async () => reply({ error: 'No videos waiting in the queue' }));
    expect(start.disabled).toBe(false);
  });

  it('Stop is on while another tab holds the run, before its state arrives', () => {
    renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'pending' }]), runner: { tabId: 7, windowId: 2, title: 'Other', jobs: ['queue'] }, elsewhere: true }), fakeLive({ state: state(), liveState: state() }));
    expect((screen.getByRole('button', { name: 'Stop after the current video' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('the Start button has the play icon, which spins while running', () => {
    const { container } = renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'uploading' }]) }), fakeLive({ state: state({ running: true }), liveState: state({ running: true }) }));
    const gi = container.querySelector('[data-go-icon]')!;
    expect(gi).toBeTruthy();
    expect(gi.className).toContain('animate-');
    cleanup();
    const idle = renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'pending' }]) }));
    expect(idle.container.querySelector('[data-go-icon]')!.className).not.toContain('animate-');
  });

  it('a Clear the tab does not take says so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ view: viewWith([{ status: 'done' }]) });
    vi.mocked(api.send).mockRejectedValue(new Error('gone'));
    renderPanel(<QueueFooter />, api);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear finished videos from the list' }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(toast).toHaveBeenCalledWith(RELOAD);
    err.mockRestore();
  });

  it('Clear sends queue:clearDone once a video is done', () => {
    const api = fakePanel({ view: viewWith([{ status: 'done' }]) });
    renderPanel(<QueueFooter />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Clear finished videos from the list' }));
    expect(api.send).toHaveBeenCalledWith('queue:clearDone', undefined);
  });
});
