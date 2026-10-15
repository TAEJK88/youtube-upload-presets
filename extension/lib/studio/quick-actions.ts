import { checkTracklist, fixChapters } from '../chapters';
import { normText } from '../collab';
import { DESC_MAX, TITLE_MAX } from '../constants';
import { L } from '../i18n';
import { makeTitle, renderDesc, renderTags } from '../template';
import { fillDetails, getDescBox, getDetailsHost, getDialog, getTitleBox, isVisible, onEditPage, setEditable, setTags } from './automation';
import { buildVars } from './channel';
import { h, icon } from './dom';
import { session } from './manual-fill';
import { readText, running, uploadOf } from './queue-runner';
import { activeId, counters, presetById, presets, settings } from './state';

// ===== ปุ่มลัดใต้ช่องชื่อ/คำอธิบายของ Studio (หน้าต่างอัปโหลด และหน้าแก้ไขคลิป /video/<id>/edit) =====
// วางแถบเล็ก ๆ ต่อจาก ytcp-video-title / ytcp-video-description · Studio วาดหน้าใหม่เมื่อไรก็ใส่กลับเอง
// ไม่กด Save ของ YouTube ให้ — แก้แล้วผู้ใช้ตรวจแล้วกดเอง (Ctrl+Z ย้อนได้เหมือนพิมพ์เอง)
const qa = { presetId: '', txt: '', txtName: '', key: '' };
const qaPreset = () => presetById(qa.presetId || activeId);
// ชื่อไฟล์คลิป (ใช้กับ {name}/{filename}): ส่วน "Filename" ทางขวา → ชื่อตอนเปิดหน้าต่างอัปโหลด → ชื่อคลิปปัจจุบัน
function qaFileName(host: HTMLElement) {
  // หน้าแก้ไขคลิป: ytcp-video-info อยู่คอลัมน์ขวา นอก ytcp-video-details-section -> หาทั้งหน้า
  const info = host && host === getDialog() ? host : document;
  const leaf = [...info.querySelectorAll('ytcp-video-info *')].find((e) => !e.children.length && /\.[a-z0-9]{2,4}$/i.test(e.textContent.trim()));
  return (leaf && leaf.textContent.trim()) || (session && session.originalName) || normText(getTitleBox(host)?.textContent);
}
// เคยเป็นบั๊ก: ไม่ได้ใส่ .txt -> {txt} ว่าง -> กด "คำอธิบายจากพรีเซ็ต" ในคลิปที่อัปแล้ว tracklist เดิมหายทั้งก้อน
// ตอนนี้ใช้ tracklist ที่มีอยู่แทน: .txt ที่ใส่ไว้ → ประวัติการอัปของคลิปนี้ → บรรทัดที่มี timestamp ในคำอธิบายปัจจุบัน
function qaTracklist(host: HTMLElement) {
  if (qa.txt) return { txt: qa.txt, from: 'txt' };
  const vid = (location.pathname.match(/\/video\/([\w-]{11})/) || [])[1];
  const up = vid && uploadOf(vid);
  if (up && up.txt) return { txt: up.txt, from: 'history' };
  const lines = (getDescBox(host)?.innerText || '').split('\n')
    .filter((l) => /^\s*[[(]?(?:\d{1,2}:)?\d{1,3}:\d{1,2}\b/.test(l));
  return { txt: lines.join('\n'), from: lines.length ? 'desc' : '' };
}
function qaVars(host: HTMLElement) {
  const p = qaPreset();
  const n = (session && session.n) || (counters[p.id] || 0) + 1; // ปุ่มลัดไม่เลื่อนเลข EP เอง
  return buildVars(qaFileName(host), n, qaTracklist(host).txt, { preset: p });
}
function qaSay(bar: HTMLElement & { _t?: ReturnType<typeof setTimeout> }, text: string, kind = '', undo: (() => void) | null = null) {
  const st = bar.querySelector('.st')!;
  st.className = 'st ' + kind;
  st.replaceChildren(text, ...(undo ? [' ', h('button', { type: 'button', className: 'undo', onclick: () => { undo(); st.replaceChildren(L('ย้อนกลับแล้ว', 'Reverted')); } }, L('ย้อนกลับ', 'Undo'))] : []));
  clearTimeout(bar._t);
  // มีปุ่มย้อนกลับ: ค้างไว้นานขึ้นให้ทันกด
  if (kind !== 'err' && kind !== 'warn') bar._t = setTimeout(() => { st.textContent = ''; }, undo ? 20000 : 5000);
}
// เขียนลงช่องของ Studio แล้วคืนฟังก์ชันย้อนกลับ (ใส่ข้อความเดิมคืน)
function qaWrite(box: HTMLElement | null, text: string) {
  if (!box) return null;
  const before = box.innerText;
  setEditable(box, text);
  return () => setEditable(box, before);
}
function qaCheck(bar: HTMLElement, host: HTMLElement) {
  const text = getDescBox(host)?.innerText || '';
  const tc = checkTracklist(text.slice(0, DESC_MAX), text.length, 0);
  if (tc.errors.length) qaSay(bar, L(`Chapters: ${tc.errors.length} ปัญหา — ${tc.errors[0]}`, `Chapters: ${tc.errors.length} problem(s) — ${tc.errors[0]}`), 'err');
  else if (!tc.count) qaSay(bar, L('ไม่มี timestamp — YouTube จะไม่สร้าง Chapters', 'No timestamps — YouTube won\'t create chapters'), 'warn');
  else qaSay(bar, L(`Chapters ${tc.count} ช่วง ผ่านกฎของ YouTube`, `${tc.count} chapters pass YouTube's rules`) + (tc.warnings.length ? ' · ' + tc.warnings[0] : ''), tc.warnings.length ? 'warn' : 'ok');
}
const qaBtn = (ic: string, label: string, title: string, onclick: () => void) => h('button', { type: 'button', className: 'qb', title, onclick }, icon(ic, 15), label);

function qaTitleBar(host: HTMLElement) {
  const sel = h('select', { title: L('พรีเซ็ตที่ใช้กับปุ่มลัด', 'Preset used by the quick actions'), onchange: (e: any) => { qa.presetId = e.target.value; } },
    presets.map((p, i) => h('option', { value: p.id, selected: p.id === qaPreset().id }, `${i + 1}. ${p.label}`)));
  const bar = h('div', { className: 'ytp-qa' },
    sel,
    qaBtn('refresh', L('ชื่อจากพรีเซ็ต', 'Preset title'), L('แทนชื่อคลิปด้วยชื่อที่สร้างจากพรีเซ็ต', 'Replace the title with one built from the preset'), () => {
      const t = makeTitle(qaPreset(), qaVars(host));
      const undo = qaWrite(getTitleBox(host), t);
      qaSay(bar, L(`ใส่ชื่อแล้ว (${t.length}/100)`, `Title set (${t.length}/100)`), t.length > TITLE_MAX ? 'err' : 'ok', undo);
    }),
    qaBtn('copy', L('คัดลอก', 'Copy'), L('คัดลอกชื่อคลิป', 'Copy the title'), () => {
      void navigator.clipboard.writeText(normText(getTitleBox(host)?.textContent)).catch(() => {});
      qaSay(bar, L('คัดลอกชื่อแล้ว', 'Title copied'), 'ok');
    }),
    h('span', { className: 'st' }));
  return bar;
}

function qaDescBar(host: HTMLElement) {
  const txtIn = h('input', { type: 'file', accept: '.txt,text/plain', hidden: true, onchange: async (e: any) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    qa.txt = await readText(f);
    qa.txtName = f.name;
    const p = qaPreset();
    const vars = qaVars(host);
    setEditable(getDescBox(host)!, renderDesc(p, vars));
    // ชื่อที่ใช้ตัวแปรจาก tracklist ({artists} ฯลฯ) ต้องสร้างใหม่ด้วย ไม่งั้นชื่อกับคำอธิบายไม่ตรงกัน
    if (/\{(artists|track1|trackcount)\}/.test(p.title)) setEditable(getTitleBox(host)!, makeTitle(p, vars));
    qaCheck(bar, host);
  } });
  const bar = h('div', { className: 'ytp-qa' },
    qaBtn('file', L('คำอธิบายจากพรีเซ็ต', 'Preset description'), L('แทนคำอธิบายด้วยของพรีเซ็ต (ใช้ tracklist จาก .txt ที่ใส่ไว้)', 'Replace the description with the preset\'s (uses the loaded .txt tracklist)'), () => {
      const tl = qaTracklist(host);
      const undo = qaWrite(getDescBox(host), renderDesc(qaPreset(), qaVars(host)));
      qaCheck(bar, host);
      const src = { txt: L('จาก .txt', 'from .txt'), history: L('จากประวัติการอัป', 'from upload history'), desc: L('จากคำอธิบายเดิม', 'kept from the old description') }[tl.from];
      qaSay(bar, (src ? L(`ใส่คำอธิบายแล้ว · tracklist ${src}`, `Description set · tracklist ${src}`) : L('ใส่คำอธิบายแล้ว · ไม่มี tracklist', 'Description set · no tracklist')), src ? 'ok' : 'warn', undo);
    }),
    qaBtn('clip', L('ใส่ .txt', 'Load .txt'), L('เลือกไฟล์ tracklist .txt แล้วสร้างคำอธิบายใหม่', 'Pick a tracklist .txt and rebuild the description'), () => txtIn.click()),
    qaBtn('note', L('แก้ Chapters', 'Fix chapters'), L('timestamp แรกให้เป็น 0:00 และเรียงบรรทัดตามเวลา', 'Make the first timestamp 0:00 and sort the timestamp lines'), () => {
      const box = getDescBox(host);
      const fx = fixChapters(box?.innerText || '');
      if (!fx.changes.length) return qaSay(bar, L('ไม่มีอะไรที่แก้ให้อัตโนมัติได้', 'Nothing that can be fixed automatically'), 'warn');
      const undo = qaWrite(box, fx.text);
      qaCheck(bar, host);
      const st = bar.querySelector('.st')!;
      qaSay(bar, st.textContent, st.className.replace('st', '').trim(), undo);
    }),
    qaBtn('check', L('ตรวจ Chapters', 'Check chapters'), L('ตรวจ timestamp ในคำอธิบายตามกฎ Chapters ของ YouTube', 'Check the description\'s timestamps against YouTube\'s chapter rules'), () => qaCheck(bar, host)),
    qaBtn('layers', L('แท็กจากพรีเซ็ต', 'Preset tags'), L('เพิ่มแท็กของพรีเซ็ต', 'Add the preset\'s tags'), async () => {
      const ok = await setTags(host, renderTags(qaPreset(), qaVars(host)));
      qaSay(bar, ok ? L('เพิ่มแท็กแล้ว', 'Tags added') : L('หาช่องแท็กไม่เจอ', 'Tags field not found'), ok ? 'ok' : 'err');
    }),
    qaBtn('send', L('ใส่ทั้งหมด', 'Apply all'), L('ชื่อ + คำอธิบาย + แท็ก + ตัวเลือกจากการตั้งค่า', 'Title + description + tags + options from Settings'), async () => {
      const p = qaPreset();
      const vars = qaVars(host);
      const tBox = getTitleBox(host), dBox = getDescBox(host);
      const before = { t: tBox?.innerText || '', d: dBox?.innerText || '' };
      const ok = await fillDetails({ title: makeTitle(p, vars), description: renderDesc(p, vars), tags: renderTags(p, vars) });
      qaCheck(bar, host);
      const undo = () => { if (tBox) setEditable(tBox, before.t); if (dBox) setEditable(dBox, before.d); };
      const st = bar.querySelector('.st')!;
      if (!ok) qaSay(bar, L('ใส่แล้ว แต่หาช่องแท็กไม่เจอ', 'Applied, but the tags field was not found'), 'warn', undo);
      else qaSay(bar, st.textContent, st.className.replace('st', '').trim(), undo);
    }),
    qaBtn('copy', L('คัดลอก', 'Copy'), L('คัดลอกคำอธิบาย', 'Copy the description'), () => {
      void navigator.clipboard.writeText(getDescBox(host)?.innerText || '').catch(() => {});
      qaSay(bar, L('คัดลอกคำอธิบายแล้ว', 'Description copied'), 'ok');
    }),
    h('span', { className: 'st' }),
    txtIn);
  return bar;
}

const QA_CSS = (`
    .ytp-qa{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0 4px;font:500 12px/1.4 Roboto,"Noto Sans Thai",Arial,sans-serif}
    .ytp-qa .qb{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:999px;cursor:pointer;
      border:1px solid #d3d3d3;background:#fff;color:#0f0f0f;font:inherit;transition:background .15s,border-color .15s}
    .ytp-qa .qb:hover{background:#f2f2f2;border-color:#bdbdbd}
    .ytp-qa .qb:focus-visible{outline:2px solid #065fd4;outline-offset:1px}
    .ytp-qa .qb svg{flex:0 0 auto}
    .ytp-qa select{height:28px;max-width:180px;border-radius:999px;border:1px solid #d3d3d3;background:#fff;color:#0f0f0f;padding:0 8px;font:inherit;cursor:pointer}
    .ytp-qa .st{font-weight:400;color:#606060;min-width:0}
    .ytp-qa .st .undo{border:0;background:none;padding:0 2px;font:inherit;font-weight:600;color:#065fd4;cursor:pointer;text-decoration:underline}
    :host-context(html[dark]) .ytp-qa .st .undo{color:#3ea6ff}
    .ytp-qa .st.ok{color:#1b873f} .ytp-qa .st.warn{color:#b26a00} .ytp-qa .st.err{color:#cc0000}
    :host-context(html[dark]) .ytp-qa .qb,:host-context(html[dark]) .ytp-qa select{background:#1f1f1f;border-color:#3f3f3f;color:#f1f1f1}
    :host-context(html[dark]) .ytp-qa .qb:hover{background:#2a2a2a;border-color:#5a5a5a}
    :host-context(html[dark]) .ytp-qa .st{color:#aaa}
    :host-context(html[dark]) .ytp-qa .st.ok{color:#4ade80} :host-context(html[dark]) .ytp-qa .st.warn{color:#fbbf24} :host-context(html[dark]) .ytp-qa .st.err{color:#f87171}
  `);

// Each bar sits right after Studio's field, inside a shadow root so Studio's CSS and
// ours stay apart. The host keeps the `ytp-qa` class the code above looks for.
function qaHost(bar: HTMLElement): HTMLElement {
  const host = h('div', { className: 'ytp-qa' });
  host.attachShadow({ mode: 'open' }).append(h('style', {}, QA_CSS), bar);
  return host;
}

// Returns a disposer: stops placing bars and removes the ones already on the page (their
// buttons belong to this script instance).
export function installQuickActions(): () => void {
const poll = setInterval(() => {
  const on = settings.quickActions && !running;
  const host = on && getDetailsHost();
  const tEl = host && host.querySelector('ytcp-video-title');
  const dEl = host && host.querySelector('ytcp-video-description');
  if (!tEl || !isVisible(getTitleBox(host))) {
    if (!on) document.querySelectorAll('.ytp-qa').forEach((b) => b.remove());
    return;
  }
  // คลิปใหม่ / หน้าใหม่: ล้าง .txt ที่ใส่ไว้กับคลิปก่อน
  const key = onEditPage() ? location.pathname : 'dlg:' + (session ? session.originalName : '');
  if (key !== qa.key) { qa.key = key; qa.txt = ''; qa.txtName = ''; }
  if (!tEl.nextElementSibling?.classList.contains('ytp-qa')) tEl.after(qaHost(qaTitleBar(host as HTMLElement)));
  if (dEl && !dEl.nextElementSibling?.classList.contains('ytp-qa')) dEl.after(qaHost(qaDescBar(host as HTMLElement)));
}, 1000);
  return () => {
    clearInterval(poll);
    document.querySelectorAll('.ytp-qa').forEach((b) => b.remove());
  };
}
