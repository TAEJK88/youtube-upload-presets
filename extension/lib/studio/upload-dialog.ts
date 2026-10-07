import { browser } from 'wxt/browser';
import { THUMB_MAX } from '../constants';
import { L } from '../i18n';
import { buttonByText, byText, clickableOf, detailsOpen, getDialog, isVisible, leafByText, shown, sleep, T, waitFor } from './automation';
import { SEL } from './sel';
import { settings } from './state';
import { TXT } from './txt';

// @port-begin
let injectingFile = false; // ระหว่างที่สคริปต์ส่งไฟล์ให้ Studio เอง
// อัปภาพปก (Studio ต.ค. 2026: ส่วน "Thumbnail" มีกล่อง "Upload file" / "Select from video" / "A/B Testing")
// วิธีที่ 1: ใส่ภาพลงช่องเลือกไฟล์ที่ไม่ใช่ช่องวิดีโอ  วิธีที่ 2: จำลองการลากภาพมาวางบนกล่อง "Upload file"
// ถือว่าสำเร็จเมื่อมีภาพใหม่ (blob:/data:) ขึ้นในหน้าต่าง คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
// ไฟล์ที่ Studio ไม่รับแน่ ๆ (ใหญ่เกิน / ชนิดไม่รองรับ) — ไม่ต้องรอลองซ้ำ
const thumbUnusable = (file: { name: string; size: number }) => file.size > THUMB_MAX || !/\.(jpe?g|png|gif|bmp)$/i.test(file.name);
async function setThumbnail(file: File, wait = 6000): Promise<string> {
  if (file.size > THUMB_MAX) return L(`ภาพปกใหญ่เกิน 2MB (${(file.size / 1048576).toFixed(1)} MB)`, `Thumbnail is larger than 2MB (${(file.size / 1048576).toFixed(1)} MB)`);
  if (!/\.(jpe?g|png|gif|bmp)$/i.test(file.name)) return L('ชนิดไฟล์ไม่รองรับ ใช้ JPG / PNG / GIF / BMP', 'Unsupported file type. Use JPG / PNG / GIF / BMP');
  const dlg = getDialog();
  if (!dlg) return L('ไม่พบหน้าต่างอัปโหลด', 'Upload dialog not found');
  const uploadBox = () => clickableOf(leafByText(dlg, TXT.uploadFileBox));
  const area = () => [...dlg.querySelectorAll(SEL.thumbArea)].find(shown) || null;
  await waitFor(() => uploadBox() || area(), 6000);
  const blobs = () => [...dlg.querySelectorAll<HTMLImageElement>('img')].filter((i) => /^(blob|data):/.test(i.src)).map((i) => i.src);
  const before = new Set(blobs());
  const changed = () => blobs().some((x) => !before.has(x));
  const makeDT = () => {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  };
  const dropOn = async (el: HTMLElement) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const type of ['dragenter', 'dragover', 'drop']) {
      el.dispatchEvent(new DragEvent(type, Object.assign({ dataTransfer: makeDT() }, base)));
      await sleep(150);
    }
  };

  injectingFile = true;
  try {
    const inputs = [...dlg.querySelectorAll<HTMLInputElement>('input[type=file]')].filter((i) => i.name !== 'Filedata' && !i.closest(SEL.filePicker));
    for (const input of inputs) {
      input.files = makeDT().files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      if (await waitFor(changed, wait)) return '';
    }
    const targets = [uploadBox(), area()].filter(Boolean) as HTMLElement[];
    for (const el of [...new Set(targets)]) {
      await dropOn(el);
      if (await waitFor(changed, wait)) return '';
    }
    if (!targets.length && !inputs.length) return L('ไม่พบส่วน Thumbnail / ปุ่ม "Upload file" ในหน้ากรอกรายละเอียด', 'Thumbnail section / "Upload file" button not found on the details page');
    const err = [...dlg.querySelectorAll('*')].find((e) => e.childElementCount === 0 && isVisible(e) &&
      TXT.thumbError.test(e.textContent || ''));
    return err ? L(`Studio แจ้ง: ${err.textContent!.trim().slice(0, 120)}`, `Studio says: ${err.textContent!.trim().slice(0, 120)}`) :
      L(`Studio ยังไม่รับภาพปก (ช่องเลือกไฟล์ ${inputs.length} · ปุ่ม Upload file ${uploadBox() ? 'เจอ' : 'ไม่เจอ'})`, `Studio hasn't accepted the thumbnail (file inputs: ${inputs.length} · Upload file button: ${uploadBox() ? 'found' : 'not found'})`);
  } finally {
    injectingFile = false;
  }
}

