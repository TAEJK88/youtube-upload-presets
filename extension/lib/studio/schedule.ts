import { L } from '../i18n';
import { pad } from '../template';
import { getDialog, isVisible, sleep, waitFor } from './automation';
import { hiddenTabNote } from './draft-retry';
import { SEL } from './sel';

// "Could not open the calendar" failed a 3.5-hour video (the owner's run, 2026-10-14) and nothing
// said why. Two changes to setSchedule(), neither seen in Chrome (P5-draft-retry):
// - each of the three clicks goes to the date field that is in the dialog now. The field was
//   looked up once, and a click on an element Studio has since drawn again does nothing: three
//   clicks on it open no calendar. A page that keeps its element is clicked as before.
// - the failure says when the tab was in the background, and logs what the page held, so the next
//   failure can be told from this one.
function calendarNote(trigger: HTMLElement): string {
  console.warn(`[ytup] calendar: not open after 3 clicks · tab ${document.visibilityState} · date field ${trigger.isConnected ? 'still in the page' : 'was drawn again'} · ${document.querySelectorAll(SEL.datePickerInput).length} calendar input(s) in the page, none visible`);
  return hiddenTabNote();
}

// @port-begin
// ----- ตั้งเวลาปล่อย -----
const studioLang = () => document.documentElement.lang || navigator.language || 'en';

