import { L } from '../i18n';
import { ui } from './page-ui';
import { dropFiles } from './queue-files';
import { assignNumbers, queue, requestStop, setItem, type QueueItem } from './queue-runner';

// What the userscript's queue tab buttons did to the queue (UI section "แท็บคิว",
// 3739–3800), without the drawer: the side panel sends these as messages.
const refsOf = (it: QueueItem) => [{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])];

export function stopQueue(): void {
  requestStop();
  ui.toast(L('จะหยุดหลังคลิปปัจจุบันเสร็จ', 'Will stop after the current video finishes'));
}

export function removeItem(id: string): void {
  const i = queue.findIndex((it) => it.id === id);
  if (i < 0) return;
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
