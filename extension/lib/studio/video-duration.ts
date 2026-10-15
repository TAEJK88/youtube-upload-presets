import { mp4Duration } from '../chapters';

// @port-begin
// ความยาวคลิปจาก metadata ของไฟล์ (อ่านแค่ส่วนหัว ไม่โหลดทั้งไฟล์) · อ่านไม่ได้ = 0 (ข้ามการเช็กความยาว)
// เคยเจอบน Studio จริง: video ที่ไม่ได้อยู่ในหน้าบางครั้งไม่โหลด metadata เลย (ได้ 0) -> แปะลงหน้าแบบซ่อน และลองซ้ำอีกรอบ
function videoDurationOnce(file: Blob, wait: number): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (d: number) => { if (settled) return; settled = true; URL.revokeObjectURL(url); v.removeAttribute('src'); v.remove(); resolve(Number.isFinite(d) && d > 0 ? d : 0); };
    v.preload = 'metadata';
    v.muted = true;
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px';
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(0);
    setTimeout(() => done(0), wait);
    document.body.append(v);
    v.src = url;
  });
}
// อ่านความยาวจากหัวไฟล์ MP4/MOV โดยตรง (กล่อง moov > mvhd) — ไม่พึ่งตัวเล่นวิดีโอ
async function videoDuration(file: Blob): Promise<number> {
  try { const d = await mp4Duration(file); if (d > 0) return d; } catch (e) { /* ไม่ใช่ MP4/MOV หรืออ่านไม่ได้ */ }
  return videoDurationOnce(file, 12000);
}
// @port-end

export { videoDuration };
