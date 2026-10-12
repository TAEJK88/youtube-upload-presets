// A File can't travel over chrome.runtime messaging, and Studio's upload input
// needs a real File inside the Studio tab. The content script mounts a hidden
// extension-origin iframe (file-bridge.html) which can read the side panel's
// IndexedDB, and hands it a MessagePort to ask for files by queue item id.
import type { Access, Handles } from './file-handles';

export const FILE_CH = 'ytup:files';
export const CONNECT = 'ytup:file-bridge:connect';

// Any script on Studio's origin in the parent frame can open this channel, so the
// real protection is that queue item ids (file-store keys, see file-store.ts) MUST
// be unguessable (crypto.randomUUID()), never sequential counters.
export type FileOps = {
  getFile(itemId: string): Promise<File>;
  // Start: the bridge takes the handle of every file the run will read and says what read
  // access each has ('missing': no stored handle).
  hold(itemIds: string[]): Promise<Access[]>;
  // The queue no longer needs these files.
  release(itemIds: string[]): Promise<void>;
};

// Checks the connect handshake from the file-bridge iframe's perspective: a parent-frame
// message, from Studio's origin, on the connect channel, carrying a port to serve over.
export function isBridgeConnect(e: MessageEvent, parent: Window | null): boolean {
  return e.origin === 'https://studio.youtube.com' && e.source === parent && e.data?.ch === CONNECT && !!e.ports[0];
}

// Error messages are codes the queue turns into user-facing text.
export async function readHandle(h: FileSystemFileHandle | undefined): Promise<File> {
  if (!h) throw new Error('missing');
  const perm = await h.queryPermission({ mode: 'read' });
  // 'denied' (a blocked prompt) is told apart: it fails its own item, it doesn't hold the
  // queue back (the panel's Start click and startQueue stop on 'prompt' only).
  if (perm === 'denied') throw new Error('denied');
  if (perm !== 'granted') throw new Error('permission');
  try {
    return await h.getFile();
  } catch {
    throw new Error('read');
  }
}

// What the bridge frame answers. It keeps the handle of every file it was asked for
// (lib/file-handles.ts) until the queue lets go of the file, so the read access outlives a
// closed side panel for as long as this frame's Studio tab is not reloaded. A file another
// Studio tab removed is let go when this one is next asked to hold or release.
// Any script on Studio's origin can call these: only a list of ids is taken, and not an
// endless one. A drop or a pick gives at most MAX_FOLDER_FILES (2000) files from folders, and
// a run reads a video and at most one thumbnail per item, so 10 000 ids is far above any
// real call.
export const MAX_IDS = 10_000;
function checkIds(itemIds: unknown): asserts itemIds is string[] {
  const ok = Array.isArray(itemIds) && itemIds.length <= MAX_IDS && itemIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64);
  if (!ok) throw new Error('bad ids');
}

export function fileOps(files: Handles): FileOps {
  return {
    getFile: async (itemId) => readHandle(await files.get(itemId)),
    async hold(itemIds) {
      checkIds(itemIds);
      await files.prune([]);
      return (await files.states(itemIds)).map((s) => s.state);
    },
    async release(itemIds) {
      checkIds(itemIds);
      files.release(itemIds);
      await files.prune([]);
    },
  };
}
