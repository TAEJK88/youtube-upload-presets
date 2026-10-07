import { FILE_CH, isBridgeConnect, readHandle, type FileOps } from '@/lib/file-bridge';
import { getHandle } from '@/lib/file-store';
import { portEndpoint, rpcServe } from '@/lib/rpc';

// Anything running on Studio's origin in the parent frame can connect here; that's not
// a secret. What actually protects file access is that queue item ids are unguessable
// (see file-bridge.ts), so connecting alone doesn't let a page read anyone else's files.
// A new connect replaces the previous channel instead of serving both.
let current: { stop: () => void; port: MessagePort } | null = null;
window.addEventListener('message', (e) => {
  if (!isBridgeConnect(e, window.parent)) return;
  current?.stop();
  current?.port.close();
  const port = e.ports[0]!;
  const handlers: FileOps = { getFile: async (itemId) => readHandle(await getHandle(itemId)) };
  current = { stop: rpcServe(portEndpoint(port), FILE_CH, handlers), port };
  // Tells the client the connect got through (no id/ok, so it is never taken for an rpc response).
  port.postMessage({ ch: FILE_CH, ack: true });
});
