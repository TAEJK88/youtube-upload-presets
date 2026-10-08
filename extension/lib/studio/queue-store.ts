import { L } from '../i18n';
import { queue, running, type QueueItem } from './queue-runner';
import { load, onStored, save } from './state';

// The queue's items live in chrome.storage.local ('queue') so they survive reloads and
// channel switches; Files are fetched again by id when an item uploads.
const KEY = 'queue';
let timer: ReturnType<typeof setTimeout> | undefined;

export function persistQueue(): void {
  clearTimeout(timer);
  timer = setTimeout(() => save(KEY, queue), 300);
}

// A reload ends a run: an item that was uploading or waiting for Save may have left a
// draft in Studio, so it comes back as an error the user retries on purpose.
const interrupted = (it: QueueItem): QueueItem => ({
  ...it,
  status: 'error',
  msg: L('หน้าโหลดใหม่ระหว่างอัปโหลด — ดูใน Content ว่ามีฉบับร่างค้างไหม แล้วค่อยกดลองใหม่', 'The page reloaded during the upload — check Content for a leftover draft, then retry')
    + (it.draftId ? ` (${it.draftId})` : ''),
});

// markInterrupted is false while another Studio tab holds the runner lock: its item
// really is still uploading.
export function restoreQueue(markInterrupted: boolean): void {
  const items = load<QueueItem[]>(KEY, []);
  const cut = (it: QueueItem) => markInterrupted && (it.status === 'uploading' || it.status === 'review');
  queue.splice(0, queue.length, ...items.map((it) => (cut(it) ? interrupted(it) : it)));
  // Written back at once, so the side panel (which reads storage) shows the error too.
  if (items.some(cut)) save(KEY, queue);
  // Another tab (or, in Phase 3, the side panel) changed the queue. The tab that is
  // running keeps its own copy: it is the one moving items along.
  onStored(KEY, (v) => {
    if (!running) queue.splice(0, queue.length, ...((v as QueueItem[] | undefined) ?? []));
  });
}

// The userscript asked before leaving whenever the queue had files, because the Files
// lived in the page. Now a reload only loses a run in progress and files picked in
// Studio's own upload dialog.
// Returns a disposer (extension reloaded: the files are gone with this script anyway).
export function installUnloadGuard(): () => void {
  const guard = (e: BeforeUnloadEvent) => {
    if (running || queue.some((i) => (i.status === 'pending' || i.status === 'error') && i.src === 'page')) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', guard);
  return () => window.removeEventListener('beforeunload', guard);
}
