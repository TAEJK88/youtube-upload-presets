// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RescheduleView } from '../entrypoints/sidepanel/tabs/copyright/RescheduleView';
import { toClaimsData } from '../lib/panel/claims-data';
import { fmtWhen, toLocalInput } from '../lib/panel/format';
import type { PanelApi } from '../entrypoints/sidepanel/panel';
import { fakeClaims, fakeLive, fakePanel, renderPanel } from './panel-fake';
import { ClaimsContext, LiveContext, PanelContext } from '../entrypoints/sidepanel/panel';
import { AskProvider } from '../entrypoints/sidepanel/ask';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));

const DAY = 86400e3;
const A = Date.UTC(2027, 0, 10, 12); // the earliest
const videos = [
  { videoId: 'bbbbbbbbbbb', title: 'Mix B', at: A + 2 * DAY },
  { videoId: 'aaaaaaaaaaa', title: 'Mix A', at: A },
  { videoId: 'ccccccccccc', title: 'Mix C', at: A + 4 * DAY },
];
// The bound Studio tab's answers, by message.
function tab(answers: Record<string, (data?: unknown) => unknown>) {
  const send = vi.fn(async (type: string, data?: unknown) => answers[type]?.(data)) as unknown as PanelApi['send'];
  return { api: fakePanel({ send }), send: send as unknown as ReturnType<typeof vi.fn> };
}
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
// The channel's stored copyright data, with the Reschedule run the bound tab writes.
const data = (run: unknown = null) => toClaimsData('UC1', run ? { 'rescheduleRun:UC1': run } : {});
const view = (props: { busy?: boolean; run?: unknown; open?: boolean } = {}) => <RescheduleView channelName="Mine" data={data(props.run)} busy={!!props.busy} open={props.open ?? true} />;
const when = () => screen.getByLabelText('New time for the earliest picked video') as HTMLInputElement;

beforeEach(() => vi.mocked(toast).mockClear());
afterEach(() => cleanup());

