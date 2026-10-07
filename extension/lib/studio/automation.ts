import { normText } from '../collab';
import { SEL } from './sel';
import { settings } from './state';
import { TXT } from './txt';

// @port-begin
// ===== Studio DOM automation =====
// จังหวะการทำงาน: คูณเวลาพักและเวลารอทั้งหมด (หน้า Studio โหลดช้า -> เลือก "ช้า" หรือ "ช้ามาก")
const PACE: Record<string, number> = { normal: 1, slow: 1.6, slower: 2.5 };
const pace = () => PACE[settings.pace] || 1;
const T = (ms: number) => ms * pace();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, T(ms)));
const isVisible = (el: Element | null | undefined): el is Element => !!el && el.isConnected && el.getClientRects().length > 0;

// แท็บ Studio อยู่เบื้องหลัง (ปล่อยคิวแล้วไปทำอย่างอื่น) Chrome หน่วง setTimeout ได้ถึงนาทีละครั้ง
// เจอจริง: sleep 100ms กลายเป็นหลายสิบวินาที -> เดิมหมดเวลาโดยเช็กไปแค่ครั้งเดียว ทั้งที่ของขึ้นแล้ว
// จึงเช็กอย่างน้อย 3 ครั้ง และเช็กซ้ำอีกครั้งหลังหมดเวลาก่อนยอมแพ้
async function waitFor<V>(fn: () => V, timeout = 10000, step = 200): Promise<V | null> {
  const t0 = Date.now();
  const limit = T(timeout);
  for (let tries = 0; Date.now() - t0 < limit || tries < 3; tries++) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return fn() || null;
}

const getDialog = () => document.querySelector(SEL.dialog);
const getTitleBox = (dlg: Element | null) => dlg && dlg.querySelector<HTMLElement>(SEL.titleBox);
const getDescBox = (dlg: Element | null) => dlg && dlg.querySelector<HTMLElement>(SEL.descBox);
// ช่องกรอกรายละเอียดมีอยู่ 2 ที่ และใช้ selector ชุดเดียวกัน:
//   - ในหน้าต่างอัปโหลด (ytcp-uploads-dialog)
//   - ในหน้าแก้ไขคลิปที่อัปไปแล้ว /video/<id>/edit (ytcp-video-details-section)
// ของเดิมมองหาแต่หน้าต่างอัปโหลด ปุ่ม "ใส่ลงหน้าต่างที่เปิดอยู่" จึงขึ้นว่า
// "ยังไม่ได้เปิดหน้ากรอกรายละเอียด" ทั้งที่เปิดหน้าแก้ไขคลิปอยู่
const getDetailsHost = () => {
  const dlg = getDialog();
  return getTitleBox(dlg) ? dlg : document.querySelector(SEL.detailsSection);
};
const onEditPage = () => !getDialog() && !!document.querySelector(SEL.detailsSection);
const detailsOpen = () => isVisible(getTitleBox(getDetailsHost()));
// หน้าต่างอัปโหลดยังเปิดอยู่ (ขั้นไหนก็ได้) — ใช้ตัดสินว่าผู้ใช้กด Save/ปิดหน้าต่างแล้วหรือยัง
const uploadDialogOpen = () => {
  const d = getDialog()?.querySelector(SEL.paperDialog);
  return isVisible(d) && !isVisible(getDialog()?.querySelector(SEL.pickerSelectBtn));
};
const findTagsInput = (dlg: Element) =>
  dlg.querySelector<HTMLInputElement>(
    SEL.tagsInput
  );

// พิมพ์ลงช่อง contenteditable ผ่าน execCommand เพื่อให้ Studio รับรู้การเปลี่ยนแปลง
function setEditable(el: HTMLElement, text: string) {
  el.focus();
  document.execCommand('selectAll', false, null as unknown as string);
  document.execCommand('delete', false, null as unknown as string);
  text.split('\n').forEach((line: string, i: number) => {
    if (i) document.execCommand('insertLineBreak', false, null as unknown as string);
    if (line) document.execCommand('insertText', false, line);
  });
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.blur();
}

async function setTags(dlg: Element, tags: string[]) {
  if (!tags.length) return true;
  let input: HTMLInputElement | false | null = findTagsInput(dlg);
  if (!isVisible(input)) {
    const more = dlg.querySelector<HTMLElement>(SEL.showMore); // ปุ่ม "แสดงเพิ่มเติม"
    if (more) more.click();
    input = await waitFor(() => {
      const i = findTagsInput(dlg);
      return isVisible(i) && i;
    }, 4000);
  }
  if (!input) return false;
  input.focus();
  document.execCommand('insertText', false, tags.join(',') + ',');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(200);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  input.blur();
  return true;
}

