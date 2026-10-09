import { L } from '../i18n';
import { sendMessage, type QueueState } from '../messages';
import { beep, setTitleMark } from './page-notify';
import { pageToast } from './page-toast';
import type { PageUi } from './page-ui';
import { dropFiles } from './queue-files';
import { pollUploadProgress, queue, running, setTornDown, stopReq, tornDown, tornError, uploadProg } from './queue-runner';
import { persistQueue } from './queue-store';
import { settings } from './state';
import { channelView } from './queue-view';

// The PageUi the Studio content script runs with. What the userscript's drawer did is
// split three ways: the page keeps the tab-title mark, the sound and a toast; the queue
// is saved for the side panel to read; and a small live state is broadcast to it.
export function createContentUi() {
  let confirmed = false;
  let rev = 0;
  let last = '';
  const released = new Set<string>();
  // uploadOne() reads the draft id while waiting for Save without a ui call; the tick
  // saves it, so a reload in that wait still finds it (the interrupted-item message).
  let drafts: string | undefined;
  // Torn down (extension reloaded): a run still in flight must not put a mark back on the
  // tab title after the teardown cleared it, nor show its toasts.
  const mark = (m: string) => {
    if (!tornDown()) setTitleMark(m);
  };
  const state = (): QueueState => ({ running, stopping: running && stopReq, prog: uploadProg, rev, channel: channelView() });
  const broadcast = () => {
    const s = state();
    const sig = JSON.stringify(s);
    if (sig === last) return;
    last = sig;
    sendMessage('queue:state', s).catch(() => {}); // fails when no side panel is open
  };
  const changed = () => {
    rev++;
    persistQueue();
    broadcast();
  };
  const ui: PageUi & { setConfirmed(v: boolean): void; tick(): void; state(): QueueState; dispose(): void } = {
    item(it) {
      // An orphaned run stops at its next status change (queue-runner: setTornDown).
      if (tornDown()) throw tornError();
      // A finished item's files are no longer needed (spec: File intake, step 5).
      if (it.status === 'done' && !released.has(it.id)) {
        released.add(it.id);
        dropFiles([{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])]);
      }
      changed();
    },
    run() {
      // updateRunUI()'s one effect on the page: "(3/10) ⬆" in the tab title while running.
      const count = (s: string) => queue.filter((i) => i.status === s).length;
      const total = queue.length;
      if (running) mark(`(${Math.min(count('done') + count('error') + 1, total)}/${total}) ⬆`);
      changed();
    },
    queue: changed,
    schedule: changed,
    presetPreview: changed,
    toast(msg) {
      console.info('[ytup]', msg);
      if (!tornDown()) pageToast(msg);
      sendMessage('queue:toast', msg).catch(() => {});
    },
    openDrawer() {
      sendMessage('openPanel', undefined).catch(() => {}); // needs a user gesture; best effort
    },
    notifyDone(title, text, ok = true) {
      if (!settings.notify) return;
      beep(ok);
      sendMessage('notify', { title, text, focused: document.hasFocus() }).catch((e) => console.warn('[ytup] notify', e));
    },
    setTitleMark: mark,
    async confirmStart() {
      const ok = confirmed;
      confirmed = false;
      if (!ok) ui.toast(L('ยืนยันการอัปโหลดในแผงด้านข้างก่อน', 'Confirm the upload in the side panel first'));
      return ok;
    },
    dispose() {
      // The one toast after teardown: the item in flight is left in Studio's dialog.
      if (running && !tornDown()) {
        pageToast(L('ส่วนขยายถูกโหลดใหม่ระหว่างอัปโหลด — ถ้าหน้าต่างอัปโหลดของ Studio ยังเปิดอยู่ ให้ทำต่อแล้วกด Save เอง', "The extension was reloaded during an upload — if Studio's upload dialog is still open, finish that upload and click Save yourself"));
      }
      setTornDown(true);
    },
    setConfirmed(v) {
      confirmed = v;
    },
    // Every 0.8 s, like the userscript's progress tick.
    tick() {
      pollUploadProgress();
      const d = queue.map((i) => i.draftId || '').join('\n');
      if (drafts !== undefined && d !== drafts) persistQueue();
      drafts = d;
      broadcast();
    },
    state,
  };
  return ui;
}

// A settings / counters change the background could not store (state.ts setPatchFailed).
// The console has it too; during a run it also shows on the page, since the next schedule
// slot or EP number may be wrong from here on.
export function storeWriteFailed(): void {
  if (running && !tornDown()) {
    pageToast(L('บันทึกการตั้งค่าไม่สำเร็จ — ตารางเวลาหรือเลข EP อาจคลาดเคลื่อนตลอดการรันนี้', "Couldn't save a settings change — the schedule or EP numbers may be off for the rest of the run"));
  }
}
