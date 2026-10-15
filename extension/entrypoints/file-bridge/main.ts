import { installDebugCapture } from '@/lib/debug-log';
import { FILE_CH, fileOps, isBridgeConnect } from '@/lib/file-bridge';
import { handles } from '@/lib/file-handles';
import { portEndpoint, rpcServe } from '@/lib/rpc';

installDebugCapture('bridge', { target: window });

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
  // One set of held handles for the frame: a new channel reads the same ones.
  current = { stop: rpcServe(portEndpoint(port), FILE_CH, fileOps(handles)), port };
  // Tells the client the connect got through (no id/ok, so it is never taken for an rpc response).
  port.postMessage({ ch: FILE_CH, ack: true });
});
