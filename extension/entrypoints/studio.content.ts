import '@/lib/debug-capture/studio'; // FIRST: the debug page shows what goes wrong below
import { stopOnInvalidated } from '@/lib/content-lifecycle';
import { createChannelSwitch } from '@/lib/channel-switch';
import {
  adsFromPanel, autopilotDue, claimsState, collabFromPanel, initClaimsLock, installBackGuard, installConfirmWatch, setCfgRefresh, setChannelSwitcher, setClaimsLock,
  setClaimsUi, stopAll, trimFromPanel,
} from '@/lib/claims/claims';
import { createClaimsPage } from '@/lib/claims/page';
import { disposeClaimsStore } from '@/lib/claims/store';
import { loadClaimsData, wireClaims } from '@/lib/claims/wiring';
import { createFileBridge } from '@/lib/file-bridge-client';
import { initI18n, L } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { createSyncStore } from '@/lib/sync-store';
import { getChannel, refreshCfg } from '@/lib/studio/channel';
import { rememberChannel, switchChannel } from '@/lib/studio/channels';
import { createContentUi, resumeFromPause, startFromPanel, storeWriteFailed } from '@/lib/studio/content-ui';
import { activityTab, fabModel, mountFab } from '@/lib/studio/fab';
import { applyToOpenDialog, installManualFill } from '@/lib/studio/manual-fill';
import { installTitleMark, setTitleMark } from '@/lib/studio/page-notify';
import { setPageUi } from '@/lib/studio/page-ui';
import { installQuickActions } from '@/lib/studio/quick-actions';
import { installDraftApply } from '@/lib/studio/draft-select';
import { setBridge } from '@/lib/studio/queue-files';
import { installShortcuts } from '@/lib/studio/shortcuts';
import { followStoredChanges, handleQueueAdd, handleQueueEdit } from '@/lib/studio/queue-edit';
import { clearAll, removeItem, resumeDrafts, retryItem, stopQueue } from '@/lib/studio/queue-ops';
import { createPauseWatch } from '@/lib/studio/queue-pause';
import { abortRun, currentItemId, installIntercept, isStartBinding, queue, requestStop, running, setCfgReader, setOtherTabRuns, setRunnerLock, startSummary } from '@/lib/studio/queue-runner';
import { flushQueue, installUnloadGuard } from '@/lib/studio/queue-store';
import { createLockFollower, elsewhere, mayEdit, resumeQueue, watchLockLifecycle, watchRunLifecycle } from '@/lib/studio/queue-sync';
import { queueView } from '@/lib/studio/queue-view';
import { showIfOrphaned } from '@/lib/studio/reload-banner';
import { disposeState, initState, setPatchFailed } from '@/lib/studio/state';
import { diagnoseUploadDialog } from '@/lib/studio/upload-dialog';
import { heldAcquire, sayOnce, USERSCRIPT_HERE, userscriptHere, userscriptWatch } from '@/lib/studio/userscript-here';

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
      clearInterval: (id) => clearInterval(id),
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
    // The copyright data (per channel; one writer, the background) and Studio's own API.
    stop.add(disposeClaimsStore); // first: a teardown while it loads drops what it loaded
    await loadClaimsData();
    if (ctx.isInvalid) return;
    // Studio's API for the copyright module (its own client: 30 s, the userscript's fetch had no
    // timeout; getCfg keeps 10 s, D22), and the queue's schedule avoids the channel's scheduled
    // videos (refreshChanSched, user.js 1899).
    const yt = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH, 30_000);
    stop.add(() => yt.dispose('extension reloaded'));
    stop.add(wireClaims((path, body) => yt('youtubei', path, body)));
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
    // The copyright module's pane is the side panel's Copyright tab now (D24): this tab sends it
    // the status card, the log lines and the lists to open, and runs the scans it asks for.
    const claims = createClaimsPage({ toast: (m) => ui.toast(m), refreshCfg: () => refreshCfg(readCfg) });
    setClaimsUi(claims.ui);
    stop.add(() => {
      claims.dispose();
      setClaimsUi(null);
    });
    onMessage('claims:view', () => claimsState());
    // A scan takes minutes: answer now, report through claims:state / claims:log / claims:show.
    onMessage('claims:scan', ({ data }) => void claims.scan(data));
    // The channel's worker lease and the automation lock for copyright jobs (D26), asked before
    // the first tick; then what the panel and the Auto-pilot alarm ask this tab to do (D25, D27).
    // While the Tampermonkey userscript is in the page (call 7) the lock is not asked for, and a
    // tab that held it lets it go: a step that changes pages waits, as it waits for another tab.
    const releaseClaims = () => void sendMessage('runner:release', 'claims').catch(() => {});
    const holdsClaims = () => sendMessage('runner:holds', 'claims');
    const sayUserscript = sayOnce((m) => ui.toast(m)); // one page toast per load, for the lock and the queue
    setClaimsLock({
      worker: (ch, force) => sendMessage('runner:worker', { ch, force }),
      acquire: heldAcquire(() => sendMessage('runner:acquire', 'claims'), userscriptHere, sayUserscript, releaseClaims, holdsClaims),
      release: releaseClaims,
      holds: holdsClaims,
    });
    await initClaimsLock();
    if (ctx.isInvalid) return;
    stop.add(installBackGuard());
    setCfgRefresh(() => refreshCfg(readCfg));
    stop.add(() => setCfgRefresh(async () => {}));
    setChannelSwitcher((t, next) => sw.switchToChannel(t, next));
    stop.add(installConfirmWatch());
    // A run asked from the panel is refused with the reason while the userscript is there.
    const unlessUserscript = <T,>(run: () => T) => (userscriptHere() ? void ui.toast(USERSCRIPT_HERE()) : run());
    onMessage('claims:trim', ({ data }) => unlessUserscript(() => trimFromPanel(data)));
    onMessage('claims:ads', ({ data }) => unlessUserscript(() => adsFromPanel(data)));
    onMessage('claims:collab', ({ data }) => unlessUserscript(() => collabFromPanel(data)));
    onMessage('claims:stop', () => stopAll());
    onMessage('claims:autopilot', ({ data }) => void autopilotDue(data).catch((e) => console.error('[ytup] autopilot nudge', e)));
    // The userscript's FAB: opens the side panel (needs the click's user gesture — see README), on
    // the running task's tab; while nothing runs, on the tab it shows (3294–3295).
    const fab = mountFab(() => ui.openDrawer(activityTab()));
    stop.add(() => fab.remove());
    // Filled now, not at the first tick: the first clamp to the window needs its real width.
    fab.update(fabModel());
    setPatchFailed(storeWriteFailed);
    stop.add(() => setPatchFailed(null));
    const releaseLock = () => void sendMessage('runner:release', 'queue').catch(() => {});
    // The lock is ours: whatever the cached flag says, no other tab runs. askLock rejects when
    // the message fails (watchLockLifecycle tells that from a refusal); acquireLock says no.
    const askLock = () => sendMessage('runner:acquire', 'queue').then((ok) => (ok && setOtherTabRuns(false), ok));
    const acquireLock = () => askLock().catch((e) => (console.error('[ytup] runner lock', e), false));
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
      acquire: askLock,
      running: () => running,
      abort: () => abortRun(new Error(L('มีแท็บ Studio อื่นกำลังอัปโหลดคิวหรือทำงานด้านลิขสิทธิ์อยู่', 'Another Studio tab is already running the queue or copyright work'))),
      stop: requestStop,
      toast: (m) => ui.toast(m),
    });
    const offRunLife = watchRunLifecycle(document, window, () => running, () => queue.find((i) => i.id === currentItemId())?.file.name ?? '');
    stop.add(() => {
      offLock();
      offRunLife();
      requestStop();
      void sendMessage('runner:release', 'all').catch(() => {});
    });
    stop.add(() => setOtherTabRuns(false));
    // The lock is asked about when the background says it changed, on coming back to the tab,
    // and every 30 s from the tick (queue-sync createLockFollower).
    const lockFollower = createLockFollower({ ask: elsewhere });
    onMessage('runner:changed', () => lockFollower.now());
    const refresh = () => { if (document.visibilityState === 'visible') lockFollower.now(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    stop.add(() => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    });
    await resumeQueue();

    onMessage('queue:add', ({ data: ids }) => handleQueueAdd(ids, mayEdit));
    // Not while the userscript is there: an error answer, so the panel shows no summary first.
    onMessage('queue:preflight', () => (userscriptHere() ? { error: USERSCRIPT_HERE() } : startSummary()));
    onMessage('queue:start', ({ data: seen }) => {
      if (userscriptHere()) return void ui.toast(USERSCRIPT_HERE());
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
    onMessage('queue:resume', async ({ data: id }) => {
      if (typeof id === 'string' && await mayEdit()) retryItem(id, true);
    });
    // Followed by a Start from the panel: held like one while the userscript is in the page.
    onMessage('queue:resumeAll', async () => {
      if (userscriptHere()) return ui.toast(USERSCRIPT_HERE()), 0;
      return await mayEdit() ? resumeDrafts() : 0;
    });
    onMessage('queue:remove', async ({ data: id }) => {
      if (typeof id === 'string' && await mayEdit()) removeItem(id);
    });
    onMessage('queue:clearAll', async () => {
      if (await mayEdit()) clearAll();
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
    stop.add(installDraftApply());
    installTitleMark();
    stop.add(() => setTitleMark(''));
    stop.add(installUnloadGuard());
    // The userscript appends its root after this script may have answered a first queue:view,
    // or taken a Start: the panel is told at once (its banner, QueueView.userscript), and a
    // queue found running with it there stops after its current video (userscript-here userscriptWatch).
    const watchUserscript = userscriptWatch({ running: () => running, stop: requestStop, said: sayUserscript, changed: () => ui.schedule() });
    // A queue paused at YouTube's daily limit goes on from here when its 24 hours are over
    // (queue-pause.ts); not while the userscript is in the page, as no run starts then.
    const pauseWatch = createPauseWatch({
      channelId: () => getChannel().id,
      pending: () => queue.filter((i) => i.status === 'pending').length,
      running: () => running || userscriptHere(),
      resume: () => resumeFromPause(ui).finally(elsewhere),
      toast: (m) => ui.toast(m),
    });
    ctx.setInterval(() => {
      lockFollower.tick();
      watchUserscript();
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
      try {
        claims.tick();
      } catch (e) {
        console.error('[ytup] copyright tick', e);
      }
      try {
        pauseWatch.tick();
      } catch (e) {
        console.error('[ytup] pause watch', e);
      }
      // Its own try too: a failing tick must not freeze the FAB, nor the FAB the tick. Said on
      // the page with the progress half, once for both (renderActivity() was in that half, 6375).
      try {
        fab.update(fabModel());
      } catch (e) {
        console.error('[ytup] fab', e);
        ui.progressFailed(e);
      }
    }, 800);
  },
});
