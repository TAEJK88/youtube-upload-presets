import { mountFileBridge } from '@/lib/file-bridge-client';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { injectIntoUploadDialog } from '@/lib/studio/inject-spike';

// Spike FAB: tests whether a page click may open the side panel.
function mountFab() {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const b = document.createElement('button');
  b.textContent = 'UP';
  b.title = 'Open YouTube Upload Presets';
  b.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:44px;height:44px;border-radius:50%;border:0;background:#111;color:#fff;font:600 12px system-ui;cursor:pointer';
  b.onclick = () => {
    sendMessage('openPanel', undefined).catch((e) => console.warn('[ytup] openPanel failed', e));
  };
  root.append(b);
  document.documentElement.append(host);
}

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  main() {
    const main = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH);
    const files = mountFileBridge(document);

    onMessage('spike:cfg', () =>
      main('getCfg', ['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']),
    );
    onMessage('spike:inject', async ({ data: itemId }) => {
      try {
        const t0 = performance.now();
        const file = await files.getFile(itemId);
        const ms = Math.round(performance.now() - t0);
        const ok = await injectIntoUploadDialog(file);
        return { ok, detail: `${file.name} · ${file.size} bytes · bridge ${ms} ms` };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    });
    mountFab();
  },
});
