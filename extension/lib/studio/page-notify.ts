// @port-begin
function beep(ok = true) {
  try {
    const ctx = new AudioContext();
    const notes = ok ? [660, 880] : [440, 330];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.17);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* เบราว์เซอร์ไม่ให้เล่นเสียง */ }
}
// ความคืบหน้าบนชื่อแท็บ เช่น "(3/10) ⬆ Channel content" — เห็นได้แม้อยู่แท็บอื่น
const TITLE_TAG = /^(\(\d+\/\d+\) ⬆|✅|⚠️)(\s+|$)/;
let titleMark = '';
function setTitleMark(mark: string) {
  titleMark = mark;
  const base = document.title.replace(TITLE_TAG, '');
  const next = mark ? `${mark} ${base}` : base;
  if (document.title !== next) document.title = next;
}
// @port-end

export function installTitleMark(): void {
  // @port-begin
// Studio เปลี่ยนชื่อแท็บเองตอนเปลี่ยนหน้า -> ใส่เครื่องหมายกลับเข้าไป
setInterval(() => { if (titleMark && !document.title.startsWith(titleMark)) setTitleMark(titleMark); }, 1500);
// ✅/⚠️ หลังคิวจบ แสดงไว้จนกว่าจะกลับมาดูแท็บนี้
const clearDoneMark = () => { if (titleMark && !titleMark.startsWith('(') && document.visibilityState === 'visible' && document.hasFocus()) setTitleMark(''); };
window.addEventListener('focus', () => setTimeout(clearDoneMark, 1500));
  // @port-end
}

export { beep, setTitleMark };
