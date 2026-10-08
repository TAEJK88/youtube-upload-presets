import { L } from '../i18n';
import { otherTabRunning, queue, running, setOtherTabRuns, type QueueItem } from './queue-runner';
import { load, onStored, save } from './state';

// The queue's items live in chrome.storage.local ('queue') so they survive reloads and
// channel switches; Files are fetched again by id when an item uploads.
const KEY = 'queue';
let timer: ReturnType<typeof setTimeout> | undefined;

// Nothing is written while another Studio tab runs the queue: that tab's copy is the one
// moving items along, and this tab only mirrors it (restoreQueue's onStored). The flag is
// cached, so it can be stale when this tab wins the lock: a running tab always saves.
const blocked = () => otherTabRunning() && !running;
export function persistQueue(): void {
  clearTimeout(timer);
  if (blocked()) return;
  timer = setTimeout(flushQueue, 300);
}

// The waiting save, now: the page is going away (or the script is), and the last status
// changes of a run must not be lost with the timer.
export function flushQueue(): void {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
  if (!blocked()) save(KEY, queue);
}

// A reload ends a run: an item that was uploading or waiting for Save may have left a
// draft in Studio, so it comes back as an error the user retries on purpose.
const interrupted = (it: QueueItem): QueueItem => ({
  ...it,
  status: 'error',
  msg: L('หน้าโหลดใหม่ระหว่างอัปโหลด — ดูใน Content ว่ามีฉบับร่างค้างไหม แล้วค่อยกดลองใหม่', 'The page reloaded during the upload — check Content for a leftover draft, then retry')
    + (it.draftId ? ` (${it.draftId})` : ''),
});

const unfinished = (it: QueueItem) => it.status === 'uploading' || it.status === 'review';

// markInterrupted is false while another Studio tab holds the runner lock: its item
// really is still uploading.
export function restoreQueue(markInterrupted: boolean): void {
  const items = load<QueueItem[]>(KEY, []);
  const cut = (it: QueueItem) => markInterrupted && unfinished(it);
  queue.splice(0, queue.length, ...items.map((it) => (cut(it) ? interrupted(it) : it)));
  // Written back at once, so the side panel (which reads storage) shows the error too.
  if (items.some(cut)) save(KEY, queue);
  // Another tab (or, in Phase 3, the side panel) changed the queue. The tab that is
  // running keeps its own copy: it is the one moving items along.
  onStored(KEY, (v) => {
    if (!running) queue.splice(0, queue.length, ...((v as QueueItem[] | undefined) ?? []));
  });
}

// Each runner:elsewhere answer (the content script's elsewhere()). When the other tab
// stops holding the lock and this tab isn't running, what it left uploading or waiting
// for Save is cut as on a reload: a tab closed mid-run never moves them on. (A run that
// ends normally saved its last statuses before letting the lock go: see the lock's
// release in studio.content.ts.)
export function followOtherTab(runs: boolean): void {
  const ended = otherTabRunning() && !runs;
  setOtherTabRuns(runs);
  if (!ended || running || !queue.some(unfinished)) return;
  queue.splice(0, queue.length, ...queue.map((it) => (unfinished(it) ? interrupted(it) : it)));
  save(KEY, queue);
}

// The userscript asked before leaving whenever the queue had files, because the Files
// lived in the page. Now a reload only loses a run in progress and files picked in
// Studio's own upload dialog.
// Leaving the page also writes a waiting queue save at once (pagehide).
// Returns a disposer (extension reloaded: the files are gone with this script anyway); it
// writes a waiting save too.
export function installUnloadGuard(): () => void {
  const guard = (e: BeforeUnloadEvent) => {
    if (running || queue.some((i) => (i.status === 'pending' || i.status === 'error') && i.src === 'page')) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', guard);
  window.addEventListener('pagehide', flushQueue);
  return () => {
    window.removeEventListener('beforeunload', guard);
    window.removeEventListener('pagehide', flushQueue);
    flushQueue();
  };
}
