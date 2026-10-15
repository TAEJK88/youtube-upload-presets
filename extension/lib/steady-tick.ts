import { browser } from 'wxt/browser';

// Chrome slows the timers of a tab hidden for a while to about one run a minute ("intensive
// throttling"), so the invite watcher's one-second polls took minutes in a background tab
// (seen 2026-10-15: a request list sat untouched until the tab was brought to the front).
// Extension messages are not throttled: while the page is hidden the background sends a tick
// over a port every second, and the callback runs on whichever comes first, at most once per
// interval.
export const TICK_PORT = 'ytup-tick';

type Interval = (fn: () => void, ms: number) => unknown;
const stops = new Map<unknown, () => void>();

export function steadyInterval(base: Interval, fn: () => void, ms: number) {
  let last = 0;
  const run = () => {
    const now = Date.now();
    if (now - last < ms * 0.8) return;
    last = now;
    fn();
  };
  const id = base(run, ms);
  let port: ReturnType<typeof browser.runtime.connect> | null = null;
  const sync = () => {
    if (document.hidden && !port) {
      try {
        const p = browser.runtime.connect({ name: TICK_PORT });
        p.onMessage.addListener(run);
        p.onDisconnect.addListener(() => { if (port === p) port = null; });
        port = p;
      } catch (e) {
        console.warn('[ytup] tick port', e); // the page's own (slow) timer still runs
      }
    } else if (!document.hidden && port) {
      port.disconnect();
      port = null;
    }
  };
  sync();
  document.addEventListener('visibilitychange', sync);
  stops.set(id, () => {
    document.removeEventListener('visibilitychange', sync);
    port?.disconnect();
    port = null;
  });
  return id;
}

export function clearSteady(id: unknown) {
  stops.get(id)?.();
  stops.delete(id);
}

// The background's side: a tick every second while the page holds the port.
export const registerTicks = () => browser.runtime.onConnect.addListener(serveTicks);
export function serveTicks(port: { name: string; postMessage(m: unknown): void; onDisconnect: { addListener(fn: () => void): void } }) {
  if (port.name !== TICK_PORT) return;
  const id = setInterval(() => {
    try {
      port.postMessage(0);
    } catch {
      clearInterval(id);
    }
  }, 1000);
  port.onDisconnect.addListener(() => clearInterval(id));
}
