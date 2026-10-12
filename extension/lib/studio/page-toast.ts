import { h, icon } from './dom';

// The userscript's toast (UI section: toast() + its .toast CSS), as a shadow-DOM island
// on Studio so messages from page features show even with the side panel closed.
// The look is the one the drawer ended with: the base rules (2813–2818) under its black
// layer (2968 white tick) and its glass layer (3084, at the default 82 % opacity), with what
// it took from the drawer's root: border-box (2545), smoothed text (2539), letter-spacing 0
// and tabular figures (3177).
const CSS = `
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);opacity:0;z-index:100002;display:flex;gap:10px;align-items:center;
  background:rgba(12,12,14,.82);-webkit-backdrop-filter:blur(26px) saturate(150%);backdrop-filter:blur(26px) saturate(150%);
  color:#f2f2f6;padding:11px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
  box-shadow:0 16px 40px -10px rgba(0,0,0,.6);transition:.22s cubic-bezier(.2,.8,.2,1);max-width:min(560px,90vw);box-sizing:border-box;pointer-events:none;
  font:13px/1.5 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif;letter-spacing:0;font-feature-settings:"tnum" 1;
  -webkit-font-smoothing:antialiased}
.toast .ti{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;flex:0 0 auto;
  background:#f4f4f5;color:#0b0b0c}
.toast .ic{flex:0 0 auto;display:block}
.toast.show{opacity:1;transform:translate(-50%,0)}`;

let el: { box: HTMLElement; text: HTMLElement } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function mount() {
  // A host left by an earlier instance of this script (extension reloaded under the page).
  document.querySelector('#ytup-toast')?.remove();
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
