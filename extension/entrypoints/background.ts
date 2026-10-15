import '@/lib/debug-capture/background'; // FIRST: the debug page shows what goes wrong below
import { browser } from 'wxt/browser';
import { onMessage, sendMessage } from '@/lib/messages';
import { isStudioUrl } from '@/lib/panel-scope';
import { requestPanelTab } from '@/lib/panel-tab';
import { openFromAutopilotNote, registerAutopilotAlarms, syncAutopilotAlarms } from '@/lib/claims/alarms';
import { isChannelId } from '@/lib/claims/keys';
import { initI18n, watchLang } from '@/lib/i18n';
import { runMigrations } from '@/lib/migrations';
import { notifyQueueDone, openFromNotification } from '@/lib/notify';
import { acquireRunner, claimWorker, isJob, registerRunnerLock, releaseRunner, runnerElsewhere, RUNNER_HELD, runnerHeld, runnerHolds, studioTab } from '@/lib/runner-lock';
import { deleteFiles, sweepHandles } from '@/lib/file-gc';
import { registerTicks } from '@/lib/steady-tick';
import { claimsOpInOrder, ensureLang, mayWrite, patchStore, schemaVersionInOrder, writeBackupInOrder } from '@/lib/store-writer';
import { checkForUpdate, registerUpdateCheck } from '@/lib/update-check';

export default defineBackground(() => {
  // Language first: default preset labels written by migrations depend on it. Idempotent per schemaVersion.
  const ready = initI18n().then(runMigrations).then(ensureLang).catch((e) => console.error('[ytup] startup', e));
  watchLang();
  // A hidden Studio tab's invite watcher keeps its one-second pace on these ticks (lib/steady-tick.ts).
  registerTicks();

  // Toolbar icon opens the panel; the panel is off everywhere except Studio tabs.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  browser.sidePanel.setOptions({ enabled: false }).catch(console.error);

  const scope = (tabId: number, url?: string) =>
    browser.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: isStudioUrl(url) }).catch(console.error);

  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.url || info.status === 'complete') scope(tabId, tab.url);
    // A holder that left Studio or was discarded is cleaned up here, which is a change of the lock
    // ('complete' too: a move to a site the extension can't read carries no url).
    if (info.url || info.status === 'complete' || info.discarded) void runnerHeld().catch(() => {});
  });
  browser.tabs.query({}).then((tabs) => tabs.forEach((t) => t.id !== undefined && scope(t.id, t.url)));

  // open() is called first, with nothing awaited before it: it needs the click's user gesture.
  // The tab to show is stored whether a panel opens or not: one that is already open follows it.
  onMessage('openPanel', async ({ data, sender }) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const [opened, asked] = await Promise.allSettled([browser.sidePanel.open({ tabId }), requestPanelTab(tabId, data)]);
    if (asked.status === 'rejected') console.error('[ytup] panel tab request', asked.reason);
    if (opened.status === 'rejected') throw opened.reason;
  });

  // Content scripts read stored data only once it is in this build's shape.
  onMessage('ensureMigrated', async () => {
    await ready;
    return schemaVersionInOrder();
  });

  // The one writer of settings and counters (lib/store-writer.ts).
  // Only the side panel and Studio tabs patch; only the panel imports (store-writer mayWrite).
  const ext = browser.runtime.getURL('/');
  onMessage('store:patch', async ({ data, sender }) => {
    if (!mayWrite('store:patch', sender, ext)) throw new Error('store:patch: not allowed from this sender');
    await ready;
    await patchStore(data);
  });
  onMessage('backup:write', async ({ data, sender }) => {
    if (!mayWrite('backup:write', sender, ext)) throw new Error('backup:write: not allowed from this sender');
    await ready;
    if (await runnerHeld()) throw new Error(RUNNER_HELD); // the panel checked too; a run may have started since
    await writeBackupInOrder(data);
  });
  onMessage('claims:op', async ({ data, sender }) => {
    if (!mayWrite('claims:op', sender, ext)) throw new Error('claims:op: not allowed from this sender');
    await ready;
    await claimsOpInOrder(data);
  });

  // The page has no access to the extension's IndexedDB; it asks here to forget handles.
  onMessage('files:delete', ({ data: ids, sender }) => deleteFiles(ids, sender, ext));
  // Handles that no queue item uses (an add cut short): swept once per browser start.
  browser.runtime.onStartup.addListener(() => {
    void ready.then(() => sweepHandles()).catch((e) => console.error('[ytup] handle sweep', e));
  });

  onMessage('notify', async ({ data, sender }) => {
    await notifyQueueDone(data, sender.tab);
  });
  browser.notifications.onClicked.addListener((id) => void openFromNotification(id));
  browser.notifications.onClicked.addListener((id) => void openFromAutopilotNote(id).catch((e) => console.error('[ytup] autopilot note', e)));

  // One Studio tab drives Studio at a time (the queue or a copyright job), and one tab per
  // channel is its copyright worker (D21).
  const tabOf = (sender: { tab?: { id?: number } }) => {
    if (sender.tab?.id === undefined) throw new Error('runner lock: not sent from a tab');
    return sender.tab.id;
  };
  // Taking the lock or a worker lease: a Studio tab only (any other sender is refused).
  onMessage('runner:acquire', async ({ data, sender }) => {
    const id = studioTab(sender);
    return id !== null && acquireRunner(id, isJob(data) ? data : 'queue');
  });
  onMessage('runner:release', ({ data, sender }) => releaseRunner(tabOf(sender), isJob(data) ? data : 'all'));
  onMessage('runner:elsewhere', ({ data, sender }) => runnerElsewhere(tabOf(sender), isJob(data) ? data : 'any'));
  onMessage('runner:holds', ({ data, sender }) => runnerHolds(tabOf(sender), isJob(data) ? data : 'queue'));
  onMessage('runner:worker', async ({ data, sender }) => {
    const d = data as { ch?: unknown; force?: unknown } | null;
    if (!isChannelId(d?.ch)) throw new Error('runner:worker: malformed');
    const id = studioTab(sender);
    return id !== null && claimWorker(id, d.ch, d.force === true);
  });
  // The lock moved: every Studio tab asks again (they no longer poll for it). It only sends: a
  // write to the lock from here would come back as another change. A tab with no script rejects.
  const tellStudioTabs = async () => {
    for (const t of await browser.tabs.query({}).catch(() => [])) {
      if (t.id !== undefined && isStudioUrl(t.url)) void sendMessage('runner:changed', undefined, t.id).catch(() => {});
    }
  };
  registerRunnerLock(() => void tellStudioTabs());

  // Auto-pilot: one alarm per channel wakes its worker tab (D25).
  registerAutopilotAlarms();
  void ready.then(() => syncAutopilotAlarms()).catch((e) => console.error('[ytup] autopilot alarms', e));

  // Update check (spec "Background"): a daily alarm, and each time the service worker starts
  // (which is many times a day; lib/update-check.ts lets one request through in 23 h).
  registerUpdateCheck();
  void ready.then(() => checkForUpdate()).catch((e) => console.warn('[ytup] update check', e));
});
