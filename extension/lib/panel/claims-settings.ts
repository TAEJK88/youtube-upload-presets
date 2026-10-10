import type { ClaimsCfg } from '../claims/types';
import { L } from '../i18n';

// SETTINGS (6259–6274): the copyright module's own settings as [key, label, help], by section.
// Built when used (L() after initI18n).
export const settingsSections = (): { title: string; items: [keyof ClaimsCfg, string, string?][] }[] => [
  { title: L('Claim และการตัด', 'Claims and trimming'), items: [
    ['ownNames', L('ชื่อศิลปิน / ค่ายของตัวเอง', 'Your own artist / label names'), L('claim ที่มีชื่อเหล่านี้จะถูกมาร์ก ★ เพลงของคุณเอง (คั่นด้วย ,)', 'Claims with these names are marked ★ your own music (comma-separated)')],
    ['autoSaveTrim', L('ตัดอัตโนมัติทั้งหมด', 'Fully automatic trim'), L('กด Save ในหน้าตัด → ติ๊ก "I acknowledge" → กด "Confirm changes" ให้ ถ้าปิด คุณต้องยืนยันเองทีละอัน', 'Clicks Save in the trim editor → ticks "I acknowledge" → clicks "Confirm changes" for you. If off, you confirm each one yourself')],
    ['autoSaveManualTrim', L('ตอนตัดเองด้วยมือ: กด Save และ Confirm changes ให้อัตโนมัติ', 'When trimming manually: auto-click Save and Confirm changes'), L('ปิดไว้ดีกว่า — ถ้าเปิด สคริปต์จะกด Save หลังเปิดหน้าตัด 1.5 วินาที และยืนยันทุกหน้าต่าง "Confirm changes" (รวม mute / replace song) ให้ทันที', 'Better left off — if on, the script clicks Save 1.5 seconds after the trim editor opens and immediately confirms every "Confirm changes" dialog (including mute / replace song)')],
    ['followUpMinutes', L('เช็กทุก N นาที', 'Check every N minutes'), L('คลิปที่มี 2 claim ขึ้นไป: ความถี่ในการเช็กว่าการตัดครั้งก่อนเสร็จหรือยัง', 'Videos with 2+ claims: how often to check whether the previous trim has finished')],
  ] },
  { title: 'Auto-pilot', items: [
    ['apEveryHours', L('ทำงานทุก N ชั่วโมง', 'Run every N hours')],
    ['apOnlyImpact', L('เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)', 'Only claims that affect the video (no revenue / restricted / blocked)')],
    ['apSkipOwn', L('ไม่ตัดเพลงของตัวเอง (★)', "Don't trim your own music (★)")],
    ['apMaxPct', L('ข้าม claim ที่ยาวเกิน N % ของคลิป', 'Skip claims longer than N % of the video')],
    ['apMaxPerCycle', L('จำนวน claim สูงสุดต่อรอบ', 'Max claims per cycle')],
    ['apAdsOn', L('เปิดโฆษณาให้คลิปที่ปิดไว้ด้วย', 'Also turn on ads for videos that have them off'), L('เฉพาะคลิปที่ปิดในการตั้งค่า ไม่รวมคลิปที่ YouTube แจ้งว่าไม่มีสิทธิ์', 'Only videos turned off in settings, not ones YouTube marks as ineligible')],
  ] },
];
