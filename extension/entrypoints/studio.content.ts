import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  main() {
    const main = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH);
    onMessage('spike:cfg', () =>
      main('getCfg', ['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']),
    );
  },
});