// Monetisation: ช่อง "Select" (ytcp-video-monetization) → กดปุ่มไอคอนเพื่อเปิดป๊อปอัป
// ป๊อปอัปอยู่นอกหน้าต่างอัปโหลด: ytcp-video-monetization-edit-dialog > #radio-on / #radio-off > #save-button ("Done")
// คืนค่า true เมื่อตั้งค่าแล้ว (หรือไม่ต้องทำ), false เมื่อยังทำไม่เสร็จ
async function handleMonetisation() {
  if (settings.monetization === 'skip') return true;
  const box = getDialog()?.querySelector<HTMLElement>(SEL.monetBox);
  if (!shown(box)) return true; // ไม่ได้อยู่ที่ขั้นนี้ (element นี้อาจไม่มีกล่องของตัวเอง จึงเช็กจากลูกด้วย)
  const want = settings.monetization === 'off' ? 'off' : 'on';
  const current = (box!.innerText || '').trim().toLowerCase();
  if (current === want || current === (want === 'on' ? 'เปิด' : 'ปิด')) return true;
  const popup = () => {
    const d = document.querySelector(SEL.monetDialog);
    return d && isVisible(d.querySelector(SEL.monetRadio(want))) ? d : null;
  };
  if (!popup()) {
    const trigger = box!.querySelector<HTMLElement>(SEL.monetEditBtn) || box!;
    (trigger.querySelector('button') || trigger).click();
  }
  const pop = await waitFor(popup, 4000);
  if (!pop) return false;
  const radio = pop.querySelector<HTMLElement>(`#radio-${want}`);
  if (radio!.getAttribute('aria-checked') !== 'true') radio!.click();
  const save = await waitFor(() => {
    const b2 = pop.querySelector<HTMLButtonElement>(`${SEL.dialogSave} button`) || pop.querySelector<HTMLButtonElement>(SEL.dialogSave);
    return b2 && !b2.disabled && b2.getAttribute('aria-disabled') !== 'true' ? b2 : null;
  }, 3000);
  if (save) save.click();
  await waitFor(() => !popup(), 4000);
  await sleep(500);
  return (box!.innerText || '').trim().toLowerCase() === want;
}

