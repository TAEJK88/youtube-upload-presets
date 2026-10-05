// Every regex matched against text Studio renders. Copied verbatim from the userscript (v4.26.1).
export const TXT = {
  // --- ใช้ได้ทั้งอังกฤษและไทย ---
  acceptInvite: /^(accept|accept invitation|accept invite|ยอมรับ|ยอมรับคำเชิญ)$/i, // ปุ่มยอมรับคำเชิญสิทธิ์ช่อง
  noPermission: /don.t have permission to view this page|ไม่มีสิทธิ์เข้าดูหน้านี้/i, // หน้า Oops ของ Studio
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
