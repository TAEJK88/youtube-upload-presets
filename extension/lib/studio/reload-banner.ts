import { L } from '../i18n';
import { h, icon } from './dom';

// After the extension is updated or reloaded, the content script in an open Studio tab is
// orphaned (spec: Error handling): say so at the top of the page, with the one fix.
const CSS = `
.bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100003;display:flex;align-items:center;gap:10px;
  background:#0f0f12;color:#f4f4f5;border:1px solid rgba(251,191,36,.45);border-radius:14px;padding:9px 10px 9px 14px;
  box-shadow:0 16px 40px -10px rgba(0,0,0,.6);font:13px/1.4 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif}
.bar .ic{color:#fbbf24;flex:0 0 auto}
button{font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:10px;padding:6px 12px;background:#f4f4f5;color:#0b0b0c}`;

export function showReloadBanner(reload: () => void = () => location.reload()): HTMLElement {
  document.querySelector('#ytup-reload')?.remove();
  const host = h('div', { id: 'ytup-reload' });
  host.attachShadow({ mode: 'open' }).append(
    h('style', {}, CSS),
    h('div', { className: 'bar', role: 'alert' },
      icon('sync', 16),
      h('span', {}, L('ส่วนขยายถูกอัปเดตหรือโหลดใหม่ — โหลดแท็บนี้ใหม่เพื่อใช้งานต่อ', 'The extension was updated or reloaded — reload this tab to keep using it')),
      h('button', { onclick: reload }, L('โหลดแท็บนี้ใหม่', 'Reload this tab'))),
  );
  document.documentElement.append(host);
  return host;
}

// Only when the extension context is gone (runtime.id unset). WXT also invalidates this
// instance when a newer one starts in the page (dev reloads); that one works, so no banner.
export function showIfOrphaned(runtime: { id?: string } | undefined): void {
  if (runtime?.id == null) showReloadBanner();
}
