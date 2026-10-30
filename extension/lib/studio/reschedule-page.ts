import { L } from '../i18n';
import { isVisible, sleep, waitFor } from './automation';
import { setSchedule } from './schedule';
import { SEL } from './sel';

// Reschedule's clicks on a video's edit page (/video/<id>/edit), the way uploads set a release
// time: open Visibility, setSchedule() into that popup (it types the date and time and reads them
// back), Done, then the page's Save. Studio's own Save sends the request, with the session token and
// attestation only its code can make (studio-watcher-1, Task 3). `stage(i, detail)` drives the
// status card's steps; `stillOn()` is false once Stop was pressed.
// The answer: `error` ('' when saved) and `dirty`, a change left unsaved in the page. Before Done the
// popup is closed with Escape (its Cancel is hidden), and the page is clean unless its Save turned on;
// after Done the change is in the page until Save takes it, so any failure there is dirty.
export type PageResult = { error: string; dirty: boolean };
const off = (el: Element | null) => !!el && (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true');
const shown = <T extends Element>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)].find(isVisible) || null;
const STOPPED = () => L('หยุดแล้ว', 'Stopped');

// The popup is in the page from the start; it shows when its paper dialog has client rects.
const popupShown = () => [...document.querySelectorAll<HTMLElement>(SEL.editVisibilityPopup)].find((p) => isVisible(p.querySelector(SEL.paperDialog))) || null;
const saveOn = () => { const x = shown(SEL.studioSaveHost); return !!x && !off(x); };
// Escape, as many times as it takes (the first may close an open calendar): clean when the popup
// is gone and the page's Save stayed off.
async function closePopup(error: string): Promise<PageResult> {
  for (let i = 0; i < 3 && popupShown(); i++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await waitFor(() => !popupShown(), 1500);
  }
  return { error, dirty: !!popupShown() || saveOn() };
}

export async function scheduleOnEditPage(date: Date, stage: (idx: number, detail: string) => void, stillOn: () => boolean): Promise<PageResult> {
  const field = await waitFor(() => { const f = shown<HTMLElement>(SEL.editVisibility); return f && !off(f) ? f : null; }, 25000);
  if (!field) return { error: L('ไม่พบช่อง Visibility ในหน้ารายละเอียดคลิป', 'Visibility field not found on the video page'), dirty: false };
  stage(1, L('เปิด Visibility…', 'Opening Visibility…'));
  field.click();
  const dlg = await waitFor(popupShown, 8000);
  if (!dlg) return { error: L('หน้าต่าง Visibility ไม่เปิด', 'The Visibility dialog did not open'), dirty: false };
  stage(1, L('ตั้งวันและเวลา…', 'Setting the date and time…'));
  const err = await setSchedule(date, dlg);
  if (err) return closePopup(err);
  if (!stillOn()) return closePopup(STOPPED());
  const done = shown<HTMLElement>(SEL.dialogSave, dlg);
  if (!done || off(done)) return closePopup(L('ปุ่ม Done ของ Visibility กดไม่ได้', "Visibility's Done button is not ready"));
  done.click();
  if (!(await waitFor(() => !popupShown(), 8000))) return { error: L('หน้าต่าง Visibility ไม่ปิดหลังกด Done', 'The Visibility dialog did not close after Done'), dirty: true };
  if (!stillOn()) return { error: STOPPED(), dirty: true };
  stage(2, L('กด Save…', 'Clicking Save…'));
  const save = await waitFor(() => { const x = shown<HTMLElement>(SEL.studioSaveHost); return x && !off(x) ? x : null; }, 10000);
  if (!save) return { error: L('ปุ่ม Save ของหน้าไม่พร้อม', "The page's Save button is not ready"), dirty: true };
  (save.querySelector('button') || save).click();
  if (!(await waitFor(() => off(document.querySelector(SEL.studioSaveHost)), 20000))) return { error: L('กด Save แล้วแต่ยังไม่บันทึก', 'Clicked Save but it did not save'), dirty: true };
  await sleep(1500); // Studio's own write lands before the check reads it back
  return { error: '', dirty: false };
}