// Ad suitability: ติ๊ก [role=checkbox][aria-label="None of the above"] → กด #submit-questionnaire-button ("Submit rating")
// ส่งแล้วแบบสอบถามจะถูกล็อก ("questionnaire is locked")
async function handleAdSuitability() {
  if (settings.adSuitability !== 'none') return true;
  const dlg = getDialog();
  // แก้บัค: querySelector แบบหลายตัวเลือกคืนตัวนอก (ytcp-uploads-content-ratings) ซึ่งไม่มีกล่องของตัวเอง
  // isVisible จึงเป็น false -> สคริปต์คิดว่าไม่ได้อยู่ขั้นนี้แล้วกด Next ข้ามไปโดยไม่ได้ Submit rating
  const q = dlg?.querySelector<HTMLElement>('ytpp-self-certification-questionnaire') || dlg?.querySelector<HTMLElement>(SEL.contentRatings);
  const onStep = shown(q) || TXT.adSuitability.test([...(dlg?.querySelectorAll('h1') || [])].filter(isVisible).map((e) => e.textContent).join(' '));
  if (!q || !onStep) return true; // ไม่ได้อยู่ที่ขั้นนี้
  // แก้บัค: แผงด้านขวามีประโยค "Once you've submitted your rating, you won't be able to change…" อยู่ตลอด
  // ห้ามใช้คำว่า "submitted your rating" ตัดสิน — ใช้ข้อความล็อกจริง "questionnaire is locked since you have submitted your rating"
  const isLocked = () => TXT.questionnaireLocked.test(q.innerText || '');
  if (isLocked()) return true; // ส่งไปแล้ว
  const box = q.querySelector<HTMLElement>('[role="checkbox"][aria-label="None of the above"], [role="checkbox"][aria-label*="ไม่มี"]') ||
    [...q.querySelectorAll<HTMLElement>('[role="checkbox"]')].find((c) => TXT.noneOfTheAbove.test(c.getAttribute('aria-label') || ''));
  if (!box) return false;
  if (box.getAttribute('aria-checked') !== 'true') box.click();
  const submit = await waitFor(() => {
    const b2 = dlg!.querySelector<HTMLButtonElement>(`${SEL.submitQuestionnaire} button`) || dlg!.querySelector<HTMLButtonElement>(SEL.submitQuestionnaire);
    return b2 && isVisible(b2) && !b2.disabled && b2.getAttribute('aria-disabled') !== 'true' ? b2 : null;
  }, 4000);
  if (!submit) return false;
  submit.click();
  await sleep(800);
  // บางครั้ง Studio ถามยืนยันอีกชั้นในหน้าต่างแยก
  const pop = [...document.querySelectorAll<HTMLElement>(SEL.anyDialog)]
    .find((d) => isVisible(d) && !d.closest(SEL.dialog) && TXT.ratingSection.test(d.innerText || ''));
  const ok = pop && buttonByText(pop, TXT.submitRating) as HTMLElement | undefined;
  if (ok) ok.click();
  return !!(await waitFor(isLocked, 10000));
}

// กด Next ไปจนถึงหน้า Visibility แล้วเลือกค่า (vis = null คือไปถึงหน้านั้นแต่ไม่เลือก)
async function goToVisibility(vis: string | null): Promise<boolean> {
  const radio = () => {
    const r = getDialog()?.querySelector<HTMLElement>(`tp-yt-paper-radio-button[name="${vis || 'PRIVATE'}"]`);
    return isVisible(r) && r;
  };
  // ปุ่ม Next กดได้ตลอดแม้ยังไม่ตอบ จึงต้องรอให้ขั้นใหม่โหลดเสร็จ (1.5 วิ) แล้วทำขั้นนั้นให้ครบก่อนค่อยกด Next
  const stepName = () => [...(getDialog()?.querySelectorAll('h1') || [])].filter(isVisible).map((e) => e.textContent.trim()).join('/');
  const t0 = Date.now();
  let step = '';
  let stepAt = Date.now();
  while (!radio() && Date.now() - t0 < T(120000)) {
    const name = stepName();
    if (name !== step) { step = name; stepAt = Date.now(); }
    if (Date.now() - stepAt < T(1500)) { await sleep(300); continue; }
    const ok = (await handleMonetisation()) && (await handleAdSuitability());
    if (!ok) {
      if (Date.now() - stepAt > T(25000)) throw new Error(L(`ทำขั้น "${step}" ไม่สำเร็จ — ทำขั้นนี้เองในหน้าต่าง แล้วกดลองใหม่`, `Step "${step}" failed — do this step manually in the dialog, then click Retry`));
      await sleep(1000);
      continue;
    }
    const next = getDialog()?.querySelector<HTMLElement>(SEL.nextButton);
    const nb = next && (next.querySelector<HTMLButtonElement>('button') || next as HTMLButtonElement);
    if (isVisible(next) && !next.hasAttribute('disabled') && nb!.getAttribute('aria-disabled') !== 'true' && !nb!.disabled) nb!.click();
    else if (Date.now() - stepAt > T(25000)) break;
    await sleep(1200);
  }
  const r = radio();
  if (r && vis) r.click();
  return !!r;
}
// ป๊อปอัปแจ้งเตือนที่ขึ้นหลังกด Save/Schedule เช่น
// "We're still checking your content … Come back before your video is published" [Got it]
// กดเฉพาะปุ่มรับทราบ (Got it / OK / Close) ไม่กดปุ่มที่เปลี่ยนการตัดสินใจ เช่น "Publish anyway"
const RE_ACK = TXT.dismissNotice;
function ackNoticeDialogs() {
  const main = getDialog()?.querySelector(SEL.paperDialog);
  let clicked = false;
  for (const d of document.querySelectorAll<HTMLElement>(SEL.noticeDialog)) {
    if (d === main || !isVisible(d) || d.contains(main!)) continue;
    // "We're still checking your content" และ "Video uploading … Keep this browser tab open until uploading is complete"
    if (!TXT.noticeBody.test(d.innerText || '')) continue;
    const btn = [...d.querySelectorAll<HTMLButtonElement>('button')].find((b) => isVisible(b) && RE_ACK.test((b.textContent || '').trim()) && !b.disabled);
    if (btn) { btn.click(); clicked = true; }
  }
  return clicked;
}

