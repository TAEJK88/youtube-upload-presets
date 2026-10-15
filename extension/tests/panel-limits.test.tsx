// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { QueueFooter, StartSummaryBody } from '../entrypoints/sidepanel/tabs/QueueFooter';
import { SettingsTab } from '../entrypoints/sidepanel/tabs/SettingsTab';
import { setLang } from '../lib/i18n';
import { toPanelData } from '../lib/panel/data';
import { fmtWhen } from '../lib/panel/format';
import type { StartSummary } from '../lib/studio/queue-runner';
import { fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
beforeEach(() => setLang('en'));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The side panel's part of P5-daily-limit and P5-upload-batches.
const UNTIL = Date.parse('2026-10-14T10:00:00Z');
const paused = { until: UNTIL, channel: 'UC1', name: 'Mine' };
const live = (over: Parameters<typeof state>[0]) => fakeLive({ state: state(over), liveState: state(over) });

describe('upload footer: paused at the daily limit', () => {
  it('says so with the time, Start resumes now and Stop cancels the pause', async () => {
    const api = fakePanel({ view: viewWith([{ status: 'done' }, { status: 'pending' }, { status: 'pending' }]) });
    renderPanel(<QueueFooter />, api, live({ paused }));
    expect(screen.getByRole('status').textContent).toBe(`Paused: daily upload limit on Mine — resumes ${fmtWhen(UNTIL)} if a Studio tab on that channel is open`);
    fireEvent.click(screen.getByRole('button', { name: /Resume now: 2 video\(s\)/ }));
    await act(async () => {});
    expect(api.send).toHaveBeenCalledWith('queue:preflight', undefined); // the usual start, with its summary
    const stop = screen.getByRole('button', { name: 'Cancel the pause' }) as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
    fireEvent.click(stop);
    expect(api.send).toHaveBeenCalledWith('queue:stop', undefined);
  });

  it('a cancel the tab never got says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]), send: vi.fn(async () => { throw new Error('gone'); }) as never });
    renderPanel(<QueueFooter />, api, live({ paused }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the pause' }));
    await act(async () => {});
    expect(toast).toHaveBeenCalledWith('This tab is not connected to the extension yet — reload this tab');
  });

  it('no pause: no line, and Stop is the run\'s', () => {
    renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'pending' }]) }));
    expect(screen.queryByRole('status')).toBe(null);
    expect(screen.getByRole('button', { name: 'Stop after the current video' })).toBeTruthy();
    expect(screen.getByText('Upload 1 video(s)')).toBeTruthy();
  });
});

describe('upload footer: waiting for a batch', () => {
  it('shows what the run waits for, and Stop still stops the run', () => {
    const wait = 'Waiting for Studio to finish uploading batch 1 (2 of 3 still uploading) · Uploading 2 of 3';
    const api = fakePanel({ view: viewWith([{ status: 'done' }, { status: 'pending' }]) });
    renderPanel(<QueueFooter />, api, live({ running: true, wait }));
    expect(screen.getByRole('status').textContent).toBe(wait);
    fireEvent.click(screen.getByRole('button', { name: 'Stop after the current video' }));
    expect(api.send).toHaveBeenCalledWith('queue:stop', undefined);
  });
});

describe('start summary: the daily estimate', () => {
  const summary = (over: Partial<StartSummary> = {}): StartSummary => ({
    pendingN: 5, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: [], editRev: 0, sig: '', times: [], vis: 'PRIVATE',
    noTxt: 0, noThumb: 0, badTime: [], prevUp: [], badTl: [], needsConfirm: true, ...over,
  });

  it('warns with the sum, labelled an estimate, and says the start is still possible', () => {
    render(<StartSummaryBody s={summary({ daily: { recent: 12, limit: 15 } })} />);
    expect(screen.getByText('May go over the daily upload limit (an estimate)')).toBeTruthy();
    expect(screen.getByText('This browser uploaded 12 to this channel in the last 24 hours + 5 in this queue = 17 · your limit is 15')).toBeTruthy();
    expect(screen.getByText('YouTube publishes no number and counts uploads from every device — the extension only knows its own')).toBeTruthy();
    expect(screen.getByText('You can still start: at the real limit the queue pauses and resumes by itself 24 hours later')).toBeTruthy();
    expect(screen.queryByText(/Cancel to go back and fix/)).toBe(null); // nothing on a card to fix
  });

  it('the sum counts the videos that will be uploaded, not the drafts that are resumed (P5-draft-retry)', () => {
    render(<StartSummaryBody s={summary({ daily: { recent: 12, limit: 15, queued: 4 } })} />);
    expect(screen.getByText('This browser uploaded 12 to this channel in the last 24 hours + 4 in this queue = 16 · your limit is 15')).toBeTruthy();
  });

  it('within the number: no warning', () => {
    render(<StartSummaryBody s={summary()} />);
    expect(screen.queryByText(/daily upload limit/)).toBe(null);
  });
});

describe('settings tab: batch size and the daily number', () => {
  it('shows both next to the pause between files and writes whole numbers in range', () => {
    const api = fakePanel({ data: toPanelData({ settings: { batch: 15, dailyLimit: 15 } }) });
    renderPanel(<SettingsTab />, api);
    const set = (name: RegExp, value: string) => {
      const f = screen.getByRole('spinbutton', { name }) as HTMLInputElement;
      fireEvent.focus(f);
      fireEvent.change(f, { target: { value } });
      fireEvent.blur(f);
    };
    expect((screen.getByRole('spinbutton', { name: /Batch size/ }) as HTMLInputElement).value).toBe('15');
    set(/Batch size/, '3');
    expect(api.write.settings).toHaveBeenCalledWith({ batch: 3 });
    set(/Batch size/, '900');
    expect(api.write.settings).toHaveBeenCalledWith({ batch: 50 });
    set(/Daily upload limit/, '1');
    expect(api.write.settings).toHaveBeenCalledWith({ dailyLimit: 1 });
    set(/Daily upload limit/, '');
    expect(api.write.settings).toHaveBeenCalledWith({ dailyLimit: 0 });
    expect(screen.getByText(/at the limit the queue pauses and resumes by itself 24 hours later/)).toBeTruthy();
  });
});
