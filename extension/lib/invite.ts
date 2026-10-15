import { ACCEPT_ROUND_KEY, SWITCHED_KEY, SWITCH_KEY, SWITCH_TTL, type SwitchEnv } from './channel-switch';
import { acceptLabelMatches, INVITE_URL, normText } from './collab';
import { L } from './i18n';
import { COLLAB_LINK, INVITE_ACCEPTED_KEY, INVITE_NEXT_KEY, type InviteAccepted, type InviteNext } from './invite-keys';
import { clearSteady, steadyInterval } from './steady-tick';
import { SEL } from './studio/sel';
import { TXT } from './studio/txt';
import type { SyncStore } from './sync-store';

export interface InviteEnv extends SwitchEnv {
  getComputedStyle: (el: Element) => { visibility: string };
  setTimeout: (fn: () => void, ms: number) => unknown;
  // An interval that keeps its pace in a hidden tab (lib/steady-tick.ts); tests leave it out.
  steadyInterval?: (fn: () => void, ms: number) => number | ReturnType<typeof setInterval>;
}
interface AcceptRound { n: number; at: number }

export function createInviteWatcher(env: InviteEnv) {
  const { document, location, getComputedStyle, setInterval, clearInterval, setTimeout, console, getValue, setValue } = env;
  const steady = env.steadyInterval ?? setInterval;
  const oops = () => TXT.noPermission.test(document.body.innerText || '');
  // P5-invite-two-step: what was accepted (the `v` the card's URL had), or, with no video, that a
  // visit found no request left. The Collab list reads it to show what still waits.
  const noteInvites = (me: string | undefined, inviter: string | undefined, videoId: string | null) => {
    if (!me || !inviter) return;
    if (!videoId && oops()) return; // signed in as another channel: not "none left"
    const all = getValue<InviteAccepted>(INVITE_ACCEPTED_KEY, {}) || {};
    const pair = { ...all[me]?.[inviter] };
    if (videoId) pair.videos = { ...pair.videos, [videoId]: Date.now() };
    else pair.clearedAt = Date.now();
    setValue(INVITE_ACCEPTED_KEY, { ...all, [me]: { ...all[me], [inviter]: pair } });
  };
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
  // "[ytup]" ส่งบรรทัดเหล่านี้เข้า debug log ด้วย (P5-invite-settle)
  const say = (msg: string, ...rest: unknown[]) => console.info('[ytup] invite: ' + msg, ...rest);
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
  let acceptingV = ''; // P5-invite-two-step: the video whose Accept was just clicked
  // P5-invite-settle: พอบัตรปิด YouTube ลบ inviterChannelId ออกจาก URL — จำไว้ตั้งแต่ตอนเริ่มเฝ้า
  // (หรือจากลิงก์ /collaboration/<ผู้เชิญ> เดิม) ไม่งั้นเปิดลิงก์ซ้ำเพื่อรับคลิปถัดไปไม่ได้
  const meAtStart = (location.pathname.match(/\/channel\/(UC[\w-]{10,})/) || [])[1];
  const inviterAtStart = new URLSearchParams(location.search).get('inviterChannelId') || (location.pathname.match(/\/collaboration\/(UC[\w-]{10,})/) || [])[1];
  // P5-invite-settle: บัตรคำเชิญและรายการขึ้นมาก่อนข้อมูลในนั้นจะโหลดเสร็จ กดทันทีที่เห็นแล้ว
  // YouTube ขึ้นข้อผิดพลาด — สิ่งเดียวกัน (บัตรที่ข้อความไม่เปลี่ยนแล้ว) ต้องเห็นติดกันหลายรอบก่อนค่อยกด/ปิด
  const SETTLE = 3;      // รอบ (วินาที) ที่แถวเดิมต้องนิ่งก่อนกดเปิด
  const SETTLE_CARD = 5; // รอบที่บัตร Accept ต้องนิ่ง (ข้อความไม่เปลี่ยน) ก่อนกด
  const SETTLE_DEAD = 8; // กล่องรายการที่ยังไม่มีแถวอาจแค่ยังโหลดอยู่ รอนานกว่าก่อนปิด
  // P5-invite-two-step: a reopened link that brings no request means none is left — say so sooner
  const prevRound = getValue<AcceptRound | null>(ACCEPT_ROUND_KEY, null);
  const GIVE_UP = prevRound && Date.now() - prevRound.at < 300000 ? 60 : 180;
  let seenKey = '';
  let seenFor = 0;
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
    const me = (location.pathname.match(/\/channel\/(UC[\w-]{10,})/) || [])[1] || meAtStart;
    const inviter = new URLSearchParams(location.search).get('inviterChannelId') || inviterAtStart;
    if (!me || !inviter) return false;
    const prev = getValue<AcceptRound | null>(ACCEPT_ROUND_KEY, null);
    const n = (prev && Date.now() - prev.at < 300000 ? prev.n : 0) + 1;
    if (n > ACCEPT_ROUNDS) { setValue(ACCEPT_ROUND_KEY, null); say('reached the round limit — stopping'); return false; }
    setValue(ACCEPT_ROUND_KEY, { n, at: Date.now() });
    say(`accepted ${done}; reopening the invite link for the next request (round ${n})`);
    location.href = `${location.origin}/channel/${me}/collaboration/${inviter}`;
    return true;
  }
  const timer = steady(() => {
    if (++tries > GIVE_UP) {
      stop();
      if (done) inviteNote(L(`ยอมรับไปแล้ว ${done} คลิป แต่ยังมีค้างอยู่ — ช่วยเช็กในหน้าอีกที`, `Accepted ${done}, but some may remain — please check the page`), false);
      // เงียบไป 3 นาทีโดยไม่มีอะไรเกิดขึ้น = หน้านี้ไม่มีคำเชิญให้ยอมรับ (เช่นยอมรับไปแล้ว
      // หรือเข้าผิดบัญชี) บอกไว้ใน console จะได้ไม่ต้องเดาว่าสคริปต์ทำงานไหม
      else {
        noteInvites(meAtStart, inviterAtStart, null);
        say(`gave up — no collaboration request appeared in ${GIVE_UP}s (already accepted, or signed in as the wrong channel?)`);
      }
      return;
    }
    const dead = deadList();
    const b = acceptBtn();
    const row = b ? null : requestRow();
    // ข้อความในบัตรรวมอยู่ในคีย์ด้วย: ข้อมูลที่ยังทยอยโหลดเข้ามาจะเริ่มนับใหม่ทุกครั้ง
    const key = dead ? 'dead' : b ? 'accept:' + normText((b.closest(SEL.inviteContainer) || document.body).textContent) : row ? 'row:' + rowTitle(row) : '';
    if (key !== seenKey) { seenKey = key; seenFor = 0; }
    seenFor++;
    const vNow = new URLSearchParams(location.search).get('v') || '';
    if (acceptingV && vNow !== acceptingV) { noteInvites(meAtStart, inviterAtStart, acceptingV); acceptingV = ''; }
    if (Date.now() - lastAction < 2500) return; // ให้หน้าต่างเปิด/ปิดให้เสร็จก่อนค่อยทำต่อ

    // 0) ปิดกล่องรายการที่ค้าง/ว่างเปล่าก่อน ไม่งั้นมันจะบังบัตรคำเชิญที่อยู่ข้างหลัง
    if (dead) {
      if (seenFor < SETTLE_DEAD) return;
      const x = dead.querySelector<HTMLElement>(SEL.dialogClose);
      if (x) {
        lastAction = Date.now();
        say('closing the empty "Collaboration requests" box covering the invite');
        (x.querySelector('button') || x).click();
        return;
      }
    }

    // 1) หน้าต่างยอมรับเปิดอยู่ → กด Accept
    if (b) {
      if (seenFor < SETTLE_CARD) return;
      if (done >= MAX) return finish();
      done++;
      idle = 0;
      lastAction = Date.now();
      say(`accepting request ${done}`, b);
      acceptingV = vNow;
      // ytcp-button เป็นเปลือก — กดปุ่มจริงข้างในเหมือนที่ clickIn ทำ
      (b.querySelector('button') || b).click();
      return;
    }
    // 2) ยังอยู่ที่รายการ → กดรูปย่อของแถวแรกที่เหลือเพื่อเปิดหน้าต่างยอมรับ
    if (row) {
      if (seenFor < SETTLE) return;
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
  // P5-invite-two-step: an invite link as the switch's destination goes to the channel's page
  // first; openAfterSwitch() opens the link once that page has loaded on the new channel.
  function switchThenOpen(sw: { switchToChannel(t: { handle?: string; name?: string }, next: string): void }, t: { handle?: string; name?: string }, next: string) {
    const m = next.match(COLLAB_LINK);
    if (!m) return sw.switchToChannel(t, next);
    setValue(INVITE_NEXT_KEY, { at: Date.now(), channel: m[1]!, link: next } satisfies InviteNext);
    sw.switchToChannel(t, `https://studio.youtube.com/channel/${m[1]!}`);
  }
  function openAfterSwitch() {
    if (location.hostname !== 'studio.youtube.com') return;
    const want = () => {
      const p = getValue<InviteNext | null>(INVITE_NEXT_KEY, null);
      return p && Date.now() - (p.at || 0) < SWITCH_TTL ? p : null;
    };
    if (!want()) return;
    let calm = 0;
    let tries = 0;
    const timer = steady(() => {
      const p = want();
      if (!p || ++tries > 60) return void clearInterval(timer);
      // on the channel, past the post-switch Oops (lib/channel-switch.ts recovers that), for 3 s
      const here = (location.pathname.match(/^\/channel\/(UC[\w-]{10,})/) || [])[1];
      calm = here === p.channel && !/[?&]sttick=/.test(location.search) && !oops() ? calm + 1 : 0;
      if (calm < 3) return;
      clearInterval(timer);
      setValue(INVITE_NEXT_KEY, null);
      console.info('[ytup] invite: on the channel now — opening the invite link');
      location.href = p.link;
    }, 1000);
  }
  return { inviteUrlNow, watchInvite, armSpaPoll, switchThenOpen, openAfterSwitch };
}

// The storage keys these watchers read and write synchronously.
export const INVITE_KEYS = ['settings', SWITCH_KEY, SWITCHED_KEY, ACCEPT_ROUND_KEY, INVITE_NEXT_KEY, INVITE_ACCEPTED_KEY];

// The real page as an InviteEnv: the globals the userscript used, and a chrome.storage
// mirror in place of GM_getValue / GM_setValue.
export interface Timers {
  setInterval: (fn: () => void, ms: number) => number | ReturnType<typeof setInterval>;
  clearInterval: (id: number | ReturnType<typeof setInterval>) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
}
// Content scripts pass ctx.setInterval / ctx.setTimeout, which stop by themselves once the
// extension is reloaded; the default is the page's own timers.
const pageTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};

export const browserEnv = (kv: SyncStore, timers: Timers = pageTimers): InviteEnv => ({
  document,
  location,
  getComputedStyle: (el) => getComputedStyle(el),
  setInterval: (fn, ms) => timers.setInterval(fn, ms),
  clearInterval: (id) => {
    clearSteady(id);
    timers.clearInterval(id);
  },
  steadyInterval: (fn, ms) => steadyInterval(timers.setInterval, fn, ms) as number,
  setTimeout: (fn, ms) => timers.setTimeout(fn, ms),
  console,
  getValue: (key, fallback) => kv.get(key, fallback),
  setValue: (key, value) => kv.set(key, value),
});
