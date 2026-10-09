import { activityFrom, emojiIconName, type Activity } from '../activity';
import { L } from '../i18n';
import { h, icon } from './dom';
import { queue, running, uploadProg } from './queue-runner';
import { channelView } from './queue-view';
import { active, load, save, settings } from './state';

// The userscript's floating button (UI section 3288–3300, drag 3453–3486, badge 4119–4135)
// as a Shadow DOM island: the channel and the default preset, what is running, drag to move
// (kept in 'fabPos'), click to open the side panel. Design B glass, as the drawer's FAB.
const CSS = `
.fab{position:fixed;right:18px;bottom:18px;touch-action:none;z-index:100001;display:flex;align-items:center;gap:10px;
  background:rgba(12,12,14,.82);-webkit-backdrop-filter:blur(26px) saturate(150%);backdrop-filter:blur(26px) saturate(150%);
  color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:8px 14px 8px 8px;cursor:pointer;text-align:left;
  box-shadow:0 12px 32px -10px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .15s,box-shadow .15s;
  font:13px/1.25 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif;font-feature-settings:"tnum" 1}
.fab:hover{transform:translateY(-2px)}
.fab.moving{cursor:grabbing;transition:none;transform:none}
.fab.bad{border-color:#f87171;box-shadow:0 0 0 3px rgba(244,63,94,.35),0 10px 30px -6px rgba(0,0,0,.45)}
.fab.busy{background-image:linear-gradient(90deg,#f4f4f5 calc(var(--p,0) * 1%),#2a2a33 0);background-repeat:no-repeat;
  background-size:calc(100% - 16px) 3px;background-position:8px calc(100% - 5px)}
.logo{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#f4f4f5;color:#0b0b0c;flex:0 0 auto}
.fcol{display:flex;flex-direction:column;min-width:0;max-width:220px}
.fch{font-size:12px;color:#a3a3b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fab.bad .fch{color:#fda4af}
.fch .ic{display:inline-block;vertical-align:-1px}
.fpr{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{display:inline-flex;align-items:center;gap:3px;background:#f4f4f5;color:#0b0b0c;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}
.badge[hidden]{display:none}
.ic{flex:0 0 auto;display:block}`;

// The userscript's emojiIcon(): the activity's icon, or the text when it has none.
const emojiIcon = (e: string): Node => {
  const name = emojiIconName(e);
  return name ? icon(name, 12) : document.createTextNode(e);
};

export interface FabModel {
  channel: string;
  problem: string;
  locked: boolean;
  preset: string;
  activity: Activity | null;
  pending: number;
  total: number;
}

// What the FAB shows, from the page's live state (the 800 ms tick calls this).
export function fabModel(): FabModel {
  const c = channelView();
  const count = (s: string) => queue.filter((i) => i.status === s).length;
  const activity = activityFrom(
    { running, inFlight: queue.some((i) => i.status === 'uploading' || i.status === 'review'), total: queue.length, done: count('done'), errors: count('error') },
    null,
    uploadProg,
  );
  return { channel: c.label, problem: c.problem, locked: !!settings.lockChannel, preset: active()?.label ?? '', activity, pending: count('pending'), total: queue.length };
}

export function mountFab(open: () => void): { update(m: FabModel): void; remove(): void } {
  document.querySelector('#ytup-fab')?.remove(); // left by an earlier instance (extension reloaded)
  const host = h('div', { id: 'ytup-fab' });
  const chan = h('span', { className: 'fch' });
  const label = h('span', { className: 'fpr' });
  const badge = h('span', { className: 'badge', hidden: true });
  let dragged = false;
  const fab = h('button', {
    className: 'fab',
    // As in the userscript: the hint is the first title, until update() puts the channel
    // there. The accessible name is the content: channel, preset and progress.
    title: L('คลิกเพื่อเปิดแผง · ลากเพื่อย้ายตำแหน่ง', 'Click to open · drag to move'),
    onclick: () => { if (!dragged) open(); },
  }, h('span', { className: 'logo' }, icon('cloud', 18)), h('span', { className: 'fcol' }, chan, label), badge);

  // Kept as distances from the right / bottom edge, so it stays in its corner when the window resizes.
  const place = (pos: { r: number; b: number } | null) => {
    if (!pos) { fab.style.right = fab.style.bottom = ''; return; }
    const w = fab.offsetWidth || 180, hgt = fab.offsetHeight || 52;
    fab.style.right = Math.min(Math.max(4, pos.r), Math.max(4, innerWidth - w - 4)) + 'px';
    fab.style.bottom = Math.min(Math.max(4, pos.b), Math.max(4, innerHeight - hgt - 4)) + 'px';
  };
  fab.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    const r0 = fab.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    dragged = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      fab.classList.add('moving');
      place({ r: innerWidth - r0.right - dx, b: innerHeight - r0.bottom - dy });
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      fab.classList.remove('moving');
      if (!moved) return;
      dragged = true; // the release after a drag is not a click
      setTimeout(() => { dragged = false; }, 0);
      save('fabPos', { r: parseFloat(fab.style.right), b: parseFloat(fab.style.bottom) });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  fab.addEventListener('dblclick', (e) => e.preventDefault());
  const onResize = () => place(load('fabPos', null));
  addEventListener('resize', onResize);
  host.attachShadow({ mode: 'open' }).append(h('style', {}, CSS), fab);
  document.documentElement.append(host);
  setTimeout(onResize, 0);

  let last = '';
  return {
    update(m) {
      const sig = JSON.stringify(m);
      if (sig === last) return;
      last = sig;
      chan.replaceChildren(...(m.problem ? [icon('alert', 11), ' '] : m.locked ? [icon('lock', 11), ' '] : []), m.channel);
      label.textContent = m.preset;
      fab.classList.toggle('bad', !!m.problem);
      fab.title = m.problem || L(`ช่องปัจจุบัน: ${m.channel}`, `Current channel: ${m.channel}`);
      // Busy: icon + percentage and a progress line along the bottom; idle: the count waiting.
      const a = m.activity;
      const pct = a && a.progress !== null ? Math.round(a.progress * 100) : null;
      fab.classList.toggle('busy', !!a && pct !== null);
      fab.style.setProperty('--p', String(pct ?? 0));
      badge.hidden = !a && !m.total;
      if (a) badge.replaceChildren(emojiIcon(a.icon), ...(pct === null ? [] : [` ${pct}%`]));
      else badge.textContent = String(m.pending || m.total);
    },
    remove() {
      removeEventListener('resize', onResize);
      host.remove();
    },
  };
}
