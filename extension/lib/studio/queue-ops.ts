import { failedByDraft } from '../drafts';
import { L } from '../i18n';
import { ui } from './page-ui';
import { dropFiles } from './queue-files';
import { endPause } from './queue-pause';
import { assignNumbers, currentItemId, queue, requestStop, running, setItem, type QueueItem } from './queue-runner';

// What the userscript's queue tab buttons did to the queue (UI section "แท็บคิว",
// 3739–3800), without the drawer: the side panel sends these as messages.
const refsOf = (it: QueueItem) => [{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])];

// The panel sends Stop to one Studio tab; when the run is in another tab, say so rather
// than promise a stop that won't happen (stop it from the running tab).
// With no run going, Stop ends a daily-limit pause (queue-pause.ts): the queue stays as it is and
// nothing resumes by itself.
export function stopQueue(): void {
  if (!running && endPause()) return ui.toast(L('ยกเลิกการพักคิวแล้ว — คิวจะไม่อัปโหลดต่อเอง', 'Pause cancelled — the queue will not resume by itself'));
  if (!running) return ui.toast(L('แท็บ Studio นี้ไม่ได้อัปโหลดคิวอยู่', 'Nothing is running in this Studio tab'));
  requestStop();
  ui.toast(L('จะหยุดหลังคลิปปัจจุบันเสร็จ', 'Will stop after the current video finishes'));
}

// The userscript hid Remove while an item was uploading or waiting for Save (3925): the
// run is still working on it. So it is while its file is fetched (still 'pending').
export function removeItem(id: string): void {
  const i = queue.findIndex((it) => it.id === id);
  if (i < 0) return;
  if (id === currentItemId() || queue[i]!.status === 'uploading' || queue[i]!.status === 'review') {
    return ui.toast(L("ลบวิดีโอที่กำลังอัปโหลดไม่ได้", "Can't remove the video that is being uploaded"));
  }
  const [it] = queue.splice(i, 1);
  dropFiles(refsOf(it!));
  ui.queue();
}

// The panel asks first when the item left a draft in Studio (the userscript's ask()): upload the
// file again (the draft id is forgotten), or `resume` (P5-draft-retry): the video waits again with
// its draft id, and the run goes on in that draft instead of uploading the file.
export function retryItem(id: string, resume = false): void {
  const it = queue.find((x) => x.id === id);
  if (!it || it.status !== 'error') return;
  if (!resume && !it.fromDraft) it.draftId = ''; // a card queued from a draft has no file to upload again
  setItem(it, 'pending');
  assignNumbers();
  ui.queue();
}

// The Upload tab's "Resume drafts (N)" (P5-draft-retry): every failed video whose file is a draft
// in Studio waits again with its draft id, as a card's Retry → "Resume draft" does one at a
// time; the panel then starts the queue the usual way. Failed videos it leaves alone are said
// once, with their number. Returns how many wait again.
export function resumeDrafts(): number {
  const { resumable, shared, plain } = failedByDraft(queue);
  for (const it of resumable) setItem(it, 'pending');
  if (resumable.length) assignNumbers();
  ui.queue();
  const left = [
    ...(plain.length ? [L(`${plain.length} คลิปไม่มีฉบับร่าง (กด "ลองใหม่" ที่การ์ดเพื่ออัปโหลดไฟล์)`, `${plain.length} with no draft (use Retry on the card to upload the file)`)] : []),
    ...(shared.length ? [L(`${shared.length} คลิปมีรหัสฉบับร่างซ้ำกับการ์ดอื่น`, `${shared.length} whose draft id is on more than one card`)] : []),
  ];
  if (left.length) ui.toast(L('ยังเป็นข้อผิดพลาดอยู่: ', 'Left as errors: ') + left.join(' · '));
  return resumable.length;
}

export function clearDone(): void {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.status === 'done') queue.splice(i, 1);
  ui.queue();
}
