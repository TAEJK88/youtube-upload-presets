import '@/lib/debug-capture/studio'; // FIRST: the debug page shows what goes wrong below
import { stopOnInvalidated } from '@/lib/content-lifecycle';
import { createChannelSwitch } from '@/lib/channel-switch';
import { createFileBridge } from '@/lib/file-bridge-client';
import { initI18n, L } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { createSyncStore } from '@/lib/sync-store';
import { getChannel, refreshCfg } from '@/lib/studio/channel';
import { rememberChannel, switchChannel } from '@/lib/studio/channels';
import { createContentUi, startFromPanel, storeWriteFailed } from '@/lib/studio/content-ui';
import { fabModel, mountFab } from '@/lib/studio/fab';
import { applyToOpenDialog, installManualFill } from '@/lib/studio/manual-fill';
import { installTitleMark, setTitleMark } from '@/lib/studio/page-notify';
import { setPageUi } from '@/lib/studio/page-ui';
import { installQuickActions } from '@/lib/studio/quick-actions';
import { setBridge } from '@/lib/studio/queue-files';
import { installShortcuts } from '@/lib/studio/shortcuts';
import { followStoredChanges, handleQueueAdd, handleQueueEdit } from '@/lib/studio/queue-edit';
import { clearDone, removeItem, retryItem, stopQueue } from '@/lib/studio/queue-ops';
import { abortRun, installIntercept, isStartBinding, requestStop, running, setCfgReader, setOtherTabRuns, setRunnerLock, startSummary } from '@/lib/studio/queue-runner';
import { flushQueue, installUnloadGuard } from '@/lib/studio/queue-store';
import { elsewhere, mayEdit, resumeQueue, watchLockLifecycle } from '@/lib/studio/queue-sync';
import { queueView } from '@/lib/studio/queue-view';
import { showIfOrphaned } from '@/lib/studio/reload-banner';
import { disposeState, initState, setPatchFailed } from '@/lib/studio/state';
import { diagnoseUploadDialog } from '@/lib/studio/upload-dialog';

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  async main(ctx) {
    await initI18n();
    // Everything below that outlives a reload of the extension is stopped through `stop`.
    const stop = stopOnInvalidated(ctx);
    // Orphaned by an extension update / reload: tell the user to reload the tab. Added first,
    // so it runs last (teardowns run in reverse), after the FAB is gone.
    stop.add(() => showIfOrphaned(browser.runtime));
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

    const main = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH);
    stop.add(() => main.dispose('extension reloaded'));
    const readCfg = (keys: string[]) => main('getCfg', keys);

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
    // The userscript's FAB: opens the side panel (needs the click's user gesture — see README).
    const fab = mountFab(() => ui.openDrawer());
    stop.add(() => fab.remove());
    // Filled now, not at the first tick: the first clamp to the window needs its real width.
    fab.update(fabModel());
    setPatchFailed(storeWriteFailed);
    stop.add(() => setPatchFailed(null));
    const releaseLock = () => void sendMessage('runner:release', 'queue').catch(() => {});
    // The lock is ours: whatever the cached flag says, no other tab runs.
    const acquireLock = () => sendMessage('runner:acquire', 'queue')
      .then((ok) => (ok && setOtherTabRuns(false), ok))
      .catch((e) => (console.error('[ytup] runner lock', e), false));
    setRunnerLock({
      acquire: acquireLock,
      // The run's last statuses are saved before the lock goes: a mirror tab that sees it
      // free cuts what it still has as uploading (followOtherTab).
      release: () => {
        flushQueue();
        releaseLock();
      },
    });
    // Leaving Studio (or the extension going away) frees the lock at once. Best effort: the
    // background also frees it when this tab closes or leaves Studio. Back from the
    // back/forward cache mid-run, the page takes it again, or aborts the run when another
    // tab took it meanwhile (queue-sync watchLockLifecycle).
    const offLock = watchLockLifecycle(window, {
      release: releaseLock,
      acquire: acquireLock,
      running: () => running,
      abort: () => abortRun(new Error(L('มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่', 'Another Studio tab is already running the queue'))),
      toast: (m) => ui.toast(m),
    });
    stop.add(() => {
      offLock();
      requestStop();
      void sendMessage('runner:release', 'all').catch(() => {});
    });
    stop.add(() => setOtherTabRuns(false));
    // Coming back to the tab: refresh at once rather than at the next tick.
    const refresh = () => { if (document.visibilityState === 'visible') void elsewhere(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    stop.add(() => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    });
    await resumeQueue();

    onMessage('queue:add', ({ data: ids }) => handleQueueAdd(ids, mayEdit));
    onMessage('queue:preflight', () => startSummary());
    onMessage('queue:start', ({ data: seen }) => {
      if (!isStartBinding(seen)) return;
      // A run can take hours: answer now, report through queue:state.
      void startFromPanel(ui, seen)
        .catch((e) => console.error('[ytup] run', e))
        .finally(elsewhere);
    });
    onMessage('queue:stop', () => {
      stopQueue();
      void elsewhere();
    });
    onMessage('queue:retry', async ({ data: id }) => {
      if (typeof id === 'string' && await mayEdit()) retryItem(id);
    });
    onMessage('queue:remove', async ({ data: id }) => {
      if (typeof id === 'string' && await mayEdit()) removeItem(id);
    });
    onMessage('queue:clearDone', async () => {
      if (await mayEdit()) clearDone();
    });
    onMessage('queue:view', () => queueView(ui.state()));
    onMessage('queue:edit', ({ data }) => handleQueueEdit(data, mayEdit));
    onMessage('channel:switch', ({ data }) => switchChannel(sw, data));
    stop.add(installShortcuts());
    stop.add(followStoredChanges());
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
      // Its own try: a failure here must not stop the progress bar.
      try {
        rememberChannel(getChannel());
      } catch (e) {
        console.error('[ytup] channel memory', e);
      }
      try {
        ui.tick();
      } catch (e) {
        console.error('[ytup] progress', e);
      }
      // Its own try too: a failing tick must not freeze the FAB, nor the FAB the tick.
      try {
        fab.update(fabModel());
      } catch (e) {
        console.error('[ytup] fab', e);
      }
    }, 800);
  },
});
