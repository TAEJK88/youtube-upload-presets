import type { QueueView } from '../studio/queue-view';

// Keeps the panel's copy of the bound tab's QueueView fresh: fetched at once when the panel
// binds to a tab, then again (coalesced) whenever something pokes it — a queue:state
// broadcast, a storage change, the minute timer. 'noScript': the tab has no live content
// script (opened before the extension was installed or reloaded). A tab that is still
// loading has none yet either: for a grace period after a bind or a load-complete a failed
// fetch stays 'loading' and is retried. Any other failure is the handler's, not a missing
// script: it goes to onError and never shows "reload this tab".
export type LinkStatus = 'noTab' | 'loading' | 'ok' | 'noScript';

export interface ViewSync {
  bind(tabId: number | null): void;
  loading(): void; // the tab started (re)loading: answers from before are dropped
  loaded(): void; // the tab finished loading: fetch again, with a fresh grace period
  poke(): void;
  dispose(): void;
}

export function createViewSync(o: {
  fetch(tabId: number): Promise<QueueView>;
  onView(v: QueueView | null): void;
  onStatus(s: LinkStatus): void;
  onError?(e: unknown): void;
  delayMs?: number;
  graceMs?: number;
  retryMs?: number;
}): ViewSync {
  let tabId: number | null = null;
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: LinkStatus = 'noTab';
  let graceUntil = 0;
  const grace = () => { graceUntil = Date.now() + (o.graceMs ?? 2000); };
  const set = (s: LinkStatus) => {
    if (s === status) return;
    status = s;
    o.onStatus(s);
  };
  const run = async () => {
    timer = undefined;
    if (tabId === null) return;
    const g = gen;
    try {
      const v = await o.fetch(tabId);
      if (g !== gen) return;
      set('ok');
      o.onView(v);
    } catch (e) {
      if (g !== gen) return;
      if (!/Receiving end does not exist|Could not establish connection/i.test(String((e as Error)?.message ?? e))) {
        console.error('[ytup] queue:view failed', e);
        o.onError?.(e);
      } else if (Date.now() < graceUntil) {
        set('loading');
        timer = setTimeout(() => void run(), o.retryMs ?? 300);
      } else set('noScript');
    }
  };
  return {
    bind(id) {
      gen++;
      clearTimeout(timer);
      timer = undefined;
      tabId = id;
      grace();
      o.onView(null);
      if (id === null) return set('noTab');
      set('loading');
      void run();
    },
    loading() {
      if (tabId === null) return;
      gen++;
      clearTimeout(timer);
      timer = undefined;
      grace();
      set('loading');
    },
    loaded() {
      if (tabId === null) return;
      grace();
      clearTimeout(timer);
      timer = setTimeout(() => void run(), o.delayMs ?? 120);
    },
    poke() {
      if (tabId === null) return;
      clearTimeout(timer);
      timer = setTimeout(() => void run(), o.delayMs ?? 120);
    },
    dispose() {
      gen++;
      clearTimeout(timer);
      tabId = null;
    },
  };
}