// พิมพ์ค่าลงช่อง input ของ Studio แล้วกด Enter ให้ระบบรับค่า
async function typeInto(input: HTMLInputElement, text: string) {
  input.focus();
  input.select?.();
  document.execCommand('selectAll', false, null as unknown as string);
  document.execCommand('insertText', false, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(150);
  for (const type of ['keydown', 'keyup']) {
    input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  }
  await sleep(500);
}

// จัดรูปแบบวันที่ให้ตรงกับที่ช่องวันที่ของ Studio แสดงอยู่ (ดูจากค่าเดิม เช่น "Oct 2, 2026" หรือ "2 ต.ค. 2569")
function formatStudioDate(date: Date, sample: string) {
  const year = Number(((sample || '').match(/\d{4}/) || [])[0]);
  const buddhist = year > 2400;
  const lang = studioLang();
  const out = new Intl.DateTimeFormat(`${lang}-u-ca-gregory`, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  // ปีให้ตรงกับระบบที่ Studio ใช้ (พ.ศ. / ค.ศ.)
  return out.replace(/\d{4}/, String(date.getFullYear() + (buddhist ? 543 : 0)));
}
// จัดรูปแบบเวลาให้ตรงกับช่องเวลาของ Studio (ดูจากค่าเดิม เช่น "08:00" / "8:00" / "8:00 AM")
const formatStudioTime = (date: Date, sample = '') => {
  const s = String(sample).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const h = date.getHours();
    return `${/^\d\d:/.test(s) ? pad(h) : h}:${pad(date.getMinutes())}`;
  }
  return new Intl.DateTimeFormat(`${studioLang()}-u-ca-gregory`, { hour: 'numeric', minute: '2-digit' }).format(date);
};
// แปลงข้อความเวลาเป็นนาทีนับจากเที่ยงคืน ("08:00" = "8:00" = "8:00 AM" = 480) คืน null ถ้าอ่านไม่ได้
function parseClock(text: unknown) {
  const s = String(text || '').toLowerCase();
  const m = s.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (/\b(pm|p\.m\.)|หลังเที่ยง/.test(s) && h < 12) h += 12;
  else if (/\b(am|a\.m\.)|ก่อนเที่ยง/.test(s) && h === 12) h = 0;
  return h * 60 + min;
}

// ตั้งเวลาปล่อยในหน้า Visibility คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
async function setSchedule(date: Date) {
  const dlg = getDialog()!;
  const expand = await waitFor(() => {
    const e = dlg.querySelector<HTMLElement>(SEL.scheduleRadio);
    return isVisible(e) && e;
  }, 6000);
  if (!expand) return L('ไม่พบส่วน "กำหนดเวลา" ในหน้าการเปิดเผย', '"Schedule" section not found on the visibility page');
  expand.click();

  const trigger = await waitFor(() => {
    const t = dlg.querySelector<HTMLElement>(SEL.datePickerTrigger);
    return isVisible(t) && t;
  }, 5000);
  if (!trigger) return L('ไม่พบช่องวันที่', 'Date field not found');
  // ปฏิทินของ Studio: กดช่องวันที่ = เปิด/ปิดสลับกัน และ Escape ปิดไม่ได้ (ตรวจกับ Studio จริง ต.ค. 2026)
  // ถ้าเปิดอยู่แล้วห้ามกดซ้ำ (จะกลายเป็นปิด) · ยังไม่เปิดค่อยกด แล้วลองใหม่ได้ 3 ครั้ง
  const pickerInput = () => {
    const i = [...document.querySelectorAll<HTMLInputElement>(SEL.datePickerInput)].find(isVisible);
    return i || null;
  };
  let dateInput = pickerInput();
  for (let k = 0; !dateInput && k < 3; k++) {
    (dlg.querySelector<HTMLElement>(SEL.datePickerTrigger) || trigger).click();
    dateInput = await waitFor(pickerInput, 4000);
  }
  if (!dateInput) return L('เปิดปฏิทินไม่ได้', 'Could not open the calendar') + calendarNote(trigger);
  const dateText = formatStudioDate(date, dateInput.value);
  await typeInto(dateInput, dateText);
  if (isVisible(dateInput)) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(300);
  }

  const timeInput = await waitFor(() => {
    const i = dlg.querySelector<HTMLInputElement>(SEL.timeInput);
    return isVisible(i) && i;
  }, 4000);
  if (!timeInput) return L('ไม่พบช่องเวลา', 'Time field not found');
  const timeText = formatStudioTime(date, timeInput.value);
  const wantMin = date.getHours() * 60 + date.getMinutes();
  const norm = (x: unknown) => String(x).toLowerCase().replace(/[\s,.]/g, '');
  // ช่องเวลาของ Studio เป็นช่องเลือกจากรายการ (00:00, 00:15, …) พิมพ์อย่างเดียวค่าไม่ถูกบันทึก (รูป 6: ค้าง 00:00)
  // วิธีที่ 1: คลิกช่องแล้วเลือกเวลาจากรายการ  วิธีที่ 2 (เวลาที่ไม่อยู่ในรายการ เช่น 19:07): พิมพ์ + Enter + Tab
  const pickTime = async () => {
    timeInput.focus();
    timeInput.click();
    const item = await waitFor(() => [...document.querySelectorAll<HTMLElement>(SEL.timeOption)]
      .find((e) => e.getClientRects().length && parseClock(e.textContent) === wantMin), 2500);
    if (item) {
      item.scrollIntoView({ block: 'center' });
      item.click();
      await sleep(600);
      return true;
    }
    return false;
  };
  if (!(await pickTime())) {
    await typeInto(timeInput, timeText);
    timeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true }));
  }
  timeInput.blur();
  document.body.click();
  await sleep(1000); // ให้ Studio บันทึกค่า แล้วค่อยอ่านค่าที่แสดงจริง

  // ตรวจผลจากข้อความที่ Studio แสดง (หลังออกจากช่องแล้ว): วันที่และเวลาต้องตรงกับที่ตั้งทั้งหมด
  // ถ้าไม่ตรงจะถือว่าไม่สำเร็จ (ไม่กด Save) ดีกว่าเสี่ยงปล่อยผิดวัน/ผิดเวลา
  const shownDate = (dlg.querySelector(SEL.datePickerTrigger)?.textContent || trigger.textContent || '').trim();
  const shownTime = (dlg.querySelector<HTMLInputElement>(SEL.timeInput)?.value || '').trim();
  // วันที่: ตัดเลข 0 นำหน้าออกก่อนเทียบ ("05 Oct" = "5 Oct")  เวลา: เทียบเป็นนาที ("08:00" = "8:00")
  const normDate = (x: unknown) => norm(x).replace(/(^|D)0+(d)/g, '$1$2');
  if (normDate(shownDate) !== normDate(dateText) || parseClock(shownTime) !== wantMin) {
    return L(`Studio ไม่รับวันเวลา (ตั้ง "${dateText} ${timeText}" แต่แสดง "${shownDate} ${shownTime}")`, `Studio rejected the date/time (set "${dateText} ${timeText}" but shows "${shownDate} ${shownTime}")`);
  }
  return '';
}
// @port-end

export { studioLang, typeInto, formatStudioDate, formatStudioTime, parseClock, setSchedule };