async function fillDetails({ title, description, tags }: { title: string; description: string; tags: string[] }): Promise<boolean> {
  const dlg = getDetailsHost()!;
  setEditable(getTitleBox(dlg)!, title);
  const descBox = getDescBox(dlg);
  if (descBox && description) setEditable(descBox, description);
  const notKids = dlg.querySelector<HTMLElement>(SEL.notForKids);
  if (notKids) notKids.click();
  const tagsOk = await setTags(dlg, tags); // เปิด "แสดงเพิ่มเติม" ให้ด้วย
  if (settings.alteredContent !== 'skip') {
    const yes = settings.alteredContent === 'yes';
    const name = yes ? 'VIDEO_HAS_ALTERED_CONTENT_YES' : 'VIDEO_HAS_ALTERED_CONTENT_NO';
    // ส่วน "AI use" : ปุ่มตัวเลือก Yes / No ใต้หัวข้อนั้น
    const aiRadio = () => {
      const byName = dlg.querySelector<HTMLElement>(`tp-yt-paper-radio-button[name="${name}"]`);
      if (isVisible(byName)) return byName;
      const head = leafByText(dlg, TXT.aiUseHeading);
      let p: Element | null | undefined = head;
      for (let i = 0; p && i < 6; i++, p = p.parentElement) {
        const r = [...p.querySelectorAll<HTMLElement>(SEL.radio)].find((x) => isVisible(x) && (yes ? TXT.yes : TXT.no).test((x.textContent || '').trim()));
        if (r) return r;
      }
      return null;
    };
    const r = await waitFor(aiRadio, 3000);
    if (r && r.getAttribute('aria-checked') !== 'true') r.click();
  }
  if (settings.paidPromotion !== 'skip') {
    const r = radioByText(settings.paidPromotion === 'yes'
      ? TXT.paidPromoYes
      : TXT.paidPromoNo);
    if (r && r.getAttribute('aria-checked') !== 'true') r.click();
  }
  if (settings.category) await setCategory(dlg, settings.category);
  return tagsOk;
}
const isOff = (el: (HTMLElement & { disabled?: boolean }) | null | undefined) => !el || el.disabled || el.hasAttribute('disabled') ||
  el.getAttribute('aria-disabled') === 'true' || !!el.closest('[disabled],[aria-disabled="true"]');
// กดปุ่มในหน้าต่าง — ต้องเห็นปุ่มและกดได้จริง ไม่งั้นคืน false (เดิมคืน true ทุกครั้งที่ "เจอ element"
// ปุ่ม Save ที่ยังกดไม่ได้จึงถูกนับว่ากดสำเร็จ แล้วรายงานว่าเชิญเสร็จทั้งที่ไม่ได้บันทึกอะไรเลย)
const clickIn = (root: Element | null, sel: string) => {
  const host = root && [...root.querySelectorAll<HTMLElement>(sel)].find((b) => isVisible(b) && !isOff(b));
  if (!host) return false;
  (host.querySelector('button') || host).click();
  return true;
};
// ปุ่มในหน้าต่างที่หา id ไม่เจอ (YouTube เปลี่ยน id) → หาจากข้อความบนปุ่มแทน
const clickByText = (root: Element | null, re: RegExp) => {
  const host = root && [...root.querySelectorAll<HTMLElement>(SEL.button)]
    .find((b) => isVisible(b) && !isOff(b) && re.test(normText(b.textContent)));
  if (!host) return false;
  (host.querySelector('button') || host).click();
  return true;
};
const shownDialog = (tag: string) => { const d = document.querySelector(tag); return d && isVisible(d.querySelector(SEL.paperDialog)) ? d : null; };
// เลือกหมวดหมู่ (เทียบข้อความตามที่ Studio แสดง เช่น "Music" หรือ "เพลง")
async function setCategory(dlg: Element, text: string) {
  const trig = dlg.querySelector<HTMLElement>(SEL.categoryTrigger);
  if (!trig || trig.textContent!.includes(text)) return;
  trig.click();
  const item = await waitFor(() =>
    [...document.querySelectorAll<HTMLElement>(SEL.listItem)].find((i) => isVisible(i) && i.textContent!.trim() === text), 3000);
  if (item) item.click();
  else document.body.click();
}

// อัปภาพปก (ช่องนี้จะมีเฉพาะช่องที่ยืนยันตัวตนด้วยเบอร์โทรแล้ว) คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
// หา element จากข้อความ (เทียบทั้งข้อความ) ภายใน root
const leafByText = (rootEl: Element, re: RegExp) =>
  [...rootEl.querySelectorAll('*')].find((e) => e.childElementCount === 0 && isVisible(e) && re.test((e.textContent || '').trim()));
const clickableOf = (el: Element | null | undefined) => el && (el.closest(SEL.thumbClickable) || el);
// ----- ขั้นใหม่ระหว่าง Details กับ Visibility -----
const radioByText = (re: RegExp) => [...(getDialog()?.querySelectorAll<HTMLElement>(SEL.radio) || [])]
  .find((r) => isVisible(r) && re.test((r.textContent || '').trim()));
const buttonByText = (rootEl: Element, re: RegExp) => [...rootEl.querySelectorAll(SEL.button)]
  .find((b) => isVisible(b) && re.test((b.textContent || '').trim()) && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true');
// เปิดหน้าต่างอัปโหลดของ Studio แล้วคืนค่า <input type=file>
// element ของ Studio บางตัวเป็น display:contents (ไม่มีกล่องของตัวเอง) -> ดูว่ามีลูกตัวไหนแสดงอยู่หรือเปล่า
const shown = (el: Element | null | undefined) => !!el && (isVisible(el) || [...(el as Element).querySelectorAll('*')].some((c) => c.getClientRects().length > 0));
const byText = (sel: string, re: RegExp) => [...document.querySelectorAll(sel)].find((e) => shown(e) && re.test((e.textContent || '').trim()));
// @port-end

export {
  PACE, pace, T, sleep, isVisible, waitFor, getDialog, getTitleBox, getDescBox, getDetailsHost, onEditPage,
  detailsOpen, uploadDialogOpen, findTagsInput, setEditable, setTags, fillDetails, isOff, clickIn, clickByText,
  shownDialog, setCategory, leafByText, clickableOf, radioByText, buttonByText, shown, byText,
};
