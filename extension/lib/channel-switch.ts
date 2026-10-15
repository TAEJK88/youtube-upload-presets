import { normText, switcherRowMatches } from './collab';
import { SEL } from './studio/sel';
import { TXT } from './studio/txt';

// A switch waiting to be picked on www.youtube.com/channel_switcher, and the marker
// left after picking (read by the post-switch Oops recovery on Studio).
export interface PendingSwitch { at: number; next: string; handle?: string; name?: string }
export interface SwitchedMarker { at: number; tries: number; next: string }

// What the switcher touches outside itself. The content scripts pass the real page
// (and the chrome.storage mirror for get/set); tests pass a fake DOM, clock and store.
export interface SwitchEnv {
  document: Document;
  location: Location;
  setInterval: (fn: () => void, ms: number) => number | ReturnType<typeof setInterval>;
  clearInterval: (id: number | ReturnType<typeof setInterval>) => void;
  console: Pick<Console, 'info'>;
  getValue: <T>(key: string, fallback?: T) => T;
  setValue: (key: string, value: unknown) => void;
}

// ===== สลับช่องให้อัตโนมัติ =====
// เข้า studio.youtube.com/channel/<id> ตรง ๆ ไม่ได้ถ้าช่องนั้นไม่ใช่ช่องที่ session
// กำลังใช้อยู่ — YouTube จะขึ้น "Oops, you don't have permission to view this page"
// ทางที่ YouTube ใช้เอง (ปุ่ม Switch account บนหน้า Oops) คือ
//   www.youtube.com/channel_switcher?next=<ปลายทาง>
// หน้านั้นจะลิสต์ทุกช่อง พอกดช่องไหน YouTube จะสลับให้แล้วเด้งไปที่ next เอง
export const SWITCH_KEY = 'pendingChannelSwitch';
export const SWITCHED_KEY = 'channelSwitchedAt';
export const ACCEPT_ROUND_KEY = 'inviteAcceptRound'; // นับรอบการเปิดลิงก์คำเชิญซ้ำเพื่อรับคลิปถัดไป
export const SWITCH_TTL = 180000;