// ปิดป๊อปอัปที่ Studio เด้งขึ้นหลังกด Save (แชร์วิดีโอ / ยังประมวลผลอยู่)
function closeAfterDialogs() {
  document
    .querySelectorAll<HTMLElement>(
      SEL.afterDialogs
        .map((d) => `${d} #close-button, ${d} #close-button button, ${d} button[aria-label="Close"]`).join(', ')
    )
    .forEach((b) => isVisible(b) && b.click());
  ackNoticeDialogs();
}

// ปุ่มปิดหน้าต่างอัปโหลด (Studio ต.ค. 2026: ytcp-button#ytcp-uploads-dialog-close-button > button[aria-label=Close])
function closeStudioUploadDialog() {
  const b = [...(getDialog()?.querySelectorAll<HTMLElement>(SEL.closeDialogBtn) || [])].find(isVisible);
  if (b) b.click();
}

const dialogError = () => {
  const e = getDialog()?.querySelector('.error-area, #error-message, .error-short');
  return isVisible(e) ? e.textContent.trim() : '';
};

// เปิดหน้าต่างอัปโหลดของ Studio แล้วคืนค่า { input } หรือ { err } บอกว่าติดขั้นไหน
// ลองหลายทางเพราะ Studio เปลี่ยนหน้าตาบ่อย: (1) หน้าต่างเปิดอยู่แล้ว (2) ปุ่ม Create → Upload videos (3) ปุ่ม Upload ในหน้า Dashboard/Content
async function openFilePicker(): Promise<{ input?: HTMLInputElement; err?: string }> {
  if (ackNoticeDialogs()) await sleep(800); // ป๊อปอัป "Video uploading" ของคลิปก่อนหน้าบังหน้าจออยู่
  const fileInput = () => {
    const dlg = getDialog();
    if (!dlg) return null;
    const input = dlg.querySelector<HTMLInputElement>(SEL.fileInput);
    // หน้าต่างต้องอยู่ที่หน้าจอ "เลือกไฟล์" (ไม่ใช่หน้ากรอกรายละเอียดของคลิปก่อน)
    const pickerShown = shown(dlg.querySelector(SEL.filePicker)) || shown(dlg.querySelector(SEL.selectFilesBtn));
    return input && pickerShown && !detailsOpen() ? input : null;
  };
  if (fileInput()) return { input: fileInput()! };

  const steps: string[] = [];
  // (2) ปุ่ม Create (ไอคอนกล้อง/บวก มุมขวาบน)
  const create = [...document.querySelectorAll<HTMLElement>(
    SEL.createButton
  )].find(shown);
  if (create) {
    (create.querySelector('button') || create).click();
    const item = await waitFor(() =>
      byText(SEL.menuItem, TXT.uploadVideos) as HTMLElement | undefined ||
      [...document.querySelectorAll<HTMLElement>(SEL.firstMenuItem)].find(shown), 4000);
    if (item) {
      item.click();
      const input = await waitFor(fileInput, 10000);
      if (input) return { input };
      steps.push(L('กดเมนู "อัปโหลดวิดีโอ" แล้วแต่หน้าต่างไม่ขึ้น', 'Clicked "Upload videos" but the dialog did not open'));
    } else {
      document.body.click();
      steps.push(L('กดปุ่ม Create แล้วแต่ไม่เจอเมนู "อัปโหลดวิดีโอ"', 'Clicked Create but the "Upload videos" menu was not found'));
    }
  } else steps.push(L('ไม่เจอปุ่ม Create', 'Create button not found'));

  // (3) ปุ่ม Upload ในหน้า Dashboard / Content
  const up = [...document.querySelectorAll<HTMLElement>(SEL.uploadMenuButton)].find(shown) ||
    byText(SEL.buttonLoose, TXT.uploadVideos) as HTMLElement | undefined;
  if (up) {
    (up.querySelector('button') || up).click();
    const input = await waitFor(fileInput, 10000);
    if (input) return { input };
    steps.push(L('กดปุ่ม Upload แล้วแต่หน้าต่างไม่ขึ้น', 'Clicked Upload but the dialog did not open'));
  } else steps.push(L('ไม่เจอปุ่ม Upload', 'Upload button not found'));

  return { err: steps.join(' · ') };
}

