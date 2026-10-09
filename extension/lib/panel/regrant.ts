import { getHandle } from '../file-store';
import type { QueueItem } from '../studio/queue-runner';

// After a browser restart, read permission on stored handles can go back to 'prompt'
// (spec: File intake, step 4). The panel shows one button for all of them; one click asks
// for each (a user gesture is needed, and the panel has one).
export const queuedFileIds = (items: QueueItem[]): string[] =>
  items
    .filter((it) => it.status === 'pending' || it.status === 'error')
    .flatMap((it) => [...(it.src === 'bridge' ? [it.id] : []), ...(it.thumb?.src === 'bridge' ? [it.thumb.id] : [])]);

type Get = (id: string) => Promise<FileSystemFileHandle | undefined>;

// A handle that is gone or can't be asked about is not something a re-grant fixes: the
// queue reports it when the item uploads.
export async function needingGrant(ids: string[], get: Get = getHandle): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const state = await get(id).then((h) => h?.queryPermission({ mode: 'read' })).catch(() => undefined);
    if (state && state !== 'granted') out.push(id);
  }
  return out;
}

// Each handle on its own: one refusal (or a lost gesture) must not stop the rest.
export async function regrant(ids: string[], get: Get = getHandle): Promise<number> {
  let granted = 0;
  for (const id of ids) {
    const state = await get(id).then((h) => h?.requestPermission({ mode: 'read' })).catch(() => undefined);
    if (state === 'granted') granted++;
  }
  return granted;
}
