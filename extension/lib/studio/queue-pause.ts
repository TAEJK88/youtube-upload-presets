import { load, save } from './state';

// YouTube's daily upload limit (P5-daily-limit; the userscript ended the queue there). The run
// that meets it stops and leaves this record, and the queue goes on by itself 24 hours later.
// It lives in chrome.storage.local ('queuePause'), so it survives a reload of the Studio tab, a
// closed side panel, a stopped service worker and a browser restart, and every Studio tab and
// the panel see the same one. While it is there no run is going and the automation lock is free.
export const PAUSE_KEY = 'queuePause';
export const PAUSE_MS = 24 * 3600e3; // "You can upload more videos in 24 hours."
export interface QueuePause {
  channel: string; // the channel that met the limit: only a tab on it resumes
  name: string; // as the panel shows it
  at: number; // when Studio said so
  until: number; // at + PAUSE_MS
}

const isPause = (v: unknown): v is QueuePause => {
  const p = v as Partial<QueuePause> | null;
  return !!p && typeof p === 'object' && typeof p.channel === 'string' && typeof p.name === 'string'
    && Number.isFinite(p.at) && Number.isFinite(p.until);
};
export const queuePause = (): QueuePause | null => {
  const p = load<unknown>(PAUSE_KEY, null);
  return isPause(p) ? p : null;
};
export function pauseQueue(ch: { id: string; name: string }, now = Date.now()): QueuePause {
  const p: QueuePause = { channel: ch.id, name: ch.name, at: now, until: now + PAUSE_MS };
  save(PAUSE_KEY, p);
  return p;
}
// True when there was one.
export function endPause(): boolean {
  if (load<unknown>(PAUSE_KEY, null) == null) return false;
  save(PAUSE_KEY, undefined);
  return true;
}

// The wake-up. The service worker cannot drive a page, so the Studio tab looks at the clock
// itself, on the tick it already has (0.8 s; a hidden tab's timers still run about once a
// minute, a frozen or discarded tab looks again when it is back). Nothing is armed that could be
// lost: whenever a Studio tab on that channel ticks after `until`, it resumes. With no such tab
// open the pause just stays. A resume that cannot start (the files need read access again,
// the wrong channel is locked) says why once on the page and is tried again every `retryMs`.
export function createPauseWatch(d: {
  channelId(): string;
  pending(): number;
  running(): boolean;
  resume(): Promise<string>; // '' = it ran, or another tab has the lock; else why it could not
  toast(msg: string): void;
  now?(): number;
  retryMs?: number;
}) {
  const now = d.now ?? Date.now;
  let busy = false;
  let nextTry = 0;
  let said = '';
  return {
    tick(): void {
      const p = queuePause();
      if (!p || busy || d.running()) return;
      // Nothing left to resume (the videos were removed): the pause is over.
      if (!d.pending()) return void endPause();
      if (now() < p.until || now() < nextTry || p.channel !== d.channelId()) return;
      busy = true;
      void d.resume().then((why) => {
        if (why && why !== said) d.toast(why);
        said = why;
      }, (e) => console.error('[ytup] resume after the daily limit', e)).finally(() => {
        busy = false;
        nextTry = now() + (d.retryMs ?? 60_000);
      });
    },
  };
}
