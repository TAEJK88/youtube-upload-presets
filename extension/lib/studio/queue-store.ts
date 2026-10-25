import { browser } from 'wxt/browser';
import { repairCascade } from '../drafts';
import { L } from '../i18n';
import { queueKey } from '../storage';
import { sayRetry } from './draft-retry';
import { mergeQueue } from './queue-merge';
import { abortedRun, abortRun, bumpEditRev, otherTabRunning, queue, running, setOtherTabRuns, setQueueKeyed, type QueueItem } from './queue-runner';
import { load, onStored, save } from './state';

// The queue's items live in chrome.storage.local, one key per channel (queue:<channelId>), so
// they survive reloads and a tab only ever sees its own channel's; Files are fetched again by
// id when an item uploads. A tab whose channel isn't known yet ('') has no key: it saves
// nothing until adoptChannel().
let ch = '';
export const queueChannel = (): string => ch;
let timer: ReturnType<typeof setTimeout> | undefined;
// What this tab last read from or wrote to storage: the base the merge compares both copies to.
let base: QueueItem[] = [];
const remember = (list: QueueItem[]) => { base = structuredClone(list); };
const stored = (): QueueItem[] => (ch ? load<QueueItem[] | null>(queueKey(ch), []) ?? [] : []); // a removed key can read as null
function write(): void {
  if (!ch) return;
  save(queueKey(ch), queue);
  remember(queue);
}

// The runner lock is one for every channel. The background keeps the queue holder's channel
// with the lock (runner-lock CHANNEL_KEY), told here with each runner:elsewhere answer
// (queue-sync elsewhere): a tab on another channel keeps saving its own items while that one runs.
let runnerCh = '';
export const setRunnerChannel = (channelId: string): void => { runnerCh = channelId; };
// Another tab runs this channel's queue, or one whose channel isn't known ('').
export const runsHere = (): boolean => otherTabRunning() && (!runnerCh || !ch || runnerCh === ch);

// Nothing is written while another Studio tab runs this channel's queue: that tab's copy is the one
// moving items along, and this tab only mirrors it (restoreQueue's onStored). The flag is
// cached, so it can be stale when this tab wins the lock: a running tab always saves —
// except a run aborted because another tab took the lock (abortRun): its copy is stale from
// then on, and nothing of it is written until this tab has read the queue back
// (followOtherTab).
const blocked = () => abortedRun() !== null || (runsHere() && !running);
// Said once per spell of skipped saves (a card change calls this each time; the debug log keeps 300 lines).
let skipSaid = false;
export function persistQueue(): void {
  clearTimeout(timer);
  timer = undefined; // no save of ours waits (onStored merges only while one does)
  if (blocked()) return saySkipped();
  timer = setTimeout(flushQueue, 300);
}
function saySkipped(): void {
  const it = queue.find((i) => i.status === 'uploading');
  if (skipSaid || !it) return;
  skipSaid = true;
  sayRetry(`queue not saved here (${abortedRun() ? 'this run was aborted' : 'another tab runs the queue'}); storage keeps "${it.file.name}" as "${it.msg}"`, 'warn');
}

