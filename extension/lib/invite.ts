import { ACCEPT_ROUND_KEY, SWITCHED_KEY, SWITCH_KEY, type SwitchEnv } from './channel-switch';
import { acceptLabelMatches, INVITE_URL, normText } from './collab';
import { L } from './i18n';
import { SEL } from './studio/sel';
import type { SyncStore } from './sync-store';

export interface InviteEnv extends SwitchEnv {
  getComputedStyle: (el: Element) => { visibility: string };
  setTimeout: (fn: () => void, ms: number) => unknown;
}
interface AcceptRound { n: number; at: number }

export function createInviteWatcher(env: InviteEnv) {
  const { document, location, getComputedStyle, setInterval, clearInterval, setTimeout, console, getValue, setValue } = env;
  // @port-begin
const inviteUrlNow = () => INVITE_URL.test(location.pathname + location.search + location.hash);
const inviteNote = (text: string, ok = true) => {
  const note = document.createElement('div');
  note.textContent = `${ok ? '✅' : '⚠️'} ${text} (YouTube Upload Presets)`;
  note.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:${ok ? '#111' : '#7a3b00'};color:#fff;padding:10px 16px;border-radius:10px;font:600 13px system-ui;max-width:90vw;text-align:center`;
  document.body.append(note);
  setTimeout(() => note.remove(), 10000);
};
// ปุ่มอาจอยู่ใน shadow root ของ web component → ต้องไล่ลงไปด้วย
function deepFind(root: ParentNode, sel: string, out: HTMLElement[] = []): HTMLElement[] {
  root.querySelectorAll<HTMLElement>(sel).forEach((e) => out.push(e));
  root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepFind(e.shadowRoot, sel, out); });
  return out;
}
let inviteWatching = false;
function watchInvite() {
  if (inviteWatching) return; // กันตั้งนาฬิกาซ้อนกันตอนหน้าเปลี่ยนรัว ๆ
  if ((getValue<{ autoAcceptInvite?: boolean } | undefined>('settings') || {}).autoAcceptInvite === false) return;
  // ใน Studio ทำเฉพาะหน้าคำเชิญ ไม่ไล่กดปุ่มทุกหน้า
  if (location.hostname === 'studio.youtube.com' && !inviteUrlNow()) return;
  inviteWatching = true;
  // "ไม่ได้เฝ้า" กับ "เฝ้าแล้วแต่ไม่เจอปุ่ม" หน้าตาเหมือนกันหมดจากข้างนอก — log ไว้ให้แยกออก
  const say = (msg: string, ...rest: unknown[]) => console.info('[YT Upload Presets] invite: ' + msg, ...rest);
  say('watching ' + location.pathname + location.search);
  const visible = (el: Element | null | undefined): el is Element => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const live = (b: HTMLElement & { disabled?: boolean }) => visible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
  // ปุ่มยอมรับที่กดได้จริง + มีหลักฐานว่าหน้านี้เป็นคำเชิญจริง ๆ
  // เดิมใช้ "ข้อความในกล่องพูดถึงคำเชิญ" เป็นตัวกัน แต่บนหน้า Studio ทุกหน้ามีแท็บชื่อ
  // "Collaborations" อยู่แล้ว เงื่อนไขนั้นจึงเป็นจริงเสมอและกันอะไรไม่ได้เลย
  // ใช้ลายเซ็นของบัตรคำเชิญแทน: ปุ่ม Accept จะมาคู่กับปุ่ม Decline (#deny-button) เสมอ
  const acceptBtn = () => deepFind(document, SEL.inviteClickable).find((b) => {
    if (!acceptLabelMatches(b.getAttribute('aria-label'), b.textContent) || !live(b)) return false;
    const box = b.closest(SEL.inviteContainer) || document.body;
    const declineNearby = deepFind(box, SEL.inviteDecline).some(visible);
    return declineNearby || inviteUrlNow();
  });
  // คำเชิญหลายคลิปจะขึ้นเป็น "รายการ" ก่อน (ไม่มีปุ่ม Accept ในรายการ) ต้องกดรูปย่อของแต่ละแถว
  // เพื่อเปิดหน้าต่างยอมรับทีละคลิป · ถ้ามีคลิปเดียว YouTube ข้ามรายการไปที่หน้าต่างยอมรับเลย
  // ค้นแถวเฉพาะในกล่องรายการเท่านั้น — ytcp-video-row เป็น element เดียวกับตารางคลิปของหน้าหลัก
  const requestRow = () => {
    const host = document.querySelector(SEL.inviteListDialog);
    if (!host || !visible(host.querySelector(SEL.paperDialog))) return null;
    return [...host.querySelectorAll<HTMLElement>(SEL.inviteRequestRow)].find(visible) || null;
  };
  const rowTitle = (r: Element) => normText(r.querySelector(SEL.inviteRowTitle)?.textContent).slice(0, 60);
  // กล่อง "Collaboration requests" ชอบค้างที่ "Oops, something went wrong" โดยไม่มีแถวเลย
  // แล้วลอยทับบัตรคำเชิญที่อยู่ข้างหลัง ทำให้ปุ่ม Accept กดไม่ได้ — กล่องแบบนี้ไม่มีประโยชน์
  // ปิดทิ้งก่อนแล้วค่อยทำงานกับบัตรที่อยู่ข้างใต้
  const deadList = () => {
    const host = document.querySelector(SEL.inviteListDialog);
    if (!host || !visible(host.querySelector(SEL.paperDialog))) return null;
    return [...host.querySelectorAll<HTMLElement>(SEL.inviteRequestRow)].some(visible) ? null : host;
  };

  const MAX = 25; // กันวนไม่รู้จบถ้าแถวไม่หายไปหลังกดยอมรับ
  const ACCEPT_ROUNDS = 15; // เปิดลิงก์คำเชิญซ้ำได้สูงสุดกี่รอบ (กันวนไม่รู้จบ)
  const IDLE_BEFORE_DONE = 8; // รอบที่ว่างติดกันก่อนจะสรุปว่าหมดแล้ว
  let tries = 0;
  let done = 0;      // จำนวนคำเชิญที่กดยอมรับไปแล้ว
  let opened = 0;    // จำนวนแถวที่กดเปิด
  let idle = 0;      // รอบที่ไม่เจออะไรเลยติดต่อกัน
  let lastAction = 0;
  // 180 วิ: ลิงก์คำเชิญมักเด้งผ่านหน้าเลือกบัญชี/ล็อกอินก่อน หน้าจริงจึงมาช้ากว่า 60 วิเดิม
  const stop = () => { clearInterval(timer); inviteWatching = false; };
  const finish = () => {
    stop();
    say(`finished — accepted ${done}`);
    // YouTube เสนอคำเชิญให้ทีละคลิปต่อการเปิดหน้าหนึ่งครั้ง พอยอมรับไปแล้วกล่องรายการ
    // จะค้างที่ "Oops, something went wrong" และโหลดหน้าเดิมซ้ำก็ไม่มีคำเชิญถัดไปขึ้นมา
    // ต้องกลับไปที่ลิงก์คำเชิญเดิมเท่านั้น — ประกอบขึ้นใหม่ได้จาก id ช่องเราใน path
    // กับ inviterChannelId ใน query ของหน้าที่ YouTube เด้งมา
    if (done && nextInviteRound()) return;
    if (done) inviteNote(done > 1
      ? L(`ยอมรับคำเชิญให้แล้ว ${done} คลิป`, `Accepted ${done} collaboration requests`)
      : L('ยอมรับคำเชิญเรียบร้อย', 'Invitation accepted'));
    setValue(ACCEPT_ROUND_KEY, null);
  };
  // คืน true ถ้าสั่งไปรอบถัดไปแล้ว
  function nextInviteRound() {
    const me = (location.pathname.match(/\/channel\/(UC[\w-]{10,})/) || [])[1];
    const inviter = new URLSearchParams(location.search).get('inviterChannelId');
    if (!me || !inviter) return false;
    const prev = getValue<AcceptRound | null>(ACCEPT_ROUND_KEY, null);
    const n = (prev && Date.now() - prev.at < 300000 ? prev.n : 0) + 1;
    if (n > ACCEPT_ROUNDS) { setValue(ACCEPT_ROUND_KEY, null); say('reached the round limit — stopping'); return false; }
    setValue(ACCEPT_ROUND_KEY, { n, at: Date.now() });
    say(`accepted ${done}; reopening the invite link for the next request (round ${n})`);
    location.href = `${location.origin}/channel/${me}/collaboration/${inviter}`;
    return true;
  }
  const timer = setInterval(() => {
    if (++tries > 180) {
      stop();
      if (done) inviteNote(L(`ยอมรับไปแล้ว ${done} คลิป แต่ยังมีค้างอยู่ — ช่วยเช็กในหน้าอีกที`, `Accepted ${done}, but some may remain — please check the page`), false);
      // เงียบไป 3 นาทีโดยไม่มีอะไรเกิดขึ้น = หน้านี้ไม่มีคำเชิญให้ยอมรับ (เช่นยอมรับไปแล้ว
      // หรือเข้าผิดบัญชี) บอกไว้ใน console จะได้ไม่ต้องเดาว่าสคริปต์ทำงานไหม
      else say('gave up — no collaboration request appeared in 180s (already accepted, or signed in as the wrong channel?)');
      return;
    }
    if (Date.now() - lastAction < 2500) return; // ให้หน้าต่างเปิด/ปิดให้เสร็จก่อนค่อยทำต่อ

    // 0) ปิดกล่องรายการที่ค้าง/ว่างเปล่าก่อน ไม่งั้นมันจะบังบัตรคำเชิญที่อยู่ข้างหลัง
    const dead = deadList();
    if (dead) {
      const x = dead.querySelector<HTMLElement>(SEL.dialogClose);
      if (x) {
        lastAction = Date.now();
        say('closing the empty "Collaboration requests" box covering the invite');
        (x.querySelector('button') || x).click();
        return;
      }
    }

    // 1) หน้าต่างยอมรับเปิดอยู่ → กด Accept
    const b = acceptBtn();
    if (b) {
      if (done >= MAX) return finish();
      done++;
      idle = 0;
      lastAction = Date.now();
      say(`accepting request ${done}`, b);
      // ytcp-button เป็นเปลือก — กดปุ่มจริงข้างในเหมือนที่ clickIn ทำ
      (b.querySelector('button') || b).click();
      return;
    }
    // 2) ยังอยู่ที่รายการ → กดรูปย่อของแถวแรกที่เหลือเพื่อเปิดหน้าต่างยอมรับ
    const row = requestRow();
    if (row) {
      if (opened >= MAX) return finish();
      opened++;
      idle = 0;
      lastAction = Date.now();
      say(`opening request ${opened}: ${rowTitle(row)}`);
      (row.querySelector<HTMLElement>(SEL.inviteRowOpen) || row).click();
      return;
    }
    // 3) ไม่เหลือทั้งหน้าต่างยอมรับและรายการ — แต่ YouTube ใช้เวลาสลับคำเชิญถัดไปเข้ามา
    // (และกล่องรายการขึ้น "Oops, something went wrong" อยู่พักหนึ่ง) จึงรอให้ว่างติดกัน
    // หลายรอบก่อนค่อยสรุป ไม่งั้นจะเลิกตั้งแต่คำเชิญแรก
    if (done && ++idle >= IDLE_BEFORE_DONE) finish();
  }, 1000);
}
  // @port-end
  // Studio is a SPA: the invite link often passes through other pages first.
  function armSpaPoll() {
    // @port-begin
// Studio เปลี่ยนหน้าแบบ SPA — ลิงก์คำเชิญมักเด้งผ่านหน้าอื่นก่อน ถ้าเฝ้าแค่ตอนโหลดครั้งแรกจะพลาด
let inviteUrl = location.href;
setInterval(() => {
  if (location.href === inviteUrl) return;
  inviteUrl = location.href;
  if (inviteUrlNow()) watchInvite();
}, 1000);
    // @port-end
  }
  return { inviteUrlNow, watchInvite, armSpaPoll };
}

// The storage keys these watchers read and write synchronously.
export const INVITE_KEYS = ['settings', SWITCH_KEY, SWITCHED_KEY, ACCEPT_ROUND_KEY];

// The real page as an InviteEnv: the globals the userscript used, and a chrome.storage
// mirror in place of GM_getValue / GM_setValue.
export const browserEnv = (kv: SyncStore): InviteEnv => ({
  document,
  location,
  getComputedStyle: (el) => getComputedStyle(el),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  console,
  getValue: (key, fallback) => kv.get(key, fallback),
  setValue: (key, value) => kv.set(key, value),
});
