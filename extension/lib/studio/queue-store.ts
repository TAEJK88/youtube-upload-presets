import { browser } from 'wxt/browser';
import { L } from '../i18n';
import { mergeQueue } from './queue-merge';
import { otherTabRunning, queue, running, setOtherTabRuns, type QueueItem } from './queue-runner';
import { load, onStored, save } from './state';

// The queue's items live in chrome.storage.local ('queue') so they survive reloads and
// channel switches; Files are fetched again by id when an item uploads.
const KEY = 'queue';
let timer: ReturnType<typeof setTimeout> | undefined;
// What this tab last read from or wrote to storage: the base the merge compares both copies to.
let base: QueueItem[] = [];
const remember = (list: QueueItem[]) => { base = structuredClone(list); };

// Nothing is written while another Studio tab runs the queue: that tab's copy is the one
// moving items along, and this tab only mirrors it (restoreQueue's onStored). The flag is
// cached, so it can be stale when this tab wins the lock: a running tab always saves.
const blocked = () => otherTabRunning() && !running;
export function persistQueue(): void {
  clearTimeout(timer);
  timer = undefined; // no save of ours waits (onStored merges only while one does)
  if (blocked()) return;
  timer = setTimeout(flushQueue, 300);
}

// The waiting save, now: the page is going away (or the script is), and the last status
// changes of a run must not be lost with the timer.
export function flushQueue(): void {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
  if (!blocked()) {
    save(KEY, queue);
    remember(queue);
  }
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
  remember(items);
  // Written back at once, so the side panel (which reads storage) shows the error too.
  if (items.some(cut)) {
    save(KEY, queue);
    remember(queue);
  }
  // Another tab (or the side panel) changed the queue. The tab that is running keeps its own
  // copy: it is the one moving items along. While a save of ours waits, the two copies are
  // merged per item (3b M3); otherwise the stored copy replaces ours.
  onStored(KEY, (v) => {
    if (running) return;
    const foreign = (v as QueueItem[] | undefined) ?? [];
    const next = timer !== undefined ? mergeQueue(base, queue, foreign) : foreign;
    queue.splice(0, queue.length, ...next);
    remember(foreign);
  });
}

// Each runner:elsewhere answer (the content script's elsewhere()). When the other tab
// stops holding the lock and this tab isn't running, what it left uploading or waiting
// for Save is cut as on a reload: a tab closed mid-run never moves them on. (A run that
// ends normally saved its last statuses before letting the lock go: see the lock's
// release in studio.content.ts.)
export async function followOtherTab(runs: boolean): Promise<void> {
  const ended = otherTabRunning() && !runs;
  setOtherTabRuns(runs);
  if (!ended || running) return;
  // The running tab saved its last statuses before releasing the lock, but this tab's
  // copy may not have heard yet: cut what storage holds now.
  const stored = ((await browser.storage.local.get(KEY))[KEY] as QueueItem[] | undefined) ?? [];
  if (running || otherTabRunning()) return;
  queue.splice(0, queue.length, ...stored.map((it) => (unfinished(it) ? interrupted(it) : it)));
  remember(stored);
  if (stored.some(unfinished)) {
    save(KEY, queue);
    remember(queue);
  }
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
