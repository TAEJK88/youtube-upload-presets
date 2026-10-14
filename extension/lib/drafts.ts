import { L } from './i18n';

// The failed videos of a queue, by what "Resume drafts" (P5-draft-retry) can do with them. Used
// by the side panel for its button and its count, and by the Studio tab that puts them back in line.
// - resumable: its file is a draft in Studio, and no other card names that draft
// - shared: its draft id is on another card too (what builds before the draft-retry fix stored
//   when a dialog stayed open): which card it belongs to cannot be told, so none resumes it
// - plain: no draft id; it needs its file uploaded, which a card's Retry does
interface Card { status: string; draftId?: string }
export function failedByDraft<T extends Card>(items: T[]): { resumable: T[]; shared: T[]; plain: T[] } {
  const failed = items.filter((i) => i.status === 'error');
  const elsewhere = (it: T) => items.some((x) => x !== it && x.draftId === it.draftId);
  return {
    resumable: failed.filter((i) => i.draftId && !elsewhere(i)),
    shared: failed.filter((i) => i.draftId && elsewhere(i)),
    plain: failed.filter((i) => !i.draftId),
  };
}

// What builds before the draft-retry fix left in a stored queue (seen in the owner's, 2026-10-14):
// a video failed, its Studio dialog stayed open, and every later video failed on "An upload
// dialog is still open" and was given the open dialog's video id as its own draft. That error is
// thrown before a video's file is fetched, so such a card never handed a file to Studio and owns
// no draft. It is told from a card of this build, which may meet the same sentence while it goes
// on in its own draft, by the old ending "…already uploaded as a draft (id). Delete it in
// Content…", which this build no longer writes. Both are matched as stored, in either language.
const STILL_OPEN = ['มีหน้าต่างอัปโหลดค้างอยู่ ปิดก่อนแล้วกดเริ่มใหม่', 'An upload dialog is still open. Close it, then start again'];
const oldTails = (id: string) => [
  ` · ไฟล์ขึ้นไปเป็นฉบับร่างแล้ว (${id}) ลบใน Content ก่อนกดลองใหม่ จะได้ไม่ซ้ำ`,
  ` · The file is already uploaded as a draft (${id}). Delete it in Content before retrying to avoid duplicates`,
];
interface Failed { status: string; msg: string; draftId?: string }
// Repairs such cards in place: they lose the draft id and say the file was not uploaded (still
// errors: Retry uploads the file). The card left with the id is then the one that owns the draft,
// and its message no longer says to delete what Retry can finish. Doing it again changes nothing.
export function repairCascade(items: Failed[]): { freed: number; reworded: number } {
  let freed = 0, reworded = 0;
  for (const it of items) {
    if (it.status !== 'error' || !it.draftId) continue;
    const tail = oldTails(it.draftId).find((t) => it.msg.endsWith(t));
    if (!tail) continue;
    const head = it.msg.slice(0, -tail.length);
    if (STILL_OPEN.includes(head)) {
      it.draftId = '';
      it.msg = head + L(' · ไฟล์นี้ยังไม่ได้อัปโหลด กด "ลองใหม่" เพื่ออัปโหลด', ' · This file was not uploaded. Retry uploads it');
      freed++;
    } else {
      it.msg = head + L(` · ไฟล์เป็นฉบับร่างใน Studio แล้ว (${it.draftId}) กด "ลองใหม่" เพื่อทำต่อบนฉบับร่างนั้น ไม่ต้องอัปโหลดซ้ำ`, ` · The file is already a draft in Studio (${it.draftId}). Retry goes on with that draft, without uploading again`);
      reworded++;
    }
  }
  if (freed || reworded) console.info(`[ytup] draft retry: repaired ${freed} card(s) that never handed a file to Studio (draft id dropped), ${reworded} message(s) reworded`);
  return { freed, reworded };
}
