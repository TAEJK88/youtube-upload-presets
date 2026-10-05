// Every Studio selector. Copied verbatim from the userscript (v4.26.1).
export const SEL = {
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
  monetRadio: (on: 'on' | 'off') => `#radio-${on}`, // on | off
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
