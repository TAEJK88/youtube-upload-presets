import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'YouTube Upload Presets',
    description: 'Bulk-upload videos to YouTube Studio with presets and scheduling, plus scan and trim copyright-claimed segments',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'],
    host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
    action: { default_title: 'YouTube Upload Presets' },
    // Alt+P opens the side panel from anywhere in Chrome (the userscript's Alt+P; it can't close it).
    commands: { _execute_action: { suggested_key: { default: 'Alt+P' } } },
    web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
  },
});
