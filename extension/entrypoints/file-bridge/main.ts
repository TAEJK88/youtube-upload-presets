import { FILE_CH, isBridgeConnect, readHandle, type FileOps } from '@/lib/file-bridge';
import { getHandle } from '@/lib/file-store';
import { portEndpoint, rpcServe } from '@/lib/rpc';

// Anything running on Studio's origin in the parent frame can connect here; that's not
// a secret. What actually protects file access is that queue item ids are unguessable
// (see file-bridge.ts), so connecting alone doesn't let a page read anyone else's files.
window.addEventListener('message', (e) => {
  if (!isBridgeConnect(e, window.parent)) return;
  const handlers: FileOps = { getFile: async (itemId) => readHandle(await getHandle(itemId)) };
  rpcServe(portEndpoint(e.ports[0]!), FILE_CH, handlers);
});
