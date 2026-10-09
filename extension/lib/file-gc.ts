import { browser } from 'wxt/browser';
import { deleteHandle, listIds } from './file-store';
import { mayWrite } from './store-writer';

// The background's side of the file handles the side panel stored (lib/file-store.ts).

type Sender = Parameters<typeof mayWrite>[1];
type Del = (id: string) => Promise<void>;
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// files:delete. The page has no access to the extension's IndexedDB; it asks here to forget
// handles. Only the side panel and Studio tabs may (store-writer mayWrite).
export async function deleteFiles(ids: unknown, sender: Sender, ext: string, del: Del = deleteHandle): Promise<void> {
  if (!mayWrite('files:delete', sender, ext)) throw new Error('files:delete: not allowed from this sender');
  if (!isIds(ids)) return;
  for (const id of ids) {
    try {
      await del(id);
    } catch (e) {
      console.warn('[ytup] files:delete', id, e); // one failure must not keep the rest
    }
  }
}

// Handles no stored queue item references any more: a panel closed (or an extension reload)
// between storing the handles and the tab's queue:add answer, or a navigation during an add.
// The stored 'queue' is the only list of items (one key, not per channel, in this phase);
// an item keeps its own id's handle and its thumbnail's. The handles are listed before the
// queue is read, so a handle stored and queued in between is kept; one stored before the
// listing whose item is saved only after the read would not be, which is why this runs at
// browser startup only, before any panel can be adding files. A stored queue this code
// doesn't understand deletes nothing.
export async function sweepHandles(d: { list?: () => Promise<string[]>; del?: Del } = {}): Promise<number> {
  const ids = await (d.list ?? listIds)();
  if (!ids.length) return 0;
  const queue = (await browser.storage.local.get('queue')).queue ?? [];
  if (!Array.isArray(queue)) return 0;
  const used = new Set<string>();
  for (const it of queue as { id?: unknown; thumb?: { id?: unknown } | null }[]) {
    if (typeof it?.id === 'string') used.add(it.id);
    if (typeof it?.thumb?.id === 'string') used.add(it.thumb.id);
  }
  let n = 0;
  for (const id of ids) {
    if (used.has(id)) continue;
    try {
      await (d.del ?? deleteHandle)(id);
      n++;
    } catch (e) {
      console.warn('[ytup] handle sweep', id, e);
    }
  }
  return n;
}
