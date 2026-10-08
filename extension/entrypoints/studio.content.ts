import { stopOnInvalidated } from '@/lib/content-lifecycle';
import { createChannelSwitch } from '@/lib/channel-switch';
import { createFileBridge } from '@/lib/file-bridge-client';
import { initI18n, L } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { createSyncStore } from '@/lib/sync-store';
import { refreshCfg } from '@/lib/studio/channel';
import { createContentUi } from '@/lib/studio/content-ui';
import { applyToOpenDialog, installManualFill } from '@/lib/studio/manual-fill';
import { installTitleMark, setTitleMark } from '@/lib/studio/page-notify';
import { setPageUi } from '@/lib/studio/page-ui';
import { installQuickActions } from '@/lib/studio/quick-actions';
import { bridgeFiles, setBridge } from '@/lib/studio/queue-files';
import { clearDone, removeItem, retryItem, stopQueue } from '@/lib/studio/queue-ops';
import { addQueued, installIntercept, requestStop, setCfgReader, setOtherTabRuns, setRunnerLock, startQueue, startSummary } from '@/lib/studio/queue-runner';
import { installUnloadGuard, restoreQueue } from '@/lib/studio/queue-store';
import { disposeState, initState } from '@/lib/studio/state';
import { diagnoseUploadDialog } from '@/lib/studio/upload-dialog';

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
  return host;
}

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  async main(ctx) {
    await initI18n();
    // Everything below that outlives a reload of the extension is stopped through `stop`.
    const stop = stopOnInvalidated(ctx);
    stop.add(disposeState);
    if (ctx.isInvalid) return;

    // The same watchers as on www.youtube.com: invite links can land on Studio, and the
    // post-switch "Oops" recovery runs here.
    const store = await createSyncStore(INVITE_KEYS);
    stop.add(() => store.dispose());
    if (ctx.isInvalid) return;
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
    stop.add(() => main.dispose('extension reloaded'));
    const readCfg = (keys: string[]) => main('getCfg', keys);
    onMessage('spike:cfg', () =>
      readCfg(['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']),
    );
    const fab = mountFab();
    stop.add(() => fab.remove());

    if (ctx.isInvalid) return;
    try {
      await initState();
    } catch (e) {
      console.error('[ytup] page automation is off:', e);
      return;
    }
    if (ctx.isInvalid) return;
    await refreshCfg(readCfg);
    // The preflight and the start read ytcfg again themselves (startSummary / startQueue).
    setCfgReader(readCfg);
    stop.add(() => setCfgReader(null));

    const files = createFileBridge(document);
    setBridge(files);
    stop.add(() => {
      setBridge(null);
      files.dispose();
    });
    const ui = createContentUi();
    setPageUi(ui);
    stop.add(() => ui.dispose());
    const releaseLock = () => void sendMessage('runner:release', undefined).catch(() => {});
    setRunnerLock({
      acquire: () => sendMessage('runner:acquire', undefined).catch((e) => (console.error('[ytup] runner lock', e), false)),
      release: releaseLock,
    });
    // Leaving Studio (or the extension going away) frees the lock at once. Best effort: the
    // background also frees it when this tab closes or leaves Studio.
    window.addEventListener('pagehide', releaseLock);
    stop.add(() => {
      window.removeEventListener('pagehide', releaseLock);
      requestStop();
      releaseLock();
    });
    // Each answer is cached for what can't wait for one: queue saves and the intercept.
    const elsewhere = () =>
      sendMessage('runner:elsewhere', undefined)
        .catch(() => false)
        .then((v) => (setOtherTabRuns(v), v));
    stop.add(() => setOtherTabRuns(false));
    // A reload in the middle of a run leaves this tab's lock behind.
    await sendMessage('runner:release', undefined).catch(() => {});
    restoreQueue(!(await elsewhere()));

    // While another tab runs the queue, its writes would overwrite ours.
    const mayEdit = async () => {
      if (!(await elsewhere())) return true;
      ui.toast(L('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', 'Another Studio tab is running the queue — change the queue there'));
      return false;
    };
    onMessage('queue:add', async ({ data: ids }) => {
      if (!(await mayEdit())) return;
      const { files, failed } = await bridgeFiles(ids);
      if (failed.length) ui.toast(L(`เพิ่มไม่ได้ ${failed.length} ไฟล์: `, `Could not add ${failed.length} file(s): `) + failed[0]!.reason);
      if (files.length) await addQueued(files);
    });
    onMessage('queue:preflight', () => startSummary());
    onMessage('queue:start', ({ data: confirmed }) => {
      ui.setConfirmed(confirmed);
      // A run can take hours: answer now, report through queue:state.
      void startQueue()
        .catch((e) => console.error('[ytup] run', e))
        .finally(elsewhere);
    });
    onMessage('queue:stop', () => {
      stopQueue();
      void elsewhere();
    });
    onMessage('queue:retry', async ({ data: id }) => {
      if (await mayEdit()) retryItem(id);
    });
    onMessage('queue:remove', async ({ data: id }) => {
      if (await mayEdit()) removeItem(id);
    });
    onMessage('queue:clearDone', async () => {
      if (await mayEdit()) clearDone();
    });
    onMessage('fill:apply', () => applyToOpenDialog());
    onMessage('diag:dialogInfo', () => diagnoseUploadDialog());

    stop.add(installIntercept());
    stop.add(installManualFill());
    stop.add(installQuickActions());
    installTitleMark();
    stop.add(() => setTitleMark(''));
    stop.add(installUnloadGuard());
    ctx.setInterval(() => {
      void elsewhere();
      try {
        ui.tick();
      } catch (e) {
        console.error('[ytup] progress', e);
      }
    }, 800);
  },
});
