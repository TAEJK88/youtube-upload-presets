import { browser } from 'wxt/browser';
import { onMessage } from '@/lib/messages';
import { isStudioUrl } from '@/lib/panel-scope';
import { initI18n } from '@/lib/i18n';
import { runMigrations } from '@/lib/migrations';
import { notifyQueueDone, openFromNotification } from '@/lib/notify';
import { acquireRunner, releaseRunner, runnerElsewhere } from '@/lib/runner-lock';
import { load } from '@/lib/storage';
import { deleteHandle } from '@/lib/file-store';

export default defineBackground(() => {
  // Language first: default preset labels written by migrations depend on it. Idempotent per schemaVersion.
  const ready = initI18n().then(runMigrations).catch((e) => console.error('[ytup] startup', e));

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
    return load('schemaVersion', 0);
  });

  // The page has no access to the extension's IndexedDB; it asks here to forget handles.
  onMessage('files:delete', async ({ data: ids }) => {
    for (const id of ids) await deleteHandle(id);
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
  browser.tabs.onRemoved.addListener((tabId) => void releaseRunner(tabId));
});
