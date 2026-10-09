import { L } from '../i18n';
import { sendMessage } from '../messages';
import { ui } from './page-ui';
import { otherTabRunning } from './queue-runner';
import { followOtherTab, restoreQueue } from './queue-store';

// The Studio content script's link to the runner lock (lib/runner-lock.ts, through the
// background), kept out of the entrypoint so it can be tested.

// Does another Studio tab hold the lock? Each answer is cached (followOtherTab) for what
// can't wait for one: queue saves and the intercept.
export const elsewhere = (): Promise<boolean> =>
  sendMessage('runner:elsewhere', 'queue')
    .catch(() => otherTabRunning()) // no answer is not "the lock is free": keep what we knew
    .then(async (v) => (await followOtherTab(v), v));

// At startup. A reload in the middle of a run leaves this tab's lock behind, so it goes
// first — the queue's job only: a copyright job (a trim run changes pages) keeps it (D21).
// Then the stored queue comes back, its unfinished items cut unless another tab is the one
// running them.
export async function resumeQueue(): Promise<void> {
  await sendMessage('runner:release', 'queue').catch(() => {});
  restoreQueue(!(await elsewhere()));
}

// While another tab runs the queue, its writes would overwrite ours.
export async function mayEdit(): Promise<boolean> {
  if (!(await elsewhere())) return true;
  ui.toast(L('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', 'Another Studio tab is running the queue — change the queue there'));
  return false;
}

// Leaving Studio frees the lock at once (pagehide; the background also frees it when the tab
// closes or leaves Studio). A page kept in the back/forward cache is frozen, not gone: back
// from it (pageshow, persisted) with its run still going, it takes the lock again, or, when
// another tab took it meanwhile, aborts the run at once: the other tab already cut this tab's
// in-flight item to 'interrupted' (its upload stays a draft in Studio), so nothing is uploaded
// twice and no release slot is shared (closes 3b R-M3).
export function watchLockLifecycle(
  win: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  d: { release(): void; acquire(): Promise<boolean>; running(): boolean; abort(): void; toast(msg: string): void },
): () => void {
  const hide = () => d.release();
  const show = (e: Event) => {
    if (!(e as PageTransitionEvent).persisted || !d.running()) return;
    void d.acquire().then((ok) => {
      if (ok) return;
      d.abort();
      d.toast(L('มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่', 'Another Studio tab is already running the queue'));
    });
  };
  win.addEventListener('pagehide', hide);
  win.addEventListener('pageshow', show);
  return () => {
    win.removeEventListener('pagehide', hide);
    win.removeEventListener('pageshow', show);
  };
}
