// Pairs of the userscript's drawer (lines 2428–4586) the side panel doesn't show, and why.
export default [
  { th: 'ปิด (Alt+P)', en: 'Close (Alt+P)', why: "Chrome's side panel has its own close button; a page can't close it" },
  { th: 'ความทึบของแผง', en: 'Panel opacity', why: 'the docked panel is not see-through (spec: no opacity slider)' },
  { th: '${}% · น้อย = เห็นพื้นหลังมากขึ้น', en: '${}% · lower = more see-through', why: 'opacity slider removed' },
  { th: 'เปลี่ยนแล้วหน้าจะรีโหลด', en: 'The page reloads after changing', why: 'the language now changes without a reload' },
  { th: 'หยุดคิวก่อนแล้วค่อยเปลี่ยนภาษา', en: 'Stop the queue before changing language', why: 'no reload, so nothing to protect a run from' },
  { th: 'ล้างคิวอัปโหลดก่อนแล้วค่อยนำเข้า (หน้าจะรีโหลด ไฟล์ในคิวจะหาย)', en: 'Clear the upload queue before importing (the page reloads and queued files would be lost)', why: 'import no longer reloads and the queue survives; replaced by "Stop the queue before importing"' },
  { th: 'พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้และภาษาไม่เปลี่ยน) แล้วหน้าจะรีโหลด', en: 'Existing presets and settings on this device will be replaced (locked channel and language stay unchanged) and the page will reload.', why: 'no reload any more; the same sentence without its last clause is in extension-only' },
  { th: '.mp4 คลิป', en: '.mp4 video', why: 'Design B hid these drop-zone chips (.drop .kbd{display:none})' },
  { th: '.txt คำอธิบาย', en: '.txt description', why: 'hidden in Design B' },
  { th: '.jpg ภาพปก', en: '.jpg thumbnail', why: 'hidden in Design B' },
  { th: ' เปิด/ปิดแผง · ', en: ' toggle panel · ', why: 'Alt+P opens the side panel but cannot close it; replaced by " open the panel · "' },
];
