import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'wxt';

// The panel's, the debug page's and the allow page's entry script is render-blocking (blocking="render", Chrome
// 105+), so lib/theme.ts sets a stored light theme before the first paint, not one frame after
// the empty page painted with the dark defaults. Vite rewrites the entry <script type="module">
// and drops the attribute from index.html, so it goes on the built tag here.
export const renderBlocking = (): Plugin => ({
  name: 'ytup-render-blocking-entry',
  transformIndexHtml: {
    order: 'post',
    handler: (html, { filename }) =>
      /[\\/]entrypoints[\\/](sidepanel|debug|allow)[\\/]index\.html$/.test(filename)
        ? html.replace(/<script type="module" crossorigin src=/g, '<script type="module" blocking="render" crossorigin src=')
        : html,
  },
});

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss(), renderBlocking()] }),
  manifest: {
    // The public half of the owner's key: it fixes the extension's id
    // (cllefnlbgkbdnmifojjflfcpholhniio) on every computer and for every folder. The private
    // half is the owner's and is not in the repo.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuZWTgj9Of6ONn3LX2oWrIhI4RKmrVtn7iEISokkfANJnjUY1J8YSKEI63J/SBKxvTOY9BAcdd3dECHvufjTROxImUQOoQDedClxTkKXHHD1GYt3j1DEoAn7jgRZeW5q/1hDy8XE7NUAbTD2UskXRNMbbsj5KLzCUdIoD+VmjPwYyi33H+O0zSGusBLUhopVm2zsZFYMdE1A0Ro38c8r2sD7pHGgLf3CuFGXKeQe7YwRBuonmSIyMoGBhd8M0DXExSU+4Mx1ItIjAbZHz460sWkl4+HaHfUBRhTJVPd7Y2DN6nB0P+gPt6cdCYpsF+ZjCrOZ2jPOnk4b/hqOHoAQwfQIDAQAB',
    name: 'YouTube Upload Presets',
    description: 'Bulk-upload videos to YouTube Studio with presets and scheduling, plus scan and trim copyright-claimed segments',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'],
    host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
    action: { default_title: 'YouTube Upload Presets' },
    // Alt+P opens the side panel on a Studio tab (the userscript's Alt+P; it can't close it). The
    // panel is disabled on other tabs, so the key does nothing there.
    commands: { _execute_action: { suggested_key: { default: 'Alt+P' } } },
    web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
  },
});
