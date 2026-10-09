import { browser } from 'wxt/browser';
import { onMessage } from '@/lib/messages';
import { isStudioUrl } from '@/lib/panel-scope';
import { initI18n } from '@/lib/i18n';
import { runMigrations } from '@/lib/migrations';

export default defineBackground(() => {
  // Language first: default preset labels written by migrations depend on it. Idempotent per schemaVersion.
  initI18n().then(runMigrations).catch((e) => console.error('[ytup] startup', e));

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
});