// ส่งไฟล์ให้หน้าต่างอัปโหลดโดยไม่ต้องเปิดหน้าต่างเลือกไฟล์ของ Windows
// วิธีที่ 1: ใส่ไฟล์ลง <input type=file> แล้วยิง event change
// วิธีที่ 2: จำลองการลากไฟล์มาวางบนพื้นที่ "Drag and drop" (Studio รองรับการลากวางอยู่แล้ว)
// ถือว่าสำเร็จเมื่อหน้าต่างออกจากหน้าจอ "เลือกไฟล์" (ขึ้นหน้ากรอกรายละเอียด / แถบอัปโหลด / ข้อความผิดพลาด)
async function injectUploadFile(input: HTMLInputElement, file: File): Promise<boolean> {
  const dlg = getDialog() as HTMLElement;
  const picker = () => dlg.querySelector(SEL.filePicker);
  const accepted = () => detailsOpen() || !!dialogError() || !shown(picker());
  const makeDT = () => {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  };
  injectingFile = true;
  try {
    await sleep(800); // ให้หน้าต่างเล่นแอนิเมชันเปิดจนเสร็จก่อน
    for (let round = 0; round < 3; round++) {
      const inp = dlg.querySelector<HTMLInputElement>('input[type=file][name="Filedata"]') || input; // Studio อาจสร้าง input ใหม่
      inp.files = makeDT().files;
      inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      if (await waitFor(accepted, 5000)) return true;
      if (TXT.invalidFormat.test(dlg.innerText || '')) return true; // Studio รับแล้วแต่ไฟล์ใช้ไม่ได้ -> แจ้งด้วย dialogError
    }

    // วิธีที่ 2
    const zone = picker()?.querySelector(SEL.pickerDropZone) || picker() || dlg;
    const r = zone!.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const type of ['dragenter', 'dragover', 'drop']) {
      zone!.dispatchEvent(new DragEvent(type, Object.assign({ dataTransfer: makeDT() }, base)));
      await sleep(150);
    }
    return !!(await waitFor(accepted, 8000));
  } finally {
    injectingFile = false;
  }
}

