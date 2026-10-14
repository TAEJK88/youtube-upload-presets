import { handles, type Handles } from '../file-handles';
import { L } from '../i18n';
import type { QueueItem } from '../studio/queue-runner';

// Read permission on stored handles can go back to 'prompt' (spec: File intake, step 4). The
// panel shows one button for all of them; one click asks for each (a user gesture is needed,
// and the panel has one).
export const queuedFileIds = (items: QueueItem[]): string[] =>
  items
    .filter((it) => it.status === 'pending' || it.status === 'error')
    .flatMap((it) => [...(it.src === 'bridge' ? [it.id] : []), ...(it.thumb?.src === 'bridge' ? [it.thumb.id] : [])]);

// What a run reads (runQueue uploads pending items only; a thumbnail only with Settings →
// thumbnails on): Start asks for these alone, so an error card's file never stops it. A video
// waiting with a draft id goes on in its draft (P5-draft-retry): its video file is not read.
export const runReads = (items: QueueItem[], thumbs: boolean): string[] =>
  items
    .filter((it) => it.status === 'pending')
    .flatMap((it) => [...(it.src === 'bridge' && !it.draftId ? [it.id] : []), ...(thumbs && it.thumb?.src === 'bridge' ? [it.thumb.id] : [])]);

export interface Lost { id: string; state: PermissionState }

// The queued files this panel can't read: 'prompt' (Chrome withdrew the access: a restart of
// the browser or the extension, or no page held the file any more) or 'denied'. A handle
// that is gone or can't be asked about is not something a re-grant fixes: the queue reports
// it when the item uploads. Asked on the handles the panel holds (lib/file-handles.ts).
export async function needingGrant(ids: string[], files: Handles = handles): Promise<Lost[]> {
  return (await files.states(ids)).filter((s): s is Lost => s.state === 'prompt' || s.state === 'denied');
}

// A click asked Chrome and these files are still not readable: asking again here won't help.
// `waiting`: some of them are at 'prompt', which the allow page (a tab, where Chrome shows its
// question) can still be asked about; a blocked file, or one only a Studio tab cannot read, is not.
export const stillLocked = (n: number, waiting = false) => waiting
  ? L(
    `เบราว์เซอร์ยังไม่อนุญาตให้อ่านไฟล์ ${n} ไฟล์ — กด "อนุญาตตลอดไป…" ที่แถบแจ้งเตือน แล้วเลือก "Allow on every visit" ในหน้าที่เปิดขึ้น ถ้ายังไม่ได้ ให้ลบคลิปนั้นออกจากคิว แล้วเพิ่มไฟล์เข้ามาใหม่`,
    `The browser still does not allow reading ${n} file(s) — click "Always allow…" on the banner and pick "Allow on every visit" on the page that opens; if that does not help, remove those videos from the queue and add the files again`,
  )
  : L(
    `เบราว์เซอร์ยังไม่อนุญาตให้อ่านไฟล์ ${n} ไฟล์ — ลบคลิปนั้นออกจากคิว แล้วเพิ่มไฟล์เข้ามาใหม่`,
    `The browser still does not allow reading ${n} file(s) — remove those videos from the queue and add the files again`,
  );