describe('Reschedule (Tools tab)', () => {
  it("asks the Studio tab for the channel's scheduled videos and lists them earliest first, none ticked", async () => {
    const { api, send } = tab({ 'reschedule:list': () => ({ videos }) });
    renderPanel(view(), api);
    await screen.findByText('Mix A');
    expect(send).toHaveBeenCalledWith('reschedule:list', undefined);
    expect(screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-labelledby') && document.getElementById(b.getAttribute('aria-labelledby')!)!.textContent)).toEqual(['Mix A', 'Mix B', 'Mix C']);
    expect(screen.getByText(fmtWhen(A))).toBeTruthy();
    expect(screen.getAllByRole('checkbox').every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    expect(button('Apply to 0 videos').disabled).toBe(true);
  });

  it('All and None tick and untick every video', async () => {
    renderPanel(view(), tab({ 'reschedule:list': () => ({ videos }) }).api);
    await screen.findByText('Mix A');
    fireEvent.click(button('All'));
    expect([box('Mix A').checked, box('Mix B').checked, box('Mix C').checked]).toEqual([true, true, true]);
    fireEvent.click(button('None'));
    expect([box('Mix A').checked, box('Mix B').checked, box('Mix C').checked]).toEqual([false, false, false]);
  });

  it('the time starts at the earliest ticked video, the preview follows it, and Apply sends one message with the times it showed', async () => {
    const { api, send } = tab({ 'reschedule:list': () => ({ videos }), 'reschedule:apply': () => ({ started: 2 }) });
    renderPanel(view(), api);
    await screen.findByText('Mix A');
    fireEvent.click(box('Mix C'));
    fireEvent.click(box('Mix B'));
    expect(when().value).toBe(toLocalInput(A + 2 * DAY)); // Mix B, the earliest of the two
    expect(screen.getByText(`2 videos: ${fmtWhen(A + 2 * DAY)} – ${fmtWhen(A + 4 * DAY)} → ${fmtWhen(A + 2 * DAY)} – ${fmtWhen(A + 4 * DAY)}`)).toBeTruthy();
    const start = new Date(toLocalInput(A + 30 * DAY)).getTime();
    fireEvent.change(when(), { target: { value: toLocalInput(start) } });
    expect(screen.getByText(`2 videos: ${fmtWhen(A + 2 * DAY)} – ${fmtWhen(A + 4 * DAY)} → ${fmtWhen(start)} – ${fmtWhen(start + 2 * DAY)}`)).toBeTruthy();
    fireEvent.click(button('Apply to 2 videos'));
    expect(await screen.findByText(`Move 2 videos 28 days later: ${fmtWhen(A + 2 * DAY)} – ${fmtWhen(A + 4 * DAY)} → ${fmtWhen(start)} – ${fmtWhen(start + 2 * DAY)}?`)).toBeTruthy();
    expect(send).not.toHaveBeenCalledWith('reschedule:apply', expect.anything()); // nothing moves before the answer
    await act(async () => fireEvent.click(button('Move 2 videos')));
    expect(send).toHaveBeenCalledWith('reschedule:apply', { items: [{ videoId: 'bbbbbbbbbbb', at: A + 2 * DAY }, { videoId: 'ccccccccccc', at: A + 4 * DAY }], start });
  });

  it('Apply starts the run: the ticks clear, and the rows follow the run as the tab writes it', async () => {
    const { api, send } = tab({ 'reschedule:list': () => ({ videos }), 'reschedule:apply': () => ({ started: 2 }) });
    const r = renderPanel(view(), api);
    await screen.findByText('Mix A');
    fireEvent.click(box('Mix A'));
    fireEvent.click(box('Mix B'));
    fireEvent.click(button('Apply to 2 videos'));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Move 2 videos' })));
    await screen.findByText('Started: 2 videos');
    expect([box('Mix A').checked, box('Mix B').checked]).toEqual([false, false]);
    const running = { active: true, started: 's', items: [
      { videoId: 'aaaaaaaaaaa', video: 'Mix A', state: 'moved', msg: '', at: A + 30 * DAY },
      { videoId: 'bbbbbbbbbbb', video: 'Mix B', state: 'failed', msg: 'Could not open the calendar', at: A + 32 * DAY },
      { videoId: 'ccccccccccc', video: 'Mix C', state: 'pending', msg: '', at: A + 34 * DAY },
    ] };
    const wrap = (d: ReturnType<typeof data>, busy: boolean) => (
      <PanelContext.Provider value={api}><LiveContext.Provider value={fakeLive()}><ClaimsContext.Provider value={fakeClaims()}>
        <AskProvider><RescheduleView channelName="Mine" data={d} busy={busy} open /></AskProvider>
      </ClaimsContext.Provider></LiveContext.Provider></PanelContext.Provider>
    );
    r.rerender(wrap(data(running), true));
    expect(screen.getByText(`✅ Moved to ${fmtWhen(A + 30 * DAY)}`)).toBeTruthy();
    expect(screen.getByText('❌ Could not open the calendar')).toBeTruthy();
    expect(screen.getByText('⏳ Waiting')).toBeTruthy();
    expect(screen.getByText('Moved 1 · Failed 1 · Left 1')).toBeTruthy();
    expect(button('Apply to 0 videos').disabled).toBe(true); // nothing new starts while it runs
    const before = send.mock.calls.filter(([t]) => t === 'reschedule:list').length;
    r.rerender(wrap(data({ ...running, active: false }), false)); // the run ended (or was stopped)
    await waitFor(() => expect(send.mock.calls.filter(([t]) => t === 'reschedule:list').length).toBe(before + 1)); // the times are read again
    expect(screen.getByText('Moved 1 · Failed 1 · Not done 1')).toBeTruthy();
  });

  it('while another job runs, Apply stays off', async () => {
    renderPanel(view({ busy: true }), tab({ 'reschedule:list': () => ({ videos }) }).api);
    await screen.findByText('Mix A');
    fireEvent.click(box('Mix A'));
    expect(button('Apply to 1 videos').disabled).toBe(true);
  });

  // The live test (2026-10-29): Apply started a run for all 25 videos with a time left from an
  // earlier session. It now asks first, names the count and the range, and nothing carries over.
  describe('nothing moves without a deliberate, informed Apply', () => {
    it('a move earlier by more than a day says so in the question', async () => {
      const { api } = tab({ 'reschedule:list': () => ({ videos }) });
      renderPanel(view(), api);
      await screen.findByText('Mix A');
      fireEvent.click(button('All'));
      const start = new Date(toLocalInput(A - 111 * DAY)).getTime();
      fireEvent.change(when(), { target: { value: toLocalInput(start) } });
      fireEvent.click(button('Apply to 3 videos'));
      expect(await screen.findByText(`Move 3 videos 111 days earlier: ${fmtWhen(A)} – ${fmtWhen(A + 4 * DAY)} → ${fmtWhen(start)} – ${fmtWhen(start + 4 * DAY)}?`)).toBeTruthy();
    });

    it('editing only the time keeps the date, and what Apply sends is what the box shows', async () => {
      const { api, send } = tab({ 'reschedule:list': () => ({ videos }), 'reschedule:apply': () => ({ started: 1 }) });
      renderPanel(view(), api);
      await screen.findByText('Mix A');
      fireEvent.click(box('Mix C'));
      const day = toLocalInput(A + 4 * DAY).slice(0, 10);
      fireEvent.change(when(), { target: { value: `${day}T03:07` } }); // the time segment only
      expect(when().value).toBe(`${day}T03:07`);
      fireEvent.click(button('Apply to 1 videos'));
      await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Move 1 videos' })));
      expect(send).toHaveBeenCalledWith('reschedule:apply', { items: [{ videoId: 'ccccccccccc', at: A + 4 * DAY }], start: new Date(`${day}T03:07`).getTime() });
    });

    it('a focused time box still shows the time Apply would send when the ticks change', async () => {
      renderPanel(view(), tab({ 'reschedule:list': () => ({ videos }) }).api);
      await screen.findByText('Mix A');
      fireEvent.click(box('Mix C'));
      when().focus();
      fireEvent.change(when(), { target: { value: toLocalInput(A + 30 * DAY) } });
      fireEvent.click(box('Mix A')); // a new set: the typed time goes
      expect(when().value).toBe(toLocalInput(A));
    });

    it('Cancel in the question sends nothing', async () => {
      const { api, send } = tab({ 'reschedule:list': () => ({ videos }) });
      renderPanel(view(), api);
      await screen.findByText('Mix A');
      fireEvent.click(box('Mix A'));
      fireEvent.click(button('Apply to 1 videos'));
      await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })));
      expect(send).not.toHaveBeenCalledWith('reschedule:apply', expect.anything());
    });

    it('no button outside the question starts with "Reschedule"', async () => {
      renderPanel(view(), tab({ 'reschedule:list': () => ({ videos }) }).api);
      await screen.findByText('Mix A');
      fireEvent.click(button('All'));
      expect(screen.getAllByRole('button').filter((b) => /^Reschedule/.test(b.textContent ?? ''))).toEqual([]);
    });

    it('a list read again clears the ticks and the time typed for them', async () => {
      const { api, send } = tab({ 'reschedule:list': () => ({ videos }) });
      renderPanel(view(), api);
      await screen.findByText('Mix A');
      fireEvent.click(button('All'));
      fireEvent.change(when(), { target: { value: toLocalInput(A + 30 * DAY) } });
      fireEvent.click(button('↻ Reload list'));
      await waitFor(() => expect(send.mock.calls.filter(([t]) => t === 'reschedule:list')).toHaveLength(2));
      await waitFor(() => expect(button('Apply to 0 videos').disabled).toBe(true));
      fireEvent.click(box('Mix B'));
      expect(when().value).toBe(toLocalInput(A + 2 * DAY)); // its own time, not the one typed before
    });

    it('a different set of ticks drops the time typed for the last set', async () => {
      renderPanel(view(), tab({ 'reschedule:list': () => ({ videos }) }).api);
      await screen.findByText('Mix A');
      fireEvent.click(box('Mix C'));
      fireEvent.change(when(), { target: { value: toLocalInput(A + 30 * DAY) } });
      fireEvent.click(button('All'));
      expect(when().value).toBe(toLocalInput(A)); // the earliest of the new set
    });

    it('coming back to the group starts again: a fresh list, nothing ticked', async () => {
      const { api, send } = tab({ 'reschedule:list': () => ({ videos }) });
      const r = renderPanel(view(), api);
      await screen.findByText('Mix A');
      fireEvent.click(button('All'));
      const wrap = (open: boolean) => (
        <PanelContext.Provider value={api}><LiveContext.Provider value={fakeLive()}><ClaimsContext.Provider value={fakeClaims()}>
          <AskProvider><RescheduleView channelName="Mine" data={data()} busy={false} open={open} /></AskProvider>
        </ClaimsContext.Provider></LiveContext.Provider></PanelContext.Provider>
      );
      r.rerender(wrap(false)); // another group shows
      r.rerender(wrap(true)); // and this one again
      await waitFor(() => expect(send.mock.calls.filter(([t]) => t === 'reschedule:list')).toHaveLength(2));
      await waitFor(() => expect(button('Apply to 0 videos').disabled).toBe(true));
    });
  });

  it("says the tab's refusal (a start too soon, a failed read) and moves nothing", async () => {
    const { api } = tab({ 'reschedule:list': () => ({ videos }), 'reschedule:apply': () => ({ error: 'Release time must be at least 15 minutes in the future' }) });
    renderPanel(view(), api);
    await screen.findByText('Mix A');
    fireEvent.click(box('Mix A'));
    fireEvent.click(button('Apply to 1 videos'));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Move 1 videos' })));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Release time must be at least 15 minutes in the future'));
  });

  it('a list the tab could not read shows its reason and Reload list', async () => {
    let fail = true;
    const { api } = tab({ 'reschedule:list': () => (fail ? { error: "Couldn't read the current release times, try again" } : { videos }) });
    renderPanel(view(), api);
    await screen.findByText("Couldn't read the current release times, try again");
    fail = false;
    fireEvent.click(button('↻ Reload list'));
    await screen.findByText('Mix A');
  });

  it('a channel with nothing scheduled says so', async () => {
    renderPanel(view(), tab({ 'reschedule:list': () => ({ videos: [] }) }).api);
    await screen.findByText('No scheduled videos on this channel');
  });

  it('a tab without the script says to reload it', async () => {
    const send = vi.fn(async () => { throw new Error('no receiver'); }) as unknown as PanelApi['send'];
    renderPanel(view(), fakePanel({ send }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('This tab is not connected to the extension yet — reload this tab', { id: 'not-connected' }));
  });
});
