// ==UserScript==
// @name         YouTube Upload Presets
// @namespace    yt-upload-presets
// @version      4.27.0
// @description  Bulk-upload videos to YouTube Studio with presets and scheduling, plus scan and trim copyright-claimed segments
// @description:th  อัปโหลดหลายคลิปพร้อมพรีเซ็ต/ตั้งเวลา + สแกนและตัดส่วนที่ติดลิขสิทธิ์ (รวม YT Studio Helper) ใน YouTube Studio
// @match        https://studio.youtube.com/*
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        unsafeWindow
// @grant        GM_info
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js
// @downloadURL  https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ===== ภาษา (EN / TH) =====
  // ข้อความทุกจุดเขียนคู่กันเป็น L('ไทย', 'English') · สลับภาษาในแท็บตั้งค่าแล้วหน้าจะรีโหลด
  // ผู้ใช้ใหม่เริ่มที่ EN ส่วนเครื่องที่ติดตั้งไว้ก่อน v4.6.0 ใช้ TH ต่อ
  const LANG = (GM_getValue('settings') || {}).lang || (GM_getValue('presets') !== undefined ? 'th' : 'en');
  const L = (th, en) => (LANG === 'en' ? en : th);
  const LOCALE = LANG === 'en' ? 'en-GB' : 'th-TH';

  // ===== ข้อความที่ Studio แสดง =====
  // regex ทุกตัวที่เทียบกับข้อความบนหน้า Studio อยู่ในนี้ที่เดียว — เพิ่มภาษาใหม่ก็แก้แค่ที่นี่
  // (ต่างจาก L() ที่เป็นข้อความของสคริปต์เอง — ตัวนี้คือข้อความที่ YouTube เขียนบนหน้า)
  const TXT = {
    // --- ใช้ได้ทั้งอังกฤษและไทย ---
    acceptInvite: /^(accept|accept invitation|accept invite|ยอมรับ|ยอมรับคำเชิญ)$/i, // ปุ่มยอมรับคำเชิญสิทธิ์ช่อง
    aboutInvite: /invit|collaborat|เชิญ|ผู้ร่วมสร้าง/i, // กล่องข้อความต้องพูดถึงคำเชิญ (กันกดปุ่มผิด)
    saveButton: /^(save|บันทึก)$/i, // ปุ่ม Save ของหน้าต่าง (ใช้ตอนหา id ไม่เจอ)
    cancelButton: /^(cancel|discard|ยกเลิก|ละทิ้ง)$/i, // ปุ่ม Cancel ของหน้าต่าง (ใช้ตอนหา id ไม่เจอ)
    aiUseHeading: /^(ai use|การใช้ ai|altered content)$/i, // หัวข้อ "AI use" ในหน้ารายละเอียด
    yes: /^(yes|ใช่)$/i, // ปุ่มตัวเลือก Yes
    no: /^(no|ไม่|ไม่ใช่)$/i, // ปุ่มตัวเลือก No
    paidPromoYes: /^yes, my video includes paid promotion|^ใช่ วิดีโอของฉันมีการโปรโมตแบบชำระเงิน/i, // มีการโปรโมตแบบชำระเงิน
    paidPromoNo: /^no, my video doesn.t include paid promotion|^ไม่ วิดีโอของฉันไม่มีการโปรโมตแบบชำระเงิน/i, // ไม่มีการโปรโมตแบบชำระเงิน
    showMoreText: /show more|แสดงเพิ่มเติม/i, // ปุ่ม "แสดงเพิ่มเติม" ในหน้ารายละเอียด
    uploadFileBox: /^(upload file|upload thumbnail|อัปโหลดไฟล์|อัปโหลดภาพขนาดย่อ)$/i, // กล่อง "Upload file" ของภาพปก
    thumbError: /(thumbnail|image|ภาพ).*(error|fail|large|ใหญ่|ไม่)/i, // ข้อความผิดพลาดของภาพปก
    adSuitability: /ad suitability|ความเหมาะสมกับโฆษณา/i, // หัวข้อขั้น Ad suitability
    questionnaireLocked: /questionnaire is locked|is locked since|ถูกล็อก/i, // แบบสอบถามถูกล็อก (ตอบไว้แล้ว)
    noneOfTheAbove: /none of the above|ไม่มีข้อใด/i, // ตัวเลือก "None of the above"
    ratingSection: /rating|suitab|คะแนน|ความเหมาะสม/i, // ส่วนให้คะแนนความเหมาะสม
    submitRating: /^(submit|submit rating|confirm|ส่ง|ยืนยัน)$/i, // ปุ่มส่งคะแนน
    dismissNotice: /^(got it|ok|okay|close|dismiss|เข้าใจแล้ว|รับทราบ|ตกลง|ปิด)$/i, // ปุ่มรับทราบของป๊อปอัปแจ้งเตือน
    noticeBody: /still checking|checks|checking your content|before your video is published|video uploading|keep this browser tab open|once uploading|will be set to|ยังตรวจ|การตรวจสอบ|กำลังอัปโหลด/i, // เนื้อหาป๊อปอัป "เรายังตรวจคลิปอยู่"
    uploadVideos: /^(upload videos?|อัปโหลดวิดีโอ)$/i, // เมนู "Upload videos"
    invalidFormat: /invalid file format|รูปแบบไฟล์ไม่ถูกต้อง/i, // Studio ไม่รับชนิดไฟล์นี้
    thumbButton: /upload|thumbnail|ภาพปก|ภาพขนาดย่อ|อัปโหลดไฟล์/i, // ปุ่มที่เกี่ยวกับภาพปก (ใช้ตอนตรวจปัญหา)
    uploadLimit: /limit|ขีดจำกัด|daily/i, // ชนขีดจำกัดการอัปต่อวัน -> หยุดคิว
    uploadPct: /(\d{1,3})\s*%/, // เปอร์เซ็นต์ในข้อความความคืบหน้าของ Studio
    // --- ยังต้องใช้ Studio ภาษาอังกฤษ (ส่วนลิขสิทธิ์ — ดู studioIsEnglish) ---
    monetStatus: /moneti[sz]ation status/i, // ปุ่มแก้สถานะการสร้างรายได้
    nextOrDone: /^(Next|Done)$/i, // ปุ่ม Next / Done ในแบบสอบถาม
    tellUsWhats: /Tell us what.s in your video/i, // หัวข้อแบบสอบถามโฆษณา
    submit: /^Submit$/i, // ปุ่ม Submit
    noneOfAbove: /None of the above/i, // ตัวเลือก None of the above
    confirmChanges: /^Confirm changes$/i, // ปุ่ม Confirm changes
    confirmChangesLoose: /Confirm changes/i, // ข้อความ Confirm changes (หาในหน้าต่าง)
    acknowledge: /acknowledge/i, // ช่องติ๊ก I acknowledge
    acknowledgeFull: /I acknowledge/i, // ข้อความ I acknowledge
    cancelOrClose: /^(Cancel|Close)$/i, // ปุ่ม Cancel / Close
    takeAction: /^Take action$/i, // ปุ่ม Take action ในหน้า claim
    trimOutSegment: /^Trim out segment$/i, // ตัวเลือก Trim out segment
    continueBtn: /^Continue$/i, // ปุ่ม Continue
    okOrGotIt: /^(OK|Got it|Done|Close)$/i, // ปุ่มปิดหน้าต่างแจ้งผล
    trimTimes: /Start time\s*([\d:]+)[\s\S]*?End time\s*([\d:]+)/, // ช่วงเวลาที่ตัด (อ่านไปโชว์ใน log)
  };
  // ===== ชื่อ element ของ Studio =====
  // selector ทุกตัวที่ผูกกับโครงหน้าของ Studio อยู่ในนี้ที่เดียว — YouTube เปลี่ยนหน้า แก้แค่ที่นี่
  // ดูว่าตัวไหนหาไม่เจอแล้วได้จาก ตั้งค่า > "คัดลอกข้อมูลหน้าต่างอัปโหลด" (ส่วน selectors)
  const SEL = {
    // --- หน้าต่างอัปโหลด ---
    dialog: 'ytcp-uploads-dialog',
    paperDialog: 'tp-yt-paper-dialog',
    anyDialog: 'tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]',
    nestedDialog: 'tp-yt-paper-dialog, [role="dialog"]',
    noticeDialog: 'tp-yt-paper-dialog, ytcp-dialog, [role="dialog"], [role="alertdialog"]',
    closeDialogBtn: '#ytcp-uploads-dialog-close-button button, #ytcp-uploads-dialog-close-button, #close-button, button[aria-label="Close"], button[aria-label="ปิด"]',
    // หน้าต่างที่ Studio เปิดต่อหลังบันทึก (ปิดให้อัตโนมัติ)
    afterDialogs: ['ytcp-video-share-dialog', 'ytcp-uploads-still-processing-dialog', 'ytcp-prechecks-warning-dialog'],
    // --- เลือกไฟล์ ---
    filePicker: 'ytcp-uploads-file-picker',
    pickerSelectBtn: 'ytcp-uploads-file-picker #select-files-button',
    selectFilesBtn: '#select-files-button',
    pickerDropZone: '#content',
    fileInput: 'ytcp-uploads-file-picker input[type=file], input[type=file][name="Filedata"], input[type=file]',
    createButton: '#create-icon, ytcp-button#create-icon, ytcp-icon-button#create-icon, button[aria-label="Create"], button[aria-label="สร้าง"], ytcp-button[aria-label="Create"], ytcp-button[aria-label="สร้าง"]',
    menuItem: 'tp-yt-paper-item, ytcp-text-menu [role="menuitem"], [role="menuitem"]',
    firstMenuItem: 'tp-yt-paper-item#text-item-0, #text-item-0',
    uploadMenuButton: '#upload-icon, #upload-button, ytcp-button#upload-button, ytcp-icon-button#upload-icon',
    uploadProgress: 'ytcp-video-upload-progress, ytcp-video-upload-progress-hover',
    uploadProgressFallback: '.progress-label', // คลาสทั่วไป — ใช้เฉพาะตอนไม่พบ element เฉพาะข้างบน
    // --- หน้ากรอกรายละเอียด ---
    titleBox: '#title-textarea #textbox',
    descBox: '#description-textarea #textbox',
    tagsInput: '#tags-container input#text-input, ytcp-form-input-container#tags-container input, input[aria-label*="tag" i], input[aria-label*="แท็ก"]',
    showMore: '#toggle-button',
    notForKids: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
    categoryTrigger: '#category ytcp-dropdown-trigger, #category-container ytcp-dropdown-trigger',
    listItem: 'tp-yt-paper-listbox tp-yt-paper-item',
    videoLink: 'ytcp-video-info a[href*="youtu"], .video-url-fadeable a[href*="youtu"], a[href*="youtu.be/"]',
    thumbArea: 'ytcp-thumbnails-compact-editor-uploader, ytcp-thumbnail-uploader, ytcp-video-custom-still-editor, #still-picker, ytcp-thumbnails-compact-editor, [id*="thumbnail" i]',
    thumbClickable: 'button, [role="button"], ytcp-button, tp-yt-paper-button, ytcp-thumbnail-uploader, ytcp-thumbnails-compact-editor-uploader',
    detailsSection: 'ytcp-video-details-section',
    // --- เชิญผู้ร่วมสร้าง (Collab) ---
    collabButton: '#collaboration-button',
    collabDialog: 'ytcp-video-collaborators-dialog',
    collabSearch: '#search-input',
    collabOption: 'tp-yt-paper-item[role="option"]',
    collabChannelInfo: '#channel-info',
    collabDisplayName: '#display-name',
    collabLimitReached: '#limit-reached-message',
    collabExistingName: '.collaborator .channel-name',
    collabManageDialog: 'ytcp-video-collaborator-manage-dialog',
    collabCreateLink: '#create-link-button',
    collabLinkDialog: 'ytcp-video-collaborator-invite-link-dialog',
    collabInviteLink: '.invite-link',
    // --- หน้ารับคำเชิญสิทธิ์ช่อง ---
    inviteClickable: 'button, ytcp-button, tp-yt-paper-button, yt-button-shape button, a[role="button"]',
    inviteContainer: 'ytcp-collaboration-acceptance-dialog, tp-yt-paper-dialog, ytcp-dialog, [role="dialog"], ytd-popup-container, form, main',
    inviteDecline: '#deny-button', // ปุ่ม Decline คู่กับ Accept บนบัตรคำเชิญ — ใช้ยืนยันว่าหน้านี้มีคำเชิญจริง
    inviteListDialog: 'ytcp-video-collaborations-list-dialog', // รายการ "Collaboration requests" (มีหลายคลิป)
    inviteRequestRow: 'ytcp-video-row', // แถวคำเชิญ 1 คลิป — ใช้ได้เฉพาะเมื่อค้นภายใน inviteListDialog เท่านั้น
    inviteRowOpen: '#thumbnail-anchor', // กดรูปย่อของแถวเพื่อเปิดหน้าต่างยอมรับ
    inviteRowTitle: '#video-title',
    // --- หน้าสลับช่องของ YouTube (www.youtube.com/channel_switcher → /account) ---
    switcherItem: 'ytd-account-item-renderer', // หนึ่งแถว = หนึ่งช่อง (ไม่มี UC id ในแถว มีแต่ชื่อกับ @handle)
    // --- Monetisation / Ad suitability ---
    monetBox: 'ytcp-video-monetization',
    monetDialog: 'ytcp-video-monetization-edit-dialog',
    monetEditBtn: 'ytcp-icon-button, [role="button"], button',
    contentRatings: 'ytcp-uploads-content-ratings',
    submitQuestionnaire: '#submit-questionnaire-button',
    monetRadio: (on) => `#radio-${on}`, // on | off
    // --- Visibility / ตั้งเวลาปล่อย ---
    nextButton: '#next-button',
    doneButton: '#done-button',
    scheduleRadio: '#second-container-expand-button, ytcp-visibility-scheduler #schedule-radio-button, #schedule-radio-button',
    datePickerTrigger: '#datepicker-trigger',
    datePickerInput: 'ytcp-date-picker tp-yt-paper-input input, ytcp-date-picker input',
    timeInput: '#time-of-day-container input, ytcp-datetime-picker tp-yt-paper-input input',
    timeOption: 'tp-yt-paper-item, [role="option"], ytcp-text-menu tp-yt-paper-item',
    // --- แถบด้านข้าง (ชื่อช่อง) ---
    channelName: 'ytcp-navigation-drawer #entity-name, #entity-name',
    channelHandleBox: 'ytcp-navigation-drawer #entity-subtitle, ytcp-navigation-drawer #sub-title, ytcp-navigation-drawer', // ดึง @handle ด้วย regex จากกล่องนี้
    channelAvatar: 'ytcp-navigation-drawer #avatar img, ytcp-navigation-drawer img.image-thumbnail, ytcp-navigation-drawer img, #avatar-btn img',
    // --- ปุ่ม / ตัวเลือกทั่วไปของ Studio ---
    radio: 'tp-yt-paper-radio-button, [role="radio"]',
    radioOn: 'tp-yt-paper-radio-button#radio-on, tp-yt-paper-radio-button[name="ON"]',
    button: 'button, ytcp-button, tp-yt-paper-button',
    buttonLoose: 'ytcp-button, button',
    buttonOrYtcp: 'button, ytcp-button',
    clickable: 'button, ytcp-button, tp-yt-paper-button, [role="button"], ytcp-button-shape button',
    iconOrButton: 'ytcp-icon-button, button',
    iconButton: 'ytcp-icon-button',
    checkboxLit: 'ytcp-checkbox-lit',
    checkboxHost: 'ytcp-checkbox-lit, tp-yt-paper-checkbox, ytcp-checkbox',
    checkboxAny: '[role="checkbox"], input[type="checkbox"], ytcp-checkbox-lit',
    dialogSave: '#save-button',
    dialogCancel: '#cancel-button',
    dialogClose: '#close-button',
    // --- หน้า claim / ตัด / เปิดโฆษณา ---
    claimRow: 'ytcr-video-content-list-row',
    trimDialog: 'ytcr-editing-tool-dialog',
    trimContinue: '#continue-button',
    studioSaveHost: 'ytcp-button#save',
  };

  // ===== collab: การเทียบข้อความ และการสรุปผล (ไม่แตะ DOM — มีเทสต์ใน test/collab.test.mjs) =====
  const normText = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const parseHandles = (v) => String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('@') ? s : '@' + s));

  // แถวผลค้นหา (#channel-info) ไม่มีตัวคั่นที่แน่นอน — เจอได้ทั้ง "@handle",
  // "@handle · 1.2K subscribers" และ "@handle\n1.2K subscribers" → ยอมรับได้หมด
  // แต่ต้องจบที่ตัวอักษรที่ใช้ในชื่อ handle ไม่ได้ ไม่งั้น @thai จะไปตรงกับ @thaibeats
  const collabRowMatches = (info, handle) => {
    const want = String(handle || '').toLowerCase();
    if (want.length < 2 || !want.startsWith('@')) return false;
    const got = normText(info).toLowerCase();
    if (!got.startsWith(want)) return false;
    const next = got.charAt(want.length);
    return next === '' || !/[a-z0-9._-]/.test(next);
  };

  // ปุ่มยอมรับคำเชิญ: ดูทั้ง aria-label และข้อความในปุ่ม (เดิมดู aria-label ก่อนแล้วไม่ถอยไปดูข้อความ
  // ปุ่มที่มี aria-label ยาว ๆ เลยไม่เคยตรง) และยุบช่องว่าง/ขึ้นบรรทัดใหม่จากเทมเพลตก่อนเทียบ
  const acceptLabelMatches = (...labels) => labels.some((l) => normText(l) && TXT.acceptInvite.test(normText(l)));

  // แถวในหน้าสลับช่องมีแต่ชื่อช่องกับ @handle (ไม่มี UC id) จึงต้องเทียบด้วย handle
  // ต้องจบขอบคำด้วย ไม่งั้น @thaibeats จะไปตรงกับแถวของ @thaibeatsofficial
  const switcherRowMatches = (rowText, handle, name) => {
    const t = normText(rowText);
    if (!t) return false;
    const h = String(handle || '').replace(/^@/, '').toLowerCase();
    if (h) return new RegExp('@' + h.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?![a-z0-9._-])', 'i').test(t);
    const n = normText(name).toLowerCase();
    return !!n && t.toLowerCase().startsWith(n);
  };

  // สรุปผลของคลิปหนึ่ง — "สำเร็จ" ต้องแปลว่า YouTube บันทึกให้จริงเท่านั้น
  // res.saved: true = กด Save แล้วหน้าต่างปิดจริง, false = กดไม่สำเร็จ, null = ไม่มีอะไรต้องบันทึก
  function inviteOutcome(res) {
    const invited = res.links.map((x) => x.handle).join(', ');
    const parts = [
      res.links.length ? L(`เชิญ ${invited}`, `Invited ${invited}`) : '',
      res.skipped.length ? L(`มีอยู่แล้ว ${res.skipped.join(', ')}`, `Already added ${res.skipped.join(', ')}`) : '',
      ...res.errors,
    ].filter(Boolean);
    const persisted = res.links.length ? res.saved === true : true;
    const worked = persisted && (res.links.length || (res.skipped.length && !res.errors.length));
    return { state: worked ? 'done' : 'failed', msg: parts.join(' · ') || L('ไม่มีอะไรเปลี่ยน', 'Nothing changed') };
  }

  // ===== รับคำเชิญสิทธิ์ช่องอัตโนมัติ =====
  // เปิดลิงก์ "ACCEPT INVITATION" จากอีเมล noreply@youtube.com แล้วสคริปต์กดยอมรับให้
  // กดเฉพาะปุ่ม Accept/ยอมรับ ที่อยู่ในกล่องข้อความที่พูดถึงคำเชิญเท่านั้น
  // ลิงก์คำเชิญ /channel/<เรา>/collaboration/<เจ้าของ> ถูก YouTube เด้งต่อไปที่
  //   /channel/<เรา>/videos/upload?d=acd&…&inviterChannelId=<เจ้าของ>
  // คำว่า collaboration หายไปจาก path หมด เหลือร่องรอยอยู่แค่ใน query string เท่านั้น
  // (นี่คือสาเหตุที่เวอร์ชันก่อนซึ่งดูแต่ pathname ไม่เคยเริ่มเฝ้าหน้าคำเชิญเลย)
  const INVITE_URL = /invit|collaborat|collab|permission|[?&]d=acd\b/i;
  const inviteUrlNow = () => INVITE_URL.test(location.pathname + location.search + location.hash);
  const inviteNote = (text, ok = true) => {
    const note = document.createElement('div');
    note.textContent = `${ok ? '✅' : '⚠️'} ${text} (YouTube Upload Presets)`;
    note.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:${ok ? '#111' : '#7a3b00'};color:#fff;padding:10px 16px;border-radius:10px;font:600 13px system-ui;max-width:90vw;text-align:center`;
    document.body.append(note);
    setTimeout(() => note.remove(), 10000);
  };
  // ปุ่มอาจอยู่ใน shadow root ของ web component → ต้องไล่ลงไปด้วย
  function deepFind(root, sel, out = []) {
    root.querySelectorAll(sel).forEach((e) => out.push(e));
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepFind(e.shadowRoot, sel, out); });
    return out;
  }

  // ===== สลับช่องให้อัตโนมัติ =====
  // เข้า studio.youtube.com/channel/<id> ตรง ๆ ไม่ได้ถ้าช่องนั้นไม่ใช่ช่องที่ session
  // กำลังใช้อยู่ — YouTube จะขึ้น "Oops, you don't have permission to view this page"
  // ทางที่ YouTube ใช้เอง (ปุ่ม Switch account บนหน้า Oops) คือ
  //   www.youtube.com/channel_switcher?next=<ปลายทาง>
  // หน้านั้นจะลิสต์ทุกช่อง พอกดช่องไหน YouTube จะสลับให้แล้วเด้งไปที่ next เอง
  const SWITCH_KEY = 'pendingChannelSwitch';
  const SWITCH_TTL = 180000;
  const pendingSwitch = () => {
    const p = GM_getValue(SWITCH_KEY, null);
    return p && Date.now() - (p.at || 0) < SWITCH_TTL ? p : null;
  };
  const clearSwitch = () => GM_setValue(SWITCH_KEY, null);
  // target: { handle?, name? } · next: URL เต็มที่จะไปต่อหลังสลับช่องเสร็จ
  function switchToChannel(target, next) {
    GM_setValue(SWITCH_KEY, Object.assign({ at: Date.now(), next }, target));
    location.href = 'https://www.youtube.com/channel_switcher?next=' + encodeURIComponent(next);
  }

  // อยู่ในหน้าสลับช่อง: กดช่องที่ค้างไว้ให้เอง แล้ว YouTube จะพาไปที่ next ต่อ
  function watchChannelSwitcher() {
    if (location.hostname !== 'www.youtube.com') return;
    if (!/^\/(account|channel_switcher)/.test(location.pathname)) return;
    const want = pendingSwitch();
    if (!want) return;
    const say = (m) => console.info('[YT Upload Presets] switch: ' + m);
    say(`looking for ${want.handle || want.name} on the channel switcher`);
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 60 || !pendingSwitch()) { clearInterval(timer); return; }
      const row = [...document.querySelectorAll(SEL.switcherItem)]
        .find((r) => r.getClientRects().length > 0 && switcherRowMatches(r.textContent, want.handle, want.name));
      if (!row) return;
      clearInterval(timer);
      clearSwitch();
      say(`switching to ${want.handle || want.name}`);
      row.click();
    }, 500);
  }
  watchChannelSwitcher();

  let inviteWatching = false;
  function watchInvite() {
    if (inviteWatching) return; // กันตั้งนาฬิกาซ้อนกันตอนหน้าเปลี่ยนรัว ๆ
    if ((GM_getValue('settings') || {}).autoAcceptInvite === false) return;
    // ใน Studio ทำเฉพาะหน้าคำเชิญ ไม่ไล่กดปุ่มทุกหน้า
    if (location.hostname === 'studio.youtube.com' && !inviteUrlNow()) return;
    inviteWatching = true;
    // "ไม่ได้เฝ้า" กับ "เฝ้าแล้วแต่ไม่เจอปุ่ม" หน้าตาเหมือนกันหมดจากข้างนอก — log ไว้ให้แยกออก
    const say = (msg, ...rest) => console.info('[YT Upload Presets] invite: ' + msg, ...rest);
    say('watching ' + location.pathname + location.search);
    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const live = (b) => visible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
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
      return [...host.querySelectorAll(SEL.inviteRequestRow)].find(visible) || null;
    };
    const rowTitle = (r) => normText(r.querySelector(SEL.inviteRowTitle)?.textContent).slice(0, 60);

    const MAX = 25; // กันวนไม่รู้จบถ้าแถวไม่หายไปหลังกดยอมรับ
    const IDLE_BEFORE_DONE = 8; // รอบที่ว่างติดกันก่อนจะสรุปว่าหมดแล้ว
    let tries = 0;
    let done = 0;      // จำนวนคำเชิญที่กดยอมรับไปแล้ว
    let opened = 0;    // จำนวนแถวที่กดเปิด
    let idle = 0;      // รอบที่ไม่เจออะไรเลยติดต่อกัน
    let lastAction = 0;
    // 180 วิ: ลิงก์คำเชิญมักเด้งผ่านหน้าเลือกบัญชี/ล็อกอินก่อน หน้าจริงจึงมาช้ากว่า 60 วิเดิม
    const stop = () => { clearInterval(timer); inviteWatching = false; };
    const finish = () => {
      stop();
      if (done) inviteNote(done > 1
        ? L(`ยอมรับคำเชิญให้แล้ว ${done} คลิป`, `Accepted ${done} collaboration requests`)
        : L('ยอมรับคำเชิญเรียบร้อย', 'Invitation accepted'));
      say(`finished — accepted ${done}`);
    };
    const timer = setInterval(() => {
      if (++tries > 180) {
        stop();
        if (done) inviteNote(L(`ยอมรับไปแล้ว ${done} คลิป แต่ยังมีค้างอยู่ — ช่วยเช็กในหน้าอีกที`, `Accepted ${done}, but some may remain — please check the page`), false);
        // เงียบไป 3 นาทีโดยไม่มีอะไรเกิดขึ้น = หน้านี้ไม่มีคำเชิญให้ยอมรับ (เช่นยอมรับไปแล้ว
        // หรือเข้าผิดบัญชี) บอกไว้ใน console จะได้ไม่ต้องเดาว่าสคริปต์ทำงานไหม
        else say('gave up — no collaboration request appeared in 180s (already accepted, or signed in as the wrong channel?)');
        return;
      }
      if (Date.now() - lastAction < 2500) return; // ให้หน้าต่างเปิด/ปิดให้เสร็จก่อนค่อยทำต่อ

      // 1) หน้าต่างยอมรับเปิดอยู่ → กด Accept
      const b = acceptBtn();
      if (b) {
        if (done >= MAX) return finish();
        done++;
        idle = 0;
        lastAction = Date.now();
        say(`accepting request ${done}`, b);
        // ytcp-button เป็นเปลือก — กดปุ่มจริงข้างในเหมือนที่ clickIn ทำ
        (b.querySelector('button') || b).click();
        return;
      }
      // 2) ยังอยู่ที่รายการ → กดรูปย่อของแถวแรกที่เหลือเพื่อเปิดหน้าต่างยอมรับ
      const row = requestRow();
      if (row) {
        if (opened >= MAX) return finish();
        opened++;
        idle = 0;
        lastAction = Date.now();
        say(`opening request ${opened}: ${rowTitle(row)}`);
        (row.querySelector(SEL.inviteRowOpen) || row).click();
        return;
      }
      // 3) ไม่เหลือทั้งหน้าต่างยอมรับและรายการ — แต่ YouTube ใช้เวลาสลับคำเชิญถัดไปเข้ามา
      // (และกล่องรายการขึ้น "Oops, something went wrong" อยู่พักหนึ่ง) จึงรอให้ว่างติดกัน
      // หลายรอบก่อนค่อยสรุป ไม่งั้นจะเลิกตั้งแต่คำเชิญแรก
      if (done && ++idle >= IDLE_BEFORE_DONE) finish();
    }, 1000);
  }
  watchInvite();
  // Studio เปลี่ยนหน้าแบบ SPA — ลิงก์คำเชิญมักเด้งผ่านหน้าอื่นก่อน ถ้าเฝ้าแค่ตอนโหลดครั้งแรกจะพลาด
  let inviteUrl = location.href;
  setInterval(() => {
    if (location.href === inviteUrl) return;
    inviteUrl = location.href;
    if (inviteUrlNow()) watchInvite();
  }, 1000);
  // นอก Studio (เช่นหน้าคำเชิญบน www.youtube.com) ทำแค่รับคำเชิญ
  if (location.hostname !== 'studio.youtube.com') return;

  // ===== ตั้งค่าพื้นฐาน =====

  // ตัวแปรที่ใช้ได้ใน title / description / tags:
  //   {name}     ชื่อไฟล์ที่ล้างแล้ว (ตัดนามสกุล, ตัด "140bpm", แปลง _ เป็นช่องว่าง)
  //   {filename} ชื่อไฟล์ดิบ (ไม่มีนามสกุล)
  //   {bpm}      ตัวเลข BPM จากชื่อไฟล์ เช่น "Midnight 140bpm.mp4" -> 140
  //   {n}        เลขลำดับ EP (นับต่อเองแยกตามพรีเซ็ต)
  //   {date} {year}
  //   {producer} ชื่อโปรดิวเซอร์ (แท็บตั้งค่า) เว้นว่าง = ชื่อช่องปัจจุบัน
  // ตัวแปรจากไฟล์ .txt ชื่อเดียวกับคลิป (เช่น clip01.mp4 + clip01.txt):
  //   {txt}        เนื้อหาไฟล์ทั้งหมด (เช่น tracklist + timestamp)
  //   {track1}     เพลงแรกใน tracklist (ตัด timestamp ออก)
  //   {trackcount} จำนวนเพลง
  //   {artists}    รายชื่อศิลปินคั่นด้วย , เช่น "SZA, Chris Brown, Nessy J., BLXD"
  //                เรียงตาม artistPriority ของพรีเซ็ตก่อน แล้วตามจำนวนเพลง จำนวนสูงสุดตาม artistMax
  //                ถ้าชื่อคลิปยาวเกิน 100 ตัวอักษร จะลดจำนวนศิลปินลงให้อัตโนมัติ
  //   ถ้าคำอธิบายไม่มี {txt} แต่คลิปมีไฟล์ .txt จะต่อท้ายคำอธิบายให้อัตโนมัติ
  // [[ ... ]] = ส่วนที่ไม่บังคับ ถ้าตัวแปรข้างในว่าง จะถูกตัดทิ้งทั้งก้อน
  const DEFAULT_PRESETS = [
    {
      id: 'trapsoul',
      label: '🌑 TrapSoul Mix',
      title: 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
      description: [
        'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
        '',
        '[[Tracklist:\n{txt}]]',
        '',
        '#trapsoul #rnb #rnbplaylist #darkrnb',
      ].join('\n'),
      tags: ['trapsoul', 'trapsoul mix', 'dark r&b', 'smokey r&b', 'r&b playlist', 'r&b playlist {year}', '{artists}'],
      visibility: 'PRIVATE',
      // ศิลปินในรายการนี้จะถูกเรียงขึ้นก่อน (เฉพาะคนที่มีอยู่ใน tracklist) ที่เหลือเรียงตามจำนวนเพลง
      artistPriority: ['SZA', 'Chris Brown', 'Summer Walker', 'Bryson Tiller', 'Brent Faiyaz', 'Kehlani', 'Ella Mai', 'Nessy J.', 'BLXD'],
      artistMax: 4,
    },
    {
      id: 'playlist',
      label: '🎧 Playlist + Tracklist',
      title: '{artists} | R&B Playlist[[ ({trackcount} Songs)]]',
      description: '🎧 {artists}\n\nTracklist:\n{txt}\n\n#rnb #playlist #rnbplaylist',
      tags: ['rnb', 'r&b playlist', 'rnb playlist', '{artists}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'typebeat',
      label: '🔥 Type Beat (FREE)',
      title: '[FREE] Thai Type Beat - "{name}"[[ | {bpm} BPM]]',
      description: [
        '[FREE] Thai Type Beat - "{name}"',
        '[[BPM: {bpm}]]',
        'Prod. by {producer}',
        '',
        L('💰 ซื้อบีท / Lease: (ใส่ลิงก์)', '💰 Buy / lease this beat: (add link)'),
        L('📩 ติดต่องาน: (ใส่อีเมล)', '📩 Business inquiries: (add email)'),
        '',
        L('⚠️ ใช้ฟรีแบบไม่แสวงหากำไร ต้องให้เครดิต (prod. {producer})', '⚠️ Free for non-profit use only — credit required (prod. {producer})'),
        '',
        '#typebeat #thaibeat #freebeat',
      ].join('\n'),
      tags: ['type beat', 'thai type beat', 'free beat', 'thai beat', 'instrumental', '{name}', '{producer}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'lofi',
      label: '🌙 Lofi Chill',
      title: L('{name} 🌙 Thai Lofi Chill Beat สำหรับอ่านหนังสือ / ทำงาน', '{name} 🌙 Lofi Chill Beat to Study / Work To'),
      description: L('{name} — บีทชิล ๆ สำหรับอ่านหนังสือ ทำงาน หรือพักผ่อน ☕\n\nProd. by {producer}\n\n#lofi #chillbeats #thailofi', '{name} — chill beats to study, work or relax to ☕\n\nProd. by {producer}\n\n#lofi #chillbeats #studymusic'),
      tags: ['lofi', 'thai lofi', 'chill beat', 'study music', L('เพลงอ่านหนังสือ', 'music to study to'), '{producer}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'shorts',
      label: '📱 Shorts',
      title: '{name} 🔥 #shorts #thaibeat',
      description: '{name}[[ | {bpm} BPM]]\nProd. by {producer}\n\n#shorts #beat #producer',
      tags: ['shorts', 'beat', 'producer', 'thai beat'],
      visibility: 'PRIVATE',
    },
    {
      id: 'instrumental',
      label: '🎹 Instrumental',
      title: '{name} - Instrumental (Prod. {producer})',
      description: '{name} (Instrumental)\nProd. by {producer}\n© {year} {producer}',
      tags: ['instrumental', 'beat', '{name}', '{producer}'],
      visibility: 'PRIVATE',
    },
    {
      id: 'series',
      label: L('📺 ทำบีทสด EP', '📺 Beat Making EP'),
      title: L('ทำบีทสด EP.{n} - {name}[[ ({bpm} BPM)]]', 'Making a Beat EP.{n} - {name}[[ ({bpm} BPM)]]'),
      description: L('ทำบีทสด EP.{n} — {name}\nอัปโหลดเมื่อ {date}\n\nProd. by {producer}', 'Making a Beat EP.{n} — {name}\nUploaded {date}\n\nProd. by {producer}'),
      tags: [L('ทำบีท', 'making beats'), 'beat making', 'cook up', 'producer', '{producer}'],
      visibility: 'PRIVATE',
    },
  ];

  const VIS = { PRIVATE: L('🔒 ส่วนตัว', '🔒 Private'), UNLISTED: L('🔗 ไม่เป็นสาธารณะ', '🔗 Unlisted'), PUBLIC: L('🌐 สาธารณะ', '🌐 Public') };
  const VARS = ['name', 'bpm', 'n', 'date', 'year', 'filename', 'producer', 'txt', 'track1', 'trackcount', 'artists'];
  const VIDEO_EXT = /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|3gp|mpe?g)$/i;
  const TXT_EXT = /\.txt$/i;
  const IMG_EXT = /\.(jpe?g|png|gif|bmp|webp)$/i;
  const THUMB_MAX = 2 * 1024 * 1024; // YouTube รับภาพปกไม่เกิน 2MB
  const DESC_MAX = 5000;
  let injectingFile = false; // ระหว่างที่สคริปต์ส่งไฟล์ให้ Studio เอง
  const SCHEDULE_MIN_LEAD = 15 * 60 * 1000; // YouTube ต้องตั้งเวลาล่วงหน้าอย่างน้อยประมาณ 15 นาที
  const TITLE_MAX = 100;

  // ===== storage =====
  const load = (k, d) => {
    const v = GM_getValue(k);
    return v === undefined ? d : v;
  };
  const save = (k, v) => GM_setValue(k, v);

  // ===== ย้ายข้อมูลของเวอร์ชันเก่า (schema) =====
  // เพิ่มขั้นใหม่ต่อท้าย MIGRATIONS เท่านั้น — schemaVersion ขยับตามความยาวของลิสต์ให้เอง
  // เครื่องที่ติดตั้งใหม่ข้ามทุกขั้น เพราะได้ค่าเริ่มต้นที่ถูกต้องอยู่แล้ว (ไม่ต้องมีธง migratedXxx อีก)
  const freshInstall = GM_getValue('presets') === undefined;

  // พรีเซ็ต trapsoul รุ่นเก่า: คลิปที่ไม่มี .txt จะได้ชื่อ "TrapSoul Mix | - ..." -> ครอบ {artists} ด้วย [[ ]]
  function fixLegacyTrapsoulTitles(list) {
    for (const p of list || []) {
      if (!p || p.id !== 'trapsoul') continue;
      if (p.title === 'TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}') p.title = 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}';
      if (typeof p.description === 'string') {
        p.description = p.description
          .replace('TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}', 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}')
          .replace('Tracklist:\n{txt}', '[[Tracklist:\n{txt}]]')
          .replace('[[[[Tracklist:', '[[Tracklist:').replace('{txt}]]]]', '{txt}]]');
      }
    }
    return list;
  }

  // แต่ละขั้นทำครั้งเดียว · legacy = ชื่อธงเก่าที่ใช้ก่อนมี schemaVersion (ถ้าธงถูกตั้งไว้ = ขั้นนี้ทำไปแล้ว)
  const MIGRATIONS = [
    { // 1: เพิ่มพรีเซ็ต Playlist ให้เครื่องที่ติดตั้งไว้ก่อน
      legacy: 'addedPlaylist',
      run() {
        const list = load('presets', structuredClone(DEFAULT_PRESETS));
        if (!list.some((x) => x.id === 'playlist')) save('presets', [structuredClone(DEFAULT_PRESETS[1]), ...list]);
      },
    },
    { // 2: เพิ่มพรีเซ็ต TrapSoul แล้วตั้งเป็นพรีเซ็ตหลัก
      legacy: 'addedTrapsoul',
      run() {
        const list = load('presets', structuredClone(DEFAULT_PRESETS));
        if (!list.some((x) => x.id === 'trapsoul')) save('presets', [structuredClone(DEFAULT_PRESETS[0]), ...list]);
        save('activeId', 'trapsoul');
      },
    },
    { // 3: ครอบ {artists} / {txt} ของพรีเซ็ต trapsoul เดิมด้วย [[ ]]
      run() { save('presets', fixLegacyTrapsoulTitles(load('presets', structuredClone(DEFAULT_PRESETS)))); },
    },
    { // 4: ย้ายชื่อโปรดิวเซอร์ / ชื่อค่ายที่เคยฝังในโค้ดมาเป็นค่าตั้งค่า (v4.5.0 · เดิมใช้ธง migratedOwnNames)
      legacy: 'migratedOwnNames',
      run() {
        const s = load('settings', {});
        if (s.producer === undefined) save('settings', { ...s, producer: 'ThaiBeats' });
        const c = load('cfg', {});
        if (c.ownNames === undefined) save('cfg', { ...c, ownNames: 'THAIBEATS, EXMGE' });
      },
    },
  ];
  const SCHEMA_VERSION = MIGRATIONS.length;

  function runMigrations() {
    if (freshInstall) return save('schemaVersion', SCHEMA_VERSION);
    let from = load('schemaVersion', null);
    if (from === null) {
      // เครื่องที่ติดตั้งก่อนมี schemaVersion: อ่านจากธงเก่าว่าทำถึงขั้นไหนแล้ว
      from = 0;
      MIGRATIONS.forEach((m, i) => { if (m.legacy && load(m.legacy, false)) from = i + 1; });
    }
    for (let i = from; i < MIGRATIONS.length; i++) {
      try { MIGRATIONS[i].run(); } catch (e) { console.error('[Upload Studio] migration ' + (i + 1), e); }
    }
    save('schemaVersion', SCHEMA_VERSION);
  }
  runMigrations();

  let presets = load('presets', structuredClone(DEFAULT_PRESETS));
  let activeId = load('activeId', presets[0].id);
  let counters = load('counters', {});
  const settings = Object.assign(
    {
      autoApply: load('autoApply', true), // อัปโหลดเองทีละไฟล์ -> เติมข้อมูลให้
      autoNext: load('autoNext', false), // กด Next ไปหน้า Visibility ให้
      autoSave: true, // โหมดคิว: กด Save ให้เลย
      thumb: true, // โหมดคิว: อัปภาพปกจากไฟล์ภาพชื่อเดียวกับคลิป
      thumbWaitMin: 120, // รอวิดีโออัปเสร็จเพื่อใส่ภาพปกได้นานสุดกี่นาที
      intercept: true, // ดักการเลือกหลายไฟล์ในหน้าต่างของ Studio มาเข้าคิว
      delay: 3, // วินาทีที่พักระหว่างไฟล์
      pace: 'slow', // จังหวะการทำงาน: normal (x1) | slow (x1.6) | slower (x2.5) — ยืดเวลาพัก/เวลารอทุกขั้น สำหรับเน็ตหรือเครื่องที่โหลดช้า
      year: '', // ปีที่ใช้ใน {year} เว้นว่าง = ปีปัจจุบัน
      confirmStart: true, // ถามยืนยันชื่อช่องก่อนเริ่มคิว
      category: 'Music', // หมวดหมู่ (ข้อความตามที่ Studio แสดง) เว้นว่าง = ไม่ตั้ง
      alteredContent: 'skip', // เนื้อหาดัดแปลง/สังเคราะห์ (AI use): skip | no | yes
      paidPromotion: 'no', // การโปรโมตแบบชำระเงิน: skip | no | yes
      monetization: 'on', // ขั้น Monetisation: on | off | skip
      adSuitability: 'none', // ขั้น Ad suitability: none = ติ๊ก "None of the above" แล้ว Submit rating | skip = ทำเอง
      producer: '', // ชื่อโปรดิวเซอร์ใน {producer} เว้นว่าง = ใช้ชื่อช่องปัจจุบัน
      lockChannel: null, // { id, name } ช่องที่อนุญาตให้อัป (null = ไม่ล็อก)
      autoAcceptInvite: true, // เปิดลิงก์คำเชิญสิทธิ์ช่องแล้วกด Accept ให้
      quickActions: true, // ปุ่มลัดใต้ช่องชื่อ/คำอธิบายของ Studio
      glass: 82, // ความทึบของแผงกระจก (%) — น้อย = เห็นพื้นหลังมากขึ้น
      notify: true, // แจ้งเตือนบนเดสก์ท็อป + เสียง เมื่อคิวเสร็จ/หยุด
      // ตั้งเวลาปล่อย: คลิปแรกปล่อยตอน start แล้วคลิปถัดไปห่างกันทีละ every (unit = 'hour' | 'day')
      schedule: { on: false, start: '', every: 1, unit: 'day' },
    },
    load('settings', {})
  );
  const saveSettings = () => save('settings', settings);
  // ดีไซน์ B: พื้นกระจกทึบ 72% บนหน้า Studio สีขาวออกมาเป็นเทาซีด -> ค่าเริ่มต้นใหม่ 82% (ย้ายให้ครั้งเดียว ถ้ายังเป็นค่าเริ่มต้นเดิม)
  if (!settings.glassV2) {
    if (settings.glass === 72) settings.glass = 82;
    settings.glassV2 = true;
    saveSettings();
  }
  if (settings.lang === undefined) {
    settings.lang = LANG;
    saveSettings();
  }

  // ===== หาพรีเซ็ตตาม id (พรีเซ็ตของผู้ใช้ หรือ 'v:<videoId>' = รูปแบบที่เรียนรู้จากคลิป) =====
  // รูปแบบจากคลิปเก็บแยกตามช่อง: videoTemplates:<channelId> -> { 'v:<videoId>': template } · ไม่อยู่ใน presets และไม่ส่งออกในไฟล์สำรอง
  let vtCache = { ch: null, map: {} };
  function videoTemplates() {
    const ch = getChannel().id;
    if (vtCache.ch !== ch) vtCache = { ch, map: load('videoTemplates:' + ch, {}) };
    return vtCache.map;
  }
  const saveVideoTemplates = () => save('videoTemplates:' + vtCache.ch, vtCache.map);
  const isVideoId = (id) => String(id || '').startsWith('v:');
  const presetById = (id) => (isVideoId(id) && videoTemplates()[id]) || presets.find((p) => p.id === id) || presets[0];
  const active = () => presetById(activeId);
  // แท็บพรีเซ็ตแก้ได้เฉพาะพรีเซ็ตของผู้ใช้ — ถ้าพรีเซ็ตหลักเป็นรูปแบบจากคลิป ให้เปิดพรีเซ็ตแรกแทน
  const ownId = (id) => (presets.some((p) => p.id === id) ? id : presets[0].id);


  // ===== template =====
  const pad = (x) => String(x).padStart(2, '0');

  // อ่าน tracklist: "01:03:05 Kehlani - Folded (Cover by BLXD)" -> ชื่อเพลง + ศิลปิน
  function parseTracks(txt, priority = []) {
    const tracks = String(txt || '')
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*[-–|]?\s*/, '').replace(/^\d{1,3}\.\s*/, '').trim())
      .filter(Boolean);
    const count = new Map(); // key ตัวพิมพ์เล็ก -> { name, n, first }
    const add = (raw) => {
      for (const a of raw.split(/\s+(?:x|ft\.?|feat\.?|&|and)\s+|,\s*/i)) {
        const name = a.replace(/^(?:ft\.?|feat\.?)\s+/i, '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const c = count.get(key) || { name, n: 0, first: count.size };
        c.n++;
        count.set(key, c);
      }
    };
    for (const t of tracks) {
      const [artistPart, ...rest] = t.split(/\s[-–]\s/);
      if (!rest.length) continue;
      add(artistPart);
      // ศิลปินรับเชิญในชื่อเพลง เช่น "Waiting On Me (ft. Brent Faiyaz)"
      const song = rest.join(' - ');
      const feat = song.match(/\((?:ft\.?|feat\.?)\s+([^)]+)\)/i) || song.match(/\s(?:ft\.?|feat\.?)\s*([^()]+)$/i);
      if (feat) add(feat[1]);
    }
    const prio = priority.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    const rank = (c) => {
      const i = prio.indexOf(c.name.toLowerCase());
      return i === -1 ? Infinity : i;
    };
    const artistList = [...count.values()]
      .sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.first - b.first)
      .map((c) => c.name);
    return { track1: tracks[0] || '', trackcount: tracks.length ? String(tracks.length) : '', artistList };
  }

  // opt.preset = พรีเซ็ตที่ใช้ (อ่าน artistPriority / artistMax), opt.artists = ชื่อศิลปินที่พิมพ์เองในการ์ด
  function buildVars(rawName, n, txt = '', opt = {}) {
    const base = String(rawName || '').replace(VIDEO_EXT, '').trim();
    const bpm = (base.match(/(\d{2,3})\s*bpm/i) || [])[1] || '';
    const name = base
      .replace(/(\d{2,3})\s*bpm/gi, '')
      .replace(/_+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–|,.]+|[\s\-–|,.]+$/g, '');
    const d = new Date();
    const p = opt.preset || {};
    const { artistList, ...tr } = parseTracks(txt, p.artistPriority || []);
    const max = Math.max(1, Number(p.artistMax) || 4);
    const manual = (opt.artists || '').trim();
    const shown = manual ? [] : artistList.slice(0, max);
    return {
      name: name || base,
      filename: base,
      bpm,
      n: String(n),
      date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
      year: String(settings.year || d.getFullYear()),
      producer: settings.producer || getChannel().name,
      txt: String(txt || '').replace(/\r\n/g, '\n').trim(),
      ...tr,
      artists: manual || shown.join(', '),
      _artists: shown, // ใช้ภายในสำหรับย่อชื่อคลิปที่ยาวเกิน
    };
  }

  function render(tpl, vars) {
    return String(tpl || '')
      .replace(/\[\[([\s\S]*?)\]\]/g, (_, inner) => {
        const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        return keys.every((k) => vars[k]) ? inner : '';
      })
      .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
      .replace(/\n{3,}/g, '\n\n');
  }

  // YouTube ไม่รับเครื่องหมาย < > ในชื่อและคำอธิบาย
  const clean = (s) => String(s).replace(/[<>]/g, '');
  const renderTitle = (tpl, vars) => clean(render(tpl, vars)).replace(/\s+/g, ' ').trim();
  // ชื่อคลิปยาวเกิน 100 ตัวอักษร -> ลดจำนวนศิลปินทีละคนจนพอดี
  function makeTitle(p, vars) {
    let t = renderTitle(p.title, vars);
    for (let k = vars._artists.length - 1; t.length > TITLE_MAX && k >= 1; k--) {
      t = renderTitle(p.title, { ...vars, artists: vars._artists.slice(0, k).join(', ') });
    }
    return t.slice(0, TITLE_MAX);
  }
  // render() ปล่อยตัวแปรที่ไม่รู้จักติดไปกับข้อความ ({artist} ที่พิมพ์ผิดจะขึ้น YouTube ตรง ๆ) -> เตือนในพรีวิว
  const unknownVars = (p) =>
    [...new Set([p.title || '', p.description || '', ...(p.tags || [])].join('\n').match(/\{\w+\}/g) || [])]
      .filter((v) => !VARS.includes(v.slice(1, -1)));

  const renderTags = (p, vars) => [
    ...new Set(
      (p.tags || [])
        .flatMap((t) => render(t, vars).split(/,|\s+x\s+/i))
        .map((t) => clean(t).trim())
        .filter(Boolean)
    ),
  ];
  // ถ้าพรีเซ็ตไม่ได้ใส่ {txt} แต่คลิปมีไฟล์ .txt ให้ต่อท้ายคำอธิบาย
  function renderDescFull(p, vars) {
    let d = render(p.description, vars).trim();
    if (vars.txt && !/\{txt\}/.test(p.description || '')) d = d ? `${d}\n\n${vars.txt}` : vars.txt;
    return clean(d);
  }
  const renderDesc = (p, vars) => renderDescFull(p, vars).slice(0, DESC_MAX);

  // ===== เรียนรู้รูปแบบจากคลิปที่อัปแล้ว (pure) =====
  // ชื่อ/คำอธิบาย/แท็กของคลิปเดิม -> template: ส่วนที่เปลี่ยนทุกคลิป (tracklist, ศิลปิน, จำนวนเพลง, ปี, BPM, ชื่อบีท)
  // กลายเป็นตัวแปร ส่วนที่เหลือคงไว้ตามเดิม · ตัวแปรที่อาจว่างจะถูกครอบ [[ ]] พร้อมตัวคั่น (กฎเดียวกับพรีเซ็ตตั้งต้น)
  const SIX_MONTHS = 183 * 864e5;
  const TS_LINE = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}(?!\d)/;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SEP_BEFORE = /\s*[|\-–—:•·]\s*$/;
  const SEP_AFTER = /^\s*[|\-–—:•·]\s*/;
  // แทนทุกจุดที่เจอ run ด้วย {artists} พร้อมดึงตัวคั่นข้าง ๆ เข้า [[ ]] (คลิปไม่มี .txt จะไม่เหลือ " | " ค้าง)
  function wrapArtists(s, run) {
    const parts = s.split(run);
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const after = parts[i];
      const before = (out.match(SEP_BEFORE) || [''])[0];
      const next = before ? '' : (after.match(SEP_AFTER) || [''])[0];
      out = out.slice(0, out.length - before.length) + `[[${before}{artists}${next}]]` + after.slice(next.length);
    }
    return out;
  }
  function learnTemplate({ title = '', description = '', tags = [], publishedYear = '' }) {
    const warnings = [];
    const lines = String(description).replace(/\r\n/g, '\n').split('\n');
    // 1. tracklist = บรรทัดขึ้นต้นด้วยเวลาติดกัน ≥ 3 บรรทัด (เอาช่วงที่ยาวที่สุด)
    let best = null;
    for (let i = 0; i < lines.length;) {
      if (!TS_LINE.test(lines[i])) { i++; continue; }
      let j = i;
      while (j < lines.length && TS_LINE.test(lines[j])) j++;
      if (j - i >= 3 && (!best || j - i > best.n)) best = { at: i, n: j - i };
      i = j;
    }
    let desc = lines.join('\n');
    let txt = '';
    let artistList = [];
    let trackcount = '';
    if (best) {
      txt = lines.slice(best.at, best.at + best.n).join('\n');
      ({ artistList, trackcount } = parseTracks(txt));
      // หัวข้อที่ลงท้ายด้วย : เหนือ tracklist (เช่น "Tracklist:") ย้ายเข้า [[ ]] ด้วย
      const head = best.at > 0 && /:\s*$/.test(lines[best.at - 1]) ? best.at - 1 : best.at;
      const block = head < best.at ? `[[${lines[head]}\n{txt}]]` : '{txt}';
      desc = [...lines.slice(0, head), block, ...lines.slice(best.at + best.n)].join('\n');
    } else warnings.push('no-tracklist');

    // 2. ศิลปิน: ชื่อจาก tracklist ที่เรียงติดกันในชื่อคลิป (ยาวที่สุด) -> {artists}
    let t = String(title);
    let artistMax = 4;
    let artistPriority = [];
    if (artistList.length) {
      const name = `(?:${[...artistList].sort((a, b) => b.length - a.length).map(escRe).join('|')})`;
      const runRe = new RegExp(`(?<![\\p{L}\\p{N}])${name}(?:(?:, | x | & )${name})*(?![\\p{L}\\p{N}])`, 'giu');
      const run = [...t.matchAll(runRe)].sort((a, b) => b[0].length - a[0].length)[0];
      if (run) {
        const names = run[0].split(/, | x | & /);
        artistMax = names.length;
        artistPriority = names; // ลำดับเดิมของคลิปต้นแบบ -> ศิลปินที่ดึงยอดวิวขึ้นก่อน
        t = wrapArtists(t, run[0]);
        desc = wrapArtists(desc, run[0]);
      }
    }
    // 3. จำนวนเพลง เช่น "(12 Songs)" -> [[ ({trackcount} Songs)]]
    if (trackcount) {
      const countRe = new RegExp(`(\\s*\\()?(?<!\\d)${trackcount}(\\s*(?:songs?|tracks?|เพลง))(\\))?`, 'gi');
      const fill = (s) => s.replace(countRe, (_, open = '', unit, close = '') => `[[${open}{trackcount}${unit}${close}]]`);
      t = fill(t);
      desc = fill(desc);
    }
    // 4. ปี (เฉพาะปีที่เผยแพร่หรือปีนี้)  5. BPM
    const years = new Set([String(publishedYear), String(new Date().getFullYear())]);
    const yearize = (s) => s.replace(/(?<!\d)20\d\d(?!\d)/g, (y) => (years.has(y) ? '{year}' : y));
    const bpmize = (s) => s
      .replace(/\bBPM:\s*\d{2,3}(?!\d)/gi, '[[BPM: {bpm}]]')
      .replace(/(\s*[|\-–—:•·]\s*)?(?<![\d{])\d{2,3}\s*BPM\b/gi, (_, sep = '') => `[[${sep}{bpm} BPM]]`);
    t = bpmize(yearize(t));
    desc = bpmize(yearize(desc));
    // 6. ชื่อบีทในเครื่องหมายคำพูด เช่น "Midnight" -> "{name}" (ทั้งชื่อคลิปและคำอธิบาย)
    const q = t.match(/"([^"\n{}]{1,80})"|“([^”\n{}]{1,80})”/);
    if (q) {
      const named = q[0].replace(q[1] || q[2], '{name}');
      t = t.split(q[0]).join(named);
      desc = desc.split(q[0]).join(named);
    }
    if (!/\{\w+\}/.test(t)) warnings.push('static-title');
    // 7. แท็กที่เป็นชื่อศิลปิน -> {artists} อันเดียว
    const known = new Set(artistList.map((a) => a.toLowerCase()));
    const outTags = [];
    for (const tag of tags) {
      if (known.has(String(tag).toLowerCase())) { if (!outTags.includes('{artists}')) outTags.push('{artists}'); }
      else outTags.push(yearize(String(tag)));
    }
    return { title: t, description: desc, tags: outTags, artistPriority, artistMax, txt, warnings };
  }

  // คลิปสาธารณะใน 6 เดือนล่าสุด เรียงตามยอดวิว (รับรายการจาก list_creator_videos) -> [{ videoId, title, views, at }]
  function pickTopVideos(videos, now = Date.now(), n = 10) {
    return (videos || [])
      .map((v) => ({ videoId: v.videoId, title: v.title || '', views: +((v.metrics || {}).viewCount || 0), at: (+v.timePublishedSeconds || 0) * 1000, privacy: v.privacy }))
      .filter((v) => v.privacy === 'VIDEO_PRIVACY_PUBLIC' && v.at > 0 && now - v.at <= SIX_MONTHS)
      .sort((a, b) => b.views - a.views)
      .slice(0, n)
      .map(({ privacy, ...v }) => v);
  }

  // ===== ตรวจ tracklist ก่อนอัป (กฎ Chapters ของ YouTube) =====
  // เช็กจากคำอธิบายที่จะอัปจริง: timestamp แรก 0:00, อย่างน้อย 3 ช่วง, เรียงจากน้อยไปมาก, แต่ละช่วง ≥ 10 วินาที,
  // ไม่เกินความยาวคลิป และคำอธิบายไม่เกิน 5000 ตัวอักษร (เกินแล้วท้าย tracklist จะถูกตัด)
  const fmtTs = (s) => { s = Math.round(s); const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (hh ? hh + ':' + pad(m) : m) + ':' + pad(x); };
  function checkTracklist(description, fullLength, duration) {
    const errors = [];
    const warnings = [];
    const stamps = [];
    description.split('\n').forEach((line, i) => {
      const m = line.match(/^\s*[[(]?(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})\b[\])]?\s*[-–|.:]?\s*(.*)$/);
      if (!m) return;
      const [hh, mm, ss] = [m[1], m[2], m[3]].map((x) => (x === undefined ? 0 : +x));
      if (ss > 59 || (m[1] !== undefined && mm > 59)) { errors.push(L(`บรรทัด ${i + 1}: เวลา "${line.trim().split(/\s/)[0]}" ไม่ถูกต้อง`, `Line ${i + 1}: invalid time "${line.trim().split(/\s/)[0]}"`)); return; }
      stamps.push({ t: hh * 3600 + mm * 60 + ss, line: i + 1, name: m[4].trim() });
    });
    if (fullLength > DESC_MAX) warnings.push(L(`คำอธิบายยาว ${fullLength} ตัวอักษร เกิน ${DESC_MAX} — ส่วนท้ายจะถูกตัด`, `Description is ${fullLength} characters, over ${DESC_MAX} — the end will be cut off`));
    if (!stamps.length) return { errors, warnings, count: 0 };
    if (stamps[0].t !== 0) errors.push(L(`timestamp แรกต้องเป็น 0:00 (ตอนนี้ ${fmtTs(stamps[0].t)})`, `First timestamp must be 0:00 (currently ${fmtTs(stamps[0].t)})`));
    if (stamps.length < 3) errors.push(L(`ต้องมีอย่างน้อย 3 timestamp (มี ${stamps.length})`, `Needs at least 3 timestamps (has ${stamps.length})`));
    for (let k = 1; k < stamps.length; k++) {
      const gap = stamps[k].t - stamps[k - 1].t;
      if (gap <= 0) errors.push(L(`บรรทัด ${stamps[k].line}: ${fmtTs(stamps[k].t)} ไม่ได้มาหลัง ${fmtTs(stamps[k - 1].t)}`, `Line ${stamps[k].line}: ${fmtTs(stamps[k].t)} doesn't come after ${fmtTs(stamps[k - 1].t)}`));
      else if (gap < 10) errors.push(L(`บรรทัด ${stamps[k - 1].line}: ช่วงยาวแค่ ${gap} วินาที (ต้อง ≥ 10)`, `Line ${stamps[k - 1].line}: chapter is only ${gap}s long (needs ≥ 10)`));
    }
    const last = stamps[stamps.length - 1];
    if (duration > 0) {
      const over = stamps.filter((s) => s.t >= duration);
      if (over.length) errors.push(L(`${over.length} timestamp เกินความยาวคลิป (${fmtTs(duration)}) เช่นบรรทัด ${over[0].line}: ${fmtTs(over[0].t)}`, `${over.length} timestamp(s) beyond the video length (${fmtTs(duration)}), e.g. line ${over[0].line}: ${fmtTs(over[0].t)}`));
      else if (duration - last.t < 10) errors.push(L(`ช่วงสุดท้ายยาวแค่ ${Math.floor(duration - last.t)} วินาที (ต้อง ≥ 10)`, `Last chapter is only ${Math.floor(duration - last.t)}s long (needs ≥ 10)`));
    }
    const seen = new Map();
    for (const s of stamps) {
      const k = s.name.toLowerCase().replace(/\s+/g, ' ');
      if (k && seen.has(k)) warnings.push(L(`เพลงซ้ำ: "${s.name}" (บรรทัด ${seen.get(k)} และ ${s.line})`, `Duplicate song: "${s.name}" (lines ${seen.get(k)} and ${s.line})`));
      else if (k) seen.set(k, s.line);
    }
    return { errors, warnings, count: stamps.length };
  }
  // แก้ปัญหา Chapters ที่แก้ให้ได้โดยไม่ต้องเดา: timestamp แรกไม่ใช่ 0:00 และบรรทัด timestamp เรียงผิดลำดับ
  // (เปลี่ยนเฉพาะตัวเลขเวลา / สลับเฉพาะบรรทัดที่มีเวลา ข้อความอื่นอยู่ที่เดิม) — ช่วงสั้นกว่า 10 วิ หรือเกินความยาวคลิปแก้ให้ไม่ได้
  // คืน { text, changes } · changes ว่าง = ไม่มีอะไรที่แก้ให้ได้
  function fixChapters(text) {
    const RE = /^(\s*[[(]?)((?:\d{1,2}:)?\d{1,3}:\d{1,2})(\b.*)$/;
    const lines = String(text).split('\n');
    const idx = [];
    lines.forEach((l, i) => { if (RE.test(l)) idx.push(i); });
    if (!idx.length) return { text, changes: [] };
    const secs = (l) => l.match(RE)[2].split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
    const changes = [];
    const ts = idx.map((i) => lines[i]);
    const sorted = [...ts].sort((a, b) => secs(a) - secs(b));
    if (sorted.some((l, k) => l !== ts[k])) {
      sorted.forEach((l, k) => { lines[idx[k]] = l; });
      changes.push(L('เรียงบรรทัด timestamp ตามเวลา', 'Sorted the timestamp lines by time'));
    }
    const first = lines[idx[0]];
    if (secs(first) !== 0) {
      const m = first.match(RE);
      lines[idx[0]] = m[1] + (m[2].split(':').length === 3 ? '0:00:00' : '0:00') + m[3];
      changes.push(L(`timestamp แรก ${m[2]} → 0:00`, `First timestamp ${m[2]} → 0:00`));
    }
    return { text: lines.join('\n'), changes };
  }
  // ความยาวคลิปจาก metadata ของไฟล์ (อ่านแค่ส่วนหัว ไม่โหลดทั้งไฟล์) · อ่านไม่ได้ = 0 (ข้ามการเช็กความยาว)
  // เคยเจอบน Studio จริง: video ที่ไม่ได้อยู่ในหน้าบางครั้งไม่โหลด metadata เลย (ได้ 0) -> แปะลงหน้าแบบซ่อน และลองซ้ำอีกรอบ
  function videoDurationOnce(file, wait) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      let settled = false;
      const done = (d) => { if (settled) return; settled = true; URL.revokeObjectURL(url); v.removeAttribute('src'); v.remove(); resolve(Number.isFinite(d) && d > 0 ? d : 0); };
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
  // เจอบน Studio จริง: <video> กับ blob ค้างที่ networkState=LOADING ตลอด ไม่เคยได้ metadata
  // อ่านแค่หัวกล่องทีละ 16 ไบต์ + ตัว moov (moov อยู่ท้ายไฟล์ก็เจอ) ไฟล์ 1.5GB ก็เร็ว
  async function mp4Duration(file) {
    const read = async (o, n) => new DataView(await file.slice(o, o + n).arrayBuffer());
    const type = (dv, p) => String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
    let off = 0;
    for (let guard = 0; off + 8 <= file.size && guard < 2000; guard++) {
      const hd = await read(off, 16);
      if (hd.byteLength < 8) break;
      let len = hd.getUint32(0);
      let hdr = 8;
      if (len === 1 && hd.byteLength >= 16) { len = Number(hd.getBigUint64(8)); hdr = 16; } else if (len === 0) len = file.size - off;
      if (len < hdr) break;
      if (type(hd, 0) === 'moov') {
        const mv = await read(off + hdr, Math.min(len - hdr, 64 << 20));
        for (let p = 0; p + 8 <= mv.byteLength;) {
          const l = mv.getUint32(p);
          if (type(mv, p) === 'mvhd') {
            const v1 = mv.getUint8(p + 8) === 1;
            const ts = mv.getUint32(p + (v1 ? 28 : 20));
            const du = v1 ? Number(mv.getBigUint64(p + 32)) : mv.getUint32(p + 24);
            return ts ? du / ts : 0;
          }
          if (l < 8) break;
          p += l;
        }
        return 0;
      }
      off += len;
    }
    return 0;
  }
  async function videoDuration(file) {
    try { const d = await mp4Duration(file); if (d > 0) return d; } catch (e) { /* ไม่ใช่ MP4/MOV หรืออ่านไม่ได้ */ }
    return videoDurationOnce(file, 12000);
  }

  // ===== งานที่กำลังทำ (progress) =====
  // ฟังก์ชันล้วนสองตัวสำหรับแถบความคืบหน้า — ห้ามแตะ DOM / queue / settings (test/ ตัดบล็อกนี้ไปเทสต์)

  // ดึงเปอร์เซ็นต์จากข้อความความคืบหน้าของ Studio เช่น "Uploading 45% … 3 minutes left"
  // คืน 0..1 หรือ null ถ้าไม่มีตัวเลขเปอร์เซ็นต์ (Studio เปลี่ยนรูปแบบ -> แถบถอยไปนับเป็นคลิป)
  function parseUploadPct(text) {
    const m = String(text || '').match(TXT.uploadPct);
    if (!m) return null;
    return Math.max(0, Math.min(1, +m[1] / 100));
  }

  // ตัดสินว่าตอนนี้มี "งาน" อะไรกำลังทำอยู่ — คืนอันเดียว หรือ null ถ้าว่าง
  //   q      = สรุปสถานะคิวอัปโหลด { running, inFlight, total, done, errors }
  //   claims = ผลจาก computeStatus() ของโมดูลลิขสิทธิ์ (หรือ null)
  //   prog   = { pct, text } ของคลิปที่กำลังอัป (หรือ null)
  // คิวอัปโหลดมาก่อนเสมอ: สแกน claim อ่านอย่างเดียวและทับซ้อนกับการอัปได้
  // แถบใช้ done เป็นฐาน (ความหมายเดียวกับแถบในแท็บคิว) คลิปที่ error ไม่ดันแถบ แต่ดันเลขลำดับ
  function activityFrom(q, claims, prog) {
    if (q.running || q.inFlight) {
      const pct = prog && typeof prog.pct === 'number' ? prog.pct : 0;
      return {
        task: 'upload',
        icon: '⬆',
        tab: 'queue',
        count: { at: q.done + q.errors + 1, of: q.total },
        title: '', // ผู้เรียกเติมข้อความผ่าน L() เพราะฟังก์ชันนี้ต้องล้วน
        detail: (prog && prog.text) || '',
        progress: q.total ? Math.min(1, (q.done + pct) / q.total) : null,
      };
    }
    // computeStatus() คืนสถานะตอนว่างด้วย ('พร้อม' / 'Auto-pilot เปิดอยู่') -> นับแค่ busy กับ wait
    if (claims && (claims.kind === 'busy' || claims.kind === 'wait')) {
      return {
        task: 'claims',
        icon: claims.icon || '',
        tab: 'claims',
        count: null,
        title: claims.title || '',
        detail: claims.detail || '',
        progress: typeof claims.progress === 'number' ? claims.progress : null,
      };
    }
    return null;
  }

  // ===== Studio DOM automation =====
  // จังหวะการทำงาน: คูณเวลาพักและเวลารอทั้งหมด (หน้า Studio โหลดช้า -> เลือก "ช้า" หรือ "ช้ามาก")
  const PACE = { normal: 1, slow: 1.6, slower: 2.5 };
  const pace = () => PACE[settings.pace] || 1;
  const T = (ms) => ms * pace();
  const sleep = (ms) => new Promise((r) => setTimeout(r, T(ms)));
  const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

  // แท็บ Studio อยู่เบื้องหลัง (ปล่อยคิวแล้วไปทำอย่างอื่น) Chrome หน่วง setTimeout ได้ถึงนาทีละครั้ง
  // เจอจริง: sleep 100ms กลายเป็นหลายสิบวินาที -> เดิมหมดเวลาโดยเช็กไปแค่ครั้งเดียว ทั้งที่ของขึ้นแล้ว
  // จึงเช็กอย่างน้อย 3 ครั้ง และเช็กซ้ำอีกครั้งหลังหมดเวลาก่อนยอมแพ้
  async function waitFor(fn, timeout = 10000, step = 200) {
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
  const getTitleBox = (dlg) => dlg && dlg.querySelector(SEL.titleBox);
  const getDescBox = (dlg) => dlg && dlg.querySelector(SEL.descBox);
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
  const findTagsInput = (dlg) =>
    dlg.querySelector(
      SEL.tagsInput
    );

  // พิมพ์ลงช่อง contenteditable ผ่าน execCommand เพื่อให้ Studio รับรู้การเปลี่ยนแปลง
  function setEditable(el, text) {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    text.split('\n').forEach((line, i) => {
      if (i) document.execCommand('insertLineBreak', false, null);
      if (line) document.execCommand('insertText', false, line);
    });
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.blur();
  }

  async function setTags(dlg, tags) {
    if (!tags.length) return true;
    let input = findTagsInput(dlg);
    if (!isVisible(input)) {
      const more = dlg.querySelector(SEL.showMore); // ปุ่ม "แสดงเพิ่มเติม"
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

  async function fillDetails({ title, description, tags }) {
    const dlg = getDetailsHost();
    setEditable(getTitleBox(dlg), title);
    const descBox = getDescBox(dlg);
    if (descBox && description) setEditable(descBox, description);
    const notKids = dlg.querySelector(SEL.notForKids);
    if (notKids) notKids.click();
    const tagsOk = await setTags(dlg, tags); // เปิด "แสดงเพิ่มเติม" ให้ด้วย
    if (settings.alteredContent !== 'skip') {
      const yes = settings.alteredContent === 'yes';
      const name = yes ? 'VIDEO_HAS_ALTERED_CONTENT_YES' : 'VIDEO_HAS_ALTERED_CONTENT_NO';
      // ส่วน "AI use" : ปุ่มตัวเลือก Yes / No ใต้หัวข้อนั้น
      const aiRadio = () => {
        const byName = dlg.querySelector(`tp-yt-paper-radio-button[name="${name}"]`);
        if (isVisible(byName)) return byName;
        const head = leafByText(dlg, TXT.aiUseHeading);
        let p = head;
        for (let i = 0; p && i < 6; i++, p = p.parentElement) {
          const r = [...p.querySelectorAll(SEL.radio)].find((x) => isVisible(x) && (yes ? TXT.yes : TXT.no).test((x.textContent || '').trim()));
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

  // ===== Collaboration: เชิญช่องอื่นเป็นผู้ร่วมสร้าง =====
  // Details → Show more → #collaboration-button → ytcp-video-collaborators-dialog
  // ค้นหา @handle → เลือกแถวที่ #channel-info ขึ้นต้นด้วย @handle ตรงตัว → ytcp-video-collaborator-manage-dialog กด Create link
  // → ytcp-video-collaborator-invite-link-dialog แสดงลิงก์ (span.invite-link) → ปิด → Save
  // YouTube ไม่ส่งคำเชิญให้เอง ต้องส่งลิงก์ให้อีกฝ่ายเปิดแล้วกดยอมรับ (ลิงก์ใช้ได้หลังกด Save)
  const isOff = (el) => !el || el.disabled || el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' || !!el.closest('[disabled],[aria-disabled="true"]');
  // กดปุ่มในหน้าต่าง — ต้องเห็นปุ่มและกดได้จริง ไม่งั้นคืน false (เดิมคืน true ทุกครั้งที่ "เจอ element"
  // ปุ่ม Save ที่ยังกดไม่ได้จึงถูกนับว่ากดสำเร็จ แล้วรายงานว่าเชิญเสร็จทั้งที่ไม่ได้บันทึกอะไรเลย)
  const clickIn = (root, sel) => {
    const host = root && [...root.querySelectorAll(sel)].find((b) => isVisible(b) && !isOff(b));
    if (!host) return false;
    (host.querySelector('button') || host).click();
    return true;
  };
  // พิมพ์ลงช่องค้นหาของหน้าต่างเชิญ — ใช้ execCommand เหมือน typeInto เพราะ Polymer ไม่รับรู้
  // การ set .value ตรง ๆ แต่ไม่กด Enter (Enter จะไปเลือกผลลัพธ์แถวแรกซึ่งอาจเป็นช่องผิด)
  async function typeSearch(input, text) {
    if (!text && !input.value) return;
    input.focus();
    input.select?.();
    document.execCommand('selectAll', false, null);
    if (text) document.execCommand('insertText', false, text);
    else document.execCommand('delete', false, null);
    if (input.value !== text) input.value = text; // เผื่อเบราว์เซอร์ไม่รองรับ execCommand
    for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true }));
    await sleep(600); // ให้ Studio ยิงค้นหา (debounce)
  }
  // ปุ่มในหน้าต่างที่หา id ไม่เจอ (YouTube เปลี่ยน id) → หาจากข้อความบนปุ่มแทน
  const clickByText = (root, re) => {
    const host = root && [...root.querySelectorAll(SEL.button)]
      .find((b) => isVisible(b) && !isOff(b) && re.test(normText(b.textContent)));
    if (!host) return false;
    (host.querySelector('button') || host).click();
    return true;
  };
  const shownDialog = (tag) => { const d = document.querySelector(tag); return d && isVisible(d.querySelector(SEL.paperDialog)) ? d : null; };

  async function inviteCollaborators(handles, dlg = getDialog()) {
    // saved: null = ไม่มีอะไรต้องบันทึก, true = บันทึกแล้วจริง, false = บันทึกไม่สำเร็จ
    const res = { links: [], errors: [], skipped: [], saved: null };
    if (!handles.length) return res;
    let btn = dlg.querySelector(SEL.collabButton);
    if (!isVisible(btn)) {
      const more = dlg.querySelector(SEL.showMore);
      if (more && TXT.showMoreText.test(more.textContent)) more.click();
      btn = await waitFor(() => { const b = dlg.querySelector(SEL.collabButton); return isVisible(b) && b; }, 4000);
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
      const host = cd.querySelector(SEL.collabSearch);
      const input = host && (host.matches('input,textarea') ? host : host.querySelector('input,textarea'));
      if (!input) { res.errors.push(L(`${handle}: ไม่พบช่องค้นหาในหน้าต่างเชิญ`, `${handle}: search box not found in the invite dialog`)); break; }
      await typeSearch(input, '');     // ล้างคำค้นเดิมก่อน ไม่งั้นแถวของ handle ก่อนหน้ายังค้างอยู่
      await typeSearch(input, handle);
      const row = await waitFor(() => [...cd.querySelectorAll(SEL.collabOption)].find((r) =>
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
    const own = (b) => !b.closest(`${SEL.collabManageDialog},${SEL.collabLinkDialog}`);
    const saveBtn = () => [...cd.querySelectorAll(SEL.dialogSave)].find((b) => own(b) && isVisible(b) && !isOff(b)) ||
      [...cd.querySelectorAll(SEL.button)].find((b) => own(b) && isVisible(b) && !isOff(b) && TXT.saveButton.test(normText(b.textContent)));
    const clickedSave = await waitFor(() => { const b = saveBtn(); if (!b) return false; (b.querySelector('button') || b).click(); return true; }, 8000, 500);
    const closed = clickedSave && await waitFor(() => !shownDialog(SEL.collabDialog), 10000);
    res.saved = !!closed;
    if (!clickedSave) res.errors.push(L('ปุ่ม Save ในหน้าต่างเชิญกดไม่ได้ — คำเชิญยังไม่ถูกบันทึก', 'The invite dialog\'s Save button never became clickable — the invitations were not saved'));
    else if (!closed) res.errors.push(L('กด Save ในหน้าต่างเชิญแล้วแต่หน้าต่างไม่ปิด — คำเชิญอาจยังไม่ถูกบันทึก', 'Clicked Save in the invite dialog but it did not close — the invitations may not be saved'));
    return res;
  }

  // เลือกหมวดหมู่ (เทียบข้อความตามที่ Studio แสดง เช่น "Music" หรือ "เพลง")
  async function setCategory(dlg, text) {
    const trig = dlg.querySelector(SEL.categoryTrigger);
    if (!trig || trig.textContent.includes(text)) return;
    trig.click();
    const item = await waitFor(() =>
      [...document.querySelectorAll(SEL.listItem)].find((i) => isVisible(i) && i.textContent.trim() === text), 3000);
    if (item) item.click();
    else document.body.click();
  }

  // อัปภาพปก (ช่องนี้จะมีเฉพาะช่องที่ยืนยันตัวตนด้วยเบอร์โทรแล้ว) คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
  // หา element จากข้อความ (เทียบทั้งข้อความ) ภายใน root
  const leafByText = (rootEl, re) =>
    [...rootEl.querySelectorAll('*')].find((e) => e.childElementCount === 0 && isVisible(e) && re.test((e.textContent || '').trim()));
  const clickableOf = (el) => el && (el.closest(SEL.thumbClickable) || el);

  // อัปภาพปก (Studio ต.ค. 2026: ส่วน "Thumbnail" มีกล่อง "Upload file" / "Select from video" / "A/B Testing")
  // วิธีที่ 1: ใส่ภาพลงช่องเลือกไฟล์ที่ไม่ใช่ช่องวิดีโอ  วิธีที่ 2: จำลองการลากภาพมาวางบนกล่อง "Upload file"
  // ถือว่าสำเร็จเมื่อมีภาพใหม่ (blob:/data:) ขึ้นในหน้าต่าง คืนค่าข้อความผิดพลาด หรือ '' ถ้าสำเร็จ
  // ไฟล์ที่ Studio ไม่รับแน่ ๆ (ใหญ่เกิน / ชนิดไม่รองรับ) — ไม่ต้องรอลองซ้ำ
  const thumbUnusable = (file) => file.size > THUMB_MAX || !/\.(jpe?g|png|gif|bmp)$/i.test(file.name);
  async function setThumbnail(file, wait = 6000) {
    if (file.size > THUMB_MAX) return L(`ภาพปกใหญ่เกิน 2MB (${(file.size / 1048576).toFixed(1)} MB)`, `Thumbnail is larger than 2MB (${(file.size / 1048576).toFixed(1)} MB)`);
    if (!/\.(jpe?g|png|gif|bmp)$/i.test(file.name)) return L('ชนิดไฟล์ไม่รองรับ ใช้ JPG / PNG / GIF / BMP', 'Unsupported file type. Use JPG / PNG / GIF / BMP');
    const dlg = getDialog();
    if (!dlg) return L('ไม่พบหน้าต่างอัปโหลด', 'Upload dialog not found');
    const uploadBox = () => clickableOf(leafByText(dlg, TXT.uploadFileBox));
    const area = () => [...dlg.querySelectorAll(SEL.thumbArea)].find(shown) || null;
    await waitFor(() => uploadBox() || area(), 6000);
    const blobs = () => [...dlg.querySelectorAll('img')].filter((i) => /^(blob|data):/.test(i.src)).map((i) => i.src);
    const before = new Set(blobs());
    const changed = () => blobs().some((x) => !before.has(x));
    const makeDT = () => {
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt;
    };
    const dropOn = async (el) => {
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
      const inputs = [...dlg.querySelectorAll('input[type=file]')].filter((i) => i.name !== 'Filedata' && !i.closest(SEL.filePicker));
      for (const input of inputs) {
        input.files = makeDT().files;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        if (await waitFor(changed, wait)) return '';
      }
      const targets = [uploadBox(), area()].filter(Boolean);
      for (const el of [...new Set(targets)]) {
        await dropOn(el);
        if (await waitFor(changed, wait)) return '';
      }
      if (!targets.length && !inputs.length) return L('ไม่พบส่วน Thumbnail / ปุ่ม "Upload file" ในหน้ากรอกรายละเอียด', 'Thumbnail section / "Upload file" button not found on the details page');
      const err = [...dlg.querySelectorAll('*')].find((e) => e.childElementCount === 0 && isVisible(e) &&
        TXT.thumbError.test(e.textContent || ''));
      return err ? L(`Studio แจ้ง: ${err.textContent.trim().slice(0, 120)}`, `Studio says: ${err.textContent.trim().slice(0, 120)}`) :
        L(`Studio ยังไม่รับภาพปก (ช่องเลือกไฟล์ ${inputs.length} · ปุ่ม Upload file ${uploadBox() ? 'เจอ' : 'ไม่เจอ'})`, `Studio hasn't accepted the thumbnail (file inputs: ${inputs.length} · Upload file button: ${uploadBox() ? 'found' : 'not found'})`);
    } finally {
      injectingFile = false;
    }
  }

  // ----- ขั้นใหม่ระหว่าง Details กับ Visibility -----
  const radioByText = (re) => [...(getDialog()?.querySelectorAll(SEL.radio) || [])]
    .find((r) => isVisible(r) && re.test((r.textContent || '').trim()));
  const buttonByText = (rootEl, re) => [...rootEl.querySelectorAll(SEL.button)]
    .find((b) => isVisible(b) && re.test((b.textContent || '').trim()) && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true');

  // Monetisation: ช่อง "Select" (ytcp-video-monetization) → กดปุ่มไอคอนเพื่อเปิดป๊อปอัป
  // ป๊อปอัปอยู่นอกหน้าต่างอัปโหลด: ytcp-video-monetization-edit-dialog > #radio-on / #radio-off > #save-button ("Done")
  // คืนค่า true เมื่อตั้งค่าแล้ว (หรือไม่ต้องทำ), false เมื่อยังทำไม่เสร็จ
  async function handleMonetisation() {
    if (settings.monetization === 'skip') return true;
    const box = getDialog()?.querySelector(SEL.monetBox);
    if (!shown(box)) return true; // ไม่ได้อยู่ที่ขั้นนี้ (element นี้อาจไม่มีกล่องของตัวเอง จึงเช็กจากลูกด้วย)
    const want = settings.monetization === 'off' ? 'off' : 'on';
    const current = (box.innerText || '').trim().toLowerCase();
    if (current === want || current === (want === 'on' ? 'เปิด' : 'ปิด')) return true;
    const popup = () => {
      const d = document.querySelector(SEL.monetDialog);
      return d && isVisible(d.querySelector(SEL.monetRadio(want))) ? d : null;
    };
    if (!popup()) {
      const trigger = box.querySelector(SEL.monetEditBtn) || box;
      (trigger.querySelector('button') || trigger).click();
    }
    const pop = await waitFor(popup, 4000);
    if (!pop) return false;
    const radio = pop.querySelector(`#radio-${want}`);
    if (radio.getAttribute('aria-checked') !== 'true') radio.click();
    const save = await waitFor(() => {
      const b2 = pop.querySelector(`${SEL.dialogSave} button`) || pop.querySelector(SEL.dialogSave);
      return b2 && !b2.disabled && b2.getAttribute('aria-disabled') !== 'true' ? b2 : null;
    }, 3000);
    if (save) save.click();
    await waitFor(() => !popup(), 4000);
    await sleep(500);
    return (box.innerText || '').trim().toLowerCase() === want;
  }

  // Ad suitability: ติ๊ก [role=checkbox][aria-label="None of the above"] → กด #submit-questionnaire-button ("Submit rating")
  // ส่งแล้วแบบสอบถามจะถูกล็อก ("questionnaire is locked")
  async function handleAdSuitability() {
    if (settings.adSuitability !== 'none') return true;
    const dlg = getDialog();
    // แก้บัค: querySelector แบบหลายตัวเลือกคืนตัวนอก (ytcp-uploads-content-ratings) ซึ่งไม่มีกล่องของตัวเอง
    // isVisible จึงเป็น false -> สคริปต์คิดว่าไม่ได้อยู่ขั้นนี้แล้วกด Next ข้ามไปโดยไม่ได้ Submit rating
    const q = dlg?.querySelector('ytpp-self-certification-questionnaire') || dlg?.querySelector(SEL.contentRatings);
    const onStep = shown(q) || TXT.adSuitability.test([...(dlg?.querySelectorAll('h1') || [])].filter(isVisible).map((e) => e.textContent).join(' '));
    if (!q || !onStep) return true; // ไม่ได้อยู่ที่ขั้นนี้
    // แก้บัค: แผงด้านขวามีประโยค "Once you've submitted your rating, you won't be able to change…" อยู่ตลอด
    // ห้ามใช้คำว่า "submitted your rating" ตัดสิน — ใช้ข้อความล็อกจริง "questionnaire is locked since you have submitted your rating"
    const isLocked = () => TXT.questionnaireLocked.test(q.innerText || '');
    if (isLocked()) return true; // ส่งไปแล้ว
    const box = q.querySelector('[role="checkbox"][aria-label="None of the above"], [role="checkbox"][aria-label*="ไม่มี"]') ||
      [...q.querySelectorAll('[role="checkbox"]')].find((c) => TXT.noneOfTheAbove.test(c.getAttribute('aria-label') || ''));
    if (!box) return false;
    if (box.getAttribute('aria-checked') !== 'true') box.click();
    const submit = await waitFor(() => {
      const b2 = dlg.querySelector(`${SEL.submitQuestionnaire} button`) || dlg.querySelector(SEL.submitQuestionnaire);
      return b2 && isVisible(b2) && !b2.disabled && b2.getAttribute('aria-disabled') !== 'true' ? b2 : null;
    }, 4000);
    if (!submit) return false;
    submit.click();
    await sleep(800);
    // บางครั้ง Studio ถามยืนยันอีกชั้นในหน้าต่างแยก
    const pop = [...document.querySelectorAll(SEL.anyDialog)]
      .find((d) => isVisible(d) && !d.closest(SEL.dialog) && TXT.ratingSection.test(d.innerText || ''));
    const ok = pop && buttonByText(pop, TXT.submitRating);
    if (ok) ok.click();
    return !!(await waitFor(isLocked, 10000));
  }

  // กด Next ไปจนถึงหน้า Visibility แล้วเลือกค่า (vis = null คือไปถึงหน้านั้นแต่ไม่เลือก)
  async function goToVisibility(vis) {
    const radio = () => {
      const r = getDialog()?.querySelector(`tp-yt-paper-radio-button[name="${vis || 'PRIVATE'}"]`);
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
      const next = getDialog()?.querySelector(SEL.nextButton);
      const nb = next && (next.querySelector('button') || next);
      if (isVisible(next) && !next.hasAttribute('disabled') && nb.getAttribute('aria-disabled') !== 'true' && !nb.disabled) nb.click();
      else if (Date.now() - stepAt > T(25000)) break;
      await sleep(1200);
    }
    const r = radio();
    if (r && vis) r.click();
    return !!r;
  }

  // ----- ตั้งเวลาปล่อย -----
  const studioLang = () => document.documentElement.lang || navigator.language || 'en';

  // พิมพ์ค่าลงช่อง input ของ Studio แล้วกด Enter ให้ระบบรับค่า
  async function typeInto(input, text) {
    input.focus();
    input.select?.();
    document.execCommand('selectAll', false, null);
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
  function formatStudioDate(date, sample) {
    const year = Number(((sample || '').match(/\d{4}/) || [])[0]);
    const buddhist = year > 2400;
    const lang = studioLang();
    const out = new Intl.DateTimeFormat(`${lang}-u-ca-gregory`, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    // ปีให้ตรงกับระบบที่ Studio ใช้ (พ.ศ. / ค.ศ.)
    return out.replace(/\d{4}/, String(date.getFullYear() + (buddhist ? 543 : 0)));
  }
  // จัดรูปแบบเวลาให้ตรงกับช่องเวลาของ Studio (ดูจากค่าเดิม เช่น "08:00" / "8:00" / "8:00 AM")
  const formatStudioTime = (date, sample = '') => {
    const s = String(sample).trim();
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const h = date.getHours();
      return `${/^\d\d:/.test(s) ? pad(h) : h}:${pad(date.getMinutes())}`;
    }
    return new Intl.DateTimeFormat(`${studioLang()}-u-ca-gregory`, { hour: 'numeric', minute: '2-digit' }).format(date);
  };
  // แปลงข้อความเวลาเป็นนาทีนับจากเที่ยงคืน ("08:00" = "8:00" = "8:00 AM" = 480) คืน null ถ้าอ่านไม่ได้
  function parseClock(text) {
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
  async function setSchedule(date) {
    const dlg = getDialog();
    const expand = await waitFor(() => {
      const e = dlg.querySelector(SEL.scheduleRadio);
      return isVisible(e) && e;
    }, 6000);
    if (!expand) return L('ไม่พบส่วน "กำหนดเวลา" ในหน้าการเปิดเผย', '"Schedule" section not found on the visibility page');
    expand.click();

    const trigger = await waitFor(() => {
      const t = dlg.querySelector(SEL.datePickerTrigger);
      return isVisible(t) && t;
    }, 5000);
    if (!trigger) return L('ไม่พบช่องวันที่', 'Date field not found');
    // ปฏิทินของ Studio: กดช่องวันที่ = เปิด/ปิดสลับกัน และ Escape ปิดไม่ได้ (ตรวจกับ Studio จริง ต.ค. 2026)
    // ถ้าเปิดอยู่แล้วห้ามกดซ้ำ (จะกลายเป็นปิด) · ยังไม่เปิดค่อยกด แล้วลองใหม่ได้ 3 ครั้ง
    const pickerInput = () => {
      const i = [...document.querySelectorAll(SEL.datePickerInput)].find(isVisible);
      return i || null;
    };
    let dateInput = pickerInput();
    for (let k = 0; !dateInput && k < 3; k++) {
      trigger.click();
      dateInput = await waitFor(pickerInput, 4000);
    }
    if (!dateInput) return L('เปิดปฏิทินไม่ได้', 'Could not open the calendar');
    const dateText = formatStudioDate(date, dateInput.value);
    await typeInto(dateInput, dateText);
    if (isVisible(dateInput)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(300);
    }

    const timeInput = await waitFor(() => {
      const i = dlg.querySelector(SEL.timeInput);
      return isVisible(i) && i;
    }, 4000);
    if (!timeInput) return L('ไม่พบช่องเวลา', 'Time field not found');
    const timeText = formatStudioTime(date, timeInput.value);
    const wantMin = date.getHours() * 60 + date.getMinutes();
    const norm = (x) => String(x).toLowerCase().replace(/[\s,.]/g, '');
    // ช่องเวลาของ Studio เป็นช่องเลือกจากรายการ (00:00, 00:15, …) พิมพ์อย่างเดียวค่าไม่ถูกบันทึก (รูป 6: ค้าง 00:00)
    // วิธีที่ 1: คลิกช่องแล้วเลือกเวลาจากรายการ  วิธีที่ 2 (เวลาที่ไม่อยู่ในรายการ เช่น 19:07): พิมพ์ + Enter + Tab
    const pickTime = async () => {
      timeInput.focus();
      timeInput.click();
      const item = await waitFor(() => [...document.querySelectorAll(SEL.timeOption)]
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
    const shownTime = (dlg.querySelector(SEL.timeInput)?.value || '').trim();
    // วันที่: ตัดเลข 0 นำหน้าออกก่อนเทียบ ("05 Oct" = "5 Oct")  เวลา: เทียบเป็นนาที ("08:00" = "8:00")
    const normDate = (x) => norm(x).replace(/(^|D)0+(d)/g, '$1$2');
    if (normDate(shownDate) !== normDate(dateText) || parseClock(shownTime) !== wantMin) {
      return L(`Studio ไม่รับวันเวลา (ตั้ง "${dateText} ${timeText}" แต่แสดง "${shownDate} ${shownTime}")`, `Studio rejected the date/time (set "${dateText} ${timeText}" but shows "${shownDate} ${shownTime}")`);
    }
    return '';
  }

  // ป๊อปอัปแจ้งเตือนที่ขึ้นหลังกด Save/Schedule เช่น
  // "We're still checking your content … Come back before your video is published" [Got it]
  // กดเฉพาะปุ่มรับทราบ (Got it / OK / Close) ไม่กดปุ่มที่เปลี่ยนการตัดสินใจ เช่น "Publish anyway"
  const RE_ACK = TXT.dismissNotice;
  function ackNoticeDialogs() {
    const main = getDialog()?.querySelector(SEL.paperDialog);
    let clicked = false;
    for (const d of document.querySelectorAll(SEL.noticeDialog)) {
      if (d === main || !isVisible(d) || d.contains(main)) continue;
      // "We're still checking your content" และ "Video uploading … Keep this browser tab open until uploading is complete"
      if (!TXT.noticeBody.test(d.innerText || '')) continue;
      const btn = [...d.querySelectorAll('button')].find((b) => isVisible(b) && RE_ACK.test((b.textContent || '').trim()) && !b.disabled);
      if (btn) { btn.click(); clicked = true; }
    }
    return clicked;
  }

  // ปิดป๊อปอัปที่ Studio เด้งขึ้นหลังกด Save (แชร์วิดีโอ / ยังประมวลผลอยู่)
  function closeAfterDialogs() {
    document
      .querySelectorAll(
        SEL.afterDialogs
          .map((d) => `${d} #close-button, ${d} #close-button button, ${d} button[aria-label="Close"]`).join(', ')
      )
      .forEach((b) => isVisible(b) && b.click());
    ackNoticeDialogs();
  }

  // ปุ่มปิดหน้าต่างอัปโหลด (Studio ต.ค. 2026: ytcp-button#ytcp-uploads-dialog-close-button > button[aria-label=Close])
  function closeStudioUploadDialog() {
    const b = [...(getDialog()?.querySelectorAll(SEL.closeDialogBtn) || [])].find(isVisible);
    if (b) b.click();
  }

  const dialogError = () => {
    const e = getDialog()?.querySelector('.error-area, #error-message, .error-short');
    return isVisible(e) ? e.textContent.trim() : '';
  };

  // เปิดหน้าต่างอัปโหลดของ Studio แล้วคืนค่า <input type=file>
  // element ของ Studio บางตัวเป็น display:contents (ไม่มีกล่องของตัวเอง) -> ดูว่ามีลูกตัวไหนแสดงอยู่หรือเปล่า
  const shown = (el) => !!el && (isVisible(el) || [...el.querySelectorAll('*')].some((c) => c.getClientRects().length > 0));
  const byText = (sel, re) => [...document.querySelectorAll(sel)].find((e) => shown(e) && re.test((e.textContent || '').trim()));

  // เปิดหน้าต่างอัปโหลดของ Studio แล้วคืนค่า { input } หรือ { err } บอกว่าติดขั้นไหน
  // ลองหลายทางเพราะ Studio เปลี่ยนหน้าตาบ่อย: (1) หน้าต่างเปิดอยู่แล้ว (2) ปุ่ม Create → Upload videos (3) ปุ่ม Upload ในหน้า Dashboard/Content
  async function openFilePicker() {
    if (ackNoticeDialogs()) await sleep(800); // ป๊อปอัป "Video uploading" ของคลิปก่อนหน้าบังหน้าจออยู่
    const fileInput = () => {
      const dlg = getDialog();
      if (!dlg) return null;
      const input = dlg.querySelector(SEL.fileInput);
      // หน้าต่างต้องอยู่ที่หน้าจอ "เลือกไฟล์" (ไม่ใช่หน้ากรอกรายละเอียดของคลิปก่อน)
      const pickerShown = shown(dlg.querySelector(SEL.filePicker)) || shown(dlg.querySelector(SEL.selectFilesBtn));
      return input && pickerShown && !detailsOpen() ? input : null;
    };
    if (fileInput()) return { input: fileInput() };

    const steps = [];
    // (2) ปุ่ม Create (ไอคอนกล้อง/บวก มุมขวาบน)
    const create = [...document.querySelectorAll(
      SEL.createButton
    )].find(shown);
    if (create) {
      (create.querySelector('button') || create).click();
      const item = await waitFor(() =>
        byText(SEL.menuItem, TXT.uploadVideos) ||
        [...document.querySelectorAll(SEL.firstMenuItem)].find(shown), 4000);
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
    const up = [...document.querySelectorAll(SEL.uploadMenuButton)].find(shown) ||
      byText(SEL.buttonLoose, TXT.uploadVideos);
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
  async function injectUploadFile(input, file) {
    const dlg = getDialog();
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
        const inp = dlg.querySelector('input[type=file][name="Filedata"]') || input; // Studio อาจสร้าง input ใหม่
        inp.files = makeDT().files;
        inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        if (await waitFor(accepted, 5000)) return true;
        if (TXT.invalidFormat.test(dlg.innerText || '')) return true; // Studio รับแล้วแต่ไฟล์ใช้ไม่ได้ -> แจ้งด้วย dialogError
      }

      // วิธีที่ 2
      const zone = picker()?.querySelector(SEL.pickerDropZone) || picker() || dlg;
      const r = zone.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      for (const type of ['dragenter', 'dragover', 'drop']) {
        zone.dispatchEvent(new DragEvent(type, Object.assign({ dataTransfer: makeDT() }, base)));
        await sleep(150);
      }
      return !!(await waitFor(accepted, 8000));
    } finally {
      injectingFile = false;
    }
  }

  // เก็บข้อมูลโครงสร้างหน้าต่างอัปโหลด (ส่วนภาพปก / ช่องเลือกไฟล์ / ปุ่ม) สำหรับหาสาเหตุ
  function diagnoseUploadDialog() {
    const dlg = getDialog();
    if (!dlg || !detailsOpen()) return { error: L('ยังไม่ได้เปิดหน้ากรอกรายละเอียด — เลือกไฟล์ในหน้าต่างอัปโหลดก่อน แล้วกดใหม่', 'Details page is not open yet — select a file in the upload dialog first, then try again') };
    const path = (e) => {
      const c = [];
      for (let p = e, i = 0; p && p !== dlg && i < 8; i++) {
        c.push(p.tagName.toLowerCase() + (p.id ? '#' + p.id : ''));
        p = p.parentElement || (p.getRootNode() && p.getRootNode().host);
      }
      return c.join(' < ');
    };
    const desc = (e) => ({ path: path(e), shown: shown(e), aria: e.getAttribute('aria-label') || '', text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) });
    const all = [...dlg.querySelectorAll('*')];
    return {
      version: GM_info && GM_info.script ? GM_info.script.version : '',
      lang: document.documentElement.lang,
      fileInputs: [...dlg.querySelectorAll('input[type=file]')].map((i) => Object.assign(desc(i), { name: i.name, id: i.id, accept: i.accept })),
      thumbTags: [...new Set(all.map((e) => e.tagName.toLowerCase()).filter((t) => /thumb|still/.test(t)))],
      thumbIds: all.filter((e) => /thumb|still/i.test(e.id)).slice(0, 15).map(desc),
      thumbButtons: all.filter((e) => /^(button|ytcp-button|tp-yt-paper-button)$/i.test(e.tagName) &&
        TXT.thumbButton.test((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || ''))).slice(0, 10).map(desc),
      thumbImgs: all.filter((e) => e.tagName === 'IMG' && e.closest(SEL.thumbArea)).slice(0, 8).map((i) => ({ path: path(i), src: String(i.src).slice(0, 40) })),
      areaFound: !!dlg.querySelector(SEL.thumbArea),
      selectors: checkSelectors(),
    };
  }

  // ข้อความสถานะการอัปโหลดในหน้าต่าง เช่น "Uploading 45% … 3 minutes left" / "Upload complete"
  // selector ตัวไหนใน SEL หาไม่เจอแล้ว (ใช้ตอน Studio เปลี่ยนโครงหน้า — ส่งรายชื่อนี้ให้ผู้พัฒนา)
  function checkSelectors() {
    const out = { missing: [], broken: [] };
    for (const [k, v] of Object.entries(SEL)) {
      for (const sel of typeof v === 'function' ? [v('on')] : [].concat(v)) {
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

  // ความคืบหน้าของคลิปที่กำลังอัป · อัปเดตจาก tick ทุก 0.8 วินาที (uploadOne ไม่ต้องรู้เรื่องนี้)
  let uploadProg = null; // { pct: 0..1 | null, text: string }
  function pollUploadProgress() {
    if (!running) { uploadProg = null; return; }
    const text = uploadProgressText();
    uploadProg = { pct: parseUploadPct(text), text };
  }

  // ===== ช่องที่กำลังใช้งาน (กันอัปผิดช่อง) =====
  function getChannel() {
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const id = (location.pathname.match(/\/channel\/(UC[\w-]{10,})/) || [])[1] || (W.ytcfg && W.ytcfg.get('CHANNEL_ID')) || '';
    const nameEl = document.querySelector(SEL.channelName);
    const imgEl = document.querySelector(
      SEL.channelAvatar
    );
    // @handle: หน้าสลับช่องไม่มี UC id ในแถว ต้องใช้ handle เทียบ (ไม่เจอก็ถอยไปเทียบด้วยชื่อ)
    const hBox = document.querySelector(SEL.channelHandleBox);
    const handle = ((hBox && hBox.textContent) || '').match(/@[a-z0-9._-]+/i);
    return { id, name: nameEl ? nameEl.textContent.trim() : '', avatar: imgEl && imgEl.src ? imgEl.src : '', handle: handle ? handle[0] : '' };
  }
  const chanLabel = (c) => c.name || c.id || L('ไม่ทราบช่อง', 'Unknown channel');
  // คืนค่า '' ถ้าอัปได้ หรือข้อความเตือนถ้าไม่ตรงกับช่องที่ล็อกไว้
  function channelProblem() {
    const lock = settings.lockChannel;
    if (!lock) return '';
    const cur = getChannel();
    if (!cur.id) return L(`ตรวจไม่พบช่องปัจจุบัน (ล็อกไว้ที่ "${lock.name}")`, `Could not detect the current channel (locked to "${lock.name}")`);
    return cur.id === lock.id ? '' : L(`ตอนนี้อยู่ช่อง "${chanLabel(cur)}" แต่ล็อกไว้ที่ "${lock.name}"`, `Currently on channel "${chanLabel(cur)}" but locked to "${lock.name}"`);
  }

  // ===== คิวอัปโหลด =====
  /** @type {{id:number,file:File,presetId:string,n:number,title:string,titleEdited:boolean,status:string,msg:string,ui?:any}[]} */
  const queue = [];
  let qid = 0;
  let running = false;
  let stopReq = false;
  // ห้ามเปลี่ยนหน้า/สลับช่องระหว่างที่คิวอัปโหลดยังมีไฟล์ (ไฟล์อยู่ในหน่วยความจำของหน้า จะหายถ้าเปลี่ยนหน้า)
  const uploadBusy = () => running || queue.some((i) => ['pending', 'uploading', 'review', 'error'].includes(i.status));

  const STATUS = {
    pending: [L('รอคิว', 'Queued'), 'muted'],
    uploading: [L('กำลังทำงาน', 'Working'), 'info'],
    review: [L('รอคุณกด Save', 'Waiting for you to Save'), 'warn'],
    done: [L('เสร็จแล้ว', 'Done'), 'ok'],
    error: [L('ผิดพลาด', 'Error'), 'err'],
  };

  const isVideo = (f) => (f.type || '').startsWith('video/') || VIDEO_EXT.test(f.name);
  const isTxt = (f) => TXT_EXT.test(f.name);
  const isImg = (f) => (f.type || '').startsWith('image/') || IMG_EXT.test(f.name);
  const baseKey = (name) => name.replace(/\.[^.]+$/, '').trim().toLowerCase();

  // อ่าน .txt เป็น UTF-8 ถ้าอ่านแล้วเพี้ยนให้ลองแบบภาษาไทยของ Windows (windows-874)
  async function readText(file) {
    const buf = await file.arrayBuffer();
    const utf8 = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
    return utf8.includes('�') ? new TextDecoder('windows-874').decode(buf) : utf8;
  }

  async function attachTxt(it, file) {
    it.txt = await readText(file);
    it.txtName = file.name;
  }
  function attachThumb(it, file) {
    it.thumb = file;
  }

  // รับไฟล์ปนกันได้: คลิป + .txt + ภาพปก จับคู่ด้วยชื่อไฟล์ (ไม่รวมนามสกุล)
  // ไฟล์เก็บข้ามการรีโหลดไม่ได้ แต่ค่าที่พิมพ์แก้ไว้เก็บได้: ชื่อคลิป, ศิลปิน, เวลาปล่อยที่ตั้งเอง, พรีเซ็ต
  const memoKey = (it) => it.file.name + '|' + it.file.size;
  let memoTimer;
  function saveMemo() {
    clearTimeout(memoTimer);
    memoTimer = setTimeout(() => {
      const memo = load('queueMemo', {});
      for (const it of queue) {
        const k = memoKey(it);
        if (it.status === 'done') { delete memo[k]; continue; }
        if (!(it.status === 'pending' || it.status === 'error')) continue;
        const m = {};
        if (it.titleEdited) m.title = it.title;
        if (it.artistsEdited) m.artists = it.artists;
        if (it.publishEdited && it.publishAt) m.publishAt = it.publishAt;
        if (it.presetId !== activeId) m.presetId = it.presetId;
        if (Object.keys(m).length) memo[k] = { ...m, t: Date.now() };
        else delete memo[k];
      }
      // เก็บแค่ 200 รายการล่าสุด
      const keys = Object.keys(memo).sort((a, b) => memo[b].t - memo[a].t);
      for (const k of keys.slice(200)) delete memo[k];
      save('queueMemo', memo);
    }, 600);
  }
  function restoreMemo(items) {
    const memo = load('queueMemo', {});
    let n = 0;
    for (const it of items) {
      const m = memo[memoKey(it)];
      if (!m) continue;
      if (m.presetId && presets.some((p) => p.id === m.presetId)) it.presetId = m.presetId;
      if (typeof m.title === 'string') { it.title = m.title; it.titleEdited = true; }
      if (typeof m.artists === 'string') { it.artists = m.artists; it.artistsEdited = true; }
      if (m.publishAt && m.publishAt > Date.now() + SCHEDULE_MIN_LEAD) { it.publishAt = m.publishAt; it.publishEdited = true; }
      n++;
    }
    return n;
  }

  async function addFiles(fileList) {
    const files = [...fileList];
    // เรียงตามชื่อแบบตัวเลข (Mix 2 ก่อน Mix 10) — ลำดับในคิว = เลข EP และเวลาปล่อย
    // ข้ามคลิปที่อยู่ในคิวแล้ว (ชื่อ+ขนาดเดียวกัน) กันลากซ้ำแล้วอัปเบิ้ล
    const inQueue = new Set(queue.filter((i) => i.status !== 'done').map((i) => i.file.name + '|' + i.file.size));
    const allVids = files.filter(isVideo).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const vids = allVids.filter((f) => !inQueue.has(f.name + '|' + f.size));
    const dupN = allVids.length - vids.length;
    const added = [];
    const chId = getChannel().id;
    const history = getUploads();
    let prevN = 0;
    for (const file of vids) {
      const it = { id: ++qid, file, presetId: activeId, n: 0, title: '', titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0 };
      // เคยอัปไฟล์นี้ (ชื่อ+ขนาดเดียวกัน) ขึ้นช่องนี้แล้ว -> ใส่คิวแต่ติดป้ายแดง และเตือนอีกครั้งก่อนเริ่ม (อัปซ้ำโดยตั้งใจยังทำได้)
      it.prev = history.find((u) => u.file === file.name && u.size === file.size && (!chId || u.channel === chId)) || null;
      if (it.prev) prevN++;
      queue.push(it);
      added.push(it);
      it.durState = 'loading';
      videoDuration(file).then((d) => { it.duration = d; it.durState = d ? 'ok' : 'fail'; if (it.ui) updateItemUI(it); }); // ใช้เช็ก timestamp เกินความยาวคลิป
    }
    const byKey = new Map();
    for (const it of queue) if (it.status !== 'done') byKey.set(baseKey(it.file.name), it);

    let txtN = 0, imgN = 0, unmatched = 0, skipped = 0;
    for (const f of files) {
      if (isVideo(f)) continue;
      const it = byKey.get(baseKey(f.name));
      if (isTxt(f) || isImg(f)) {
        if (!it) { unmatched++; continue; }
        if (isTxt(f)) { await attachTxt(it, f); txtN++; }
        else { attachThumb(it, f); imgN++; }
        it.titleEdited = false;
      } else skipped++;
    }

    const parts = [];
    if (vids.length) parts.push(L(`เพิ่ม ${vids.length} คลิป`, `Added ${vids.length} video(s)`));
    if (txtN) parts.push(L(`คำอธิบาย .txt ${txtN} ไฟล์`, `${txtN} .txt description file(s)`));
    if (imgN) parts.push(L(`ภาพปก ${imgN} ไฟล์`, `${imgN} thumbnail file(s)`));
    if (unmatched) parts.push(L(`ไม่มีคลิปชื่อตรงกัน ${unmatched} ไฟล์`, `${unmatched} file(s) with no matching video name`));
    const restored = restoreMemo(added); // หลังแนบ .txt (การแนบรีเซ็ตชื่อเป็นค่าจากพรีเซ็ต)
    if (restored) parts.push(L(`ใช้ค่าที่แก้ไว้เดิม ${restored} คลิป`, `Restored your edits for ${restored} video(s)`));
    if (prevN) parts.push(L(`เคยอัปขึ้นช่องนี้แล้ว ${prevN} คลิป (ป้ายแดง)`, `${prevN} already uploaded to this channel (red badge)`));
    if (dupN) parts.push(L(`มีในคิวแล้ว ${dupN} คลิป`, `${dupN} already in the queue`));
    if (skipped) parts.push(L(`ข้าม ${skipped} ไฟล์`, `Skipped ${skipped} file(s)`));
    if (parts.length) toast(parts.join(' · '));
    renderQueue();
  }

  // แจกเลข {n} ตามลำดับในคิว แยกตามพรีเซ็ต แล้วสร้างชื่อใหม่ให้คลิปที่ยังไม่ได้แก้ชื่อเอง
  function assignNumbers() {
    const next = {};
    for (const it of queue) {
      const base = next[it.presetId] ?? (counters[it.presetId] || 0);
      if (it.status === 'uploading' || it.status === 'review') {
        next[it.presetId] = Math.max(base, it.n);
      } else if (it.status === 'pending' || it.status === 'error') {
        it.n = base + 1;
        next[it.presetId] = it.n;
        if (!it.titleEdited) it.title = makeTitle(presetById(it.presetId), itemVars(it));
      }
    }
  }

  // เวลาปล่อยของแต่ละคลิป: แก้เองในการ์ด หรือคำนวณจากเวลาเริ่ม + ลำดับในคิว x ระยะห่าง
  const scheduleOn = () => settings.schedule.on && !!settings.schedule.start;
  const stepMs = () => Math.max(1, Number(settings.schedule.every) || 1) * (settings.schedule.unit === 'hour' ? 3600e3 : 86400e3);
  // คลิปที่อัปเสร็จจะจำเวลาไว้ (publishFinal) และเลื่อนเวลาเริ่มไปช่องถัดไป -> ล้างรายการแล้วเพิ่มใหม่ เวลาจะไม่ชนของเดิม
  function itemPublishAt(it) {
    if (it.publishFinal) return it.publishFinal;
    if (!scheduleOn()) return null;
    if (it.publishEdited && it.publishAt) return it.publishAt;
    return queueSlots().map.get(it) ?? null;
  }
  // ช่องเวลาของคลิปในคิวตามลำดับ: เริ่มที่ effectiveStart แล้วทีละ step
  // ข้ามช่วงที่ (ก) มีคลิปตั้งเวลาไว้ในช่องแล้ว หรือ (ข) มีคลิปในคิวที่ตั้งเวลาเอง — ถือว่าชนเมื่อห่างกันไม่ถึงครึ่ง step
  // (ปล่อยวันละคลิป: คลิปที่ตั้งไว้ 19:00 วันเดียวกันกับช่อง 08:00 ถือว่าชน -> เลื่อนไปวันถัดไป)
  function queueSlots() {
    const map = new Map();
    const start = effectiveStart();
    if (!start) return { map, skipped: 0 };
    const step = stepMs();
    const live = (x) => ['pending', 'uploading', 'review'].includes(x.status);
    const taken = [
      ...takenSlots().map((x) => x.at),
      ...queue.filter((x) => live(x) && x.publishEdited && x.publishAt).map((x) => x.publishAt),
    ];
    const busy = (t) => taken.some((a) => Math.abs(a - t) < step / 2);
    let t = start;
    let skipped = 0;
    for (const x of queue.filter((q) => live(q) && !(q.publishEdited && q.publishAt))) {
      for (let g = 0; busy(t) && g < 1000; g++) { t += step; skipped++; }
      map.set(x, t);
      t += step;
    }
    return { map, skipped };
  }
  // คลิปที่ตั้งเวลาไว้ในช่องปัจจุบัน (แคชต่อช่อง 5 นาที) — ไม่นับคลิปที่คิวนี้เพิ่งอัปเอง
  const chanSched = { ch: '', at: 0, list: [], loading: null };
  const takenSlots = () => (chanSched.ch && chanSched.ch === getChannel().id
    ? chanSched.list.filter((x) => !queue.some((i) => i.videoId && i.videoId === x.videoId)) : []);
  function refreshChanSched(force = false) {
    const ch = getChannel().id;
    if (!ch || !Claims || !Claims.listScheduled) return Promise.resolve();
    if (!force && chanSched.ch === ch && Date.now() - chanSched.at < 300e3) return Promise.resolve();
    if (chanSched.loading) return chanSched.loading;
    chanSched.loading = (async () => {
      try {
        const list = await Claims.listScheduled();
        if (list) { chanSched.list = list; chanSched.ch = ch; }
      } catch (e) {
        console.warn('[YT Presets] scheduled list', e);
      } finally {
        chanSched.at = Date.now(); // ล้มเหลวก็พัก 5 นาที ไม่ยิงซ้ำรัว ๆ
        if (chanSched.ch !== ch) { chanSched.ch = ch; chanSched.list = []; }
        chanSched.loading = null;
        if (typeof onScheduleChange === 'function') onScheduleChange();
      }
    })();
    return chanSched.loading;
  }
  // เวลาเริ่มที่ใช้จริง: ถ้าเวลาที่ตั้งไว้ผ่านไปแล้ว (หรือเหลือไม่ถึง 15 นาที) เลื่อน "ทั้งชุด" ไปช่องแรกที่ยังตั้งได้
  // เลื่อนทีละคลิปไม่ได้ — คลิปที่ถูกเลื่อนจะไปชนช่องของคลิปถัดไป (เช่น 2 คลิปได้ 08:00 วันเดียวกัน)
  function effectiveStart() {
    const start = new Date(settings.schedule.start).getTime();
    if (!start) return 0;
    const step = stepMs();
    const floor = Date.now() + SCHEDULE_MIN_LEAD;
    return start < floor ? start + Math.ceil((floor - start) / step) * step : start;
  }
  const startIsPast = () => scheduleOn() && new Date(settings.schedule.start).getTime() < Date.now() + SCHEDULE_MIN_LEAD;
  const scheduleProblem = (at) => (at && at < Date.now() + SCHEDULE_MIN_LEAD ? L('เวลาปล่อยต้องอยู่ในอนาคตอย่างน้อย 15 นาที', 'Release time must be at least 15 minutes in the future') : '');
  const fmtWhen = (ms) =>
    new Intl.DateTimeFormat(LOCALE === 'th-TH' ? 'th-TH-u-ca-gregory' : LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
  // แปลง ms <-> ค่าของ <input type=datetime-local> ตามเวลาเครื่อง
  const toLocalInput = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const itemVars = (it) =>
    buildVars(it.file.name, it.n, it.txt, { preset: presetById(it.presetId), artists: it.artistsEdited ? it.artists : '' });
  // ผลตรวจ tracklist ของคลิปในคิว (เช็กจากคำอธิบายที่จะอัปจริง)
  function itemTracklist(it) {
    const full = renderDescFull(presetById(it.presetId), itemVars(it));
    return checkTracklist(full.slice(0, DESC_MAX), full.length, it.duration || 0);
  }

  function setItem(it, status, msg = '') {
    // สลับคลิป: ค่าความคืบหน้าของคลิปก่อนหน้าใช้ต่อไม่ได้ (poll รอบถัดไปอีก 0.8 วินาที)
    if (it.status !== status && (status === 'uploading' || it.status === 'uploading')) uploadProg = null;
    it.status = status;
    it.msg = msg;
    updateItemUI(it);
    updateRunUI();
  }

  async function uploadOne(it) {
    const p = presetById(it.presetId);
    const vars = itemVars(it);
    const title = it.titleEdited ? it.title.slice(0, TITLE_MAX) : makeTitle(p, vars);

    const publishAt = itemPublishAt(it);
    if (scheduleProblem(publishAt)) throw new Error(`${scheduleProblem(publishAt)} (${fmtWhen(publishAt)})`);
    if (uploadDialogOpen()) throw new Error(L('มีหน้าต่างอัปโหลดค้างอยู่ ปิดก่อนแล้วกดเริ่มใหม่', 'An upload dialog is still open. Close it, then start again'));
    setItem(it, 'uploading', L('กำลังเปิดหน้าต่างอัปโหลด…', 'Opening upload dialog…'));
    const { input, err: pickErr } = await openFilePicker();
    if (!input) {
      throw new Error(L(`เปิดหน้าต่างอัปโหลดของ Studio ไม่ได้ (${pickErr}) — ลองเปิดหน้าต่างอัปโหลดเองค้างไว้ที่หน้า "เลือกไฟล์" แล้วกด "ลองใหม่" สคริปต์จะใช้หน้าต่างนั้นต่อ`, `Could not open Studio's upload dialog (${pickErr}) — try opening the upload dialog yourself, leave it on the "Select files" page, then click "Retry". The script will continue from that dialog`));
    }

    if (!(await injectUploadFile(input, it.file))) {
      closeStudioUploadDialog();
      throw new Error(L('Studio ไม่รับไฟล์ที่สคริปต์ส่งให้ (ทั้งแบบเลือกไฟล์และแบบลากวาง) — ส่งข้อความนี้ให้ผู้พัฒนาสคริปต์', 'Studio did not accept the file sent by the script (via both file picker and drag-and-drop) — send this message to the script developer'));
    }

    setItem(it, 'uploading', L('กำลังอัปโหลดและกรอกรายละเอียด…', 'Uploading and filling in details…'));
    const titleBox = await waitFor(() => {
      const t = getTitleBox(getDialog());
      return (isVisible(t) && t) || (dialogError() && 'error');
    }, 60000);
    if (!titleBox || titleBox === 'error') throw new Error(dialogError() || L('ไม่พบหน้ากรอกรายละเอียด', 'Details page not found'));
    await waitFor(() => titleBox.textContent.trim(), 8000); // รอ Studio ใส่ชื่อไฟล์ก่อน จะได้ไม่ทับของเรา
    await sleep(800);

    const description = renderDesc(p, vars);
    const tagsOk = await fillDetails({ title, description, tags: renderTags(p, vars) });
    it.draftId = dialogVideoId(); // อาจยังไม่มีลิงก์ จะอ่านซ้ำก่อนกด Save
    const vis = p.visibility || 'PRIVATE';
    let note = tagsOk ? '' : L(' (หาช่องแท็กไม่เจอ)', ' (tags field not found)');
    if (settings.thumb && it.thumb) {
      // Studio เปิดให้ใส่ภาพปกหลังวิดีโออัปขึ้นไปแล้ว -> ลองทุก ~10 วินาทีจนสำเร็จ หรือครบเวลาที่ตั้งไว้
      const t0 = Date.now();
      const limit = Math.max(1, Number(settings.thumbWaitMin) || 120) * 60e3;
      let err = '';
      for (let round = 1; ; round++) {
        const prog = uploadProgressText();
        setItem(it, 'uploading', L(`รอใส่ภาพปก (รอบที่ ${round})${prog ? ' · ' + prog : ''}`, `Waiting to set thumbnail (round ${round})${prog ? ' · ' + prog : ''}`));
        err = await setThumbnail(it.thumb, 3000);
        if (!err || thumbUnusable(it.thumb) || stopReq || !detailsOpen() || Date.now() - t0 > limit) break;
        await sleep(7000);
      }
      if (err) note += L(` (ภาพปก: ${err}${Date.now() - t0 > limit ? ` · รอเกิน ${settings.thumbWaitMin} นาที` : ''})`, ` (thumbnail: ${err}${Date.now() - t0 > limit ? ` · waited over ${settings.thumbWaitMin} min` : ''})`);
    }

    // ตั้งเวลาปล่อย: ไปหน้า Visibility แล้วกรอกวัน/เวลา (คลิปจะเป็นส่วนตัวจนถึงเวลาที่ตั้ง)
    if (publishAt) {
      setItem(it, 'uploading', L(`กำลังตั้งเวลาปล่อย ${fmtWhen(publishAt)}…`, `Scheduling for ${fmtWhen(publishAt)}…`));
      // เช็กซ้ำ: ระหว่างรอภาพปก (อาจนานเป็นชั่วโมง) เวลาที่ตั้งไว้อาจผ่านไปแล้ว
      const late = scheduleProblem(publishAt);
      if (late) throw new Error(late);
      if (!(await goToVisibility(null))) throw new Error(L('ไปหน้า Visibility ไม่สำเร็จ', 'Could not go to the Visibility page'));
      await sleep(600);
      const err = await setSchedule(new Date(publishAt));
      if (err) throw new Error(L('ตั้งเวลาไม่สำเร็จ: ', 'Scheduling failed: ') + err);
    }
    const visText = publishAt ? L(`⏰ ปล่อย ${fmtWhen(publishAt)}`, `⏰ Releases ${fmtWhen(publishAt)}`) : VIS[vis];

    if (settings.autoSave) {
      setItem(it, 'uploading', L('กำลังบันทึก…', 'Saving…'));
      if (!publishAt && !(await goToVisibility(vis))) throw new Error(L('ไปหน้า Visibility ไม่สำเร็จ', 'Could not go to the Visibility page'));
      await sleep(600);
      // ปุ่ม Save/Schedule: ytcp-button#done-button > button (กดตัว button ข้างใน)
      const done = await waitFor(() => {
        const host = getDialog()?.querySelector(SEL.doneButton);
        const b = host && (host.querySelector('button') || host);
        return isVisible(host) && !host.hasAttribute('disabled') && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && b;
      }, 20000);
      if (!done) throw new Error(L('กดปุ่ม Save ไม่ได้ (ปุ่มยังกดไม่ได้ — อาจยังมีขั้นที่ต้องตอบ)', 'Could not click Save (button still disabled — a step may still need an answer)'));
      it.draftId = it.draftId || dialogVideoId();
      setItem(it, 'uploading', L('กด Save แล้ว รอหน้าต่างปิด…', 'Clicked Save, waiting for the dialog to close…'));
      done.click();
      // หลังกด Save/Schedule อาจมีป๊อปอัปแจ้งเตือน เช่น "We're still checking your content" (ปุ่ม Got it) -> กดรับทราบให้
      const closedOk = () => { ackNoticeDialogs(); return !uploadDialogOpen(); };
      if (!(await waitFor(closedOk, 30000, 500))) {
        // บางครั้งต้องกดซ้ำ (เช่น Studio ยังบันทึกข้อมูลก่อนหน้าอยู่)
        if (isVisible(done)) done.click();
        if (!(await waitFor(closedOk, 30000, 500))) throw new Error(L('กด Save แล้วแต่หน้าต่างไม่ปิด — กด Save เองในหน้าต่าง แล้วกดลองใหม่', 'Clicked Save but the dialog did not close — click Save yourself in the dialog, then click Retry'));
      }
    } else {
      if (settings.autoNext && !publishAt) await goToVisibility(vis);
      setItem(it, 'review', L('ตรวจข้อมูลในหน้าต่าง YouTube แล้วกด Save เพื่อไปไฟล์ถัดไป', 'Check the details in the YouTube dialog, then click Save to move to the next file') + note);
      await waitFor(() => (it.draftId = it.draftId || dialogVideoId()) || !uploadDialogOpen(), 20000, 500);
      // กดหยุดระหว่างนี้ = หยุดหลังคลิปนี้ (ไม่ปิดหน้าต่างที่ผู้ใช้กำลังตรวจทิ้ง) — คิวจะหยุดเองหลังคุณกด Save
      await waitFor(() => { ackNoticeDialogs(); return !uploadDialogOpen(); }, 3600000, 1000);
      if (uploadDialogOpen()) throw new Error(L('รอให้กด Save นานเกิน 1 ชั่วโมง', 'Waited over 1 hour for you to click Save'));
    }
    await sleep(1500);
    closeAfterDialogs();

    counters[p.id] = Math.max(counters[p.id] || 0, it.n);
    save('counters', counters);
    if (publishAt) {
      it.publishFinal = publishAt;
      if (!it.publishEdited) {
        settings.schedule.start = toLocalInput(publishAt + stepMs()); // คลิปถัดไปต่อจากคลิปนี้
        saveSettings();
      }
    }
    const videoId = it.draftId || '';
    logUpload({ videoId, title, file: it.file.name, size: it.file.size, txt: vars.txt, description, publishAt, visibility: publishAt ? 'SCHEDULED' : vis });
    it.videoId = videoId;
    setItem(it, 'done', `${title} · ${visText}${note}`);
    if (typeof syncScheduleInput === 'function') syncScheduleInput();
  }

  // รหัสวิดีโอจากลิงก์ในหน้าต่างอัปโหลด (youtu.be/xxxx)
  function dialogVideoId() {
    const a = getDialog()?.querySelector(SEL.videoLink);
    const m = a && a.href.match(/(?:youtu\.be\/|\/video\/|[?&]v=|\/shorts\/)([\w-]{11})/);
    return m ? m[1] : '';
  }

  // ประวัติการอัปโหลด (ใช้ตอนแก้ tracklist หลังตัดลิขสิทธิ์ และดูว่าคลิปไหนตั้งเวลาไว้)
  const getUploads = () => load('uploads', []);
  function logUpload(rec) {
    const ch = getChannel();
    const list = getUploads();
    list.unshift(Object.assign({ date: new Date().toISOString(), channel: ch.id, channelName: chanLabel(ch) }, rec));
    save('uploads', list.slice(0, 1000));
  }
  const uploadOf = (videoId) => (videoId ? getUploads().find((u) => u.videoId === videoId) : null);
  function uploadsCSV() {
    const head = ['date', 'channel', 'title', 'file', 'video_id', 'url', 'visibility', 'publish_at'];
    const rows = getUploads().map((u) => [u.date, u.channelName || u.channel, u.title, u.file, u.videoId,
      u.videoId ? 'https://youtu.be/' + u.videoId : '', u.visibility, u.publishAt ? new Date(u.publishAt).toISOString() : '']);
    downloadCSV([head, ...rows], `uploads-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  function downloadCSV(rows, name) {
    const csv = '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function runQueue() {
    if (running) return;
    const pendingN = queue.filter((i) => i.status === 'pending').length;
    if (!pendingN) return toast(L('ไม่มีคลิปที่รอคิว', 'No videos waiting in the queue'));
    const problem = channelProblem();
    if (problem) {
      openDrawer();
      return toast('⛔ ' + problem);
    }
    // tracklist ที่ YouTube จะไม่สร้าง Chapters ให้ — ถามก่อนเริ่ม (อัปไปแล้วต้องตามแก้คำอธิบายทีละคลิป)
    assignNumbers();
    const pendingItems = queue.filter((i) => i.status === 'pending');
    const badTl = pendingItems.filter((i) => i.txt).map((i) => [i, itemTracklist(i)]).filter(([, tc]) => tc.errors.length);
    const badTime = pendingItems.filter((i) => scheduleProblem(itemPublishAt(i)));
    const prevUp = pendingItems.filter((i) => i.prev);
    await refreshChanSched(true); // เช็กคลิปที่ตั้งเวลาไว้ในช่องล่าสุด ก่อนแสดงเวลาที่จะใช้จริง
    // ยืนยันครั้งเดียวในแผง: ช่องปลายทาง + สรุปคิว + ปัญหาที่ควรรู้ก่อนเริ่ม
    if (settings.confirmStart || badTl.length || badTime.length || prevUp.length) {
      const ch = getChannel();
      const times = pendingItems.map(itemPublishAt).filter(Boolean).sort((a, b) => a - b);
      const vis = [...new Set(pendingItems.map((i) => presetById(i.presetId).visibility || 'PRIVATE'))].join(', ');
      const noTxt = pendingItems.filter((i) => !i.txt).length;
      const noThumb = settings.thumb ? pendingItems.filter((i) => !i.thumb).length : 0;
      const warnList = (head, items) => h('div', { className: 'warnbox', style: 'margin-top:8px' },
        h('b', {}, icon('alert', 13), head),
        h('ul', {}, items.slice(0, 5).map((x) => h('li', {}, x)), items.length > 5 ? h('li', {}, L(`… และอีก ${items.length - 5} คลิป`, `… and ${items.length - 5} more`)) : null));
      const go = await ask({
        title: L(`อัปโหลด ${pendingN} คลิป`, `Upload ${pendingN} video(s)`),
        ic: 'upload',
        ok: L(`เริ่มอัปโหลด ${pendingN} คลิป`, `Upload ${pendingN} video(s)`),
        body: h('div', {},
          h('div', { className: 'who' },
            ch.avatar ? h('img', { src: ch.avatar, alt: '' }) : h('div', { className: 'ph' }, icon('tv', 18)),
            h('div', { style: 'min-width:0' }, h('small', {}, L('ไปที่ช่อง', 'To channel')), h('b', {}, chanLabel(ch)), h('small', { className: 'mono' }, ch.id || ''))),
          h('div', { className: 'facts' },
            h('span', {}, L('คลิป', 'Videos')), h('span', {}, String(pendingN)),
            h('span', {}, L('เผยแพร่', 'Release')), h('span', {}, times.length
              ? (times.length > 1 ? `${fmtWhen(times[0])} → ${fmtWhen(times[times.length - 1])}` : fmtWhen(times[0]))
              : L(`ทันทีตามพรีเซ็ต (${vis})`, `Per preset (${vis})`)),
            noTxt ? h('span', {}, L('ไม่มี .txt', 'No .txt')) : null, noTxt ? h('span', {}, L(`${noTxt} คลิป`, `${noTxt} video(s)`)) : null,
            noThumb ? h('span', {}, L('ไม่มีภาพปก', 'No thumbnail')) : null, noThumb ? h('span', {}, L(`${noThumb} คลิป`, `${noThumb} video(s)`)) : null),
          badTime.length ? warnList(L(`เวลาปล่อยผ่านไปแล้ว/เร็วไป ${badTime.length} คลิป`, `${badTime.length} release time(s) in the past / too soon`),
            badTime.map((i) => `${i.file.name}: ${fmtWhen(itemPublishAt(i))}`)) : null,
          prevUp.length ? warnList(L(`เคยอัปขึ้นช่องนี้แล้ว ${prevUp.length} คลิป — จะได้คลิปซ้ำ`, `${prevUp.length} already uploaded to this channel — they will be duplicated`),
            prevUp.map((i) => `${i.file.name}: ${i.prev.title || i.prev.videoId || ''}`)) : null,
          badTl.length ? warnList(L(`tracklist มีปัญหา ${badTl.length} คลิป — YouTube จะไม่สร้าง Chapters`, `${badTl.length} tracklist problem(s) — YouTube won't create chapters`),
            badTl.map(([i, tc]) => `${i.file.name}: ${tc.errors[0]}`)) : null,
          badTl.length || badTime.length || prevUp.length ? h('div', { className: 'mut', style: 'margin-top:8px' }, L('กดยกเลิกเพื่อกลับไปแก้ — ดูรายละเอียดได้ที่ป้ายสีแดงในการ์ด', 'Cancel to go back and fix — details are on the red badges in each card')) : null
        ),
      });
      if (!go) return;
      if (running) return;
    }
    running = true;
    stopReq = false;
    updateRunUI();
    let ok = 0;
    try {
      while (!stopReq) {
        assignNumbers();
        const it = queue.find((i) => i.status === 'pending');
        if (!it) break;
        const problem = channelProblem();
        if (problem) {
          toast(L('⛔ หยุดคิว: ', '⛔ Queue stopped: ') + problem);
          break;
        }
        try {
          await uploadOne(it);
          ok++;
        } catch (e) {
          console.error('[YT Presets]', e);
          it.draftId = it.draftId || dialogVideoId();
          setItem(it, 'error', e.message + (it.draftId ? L(` · ไฟล์ขึ้นไปเป็นฉบับร่างแล้ว (${it.draftId}) ลบใน Content ก่อนกดลองใหม่ จะได้ไม่ซ้ำ`, ` · The file is already uploaded as a draft (${it.draftId}). Delete it in Content before retrying to avoid duplicates`) : ''));
          closeStudioUploadDialog();
          if (TXT.uploadLimit.test(e.message)) break;
        }
        if (!stopReq && queue.some((i) => i.status === 'pending')) await sleep(settings.delay * 1000);
      }
    } finally {
      running = false;
      assignNumbers();
      renderQueue();
      const errN = queue.filter((i) => i.status === 'error').length;
      const left = queue.filter((i) => i.status === 'pending').length;
      const msg = stopReq ? L(`หยุดคิวแล้ว (สำเร็จ ${ok} คลิป)`, `Queue stopped (${ok} video(s) done)`) : L(`คิวเสร็จแล้ว สำเร็จ ${ok} คลิป ✅`, `Queue finished: ${ok} video(s) done ✅`);
      toast(msg);
      const clean = !errN && !left;
      notifyDone(clean ? L('อัปโหลดเสร็จแล้ว ✅', 'Upload finished ✅') : L('คิวหยุด — มีคลิปต้องดู ⚠️', 'Queue stopped — needs attention ⚠️'),
        `${chanLabel(getChannel())} · ` + L(`สำเร็จ ${ok}`, `${ok} done`) + (errN ? L(` · ผิดพลาด ${errN}`, ` · ${errN} error(s)`) : '') + (left ? L(` · ค้าง ${left}`, ` · ${left} left`) : ''), clean);
      setTitleMark(document.hasFocus() ? '' : clean ? '✅' : '⚠️');
    }
  }

  // ดักการเลือก/ลากหลายไฟล์ในหน้าต่างของ Studio -> ส่งเข้าคิวของสคริปต์แทน
  document.addEventListener(
    'change',
    (e) => {
      const t = e.target;
      if (!settings.intercept || !(t instanceof HTMLInputElement) || t.type !== 'file') return;
      if (!t.closest(SEL.dialog) || t.files.length < 2) return;
      e.stopImmediatePropagation();
      addFiles(t.files);
      t.value = '';
      closeStudioUploadDialog();
      openDrawer('queue');
    },
    true
  );
  document.addEventListener(
    'drop',
    (e) => {
      if (injectingFile || !settings.intercept || !e.target.closest?.(SEL.dialog)) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length < 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      addFiles(files);
      closeStudioUploadDialog();
      openDrawer('queue');
    },
    true
  );

  // ===== โหมดอัปโหลดเองทีละไฟล์: เติมข้อมูลอัตโนมัติ =====
  let session = null;

  async function applyToOpenDialog() {
    if (!detailsOpen()) return toast(L('ยังไม่ได้เปิดหน้ากรอกรายละเอียดของ YouTube', 'YouTube details page is not open yet'));
    const p = active();
    if (!session) session = { originalName: normText(getTitleBox(getDetailsHost()).textContent), n: 0 };
    session.n = session.n || (counters[p.id] || 0) + 1;
    const vars = buildVars(session.originalName, session.n, '', { preset: p });
    const title = makeTitle(p, vars);
    const tagsOk = await fillDetails({ title, description: renderDesc(p, vars), tags: renderTags(p, vars) });
    counters[p.id] = Math.max(counters[p.id] || 0, session.n);
    save('counters', counters);
    // หน้าแก้ไขคลิปไม่มีขั้น Next/การเปิดเผย — ข้ามไป แล้วเตือนให้กด Save ของ YouTube เอง
    if (settings.autoNext && !onEditPage()) await goToVisibility(p.visibility || 'PRIVATE');
    const note = tagsOk ? '' : L(' (หาช่องแท็กไม่เจอ)', ' (tags field not found)');
    toast(onEditPage()
      ? L(`ใส่ข้อมูลแล้ว: ${title}${note} — กด Save ของ YouTube เพื่อบันทึก`, `Details filled in: ${title}${note} — press YouTube's Save to keep it`)
      : L(`ใส่ข้อมูลแล้ว: ${title}${note}`, `Details filled in: ${title}${note}`));
    renderPresetPreview();
  }

  setInterval(async () => {
    if (running) return;
    if (!uploadDialogOpen()) {
      session = null;
      return;
    }
    if (session || !detailsOpen()) return;
    const s = (session = { originalName: '', n: 0 });
    const titleBox = getTitleBox(getDialog());
    s.originalName = (await waitFor(() => titleBox.textContent.trim(), 8000)) || '';
    const problem = channelProblem();
    if (problem) toast(L('⚠️ ระวังอัปผิดช่อง: ', '⚠️ Possible wrong channel: ') + problem);
    if (session === s && settings.autoApply && !running && !problem) {
      await sleep(800);
      if (session === s) applyToOpenDialog();
    }
  }, 1000);

  // ===== ปุ่มลัดใต้ช่องชื่อ/คำอธิบายของ Studio (หน้าต่างอัปโหลด และหน้าแก้ไขคลิป /video/<id>/edit) =====
  // วางแถบเล็ก ๆ ต่อจาก ytcp-video-title / ytcp-video-description · Studio วาดหน้าใหม่เมื่อไรก็ใส่กลับเอง
  // ไม่กด Save ของ YouTube ให้ — แก้แล้วผู้ใช้ตรวจแล้วกดเอง (Ctrl+Z ย้อนได้เหมือนพิมพ์เอง)
  const qa = { presetId: '', txt: '', txtName: '', key: '' };
  const qaPreset = () => presetById(qa.presetId || activeId);
  // ชื่อไฟล์คลิป (ใช้กับ {name}/{filename}): ส่วน "Filename" ทางขวา → ชื่อตอนเปิดหน้าต่างอัปโหลด → ชื่อคลิปปัจจุบัน
  function qaFileName(host) {
    // หน้าแก้ไขคลิป: ytcp-video-info อยู่คอลัมน์ขวา นอก ytcp-video-details-section -> หาทั้งหน้า
    const info = host && host === getDialog() ? host : document;
    const leaf = [...info.querySelectorAll('ytcp-video-info *')].find((e) => !e.children.length && /\.[a-z0-9]{2,4}$/i.test(e.textContent.trim()));
    return (leaf && leaf.textContent.trim()) || (session && session.originalName) || normText(getTitleBox(host)?.textContent);
  }
  // เคยเป็นบั๊ก: ไม่ได้ใส่ .txt -> {txt} ว่าง -> กด "คำอธิบายจากพรีเซ็ต" ในคลิปที่อัปแล้ว tracklist เดิมหายทั้งก้อน
  // ตอนนี้ใช้ tracklist ที่มีอยู่แทน: .txt ที่ใส่ไว้ → ประวัติการอัปของคลิปนี้ → บรรทัดที่มี timestamp ในคำอธิบายปัจจุบัน
  function qaTracklist(host) {
    if (qa.txt) return { txt: qa.txt, from: 'txt' };
    const vid = (location.pathname.match(/\/video\/([\w-]{11})/) || [])[1];
    const up = vid && uploadOf(vid);
    if (up && up.txt) return { txt: up.txt, from: 'history' };
    const lines = (getDescBox(host)?.innerText || '').split('\n')
      .filter((l) => /^\s*[[(]?(?:\d{1,2}:)?\d{1,3}:\d{1,2}\b/.test(l));
    return { txt: lines.join('\n'), from: lines.length ? 'desc' : '' };
  }
  function qaVars(host) {
    const p = qaPreset();
    const n = (session && session.n) || (counters[p.id] || 0) + 1; // ปุ่มลัดไม่เลื่อนเลข EP เอง
    return buildVars(qaFileName(host), n, qaTracklist(host).txt, { preset: p });
  }
  function qaSay(bar, text, kind = '', undo = null) {
    const st = bar.querySelector('.st');
    st.className = 'st ' + kind;
    st.replaceChildren(text, ...(undo ? [' ', h('button', { type: 'button', className: 'undo', onclick: () => { undo(); st.replaceChildren(L('ย้อนกลับแล้ว', 'Reverted')); } }, L('ย้อนกลับ', 'Undo'))] : []));
    clearTimeout(bar._t);
    // มีปุ่มย้อนกลับ: ค้างไว้นานขึ้นให้ทันกด
    if (kind !== 'err' && kind !== 'warn') bar._t = setTimeout(() => { st.textContent = ''; }, undo ? 20000 : 5000);
  }
  // เขียนลงช่องของ Studio แล้วคืนฟังก์ชันย้อนกลับ (ใส่ข้อความเดิมคืน)
  function qaWrite(box, text) {
    if (!box) return null;
    const before = box.innerText;
    setEditable(box, text);
    return () => setEditable(box, before);
  }
  function qaCheck(bar, host) {
    const text = getDescBox(host)?.innerText || '';
    const tc = checkTracklist(text.slice(0, DESC_MAX), text.length, 0);
    if (tc.errors.length) qaSay(bar, L(`Chapters: ${tc.errors.length} ปัญหา — ${tc.errors[0]}`, `Chapters: ${tc.errors.length} problem(s) — ${tc.errors[0]}`), 'err');
    else if (!tc.count) qaSay(bar, L('ไม่มี timestamp — YouTube จะไม่สร้าง Chapters', 'No timestamps — YouTube won\'t create chapters'), 'warn');
    else qaSay(bar, L(`Chapters ${tc.count} ช่วง ผ่านกฎของ YouTube`, `${tc.count} chapters pass YouTube's rules`) + (tc.warnings.length ? ' · ' + tc.warnings[0] : ''), tc.warnings.length ? 'warn' : 'ok');
  }
  const qaBtn = (ic, label, title, onclick) => h('button', { type: 'button', className: 'qb', title, onclick }, icon(ic, 15), label);

  function qaTitleBar(host) {
    const sel = h('select', { title: L('พรีเซ็ตที่ใช้กับปุ่มลัด', 'Preset used by the quick actions'), onchange: (e) => { qa.presetId = e.target.value; } },
      presets.map((p, i) => h('option', { value: p.id, selected: p.id === qaPreset().id }, `${i + 1}. ${p.label}`)));
    const bar = h('div', { className: 'ytp-qa' },
      sel,
      qaBtn('refresh', L('ชื่อจากพรีเซ็ต', 'Preset title'), L('แทนชื่อคลิปด้วยชื่อที่สร้างจากพรีเซ็ต', 'Replace the title with one built from the preset'), () => {
        const t = makeTitle(qaPreset(), qaVars(host));
        const undo = qaWrite(getTitleBox(host), t);
        qaSay(bar, L(`ใส่ชื่อแล้ว (${t.length}/100)`, `Title set (${t.length}/100)`), t.length > TITLE_MAX ? 'err' : 'ok', undo);
      }),
      qaBtn('copy', L('คัดลอก', 'Copy'), L('คัดลอกชื่อคลิป', 'Copy the title'), () => {
        GM_setClipboard(normText(getTitleBox(host)?.textContent));
        qaSay(bar, L('คัดลอกชื่อแล้ว', 'Title copied'), 'ok');
      }),
      h('span', { className: 'st' }));
    return bar;
  }

  function qaDescBar(host) {
    const txtIn = h('input', { type: 'file', accept: '.txt,text/plain', hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      qa.txt = await readText(f);
      qa.txtName = f.name;
      const p = qaPreset();
      const vars = qaVars(host);
      setEditable(getDescBox(host), renderDesc(p, vars));
      // ชื่อที่ใช้ตัวแปรจาก tracklist ({artists} ฯลฯ) ต้องสร้างใหม่ด้วย ไม่งั้นชื่อกับคำอธิบายไม่ตรงกัน
      if (/\{(artists|track1|trackcount)\}/.test(p.title)) setEditable(getTitleBox(host), makeTitle(p, vars));
      qaCheck(bar, host);
    } });
    const bar = h('div', { className: 'ytp-qa' },
      qaBtn('file', L('คำอธิบายจากพรีเซ็ต', 'Preset description'), L('แทนคำอธิบายด้วยของพรีเซ็ต (ใช้ tracklist จาก .txt ที่ใส่ไว้)', 'Replace the description with the preset\'s (uses the loaded .txt tracklist)'), () => {
        const tl = qaTracklist(host);
        const undo = qaWrite(getDescBox(host), renderDesc(qaPreset(), qaVars(host)));
        qaCheck(bar, host);
        const src = { txt: L('จาก .txt', 'from .txt'), history: L('จากประวัติการอัป', 'from upload history'), desc: L('จากคำอธิบายเดิม', 'kept from the old description') }[tl.from];
        qaSay(bar, (src ? L(`ใส่คำอธิบายแล้ว · tracklist ${src}`, `Description set · tracklist ${src}`) : L('ใส่คำอธิบายแล้ว · ไม่มี tracklist', 'Description set · no tracklist')), src ? 'ok' : 'warn', undo);
      }),
      qaBtn('clip', L('ใส่ .txt', 'Load .txt'), L('เลือกไฟล์ tracklist .txt แล้วสร้างคำอธิบายใหม่', 'Pick a tracklist .txt and rebuild the description'), () => txtIn.click()),
      qaBtn('note', L('แก้ Chapters', 'Fix chapters'), L('timestamp แรกให้เป็น 0:00 และเรียงบรรทัดตามเวลา', 'Make the first timestamp 0:00 and sort the timestamp lines'), () => {
        const box = getDescBox(host);
        const fx = fixChapters(box?.innerText || '');
        if (!fx.changes.length) return qaSay(bar, L('ไม่มีอะไรที่แก้ให้อัตโนมัติได้', 'Nothing that can be fixed automatically'), 'warn');
        const undo = qaWrite(box, fx.text);
        qaCheck(bar, host);
        const st = bar.querySelector('.st');
        qaSay(bar, st.textContent, st.className.replace('st', '').trim(), undo);
      }),
      qaBtn('check', L('ตรวจ Chapters', 'Check chapters'), L('ตรวจ timestamp ในคำอธิบายตามกฎ Chapters ของ YouTube', 'Check the description\'s timestamps against YouTube\'s chapter rules'), () => qaCheck(bar, host)),
      qaBtn('layers', L('แท็กจากพรีเซ็ต', 'Preset tags'), L('เพิ่มแท็กของพรีเซ็ต', 'Add the preset\'s tags'), async () => {
        const ok = await setTags(host, renderTags(qaPreset(), qaVars(host)));
        qaSay(bar, ok ? L('เพิ่มแท็กแล้ว', 'Tags added') : L('หาช่องแท็กไม่เจอ', 'Tags field not found'), ok ? 'ok' : 'err');
      }),
      qaBtn('send', L('ใส่ทั้งหมด', 'Apply all'), L('ชื่อ + คำอธิบาย + แท็ก + ตัวเลือกจากการตั้งค่า', 'Title + description + tags + options from Settings'), async () => {
        const p = qaPreset();
        const vars = qaVars(host);
        const tBox = getTitleBox(host), dBox = getDescBox(host);
        const before = { t: tBox?.innerText || '', d: dBox?.innerText || '' };
        const ok = await fillDetails({ title: makeTitle(p, vars), description: renderDesc(p, vars), tags: renderTags(p, vars) });
        qaCheck(bar, host);
        const undo = () => { if (tBox) setEditable(tBox, before.t); if (dBox) setEditable(dBox, before.d); };
        const st = bar.querySelector('.st');
        if (!ok) qaSay(bar, L('ใส่แล้ว แต่หาช่องแท็กไม่เจอ', 'Applied, but the tags field was not found'), 'warn', undo);
        else qaSay(bar, st.textContent, st.className.replace('st', '').trim(), undo);
      }),
      qaBtn('copy', L('คัดลอก', 'Copy'), L('คัดลอกคำอธิบาย', 'Copy the description'), () => {
        GM_setClipboard(getDescBox(host)?.innerText || '');
        qaSay(bar, L('คัดลอกคำอธิบายแล้ว', 'Description copied'), 'ok');
      }),
      h('span', { className: 'st' }),
      txtIn);
    return bar;
  }

  GM_addStyle(`
    .ytp-qa{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0 4px;font:500 12px/1.4 Roboto,"Noto Sans Thai",Arial,sans-serif}
    .ytp-qa .qb{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:999px;cursor:pointer;
      border:1px solid #d3d3d3;background:#fff;color:#0f0f0f;font:inherit;transition:background .15s,border-color .15s}
    .ytp-qa .qb:hover{background:#f2f2f2;border-color:#bdbdbd}
    .ytp-qa .qb:focus-visible{outline:2px solid #065fd4;outline-offset:1px}
    .ytp-qa .qb svg{flex:0 0 auto}
    .ytp-qa select{height:28px;max-width:180px;border-radius:999px;border:1px solid #d3d3d3;background:#fff;color:#0f0f0f;padding:0 8px;font:inherit;cursor:pointer}
    .ytp-qa .st{font-weight:400;color:#606060;min-width:0}
    .ytp-qa .st .undo{border:0;background:none;padding:0 2px;font:inherit;font-weight:600;color:#065fd4;cursor:pointer;text-decoration:underline}
    html[dark] .ytp-qa .st .undo{color:#3ea6ff}
    .ytp-qa .st.ok{color:#1b873f} .ytp-qa .st.warn{color:#b26a00} .ytp-qa .st.err{color:#cc0000}
    html[dark] .ytp-qa .qb,html[dark] .ytp-qa select{background:#1f1f1f;border-color:#3f3f3f;color:#f1f1f1}
    html[dark] .ytp-qa .qb:hover{background:#2a2a2a;border-color:#5a5a5a}
    html[dark] .ytp-qa .st{color:#aaa}
    html[dark] .ytp-qa .st.ok{color:#4ade80} html[dark] .ytp-qa .st.warn{color:#fbbf24} html[dark] .ytp-qa .st.err{color:#f87171}
  `);

  setInterval(() => {
    const on = settings.quickActions && !running;
    const host = on && getDetailsHost();
    const tEl = host && host.querySelector('ytcp-video-title');
    const dEl = host && host.querySelector('ytcp-video-description');
    if (!tEl || !isVisible(getTitleBox(host))) {
      if (!on) document.querySelectorAll('.ytp-qa').forEach((b) => b.remove());
      return;
    }
    // คลิปใหม่ / หน้าใหม่: ล้าง .txt ที่ใส่ไว้กับคลิปก่อน
    const key = onEditPage() ? location.pathname : 'dlg:' + (session ? session.originalName : '');
    if (key !== qa.key) { qa.key = key; qa.txt = ''; qa.txtName = ''; }
    if (!tEl.nextElementSibling?.classList.contains('ytp-qa')) tEl.after(qaTitleBar(host));
    if (dEl && !dEl.nextElementSibling?.classList.contains('ytp-qa')) dEl.after(qaDescBar(host));
  }, 1000);

  let reloadingOnPurpose = false; // นำเข้าไฟล์ / เปลี่ยนภาษา: ข้อมูลใหม่บันทึกแล้ว ต้องรีโหลดให้ได้ ไม่งั้นค่าเก่าในหน้าจะเขียนทับ
  window.addEventListener('beforeunload', (e) => {
    if (!reloadingOnPurpose && (running || queue.some((i) => i.status === 'pending' || i.status === 'error'))) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ===== UI =====
  // Studio ใช้ Trusted Types จึงสร้าง DOM ด้วย createElement แทน innerHTML
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  // ไอคอน Material Symbols (Google, Apache 2.0) แบบ Rounded น้ำหนัก 400 — ฝัง path ไว้ในสคริปต์
  // ไม่โหลดฟอนต์ไอคอนจากภายนอก: แสดงได้ทันที ไม่ต้องรอโหลด และไม่พึ่งเครือข่าย
  const ICONS = {
    play: 'M320-258v-450q0-14 9-22t21-8q4 0 8 1t8 3l354 226q7 5 10.5 11t3.5 14q0 8-3.5 14T720-458L366-232q-4 2-8 3t-8 1q-12 0-21-8t-9-22Z',
    upload: 'M220-160q-24 0-42-18t-18-42v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113h520v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113q0 24-18 42t-42 18H220Zm230-524-99 99q-8.8 9-20.9 8.5-12.1-.5-21.49-9.5-8.61-9-8.61-21.5t9-21.5l150-150q5-5 10.13-7 5.14-2 11-2 5.87 0 10.87 2 5 2 10 7l151 151q9 9 9 21t-8.61 21q-9.39 9-21.89 9t-21.5-9l-99-98v341q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-341Z',
    download: 'M469-327q-5-2-10-7L308-485q-9-9.27-8.5-21.64.5-12.36 9.11-21.36 9.39-9 21.89-9t21.5 9l98 99v-341q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v341l99-99q8.8-9 20.9-8.5 12.1.5 21.49 9.5 8.61 9 8.61 21.5t-9 21.5L501-334q-5 5-10.13 7-5.14 2-11 2-5.87 0-10.87-2ZM220-160q-24 0-42-18t-18-42v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113h520v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113q0 24-18 42t-42 18H220Z',
    queue: 'M320-620q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h490q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H320Zm0 170q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h490q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H320Zm0 170q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h490q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H320ZM150-620q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Zm0 170q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Zm0 170q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Z',
    layers: 'M151-386q-12-8.94-11.5-23.47T152.08-433q8.3-6 18.11-6 9.81 0 17.81 6l292 227 292-227q8.32-6 18.16-6t18.09 5.97q12 8.95 12.38 23.49Q821-395 809-386L517-159q-16.5 13-36.75 13T443-159L151-386Zm292 75L181-515q-23-17.88-23-46.94T181-609l262-204q16.5-13 36.75-13T517-813l262 204q23 17.88 23 46.94T779-515L517-311q-16.5 13-36.75 13T443-311Zm37-47 262-204-262-204-262 204 262 204Zm0-204Z',
    sliders: 'M435.5-128.63Q427-137.25 427-150v-165q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v53h323q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H487v52q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM150-202q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h187q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Zm165.5-174.63Q307-385.25 307-398v-52H150q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h157v-54q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v166q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM457-450q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h353q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H457Zm144.5-173.63Q593-632.25 593-645v-165q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v52h157q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H653v53q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63ZM150-698q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h353q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Z',
    lock: 'M220-80q-24.75 0-42.37-17.63Q160-115.25 160-140v-434q0-24.75 17.63-42.38Q195.25-634 220-634h70v-96q0-78.85 55.61-134.42Q401.21-920 480.11-920q78.89 0 134.39 55.58Q670-808.85 670-730v96h70q24.75 0 42.38 17.62Q800-598.75 800-574v434q0 24.75-17.62 42.37Q764.75-80 740-80H220Zm0-60h520v-434H220v434Zm314.5-162.03Q557-324.06 557-355q0-30-22.67-54.5t-54.5-24.5q-31.83 0-54.33 24.5t-22.5 55q0 30.5 22.67 52.5t54.5 22q31.83 0 54.33-22.03ZM350-634h260v-96q0-54.17-37.88-92.08-37.88-37.92-92-37.92T388-822.08q-38 37.91-38 92.08v96ZM220-140v-434 434Z',
    unlock: 'M220-80q-24.75 0-42.37-17.63Q160-115.25 160-140v-434q0-24.75 17.63-42.38Q195.25-634 220-634h390v-96q0-54.17-37.92-92.08Q534.17-860 480-860q-47.6 0-83.3 30-35.7 30-44.7 75-2 11-11 18t-20.72 7Q307-730 299-740q-8-10-6-23 11-67 63.5-112T480-920q78.85 0 134.42 55.58Q670-808.85 670-730v96h70q24.75 0 42.38 17.62Q800-598.75 800-574v434q0 24.75-17.62 42.37Q764.75-80 740-80H220Zm0-60h520v-434H220v434Zm314.5-162.03Q557-324.06 557-355q0-30-22.67-54.5t-54.5-24.5q-31.83 0-54.33 24.5t-22.5 55q0 30.5 22.67 52.5t54.5 22q31.83 0 54.33-22.03ZM220-140v-434 434Z',
    x: 'M480-438 270-228q-9 9-21 9t-21-9q-9-9-9-21t9-21l210-210-210-210q-9-9-9-21t9-21q9-9 21-9t21 9l210 210 210-210q9-9 21-9t21 9q9 9 9 21t-9 21L522-480l210 210q9 9 9 21t-9 21q-9 9-21 9t-21-9L480-438Z',
    stop: 'M240-300v-360q0-24.75 17.63-42.38Q275.25-720 300-720h360q24.75 0 42.38 17.62Q720-684.75 720-660v360q0 24.75-17.62 42.37Q684.75-240 660-240H300q-24.75 0-42.37-17.63Q240-275.25 240-300Z',
    clear: 'M261-120q-24.75 0-42.37-17.63Q201-155.25 201-180v-570h-11q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h158q0-13 8.63-21.5 8.62-8.5 21.37-8.5h204q12.75 0 21.38 8.62Q612-822.75 612-810h158q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5h-11v570q0 24.75-17.62 42.37Q723.75-120 699-120H261Zm438-630H261v570h438v-570ZM418.5-274.63q8.5-8.62 8.5-21.37v-339q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v339q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63Zm166 0q8.5-8.62 8.5-21.37v-339q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v339q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63ZM261-750v570-570Z',
    refresh: 'M480-160q-133 0-226.5-93.5T160-480q0-133 93.5-226.5T480-800q85 0 149 34.5T740-671v-99q0-13 8.5-21.5T770-800q13 0 21.5 8.5T800-770v194q0 13-8.5 21.5T770-546H576q-13 0-21.5-8.5T546-576q0-13 8.5-21.5T576-606h138q-38-60-97-97t-137-37q-109 0-184.5 75.5T220-480q0 109 75.5 184.5T480-220q75 0 140-39.5T717-366q5-11 16.5-16.5t22.5-.5q12 5 16 16.5t-1 23.5q-39 84-117.5 133.5T480-160Z',
    clip: 'M728-326q0 103-72.18 174.5-72.17 71.5-175 71.5Q378-80 305.5-151.5T233-326v-380q0-72.5 51.5-123.25T408-880q72 0 123.5 50.75T583-706v360q0 42-30 72t-72.5 30q-42.5 0-72.5-29.67-30-29.68-30-72.33v-340q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v340q0 17 12.5 29.5t30.64 12.5q18.14 0 30-12.5T523-346v-360q0-48-33.5-81t-81.71-33q-48.21 0-81.5 33.06T293-706v380q0 78 54.97 132T481-140q77.92 0 132.46-54Q668-248 668-326v-360q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v360Z',
    file: 'M349-250h262q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H349q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm0-170h262q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H349q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5ZM220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h336q12.44 0 23.72 5T599-862l183 183q8 8 13 19.28 5 11.28 5 23.72v496q0 24-18 42t-42 18H220Zm331-584v-156H220v680h520v-494H581q-12.75 0-21.37-8.63Q551-651.25 551-664ZM220-820v186-186 680-680Z',
    image: 'M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm0-60h600v-600H180v600Zm0 0v-600 600Zm86-97h429q8.5 0 12.75-8t-.75-16L590-457q-5-6-12-6t-12 6L446-302l-81-111q-5-6-12-6t-12 6l-86 112q-6 8-1.75 16t12.75 8Z',
    film: 'm140-800 58 119q7.73 15.4 22.08 24.2Q234.44-648 251-648q32.5 0 49.25-27.46T303-732l-33-68h89l58 119q7.73 15.4 22.08 24.2Q453.44-648 470-648q32.5 0 49.25-27.46T522-732l-33-68h89l58 119q7.73 15.4 22.08 24.2Q672.44-648 689-648q32.5 0 49.25-27.46T741-732l-33-68h112q24 0 42 18t18 42v520q0 24-18 42t-42 18H140q-24 0-42-18t-18-42v-520q0-24 18-42t42-18Zm0 212v368h680v-368H140Zm0 0v368-368Z',
    plus: 'M450-450H230q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h220v-220q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v220h220q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H510v220q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-220Z',
    copy: 'M300-200q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h440q24 0 42 18t18 42v560q0 24-18 42t-42 18H300Zm0-60h440v-560H300v560ZM180-80q-24 0-42-18t-18-42v-590q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v590h470q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32Q662.75-80 650-80H180Zm120-180v-560 560Z',
    star: 'M480-269 294-157q-8 5-17 4.5t-16-5.5q-7-5-10.5-13t-1.5-18l49-212-164-143q-8-7-9.5-15.5t.5-16.5q2-8 9-13.5t17-6.5l217-19 84-200q4-9 12-13.5t16-4.5q8 0 16 4.5t12 13.5l84 200 217 19q10 1 17 6.5t9 13.5q2 8 .5 16.5T826-544L662-401l49 212q2 10-1.5 18T699-158q-7 5-16 5.5t-17-4.5L480-269Z',
    check: 'm378-332 363-363q9-9 21.5-9t21.5 9q9 9 9 21.5t-9 21.5L399-267q-9 9-21 9t-21-9L175-449q-9-9-8.5-21.5T176-492q9-9 21.5-9t21.5 9l159 160Z',
    alert: 'M92-120q-9 0-15.5-4T66-135q-4-7-4.5-14.5T66-165l388-670q5-8 11.5-11.5T480-850q8 0 14.5 3.5T506-835l388 670q5 8 4.5 15.5T894-135q-4 7-10.5 11t-15.5 4H92Zm52-60h672L480-760 144-180Zm361.5-65.5Q514-254 514-267t-8.5-21.5Q497-297 484-297t-21.5 8.5Q454-280 454-267t8.5 21.5Q471-237 484-237t21.5-8.5Zm0-111Q514-365 514-378v-164q0-13-8.5-21.5T484-572q-13 0-21.5 8.5T454-542v164q0 13 8.5 21.5T484-348q13 0 21.5-8.5ZM480-470Z',
    send: 'M686-450H190q-13 0-21.5-8.5T160-480q0-13 8.5-21.5T190-510h496L459-737q-9-9-9-21t9-21q9-9 21-9t21 9l278 278q5 5 7 10t2 11q0 6-2 11t-7 10L501-181q-9 9-21 9t-21-9q-9-9-9-21t9-21l227-227Z',
    tv: 'm415-328 218-141q7-4.5 7-12.75T633-495L415-636q-8-5-15.5-.5T392-623v282q0 9 7.5 13.5t15.5-.5ZM140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-520H140v520Zm0 0v-520 520Z',
    swap: 'm194-323 100 100q9 9 9 21t-9 21q-9 9-21 9t-21-9L101-332q-5-5-7-10t-2-11q0-6 2-11t7-10l151-151q9-9 21-9t21 9q9 9 9 21t-9 21L194-383h286q13 0 21.5 8.5T510-353q0 13-8.5 21.5T480-323H194Zm572-254H480q-13 0-21.5-8.5T450-607q0-13 8.5-21.5T480-637h286L666-737q-9-9-9-21t9-21q9-9 21-9t21 9l151 151q5 5 7 10t2 11q0 6-2 11t-7 10L708-435q-9 9-21 9t-21-9q-9-9-9-21t9-21l100-100Z',
    ext: 'M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h249q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H180v600h600v-249q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v249q0 24-18 42t-42 18H180Zm600-617L403-360q-9 9-21 8.5t-21-9.5q-9-9-9-21t9-21l377-377H549q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h261q12.75 0 21.38 8.62Q840-822.75 840-810v261q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-188Z',
    clock: 'M513-492v-171q0-13-8.5-21.5T483-693q-13 0-21.5 8.5T453-663v183q0 6 2 11t6 10l144 149q9 10 22.5 9.5T650-310q9-9 9-22t-9-22L513-492ZM480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-82 31.5-155t86-127.5Q252-817 325-848.5T480-880q82 0 155 31.5t127.5 86Q817-708 848.5-635T880-480q0 82-31.5 155t-86 127.5Q708-143 635-111.5T480-80Zm0-400Zm0 340q140 0 240-100t100-240q0-140-100-240T480-820q-140 0-240 100T140-480q0 140 100 240t240 100Z',
    shield: 'M470.12-85q-4.56-1-9.12-3-139-47-220-168.5t-81-266.61V-719q0-19.26 10.88-34.66Q181.75-769.07 199-776l260-97q11-4 21-4t21 4l260 97q17.25 6.93 28.13 22.34Q800-738.26 800-719v195.89Q800-378 719-256.5T499-88q-4.56 2-9.12 3T480-84q-5.32 0-9.88-1Zm9.88-58q115-38 187.5-143.5T740-523v-196l-260-98-260 98v196q0 131 72.5 236.5T480-143Zm0-337Z',
    chev: 'M469-358q-5-2-10-7L261-563q-9-9-8.5-21.5T262-606q9-9 21.5-9t21.5 9l175 176 176-176q9-9 21-8.5t21 9.5q9 9 9 21.5t-9 21.5L501-365q-5 5-10 7t-11 2q-6 0-11-2Z',
    up: 'M480-554 304-378q-9 9-21 8.5t-21-9.5q-9-9-9-21.5t9-21.5l197-197q9-9 21-9t21 9l198 198q9 9 9 21t-9 21q-9 9-21.5 9t-21.5-9L480-554Z',
    down: 'M469-358q-5-2-10-7L261-563q-9-9-8.5-21.5T262-606q9-9 21.5-9t21.5 9l175 176 176-176q9-9 21-8.5t21 9.5q9 9 9 21.5t-9 21.5L501-365q-5 5-10 7t-11 2q-6 0-11-2Z',
    folder: 'M140-160q-23 0-41.5-18.5T80-220v-520q0-23 18.5-41.5T140-800h256q12.44 0 23.72 5t19.37 13.09L481-740h369q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H455l-60-60H140v520l90-355q5-20 21.83-32.5Q268.65-620 289-620h574q29 0 47.5 23t10.5 52l-88 339q-6 24-22 35t-41 11H140Zm63-60h572l84-340H287l-84 340Zm-63-353v-167 167Zm63 353 84-340-84 340Z',
    bell: 'M190-200q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h50v-304q0-84 49.5-150.5T420-798v-22q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v22q81 17 130.5 83.5T720-564v304h50q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H190Zm290-302Zm0 422q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM300-260h360v-304q0-75-52.5-127.5T480-744q-75 0-127.5 52.5T300-564v304Z',
    ok: 'm421-389-98-98q-9-9-22-9t-23 10q-9 9-9 22t9 22l122 123q9 9 21 9t21-9l239-239q10-10 10-23t-10-23q-10-9-23.5-8.5T635-603L421-389Zm59 309q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z',
    robot: 'M147-376q-45 0-76-31.21T40-483q0-44.58 31.21-75.79Q102.42-590 147-590v-123q0-24 18-42t42-18h166q0-45 31-76t76-31q45 0 76 31.21T587-773h166q24 0 42 18t18 42v123q45 0 76 31.21T920-483q0 44.58-31.21 75.79Q857.58-376 813-376v196q0 24-18 42t-42 18H207q-24 0-42-18t-18-42v-196Zm224.5-111.74q11.5-11.73 11.5-28.5 0-16.76-11.74-28.26-11.73-11.5-28.5-11.5-16.76 0-28.26 11.74-11.5 11.73-11.5 28.5 0 16.76 11.74 28.26 11.73 11.5 28.5 11.5 16.76 0 28.26-11.74Zm274 0q11.5-11.73 11.5-28.5 0-16.76-11.74-28.26-11.73-11.5-28.5-11.5-16.76 0-28.26 11.74-11.5 11.73-11.5 28.5 0 16.76 11.74 28.26 11.73 11.5 28.5 11.5 16.76 0 28.26-11.74ZM342-285h276q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H342q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5ZM207-180h546v-533H207v533Zm273-267Z',
    collab: 'M474-486q26-32 38.5-66t12.5-79q0-45-12.5-79T474-776q76-17 133.5 23T665-631q0 82-57.5 122T474-486Zm202 326q5-15 9.5-29.5T690-220v-34q0-51-26-95t-90-74q173 22 236.5 64T874-254v34q0 24.75-17.62 42.37Q838.75-160 814-160H676Zm124-389h-70q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h70v-70q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v70h70q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5h-70v70q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-70Zm-593 26q-42-42-42-108t42-108q42-42 108-42t108 42q42 42 42 108t-42 108q-42 42-108 42t-108-42ZM0-220v-34q0-35 18.5-63.5T68-360q72-32 128.5-46T315-420q62 0 118 14t128 46q31 14 50 42.5t19 63.5v34q0 24.75-17.62 42.37Q594.75-160 570-160H60q-24.75 0-42.37-17.63Q0-195.25 0-220Zm315-321q39 0 64.5-25.5T405-631q0-39-25.5-64.5T315-721q-39 0-64.5 25.5T225-631q0 39 25.5 64.5T315-541ZM60-220h510v-34q0-16-8-30t-25-22q-69-32-117-43t-105-11q-57 0-104.5 11T92-306q-15 7-23.5 21.5T60-254v34Zm255-411Zm0 411Z',
    paid: 'M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Zm18 278.5q8-8.5 8-19.5v-24q60-7 94.5-40.5T635-371q0-52-28.5-83T508-508q-63-21-86.5-41.5T398-603q0-31 22.5-48.5T482-669q24 0 43 9t33 27q7 8 17 11t19-2q11-5 14.5-16t-3.5-20q-17-24-41.5-38T508-715v-24q0-11-8-19t-19-8q-11 0-19.5 8t-8.5 19v24q-51 7-80.5 37T343-603q0 49 25.5 78t94.5 55q71 27 94 47t23 52q0 33-27 55.5T487-293q-33 0-60.5-16T384-354q-5-8-13.5-12.5T353-368q-13 5-17.5 15.5T338-331q20 33 47.5 53.5T451-247v27q0 11 8.5 19t19.5 8q11 0 19-8.5Z',
    pause: 'M421.5-328.63q8.5-8.62 8.5-21.37v-260q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v260q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63Zm160 0q8.5-8.62 8.5-21.37v-260q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v260q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z',
    wait: 'M308-140h344v-127q0-72-50-121.5T480-438q-72 0-122 49.5T308-267v127ZM190-80q-13 0-21.5-8.5T160-110q0-13 8.5-21.5T190-140h58v-127q0-71 40-129t106-84q-66-27-106-85t-40-129v-126h-58q-13 0-21.5-8.5T160-850q0-13 8.5-21.5T190-880h580q13 0 21.5 8.5T800-850q0 13-8.5 21.5T770-820h-58v126q0 71-40 129t-106 85q66 26 106 84t40 129v127h58q13 0 21.5 8.5T800-110q0 13-8.5 21.5T770-80H190Z',
    cancel: 'm480-438 129 129q9 9 21 9t21-9q9-9 9-21t-9-21L522-480l129-129q9-9 9-21t-9-21q-9-9-21-9t-21 9L480-522 351-651q-9-9-21-9t-21 9q-9 9-9 21t9 21l129 129-129 129q-9 9-9 21t9 21q9 9 21 9t21-9l129-129Zm0 358q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z',
    alarm: 'M512-450v-160q0-13-8.5-21.5T482-640q-13 0-21.5 8.5T452-610v172q0 6 2 11t7 10l118 118q9 9 21 9t21-9q9-9 9-21t-9-21L512-450ZM339.5-110q-65.5-28-114-76.5t-77-114Q120-366 120-441q0-74 28.5-139.5t77-114.5q48.5-49 114-77T479-800q74 0 139.5 28T733-695q49 49 77 114.5T838-441q0 75-28 140.5t-77 114Q684-138 618.5-110T479-82q-74 0-139.5-28ZM479-439ZM71-688q-9-9-8.5-21t9.5-21l121-117q9-8 21.5-7.5T235-846q9 9 8.5 21t-9.5 21L113-687q-9 8-21.5 7.5T71-688Zm816 0q-8 8-20.5 8.5T845-687L724-804q-9-8-9.5-20.5T723-846q8-8 20.5-8.5T765-847l121 117q9 8 9.5 20.5T887-688ZM479-142q125 0 212-87t87-212q0-125-87-212t-212-87q-125 0-212 87t-87 212q0 125 87 212t212 87Z',
    note: 'M190-410q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h240q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H190Zm0-165q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h410q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H190Zm0-165q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h410q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H190Zm330 550v-81q0-5.57 2-10.78 2-5.22 7-10.22l211.61-210.77q9.11-9.12 20.25-13.18Q772-520 783-520q12 0 23 4.5t20 13.5l37 37q9 9 13 20t4 22q0 11-4.5 22.5t-13.58 20.62L652-169q-5 5-10.22 7-5.21 2-10.78 2h-81q-12.75 0-21.37-8.63Q520-177.25 520-190Zm300-233-37-37 37 37ZM580-220h38l121-122-18-19-19-18-122 121v38Zm141-141-19-18 37 37-18-19Z',
    cut: 'M481-415 364-298q11 17 13.5 33t2.5 35q0 64-43 107T230-80q-64 0-107-43T80-230q0-64 43-107t107-43q18 0 35.5 5t36.5 15l116-116-118-118q-17 8-34.5 11t-35.5 3q-64 0-107-43T80-730q0-64 43-107t107-43q64 0 107 43t43 107q0 19-2.5 36T367-662l468 468q23 23 10.5 51.5T801-114q-9 0-17.5-3.5T768-128L481-415Zm118-112-66-66 235-235q7-7 15.5-10.5T801-842q32 0 43.5 29T834-762L599-527ZM294-666q26-26 26-64t-26-64q-26-26-64-26t-64 26q-26 26-26 64t26 64q26 26 64 26t64-26Zm202.5 203.5Q502-468 502-476t-5.5-13.5Q491-495 483-495t-13.5 5.5Q464-484 464-476t5.5 13.5Q475-457 483-457t13.5-5.5ZM294-166q26-26 26-64t-26-64q-26-26-64-26t-64 26q-26 26-26 64t26 64q26 26 64 26t64-26Z',
    party: 'm181-181 314-112-203-204-111 316Zm744-505q-7 7-17 7t-17-7l-2-2q-19-19-44-19.5T800-688L574-462q-7 7-17 7t-17-7q-7-7-7-17t7-17l223-223q32-32 81-32.5t81 31.5q7 7 7 17t-7 17ZM383-811q7-7 17-7t17 7l9 9q35 35 34.5 87.5T425-627l-10 10q-7 7-17 7t-17-7q-7-7-7-17t7-17l13-13q23-23 21.5-52.5T394-766l-11-11q-7-7-7-17t7-17Zm169-73q7-7 17-7t17 7l46 46q31 32 32 80.5T633-677L496-540q-7 7-17 7t-17-7q-7-7-7-17t7-17l135-135q19-19 18.5-48.5T596-806l-44-44q-7-7-7-17t7-17Zm300 505q-7 7-17 7t-17-7l-35-35q-23-23-48-23t-48 23l-33 33q-7 7-17 7t-17-7q-7-7-7-17t7-17l30-30q35-35 84-36t84 34l34 34q7 7 7 17t-7 17ZM181-181Zm-80 41 149-416q4-10 11.5-15t16.5-5q5 0 10.5 2t10.5 7l270 266q5 5 7 10.5t2 11.5q0 9-5 16.5T558-251L140-101q-9 3-17.5 1t-14.5-8q-6-6-8-14.5t1-17.5Z',
    music: 'M286.5-163.5Q243-207 243-270t43.5-106.5Q330-420 393-420q28 0 50.5 8t39.5 22v-420q0-13 8.5-21.5T513-840h174q13 0 21.5 8.5T717-810v75q0 13-8.5 21.5T687-705H543v435q0 63-43.5 106.5T393-120q-63 0-106.5-43.5Z',
    block: 'M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-140q61.01 0 117.51-20.5Q654-181 699-220L220-699q-38 46-59 102.17T140-480q0 142.37 98.81 241.19Q337.63-140 480-140Zm259-121q37-45 59-101.49 22-56.5 22-117.51 0-142.38-98.81-241.19T480-820q-60.66 0-116.83 21T261-739l478 478ZM480-480Z',
    search: 'M378-329q-108.16 0-183.08-75Q120-479 120-585t75-181q75-75 181.5-75t181 75Q632-691 632-584.85 632-542 618-502q-14 40-42 75l242 240q9 8.56 9 21.78T818-143q-9 9-22.22 9-13.22 0-21.78-9L533-384q-30 26-69.96 40.5Q423.08-329 378-329Zm-1-60q81.25 0 138.13-57.5Q572-504 572-585t-56.87-138.5Q458.25-781 377-781q-82.08 0-139.54 57.5Q180-666 180-585t57.46 138.5Q294.92-389 377-389Z',
    sync: 'M220-477q0 63 23.5 109.5T307-287l30 21v-94q0-13 8.5-21.5T367-390q13 0 21.5 8.5T397-360v170q0 13-8.5 21.5T367-160H197q-13 0-21.5-8.5T167-190q0-13 8.5-21.5T197-220h100l-15-12q-64-51-93-111t-29-134q0-94 49.5-171.5T342-766q11-5 21 0t14 16q5 11 0 22.5T361-710q-64 34-102.5 96.5T220-477Zm520-6q0-48-23.5-97.5T655-668l-29-26v94q0 13-8.5 21.5T596-570q-13 0-21.5-8.5T566-600v-170q0-13 8.5-21.5T596-800h170q13 0 21.5 8.5T796-770q0 13-8.5 21.5T766-740H665l15 14q60 56 90 120t30 123q0 93-48 169.5T623-195q-11 6-22.5 1.5T584-210q-5-11 0-22.5t16-17.5q65-33 102.5-96T740-483Z',
    next: 'M680-270v-420q0-13 8.5-21.5T710-720q13 0 21.5 8.5T740-690v420q0 13-8.5 21.5T710-240q-13 0-21.5-8.5T680-270Zm-460-27v-366q0-14 9-22t21-8q5 0 9 1.5t8 4.5l263 182q7 5 10 11.5t3 13.5q0 7-3 13.5T530-455L267-273q-4 3-8 4.5t-9 1.5q-12 0-21-8t-9-22Zm60-183Zm0 125 181-125-181-125v250Z',
    gear: 'M421-80q-14 0-25-9t-13-23l-15-94q-19-7-40-19t-37-25l-86 40q-14 6-28 1.5T155-226L97-330q-8-13-4.5-27t15.5-23l80-59q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521l-80-59q-12-9-15.5-23t4.5-27l58-104q8-13 22-17.5t28 1.5l86 40q16-13 37-25t40-18l15-95q2-14 13-23t25-9h118q14 0 25 9t13 23l15 94q19 7 40.5 18.5T669-710l86-40q14-6 27.5-1.5T804-734l59 104q8 13 4.5 27.5T852-580l-80 57q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l80 58q12 8 15.5 22.5T863-330l-58 104q-8 13-22 17.5t-28-1.5l-86-40q-16 13-36.5 25.5T592-206l-15 94q-2 14-13 23t-25 9H421Zm15-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z',
    bolt: 'm393-165 279-335H492l36-286-253 366h154l-36 255Zm-33-195H217q-18 0-26.5-16t2.5-31l338-488q8-11 20-15t24 1q12 5 19 16t5 24l-39 309h176q19 0 27 17t-4 32L388-66q-8 10-20.5 13T344-55q-11-5-17.5-16T322-95l38-265Zm113-115Z',
    eye: 'M600.5-379.62q49.5-49.62 49.5-120.5T600.38-620.5Q550.76-670 479.88-670T359.5-620.38Q310-570.76 310-499.88t49.62 120.38q49.62 49.5 120.5 49.5t120.38-49.62Zm-200-41.12q-32.5-32.73-32.5-79.5 0-46.76 32.74-79.26 32.73-32.5 79.5-32.5 46.76 0 79.26 32.74 32.5 32.73 32.5 79.5 0 46.76-32.74 79.26-32.73 32.5-79.5 32.5-46.76 0-79.26-32.74ZM234.5-276Q124-352 57-470q-4-7.13-6-14.65-2-7.52-2-15.43 0-7.92 2-15.38 2-7.47 6-14.54 67-118 177.5-194T480-800q135 0 245.5 76T903-530q4 7.12 6 14.65 2 7.52 2 15.43 0 7.92-2 15.38-2 7.47-6 14.54-67 118-177.5 194T480-200q-135 0-245.5-76ZM480-500Zm222.5 174.5Q804-391 857-500q-53-109-154.33-174.5Q601.34-740 480.17-740T257.5-674.5Q156-609 102-500q54 109 155.33 174.5Q358.66-260 479.83-260t222.67-65.5Z',
    info: 'M504.5-288.63q8.5-8.62 8.5-21.37v-180q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v180q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63Zm-1-314.57q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z',
    scan: 'M110-200q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32Q97.25-260 110-260h340q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H110Zm0-210q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32Q97.25-470 110-470h140q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H110Zm0-210q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32Q97.25-680 110-680h140q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H110Zm450 300q-83 0-141.5-58.5T360-520q0-83 58.5-141.5T560-720q83 0 141.5 58.5T760-520q0 32-10 62t-30 56l139 139q9 9 9 21t-9 21q-9 9-21 9t-21-9L678-360q-26 20-56 30t-62 10Zm-.24-60Q618-380 659-420.76q41-40.77 41-99Q700-578 659.24-619q-40.77-41-99-41Q502-660 461-619.24q-41 40.77-41 99Q420-462 460.76-421q40.77 41 99 41Z',
    history: 'M477-120q-142 0-243.5-95.5T121-451q-1-12 7.5-21t21.5-9q12 0 20.5 8.5T181-451q11 115 95 193t201 78q127 0 215-89t88-216q0-124-89-209.5T477-780q-68 0-127.5 31T246-667h75q13 0 21.5 8.5T351-637q0 13-8.5 21.5T321-607H172q-13 0-21.5-8.5T142-637v-148q0-13 8.5-21.5T172-815q13 0 21.5 8.5T202-785v76q52-61 123.5-96T477-840q75 0 141 28t115.5 76.5Q783-687 811.5-622T840-482q0 75-28.5 141t-78 115Q684-177 618-148.5T477-120Zm34-374 115 113q9 9 9 21.5t-9 21.5q-9 9-21 9t-21-9L460-460q-5-5-7-10.5t-2-11.5v-171q0-13 8.5-21.5T481-683q13 0 21.5 8.5T511-653v159Z',
    cloud: 'm450-478-62 62q-9 9-21.1 9-12.1 0-20.9-9-9-9-9-21.5t9-21.5l113-114q9-9 21-9t21 9l114 114q9 9 9 21t-9 21q-9 9-21.5 9t-21.5-9l-62-61v258h241q45 0 77-32t32-77q0-45-32-77t-77-32h-63v-84q0-89-60.5-153T478-739q-89 0-150 64t-61 153h-19q-62 0-105 43.5T100-371q0 62 43.93 106.5T250-220h110q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H250q-86 0-148-62T40-370q0-78 49.5-137.5T217-579q20-97 94-158.5T482-799q113 0 189.5 81.5T748-522v24q72-2 122 46.5T920-329q0 69-50 119t-119 50H510q-24 0-42-18t-18-42v-258Zm30 28Z',
  };
  // อีโมจิที่ใช้เป็นไอคอนสถานะ (การ์ดสถานะลิขสิทธิ์, แถบงาน, ป้ายปุ่มลอย) -> ไอคอนชุดเดียวกัน
  const EMOJI_ICON = {
    '✅': 'ok', '✓': 'check', '✔': 'check', '⚠': 'alert', '🤖': 'robot', '🤝': 'collab', '💰': 'paid', '⏸': 'pause', '⏳': 'wait',
    '❌': 'cancel', '⏰': 'alarm', '📝': 'note', '⬆': 'upload', '✂': 'cut', '🎉': 'party', '🎵': 'music', '⛔': 'block',
    '🔍': 'search', '🔄': 'sync', '▶': 'play', '⏭': 'next', '⚙': 'gear', '⚡': 'bolt', '👀': 'eye', 'ℹ': 'info', '🔒': 'lock',
    '⬇': 'download', '📋': 'queue',
  };
  function icon(name, size = 16) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 -960 960 960');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', ICONS[name] || ICONS.info);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }
  // ข้อความที่ขึ้นต้นด้วยอีโมจิสถานะ -> ไอคอน (ถ้าไม่รู้จัก คืนข้อความเดิม)
  function emojiIcon(e, size = 15) {
    const k = String(e || '').split(String.fromCharCode(0xfe0f)).join('').trim();
    return EMOJI_ICON[k] ? icon(EMOJI_ICON[k], size) : document.createTextNode(e || '');
  }
  const iconBtn = (name, title, onclick, cls = '') => h('button', { className: 'ib ' + cls, title, onclick }, icon(name));

  GM_addStyle(`
    #ytp-root{
      --bg:#ffffff;--surface:#f7f7f9;--surface2:#efeff3;--line:#e4e4ea;--line2:#d6d6de;
      --fg:#111114;--fg2:#5d5d6b;--fg3:#8d8d9a;
      --brand:#ff2d55;--brand2:#ff6a3d;--focus:#3b82f6;
      --ok:#16a34a;--warn:#d97706;--err:#dc2626;--info:#2563eb;--muted:#9a9aa6;
      --shadow:0 24px 60px -12px rgba(15,15,25,.28),0 2px 6px rgba(15,15,25,.06);
      --radius:14px;
      font:13.5px/1.5 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif;color:var(--fg);
      -webkit-font-smoothing:antialiased;letter-spacing:.005em}
    #ytp-root.dark{
      --bg:#0e0e12;--surface:#16161c;--surface2:#1d1d25;--line:#26262f;--line2:#33333e;
      --fg:#ededf2;--fg2:#a3a3b2;--fg3:#6f6f7d;
      --ok:#22c55e;--warn:#f59e0b;--err:#f43f5e;--info:#60a5fa;--muted:#6f6f7d;
      --shadow:0 24px 70px -10px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.04)}
    #ytp-root *{box-sizing:border-box}
    #ytp-root [hidden]{display:none!important}
    #ytp-root .ic{flex:0 0 auto;display:block}
    #ytp-root button{font-family:inherit}
    #ytp-root .mono{font-family:"JetBrains Mono","SF Mono",Consolas,monospace;font-size:11px}

    /* ---------- FAB ---------- */
    #ytp-root .fab{position:fixed;right:18px;bottom:18px;touch-action:none;z-index:100001;display:flex;align-items:center;gap:10px;
      background:#0e0e12;color:#fff;border:1px solid #2a2a33;border-radius:16px;padding:8px 14px 8px 8px;cursor:pointer;
      box-shadow:0 10px 30px -6px rgba(0,0,0,.45);transition:transform .15s,box-shadow .15s;text-align:left}
    #ytp-root .fab:hover{transform:translateY(-2px);box-shadow:0 16px 36px -8px rgba(0,0,0,.55)}
    #ytp-root .fab .logo{width:34px;height:34px}
    #ytp-root .fab .fcol{display:flex;flex-direction:column;min-width:0;max-width:220px;line-height:1.25}
    #ytp-root .fab .fch{font-size:11px;color:#a3a3b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .fab .fpr{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .fab .badge{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;border-radius:999px;
      padding:2px 8px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
    #ytp-root .fab.busy{background-image:linear-gradient(90deg,var(--brand) calc(var(--p,0) * 1%),#2a2a33 0);
      background-repeat:no-repeat;background-size:calc(100% - 16px) 3px;background-position:8px calc(100% - 5px)}
    #ytp-root .fab.bad{border-color:var(--err);box-shadow:0 0 0 3px rgba(244,63,94,.35),0 10px 30px -6px rgba(0,0,0,.45)}
    #ytp-root .fab.bad .fch{color:#fda4af}

    #ytp-root .logo{display:grid;place-items:center;border-radius:10px;color:#fff;flex:0 0 auto;
      background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}

    /* ---------- Drawer ---------- */
    #ytp-root .drawer{position:fixed;top:12px;right:12px;bottom:12px;z-index:100000;width:min(460px,calc(100vw - 24px));
      background:var(--bg);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);
      display:flex;flex-direction:column;overflow:hidden;
      transform:translateX(calc(100% + 24px));transition:transform .28s cubic-bezier(.2,.8,.2,1)}
    #ytp-root .drawer.open{transform:none}
    #ytp-root .ib{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid transparent;
      background:none;color:var(--fg2);cursor:pointer;transition:.15s;flex:0 0 auto}
    #ytp-root .ib:hover{background:var(--surface2);color:var(--fg)}
    #ytp-root .ib:disabled{opacity:.35;cursor:default;background:none}
    #ytp-root .ib.outline{border-color:var(--line)}
    #ytp-root .ib.danger:hover{color:var(--err)}

    /* ---------- Channel ---------- */
    #ytp-root .chan{display:flex;gap:12px;align-items:center;margin:0 16px 12px;padding:10px 10px 10px 12px;border-radius:var(--radius);
      background:var(--surface);border:1px solid var(--line)}
    #ytp-root .chan .av{position:relative;width:40px;height:40px;flex:0 0 auto}
    #ytp-root .chan .av img,#ytp-root .chan .av .ph{width:40px;height:40px;border-radius:50%;object-fit:cover;display:grid;place-items:center;
      background:var(--surface2);color:var(--fg3)}
    #ytp-root .chan .av::after{content:"";position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;
      background:var(--ok);border:2px solid var(--surface)}
    #ytp-root .chan .ct{flex:1;min-width:0}
    #ytp-root .chan .cap{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--fg3)}
    #ytp-root .chan .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .chan .id{color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .chan .lk{display:flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--bg);color:var(--fg2);
      border-radius:10px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:.15s}
    #ytp-root .chan .lk:hover{color:var(--fg);border-color:var(--fg3)}
    #ytp-root .chan.locked .lk{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,transparent);
      background:color-mix(in srgb,var(--ok) 10%,var(--bg))}
    #ytp-root .chan.bad{border-color:var(--err);background:color-mix(in srgb,var(--err) 9%,var(--bg))}
    #ytp-root .chan.bad .av::after{background:var(--err)}
    #ytp-root .chan.bad .id{color:var(--err);font-family:inherit;font-size:12px;font-weight:600;white-space:normal}

    /* ---------- Tabs ---------- */
    #ytp-root .tabs{display:flex;gap:4px;margin:0 16px;padding:4px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .tabs button{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;border:0;background:none;color:var(--fg2);
      padding:8px 6px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
    #ytp-root .tabs button:hover{color:var(--fg)}
    #ytp-root .tabs button.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.12),0 0 0 1px var(--line)}
    #ytp-root .tabs button{white-space:nowrap;min-width:0}
    #ytp-root #tbx-modal .btn.go{flex:0 0 auto;justify-content:center;padding:8px 16px}
    #ytp-root .row .mut{white-space:nowrap}
    #ytp-root .tabs .n{min-width:18px;padding:0 6px;border-radius:999px;background:var(--brand);color:#fff;font-size:10.5px;line-height:18px}
    #ytp-root .tabs .n:empty{display:none}

    #ytp-root .body{flex:1;overflow:auto;padding:14px 16px 18px;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
    #ytp-root .ft{display:flex;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);background:var(--bg)}

    /* ---------- Buttons ---------- */
    #ytp-root .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line2);border-radius:11px;
      padding:9px 14px;font-weight:600;font-size:13px;cursor:pointer;background:var(--bg);color:var(--fg);transition:.15s;white-space:nowrap}
    #ytp-root .btn:hover{background:var(--surface)}
    #ytp-root .btn:disabled{opacity:.45;cursor:default}
    #ytp-root .btn.sm{padding:6px 10px;font-size:12px;border-radius:9px}
    #ytp-root .btn.ghost{border-color:transparent;background:none;color:var(--fg2)}
    #ytp-root .btn.ghost:hover{background:var(--surface2);color:var(--fg)}
    #ytp-root .btn.danger{color:var(--err)}
    #ytp-root .btn.go{flex:1;min-width:0;border:0;color:#fff;padding:10px 16px;justify-content:flex-start;gap:12px;
      background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 8px 20px -8px var(--brand)}
    #ytp-root .btn.go:hover{filter:brightness(1.06)}
    #ytp-root .btn.go:disabled{filter:grayscale(.7);box-shadow:none}
    #ytp-root .btn.go .gi{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.2)}
    #ytp-root .btn.go .gt{display:flex;flex-direction:column;align-items:flex-start;min-width:0;line-height:1.25}
    #ytp-root .btn.go .gt b{font-size:13.5px}
    #ytp-root .btn.go .gt small{font-size:11px;font-weight:500;opacity:.85;max-width:100%;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .btn.go.running .gi{animation:ytp-spin 1.2s linear infinite}

    /* ---------- Form ---------- */
    #ytp-root.dark input{color-scheme:dark}
    #ytp-root .sched{margin-top:12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);overflow:hidden}
    #ytp-root .sched.on{border-color:color-mix(in srgb,var(--brand) 45%,var(--line))}
    #ytp-root .sched .sh{display:flex;align-items:center;gap:10px;padding:10px 12px}
    #ytp-root .sched .sh .si{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;color:var(--brand);flex:0 0 auto;
      background:color-mix(in srgb,var(--brand) 12%,var(--bg))}
    #ytp-root .sched .sh .stx{flex:1;min-width:0}
    #ytp-root .sched .sh b{display:block;font-size:13px}
    #ytp-root .sched .sh small{display:block;font-size:11.5px;color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .sched .sh .sw{padding:0;flex:0 0 auto}
    #ytp-root .sched .sb{padding:0 12px 12px;display:grid;gap:10px}
    #ytp-root .sched .g3{display:grid;grid-template-columns:1fr 70px 96px;gap:8px;align-items:end}
    #ytp-root .sched .g3 .mini,#ytp-root .when .mini{font-size:11px;font-weight:600;color:var(--fg3);margin-bottom:4px}
    #ytp-root .when{display:flex;align-items:center;gap:8px}
    #ytp-root .when input{flex:1}
    #ytp-root .when.bad input{border-color:var(--err);color:var(--err)}
    #ytp-root .when .wl{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--brand);white-space:nowrap}
    #ytp-root .when.bad .wl{color:var(--err)}
    #ytp-root input[type=datetime-local]{width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line2);border-radius:10px;
      padding:8px 11px;font-size:13px;font-family:inherit}
    #ytp-root input[type=datetime-local]:focus{outline:0;border-color:var(--focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 22%,transparent)}
    #ytp-root input[type=text],#ytp-root input[type=number],#ytp-root select,#ytp-root textarea{width:100%;
      background:var(--bg);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:9px 11px;font-size:13px;font-family:inherit;
      transition:border-color .15s,box-shadow .15s}
    #ytp-root select{appearance:none;cursor:pointer;padding-right:30px;
      background-image:linear-gradient(45deg,transparent 50%,var(--fg3) 50%),linear-gradient(135deg,var(--fg3) 50%,transparent 50%);
      background-position:calc(100% - 15px) 52%,calc(100% - 10px) 52%;background-size:5px 5px;background-repeat:no-repeat}
    #ytp-root textarea{min-height:150px;resize:vertical;line-height:1.55}
    #ytp-root input:focus,#ytp-root select:focus,#ytp-root textarea:focus{outline:0;border-color:var(--focus);
      box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 22%,transparent)}
    #ytp-root input:disabled,#ytp-root select:disabled{opacity:.6;background:var(--surface)}
    #ytp-root .lbl{display:flex;justify-content:space-between;align-items:baseline;gap:8px;color:var(--fg2);font-size:12px;font-weight:600;margin:14px 0 6px}
    #ytp-root .lbl:first-child{margin-top:0}
    #ytp-root .lbl span+span{font-weight:400;color:var(--fg3);font-size:11px;text-align:right}
    #ytp-root .row{display:flex;gap:8px;align-items:center}
    #ytp-root .field{position:relative}
    #ytp-root .field .cnt{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none}
    #ytp-root .field input{padding-right:58px}
    #ytp-root .cnt{font-size:11px;color:var(--fg3);font-variant-numeric:tabular-nums}
    #ytp-root .cnt.over{color:var(--err);font-weight:700}

    /* ---------- Section ---------- */
    #ytp-root .sec{border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-top:12px;background:var(--bg)}
    #ytp-root .sec:first-child{margin-top:0}
    #ytp-root .sec>h4{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:.08em;
      text-transform:uppercase;color:var(--fg3)}

    /* ---------- Drop zone ---------- */
    #ytp-root .drop{display:flex;align-items:center;gap:14px;border:1.5px dashed var(--line2);border-radius:var(--radius);padding:16px;
      cursor:pointer;transition:.18s;background:var(--surface)}
    #ytp-root .drop .di{display:grid;place-items:center;width:46px;height:46px;border-radius:12px;flex:0 0 auto;color:var(--brand);
      background:color-mix(in srgb,var(--brand) 12%,var(--bg))}
    #ytp-root .drop b{display:block;font-size:14px}
    #ytp-root .drop span{font-size:12px;color:var(--fg2)}
    #ytp-root .drop .kbd{display:inline-block;margin:4px 4px 0 0;padding:1px 7px;border-radius:6px;border:1px solid var(--line2);
      background:var(--bg);font-size:11px;color:var(--fg2)}
    #ytp-root .drop:hover,#ytp-root .drop.hover{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 6%,var(--bg))}

    /* ---------- Stats ---------- */
    #ytp-root .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
    #ytp-root .stat{border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:var(--bg)}
    #ytp-root .stat b{display:block;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
    #ytp-root .stat span{font-size:11px;color:var(--fg3)}
    #ytp-root .stat.ok b{color:var(--ok)} #ytp-root .stat.err b{color:var(--err)} #ytp-root .stat.info b{color:var(--info)}
    #ytp-root .bar{display:flex;align-items:center;gap:10px;margin-top:12px}
    #ytp-root .progress{flex:1;height:6px;background:var(--surface2);border-radius:99px;overflow:hidden}
    #ytp-root .progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand),var(--brand2));transition:width .4s}
    #ytp-root .bar .cnt{min-width:34px;text-align:right}

    #ytp-root .toolbar{display:flex;gap:8px;align-items:center;margin-top:12px}
    #ytp-root .toolbar select{flex:1}

    /* ---------- Queue cards ---------- */
    #ytp-root .card{position:relative;border:1px solid var(--line);border-radius:var(--radius);padding:12px;margin-top:10px;background:var(--bg);
      transition:border-color .15s,box-shadow .15s}
    #ytp-root .card::before{content:"";position:absolute;left:-1px;top:12px;bottom:12px;width:3px;border-radius:0 3px 3px 0;background:var(--sc,transparent)}
    #ytp-root .card:hover{border-color:var(--line2)}
    #ytp-root .card.uploading,#ytp-root .card.review{border-color:color-mix(in srgb,var(--sc) 55%,var(--line));
      box-shadow:0 0 0 3px color-mix(in srgb,var(--sc) 14%,transparent)}
    #ytp-root .card.done{opacity:.78}
    #ytp-root .card.drag{border-color:var(--focus);border-style:dashed;background:color-mix(in srgb,var(--focus) 6%,var(--bg))}
    #ytp-root .card .top{display:flex;gap:12px;align-items:flex-start}
    #ytp-root .card .th{position:relative;width:104px;aspect-ratio:16/9;border-radius:9px;overflow:hidden;flex:0 0 auto;
      background:linear-gradient(135deg,var(--surface2),var(--surface));display:flex;align-items:center;justify-content:center;color:var(--fg3);border:1px solid var(--line)}
    #ytp-root .card .th img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;display:block}
    #ytp-root .card .th .sz{position:absolute;right:4px;bottom:4px;padding:1px 5px;border-radius:5px;background:rgba(0,0,0,.72);color:#fff;font-size:10px;font-weight:600}
    #ytp-root .card .info{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
    #ytp-root .card .fnrow{display:flex;align-items:center;gap:6px}
    #ytp-root .card .fn{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:13px}
    #ytp-root .card .info select{padding:6px 28px 6px 9px;font-size:12px;border-radius:8px}
    #ytp-root .card .fields{display:grid;gap:8px;margin-top:10px}
    #ytp-root .card .fields .mini{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--fg3);margin-bottom:4px}
    #ytp-root .card .msg{display:flex;gap:6px;align-items:flex-start;font-size:12px;margin-top:10px;padding:8px 10px;border-radius:9px;
      background:var(--surface);color:var(--fg2);word-break:break-word}
    #ytp-root .card.error .msg{background:color-mix(in srgb,var(--err) 9%,var(--bg));color:var(--err)}
    #ytp-root .card.done .msg{background:color-mix(in srgb,var(--ok) 9%,var(--bg));color:var(--ok)}
    #ytp-root .card.review .msg{background:color-mix(in srgb,var(--warn) 10%,var(--bg));color:var(--warn)}

    #ytp-root .pill{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;font-size:11px;font-weight:600;border-radius:999px;
      padding:2px 9px 2px 7px;white-space:nowrap;color:var(--sc);background:color-mix(in srgb,var(--sc) 12%,transparent)}
    #ytp-root .pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
    #ytp-root .card.uploading .pill::before{animation:ytp-pulse 1s ease-in-out infinite}
    #ytp-root .card.pending{--sc:var(--muted)} #ytp-root .card.uploading{--sc:var(--info)} #ytp-root .card.review{--sc:var(--warn)}
    #ytp-root .card.done{--sc:var(--ok)} #ytp-root .card.error{--sc:var(--err)}

    #ytp-root .att{display:flex;flex-wrap:wrap;gap:6px}
    #ytp-root .att .chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;cursor:default;padding:3px 6px 3px 8px;font-size:11.5px}
    #ytp-root .att .chip span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .att .chip.add{cursor:pointer;border-style:dashed;background:none;color:var(--fg2);padding-right:10px}
    #ytp-root .att .chip.add:hover{color:var(--fg);border-color:var(--fg3)}
    #ytp-root .att .chip .rm{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;cursor:pointer;color:var(--fg3)}
    #ytp-root .att .chip .rm:hover{background:var(--surface2);color:var(--err)}
    #ytp-root .att .chip.bad{color:var(--err);border-color:color-mix(in srgb,var(--err) 40%,transparent)}

    #ytp-root .empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;color:var(--fg3);padding:34px 0 20px}
    #ytp-root .empty .ei{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .empty b{color:var(--fg2);font-size:13px}

    /* ---------- Chips / segmented ---------- */
    #ytp-root .chips{display:flex;flex-wrap:wrap;gap:6px}
    #ytp-root .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--surface);color:var(--fg);
      border-radius:999px;padding:5px 11px;font-size:12px;cursor:pointer;transition:.15s}
    #ytp-root .chip:hover{border-color:var(--fg3)}
    #ytp-root .chip.var{font-family:"JetBrains Mono",Consolas,monospace;font-size:11px;padding:3px 9px;color:var(--fg2)}
    #ytp-root .chip.var:hover{color:var(--focus);border-color:var(--focus)}
    #ytp-root .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .seg button{background:none;color:var(--fg2);border:0;padding:8px 4px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer}
    #ytp-root .seg button.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.12),0 0 0 1px var(--line)}

    /* ---------- Presets list ---------- */
    #ytp-root .plist{display:flex;flex-direction:column;gap:6px}
    #ytp-root .pitem{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:11px;border:1px solid var(--line);cursor:pointer;
      background:var(--bg);transition:.15s}
    #ytp-root .pitem:hover{border-color:var(--line2);background:var(--surface)}
    #ytp-root .pitem.on{border-color:var(--focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 16%,transparent)}
    #ytp-root .pitem .k{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--surface2);color:var(--fg2);
      font-size:11px;font-weight:700;flex:0 0 auto}
    #ytp-root .pitem .pl{flex:1;min-width:0}
    #ytp-root .pitem .pl b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .pitem .pl span{display:block;font-size:11px;color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .pitem .main{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--warn);
      background:color-mix(in srgb,var(--warn) 12%,transparent);padding:2px 7px;border-radius:999px}

    /* ---------- YouTube-style preview ---------- */
    #ytp-root .yt{display:flex;gap:12px;padding:12px;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
    #ytp-root .yt .vt{position:relative;width:140px;aspect-ratio:16/9;border-radius:9px;flex:0 0 auto;overflow:hidden;
      background:radial-gradient(120% 120% at 20% 10%,#3b1d2a,#120c14 60%,#07070a);display:grid;place-items:center;color:rgba(255,255,255,.75)}
    #ytp-root .yt .vt .sz{position:absolute;right:5px;bottom:5px;padding:1px 5px;border-radius:4px;background:rgba(0,0,0,.8);color:#fff;font-size:10px;font-weight:600}
    #ytp-root .yt .vtx{flex:1;min-width:0}
    #ytp-root .yt .vtl{font-size:13.5px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
    #ytp-root .yt .vch{font-size:12px;color:var(--fg3);margin-top:4px}
    #ytp-root .tagline{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}
    #ytp-root .tagline span{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--fg2)}

    /* ---------- Switches ---------- */
    #ytp-root .sw{display:flex;align-items:flex-start;gap:12px;padding:11px 0;cursor:pointer}
    #ytp-root .sw+.sw{border-top:1px solid var(--line)}
    #ytp-root .sw input{display:none}
    #ytp-root .sw .t{flex:0 0 38px;height:22px;border-radius:999px;background:var(--line2);position:relative;transition:.18s;margin-top:1px}
    #ytp-root .sw .t::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;
      box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.18s}
    #ytp-root .sw input:checked+.t{background:linear-gradient(135deg,var(--brand),var(--brand2))}
    #ytp-root .sw input:checked+.t::after{left:19px}
    #ytp-root .sw b{display:block;font-weight:600;font-size:13px}
    #ytp-root .sw small{display:block;color:var(--fg3);font-size:12px;margin-top:2px}
    #ytp-root .kv{display:grid;grid-template-columns:1fr 120px;gap:10px;align-items:center;padding:8px 0}
    #ytp-root .kv+.kv{border-top:1px solid var(--line)}
    #ytp-root .kv b{display:block;font-weight:600}
    #ytp-root .kv small{display:block;color:var(--fg3);font-size:12px}
    #ytp-root .hint{display:flex;gap:8px;color:var(--fg2);font-size:12px;line-height:1.6}
    #ytp-root .hint .ic{margin-top:3px;color:var(--fg3)}
    #ytp-root kbd{font-family:inherit;font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid var(--line2);border-bottom-width:2px;background:var(--surface)}

    /* ---------- Toast ---------- */
    #ytp-root .toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);opacity:0;z-index:100002;display:flex;gap:10px;align-items:center;
      background:#111116;color:#f2f2f6;padding:11px 16px;border-radius:12px;border:1px solid #2a2a33;
      box-shadow:0 16px 40px -10px rgba(0,0,0,.6);transition:.22s cubic-bezier(.2,.8,.2,1);max-width:min(560px,90vw);pointer-events:none;font-size:13px}
    #ytp-root .toast .ti{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;flex:0 0 auto;
      background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff}
    #ytp-root .toast.show{opacity:1;transform:translate(-50%,0)}

    /* ---------- Claims tab ---------- */
    #ytp-root .tbx-card{border-radius:12px;background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--muted);padding:10px 12px}
    #ytp-root .tbx-card.busy{border-left-color:var(--info)} #ytp-root .tbx-card.ok{border-left-color:var(--ok)}
    #ytp-root .tbx-card.wait{border-left-color:var(--warn)} #ytp-root .tbx-card.err{border-left-color:var(--err)}
    #ytp-root .tbx-card .ti{display:flex;gap:8px;align-items:center;font-weight:700;font-size:13px}
    #ytp-root .tbx-card .de{color:var(--fg2);margin-top:3px;font-size:12px;word-break:break-word}
    #ytp-root .tbx-bar{height:6px;background:var(--surface2);border-radius:99px;margin-top:8px;overflow:hidden}
    #ytp-root .tbx-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand),var(--brand2));transition:width .4s}
    #ytp-root .tbx-bar.ind i{width:35%!important;animation:ytp-ind 1.2s infinite ease-in-out}
    #ytp-root .act{margin:0 16px 12px;padding:9px 12px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);cursor:pointer}
    #ytp-root .act:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
    #ytp-root .act:hover{background:var(--surface2)}
    #ytp-root .act .arow{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600}
    #ytp-root .act .at{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ytp-root .act .ap{color:var(--fg3);font-variant-numeric:tabular-nums}
    #ytp-root .act .tbx-bar{margin-top:6px}
    #ytp-root .tbx-steps{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
    #ytp-root .tbx-steps span{font-size:10.5px;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--fg3)}
    #ytp-root .tbx-steps span.done{color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent)}
    #ytp-root .tbx-steps span.now{color:var(--info);background:color-mix(in srgb,var(--info) 14%,transparent);font-weight:700}
    #ytp-root .tbx-sd{color:var(--info);margin-top:6px;font-size:12px}
    #ytp-root .tbx-grid3,#ytp-root .tbx-grid2,#ytp-root .tbx-grid1{display:grid;gap:8px;margin-top:10px}
    #ytp-root .tbx-grid3{grid-template-columns:1.2fr 1fr auto} #ytp-root .tbx-grid2{grid-template-columns:1fr 1fr} #ytp-root .tbx-grid1{grid-template-columns:1fr}
    #ytp-root .tbx-grid3 .btn,#ytp-root .tbx-grid2 .btn{padding:9px 10px;font-size:12.5px}
    #ytp-root #tbx-log{max-height:220px;overflow:auto;margin-top:8px;background:var(--surface);border:1px solid var(--line);border-radius:10px;
      padding:8px;font:11.5px/1.55 "JetBrains Mono",Consolas,monospace;color:var(--fg2)}
    #ytp-root #tbx-log div{word-break:break-word}
    #ytp-root .tbx-ok{color:var(--ok)} #ytp-root .tbx-warn{color:var(--warn)} #ytp-root .tbx-err{color:var(--err)}
    #ytp-root .tbx-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line);font-size:12px;line-height:1.55}
    #ytp-root .tbx-note.tbx-err{background:color-mix(in srgb,var(--err) 9%,var(--bg));border-color:color-mix(in srgb,var(--err) 40%,var(--line));margin:0 0 12px}
    #ytp-root .tbx-note.tbx-warn{background:color-mix(in srgb,var(--warn) 10%,var(--bg));border-color:color-mix(in srgb,var(--warn) 40%,var(--line));color:var(--warn)}
    #ytp-root .mut{color:var(--fg3);font-size:12px}
    #ytp-root #tbx-modal{position:fixed;inset:0;z-index:100003;background:rgba(5,5,10,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center}
    #ytp-root #tbx-modal .box{background:var(--bg);color:var(--fg);width:min(580px,95vw);max-height:88vh;overflow:auto;border-radius:18px;padding:20px;
      border:1px solid var(--line);box-shadow:var(--shadow)}
    #ytp-root #tbx-modal h3{margin:0 0 8px;font-size:17px;font-weight:700;letter-spacing:-.01em}
    #ytp-root #tbx-modal textarea{min-height:140px;font:12px/1.55 "JetBrains Mono",Consolas,monospace}
    #ytp-root .tbx-sec{margin-top:16px;padding-top:10px;border-top:1px solid var(--line);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}
    #ytp-root .tbx-cb{display:flex;gap:10px;align-items:flex-start;margin:10px 0;cursor:pointer;font-size:13px}
    #ytp-root .tbx-cb input{margin-top:3px;accent-color:var(--brand)}
    #ytp-root .tbx-scroll{max-height:55vh;overflow:auto;border:1px solid var(--line);border-radius:12px}
    #ytp-root .tbx-table{width:100%;border-collapse:collapse;font-size:12px}
    #ytp-root .tbx-table th{position:sticky;top:0;background:var(--surface);text-align:left;color:var(--fg2);font-weight:600;padding:8px;border-bottom:1px solid var(--line);z-index:1}
    #ytp-root .tbx-table td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
    #ytp-root .tbx-table tr.own{background:color-mix(in srgb,var(--warn) 7%,transparent)}
    #ytp-root .tbx-table a{color:var(--info);text-decoration:none;font-weight:600}
    #ytp-root .tbx-table input[type=checkbox]{accent-color:var(--brand)}
    #ytp-root .chip.bad{color:var(--err);border-color:color-mix(in srgb,var(--err) 40%,transparent);background:color-mix(in srgb,var(--err) 8%,var(--bg))}
    /* ---------- หน้าต่างยืนยันในแผง (แทน confirm() ของเบราว์เซอร์) ---------- */
    #ytp-root .ask{position:fixed;inset:0;z-index:100004;background:rgba(5,5,10,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;
      animation:ytp-fade .15s ease-out}
    #ytp-root .ask .box{background:var(--bg);color:var(--fg);width:min(460px,94vw);max-height:88vh;overflow:auto;border-radius:18px;padding:20px;
      border:1px solid var(--line);box-shadow:var(--shadow)}
    #ytp-root .ask h3{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-size:16px;font-weight:700;letter-spacing:-.01em}
    #ytp-root .ask h3 .ai{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;flex:0 0 auto;color:var(--brand);
      background:color-mix(in srgb,var(--brand) 12%,var(--bg))}
    #ytp-root .ask.danger h3 .ai{color:var(--err);background:color-mix(in srgb,var(--err) 12%,var(--bg))}
    #ytp-root .ask .ab{font-size:13px;line-height:1.6;color:var(--fg2);white-space:pre-line;word-break:break-word}
    #ytp-root .ask .ab b{color:var(--fg)}
    #ytp-root .ask .vt{white-space:normal;display:grid;gap:6px}
    #ytp-root .ask .vt input,#ytp-root .ask .vt textarea{width:100%;box-sizing:border-box}
    #ytp-root .ask .vt textarea{resize:vertical;font:inherit}
    #ytp-root .ask .vt-pv{white-space:pre-wrap;border:1px solid var(--line2);border-radius:10px;padding:8px 10px;max-height:180px;overflow:auto}
    #ytp-root .ask .afoot{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap}
    #ytp-root .ask .afoot .btn.go{flex:0 0 auto;justify-content:center}
    #ytp-root .ask .afoot .btn.go.danger{background:var(--err);box-shadow:none}
    #ytp-root .ask .who{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line);margin:4px 0 10px}
    #ytp-root .ask .who img,#ytp-root .ask .who .ph{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:0 0 auto;display:grid;place-items:center;background:var(--surface2);color:var(--fg3)}
    #ytp-root .ask .who b{display:block;font-size:14px;color:var(--fg)}
    #ytp-root .ask .who small{display:block;color:var(--fg3);font-size:11.5px}
    #ytp-root .ask .facts{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px;margin:0 0 10px}
    #ytp-root .ask .facts span:nth-child(odd){color:var(--fg3)}
    #ytp-root .ask .facts span:nth-child(even){color:var(--fg);font-weight:600}
    #ytp-root .ask .warnbox{border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.55;color:var(--warn);
      background:color-mix(in srgb,var(--warn) 10%,var(--bg));border:1px solid color-mix(in srgb,var(--warn) 35%,var(--line))}
    #ytp-root .ask .warnbox b{display:flex;align-items:center;gap:6px;color:var(--warn);margin-bottom:4px}
    #ytp-root .ask .warnbox ul{margin:0;padding-left:18px;color:var(--fg2)}

    /* ---------- การ์ดคิวแบบย่อ ---------- */
    #ytp-root .card .hdr{cursor:pointer}
    #ytp-root .card .tl{font-size:12.5px;color:var(--fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #ytp-root .card .tl.over{color:var(--err)}
    #ytp-root .card .wt{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;color:var(--fg2);white-space:nowrap}
    #ytp-root .card .wt.bad{color:var(--err)}
    #ytp-root .card .ib.sm{width:26px;height:26px;border-radius:7px}
    #ytp-root .card .exp .ic{transition:transform .18s}
    #ytp-root .card.open .exp .ic{transform:rotate(180deg)}
    #ytp-root .card .ord{display:flex;flex-direction:column;gap:0}
    #ytp-root .card .ord .ib{width:22px;height:16px;border-radius:5px}
    #ytp-root .card .att{margin-top:8px}
    #ytp-root .toolbar .btn.ghost{padding:6px 8px}

    /* ---------- วางไฟล์ตรงไหนของแผงก็ได้ ---------- */
    #ytp-root .drawer.dropping::after{content:attr(data-drop);position:absolute;inset:8px;border-radius:16px;z-index:5;pointer-events:none;
      display:grid;place-items:center;font-size:15px;font-weight:700;color:var(--brand);
      border:2px dashed var(--brand);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(2px)}
    #ytp-root .fab.dropping{transform:scale(1.06);box-shadow:0 0 0 3px var(--brand),0 16px 36px -8px rgba(0,0,0,.55)}
    #ytp-root .drop .folder{background:none;border:0;padding:0;color:var(--brand);font-weight:600;font-size:12px;cursor:pointer;text-decoration:underline}
    #ytp-root .sched.late{border-color:color-mix(in srgb,var(--warn) 55%,var(--line))}
    #ytp-root .sched.late .sh small{color:var(--warn)}
    #ytp-root .sched .past{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;font-size:12px;line-height:1.45;color:var(--warn);
      background:color-mix(in srgb,var(--warn) 10%,var(--bg));border:1px solid color-mix(in srgb,var(--warn) 35%,var(--line))}
    #ytp-root .sched .past span{flex:1;min-width:0}
    #ytp-root .sched .past .btn{flex:0 0 auto}
    #ytp-root.dopen .fab{opacity:0;pointer-events:none;transform:scale(.9)}
    #ytp-root .fab.moving{cursor:grabbing;transition:none;transform:none}
    /* รายการพรีเซ็ตแบบกะทัดรัด: แถวเตี้ย โชว์แม่แบบชื่อเฉพาะอันที่เลือก และเลื่อนในกล่องเมื่อยาว -> ช่องแก้ไขขึ้นมาใกล้ขึ้น */
    #ytp-root .plist{gap:4px;max-height:236px;overflow:auto;scrollbar-width:thin;padding:2px}
    #ytp-root .pitem{padding:6px 10px}
    #ytp-root .pitem .pl span{display:none}
    #ytp-root .pitem.on .pl span{display:block}
    #ytp-root .sched .sh{cursor:default}
    #ytp-root .sched.on .sh{cursor:pointer}
    #ytp-root .sched .schev .ic{color:var(--fg3);transition:transform .18s;transform:rotate(180deg)}
    #ytp-root .sched.closed .schev .ic{transform:none}
    #ytp-root .drop.mini{padding:8px 12px;gap:10px}
    #ytp-root .drop.mini .di{width:30px;height:30px;border-radius:9px}
    #ytp-root .drop.mini .di .ic{width:16px;height:16px}
    #ytp-root .drop.mini b{font-size:12.5px}
    #ytp-root .drop.mini .kbd{display:none}
    #ytp-root .stats{display:flex;flex-wrap:wrap;gap:6px}
    #ytp-root .stat{display:flex;align-items:baseline;gap:6px;padding:4px 10px;border-radius:999px}
    #ytp-root .stat b{display:inline;font-size:14px}
    #ytp-root .drawer>.chan{margin-top:12px}
    #ytp-root .chan .cap{font-size:10.5px}
    #ytp-root .sched .g3 .mini,#ytp-root .when .mini,#ytp-root .card .fields .mini{font-size:12px}
    #ytp-root .pill{font-size:11.5px}
    #ytp-root .chip.warnc{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
    #ytp-root .card .ord .ib:not(:disabled){color:var(--fg)}
    @keyframes ytp-fade{from{opacity:0}to{opacity:1}}
    @keyframes ytp-ind{0%{margin-left:-35%}100%{margin-left:100%}}
    @keyframes ytp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
    @keyframes ytp-spin{to{transform:rotate(360deg)}}

    /* ===== ธีมดำมินิมอล: สีเดียวทั้งแผง ใช้สีเฉพาะสถานะ ===== */
    #ytp-root,#ytp-root.dark{
      --bg:#0b0b0c;--surface:#131315;--surface2:#1c1c20;--line:#222227;--line2:#34343b;
      --fg:#f4f4f5;--fg2:#bcbcc4;--fg3:#8a8a94;
      --brand:#f2f2f3;--brand2:#f2f2f3;--focus:#8a8a93;
      --ok:#4ade80;--warn:#fbbf24;--err:#f87171;--info:#93c5fd;--muted:#66666e;
      --shadow:0 30px 80px -20px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.04);
      --radius:12px;color-scheme:dark}
    #ytp-root input{color-scheme:dark}
    /* โลโก้ / ปุ่มหลัก / สวิตช์ / แถบความคืบหน้า: ขาวล้วน ไม่มีไล่เฉด */
    #ytp-root .logo{background:var(--fg);color:var(--bg);box-shadow:none}
    #ytp-root .btn.go{background:var(--fg);color:#0b0b0c;box-shadow:none}
    #ytp-root .btn.go .gi{background:rgba(0,0,0,.08)}
    #ytp-root .btn.go:disabled{background:var(--surface2);color:var(--fg3);filter:none}
    #ytp-root .sw input:checked+.t{background:var(--fg)}
    #ytp-root .sw input:checked+.t::after{background:#0b0b0c}
    #ytp-root .sw .t{background:var(--line2)}
    #ytp-root .progress i,#ytp-root .tbx-bar i{background:var(--fg)}
    #ytp-root .fab .badge,#ytp-root .toast .ti{background:var(--fg);color:#0b0b0c}
    #ytp-root .tabs .n{background:var(--fg);color:#0b0b0c}
    /* ปุ่มลอย */
    #ytp-root .fab{background:#0b0b0c;border-color:#26262b;box-shadow:0 10px 30px -8px rgba(0,0,0,.6)}
    #ytp-root .fab .logo{width:30px;height:30px;border-radius:9px}
    /* แผง */
    #ytp-root .drawer{border-color:#1c1c20;border-radius:16px}
    /* แถบช่อง: ไม่มีกล่อง แค่เส้นคั่น */
    #ytp-root .chan{background:none;border:0;border-bottom:1px solid var(--line);border-radius:0;margin:0;padding:14px 16px}
    #ytp-root .drawer>.chan{margin-top:0}
    #ytp-root .chan .av::after{border-color:var(--bg)}
    #ytp-root .chan .lk{background:none;border-color:var(--line2)}
    #ytp-root .chan.locked .lk{background:none;color:var(--fg);border-color:var(--fg3)}
    #ytp-root .chan.bad{background:color-mix(in srgb,var(--err) 8%,var(--bg))}
    /* แท็บ: ตัวหนังสือ + เส้นใต้ แทนปุ่มเม็ด */
    #ytp-root .tabs{background:none;border:0;border-bottom:1px solid var(--line);border-radius:0;margin:0;padding:0 10px;gap:0}
    #ytp-root .tabs button{border-radius:0;padding:12px 6px;color:var(--fg3);border-bottom:2px solid transparent;margin-bottom:-1px}
    #ytp-root .tabs button.on{background:none;box-shadow:none;color:var(--fg);border-bottom-color:var(--fg)}
    #ytp-root .tabs button .ic{display:none}
    /* กล่องส่วนต่าง ๆ: ไม่มีกรอบ ใช้ระยะห่างแทน */
    #ytp-root .sec{border:0;padding:0;margin-top:22px;background:none}
    #ytp-root .sec>h4{color:var(--fg3);font-weight:600;letter-spacing:.06em}
    #ytp-root .sec>h4 .ic{display:none}
    #ytp-root .sec+.sec{border-top:1px solid var(--line);padding-top:18px}
    /* ช่องกรอก */
    #ytp-root input[type=text],#ytp-root input[type=number],#ytp-root input[type=datetime-local],#ytp-root select,#ytp-root textarea{
      background:var(--surface);border-color:var(--line);border-radius:9px}
    #ytp-root input:focus,#ytp-root select:focus,#ytp-root textarea:focus{border-color:var(--fg3);box-shadow:none}
    /* ปุ่มรอง */
    #ytp-root .btn{background:none;border-color:var(--line2);border-radius:9px}
    #ytp-root .btn:hover{background:var(--surface2)}
    #ytp-root .ib.outline{border-color:var(--line2)}
    /* กล่องลากไฟล์ */
    #ytp-root .drop{background:none;border:1px dashed var(--line2);border-radius:12px}
    #ytp-root .drop .di{background:var(--surface2);color:var(--fg)}
    #ytp-root .drop:hover,#ytp-root .drop.hover{border-color:var(--fg3);background:var(--surface)}
    #ytp-root .drop .folder{color:var(--fg)}
    #ytp-root .drop .kbd{background:none}
    #ytp-root .drawer.dropping::after{color:var(--fg);border-color:var(--fg2);background:rgba(11,11,12,.88)}
    /* ตั้งเวลา */
    #ytp-root .sched{background:none;border-color:var(--line)}
    #ytp-root .sched.on{border-color:var(--line2)}
    #ytp-root .sched .sh .si{background:var(--surface2);color:var(--fg2)}
    #ytp-root .sched.late{border-color:color-mix(in srgb,var(--warn) 40%,var(--line))}
    #ytp-root .chip{background:none;border-color:var(--line2);color:var(--fg2)}
    #ytp-root .chip:hover{color:var(--fg);border-color:var(--fg3)}
    /* สถิติ: ตัวเลขล้วน */
    #ytp-root .stat{border:0;background:none;padding:2px 10px 2px 0}
    #ytp-root .stat b{font-size:13px}
    /* การ์ด */
    #ytp-root .card{background:none;border-color:var(--line);border-radius:12px}
    #ytp-root .card:hover{border-color:var(--line2)}
    #ytp-root .card.uploading,#ytp-root .card.review{box-shadow:none}
    #ytp-root .card .th{background:var(--surface2);border-color:var(--line)}
    #ytp-root .card .msg{background:var(--surface)}
    #ytp-root .pill{background:none;padding-left:0}
    #ytp-root .card.pending{--sc:var(--fg3)}
    /* รายการพรีเซ็ต */
    #ytp-root .pitem{background:none;border-color:transparent}
    #ytp-root .pitem:hover{background:var(--surface)}
    #ytp-root .pitem.on{border-color:var(--line2);background:var(--surface);box-shadow:none}
    #ytp-root .pitem .main{color:var(--fg2);background:var(--surface2)}
    #ytp-root .seg{background:var(--surface);border-color:var(--line)}
    #ytp-root .seg button.on{background:var(--surface2);box-shadow:none}
    #ytp-root .yt{background:var(--surface);border-color:var(--line)}
    /* ลิขสิทธิ์ */
    #ytp-root .tbx-card{background:var(--surface);border-color:var(--line)}
    #ytp-root .tbx-sec{color:var(--fg2)}
    /* หน้าต่าง/โมดัล */
    #ytp-root .ask .box,#ytp-root #tbx-modal .box{background:var(--bg);border-color:var(--line2)}
    #ytp-root .ask h3 .ai{background:var(--surface2);color:var(--fg)}
    #ytp-root .ask .who{background:var(--surface)}
    #ytp-root .ask .afoot .btn.go.danger{background:var(--err);color:#0b0b0c}
    #ytp-root .toast{background:#0b0b0c;border-color:#26262b}
    #ytp-root .act{margin:12px 16px 0;background:none;border-color:var(--line)}
    #ytp-root .drawer>.sec{margin:12px 16px 0}
    /* hover/โฟกัส: ปุ่มหลักต้องคงพื้นขาวตัวดำเสมอ (กฎ .btn:hover ด้านบนเคยทับจนตัวหนังสือหาย) */
    #ytp-root .btn.go:hover,#ytp-root .btn.go:focus-visible{background:#ffffff;color:#0b0b0c;filter:none}
    #ytp-root .btn.go:active{background:#d8d8dc}
    #ytp-root .btn.go:disabled,#ytp-root .btn.go:disabled:hover{background:var(--surface2);color:var(--fg3)}
    #ytp-root .ask .afoot .btn.go.danger:hover{background:#fca5a5;color:#0b0b0c}
    #ytp-root .btn:hover{color:var(--fg)}
    #ytp-root .btn.danger:hover{color:var(--err)}
    #ytp-root .btn:not(.go):disabled:hover{background:none}
    #ytp-root .tabs button{color:var(--fg2)}
    #ytp-root .tabs button:hover{color:var(--fg)}
    #ytp-root .ib{color:var(--fg2)}
    #ytp-root .ib:hover{background:var(--surface2);color:var(--fg)}
    #ytp-root .chip.var:hover{color:var(--fg);border-color:var(--fg2)}
    #ytp-root .act:hover{background:var(--surface)}
    #ytp-root button:focus-visible,#ytp-root .pitem:focus-visible{outline:2px solid var(--fg2);outline-offset:2px}
    #ytp-root ::placeholder{color:var(--fg3);opacity:1}
    #ytp-root .lbl{color:var(--fg2)}
    /* ไอคอน Material Symbols: วางให้ตรงแนวตัวหนังสือ */
    #ytp-root .ic{flex:0 0 auto}
    #ytp-root .tabs button .ic{display:block;width:17px;height:17px;opacity:.85}
    #ytp-root .tabs button.on .ic{opacity:1}
    #ytp-root .fab .fch .ic{display:inline-block;vertical-align:-1px}
    #ytp-root .fab .badge{display:inline-flex;align-items:center;gap:3px}
    #ytp-root .act .ai{display:grid;place-items:center;color:var(--fg2)}
    #ytp-root .tbx-card .ti .sti{display:grid;place-items:center;color:var(--fg2)}
    #ytp-root .tbx-card.ok .sti{color:var(--ok)} #ytp-root .tbx-card.busy .sti{color:var(--info)}
    #ytp-root .tbx-card.wait .sti{color:var(--warn)} #ytp-root .tbx-card.err .sti{color:var(--err)}
    /* ===== กระจกดำ: เห็นหน้า Studio ข้างหลังแบบเบลอ (ความทึบปรับได้ที่ --ga ในหน้าตั้งค่า) ===== */
    #ytp-root,#ytp-root.dark{
      --ga:.72;
      --surface:rgba(255,255,255,.05);--surface2:rgba(255,255,255,.09);
      --line:rgba(255,255,255,.09);--line2:rgba(255,255,255,.16);
      --glass:rgba(12,12,14,var(--ga));
      --glass-blur:blur(26px) saturate(150%)}
    #ytp-root .drawer{background:var(--glass);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);
      border:1px solid rgba(255,255,255,.10);
      box-shadow:0 30px 80px -20px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.07)}
    #ytp-root .ft{background:transparent;border-top-color:var(--line)}
    #ytp-root .fab{background:var(--glass);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);
      border-color:rgba(255,255,255,.12);box-shadow:0 12px 32px -10px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08)}
    #ytp-root .toast{background:var(--glass);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);border-color:rgba(255,255,255,.12)}
    #ytp-root .ask,#ytp-root #tbx-modal{background:rgba(0,0,0,.28);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
    #ytp-root .ask .box,#ytp-root #tbx-modal .box{background:var(--glass);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);
      border-color:rgba(255,255,255,.12);box-shadow:0 30px 80px -20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.07)}
    #ytp-root .tbx-table th{background:rgba(20,20,23,.92)}
    #ytp-root .drawer.dropping::after{background:rgba(12,12,14,.6)}
    #ytp-root .chan .av::after{border-color:#141416}
    /* ช่องกรอก/เมนูเลือก: ชั้นขาวบาง ๆ บนกระจก · ตัวเลือกใน select ต้องทึบ ไม่งั้นอ่านไม่ออก */
    #ytp-root select option{background:#151517;color:var(--fg)}
    #ytp-root .rng{width:100%;accent-color:#f4f4f5;cursor:pointer}
    /* ===== ดีไซน์ B · Glass (เลือกจากหน้าเปรียบเทียบ 4 แบบ) ===== */
    #ytp-root .drawer{border-radius:22px;border-color:rgba(255,255,255,.14);
      -webkit-backdrop-filter:blur(28px) saturate(160%);backdrop-filter:blur(28px) saturate(160%);
      box-shadow:0 30px 80px -20px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.10)}
    /* หัวแผง: ไม่มีกล่อง/เส้นคั่น · ปุ่มกระจก */
    #ytp-root .chan{border:0;padding:16px 18px 12px}
    #ytp-root .chan .av img,#ytp-root .chan .av .ph{box-shadow:0 0 0 2px rgba(255,255,255,.25)}
    #ytp-root .chan .av::after{border-color:rgba(12,12,14,.9)}
    #ytp-root .chan .cap{color:rgba(255,255,255,.6);letter-spacing:.04em;text-transform:none;font-weight:500;font-size:11px}
    #ytp-root .chan .nm{font-size:15px}
    #ytp-root .chan .lk{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);border-radius:999px;color:var(--fg);padding:7px 14px}
    #ytp-root .chan .lk:hover{background:rgba(255,255,255,.16)}
    #ytp-root .chan>.ib{border-radius:50%;background:rgba(255,255,255,.08)}
    #ytp-root .chan>.ib:hover{background:rgba(255,255,255,.16)}
    /* แท็บ: ปุ่มเม็ดในกล่องเดียว แท็บที่เลือกเป็นสีขาว */
    #ytp-root .tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:0 18px;padding:4px;
      background:rgba(255,255,255,.07);border:0;border-radius:14px}
    #ytp-root .tabs button{border:0;border-radius:10px;margin:0;padding:8px 0;color:rgba(255,255,255,.75);font-weight:500}
    #ytp-root .tabs button:hover{color:#fff;background:rgba(255,255,255,.06)}
    #ytp-root .tabs button.on{background:#f4f4f5;color:#0b0b0c;font-weight:600;box-shadow:none}
    #ytp-root .tabs button .ic{display:none}
    #ytp-root .tabs .n{background:rgba(255,255,255,.18);color:#fff}
    #ytp-root .tabs button.on .n{background:#0b0b0c;color:#fff}
    #ytp-root .act{margin:12px 18px 0;border-radius:14px;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.10)}
    #ytp-root .body{padding:16px 18px 18px}
    /* กล่องลากไฟล์: แถวเดียวเสมอ */
    #ytp-root .drop{padding:12px 14px;gap:12px;border:1px dashed rgba(255,255,255,.22);border-radius:14px}
    #ytp-root .drop .di{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.10)}
    #ytp-root .drop .di .ic{width:16px;height:16px}
    #ytp-root .drop b{font-size:13px;font-weight:500}
    #ytp-root .drop span{font-size:12px;color:rgba(255,255,255,.6)}
    #ytp-root .drop .kbd{display:none}
    #ytp-root .drop .folder{color:#fff}
    /* ตั้งเวลา */
    #ytp-root .sched,#ytp-root .sched.on{border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}
    #ytp-root .sched.late{border-color:rgba(251,191,36,.45)}
    #ytp-root .sched .sh .si{background:none;color:rgba(255,255,255,.75);width:22px}
    #ytp-root .sched .sh small{color:rgba(255,255,255,.65)}
    /* สถิติ: แถวข้อความเดียว คั่นด้วยจุด */
    #ytp-root .stats{gap:0;margin-top:12px}
    #ytp-root .stat{padding:0;font-size:12px}
    #ytp-root .stat+.stat::before{content:"·";margin:0 8px;color:rgba(255,255,255,.4)}
    #ytp-root .stat b{font-size:12px;font-weight:700}
    #ytp-root .stat span{color:rgba(255,255,255,.7);font-size:12px}
    /* การ์ด */
    #ytp-root .card{border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);padding:12px}
    #ytp-root .card::before{display:none}
    #ytp-root .card:hover{border-color:rgba(255,255,255,.16)}
    #ytp-root .card.uploading,#ytp-root .card.review{border-color:rgba(147,197,253,.35)}
    #ytp-root .card.error{border-color:rgba(248,113,113,.35)}
    #ytp-root .card .th{width:92px;border-radius:10px;border:0}
    #ytp-root .card .fn{font-size:13px}
    #ytp-root .card .tl{color:rgba(255,255,255,.6)}
    #ytp-root .pill{font-size:12px;padding:0}
    #ytp-root .card .msg{border-radius:12px;background:rgba(255,255,255,.05)}
    #ytp-root .att .chip{border-radius:999px}
    #ytp-root .att .chip.bad{color:#fbbf24;background:rgba(251,191,36,.12);border-color:transparent}
    #ytp-root .att .chip.fixc{background:#f4f4f5;color:#0b0b0c;border-color:transparent;font-weight:600;cursor:pointer}
    #ytp-root .att .chip.fixc:hover{background:#fff}
    /* ท้ายแผง: ปุ่มหลักขาว ข้อความชิดซ้าย 2 บรรทัด · ปุ่มหยุด/ล้างเป็นกระจก */
    #ytp-root .ft{padding:14px 18px;border-top-color:rgba(255,255,255,.08)}
    #ytp-root .ft .btn.go{border-radius:14px;padding:11px 16px}
    #ytp-root .ft .btn.go .gi{display:none}
    #ytp-root .ft .btn.go .gt small{color:#55555c;opacity:1}
    #ytp-root .ft .btn.go:disabled .gt small{color:var(--fg3)}
    #ytp-root .ft .ib{width:48px;height:auto;align-self:stretch;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff}
    #ytp-root .ft .ib:disabled{opacity:.35}
    /* ช่องกรอก/ปุ่มรองในแผง: มุมโค้งเข้าชุด */
    #ytp-root input[type=text],#ytp-root input[type=number],#ytp-root input[type=datetime-local],#ytp-root select,#ytp-root textarea{border-radius:10px}
    #ytp-root .btn{border-radius:12px}
    #ytp-root .btn.sm{border-radius:10px}
    #ytp-root .sec+.sec{border-top-color:rgba(255,255,255,.08)}
    #ytp-root .tbx-card{border-radius:14px}
    #ytp-root .ask .box,#ytp-root #tbx-modal .box{border-radius:22px}
    /* ไอคอน Material Symbols Rounded: แท็บ, หัวข้อหมวด, ปุ่ม */
    #ytp-root .tabs button{display:flex;align-items:center;justify-content:center;gap:6px}
    #ytp-root .tabs button .ic{display:block;width:17px;height:17px;opacity:.8}
    #ytp-root .tabs button.on .ic{opacity:1}
    #ytp-root .sec>h4 .ic{display:block;width:15px;height:15px;opacity:.8}
    #ytp-root .btn .ic{width:16px;height:16px}
    #ytp-root .btn.sm .ic{width:14px;height:14px}
    #ytp-root .tbx-grid3 .btn,#ytp-root .tbx-grid2 .btn{gap:6px}
    /* ตัวหนังสือ: ตัวเล็กสุด 12px (ภาษาอังกฤษตัวเล็กกว่านี้บนกระจกอ่านยาก) · ตัวเลขกว้างเท่ากัน เวลา/เปอร์เซ็นต์ไม่กระตุก */
    #ytp-root{letter-spacing:0;font-feature-settings:"tnum" 1}
    #ytp-root button,#ytp-root input,#ytp-root select,#ytp-root textarea{font-family:inherit}
    #ytp-root .chan .cap,#ytp-root .chan .id,#ytp-root .sched .g3 .mini,#ytp-root .when .mini,#ytp-root .card .fields .mini,
    #ytp-root .lbl span+span,#ytp-root .stat span,#ytp-root .stat b,#ytp-root .pill,#ytp-root .att .chip,#ytp-root .card .wt,
    #ytp-root .drop span,#ytp-root .sched .sh small,#ytp-root .chip,#ytp-root .chip.var,#ytp-root .mono,#ytp-root .tabs .n,
    #ytp-root .sec>h4,#ytp-root .pitem .pl span,#ytp-root .pitem .main,#ytp-root .tbx-steps span,#ytp-root .fab .fch,#ytp-root .fab .badge{font-size:12px}
    #ytp-root .tabs button{font-size:13.5px}
    #ytp-root .sec>h4{letter-spacing:.03em}
    #ytp-root .card .th{background:rgba(255,255,255,.06)}
  `);

  if (!document.getElementById('ytp-font')) {
    document.head.append(h('link', { id: 'ytp-font', rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap' }));
  }
  const root = h('div', { id: 'ytp-root' });
  let Claims = null; // โมดูลลิขสิทธิ์ (สร้างด้านล่าง)
  const toastMsg = h('span');
  const toastEl = h('div', { className: 'toast' }, h('span', { className: 'ti' }, icon('check', 13)), toastMsg);
  let toastTimer;
  function toast(msg) {
    toastMsg.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3800);
  }

  // หน้าต่างยืนยันในแผง แทน confirm() ของเบราว์เซอร์ (ซึ่งโชว์แค่ข้อความล้วน และหยุดทั้งหน้า)
  // คืนค่า true = ปุ่มหลัก, false = ปุ่มรอง, null = ปิดทิ้ง (Esc / คลิกนอกกล่อง)
  // ถ้า no เป็น null จะมีแค่ปุ่มหลักกับปุ่มยกเลิก และการยกเลิกคืนค่า false
  let askClose = null;
  function ask({ title, body = '', ok = L('ตกลง', 'OK'), no = null, cancel = L('ยกเลิก', 'Cancel'), danger = false, ic = 'alert' }) {
    askClose?.(null);
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const done = (v) => {
        askClose = null;
        modal.remove();
        document.removeEventListener('keydown', onKey, true);
        prevFocus?.focus?.();
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(no ? null : false); }
        else if (e.key === 'Enter' && !/^(TEXTAREA|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); e.stopPropagation(); done(true); }
      };
      const okBtn = h('button', { className: 'btn go' + (danger ? ' danger' : ''), onclick: () => done(true) }, ok);
      const btns = no
        ? [h('button', { className: 'btn ghost', onclick: () => done(null) }, cancel), h('button', { className: 'btn', onclick: () => done(false) }, no), okBtn]
        : [h('button', { className: 'btn', onclick: () => done(false) }, cancel), okBtn];
      const modal = h('div', { className: 'ask' + (danger ? ' danger' : ''), onclick: (e) => { if (e.target === modal) done(no ? null : false); } },
        h('div', { className: 'box', role: 'dialog', 'aria-modal': 'true' },
          h('h3', {}, h('span', { className: 'ai' }, icon(ic, 17)), title),
          h('div', { className: 'ab' }, body),
          h('div', { className: 'afoot' }, ...btns)));
      askClose = done;
      document.addEventListener('keydown', onKey, true);
      root.append(modal);
      okBtn.focus();
    });
  }

  // ----- แจ้งเตือนเมื่อคิวเสร็จ: เดสก์ท็อป + เสียง + ชื่อแท็บ -----
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
  function notifyDone(title, text, ok = true) {
    if (!settings.notify) return;
    beep(ok);
    if (document.hasFocus() && drawer.classList.contains('open')) return; // ดูอยู่แล้ว ไม่ต้องเด้ง
    try {
      if (typeof GM_notification === 'function') {
        GM_notification({ title, text, silent: true, onclick: () => { window.focus(); openDrawer('queue'); } });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(title, { body: text, silent: true });
        n.onclick = () => { window.focus(); openDrawer('queue'); n.close(); };
      }
    } catch { /* ไม่มีสิทธิ์แจ้งเตือน */ }
  }
  // ความคืบหน้าบนชื่อแท็บ เช่น "(3/10) ⬆ Channel content" — เห็นได้แม้อยู่แท็บอื่น
  const TITLE_TAG = /^(\(\d+\/\d+\) ⬆|✅|⚠️)(\s+|$)/;
  let titleMark = '';
  function setTitleMark(mark) {
    titleMark = mark;
    const base = document.title.replace(TITLE_TAG, '');
    const next = mark ? `${mark} ${base}` : base;
    if (document.title !== next) document.title = next;
  }
  // Studio เปลี่ยนชื่อแท็บเองตอนเปลี่ยนหน้า -> ใส่เครื่องหมายกลับเข้าไป
  setInterval(() => { if (titleMark && !document.title.startsWith(titleMark)) setTitleMark(titleMark); }, 1500);
  // ✅/⚠️ หลังคิวจบ แสดงไว้จนกว่าจะกลับมาดูแท็บนี้
  const clearDoneMark = () => { if (titleMark && !titleMark.startsWith('(') && document.visibilityState === 'visible' && document.hasFocus()) setTitleMark(''); };
  window.addEventListener('focus', () => setTimeout(clearDoneMark, 1500));

  // ----- โครงหลัก -----
  const fabLabel = h('span', { className: 'fpr' });
  const fabChan = h('span', { className: 'fch' });
  const fabBadge = h('span', { className: 'badge', hidden: true });
  // เปิดแล้ว = ปิด · ยังไม่เปิด = เปิดที่แท็บของงานที่กำลังทำ (ว่าง = แท็บล่าสุด)
  const fab = h('button', { className: 'fab', title: L('คลิกเพื่อเปิดแผง · ลากเพื่อย้ายตำแหน่ง', 'Click to open · drag to move'), onclick: () => {
    if (fabDragged) return;
    if (drawer.classList.contains('open')) return closeDrawer();
    const a = activity();
    openDrawer(a ? a.tab : undefined);
  } },
    h('span', { className: 'logo' }, icon('cloud', 18)),
    h('span', { className: 'fcol' }, fabChan, fabLabel),
    fabBadge
  );

  const tabs = {};
  const tabCount = {};
  const panes = {};
  const footers = {};
  let currentTab = 'queue';
  const nav = h('div', { className: 'tabs' });
  // แถบงานที่กำลังทำ — อยู่เหนือแท็บ เห็นได้ทุกแท็บ · ซ่อนตอนว่าง
  const actIcon = h('span', { className: 'ai' });
  const actTitle = h('span', { className: 'at' });
  const actPct = h('span', { className: 'ap' });
  const actFill = h('i');
  const goActTab = () => showTab(actBar._tab || 'queue');
  const actBar = h('div', { className: 'act', hidden: true, role: 'button', tabIndex: 0, onclick: goActTab,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goActTab(); } } },
    h('div', { className: 'arow' }, actIcon, actTitle, actPct),
    h('div', { className: 'tbx-bar' }, actFill)
  );
  const body = h('div', { className: 'body' });
  const footWrap = h('div');
  for (const [key, label, ic] of [['queue', L('อัปโหลด', 'Upload'), 'queue'], ['presets', L('พรีเซ็ต', 'Presets'), 'layers'], ['claims', L('ลิขสิทธิ์', 'Copyright'), 'shield'], ['settings', L('ตั้งค่า', 'Settings'), 'sliders']]) {
    tabCount[key] = h('span', { className: 'n' });
    tabs[key] = h('button', { onclick: () => showTab(key) }, icon(ic, 15), label, tabCount[key]);
    nav.append(tabs[key]);
  }

  // แถบแสดงช่องที่กำลังใช้งาน + ปุ่มล็อกช่อง
  const chanAv = h('div', { className: 'av' });
  const chanName = h('div', { className: 'nm' });
  const chanSub = h('div', { className: 'id mono' });
  const lockIcon = h('span');
  const lockTxt = h('span');
  const lockBtn = h('button', {
    className: 'lk',
    onclick: () => {
      if (settings.lockChannel) {
        settings.lockChannel = null;
        toast(L('ปลดล็อกช่องแล้ว', 'Channel unlocked'));
      } else {
        const c = getChannel();
        if (!c.id) return toast(L('ตรวจไม่พบรหัสช่อง ลองเข้าหน้า Dashboard หรือ Content ก่อน', 'Could not detect the channel ID. Open the Dashboard or Content page first'));
        settings.lockChannel = { id: c.id, name: chanLabel(c) };
        toast(L(`ล็อกไว้ที่ช่อง "${chanLabel(c)}" แล้ว ถ้าสลับไปช่องอื่นจะอัปไม่ได้`, `Locked to channel "${chanLabel(c)}". Uploads will be blocked on other channels`));
      }
      saveSettings();
      updateChannelUI();
    },
  }, lockIcon, lockTxt);
  // รายการช่องที่เคยเข้า: คลิกแล้วเปิดช่องนั้นในแท็บใหม่ (หน้าเดียวกับที่เปิดอยู่)
  // ใช้ได้กับช่องที่บัญชีนี้มีสิทธิ์ (เจ้าของ หรือได้รับเชิญผ่าน Permissions)
  let producerIn = null; // ช่องชื่อโปรดิวเซอร์ในแท็บตั้งค่า (placeholder = ชื่อช่องปัจจุบัน)
  let channels = load('channels', []);
  const saveChannels = () => save('channels', channels);
  // อ่านจากที่เก็บใหม่ทุกครั้ง: เปิดหลายแท็บ แต่ละแท็บจะได้ไม่เขียนทับรายการของกันและกัน
  function rememberChannel(c) {
    if (!c.id || !c.name) return;
    channels = load('channels', []);
    const old = channels.find((x) => x.id === c.id);
    if (old && old.name === c.name && old.avatar === c.avatar && old.handle === (c.handle || old.handle)) return;
    channels = [{ id: c.id, name: c.name, avatar: c.avatar, handle: c.handle || (old && old.handle) || '' }, ...channels.filter((x) => x.id !== c.id)];
    saveChannels();
    if (!chanList.hidden) renderChanList();
  }
  const channelUrl = (id) => {
    const p = location.pathname;
    return 'https://studio.youtube.com' + (/\/channel\/UC[\w-]+/.test(p) ? p.replace(/\/channel\/UC[\w-]+/, '/channel/' + id) : '/channel/' + id);
  };
  const chanAddIn = h('input', { type: 'text', placeholder: L('รหัสช่อง UC… หรือลิงก์ช่อง', 'Channel ID UC… or channel link'), style: 'flex:1;min-width:0' });
  function addChannel() {
    channels = load('channels', []);
    const id = (chanAddIn.value.match(/UC[\w-]{22}/) || [])[0];
    if (!id) return toast(L('ไม่พบรหัสช่อง (ขึ้นต้นด้วย UC และยาว 24 ตัว)', 'No channel ID found (starts with UC, 24 characters)'));
    if (!channels.some((x) => x.id === id)) { channels.push({ id, name: '', avatar: '' }); saveChannels(); }
    chanAddIn.value = '';
    renderChanList();
  }
  chanAddIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addChannel(); });
  const chanList = h('div', { className: 'sec', hidden: true, style: 'margin:0 16px 12px;padding:8px;border:1px solid var(--line);border-radius:var(--radius)' });
  function renderChanList() {
    channels = load('channels', []);
    const cur = getChannel().id;
    const rows = channels.map((c) => h('div', { style: 'display:flex;align-items:center;gap:8px;padding:4px 2px' },
      c.avatar ? h('img', { src: c.avatar, alt: '', style: 'width:22px;height:22px;border-radius:50%' }) : icon('tv', 16),
      h('div', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title: c.id },
        h('b', {}, c.name || c.id), c.id === cur ? h('small', { style: 'color:var(--fg3)' }, L(' · ช่องนี้', ' · this tab')) : null),
      // ช่องปัจจุบันเปิดแท็บใหม่ได้เลย · ช่องอื่นต้องผ่านหน้าสลับช่องก่อน ไม่งั้นเจอหน้า Oops
      // (การสลับช่องมีผลกับทุกแท็บ จึงทำในแท็บนี้ ไม่ใช่แท็บใหม่)
      c.id === cur
        ? h('button', { className: 'btn sm', title: L('เปิดช่องนี้ในแท็บใหม่', 'Open this channel in a new tab'), onclick: () => window.open(channelUrl(c.id), '_blank') }, icon('ext', 13), L('แท็บใหม่', 'New tab'))
        : h('button', { className: 'btn sm', title: L('สลับไปช่องนี้ (มีผลกับทุกแท็บ Studio)', 'Switch to this channel (affects every Studio tab)'), onclick: () => {
          if (uploadBusy()) return toast(L('คิวอัปโหลดยังทำงานอยู่ — สลับช่องตอนนี้คิวจะหยุด', 'Upload queue is still running — switching channels now would stop it'));
          switchToChannel({ name: c.name, handle: c.handle }, channelUrl(c.id));
        } }, icon('swap', 13), L('สลับไปช่องนี้', 'Switch')),
      iconBtn('x', L('เอาออกจากรายการ', 'Remove from list'), () => { channels = load('channels', []).filter((x) => x.id !== c.id); saveChannels(); renderChanList(); })
    ));
    chanList.replaceChildren(
      ...(rows.length ? rows : [h('small', { style: 'color:var(--fg3)' }, L('ยังไม่มีช่องในรายการ — เข้า Studio ของแต่ละช่องครั้งหนึ่ง สคริปต์จะจำให้เอง หรือใส่รหัสช่องด้านล่าง', 'No channels yet — open each channel in Studio once and the script remembers it, or add a channel ID below'))]),
      h('div', { style: 'display:flex;gap:6px;margin-top:8px' }, chanAddIn, h('button', { className: 'btn sm', onclick: addChannel }, icon('plus', 13), L('เพิ่ม', 'Add')))
    );
  }
  const swBtn = iconBtn('swap', L('ช่องอื่น ๆ · เปิดในแท็บใหม่', 'Other channels · open in a new tab'), () => {
    chanList.hidden = !chanList.hidden;
    if (!chanList.hidden) renderChanList();
  });
  const chanBar = h('div', { className: 'chan' },
    chanAv,
    h('div', { className: 'ct' }, h('div', { className: 'cap' }, L('กำลังอัปไปที่ช่อง', 'Uploading to channel')), chanName, chanSub),
    swBtn,
    lockBtn
  );

  chanBar.append(iconBtn('x', L('ปิด (Alt+P)', 'Close (Alt+P)'), () => closeDrawer()));
  const drawer = h('div', { className: 'drawer', 'aria-label': 'Upload Studio' },
    chanBar, chanList, actBar, nav, body, footWrap
  );

  let lastChanKey = '';
  function updateChannelUI() {
    const c = getChannel();
    const problem = channelProblem();
    const lock = settings.lockChannel;
    const key = JSON.stringify([c, problem, lock]);
    if (key === lastChanKey) return;
    lastChanKey = key;
    rememberChannel(c);
    if (producerIn && c.name) producerIn.placeholder = c.name; // เว้นว่าง = ใช้ชื่อช่องนี้
    chanAv.replaceChildren(c.avatar ? h('img', { src: c.avatar, alt: '' }) : h('div', { className: 'ph' }, icon('tv', 18)));
    chanName.textContent = chanLabel(c);
    chanSub.textContent = problem || c.id || '—';
    chanBar.classList.toggle('bad', !!problem);
    chanBar.classList.toggle('locked', !!lock && !problem);
    lockIcon.replaceChildren(icon(lock ? 'lock' : 'unlock', 14));
    lockTxt.textContent = lock ? L('ล็อกแล้ว', 'Locked') : L('ล็อกช่อง', 'Lock channel');
    lockBtn.title = lock ? L(`ล็อกไว้ที่ "${lock.name}" · คลิกเพื่อปลดล็อก`, `Locked to "${lock.name}" · click to unlock`) : L('ล็อกให้อัปได้เฉพาะช่องนี้', 'Only allow uploads to this channel');
    fabChan.replaceChildren(...(problem ? [icon('alert', 11), ' '] : lock ? [icon('lock', 11), ' '] : []), chanLabel(c));
    fab.classList.toggle('bad', !!problem);
    fab.title = problem ? problem : L(`ช่องปัจจุบัน: ${chanLabel(c)}`, `Current channel: ${chanLabel(c)}`);
    updateRunUI();
  }
  setInterval(updateChannelUI, 1500);

  function showTab(key) {
    currentTab = key;
    for (const k in tabs) tabs[k].classList.toggle('on', k === key);
    body.replaceChildren(panes[key]);
    body.scrollTop = 0;
    footWrap.replaceChildren(...(footers[key] ? [footers[key]] : []));
    if (key === 'presets') renderPresetEditor();
    if (key === 'claims' && Claims) Claims.renderStatus();
  }
  // ลากปุ่มลอยไปวางตรงไหนก็ได้ แล้วจำตำแหน่งไว้ (เก็บระยะจากขอบขวา/ล่าง ย่อ/ขยายหน้าต่างแล้วยังอยู่มุมเดิม)
  let fabDragged = false;
  function placeFab(pos) {
    if (!pos) { fab.style.right = fab.style.bottom = ''; return; }
    const w = fab.offsetWidth || 180, hgt = fab.offsetHeight || 52;
    fab.style.right = Math.min(Math.max(4, pos.r), Math.max(4, innerWidth - w - 4)) + 'px';
    fab.style.bottom = Math.min(Math.max(4, pos.b), Math.max(4, innerHeight - hgt - 4)) + 'px';
  }
  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r0 = fab.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    fabDragged = false;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      fab.classList.add('moving');
      placeFab({ r: innerWidth - r0.right - dx, b: innerHeight - r0.bottom - dy });
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      fab.classList.remove('moving');
      if (!moved) return;
      fabDragged = true; // กันไม่ให้การปล่อยเมาส์หลังลากกลายเป็นคลิกเปิดแผง
      setTimeout(() => { fabDragged = false; }, 0);
      save('fabPos', { r: parseFloat(fab.style.right), b: parseFloat(fab.style.bottom) });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  fab.addEventListener('dblclick', (e) => { e.preventDefault(); }); // ดับเบิลคลิกไม่ให้เปิด-ปิดรัว ๆ
  addEventListener('resize', () => placeFab(load('fabPos', null)));
  setTimeout(() => placeFab(load('fabPos', null)), 0);

  function openDrawer(tab) {
    root.classList.add('dopen');
    root.classList.toggle('dark', document.documentElement.hasAttribute('dark'));
    if (tab) showTab(tab);
    updateChannelUI();
    drawer.classList.add('open');
    loadTopVideos();
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    root.classList.remove('dopen');
  }

  // ----- แท็บคิว -----
  const fileInput = h('input', { type: 'file', multiple: true, accept: 'video/*,.txt,image/*', hidden: true, onchange: (e) => { addFiles(e.target.files); e.target.value = ''; } });
  // เลือกทั้งโฟลเดอร์ (คลิป + .txt + ภาพปก ในโฟลเดอร์เดียว) ในคลิกเดียว
  const folderInput = h('input', { type: 'file', webkitdirectory: true, multiple: true, hidden: true, onchange: (e) => { addFiles(e.target.files); e.target.value = ''; } });
  const dropZone = h('div', { className: 'drop', onclick: () => fileInput.click() },
    h('div', { className: 'di' }, icon('upload', 22)),
    h('div', {},
      h('b', {}, L('ลากไฟล์หรือโฟลเดอร์มาวางตรงไหนของแผงก็ได้', 'Drop files or a folder anywhere on this panel')),
      h('span', {}, L('หรือคลิกเพื่อเลือกไฟล์ · ', 'or click to select files · '),
        h('button', { className: 'folder', onclick: (e) => { e.stopPropagation(); folderInput.click(); } }, L('เลือกทั้งโฟลเดอร์', 'pick a whole folder'))),
      h('div', {}, h('span', { className: 'kbd' }, L('.mp4 คลิป', '.mp4 video')), h('span', { className: 'kbd' }, L('.txt คำอธิบาย', '.txt description')), h('span', { className: 'kbd' }, L('.jpg ภาพปก', '.jpg thumbnail')))
    )
  );

  // อ่านไฟล์จากการลากวาง รวมไฟล์ในโฟลเดอร์ (ลึกสุด 2 ชั้น) — ต้องดึง entry ก่อน await แรก ไม่งั้น DataTransfer จะว่าง
  async function filesFromDrop(dt) {
    const entries = [...(dt?.items || [])].map((i) => i.kind === 'file' && i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.some((en) => en.isDirectory)) return [...(dt?.files || [])];
    const out = [];
    const readDir = (dir) => new Promise((res) => {
      const reader = dir.createReader();
      const all = [];
      const next = () => reader.readEntries((batch) => { if (!batch.length) return res(all); all.push(...batch); next(); }, () => res(all));
      next();
    });
    async function walk(en, depth) {
      if (en.isFile) {
        const f = await new Promise((res) => en.file(res, () => res(null)));
        if (f && !f.name.startsWith('.')) out.push(f);
      } else if (en.isDirectory && depth < 2) {
        for (const c of await readDir(en)) await walk(c, depth + 1);
      }
    }
    for (const en of entries) await walk(en, 0);
    return out;
  }
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  // กรอบ "วางเพื่อเพิ่มเข้าคิว" — ซ่อนเองเมื่อ dragover หยุด (ไม่ต้องนับ dragenter/dragleave ที่กระพริบ)
  let dropHintTimer;
  function dropHint(el) {
    el.classList.add('dropping');
    clearTimeout(dropHintTimer);
    dropHintTimer = setTimeout(() => { drawer.classList.remove('dropping'); fab.classList.remove('dropping'); }, 150);
  }
  async function onPanelDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    drawer.classList.remove('dropping');
    fab.classList.remove('dropping');
    const files = await filesFromDrop(e.dataTransfer);
    if (currentTab !== 'queue') showTab('queue');
    if (!drawer.classList.contains('open')) openDrawer('queue');
    addFiles(files);
  }
  drawer.dataset.drop = L('วางเพื่อเพิ่มเข้าคิว', 'Drop to add to the queue');
  // รับการลาก: ต้องบอกเบราว์เซอร์เองว่า "วางได้ (copy)" ทั้งตอน dragenter และ dragover แล้วไม่ส่งต่อให้ Studio
  // Studio รับการลากไฟล์ทั้งหน้าอยู่แล้ว (เปิดหน้าต่างอัปโหลด) ถ้าปล่อยให้ handler ของ Studio ทำงานต่อ
  // มันตั้ง dropEffect ทับเป็น none → เคอร์เซอร์ขึ้น 🚫 วางไม่ได้ (เจอตอนลากหลายไฟล์พร้อมกัน)
  const acceptDrag = (el) => (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'copy'; } catch { /* บางเบราว์เซอร์ห้ามตั้งค่า */ }
    if (e.type === 'dragover') dropHint(el);
  };
  for (const t of ['dragenter', 'dragover']) drawer.addEventListener(t, acceptDrag(drawer));
  drawer.addEventListener('drop', onPanelDrop);
  // ลากไฟล์มาวางบนปุ่มลอยได้เลย ไม่ต้องเปิดแผงก่อน
  for (const t of ['dragenter', 'dragover']) fab.addEventListener(t, acceptDrag(fab));
  fab.addEventListener('drop', onPanelDrop);

  const defaultPresetSel = h('select', {
    title: L('พรีเซ็ตสำหรับคลิปที่เพิ่มใหม่', 'Preset for newly added videos'),
    onchange: (e) => choosePreset(e.target, activeId, (id) => { activeId = id; save('activeId', activeId); refreshLabels(); }),
  });
  const applyAllBtn = h('button', {
    className: 'btn sm', title: L('เปลี่ยนพรีเซ็ตของทุกคลิปที่ยังไม่ได้อัป', 'Change the preset of all videos not yet uploaded'),
    onclick: () => {
      queue.forEach((it) => { if (it.status === 'pending' || it.status === 'error') { it.presetId = activeId; it.titleEdited = false; } });
      renderQueue();
    },
  }, icon('layers', 14), L('ใช้กับทุกคลิป', 'Apply to all'));
  // การ์ดเริ่มแบบย่อ (แถวเดียว) คลิกการ์ดเพื่อแก้ชื่อ/เวลา/ศิลปิน — ปุ่มนี้ขยาย/ย่อทั้งหมดทีเดียว
  const expandAllBtn = h('button', {
    className: 'btn sm ghost',
    onclick: () => {
      const open = !queue.some((i) => i.open);
      queue.forEach((i) => { i.open = open; updateItemUI(i); });
      updateRunUI();
    },
  });
  const listEl = h('div');
  const progress = h('i', { style: 'width:0' });
  const progressPct = h('span', { className: 'cnt' });
  const progressWrap = h('div', { className: 'bar', hidden: true }, h('div', { className: 'progress' }, progress), progressPct);
  const stat = (cls, label) => {
    const b = h('b', {}, '0');
    return { el: h('div', { className: 'stat ' + cls }, b, h('span', {}, label)), b };
  };
  const stats = { total: stat('', L('ทั้งหมด', 'Total')), pending: stat('info', L('รอคิว', 'Queued')), done: stat('ok', L('เสร็จแล้ว', 'Done')), error: stat('err', L('ผิดพลาด', 'Errors')) };
  const statsWrap = h('div', { className: 'stats', hidden: true }, Object.values(stats).map((s) => s.el));

  // ----- แผงตั้งเวลาปล่อย -----
  const sch = settings.schedule;
  const tomorrow19 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return toLocalInput(d.getTime());
  };
  const schedSummary = h('small');
  const schedStart = h('input', {
    type: 'datetime-local', value: sch.start || '',
    onchange: (e) => { sch.start = e.target.value; saveSettings(); onScheduleChange(); },
  });
  const schedEvery = h('input', {
    type: 'number', min: 1, max: 999, value: sch.every || 1,
    oninput: (e) => { sch.every = Math.max(1, parseInt(e.target.value, 10) || 1); saveSettings(); onScheduleChange(); },
  });
  const schedUnit = h('select', {
    onchange: (e) => { sch.unit = e.target.value; saveSettings(); onScheduleChange(); },
  }, h('option', { value: 'day', selected: sch.unit !== 'hour' }, L('วัน', 'days')), h('option', { value: 'hour', selected: sch.unit === 'hour' }, L('ชั่วโมง', 'hours')));
  const quick = (label, fn) => h('button', { className: 'chip', onclick: () => { schedStart.value = sch.start = fn(); saveSettings(); onScheduleChange(); } }, label);
  const atToday = (hh) => () => {
    const d = new Date();
    d.setHours(hh, 0, 0, 0);
    if (d.getTime() < Date.now() + SCHEDULE_MIN_LEAD) d.setDate(d.getDate() + 1);
    return toLocalInput(d.getTime());
  };
  // เวลาเริ่มที่ตั้งไว้ผ่านไปแล้ว: บอกว่าคิวจะเริ่มจริงเมื่อไร และกดครั้งเดียวเพื่อบันทึกเวลานั้นแทน
  const pastTxt = h('span');
  const pastNote = h('div', { className: 'past', hidden: true },
    icon('alert', 14), pastTxt,
    h('button', { className: 'btn sm', onclick: () => {
      schedStart.value = sch.start = toLocalInput(effectiveStart());
      saveSettings();
      onScheduleChange();
    } }, L('ใช้เวลานี้', 'Use this time')));
  const schedBody = h('div', { className: 'sb' },
    h('div', { className: 'g3' },
      h('div', {}, h('div', { className: 'mini' }, L('คลิปแรกปล่อย', 'First video releases')), schedStart),
      h('div', {}, h('div', { className: 'mini' }, L('ทุก ๆ', 'Every')), schedEvery),
      h('div', {}, h('div', { className: 'mini' }, '\u00a0'), schedUnit)
    ),
    h('div', { className: 'chips' },
      quick(L('พรุ่งนี้ 19:00', 'Tomorrow 19:00'), tomorrow19),
      quick(L('18:00 ถัดไป', 'Next 18:00'), atToday(18)),
      quick(L('20:00 ถัดไป', 'Next 20:00'), atToday(20)),
      quick(L('ภายใน 1 ชม.', 'Within 1 hr'), () => toLocalInput(Math.ceil((Date.now() + 3600e3) / 900e3) * 900e3))
    ),
    h('div', { className: 'hint' }, icon('alert', 13),
      h('span', {}, L('คลิปจะอัปเป็นส่วนตัว แล้วเปลี่ยนเป็นสาธารณะเองตามเวลาที่ตั้ง · แก้เวลาของแต่ละคลิปได้ในการ์ด', 'Videos upload as private, then go public at the set time · edit each video\'s time in its card')))
  );
  const schedToggle = h('input', {
    type: 'checkbox', checked: !!sch.on,
    onchange: (e) => {
      sch.on = e.target.checked;
      if (sch.on && !sch.start) schedStart.value = sch.start = tomorrow19();
      saveSettings();
      onScheduleChange();
    },
  });
  // ย่อ/ขยายกล่องตั้งเวลาด้วยการคลิกหัวกล่อง — มีคลิปในคิวแล้วจะย่อเอง ให้การ์ดมีที่มากขึ้น (จอเตี้ย)
  let schedOpen = true;
  const schedChev = h('span', { className: 'schev' }, icon('chev', 14));
  const schedHead = h('div', { className: 'sh' },
    h('span', { className: 'si' }, icon('clock', 16)),
    h('div', { className: 'stx' }, h('b', {}, L('ตั้งเวลาปล่อยคลิป', 'Schedule releases')), schedSummary),
    schedChev,
    h('label', { className: 'sw' }, schedToggle, h('span', { className: 't' }))
  );
  schedHead.addEventListener('click', (e) => {
    if (!sch.on || e.target.closest('label.sw')) return;
    schedOpen = !schedOpen;
    onScheduleChange();
  });
  const schedPanel = h('div', { className: 'sched' }, schedHead, h('div', { style: 'padding:0 12px' }, pastNote), schedBody);

  // เรียกหลังอัปคลิปที่ตั้งเวลาเสร็จ (เวลาเริ่มถูกเลื่อนไปช่องถัดไป)
  function syncScheduleInput() {
    if (document.activeElement !== schedStart) schedStart.value = sch.start || '';
    onScheduleChange();
  }

  function onScheduleChange() {
    const on = scheduleOn();
    schedPanel.classList.toggle('on', !!sch.on);
    schedBody.hidden = !sch.on || !schedOpen;
    schedPanel.classList.toggle('closed', !schedOpen);
    schedChev.hidden = !sch.on;
    schedHead.title = sch.on ? (schedOpen ? L('คลิกเพื่อย่อ', 'Click to collapse') : L('คลิกเพื่อแก้เวลา', 'Click to edit times')) : '';
    const items = queue.filter((i) => i.status !== 'done');
    if (!sch.on) schedSummary.textContent = L('ปิดอยู่ · คลิปจะเผยแพร่ตามการเปิดเผยของพรีเซ็ต', 'Off · videos are published using the preset\'s visibility');
    else if (!on) schedSummary.textContent = L('เลือกเวลาปล่อยคลิปแรก', 'Pick the first video\'s release time');
    else {
      const unit = sch.unit === 'hour' ? L('ชั่วโมง', 'hours') : L('วัน', 'days');
      const times = items.map(itemPublishAt).filter(Boolean).sort((a, b) => a - b);
      schedSummary.textContent = times.length > 1
        ? L(`${fmtWhen(times[0])} → ${fmtWhen(times[times.length - 1])} · ทุก ${sch.every} ${unit}`, `${fmtWhen(times[0])} → ${fmtWhen(times[times.length - 1])} · every ${sch.every} ${unit}`)
        : L(`เริ่ม ${fmtWhen(effectiveStart())} · ทุก ${sch.every} ${unit}`, `Starts ${fmtWhen(effectiveStart())} · every ${sch.every} ${unit}`);
    }
    if (on) {
      refreshChanSched();
      const { skipped } = queueSlots();
      const ext = takenSlots().length;
      if (ext) {
        const nextExt = takenSlots()[0];
        schedSummary.textContent += L(` · ในช่องมีคลิปรอปล่อย ${ext} คลิป (ถัดไป ${fmtWhen(nextExt.at)})`, ` · ${ext} already scheduled on the channel (next ${fmtWhen(nextExt.at)})`)
          + (skipped ? L(` — ข้ามให้ ${skipped} ช่วง`, ` — skipped ${skipped} slot(s)`) : '');
        schedSummary.title = takenSlots().map((x) => `${fmtWhen(x.at)} · ${x.title}`).join('\n');
      } else schedSummary.title = '';
    }
    const late = on && startIsPast();
    schedPanel.classList.toggle('late', late);
    pastNote.hidden = !late;
    pastNote.style.marginBottom = late ? '12px' : '';
    if (late) pastTxt.textContent = L(
      `เวลาที่ตั้ง (${fmtWhen(new Date(sch.start).getTime())}) ผ่านไปแล้ว — คิวจะเริ่ม ${fmtWhen(effectiveStart())} แทน`,
      `The set time (${fmtWhen(new Date(sch.start).getTime())}) has passed — the queue will start ${fmtWhen(effectiveStart())} instead`);
    queue.forEach(updateItemUI);
    updateRunUI();
  }

  setInterval(() => { if (sch.on && drawer.classList.contains('open')) onScheduleChange(); }, 60e3);

  panes.queue = h('div', {},
    fileInput, folderInput, dropZone,
    h('div', { className: 'toolbar' }, defaultPresetSel, applyAllBtn, expandAllBtn),
    schedPanel,
    statsWrap,
    progressWrap,
    listEl
  );

  const startTxt = h('b');
  const startSub = h('small');
  const startBtn = h('button', { className: 'btn go', onclick: runQueue },
    h('span', { className: 'gi' }, icon('play', 14)), h('span', { className: 'gt' }, startTxt, startSub));
  const stopBtn = iconBtn('stop', L('หยุดหลังคลิปปัจจุบันเสร็จ', 'Stop after the current video'), () => { stopReq = true; toast(L('จะหยุดหลังคลิปปัจจุบันเสร็จ', 'Will stop after the current video finishes')); }, 'outline danger');
  const clearBtn = iconBtn('clear', L('ล้างคลิปที่อัปเสร็จออกจากรายการ', 'Clear finished videos from the list'), () => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].status === 'done') queue.splice(i, 1);
    renderQueue();
  }, 'outline');
  footers.queue = h('div', { className: 'ft' }, startBtn, stopBtn, clearBtn);

  const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');

  // ----- คัดลอกรูปแบบจากคลิปที่อัปแล้ว -----
  // รายการคลิปยอดวิวสูงสุด 6 เดือน (โหลดตอนเปิดแผง เก็บไว้ทั้ง session แยกตามช่อง)
  // state: idle = ยังไม่ได้โหลด / Studio ยังไม่พร้อม · loading · ok · fail
  const REFRESH_TOP = '__refreshTop';
  let topVids = { ch: '', state: 'idle', list: [] };
  const fmtViews = (n) => new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const ellipsize = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  function loadTopVideos(force = false) {
    const ch = getChannel().id;
    if (!force && topVids.ch === ch && (topVids.state === 'ok' || topVids.state === 'loading')) return;
    if (!Claims || !Claims.listTopVideos) return;
    topVids = { ch, state: 'loading', list: [] };
    refreshLabels();
    Claims.listTopVideos()
      .then((list) => { if (topVids.ch === ch) topVids = { ch, state: list ? 'ok' : 'idle', list: list || [] }; })
      .catch((e) => { console.warn('[yt-upload-presets] listTopVideos', e); if (topVids.ch === ch) topVids = { ch, state: 'fail', list: [] }; })
      .finally(refreshLabels);
  }

  // หน้ารีวิวรูปแบบที่เรียนรู้จากคลิป: แก้ชื่อ/คำอธิบาย/แท็กได้ก่อนใช้ · คืนค่า true เมื่อบันทึกแล้ว
  // relearn = อ่านคลิปใหม่แล้วเรียนรู้ใหม่ (ไม่ใช้ของที่เก็บไว้)
  async function reviewVideoTemplate(id, relearn = false) {
    const store = videoTemplates();
    let tpl = !relearn && store[id];
    if (!tpl) {
      if (!Claims || !Claims.videoText) return false;
      let src;
      try { src = await Claims.videoText(id.slice(2)); }
      catch (e) {
        await ask({ title: L('อ่านข้อมูลคลิปไม่ได้', 'Couldn\'t read this video'), body: e.message, ok: L('ตกลง', 'OK') });
        return false;
      }
      const { warnings, txt, ...learned } = learnTemplate(src);
      const top = topVids.list.find((v) => 'v:' + v.videoId === id);
      tpl = { ...learned, id, label: '📈 ' + ellipsize(src.title, 40), visibility: 'PRIVATE', sampleTxt: txt, warnings,
        source: { videoId: id.slice(2), title: src.title, views: top ? top.views : 0 } };
    }
    const fTitle = h('input', { type: 'text', value: tpl.title });
    const fDesc = h('textarea', { rows: 6, value: tpl.description });
    const fTags = h('input', { type: 'text', value: tpl.tags.join(', ') });
    const pv = h('div', { className: 'vt-pv' });
    const draft = () => ({ ...tpl, title: fTitle.value, description: fDesc.value, tags: fTags.value.split(',').map((t) => t.trim()).filter(Boolean) });
    // ตัวอย่าง: ใช้คลิปแรกที่รอคิว ถ้าคิวว่างใช้ tracklist ของคลิปต้นแบบเอง
    const sample = queue.find((i) => i.status === 'pending');
    const showPreview = () => {
      const p = draft();
      const vars = sample
        ? buildVars(sample.file.name, sample.n || 1, sample.txt, { preset: p })
        : buildVars(L('ตัวอย่าง', 'Sample'), 1, tpl.sampleTxt || '', { preset: p });
      pv.replaceChildren(h('b', {}, makeTitle(p, vars)), '\n\n', renderDesc(p, vars).slice(0, 600), '\n\n', h('small', {}, renderTags(p, vars).join(', ')));
    };
    for (const f of [fTitle, fDesc, fTags]) f.addEventListener('input', showPreview);
    showPreview();
    const WARN = {
      'no-tracklist': L('ไม่พบ tracklist ในคำอธิบาย — ชื่อศิลปินยังเป็นข้อความตายตัว', 'No tracklist found in the description — artist names were kept as plain text'),
      'static-title': L('ชื่อคลิปไม่มีตัวแปร — ทุกคลิปจะได้ชื่อเดียวกัน', 'The title has no variables — every upload would get the same title'),
    };
    const body = h('div', { className: 'vt' },
      h('div', { className: 'mini' }, L(`จาก: ${tpl.source.title}`, `From: ${tpl.source.title}`),
        tpl.source.views ? ` · ${fmtViews(tpl.source.views)} ${L('วิว', 'views')}` : ''),
      (tpl.warnings || []).map((w) => h('div', { className: 'hint' }, icon('alert', 13), h('span', {}, WARN[w] || w))),
      h('div', { className: 'mini' }, L('ชื่อคลิป', 'Title')), fTitle,
      h('div', { className: 'mini' }, L('คำอธิบาย', 'Description')), fDesc,
      h('div', { className: 'mini' }, L('แท็ก (คั่นด้วย ,)', 'Tags (comma-separated)')), fTags,
      h('div', { className: 'mini' }, L('ตัวอย่าง', 'Preview')), pv);
    const r = await ask({
      title: L('ใช้รูปแบบจากคลิปนี้', 'Use this video\'s pattern'), body, ic: 'copy',
      ok: L('ใช้รูปแบบนี้', 'Use this pattern'), no: store[id] ? L('เรียนรู้ใหม่', 'Re-learn') : null,
    });
    if (r === false && store[id]) return reviewVideoTemplate(id, true);
    if (!r) return false;
    store[id] = draft();
    saveVideoTemplates();
    refreshLabels();
    return true;
  }

  // onchange ของ select พรีเซ็ต: id พรีเซ็ต / 'v:<videoId>' (ครั้งแรกเปิดหน้ารีวิวก่อน) / ปุ่มโหลดรายการใหม่
  async function choosePreset(sel, prev, apply) {
    const id = sel.value;
    sel.value = prev; // ยังไม่เปลี่ยนจนกว่าจะยืนยัน
    if (id === REFRESH_TOP) return loadTopVideos(true);
    if (isVideoId(id) && !videoTemplates()[id] && !(await reviewVideoTemplate(id))) return;
    apply(id);
  }

  function presetOptions(selected) {
    const mine = presets.map((p, i) => h('option', { value: p.id, selected: p.id === selected }, `${i + 1}. ${p.label}`));
    const vids = topVids.list.map((v, i) => h('option', { value: 'v:' + v.videoId, selected: 'v:' + v.videoId === selected },
      `${i ? '' : '⭐ '}${ellipsize(v.title, 48)} · ${fmtViews(v.views)}`));
    // รูปแบบที่เลือกไว้แต่หลุดจากรายการ 10 อันดับแล้ว -> ยังแสดงให้เห็นว่าการ์ดใช้อะไรอยู่
    const vt = isVideoId(selected) && videoTemplates()[selected];
    if (vt && !topVids.list.some((v) => 'v:' + v.videoId === selected)) vids.unshift(h('option', { value: selected, selected: true }, vt.label));
    const status = {
      loading: L('กำลังโหลด…', 'Loading…'),
      fail: L('โหลดรายการคลิปไม่ได้', 'Couldn\'t load videos'),
      ok: topVids.list.length ? '' : L('ไม่มีคลิปสาธารณะใน 6 เดือน', 'No public videos in the last 6 months'),
      idle: '',
    }[topVids.state];
    if (status) vids.push(h('option', { disabled: true }, status));
    if (topVids.state !== 'loading') vids.push(h('option', { value: REFRESH_TOP }, '↻ ' + (topVids.state === 'idle' ? L('โหลดรายการคลิป', 'Load videos') : L('โหลดใหม่', 'Refresh'))));
    return [
      h('optgroup', { label: L('พรีเซ็ต', 'Presets') }, mine),
      h('optgroup', { label: L('คัดลอกจากคลิป (6 เดือน, ยอดวิว)', 'Copy from video (last 6 mo, by views)') }, vids),
    ];
  }

  function buildCard(it) {
    const pill = h('span', { className: 'pill' });
    const cnt = h('span', { className: 'cnt' });
    const msgTxt = h('span');
    const msgIcon = h('span');
    const msg = h('div', { className: 'msg' }, msgIcon, msgTxt);
    const upFill = h('i');
    const upBar = h('div', { className: 'tbx-bar', hidden: true }, upFill);
    const thumbBox = h('div', { className: 'th', title: fmtSize(it.file.size) }, icon('film', 22), h('span', { className: 'sz' }, fmtSize(it.file.size)));
    const titleIn = h('input', {
      type: 'text', placeholder: L('ชื่อคลิป', 'Video title'),
      oninput: (e) => { it.title = e.target.value; it.titleEdited = true; updateItemUI(it); },
    });
    const resetBtn = iconBtn('refresh', L('สร้างชื่อจากพรีเซ็ตใหม่', 'Regenerate title from preset'), () => { it.titleEdited = false; assignNumbers(); updateItemUI(it); }, 'outline');
    // แก้รายชื่อศิลปินของคลิปนี้ ({artists}) ลบให้ว่าง = กลับไปใช้ค่าอัตโนมัติจาก .txt
    const artistsIn = h('input', {
      type: 'text', placeholder: L('คั่นด้วย , (อัตโนมัติจาก .txt)', 'Comma-separated (auto from .txt)'),
      oninput: (e) => { it.artists = e.target.value; it.artistsEdited = !!e.target.value.trim(); assignNumbers(); updateItemUI(it); },
    });
    // เวลาปล่อยของคลิปนี้ (แก้เองได้ ลบ/รีเซ็ต = กลับไปใช้เวลาที่คำนวณจากคิว)
    const whenIn = h('input', {
      type: 'datetime-local',
      onchange: (e) => {
        const ms = new Date(e.target.value).getTime();
        it.publishEdited = !!ms;
        it.publishAt = ms || null;
        onScheduleChange();
      },
    });
    const whenLbl = h('span', { className: 'wl' });
    const whenReset = iconBtn('refresh', L('ใช้เวลาตามคิว', 'Use queue time'), () => { it.publishEdited = false; it.publishAt = null; onScheduleChange(); }, 'outline');
    const whenBox = h('div', {}, h('div', { className: 'mini' }, L('เวลาปล่อย', 'Release time')), h('div', { className: 'when' }, whenIn, whenLbl, whenReset));
    const artistsMode = h('span', { style: 'font-weight:400' });
    const artistsBox = h('div', {}, h('div', { className: 'mini' }, L('ศิลปิน', 'Artists'), artistsMode), artistsIn);
    const presetSel = h('select', {
      onchange: (e) => choosePreset(e.target, it.presetId, (id) => { it.presetId = id; it.titleEdited = false; renderQueue(); }),
    }, presetOptions(it.presetId));
    const retryBtn = h('button', { className: 'btn sm', onclick: async () => {
      if (it.draftId && !(await ask({
        title: L('คลิปนี้อยู่ใน Studio แล้ว', 'This video is already in Studio'),
        body: L(`อัปขึ้นไปเป็นฉบับร่างแล้ว (${it.draftId}) ถ้าลองใหม่จะได้คลิปซ้ำ\nลบฉบับร่างในหน้า Content ก่อน แล้วค่อยอัปใหม่`, `It was already uploaded as a draft (${it.draftId}). Retrying will create a duplicate.\nDelete the draft in Content first, then upload again.`),
        ok: L('ลบแล้ว อัปใหม่', 'Deleted it, upload again'), ic: 'refresh',
      }))) return;
      it.draftId = '';
      setItem(it, 'pending'); assignNumbers(); renderQueue();
    } }, icon('refresh', 13), L('ลองใหม่', 'Retry'));
    const draftBtn = h('button', { className: 'btn sm', title: L('เปิดฉบับร่างที่ค้างใน Studio (แท็บใหม่) เพื่อลบก่อนลองใหม่', 'Open the leftover draft in Studio (new tab) to delete it before retrying'),
      onclick: () => window.open(`https://studio.youtube.com/video/${it.draftId}/edit`, '_blank') }, icon('ext', 13), L('เปิดฉบับร่าง', 'Open draft'));
    const removeBtn = iconBtn('x', L('เอาออกจากคิว', 'Remove from queue'), () => { queue.splice(queue.indexOf(it), 1); renderQueue(); }, 'sm danger');
    // เลื่อนลำดับในคิว (ลำดับ = เลข {n}/EP และเวลาปล่อย) สลับได้เฉพาะกับคลิปที่ยังไม่ได้อัป
    const canMove = (x) => x && (x.status === 'pending' || x.status === 'error');
    const move = (d) => {
      const i = queue.indexOf(it);
      if (!canMove(it) || !canMove(queue[i + d])) return;
      [queue[i], queue[i + d]] = [queue[i + d], queue[i]];
      listEl.replaceChildren(...queue.map((x) => x.ui.el));
      assignNumbers();
      onScheduleChange();
    };
    const upBtn = iconBtn('up', L('เลื่อนขึ้น', 'Move up'), () => move(-1), 'sm');
    const downBtn = iconBtn('down', L('เลื่อนลง', 'Move down'), () => move(1), 'sm');
    const ord = h('div', { className: 'ord' }, upBtn, downBtn);
    const expBtn = iconBtn('chev', L('แก้ไขรายละเอียด', 'Edit details'), () => {}, 'sm exp');
    const titleTxt = h('div', { className: 'tl' });
    const whenTxt = h('span', { className: 'wt' });
    const att = h('div', { className: 'att' });
    const attachInput = h('input', {
      type: 'file', multiple: true, accept: '.txt,image/*', hidden: true,
      onchange: async (e) => { await attachToItem(it, e.target.files); e.target.value = ''; },
    });
    const fields = h('div', { className: 'fields' },
      h('div', {}, h('div', { className: 'mini' }, L('พรีเซ็ต', 'Preset')), presetSel),
      h('div', {},
        h('div', { className: 'mini' }, L('ชื่อคลิป', 'Video title')),
        h('div', { className: 'row' }, h('div', { className: 'field', style: 'flex:1' }, titleIn, cnt), resetBtn)
      ),
      whenBox,
      artistsBox
    );
    // แถวบนเป็นแถวเดียว: ภาพ · ชื่อไฟล์ · ชื่อคลิป · สถานะ/เวลาปล่อย — คลิกเพื่อขยายช่องแก้ไข
    const hdr = h('div', { className: 'top hdr' },
      thumbBox,
      h('div', { className: 'info', style: 'gap:3px' },
        h('div', { className: 'fnrow' }, h('span', { className: 'fn', title: it.file.name }, it.file.name), expBtn, removeBtn),
        titleTxt,
        h('div', { className: 'row', style: 'flex-wrap:wrap;gap:6px' }, pill, whenTxt, retryBtn, draftBtn)
      ),
      ord
    );
    hdr.addEventListener('click', (e) => {
      if (e.target.closest('button:not(.exp),input,select,a')) return;
      it.open = !it.open;
      updateItemUI(it);
      updateRunUI();
      if (it.open && (it.status === 'pending' || it.status === 'error')) setTimeout(() => titleIn.focus({ preventScroll: true }), 0);
    });
    const el = h('div', { className: 'card' }, hdr, fields, att, upBar, msg, attachInput);
    // ลาก .txt / ภาพ มาวางบนการ์ดเพื่อแนบกับคลิปนี้โดยตรง (ถ้ามีคลิปปนมา ส่งต่อให้แผงเพิ่มเข้าคิวตามปกติ)
    const attachable = (e) => hasFiles(e) && canMove(it);
    el.addEventListener('dragover', (e) => {
      if (!attachable(e)) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.dataTransfer.dropEffect = 'copy'; } catch { /* ignore */ }
      el.classList.add('drag');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('drag');
      if (!attachable(e)) return;
      const files = [...e.dataTransfer.files];
      if (!files.length || files.some(isVideo) || e.dataTransfer.items?.[0]?.webkitGetAsEntry?.()?.isDirectory) return; // ปล่อยให้แผงจัดการ
      e.preventDefault();
      e.stopPropagation();
      attachToItem(it, files);
    });
    it.ui = { el, pill, cnt, msg, msgTxt, msgIcon, upBar, upFill, thumbBox, titleIn, resetBtn, artistsIn, artistsBox, artistsMode, presetSel, retryBtn, draftBtn, removeBtn, att, attachInput, whenBox, whenIn, whenLbl, whenReset, fields, titleTxt, whenTxt, upBtn, downBtn, ord, expBtn, canMove };
    return el;
  }

  const MSG_ICON = { pending: 'alert', uploading: 'upload', review: 'alert', done: 'check', error: 'alert' };

  const fmtDur = (sec) => {
    const t = Math.round(sec), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
    return (hh ? hh + ':' + pad(mm) : mm) + ':' + pad(ss);
  };
  function updateItemUI(it) {
    saveMemo();
    const u = it.ui;
    if (!u) return;
    u.thumbBox.querySelector('.sz').textContent = it.duration ? fmtDur(it.duration) : fmtSize(it.file.size);
    const [label] = STATUS[it.status];
    const editable = it.status === 'pending' || it.status === 'error';
    u.el.className = 'card ' + it.status + (it.open ? ' open' : '');
    u.pill.className = 'pill';
    u.pill.textContent = label;
    u.fields.hidden = !it.open;
    u.titleTxt.hidden = !!it.open;
    u.titleTxt.textContent = it.title || '—';
    u.titleTxt.title = it.title;
    u.titleTxt.classList.toggle('over', it.title.length > TITLE_MAX);
    u.expBtn.title = it.open ? L('ย่อ', 'Collapse') : editable ? L('แก้ไขรายละเอียด', 'Edit details') : L('ดูรายละเอียด', 'Show details');
    const qi = queue.indexOf(it);
    u.ord.hidden = !editable;
    u.upBtn.disabled = !u.canMove(queue[qi - 1]);
    u.downBtn.disabled = !u.canMove(queue[qi + 1]);
    if (document.activeElement !== u.titleIn) u.titleIn.value = it.title;
    u.titleIn.disabled = u.presetSel.disabled = u.artistsIn.disabled = !editable;
    const p = presetById(it.presetId);
    u.artistsBox.hidden = !`${p.title} ${p.description} ${(p.tags || []).join(' ')}`.includes('{artists}');
    if (document.activeElement !== u.artistsIn) u.artistsIn.value = it.artistsEdited ? it.artists : itemVars(it).artists;
    u.artistsMode.textContent = it.artistsEdited ? L('· พิมพ์เอง (ลบให้ว่าง = อัตโนมัติ)', '· manual (clear = auto)') : L('· อัตโนมัติจาก .txt', '· auto from .txt');
    u.resetBtn.hidden = !editable || !it.titleEdited;
    const at = itemPublishAt(it);
    u.whenBox.hidden = !at;
    if (at) {
      if (document.activeElement !== u.whenIn) u.whenIn.value = toLocalInput(at);
      u.whenIn.disabled = !editable;
      const bad = editable && scheduleProblem(at);
      u.whenBox.querySelector('.when').classList.toggle('bad', !!bad);
      u.whenLbl.replaceChildren(icon(bad ? 'alert' : 'clock', 12), bad ? L('อดีต/เร็วไป', 'Past/too soon') : it.publishEdited ? L('ตั้งเอง', 'Manual') : L('ตามคิว', 'Queue'));
      u.whenLbl.title = bad || '';
      u.whenReset.hidden = !editable || !it.publishEdited;
    }
    u.whenTxt.hidden = !at;
    if (at) {
      const bad = editable && scheduleProblem(at);
      u.whenTxt.className = 'wt' + (bad ? ' bad' : '');
      u.whenTxt.replaceChildren(icon(bad ? 'alert' : 'clock', 11), fmtWhen(at));
      u.whenTxt.title = bad || (it.publishEdited ? L('เวลาที่ตั้งเอง', 'Manually set time') : L('เวลาตามคิว', 'Queue time'));
    }
    u.retryBtn.hidden = it.status !== 'error';
    u.draftBtn.hidden = it.status !== 'error' || !it.draftId;
    u.removeBtn.hidden = it.status === 'uploading' || it.status === 'review';
    u.cnt.textContent = `${it.title.length}/${TITLE_MAX}`;
    u.cnt.className = 'cnt' + (it.title.length > TITLE_MAX ? ' over' : '');
    u.msgTxt.textContent = it.msg;
    u.msgIcon.replaceChildren(icon(MSG_ICON[it.status], 14));
    u.msg.hidden = !it.msg;
    // แถบความคืบหน้าของคลิปที่กำลังอัปอยู่ (เปอร์เซ็นต์จาก Studio) · อ่านไม่ได้ = ซ่อน
    const pct = it.status === 'uploading' && uploadProg ? uploadProg.pct : null;
    u.upBar.hidden = pct === null;
    if (pct !== null) u.upFill.style.width = Math.round(pct * 100) + '%';
    renderAttachments(it, editable);
  }

  async function attachToItem(it, fileList) {
    if (!(it.status === 'pending' || it.status === 'error')) return;
    for (const f of fileList) {
      if (isTxt(f)) await attachTxt(it, f);
      else if (isImg(f)) attachThumb(it, f);
    }
    it.titleEdited = false;
    assignNumbers();
    updateItemUI(it);
  }

  function renderAttachments(it, editable) {
    const u = it.ui;
    if (u.thumbUrl && u.thumbFile !== it.thumb) { URL.revokeObjectURL(u.thumbUrl); u.thumbUrl = null; }
    if (it.thumb && !u.thumbUrl) { u.thumbUrl = URL.createObjectURL(it.thumb); u.thumbFile = it.thumb; }
    const oldImg = u.thumbBox.querySelector('img');
    if (u.thumbUrl && (!oldImg || oldImg.src !== u.thumbUrl)) {
      oldImg?.remove();
      u.thumbBox.prepend(h('img', { src: u.thumbUrl, alt: '' }));
    } else if (!u.thumbUrl && oldImg) oldImg.remove();

    const rm = (fn) => editable && h('span', { className: 'rm', title: L('เอาออก', 'Remove'), onclick: fn }, icon('x', 11));
    const kids = [];
    // การ์ดที่ใช้รูปแบบจากคลิป: ชิปบอกที่มา (คลิกเพื่อดู/แก้/เรียนรู้ใหม่) หรือเตือนเมื่อหารูปแบบไม่เจอ (เช่น สลับช่อง)
    if (isVideoId(it.presetId)) {
      const vt = videoTemplates()[it.presetId];
      if (!vt) kids.push(h('span', { className: 'chip bad', title: L('รูปแบบนี้เรียนรู้ไว้ในช่องอื่น หรือถูกลบไปแล้ว', 'This pattern was learned on another channel, or was removed') },
        icon('alert', 13), h('span', {}, L(`ไม่พบรูปแบบจากคลิป — ใช้ ${presets[0].label}`, `Video pattern missing — using ${presets[0].label}`))));
      else if (editable) kids.push(h('button', { className: 'chip', title: L('คลิกเพื่อดู/แก้รูปแบบ หรือเรียนรู้ใหม่', 'Click to review, edit or re-learn this pattern'), onclick: () => reviewVideoTemplate(it.presetId) },
        icon('copy', 13), h('span', {}, L(`รูปแบบจาก: ${ellipsize(vt.source.title, 36)}`, `Pattern from: ${ellipsize(vt.source.title, 36)}`))));
      else kids.push(h('span', { className: 'chip' }, icon('copy', 13), h('span', {}, ellipsize(vt.source.title, 36))));
    }
    if (it.txt) {
      const lines = it.txt.trim().split(/\r?\n/).length;
      kids.push(h('span', { className: 'chip', title: it.txt.slice(0, 600) }, icon('file', 13), h('span', {}, L(`${it.txtName} · ${lines} บรรทัด`, `${it.txtName} · ${lines} lines`)),
        rm(() => { it.txt = ''; it.txtName = ''; it.titleEdited = false; assignNumbers(); updateItemUI(it); })));
    }
    if (it.txt) {
      const tc = itemTracklist(it);
      const probs = [...tc.errors, ...tc.warnings];
      const fx = tc.errors.length && editable ? fixChapters(it.txt) : null;
      if (fx && fx.changes.length) {
        kids.push(h('button', { className: 'chip fixc', title: fx.changes.join('\n'), onclick: () => {
          it.txt = fx.text;
          it.titleEdited = false;
          assignNumbers();
          updateItemUI(it);
          toast(L('แก้ tracklist แล้ว: ', 'Tracklist fixed: ') + fx.changes.join(' · '));
        } }, icon('note', 13), L('แก้ tracklist ให้', 'Fix tracklist')));
      }
      if (tc.errors.length) {
        kids.push(h('span', { className: 'chip bad', title: L('YouTube จะไม่สร้าง Chapters จนกว่าจะแก้:\n', 'YouTube won\'t create chapters until fixed:\n') + tc.errors.map((x) => '• ' + x).join('\n') + (tc.warnings.length ? '\n\n' + tc.warnings.map((x) => '• ' + x).join('\n') : '') },
          icon('alert', 13), h('span', {}, L(`tracklist: ${tc.errors.length} ปัญหา`, `Tracklist: ${tc.errors.length} problem(s)`))));
      } else if (tc.warnings.length) {
        kids.push(h('span', { className: 'chip bad', title: probs.map((x) => '• ' + x).join('\n') },
          icon('alert', 13), h('span', {}, L(`tracklist: ${tc.warnings.length} คำเตือน`, `Tracklist: ${tc.warnings.length} warning(s)`))));
      }
      if (tc.count && !tc.errors.length) {
        const durNote = it.duration ? '' : it.durState === 'loading'
          ? L(' · กำลังอ่านความยาวคลิป…', ' · reading video length…')
          : L(' · อ่านความยาวคลิปไม่ได้ จึงยังไม่ได้เช็กว่า timestamp เกินความยาวคลิปไหม', ' · could not read the video length, so timestamps were not checked against it');
        kids.push(h('span', { className: 'chip' + (it.durState === 'fail' ? ' warnc' : ''), title: L('ผ่านกฎ Chapters ของ YouTube', 'Passes YouTube\'s chapter rules') + durNote },
          icon(it.durState === 'fail' ? 'alert' : 'check', 13),
          h('span', {}, L(`Chapters ${tc.count} ช่วง`, `${tc.count} chapters`) + (it.durState === 'fail' ? L(' · ไม่ได้เช็กความยาว', ' · length not checked') : ''))));
      } else if (!tc.count) {
        kids.push(h('span', { className: 'chip bad', title: L('ไฟล์ .txt ไม่มีบรรทัดที่ขึ้นต้นด้วยเวลา เช่น 00:00 ชื่อเพลง', 'The .txt has no lines starting with a time, e.g. 00:00 Song name') },
          icon('alert', 13), h('span', {}, L('ไม่มี timestamp — ไม่มี Chapters', 'No timestamps — no chapters'))));
      }
    }
    if (it.thumb) {
      const big = it.thumb.size > THUMB_MAX;
      kids.push(h('span', { className: 'chip' + (big ? ' bad' : ''), title: it.thumb.name }, icon('image', 13),
        h('span', {}, big ? L('ภาพปกเกิน 2MB', 'Thumbnail over 2MB') : L(`ภาพปก · ${fmtSize(it.thumb.size)}`, `Thumbnail · ${fmtSize(it.thumb.size)}`)),
        rm(() => { it.thumb = null; updateItemUI(it); })));
    }
    if (it.prev && editable) {
      const when = new Intl.DateTimeFormat(LOCALE === 'th-TH' ? 'th-TH-u-ca-gregory' : LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(it.prev.date));
      kids.push(h('button', { className: 'chip bad', title: L(`ไฟล์นี้เคยอัปขึ้นช่องนี้แล้ว: ${it.prev.title || ''}\nคลิกเพื่อเปิดคลิปนั้น · ถ้าตั้งใจอัปซ้ำ ปล่อยไว้ได้`, `This file was already uploaded to this channel: ${it.prev.title || ''}\nClick to open that video · leave it if the re-upload is intended`),
        onclick: () => it.prev.videoId && window.open(`https://studio.youtube.com/video/${it.prev.videoId}/edit`, '_blank') },
        icon('alert', 13), h('span', {}, L(`เคยอัปแล้ว ${when}`, `Already uploaded ${when}`))));
    }
    const hits = it.txt && Claims ? Claims.claimedSongsIn(it.txt) : [];
    if (hits.length) {
      kids.push(h('span', {
        className: 'chip bad',
        title: L('เพลงใน tracklist ที่เคยโดน claim:\n', 'Tracklist songs previously claimed:\n') + hits.map((x) => L(`• ${x.line}  (เคยโดน ${x.times} คลิป)`, `• ${x.line}  (claimed on ${x.times} video(s))`)).join('\n'),
      }, icon('alert', 13), h('span', {}, L(`${hits.length} เพลงเคยโดน claim`, `${hits.length} song(s) previously claimed`))));
    }
    if (editable && (!it.txt || !it.thumb)) {
      kids.push(h('button', { className: 'chip add', onclick: () => u.attachInput.click() }, icon('clip', 13), L('แนบ .txt / ภาพปก', 'Attach .txt / thumbnail')));
    }
    u.att.replaceChildren(...kids);
    u.att.hidden = !kids.length;
  }

  let hadQueue = false;
  function renderQueue() {
    assignNumbers();
    const has = queue.length > 0;
    dropZone.classList.toggle('mini', has);
    if (has && !hadQueue) schedOpen = false;
    if (!has) schedOpen = true;
    hadQueue = has;
    if (!queue.length) {
      listEl.replaceChildren(h('div', { className: 'empty' },
        h('div', { className: 'ei' }, icon('film', 24)),
        h('b', {}, L('ยังไม่มีคลิปในคิว', 'No videos in the queue yet')),
        h('span', {}, L('ลากโฟลเดอร์คลิปทั้งชุดมาวางด้านบนได้เลย', 'Drag a whole folder of videos onto the area above'))));
    } else {
      listEl.replaceChildren(...queue.map(buildCard));
      queue.forEach(updateItemUI);
    }
    onScheduleChange();
  }

  function updateRunUI() {
    const count = (s) => queue.filter((i) => i.status === s).length;
    const pending = count('pending');
    const done = count('done');
    const errors = count('error');
    const total = queue.length;
    const blocked = !!channelProblem();
    const ch = chanLabel(getChannel());
    startBtn.disabled = running || !pending || blocked;
    startBtn.classList.toggle('running', running);
    const sched = scheduleOn() ? L(' · ตั้งเวลา', ' · scheduled') : '';
    startTxt.textContent = running ? L(`กำลังอัปโหลด ${done + errors + 1}/${total}`, `Uploading ${done + errors + 1}/${total}`) : blocked ? L('ช่องไม่ตรงกับที่ล็อกไว้', 'Channel does not match the locked one') : pending ? L(`เริ่มอัปโหลด ${pending} คลิป${sched}`, `Upload ${pending} video(s)${sched}`) : L('เริ่มอัปโหลด', 'Start upload');
    startSub.textContent = blocked ? L('ปลดล็อกหรือสลับกลับไปช่องที่ล็อกไว้', 'Unlock, or switch back to the locked channel') : L(`ไปที่ช่อง ${ch}`, `To channel ${ch}`);
    stopBtn.disabled = !running;
    clearBtn.disabled = !done;
    applyAllBtn.disabled = running;
    statsWrap.hidden = !total;
    stats.total.b.textContent = total;
    stats.pending.b.textContent = pending;
    stats.done.b.textContent = done;
    stats.error.b.textContent = errors;
    progressWrap.hidden = !total || (!running && !done);
    const pct = total ? Math.round(((done + errors) / total) * 100) : 0;
    progress.style.width = pct + '%';
    progressPct.textContent = pct + '%';
    // ป้าย FAB เป็นของ renderActivity() ทั้งตอนมีงานและตอนว่าง
    tabCount.queue.textContent = total ? String(total) : '';
    const anyOpen = queue.some((i) => i.open);
    expandAllBtn.hidden = !total;
    expandAllBtn.replaceChildren(icon(anyOpen ? 'up' : 'down', 14), anyOpen ? L('ย่อทั้งหมด', 'Collapse all') : L('ขยายทั้งหมด', 'Expand all'));
    if (running) setTitleMark(`(${Math.min(done + errors + 1, total)}/${total}) ⬆`);
    renderActivity(); // ทางเดียว: renderActivity ไม่เรียก updateRunUI กลับ
  }

  // งานที่กำลังทำอยู่ตอนนี้ (อันเดียว) — null ถ้าว่าง · ดู activityFrom() สำหรับกติกาการเลือก
  function activity() {
    const count = (st) => queue.filter((i) => i.status === st).length;
    const q = {
      running,
      inFlight: queue.some((i) => i.status === 'uploading' || i.status === 'review'),
      total: queue.length,
      done: count('done'),
      errors: count('error'),
    };
    // โมดูลลิขสิทธิ์พังไม่ควรลาก UI ของคิวไปด้วย
    let claims = null;
    try { claims = Claims && Claims.status ? Claims.status() : null; } catch (e) { claims = null; }
    const a = activityFrom(q, claims, uploadProg);
    if (a && a.task === 'upload') {
      a.title = L(`กำลังอัปโหลด ${a.count.at}/${a.count.of}`, `Uploading ${a.count.at}/${a.count.of}`);
    }
    return a;
  }

  // วาดแถบงาน · ถูกเรียกทุก 0.8 วินาที -> ไม่มีอะไรเปลี่ยนก็ไม่แตะ DOM (แบบเดียวกับ updateChannelUI)
  // ฟังก์ชันนี้เป็นเจ้าของ fabBadge ทั้งตอนมีงานและตอนว่าง (updateRunUI ไม่แตะป้ายนี้แล้ว)
  let lastActSig = '';
  function renderActivity() {
    const a = activity();
    const pending = queue.filter((i) => i.status === 'pending').length;
    const total = queue.length;
    const pct = a && a.progress !== null ? Math.round(a.progress * 100) : null;
    // pending/total อยู่ในลายเซ็นด้วย ไม่งั้นตอนว่างป้าย FAB จะไม่อัปเดต
    const sig = JSON.stringify([a, pending, total]);
    if (sig === lastActSig) return;
    lastActSig = sig;
    // ขยับแค่แถบของคลิปที่กำลังอัป — ห้ามเรียก updateItemUI ที่นี่ เพราะมันลาก
    // renderAttachments -> Claims.claimedSongsIn -> getSongs() (อ่าน songHistory ทั้งก้อน) มาทุก tick
    const up = queue.find((i) => i.status === 'uploading');
    if (up && up.ui) {
      const p = uploadProg ? uploadProg.pct : null;
      up.ui.upBar.hidden = p === null;
      if (p !== null) up.ui.upFill.style.width = Math.round(p * 100) + '%';
    }
    actBar.hidden = !a;
    if (a) {
      actBar._tab = a.tab;
      actBar.title = a.detail || '';
      actIcon.replaceChildren(emojiIcon(a.icon, 15));
      actTitle.textContent = a.title;
      actPct.textContent = pct === null ? '' : pct + '%';
      actFill.parentElement.classList.toggle('ind', pct === null);
      actFill.style.width = pct === null ? '' : pct + '%';
    }
    // FAB: มีงาน = ไอคอน + เปอร์เซ็นต์ และมีเส้นความคืบหน้าที่ขอบล่าง · ว่าง = จำนวนคลิปที่รอ
    // เส้นความคืบหน้าขึ้นเฉพาะตอนมีเปอร์เซ็นต์จริง · งานที่ไม่รู้ความคืบหน้า (เช่นรอ YouTube ประมวลผล)
    // โชว์แค่ไอคอนบนป้าย ไม่งั้นเส้น 0% จะดูเหมือนค้าง
    fab.classList.toggle('busy', !!a && pct !== null);
    fab.style.setProperty('--p', pct === null ? 0 : pct);
    fabBadge.hidden = !a && !total;
    if (a) fabBadge.replaceChildren(emojiIcon(a.icon, 12), ...(pct === null ? [] : [` ${pct}%`]));
    else fabBadge.textContent = String(pending || total);
  }

  // ----- แท็บพรีเซ็ต -----
  let editId = ownId(activeId);
  let lastField = null;
  const presetList = h('div', { className: 'plist' });
  const fLabel = h('input', { type: 'text' });
  const fTitle = h('input', { type: 'text' });
  const fDesc = h('textarea');
  const fTags = h('input', { type: 'text', placeholder: L('คั่นด้วยเครื่องหมายจุลภาค ,', 'Separate with commas ,') });
  const fEp = h('input', { type: 'number', min: 1 });
  const titleCnt = h('span', { className: 'cnt' });
  const visSeg = h('div', { className: 'seg' });
  const fArtists = h('input', { type: 'text', placeholder: L('เช่น SZA, Chris Brown, Nessy J., BLXD', 'e.g. SZA, Chris Brown, Nessy J., BLXD') });
  const fArtistMax = h('input', { type: 'number', min: 1, max: 10 });
  const sampleIn = h('input', { type: 'text', value: 'nessy_j_mix.mp4' });
  // tracklist ตัวอย่างสำหรับดูพรีวิว (ลากไฟล์ .txt จริงมาวางที่ช่องทดลองเพื่อเปลี่ยนได้)
  let sampleTxt = [
    '00:00 BLXD - Late Night Calls',
    '02:50 Nessy J. - Toxic Craving',
    '05:10 BLXD x Chris Brown - When I Call Your Name',
    '08:30 SZA - Snooze (Cover by BLXD)',
    '11:20 BLXD - Waiting On Me (ft. Brent Faiyaz)',
  ].join('\n');
  const sampleTxtLbl = h('span', {}, L('tracklist ตัวอย่าง', 'Sample tracklist'));
  const pvTitle = h('div', { className: 'vtl' });
  const pvChan = h('div', { className: 'vch' });
  const pvTags = h('div', { className: 'tagline' });
  const pvWarn = h('div', { className: 'tbx-note tbx-warn', hidden: true });
  const varChips = h('div', { className: 'chips' },
    VARS.map((v) => h('button', {
      className: 'chip var', title: L('แทรกลงช่องที่กำลังแก้', 'Insert into the field being edited'),
      onmousedown: (e) => e.preventDefault(),
      onclick: () => insertVar(`{${v}}`),
    }, `{${v}}`))
  );

  [fTitle, fDesc, fTags].forEach((f) => f.addEventListener('focus', () => (lastField = f)));

  // ลากไฟล์ .txt มาวางในช่องคำอธิบาย = แทรกเนื้อหาไฟล์ตรงตำแหน่งเคอร์เซอร์
  fDesc.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  fDesc.addEventListener('drop', async (e) => {
    const f = [...(e.dataTransfer?.files || [])].find(isTxt);
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    lastField = fDesc;
    insertVar((await readText(f)).replace(/\r\n/g, '\n').trim());
    toast(L(`แทรกเนื้อหาจาก ${f.name} แล้ว`, `Inserted content from ${f.name}`));
  });

  function insertVar(text) {
    const f = lastField || fTitle;
    f.focus();
    f.setRangeText(text, f.selectionStart, f.selectionEnd, 'end');
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const editing = () => presetById(editId);
  function bind(field, el, toVal = (v) => v) {
    el.addEventListener('input', () => {
      editing()[field] = toVal(el.value);
      save('presets', presets);
      if (field === 'label') renderPresetList();
      renderPresetPreview();
      refreshLabels();
    });
  }
  bind('label', fLabel);
  bind('title', fTitle);
  bind('description', fDesc);
  bind('tags', fTags, (v) => v.split(',').map((s) => s.trim()).filter(Boolean));
  bind('artistPriority', fArtists, (v) => v.split(',').map((s) => s.trim()).filter(Boolean));
  bind('artistMax', fArtistMax, (v) => Math.max(1, parseInt(v, 10) || 4));
  sampleIn.addEventListener('input', renderPresetPreview);
  sampleIn.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  sampleIn.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    const txt = files.find(isTxt);
    const vid = files.find(isVideo);
    if (!txt && !vid) return;
    e.preventDefault();
    e.stopPropagation();
    if (txt) {
      sampleTxt = await readText(txt);
      sampleTxtLbl.textContent = txt.name;
    }
    sampleIn.value = (vid || txt).name.replace(TXT_EXT, '.mp4');
    renderPresetPreview();
  });
  fEp.addEventListener('change', () => {
    counters[editId] = Math.max(1, parseInt(fEp.value, 10) || 1) - 1;
    save('counters', counters);
    renderPresetPreview();
    renderQueue();
  });

  function renderPresetList() {
    presetList.replaceChildren(
      ...presets.map((p, i) => h('div', {
        className: 'pitem' + (p.id === editId ? ' on' : ''), title: L(`Alt+${i + 1} = ตั้งเป็นพรีเซ็ตหลัก`, `Alt+${i + 1} = set as default preset`),
        onclick: () => { editId = p.id; renderPresetEditor(); },
      },
        h('span', { className: 'k' }, String(i + 1)),
        h('div', { className: 'pl' }, h('b', {}, p.label || L('(ไม่มีชื่อ)', '(untitled)')), h('span', {}, p.title || '')),
        p.id === activeId && h('span', { className: 'main' }, icon('star', 10), L('หลัก', 'Default'))
      ))
    );
    // รายการเลื่อนในกล่อง: ให้อันที่เลือกอยู่ในมุมมองเสมอ (เลื่อนเฉพาะในกล่อง ไม่เลื่อนทั้งแผง)
    const on = presetList.querySelector('.pitem.on');
    if (on) {
      const top = on.offsetTop - presetList.offsetTop;
      if (top < presetList.scrollTop || top + on.offsetHeight > presetList.scrollTop + presetList.clientHeight) presetList.scrollTop = top - 4;
    }
  }

  function renderPresetEditor() {
    if (!presets.some((p) => p.id === editId)) editId = ownId(activeId);
    const p = editing();
    renderPresetList();
    fLabel.value = p.label || '';
    fTitle.value = p.title || '';
    fDesc.value = p.description || '';
    fTags.value = (p.tags || []).join(', ');
    fArtists.value = (p.artistPriority || []).join(', ');
    fArtistMax.value = p.artistMax || 4;
    visSeg.replaceChildren(
      ...Object.entries(VIS).map(([k, label]) => h('button', {
        className: (p.visibility || 'PRIVATE') === k ? 'on' : '',
        onclick: () => { p.visibility = k; save('presets', presets); renderPresetEditor(); },
      }, label))
    );
    renderPresetPreview();
  }

  function renderPresetPreview() {
    const p = editing();
    const n = (counters[p.id] || 0) + 1;
    if (document.activeElement !== fEp) fEp.value = n;
    const vars = buildVars(sampleIn.value, n, sampleTxt, { preset: p });
    const t = makeTitle(p, vars);
    pvTitle.textContent = t || '—';
    pvChan.textContent = `${chanLabel(getChannel())} · ${VIS[p.visibility || 'PRIVATE']}`;
    titleCnt.textContent = `${t.length}/${TITLE_MAX}`;
    titleCnt.className = 'cnt' + (t.length > TITLE_MAX ? ' over' : '');
    pvTags.replaceChildren(...renderTags(p, vars).map((t) => h('span', {}, t)));
    const bad = unknownVars(p);
    pvWarn.hidden = !bad.length;
    if (bad.length) pvWarn.textContent = L(
      `⚠ ไม่รู้จักตัวแปร ${bad.join(' ')} — จะขึ้นบน YouTube เป็นข้อความตรง ๆ (ดูชื่อที่ใช้ได้ที่ปุ่ม "ตัวแปร" ด้านล่าง)`,
      `⚠ Unknown variable ${bad.join(' ')} — it will appear on YouTube as literal text (see the "Variables" buttons below for valid names)`);
  }

  const sec = (title, ic, ...kids) => h('div', { className: 'sec' }, h('h4', {}, icon(ic, 13), title), ...kids);

  panes.presets = h('div', {},
    sec(L('พรีเซ็ตทั้งหมด', 'All presets'), 'layers',
      presetList,
      h('div', { className: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
        h('button', { className: 'btn sm', onclick: () => {
          const p = { id: 'p' + Date.now().toString(36), label: L('✨ พรีเซ็ตใหม่', '✨ New preset'), title: '{name}', description: '', tags: [], visibility: 'PRIVATE' };
          presets.push(p); save('presets', presets); editId = p.id; renderPresetEditor(); refreshLabels(); fLabel.focus(); fLabel.select();
        } }, icon('plus', 13), L('ใหม่', 'New')),
        h('button', { className: 'btn sm', onclick: () => {
          const p = { ...structuredClone(editing()), id: 'p' + Date.now().toString(36) };
          p.label += L(' (สำเนา)', ' (copy)');
          presets.push(p); save('presets', presets); editId = p.id; renderPresetEditor(); refreshLabels();
        } }, icon('copy', 13), L('ทำสำเนา', 'Duplicate')),
        h('button', { className: 'btn sm', onclick: () => { activeId = editId; save('activeId', activeId); refreshLabels(); renderPresetList(); toast(L(`ตั้ง "${editing().label}" เป็นพรีเซ็ตหลักแล้ว`, `Set "${editing().label}" as the default preset`)); } }, icon('star', 13), L('ตั้งเป็นหลัก', 'Set as default')),
        h('span', { style: 'flex:1' }),
        h('button', { className: 'btn sm ghost danger', onclick: async () => {
          if (presets.length < 2) return toast(L('ต้องมีพรีเซ็ตอย่างน้อย 1 อัน', 'You must keep at least 1 preset'));
          if (!(await ask({ title: L(`ลบพรีเซ็ต "${editing().label}"?`, `Delete preset "${editing().label}"?`), body: L('คลิปในคิวที่ใช้พรีเซ็ตนี้จะเปลี่ยนไปใช้พรีเซ็ตหลัก', 'Queued videos using this preset will switch to the default preset'), ok: L('ลบ', 'Delete'), danger: true, ic: 'clear' }))) return;
          presets = presets.filter((p) => p.id !== editId);
          save('presets', presets);
          if (!presets.some((p) => p.id === activeId)) { activeId = presets[0].id; save('activeId', activeId); }
          queue.forEach((it) => { if (!presets.some((p) => p.id === it.presetId)) it.presetId = activeId; });
          editId = ownId(activeId); renderPresetEditor(); refreshLabels(); renderQueue();
        } }, icon('clear', 13), L('ลบ', 'Delete'))
      )
    ),
    sec(L('ข้อมูลคลิป', 'Video details'), 'film',
      h('div', { className: 'lbl' }, L('ชื่อพรีเซ็ต', 'Preset name')), fLabel,
      h('div', { className: 'lbl' }, h('span', {}, L('ชื่อคลิป', 'Video title')), titleCnt), fTitle,
      h('div', { className: 'lbl' }, h('span', {}, L('คำอธิบาย', 'Description')), h('span', {}, L('ลาก .txt มาวางเพื่อแทรกข้อความ', 'Drop a .txt here to insert its text'))), fDesc,
      h('div', { className: 'lbl' }, L('แท็ก', 'Tags')), fTags,
      h('div', { className: 'lbl' }, h('span', {}, L('ตัวแปร', 'Variables')), h('span', {}, L('คลิกเพื่อแทรกในช่องที่กำลังแก้', 'Click to insert into the field being edited'))), varChips,
      h('div', { className: 'hint', style: 'margin-top:10px' }, icon('alert', 13),
        h('span', {}, L('ครอบด้วย [[ ... ]] เพื่อให้ส่วนนั้นหายไปเมื่อตัวแปรข้างในว่าง เช่น [[ | {bpm} BPM]]', 'Wrap in [[ ... ]] to hide that part when the variable inside is empty, e.g. [[ | {bpm} BPM]]')))
    ),
    sec(L('ตัวอย่างบน YouTube', 'YouTube preview'), 'tv',
      h('div', { className: 'yt' },
        h('div', { className: 'vt' }, icon('play', 26), h('span', { className: 'sz' }, '2:53:12')),
        h('div', { className: 'vtx' }, pvTitle, pvChan)
      ),
      pvTags,
      pvWarn,
      h('div', { className: 'lbl' }, h('span', {}, L('ทดลองกับไฟล์', 'Test with a file')), sampleTxtLbl),
      sampleIn,
      h('div', { className: 'hint', style: 'margin-top:6px' }, icon('clip', 13), L('ลาก .mp4 หรือ .txt จริงมาวางที่ช่องนี้เพื่อดูผลลัพธ์', 'Drop a real .mp4 or .txt here to preview the result'))
    ),
    sec(L('ศิลปิน', 'Artists'), 'queue',
      h('div', { className: 'lbl' }, h('span', {}, L('ให้ขึ้นก่อนใน {artists}', 'Prioritised in {artists}')), h('span', {}, L('เฉพาะคนที่อยู่ใน tracklist', 'Only those in the tracklist'))), fArtists,
      h('div', { className: 'kv', style: 'margin-top:8px' },
        h('div', {}, h('b', {}, L('จำนวนสูงสุดในชื่อคลิป', 'Max in video title')), h('small', {}, L('ถ้าชื่อยาวเกิน 100 ตัวอักษรจะลดให้อัตโนมัติ', 'Auto-reduced if the title exceeds 100 characters'))), fArtistMax)
    ),
    sec(L('การเผยแพร่', 'Publishing'), 'send',
      visSeg,
      h('div', { className: 'kv', style: 'margin-top:8px' },
        h('div', {}, h('b', {}, L('EP ถัดไป', 'Next EP')), h('small', {}, L('ค่าของ {n} สำหรับคลิปถัดไป', 'Value of {n} for the next video'))), fEp)
    )
  );
  footers.presets = h('div', { className: 'ft' },
    h('button', { className: 'btn', style: 'flex:1', onclick: applyToOpenDialog, title: L('ใส่พรีเซ็ตหลักลงหน้าต่างอัปโหลดที่เปิดอยู่', 'Apply the default preset to the open upload dialog') }, icon('send', 14), L('ใส่ลงหน้าต่างที่เปิดอยู่', 'Apply to open window')),
    h('button', { className: 'btn ghost danger', onclick: async () => {
      if (!(await ask({ title: L('คืนค่าพรีเซ็ตทั้งหมด?', 'Reset all presets?'), body: L('พรีเซ็ตที่แก้ไว้จะหายไป และกลับเป็นค่าเริ่มต้น (ส่งออกไฟล์สำรองในแท็บตั้งค่าก่อนได้)', 'Your edited presets will be lost and replaced by the defaults (you can export a backup in Settings first)'), ok: L('คืนค่าเริ่มต้น', 'Reset to defaults'), danger: true, ic: 'refresh' }))) return;
      presets = structuredClone(DEFAULT_PRESETS); save('presets', presets);
      activeId = editId = presets[0].id; save('activeId', activeId);
      queue.forEach((it) => { if (!presets.some((p) => p.id === it.presetId)) it.presetId = activeId; });
      renderPresetEditor(); refreshLabels(); renderQueue();
    } }, icon('refresh', 14), L('คืนค่าเริ่มต้น', 'Reset to defaults'))
  );

  // ความทึบของแผงกระจก: 100 = ดำทึบ, ค่าน้อย = เห็นหน้า Studio ข้างหลังมากขึ้น (ตัวหนังสือยังอ่านได้เพราะเบลอพื้นหลัง)
  const glassVal = h('small');
  function applyGlass() {
    const v = Math.min(100, Math.max(40, Number(settings.glass) || 82));
    root.style.setProperty('--ga', String(v / 100));
    glassVal.textContent = L(`${v}% · น้อย = เห็นพื้นหลังมากขึ้น`, `${v}% · lower = more see-through`);
  }

  // ----- แท็บตั้งค่า -----
  function sw(key, title, desc, onChange) {
    return h('label', { className: 'sw' },
      h('input', { type: 'checkbox', checked: !!settings[key], onchange: (e) => { settings[key] = e.target.checked; saveSettings(); onChange && onChange(); } }),
      h('span', { className: 't' }),
      h('span', {}, h('b', {}, title), h('small', {}, desc))
    );
  }
  // ----- ส่งออก/นำเข้าพรีเซ็ตและการตั้งค่า (ไฟล์ JSON) -----
  // ไม่รวมช่องที่ล็อกไว้, ภาษา, ประวัติอัปโหลด และประวัติเพลงลิขสิทธิ์ เพราะผูกกับเครื่อง/ช่องของแต่ละคน
  // ค่าส่วนตัว (ชื่อโปรดิวเซอร์, ตั้งเวลาปล่อย, ชื่อศิลปินของตัวเอง, เลข EP) ส่งออกไปด้วยเพื่อใช้สำรอง
  // แต่ตอนนำเข้าจะใช้ก็ต่อเมื่อผู้ใช้ยืนยันว่าเป็นไฟล์ของตัวเอง
  const BACKUP_APP = 'yt-upload-presets';
  const BACKUP_FORMAT = 1; // ขยับเลขนี้เมื่อโครงไฟล์สำรองเปลี่ยนจนรุ่นเก่าอ่านไม่ครบ
  const PERSONAL_SETTINGS = ['producer', 'schedule'];
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  // ล้างพรีเซ็ตจากไฟล์ให้เป็นรูปแบบที่สคริปต์ใช้ได้ (ไฟล์ที่ชนิดข้อมูลผิดจะทำให้แผงเปิดไม่ขึ้น)
  function cleanPresets(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const ids = new Set();
    const out = [];
    for (const p of list) {
      if (!isObj(p) || typeof p.id !== 'string' || !p.id || typeof p.label !== 'string' || ids.has(p.id)) return null;
      ids.add(p.id);
      out.push({ ...p,
        title: typeof p.title === 'string' ? p.title : '{name}',
        description: typeof p.description === 'string' ? p.description : '',
        tags: strList(p.tags),
        artistPriority: strList(p.artistPriority),
        artistMax: Math.max(1, parseInt(p.artistMax, 10) || 4),
        visibility: p.visibility in VIS ? p.visibility : 'PRIVATE',
      });
    }
    return out;
  }
  function exportBackup() {
    const { lockChannel, lang, ...rest } = settings;
    const data = {
      app: BACKUP_APP, format: BACKUP_FORMAT, version: GM_info.script.version, exportedAt: new Date().toISOString(),
      presets, activeId, counters, settings: rest, claimsCfg: load('cfg', {}),
    };
    const d = new Date();
    const a = h('a', {
      href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
      download: `yt-upload-presets-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`,
    });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(L(`ส่งออกพรีเซ็ต ${presets.length} รายการแล้ว`, `Exported ${presets.length} presets`));
  }
  async function importBackup(file) {
    if (running || queue.some((i) => i.status === 'pending' || i.status === 'error')) return toast(L('ล้างคิวอัปโหลดก่อนแล้วค่อยนำเข้า (หน้าจะรีโหลด ไฟล์ในคิวจะหาย)', 'Clear the upload queue before importing (the page reloads and queued files would be lost)'));
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast(L('อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .json ที่ส่งออกจากสคริปต์นี้', 'Can\'t read the file — it must be a .json file exported from this script')); }
    const newPresets = data?.app === BACKUP_APP ? cleanPresets(data.presets) : null;
    if (!newPresets) return toast(L('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ YouTube Upload Presets หรือข้อมูลเสียหาย', 'This is not a YouTube Upload Presets backup file, or it is damaged'));
    const fmt = Number(data.format) || 1;
    if (fmt > BACKUP_FORMAT) return toast(L(
      `ไฟล์สำรองนี้มาจากสคริปต์เวอร์ชันใหม่กว่า (format ${fmt}) — อัปเดตสคริปต์ก่อนแล้วนำเข้าอีกครั้ง`,
      `This backup is from a newer version of the script (format ${fmt}) — update the script first, then import again`));
    const names = newPresets.map((p) => p.label).join(', ');
    const own = await ask({
      title: L(`นำเข้าพรีเซ็ต ${newPresets.length} รายการ`, `Import ${newPresets.length} presets`),
      ic: 'download',
      body: h('div', {},
        h('div', {}, h('b', {}, names)),
        h('div', { style: 'margin-top:8px' }, L('พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้และภาษาไม่เปลี่ยน) แล้วหน้าจะรีโหลด', 'Existing presets and settings on this device will be replaced (locked channel and language stay unchanged) and the page will reload.')),
        h('div', { style: 'margin-top:10px' }, h('b', {}, L('เป็นไฟล์สำรองของช่องคุณเองไหม?', 'Is this a backup of your own channel?'))),
        h('div', { className: 'mut' }, L('ของฉัน = นำเข้าค่าส่วนตัวด้วย (ชื่อโปรดิวเซอร์, ตั้งเวลาปล่อย, ชื่อศิลปินของตัวเอง, เลข EP)\nของคนอื่น = นำเข้าแค่พรีเซ็ตและการตั้งค่าทั่วไป ค่าส่วนตัวของคุณไม่เปลี่ยน', 'Mine = also import personal values (producer name, schedule, your own artist names, EP numbers)\nSomeone else\'s = only presets and general settings; your personal values stay unchanged'))),
      ok: L('ไฟล์ของฉัน', 'My file'),
      no: L('ไฟล์ของคนอื่น', 'Someone else\'s'),
    });
    if (own === null) return;
    save('presets', fixLegacyTrapsoulTitles(newPresets));
    save('activeId', newPresets.some((p) => p.id === data.activeId) ? data.activeId : newPresets[0].id);
    if (isObj(data.settings)) {
      const next = { ...settings };
      for (const [k, v] of Object.entries(data.settings)) {
        if (!(k in settings) || k === 'lockChannel' || k === 'lang' || (!own && PERSONAL_SETTINGS.includes(k))) continue;
        if (k === 'schedule') { if (isObj(v)) next.schedule = { ...settings.schedule, on: !!v.on, start: typeof v.start === 'string' ? v.start : '', every: Math.max(1, parseInt(v.every, 10) || 1), unit: v.unit === 'hour' ? 'hour' : 'day' }; continue; }
        if (typeof v === typeof settings[k]) next[k] = v; // ชนิดข้อมูลต้องตรงกับของเดิม
      }
      save('settings', next);
    }
    if (isObj(data.claimsCfg)) {
      const cur = load('cfg', {});
      for (const [k, v] of Object.entries(data.claimsCfg)) {
        if (!own && k === 'ownNames') continue;
        if (['string', 'boolean', 'number'].includes(typeof v)) cur[k] = v;
      }
      save('cfg', cur);
    }
    if (own && isObj(data.counters)) save('counters', Object.fromEntries(Object.entries(data.counters).filter(([, v]) => Number.isFinite(v))));
    reloadingOnPurpose = true;
    location.reload();
  }
  const backupIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true,
    onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); } });

  panes.settings = h('div', {},
    sec(L('อัปโหลดแบบคิว', 'Queue upload'), 'queue',
      sw('autoSave', L('กด Save ให้อัตโนมัติ', 'Auto-press Save'), L('ตั้งการเปิดเผยตามพรีเซ็ตแล้วกด Save ต่อไฟล์ถัดไปเลย ถ้าปิดไว้จะรอให้คุณตรวจแล้วกด Save เองทีละคลิป', 'Sets visibility from the preset, presses Save and moves on to the next file. When off, waits for you to review and press Save on each video yourself.')),
      sw('thumb', L('อัปภาพปกให้อัตโนมัติ', 'Auto-upload thumbnail'), L('ใช้ไฟล์ .jpg/.png ชื่อเดียวกับคลิป (ไม่เกิน 2MB และช่องต้องยืนยันตัวตนแล้ว)', 'Uses a .jpg/.png with the same name as the video (max 2MB; channel must be verified)')),
      sw('notify', L('แจ้งเตือนเมื่อคิวเสร็จ', 'Notify when the queue finishes'), L('เด้งแจ้งเตือนบนเดสก์ท็อปพร้อมเสียง และโชว์ความคืบหน้าบนชื่อแท็บ เช่น (3/10) — ไปทำอย่างอื่นได้ไม่ต้องเฝ้า', 'Desktop notification with a sound, plus progress in the tab title like (3/10) — no need to keep watching')),
      sw('intercept', L('รับหลายไฟล์จากหน้าต่างของ YouTube', 'Take multiple files from YouTube\'s dialog'), L('เลือกหรือลากหลายไฟล์ในหน้าต่างอัปโหลดปกติของ Studio จะส่งมาเข้าคิวนี้แทน', 'Selecting or dropping multiple files in Studio\'s normal upload dialog sends them to this queue instead'))
    ),
    sec(L('ความปลอดภัย', 'Safety'), 'lock',
      sw('autoAcceptInvite', L('กดยอมรับคำเชิญสิทธิ์ช่องให้อัตโนมัติ', 'Auto-accept channel permission invites'), L('เปิดลิงก์ ACCEPT INVITATION จากอีเมลของ YouTube แล้วสคริปต์กด Accept ให้', 'Open the ACCEPT INVITATION link from the YouTube email and the script presses Accept for you')),
      sw('confirmStart', L('ถามยืนยันชื่อช่องก่อนเริ่มคิว', 'Confirm channel name before starting the queue'), L('แสดงชื่อช่องปัจจุบันให้ยืนยันทุกครั้งที่กดเริ่ม', 'Shows the current channel name for confirmation every time you press Start')),
      h('div', { className: 'hint', style: 'margin-top:6px' }, icon('lock', 13),
        h('span', {}, L('กดปุ่ม "ล็อกช่อง" ด้านบนเพื่อให้อัปได้เฉพาะช่องนั้น ถ้าสลับช่อง คิวจะหยุดเอง', 'Press the "Lock channel" button above to upload only to that channel. If you switch channels, the queue stops automatically.')))
    ),
    sec(L('อัปโหลดทีละไฟล์ (หน้าต่างปกติของ YouTube)', 'Single-file upload (YouTube\'s normal dialog)'), 'upload',
      sw('autoApply', L('เติมข้อมูลอัตโนมัติ', 'Auto-fill details'), L('ใส่ชื่อ/คำอธิบาย/แท็กจากพรีเซ็ตหลักให้ทันทีเมื่อเลือกไฟล์', 'Fills title/description/tags from the default preset as soon as a file is selected')),
      sw('quickActions', L('ปุ่มลัดใต้ช่องชื่อและคำอธิบาย', 'Quick actions under title and description'), L('ปุ่มใส่ชื่อ/คำอธิบาย/แท็กจากพรีเซ็ต, ใส่ .txt, ตรวจ Chapters และคัดลอก — ทั้งในหน้าต่างอัปโหลดและหน้าแก้ไขคลิป', 'Buttons to apply preset title/description/tags, load a .txt, check chapters and copy — in the upload dialog and on the video edit page')),
      sw('autoNext', L('กด Next ไปหน้าการเปิดเผย', 'Press Next to the Visibility page'), L('เลือกการเปิดเผยตามพรีเซ็ตให้ แต่ไม่กด Save', 'Selects visibility from the preset but doesn\'t press Save'))
    ),
    sec(L('ตรวจปัญหา', 'Troubleshooting'), 'alert',
      h('div', { className: 'hint' }, icon('alert', 13),
        h('span', {}, L('เปิดหน้าต่างอัปโหลดค้างไว้ที่หน้ากรอกรายละเอียด (มีส่วน Thumbnail) แล้วกดปุ่มนี้ ข้อมูลโครงสร้างหน้าจะถูกคัดลอก ส่งไปให้ผู้พัฒนาแก้สคริปต์ได้ (อ่านอย่างเดียว ไม่กดอะไรในหน้า)', 'Keep the upload dialog open on the details page (with the Thumbnail section) and press this button. The page structure info is copied so you can send it to the developer to fix the script (read-only, nothing on the page is clicked).'))),
      h('button', { className: 'btn sm', style: 'margin-top:10px', onclick: () => {
        const info = diagnoseUploadDialog();
        GM_setClipboard(JSON.stringify(info, null, 1));
        toast(info.error ? info.error : L('คัดลอกข้อมูลตรวจปัญหาแล้ว — วางส่งให้ผู้พัฒนาได้เลย', 'Troubleshooting info copied — paste it to the developer'));
      } }, icon('copy', 13), L('คัดลอกข้อมูลหน้าต่างอัปโหลด', 'Copy upload dialog info'))
    ),
    sec(L('ทั่วไป', 'General'), 'sliders',
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'Language / ภาษา'), h('small', {}, L('เปลี่ยนแล้วหน้าจะรีโหลด', 'The page reloads after changing'))),
        h('select', { onchange: (e) => {
          if (running) { e.target.value = LANG; return toast(L('หยุดคิวก่อนแล้วค่อยเปลี่ยนภาษา', 'Stop the queue before changing language')); }
          settings.lang = e.target.value; saveSettings(); location.reload();
        } }, [['en', 'English'], ['th', 'ไทย']].map(([v, l]) => h('option', { value: v, selected: LANG === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('ความทึบของแผง', 'Panel opacity')), glassVal),
        h('input', { type: 'range', min: 40, max: 100, step: 2, value: settings.glass, className: 'rng',
          oninput: (e) => { settings.glass = +e.target.value; applyGlass(); },
          onchange: () => saveSettings() })
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('ชื่อโปรดิวเซอร์ {producer}', 'Producer name {producer}')), h('small', {}, L('ใช้ในชื่อคลิป/คำอธิบาย/แท็ก เช่น "Prod. by {producer}" · เว้นว่าง = ใช้ชื่อช่องปัจจุบัน', 'Used in video title/description/tags, e.g. "Prod. by {producer}" · blank = current channel name'))),
        (producerIn = h('input', { type: 'text', value: settings.producer, placeholder: getChannel().name || L('ชื่อช่อง', 'Channel name'),
          oninput: (e) => { settings.producer = e.target.value.trim(); saveSettings(); refreshLabels(); } }))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('หมวดหมู่', 'Category')), h('small', {}, L('ข้อความตามที่ Studio แสดง เช่น Music หรือ เพลง · เว้นว่าง = ไม่ตั้ง', 'Text as Studio shows it, e.g. Music or เพลง · blank = don\'t set'))),
        h('input', { type: 'text', value: settings.category, oninput: (e) => { settings.category = e.target.value.trim(); saveSettings(); } })
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, 'Paid promotion'), h('small', {}, L('คลิปมีการโปรโมตแบบชำระเงินไหม', 'Does the video include paid promotion?'))),
        h('select', { onchange: (e) => { settings.paidPromotion = e.target.value; saveSettings(); } },
          [['no', L('ไม่มี', 'No')], ['yes', L('มี', 'Yes')], ['skip', L('ไม่ตอบ', 'Don\'t answer')]].map(([v, l]) => h('option', { value: v, selected: settings.paidPromotion === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('ขั้น Monetisation', 'Monetisation step')), h('small', {}, L('เปิด/ปิดโฆษณาให้คลิปใหม่', 'Turn ads on/off for new videos'))),
        h('select', { onchange: (e) => { settings.monetization = e.target.value; saveSettings(); } },
          [['on', L('เปิดโฆษณา (On)', 'Ads on (On)')], ['off', L('ปิดโฆษณา (Off)', 'Ads off (Off)')], ['skip', L('ทำเอง', 'Manual')]].map(([v, l]) => h('option', { value: v, selected: settings.monetization === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('ขั้น Ad suitability', 'Ad suitability step')), h('small', {}, L('ติ๊ก "None of the above" = ยืนยันว่าคลิปไม่มีเนื้อหาในหมวดเหล่านั้น แล้วกด Submit rating (ส่งแล้วแก้ไม่ได้)', 'Tick "None of the above" = confirm the video has none of that content, then press Submit rating (can\'t be changed after submitting)'))),
        h('select', { onchange: (e) => { settings.adSuitability = e.target.value; saveSettings(); } },
          [['none', 'None of the above'], ['skip', L('ทำเอง', 'Manual')]].map(([v, l]) => h('option', { value: v, selected: settings.adSuitability === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('AI use (เนื้อหาดัดแปลง/สังเคราะห์)', 'AI use (altered/synthetic content)')), h('small', {}, L('คำถาม "Was AI used to generate or edit your content…"', 'The "Was AI used to generate or edit your content…" question'))),
        h('select', { onchange: (e) => { settings.alteredContent = e.target.value; saveSettings(); } },
          [['skip', L('ไม่ตอบ', 'Don\'t answer')], ['no', L('ไม่ใช่', 'No')], ['yes', L('ใช่', 'Yes')]].map(([v, l]) => h('option', { value: v, selected: settings.alteredContent === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('ปีที่ใช้ใน {year}', 'Year used in {year}')), h('small', {}, L('เว้นว่าง = ปีปัจจุบันอัตโนมัติ', 'Blank = current year automatically'))),
        h('input', {
          type: 'number', min: 2000, max: 2100, placeholder: String(new Date().getFullYear()), value: settings.year,
          oninput: (e) => { settings.year = e.target.value.trim(); saveSettings(); refreshLabels(); },
        })
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('รอใส่ภาพปกนานสุด', 'Max thumbnail wait')), h('small', {}, L('นาที · ภาพปกใส่ได้หลังวิดีโออัปขึ้นไปแล้ว ไฟล์ใหญ่ตั้งเผื่อไว้', 'Minutes · thumbnail can be set only after the video has uploaded; allow extra for large files'))),
        h('input', { type: 'number', min: 1, max: 600, value: settings.thumbWaitMin, onchange: (e) => { settings.thumbWaitMin = Math.max(1, Number(e.target.value) || 120); saveSettings(); } })
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('จังหวะการทำงาน', 'Pace')), h('small', {}, L('หน้าเว็บโหลดช้า / เน็ตช้า ให้เลือก "ช้า" หรือ "ช้ามาก" สคริปต์จะพักและรอแต่ละขั้นนานขึ้น', 'If the page or connection is slow, choose "Slow" or "Very slow" — the script will pause and wait longer at each step'))),
        h('select', { onchange: (e) => { settings.pace = e.target.value; saveSettings(); toast(L(`จังหวะการทำงาน: ${e.target.selectedOptions[0].textContent}`, `Pace: ${e.target.selectedOptions[0].textContent}`)); } },
          [['normal', L('ปกติ (x1)', 'Normal (x1)')], ['slow', L('ช้า (x1.6)', 'Slow (x1.6)')], ['slower', L('ช้ามาก (x2.5)', 'Very slow (x2.5)')]].map(([v, l]) => h('option', { value: v, selected: (settings.pace || 'normal') === v }, l)))
      ),
      h('div', { className: 'kv' },
        h('div', {}, h('b', {}, L('พักระหว่างไฟล์', 'Pause between files')), h('small', {}, L('หน่วยวินาที', 'Seconds'))),
        h('input', { type: 'number', min: 0, max: 120, value: settings.delay, onchange: (e) => { settings.delay = Math.max(0, Number(e.target.value) || 0); saveSettings(); } })
      )
    ),
    sec(L('สำรอง / แชร์การตั้งค่า', 'Back up / share settings'), 'copy',
      h('div', { className: 'hint' }, icon('file', 13),
        h('span', {}, L('ส่งออกพรีเซ็ต การตั้งค่า และการตั้งค่าแท็บลิขสิทธิ์เป็นไฟล์ .json ไว้สำรองหรือส่งให้เพื่อนนำเข้า (ไม่รวมช่องที่ล็อกไว้และประวัติอัปโหลด)', 'Export presets, settings and copyright tab settings to a .json file as a backup or to share with a friend (excludes the locked channel and upload history)'))),
      h('div', { style: 'display:flex;gap:8px;margin-top:10px' },
        backupIn,
        h('button', { className: 'btn sm', onclick: exportBackup }, icon('download', 13), L('ส่งออก (.json)', 'Export (.json)')),
        h('button', { className: 'btn sm', onclick: () => backupIn.click() }, icon('upload', 13), L('นำเข้า', 'Import')))
    ),
    h('div', { className: 'sec' },
      h('div', { className: 'hint' }, icon('sliders', 13),
        h('span', {}, h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, 'P'), L(' เปิด/ปิดแผง · ', ' toggle panel · '), h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, '1…9'), L(' เลือกพรีเซ็ตหลัก', ' select default preset'))),
      h('div', { className: 'hint', style: 'margin-top:8px' }, icon('alert', 13),
        h('span', {}, L('ระหว่างที่คิวทำงาน อย่าปิดหรือรีเฟรชแท็บนี้ · YouTube จำกัดจำนวนอัปโหลดต่อวัน ถ้าชนลิมิตคิวจะหยุดเอง', 'While the queue is running, don\'t close or refresh this tab · YouTube limits uploads per day; if you hit the limit the queue stops automatically')))
    )
  );

  function refreshLabels() {
    const p = active();
    fabLabel.textContent = p.label;
    defaultPresetSel.replaceChildren(...presetOptions(activeId));
    queue.forEach((it) => it.ui && it.ui.presetSel.replaceChildren(...presetOptions(it.presetId)));
    if (currentTab === 'presets') {
      renderPresetList();
      renderPresetPreview();
    }
    assignNumbers();
    queue.forEach(updateItemUI);
  }

  // =====================================================================
  // ===== ลิขสิทธิ์ (ย้ายมาจาก YT Studio Helper THAIBEATS v2.2.1) =====
  // สแกน claim ผ่าน API ภายในของ Studio (อ่านอย่างเดียว) → ตัดด้วย "Trim out segment" ของ YouTube
  // ข้อมูลเก็บแยกตามช่อง (key:channelId) เพื่อไม่ให้รายการของแต่ละช่องปนกัน
  // =====================================================================
  Claims = (() => {
    const DEFAULTS = {
      autoSaveTrim: true, // ตอนสคริปต์ตัดเอง: กด Save → ติ๊ก "I acknowledge" → Confirm changes
      autoSaveManualTrim: false, // ตอนเปิดหน้าตัดเองด้วยมือ: ให้สคริปต์กด Save ให้ (ปิดไว้ จะได้ปรับเวลาก่อนได้)
      followUpMinutes: '10',
      ownNames: '',
      apEveryHours: '6',
      apSkipOwn: true,
      apOnlyImpact: true,
      apMaxPct: '25',
      apMaxPerCycle: '10',
      apAdsOn: false,
    };
    const cfg = () => Object.assign({}, DEFAULTS, load('cfg', {}));
    const saveCfg = (c) => save('cfg', c);

    const visible = (el) => !!el && (el.offsetParent !== null ||
      (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'));
    const findText = (re, sel = SEL.clickable, rootEl = document) =>
      [...rootEl.querySelectorAll(sel)].filter((el) => visible(el) && re.test(el.innerText.trim()));
    const isDisabled = (el) =>
      el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' ||
      !!el.closest('[disabled],[aria-disabled="true"]');

    // ข้อความปุ่มต่าง ๆ ด้านล่างเป็นภาษาอังกฤษ → ต้องตั้งภาษา Studio เป็น English
    const studioIsEnglish = () => /^en/i.test(document.documentElement.lang || 'en');


    /* ---------- Studio internal API ---------- */
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const ycfg = (k) => W.ytcfg && W.ytcfg.get(k);
    function currentChannel() {
      const m = location.pathname.match(/\/channel\/(UC[\w-]{22})/);
      return ycfg('CHANNEL_ID') || (m && m[1]) || 'unknown';
    }
    const channelName = () => chanLabel(getChannel()) || currentChannel();
    const chGet = (name, def, ch = currentChannel()) => load(name + ':' + ch, def);
    const chSet = (name, val, ch = currentChannel()) => { invalidateCounts(); return save(name + ':' + ch, val); };

    /* ---------- ตัวเลขที่เอาไปโชว์ (claimScan / songHistory เป็นก้อนใหญ่ อ่านทุก tick ไม่ไหว) ---------- */
    // tick วิ่งทุก 0.8 วินาที -> อ่าน storage ใหม่เมื่อหมดอายุ หรือเมื่อมีการเขียนทับ (chSet / setSongs)
    const COUNTS_TTL = 3000;
    let countsAt = 0;
    let countsCache = null;
    function invalidateCounts() { countsAt = 0; }
    function getCounts() {
      if (countsCache && Date.now() - countsAt < COUNTS_TTL) return countsCache;
      const scan = chGet('claimScan', null);
      const adsScan = chGet('adsScan', null);
      const adsResults = chGet('adsResults', {});
      countsCache = {
        hasScan: !!scan,
        scanDate: scan ? scan.date : '',
        claims: scan ? scan.rows.length : 0,
        claimVideos: scan ? new Set(scan.rows.map((r) => r.videoId)).size : 0,
        songs: Object.keys(getSongs()).length,
        hasAdsScan: !!adsScan,
        adsTodo: adsScan ? adsScan.rows.filter((r) => !(adsResults[r.videoId] || {}).state).length : 0,
      };
      countsAt = Date.now();
      return countsCache;
    }

    async function authHeader() {
      const m = document.cookie.match(/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
      if (!m) throw new Error(L('ไม่ได้ล็อกอิน (ไม่พบคุกกี้ SAPISID)', 'Not signed in (SAPISID cookie not found)'));
      const ts = Math.floor(Date.now() / 1000);
      const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${m[1]} https://studio.youtube.com`));
      return `SAPISIDHASH ${ts}_${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    }

    async function yti(path, body) {
      const ctx = JSON.parse(JSON.stringify(ycfg('INNERTUBE_CONTEXT')));
      const dc = ycfg('DELEGATION_CONTEXT');
      const pageId = ycfg('DELEGATED_SESSION_ID');
      ctx.user = Object.assign({}, ctx.user, dc ? { delegationContext: dc } : {}, pageId ? { onBehalfOfUser: pageId } : {});
      const headers = {
        'Content-Type': 'application/json',
        Authorization: await authHeader(),
        'X-Origin': 'https://studio.youtube.com',
        'X-Goog-AuthUser': String(ycfg('SESSION_INDEX') || 0),
        'X-Youtube-Client-Name': String(ycfg('INNERTUBE_CONTEXT_CLIENT_NAME')),
        'X-Youtube-Client-Version': ycfg('INNERTUBE_CONTEXT_CLIENT_VERSION'),
      };
      if (pageId) headers['X-Goog-PageId'] = pageId;
      const res = await W.fetch(`/youtubei/v1/${path}?alt=json`, {
        method: 'POST', credentials: 'include', headers, body: JSON.stringify(Object.assign({ context: ctx }, body)),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(`${path}: ${res.status} ${(j.error && j.error.message) || ''}`);
      return j;
    }

    const fmt = (sec) => {
      sec = Math.round(sec);
      const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
      return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0');
    };
    const short = (e) => String(e || '').replace(/^.*?(IMPACT|STATUS|OPTION)_/, '').replace(/_/g, ' ').toLowerCase();
    const privacyOf = (p) => String(p || '').replace(/^VIDEO_PRIVACY_/, '').replace(/_/g, ' ').toLowerCase(); // VIDEO_PRIVACY_PUBLIC → public

    // ข้อมูลเพลงจาก claim มีหลายรูปแบบ (soundRecording, composition, web, …) → ไล่หา title / artists / label
    function claimInfo(c) {
      const md = (c && c.asset && c.asset.metadata) || {};
      const found = { title: '', artists: [], label: '' };
      (function walk(o, d) {
        if (!o || typeof o !== 'object' || d > 5) return;
        for (const [k, v] of Object.entries(o)) {
          if (!found.title && /^(title|assetTitle)$/.test(k) && typeof v === 'string' && v.trim()) found.title = v.trim();
          else if (/^(artists|writers|performers)$/.test(k) && Array.isArray(v) && !found.artists.length) found.artists = v.map((x) => (typeof x === 'string' ? x : (x && (x.name || x.displayName)) || '')).filter(Boolean);
          else if (!found.label && /^(recordLabel|label|publisher)$/.test(k) && typeof v === 'string') found.label = v;
          else if (v && typeof v === 'object') walk(v, d + 1);
        }
      })(md, 0);
      return found;
    }

    /* ---------- สแกน claim (อ่านอย่างเดียว) ---------- */
    let scanning = false;
    let scanProg = null;
    async function listVideos(mask, label) {
      const CH = currentChannel();
      const vids = [];
      let tok, pages = 0;
      do {
        const body = {
          filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
          order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50, mask,
        };
        if (tok) body.pageToken = tok;
        const j = await yti('creator/list_creator_videos', body);
        vids.push(...(j.videos || []));
        tok = j.nextPageToken;
        pages++;
        scanProg = { label: L(`${label} อ่านแล้ว ${vids.length} คลิป`, `${label}: read ${vids.length} videos`), done: 0, total: 0 };
        renderStatus();
        await sleep(300);
      } while (tok && pages < 400);
      return vids;
    }

    // คลิปที่ตั้งเวลาเผยแพร่ไว้แล้วในช่องนี้ (อ่านอย่างเดียว) -> [{ videoId, title, at }] เรียงตามเวลา
    // ตรวจกับ Studio จริง (ต.ค. 2026): scheduledPublishingDetails.scheduledPublishings[] = { scheduledTimeSeconds, action, status }
    // ดู 200 คลิปล่าสุดพอ: คลิปที่รอปล่อยเป็นของที่เพิ่งอัปทั้งนั้น
    async function listScheduled() {
      if (!ycfg('INNERTUBE_CONTEXT')) return null;
      const CH = currentChannel();
      const out = [];
      let tok, pages = 0;
      do {
        const body = {
          filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
          order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50,
          mask: { videoId: true, title: true, scheduledPublishingDetails: { all: true } },
        };
        if (tok) body.pageToken = tok;
        const j = await yti('creator/list_creator_videos', body);
        for (const v of j.videos || []) {
          for (const sp of (v.scheduledPublishingDetails || {}).scheduledPublishings || []) {
            const at = (+sp.scheduledTimeSeconds || 0) * 1000;
            if (/SCHEDULED$/.test(sp.status || '') && at > Date.now()) out.push({ videoId: v.videoId, title: v.title || '', at });
          }
        }
        tok = j.nextPageToken;
        pages++;
      } while (tok && pages < 4);
      return out.sort((a, b) => a.at - b.at);
    }

    // คลิปยอดวิวสูงสุด 10 คลิปใน 6 เดือนล่าสุด (อ่านอย่างเดียว) -> [{ videoId, title, views, at }] · null = Studio ยังโหลดไม่เสร็จ
    // ตรวจกับ Studio จริง (ต.ค. 2026): metrics.viewCount, timePublishedSeconds, privacy = VIDEO_PRIVACY_PUBLIC
    // อ่านใหม่ไปเก่าแล้วหยุดเมื่อเลย 6 เดือน (คลิปร่าง/ตั้งเวลาไม่มีเวลาเผยแพร่ ข้ามไป ไม่ใช่จุดหยุด)
    async function listTopVideos() {
      if (!ycfg('INNERTUBE_CONTEXT')) return null;
      const CH = currentChannel();
      const vids = [];
      let tok, pages = 0;
      do {
        const body = {
          filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
          order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50,
          mask: { videoId: true, title: true, privacy: true, timePublishedSeconds: true, metrics: { all: true } },
        };
        if (tok) body.pageToken = tok;
        const j = await yti('creator/list_creator_videos', body);
        const got = j.videos || [];
        vids.push(...got);
        tok = j.nextPageToken;
        pages++;
        const lastAt = (+((got[got.length - 1] || {}).timePublishedSeconds) || 0) * 1000;
        if (lastAt && Date.now() - lastAt > SIX_MONTHS) break;
      } while (tok && pages < 10);
      return pickTopVideos(vids);
    }

    // ชื่อ คำอธิบาย และแท็กของคลิปเดียว (อ่านอย่างเดียว) — ใช้เรียนรู้รูปแบบ
    async function videoText(videoId) {
      const j = await yti('creator/get_creator_videos', {
        failOnError: true, videoIds: [videoId],
        mask: { videoId: true, title: true, description: true, tags: { all: true }, timePublishedSeconds: true },
      });
      const v = (j.videos || [])[0];
      if (!v) throw new Error(L('ไม่พบคลิปนี้ในช่อง', 'This video wasn\'t found on the channel'));
      const tags = Array.isArray(v.tags) ? v.tags : (v.tags && v.tags.tags) || [];
      const at = (+v.timePublishedSeconds || 0) * 1000;
      return { title: v.title || '', description: v.description || '', tags, publishedYear: at ? String(new Date(at).getFullYear()) : '' };
    }

    async function scanClaims({ show = true } = {}) {
      if (scanning) return null;
      if (!ycfg('INNERTUBE_CONTEXT')) { log(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'Studio hasn\'t finished loading — try again in a few seconds'), 'warn'); return null; }
      scanning = true;
      scanProg = { label: L('กำลังอ่านรายการวิดีโอ…', 'Reading video list…'), done: 0, total: 0 };
      const CH = currentChannel();
      const chName = channelName();
      const own = cfg().ownNames.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      try {
        log(L('สแกน: กำลังอ่านรายการวิดีโอ…', 'Scan: reading video list…'));
        const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true, copyrightSummary: { all: true }, allRestrictions: { all: true } }, L('กำลังอ่านรายการวิดีโอ…', 'Reading video list…'));
        const claimed = vids.filter((v) =>
          +((v.copyrightSummary || {}).activeThirdPartyClaimsCount || 0) > 0 ||
          ((v.allRestrictions || {}).restrictions || []).some((r) => r.reason === 'VIDEO_RESTRICTION_REASON_COPYRIGHT'));
        log(L(`สแกน: ${claimed.length} จาก ${vids.length} คลิปมี claim — กำลังอ่านรายละเอียด…`, `Scan: ${claimed.length} of ${vids.length} videos have a claim — reading details…`));

        const rows = [];
        for (let i = 0; i < claimed.length; i++) {
          const v = claimed[i];
          const impacts = (((v.allRestrictions || {}).summary || {}).impacts || []).map(short)
            .map((x) => x.replace(/^(monetization|visibility|video) /, '')).join(', ');
          let j;
          try {
            j = await yti('creator/list_creator_received_claims', { videoId: v.videoId, criticalRead: false, includeLicensingOptions: false, isCreatorMusicV2: true });
          } catch (e) { log(`${v.title}: ${e.message}`, 'err'); continue; }
          const owners = {};
          (j.contentOwners || []).forEach((o) => { owners[o.contentOwnerId] = o.displayName; });
          const up = uploadOf(v.videoId);

          for (const c of j.receivedClaims || []) {
            const rec = claimInfo(c);
            const claimant = (c.contentOwnerIds || []).map((id) => owners[id] || id).join(', ');
            const artists = rec.artists.join(', ');
            let segs = [];
            try {
              const m = await yti('copyright/get_creator_received_claim_matches', { videoId: v.videoId, channelId: CH, claimId: c.claimId });
              segs = (((m.matches || {}).claimMatches) || []).map((x) => x.videoSegment).filter(Boolean)
                .map((sg) => [(+sg.startMillis || 0) / 1000, (+sg.endMillis || 0) / 1000]);
            } catch (e) { log(L(`${v.title}: ช่วงเวลา — ${e.message}`, `${v.title}: time ranges — ${e.message}`), 'warn'); }
            if (!segs.length && c.matchDetails) {
              const st = +c.matchDetails.longestMatchStartTimeSeconds || 0;
              segs = [[st, st + (+c.matchDetails.longestMatchDurationSeconds || 0)]];
            }
            const opts = ((c.nontakedownClaimActions || {}).options || []).map(short);
            // แก้บัคเดิม: เดิมอ่าน rec.recordLabel ซึ่งไม่มีอยู่จริง ทำให้ label ว่างตลอด
            const hay = (artists + ' ' + claimant + ' ' + rec.label).toLowerCase();
            rows.push({
              videoId: v.videoId, video: v.title, privacy: privacyOf(v.privacy), length: +v.lengthSeconds || 0,
              claimId: c.claimId, song: rec.title || '(ไม่ทราบชื่อ)', artists, label: rec.label, claimant,
              type: short(c.type), status: short(c.status), impact: impacts, segments: segs,
              claimedSec: segs.reduce((a, sg) => a + (sg[1] - sg[0]), 0),
              canTrim: opts.includes('trim'), options: opts.join(', '),
              own: own.some((n) => hay.includes(n)), hasImpact: !!impacts,
              publishAt: up && up.publishAt ? up.publishAt : 0,
            });
            await sleep(250);
          }
          scanProg = { label: L(`อ่านรายละเอียด claim ${i + 1} / ${claimed.length}: ${v.title}`, `Reading claim details ${i + 1} / ${claimed.length}: ${v.title}`), done: i + 1, total: claimed.length };
          renderStatus();
          await sleep(300);
        }

        chSet('claimScan', { date: new Date().toISOString(), total: vids.length, rows, channel: CH, channelName: chName }, CH);
        recordSongs(rows, chName);
        log(L(`สแกนเสร็จ ✓ ${chName}: ${rows.length} claim ใน ${claimed.length} คลิป`, `Scan complete ✓ ${chName}: ${rows.length} claims in ${claimed.length} videos`), 'ok');
        flash(L('สแกนเสร็จแล้ว', 'Scan complete'), L(`${rows.length} claim ใน ${claimed.length} จาก ${vids.length} คลิป`, `${rows.length} claims in ${claimed.length} of ${vids.length} videos`));
        if (show) showClaims();
        return rows;
      } catch (e) {
        log(L('สแกนไม่สำเร็จ: ', 'Scan failed: ') + e.message, 'err');
        return null;
      } finally {
        scanning = false;
        scanProg = null;
        renderStatus();
      }
    }

    function claimsCSV() {
      const scan = chGet('claimScan', null);
      if (!scan) return log(L('ยังไม่ได้สแกน', 'Not scanned yet'), 'warn');
      const head = ['video', 'video_url', 'privacy', 'video_length', 'song', 'artists', 'label', 'claimant', 'own_music',
        'type', 'status', 'impact', 'claimed_segments', 'claimed_total', 'can_trim', 'options', 'claim_id'];
      const lines = scan.rows.map((r) => [r.video, `https://studio.youtube.com/video/${r.videoId}/claims`, r.privacy, fmt(r.length),
        r.song, r.artists, r.label, r.claimant, r.own ? 'yes' : 'no', r.type, r.status, r.impact,
        r.segments.map((sg) => fmt(sg[0]) + '-' + fmt(sg[1])).join(' ; '), fmt(r.claimedSec), r.canTrim ? 'yes' : 'no', r.options, r.claimId]);
      downloadCSV([head, ...lines], `youtube-claims-${scan.date.slice(0, 10)}.csv`);
    }

    /* ---------- modal ---------- */
    function openModal(...kids) {
      root.querySelector('#tbx-modal')?.remove();
      const box = h('div', { className: 'box' }, ...kids);
      const modal = h('div', { id: 'tbx-modal', onclick: (e) => { if (e.target === modal) modal.remove(); } }, box);
      root.append(modal);
      return { modal, box, close: () => modal.remove() };
    }
    const closeModal = () => root.querySelector('#tbx-modal')?.remove();

    function showClaims() {
      const scan = chGet('claimScan', null);
      if (!scan) return log(L(`ยังไม่ได้สแกนช่อง ${channelName()} — กด "สแกน claim" ก่อน`, `Channel ${channelName()} not scanned yet — press "Scan claims" first`), 'warn');
      const picked = new Set(chGet('trimQueue', []));
      const results = chGet('trimResults', {});
      const rows = scan.rows;
      const videos = new Set(rows.map((r) => r.videoId)).size;
      const ownCount = rows.filter((r) => r.own).length;
      const cbs = [];

      const trimBtnM = h('button', { className: 'btn go sm', onclick: () => openTrimConfirm() });
      const refreshCount = () => {
        trimBtnM.textContent = L(`✂ ตัดที่เลือก (${picked.size})`, `✂ Trim selected (${picked.size})`);
        trimBtnM.disabled = !picked.size;
      };
      const setPicked = (key, on) => { on ? picked.add(key) : picked.delete(key); chSet('trimQueue', [...picked]); refreshCount(); };
      const stateBadge = (res) => res && h('div', { className: { saved: 'tbx-ok', gone: 'tbx-ok', failed: 'tbx-err', skipped: 'tbx-warn', later: 'tbx-warn' }[res.state] || '' },
        `${TRIM_LABEL[res.state] || res.state}${res.msg ? ' — ' + res.msg : ''}`);

      const seenVideo = new Set();
      const table = h('table', { className: 'tbx-table' },
        h('thead', {}, h('tr', {}, [L('ตัด', 'Trim'), L('วิดีโอ', 'Video'), L('เพลงที่โดน claim', 'Claimed song'), L('ผู้ claim', 'Claimant'), L('ช่วงที่โดน', 'Claimed range'), L('ผลกระทบ / ผล', 'Impact / Result')].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => {
          const key = r.videoId + ':' + r.claimId;
          const res = results[key];
          const doneAlready = res && (res.state === 'saved' || res.state === 'gone');
          if (doneAlready) picked.delete(key);
          const cb = h('input', {
            type: 'checkbox', checked: picked.has(key) && !doneAlready, disabled: !r.canTrim || doneAlready,
            title: doneAlready ? L('จัดการแล้ว', 'Already handled') : r.canTrim ? L('เพิ่มในรายการตัด', 'Add to trim list') : L('YouTube ไม่มีตัวเลือก Trim สำหรับ claim นี้', 'YouTube offers no Trim option for this claim'),
            onchange: (e) => setPicked(key, e.target.checked),
          });
          cb._row = r; cb._key = key;
          cbs.push(cb);
          const pct = r.length ? Math.round((r.claimedSec / r.length) * 100) : 0;
          const firstOfVideo = !seenVideo.has(r.videoId);
          seenVideo.add(r.videoId);
          const soon = r.publishAt && r.publishAt > Date.now();
          return h('tr', { className: r.own ? 'own' : '' },
            h('td', {}, cb),
            h('td', {},
              h('a', { href: `/video/${r.videoId}/claims`, target: '_blank' }, r.video),
              h('div', { className: 'mut' }, `${r.privacy} · ${fmt(r.length)}`),
              soon && h('div', { className: 'tbx-warn' }, L(`⏰ ตั้งเวลาปล่อย ${fmtWhen(r.publishAt)}`, `⏰ Scheduled ${fmtWhen(r.publishAt)}`)),
              firstOfVideo && h('button', { className: 'btn sm', style: 'margin-top:4px', onclick: () => showTracklistFix(r.videoId) }, L('📝 tracklist หลังตัด', '📝 Tracklist after trim'))),
            h('td', {}, r.song, h('div', { className: 'mut' }, [r.artists, r.label].filter(Boolean).join(' · '))),
            h('td', {}, r.claimant, r.own && h('div', { className: 'tbx-warn' }, L('★ เพลงของคุณเอง', '★ Your own song'))),
            h('td', {}, r.segments.map((sg) => fmt(sg[0]) + '–' + fmt(sg[1])).join(', ') || '?',
              h('div', { className: pct >= 50 ? 'tbx-err' : 'mut' }, L(`${fmt(r.claimedSec)} (${pct}% ของคลิป)`, `${fmt(r.claimedSec)} (${pct}% of video)`))),
            h('td', {}, r.impact || L('ไม่มีผลกระทบ', 'No impact'), r.canTrim ? null : h('div', { className: 'mut' }, L('ไม่มีตัวเลือก Trim', 'No Trim option')), stateBadge(res)));
        })));
      chSet('trimQueue', [...picked]);
      const selectWhere = (fn) => { cbs.forEach((cb) => { if (!cb.disabled) { cb.checked = fn(cb._row); setPicked(cb._key, cb.checked); } }); };
      refreshCount();

      const m = openModal(
        h('h3', {}, L(`Claim ลิขสิทธิ์ — ${scan.channelName || channelName()}`, `Copyright claims — ${scan.channelName || channelName()}`)),
        h('div', { className: 'mut', style: 'margin-bottom:10px' },
          L(`${rows.length} claim ใน ${videos} คลิป (จากทั้งหมด ${scan.total}) · สแกนเมื่อ ${new Date(scan.date).toLocaleString(LOCALE)}`, `${rows.length} claims in ${videos} videos (of ${scan.total} total) · scanned ${new Date(scan.date).toLocaleString(LOCALE)}`) +
          (ownCount ? L(` · ${ownCount} รายการดูเหมือนเป็นเพลงของคุณเอง (★) — ให้ค่ายเพลง/ดิสทริบิวเตอร์ allowlist ช่องแทนการตัด`, ` · ${ownCount} look like your own songs (★) — have your label/distributor allowlist the channel instead of trimming`) : '')),
        h('div', { className: 'chips', style: 'margin-bottom:10px' },
          h('span', { className: 'mut' }, L('เลือก:', 'Select:')),
          h('button', { className: 'chip', onclick: () => selectWhere(() => true) }, L('ทุกอันที่ตัดได้', 'All trimmable')),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => !r.own) }, L('ไม่ใช่เพลงของตัวเอง', 'Not my own songs')),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => r.hasImpact) }, L('กระทบวิดีโอ (รายได้/จำกัด/บล็อก)', 'Affects video (revenue/restricted/blocked)')),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => r.hasImpact && r.publishAt > Date.now()) }, L('⏰ ตั้งเวลาไว้ + กระทบ', '⏰ Scheduled + affected')),
          h('button', { className: 'chip', onclick: () => selectWhere((r) => r.length && r.claimedSec / r.length < 0.2) }, L('ช่วงที่โดน < 20%', 'Claimed range < 20%')),
          h('button', { className: 'chip', onclick: () => selectWhere(() => false) }, L('ไม่เลือก', 'None'))),
        rows.length ? h('div', { className: 'tbx-scroll' }, table) : h('div', { className: 'tbx-ok' }, L('ไม่พบ claim 🎉', 'No claims found 🎉')),
        h('div', { className: 'row', style: 'margin-top:14px' },
          h('span', { className: 'mut', style: 'flex:1' }, L('ติ๊กเลือกแค่สร้างรายการ ยังไม่มีอะไรเปลี่ยนบน YouTube จนกว่าจะกดเริ่มตัด', 'Ticking only builds a list — nothing changes on YouTube until you start trimming')),
          h('button', { className: 'btn sm', onclick: claimsCSV }, '⬇ CSV'),
          h('button', { className: 'btn sm', onclick: () => { closeModal(); scanClaims(); } }, L('↻ สแกนใหม่', '↻ Rescan')),
          h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ปิด', 'Close')),
          trimBtnM));
      m.box.style.width = 'min(1100px,95vw)';
    }

    /* ---------- tracklist หลังตัด: ลบเพลงที่ถูกตัด + เลื่อน timestamp ---------- */
    const parseTime = (t) => t.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
    function fixTracklist(text, segments, videoLength) {
      const segs = [];
      for (const [a, b] of segments.map(([a, b]) => [Math.max(0, a), Math.max(a, b)]).sort((x, y) => x[0] - y[0])) {
        const last = segs[segs.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else segs.push([a, b]);
      }
      const removedBefore = (t) => segs.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(t, b) - a), 0);
      const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
      const tracks = [];
      lines.forEach((line, idx) => {
        const m = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(\s*[-–|]?\s*)(.*)$/);
        if (m) tracks.push({ idx, start: parseTime(m[1]), sep: m[2], rest: m[3] });
      });
      tracks.forEach((t, i) => { t.end = i + 1 < tracks.length ? tracks[i + 1].start : (videoLength || t.start); });
      const total = Math.max(0, (videoLength || 0) - removedBefore(videoLength || 0));
      const longFmt = total >= 3600 || tracks.some((t) => t.start >= 3600);
      const tf = (sec) => {
        sec = Math.max(0, Math.round(sec));
        const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
        return longFmt ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };
      const removed = [];
      const out = lines.slice();
      let firstKept = true;
      for (const t of tracks) {
        const dur = Math.max(0, t.end - t.start);
        const cut = removedBefore(t.end) - removedBefore(t.start);
        if (dur > 0 ? cut / dur >= 0.5 : false) {
          removed.push(t.rest);
          out[t.idx] = null;
          continue;
        }
        let ns = t.start - removedBefore(t.start);
        if (firstKept) { ns = 0; firstKept = false; } // chapters ต้องเริ่มที่ 00:00
        out[t.idx] = tf(ns) + (t.sep || ' ') + t.rest;
      }
      return { text: out.filter((l) => l !== null).join('\n'), removed, kept: tracks.length - removed.length };
    }

    function showTracklistFix(videoId) {
      const scan = chGet('claimScan', null);
      if (!videoId) {
        // ยังไม่ได้เลือกคลิป: ให้เลือกจากคลิปที่สแกนเจอ claim
        const vids = [...new Map(((scan && scan.rows) || []).map((r) => [r.videoId, r])).values()];
        if (!vids.length) return toast(L('ยังไม่มีคลิปที่โดน claim — กด "สแกน claim" ก่อน', 'No claimed videos yet — press "Scan claims" first'));
        openModal(
          h('h3', {}, L('📝 เลือกคลิปที่จะแก้ tracklist', '📝 Choose a video to fix its tracklist')),
          h('div', { className: 'plist', style: 'margin-top:10px' }, vids.map((r) => h('div', { className: 'pitem', onclick: () => showTracklistFix(r.videoId) },
            h('div', { className: 'pl' }, h('b', {}, r.video), h('span', {}, L(`${fmt(r.length)} · ${uploadOf(r.videoId) ? 'มี tracklist จากประวัติการอัป' : 'ต้องวาง tracklist เอง'}`, `${fmt(r.length)} · ${uploadOf(r.videoId) ? 'Tracklist from upload history' : 'Paste tracklist manually'}`)))))),
          h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' }, h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ปิด', 'Close'))));
        return;
      }
      const rows = ((scan && scan.rows) || []).filter((r) => r.videoId === videoId);
      const results = chGet('trimResults', {});
      const up = uploadOf(videoId);
      const length = (rows[0] && rows[0].length) || 0;
      const src = h('textarea', { value: (up && (up.txt || '')) || '', placeholder: L('วาง tracklist เดิม (00:00 ศิลปิน - เพลง) หรือลากไฟล์ .txt มาวาง', 'Paste the original tracklist (00:00 Artist - Song) or drop a .txt file here') });
      src.addEventListener('dragover', (e) => e.preventDefault());
      src.addEventListener('drop', async (e) => {
        const f = [...(e.dataTransfer?.files || [])].find(isTxt);
        if (!f) return;
        e.preventDefault();
        src.value = await readText(f);
        update();
      });
      const outBox = h('textarea', { readOnly: true });
      const info = h('div', { className: 'mut' });
      const segChecks = rows.flatMap((r) => r.segments.map((sg) => {
        const res = results[r.videoId + ':' + r.claimId];
        const cb = h('input', { type: 'checkbox', checked: !!(res && res.state === 'saved'), onchange: () => update() });
        cb._seg = sg;
        return h('label', { className: 'tbx-cb' }, cb, `${fmt(sg[0])}–${fmt(sg[1])} · ${r.song}`, res && res.state === 'saved' ? h('span', { className: 'tbx-ok' }, L(' (ตัดแล้ว)', ' (trimmed)')) : null);
      }));
      function update() {
        const segs = [...m.box.querySelectorAll('.tbx-cb input')].filter((c) => c.checked).map((c) => c._seg);
        const r = fixTracklist(src.value, segs, length);
        outBox.value = r.text;
        info.textContent = segs.length
          ? L(`ตัด ${segs.length} ช่วง · ลบ ${r.removed.length} เพลง${r.removed.length ? ': ' + r.removed.join(', ') : ''} · เหลือ ${r.kept} เพลง`, `Trim ${segs.length} ranges · remove ${r.removed.length} songs${r.removed.length ? ': ' + r.removed.join(', ') : ''} · ${r.kept} songs left`)
          : L('ติ๊กช่วงที่ถูกตัด (หรือจะตัด) เพื่อดูผล', 'Tick the trimmed (or to-be-trimmed) ranges to see the result');
      }
      src.addEventListener('input', update);
      const m = openModal(
        h('h3', {}, L('📝 tracklist หลังตัดลิขสิทธิ์', '📝 Tracklist after copyright trim')),
        h('div', { className: 'mut', style: 'margin-bottom:8px' }, L(`${(rows[0] && rows[0].video) || videoId} · ความยาวเดิม ${fmt(length)}`, `${(rows[0] && rows[0].video) || videoId} · original length ${fmt(length)}`) + (up ? L(' · ดึง tracklist จากประวัติการอัปโหลด', ' · tracklist pulled from upload history') : '')),
        h('div', { className: 'lbl' }, L('ช่วงที่ตัด', 'Trimmed ranges')),
        segChecks.length ? h('div', {}, segChecks) : h('div', { className: 'mut' }, L('ไม่มีข้อมูลช่วงเวลา — สแกน claim ใหม่ก่อน', 'No time range data — rescan claims first')),
        h('div', { className: 'lbl' }, L('tracklist เดิม', 'Original tracklist')), src,
        h('div', { className: 'lbl' }, L('tracklist ใหม่', 'New tracklist')), outBox, info,
        h('div', { className: 'hint', style: 'margin-top:8px' }, icon('alert', 13),
          h('span', {}, L('เพลงที่ถูกตัดเกินครึ่งจะถูกลบ เวลาของเพลงหลังจุดตัดจะเลื่อนขึ้นตามความยาวที่ตัด ใช้หลังจาก YouTube ประมวลผลการตัดเสร็จแล้ว', 'Songs more than half trimmed are removed; songs after a cut shift earlier by the trimmed length. Use after YouTube has finished processing the trim.'))),
        h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' },
          h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ปิด', 'Close')),
          h('button', { className: 'btn go sm', onclick: () => {
            GM_setClipboard(outBox.value);
            toast(L('คัดลอก tracklist ใหม่แล้ว ไปวางในคำอธิบายของวิดีโอได้เลย', 'New tracklist copied — paste it into the video description'));
          } }, L('📋 คัดลอก tracklist ใหม่', '📋 Copy new tracklist'))));
      m.box.style.width = 'min(760px,95vw)';
      update();
    }

    /* ---------- ทำงานแท็บเดียวต่อช่อง ---------- */
    const TAB_ID = (() => {
      try {
        let id = sessionStorage.getItem('tbxTabId');
        if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem('tbxTabId', id); }
        return id;
      } catch (e) { return Math.random().toString(36).slice(2); }
    })();
    const LEASE_STALE = 20000; // ไม่ต่ออายุเกินเท่านี้ = ถือว่าแท็บนั้นปิดไปแล้ว แท็บอื่นยึดงานต่อได้
    const LEASE_RENEW = 5000; // ต่ออายุทุก ๆ เท่านี้ (ไม่ต้องเขียนทุก tick — เดิมเขียนลง storage ~75 ครั้ง/นาที)
    function isWorker(force = false) {
      const key = 'tabLock:' + currentChannel();
      const l = load(key, null);
      const now = Date.now();
      const mine = !!l && l.id === TAB_ID;
      if (force || !l || mine || now - l.ts > LEASE_STALE) {
        if (!mine || now - l.ts > LEASE_RENEW) save(key, { id: TAB_ID, ts: now });
        return true;
      }
      return false;
    }

    /* ---------- ประวัติเพลงที่โดน claim (ทุกช่อง) ---------- */
    const songNorm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const getSongs = () => load('songHistory', {});
    const setSongs = (v) => { invalidateCounts(); save('songHistory', v); };

    function recordSongs(rows, chName) {
      const db = getSongs();
      const now = new Date().toISOString();
      let added = 0;
      for (const r of rows) {
        if (!r.song || r.song === '(ไม่ทราบชื่อ)') continue;
        const key = songNorm(r.song) + '|' + songNorm(r.artists);
        let e = db[key];
        if (!e) {
          e = db[key] = { title: r.song, artists: r.artists || '', label: r.label || '', claimants: [], types: [], firstSeen: now, lastSeen: now, videos: {}, trimmed: 0 };
          added++;
        }
        e.lastSeen = now;
        if (r.claimant && !e.claimants.includes(r.claimant)) e.claimants.push(r.claimant);
        if (r.type && !e.types.includes(r.type)) e.types.push(r.type);
        if (r.label && !e.label) e.label = r.label;
        const v = e.videos[r.videoId] || (e.videos[r.videoId] = { video: r.video, channel: chName, status: 'claimed' });
        v.video = r.video;
        v.impact = r.impact || '';
      }
      setSongs(db);
      if (added) log(L(`🎵 เพิ่มเพลงใหม่ ${added} เพลงในประวัติ`, `🎵 Added ${added} new songs to history`), 'ok');
    }

    function markSongTrimmed(item) {
      const db = getSongs();
      const t = songNorm(item.song);
      for (const e of Object.values(db)) {
        if (songNorm(e.title) === t && e.videos[item.videoId] && e.videos[item.videoId].status !== 'trimmed') {
          e.videos[item.videoId].status = 'trimmed';
          e.trimmed = (e.trimmed || 0) + 1;
        }
      }
      setSongs(db);
    }

    function songsCSV() {
      const list = Object.values(getSongs());
      const head = ['song', 'artists', 'label', 'claimants', 'claim_type', 'videos_claimed', 'videos_trimmed', 'channels', 'first_seen', 'last_seen', 'videos'];
      const lines = list.map((e) => {
        const vids = Object.values(e.videos);
        return [e.title, e.artists, e.label, e.claimants.join('; '), e.types.join('; '), vids.length, e.trimmed || 0,
          [...new Set(vids.map((v) => v.channel))].join('; '), e.firstSeen.slice(0, 10), e.lastSeen.slice(0, 10), vids.map((v) => v.video).join(' | ')];
      });
      downloadCSV([head, ...lines], `claimed-songs-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    // นำเข้า CSV ประวัติเพลงจากสคริปต์ YT Studio Helper เดิม (ปุ่ม ⬇ CSV ในหน้า Songs)
    function parseCSV(text) {
      const rows = [];
      let row = [], cell = '', q = false;
      text = text.replace(/^﻿/, '');
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) {
          if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
          else if (ch === '"') q = false;
          else cell += ch;
        } else if (ch === '"') q = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows.filter((r) => r.some((c) => c.trim()));
    }
    async function importSongsCSV(file) {
      const rows = parseCSV(await file.text());
      const head = (rows.shift() || []).map((x) => x.trim());
      const col = (n) => head.indexOf(n);
      if (col('song') < 0) return toast(L('ไฟล์นี้ไม่ใช่ CSV ประวัติเพลง (ต้องมีคอลัมน์ song)', 'This is not a song history CSV (needs a song column)'));
      const db = getSongs();
      let n = 0;
      for (const r of rows) {
        const g = (name) => (col(name) >= 0 ? r[col(name)] || '' : '');
        const title = g('song').trim();
        if (!title) continue;
        const key = songNorm(title) + '|' + songNorm(g('artists'));
        const e = db[key] || (db[key] = { title, artists: g('artists'), label: g('label'), claimants: [], types: [],
          firstSeen: (g('first_seen') || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z',
          lastSeen: (g('last_seen') || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z', videos: {}, trimmed: +g('videos_trimmed') || 0 });
        g('claimants').split(';').map((x) => x.trim()).filter(Boolean).forEach((c) => { if (!e.claimants.includes(c)) e.claimants.push(c); });
        g('claim_type').split(';').map((x) => x.trim()).filter(Boolean).forEach((c) => { if (!e.types.includes(c)) e.types.push(c); });
        g('videos').split('|').map((x) => x.trim()).filter(Boolean).forEach((v, i) => {
          const k = 'import:' + songNorm(v) + ':' + i;
          if (!Object.values(e.videos).some((x) => x.video === v)) e.videos[k] = { video: v, channel: g('channels').split(';')[0] || '', status: 'claimed' };
        });
        n++;
      }
      setSongs(db);
      toast(L(`นำเข้าประวัติเพลง ${n} เพลงแล้ว`, `Imported ${n} songs into history`));
      renderStatus();
      refreshClaimWarnings();
    }

    // ตรวจ tracklist ก่อนอัป: เพลงไหนเคยโดน claim
    const titleKey = (t) => songNorm(String(t).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\b(ft|feat)\.?\b.*$/i, '')).replace(/[^\p{L}\p{N}]+/gu, '');
    function claimedSongsIn(txt) {
      if (!txt) return [];
      const db = Object.values(getSongs());
      if (!db.length) return [];
      const idx = db.map((e) => ({ e, k: titleKey(e.title), arts: e.artists.split(',').map((a) => songNorm(a)).filter((a) => a.length > 1) }))
        .filter((x) => x.k.length >= 3);
      const hits = [];
      for (const line of String(txt).split(/\r?\n/)) {
        const t = line.replace(/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*[-–|]?\s*/, '').replace(/^\d{1,3}\.\s*/, '').trim();
        if (!t) continue;
        const parts = t.split(/\s[-–]\s/);
        const song = parts.length > 1 ? parts.slice(1).join(' - ') : t;
        const k = titleKey(song);
        const low = songNorm(t);
        const hit = idx.find((x) => (x.k === k || (k.length >= 6 && x.k.length >= 6 && (k.includes(x.k) || x.k.includes(k)))) &&
          (!x.arts.length || x.arts.some((a) => low.includes(a))));
        if (hit) hits.push({ line: t, song: hit.e.title, artists: hit.e.artists, times: Object.keys(hit.e.videos).length });
      }
      return hits;
    }
    function refreshClaimWarnings() { queue.forEach(updateItemUI); }

    function showSongs() {
      let sortBy = 'count';
      let q = '';
      const tbody = h('tbody', {});
      const countEl = h('span', { className: 'mut' });
      function draw() {
        const db = getSongs();
        let list = Object.entries(db).map(([key, e]) => Object.assign({ key, n: Object.keys(e.videos).length }, e));
        const total = list.length;
        if (q) list = list.filter((e) => songNorm(e.title + ' ' + e.artists + ' ' + e.label + ' ' + e.claimants.join(' ')).includes(songNorm(q)));
        list.sort((a, b) => sortBy === 'count' ? b.n - a.n || a.title.localeCompare(b.title)
          : sortBy === 'recent' ? b.lastSeen.localeCompare(a.lastSeen)
          : sortBy === 'artist' ? a.artists.localeCompare(b.artists) || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title));
        countEl.textContent = q ? L(`${list.length} จาก ${total} เพลง`, `${list.length} of ${total} songs`) : L(`${total} เพลง`, `${total} songs`);
        tbody.replaceChildren(...list.map((e) => {
          const vids = Object.values(e.videos);
          const channels = [...new Set(vids.map((v) => v.channel))].filter(Boolean).join(', ');
          const del = h('button', { className: 'btn sm', title: L('ลบออกจากประวัติ', 'Remove from history'), onclick: () => {
            if (del.dataset.armed) { const d = getSongs(); delete d[e.key]; setSongs(d); draw(); refreshClaimWarnings(); }
            else { del.dataset.armed = '1'; del.textContent = L('แน่ใจ?', 'Sure?'); }
          } }, '✕');
          return h('tr', {},
            h('td', {}, h('b', {}, e.title), e.types.length ? h('div', { className: 'mut' }, e.types.join(', ')) : null),
            h('td', {}, e.artists || '—', e.label ? h('div', { className: 'mut' }, e.label) : null),
            h('td', {}, e.claimants.join(', ') || '—'),
            h('td', { style: 'white-space:nowrap' }, h('b', {}, String(e.n)), L(' คลิป', ' videos'), e.trimmed ? h('div', { className: 'tbx-ok' }, L(`✂ ตัดแล้ว ${e.trimmed}`, `✂ Trimmed ${e.trimmed}`)) : null),
            h('td', { className: 'mut' }, channels),
            h('td', { className: 'mut', style: 'white-space:nowrap' }, new Date(e.lastSeen).toLocaleDateString(LOCALE)),
            h('td', {}, del));
        }));
        if (!list.length) tbody.append(h('tr', {}, h('td', { colSpan: 7, className: 'mut', style: 'text-align:center;padding:16px' },
          total ? L('ไม่พบเพลงที่ค้นหา', 'No matching songs') : L('ยังไม่มีข้อมูล — กด "สแกน claim" หรือนำเข้า CSV จากสคริปต์เดิม', 'No data yet — press "Scan claims" or import a CSV from the old script'))));
      }
      const search = h('input', { type: 'text', placeholder: L('ค้นหาเพลง ศิลปิน ค่าย หรือผู้ claim…', 'Search song, artist, label or claimant…'), oninput: (e) => { q = e.target.value; draw(); } });
      const sortSel = h('select', { style: 'width:auto', onchange: (e) => { sortBy = e.target.value; draw(); } },
        h('option', { value: 'count' }, L('โดนบ่อยสุด', 'Most claimed')), h('option', { value: 'recent' }, L('ล่าสุด', 'Latest')),
        h('option', { value: 'title' }, L('ชื่อเพลง A–Z', 'Title A–Z')), h('option', { value: 'artist' }, L('ศิลปิน A–Z', 'Artist A–Z')));
      const importIn = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: async (e) => { if (e.target.files[0]) await importSongsCSV(e.target.files[0]); e.target.value = ''; draw(); } });
      let clearArmed = false;
      const clearBtn = h('button', { className: 'btn sm danger', onclick: () => {
        if (!clearArmed) { clearArmed = true; clearBtn.textContent = L('กดอีกครั้งเพื่อลบทั้งหมด', 'Press again to delete all'); return; }
        setSongs({}); draw(); refreshClaimWarnings(); clearBtn.textContent = L('ลบทั้งหมด', 'Delete all'); clearArmed = false;
      } }, L('ลบทั้งหมด', 'Delete all'));
      const m = openModal(
        h('h3', {}, L('🎵 เพลงที่เคยโดน claim', '🎵 Previously claimed songs')),
        h('div', { className: 'mut', style: 'margin-bottom:10px' }, L('ทุกเพลงที่เคยโดน claim ในทุกช่องของคุณ เช็กก่อนใส่เพลงในมิกซ์ใหม่ (ตอนลาก .txt เข้าคิว สคริปต์จะเตือนให้อัตโนมัติ)', 'Every song ever claimed across all your channels. Check before adding songs to a new mix (the script warns automatically when you drop a .txt into the queue).')),
        h('div', { className: 'row', style: 'margin-bottom:10px' }, search, sortSel, countEl),
        h('div', { className: 'tbx-scroll' },
          h('table', { className: 'tbx-table' },
            h('thead', {}, h('tr', {}, [L('เพลง', 'Song'), L('ศิลปิน', 'Artist'), L('ผู้ claim', 'Claimant'), L('โดนใน', 'Claimed in'), L('ช่อง', 'Channel'), L('ล่าสุด', 'Latest'), ''].map((t) => h('th', {}, t)))),
            tbody)),
        h('div', { className: 'row', style: 'margin-top:14px' },
          clearBtn, importIn,
          h('button', { className: 'btn sm', title: L('ไฟล์ claimed-songs-*.csv จากสคริปต์ YT Studio Helper เดิม', 'claimed-songs-*.csv file from the old YT Studio Helper script'), onclick: () => importIn.click() }, L('⬆ นำเข้า CSV', '⬆ Import CSV')),
          h('span', { style: 'flex:1' }),
          h('button', { className: 'btn sm', onclick: songsCSV }, '⬇ CSV'),
          h('button', { className: 'btn go sm', onclick: () => closeModal() }, L('ปิด', 'Close'))));
      m.box.style.width = 'min(1100px,95vw)';
      draw();
      search.focus();
    }

    /* ---------- โฆษณา: หาคลิปที่ปิดโฆษณาไว้ แล้วเปิด ---------- */
    const ADS_STEPS = [L('เปิดคลิป', 'Open video'), L('แก้สถานะ', 'Edit status'), L('เลือก On', 'Select On'), L('ตอบคำถาม & Save', 'Answer questions & Save'), L('ตรวจผล', 'Verify')];
    let adsScanning = false;
    let adsStage = { idx: -1, detail: '' };
    const setAdsStage = (idx, detail = '') => { adsStage = { idx, detail }; renderStatus(); };
    const getAdsRun = () => chGet('adsRun', null);
    const setAdsRun = (r) => chSet('adsRun', r);

    async function scanAds({ show = true } = {}) {
      if (adsScanning || scanning) return null;
      if (!ycfg('INNERTUBE_CONTEXT')) { log(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'Studio hasn\'t finished loading — try again in a few seconds'), 'warn'); return null; }
      adsScanning = true;
      scanProg = { label: L('กำลังเช็กคลิปที่ปิดโฆษณา…', 'Checking videos with ads off…'), done: 0, total: 0 };
      try {
        const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true, monetization: { all: true } }, L('กำลังเช็กคลิปที่ปิดโฆษณา…', 'Checking videos with ads off…'));
        const rows = vids.filter((v) => /_OFF$/.test(((v.monetization || {}).adMonetization || {}).userSetMonetization || ''))
          .map((v) => {
            const eff = ((v.monetization || {}).adMonetization || {}).effectiveStatus || '';
            return { videoId: v.videoId, video: v.title, privacy: privacyOf(v.privacy), length: +v.lengthSeconds || 0, ineligible: /INELIGIBLE/.test(eff), status: short(eff) };
          });
        chSet('adsScan', { date: new Date().toISOString(), total: vids.length, rows });
        const ok = rows.filter((r) => !r.ineligible).length;
        log(L(`💰 ${rows.length} จาก ${vids.length} คลิปปิดโฆษณาอยู่ (${ok} คลิปเปิดได้เลย)`, `💰 ${rows.length} of ${vids.length} videos have ads off (${ok} can be turned on now)`), 'ok');
        flash(L('เช็กโฆษณาเสร็จแล้ว', 'Ads check complete'), L(`${rows.length} คลิปปิดโฆษณา · ${ok} คลิปพร้อมเปิด`, `${rows.length} videos with ads off · ${ok} ready to turn on`));
        if (show) showAds();
        return rows;
      } catch (e) {
        log(L('เช็กโฆษณาไม่สำเร็จ: ', 'Ads check failed: ') + e.message, 'err');
        return null;
      } finally {
        adsScanning = false;
        scanProg = null;
        renderStatus();
      }
    }

    function showAds() {
      const scan = chGet('adsScan', null);
      if (!scan) { scanAds(); return; }
      const results = chGet('adsResults', {});
      const picked = new Set(scan.rows.filter((r) => !r.ineligible && !(results[r.videoId] && results[r.videoId].state === 'on')).map((r) => r.videoId));
      const goBtn = h('button', { className: 'btn go sm', onclick: () => {
        const rows = scan.rows.filter((r) => picked.has(r.videoId));
        if (!rows.length) return;
        closeModal();
        startAdsRun(rows);
      } });
      const refresh = () => { goBtn.textContent = L(`💰 เปิดโฆษณา (${picked.size})`, `💰 Turn on ads (${picked.size})`); goBtn.disabled = !picked.size; };
      const cbs = [];
      const table = h('table', { className: 'tbx-table' },
        h('thead', {}, h('tr', {}, ['', L('วิดีโอ', 'Video'), L('การเปิดเผย', 'Visibility'), L('สถานะจาก YouTube', 'YouTube status'), L('ผล', 'Result')].map((t) => h('th', {}, t)))),
        h('tbody', {}, scan.rows.map((r) => {
          const res = results[r.videoId];
          const cb = h('input', { type: 'checkbox', checked: picked.has(r.videoId), onchange: (e) => { e.target.checked ? picked.add(r.videoId) : picked.delete(r.videoId); refresh(); } });
          cb._r = r; cbs.push(cb);
          return h('tr', {},
            h('td', {}, cb),
            h('td', {}, h('a', { href: `/video/${r.videoId}/monetization`, target: '_blank' }, r.video), h('div', { className: 'mut' }, fmt(r.length))),
            h('td', {}, r.privacy),
            h('td', {}, r.ineligible ? h('span', { className: 'tbx-warn' }, L('⚠ YouTube แจ้งว่าไม่มีสิทธิ์', '⚠ YouTube says ineligible')) : L('ปิดโฆษณาไว้ (ตั้งค่า)', 'Ads off (setting)')),
            h('td', {}, res ? h('span', { className: res.state === 'on' ? 'tbx-ok' : 'tbx-err' }, res.state === 'on' ? L('✅ เปิดแล้ว', '✅ Turned on') : '❌ ' + res.msg) : ''));
        })));
      const sel = (fn) => { cbs.forEach((cb) => { cb.checked = fn(cb._r); cb.checked ? picked.add(cb._r.videoId) : picked.delete(cb._r.videoId); }); refresh(); };
      const ok = scan.rows.filter((r) => !r.ineligible).length;
      const m = openModal(
        h('h3', {}, L(`💰 คลิปที่ปิดโฆษณา — ${channelName()}`, `💰 Videos with ads off — ${channelName()}`)),
        h('div', { className: 'mut', style: 'margin-bottom:8px' }, L(`${scan.rows.length} จาก ${scan.total} คลิป · ${ok} คลิปแค่ปิดในการตั้งค่า · เช็กเมื่อ ${new Date(scan.date).toLocaleString(LOCALE)}`, `${scan.rows.length} of ${scan.total} videos · ${ok} only turned off in settings · checked ${new Date(scan.date).toLocaleString(LOCALE)}`)),
        h('div', { className: 'mut', style: 'margin-bottom:8px' }, L('"ไม่มีสิทธิ์" หมายถึง YouTube บล็อกโฆษณาเอง (เช่นโดน claim หรือติดนโยบาย) เปิดการตั้งค่าได้ แต่คลิปนั้นอาจยังไม่มีรายได้จนกว่าจะแก้สาเหตุ', '"Ineligible" means YouTube blocks ads itself (e.g. a claim or policy issue). You can turn the setting on, but the video may not earn until the cause is fixed.')),
        h('div', { className: 'chips', style: 'margin-bottom:8px' },
          h('span', { className: 'mut' }, L('เลือก:', 'Select:')),
          h('button', { className: 'chip', onclick: () => sel((r) => !r.ineligible) }, L('แค่ปิดในการตั้งค่า', 'Only off in settings')),
          h('button', { className: 'chip', onclick: () => sel((r) => !r.ineligible && /public$/.test(r.privacy)) }, L('เฉพาะสาธารณะ', 'Public only')),
          h('button', { className: 'chip', onclick: () => sel(() => true) }, L('ทั้งหมด', 'All')),
          h('button', { className: 'chip', onclick: () => sel(() => false) }, L('ไม่เลือก', 'None'))),
        scan.rows.length ? h('div', { className: 'tbx-scroll' }, table) : h('div', { className: 'tbx-ok' }, L('🎉 ทุกคลิปเปิดโฆษณาแล้ว', '🎉 All videos have ads on')),
        h('div', { className: 'row', style: 'margin-top:14px' },
          h('button', { className: 'btn sm', onclick: () => { closeModal(); scanAds(); } }, L('↻ เช็กใหม่', '↻ Recheck')),
          h('span', { style: 'flex:1' }),
          h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ปิด', 'Close')), goBtn));
      m.box.style.width = 'min(900px,95vw)';
      refresh();
    }

    // งานที่ต้องเปลี่ยนหน้า (ตัด / เปิดโฆษณา / Collab) ทำได้ทีละงาน — ถ้าเริ่มทับกัน งานเดิมจะโดนเปลี่ยนหน้ากลางขั้น
    function otherJobBusy(except) {
      const tr = getRun(), ar = getAdsRun(), cr = getCollabRun();
      return (except !== 'trim' && (trimBusy || !!(tr && tr.active))) ||
        (except !== 'ads' && (adsBusy || !!(ar && ar.active))) ||
        (except !== 'collab' && (collabBusy || !!(cr && cr.active)));
    }
    function startAdsRun(rows) {
      if (otherJobBusy('ads')) { log(L('ยังมีงานตัดลิขสิทธิ์/Collab อยู่ — รอให้เสร็จหรือกดหยุดก่อนแล้วค่อยเปิดโฆษณา', 'A trim/Collab job is still running — wait for it or press Stop before turning on ads'), 'warn'); return; }
      if (uploadBusy()) { log(L('คิวอัปโหลดยังทำงานอยู่ — การเปิดโฆษณาต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', 'Upload queue is still running — turning on ads needs page changes, will start after the upload queue finishes'), 'warn'); }
      isWorker(true);
      setAdsRun({ active: true, items: rows.map((r) => ({ videoId: r.videoId, video: r.video, state: 'pending', msg: '' })), started: new Date().toISOString() });
      log(L(`💰 กำลังเปิดโฆษณา ${rows.length} คลิป`, `💰 Turning on ads for ${rows.length} videos`), 'ok');
      adsStep();
    }
    function stopAdsRun(reason = L('เปิดโฆษณาเสร็จ', 'Ads turned on')) {
      const run = getAdsRun();
      if (!run || !run.active) return;
      run.active = false;
      setAdsRun(run);
      const on = run.items.filter((i) => i.state === 'on').length;
      const failed = run.items.filter((i) => i.state === 'failed').length;
      const left = run.items.filter((i) => i.state === 'pending').length;
      const summary = [L(`เปิดแล้ว ${on}`, `On ${on}`), failed ? L(`ไม่สำเร็จ ${failed}`, `Failed ${failed}`) : '', left ? L(`ยังไม่ได้ทำ ${left}`, `Not done ${left}`) : ''].filter(Boolean).join(' · ');
      adsStage = { idx: -1, detail: '' };
      log(`${reason}: ${summary}`, 'ok');
      flash(reason, summary, failed ? 'err' : 'ok', 15000);
    }
    function setAdsResult(item, state, msg = '') {
      const res = chGet('adsResults', {});
      res[item.videoId] = { state, msg, date: new Date().toISOString() };
      chSet('adsResults', res);
      const run = getAdsRun();
      if (run) { const it = run.items.find((x) => x.videoId === item.videoId); if (it) { it.state = state; it.msg = msg; } setAdsRun(run); }
      log(L(`${state === 'on' ? '✅ เปิดโฆษณาแล้ว' : '❌ เปิดโฆษณาไม่สำเร็จ'}: ${item.video}${msg ? ' (' + msg + ')' : ''}`, `${state === 'on' ? '✅ Ads turned on' : '❌ Failed to turn on ads'}: ${item.video}${msg ? ' (' + msg + ')' : ''}`), state === 'on' ? 'ok' : 'err');
    }
    async function adsIsOn(videoId) {
      const j = await yti('creator/get_creator_videos', { failOnError: true, videoIds: [videoId], mask: { videoId: true, monetization: { all: true } } });
      const v = (j.videos || [])[0] || {};
      return /_ON$/.test(((v.monetization || {}).adMonetization || {}).userSetMonetization || '');
    }

    let adsBusy = false;
    async function adsStep() {
      const run = getAdsRun();
      if (!run || !run.active || adsBusy) return;
      const item = run.items.find((i) => i.state === 'pending');
      if (!item) return stopAdsRun();
      adsBusy = true;
      if (!location.pathname.startsWith(`/video/${item.videoId}/monetization`)) {
        if (uploadBusy()) { setAdsStage(-1, L('⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ค้าง/ผิดพลาดในคิวออก', '⏸ Waiting for the upload queue to clear (page change needed) — upload or remove stuck/failed videos from the queue')); adsBusy = false; return; }
        setAdsStage(0, L('กำลังเปิดหน้าการสร้างรายได้ของคลิป…', 'Opening the video\'s monetisation page…'));
        location.href = `/video/${item.videoId}/monetization`;
        setTimeout(() => { adsBusy = false; }, 15000); // ถ้าเปลี่ยนหน้าไม่สำเร็จ (เช่นกด Stay ใน Leave site?) ให้ลองใหม่ได้
        return;
      }
      try {
        await adsOne(item);
      } catch (e) {
        setAdsResult(item, 'failed', e.message);
      }
      setAdsStage(-1, L('คลิปถัดไปในไม่กี่วินาที…', 'Next video in a few seconds…'));
      await sleep(3000);
      adsBusy = false;
    }

    async function adsOne(item) {
      if (await adsIsOn(item.videoId)) return setAdsResult(item, 'on', L('เปิดอยู่แล้ว', 'Already on'));
      setAdsStage(1, L('กด "Edit video monetisation status"…', 'Clicking "Edit video monetisation status"…'));
      const box = await waitFor(() => { const b = document.querySelector(SEL.monetBox); return b && visible(b) ? b : null; }, 25000);
      if (!box) throw new Error(L('ไม่พบส่วนการสร้างรายได้ในหน้า', 'Monetisation section not found on the page'));
      await sleep(2500);
      let on = null;
      for (let i = 0; i < 4 && !on; i++) {
        const edit = [...box.querySelectorAll(SEL.iconOrButton)].find((b) => visible(b) &&
          TXT.monetStatus.test(b.getAttribute('aria-label') || '')) || box.querySelector(SEL.iconButton);
        if (!edit) throw new Error(L('ไม่พบปุ่ม "Edit video monetisation status"', '"Edit video monetisation status" button not found'));
        edit.click();
        on = await waitFor(() => [...document.querySelectorAll(SEL.radioOn)].find(visible), 3000);
        if (!on) await sleep(1500);
      }
      if (!on) throw new Error(L('ตัวเลือก On / Off ไม่เปิดขึ้นมา', 'On / Off options did not open'));
      setAdsStage(2, L('เลือก "On"…', 'Selecting "On"…'));
      on.click();
      await sleep(600);
      const pop = on.closest(SEL.paperDialog) || document;
      const nextBtn = await waitFor(() => [...pop.querySelectorAll('button')].find((b) => visible(b) && TXT.nextOrDone.test(b.innerText.trim()) && !isDisabled(b)), 5000);
      if (nextBtn) nextBtn.click();
      const qDlg = await waitFor(() => [...document.querySelectorAll(SEL.paperDialog)].find((d) => visible(d) && TXT.tellUsWhats.test(d.innerText)), 6000);
      if (qDlg) {
        setAdsStage(3, L('คำถามความเหมาะสม: ติ๊ก "None of the above"…', 'Ad suitability questions: ticking "None of the above"…'));
        const submitBtn = () => [...qDlg.querySelectorAll('button')].find((b) => visible(b) && TXT.submit.test(b.innerText.trim()));
        const inner = qDlg.querySelector('[role="checkbox"][aria-label="None of the above"]') ||
          deepAll(qDlg, '[role="checkbox"]').find((e) => TXT.noneOfAbove.test(e.getAttribute('aria-label') || ''));
        if (!inner) throw new Error(L('ไม่พบ "None of the above" ในคำถาม', '"None of the above" not found in the questions'));
        const host = inner.closest(SEL.checkboxLit) || inner;
        if (inner.getAttribute('aria-checked') !== 'true') host.click();
        let ready = await waitFor(() => { const b = submitBtn(); return b && !isDisabled(b) ? b : null; }, 3000);
        if (!ready && inner.getAttribute('aria-checked') !== 'true') { inner.click(); ready = await waitFor(() => { const b = submitBtn(); return b && !isDisabled(b) ? b : null; }, 3000); }
        if (!ready) throw new Error(L('ปุ่ม Submit ยังกดไม่ได้หลังติ๊ก "None of the above"', 'Submit button still disabled after ticking "None of the above"'));
        ready.click();
        const closed = await waitFor(() => !visible(qDlg), 15000);
        if (!closed) throw new Error(L('หน้าต่างคำถามไม่ปิดหลังกด Submit', 'Questions dialog did not close after Submit'));
        await sleep(800);
      }
      setAdsStage(3, L('กด Save…', 'Clicking Save…'));
      const saveHost = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && visible(x) && !isDisabled(x) ? x : null; }, 10000);
      if (!saveHost) throw new Error(L('ปุ่ม Save ไม่พร้อม', 'Save button not ready'));
      (saveHost.querySelector('button') || saveHost).click();
      const saved = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && isDisabled(x); }, 20000);
      const extra = [...document.querySelectorAll(SEL.paperDialog)].find((d) => visible(d));
      if (!saved && extra) throw new Error(L('YouTube ถามเพิ่มหลัง Save: "', 'YouTube asked more after Save: "') + extra.innerText.replace(/\s+/g, ' ').slice(0, 120) + L('" — ทำคลิปนี้ด้วยมือ', '" — do this video manually'));
      setAdsStage(4, L('ตรวจกับ YouTube ว่าเปิดโฆษณาแล้ว…', 'Checking with YouTube that ads are on…'));
      let okNow = false;
      for (let i = 0; i < 5 && !okNow; i++) { await sleep(1500); okNow = await adsIsOn(item.videoId); }
      if (!okNow) throw new Error(L('บันทึกแล้ว แต่ YouTube ยังแจ้งว่าปิดโฆษณาอยู่', 'Saved, but YouTube still reports ads are off'));
      setAdsResult(item, 'on', qDlg ? L('ตอบคำถาม: none of the above', 'Answered questions: none of the above') : '');
    }

    /* ---------- Collab: เลือกคลิปที่อัปแล้ว → เชิญช่องอื่นเป็นผู้ร่วมสร้าง ---------- */
    // เปิด /video/<id>/edit ทีละคลิป → Show more → Invite a collaborator (ใช้ inviteCollaborators ร่วมกับหน้าอัปโหลด)
    // ลิงก์คำเชิญผูกกับช่อง ไม่ผูกกับคลิป: ช่องเดียวกันได้ลิงก์เดียว ส่งครั้งเดียวพอ แต่ต้องส่งให้อีกฝ่ายเปิดเอง
    const COLLAB_STEPS = [L('เปิดคลิป', 'Open video'), L('เชิญ', 'Invite'), L('บันทึก', 'Save')];
    let collabScanning = false;
    let collabBusy = false;
    let collabStage = { idx: -1, detail: '' };
    const setCollabStage = (idx, detail = '') => { collabStage = { idx, detail }; renderStatus(); };
    const getCollabRun = () => chGet('collabRun', null);
    const setCollabRun = (r) => chSet('collabRun', r);
    const collabLinks = () => chGet('collabLinks', {}); // handle -> link

    async function scanCollab() {
      if (collabScanning || scanning || adsScanning) return;
      if (!ycfg('INNERTUBE_CONTEXT')) { log(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'Studio hasn\'t finished loading — try again in a few seconds'), 'warn'); return; }
      collabScanning = true;
      try {
        const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true }, L('กำลังอ่านรายการคลิป…', 'Reading video list…'));
        const rows = vids.map((v) => ({ videoId: v.videoId, video: v.title, privacy: privacyOf(v.privacy), length: +v.lengthSeconds || 0 }));
        chSet('collabScan', { date: new Date().toISOString(), total: rows.length, rows });
        log(L(`🤝 อ่านรายการแล้ว ${rows.length} คลิป`, `🤝 Loaded ${rows.length} videos`), 'ok');
        showCollab();
      } catch (e) {
        log(L('อ่านรายการคลิปไม่สำเร็จ: ', 'Could not read the video list: ') + e.message, 'err');
      } finally {
        collabScanning = false;
        scanProg = null;
        renderStatus();
      }
    }

    function showCollab() {
      const scan = chGet('collabScan', null);
      if (!scan) { scanCollab(); return; }
      const results = chGet('collabResults', {});
      const picked = new Set();
      const handlesIn = h('input', { type: 'text', value: load('collabHandles', ''), placeholder: '@handle1, @handle2',
        oninput: (e) => save('collabHandles', e.target.value) });
      const findIn = h('input', { type: 'text', placeholder: L('ค้นหาชื่อคลิป…', 'Search video titles…'), style: 'flex:1;min-width:0' });
      const goBtn = h('button', { className: 'btn go sm', onclick: () => {
        const handles = parseHandles(handlesIn.value);
        if (!handles.length) return flash(L('ใส่ @handle ของช่องที่จะเชิญก่อน', 'Enter the @handle of the channel to invite first'), '', 'err');
        const rows = scan.rows.filter((r) => picked.has(r.videoId));
        if (!rows.length) return;
        closeModal();
        startCollabRun(rows, handles);
      } });
      const refresh = () => { goBtn.textContent = L(`🤝 เชิญ (${picked.size} คลิป)`, `🤝 Invite (${picked.size} videos)`); goBtn.disabled = !picked.size; };
      const trs = [];
      const table = h('table', { className: 'tbx-table' },
        h('thead', {}, h('tr', {}, ['', L('วิดีโอ', 'Video'), L('การเปิดเผย', 'Visibility'), 'Collab'].map((t) => h('th', {}, t)))),
        h('tbody', {}, scan.rows.map((r) => {
          const res = results[r.videoId];
          const cb = h('input', { type: 'checkbox', onchange: (e) => { e.target.checked ? picked.add(r.videoId) : picked.delete(r.videoId); refresh(); } });
          const tr = h('tr', {},
            h('td', {}, cb),
            h('td', {}, h('a', { href: `/video/${r.videoId}/edit`, target: '_blank' }, r.video), h('div', { className: 'mut' }, fmt(r.length))),
            h('td', {}, r.privacy),
            h('td', {}, res ? h('span', { className: res.state === 'done' ? 'tbx-ok' : 'tbx-err' }, (res.state === 'done' ? '✅ ' : '❌ ') + res.msg) : ''));
          tr._r = r; tr._cb = cb; trs.push(tr);
          return tr;
        })));
      const shown = () => trs.filter((tr) => !tr.hidden);
      findIn.addEventListener('input', () => { const q = findIn.value.trim().toLowerCase(); trs.forEach((tr) => { tr.hidden = !!q && !tr._r.video.toLowerCase().includes(q); }); });
      const sel = (fn) => { shown().forEach((tr) => { tr._cb.checked = fn(tr._r); tr._cb.checked ? picked.add(tr._r.videoId) : picked.delete(tr._r.videoId); }); refresh(); };
      const links = Object.entries(collabLinks());
      const m = openModal(
        h('h3', {}, L(`🤝 Collab — ${channelName()}`, `🤝 Collab — ${channelName()}`)),
        h('div', { className: 'mut', style: 'margin-bottom:8px' }, L(
          `${scan.total} คลิป · อ่านเมื่อ ${new Date(scan.date).toLocaleString(LOCALE)} · YouTube ไม่ส่งคำเชิญให้เอง หลังเชิญเสร็จต้องส่งลิงก์คำเชิญให้อีกฝ่ายเปิดแล้วกดยอมรับ (ช่องละลิงก์เดียว ใช้ได้กับทุกคลิป)`,
          `${scan.total} videos · read ${new Date(scan.date).toLocaleString(LOCALE)} · YouTube doesn't send the invite itself: after inviting, send the invite link to the other channel to open and accept (one link per channel, covers every video)`)),
        h('div', { className: 'lbl' }, h('span', {}, L('ช่องที่จะเชิญ', 'Channels to invite')), h('span', {}, L('@handle คั่นด้วย , (สูงสุด 10)', '@handle, comma-separated (max 10)'))), handlesIn,
        links.length ? h('div', { className: 'tbx-note', style: 'margin-top:8px' },
          h('b', {}, L('ลิงก์คำเชิญ (ส่งให้อีกฝ่าย)', 'Invite links (send to the other channel)')),
          ...links.map(([hd, link]) => h('div', { className: 'row', style: 'gap:6px;margin-top:4px' },
            h('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, `${hd}: ${link}`),
            h('button', { className: 'btn sm', onclick: () => { GM_setClipboard(link); flash(L(`คัดลอกลิงก์ของ ${hd} แล้ว`, `Copied ${hd}'s link`)); } }, L('คัดลอก', 'Copy'))))) : null,
        h('div', { className: 'row', style: 'gap:8px;margin:10px 0 8px;flex-wrap:wrap' },
          findIn,
          h('button', { className: 'chip', onclick: () => sel(() => true) }, L('ทั้งหมดที่แสดง', 'All shown')),
          h('button', { className: 'chip', onclick: () => sel((r) => /public$/.test(r.privacy)) }, L('เฉพาะสาธารณะ', 'Public only')),
          h('button', { className: 'chip', onclick: () => sel((r) => !results[r.videoId]) }, L('ยังไม่เคยเชิญ', 'Not invited yet')),
          h('button', { className: 'chip', onclick: () => sel((r) => (results[r.videoId] || {}).state === 'failed') }, L('เฉพาะที่ไม่สำเร็จ', 'Failed only')),
          h('button', { className: 'chip', onclick: () => sel(() => false) }, L('ไม่เลือก', 'None'))),
        scan.rows.length ? h('div', { className: 'tbx-scroll' }, table) : h('div', { className: 'tbx-ok' }, L('ช่องนี้ยังไม่มีคลิป', 'This channel has no videos yet')),
        h('div', { className: 'row', style: 'margin-top:14px' },
          h('button', { className: 'btn sm', onclick: () => { closeModal(); scanCollab(); } }, L('↻ อ่านรายการใหม่', '↻ Reload list')),
          h('span', { style: 'flex:1' }),
          h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ปิด', 'Close')), goBtn));
      m.box.style.width = 'min(900px,95vw)';
      refresh();
    }

    function startCollabRun(rows, handles) {
      const tr = getRun();
      const ar = getAdsRun();
      if (otherJobBusy('collab') || (tr && tr.active) || (ar && ar.active)) { log(L('ยังมีงานตัดลิขสิทธิ์/เปิดโฆษณาอยู่ — รอให้เสร็จก่อนแล้วค่อยเชิญ', 'A trim/ads job is still running — wait for it to finish before inviting'), 'warn'); return; }
      if (uploadBusy()) log(L('คิวอัปโหลดยังทำงานอยู่ — การเชิญต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', 'Upload queue is still running — inviting needs page changes, will start after the upload queue finishes'), 'warn');
      isWorker(true);
      setCollabRun({ active: true, handles, items: rows.map((r) => ({ videoId: r.videoId, video: r.video, state: 'pending', msg: '' })), started: new Date().toISOString() });
      log(L(`🤝 กำลังเชิญ ${handles.join(', ')} ใน ${rows.length} คลิป`, `🤝 Inviting ${handles.join(', ')} to ${rows.length} videos`), 'ok');
      collabStep();
    }
    function stopCollabRun(reason = L('เชิญเสร็จ', 'Invites finished')) {
      const run = getCollabRun();
      if (!run || !run.active) return;
      run.active = false;
      setCollabRun(run);
      collabStage = { idx: -1, detail: '' };
      const done = run.items.filter((i) => i.state === 'done').length;
      const failed = run.items.filter((i) => i.state === 'failed').length;
      const left = run.items.filter((i) => i.state === 'pending').length;
      const summary = [L(`สำเร็จ ${done}`, `Done ${done}`), failed ? L(`ไม่สำเร็จ ${failed}`, `Failed ${failed}`) : '', left ? L(`ยังไม่ได้ทำ ${left}`, `Not done ${left}`) : ''].filter(Boolean).join(' · ');
      log(`${reason}: ${summary}`, 'ok');
      flash(reason, summary + L(' · อย่าลืมส่งลิงก์คำเชิญให้อีกฝ่าย (ปุ่ม 🤝 Collab)', ' · Remember to send the invite link (🤝 Collab button)'), failed ? 'err' : 'ok', 15000);
      if (done) chainAcceptInvites();
    }

    // เชิญเสร็จแล้วงานยังไม่จบ — ลิงก์คำเชิญต้องมีคนเปิดและกดยอมรับ ถ้าช่องที่ถูกเชิญ
    // เป็นช่องของเราเองก็สลับไปช่องนั้นแล้วให้ watchInvite กดยอมรับให้ต่อได้เลย
    // (การสลับช่องมีผลกับทุกแท็บ Studio จึงไม่ทำระหว่างที่คิวอัปโหลดยังวิ่งอยู่)
    function chainAcceptInvites() {
      if ((GM_getValue('settings') || {}).autoAcceptInvite === false) return;
      const links = Object.entries(collabLinks());
      if (!links.length) return;
      const mine = load('channels', []);
      // เลือกเฉพาะช่องที่อยู่ในรายการช่องของเราเอง — ช่องคนอื่นเราสลับไปไม่ได้อยู่แล้ว
      const target = links
        .map(([handle, link]) => ({ handle, link, chan: mine.find((c) => c.handle && c.handle.toLowerCase() === handle.toLowerCase()) }))
        .find((x) => x.chan && x.chan.id !== currentChannel());
      if (!target) return;
      if (uploadBusy()) {
        log(L('คิวอัปโหลดยังวิ่งอยู่ — ยังไม่สลับช่องไปกดยอมรับคำเชิญ', 'Upload queue is running — not switching channels to accept the invite yet'), 'warn');
        return;
      }
      log(L(`สลับไปช่อง ${target.handle} เพื่อกดยอมรับคำเชิญ…`, `Switching to ${target.handle} to accept the invite…`), 'ok');
      switchToChannel({ handle: target.handle, name: target.chan.name }, target.link);
    }
    function setCollabResult(item, state, msg) {
      const res = chGet('collabResults', {});
      res[item.videoId] = { state, msg, date: new Date().toISOString() };
      chSet('collabResults', res);
      const run = getCollabRun();
      if (run) { const it = run.items.find((x) => x.videoId === item.videoId); if (it) { it.state = state; it.msg = msg; } setCollabRun(run); }
      log(`${state === 'done' ? '🤝' : '❌'} ${item.video}: ${msg}`, state === 'done' ? 'ok' : 'err');
    }

    async function collabStep() {
      const run = getCollabRun();
      if (!run || !run.active || collabBusy) return;
      const item = run.items.find((i) => i.state === 'pending');
      if (!item) return stopCollabRun();
      collabBusy = true;
      if (!location.pathname.startsWith(`/video/${item.videoId}/edit`)) {
        if (uploadBusy()) { setCollabStage(-1, L('⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า)', '⏸ Waiting for the upload queue to clear (page change needed)')); collabBusy = false; return; }
        setCollabStage(0, L('กำลังเปิดหน้ารายละเอียดของคลิป…', 'Opening the video details page…'));
        location.href = `/video/${item.videoId}/edit`;
        setTimeout(() => { collabBusy = false; }, 15000); // ถ้าเปลี่ยนหน้าไม่สำเร็จ (เช่นกด Stay ใน Leave site?) ให้ลองใหม่ได้
        return;
      }
      try {
        const page = await waitFor(() => { const p = document.querySelector(SEL.detailsSection); return p && visible(p) ? p : null; }, 25000);
        if (!page) throw new Error(L('ไม่พบหน้ารายละเอียดคลิป', 'Video details page not found'));
        await sleep(2000);
        setCollabStage(1, L(`เชิญ ${run.handles.join(', ')}…`, `Inviting ${run.handles.join(', ')}…`));
        const r = await inviteCollaborators(run.handles, page);
        // เก็บลิงก์ไว้เสมอ แม้บันทึกไม่สำเร็จ — ลิงก์ผูกกับช่อง ไม่ได้ผูกกับคลิป
        if (r.links.length) chSet('collabLinks', Object.assign(collabLinks(), Object.fromEntries(r.links.map((x) => [x.handle, x.link]))));
        if (r.links.length && r.saved) {
          setCollabStage(2, L('กด Save…', 'Clicking Save…'));
          // หน้าแก้ไขคลิป: ปุ่ม Save ของหน้าอาจเปิดให้กดช้า — รอสูงสุด 8 วิ
          // (ถ้าไม่เปิดเลย = ไม่มีอะไรค้างให้บันทึก เพราะหน้าต่างเชิญปิดไปเรียบร้อยแล้ว)
          const sv = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && visible(x) && !isDisabled(x) ? x : null; }, 8000);
          if (sv) {
            (sv.querySelector('button') || sv).click();
            const saved = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && isDisabled(x); }, 20000);
            if (!saved) { r.saved = false; r.errors.push(L('กด Save ของหน้าแล้วแต่ยังไม่บันทึก', 'Clicked the page Save but it did not save')); }
          }
        }
        // หน้าต่างเชิญค้างอยู่จะบังหน้าถัดไป — ปิดให้เรียบร้อยก่อนเปลี่ยนหน้า
        if (!r.saved && shownDialog(SEL.collabDialog)) {
          clickIn(shownDialog(SEL.collabDialog), SEL.dialogCancel) || clickByText(shownDialog(SEL.collabDialog), TXT.cancelButton);
          await waitFor(() => !shownDialog(SEL.collabDialog), 5000);
        }
        const out = inviteOutcome(r);
        setCollabResult(item, out.state, out.msg);
      } catch (e) {
        setCollabResult(item, 'failed', e.message);
      }
      setCollabStage(-1, L('คลิปถัดไปในไม่กี่วินาที…', 'Next video in a few seconds…'));
      await sleep(3000);
      collabBusy = false;
    }

    /* ---------- ตัดลิขสิทธิ์ (Take action → Trim out segment → Save) ---------- */
    const TRIM_LABEL = {
      pending: L('⏳ รอ', '⏳ Pending'), saved: L('✅ ตัดแล้ว', '✅ Trimmed'), gone: L('✅ claim หายไปแล้ว', '✅ Claim gone'), failed: L('❌ ไม่สำเร็จ', '❌ Failed'),
      skipped: L('⏭ ข้าม', '⏭ Skipped'), later: L('⏳ รอคิว — จะตัดหลังการตัดครั้งก่อนในคลิปนี้เสร็จ', '⏳ Queued — will trim after the previous trim on this video finishes'),
    };
    const getRun = () => chGet('trimRun', null);
    const setRun = (r) => chSet('trimRun', r);
    function setResult(item, state, msg = '') {
      const res = chGet('trimResults', {});
      res[item.key] = { state, msg, date: new Date().toISOString() };
      chSet('trimResults', res);
      const run = getRun();
      if (run && run.active) {
        const it = run.items.find((x) => x.key === item.key);
        if (it) { it.state = state; it.msg = msg; }
        setRun(run);
      }
      if (state === 'saved' || state === 'gone') chSet('trimQueue', chGet('trimQueue', []).filter((k) => k !== item.key));
      fuOnResult(item, state);
      log(`${TRIM_LABEL[state] || state}: ${item.video} — ${item.song}${msg ? ' (' + msg + ')' : ''}`,
        state === 'failed' ? 'err' : state === 'saved' || state === 'gone' ? 'ok' : 'warn');
    }

    function openTrimConfirm() {
      const scan = chGet('claimScan', null);
      const picked = new Set(chGet('trimQueue', []));
      const rows = (scan ? scan.rows : []).filter((r) => picked.has(r.videoId + ':' + r.claimId));
      if (!rows.length) return log(L('ยังไม่ได้เลือก claim', 'No claims selected'), 'warn');
      const videos = new Set(rows.map((r) => r.videoId)).size;
      const own = rows.filter((r) => r.own).length;
      const total = rows.reduce((a, r) => a + r.claimedSec, 0);
      const mode = cfg().autoSaveTrim ? 'auto' : 'review';
      openModal(
        h('h3', {}, L(`ตัด ${rows.length} claim ใน ${videos} คลิป?`, `Trim ${rows.length} claims in ${videos} videos?`)),
        h('div', { style: 'line-height:1.6' },
          L(`จะตัดภาพ + เสียงออกรวม ${fmt(total)} ด้วยเครื่องมือ "Trim out segment" ของ YouTube `, `This will cut video + audio totalling ${fmt(total)} using YouTube's "Trim out segment" tool. `),
          h('b', {}, L('การตัดที่บันทึกแล้วย้อนกลับไม่ได้', 'Saved trims cannot be undone')), L(' และ YouTube ใช้เวลาประมวลผลหลายชั่วโมงต่อคลิป', ', and YouTube takes several hours to process each video')),
        own ? h('div', { className: 'tbx-warn', style: 'margin-top:8px' }, L(`⚠ ${own} รายการเป็น claim บนเพลงของคุณเอง (★) ถ้าตัดจะเสียเพลงของตัวเองออกจากคลิป`, `⚠ ${own} items are claims on your own music (★) — trimming will remove your own music from the video`)) : null,
        uploadBusy() ? h('div', { className: 'tbx-warn', style: 'margin-top:8px' }, L('⏸ คิวอัปโหลดยังมีไฟล์อยู่ การตัดต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', '⏸ Upload queue still has files. Trimming needs page changes, will start after the upload queue finishes')) : null,
        !studioIsEnglish() ? h('div', { className: 'tbx-err', style: 'margin-top:8px' }, L('⚠ Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ ปุ่มต่าง ๆ จะหาไม่เจอ — เปลี่ยนภาษาเป็น English ก่อน', '⚠ Studio is not set to English, buttons won\'t be found — switch the language to English first')) : null,
        h('div', { className: 'mut', style: 'margin-top:8px' }, L('คลิปหนึ่งตัดได้ทีละครั้ง ถ้าคลิปเดียวมีหลาย claim จะตัดอันแรกก่อน ที่เหลือจะตัดต่อให้เองเมื่อ YouTube ประมวลผลเสร็จ', 'Each video can only be trimmed once at a time. If a video has several claims, the first is trimmed now and the rest continue automatically once YouTube finishes processing')),
        h('div', { className: 'tbx-note' },
          mode === 'auto' ? L('⚡ อัตโนมัติทั้งหมด: Save → "I acknowledge" → Confirm changes ทุก claim', '⚡ Fully automatic: Save → "I acknowledge" → Confirm changes for every claim') : L('👀 โหมดตรวจเอง: คุณกด Save และยืนยันการตัดเองทีละอัน', '👀 Review mode: you click Save and confirm each trim yourself'),
          h('div', { className: 'mut' }, L('เปลี่ยนได้ที่ ⚙ ตั้งค่าลิขสิทธิ์ → "ตัดอัตโนมัติทั้งหมด"', 'Change this in ⚙ Copyright settings → "Fully automatic trim"'))),
        h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' },
          h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ยกเลิก', 'Cancel')),
          h('button', { className: 'btn go sm', onclick: () => { closeModal(); startTrimRun(rows, mode); } }, L('เริ่มตัด', 'Start trim'))));
    }

    function startTrimRun(rows, mode, fromFollowUp = false) {
      const cur = getRun();
      if (cur && cur.active) {
        log(L('ยังตัดชุดก่อนไม่เสร็จ — รอให้เสร็จหรือกดหยุดก่อน แล้วค่อยเริ่มชุดใหม่', 'Previous batch is still trimming — wait for it to finish or press Stop before starting a new batch'), 'warn');
        toast(L('ยังตัดชุดก่อนไม่เสร็จ', 'Previous batch still trimming'));
        return;
      }
      if (otherJobBusy('trim')) { log(L('ยังมีงานเปิดโฆษณา/Collab อยู่ — รอให้เสร็จหรือกดหยุดก่อนแล้วค่อยตัด', 'An ads/Collab job is still running — wait for it or press Stop before trimming'), 'warn'); return; }
      const seen = new Set();
      const waiting = fromFollowUp ? {} : fuGet();
      const items = rows.map((r) => {
        const first = !seen.has(r.videoId) && !waiting[r.videoId];
        seen.add(r.videoId);
        return { key: r.videoId + ':' + r.claimId, videoId: r.videoId, claimId: r.claimId, song: r.song, video: r.video, state: first ? 'pending' : 'later', msg: '' };
      });
      // แก้บัคเดิม: ตั้ง run ใหม่ก่อน แล้วค่อยบันทึกผล "later" (เดิมไปแก้ items ของ run เก่า)
      setRun({ active: true, mode, items, started: new Date().toISOString(), channel: currentChannel() });
      items.filter((i) => i.state === 'later').forEach((i) => { fuAdd(i); setResult(i, 'later'); });
      fuNext = Date.now() + Math.max(2, parseFloat(cfg().followUpMinutes) || 10) * 60e3;
      isWorker(true);
      log(L(`เริ่มตัด (${mode === 'auto' ? 'บันทึกอัตโนมัติ' : 'ตรวจเองทีละอัน'}) — ${items.filter((i) => i.state === 'pending').length} รายการ`, `Trim started (${mode === 'auto' ? 'auto-save' : 'review each'}) — ${items.filter((i) => i.state === 'pending').length} items`), 'ok');
      trimStep();
    }

    // byUser: ผู้ใช้กดหยุดเอง → ยกเลิกคิวตัดต่อทั้งหมดของช่องนี้ด้วย ไม่ให้ fuCheck เริ่มตัดต่อเอง (การตัดย้อนกลับไม่ได้)
    function stopTrimRun(reason = L('หยุดแล้ว', 'Stopped'), byUser = false) {
      if (byUser && fuCount()) {
        const n = fuCount();
        fuSet({});
        log(L(`ยกเลิกคิวตัดต่อ ${n} claim แล้ว`, `Cancelled ${n} queued follow-up trims`), 'warn');
      }
      const run = getRun();
      if (!run || !run.active) return;
      run.active = false;
      setRun(run);
      const c = run.items.reduce((a, i) => { a[i.state] = (a[i.state] || 0) + 1; return a; }, {});
      const summary = [L(`ตัดแล้ว ${c.saved || 0}`, `Trimmed ${c.saved || 0}`), c.gone ? L(`claim หายแล้ว ${c.gone}`, `Claim gone ${c.gone}`) : '', c.skipped ? L(`ข้าม ${c.skipped}`, `Skipped ${c.skipped}`) : '',
        c.failed ? L(`ไม่สำเร็จ ${c.failed}`, `Failed ${c.failed}`) : '', c.later ? L(`รอคิวตัดต่อ ${c.later}`, `Queued for follow-up ${c.later}`) : '', c.pending ? L(`ยังไม่ได้ทำ ${c.pending}`, `Not done ${c.pending}`) : ''].filter(Boolean).join(' · ');
      log(`${reason}: ${summary}`, 'ok');
      trimStage = { idx: -1, detail: '' };
      flash(reason, summary, c.failed ? 'err' : 'ok', 15000);
    }

    /* ---------- คลิปที่มีหลาย claim: รอให้การตัดครั้งก่อนเสร็จแล้วตัดต่อ ---------- */
    const fuGet = () => chGet('followUp', {});
    const fuSet = (v) => chSet('followUp', v);
    const fuHas = (videoId, claimId) => !!(fuGet()[videoId] || { pending: [] }).pending.some((p) => p.claimId === claimId);
    function fuAdd(item) {
      const fu = fuGet();
      const v = fu[item.videoId] || (fu[item.videoId] = { video: item.video, pending: [], lastClaimId: null, lastSavedAt: 0 });
      if (!v.pending.some((p) => p.claimId === item.claimId)) v.pending.push({ key: item.key, claimId: item.claimId, song: item.song, tries: 0 });
      fuSet(fu);
    }
    function fuOnResult(item, state) {
      if (state === 'saved') markSongTrimmed(item);
      const fu = fuGet();
      const v = fu[item.videoId];
      if (!v || state === 'later') return;
      const i = v.pending.findIndex((p) => p.claimId === item.claimId);
      if (state === 'saved') {
        v.lastClaimId = item.claimId;
        v.lastSavedAt = Date.now();
        if (i >= 0) v.pending.splice(i, 1);
      } else if (state === 'gone' || state === 'skipped') {
        if (i >= 0) v.pending.splice(i, 1);
      } else if (state === 'failed' && i >= 0) {
        v.pending[i].tries = (v.pending[i].tries || 0) + 1;
        if (v.pending[i].tries >= 3) v.pending.splice(i, 1);
      }
      if (!v.pending.length) delete fu[item.videoId];
      fuSet(fu);
    }
    const fuCount = () => Object.values(fuGet()).reduce((a, v) => a + v.pending.length, 0);

    let fuBusy = false;
    let fuNext = 0;
    async function fuCheck() {
      if (fuBusy || scanning) return;
      const run = getRun();
      if (run && run.active) return;
      const fu = fuGet();
      const vids = Object.keys(fu);
      if (!vids.length) return;
      fuBusy = true;
      fuNext = Date.now() + Math.max(2, parseFloat(cfg().followUpMinutes) || 10) * 60e3;
      try {
        const ready = [];
        for (const videoId of vids) {
          const v = fu[videoId];
          let j;
          try {
            j = await yti('creator/list_creator_received_claims', { videoId, criticalRead: true, includeLicensingOptions: false, isCreatorMusicV2: true });
          } catch (e) { log(L(`เช็กคลิป ${v.video} ไม่สำเร็จ: ${e.message}`, `Failed to check video ${v.video}: ${e.message}`), 'warn'); continue; }
          const active = {};
          (j.receivedClaims || []).forEach((c) => { if (c.status === 'RECEIVED_CLAIM_STATUS_ACTIVE') active[c.claimId] = c; });
          v.pending = v.pending.filter((p) => {
            if (active[p.claimId]) return true;
            const res = chGet('trimResults', {}); res[p.key] = { state: 'gone', msg: L('ปล่อยแล้ว', 'Released'), date: new Date().toISOString() }; chSet('trimResults', res);
            log(L(`✅ claim หายไปแล้ว: ${v.video} — ${p.song}`, `✅ Claim gone: ${v.video} — ${p.song}`), 'ok');
            return false;
          });
          if (!v.pending.length) { delete fu[videoId]; continue; }
          const stillThere = v.lastClaimId && active[v.lastClaimId];
          const hours = (Date.now() - (v.lastSavedAt || 0)) / 3600e3;
          if (stillThere && hours < 48) {
            log(L(`⏳ ${v.video}: การตัดครั้งก่อนยังประมวลผล (${hours < 1 ? Math.round(hours * 60) + ' นาที' : hours.toFixed(1) + ' ชม.'}) — รอ ${v.pending.length} claim`, `⏳ ${v.video}: previous trim still processing (${hours < 1 ? Math.round(hours * 60) + ' min' : hours.toFixed(1) + ' h'}) — ${v.pending.length} claims waiting`));
            continue;
          }
          const next = v.pending.find((p) => ((active[p.claimId].nontakedownClaimActions || {}).options || []).includes('NON_TAKEDOWN_CLAIM_OPTION_TRIM'));
          if (!next) { log(L(`⏳ ${v.video}: ยังไม่มีตัวเลือก Trim — จะเช็กใหม่`, `⏳ ${v.video}: no Trim option yet — will check again`)); continue; }
          ready.push({ videoId, claimId: next.claimId, song: next.song, video: v.video });
        }
        fuSet(fu);
        if (ready.length) {
          log(L(`▶ ${ready.length} คลิปประมวลผลเสร็จแล้ว — ตัด claim ถัดไป`, `▶ ${ready.length} videos finished processing — trimming next claim`), 'ok');
          startTrimRun(ready, cfg().autoSaveTrim ? 'auto' : 'review', true);
        } else if (Object.keys(fu).length) {
          log(L(`เช็กครั้งถัดไป ${new Date(fuNext).toLocaleTimeString(LOCALE).slice(0, 5)}`, `Next check ${new Date(fuNext).toLocaleTimeString(LOCALE).slice(0, 5)}`));
        }
      } finally {
        fuBusy = false;
      }
    }

    /* ---------- Auto-pilot ---------- */
    const getAP = () => chGet('autopilot', { on: false, next: 0 });
    const setAP = (v) => chSet('autopilot', v);
    function apPick(rows) {
      const c = cfg();
      const maxPct = parseFloat(c.apMaxPct) || 100;
      const results = chGet('trimResults', {});
      const out = [];
      // คลิปที่ตั้งเวลาปล่อยไว้และใกล้ถึงเวลา ตัดก่อน
      const sorted = rows.slice().sort((a, b) => (a.publishAt > Date.now() ? a.publishAt : Infinity) - (b.publishAt > Date.now() ? b.publishAt : Infinity));
      for (const r of sorted) {
        const res = results[r.videoId + ':' + r.claimId];
        if (res && (res.state === 'saved' || res.state === 'gone')) continue;
        if (!r.canTrim) continue;
        if (c.apSkipOwn && r.own) continue;
        if (c.apOnlyImpact && !r.hasImpact) continue;
        if (r.length && (r.claimedSec / r.length) * 100 > maxPct) continue;
        if (fuHas(r.videoId, r.claimId)) continue;
        out.push(r);
        if (out.length >= (parseInt(c.apMaxPerCycle, 10) || 10)) break;
      }
      return out;
    }

    let apBusy = false;
    async function apCycle() {
      if (apBusy || scanning) return;
      const run = getRun();
      if (run && run.active) return;
      apBusy = true;
      try {
        const hours = Math.max(0.5, parseFloat(cfg().apEveryHours) || 6);
        setAP(Object.assign(getAP(), { next: Date.now() + hours * 3600e3, last: Date.now() }));
        log(L(`🤖 Auto-pilot เริ่มรอบใหม่ที่ ${channelName()}`, `🤖 Auto-pilot starting a new cycle on ${channelName()}`), 'ok');
        const rows = await scanClaims({ show: false });
        if (!rows) return;
        const pick = apPick(rows);
        if (!pick.length) {
          log(L(`🤖 ไม่มีอะไรต้องตัด เช็กครั้งถัดไป ${new Date(getAP().next).toLocaleString(LOCALE)}`, `🤖 Nothing to trim, next check ${new Date(getAP().next).toLocaleString(LOCALE)}`), 'ok');
          if (cfg().apAdsOn) {
            const adsRows = await scanAds({ show: false });
            const todo = (adsRows || []).filter((r) => !r.ineligible);
            if (todo.length) { log(L(`🤖 เปิดโฆษณา ${todo.length} คลิป`, `🤖 Turning on ads for ${todo.length} videos`), 'warn'); startAdsRun(todo); }
          }
          return;
        }
        log(L(`🤖 ตัดอัตโนมัติ ${pick.length} claim`, `🤖 Auto-trimming ${pick.length} claims`), 'warn');
        startTrimRun(pick, 'auto');
      } finally {
        apBusy = false;
      }
    }

    function toggleAutopilot() {
      const ap = getAP();
      if (ap.on) {
        setAP({ on: false, next: 0 });
        log(L('🤖 ปิด Auto-pilot ของ ', '🤖 Auto-pilot turned off for ') + channelName(), 'ok');
        renderStatus();
        return;
      }
      const c = cfg();
      const rules = [
        L(`ทุก ${c.apEveryHours} ชั่วโมง: สแกนช่องนี้ใหม่`, `Every ${c.apEveryHours} hours: rescan this channel`),
        c.apOnlyImpact ? L('เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)', 'Only claims that affect the video (no revenue / restricted / blocked)') : L('ทุก claim ที่ตัดได้', 'Every trimmable claim'),
        c.apSkipOwn ? L(`ไม่ตัดเพลงของตัวเอง (${c.ownNames})`, `Don't trim your own music (${c.ownNames})`) : L('รวมเพลงของตัวเองด้วย', 'Include your own music too'),
        L(`ข้าม claim ที่ยาวเกิน ${c.apMaxPct}% ของคลิป`, `Skip claims longer than ${c.apMaxPct}% of the video`),
        L(`สูงสุด ${c.apMaxPerCycle} claim ต่อรอบ · คลิปที่ตั้งเวลาปล่อยไว้จะถูกตัดก่อน`, `Up to ${c.apMaxPerCycle} claims per cycle · scheduled videos are trimmed first`),
      ];
      openModal(
        h('h3', {}, L(`เปิด Auto-pilot ให้ช่อง ${channelName()}?`, `Turn on Auto-pilot for channel ${channelName()}?`)),
        h('div', { style: 'line-height:1.6' }, L('สคริปต์จะสแกนและ ', 'The script will scan and '), h('b', {}, L('บันทึกการตัดโดยไม่ถาม', 'save trims without asking')), L(' — การตัดย้อนกลับไม่ได้', ' — trims cannot be undone')),
        h('ul', { style: 'line-height:1.7;margin:10px 0;padding-left:20px' }, rules.map((r) => h('li', {}, r))),
        h('div', { className: 'mut' }, L('ต้องเปิดแท็บ YouTube Studio ของช่องนี้ค้างไว้ 1 แท็บ และเครื่องไม่หลับ ระหว่างที่คิวอัปโหลดยังทำงาน Auto-pilot จะรอ', 'Keep 1 YouTube Studio tab for this channel open and the computer awake. Auto-pilot waits while the upload queue is running')),
        h('div', { className: 'row', style: 'margin-top:14px;justify-content:flex-end' },
          h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ยกเลิก', 'Cancel')),
          h('button', { className: 'btn go sm', onclick: () => {
            closeModal();
            setAP({ on: true, next: 0 });
            log(L('🤖 เปิด Auto-pilot ของ ', '🤖 Auto-pilot turned on for ') + channelName(), 'ok');
            renderStatus();
          } }, L('เปิด', 'Turn on'))));
    }

    /* ---------- ยืนยัน "Confirm changes" ---------- */
    let confirmClickedAt = 0;
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest(SEL.buttonOrYtcp);
      if (b && TXT.confirmChanges.test((b.innerText || '').trim())) confirmClickedAt = Date.now();
    }, true);
    function findConfirmDialog() {
      return [...document.querySelectorAll(SEL.anyDialog)].find((d) =>
        visible(d) && TXT.confirmChangesLoose.test(d.innerText) && TXT.acknowledge.test(d.innerText) &&
        !d.querySelector(SEL.nestedDialog)) || null;
    }
    function deepAll(rootEl, sel, out = []) {
      rootEl.querySelectorAll(sel).forEach((e) => out.push(e));
      rootEl.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(e.shadowRoot, sel, out); });
      return out;
    }
    function fullClick(el) {
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
      el.dispatchEvent(new MouseEvent('click', o));
    }
    let approving = false;
    async function approveConfirm(dlg) {
      if (approving) return false;
      approving = true;
      try {
        const confirmBtn = () => [...dlg.querySelectorAll('button')].find((b) => visible(b) && TXT.confirmChanges.test(b.innerText.trim()));
        const ready = () => { const b = confirmBtn(); return b && !isDisabled(b) ? b : null; };
        if (!ready()) {
          const host = dlg.querySelector(SEL.checkboxHost);
          const inner = deepAll(dlg, '[role="checkbox"], input[type="checkbox"], #checkbox').find(visible);
          const label = [...dlg.querySelectorAll('*')].find((e) => e.childElementCount === 0 && TXT.acknowledgeFull.test(e.textContent));
          const tries = [
            () => host && host.click(),
            () => inner && inner.click(),
            () => host && fullClick(host),
            () => inner && fullClick(inner),
            () => label && fullClick(label),
            () => { const t = inner || host; if (t) { t.focus && t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, composed: true }));
              t.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, composed: true })); } },
          ];
          for (const t of tries) {
            t();
            if (await waitFor(ready, 1200)) break;
            const tickedNow = [host, inner].some((e) => e && (e.getAttribute('aria-checked') === 'true' || e.checked === true || e.hasAttribute('checked')));
            if (tickedNow) { await waitFor(ready, 3000); break; }
          }
        }
        const btn = await waitFor(ready, 3000);
        if (!btn) {
          const info = deepAll(dlg, SEL.checkboxAny).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')).join(', ');
          log(L('ติ๊ก "I acknowledge" ไม่ได้ — ติ๊กเองด้วยมือ (เจอ: ', 'Couldn\'t tick "I acknowledge" — tick it manually (found: ') + (info || L('ไม่มี checkbox', 'no checkbox')) + ')', 'err');
          return false;
        }
        btn.click();
        confirmClickedAt = Date.now();
        log(L('✔ ยืนยันการตัดแล้ว (YouTube จะประมวลผลภายในไม่กี่นาทีถึงหลายชั่วโมง)', '✔ Trim confirmed (YouTube will process it within a few minutes to several hours)'), 'ok');
        return true;
      } finally {
        approving = false;
      }
    }

    let trimBusy = false;
    async function trimStep() {
      const run = getRun();
      if (!run || !run.active || trimBusy) return;
      const item = run.items.find((i) => i.state === 'pending');
      if (!item) return stopTrimRun(L('ตัดเสร็จแล้ว', 'Trimming finished'));
      trimBusy = true;
      const path = `/video/${item.videoId}/claims`;
      if (!new RegExp(`^/video/${item.videoId}/(claims|copyright)`).test(location.pathname)) {
        if (uploadBusy()) { setTrimStage(-1, L('⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ค้าง/ผิดพลาดในคิวออก', '⏸ Waiting for the upload queue to clear (page change needed) — upload or remove stuck/failed videos from the queue')); trimBusy = false; return; }
        setTrimStage(0, L('กำลังเปิดหน้า claim ของคลิปนี้…', 'Opening this video\'s claims page…'));
        log(L(`กำลังเปิด ${item.video}…`, `Opening ${item.video}…`));
        location.href = path;
        setTimeout(() => { trimBusy = false; }, 15000); // ถ้าเปลี่ยนหน้าไม่สำเร็จ (เช่นกด Stay ใน Leave site?) ให้ลองใหม่ได้
        return;
      }
      try {
        await trimOne(item, run.mode);
      } catch (e) {
        setResult(item, 'failed', e.message);
      }
      setTrimStage(-1, L('claim ถัดไปในไม่กี่วินาที…', 'Next claim in a few seconds…'));
      await sleep(4000);
      trimBusy = false;
    }

    const closeDialogs = () => document.querySelectorAll(SEL.paperDialog).forEach((d) => {
      if (!visible(d)) return;
      const c = [...d.querySelectorAll('button')].find((b) => visible(b) && TXT.cancelOrClose.test(b.innerText.trim()));
      c && c.click();
    });

    function pickRow(rows, allClaims, claim, song) {
      if (rows.length === 1) return rows[0];
      const t = songNorm(song);
      if (t) {
        const sameTitle = allClaims.filter((c) => songNorm(claimInfo(c).title) === t);
        const k = Math.max(0, sameTitle.findIndex((c) => c.claimId === claim.claimId));
        const hits = rows.filter((r) => songNorm(r.innerText).includes(t));
        if (hits.length === 1) return hits[0];
        if (hits.length > 1 && hits.length === sameTitle.length) return hits[k];
      }
      const idx = allClaims.findIndex((c) => c.claimId === claim.claimId);
      if (idx >= 0 && rows.length === allClaims.length) return rows[idx];
      const activeC = allClaims.filter((c) => c.status === 'RECEIVED_CLAIM_STATUS_ACTIVE');
      const aIdx = activeC.findIndex((c) => c.claimId === claim.claimId);
      if (aIdx >= 0 && rows.length === activeC.length) return rows[aIdx];
      return null;
    }

    async function trimOne(item, mode) {
      if (!studioIsEnglish()) throw new Error(L('Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ — เปลี่ยนเป็น English แล้วลองใหม่', 'Studio is not set to English — switch to English and try again'));
      setTrimStage(1, L('เช็กว่า claim ยังอยู่…', 'Checking the claim is still there…'));
      const j = await yti('creator/list_creator_received_claims', { videoId: item.videoId, criticalRead: true, includeLicensingOptions: false, isCreatorMusicV2: true });
      const claim = (j.receivedClaims || []).find((c) => c.claimId === item.claimId);
      if (!claim || claim.status !== 'RECEIVED_CLAIM_STATUS_ACTIVE') return setResult(item, 'gone', claim ? short(claim.status) : L('ปล่อยแล้ว', 'Released'));
      const opts = (claim.nontakedownClaimActions || {}).options || [];
      if (!opts.includes('NON_TAKEDOWN_CLAIM_OPTION_TRIM')) return setResult(item, 'failed', L('ไม่มีตัวเลือก Trim แล้ว (คลิปอาจยังประมวลผลการแก้ครั้งก่อน)', 'Trim option no longer available (the video may still be processing a previous edit)'));
      const song = (claimInfo(claim).title || (item.song !== '(ไม่ทราบชื่อ)' ? item.song : '') || '').trim();
      const allClaims = j.receivedClaims || [];

      setTrimStage(2, L('หา claim ในหน้าแล้วกด "Take action"…', 'Finding the claim on the page and clicking "Take action"…'));
      const rows = await waitFor(() => {
        const r = [...document.querySelectorAll(SEL.claimRow)].filter(visible);
        return r.length ? r : null;
      }, 25000);
      if (!rows) throw new Error(L('รายการ claim ไม่โหลด', 'Claim list did not load'));
      const row = pickRow(rows, allClaims, claim, song);
      if (!row) throw new Error(L(`แยกไม่ออกว่าแถวไหนใน ${rows.length} claim คือ "${song || 'claim นี้'}" — ทำด้วยมือ`, `Can't tell which of the ${rows.length} claim rows is "${song || 'this claim'}" — do it manually`));
      const take = [...row.querySelectorAll('button')].find((b) => visible(b) && TXT.takeAction.test(b.innerText.trim()));
      if (!take) throw new Error(L('ไม่มีปุ่ม "Take action" สำหรับ claim นี้', 'No "Take action" button for this claim'));
      take.click();

      const leaf = await waitFor(() => [...document.querySelectorAll(`${SEL.paperDialog} *`)].find((e) =>
        visible(e) && e.childElementCount === 0 && TXT.trimOutSegment.test(e.textContent.trim())), 8000);
      if (!leaf) { closeDialogs(); throw new Error(L('ไม่มีตัวเลือก "Trim out segment"', 'No "Trim out segment" option')); }
      const opt = leaf.closest('button') || leaf;
      if (isDisabled(opt)) { closeDialogs(); throw new Error(L('Trim ถูกปิดสำหรับ claim นี้', 'Trim is disabled for this claim')); }
      opt.click();
      const cont = await waitFor(() => findText(TXT.continueBtn).find((b) => b.tagName === 'BUTTON' && !isDisabled(b)), 5000);
      if (!cont) { closeDialogs(); throw new Error(L('ปุ่ม Continue กดไม่ได้', 'Continue button is disabled')); }
      cont.click();

      setTrimStage(3, L('เปิดหน้าตัด…', 'Opening the trim editor…'));
      const dlg = await waitFor(() => {
        const d = document.querySelector(SEL.trimDialog);
        return d && visible(d.querySelector(SEL.trimContinue)) ? d : null;
      }, 20000);
      if (!dlg) { closeDialogs(); throw new Error(L('หน้าตัดไม่เปิด', 'Trim editor did not open')); }
      const times = (dlg.innerText.match(TXT.trimTimes) || []).slice(1).join('–');
      const saveBtn = dlg.querySelector(`${SEL.trimContinue} button`) || dlg.querySelector(SEL.trimContinue);
      let saveAt = 0;
      saveBtn.addEventListener('click', () => { saveAt = Date.now(); }, { capture: true });

      if (cfg().autoSaveTrim) mode = 'auto';
      if (mode === 'auto') {
        await sleep(1500);
        await waitFor(() => !isDisabled(saveBtn), 10000);
        setTrimStage(4, L(`บันทึกการตัด ${times}…`, `Saving trim ${times}…`));
        log(L(`บันทึกการตัด ${times} ใน ${item.video}…`, `Saving trim ${times} in ${item.video}…`));
        saveBtn.click();
        saveAt = saveAt || Date.now();
      } else {
        setTrimStage(4, L(`👉 ตาคุณ: เช็กช่วง ${times} แล้วกด Save (หรือ Cancel เพื่อข้าม)`, `👉 Your turn: check range ${times}, then click Save (or Cancel to skip)`));
        log(L(`👉 เช็กช่วง ${times} ใน "${item.video}" แล้วกด Save (หรือ Cancel เพื่อข้าม)`, `👉 Check range ${times} in "${item.video}", then click Save (or Cancel to skip)`), 'warn');
      }

      const t0 = Date.now();
      for (;;) {
        await sleep(700);
        const run = getRun();
        if (!run || !run.active) return;
        const cd = findConfirmDialog();
        if (cd && saveAt && confirmClickedAt < saveAt) {
          if (mode === 'auto') {
            setTrimStage(5, L('ติ๊ก "I acknowledge" แล้วกด "Confirm changes"…', 'Ticking "I acknowledge" and clicking "Confirm changes"…'));
            await approveConfirm(cd);
          } else setTrimStage(5, L('👉 ตาคุณ: ติ๊ก "I acknowledge" แล้วกด "Confirm changes"', '👉 Your turn: tick "I acknowledge" and click "Confirm changes"'));
        }
        const open = visible(dlg.querySelector(SEL.paperDialog)) || visible(dlg.querySelector(SEL.trimContinue)) || findConfirmDialog();
        if (!open) break;
        if (mode === 'auto' && Date.now() - t0 > 90000) throw new Error(L('ยืนยันการตัดไม่เสร็จภายใน 90 วินาที', 'Trim confirmation did not finish within 90 seconds'));
      }
      const saved = !!saveAt && confirmClickedAt >= saveAt;
      if (saved) {
        const extra = await waitFor(() => [...document.querySelectorAll(SEL.paperDialog)].filter(visible)
          .map((d) => [...d.querySelectorAll('button')].find((b) => visible(b) && !isDisabled(b) && TXT.okOrGotIt.test(b.innerText.trim())))
          .find(Boolean), 3000);
        if (extra) extra.click();
      }
      setResult(item, saved ? 'saved' : 'skipped', saved ? times : L('ยกเลิก', 'Cancelled'));
    }

    /* ---------- สถานะ ---------- */
    const TRIM_STEPS = [L('เปิดคลิป', 'Open video'), L('เช็ก claim', 'Check claim'), 'Take action', L('หน้าตัด', 'Trim editor'), 'Save', L('ยืนยัน', 'Confirm')];
    let trimStage = { idx: -1, detail: '' };
    let transient = null;
    let workerHere = true;
    const setTrimStage = (idx, detail = '') => { trimStage = { idx, detail }; renderStatus(); };
    function flash(title, detail = '', kind = 'ok', ms = 8000) {
      const ic = { ok: '✅', err: '⚠️', wait: '⏳', busy: '⚙️' }[kind] || 'ℹ️';
      transient = { icon: ic, title, detail, kind, until: Date.now() + ms };
      renderStatus();
    }
    const dur = (ms) => {
      const m = Math.max(0, Math.round(ms / 60000));
      return m < 60 ? L(`${m} นาที`, `${m} min`) : L(`${Math.floor(m / 60)} ชม. ${m % 60} นาที`, `${Math.floor(m / 60)} h ${m % 60} min`);
    };

    function computeStatus() {
      const run = getRun();
      if (collabScanning) return { icon: '🤝', kind: 'busy', title: L('กำลังอ่านรายการคลิปสำหรับ Collab', 'Reading videos for Collab'), detail: (scanProg || {}).label || '', progress: null };
      if (scanning || adsScanning) {
        const p = scanProg || { label: L('กำลังเริ่ม…', 'Starting…') };
        return { icon: adsScanning ? '💰' : '🔍', kind: 'busy', title: adsScanning ? L('กำลังหาคลิปที่ปิดโฆษณา', 'Finding videos with ads off') : L('กำลังสแกน claim ของช่องนี้', 'Scanning this channel\'s claims'),
          detail: p.label, progress: p.total ? p.done / p.total : null };
      }
      const crun = getCollabRun();
      if (crun && crun.active) {
        const fin = crun.items.filter((i) => i.state !== 'pending').length;
        const cur = crun.items.find((i) => i.state === 'pending');
        return { icon: '🤝', kind: 'busy', title: L(`กำลังเชิญ Collab คลิป ${Math.min(fin + 1, crun.items.length)} จาก ${crun.items.length}`, `Inviting collaborators: video ${Math.min(fin + 1, crun.items.length)} of ${crun.items.length}`),
          detail: cur ? cur.video : L('กำลังจบ…', 'Finishing…'), progress: crun.items.length ? fin / crun.items.length : 0,
          steps: COLLAB_STEPS, stepIdx: workerHere ? collabStage.idx : -1, stepDetail: workerHere ? collabStage.detail : L('↪ ทำงานอยู่ในแท็บ Studio อื่น', '↪ Running in another Studio tab') };
      }
      const arun = getAdsRun();
      if (arun && arun.active) {
        const fin = arun.items.filter((i) => i.state !== 'pending').length;
        const cur = arun.items.find((i) => i.state === 'pending');
        return { icon: '💰', kind: 'busy', title: L(`กำลังเปิดโฆษณา คลิป ${Math.min(fin + 1, arun.items.length)} จาก ${arun.items.length}`, `Turning on ads: video ${Math.min(fin + 1, arun.items.length)} of ${arun.items.length}`),
          detail: cur ? cur.video : L('กำลังจบ…', 'Finishing…'), progress: arun.items.length ? fin / arun.items.length : 0,
          steps: ADS_STEPS, stepIdx: workerHere ? adsStage.idx : -1, stepDetail: workerHere ? adsStage.detail : L('↪ ทำงานอยู่ในแท็บ Studio อื่น', '↪ Running in another Studio tab') };
      }
      if (run && run.active) {
        const todo = run.items.filter((i) => i.state !== 'later');
        const finished = todo.filter((i) => i.state !== 'pending').length;
        const cur = todo.find((i) => i.state === 'pending');
        return { icon: '✂️', kind: 'busy', title: L(`กำลังตัด claim ${Math.min(finished + 1, todo.length)} จาก ${todo.length}`, `Trimming claim ${Math.min(finished + 1, todo.length)} of ${todo.length}`),
          detail: cur ? `${cur.video} — ${cur.song}` : L('กำลังจบ…', 'Finishing…'), progress: todo.length ? finished / todo.length : 0,
          steps: TRIM_STEPS, stepIdx: workerHere ? trimStage.idx : -1, stepDetail: workerHere ? trimStage.detail : L('↪ ทำงานอยู่ในแท็บ Studio อื่น', '↪ Running in another Studio tab') };
      }
      if (transient && transient.until > Date.now()) return transient;
      if (fuBusy) return { icon: '🔄', kind: 'busy', title: L('กำลังเช็กว่า YouTube ตัดครั้งก่อนเสร็จหรือยัง…', 'Checking whether YouTube finished the previous trim…'), detail: '' };
      if (apBusy) return { icon: '🤖', kind: 'busy', title: L('Auto-pilot กำลังเริ่มรอบใหม่…', 'Auto-pilot starting a new cycle…'), detail: '' };
      const waiting = fuCount();
      if (waiting) {
        const vids = Object.keys(fuGet()).length;
        return { icon: '⏳', kind: 'wait', title: L('รอ YouTube ประมวลผลการตัด', 'Waiting for YouTube to process trims'),
          detail: L(`รอตัดอีก ${waiting} claim ใน ${vids} คลิป · เช็กครั้งถัดไปในอีก ${dur(fuNext - Date.now())}`, `${waiting} claims left to trim in ${vids} videos · next check in ${dur(fuNext - Date.now())}`) };
      }
      const ap = getAP();
      if (ap.on) return { icon: '🤖', kind: 'ok', title: L('Auto-pilot เปิดอยู่', 'Auto-pilot is on'), detail: uploadBusy() ? L('⏸ รอคิวอัปโหลดเสร็จ', '⏸ Waiting for the upload queue to finish') : L(`สแกน + ตัดครั้งถัดไปในอีก ${dur((ap.next || 0) - Date.now())}`, `Next scan + trim in ${dur((ap.next || 0) - Date.now())}`) };
      const n = getCounts();
      if (n.hasScan) {
        return { icon: '✓', kind: 'idle', title: L('พร้อม', 'Ready'), detail: L(`สแกนล่าสุด ${dur(Date.now() - new Date(n.scanDate).getTime())} ที่แล้ว: ${n.claims} claim ใน ${n.claimVideos} คลิป`, `Last scan ${dur(Date.now() - new Date(n.scanDate).getTime())} ago: ${n.claims} claims in ${n.claimVideos} videos`) };
      }
      return { icon: '✓', kind: 'idle', title: L('พร้อม', 'Ready'), detail: L('กด "สแกน claim" เพื่อเช็กช่องนี้', 'Click "Scan claims" to check this channel') };
    }

    /* ---------- แผงในแท็บ "ลิขสิทธิ์" ---------- */
    let logBox = null;
    function log(msg, type = '') {
      console.log('[Upload Studio]', msg);
      if (type === 'err') flash(L('มีเรื่องต้องดู', 'Needs attention'), msg, 'err', 12000);
      if (!logBox) return;
      logBox.prepend(h('div', { className: type ? 'tbx-' + type : '' }, new Date().toLocaleTimeString(LOCALE).slice(0, 5) + '  ' + msg));
      while (logBox.childElementCount > 80) logBox.lastChild.remove();
    }

    const UI = {};
    function buildPane() {
      logBox = h('div', { id: 'tbx-log', hidden: !load('logOpen', false) });
      UI.card = h('div', { className: 'tbx-card idle' });
      UI.lang = h('div', { className: 'tbx-note tbx-err', hidden: true },
        L('⚠ Studio ตั้งเป็นภาษาไทยอยู่ — ส่วนตัด claim / เปิดโฆษณาอัตโนมัติต้องใช้ Studio ภาษาอังกฤษ (รูปโปรไฟล์ → Language → English) การสแกนใช้ได้ทุกภาษา', '⚠ Studio is set to Thai — auto claim trimming / ads need Studio in English (profile picture → Language → English). Scanning works in any language'));
      UI.scanBtn = h('button', { className: 'btn go', onclick: () => scanClaims() }, icon('scan', 16), L('สแกน claim', 'Scan claims'));
      UI.adsTxt = h('span', {}, L('โฆษณาปิดอยู่', 'Ads off'));
      UI.listTxt = h('span', {}, L('รายการ claim', 'Claim list'));
      UI.songTxt = h('span', {}, L('เพลงที่เคยโดน', 'Claimed songs'));
      UI.adsBtn = h('button', { className: 'btn', onclick: () => (chGet('adsScan', null) ? showAds() : scanAds()), title: L('หาคลิปที่ปิดโฆษณาแล้วเปิดให้', 'Find videos with ads off and turn them on') }, icon('paid', 16), UI.adsTxt);
      UI.stopBtn = h('button', { className: 'btn danger', onclick: () => { stopTrimRun(L('คุณกดหยุด', 'You stopped it'), true); stopAdsRun(L('คุณกดหยุด', 'You stopped it')); stopCollabRun(L('คุณกดหยุด', 'You stopped it')); renderStatus(); } }, icon('stop', 14), L('หยุด', 'Stop'));
      UI.listBtn = h('button', { className: 'btn', onclick: showClaims }, icon('queue', 16), UI.listTxt);
      UI.collabBtn = h('button', { className: 'btn', onclick: () => (chGet('collabScan', null) ? showCollab() : scanCollab()), title: L('เลือกคลิปที่อัปแล้ว แล้วเชิญช่องอื่นเป็นผู้ร่วมสร้าง', 'Pick uploaded videos and invite other channels as collaborators') }, icon('collab', 16), 'Collab');
      UI.songBtn = h('button', { className: 'btn', onclick: showSongs, title: L('เพลงและศิลปินที่เคยโดน claim ทุกช่อง', 'Songs and artists that have been claimed across all channels') }, icon('music', 16), UI.songTxt);
      UI.apTog = h('input', { type: 'checkbox', onclick: (e) => { e.preventDefault(); toggleAutopilot(); } });
      UI.apSub = h('small');
      UI.logBtn = h('button', { className: 'btn ghost sm', onclick: () => {
        logBox.hidden = !logBox.hidden;
        save('logOpen', !logBox.hidden);
        UI.logBtn.textContent = logBox.hidden ? L('แสดงกิจกรรม ▾', 'Show activity ▾') : L('ซ่อนกิจกรรม ▴', 'Hide activity ▴');
      } }, logBox.hidden ? L('แสดงกิจกรรม ▾', 'Show activity ▾') : L('ซ่อนกิจกรรม ▴', 'Hide activity ▴'));
      UI.row1 = h('div', { className: 'tbx-grid3' }, UI.scanBtn, UI.adsBtn, UI.stopBtn);
      UI.row2 = h('div', { className: 'tbx-grid2', style: 'grid-template-columns:1fr 1fr 1fr' }, UI.listBtn, UI.songBtn, UI.collabBtn);
      return h('div', {},
        UI.lang,
        h('div', { className: 'sec' }, h('h4', {}, icon('shield', 13), L('สถานะ', 'Status')), UI.card, UI.row1, UI.row2),
        h('div', { className: 'sec' },
          h('label', { className: 'sw' }, UI.apTog, h('span', { className: 't' }), h('span', {}, h('b', { style: 'display:flex;align-items:center;gap:6px' }, icon('robot', 16), 'Auto-pilot'), UI.apSub)),
          h('div', { className: 'row', style: 'margin-top:6px;flex-wrap:wrap' },
            h('button', { className: 'btn sm', onclick: openSettings }, icon('sliders', 13), L('ตั้งค่าลิขสิทธิ์', 'Copyright settings')),
            h('button', { className: 'btn sm', onclick: () => showTracklistFix('') }, icon('note', 14), L('แก้ tracklist', 'Fix tracklist')),
            h('button', { className: 'btn sm', onclick: uploadsCSV, title: L('ประวัติคลิปที่อัปผ่านสคริปต์นี้', 'History of videos uploaded with this script') }, icon('history', 14), L('ประวัติการอัป', 'Upload history')))),
        h('div', { className: 'sec' }, h('div', { className: 'row' }, h('b', { style: 'flex:1' }, L('กิจกรรม', 'Activity')), UI.logBtn), logBox));
    }

    let lastStatusSig = '';
    function renderStatus() {
      if (!UI.card) return;
      const s = computeStatus();
      const run = getRun();
      const arun = getAdsRun();
      const crun = getCollabRun();
      const busyRun = !!(run && run.active) || !!(arun && arun.active) || !!(crun && crun.active);
      const busyScan = scanning || adsScanning || collabScanning;
      const n = getCounts();
      const ap = getAP();
      const c = cfg();
      const waiting = fuCount();
      // tick เรียกทุก 0.8 วินาที — ถ้าไม่มีอะไรเปลี่ยน ก็ไม่ต้องสร้าง DOM ใหม่
      const sig = JSON.stringify([s, busyRun, busyScan, n, ap.on, c.apEveryHours, waiting, studioIsEnglish()]);
      if (sig === lastStatusSig) return;
      lastStatusSig = sig;
      UI.card.className = 'tbx-card ' + (s.kind || 'idle');
      const kids = [h('div', { className: 'ti' }, h('span', { className: 'sti' }, emojiIcon(s.icon, 17)), h('span', {}, s.title))];
      if (s.detail) kids.push(h('div', { className: 'de' }, s.detail));
      if (s.progress !== undefined) kids.push(h('div', { className: 'tbx-bar' + (s.progress === null ? ' ind' : '') }, h('i', { style: `width:${Math.round((s.progress || 0) * 100)}%` })));
      if (s.steps) {
        kids.push(h('div', { className: 'tbx-steps' }, s.steps.map((t, i) =>
          h('span', { className: i < s.stepIdx ? 'done' : i === s.stepIdx ? 'now' : '' }, (i < s.stepIdx ? '✓ ' : i === s.stepIdx ? '● ' : '') + t))));
        if (s.stepDetail) kids.push(h('div', { className: 'tbx-sd' }, s.stepDetail));
      }
      UI.card.replaceChildren(...kids);
      UI.listTxt.textContent = n.hasScan ? L(`รายการ claim (${n.claims})`, `Claim list (${n.claims})`) : L('รายการ claim', 'Claim list');
      UI.songTxt.textContent = L(`เพลงที่เคยโดน (${n.songs})`, `Claimed songs (${n.songs})`);
      UI.adsTxt.textContent = n.hasAdsScan ? L(`โฆษณาปิดอยู่ (${n.adsTodo})`, `Ads off (${n.adsTodo})`) : L('โฆษณาปิดอยู่', 'Ads off');
      UI.scanBtn.hidden = UI.adsBtn.hidden = busyRun || busyScan;
      UI.stopBtn.hidden = !busyRun && !waiting; // มีคิวตัดต่อรออยู่ก็กดหยุดได้
      UI.row2.hidden = busyRun || busyScan;
      UI.row1.className = busyRun ? 'tbx-grid1' : 'tbx-grid3';
      UI.apTog.checked = !!ap.on;
      UI.apSub.textContent = ap.on ? L(`เปิด · สแกน + ตัดทุก ${c.apEveryHours} ชม.`, `On · scan + trim every ${c.apEveryHours} h`) : L('ปิด · สแกนและตัดอัตโนมัติตามรอบเวลา', 'Off · scan and trim automatically on a schedule');
      UI.lang.hidden = studioIsEnglish();
      if (tabCount.claims) tabCount.claims.textContent = busyRun ? '●' : '';
    }

    /* ---------- ตั้งค่า ---------- */
    const SETTINGS = [
      { title: L('Claim และการตัด', 'Claims and trimming'), items: [
        ['ownNames', L('ชื่อศิลปิน / ค่ายของตัวเอง', 'Your own artist / label names'), L('claim ที่มีชื่อเหล่านี้จะถูกมาร์ก ★ เพลงของคุณเอง (คั่นด้วย ,)', 'Claims with these names are marked ★ your own music (comma-separated)')],
        ['autoSaveTrim', L('ตัดอัตโนมัติทั้งหมด', 'Fully automatic trim'), L('กด Save ในหน้าตัด → ติ๊ก "I acknowledge" → กด "Confirm changes" ให้ ถ้าปิด คุณต้องยืนยันเองทีละอัน', 'Clicks Save in the trim editor → ticks "I acknowledge" → clicks "Confirm changes" for you. If off, you confirm each one yourself')],
        ['autoSaveManualTrim', L('ตอนตัดเองด้วยมือ: กด Save และ Confirm changes ให้อัตโนมัติ', 'When trimming manually: auto-click Save and Confirm changes'), L('ปิดไว้ดีกว่า — ถ้าเปิด สคริปต์จะกด Save หลังเปิดหน้าตัด 1.5 วินาที และยืนยันทุกหน้าต่าง "Confirm changes" (รวม mute / replace song) ให้ทันที', 'Better left off — if on, the script clicks Save 1.5 seconds after the trim editor opens and immediately confirms every "Confirm changes" dialog (including mute / replace song)')],
        ['followUpMinutes', L('เช็กทุก N นาที', 'Check every N minutes'), L('คลิปที่มี 2 claim ขึ้นไป: ความถี่ในการเช็กว่าการตัดครั้งก่อนเสร็จหรือยัง', 'Videos with 2+ claims: how often to check whether the previous trim has finished')],
      ] },
      { title: 'Auto-pilot', items: [
        ['apEveryHours', L('ทำงานทุก N ชั่วโมง', 'Run every N hours')],
        ['apOnlyImpact', L('เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)', 'Only claims that affect the video (no revenue / restricted / blocked)')],
        ['apSkipOwn', L('ไม่ตัดเพลงของตัวเอง (★)', 'Don\'t trim your own music (★)')],
        ['apMaxPct', L('ข้าม claim ที่ยาวเกิน N % ของคลิป', 'Skip claims longer than N % of the video')],
        ['apMaxPerCycle', L('จำนวน claim สูงสุดต่อรอบ', 'Max claims per cycle')],
        ['apAdsOn', L('เปิดโฆษณาให้คลิปที่ปิดไว้ด้วย', 'Also turn on ads for videos that have them off'), L('เฉพาะคลิปที่ปิดในการตั้งค่า ไม่รวมคลิปที่ YouTube แจ้งว่าไม่มีสิทธิ์', 'Only videos turned off in settings, not ones YouTube marks as ineligible')],
      ] },
    ];
    function openSettings() {
      const c = cfg();
      const fields = {};
      const kids = [h('h3', {}, L('ตั้งค่าลิขสิทธิ์', 'Copyright settings'))];
      for (const sc of SETTINGS) {
        kids.push(h('div', { className: 'tbx-sec' }, sc.title));
        for (const [k, label, hint] of sc.items) {
          let input;
          if (typeof DEFAULTS[k] === 'boolean') {
            input = h('input', { type: 'checkbox', checked: c[k] });
            kids.push(h('label', { className: 'tbx-cb' }, input, h('span', {}, label, hint ? h('div', { className: 'mut' }, hint) : null)));
          } else {
            input = h('input', { type: 'text', value: c[k] });
            kids.push(h('div', { className: 'lbl' }, h('span', {}, label), hint ? h('span', {}, hint) : null), input);
          }
          fields[k] = input;
        }
      }
      let resetArmed = false;
      const resetBtn = h('button', { className: 'btn sm danger', onclick: () => {
        if (!resetArmed) { resetArmed = true; resetBtn.textContent = L('กดอีกครั้งเพื่อคืนค่า', 'Click again to reset'); return; }
        saveCfg({}); closeModal(); renderStatus(); log(L('คืนค่าตั้งค่าลิขสิทธิ์แล้ว', 'Copyright settings reset'), 'ok');
      } }, L('คืนค่าเริ่มต้น', 'Reset to defaults'));
      kids.push(h('div', { className: 'row', style: 'margin-top:16px' },
        resetBtn, h('span', { style: 'flex:1' }),
        h('button', { className: 'btn sm', onclick: () => closeModal() }, L('ยกเลิก', 'Cancel')),
        h('button', { className: 'btn go sm', onclick: () => {
          const n = Object.assign({}, cfg());
          for (const [k, el] of Object.entries(fields)) n[k] = el.type === 'checkbox' ? el.checked : el.value;
          saveCfg(n); closeModal(); renderStatus(); flash(L('บันทึกการตั้งค่าแล้ว', 'Settings saved'));
        } }, L('บันทึก', 'Save'))));
      openModal(...kids);
    }

    /* ---------- loop หลัก (ส่วนลิขสิทธิ์) ---------- */
    let trimStarting = false;
    function tick() {
      const run = getRun();
      const running2 = !!(run && run.active);
      // แย่งสิทธิ์ทำงานเฉพาะตอนแท็บนี้กำลังทำงานที่เปลี่ยนหน้าอยู่ (การสแกนอ่านอย่างเดียว ไม่ต้องแย่งจากแท็บที่กำลังตัด)
      const busy = trimBusy || apBusy || fuBusy || adsBusy || collabBusy;
      const ready = !!ycfg('INNERTUBE_CONTEXT') && isWorker(busy);
      workerHere = ready;
      const arun = getAdsRun();
      const crun = getCollabRun();
      const adsRunning = !!(arun && arun.active) || !!(crun && crun.active);
      // งานที่ต้องเปลี่ยนหน้า (ตัด / เปิดโฆษณา / Collab) รอจนคิวอัปโหลดว่าง และไม่เปลี่ยนหน้าระหว่างที่แท็บนี้กำลังสแกน
      const canNavigate = !uploadBusy() && !scanning && !adsScanning && !collabScanning;
      if (ready && canNavigate && adsRunning && !running2 && !adsBusy && !collabBusy && !trimBusy && !trimStarting) {
        trimStarting = true;
        setTimeout(() => { trimStarting = false; crun && crun.active ? collabStep() : adsStep(); }, 2500);
      }
      const ap = getAP();
      if (ready && canNavigate && !adsRunning && !adsScanning && ap.on && !running2 && !apBusy && !scanning && Date.now() >= (ap.next || 0)) apCycle();
      if (ready && canNavigate && !adsRunning && !adsScanning && !running2 && !apBusy && !scanning && !fuBusy && Date.now() >= fuNext && fuCount()) fuCheck();
      if (ready && canNavigate && running2 && !trimBusy && !adsBusy && !collabBusy && !trimStarting) {
        trimStarting = true;
        setTimeout(() => { trimStarting = false; trimStep(); }, 2500);
      }
      // ตัดเองด้วยมือในหน้า claim: กด Save ให้เฉพาะเมื่อเปิดตั้งค่าไว้ / ยืนยัน "Confirm changes" ให้เมื่อเปิดตัดอัตโนมัติ
      const c = cfg();
      if (!running2 && /\/video\/[^/]+\/(claims|copyright)/.test(location.pathname)) {
        if (c.autoSaveManualTrim) {
          const ed = document.querySelector(SEL.trimDialog);
          const sb = ed && (ed.querySelector(`${SEL.trimContinue} button`) || ed.querySelector(SEL.trimContinue));
          if (visible(sb) && !isDisabled(sb) && !findConfirmDialog() && !ed.__tbxSaving) {
            ed.__tbxSaving = true;
            setTimeout(() => {
              if (visible(sb) && !isDisabled(sb)) { log(L('บันทึกการตัดให้อัตโนมัติ…', 'Auto-saving trim…')); sb.click(); }
              setTimeout(() => { ed.__tbxSaving = false; }, 10000);
            }, 1500);
          }
        }
        if (c.autoSaveManualTrim) {
          const cd = findConfirmDialog();
          if (cd && !cd.__tbxSeen) { cd.__tbxSeen = true; approveConfirm(cd).then(() => setTimeout(() => { cd.__tbxSeen = false; }, 8000)); }
        }
      }
      renderStatus();
    }

    return { buildPane, tick, claimedSongsIn, fixTracklist, renderStatus, status: computeStatus, listScheduled, listTopVideos, videoText };
  })();
  panes.claims = Claims.buildPane();
  let tickFailed = false;
  let progressFailed = false;
  setInterval(() => {
    // แยก try สองก้อน: ส่วนลิขสิทธิ์พังไม่ควรทำให้แถบความคืบหน้าหยุด และกลับกันด้วย
    try {
      Claims.tick();
    } catch (e) {
      console.error('[Upload Studio] tick', e);
      if (!tickFailed) {
        tickFailed = true; // บอกครั้งเดียว ไม่ต้องเตือนทุกรอบ
        toast(L('⚠ ส่วนลิขสิทธิ์หยุดทำงาน: ' + e.message + ' — ลองรีโหลดหน้า',
          '⚠ The copyright section stopped: ' + e.message + ' — try reloading the page'));
      }
    }
    try {
      pollUploadProgress();
      renderActivity();
    } catch (e) {
      console.error('[Upload Studio] progress', e);
      if (!progressFailed) {
        progressFailed = true;
        toast(L('⚠ แถบความคืบหน้าหยุดทำงาน: ' + e.message + ' — ลองรีโหลดหน้า',
          '⚠ The progress bar stopped: ' + e.message + ' — try reloading the page'));
      }
    }
  }, 800);

  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    // กำลังพิมพ์ในช่องข้อความ: ปล่อยให้พิมพ์ (บน Mac Option+P / Option+เลข คือการพิมพ์อักษรพิเศษ)
    const t = e.target;
    if (/Mac/i.test(navigator.platform) && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.code === 'KeyP') {
      drawer.classList.contains('open') ? closeDrawer() : openDrawer();
      e.preventDefault();
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const p = presets[Number(e.code.slice(5)) - 1];
      if (p) {
        activeId = p.id;
        save('activeId', activeId);
        refreshLabels();
        toast(L(`พรีเซ็ตหลัก: ${p.label}`, `Main preset: ${p.label}`));
        e.preventDefault();
      }
    }
  });

  root.classList.toggle('dark', document.documentElement.hasAttribute('dark'));
  applyGlass();
  root.append(fab, drawer, toastEl);
  document.body.append(root);
  showTab('queue');
  refreshLabels();
  renderQueue();
  updateChannelUI();
})();
