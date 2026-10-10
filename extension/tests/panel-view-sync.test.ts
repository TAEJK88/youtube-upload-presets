import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL } from '../lib/messages';
import { createViewSync, fetchView, type LinkStatus } from '../lib/panel/view-sync';
import type { QueueView } from '../lib/studio/queue-view';

const view = (n: number) => ({ items: [], current: null, n }) as unknown as QueueView;
let statuses: LinkStatus[];
let views: (QueueView | null)[];

beforeEach(() => {
  vi.useFakeTimers();
  statuses = [];
  views = [];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

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

  describe('grace period', () => {
    const noReceiver = () => new Error('Could not establish connection. Receiving end does not exist.');
    const mk = (fetch: (id: number) => Promise<QueueView>, errors: unknown[] = []) =>
      createViewSync({ fetch, onView: (v) => views.push(v), onStatus: (s) => statuses.push(s), onError: (e) => errors.push(e), delayMs: 100, graceMs: 2000, retryMs: 300 });

    it('a fetch failing during the grace is loading and retried, then ok', async () => {
      let n = 0;
      const s = mk(async () => {
        if (++n < 3) throw noReceiver();
        return view(1);
      });
      s.bind(7);
      await vi.advanceTimersByTimeAsync(1000);
      expect(statuses).toEqual(['loading', 'ok']);
    });

    it('failing beyond the grace is noScript', async () => {
      const s = mk(async () => { throw noReceiver(); });
      s.bind(7);
      await vi.advanceTimersByTimeAsync(1500);
      expect(statuses).toEqual(['loading']);
      await vi.advanceTimersByTimeAsync(1500);
      expect(statuses).toEqual(['loading', 'noScript']);
    });

    it('a load-complete opens a new grace', async () => {
      let up = false;
      const s = mk(async () => { if (!up) throw noReceiver(); return view(1); });
      s.bind(7);
      await vi.advanceTimersByTimeAsync(3000);
      expect(statuses).toEqual(['loading', 'noScript']);
      s.loading();
      s.loaded();
      await vi.advanceTimersByTimeAsync(500);
      expect(statuses).toEqual(['loading', 'noScript', 'loading']);
      up = true;
      await vi.advanceTimersByTimeAsync(500);
      expect(statuses.at(-1)).toBe('ok');
    });

    it('loading() clears a pending poke', async () => {
      const fetch = vi.fn(async () => view(1));
      const s = mk(fetch);
      s.bind(7);
      await vi.advanceTimersByTimeAsync(10);
      fetch.mockClear();
      s.poke();
      s.loading();
      await vi.advanceTimersByTimeAsync(500);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('a handler error is not noScript: reported, never "reload this tab"', async () => {
      const errors: unknown[] = [];
      const s = mk(async () => { throw new Error('boom'); }, errors);
      s.bind(7);
      await vi.advanceTimersByTimeAsync(5000);
      expect(statuses).not.toContain('noScript');
      expect(errors).toHaveLength(1);
    });

    it('a persistent handler error toasts once until a fetch succeeds or the message changes', async () => {
      const errors: unknown[] = [];
      let msg: string | null = 'boom';
      const s = mk(async () => { if (msg) throw new Error(msg); return view(1); }, errors);
      s.bind(7);
      await vi.advanceTimersByTimeAsync(10);
      for (let i = 0; i < 3; i++) { s.poke(); await vi.advanceTimersByTimeAsync(150); }
      expect(errors).toHaveLength(1);
      msg = 'other';
      s.poke();
      await vi.advanceTimersByTimeAsync(150);
      expect(errors).toHaveLength(2);
      msg = null;
      s.poke();
      await vi.advanceTimersByTimeAsync(150);
      msg = 'other';
      s.poke();
      await vi.advanceTimersByTimeAsync(150);
      expect(errors).toHaveLength(3);
    });

    it.each(['The message port closed before a response was received.', 'No tab with id: 7.'])(
      'transient navigation error "%s" is quiet and retried within the grace',
      async (m) => {
        const errors: unknown[] = [];
        let n = 0;
        const s = mk(async () => { if (++n < 3) throw new Error(m); return view(1); }, errors);
        s.bind(7);
        await vi.advanceTimersByTimeAsync(1000);
        expect(errors).toHaveLength(0);
        expect(statuses).toEqual(['loading', 'ok']);
      },
    );

    it('loaded() alone after the grace expired reopens it', async () => {
      let up = false;
      const s = mk(async () => { if (!up) throw noReceiver(); return view(1); });
      s.bind(7);
      await vi.advanceTimersByTimeAsync(3000);
      expect(statuses).toEqual(['loading', 'noScript']);
      s.loaded();
      await vi.advanceTimersByTimeAsync(500);
      expect(statuses).toEqual(['loading', 'noScript', 'loading']);
      up = true;
      await vi.advanceTimersByTimeAsync(500);
      expect(statuses.at(-1)).toBe('ok');
    });
  });

  // 4b final review I1 / I2: nothing faked between the sync and Chrome. @webext-core/messaging
  // never reads chrome.runtime.lastError for a send to a tab: Chrome calls back with undefined
  // (no script, a script orphaned by an extension reload, no handler for the type, a closed tab)
  // and the library throws "No response". Chrome's own texts never reach the panel.
  describe('through the real sendMessage', () => {
    const chromeAnswers = (answer: (message: { type: string }) => unknown) =>
      vi.stubGlobal('chrome', { runtime: {}, tabs: { sendMessage: (_id: number, m: { type: string }, _o: unknown, cb: (r: unknown) => void) => cb(answer(m)) } });
    const mk = (errors: unknown[]) =>
      createViewSync({ fetch: fetchView, onView: (v) => views.push(v), onStatus: (s) => statuses.push(s), onError: (e) => errors.push(e), delayMs: 100, graceMs: 2000, retryMs: 300 });

    it('a tab that does not answer is retried within the grace, then noScript; nothing is reported', async () => {
      const errors: unknown[] = [];
      chromeAnswers(() => undefined);
      await expect(fetchView(7)).rejects.toThrow('No response');
      const s = mk(errors);
      s.bind(7);
      await vi.advanceTimersByTimeAsync(1500);
      expect(statuses).toEqual(['loading']);
      await vi.advanceTimersByTimeAsync(1500);
      expect(statuses).toEqual(['loading', 'noScript']);
      expect(errors).toEqual([]);
    });

    it('a tab running another build (no proto, or a different one) is noScript: its view never reaches the panel', async () => {
      for (const res of [{ items: [{ id: 'a' }], current: null }, { items: [], proto: PROTOCOL + 1 }, null]) {
        statuses = [];
        views = [];
        const errors: unknown[] = [];
        chromeAnswers(() => ({ res }));
        const s = mk(errors);
        s.bind(7);
        await vi.advanceTimersByTimeAsync(3000);
        expect(statuses).toEqual(['loading', 'noScript']);
        expect(views).toEqual([null]); // bind's reset only
        expect(errors).toEqual([]);
        s.dispose();
      }
    });

    it('a tab running this build is ok', async () => {
      chromeAnswers(() => ({ res: { items: [], proto: PROTOCOL } }));
      const s = mk([]);
      s.bind(7);
      await vi.advanceTimersByTimeAsync(10);
      expect(statuses).toEqual(['loading', 'ok']);
      expect(views.at(-1)).toEqual({ items: [], proto: PROTOCOL });
    });

    it("the handler's own error is still reported, not noScript", async () => {
      const errors: unknown[] = [];
      chromeAnswers(() => ({ err: { name: 'Error', message: 'boom' } }));
      const s = mk(errors);
      s.bind(7);
      await vi.advanceTimersByTimeAsync(5000);
      expect(statuses).toEqual(['loading']);
      expect(errors).toHaveLength(1);
    });
  });
});
