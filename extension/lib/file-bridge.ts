// A File can't travel over chrome.runtime messaging, and Studio's upload input
// needs a real File inside the Studio tab. The content script mounts a hidden
// extension-origin iframe (file-bridge.html) which can read the side panel's
// IndexedDB, and hands it a MessagePort to ask for files by queue item id.
export const FILE_CH = 'ytup:files';
export const CONNECT = 'ytup:file-bridge:connect';

// Any script on Studio's origin in the parent frame can open this channel, so the
// real protection is that queue item ids (file-store keys, see file-store.ts) MUST
// be unguessable (crypto.randomUUID()), never sequential counters.
export type FileOps = {
  getFile(itemId: string): Promise<File>;
};

// Checks the connect handshake from the file-bridge iframe's perspective: a parent-frame
// message, from Studio's origin, on the connect channel, carrying a port to serve over.
export function isBridgeConnect(e: MessageEvent, parent: Window | null): boolean {
  return e.origin === 'https://studio.youtube.com' && e.source === parent && e.data?.ch === CONNECT && !!e.ports[0];
}

// Error messages are codes the queue turns into user-facing text.
export async function readHandle(h: FileSystemFileHandle | undefined): Promise<File> {
  if (!h) throw new Error('missing');
  if ((await h.queryPermission({ mode: 'read' })) !== 'granted') throw new Error('permission');
  try {
    return await h.getFile();
  } catch {
    throw new Error('read');
  }
}