// The waiting save, now: the page is going away (or the script is), and the last status
// changes of a run must not be lost with the timer.
export function flushQueue(): void {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
  if (!blocked()) {
    write();
    skipSaid = false;
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
// queue-runner's retryText(), either language: a card stored in the middle of a retry on its draft.
const MID_RETRY = /Retrying on the draft|ลองใหม่บนฉบับร่าง/;

// What the start summary shows of the pending items. Another window changing it after the
// summary refuses the start like an edit made here (bumpEditRev; review I2).
const shown = (list: QueueItem[]) => JSON.stringify(list.filter((i) => i.status === 'pending')
  .map((i) => [i.id, i.presetId, i.publishEdited ? i.publishAt : 0, !!i.thumb, i.txt]));

// Another tab (or the side panel) changed this channel's queue. The tab that is running keeps
// its own copy: it is the one moving items along. While a save of ours waits, the two copies
// are merged per item (3b M3); otherwise the stored copy replaces ours.
let unfollow = () => {};
function follow(): void {
  unfollow();
  unfollow = ch ? onStored(queueKey(ch), (v) => {
    if (running) return;
    const foreign = (v as QueueItem[] | undefined) ?? [];
    const next = timer !== undefined ? mergeQueue(base, queue, foreign) : foreign;
    const was = shown(queue);
    queue.splice(0, queue.length, ...next);
    if (shown(queue) !== was) bumpEditRev();
    remember(foreign);
  }) : () => {};
}

// markInterrupted is false while another Studio tab holds the runner lock: its item
// really is still uploading. `channelId` is this tab's channel ('' unknown: nothing is loaded).
export function restoreQueue(markInterrupted: boolean, channelId = ''): void {
  ch = channelId;
  setQueueKeyed(() => !!ch);
  // A run on another channel isn't uploading any of this channel's items.
  markInterrupted ||= otherTabRunning() && !runsHere();
  const items = stored();
  const cut = (it: QueueItem) => markInterrupted && unfinished(it);
  for (const it of items) {
    if (it.status === 'uploading' && MID_RETRY.test(it.msg)) sayRetry(`page loaded while "${it.file.name}" was mid-retry ("${it.msg}"); marked ${markInterrupted ? 'interrupted' : 'still running in another tab'}`, 'warn');
  }
  queue.splice(0, queue.length, ...items.map((it) => (cut(it) ? interrupted(it) : it)));
  remember(items);
  skipSaid = false; // this copy is storage's again
  // Draft ids an earlier build wrote on cards that own no draft (lib/drafts.ts). Not in a tab
  // that only mirrors a running one: that tab's copy is the queue, and it repaired its own.
  const repaired = markInterrupted ? repairCascade(queue) : { freed: 0, reworded: 0 };
  // Written back at once, so the side panel (which reads storage) shows the error too.
  if (items.some(cut) || repaired.freed || repaired.reworded) write();
  follow();
}

// The channel became known after restoreQueue (Studio's ytcfg not read yet): its stored items
// come first, then what this tab queued meanwhile (never saved), and the lot is saved.
// Only once: switching channels leaves Studio (channel_switcher), so the page loads again.
// Not mid-run, nor while this channel's queue runs elsewhere: the next tick tries again.
export function adoptChannel(id: string): void {
  if (ch || !id || running) return;
  ch = id;
  if (blocked()) return void (ch = '');
  const items = stored();
  const ids = new Set(items.map((it) => it.id));
  const was = shown(queue);
  queue.splice(0, queue.length, ...items, ...queue.filter((it) => !ids.has(it.id)));
  if (shown(queue) !== was) bumpEditRev();
  clearTimeout(timer);
  timer = undefined;
  write();
  follow();
}

// Each runner:elsewhere answer (the content script's elsewhere()). When the other tab
// stops holding the lock and this tab isn't running, what it left uploading or waiting
// for Save is cut as on a reload: a tab closed mid-run never moves them on. (A run that
// ends normally saved its last statuses before letting the lock go: see the lock's
// release in studio.content.ts.)
export async function followOtherTab(runs: boolean): Promise<void> {
  // An aborted run still on its way out stays a mirror: the read-back below waits for it.
  if (!runs && running && abortedRun()) return;
  // A read-back an aborted run still waits for counts as ended too: the next ask of the lock
  // (a lock change, focus, or the 30 s fallback: queue-sync createLockFollower) retries one
  // whose storage read failed (the mirror flag is already off by then).
  // A run on another channel left nothing of this tab's to cut.
  const ended = (runsHere() || (abortedRun() !== null && !running)) && !runs;
  setOtherTabRuns(runs);
  if (!ended || running) return;
  // The running tab saved its last statuses before releasing the lock, but this tab's
  // copy may not have heard yet: cut what storage holds now (no channel: what this tab holds).
  let items: QueueItem[];
  try {
    items = ch ? ((await browser.storage.local.get(queueKey(ch)))[queueKey(ch)] as QueueItem[] | undefined) ?? [] : [...queue];
  } catch (e) {
    console.error('[ytup] queue read-back', e);
    return;
  }
  if (running || otherTabRunning()) return;
  queue.splice(0, queue.length, ...items.map((it) => (unfinished(it) ? interrupted(it) : it)));
  remember(items);
  abortRun(null); // this tab's copy is the stored one again: it may save and start
  if (items.some(unfinished)) write();
}

// The userscript asked before leaving whenever the queue had files, because the Files
// lived in the page. Now a reload only loses a run in progress and files picked in
// Studio's own upload dialog.
// Leaving the page also writes a waiting queue save at once (pagehide).
// Returns a disposer (extension reloaded: the files are gone with this script anyway); it
// writes a waiting save too.
export function installUnloadGuard(): () => void {
  const guard = (e: BeforeUnloadEvent) => {
    if (running || queue.some((i) => (i.status === 'pending' || i.status === 'error') && i.src === 'page' && !i.fromDraft)) { // a card from a draft keeps nothing in the page
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