export function createChannelSwitch(env: SwitchEnv) {
  const { document, location, setInterval, clearInterval, console, getValue, setValue } = env;
const pendingSwitch = () => {
  const p = getValue<PendingSwitch | null>(SWITCH_KEY, null);
  return p && Date.now() - (p.at || 0) < SWITCH_TTL ? p : null;
};
const clearSwitch = () => setValue(SWITCH_KEY, null);
// target: { handle?, name? } · next: URL เต็มที่จะไปต่อหลังสลับช่องเสร็จ
function switchToChannel(target: { handle?: string; name?: string }, next: string) {
  setValue(SWITCH_KEY, Object.assign({ at: Date.now(), next }, target));
  location.href = 'https://www.youtube.com/channel_switcher?next=' + encodeURIComponent(next);
}

// อยู่ในหน้าสลับช่อง: กดช่องที่ค้างไว้ให้เอง แล้ว YouTube จะพาไปที่ next ต่อ
function watchChannelSwitcher() {
  if (location.hostname !== 'www.youtube.com') return;
  if (!/^\/(account|channel_switcher)/.test(location.pathname)) return;
  const want = pendingSwitch();
  if (!want) return;
  const say = (m: string) => console.info('[YT Upload Presets] switch: ' + m);
  say(`looking for ${want.handle || want.name} on the channel switcher`);
  const vis = (e: Element | null): e is Element => !!e && e.getClientRects().length > 0;
  let tries = 0;
  let picked = false;
  const timer = setInterval(() => {
    if (++tries > 60) { clearInterval(timer); return; }
    // ช่องที่เราเป็น "ผู้จัดการ" (manager) ไม่สลับทันที แต่เด้งกล่องบอกว่ากิจกรรมส่วนตัว
    // ยังนับกับบัญชีเดิมอยู่ ต้องกด "Got it" ก่อนถึงจะสลับจริง — ช่องที่เราเป็นเจ้าของ
    // ไม่มีกล่องนี้ (serviceEndpoint ต่างกัน: openPopupAction vs ปลายทางสลับช่องตรง ๆ)
    const okHost = document.querySelector<HTMLElement>(SEL.switcherConfirm);
    const okBtn = okHost && (okHost.querySelector('button') || okHost);
    if (picked && vis(okBtn) && TXT.dismissNotice.test(normText(okBtn.textContent))) {
      clearInterval(timer);
      say('confirming the manager-channel notice');
      okBtn.click();
      return;
    }
    if (picked) return; // กดแถวไปแล้ว — รอกล่องยืนยัน หรือรอ YouTube พาไปเอง
    if (!pendingSwitch()) { clearInterval(timer); return; }
    const row = [...document.querySelectorAll<HTMLElement>(SEL.switcherItem)]
      .find((r) => vis(r) && switcherRowMatches(r.textContent, want.handle, want.name));
    if (!row) return;
    picked = true;
    clearSwitch();
    // YouTube เด้งไป next ทันทีโดยที่ session ใหม่ยังไม่ทันมีผล หน้าแรกที่โหลดจึงขึ้น Oops
    // ได้ ทั้งที่สลับช่องสำเร็จแล้ว — จดไว้ว่าเพิ่งสลับ เพื่อให้โหลดซ้ำให้เองถ้าเจอหน้านั้น
    setValue(SWITCHED_KEY, { at: Date.now(), tries: 0, next: want.next || '' });
    say(`switching to ${want.handle || want.name}`);
    (row.querySelector<HTMLElement>(SEL.switcherItemClick) || row).click();
  }, 500);
}
// เพิ่งสลับช่องแล้วเจอหน้า Oops = session ใหม่ยังตามมาไม่ทัน โหลดหน้าเดิมซ้ำก็ผ่าน
function recoverAfterSwitch() {
  if (location.hostname !== 'studio.youtube.com') return;
  const s = getValue<SwitchedMarker | null>(SWITCHED_KEY, null);
  if (!s || Date.now() - (s.at || 0) > 90000) return;
  const say = (m: string) => console.info('[YT Upload Presets] switch: ' + m);
  let tries = 0;
  const timer = setInterval(() => {
    const oops = TXT.noPermission.test(document.body.innerText || '');
    if (!oops) {
      if (++tries < 12) return; // ยังโหลดไม่เสร็จ รออีกหน่อยก่อนจะบอกว่าผ่านแล้ว
      clearInterval(timer);
      setValue(SWITCHED_KEY, null);
      return;
    }
    clearInterval(timer);
    // location.reload() ไม่พอ — YouTube เด้งมาพร้อม ?sttick=0 ติดมาด้วย โหลดซ้ำทั้ง URL เดิม
    // ก็ขึ้น Oops ทุกครั้ง แต่เข้า URL สะอาด ๆ ของช่องเดียวกันกลับเข้าได้ปกติ
    const here = location.href;
    const clean = [s.next, location.origin + location.pathname].find((u) => u && u !== here);
    if (!clean || (s.tries || 0) >= 2) {
      // URL ช่องตรง ๆ ยังขึ้น Oops แต่หน้าแรกของ Studio (ปุ่ม "Return to Studio") เข้าได้
      // ลองหน้าแรกอีกครั้งเดียว ก่อนจะยอมแพ้ (P5-switch-home)
      const home = location.origin + '/';
      if ((s.tries || 0) < 3 && here !== home) {
        setValue(SWITCHED_KEY, { at: s.at, tries: 3, next: s.next || '' });
        say('still no permission after retrying — going to the Studio home page');
        location.href = home;
        return;
      }
      setValue(SWITCHED_KEY, null);
      say(clean ? 'still no permission after retrying — giving up' : 'no clean URL left to retry — giving up');
      return;
    }
    setValue(SWITCHED_KEY, { at: s.at, tries: (s.tries || 0) + 1, next: s.next || '' });
    say('switched but the page says no permission — retrying on a clean URL');
    location.href = clean;
  }, 500);
}
  return { pendingSwitch, clearSwitch, switchToChannel, watchChannelSwitcher, recoverAfterSwitch };
}
