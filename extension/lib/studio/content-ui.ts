import { L } from '../i18n';
import { PROTOCOL, sendMessage, type QueueState } from '../messages';
import { isPanelTab } from '../panel-tab';
import { beep, setTitleMark } from './page-notify';
import { pageToast } from './page-toast';
import type { PageUi } from './page-ui';
import { dropFiles } from './queue-files';
import { abortedRun, assignNumbers, pollUploadProgress, queue, running, setTornDown, startQueue, stopReq, tornDown, tornError, uploadProg, type StartBinding } from './queue-runner';
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
  // Only while this tab runs the queue: an idle tab sees new draft ids when it adopts
  // another tab's write, and saving its copy then could land over that tab's next edit.
  let drafts: string | undefined;
  let progressFailed = false;
  // Torn down (extension reloaded): a run still in flight must not put a mark back on the
  // tab title after the teardown cleared it, nor show its toasts.
  const mark = (m: string) => {
    if (!tornDown()) setTitleMark(m);
  };
  const state = (): QueueState => ({ proto: PROTOCOL, running, stopping: running && stopReq, prog: uploadProg, rev, channel: channelView() });
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
      // An orphaned run stops at its next status change (queue-runner: setTornDown), and so
      // does one that lost the lock coming back from the back/forward cache (abortRun).
      if (tornDown()) throw tornError();
      const a = abortedRun();
      if (a) throw a;
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
    // renderQueue() ran assignNumbers() first (4026): a new, removed or cleared item moves
    // the titles and EP numbers of the ones after it.
    queue() {
      assignNumbers();
      changed();
    },
    // The channel's scheduled list changed, or an item finished (setItem saved it): no
    // item changed here, so nothing to save over another tab's edit.
    schedule() {
      rev++;
      broadcast();
    },
    presetPreview: changed,
    toast(msg) {
      console.info('[ytup]', msg);
      if (!tornDown()) pageToast(msg);
      sendMessage('queue:toast', msg).catch(() => {});
    },
    openDrawer(tab) {
      // Needs a user gesture; best effort, but logged: the evidence for D16's manual check.
      // The tab to show goes along (openDrawer(tab), 3488): an open panel switches to it too.
      sendMessage('openPanel', isPanelTab(tab) ? tab : undefined).catch((e) => console.warn('[ytup] openPanel failed', e));
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
    // Every 0.8 s, like the userscript's progress tick. One that throws is said once per page,
    // as there (6373–6383); the caller logs each one.
    tick() {
      try {
        pollUploadProgress();
        const d = queue.map((i) => i.draftId || '').join('\n');
        if (running && drafts !== undefined && d !== drafts) persistQueue();
        drafts = d;
        broadcast();
      } catch (e) {
        if (!progressFailed) {
          progressFailed = true;
          const m = (e as Error)?.message;
          ui.toast(L(`⚠ แถบความคืบหน้าหยุดทำงาน: ${m} — ลองรีโหลดหน้า`, `⚠ The progress bar stopped: ${m} — try reloading the page`));
        }
        throw e;
      }
    },
    state,
  };
  return ui;
}

// queue:start. runQueue() checks the warnings again and asks (confirmStart) when it finds
// one; that is a yes only if the panel really asked the user, so a warning that appeared
// after the summary (the clock, a .txt added since) stops the run instead of passing.
export function startFromPanel(ui: { setConfirmed(v: boolean): void }, seen: StartBinding): Promise<void> {
  ui.setConfirmed(seen.asked === true);
  return startQueue(seen);
}

// A settings / counters change the background could not store (state.ts setPatchFailed).
// The console has it too; during a run it also shows on the page, since the next schedule
// slot or EP number may be wrong from here on.
export function storeWriteFailed(): void {
  if (running && !tornDown()) {
    pageToast(L('บันทึกการตั้งค่าไม่สำเร็จ — ตารางเวลาหรือเลข EP อาจคลาดเคลื่อนตลอดการรันนี้', "Couldn't save a settings change — the schedule or EP numbers may be off for the rest of the run"));
  }
}
