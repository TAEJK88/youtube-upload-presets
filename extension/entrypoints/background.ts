import { browser } from 'wxt/browser';
import { installDebugCapture } from '@/lib/debug-log';
import { onMessage } from '@/lib/messages';
import { isStudioUrl } from '@/lib/panel-scope';
import { initI18n, watchLang } from '@/lib/i18n';
import { runMigrations } from '@/lib/migrations';
import { notifyQueueDone, openFromNotification } from '@/lib/notify';
import { acquireRunner, registerRunnerLock, releaseRunner, runnerElsewhere, RUNNER_HELD, runnerHeld } from '@/lib/runner-lock';
import { deleteFiles, sweepHandles } from '@/lib/file-gc';
import { ensureLang, mayWrite, patchStore, schemaVersionInOrder, writeBackupInOrder } from '@/lib/store-writer';

export default defineBackground(() => {
  installDebugCapture('background', { target: self }); // first: the debug page shows what goes wrong below
  // Language first: default preset labels written by migrations depend on it. Idempotent per schemaVersion.
  const ready = initI18n().then(runMigrations).then(ensureLang).catch((e) => console.error('[ytup] startup', e));
  watchLang();

  // Toolbar icon opens the panel; the panel is off everywhere except Studio tabs.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  browser.sidePanel.setOptions({ enabled: false }).catch(console.error);

  const scope = (tabId: number, url?: string) =>
    browser.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: isStudioUrl(url) }).catch(console.error);

  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.url || info.status === 'complete') scope(tabId, tab.url);
  });
  browser.tabs.query({}).then((tabs) => tabs.forEach((t) => t.id !== undefined && scope(t.id, t.url)));

  onMessage('openPanel', async ({ sender }) => {
    if (sender.tab?.id !== undefined) await browser.sidePanel.open({ tabId: sender.tab.id });
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

  // One Studio tab runs the queue at a time.
  const tabOf = (sender: { tab?: { id?: number } }) => {
    if (sender.tab?.id === undefined) throw new Error('runner lock: not sent from a tab');
    return sender.tab.id;
  };
  onMessage('runner:acquire', ({ sender }) => acquireRunner(tabOf(sender)));
  onMessage('runner:release', ({ sender }) => releaseRunner(tabOf(sender)));
  onMessage('runner:elsewhere', ({ sender }) => runnerElsewhere(tabOf(sender)));
  registerRunnerLock();
});
