import { L } from '../i18n';
import { sendMessage, type QueueState } from '../messages';
import { beep, setTitleMark } from './page-notify';
import { pageToast } from './page-toast';
import type { PageUi } from './page-ui';
import { dropFiles } from './queue-files';
import { pollUploadProgress, queue, running, stopReq, uploadProg } from './queue-runner';
import { persistQueue } from './queue-store';
import { settings } from './state';

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
  const broadcast = () => {
    const s: QueueState = { running, stopping: running && stopReq, prog: uploadProg, rev };
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
  const ui: PageUi & { setConfirmed(v: boolean): void; tick(): void } = {
    item(it) {
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
      if (running) setTitleMark(`(${Math.min(count('done') + count('error') + 1, total)}/${total}) ⬆`);
      changed();
    },
    queue: changed,
    schedule: changed,
    presetPreview: changed,
    toast(msg) {
      console.info('[ytup]', msg);
      pageToast(msg);
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
    setTitleMark,
    async confirmStart() {
      const ok = confirmed;
      confirmed = false;
      if (!ok) ui.toast(L('ยืนยันการอัปโหลดในแผงด้านข้างก่อน', 'Confirm the upload in the side panel first'));
      return ok;
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
  };
  return ui;
}
