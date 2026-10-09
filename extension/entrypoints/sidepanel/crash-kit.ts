import { browser } from 'wxt/browser';
import { errorText, type LogCtx } from '@/lib/debug-log';
import { L } from '@/lib/i18n';

// What the crash guard (crash-guard.ts), the RootBoundary and PaneBoundary share: the
// stage main.tsx reached, the fallback, its strings and buttons. No side effects here, so
// importing a boundary doesn't install the guard.
export type Stage = 'start' | 'migrating' | 'i18n' | 'render' | 'ready';
export const WATCHDOG_MS = 8000;
export const ID = 'ytup-crash';

let stageNow: Stage = 'start';

export const currentStage = () => stageNow;
export const resetStage = () => { stageNow = 'start'; };
export function stage(s: Stage): void {
  stageNow = s;
  // The panel came up after all (late background): an earlier fallback no longer applies.
  if (s === 'ready') document.getElementById(ID)?.remove();
}

export const ctx: LogCtx = typeof location !== 'undefined' && location.pathname.endsWith('/debug.html') ? 'debug' : 'panel';

const version = () => {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return '?';
  }
};

// What "Copy details" copies (also used by the React RootBoundary).
export function crashDetails(e: unknown, at: Stage = stageNow, now = new Date()): string {
  return [
    `YouTube Upload Presets — ${ctx}`,
    `Version: ${version()}`,
    `Time: ${now.toISOString()}`,
    `Stage: ${at}`,
    `URL: ${typeof location !== 'undefined' ? location.href : ''}`,
    `User agent: ${navigator.userAgent}`,
    '',
    errorDetail(e),
  ].join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function openDebugPage(): void {
  void Promise.resolve()
    .then(() => browser.tabs.create({ url: browser.runtime.getURL('/debug.html') }))
    .catch((e) => console.error('[ytup] open debug page', e));
}

export const reloadPage = () => location.reload();

export const crashHeading = () => L('ส่วนขยายเกิดข้อผิดพลาด', 'The extension hit an error');
export const stageLine = (s: Stage) => L(`ขั้นล่าสุด: ${s}`, `Last stage: ${s}`);
export const crashButtons = () => ({
  copy: L('คัดลอกรายละเอียด', 'Copy details'),
  copied: L('คัดลอกแล้ว', 'Copied'),
  debug: L('เปิดหน้าดีบัก', 'Open debug page'),
  reload: L('โหลดแผงใหม่', 'Reload panel'),
});
export function stuckLine(s: Stage): string {
  if (s === 'migrating') return L('แผงไม่เริ่มทำงาน: ยังรอเบื้องหลังอยู่ (ensureMigrated)…', "The panel didn't start: still waiting for the background (ensureMigrated)…");
  return L(`แผงไม่เริ่มทำงาน: ค้างอยู่ที่ขั้น ${s}`, `The panel didn't start: stuck at stage ${s}`);
}

const dark = () => {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
};

// Plain DOM: readable without the stylesheet, in light and dark.
export function render(heading: string, detail: string, copyWhat: string): void {
  const d = dark();
  const fg = d ? '#f2f2f2' : '#111111';
  const bg = d ? '#0b0b0c' : '#ffffff';
  const line = d ? '#3a3a3e' : '#cccccc';
  document.getElementById(ID)?.remove();
  const box = document.createElement('div');
  box.id = ID;
  box.setAttribute('role', 'alert');
  box.style.cssText = `position:fixed;inset:0;z-index:2147483647;overflow:auto;box-sizing:border-box;padding:16px;background:${bg};color:${fg};font:13px/1.5 system-ui,sans-serif`;
  const h = document.createElement('h1');
  h.textContent = heading;
  h.style.cssText = 'margin:0 0 8px;font-size:16px;font-weight:600';
  const p = document.createElement('p');
  p.textContent = stageLine(stageNow);
  p.style.cssText = 'margin:0 0 8px;font-size:13px';
  const pre = document.createElement('pre');
  pre.textContent = detail;
  pre.style.cssText = `margin:0 0 12px;padding:8px;border:1px solid ${line};border-radius:8px;white-space:pre-wrap;word-break:break-word;user-select:text;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace`;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
  const b = crashButtons();
  const button = (label: string, onClick: (el: HTMLButtonElement) => void) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.style.cssText = `padding:6px 12px;border:1px solid ${line};border-radius:8px;background:transparent;color:${fg};font:600 13px system-ui,sans-serif;cursor:pointer`;
    el.addEventListener('click', () => onClick(el));
    row.append(el);
  };
  button(b.copy, (el) => {
    void copyText(copyWhat).then((ok) => {
      if (ok) el.textContent = b.copied;
    });
  });
  button(b.debug, () => openDebugPage());
  button(b.reload, () => reloadPage());
  box.append(h, p, pre, row);
  document.body.append(box);
}

export const rootEmpty = () => !document.getElementById('root')?.hasChildNodes();

// The message, then the stack (which usually starts with the message already).
export function errorDetail(e: unknown): string {
  const { msg, stack } = errorText(e);
  return stack && !stack.includes(msg) ? `${msg}\n${stack}` : stack ?? msg;
}

// main() rejected: show it, whatever #root holds.
export function failStartup(e: unknown): void {
  console.error('[ytup] panel startup failed', e);
  render(crashHeading(), errorDetail(e), crashDetails(e));
}

// An uncaught error: shown when the panel is (or, after React unmounts it, becomes) empty.
export function uncaught(e: unknown): void {
  setTimeout(() => {
    if (!rootEmpty()) return;
    render(crashHeading(), errorDetail(e), crashDetails(e));
  }, 0);
}

