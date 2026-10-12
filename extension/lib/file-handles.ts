import { getHandle, listIds } from './file-store';

// Chrome keeps a file's read access only while some page of the extension holds a live handle
// object for that file. A handle read from IndexedDB, used once and dropped lets the access
// end at the next garbage collection, and a handle read again after that starts at 'prompt'.
// So every page that reads queued files (the side panel, the file bridge frame) keeps the
// handle objects here for as long as the files are queued, and asks about read access on
// these objects only.
export type Access = PermissionState | 'missing' | 'error';
export interface Asked { id: string; before: Access; after: Access; error?: string }

type Load = (id: string) => Promise<FileSystemFileHandle | undefined>;
const errName = (e: unknown) => (e as Error)?.name || String(e);

export function createHandles(load: Load = (id) => getHandle(id), stored: () => Promise<string[]> = () => listIds()) {
  const held = new Map<string, FileSystemFileHandle>();

  // The held object, or the stored one, held from now on.
  async function get(id: string): Promise<FileSystemFileHandle | undefined> {
    const had = held.get(id);
    if (had) return had;
    const h = await load(id);
    if (!h) return undefined;
    if (!held.has(id)) held.set(id, h);
    return held.get(id);
  }

  async function state(id: string): Promise<Access> {
    try {
      const h = await get(id);
      return h ? await h.queryPermission({ mode: 'read' }) : 'missing';
    } catch (e) {
      console.warn('[ytup] file access:', id, errName(e));
      return 'error';
    }
  }

  // The store is read for one id after another; the questions to Chrome go out together.
  async function states(ids: string[]): Promise<{ id: string; state: Access }[]> {
    for (const id of ids) await get(id).catch(() => undefined);
    return Promise.all(ids.map(async (id) => ({ id, state: await state(id) })));
  }

  return {
    keep(id: string, handle: FileSystemFileHandle) { held.set(id, handle); },
    get,
    states,
    held: (): ReadonlyMap<string, FileSystemFileHandle> => held,
    // Asks for read access to every file that lacks it. Called from a click: Chrome wants the
    // user's gesture, which lasts a few seconds and is not used up by the waits here. Each
    // file on its own, so one refusal doesn't stop the rest; what each was and became is
    // logged, since a side panel shows no prompt and nothing else tells what the click did.
    async request(ids: string[]): Promise<Asked[]> {
      for (const id of ids) await get(id).catch(() => undefined);
      return Promise.all(ids.map(async (id): Promise<Asked> => {
        const before = await state(id);
        if (before === 'granted') return { id, before, after: before };
        let after: Access = before;
        let error: string | undefined;
        if (before === 'prompt' || before === 'denied') {
          try {
            after = await held.get(id)!.requestPermission({ mode: 'read' });
          } catch (e) {
            error = errName(e);
          }
        }
        console.info(`[ytup] regrant ${id}: ${before} -> ${after}${error ? ` (${error})` : ''}`);
        return { id, before, after, ...(error ? { error } : {}) };
      }));
    },
    release(ids: string[]) { for (const id of ids) held.delete(id); },
    // Lets go of what is neither in `queued` nor stored any more. A file still stored is on
    // its way into the queue (just added) or about to be deleted; it goes at a later call.
    async prune(queued: string[]): Promise<void> {
      const keep = new Set(queued);
      const gone = [...held.keys()].filter((id) => !keep.has(id));
      if (!gone.length) return;
      let inStore: Set<string>;
      try {
        inStore = new Set(await stored());
      } catch (e) {
        return void console.warn('[ytup] file access: store', errName(e));
      }
      for (const id of gone) if (!inStore.has(id)) held.delete(id);
    },
  };
}
export type Handles = ReturnType<typeof createHandles>;

// This page's.
export const handles = createHandles();
