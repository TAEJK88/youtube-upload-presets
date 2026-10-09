import type { QueueView } from '../studio/queue-view';

// Keeps the panel's copy of the bound tab's QueueView fresh: fetched at once when the panel
// binds to a tab, then again (coalesced) whenever something pokes it — a queue:state
// broadcast, a storage change, the minute timer. 'noScript': the tab has no live content
// script (opened before the extension was installed or reloaded, or still loading).
export type LinkStatus = 'noTab' | 'loading' | 'ok' | 'noScript';

export interface ViewSync {
  bind(tabId: number | null): void;
  loading(): void; // the tab started (re)loading: answers from before are dropped
  poke(): void;
  dispose(): void;
}

export function createViewSync(o: {
  fetch(tabId: number): Promise<QueueView>;
  onView(v: QueueView | null): void;
  onStatus(s: LinkStatus): void;
  delayMs?: number;
}): ViewSync {
  let tabId: number | null = null;
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: LinkStatus = 'noTab';
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
    } catch {
      if (g === gen) set('noScript');
    }
  };
  return {
    bind(id) {
      gen++;
      clearTimeout(timer);
      timer = undefined;
      tabId = id;
      o.onView(null);
      if (id === null) return set('noTab');
      set('loading');
      void run();
    },
    loading() {
      if (tabId === null) return;
      gen++;
      set('loading');
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
