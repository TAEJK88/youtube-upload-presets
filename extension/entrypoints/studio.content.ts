import { stopOnInvalidated } from '@/lib/content-lifecycle';
import { createChannelSwitch } from '@/lib/channel-switch';
import { createFileBridge } from '@/lib/file-bridge-client';
import { initI18n } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { createSyncStore } from '@/lib/sync-store';
import { refreshCfg } from '@/lib/studio/channel';
import { injectIntoUploadDialog } from '@/lib/studio/inject-spike';
import { disposeState, initState } from '@/lib/studio/state';

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
  async main(ctx) {
    await initI18n();
    const stop = stopOnInvalidated(ctx);
    stop.add(disposeState);

    // The same watchers as on www.youtube.com: invite links can land on Studio, and the
    // post-switch "Oops" recovery runs here.
    const store = await createSyncStore(INVITE_KEYS);
    stop.add(() => store.dispose());
    const env = browserEnv(store, {
      setInterval: (fn, ms) => ctx.setInterval(fn, ms),
      clearInterval,
      setTimeout: (fn, ms) => ctx.setTimeout(fn, ms),
    });
    const sw = createChannelSwitch(env);
    sw.watchChannelSwitcher();
    sw.recoverAfterSwitch();
    const invite = createInviteWatcher(env);
    invite.watchInvite();
    invite.armSpaPoll();
    onMessage('dev:switchChannel', ({ data }) => sw.switchToChannel({ handle: data.handle }, data.next));

    const main = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH);
    const readCfg = (keys: string[]) => main('getCfg', keys);
    const files = createFileBridge(document);
    stop.add(() => files.dispose());

    onMessage('spike:cfg', () =>
      readCfg(['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']),
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

    try {
      await initState();
    } catch (e) {
      console.error('[ytup] page automation is off:', e);
      return;
    }
    await refreshCfg(readCfg);
    console.info('[ytup] state ready');
  },
});
