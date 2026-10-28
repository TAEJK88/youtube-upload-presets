import { handles as held } from '../file-handles';
import { deleteHandle, putHandle } from '../file-store';
import { L } from '../i18n';
import type { ViewItem } from '../studio/queue-view';
import { forget, type Del, type Put } from './intake';

// Files picked in Studio's own upload dialog live in that page only (lib/studio/queue-files.ts):
// a reload loses them all at once. The panel's banner asks for them again in one pick; each
// picked file goes to the lost item with its name (and size, when the item knows it), its
// handle is stored under the item's id, and the tab turns the item into a bridge file
// (queue-edit relink).

export interface Picked { handle: FileSystemFileHandle; name: string; size: number }
export interface Match { pairs: { id: string; handle: FileSystemFileHandle }[]; missing: string[]; unused: number }
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
  const missing: string[] = [];
  for (const it of lost) {
    const i = free.findIndex((p) => p.name === it.file.name && (!it.file.size || p.size === it.file.size));
    if (i < 0) {
      missing.push(it.file.name);
      continue;
    }
    pairs.push({ id: it.id, handle: free[i]!.handle });
    free.splice(i, 1);
  }
  return { pairs, missing, unused: free.length };
}

// As sendFiles (intake.ts), under the items' own ids: a tab that doesn't take them gets them
// forgotten again.
export async function relinkFiles(
  pairs: Match['pairs'], deliver: (ids: string[]) => Promise<unknown>,
  put: Put = putHandle, del: Del = deleteHandle,
): Promise<void> {
  const ids: string[] = [];
  try {
    for (const { id, handle } of pairs) {
      await put(id, handle);
      held.keep(id, handle);
      ids.push(id);
    }
    await deliver(ids);
  } catch (e) {
    await forget(ids, del);
    throw e;
  }
}

const NAMED = 5;
export function relinkSummary(matched: number, lost: number, missing: string[], unused: number): string {
  const names = missing.slice(0, NAMED).join(', ') + (missing.length > NAMED ? L(` และอีก ${missing.length - NAMED} ไฟล์`, ` and ${missing.length - NAMED} more`) : '');
  return [
    L(`เพิ่มกลับแล้ว ${matched} จาก ${lost} ไฟล์ที่หายไป`, `Re-added ${matched} of ${lost} lost files`),
    ...(missing.length ? [L(`ยังขาด: ${names}`, `still missing: ${names}`)] : []),
    ...(unused ? [L(`${unused} ไฟล์ที่เลือกไม่ตรงกับคลิปที่หายไป จึงไม่ได้เพิ่ม`, `${unused} picked file(s) matched no lost video and were not added`)] : []),
  ].join(' · ');
}
