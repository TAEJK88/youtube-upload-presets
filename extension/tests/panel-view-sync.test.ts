import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewSync, type LinkStatus } from '../lib/panel/view-sync';
import type { QueueView } from '../lib/studio/queue-view';

const view = (n: number) => ({ items: [], current: null, n }) as unknown as QueueView;
let statuses: LinkStatus[];
let views: (QueueView | null)[];

beforeEach(() => {
  vi.useFakeTimers();
  statuses = [];
  views = [];
});
afterEach(() => vi.useRealTimers());

const make = (fetch: (id: number) => Promise<QueueView>) =>
  createViewSync({ fetch, onView: (v) => views.push(v), onStatus: (s) => statuses.push(s), delayMs: 100 });

describe('createViewSync', () => {
  it('binding fetches at once; pokes are coalesced', async () => {
    let n = 0;
    const fetch = vi.fn(async () => view(++n));
    const s = make(fetch);
    s.bind(7);
    await vi.runAllTimersAsync();
    expect(statuses).toEqual(['loading', 'ok']);
    s.poke();
    s.poke();
    s.poke();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(views.at(-1)).toEqual(view(2));
  });

  it('no content script answering → noScript; a later answer → ok', async () => {
    let up = false;
    const s = make(async () => {
      if (!up) throw new Error('Could not establish connection. Receiving end does not exist.');
      return view(1);
    });
    s.bind(7);
    await vi.runAllTimersAsync();
    expect(statuses).toEqual(['loading', 'noScript']);
    up = true;
    s.poke();
    await vi.advanceTimersByTimeAsync(100);
    expect(statuses).toEqual(['loading', 'noScript', 'ok']);
  });

  it('an answer from the tab bound before is dropped', async () => {
    let release!: (v: QueueView) => void;
    const s = make((id) => (id === 1 ? new Promise((r) => (release = r)) : Promise.resolve(view(2))));
    s.bind(1);
    s.bind(2);
    await vi.runAllTimersAsync();
    release(view(1));
    await vi.runAllTimersAsync();
    expect(views.filter(Boolean)).toEqual([view(2)]);
  });

  it('no tab → noTab and no fetch', async () => {
    const fetch = vi.fn(async () => view(1));
    const s = make(fetch);
    s.bind(3);
    await vi.runAllTimersAsync();
    s.bind(null);
    s.poke();
    await vi.runAllTimersAsync();
    expect(statuses.at(-1)).toBe('noTab');
    expect(views.at(-1)).toBe(null);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
