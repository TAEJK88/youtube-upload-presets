import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { rpcServe, windowEndpoint } from '@/lib/rpc';

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start', // ytcfg is read lazily per request, so starting early is safe
  main() {
    const w = window as unknown as { ytcfg?: { get(k: string): unknown } };
    const handlers: MainOps = {
      getCfg: (keys) => Object.fromEntries(keys.map((k) => [k, w.ytcfg?.get(k)])),
    };
    rpcServe(windowEndpoint(window, window.location.origin), MAIN_CH, handlers);
  },
});
