import { CONNECT, FILE_CH, readHandle, type FileOps } from '@/lib/file-bridge';
import { getHandle } from '@/lib/file-store';
import { portEndpoint, rpcServe } from '@/lib/rpc';

// Only Studio's content script may connect; everything else is ignored.
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://studio.youtube.com' || e.data?.ch !== CONNECT || !e.ports[0]) return;
  const handlers: FileOps = { getFile: async (itemId) => readHandle(await getHandle(itemId)) };
  rpcServe(portEndpoint(e.ports[0]), FILE_CH, handlers);
});
