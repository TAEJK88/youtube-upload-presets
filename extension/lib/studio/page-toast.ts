import { h, icon } from './dom';

// The userscript's toast (UI section: toast() + its .toast CSS), as a shadow-DOM island
// on Studio so messages from page features show even with the side panel closed.
const CSS = `
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);opacity:0;z-index:100002;display:flex;gap:10px;align-items:center;
  background:#111116;color:#f2f2f6;padding:11px 16px;border-radius:12px;border:1px solid #2a2a33;
  box-shadow:0 16px 40px -10px rgba(0,0,0,.6);transition:.22s cubic-bezier(.2,.8,.2,1);max-width:min(560px,90vw);pointer-events:none;
  font:13px/1.5 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif;letter-spacing:.005em}
.toast .ti{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;flex:0 0 auto;
  background:linear-gradient(135deg,#ff2d55,#ff6a3d);color:#fff}
.toast .ic{flex:0 0 auto;display:block}
.toast.show{opacity:1;transform:translate(-50%,0)}`;

let el: { box: HTMLElement; text: HTMLElement } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function mount() {
  const host = h('div', { id: 'ytup-toast' });
  const text = h('span');
  const box = h('div', { className: 'toast' }, h('span', { className: 'ti' }, icon('check', 13)), text);
  host.attachShadow({ mode: 'open' }).append(h('style', {}, CSS), box);
  document.documentElement.append(host);
  return { box, text };
}

export function pageToast(msg: string): void {
  if (!el?.box.isConnected) el = mount();
  const { box, text } = el;
  text.textContent = msg;
  box.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => box.classList.remove('show'), 3800);
}
