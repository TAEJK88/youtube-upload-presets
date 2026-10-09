import { L } from '../i18n';
import type { StartBinding, StartSummary } from '../studio/queue-runner';
import type { RunnerTab } from './target';

const notConnected = () => L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab');

// The drawer's Start button: the run's pre-start ask() (2111–2143) now happens in the panel.
// The page answers queue:preflight with what the ask showed; once confirmed, queue:start
// carries the channel, items and edit count the user saw, and the page starts only if all
// still hold (startQueue's bindingProblem).
export async function startFlow(d: {
  preflight(): Promise<StartSummary | { error: string }>;
  confirm(s: StartSummary): Promise<boolean>;
  start(b: StartBinding): Promise<unknown>;
  toast(msg: string): void;
}): Promise<'error' | 'cancelled' | 'started'> {
  try {
    const s = await d.preflight();
    if ('error' in s) {
      d.toast(s.error);
      return 'error';
    }
    if (s.needsConfirm && !(await d.confirm(s))) return 'cancelled';
    await d.start({ channelId: s.channel.id, ids: s.ids, editRev: s.editRev });
    return 'started';
  } catch (e) {
    console.error('[ytup] start failed', e);
    d.toast(notConnected());
    return 'error';
  }
}

// Stop goes to the tab that holds the runner lock (D14). When that is this panel's tab its
// page announces the stop itself (queue-ops stopQueue); when it is another tab, whose toasts
// the panel doesn't show, the panel names it.
export async function stopFlow(d: {
  bound: number | null;
  runner: RunnerTab | null;
  stop(tabId: number): Promise<unknown>;
  toast(msg: string): void;
}): Promise<void> {
  const r = d.runner;
  if (r && r.tabId !== d.bound) {
    try {
      await d.stop(r.tabId);
    } catch (e) {
      return console.error('[ytup] stop failed', e); // the runner's page is gone: nothing to stop
    }
    d.toast(L(`จะหยุดคิวในแท็บ "${r.title}" หลังคลิปปัจจุบันเสร็จ`, `Will stop the queue in the tab "${r.title}" after the current video finishes`));
    return;
  }
  if (d.bound === null) return;
  try {
    await d.stop(d.bound);
  } catch (e) {
    console.error('[ytup] stop failed', e);
    d.toast(notConnected());
  }
}
