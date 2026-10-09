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
];
