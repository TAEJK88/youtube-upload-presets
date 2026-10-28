import { deleteHandle, putHandle } from '../file-store';
import { L } from '../i18n';
import type { ViewItem } from '../studio/queue-view';
import { forget, storeHandles, type Del, type Put } from './intake';

// Files picked in Studio's own upload dialog live in that page only (lib/studio/queue-files.ts):
// a reload loses them all at once. The panel's banner asks for them again in one pick; each
// picked file goes to the lost item with its name (and size, when the item knows it), its
// handle is stored under the item's id, and the tab turns the item into a bridge file
// (queue:relink, lib/studio/queue-edit.ts).

export interface Picked { handle: FileSystemFileHandle; name: string; size: number }
export interface Match { pairs: { id: string; handle: FileSystemFileHandle }[]; unused: number }
type Lost = Pick<ViewItem, 'id' | 'file'>;

export const lostItems = <T extends Pick<ViewItem, 'lost'>>(items: T[]): T[] => items.filter((it) => it.lost);

export const readPicked = (files: FileSystemFileHandle[]): Promise<Picked[]> =>
  Promise.all(files.map(async (handle) => {
    const f = await handle.getFile();
    return { handle, name: f.name, size: f.size };
  }));

// In queue order; each picked file goes to one item at most (two videos of the same name need
// two files).
export function matchLost(lost: Lost[], picked: Picked[]): Match {
  const free = [...picked];
  const pairs: Match['pairs'] = [];
  for (const it of lost) {
    const i = free.findIndex((p) => p.name === it.file.name && (!it.file.size || p.size === it.file.size));
    if (i < 0) continue;
    pairs.push({ id: it.id, handle: free[i]!.handle });
    free.splice(i, 1);
  }
  return { pairs, unused: free.length };
}

// Stored under the items' own ids, then sent; answers the ids the tab took. What it did not take
// is forgotten again, and so is everything when it doesn't answer, except an item `isBridge` (the
// panel's latest view) shows as a bridge file by now: that handle is the item's own. An older tab
// answers nothing: nothing taken.
export async function relinkFiles(
  pairs: Match['pairs'], deliver: (ids: string[]) => Promise<unknown>, isBridge: (id: string) => boolean,
  put: Put = putHandle, del: Del = deleteHandle,
): Promise<string[]> {
  const ids = await storeHandles(pairs.map((p) => p.handle), put, del, pairs.map((p) => p.id));
  const notTaken = (taken: string[]) => ids.filter((id) => !taken.includes(id) && !isBridge(id));
  let taken: string[];
  try {
    const answer = await deliver(ids);
    taken = Array.isArray(answer) ? ids.filter((id) => answer.includes(id)) : [];
  } catch (e) {
    await forget(notTaken([]), del);
    throw e;
  }
  await forget(notTaken(taken), del);
  return taken;
}

const NAMED = 5;
export function relinkSummary(lost: Lost[], taken: string[], unused: number): string {
  const missing = lost.filter((it) => !taken.includes(it.id)).map((it) => it.file.name);
  const names = missing.slice(0, NAMED).join(', ') + (missing.length > NAMED ? L(` และอีก ${missing.length - NAMED} ไฟล์`, ` and ${missing.length - NAMED} more`) : '');
  return [
    L(`เพิ่มกลับแล้ว ${taken.length} จาก ${lost.length} ไฟล์ที่หายไป`, `Re-added ${taken.length} of ${lost.length} lost files`),
    ...(missing.length ? [L(`ยังขาด: ${names}`, `still missing: ${names}`)] : []),
    ...(unused ? [L(`${unused} ไฟล์ที่เลือกไม่ตรงกับคลิปที่หายไป จึงไม่ได้เพิ่ม`, `${unused} picked file(s) matched no lost video and were not added`)] : []),
  ].join(' · ');
}
