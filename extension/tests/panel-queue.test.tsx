// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as intake from '../lib/panel/intake';
import { QueueCard } from '../entrypoints/sidepanel/tabs/QueueCard';
import { QueueTab, usePanelDrop } from '../entrypoints/sidepanel/tabs/QueueTab';
import { ScheduleBox } from '../entrypoints/sidepanel/tabs/ScheduleBox';
import { PanelContext } from '../entrypoints/sidepanel/panel';
import { toPanelData } from '../lib/panel/data';
import type { QueueView, ViewItem } from '../lib/studio/queue-view';
import { fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

vi.mock('../lib/panel/intake', async (orig) => ({ ...(await orig<typeof import('../lib/panel/intake')>()), sendFiles: vi.fn(), dropHandles: vi.fn() }));

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

  it('Apply to all is off while the queue runs', () => {
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([{ status: 'uploading' }]) }), fakeLive({ liveState: state({ running: true }) }));
    expect((screen.getByRole('button', { name: /Apply to all/ }) as HTMLButtonElement).disabled).toBe(true);
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

  it('a drag without files is not taken', () => {
    const onDropped = vi.fn();
    render(<PanelContext.Provider value={fakePanel()}><Target onDropped={onDropped} /></PanelContext.Provider>);
    fireEvent.drop(screen.getByTestId('t'), { dataTransfer: { ...dt, types: ['text/plain'] } });
    expect(onDropped).not.toHaveBeenCalled();
    expect(intake.dropHandles).not.toHaveBeenCalled();
  });
});

describe('schedule box', () => {
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
    expect(api.write.settings).toHaveBeenCalledWith({ schedule: { start: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/) } });
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
    expect(screen.getByText(/^Starts .* · every 2 hours · 2 already scheduled on the channel \(next .*\) — skipped 1 slot\(s\)$/)).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '3' } });
    expect(api.write.settings).toHaveBeenLastCalledWith({ schedule: { every: 3 } });
    fireEvent.change(screen.getByLabelText('days'), { target: { value: 'hour' } });
    expect(api.write.settings).toHaveBeenLastCalledWith({ schedule: { unit: 'hour' } });
  });
});
