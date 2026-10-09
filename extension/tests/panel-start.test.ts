import { describe, expect, it, vi } from 'vitest';
import { startFlow, stopFlow } from '../lib/panel/start';
import type { StartSummary } from '../lib/studio/queue-runner';

const summary = (over: Partial<StartSummary> = {}): StartSummary => ({
  pendingN: 2, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: ['a', 'b'], editRev: 4, times: [], vis: 'PRIVATE',
  noTxt: 0, noThumb: 0, badTime: [], prevUp: [], badTl: [], needsConfirm: true, ...over,
});
const RELOAD = 'This tab is not connected to the extension yet — reload this tab';

describe('startFlow (the drawer\'s Start button, confirmed in the panel)', () => {
  it('preflight error → toast, nothing starts', async () => {
    const d = { preflight: async () => ({ error: 'No videos waiting in the queue' }), confirm: vi.fn(), start: vi.fn(), toast: vi.fn() };
    expect(await startFlow(d)).toBe('error');
    expect(d.toast).toHaveBeenCalledWith('No videos waiting in the queue');
    expect(d.start).not.toHaveBeenCalled();
  });

  it('confirmed → starts with exactly the channel, items and edit count the user saw', async () => {
    const d = { preflight: async () => summary(), confirm: vi.fn(async () => true), start: vi.fn(async () => {}), toast: vi.fn() };
    expect(await startFlow(d)).toBe('started');
    expect(d.start).toHaveBeenCalledWith({ channelId: 'UC1', ids: ['a', 'b'], editRev: 4, asked: true });
  });

  it('cancelled → nothing starts; no confirmation needed → starts directly', async () => {
    const no = { preflight: async () => summary(), confirm: vi.fn(async () => false), start: vi.fn(), toast: vi.fn() };
    expect(await startFlow(no)).toBe('cancelled');
    expect(no.start).not.toHaveBeenCalled();
    const quiet = { preflight: async () => summary({ needsConfirm: false }), confirm: vi.fn(), start: vi.fn(async () => {}), toast: vi.fn() };
    expect(await startFlow(quiet)).toBe('started');
    expect(quiet.confirm).not.toHaveBeenCalled();
    // Nothing was asked: the page's own re-check may still refuse (content-ui confirmStart).
    expect(quiet.start).toHaveBeenCalledWith({ channelId: 'UC1', ids: ['a', 'b'], editRev: 4, asked: false });
  });

  it('a tab that does not answer → says so instead of an unhandled rejection', async () => {
    const pre = { preflight: () => Promise.reject(new Error('no receiver')), confirm: vi.fn(), start: vi.fn(), toast: vi.fn() };
    expect(await startFlow(pre)).toBe('error');
    expect(pre.toast).toHaveBeenCalledWith(RELOAD);
    const st = { preflight: async () => summary(), confirm: vi.fn(async () => true), start: vi.fn(() => Promise.reject(new Error('gone'))), toast: vi.fn() };
    expect(await startFlow(st)).toBe('error');
    expect(st.toast).toHaveBeenCalledWith(RELOAD);
  });
});

describe('stopFlow', () => {
  it('stops the tab that runs the queue and names it when it is another tab', async () => {
    const d = { bound: 1, runner: { tabId: 7, windowId: 1, title: 'Channel content - YouTube Studio' }, stop: vi.fn(async () => {}), toast: vi.fn() };
    await stopFlow(d);
    expect(d.stop).toHaveBeenCalledWith(7);
    expect(d.toast).toHaveBeenCalledWith('Will stop the queue in the tab "Channel content - YouTube Studio" after the current video finishes');
  });

  it('this tab runs it: the page says so itself', async () => {
    const d = { bound: 1, runner: { tabId: 1, windowId: 1, title: 'x' }, stop: vi.fn(async () => {}), toast: vi.fn() };
    await stopFlow(d);
    expect(d.stop).toHaveBeenCalledWith(1);
    expect(d.toast).not.toHaveBeenCalled();
  });

  it('no lock holder known: the bound tab', async () => {
    const d = { bound: 3, runner: null, stop: vi.fn(async () => {}), toast: vi.fn() };
    await stopFlow(d);
    expect(d.stop).toHaveBeenCalledWith(3);
  });

  it('the tab name in the toast has no run mark from the title ("(2/5) ⬆", ✅, ⚠️)', async () => {
    for (const title of ['(2/5) ⬆ Channel content - YouTube Studio', '✅ Channel content - YouTube Studio', '⚠️ Channel content - YouTube Studio']) {
      const d = { bound: 1, runner: { tabId: 7, windowId: 1, title }, stop: vi.fn(async () => {}), toast: vi.fn() };
      await stopFlow(d);
      expect(d.toast).toHaveBeenCalledWith('Will stop the queue in the tab "Channel content - YouTube Studio" after the current video finishes');
    }
  });

  it('a stop that does not arrive is not announced', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const other = { bound: 1, runner: { tabId: 7, windowId: 1, title: 'T' }, stop: vi.fn(() => Promise.reject(new Error('gone'))), toast: vi.fn() };
    await stopFlow(other);
    expect(other.toast).not.toHaveBeenCalledWith(expect.stringContaining('Will stop'));
    expect(other.toast).toHaveBeenCalledWith('That tab is no longer running the queue'); // not silence
    err.mockRestore();
    const own = { bound: 1, runner: null, stop: vi.fn(() => Promise.reject(new Error('gone'))), toast: vi.fn() };
    await stopFlow(own);
    expect(own.toast).toHaveBeenCalledWith(RELOAD);
  });
});
