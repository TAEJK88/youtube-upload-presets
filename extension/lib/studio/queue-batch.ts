import { SEL } from './sel';

// Batches (P5-upload-batches): after `batch` videos the run waits until Studio has finished
// uploading them. The dialog is closed by then, so the only thing to read is Studio's monitor of
// background uploads (SEL.uploadMonitor). Nothing here has been seen in a real Studio: the
// element's name and its wording are a guess, so the wait is built to fail safe —
// - "still uploading" is only what the monitor's text says in so many words (UPLOADING);
// - a monitor that is there and does not say so, or one that was there and is gone, means the
//   uploads are done (two readings in a row);
// - a monitor never seen cannot be read at all: the wait gives up after BATCH_BLIND_MS;
// - no wait is longer than BATCH_MAX_MS, whatever the monitor says.
export const BATCH_POLL_MS = 2000;
export const BATCH_BLIND_MS = 120_000;
export const BATCH_MAX_MS = 6 * 3600e3;
const UPLOADING = /uploading|กำลังอัปโหลด/i;
// Also asked of the dialog's own progress text (SEL.uploadProgress, as the userscript read it).
export const saysUploading = (text: string) => UPLOADING.test(text);

// What the monitor says now; null when it is not on the page.
export function monitorText(doc: Pick<Document, 'querySelector'> = document): string | null {
  const el = doc.querySelector<HTMLElement>(SEL.uploadMonitor);
  if (!el || el.hidden || el.getAttribute('aria-hidden') === 'true') return null;
  return (el.textContent || '').trim().replace(/\s+/g, ' ');
}

// 'done': Studio stopped saying it uploads. 'blind': the monitor was never found. 'long': it still
// said "uploading" after BATCH_MAX_MS. 'stopped': the user pressed Stop.
export type BatchEnd = 'done' | 'blind' | 'long' | 'stopped';
export async function waitForUploads(d: {
  stopped(): boolean;
  say(monitor: string): void; // each reading, for the panel
  read?(): string | null;
  now?(): number;
}): Promise<BatchEnd> {
  const read = d.read ?? monitorText;
  const now = d.now ?? Date.now;
  const t0 = now();
  let seen = false;
  let quiet = 0;
  let last = '';
  const end = (how: BatchEnd): BatchEnd => {
    // The debug page has what Studio really said: the wording was never captured before.
    console.info(`[ytup] batch wait: ${how} after ${Math.round((now() - t0) / 1000)} s · monitor ${seen ? `said "${last}"` : 'not found'}`);
    return how;
  };
  for (;;) {
    if (d.stopped()) return end('stopped');
    const text = read();
    if (text !== null) {
      seen = true;
      last = text;
    }
    if (text !== null && UPLOADING.test(text)) quiet = 0;
    else if (seen && ++quiet >= 2) return end('done');
    else if (!seen && now() - t0 >= BATCH_BLIND_MS) return end('blind');
    if (now() - t0 >= BATCH_MAX_MS) return end('long');
    d.say(text ?? '');
    await new Promise((r) => setTimeout(r, BATCH_POLL_MS));
  }
}
