import { L } from '../i18n';
import { sendMessage } from '../messages';
import { ui } from './page-ui';
import { followOtherTab, restoreQueue } from './queue-store';

// The Studio content script's link to the runner lock (lib/runner-lock.ts, through the
// background), kept out of the entrypoint so it can be tested.

// Does another Studio tab hold the lock? Each answer is cached (followOtherTab) for what
// can't wait for one: queue saves and the intercept.
export const elsewhere = (): Promise<boolean> =>
  sendMessage('runner:elsewhere', undefined)
    .catch(() => false)
    .then((v) => (followOtherTab(v), v));

// At startup. A reload in the middle of a run leaves this tab's lock behind, so it goes
// first; then the stored queue comes back, its unfinished items cut unless another tab
// is the one running them.
export async function resumeQueue(): Promise<void> {
  await sendMessage('runner:release', undefined).catch(() => {});
  restoreQueue(!(await elsewhere()));
}

// While another tab runs the queue, its writes would overwrite ours.
export async function mayEdit(): Promise<boolean> {
  if (!(await elsewhere())) return true;
  ui.toast(L('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', 'Another Studio tab is running the queue — change the queue there'));
  return false;
}
