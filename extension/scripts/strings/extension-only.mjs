// L() pairs the userscript never had, and why each is new.
export default [
  // Phase 2: the runner talks to the side panel, files come through the bridge, one tab runs
  { th: 'ยืนยันการอัปโหลดในแผงด้านข้างก่อน', en: 'Confirm the upload in the side panel first', why: 'the start confirmation moved to the panel' },
  { th: 'ส่วนขยายถูกโหลดใหม่ระหว่างอัปโหลด — ถ้าหน้าต่างอัปโหลดของ Studio ยังเปิดอยู่ ให้ทำต่อแล้วกด Save เอง', en: "The extension was reloaded during an upload — if Studio's upload dialog is still open, finish that upload and click Save yourself", why: 'extension reloads orphan a running content script' },
  { th: 'ไม่พบไฟล์นี้แล้ว — เพิ่มไฟล์อีกครั้ง', en: 'This file is no longer available — add it again', why: 'file bridge: missing handle' },
  { th: 'ยังไม่ได้อนุญาตให้อ่านไฟล์ — กด "อนุญาตอีกครั้ง" ในแผงด้านข้าง', en: 'No permission to read this file — click "Re-grant access" in the side panel', why: 'file bridge: permission back to prompt after a restart' },
  { th: 'อ่านไฟล์ไม่ได้ (ถูกย้ายหรือเปลี่ยนชื่อ?) — เพิ่มไฟล์อีกครั้ง', en: 'Could not read this file (moved or renamed?) — add it again', why: 'file bridge: read failed' },
  { th: 'ดึงไฟล์จากแผงด้านข้างไม่ได้ (${})', en: 'Could not get the file from the side panel (${})', why: 'file bridge: other failure' },
  { th: 'ไฟล์นี้มาจากหน้าต่างอัปโหลดของ Studio และหายไปเมื่อโหลดหน้าใหม่ — เพิ่มไฟล์อีกครั้ง', en: "This file came from Studio's own upload dialog and was lost when the page reloaded — add it again", why: 'intercepted files live in the page only' },
  { th: 'ภาพปก "${}": ', en: 'Thumbnail "${}": ', why: 'prefix for a thumbnail file error' },
  { th: 'แท็บ Studio นี้ไม่ได้อัปโหลดคิวอยู่', en: 'Nothing is running in this Studio tab', why: 'Stop sent to a tab that is not running' },
  { th: 'ลบวิดีโอที่กำลังอัปโหลดไม่ได้', en: "Can't remove the video that is being uploaded", why: 'Remove on the item the run is fetching' },
  { th: 'มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่', en: 'Another Studio tab is already running the queue', why: 'one runner across tabs' },
  { th: 'ส่วนขยายถูกโหลดใหม่ — หยุดคิวในหน้านี้แล้ว', en: 'The extension was reloaded — the queue stopped in this page', why: 'orphaned run' },
  { th: 'ช่องเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', en: 'The channel changed after you confirmed — click Start again to see the new summary', why: 'confirmation and start are two messages' },
  { th: 'คิวเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', en: 'The queue changed after you confirmed — click Start again to see the new summary', why: 'confirmation and start are two messages' },
  { th: 'แผงด้านข้างไม่ตอบเรื่องไฟล์ — โหลดแท็บ Studio ใหม่ แล้วกดเริ่มอีกครั้ง', en: "The side panel's file access is not answering — reload the Studio tab, then start again", why: 'bridge probe before a run' },
  { th: 'หน้าโหลดใหม่ระหว่างอัปโหลด — ดูใน Content ว่ามีฉบับร่างค้างไหม แล้วค่อยกดลองใหม่', en: 'The page reloaded during the upload — check Content for a leftover draft, then retry', why: 'the queue survives reloads now' },
  { th: 'แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', en: 'Another Studio tab is running the queue — change the queue there', why: 'one runner across tabs' },
  { th: 'เพิ่มไม่ได้ ${} ไฟล์: ', en: 'Could not add ${} file(s): ', why: 'bridge failures when adding' },
  // Phase 3a: settings writes go through the background store writer
  { th: 'บันทึกการตั้งค่าไม่สำเร็จ — ตารางเวลาหรือเลข EP อาจคลาดเคลื่อนตลอดการรันนี้', en: "Couldn't save a settings change — the schedule or EP numbers may be off for the rest of the run", why: "the background writer can fail; the userscript wrote synchronously" },
  // Phase 3a: the side panel
  { th: 'แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', en: 'This tab is not connected to the extension yet — reload this tab', why: 'Studio tab opened before the extension (re)loaded: no content script to talk to' },
  { th: 'โหลดแท็บนี้ใหม่', en: 'Reload this tab', why: 'button for the banner above, and the in-page banner after an extension update (3b)' },
  { th: 'ไปที่แท็บนั้น', en: 'Go to that tab', why: 'the run is in another Studio tab' },
  { th: 'การสแกนและตัดส่วนที่ติดลิขสิทธิ์จะมาในเวอร์ชันถัดไปของส่วนขยาย', en: 'Copyright scan and trim arrive in a later version of the extension', why: 'placeholder tab until Phase 4' },
  { th: 'สลับช่องไม่สำเร็จ (${})', en: "Couldn't switch channels (${})", why: 'channel:switch is a message to the Studio tab and can fail; the drawer called the switcher directly' },
  { th: 'บันทึกไม่สำเร็จ (${})', en: "Couldn't save (${})", why: 'store writes are messages to the background and can reject; the drawer wrote synchronously' },
  // Phase 3a: Settings tab, backup export / import
  { th: 'หยุดคิวก่อนแล้วค่อยนำเข้า', en: 'Stop the queue before importing', why: 'import refused only while a run is in progress (no reload any more)' },
  { th: 'พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้และภาษาไม่เปลี่ยน)', en: 'Existing presets and settings on this device will be replaced (locked channel and language stay unchanged).', why: 'the drawer sentence without "and the page will reload"' },
  { th: 'นำเข้าพรีเซ็ต ${} รายการแล้ว', en: 'Imported ${} presets', why: 'the drawer reloaded the page instead of confirming' },
  { th: ' เปิดแผง · ', en: ' open the panel · ', why: 'Alt+P opens the side panel; it cannot close it' },
  { th: 'นำเข้าไม่สำเร็จ (${})', en: "Couldn't import (${})", why: 'backup:write is a message to the background and can reject; the drawer wrote synchronously' },
  { th: 'ส่งออกไม่สำเร็จ (${})', en: "Couldn't export (${})", why: 'export reads extension storage asynchronously and can fail; the drawer read in memory' },
  { th: 'คัดลอกข้อมูลหน้าต่างอัปโหลดไม่สำเร็จ (${})', en: "Couldn't copy the upload dialog info (${})", why: 'diag:dialogInfo is a message to the Studio tab (and clipboard writes) that can fail; the drawer ran it in the page' },
  { th: 'อ่านคิวจากแท็บ Studio ไม่สำเร็จ (${})', en: "Couldn't read the queue from the Studio tab (${})", why: 'queue:view is a message to the Studio tab and its handler can fail; the drawer read the queue in the page' },
  // Phase 3a: Presets tab
  { th: 'ใส่ลงหน้าต่างที่เปิดอยู่ไม่สำเร็จ (${})', en: "Couldn't apply to the open window (${})", why: 'fill:apply is a message to the Studio tab and fails when none is bound or connected; the drawer ran it in the page' },
  // Phase 3b: the Upload tab, FAB, banner
  { th: 'ไฟล์ในคิวต้องขออนุญาตอ่านอีกครั้งหลังเปิดเบราว์เซอร์ใหม่', en: 'Files in the queue need read access again after a browser restart', why: 'file handles lose permission after a restart (spec: File intake step 4)' },
  { th: 'อนุญาตอีกครั้ง (${} ไฟล์)', en: 'Re-grant access (${} files)', why: 'one click re-grants every queued file' },
  { th: 'จะหยุดคิวในแท็บ "${}" หลังคลิปปัจจุบันเสร็จ', en: 'Will stop the queue in the tab "${}" after the current video finishes', why: 'Stop is sent to the tab that runs the queue, which may not be this panel\'s tab (D14)' },
  { th: 'ส่วนขยายถูกอัปเดตหรือโหลดใหม่ — โหลดแท็บนี้ใหม่เพื่อใช้งานต่อ', en: 'The extension was updated or reloaded — reload this tab to keep using it', why: 'orphaned content script (spec: Error handling)' },
];
