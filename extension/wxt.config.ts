import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YouTube Upload Presets',
    description: 'Bulk-upload videos to YouTube Studio with presets and scheduling, plus scan and trim copyright-claimed segments',
    permissions: ['sidePanel', 'storage', 'alarms', 'notifications'],
    host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
    action: { default_title: 'YouTube Upload Presets' },
    web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
  },
});
