import { collabRowMatches, normText, type InviteResult } from '../collab';
import { L } from '../i18n';
import { clickByText, clickIn, getDialog, isOff, isVisible, shownDialog, sleep, waitFor } from './automation';
import { SEL } from './sel';
import { TXT } from './txt';

// ===== Collaboration: เชิญช่องอื่นเป็นผู้ร่วมสร้าง =====
// Details → Show more → #collaboration-button → ytcp-video-collaborators-dialog
// ค้นหา @handle → เลือกแถวที่ #channel-info ขึ้นต้นด้วย @handle ตรงตัว → ytcp-video-collaborator-manage-dialog กด Create link
// → ytcp-video-collaborator-invite-link-dialog แสดงลิงก์ (span.invite-link) → ปิด → Save
// YouTube ไม่ส่งคำเชิญให้เอง ต้องส่งลิงก์ให้อีกฝ่ายเปิดแล้วกดยอมรับ (ลิงก์ใช้ได้หลังกด Save)
// พิมพ์ลงช่องค้นหาของหน้าต่างเชิญ — ใช้ execCommand เหมือน typeInto เพราะ Polymer ไม่รับรู้
// การ set .value ตรง ๆ แต่ไม่กด Enter (Enter จะไปเลือกผลลัพธ์แถวแรกซึ่งอาจเป็นช่องผิด)
async function typeSearch(input: HTMLInputElement, text: string): Promise<void> {
  if (!text && !input.value) return;
  input.focus();
  input.select?.();
  document.execCommand('selectAll', false, null as unknown as string);
  if (text) document.execCommand('insertText', false, text);
  else document.execCommand('delete', false, null as unknown as string);
  if (input.value !== text) input.value = text; // เผื่อเบราว์เซอร์ไม่รองรับ execCommand
  for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true }));
  await sleep(600); // ให้ Studio ยิงค้นหา (debounce)
}
async function inviteCollaborators(handles: string[], dlg: Element | null = getDialog()): Promise<InviteResult> {
  // saved: null = ไม่มีอะไรต้องบันทึก, true = บันทึกแล้วจริง, false = บันทึกไม่สำเร็จ
  const res: InviteResult = { links: [], errors: [], skipped: [], saved: null };
  if (!handles.length) return res;
  let btn: HTMLElement | null = dlg!.querySelector<HTMLElement>(SEL.collabButton);
  if (!isVisible(btn)) {
    const more = dlg!.querySelector<HTMLElement>(SEL.showMore);
    if (more && TXT.showMoreText.test(more.textContent!)) more.click();
    btn = await waitFor(() => { const b = dlg!.querySelector<HTMLElement>(SEL.collabButton); return isVisible(b) && b; }, 4000) as HTMLElement | null;
  }
  if (!btn) { res.errors.push(L('ช่องนี้ไม่มีปุ่ม Invite a collaborator', 'This channel has no "Invite a collaborator" button')); return res; }
  btn.scrollIntoView({ block: 'center' });
  (btn.querySelector('button') || btn).click();
  const cd = await waitFor(() => shownDialog(SEL.collabDialog), 6000);
  if (!cd) { res.errors.push(L('เปิดหน้าต่างเชิญผู้ร่วมสร้างไม่ได้', 'Could not open the collaborator dialog')); return res; }

  const existing = new Set([...cd.querySelectorAll(SEL.collabExistingName)].map((e) => normText(e.textContent).toLowerCase()).filter(Boolean));
  for (const handle of handles.slice(0, 10)) {
    // #search-input เป็น host ของ paper-input ในบางเวอร์ชัน — ต้องลงไปถึง <input> จริง
    // และพิมพ์ด้วย typeInto (execCommand) เหมือนช่องอื่น ๆ ของสคริปต์ การ set .value ตรง ๆ
    // Polymer ไม่รับรู้ ทำให้ไม่มีผลการค้นหาขึ้นมาเลย
    const host = cd.querySelector<HTMLElement>(SEL.collabSearch);
    const input = host && (host.matches('input,textarea') ? host as HTMLInputElement : host.querySelector<HTMLInputElement>('input,textarea'));
    if (!input) { res.errors.push(L(`${handle}: ไม่พบช่องค้นหาในหน้าต่างเชิญ`, `${handle}: search box not found in the invite dialog`)); break; }
    await typeSearch(input, '');     // ล้างคำค้นเดิมก่อน ไม่งั้นแถวของ handle ก่อนหน้ายังค้างอยู่
    await typeSearch(input, handle);
    const row = await waitFor(() => [...cd.querySelectorAll<HTMLElement>(SEL.collabOption)].find((r) =>
      isVisible(r) && collabRowMatches(r.querySelector(SEL.collabChannelInfo)?.textContent, handle)), 8000);
    if (!row) {
      const limit = isVisible(cd.querySelector(SEL.collabLimitReached));
      res.errors.push(limit ? L(`${handle}: เชิญครบจำนวนสูงสุดแล้ว`, `${handle}: invitation limit reached`) : L(`${handle}: ไม่พบช่องนี้`, `${handle}: channel not found`));
      if (limit) break;
      continue;
    }
    // ช่องที่เป็นผู้ร่วมสร้างอยู่แล้ว — เทียบทั้งชื่อที่แสดงและ @handle เพราะรายชื่อเดิมอาจขึ้นได้ทั้งสองแบบ
    const rowName = normText(row.querySelector(SEL.collabDisplayName)?.textContent).toLowerCase();
    if (existing.has(rowName) || existing.has(handle.toLowerCase())) { res.skipped.push(handle); continue; }
    row.click();
    const md = await waitFor(() => shownDialog(SEL.collabManageDialog), 6000);
    if (!md || !clickIn(md, SEL.collabCreateLink)) { res.errors.push(L(`${handle}: ไม่พบปุ่ม Create link`, `${handle}: "Create link" button not found`)); continue; }
    const ld = await waitFor(() => shownDialog(SEL.collabLinkDialog), 8000);
    const link = ld && (await waitFor(() => normText(ld.querySelector(SEL.collabInviteLink)?.textContent), 4000));
    if (link) res.links.push({ handle, link });
    else res.errors.push(L(`${handle}: ไม่ได้ลิงก์คำเชิญ`, `${handle}: no invitation link`));
    if (ld) clickIn(ld, SEL.dialogClose) || clickByText(ld, TXT.okOrGotIt) || clickIn(ld, SEL.dialogCancel);
    await waitFor(() => !shownDialog(SEL.collabLinkDialog), 3000);
    // ไม่กดปิดหน้าต่าง manage เอง (อาจทิ้งคำเชิญที่เพิ่งสร้าง) แค่รอให้มันปิดเอง
    await waitFor(() => !shownDialog(SEL.collabManageDialog), 3000);
    await sleep(400);
  }
  // ต้องกด Save ให้สำเร็จจริง ๆ ไม่งั้นคำเชิญที่สร้างไว้จะหายไปทั้งหมดตอนปิดหน้าต่าง
  // (บั๊กเดิม: clickIn คืน true แม้ปุ่มยังกดไม่ได้ และผลของ waitFor ถูกทิ้ง → รายงานว่าสำเร็จทั้งที่ไม่ได้บันทึก)
  if (!res.links.length) {
    clickIn(cd, SEL.dialogCancel) || clickByText(cd, TXT.cancelButton) || clickIn(cd, SEL.dialogClose);
    await waitFor(() => !shownDialog(SEL.collabDialog), 6000);
    return res;
  }
  // ปุ่ม Save ต้องเป็นของหน้าต่างหลัก ไม่ใช่ของหน้าต่างซ้อน (manage / link) ที่อาจยังค้างอยู่
  const own = (b: Element) => !b.closest(`${SEL.collabManageDialog},${SEL.collabLinkDialog}`);
  const saveBtn = () => [...cd.querySelectorAll<HTMLElement>(SEL.dialogSave)].find((b) => own(b) && isVisible(b) && !isOff(b)) ||
    [...cd.querySelectorAll<HTMLElement>(SEL.button)].find((b) => own(b) && isVisible(b) && !isOff(b) && TXT.saveButton.test(normText(b.textContent)));
  const clickedSave = await waitFor(() => { const b = saveBtn(); if (!b) return false; (b.querySelector('button') || b).click(); return true; }, 8000, 500);
  const closed = clickedSave && await waitFor(() => !shownDialog(SEL.collabDialog), 10000);
  res.saved = !!closed;
  if (!clickedSave) res.errors.push(L('ปุ่ม Save ในหน้าต่างเชิญกดไม่ได้ — คำเชิญยังไม่ถูกบันทึก', 'The invite dialog\'s Save button never became clickable — the invitations were not saved'));
  else if (!closed) res.errors.push(L('กด Save ในหน้าต่างเชิญแล้วแต่หน้าต่างไม่ปิด — คำเชิญอาจยังไม่ถูกบันทึก', 'Clicked Save in the invite dialog but it did not close — the invitations may not be saved'));
  return res;
}

export { typeSearch, inviteCollaborators };
