import { SEL } from './sel';

// Batches (P5-upload-batches): after `batch` videos the run waits until Studio has finished
// uploading them. What can be read, and how sure it is:
// - VERIFIED in the owner's Chrome, 2026-10-14: while an upload dialog is open, its
//   `ytcp-video-upload-progress` (SEL.uploadProgress) reads "Uploading 5% ... 8 minutes left".
//   So the batch's last video keeps its dialog open, Save not pressed, until that text stops
//   saying "Uploading" (queue-runner holdBatchSave).
// - NOT SEEN, the same day: anything that shows an upload still going after its dialog closed.
//   `ytcp-multi-progress-monitor` and its wrapper `ytcp-uploads-mini-indicator` are registered
//   elements of Studio but were not in the page for 2 minutes while uploads ran. For the batch's
//   earlier videos the page is therefore only looked at (SEL.uploadMonitor, then any
//   SEL.uploadProgress element, hidden ones included): a guess. When nothing is found within
//   BATCH_SETTLE_MS the run says the earlier uploads could not be checked and goes on.
// - The Thai word in UPLOADING is a guess; a text it misses reads as "not uploading".
// Every wait is bounded: BATCH_STALL_MS without the text changing (a text nobody updates any
// more would otherwise hold the run), BATCH_MAX_MS in all.
export const BATCH_POLL_MS = 2000;
// Long enough for Studio to draw something once the dialog has closed (three readings). Longer
// buys nothing: in the 2026-10-14 run nothing showed up in 2 minutes.
export const BATCH_SETTLE_MS = 6000;
export const BATCH_STALL_MS = 600_000;
export const BATCH_MAX_MS = 6 * 3600e3;
const UPLOADING = /uploading|กำลังอัปโหลด/i;
export const saysUploading = (text: string) => UPLOADING.test(text);

type Doc = Pick<Document, 'querySelector' | 'querySelectorAll'>;
const clean = (el: Element) => (el.textContent || '').trim().replace(/\s+/g, ' ');
const shown = (el: Element) => !(el as HTMLElement).hidden && el.getAttribute('aria-hidden') !== 'true';

// What the page says about uploads whose dialogs are closed; null when nothing on it can say.
// Studio's monitor first; then any upload-progress element that still says "Uploading" (one that
// says something else may be a closed dialog's last words, and proves nothing about the others).
export function pageUploadText(doc: Doc = document): string | null {
  const monitor = doc.querySelector(SEL.uploadMonitor);
  if (monitor && shown(monitor)) return clean(monitor);
  const texts = [...doc.querySelectorAll(SEL.uploadProgress)].map(clean).filter(Boolean);
  return texts.find(saysUploading) ?? null;
}

// One line for the debug log, so the next unknown needs no console snippet: every tag whose name
// holds upload / progress / monitor as name count/visible, and what each upload-progress element
// says (hidden ones too).
export function batchCensus(doc: Doc = document): string {
  try {
    return census(doc);
  } catch (e) {
    return `census failed: ${(e as Error)?.message ?? e}`; // a log line never fails the run
  }
}
function census(doc: Doc): string {
  const tags = new Map<string, [number, number]>();
  for (const el of doc.querySelectorAll('*')) {
    const name = el.localName;
    if (!/upload|progress|monitor/.test(name)) continue;
    const c = tags.get(name) ?? [0, 0];
    c[0]++;
    if (el.getClientRects().length) c[1]++;
    tags.set(name, c);
  }
  const names = [...tags].sort(([a], [b]) => a.localeCompare(b)).map(([n, [all, vis]]) => `${n} ${all}/${vis}`);
  const texts = [...doc.querySelectorAll('ytcp-video-upload-progress')].map((el) => JSON.stringify(clean(el).slice(0, 120)));
  return `tags (count/visible): ${names.join(', ') || 'none'} · upload-progress texts: ${texts.join(' | ') || 'none'}`;
}

// 'done': it stopped saying "uploading" (two readings in a row), or it was there and is gone.
// 'blind': nothing to read turned up within `blindMs`. 'stale': the text still said "uploading"
// but had not changed for BATCH_STALL_MS. 'long': BATCH_MAX_MS. 'stopped': Stop.
export type BatchEnd = 'done' | 'blind' | 'stale' | 'long' | 'stopped';
export async function waitForUploads(d: {
  where: 'dialog' | 'page'; // for the log line
  read(): string | null; // what Studio says now; null = nothing there to read
  blindMs: number;
  stopped(): boolean;
  say(text: string): void; // each reading, for the panel
  now?(): number;
}): Promise<BatchEnd> {
  const now = d.now ?? Date.now;
  const t0 = now();
  let seen = false;
  let quiet = 0;
  let last = '';
  let moved = t0;
  const end = (how: BatchEnd): BatchEnd => {
    console.info(`[ytup] batch wait (${d.where}): ${how} after ${Math.round((now() - t0) / 1000)} s · ${seen ? `Studio said "${last}"` : 'nothing to read'}`);
    return how;
  };
  for (;;) {
    if (d.stopped()) return end('stopped');
    const text = d.read();
    if (text !== null) {
      if (text !== last) moved = now();
      seen = true;
      last = text;
    }
    if (text !== null && UPLOADING.test(text)) {
      quiet = 0;
      if (now() - moved >= BATCH_STALL_MS) return end('stale');
    } else if (seen && ++quiet >= 2) return end('done');
    else if (!seen && now() - t0 >= d.blindMs) return end('blind');
    if (now() - t0 >= BATCH_MAX_MS) return end('long');
    d.say(text ?? '');
    await new Promise((r) => setTimeout(r, BATCH_POLL_MS));
  }
}
