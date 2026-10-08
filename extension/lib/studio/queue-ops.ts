import { L } from '../i18n';
import { ui } from './page-ui';
import { dropFiles } from './queue-files';
import { assignNumbers, currentItemId, queue, requestStop, running, setItem, type QueueItem } from './queue-runner';

// What the userscript's queue tab buttons did to the queue (UI section "แท็บคิว",
// 3739–3800), without the drawer: the side panel sends these as messages.
const refsOf = (it: QueueItem) => [{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])];

// The panel sends Stop to one Studio tab; when the run is in another tab, say so rather
// than promise a stop that won't happen (stop it from the running tab).
export function stopQueue(): void {
  if (!running) return ui.toast(L('แท็บ Studio นี้ไม่ได้อัปโหลดคิวอยู่', 'Nothing is running in this Studio tab'));
  requestStop();
  ui.toast(L('จะหยุดหลังคลิปปัจจุบันเสร็จ', 'Will stop after the current video finishes'));
}

// The userscript hid Remove while an item was uploading or waiting for Save (3925): the
// run is still working on it. So it is while its file is fetched (still 'pending').
export function removeItem(id: string): void {
  const i = queue.findIndex((it) => it.id === id);
  if (i < 0 || id === currentItemId() || queue[i]!.status === 'uploading' || queue[i]!.status === 'review') return;
  const [it] = queue.splice(i, 1);
  dropFiles(refsOf(it!));
  ui.queue();
}

// The panel asks first when the item left a draft in Studio (the userscript's ask()).
export function retryItem(id: string): void {
  const it = queue.find((x) => x.id === id);
  if (!it || it.status !== 'error') return;
  it.draftId = '';
  setItem(it, 'pending');
  assignNumbers();
  ui.queue();
}

export function clearDone(): void {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.status === 'done') queue.splice(i, 1);
  ui.queue();
}