// เก็บข้อมูลโครงสร้างหน้าต่างอัปโหลด (ส่วนภาพปก / ช่องเลือกไฟล์ / ปุ่ม) สำหรับหาสาเหตุ
function diagnoseUploadDialog(): object {
  const dlg = getDialog();
  if (!dlg || !detailsOpen()) return { error: L('ยังไม่ได้เปิดหน้ากรอกรายละเอียด — เลือกไฟล์ในหน้าต่างอัปโหลดก่อน แล้วกดใหม่', 'Details page is not open yet — select a file in the upload dialog first, then try again') };
  const path = (e: Element) => {
    const c: string[] = [];
    for (let p: Element | null = e, i = 0; p && p !== dlg && i < 8; i++) {
      c.push(p.tagName.toLowerCase() + (p.id ? '#' + p.id : ''));
      p = p.parentElement || (p.getRootNode() && (p.getRootNode() as ShadowRoot).host);
    }
    return c.join(' < ');
  };
  const desc = (e: Element) => ({ path: path(e), shown: shown(e), aria: e.getAttribute('aria-label') || '', text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) });
  const all = [...dlg.querySelectorAll('*')];
  return {
    version: browser.runtime.getManifest().version,
    lang: document.documentElement.lang,
    fileInputs: [...dlg.querySelectorAll<HTMLInputElement>('input[type=file]')].map((i) => Object.assign(desc(i), { name: i.name, id: i.id, accept: i.accept })),
    thumbTags: [...new Set(all.map((e) => e.tagName.toLowerCase()).filter((t) => /thumb|still/.test(t)))],
    thumbIds: all.filter((e) => /thumb|still/i.test(e.id)).slice(0, 15).map(desc),
    thumbButtons: all.filter((e) => /^(button|ytcp-button|tp-yt-paper-button)$/i.test(e.tagName) &&
      TXT.thumbButton.test((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || ''))).slice(0, 10).map(desc),
    thumbImgs: all.filter((e) => e.tagName === 'IMG' && e.closest(SEL.thumbArea)).slice(0, 8).map((i) => ({ path: path(i), src: String((i as HTMLImageElement).src).slice(0, 40) })),
    areaFound: !!dlg.querySelector(SEL.thumbArea),
    selectors: checkSelectors(),
  };
}

// ข้อความสถานะการอัปโหลดในหน้าต่าง เช่น "Uploading 45% … 3 minutes left" / "Upload complete"
// selector ตัวไหนใน SEL หาไม่เจอแล้ว (ใช้ตอน Studio เปลี่ยนโครงหน้า — ส่งรายชื่อนี้ให้ผู้พัฒนา)
function checkSelectors() {
  const out: { missing: string[]; broken: string[] } = { missing: [], broken: [] };
  for (const [k, v] of Object.entries(SEL)) {
    for (const sel of typeof v === 'function' ? [v('on')] : ([] as string[]).concat(v)) {
      try { if (!document.querySelector(sel)) out.missing.push(k); } catch (e) { out.broken.push(k); }
    }
  }
  return out;
}

function uploadProgressText() {
  const dlg = getDialog();
  // element เฉพาะของการอัปมาก่อน · .progress-label เป็นคลาสทั่วไป อาจเป็นเปอร์เซ็นต์ของอย่างอื่นในหน้าต่าง
  const el = dlg?.querySelector(SEL.uploadProgress) || dlg?.querySelector(SEL.uploadProgressFallback);
  return el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) : '';
}
// @port-end

export {
  injectingFile, thumbUnusable, setThumbnail, handleMonetisation, handleAdSuitability, goToVisibility, ackNoticeDialogs,
  closeAfterDialogs, closeStudioUploadDialog, dialogError, openFilePicker, injectUploadFile, diagnoseUploadDialog,
  checkSelectors, uploadProgressText,
};
