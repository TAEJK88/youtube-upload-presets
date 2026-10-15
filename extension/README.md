# YouTube Upload Presets — Chrome extension

Replaces the Tampermonkey userscript in the repo root. Design:
`docs/superpowers/specs/2026-10-05-chrome-extension-design.md`. Every difference from the
userscript, row by row: `PARITY.md`. What each version brought: `CHANGELOG.md`.

For the team: "Install", "Update" and "Moving from the userscript" below.
ภาษาไทย: ดูหัวข้อ "สำหรับทีม (ภาษาไทย)" ถัดลงไป

## Install (for the team)

If you use the Tampermonkey script today, read "Moving from the userscript" first, and move
when the owner tells you to. That message comes once script v4.29.0 is out. Before it, only
the owner and one tester install the extension.

1. Download `youtube-upload-presets-extension-<version>-chrome.zip` from the newest release:
   https://github.com/TAEJK88/youtube-upload-presets/releases/latest
2. Make a folder that will stay where it is, for example `Documents/YouTube Upload Presets`.
   Unzip the file and put **what is inside it** (`manifest.json` and the rest) into that folder.
3. In Chrome open `chrome://extensions`, turn on **Developer mode** (top right), click
   **Load unpacked** and pick that folder. A card "YouTube Upload Presets" appears with its
   version number.
4. In Tampermonkey, turn the "YouTube Upload Presets" script **off**. Don't delete it yet
   (see "Moving from the userscript"). The two must not run together: while the script is on
   in a Studio tab, the extension starts no upload and no trim in that tab, and its panel
   says so.
5. Open YouTube Studio and click the extension's button in Chrome's toolbar (or press Alt+P;
   on a Mac that is Option+P). The panel opens at the side of the window.

The extension has no picture of its own yet. Chrome draws a plain tile with the letter Y for
it. If you can't find the button, click the puzzle-piece button in the toolbar and pin
"YouTube Upload Presets".

TODO(icons): when artwork is added under `public/icon/`, say what the icon looks like in five places: the paragraph above; its Thai twin under "ติดตั้งส่วนขยาย"; the record line of exit-check item 75; the "No artwork yet" bullet of "Known behaviour, Phase 5" (both desktop notifications then show the icon, not a red dot); and the last paragraph of `CHANGELOG.md`'s 5.0.0 section. Then delete this line.

When Chrome starts it may show a box "Disable developer mode extensions". Close the box;
don't press its button.

The panel starts in English. For Thai: Settings → General → Language / ภาษา → ไทย.

The card on `chrome://extensions` shows the ID `cllefnlbgkbdnmifojjflfcpholhniio`. It is the same on every computer.

## Update

The panel shows "Update available: version … (you have …)" when a newer release exists. It
looks about once a day.

Let the upload queue and any trim finish before you update: reloading the extension stops
what it is doing in the page.

1. Click **Get the update** in that banner. It opens the release page; download the new zip.
2. Close the side panel in every Chrome window.
3. Delete what is inside your extension folder and put the new zip's contents there. Keep the
   folder itself, in the same place.
4. `chrome://extensions` → the extension's card → the round **reload** arrow. The card shows
   the new version.
5. Reload every open YouTube Studio tab and every youtube.com tab.
6. Open the side panel again.

If a Studio tab says "The extension was updated or reloaded — reload this tab to keep using
it", or the panel says "This tab is not connected to the extension yet — reload this tab":
that tab was missed in step 5. Reload it.

Your presets, settings, queue and history stay: they belong to the extension, not to the
folder. Don't press **Remove** on the extension's card: that deletes them. If clips were
waiting in the queue, the panel then says "Files in the queue need read access again — the
browser has withdrawn it": press Start as usual (it asks for the access itself), or click
**Re-grant access**. To be asked once and not after every update or restart: when that
banner shows, and **before** pressing Start or Re-grant access, click its other button,
**Always allow…**. A page opens in a new tab; press its button and, in Chrome's question,
pick **"Allow on every visit"**. After that the banner is expected not to come back
(expected from Chrome's documentation; not yet confirmed in Chrome, exit check 89). The
order matters: once Start or Re-grant has made the files readable, Chrome has nothing left
to ask and the page says so; the next chance is the next time the banner shows.

If you used a test build from before 5.0.0: that copy has a different id, and its data does
not follow by itself. Move like this. Until the last step you can go back: switch the new
copy off and the old one on again.

1. In the old copy, let the upload queue and any trim "Waiting for YouTube to process trims"
   finish, and turn Auto-pilot off on every channel.
2. Still in the old copy, save three things:
   Settings → Back up / share settings → **Export (.json)**;
   Copyright → Claimed songs → **⬇ CSV**, if you use that list;
   Settings → Troubleshooting → Open debug page → **Download report (.json)**.
   The export holds presets, the main preset, EP numbers, settings and copyright settings
   only. It does **not** hold upload history, the channel list, videos in the queue, claim
   scans, trim results, the trim list or Auto-pilot on/off. The debug report holds every
   stored key, so it is your record of the history and the channel list; the extension
   cannot import it.
3. On `chrome://extensions` switch the old copy **off** with its toggle. Do **not** press
   Remove: switched off, it keeps its data.
4. Load 5.0.0 from a **new folder** (Load unpacked), beside the old one.
5. In the new copy: import the `.json` as **My file**, import the songs CSV, scan each
   channel again, and turn Auto-pilot on again. The channel list fills itself as you open
   each channel in Studio. Upload history starts empty.
6. Look through presets, settings and the Copyright tab. Only when nothing you need is
   missing: press **Remove** on the old copy and delete its folder. Remove deletes the old
   copy's upload history, channel list, queue and scans for good.

## Moving from the userscript

**Move when the owner tells you to, and first update the script to v4.29.0** (Tampermonkey →
Dashboard → the script → "Check for userscript updates", or wait a day). Only that version has
**Export everything for the extension**. With an older version you can still move, but upload
history, your channel list and the language stay behind.

TODO(v4.29.0): the userscript's button labels ("Export everything for the extension" / "ส่งออกทุกอย่างเพื่อย้ายไปส่วนขยาย", "Export my data" / "ส่งออกข้อมูลของฉัน", "How to move"), its notice text and the file name `yt-upload-presets-move-YYYY-MM-DD.json` are the wording of Task 11 in `docs/superpowers/plans/2026-10-11-chrome-extension-phase-5.md`; that version is not built yet. When it is, compare them with the script in six places: this section, its Thai twin ("ย้ายจากสคริปต์ Tampermonkey"), exit-check items 79 and 80, "Known behaviour, Phase 5", and the "move file" line of `CHANGELOG.md`. Then delete this line.

What moves, and how:

| What | How |
|---|---|
| Presets, the main preset, EP numbers, settings, copyright settings | the export file (steps below) |
| Upload history, your channel list, the language | the same file, when it was exported with **Export everything for the extension** (userscript v4.29.0) and imported as **My file** |
| Claimed-songs history | a CSV: userscript Copyright → Claimed songs → ⬇ CSV; extension Copyright → Claimed songs → ⬆ Import CSV. It keeps titles, artists, claimants, counts and the first channel, not which video was which: a later rescan can count a video twice. Up to 16 MB |
| Claim scans, trim results, the trim list, Ads and Collab lists, Auto-pilot on/off | don't move: scan each channel again and turn Auto-pilot on again |
| Videos waiting in the queue | don't move: upload them first, or add the files again |
| The locked channel, the channels typed in the Collab box, where the round Studio button sits | don't move: set them again |
| "Copy from video" patterns (userscript v4.28.0) | don't move: the extension doesn't have that feature yet (see `CHANGELOG.md`) |

Do the move **once, before you change anything in the extension**. An import replaces the
extension's presets, settings and EP numbers with the file's. (Upload history and channels are
only added to, never replaced.)

1. In the userscript, let anything in progress finish: the upload queue, trim runs, and trims
   "Waiting for YouTube to process trims" (follow-up trims are not carried over).
2. Userscript: Settings → Back up / share settings → **Export everything for the extension**
   (or the notice's **Export my data**). It saves `yt-upload-presets-move-YYYY-MM-DD.json`.
   That file holds your own upload history and channels: don't share it as a preset backup.
   Also save the claimed-songs CSV if you use it.
3. Install the extension (see "Install") and turn the userscript **off** in Tampermonkey.
4. Extension: Settings → Back up / share settings → **Import** → pick the file → **My file**.
   The question tells you how many history rows and channels come along, and the language.
   (**Someone else's** takes the presets and general settings only: no history, no channels,
   no language.)
5. Copyright → Claimed songs → ⬆ Import CSV, if you saved one.
6. On each channel: Copyright → **Scan claims**, then turn Auto-pilot on again if you use it.
7. Keep the userscript installed but **off**. Deleting it in Tampermonkey deletes its stored
   data, and that is the only other copy of your upload history and claim history. Delete it
   only when you are sure nothing is missing in the extension, and keep the exported file.

### While the userscript is still on

**Turn the userscript off in Tampermonkey before you use the extension.** If both are on in a
Studio tab, the side panel shows "The Tampermonkey script is still on in this tab — turn it
off in Tampermonkey, then reload this tab. Uploads, trims and Auto-pilot wait until then".

In that tab the extension then:

- starts no upload queue, and no trim, ads or Collab run;
- makes its copyright steps wait, Auto-pilot's included (the status card says why);
- does not press Save or "Confirm changes" on a trim for you;
- stops a queue that was already running after the current video. This also covers a Start
  pressed just before the script showed up. The videos not yet uploaded stay in the queue and
  nothing starts again by itself.

Scans, the status card, editing and Stop still work. Turn the script off, then reload the tab.
A copyright run that was waiting goes on after that; press **Stop** first if you no longer
want it. An upload queue does not start again: press the start button (**Upload N
video(s)**).

**What the extension cannot hold back.** It can see the script only inside YouTube Studio,
and only some of its own work waits there. With both on, these still happen twice, or still
happen in the extension:

- on www.youtube.com: accepting a collaboration invite, and switching channel;
- in Studio: filling in an upload dialog you opened by hand, the quick-action bars under the
  title and description, and taking a multi-file pick from Studio's own upload dialog;
- on Studio's invite page: accepting the invite, and the reload after a channel switch that
  landed on an error page;
- the panel's own **Switch** (channel list) and **Apply to open window** buttons: one action
  each, when you press them;
- a Collab run whose invites were all sent before the script appeared: when it ends, or when
  you press Stop on it, it may still switch to your invited channel (only with "Auto-accept
  channel permission invites" on).

Turning the script off is the fix for all of these.

## สำหรับทีม (ภาษาไทย)

สามหัวข้อนี้คือเนื้อหาเดียวกับ "Install", "Update" และ "Moving from the userscript" ด้านบน
ชื่อปุ่มในส่วนขยายเขียนตามที่เห็นเมื่อตั้งแผงเป็นภาษาไทย

### ติดตั้งส่วนขยาย

ถ้าตอนนี้ยังใช้สคริปต์ Tampermonkey อยู่ ให้อ่านหัวข้อ "ย้ายจากสคริปต์ Tampermonkey" ก่อน
และรอให้เจ้าของโปรเจกต์บอกว่าย้ายได้แล้ว เขาจะบอกเมื่อสคริปต์เวอร์ชัน 4.29.0 ออก
ก่อนหน้านั้นมีแค่เจ้าของกับคนทดสอบอีกหนึ่งคนที่ติดตั้งส่วนขยาย

1. ดาวน์โหลดไฟล์ `youtube-upload-presets-extension-<เวอร์ชัน>-chrome.zip` จากหน้า release ล่าสุด:
   https://github.com/TAEJK88/youtube-upload-presets/releases/latest
2. สร้างโฟลเดอร์ที่จะวางไว้ที่เดิมตลอด เช่น `Documents/YouTube Upload Presets`
   แตกไฟล์ zip แล้วเอา **ของที่อยู่ข้างใน** (`manifest.json` กับไฟล์อื่น ๆ) ใส่ในโฟลเดอร์นั้น
3. ใน Chrome เปิด `chrome://extensions` เปิดสวิตช์ **Developer mode** (มุมขวาบน)
   กด **Load unpacked** แล้วเลือกโฟลเดอร์นั้น (ถ้า Chrome ของคุณเป็นภาษาไทย ชื่อปุ่มสองปุ่มนี้จะเป็นภาษาไทย)
   จะมีการ์ด "YouTube Upload Presets" ขึ้นมาพร้อมเลขเวอร์ชัน
4. ใน Tampermonkey ให้ **ปิด** สคริปต์ "YouTube Upload Presets" แค่ปิดสวิตช์ อย่าเพิ่งลบ
   (เหตุผลอยู่ในหัวข้อ "ย้ายจากสคริปต์ Tampermonkey") สองตัวนี้ทำงานพร้อมกันไม่ได้
   ถ้าสคริปต์ยังเปิดอยู่ในแท็บ Studio ส่วนขยายจะไม่เริ่มอัปโหลดและไม่เริ่มตัดคลิปในแท็บนั้น และแผงจะบอกว่าเพราะอะไร
5. เปิด YouTube Studio แล้วกดปุ่มของส่วนขยายบนแถบเครื่องมือของ Chrome
   (หรือกด Alt+P ถ้าเป็น Mac คือ Option+P) แผงจะเปิดขึ้นที่ด้านข้างของหน้าต่าง

ส่วนขยายยังไม่มีรูปไอคอนของตัวเอง Chrome จะแสดงเป็นช่องสี่เหลี่ยมที่มีตัวอักษร Y
ถ้าหาปุ่มไม่เจอ ให้กดปุ่มรูปจิ๊กซอว์บนแถบเครื่องมือ แล้วปักหมุด "YouTube Upload Presets"

ตอนเปิด Chrome อาจมีกล่อง "Disable developer mode extensions" ขึ้นมา ให้ปิดกล่องนั้น
อย่ากดปุ่มในกล่อง

แผงเริ่มต้นเป็นภาษาอังกฤษ เปลี่ยนเป็นไทยได้ที่ Settings → General → Language / ภาษา → ไทย

การ์ดใน `chrome://extensions` จะแสดง ID `cllefnlbgkbdnmifojjflfcpholhniio` ซึ่งเหมือนกันทุกเครื่อง

### อัปเดต

เมื่อมีเวอร์ชันใหม่ แผงจะขึ้นข้อความ "มีเวอร์ชันใหม่: … (ที่ใช้อยู่คือ …)" ส่วนขยายเช็กประมาณวันละครั้ง

รอให้คิวอัปโหลดและงานตัดคลิปทำเสร็จก่อนค่อยอัปเดต เพราะการโหลดส่วนขยายใหม่จะหยุดงานที่กำลังทำอยู่ในหน้าเว็บ

1. กด **ดาวน์โหลดเวอร์ชันใหม่** ในข้อความนั้น หน้า release จะเปิดขึ้น ให้ดาวน์โหลดไฟล์ zip ตัวใหม่
2. ปิดแผงด้านข้างในทุกหน้าต่างของ Chrome
3. ลบของที่อยู่ในโฟลเดอร์ส่วนขยายออกให้หมด แล้วใส่ของจากไฟล์ zip ตัวใหม่ลงไปแทน
   ตัวโฟลเดอร์ให้เก็บไว้ที่เดิม ชื่อเดิม
4. เปิด `chrome://extensions` ที่การ์ดของส่วนขยาย กดลูกศรวงกลม (**reload**) การ์ดจะแสดงเลขเวอร์ชันใหม่
5. โหลดแท็บ YouTube Studio และแท็บ youtube.com ที่เปิดอยู่ใหม่ทุกแท็บ
6. เปิดแผงด้านข้างอีกครั้ง

ถ้าแท็บ Studio ขึ้นว่า "ส่วนขยายถูกอัปเดตหรือโหลดใหม่ — โหลดแท็บนี้ใหม่เพื่อใช้งานต่อ"
หรือแผงขึ้นว่า "แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่" แปลว่าแท็บนั้นยังไม่ได้โหลดใหม่ตามข้อ 5
ให้โหลดแท็บนั้นใหม่

พรีเซ็ต การตั้งค่า คิว และประวัติของคุณยังอยู่ครบ เพราะข้อมูลเป็นของส่วนขยาย ไม่ได้อยู่ในโฟลเดอร์
อย่ากด **Remove** ที่การ์ดของส่วนขยาย เพราะจะลบข้อมูลทั้งหมด
ถ้ามีคลิปรออยู่ในคิว แผงจะขึ้นว่า "ไฟล์ในคิวต้องขออนุญาตอ่านอีกครั้ง — เบราว์เซอร์ถอนสิทธิ์ไปแล้ว" กดเริ่มอัปโหลดได้ตามปกติ (ปุ่มเริ่มจะขอสิทธิ์ให้เอง) หรือกด **อนุญาตอีกครั้ง** ก็ได้
ถ้าอยากให้ถามครั้งเดียว ไม่ต้องกดใหม่ทุกครั้งที่อัปเดตหรือเปิดเบราว์เซอร์ใหม่ เมื่อแถบนี้ขึ้น ให้กดอีกปุ่มในแถบเดียวกัน คือ **อนุญาตตลอดไป…** **ก่อน**กดเริ่มอัปโหลดหรือกดอนุญาตอีกครั้ง
จะมีหน้าเปิดขึ้นในแท็บใหม่ กดปุ่มในหน้านั้น แล้วในหน้าต่างคำถามของ Chrome ให้เลือก **"Allow on every visit"**
หลังจากนั้นแถบนี้ไม่น่าจะขึ้นมาอีก (เป็นไปตามเอกสารของ Chrome แต่ยังไม่ได้ยืนยันใน Chrome จริง ดูข้อตรวจ 89)
ลำดับสำคัญ: ถ้ากดเริ่มอัปโหลดหรืออนุญาตอีกครั้งไปก่อน ไฟล์จะอ่านได้แล้ว Chrome จึงไม่มีอะไรต้องถาม และหน้านั้นจะบอกให้กลับมาใหม่เมื่อแถบนี้ขึ้นอีกครั้ง

ถ้าเคยใช้ตัวทดสอบก่อนเวอร์ชัน 5.0.0: ตัวนั้นมี ID คนละตัวกัน ข้อมูลจะไม่ตามมาเอง ให้ย้ายตามนี้
ก่อนถึงข้อสุดท้ายยังถอยกลับได้เสมอ: ปิดตัวใหม่ แล้วเปิดตัวเก่ากลับมา

1. ในตัวเก่า รอให้คิวอัปโหลดและการตัดที่ขึ้นว่า "รอ YouTube ประมวลผลการตัด" เสร็จก่อน
   แล้วปิด Auto-pilot ของทุกช่อง
2. ในตัวเก่าเช่นกัน บันทึกของสามอย่าง:
   ตั้งค่า → สำรอง / แชร์การตั้งค่า → **ส่งออก (.json)**
   ลิขสิทธิ์ → เพลงที่เคยโดน → **⬇ CSV** ถ้าใช้รายการนี้อยู่
   ตั้งค่า → ตรวจปัญหา → เปิดหน้าดีบัก → **ดาวน์โหลดรายงาน (.json)**
   ไฟล์ที่ส่งออกมีแค่พรีเซ็ต พรีเซ็ตหลัก เลข EP การตั้งค่า และการตั้งค่าลิขสิทธิ์
   **ไม่มี** ประวัติการอัปโหลด รายชื่อช่อง คลิปในคิว ผลสแกน claim ผลการตัด รายการที่เลือกไว้ตัด
   และสถานะเปิด/ปิด Auto-pilot ส่วนไฟล์รายงานมีข้อมูลทุกอย่างที่ส่วนขยายเก็บไว้
   จึงใช้เป็นหลักฐานของประวัติและรายชื่อช่องได้ แต่ส่วนขยายนำเข้าไฟล์รายงานไม่ได้
3. ใน `chrome://extensions` **ปิดสวิตช์** ของตัวเก่า **อย่า** กด Remove ตอนปิดอยู่ข้อมูลยังอยู่ครบ
4. โหลด 5.0.0 จาก **โฟลเดอร์ใหม่** (Load unpacked) วางไว้ข้างโฟลเดอร์เก่า
5. ในตัวใหม่: นำเข้าไฟล์ `.json` โดยเลือก **ไฟล์ของฉัน** นำเข้าไฟล์ CSV ของเพลง สแกนแต่ละช่องใหม่
   แล้วเปิด Auto-pilot ใหม่ รายชื่อช่องจะกลับมาเองเมื่อเปิดแต่ละช่องใน Studio
   ส่วนประวัติการอัปโหลดจะเริ่มจากว่าง
6. ตรวจพรีเซ็ต การตั้งค่า และแท็บลิขสิทธิ์ให้ครบ เมื่อแน่ใจแล้วว่าไม่มีอะไรที่ต้องใช้หายไป
   จึงกด **Remove** ที่ตัวเก่าแล้วลบโฟลเดอร์ของมัน การกด Remove จะลบประวัติการอัปโหลด
   รายชื่อช่อง คิว และผลสแกนของตัวเก่าทิ้งถาวร

### ย้ายจากสคริปต์ Tampermonkey

**ย้ายเมื่อเจ้าของโปรเจกต์บอกว่าย้ายได้ และอัปเดตสคริปต์เป็นเวอร์ชัน 4.29.0 ก่อน**
(Tampermonkey → Dashboard → เลือกสคริปต์ → "Check for userscript updates" หรือรอหนึ่งวัน)
มีแค่เวอร์ชันนั้นที่มีปุ่ม **ส่งออกทุกอย่างเพื่อย้ายไปส่วนขยาย**
เวอร์ชันเก่ากว่านั้นก็ย้ายได้ แต่ประวัติการอัปโหลด รายชื่อช่อง และภาษาจะไม่ตามมา

อะไรย้ายได้ และย้ายอย่างไร:

| ข้อมูล | วิธีย้าย |
|---|---|
| พรีเซ็ต พรีเซ็ตหลัก เลข EP การตั้งค่า การตั้งค่าลิขสิทธิ์ | ไฟล์ที่ส่งออก (ดูขั้นตอนด้านล่าง) |
| ประวัติการอัปโหลด รายชื่อช่องของคุณ ภาษา | ไฟล์เดียวกัน ถ้าส่งออกด้วยปุ่ม **ส่งออกทุกอย่างเพื่อย้ายไปส่วนขยาย** (สคริปต์ 4.29.0) และตอนนำเข้าเลือก **ไฟล์ของฉัน** |
| ประวัติเพลงที่เคยโดน claim | ใช้ไฟล์ CSV: ในสคริปต์ ลิขสิทธิ์ → เพลงที่เคยโดน → ⬇ CSV ในส่วนขยาย ลิขสิทธิ์ → เพลงที่เคยโดน → ⬆ นำเข้า CSV ไฟล์นี้เก็บชื่อเพลง ศิลปิน ผู้ถือสิทธิ์ จำนวนครั้ง และช่องแรก แต่ไม่เก็บว่าเป็นคลิปไหน ถ้าสแกนใหม่ทีหลัง คลิปเดียวกันอาจถูกนับสองครั้ง ไฟล์ใหญ่ได้ไม่เกิน 16 MB |
| ผลสแกน claim ผลการตัด รายการที่เลือกไว้ตัด รายการโฆษณาและ Collab สถานะเปิด/ปิด Auto-pilot | ย้ายไม่ได้: สแกนแต่ละช่องใหม่ แล้วเปิด Auto-pilot ใหม่ |
| คลิปที่รออยู่ในคิว | ย้ายไม่ได้: อัปให้เสร็จก่อน หรือใส่ไฟล์เข้าคิวใหม่ |
| ช่องที่ล็อกไว้ ชื่อช่องที่พิมพ์ไว้ในหน้า Collab ตำแหน่งของปุ่มกลมใน Studio | ย้ายไม่ได้: ตั้งใหม่ |
| รูปแบบจาก "คัดลอกจากคลิป" (Copy from video, สคริปต์ 4.28.0) | ย้ายไม่ได้: ส่วนขยายยังไม่มีฟีเจอร์นี้ (ดู `CHANGELOG.md`) |

ย้าย **ครั้งเดียว และย้ายก่อนจะแก้อะไรในส่วนขยาย** เพราะการนำเข้าจะเอาพรีเซ็ต การตั้งค่า
และเลข EP ในไฟล์มาแทนของที่มีอยู่ในส่วนขยาย (ประวัติการอัปโหลดกับรายชื่อช่องจะถูกเพิ่มเข้าไปเท่านั้น ไม่ถูกแทนที่)

1. ในสคริปต์ รอให้งานที่ค้างอยู่เสร็จก่อน: คิวอัปโหลด งานตัดคลิป และการตัดที่ขึ้นว่า "รอ YouTube ประมวลผลการตัด"
   (การตัดรอบถัดไปที่ต้องทำหลัง YouTube ประมวลผลเสร็จจะไม่ตามมา)
2. ในสคริปต์: ตั้งค่า → สำรอง / แชร์การตั้งค่า → **ส่งออกทุกอย่างเพื่อย้ายไปส่วนขยาย**
   (หรือปุ่ม **ส่งออกข้อมูลของฉัน** ในประกาศด้านบนของแผง) จะได้ไฟล์ `yt-upload-presets-move-ปี-เดือน-วัน.json`
   ไฟล์นี้มีประวัติการอัปโหลดและรายชื่อช่องของคุณเอง อย่าส่งให้คนอื่นแทนไฟล์พรีเซ็ต
   ถ้าใช้ประวัติเพลงที่เคยโดน claim ให้บันทึกไฟล์ CSV ไว้ด้วย
3. ติดตั้งส่วนขยาย (หัวข้อ "ติดตั้งส่วนขยาย") แล้ว **ปิด** สคริปต์ใน Tampermonkey
4. ในส่วนขยาย: ตั้งค่า → สำรอง / แชร์การตั้งค่า → **นำเข้า** → เลือกไฟล์ → **ไฟล์ของฉัน**
   หน้าต่างคำถามจะบอกว่ามีประวัติกี่รายการ ช่องกี่ช่อง และภาษาอะไรที่จะตามมา
   (ถ้าเลือก **ไฟล์ของคนอื่น** จะได้แค่พรีเซ็ตกับการตั้งค่าทั่วไป ไม่มีประวัติ ไม่มีช่อง ไม่เปลี่ยนภาษา)
5. ถ้าบันทึกไฟล์ CSV ไว้: ลิขสิทธิ์ → เพลงที่เคยโดน → ⬆ นำเข้า CSV
6. ทำทีละช่อง: ลิขสิทธิ์ → **สแกน claim** แล้วเปิด Auto-pilot ใหม่ถ้าใช้อยู่
7. เก็บสคริปต์ไว้ใน Tampermonkey แต่ **ปิดไว้** ถ้าลบสคริปต์ Tampermonkey จะลบข้อมูลที่สคริปต์เก็บไว้ด้วย
   ซึ่งเป็นสำเนาเดียวที่เหลือของประวัติการอัปโหลดและประวัติ claim ของคุณ
   ลบได้เมื่อแน่ใจแล้วว่าในส่วนขยายไม่มีอะไรหาย และเก็บไฟล์ที่ส่งออกไว้ด้วย

#### ถ้าสคริปต์ยังเปิดอยู่

**ปิดสคริปต์ใน Tampermonkey ก่อนใช้ส่วนขยาย** ถ้าเปิดทั้งสองตัวในแท็บ Studio เดียวกัน
แผงจะขึ้นว่า "สคริปต์ Tampermonkey ยังเปิดอยู่ในแท็บนี้ — ปิดใน Tampermonkey แล้วโหลดแท็บนี้ใหม่
การอัปโหลด การตัด และ Auto-pilot จะรอจนกว่าจะปิด"

ในแท็บนั้น ส่วนขยายจะ:

- ไม่เริ่มคิวอัปโหลด และไม่เริ่มงานตัดคลิป งานเปิดโฆษณา หรืองาน Collab
- ให้งานด้านลิขสิทธิ์ที่ต้องเปลี่ยนหน้ารอไว้ก่อน รวมถึงของ Auto-pilot (การ์ดสถานะจะบอกเหตุผล)
- ไม่กด Save หรือ "Confirm changes" ในหน้าตัดคลิปให้
- หยุดคิวที่กำลังอัปอยู่หลังคลิปปัจจุบันเสร็จ รวมถึงกรณีที่กดเริ่มอัปโหลดก่อนสคริปต์จะโผล่ขึ้นมานิดเดียว
  คลิปที่ยังไม่ได้อัปจะยังอยู่ในคิว และจะไม่มีอะไรเริ่มเองอีก

การสแกน การ์ดสถานะ การแก้ไข และปุ่มหยุดยังใช้ได้ตามปกติ ให้ปิดสคริปต์แล้วโหลดแท็บใหม่
งานด้านลิขสิทธิ์ที่รออยู่จะทำต่อหลังจากนั้น ถ้าไม่ต้องการแล้วให้กด **หยุด** ก่อน
ส่วนคิวอัปโหลดจะไม่เริ่มเอง ต้องกด **เริ่มอัปโหลด** ใหม่

**สิ่งที่ส่วนขยายกันไว้ไม่ได้** ส่วนขยายมองเห็นสคริปต์ได้เฉพาะใน YouTube Studio
และมีงานของตัวเองแค่บางอย่างที่รอได้ ถ้าเปิดทั้งสองตัว สิ่งเหล่านี้จะยังเกิดซ้ำสองรอบ
หรือส่วนขยายยังทำอยู่:

- ที่ www.youtube.com: การกดรับคำเชิญ Collab และการสลับช่อง
- ใน Studio: การกรอกข้อมูลในหน้าต่างอัปโหลดที่คุณเปิดเอง แถบปุ่มลัดใต้ช่องชื่อและคำอธิบาย
  และการรับไฟล์หลายไฟล์ที่เลือกจากหน้าต่างอัปโหลดของ Studio เอง
- ในหน้าคำเชิญของ Studio: การกดรับคำเชิญ และการโหลดหน้าใหม่หลังสลับช่องแล้วเจอหน้า error
- ปุ่มของแผงเอง คือ **สลับไปช่องนี้** ในรายชื่อช่อง และ **ใส่ลงหน้าต่างที่เปิดอยู่** (กดหนึ่งครั้ง ทำหนึ่งครั้ง)
- งาน Collab ที่ส่งคำเชิญครบแล้วก่อนสคริปต์จะโผล่ขึ้นมา: ตอนงานจบหรือตอนกดหยุด
  อาจยังสลับไปช่องที่ถูกเชิญ (เฉพาะเมื่อเปิด "กดยอมรับคำเชิญสิทธิ์ช่องให้อัตโนมัติ" ไว้)

ทางแก้ของทุกข้อคือปิดสคริปต์

## Develop

```sh
cd extension
npm install
npm run dev      # builds, opens Chrome with the extension, reloads on change
npm run check    # tsc + vitest + port-check + ui-check --coverage + parity-check — run before every commit
npm run build    # .output/chrome-mv3 → chrome://extensions → Load unpacked
npm run parity -- --write     # writes PARITY.md from scripts/parity/rows/ (never edit it by hand)
npm run parity -- --release   # no `missing` row, PARITY.md fresh; prints every changed and dropped row
npm run release:check         # on a clean tree: builds, zips, inspects (see "Release check")
```

Ported code is checked against the userscript at the pinned commit (v4.27.1, `d15ef87`):
`npm run port-check` (configs in `scripts/port/`; `node scripts/port-check.mjs --print <name>`
prints the code a port starts from).

The side panel (`entrypoints/sidepanel/`, React + Tailwind v4 + `components/ui/`) talks to the
Studio tab active in its window: it asks for a `QueueView` and sends `queue:*` messages; it
never touches Studio's DOM. Logic the panel needs lives in `lib/panel/` (unit-tested).
`npm run ui-check` proves every shipped UI string is one of the userscript's `L()` pairs (or
is listed with a reason in `scripts/strings/extension-only.mjs`) and that no text is below 12px;
with `--coverage` (as in `npm run check`), also that every pair of the userscript's drawer and
copyright module is used by some `L()` call in the extension's shipping code or listed with a reason in
`scripts/strings/dropped.mjs`. "Used" is not "shown in the panel": a pair kept alive only by
page-side code (the FAB, page toasts) or by dead code passes too.
`tests/panel-i18n.test.tsx` renders the whole panel (every tab, card state, question and banner),
the FAB and the reload banner in Thai, and fails on any English pair and on any Latin word
outside its short, commented allowlist and the presets' own text (whole pieces of a label,
title, description line or tag, and their artist names; not their words on their own).
`settings` and `counters` have one writer, the background (`store:patch`, `lib/store-writer.ts`);
the copyright data has the same writer (`claims:op`).
Console lines from the extension start with `[ytup]`.

## Layout

- `entrypoints/` — background, content scripts (`studio.content.ts` isolated, `studio-main.content.ts` MAIN world), side panel, file-bridge iframe
- `lib/` — logic ported from the userscript; pure modules are unit-tested
- `lib/studio/` — page automation ported from the userscript (`port-check` keeps it honest);
  `page-ui.ts` is the seam between the runner and any UI
- `entrypoints/invite.content.ts` — www.youtube.com: channel switcher and invite accept
- `lib/studio/txt.ts`, `lib/studio/sel.ts` — the `TXT` / `SEL` tables (see the root README)
- `lib/claims/` — the copyright module ported from the userscript (`claims.ts`, port-checked); its
  data: per-channel keys, one writer (`claims:op` in the background)
- `lib/claims/alarms.ts` — Auto-pilot's alarms in the background (one per channel at its next
  cycle) and the "Auto-pilot is due" notification
- `lib/main-youtubei.ts` — Studio's `/youtubei/v1` calls, run in the MAIN world
- `entrypoints/sidepanel/` — the side panel (React); `lib/panel/` — its logic; `components/ui/` — shadcn-style components
- `entrypoints/allow/`, `lib/file-allow.ts` — the "Allow file access" page (`allow.html`, opened
  in a tab): asks Chrome for read access to the stored files where Chrome can offer "Allow on
  every visit"
- `scripts/ui-check.mjs`, `scripts/strings/` — strings parity with the userscript, 12px floor
- `scripts/parity-check.mjs`, `scripts/parity/rows/` — one row per thing the userscript had: where
  it lives here and what proves it, or why it changed or went; `PARITY.md` is generated from
  the rows, and `scripts/parity/DECISIONS.md` holds the owner's decisions the rows cite
- `scripts/release-check.mjs` — what must be true of the zip the team installs
- `lib/update-check.ts` — the daily look at GitHub's latest release (background) and the
  panel's "Update available" banner
- `lib/studio/userscript-here.ts` — what waits while the Tampermonkey script is in the page
- `lib/panel-tab.ts` — which tab the panel is asked to show (the Studio button, a notification
  click, a pick in Studio's dialog)
- `lib/backup.ts` — export and import, the userscript's move file included
- `CHANGELOG.md` — one section per released version
- `tests/*.test.mjs` — tests ported from `../test/` (bodies unchanged); `tests/*.test.ts` — new tests

## Release check

`npm run release:check` builds, zips and inspects the build, and publishes nothing. It refuses:
uncommitted, untracked or git-ignored files under `extension/` (`node_modules`, `.output`,
`.wxt` and two tools' folders aside), a manifest that differs from the one written out in
the script, a file in the build that is not expected there, a dependency missing from
`public/THIRD-PARTY-NOTICES.txt`, a `CHANGELOG.md` without a `## <version> ` heading, a
`missing` parity row and a stale `PARITY.md`. It expects a manifest `key` only when
`wxt.config.ts` has a `key:` line, and `icons` only when `public/icon/{16,32,48,128}.png`
all exist.

When all is well it prints the zip's path, the zip's sha256, a **content hash** (the sha256
of every file inside the zip, by path; the list is `.output/release-files.txt`), the commit,
and the tag and release commands for the owner to run. Two builds with the same content hash
are the same extension: that is how the build the owner tested is shown to be the build that
ships. With this version of WXT the zip holds no file times, so two builds of the same
commit also give the same zip sha256.

Make the release zip in a clean checkout after `npm ci`, once, and compare its content hash
with the one of the build that was tested.

## Licences

`public/THIRD-PARTY-NOTICES.txt`, packaged as `THIRD-PARTY-NOTICES.txt` in the build, has the
bundled IBM Plex Sans Thai font (SIL OFL 1.1), the embedded Material Symbols Rounded icon paths
(Apache 2.0) and the npm packages in the bundle (React, Radix, Sonner, Tailwind's CSS and the
rest, mostly MIT), each with its licence text taken from its `node_modules` package.

The package list is kept by hand. It was taken from the build's source maps; after adding or
upgrading a runtime dependency, build with `build.sourcemap` on and list the `node_modules`
packages in the maps' `sources` (Vite strips the licence comments from the minified scripts).

## CSV exports

The Copyright tab's CSV files (claims, claimed songs, upload history) are written as the
userscript wrote them: every cell quoted, nothing else changed. A video or song title that
starts with `=`, `+`, `-` or `@` is therefore read as a formula by Excel or Google Sheets. The
titles come from YouTube, so open these files as text, or with formulas off, if a channel's
titles aren't yours. The cells are left alone on purpose: the claimed-songs CSV is also the
file the extension imports, and a changed cell would come back as a different song.

## Debugging

When something goes wrong, open the **debug page**. It works without a Studio tab and with a
broken background:

- from the panel: Settings → Troubleshooting → **Open debug page**;
- from an error screen: the panel shows the error with **Copy details**, **Open debug page** and
  **Reload panel** instead of going blank (also when it is still waiting for the background
  after 8 s), and a tab that fails to render has an **Open debug page** link;
- or type `chrome-extension://<id>/debug.html` in the address bar (the id is on
  `chrome://extensions`, or in the debug page's Overview).

What it shows: the version, id, permissions, browser and data schema, and whether the background
answers (Overview); the error log of every part of the extension (background, panel, Studio and
youtube.com pages, file bridge, debug page; newest first, filterable, each entry's stack on a
click; it follows new entries live, and **Clear log** empties it); every stored key with its
size and value, and under `storage.session` the automation lock (`runnerTabId`), what it is held
for (`runnerJobs`) and the copyright worker of each channel (`claimsWorkers`), and under
`storage.local` the Auto-pilot cycles already notified (`apNotified`) and the last update check
(`updateCheck`), and under `storage.session` also the last tab the panel was asked to show
(`panelTab`); the open Studio
tabs and whether each one's page script answers; the stored file handles and whether the queue
uses them. It changes nothing except **Clear log**.

To send a report: **Copy diagnostic report** (paste it into a message) or **Download report
(.json)** (attach the file). The report holds every section above and the last 300 log entries.
It contains everything the extension stores: your presets and settings, the queue (video
titles, descriptions, tracklists and file names), the upload history, the copyright data (claim
scans, the trim list and the claimed-songs history: video and song titles, artists and
claimants), channel ids, names and avatar links, and the stored file names; the open Studio tabs' titles and URLs (with channel and
video ids); and log messages, which can quote titles. It contains no files and no sign-in data
(no cookies, tokens or YouTube auth headers: the extension never stores or logs them). Look it
over before sending it outside your team. The log keeps the newest 300 entries in
`chrome.storage.local` (`debugLog`), dropping info lines before warnings and errors; a line
repeated back to back is kept once, shown with ×N. It is not part of a settings backup; nor are
`apNotified` and `updateCheck`. Errors inside Studio's page-world script
(`studio-main`) are not captured (it has no extension APIs): see Studio's DevTools console.

## Exit checks (manual, in Chrome)

Needs the logged-in Chrome profile, with **the userscript disabled in Tampermonkey** (items 78
to 80 say when to turn it on). Use a test channel.

### Before you start: load or update the build

Do this every time the build folder is new or was replaced, in this order. It is "Update"
at the top of this file, steps 2 to 6; a developer's folder is `.output/chrome-mv3`, which
`npm run build` writes:

1. Close the side panel in every Chrome window. Do not open it again until step 4.
2. `chrome://extensions` → the extension's card → the round **reload** arrow. (First time: turn
   on **Developer mode**, **Load unpacked**, pick the build folder.)
3. Reload **every** open YouTube Studio tab and every open youtube.com tab (or close them and
   open new ones).
4. Now open the side panel.

Why the order matters: the side panel reads its files from the folder each time it opens, but
the background and the scripts inside the tabs keep running the old build until steps 2 and 3.
A panel opened too early is a new panel talking to old scripts. It notices: it shows "This tab
is not connected to the extension yet — reload this tab" and nothing else from that tab. Do
steps 2 to 4 again. (A build from before Phase 4b can instead show an error screen or an empty
Copyright tab.)

### How to write the results down

In Studio's DevTools, filter the console by `[ytup]` (the ported code also logs `[YT Presets]`
and `[YT Upload Presets]`). Write down pass or fail for each item; any failure blocks the next
phase.
Items marked **record** ask for an observation; write down what happened.
Settings are changed in the panel's Settings tab (no DevTools snippets any more).
The panel's own console: right-click inside the panel → Inspect.

### The panel

1. **Where it opens.** The toolbar icon opens the panel on a Studio tab; on example.com the
   panel is not available (it is enabled on Studio tabs only).
   - `chrome://extensions/shortcuts` lists **Alt+P** for the extension. **Record** whether
     Chrome assigned it on install; assign it if it was left empty.
   - Alt+P through the manifest command opens the panel on a Studio tab. On a non-Studio tab
     it does nothing (the panel is disabled there).
   - The page's own Alt+P (the fallback, through the background): unassign the command in
     `chrome://extensions/shortcuts`, click into Studio, press Alt+P. **Record** whether the
     panel opens (the gesture may be lost on the way to the background). Reassign Alt+P.
   - Neither Alt+P closes the panel.
2. **Look.** Black glass, Thai and English text in IBM Plex Sans Thai, nothing smaller than
   12px, icons on tabs and section headings. Tabs: Upload · Presets · Copyright · Settings; the
   Copyright tab shows the status card and Scan claims, then Claim list, Claimed songs, Fix
   tracklist and Upload history, and the activity log under "Show activity ▾"; since Phase 4b
   also Ads off, Collab, Stop (while something runs), the Auto-pilot switch and Copyright
   settings (items 46 to 74). Phase 5's items are 75 to 87.
3. **Language.** Settings → General → Language / ภาษา → ไทย: the whole panel switches at once,
   without a reload, with no English left. The next toast from Studio is Thai too. Switch
   back to English.
4. **Channel bar.** Shows the Studio tab's channel (avatar, name, `UC…` id, green dot).
   **Lock channel** → toast "Locked to channel "…". Uploads will be blocked on other channels".
   Switch Studio to another channel: the bar turns red with "Currently on channel … but locked
   to …", the dot is red, Start reads "Channel does not match the locked one". **Locked** →
   "Channel unlocked".
5. **Channel list** (the ⇄ button). The current channel says "· this tab"; **New tab** opens
   the same Studio page on it. Another channel's **Switch** goes through the channel switcher
   (console `switch: looking for @…`, `switch: switching to @…`) and lands in Studio on that
   channel — for an owned channel and for a channel you only manage (extra `switch: confirming
   the manager-channel notice`).
   - **Record** that the panel closes while the tab is on www.youtube.com (the panel is
     disabled there) and that the toolbar icon / Alt+P open it again once back in Studio.
   - During a run, Switch toasts "Upload queue is still running — switching channels now would
     stop it". With files queued but nothing running, Switch is allowed and the queue survives.
   - Add a channel by `UC…` id or link; `@handle` toasts "No channel ID found (starts with UC,
     24 characters)"; ✕ removes one.
6. **Reload this tab.** With a Studio tab open, reload the extension in `chrome://extensions`.
   Within about a second the page shows "The extension was updated or reloaded — reload this
   tab to keep using it" and the FAB goes away; the panel on that tab shows "This tab is not
   connected to the extension yet — reload this tab". The same banner shows when the tab still
   runs an older build of the extension (the build folder was updated and this tab not
   reloaded): reload the tab. Either button reloads the tab, and the panel works again.
7. **FAB.** Bottom right in Studio: the channel and the default preset; the badge shows how
   many videos wait. Drag it elsewhere and reload: it stays there. Click it with the panel
   closed: **record whether the side panel opens.** If Chrome refuses the gesture, copy the
   console error (`[ytup] openPanel …`); the fallback is plan 3b D16: delete the `mountFab`
   lines in `entrypoints/studio.content.ts` and record that the FAB was dropped. During a run
   the badge shows the upload icon and the percentage, with a line along the bottom; with a
   channel-lock problem it turns red.
8. **In-Studio navigation.** Move between Studio pages (Dashboard → Content → a video's
   details) with the panel open. The panel may show its loading state briefly, but the "not
   connected" banner never flashes during the ~2 s grace after a navigation (N5). **Record**
   any flash.

### Uploading (Phase 2's checks, now from the panel)

9. **Real upload, end to end.** Drag `Clip 1.mp4`, `Clip 1.txt` (3-line tracklist from
   `0:00`), `Clip 1.jpg` (under 2 MB) and `Clip 2.mp4` onto the panel: the frame "Drop to add
   to the queue" appears; two cards appear with their titles and EP numbers at once (not
   after a later refresh); Clip 1 shows "Clip 1.txt · 3 lines", "3 chapters" and the thumbnail
   (preview and "Thumbnail · … MB"). **Start**: the summary dialog shows the channel (avatar,
   name, id), "Videos 2", "Release Per preset (PRIVATE)", "No .txt 1 video(s)"; confirm.
   Expected: Studio opens the upload dialog itself; title, description and tags fill in; Clip 1
   gets its thumbnail; Category, AI use and Paid promotion, Monetisation, Ad suitability and
   Visibility follow the settings (AI use stays unanswered unless Settings → AI use is No or
   Yes: set it to No before this run to see it answered); Save is
   clicked; the card turns Done; Clip 2 runs. The activity bar shows "Uploading 1/2" with its
   upload icon and a percentage, and the running card a progress bar; the Start button's play
   icon spins while running; the tab title shows `(1/2) ⬆`, then `✅` if the tab isn't focused.
   A desktop notification "Upload finished ✅" appears when the panel is closed or the tab
   unfocused; clicking it focuses the tab. Both videos are in Content.
   - **Bridge diagnostics (record).** In Phase 0 the bridge iframe was missing from the DOM
     after load. Write down the `[ytup] file bridge:` lines the console shows: expected `#1
     mounted (readyState …)`, `#1 loaded, connect sent`, `#1 connected (ack after … ms)`; note
     any `#1 removed from the DOM by the page …` or `#1 dropped (…)`.
10. **Picking.** A click anywhere on the drop zone opens a multi-file picker; picked files are
    added. From the keyboard, Tab reaches "or click to select files" and "pick a whole folder",
    and Space or Enter opens each picker. "pick a whole folder": a folder with a `Covers/`
    subfolder adds the videos with their `.txt` and images paired by name; hidden files
    (`.DS_Store`) are skipped. Cancelling a picker is silent. Drop a folder of 30+ files on
    the panel: everything is added, with one toast. With the Presets tab open, drop a video
    anywhere on the panel: the panel switches to the Upload tab and the card appears there.
11. **Card edits.** Expand a card: edit the title (the counter follows; ↻ regenerates it);
    change its preset (the title follows); type artists, then clear them (back to "auto"); with scheduling on, type a release time into its date-time field (nothing resets
    it to the queue time while you type; it saves once complete, "Manual"; ↻ goes back to
    "Queue"); move cards up and down (EP numbers / times follow); **Apply to all**; **Expand
    all / Collapse all**. Drop a `.txt` or an image on a waiting card: it attaches; drop a
    video on a card: it goes to the queue. **Attach .txt / thumbnail** opens a picker. ✕ on
    the `.txt` and thumbnail chips removes them. A tracklist starting at `0:05` shows
    "Tracklist: 1 problem(s)" and **Fix tracklist**, which toasts "Tracklist fixed: …".
12. **Two idle Studio tabs.** Open Studio in windows A and B (nothing running). In A's panel
    edit a card's title; in B's panel change the default preset's title template. A's
    edited title survives (no lost update); the other cards follow the new template.
    - **Two windows' edits both survive.** Queue 2 clips. Edit clip 1's title in A's panel and,
      as close to the same moment as you can (within about a third of a second), set clip 2's
      artists in B's panel. Both edits are in both panels afterwards; neither window's save
      replaced the other's.
13. **Scheduling (the schedule box).** Switch "Schedule releases" on: the first release is
    tomorrow 19:00.
    - Quick picks fill "First video releases":
      - "Next 18:00" at least 15 minutes before 18:00 (e.g. at 17:40): today 18:00. Less
        than 15 minutes before it, or later (e.g. at 17:50): tomorrow 18:00. "Next 20:00" the
        same around 20:00.
      - "Tomorrow 19:00": tomorrow 19:00, whatever the time.
      - "Within 1 hr": an hour from now, rounded up to the quarter hour (at 14:07: 15:15).
    - Type into the date-time field: it isn't reset while focused. Typing a year digit by
      digit (partial years, M4) and clearing one segment save `''` and the summary reads
      "Pick the first video's release time", as the userscript did.
    - "Every": leave it blank, then 0 (M3): 1 is saved; the field shows what you typed until
      the stored value changes (as the userscript's `oninput`).
    - The header click folds and unfolds the box; a click on the switch only toggles the
      switch. From the keyboard, Tab to the header shows a visible focus outline, and Enter or
      Space folds it.
    - Set every 1 day. Cards show their release times; the summary reads "… → … · every 1
      days". Start 2 clips: they are scheduled one day apart, and afterwards the box's first
      release has moved to the slot after the last one.
    - Set a time in the past: the box gets an amber border and a note says when the queue will
      start instead; **Use this time** stores it. Clear the time: the border and note go.
    - Above the fields, **Every …** / **Per week** chooses how the times are made. All of
      the above is "Every …", which is what a new install has. "Per week" is item 90.
14. **Reload survival.** Queue 2 clips and reload the Studio tab before Start: the queue is still
    there, Start works (the files come through the bridge again). The reload shows no "Leave
    site?" prompt (the files are kept by the extension).
15. **Interrupted run.** Start 2 clips and reload Studio while the first uploads: that card comes
    back as an error, "The page reloaded during the upload — …". **Retry** with a draft id asks
    "This video is already in Studio" with two answers, **Resume draft** (selected) and
    **Upload again**; either puts it back in the queue (what each then does is item 94).
    **Open draft** opens it in Studio in a new tab.
16. **Browser restart, then re-grant.** Queue 2 clips (one with a thumbnail), quit Chrome fully,
    reopen Studio and the panel: the banner "Files in the queue need read access again — the
    browser has withdrawn it" with **Re-grant access (N files)**; the card's thumbnail preview
    is gone. Start is **not** greyed out. (The same banner shows after the extension is
    reloaded or updated, item 76, and whenever Chrome ends the access, item 88. Its second
    button, **Always allow…**, is item 89; this item is about the first.)
    - **Re-grant.** Click **Re-grant access**. **Record** how many permission prompts the
      click shows (none is expected: Chrome's source says a side panel is given the access
      without a prompt; not measured), and whether one click granted all files. When it
      worked: the banner is gone and the card's thumbnail preview is back without closing or
      reopening the panel; Start: they upload. A click that changes nothing says so: the
      toast "The browser still does not allow reading N file(s) — click "Always allow…" on
      the banner and pick "Allow on every visit" on the page that opens; if that does not
      help, remove those videos from the queue and add the files again", and the banner
      stays. Either way the panel's
      console (right-click the panel → Inspect) has one line per file,
      `[ytup] regrant <id>: prompt -> granted` or `prompt -> prompt`; they are in the debug
      page's log too. **Record** them if the click did not work.
    - **Start instead of Re-grant.** Quit and reopen Chrome again so the banner is back, and
      this time press Start without touching the banner (confirm the summary if it shows).
      Start asks the browser itself, inside its click, before anything goes to the Studio
      tab. Expected: the banner goes, the preview comes back and the clips upload. If the
      browser does not give the access back: the same toast "The browser still does not
      allow reading N file(s) — …", the banner stays, nothing runs and every card stays
      waiting (none turns to an error, none shows "No permission to read this file"); Start
      can be pressed again. **Record** which of the two happened. The same from any other
      window's panel on a Studio tab.
    - Only if Chrome showed prompts above (if it showed none, skip this bullet and say so):
      repeat with 3+ files from a dropped folder and block one prompt by clicking
      **Don't allow** (Esc usually only dismisses it, which leaves the file at 'prompt').
      The banner stays with that one file (a click on its button toasts "The browser still
      does not allow reading 1 file(s) — remove those videos from the queue and add the
      files again": a blocked file's toast does not name the page). Start: the blocked file's item fails with
      "The browser blocked reading this file — remove it from the queue and add it again",
      the others upload: a blocked file never stops Start. **Record** whether clicking
      Re-grant afterwards can unblock it (if it can, that error's advice is more than
      needed).
    - Start asks only for files the run will read. With one error card left from an earlier
      run (its file still needs a grant) and the waiting clips readable, Start runs while
      the banner still counts the error card's file. With Settings → thumbnails off, a
      waiting clip's thumbnail that needs a grant is not asked for and does not stop Start;
      with thumbnails on it is asked for with the videos.
17. **Start, confirm and refuse.**
    - Settings → **Confirm channel name before starting the queue** on: the summary dialog
      shows; Enter or "Upload N video(s)" starts; Esc, a click outside or Cancel starts nothing.
    - With it off and no warnings, Start starts at once with no dialog.
    - Click Start, and while the summary is open edit a card's title, then confirm: "The queue
      changed after you confirmed — click Start again to see the new summary".
    - **Another window changes something.** Open Studio in windows A and B. Click Start in A
      and leave the summary open. In B's panel switch "Schedule releases" (or change the
      default preset's visibility), then confirm in A: "Settings or presets changed after you
      confirmed — click Start again to see the new summary". Again with a card: with A's
      summary open, change a waiting card's preset or release time in B (or attach a `.txt` or
      a thumbnail to it), then confirm in A: "The queue changed after you confirmed — …".
      Nothing runs either time; a second Start shows the new summary and runs.
    - **Record**: with the summary open, switch the browser to another Studio tab (the panel
      rebinds), then confirm: whether any refusal is shown.
    - The footer's look: the disabled Start subtitle is readable; the Stop icon's hover colour
      is red; the play icon doesn't look broken while disabled.
18. **One runner, and Stop from anywhere.** Open Studio in tabs A and B. Start in A. On B, the
    panel shows "Another Studio tab is running the queue — change the queue there" with **Go to
    that tab**; Start is disabled, Stop is enabled; adding, removing, retrying or clearing from
    B toasts the same refusal. **Stop** in B's panel toasts "Will stop the queue in the tab "…"
    after the current video finishes" (naming A's tab) and A stops after its current video.
    Stop in A's own panel shows only the page's toast, "Will stop after the current video
    finishes".
    - **Record**: inspect B's panel and switch to tab A: whether the hidden panel in B keeps
      polling (requests in its console / Network) while A's panel is the visible one.
    - Phase 2's "Nothing is running in this Studio tab" (a Stop sent to a tab that isn't
      running) can't be reached from the panel in normal use: Stop is disabled unless some
      tab runs the queue, and it goes to the running tab. If A's run ends just as you click
      Stop in B, A's Studio page may show that toast (B's panel doesn't show A's toasts); if
      A was closed or left Studio, B's panel toasts "That tab is no longer running the
      queue". Expected otherwise: neither appears.
19. **Intercept.** In Studio's own upload dialog pick 2 videos: the dialog closes, both appear in
    the queue, Start uploads them. Reloading while they wait asks "Leave site?". (Which tab
    the panel then shows is item 82; a pick while another Studio tab runs is item 83.)
20. **Manual fill.** Upload one file through Studio's own dialog: the details fill in from the
    default preset, with the toast "Details filled in: …". Presets → **Apply to open window**
    fills an open dialog too.
21. **Quick actions.** On the details page and on `/video/<id>/edit`: bars under the title and
    the description (Elements: `div.ytp-qa` → `#shadow-root`); dark mode switches their colours;
    Preset title, Copy (paste to check it), Preset description, Load .txt, Fix chapters, Check
    chapters, Preset tags,
    Apply all work; Undo reverts. After switching the panel to Thai, the bars are Thai the next
    time the dialog opens.
22. **Dialog info and the clipboard.** With the details page open, Settings → Troubleshooting →
    **Copy upload dialog info**, then paste: JSON whose `version` is the manifest version.
    **Record** whether the copy works on the first click (the clipboard write runs after the
    tab's reply; it needs the panel to keep focus).
23. **Button state in the isolated world.** During items 9, 19 and 20, Save/Next are clicked
    only once Studio enables them: no "Could not click Save (button still disabled…)" while the
    button is plainly enabled, and no click that does nothing.
24. **Notification click and the side panel.** With the panel closed, finish a run and click the
    notification: **record whether the side panel opens** (`sidePanel.open` from a notification
    click, i.e. whether it counts as a user gesture). The tab is focused either way.
25. **Extension reload under a live Studio tab.** With the bars showing, reload the extension:
    the console logs `[ytup] extension reloaded — page automation stopped`; the bars and the FAB
    go away; the tab-title mark clears; the reload banner appears (item 6). Picking 2 files in
    Studio's dialog is now left to Studio.
26. **Bridge not answering.** Queue a clip, reload the tab, and before Start paste in its console
    `setInterval(() => document.querySelector('iframe[src*="file-bridge"]')?.remove(), 20)`.
    Start: within about 10 s the toast "The side panel's file access is not answering — reload
    the Studio tab, then start again"; the card stays waiting.
27. **Stop mid-run.** Queue 3, Start, **Stop** during clip 1: "Will stop after the current video
    finishes"; clip 1 finishes Done, 2 and 3 wait; "Queue stopped (1 video(s) done)". Start works
    again. **Clear finished videos from the list** (the footer's clear button) is disabled until a
    video is done, then removes the Done cards.
28. **Review mode.** Settings → turn off **Auto-press Save**; queue 2 and Start: details fill in,
    the card shows "Waiting for you to Save" with "Check the details in the YouTube dialog, then
    click Save to move to the next file" and no ✕; clicking Save yourself finishes it and clip 2
    starts. With **Press Next to the Visibility page** on, the dialog moves to Visibility first.
    Turn Auto-press Save back on.
29. **The running tab closes while another is open.** Start in A, close A during clip 1: within
    about a second (at once when B gets focus) clip 1 shows the reload error in B's panel; the
    rest wait; Retry (**Upload again**, after deleting the draft) and Start in B work. Also let a run in A end
    normally with B open: every card ends Done.
30. **Channel lock and the confirmation.** Lock to another channel (item 4) and Start: the toast
    "⛔ Currently on channel … but locked to …" and nothing runs; unlock. Click Start and leave
    the summary open; switch Studio's channel, then confirm: "The channel changed after you
    confirmed — click Start again to see the new summary". The same with the queue: with the
    summary open, pick 2 files in Studio's dialog, then confirm: "The queue changed after you
    confirmed — …".
31. **Duplicate guards.** Add `Clip 1.mp4` twice: one card, toast "1 already in the queue". After
    it uploaded, **Clear finished videos from the list** (the footer's clear button) and add it
    again: "1 already uploaded to this channel (red
    badge)", the card's red "Already uploaded …" chip opens that video in a new tab, and the
    Start summary warns "1 already uploaded to this channel — they will be duplicated".
32. **Extension reload with a run in flight.** Start 2 and reload the extension during clip 1:
    one in-page toast "The extension was reloaded during an upload — …"; Studio's console (filter
    `[YT Presets]`) logs `[YT Presets] Error: The extension was reloaded — the queue stopped in
    this page` (the Thai text in Thai) when the run reaches its next step; the orphaned run
    clicks nothing more and starts nothing; no ✅/⚠️ comes back to the title. Finish the upload in the
    dialog by hand, reload the tab: clip 1 shows the reload error and clip 2 waits. Remove clip 1
    (it is uploaded: Retry → **Upload again** would upload it twice).
33. **Navigation during an add (rare).** Drop a large folder and navigate Studio to another page
    while the cards are still arriving. **Record** whether any item later fails with "no longer
    available" (the panel may forget handles the old page had already queued).

### Presets, settings, backup

34. **Presets.** Edit the default preset: the YouTube preview and the title counter follow; a
    typo like `{artist}` shows "⚠ Unknown variable {artist} …"; variable chips insert at the
    cursor of the field last edited; dropping a `.txt` on Description inserts its text; dropping
    a real `.mp4`/`.txt` on the test field changes the preview. **New** (the name is selected
    for typing), **Duplicate**, **Set as default** ("Set "…" as the default preset"); Alt+1…9 in
    Studio does the same with "Main preset: …". **Delete** asks first; a queued video on that
    preset moves to the default preset. **Next EP** changes the next card's `{n}`. **Reset to
    defaults** asks first.
35. **Settings.** Each switch and list keeps its value after closing and reopening the panel, and
    the Studio tab follows without a reload (e.g. **Pause between files** during a run). During a
    scheduled run, turn **Notify when the queue finishes** off: after the next clip both your
    change and the moved first-release time are kept (one settings writer).
36. **Backup.** **Export (.json)** saves `yt-upload-presets-YYYY-MM-DD.json` and toasts "Exported
    N presets". **Import** a userscript export: the dialog lists the presets and asks My file /
    Someone else's; "Someone else's" keeps your producer name and schedule; the toast "Imported N
    presets"; presets and settings show at once. Import during a run toasts "Stop the queue
    before importing".

### Carried over from Phase 2a

37. **Bridge after idle.** After item 9, wait 2 minutes and Start another clip: if the page had
    removed the frame, the console shows `[ytup] file bridge: #1 dropped (no longer in the
    DOM)`, `#2 mounted …`, `#2 connected …`, and the upload works.
38. **Invite accept.** Open an "ACCEPT INVITATION" link from a collaboration email: `invite:
    watching …`, `invite: opening request 1: …`, `invite: accepting request 1`, the link reopens
    for the next request until none remain, then "Invitation accepted" / "Accepted N
    collaboration requests". The side panel closes on www.youtube.com (**record** it). With
    Settings → **Auto-accept channel permission invites** off, reopening a link logs nothing
    from `invite:`.

### During a run

39. **Edits during a run.** Queue 3 clips and Start; while clip 1 uploads:
    - Clip 1's card (and, while its file is fetched, the card of the clip about to upload)
      refuses edits: its title, preset, release time and artists fields are disabled, it has
      no ↑/↓, no ✕ and no attach buttons, and a `.txt` dropped on it is not attached (the
      panel adds it to the queue as a new file instead).
    - Edit clip 2 (title, preset, artists, release time), attach a `.txt` to it and move it
      below clip 3: each change shows at once, and when its turn comes Studio's dialog gets
      the new title, description and release time, in the new order.
    - Remove clip 3: its card goes; the run ends after clip 2.
    - Retry an error card (one left from an earlier item) during the run: it goes back to
      waiting and is uploaded in this run, in its place in the list.
    - With scheduling on, click into the schedule box's "First video releases" field before
      clip 1 finishes, and leave the focus there until clip 1 is Done (the runner moves the
      start to the slot after clip 1). Click out of the field: it now shows the moved start,
      not the one it showed while focused. Nudge its minutes: the next clip is scheduled from
      the moved start, never in clip 1's slot. The same goes for a card's title field: after
      a change from elsewhere, leaving the field shows the new value.
    - **Attach a `.txt` that can't be read.** In Terminal, `chmod 000 Unreadable.txt`, then drop
      it on a waiting card: the toast reads "Could not add 1 file(s): " followed by a reason
      (not "This tab is not connected to the extension yet — reload this tab"), and the card
      keeps its old `.txt`. `chmod 644` it afterwards. **Record** the reason. Expected:
      Chrome's own `NotReadableError` text, passed through as it is (English in Thai mode
      too): "The requested file could not be read, typically due to permission problems that
      have occurred after a reference to a file was acquired." The handle's `getFile()` only
      reads metadata and succeeds, so the bridge hands the file over; the read fails in the
      Studio tab's `readText()` (`arrayBuffer()`), and `attach` (`lib/studio/queue-edit.ts`)
      puts the error's message after "Could not add 1 file(s): ". If Chrome fails
      `getFile()` instead, the reason is the bridge's "Could not read this file (moved or
      renamed?) — add it again".
    - **Leave Studio mid-run, then Back.** During clip 1 navigate the tab to another site,
      confirm "Leave site?", then press Back. If Chrome restored the page from its
      back/forward cache with the run still going: the run carries on and keeps the lock (in
      another Studio tab the panel shows "Another Studio tab is running the queue — change
      the queue there").
    - **Back after another tab took the lock.** As above, but before pressing Back start the
      queue in another Studio tab. The restored page toasts "Another Studio tab is already
      running the queue or copyright work" and stops at once: it clicks nothing more, its
      video stays a draft in Studio (the other tab shows it as interrupted), and only the
      other tab uploads, each clip once. While the other tab runs, and until the restored tab
      has read that run's results back (within a second of its end), Start in the restored
      tab is refused with the same toast; after that it works, and the cards the other tab
      finished show Done there.
      **Record** whether the page came back from the cache at all (if Studio reloads instead,
      the item comes back as interrupted, as in item 15).

### Phase 0 spike checks still open (ledger: Task 7)

Record what happens; the Phase 0 spike results document
(`docs/superpowers/specs/2026-10-05-spike-results.md`) is written from these observations.

40. **Moved or renamed file (spike #8).** Queue `Clip 1.mp4` with `Clip 1.jpg`, and `Clip
    2.mp4`. Rename `Clip 1.mp4` in Finder, then Start: clip 1 goes to error with "Could not read
    this file (moved or renamed?) — add it again" and **Retry**; clip 2 still uploads. Then
    queue `Clip 3.mp4` with `Clip 3.jpg`, rename `Clip 3.jpg`, Start: clip 3 fails with
    `Thumbnail "Clip 3.jpg": Could not read this file (moved or renamed?) — add it again`.
    (A `.txt` renamed after queuing changes nothing: its text was read when it was added.)
41. **A ~1 GB video through the bridge (spike #3).** Queue one ~1 GB `.mp4` and Start: Studio's
    dialog starts uploading it within a few seconds of its turn, shows the full file size and
    finishes; the console shows no `[ytup] file bridge: … dropped` and no "Could not get the
    file from the side panel (…)" error. **Record** the time from Start to Studio's upload
    progress appearing.
42. **Service worker smoke test (Task 16).** `chrome://extensions` → the extension → **service
    worker** → Inspect; in its console `await chrome.storage.local.get('schemaVersion')` gives
    `{schemaVersion: 5}`, and there is no `[ytup] startup` error.
43. **Leftover handles are swept (optional).** Drop 3 files on the panel and close the panel at
    once, before the cards appear (or reload the extension right after the drop). Note the
    ids in the panel's DevTools → Application → IndexedDB → `ytup-files` → `handles`. Quit
    and restart Chrome, open the service worker console: the handles of files no queue item
    uses are gone from `ytup-files`; the queued items' handles are still there, and there is
    no `[ytup] handle sweep` error. Known window: files dropped within about 1 s of Chrome
    starting can be swept before their item is saved, and then fail with "This file is no
    longer available — add it again" (handles carry no timestamp to skip new ones).
44. **Bridge parent-source check (note, nothing to run).** The bridge accepts a connect only
    from its Studio parent frame (origin `https://studio.youtube.com`, `source` is its
    parent, a port attached): `isBridgeConnect` in `lib/file-bridge.ts`, unit-tested in
    `tests/file-bridge.test.ts`. Items 9 and 37 show it working in real Studio; close the
    ledger item from those.

45. **Debug page and crash guard.** Settings → Troubleshooting → **Open debug page** opens
    `debug.html` in a tab: Overview shows schemaVersion 5 / 5 and "answered in … ms"; the Studio
    tab answers; the error log lists recent `[ytup]` errors with their context. **Copy
    diagnostic report** and paste: it has every section and the log. **Record** anything a
    section shows as failed. Then, in the service worker console, run `chrome.storage.local.get(
    'debugLog')` to see the same entries.

### Copyright, Phase 4a (scan, lists, one lock)

These check what 4a added (trim, Auto-pilot, Ads and Collab are items 54 to 74). Use a channel
with at least one copyright claim.

46. **Scan claims and the status card.** Copyright → **Scan claims**: the status card shows the
    scan with its progress, then "Scan complete"; **Claim list (N)** and **Claimed songs (N)**
    get their counts; "Show activity ▾" lists the scan's lines, ending "Scan complete ✓ …".
    With Studio in Thai the tab warns "⚠ Studio is set to Thai — …". **Record** any "Unexpected
    answer from …" line in the activity log, and a last line "Couldn't read the claim details
    of N of M videos — this scan is incomplete" (the card then says "Needs attention" instead
    of "Scan complete"; see "Known behaviour, Phase 4a").
    - **Claim list.** One card per claim; the "Select:" chips tick claims (ticking only builds
      a list, nothing changes on YouTube); **⬇ CSV**; **↻ Rescan**.
    - **Claimed songs.** Search, sort, **Remove from history** and **Delete all** (each asks
      again first). **⬇ CSV**, then **⬆ Import CSV** of that file: "Imported N songs into
      history". A file over 16 MB toasts "This file is too large — the limit is 16 MB"; a CSV
      without a song column, "This is not a song history CSV …". The import is lossy (see
      "Moving from the userscript") and the CSV cells are not neutralised (see "CSV exports").
    - **Fix tracklist.** Pick a claimed video (its tracklist comes from the upload history, or
      paste one; a `.txt` dropped on the box stays in the box), tick the trimmed ranges,
      **📋 Copy new tracklist**: "New tracklist copied — paste it into the video description".
    - **The chip.** After the scan, drop a clip whose `.txt` names a claimed song: the card
      shows "N song(s) previously claimed", and its tooltip lists the lines.
47. **The scheduler avoids a taken slot.** Schedule a video on the channel in Studio for
    tomorrow 19:00. In the panel set "First video releases" to the same time and queue 2 clips:
    the schedule box's summary adds "· 1 already scheduled on the channel (next …) — skipped 1
    slot(s)", and the cards' times start at the next slot. Start: neither clip is scheduled at
    tomorrow 19:00.
48. **A scan during an upload.** Start a clip and, while it uploads, press **Scan claims**: the
    scan runs to "Scan complete" and the upload finishes Done (a scan takes no lock). The
    activity bar keeps showing the upload.
49. **Status in a second window and in the activity bar.** With Studio in windows A and B on
    the same channel and nothing uploading, press Scan claims in A: the activity bar in A's
    panel shows the copyright status; after the scan, B's Copyright tab shows the same counts
    within a few seconds, without a reload.
50. **Light and dark, narrow.** Drag the panel to its narrowest (about 320px) and look at the
    Copyright tab, the claim list (scrolled to its end: the footer stays at the bottom edge),
    Claimed songs and the tracklist editor, in Chrome's light and dark themes, English and
    Thai: no sideways scroll, no clipped button, error text readable in light.
51. **CSV downloads in the real side panel.** **Upload history**, the claim list's **⬇ CSV**
    and Claimed songs' **⬇ CSV** each save a file from the side panel (no new tab, no blocked
    download). **Record** the file names and whether Chrome asked anything.
52. **One worker per channel.** Turn Auto-pilot on (item 69) with two Studio tabs open on the same
    channel. In the service worker console, `await chrome.storage.session.get('claimsWorkers')`
    (easier: the debug page, Settings → Troubleshooting → **Open debug page** → Stored data →
    `storage.session` → `claimsWorkers`; reload the debug page to see it change. Item 42 says how
    to open the service worker console.)
    names one tab for the channel (`{ tabId, at }`, `at` moving about every 10 s). One cycle runs,
    not two; during a run the other tab's card shows "↪ Running in another Studio tab". Close the
    worker tab: within about 10–15 s the entry names the other tab, and it carries on. **Record** what
    happens when the worker tab hangs instead (DevTools → pause script execution): the other tab
    takes over after about 20–30 s.
53. **Start refused during copyright work.** Start a trim run in Studio tab A (item 57). In tab B
    the panel shows "Another Studio tab is busy with copyright work — wait for it, or press Stop in
    the Copyright tab" with **Go to that tab**, Start is disabled, and a forced Start (item 16's
    way) toasts "Another Studio tab is already running the queue or copyright work". When A's run
    ends, B's banner goes and Start works.
    - The banner appears within a second or two of A's run starting and goes as quickly when it
      ends, A's tab is closed, or A's tab is moved to another site (type example.com in it) (tabs
      are told when the lock changes; they no longer ask every
      second). The same for item 18's "Another Studio tab is running the queue". **Record** a
      banner that takes longer than a few seconds, or stays.
    - **Record**: with a Studio tab open and nothing running, does the service worker go
      "inactive" on `chrome://extensions` after about a minute? (Every Studio tab tells the
      extension's background every 10 s that it is still there, so the background may stay
      awake; that is expected, write down what you see.)

### Phase 4: copyright (scan, trim, Auto-pilot)

Use a test channel with at least two videos that carry claims (one with two claims), Studio in
English. Write down pass or fail; items marked **record** ask for an observation.

> **These items change real videos.** A saved trim cuts the video and its sound for good
> (YouTube cannot undo it). "Turn on ads" changes a video's monetisation. A Collab invite adds
> another channel to a video. Auto-pilot does all of the first two by itself, on every video its
> rules pick, without asking.
>
> - Items 53, 57 to 60 and 62 to 64 (trim): only on videos you are willing to cut. Safest: upload a
>   private or unlisted test video that contains a song you know gets claimed, wait for its
>   claim, and trim that one.
> - Item 65 (ads) and item 66 (Collab): tick only private test videos; for Collab invite a
>   channel of your own.
> - Items 52, 69 and 70 (Auto-pilot): first open Copyright settings, set "Max claims per cycle"
>   to 1, and read the rules in the question before you turn it on. Use a channel where the only
>   claims are on test videos.
> - When you finish: turn Auto-pilot off, turn "When trimming manually…" off, set "Fully
>   automatic trim", "Run every N hours" and "Check every N minutes" back, and switch Studio
>   back to English after item 61.
>
> Suggested order for one sitting: 54 to 62, then 53 and 63 to 68, then 69, 52 and 70, then 71
> to 74 (item 52 needs Auto-pilot on, item 53 needs a trim run).

54. **Scan, on a claim-heavy channel.** (Items 46 and 51 cover the scan, the status card, the
    lists and the CSV files.) Scan the channel with the most claims you have: the claim list shows
    one card per claim with video, privacy · length, song · artists · label, claimant, ranges with
    % of the video, and impact. Then open **Show activity ▾**: no "Unexpected answer from …"
    lines. **Record** any, with its text (it names the endpoint and the field: Studio answered in
    a shape the check doesn't know).
55. **Scan before Studio loaded / not signed in.** Reload Studio and click Scan at once:
    "Studio hasn't finished loading — try again in a few seconds" in the activity log. (Optional:
    in a signed-out profile, "Not signed in (SAPISID cookie not found)".)
    - **Record** how long the round button (bottom right in Studio) takes to appear after a
      reload. It waits for the background to answer two questions first: normally well under a
      second, 15 s at the very worst.
56. **Picks.** Each chip ticks the right rows; ticks survive closing and reopening the panel and
    show in another window's panel on the same channel.
57. **Trim, automatic.** Tick one claim, **✂ Trim selected (1)** → the question (total length,
    "Saved trims cannot be undone", ⚡ Fully automatic) → **Start trim**. The tab opens the
    video's claims page, the card shows the steps (Open video → … → Confirm). When the run ends
    open **Claim list** again: the claim's card says "✅ Trimmed" with its range; the Upload tab's
    queue is untouched. **Record** the time it took.
    - **The right claim.** On a video with several claims (best: two with the same song title),
      turn on review mode (item 59) and, before you click Save, compare the times in YouTube's
      trim editor with the range on that claim's card: they are the same claim's.
    - **The confirmation.** In automatic mode the "I acknowledge" box of YouTube's "Confirm
      changes" dialog gets ticked, Confirm is clicked, and an "OK" / "Got it" dialog that follows
      is closed. The activity log says "✔ Trim confirmed …".
    - **When YouTube says no.** **Record** what a claim that can't be trimmed ends as (no "Take
      action" button, the Trim option greyed out, the editor not opening): its card shows ❌ with
      a reason, YouTube's dialogs are closed, and the run goes on to the next claim.
58. **Several claims on one video.** Trim both claims of the two-claim video: the first trims, the
    second shows "⏳ Queued — will trim after the previous trim on this video finishes"; the card
    says "Waiting for YouTube to process trims" with the next check time. Set Copyright settings →
    "Check every N minutes" to 2 and wait: the second trims after YouTube finishes (can take hours;
    **record** whether it happened before the end of the session).
    - While YouTube is still working the activity log says "⏳ …: previous trim still processing".
      A claim that YouTube released meanwhile ends "✅ Claim gone". Reloading the Studio tab
      checks at once instead of waiting for the next check time. Leave the tab hidden for more
      than five minutes while it waits: the check still happens, up to a minute late.
59. **Review mode.** Turn off "Fully automatic trim": the trim editor opens and waits ("👉 Your
    turn…"); Cancel ends it "⏭ Skipped"; Save + I acknowledge + Confirm changes ends it "✅ Trimmed".
    - While the editor waits for you, another Studio tab can't start its queue (item 53's
      banner): a review holds the one lock until you answer.
60. **Stop.** During a run, **Stop** (also from a second window's panel on another Studio tab of the
    same channel): the run ends after the current step, "You stopped it: …"; queued follow-ups are
    cancelled ("Cancelled N queued follow-up trims").
    - Try Stop during a trim, during an ads run (item 65) and during a Collab run (item 66):
      after the step in progress nothing more is clicked.
    - With the run in a tab of **another window**, Stop in this window's panel still reaches it.
61. **Studio in Thai.** Switch Studio to Thai: the red warning shows on the Copyright tab, Scan still
    works, a trim fails with "Studio is not set to English — switch to English and try again" and
    nothing is clicked on the page.
62. **Manual trim auto-save.** Copyright settings → turn on "When trimming manually…"; trim a claim
    by hand in Studio: Save is clicked about 1.5 s after the editor opens, Confirm changes is ticked
    and confirmed. Turn it off again: nothing is clicked for you. During a trim run the helper is
    off: the run does its own clicks.
    - **Copyright settings, the view itself.** Ten settings in two groups. **Save** closes the
      view and toasts; **Reset to defaults** asks once more; **Cancel** changes nothing. In a
      short panel the three buttons stay at the bottom edge while the list scrolls. With the
      keyboard only: Tab reaches every field and button in order. With a screen reader each
      field is read with its label and, where it has one, its help text. **Record** anything
      that isn't.
63. **One lock.** Start a trim run in Studio tab A; in tab B (same browser) the Upload tab's Start is
    disabled with "Another Studio tab is busy with copyright work — wait for it, or press Stop in
    the Copyright tab" and **Go to that tab**. Reverse: with a queue running in A, a trim run
    started in B (another channel) waits at its first page change (its card shows "⏸ Waiting for
    another Studio tab to finish (page change needed)") and goes on after A's queue ends. (An
    Auto-pilot cycle that comes due in B while A's queue runs still scans, because scans take no
    lock; the trims it then starts wait the same way.) With no tab running the queue, a trim, ads
    or Collab run waits while the queue has **waiting** videos ("⏸ Waiting for the upload queue
    to finish…"); a **failed** upload left in the queue doesn't hold it back.
    - **A waiting run doesn't block the others.** Put two clips in A's queue without starting,
      then start a trim run from A's panel: it waits for the queue. Now in B, Start (or a trim
      run) works. When the queue is clear again, A's run goes on by itself.
    - **The channel changed elsewhere.** During a run in A, switch channel in another Studio
      tab. A's next page is on the new channel: the run stops there (it is kept for the old
      channel) and other tabs can start again.
64. **Run survives page changes; takeover.** During a run with 3 claims on different videos, the tab
    changes pages per video and keeps going. Close that tab mid-run with a second Studio tab on the
    same channel open: the second tab continues within about 10–15 s.
    - While the run changes pages, the other tab's card says "↪ Running in another Studio tab".
      In the running tab's panel open **Fix tracklist** (or Copyright settings) during the run:
      the view stays open through each page change. (The Claim list button is hidden while a
      run is going; that is expected.)
    - **A hidden tab.** Start a run in A, switch to another tab or window and leave A hidden
      for more than five minutes: the run keeps going (slowly: Chrome wakes a hidden tab about
      once a minute). It must not stop for good with A saying "Running in another Studio tab"
      and B saying "Waiting for another Studio tab".
    - **Memory Saver.** If Chrome discards the running tab (`chrome://discards` → Urgent
      Discard), the other tab takes over as if it had been closed. With a third thing to watch:
      B's "Another Studio tab is busy…" banner goes within a few seconds of the discard.
      **Record** if it takes about 30 s.
    - **Back button. Record**: can Chrome bring a Studio video page back from its Back-button
      memory (the "back/forward cache": Chrome keeps the last page frozen so Back is instant)?
      Check: in the running tab, DevTools → Application → Back/forward cache → **Test
      back/forward cache** on a video's claims page, and write down what it says. If it says
      the page can be restored: start a run with claims on two videos, wait until the tab has
      moved to the second video's page, and press Back once. The first video's page must load
      again by itself (you see it reload) and click nothing; the run then goes on. **Record**
      a page that comes back and clicks Save or Confirm without reloading. Also, if pages can
      be restored: move an idle Studio tab B to another site, start the queue in A, press Back
      in B: within a second or two B refuses a queue edit with "Another Studio tab is running
      the queue — change the queue there".
    - **Extension reloaded mid-step.** Reload the extension on `chrome://extensions` while a
      trim step is on screen: the old page stops before "Confirm changes". Reload the tab; the
      run goes on.
65. **Ads.** **Ads off** (first time: it scans) → the list with ineligible ones marked → **💰 Turn
    on ads (N)**: each video's monetisation page opens, "None of the above" is answered when asked,
    Save; the status card counts the videos, and when the run ends open **Ads off** again: each
    card says "✅ Turned on". **Record** any "YouTube asked more after Save" message.
    - A video whose ads were already on: nothing is clicked, the activity log says "✅ Ads turned
      on: … (Already on)" and its card says "✅ Turned on".
    - **↻ Recheck** with a list already there: when the new list opens, the ticks start again
      from the new list and the number on **💰 Turn on ads (N)** matches the ticked rows.
66. **Collab in bulk.** **Collab** → type `@handle` (kept after reopening), pick videos, **🤝 Invite
    (N videos)**:
    each video's edit page opens, the invite is sent and saved; "Invite links" lists the link with
    **Copy**. If the handle is one of your own channels (in the channel list), the tab switches to
    it and accepts (with "Auto-accept channel permission invites" on).
    - **Copy** puts the link on the clipboard and toasts "Copied …'s link". If Chrome refuses
      the clipboard, the toast is "Couldn't copy".
    - Type a handle and close the side panel straight away, then open it again: the handle is
      there. **Record** if the last letters are missing.
    - **A large channel. Record** how typing in the handles box and ticking feel in the Collab
      view on the channel with the most videos you have (see "Known behaviour, Phase 4b").
    - The switch to your own channel does not happen while the upload queue has work, here or
      in another tab.
    - **Narrow, both themes.** At about 320px, light and dark, English and Thai: the Copyright
      tab's buttons, the trim and Auto-pilot questions, the Ads and Collab views and Copyright
      settings show no sideways scroll and no clipped button; the "Select:" chips are readable;
      the small dot on the Copyright tab's name (while something runs) doesn't push the name
      out of the tab bar.
67. **Claimed songs.** The list searches and sorts; ✕ asks "Sure?"; ⬇ CSV / ⬆ Import CSV round-trip
    (`claimed-songs-*.csv` from the userscript imports with "Imported N songs into history");
    "Delete all" asks once more ("Press again to delete all"). A `.txt` dropped into the queue with
    a claimed song shows "1 song(s) previously claimed" on its card, the tooltip listing it. A card
    that was in the queue before the scan gets the chip after it, without reloading the tab.
68. **Tracklist fix.** **Fix tracklist** → pick a trimmed video: its upload-history tracklist is
    filled in, the trimmed range ticked, the new tracklist has the cut song removed and later
    times moved up; **Copy new tracklist** toasts. A `.txt` dropped on "Original tracklist" replaces it.
69. **Auto-pilot.** Turn it on (the question lists the rules) with "Run every N hours" = 0.5: the
    card says "Auto-pilot is on · Next scan + trim in …"; within a minute a cycle scans and trims
    what the rules pick. Afterwards, in the service worker console, `await chrome.alarms.getAll()`
    shows one `ap:<channelId>` at the next cycle (none while a cycle is due). Turn it off: the
    alarm is gone.
    - **Two tabs, one channel.** Open a second Studio tab on the same channel: one cycle runs (one
      "🤖 Auto-pilot starting a new cycle" in the log), not two; the other tab's card shows
      "↪ Running in another Studio tab" during runs.
    - **The rules.** With nothing left to trim the log says "🤖 Nothing to trim, next check …".
      Copyright settings → "Also turn on ads for videos that have them off": on, a cycle that
      has nothing to trim also turns ads on; off, it doesn't. Clips waiting in the upload
      queue hold the cycle back until the queue is clear.
    - If the panel opens on a Studio tab that doesn't know its channel yet (the first moment
      of a page load), the switch is greyed out until it does.
70. **Auto-pilot with no Studio tab.** With Auto-pilot on, a few minutes before its next cycle
    (the card's "Next scan + trim in …"), close every Studio tab, wait past the time, then open
    Studio on that channel: the cycle starts within a few seconds of the page loading. While you
    waited, the extension's card on `chrome://extensions` showed its service worker as
    "inactive" (**record** if it never did). **Record** whether a backgrounded
    Studio tab started its cycle on time (the alarm wakes it); a tab Chrome discarded (Memory Saver)
    has no script and does not wake.
    - **The "due" notification.** In that same wait, when the cycle's time came with no Studio tab
      open, one desktop notification "Auto-pilot is due" naming the channel appears (once: restarting
      Chrome or the extension doesn't show it again for the same cycle). Clicking it opens Studio on
      that channel in a new tab, and the cycle starts there within a few seconds. With a Studio tab
      on that channel open, no notification. The computer must be awake and Chrome running at
      the cycle's time (see "Known behaviour, Phase 4b").
    - **A tab hidden for a long time.** Leave the channel's Studio tab hidden for more than
      five minutes across a cycle's time: the cycle starts on time and **no** notification
      appears.
    - **In Thai.** With the panel's language set to Thai, the notification is in Thai
      ("Auto-pilot ถึงรอบแล้ว"). **Record** its language when it is the first thing that happens
      after Chrome sat idle for a while (it can come out in English then).
    - **No window open (macOS).** Close every Chrome window but leave Chrome running, then click
      the notification: a new window opens with Studio on that channel.
    - **Chrome closed at the cycle's time.** Quit Chrome before the cycle's time and start it
      after: no notification; the cycle starts when a Studio tab on that channel loads.
    - **The notification goes away.** Leave it unclicked and open Studio on the channel
      yourself: once the cycle has started, the notification is withdrawn.
71. **Scheduled slots after a trim run.** (Item 47 covers the scheduler avoiding a taken slot.)
    Repeat item 47 right after a trim run changed pages in that tab: the schedule box still
    skips the taken slot (the scheduled list is read again on the new page).
72. **Two windows, one queue.** Two windows with panels on two idle Studio tabs: edit a card's
    title in one and another card's title in the other within half a second: both edits stay.
73. **Settings changed after the summary.** Open the start summary in window A, turn scheduling off
    in window B's panel, confirm in A: "Settings or presets changed after you confirmed — click
    Start again to see the new summary".
74. **Activity log.** **Show activity ▾** shows the lines of scans and trims (they survive the
    trim's page changes); the open/closed choice is kept.
    - **When a save fails. Record** only if you see it: "Couldn't save (…)" appears once per
      message per minute, not on every tick.

### Phase 5: cutover

Nothing in this section has been run in Chrome yet. Every item is the owner's to run: it says
what to do and what should be seen. Write down pass or fail; **record** asks for an
observation.

- Use the zip you were handed, with its content hash, not a folder built on your own machine.
- Items 75 to 78 and 81 to 87 are done on that test zip **before** the release.
- Items 79 and 80 need userscript v4.29.0: do them on the file you are handed before it is
  published (Task 11 of `docs/superpowers/plans/2026-10-11-chrome-extension-phase-5.md`),
  not before.
- Items 78 to 80 need the Tampermonkey script **on** for part of the item. Everywhere else in
  this checklist it is off. Turn it off again afterwards.
- Items 78 and 86 start trims: the warning under "Phase 4: copyright" applies ("These items
  change real videos").

75. **Install from the zip.** On a Chrome profile that never had the extension, follow "Install"
    with **the zip you were given** (before the first release there is nothing to download yet).
    The card on `chrome://extensions` reads "YouTube Upload Presets", version 5.0.0, with no
    **Errors** button (but see the record line below). The toolbar button opens the panel on a Studio tab. **Record** the ID on
    the card, and the content hash that came with the zip. The ID is
    `cllefnlbgkbdnmifojjflfcpholhniio`, the same on every computer.

    - The unzipped folder holds `manifest.json`, `background.js`, `sidepanel.html`,
      `debug.html`, `file-bridge.html`, `THIRD-PARTY-NOTICES.txt` and the folders `assets`,
      `chunks` and `content-scripts`, and nothing else.
    - **Record** what the toolbar button and the card's picture look like (expected today:
      Chrome's own tile with the letter Y; the extension ships no artwork yet), and whether
      Chrome showed "Disable developer mode extensions" at its next start.
    - **The Errors button (record).** Before the first release the background writes one
      warning at its first start, `[ytup] update check Error: GitHub answered 404` (item 77
      explains it). **Record** whether Chrome shows an **Errors** button on the card for it.
      If the button shows only that line, it is the expected warning.
    - If Chrome is in Thai, **record** the Thai names of Developer mode, Load unpacked,
      Remove and the start-up box, so the Thai section can name them.
    - The panel is in English on a fresh install; item 3 switches it to Thai.
76. **Update in place.** Ask the controller for a **test zip of a higher version** (it is the
    same build with `"version": "5.0.1"`, made in a scratch folder and never released). Follow
    "Update" with it. Presets, settings, queue cards and upload history are all still there
    afterwards, and `chrome://extensions` shows 5.0.1. Then update back to the 5.0.0 zip the
    same way.
    - **Queued files (record).** With two clips waiting in the queue before the update:
      afterwards the cards are still there and the panel shows "Files in the queue need read
      access again — the browser has withdrawn it" (an update closes every page of the
      extension; the access is expected to end with them). Press Start, without clicking
      the banner's button. **Record** whether Chrome showed a prompt (none is expected in
      the side panel), that the banner went, and that the clips upload. If nothing ran,
      **record** the toast and the `[ytup] regrant` lines (item 16).
    - **A different folder (record).** Unzip the same build into a *second* folder and Load
      unpacked from it. **Record** what Chrome does: replaces the first copy and keeps the data,
      refuses, or shows two copies. Remove the second copy if there are two. With the key both
      folders have the same ID, so two separate copies with separate data are not expected.
77. **Update available.** In the service worker console (item 42 says how to open it):
    `await chrome.storage.local.set({ updateCheck: { at: Date.now(), latest: '99.0.0', url: 'https://github.com/TAEJK88/youtube-upload-presets/releases/latest' } })`.
    The panel shows "Update available: version 99.0.0 (you have 5.0.0)" as its last banner,
    without closing and reopening it; **Get the update** opens the release page in a new tab.
    The banner has no close button. In Thai it reads "มีเวอร์ชันใหม่: 99.0.0 (ที่ใช้อยู่คือ
    5.0.0)" with the button "ดาวน์โหลดเวอร์ชันใหม่".
    - **An older or equal "latest".** Store the same with `latest: '5.0.0'`, then `'4.9.9'`:
      the banner goes each time.
    - **The real check.** `await chrome.storage.local.remove('updateCheck')`, then close that
      console, press the extension card's round **reload** arrow, and reload the Studio tab
      (as "Update" says). Open the service worker console again and look at
      `await chrome.storage.local.get('updateCheck')`.
      *Before the first release exists:* `latest` is empty, the console has one warning
      `[ytup] update check Error: GitHub answered 404`, and the panel shows no banner.
      *After a release:* `latest` is the released version and there is no banner when you
      have that version.
    - **Record** what the request carries: service worker console → Network → the request to
      `api.github.com` → Request Headers. Expected: no `Cookie` and no `Authorization` line;
      an `Origin: chrome-extension://<id>` line may be there (write down whether it is).
    - `await chrome.alarms.getAll()` lists one `update-check` alarm with `periodInMinutes: 1440`.
78. **Both installed.** Turn the Tampermonkey script on again and reload Studio: within a second
    or two of the script's own button appearing, the panel shows "The Tampermonkey script is
    still on in this tab — turn it off in Tampermonkey, then reload this tab. Uploads, trims
    and Auto-pilot wait until then" as its **first** banner (in Thai: "สคริปต์ Tampermonkey
    ยังเปิดอยู่ในแท็บนี้ — …"). With a file queued, **Start** toasts the same sentence, shows
    no summary and uploads nothing. In the Copyright tab, a trim (after its question), an ads
    run and a Collab invite each toast the sentence and start no run. **Scan claims** still
    runs to "Scan complete" and opens its list, and the status card keeps updating. Turn the
    script off and reload the tab: the banner is gone and Start shows its summary.
    - **No false alarm.** With Tampermonkey off, on a video's details page and on its claims
      page, run `document.querySelectorAll('#ytp-root').length` in Studio's console: 0 (YouTube
      has no element of that name itself), and the panel shows no Tampermonkey banner.
    - **Timing (record).** Both on, the panel open with a file queued: reload the tab and press
      Start as early as the button allows, several times. **Record** whether a run ever starts,
      before the banner or a moment after it. If one does: it finishes its current video and
      stops ("Queue stopped (N video(s) done)"), the page shows the Tampermonkey sentence once
      (it does not say "Will stop after the current video finishes"; the panel shows the run as
      stopping), the other videos stay waiting, and nothing starts again by itself, also not
      after the script is turned off and the tab reloaded.
    - **A run already stored.** With the script off, start a trim run of two claims in review
      mode (item 59). While it waits on the first video's page, turn the script on and reload
      the tab. The status card stays on the run and its step line is "⏸ The Tampermonkey script
      is still on in this tab — …" (not "Waiting for another Studio tab"); the page shows the
      sentence once; the page does not change; **Stop** ends the run ("You stopped it: …").
      Before pressing Stop, turn the script off again and reload only a second Studio tab:
      that tab can start its queue (the waiting tab gave the lock back).
    - **The run goes on afterwards.** Repeat without pressing Stop, then turn the script off and
      reload the tab: the run goes on. A claim that was trimmed meanwhile ends "✅ Claim gone";
      it is not trimmed again.
    - **Save is not pressed for the script's run.** Userscript: "Fully automatic trim" off.
      Extension: Copyright settings → "When trimming manually…" on, no trim run of its own.
      Start a trim run in the userscript: its editor opens and stays open until you press Save
      yourself; the extension presses neither Save nor "Confirm changes". Turn the script off,
      reload, open a trim by hand: the extension presses Save as in item 62.
    - **Auto-pilot with both on.** Auto-pilot on and due, the script on: the extension's cycle
      scans, the activity log says "🤖 Auto-trimming N claims", then it waits; it opens no
      video page.
    - **A quiet wait (record, for a developer).** Leave a waiting tab open for a minute with
      `chrome.runtime.onMessage.addListener((m) => console.log(new Date().toLocaleTimeString(), m && m.type))`
      pasted into the service worker console: one `runner:holds` about 30 s after the wait
      began, then none. **Record** a steady stream of them.
    - **A tab from the build before.** A Studio tab left open from an older build shows "This
      tab is not connected to the extension yet — reload this tab" in the panel (the tab and
      the panel check that they are the same build).
79. **The move.** In the userscript (v4.29.0): the drawer shows "This script has moved to a Chrome
    extension"; **Export my data** saves `yt-upload-presets-move-YYYY-MM-DD.json`. Import it in
    the extension as **My file**: the question says "With "My file" this file also adds N
    upload history rows and M channels from the Tampermonkey script and sets the panel's
    language to ไทย" (or English), and its first sentence ends "(the locked channel stays
    unchanged)". Afterwards Copyright → Upload history has the old uploads, the ⇄ channel
    list has your channels, the panel is in the language the userscript was in, and a clip
    you uploaded before shows "Already uploaded …" when added to the queue on the same channel.
    - Import the same file again: no row and no channel appears twice.
    - Import it as **Someone else's** on a clean profile: no upload history, no channels, and
      the language stays as it was.
    - Import an ordinary backup (**Export (.json)**): the question reads as before ("locked
      channel and language stay unchanged") and has no Tampermonkey line.
    - A channel the userscript knew only by its id (added by hand, never opened) arrives in
      the list without a name, as it was there.
80. **The userscript's notice.** With v4.29.0: the notice is at the top of the drawer on every
    tab of it; **How to move** opens the README's "Moving to the Chrome extension" on GitHub; a
    toast "This script has moved to a Chrome extension — …" appears a few seconds after Studio
    loads with an empty queue, once a day, and not while the queue holds videos; everything
    else in the script works as before (upload one clip).
81. **Read the differences (gate).** Run `npm run parity -- --release` (or ask for its output):
    it lists every row that is *changed* or *dropped* on purpose, each with its reason. Read the
    whole list. The release waits until you have said, in your own words, that you read it and
    accept it; anything you do not accept goes back to the controller as a `missing` row.
82. **Which tab the panel shows.** The round Studio button, the "queue finished" notification
    and a pick in Studio's own dialog each ask the panel for a tab.
    - **The button, panel closed.** During an upload run, close the panel and click the round
      button: the panel opens on Upload. During a copyright scan or trim with no upload
      running: it opens on Copyright. (This needs Chrome to accept the click, as in item 7.)
    - **The button, panel open.** During an upload run, put the panel on Settings and click the
      button: the panel switches to Upload. During copyright work with the panel on Presets: it
      switches to Copyright. With nothing running, the button leaves the panel on its tab.
    - **The notification.** With "Notify when the queue finishes" on, put the panel on Settings
      (or close it), switch to another window, let the queue finish and click the notification:
      the Studio tab comes forward and the panel shows Upload. If Chrome does not open a closed
      panel from the notification (item 24), open it with the toolbar button within a few
      seconds: it shows Upload.
    - **Studio's own dialog.** With the panel on Presets and no other tab running, pick two
      videos in Studio's own upload dialog: they go to the queue, Studio's dialog closes and
      the panel shows Upload. **Record** whether a closed panel opens after such a pick.
    - **Two Studio tabs, one window (record).** Open the panel on tab A and put it on Settings.
      Go to tab B, start a run there and click B's round button. Go back to A. **Record**
      whether A's panel is still on Settings.
    - **Speed (record).** An open panel switches at once. **Record** a switch that takes more
      than a second or two, or a panel opened by the click that comes up on the wrong tab.
    - Settings → Troubleshooting → **Open debug page** → Stored data → `storage.session`: after
      a click on the button during a run, `panelTab` reads `{"tabId":…,"tab":"queue","at":…}`.
83. **A second Studio tab leaves a multi-file pick to Studio, and says so.** Start the queue in
    Studio tab A. In tab B open Studio's own upload dialog and pick two videos: Studio uploads
    them itself, and B's page shows once "Another Studio tab is running the upload queue or
    copyright work — these files were left to YouTube's own upload and get no preset". Do it
    again with a drop of two videos on Studio's dialog: one toast again. **Record** two toasts
    for one drop.
    - Pick or drop **one** video in B: no such message.
    - With Settings → "Take multiple files from YouTube's dialog" turned off: no message
      either.
    - The "progress bar stopped" message ("⚠ The progress bar stopped: … — try reloading the
      page") cannot be made to appear by hand on a healthy page. **Record** it if you ever see
      it, with the `[ytup] progress` or `[ytup] fab` lines of the debug page.
84. **The page toast's look.** In Studio with the side panel closed, press Alt+1. "Main preset:
    …" appears at the bottom centre for about 4 seconds: a dark see-through box with the page
    behind it blurred (like the round Studio button) and a thin light edge, light text, and a
    white round tick with a dark check mark, not a red-orange one.
    - Do it with Studio's light theme and with the dark theme: the same dark box, and the text
      is easy to read on both. On a white page the edge is almost invisible; that is expected.
    - **A long message.** The message of item 83 is a long one: its box is no wider than
      560 px and the text wraps inside it.
    - **Thai.** With the panel in Thai, the message's letters are normally spaced and digits
      are equal in width.
    - The toast fades and slides in, goes after about 4 s, never blocks a click on what is
      under it, and sits above Studio's own dialogs.
85. **Folders at every depth.** Make a folder with a clip five folders down
    (`Mixes/a/b/c/d/Deep.mp4`) and its `Deep.txt` in the top folder. Click "pick a whole
    folder" and choose `Mixes`: the clip is queued with its `.txt` attached. Remove it, then
    drag `Mixes` onto the panel: the same.
    - **Too many files.** Pick, then drag, a folder with more than 2000 files (a project
      folder): nothing is queued, and a message says "The folder(s) hold more than 2000 files,
      so nothing was added — pick only the folder with the videos to upload". It comes back
      quickly. The same when several folders dragged together hold more than 2000 files in all.
    - **Near the limit (record).** A folder of about 1500 files with a few videos: **record**
      how long it takes before the cards appear and whether the panel stays usable. Again with
      several folders dragged together, each under 2000 files.
    - **A folder that can't be read (record).** Pick a drive or card root that has
      `.Spotlight-V100` or `.Trashes`, and a folder holding a subfolder you have no read rights
      for: the clips are queued and "Some folders couldn't be read — the files in them were not
      added" shows once, however many folders failed. **Record** which folders raised it.
    - **Hidden files.** A folder holding `.DS_Store` and `._Clip.mp4`: neither is queued, and
      neither is counted in "Skipped N file(s)".
    - **On a card.** Drag a `.txt` onto a waiting card together with a folder: the `.txt`
      attaches and the folder is ignored. A folder alone dragged onto a card goes to the queue.
86. **The trim question and the Auto-pilot question open on Cancel.** In the claim list tick a
    claim and press **Trim selected**: the question opens with **Cancel** outlined, in light
    and in dark. Press Enter: the question closes, nothing is trimmed, the list is still open.
    Open it again, wait a second and click **Start trim** once: the trim starts. Turn the
    **Auto-pilot** switch on: the question opens with Cancel outlined; Enter closes it and
    Auto-pilot stays off; **Turn on** needs a click.
    - **Double-click.** Make the window short (the panel about 420 to 640 px high), tick a
      claim and double-click **Trim selected**, fast and then slowly: the question stays open
      with the outline on Cancel and nothing is trimmed. Press Enter straight after: it closes,
      nothing is trimmed. Repeat with a warning line showing (your own song ticked, or the
      upload queue busy) and in Thai.
    - Double-click with a long second press (hold it half a second), and click **Trim
      selected** six times fast without moving the mouse: no trim.
    - **A click in the first 0.8 s does nothing.** That is intended: wait a moment and click
      again. Tab then Enter straight after the question opens starts the trim with no delay.
    - Escape, **Cancel** and a click outside the box cancel at once.
    - Tab to **Trim selected** and hold Enter; the same on the Auto-pilot switch: no trim,
      Auto-pilot stays off.
    - Scroll so the Auto-pilot switch sits where **Turn on** appears and double-click the
      switch: Auto-pilot stays off, and Enter then closes the question.
    - With a touch screen or a pen, if one is to hand: tap **Trim selected** twice quickly: no
      trim.
    - **Record** where keyboard focus is after a cancel (expected: on the page, not back on the
      button that asked; see "Known behaviour, Phase 5").
    - Every other question (delete a preset, start an upload, import) still opens on its main
      button: Enter and an immediate click both answer yes.
87. **Two things nobody has checked (record).** Both are suspected from reading the code.
    - **Option+P on a Mac.** With **Alt+P** assigned on `chrome://extensions/shortcuts`, click
      into a Studio text field (a video's title) and press Option+P. **Record** whether the
      panel opens or a character is typed ("π" on a US keyboard). The userscript let the
      character be typed.
    - **A copy that fails.** On a video's details page click the quick-action **Copy** under
      the title, then paste somewhere: the title is pasted. **Record** any time "Title copied"
      shows and the paste gives something else (a refused clipboard write is not reported
      there).
88. **Queued files stay readable (the checks nobody has run in Chrome yet).** What the
    extension now does: the side panel keeps hold of every queued file while it is open; the
    Studio tab keeps hold of the files it has read (every file is read once when it is
    added) and, from Start on, of every file of that run; the panel looks at the access
    again when it is shown, when Start is pressed and after a Re-grant click; Start asks the
    browser for the access inside its own click. Why: Chrome's source code suggests that a
    file stays readable only while a page of the extension holds it. That has not been seen
    in Chrome; these steps are where it is. **Record** each outcome; "means" says what it
    tells us.
    1. **Add, wait, Start.** Drop two clips on the panel, leave the panel open for two
       minutes without touching it, press Start. Both upload and no banner shows: holding
       works (or the loss needs more time). The banner, or a card with "No permission to
       read this file": holding does not keep the access; the explanation is wrong or
       incomplete. Send the debug report.
    2. **Collect garbage (two minutes, optional, needs DevTools).** With one clip queued,
       right-click the panel → Inspect → Console, and paste the line below. It prints each
       stored file's state every 3 s (it reads the store itself and keeps nothing). Then
       DevTools → Memory → the bin icon "Collect garbage", two or three times. The line
       stays `granted`: holding works. It flips to `prompt`: it does not. Stop it with
       `clearInterval(window.__poll)`.

       ```js
       window.__poll=setInterval(async()=>{const q=indexedDB.open('ytup-files');q.onupgradeneeded=()=>q.transaction.abort();q.onsuccess=async()=>{const s=q.result.transaction('handles').objectStore('handles');const g=s.getAll();g.onsuccess=async()=>{const out=[];for(const h of g.result)out.push(h.name+'='+await h.queryPermission({mode:'read'}));console.log(new Date().toLocaleTimeString(),out.join('  '));q.result.close()}}},3000)
       ```
    3. **Reload the extension, Re-grant.** Queue two clips, reload the extension
       (`chrome://extensions` → the reload arrow on its card), reload the Studio tab, open
       the panel: the banner with **Re-grant access (2 files)**. Click it. The banner goes,
       the console shows `[ytup] regrant <id>: prompt -> granted` twice and Chrome shows no
       prompt: this Chrome gives a side panel the access silently. `prompt -> prompt` and
       the toast "The browser still does not allow reading 2 file(s) — click "Always
       allow…" on the banner …": it does not; the page in a tab that can show Chrome's own
       question is the way, as the toast says (the banner's second button, item 89).
    4. **Then wait a minute, Start.** Both upload: the access now outlives the click (the
       reported bug is gone). The Studio toast "The queued files need read access again —
       click "Re-grant access" in the side panel, then start again", with the banner back:
       the access still ends. Send the debug report.
    5. **Reload the extension, Start alone.** As step 3, but press Start instead of the
       banner's button. The run starts: one click is enough after a restart, a reload or an
       update. The "still does not allow" toast and nothing runs: as the second outcome of
       step 3.
    6. **Close the panel during a run.** Queue three clips, press Start, close the side
       panel while the first uploads. All three upload: the Studio tab's hold works. The
       second or third fails with "No permission to read this file — click "Re-grant
       access" in the side panel": a frame inside Studio does not keep the access (open the
       panel: the banner is there; click it, **Retry** the card, Start).
    7. **Close and reopen the panel before Start.** Queue two clips, close the side panel,
       open it again, press Start. No banner and both upload: the Studio tab held them. The
       banner shows and Start (or one click on the banner) takes it away and both upload:
       only the panel's own hold counts.
    8. **Close a tab of the extension.** With clips queued and the panel open: Settings →
       Troubleshooting → **Open debug page**, close that tab, wait ten seconds, click into
       the panel. The banner appears: Chrome withdraws the access when the last tab of the
       extension closes (so don't close the debug page in the middle of a run); press Start
       or the banner's button. No banner: that does not happen here. (Do this step before
       item 89: after "Allow on every visit" no banner is expected here whatever Chrome
       does when a tab closes.)

    If any step shows a card with "No permission to read this file" or the Studio toast
    that names **Re-grant access**: the banner with that button is on the panel at that
    moment. If it is not, **record** that too, with the debug page's report (the
    `[ytup] regrant` lines say what each click did).
89. **Allow file access once ("Allow on every visit").** What is built: a page of the
    extension, `allow.html`, that opens in a normal tab. A side panel never shows Chrome's
    own question about a file; a tab does. Seen once, in the owner's Chrome 155 (from the
    debug page's console, before this page existed): asking about a stored file in a tab of
    the extension shows Chrome's question with three buttons, "Allow this time", "Allow on
    every visit" and "Don't allow". **Seen in the owner's Chrome 155 on 2026-10-12 (build
    `e28864f`):** step 3 showed one question with three buttons, he picked "Allow on every
    visit"; no banner after closing the page's tab (step 5); no banner after quitting
    Chrome and opening it again (step 7); and, reported 2026-10-13, no banner with two
    more clips queued after the extension and the Studio tab were reloaded (the second
    half of step 7); and, the same day, after an update in place to a test build numbered
    5.0.1 (the same code, the card read 5.0.1): no banner, Start uploaded the queued
    clips and Chrome asked nothing. **Not run yet:** steps 8 to 10. Not reported: the words on Chrome's buttons
    in a Thai Chrome, and whether the question named one file or all three. **Record**
    each outcome.

    Chrome asks only about a file it does not let the extension read at that moment. So the
    page can do its work only while the panel's banner shows, and **before** Start or
    Re-grant access is pressed (both make the files readable without a question, and then
    there is nothing to ask). Steps 1 to 3 are in that order on purpose.
    1. **Get the banner.** Queue two clips, one with a thumbnail (three stored files).
       Quit Chrome fully, open it again, open Studio and the panel. The banner "Files in
       the queue need read access again — the browser has withdrawn it" shows, with two
       buttons on a row under its text: **Re-grant access (3 files)** and **Always
       allow…**. Do **not** press Start or Re-grant access. (Reloading the extension and
       the Studio tab instead of quitting Chrome gives the same banner.)
    2. **Open the page.** Click **Always allow…**. A new tab opens: "YouTube Upload Presets
       · Allow file access", three sentences (the second names "Allow on every visit"),
       the button **Ask Chrome for file access** and the line "Readable: 0 of 3 stored
       file(s)" (the page counts every file the extension has stored, so more if other
       clips are queued). Chrome has asked nothing yet, and the panel's banner is still
       there.
    3. **Ask.** Click **Ask Chrome for file access**. Chrome shows its question. **Record**
       the words on its buttons (in a Thai Chrome too: the page's Thai text gives
       "อนุญาตทุกครั้งที่เข้าชม" as Chrome's Thai for "Allow on every visit", which nobody has
       seen in Chrome) and whether the question names one file or all three. Pick **"Allow
       on every visit"**. Expected: no second question; the page says "Readable: 3 of 3
       stored file(s)", "Every stored file is readable. You can close this tab." and the
       sentence about "Allow this time"; the button is greyed out. The tab does not close
       by itself. **Record** how many questions Chrome showed.
       - If the question has only two buttons (no "Allow on every visit"): pick "Allow this
         time" (the page then asks about the next file; answer each the same way), close
         the tab, wait ten seconds, click into the panel (the banner is expected back),
         open the page again and ask again. **Record** whether the third button is there
         on the second visit.
    4. **Back in the panel.** Click into the Studio window. Without a click on the banner:
       the banner is gone and the card's thumbnail preview is back.
    5. **Close the page's tab**, wait ten seconds, click into the panel. No banner: the
       permission is the lasting one. The banner back: "Allow this time" was picked, or
       the lasting permission does not do what is expected here. **Record** which.
    6. **Start.** Both clips upload; Chrome asks nothing.
    7. **The check that proves "once".** Queue two new clips. Quit Chrome fully, open it
       again, open Studio and the panel. Expected: **no banner**, the previews show, Start
       uploads both, and Chrome asks nothing. Then queue two more, reload the extension
       (`chrome://extensions` → the reload arrow on its card) and the Studio tab: again no
       banner. If a banner shows in either case, the permission did not last: **record** it
       with the debug page's report; **Re-grant access** and Start still work as in item 16.
    8. **The other answers** (after the checks above; "Allow on every visit" must be taken
       back first, step 10, or Chrome has nothing to ask). Get the banner as in step 1 and
       open the page.
       - Press Esc on Chrome's question: **no further question**, the page says "Chrome has
         not allowed 3 file(s) yet. Press the button again and pick "Allow on every
         visit"." and the button stays. A dismissed question ends the click's round; the
         next click asks again.
       - Click the button again and pick "Allow this time": the page asks about the next
         file (one question per file, only after an answer that made the last one
         readable). Pick "Don't allow" on that one: no further question, and "The browser
         blocked reading 1 file(s) — remove those videos from the queue and add the files
         again".
       - The page's console has one line per question, `[ytup] regrant <id>: prompt ->
         granted` (or `-> prompt`, `-> denied`); the debug page's log lists them under the
         context `allow`.
    9. **Nothing to ask.**
       - Empty the queue, then Settings → Troubleshooting → **Always allow file access…**:
         the same page, saying "No video is stored yet. Chrome only asks about a real file:
         add a video to the queue in the side panel first, then come back to this page."
         with the button greyed out.
       - Add a clip in the panel and click back into the page's tab: "Readable: 1 of 1
         stored file(s)" and "These files are readable right now, so Chrome has nothing to
         ask and the lasting choice cannot be made now. Come back when the side panel says
         "Files in the queue need read access again" (for example after restarting Chrome),
         and open this page from that banner before pressing Start or Re-grant access." The
         button is greyed out. The page does **not** say "You can close this tab" or name
         "Allow this time" here: no question was asked. The same sentence shows when the
         page is opened after Start or Re-grant access made the files readable.
    10. **Taking it back.** **Record** where Chrome lists the permission (the lock or tune
        icon in the page's address bar, or Chrome's site settings for the extension) and
        that removing it brings the banner back after the next reload of the extension.

90. **The weekly schedule ("Per week").** What is built: a second way to schedule, next to
    "Every N days/hours" (which is unchanged and stays the default). You say how many videos
    a week and between which times of day; the extension picks the days and times, different
    from week to week. The rules: weeks are 7-day blocks counted from the day of "First video
    releases"; each block gets that many different days, one from each of that many
    near-equal stretches of the block (3 a week is never three days in a row), and up to 3 a
    week no two videos in a row are on neighbouring days; a block's days differ from the
    block before; each time is one of Studio's 15-minute steps between the two times and
    differs from the video before.
    **Seen in the owner's Chrome on 2026-10-14 (build `666b202`):** "Per week" shows its
    fields (step 1); 7 queued clips land on different days and on quarter-hour times
    between 17:00 and 21:00 (step 2); the times stay after the panel is reopened (step 3);
    Shuffle changes them (step 5); and a run of 2 clips was started and the first video
    was "Scheduled" in Studio → Content at exactly the time its card showed (step 9).
    **Not reported yet:** the finer rules of step 2 (exactly 3 a week, no neighbouring
    days, a time unlike the card before), the Studio tab reload of step 3, the rest of
    step 9 (the second video, and "First video releases" moving on while the second card
    stays), and steps 4, 6 to 8, 10 and 11.
    The rules are also checked by the automated tests (`tests/schedule-week.test.ts`,
    `tests/queue-week.test.ts`, `tests/panel-week.test.tsx`). Record what you see at each
    step.
    1. **Switch the mode.** Upload tab, switch "Schedule releases" on, open the box, click
       **Per week**. The "Every" fields give way to "Videos a week" (3), "From" (17:00),
       "Until" (21:00) and a **Shuffle** button. "First video releases" and the quick picks
       stay. The summary ends "· 3 a week, 17:00–21:00".
    2. **Queue 7 or more clips** (small test files will do; nothing is uploaded yet). Open
       the cards. Write down each card's release time. Expected: every card on a different
       day; in each 7 days from the first-release day exactly 3 cards; no two cards in a row
       on neighbouring days; every time between 17:00 and 21:00 on a quarter hour (17:00,
       17:15, …, 21:00); no card has the same time of day as the card before it; the days
       of the second week are not the first week's days shifted by 7. The first card is not
       before "First video releases".
    3. **Stable.** Close the side panel and open it again; reload the Studio tab. The cards
       show the same times as in step 2.
    4. **Remove a middle clip** (say the 4th). The first three cards keep their times; the
       cards after it each move up to the time of the card before them. Add a clip: it gets
       the next time after the last card, and no other card changes.
    5. **Shuffle.** Click **Shuffle**: the cards get other days and times, under the same
       rules. Click it again: another set. Reopen the panel: the last set stays.
    6. **The window and the count.** Set "Videos a week" to 1, then 7: one card a week; one
       card every day. Set "From" 20:00 and "Until" 20:15: every card is at 20:00 or 20:15,
       alternating. Drag "From" past "Until" (say 22:00): "Until" follows to 22:15, so there
       is always one step to pick. Put both back to 3, 17:00 and 21:00.
    7. **A time the channel already uses.** In Studio, schedule a video of the channel for
       the same day as the second card, a few hours from its time. Reopen the panel (or wait
       for the scheduled list to be read again, 5 minutes): the summary adds "· 1 already
       scheduled on the channel (next …) — skipped 1 slot(s)", the second card moves to what
       was the third card's time, and the later cards each move up one the same way. A time
       typed on a card stays; the cards around it avoid that day the same way.
    8. **A start that has passed.** Type a "First video releases" of a week ago: the amber
       border and the note "The set time (…) has passed — the queue will start … instead",
       and the first card is at the first generated time at least 15 minutes ahead. **Use
       this time** stores that time and the cards do not move.
    9. **One real upload.** Leave 2 clips in the queue and press Start. The summary's times
       are the two cards' times. After the first clip, in Studio → Content the video is
       "Scheduled" for exactly the date and time its card showed. In the box, "First video
       releases" now shows the second card's time, and the second card has not moved. Stop
       there, or let the second one go and check it the same way.
    10. **The interval mode still works.** Click **Every …**: the "Every" fields are back
        with the values they had, and item 13's last-but-one step (every 1 day, 2 clips one
        day apart) reads as before. Click **Per week** again: the week fields are back with
        their values, and the cards get week times again, counted from the first-release
        time as it is now (after step 9 moved it, they are not the times of step 5).
    11. **Backup.** Settings → Export, then Import that file as **My file**: the mode, the
        count, the two times and the times on the cards are as before the import.
91. **Batches (an addition: the userscript had none).** What is built: after "Batch size"
    videos (Settings → General, default 15, 0 = off) the queue waits until Studio has finished
    uploading them, then goes on.
    **Seen in the owner's Chrome on 2026-10-14 (first build of this, Batch size 2, 4 large
    clips):** while an upload dialog is open, its progress line reads "Uploading 5% ... 8
    minutes left"; after the dialogs closed, nothing in the page showed the uploads still
    going (Studio's upload monitor did not appear in 2 minutes), and that build went on blind
    with "Could not read Studio's upload progress". What is built since then, **not yet run in
    Chrome**:
    - the batch's **last** video keeps its dialog open, Save not pressed, while that line
      still says "Uploading"; this is the one signal that was seen;
    - for the batch's **earlier** videos that were still uploading when their dialogs closed,
      the page is looked at for 6 seconds for anything that says so (Studio's monitor, or a
      leftover progress line); this is a guess. When nothing is found the page says the
      earlier uploads could not be checked, and the run goes on.
    1. Settings → General → **Batch size**: set 2. Queue 5 clips of 200 MB or more, no
       thumbnails, Auto-press Save on. Open the Studio tab's console filtered by `[ytup]`.
    2. Start. On the 2nd clip expect: its dialog stays open after the details are filled in
       (Save is not pressed yet), and the
       footer and the clip's card show "Waiting for Studio to finish uploading batch 1 before
       saving its last video", the footer followed by " · " and Studio's own words
       ("Uploading 40% ... 3 minutes left", changing). When that upload is done the clip is
       saved and the dialog closes. The console has `[ytup] batch wait (dialog): done after …
       s · Studio said "…"`: **record that line** (it holds what Studio says when an upload
       is complete).
    3. Right after, the 1st clip is looked for. **Record which** of these happens, and **record
       every `[ytup] batch census:` line** from the console in full (they list what Studio had
       in the page; with them no console snippet is needed to fix this):
       - the toast "Could not check whether batch 1's earlier videos have finished uploading
         (1 were still uploading when their dialogs closed) — went on" about 6 seconds later.
         Expected, going by what was seen on 2026-10-14;
       - or the footer shows "Waiting for Studio to finish uploading batch 1 (1 of 2 still
         uploading) · …" and the 3rd clip starts when it ends, with `[ytup] batch wait (page):
         done after … s · Studio said "…"` in the console;
       - or neither, and the console has `[ytup] batch 1: every upload had finished before its
         dialog closed, no wait` (the 1st clip was already uploaded when it was saved).
    4. **Record** whether the 1st clip's upload had in fact finished by the time the 3rd clip
       started (Studio's Content page shows it).
    5. The 5th clip is the last of the queue: it is saved without waiting.
    6. During the wait of step 2 press **Stop**: within a few seconds that clip is saved (Stop
       means "after the current video"), "Queue stopped" shows, the rest stays queued.
    7. With short clips (a few MB) and Batch size 3: no wait at all, and the console has
       `every upload had finished before its dialog closed, no wait`.
    8. Auto-press Save **off**, Batch size 2: no dialog is held (you press Save when you
       choose); after the 2nd clip at most the look at the page of step 3 happens.
    9. Batch size 0: the queue never waits (as before).
92. **The warning before Start (an addition).** Settings → General → **Daily upload limit
    (your own number)**, default 15, 0 = off.
    1. Set it to 1. Queue 2 clips and press Start. Expect the start summary, also when
       "Confirm channel name before starting the queue" is off, with a yellow box "May go
       over the daily upload limit (an estimate)" and three lines: the sum ("This browser
       uploaded 0 to this channel in the last 24 hours + 2 in this queue = 2 · your limit is
       1"; the first number is higher when this browser uploaded there in the last 24
       hours), "YouTube publishes no number and counts uploads from every device — the extension
       only knows its own", and "You can still start: …".
    2. Confirm: the run starts and uploads both (the warning blocks nothing).
    3. Queue 1 more clip and press Start: the sum now reads "uploaded 2 … + 1 in this queue =
       3". Set the number to 0 and press Start again: no box.
93. **The pause at YouTube's daily limit (an addition: the userscript ended the queue).** What
    is built: when a video's upload dialog shows an error whose text holds "limit", "daily" or
    "ขีดจำกัด" (the userscript's test), the run ends as it did. When that text also speaks of
    a day ("daily", "24", "รายวัน", "ต่อวัน"; the Thai words are a guess), that video goes back
    to Queued and the queue is paused for 24 hours; a Studio tab on that channel resumes it by itself. **The
    detection can only be tested at YouTube's real limit**, and Studio's real wording has
    never been captured: if you ever meet it, **record** the console line `[ytup] upload limit:
    Studio said "…"` and whether the refused video was left as a draft in Content.
    The paused state and the resume can be seen without the limit, by writing the pause by
    hand (nothing in the extension's own UI does this):
    1. Queue 2 clips, do not start. Right-click inside the side panel → Inspect → Console, and
       run, with the test channel's id (the `UC…` in the Studio address):
       `chrome.storage.local.set({ queuePause: { channel: 'UC…', name: 'Test', at: Date.now(), until: Date.now() + 180000 } })`
    2. Within a second the footer shows "Paused: daily upload limit on Test — resumes <a time
       3 minutes from now> if a Studio tab on that channel is open", the Start button reads
       "Resume now: 2 video(s)" and the stop button is "Cancel the pause". The Copyright tab's
       buttons are not held back (the pause holds no lock).
    3. Reload the Studio tab, close and reopen the side panel: the same line is back.
    4. Wait for the time. Expect, with nobody touching anything: the page toast "24 hours
       since the daily upload limit — the queue goes on", the paused line gone, and both clips
       uploaded. **Record** how long after the time it started, once with the Studio tab in
       front and once with it in a background tab (Chrome slows a hidden tab's timers: up to
       about a minute is expected).
    5. Again from step 1, then **Cancel the pause**: the toast "Pause cancelled — the queue
       will not resume by itself", the line gone, the clips still Queued; after the time
       nothing starts.
    6. Again from step 1, then **Resume now**: the usual start (summary if one is due), the
       clips upload, the line is gone.
    7. Again from step 1 with a `channel` that is another channel's id: after the time
       nothing starts in this tab; the line stays.
    8. Again from step 1, then quit Chrome, wait past the time, open Chrome and the Studio
       tab. **Record** what happens: expected is the page toast "The queued files need read
       access again — click "Re-grant access" in the side panel, then start again" (unless
       "Allow on every visit" was given, item 89), the pause kept, and the upload starting
       within a minute of **Re-grant access**.

94. **Retry on the draft (an addition: the userscript said "delete the draft, then retry").**
    What is built: a video that fails after its file became a draft in Studio is not uploaded
    again. The run closes the dialog, waits 5 seconds, opens that draft's own upload dialog
    again and redoes what is left (details, thumbnail, release time, Save), up to 2 times
    before it moves on to the next video. A card's **Retry** on such a video does the same on
    request. **Seen in the owner's Chrome on 2026-10-14 (build `256e3c8`):** after he closed
    Studio's dialog on an uploading video, the card said "Retrying on the draft (1 of 2)…"
    (the start of step 2). **Not reported yet:** whether the draft's dialog opened again
    and the video ended Done, and every other step. **Still a guess**: how Studio opens a draft's dialog (its
    "Edit draft" button in the Content list, or its address
    `/channel/<id>/videos/upload?d=ud&udvid=<video id>` told to Studio without a page load) is
    a guess. Keep Studio's console open with the filter `[ytup] draft retry` for every step
    below and **record** its lines: each step of a retry logs one.
    1. Schedule on, "Auto-press Save" on. Queue 2 clips of a few hundred MB, the first with a
       thumbnail, so that there is time. Start. When the first card says "Waiting to set
       thumbnail" or "Scheduling for …", close Studio's upload dialog yourself with its X.
    2. Expect, within about half a minute: the card says "Retrying on the draft (1 of 2)…",
       then Studio's upload dialog opens again on the same video, the card says "Filling in
       details on the draft…", and the video ends Done with the release time its card had.
       Then clip 2 uploads as usual. **Record** which console line says "its dialog is open"
       ("by row" or "by address"), or what the lines say if no dialog opened.
    3. In Studio's Content list there is **one** video for clip 1, scheduled, with the title,
       description and thumbnail of its card: no second upload, no leftover draft. The
       upload history (the CSV) has one line for it. **Record** whether its tags are there
       once or twice (the details are typed into a draft that already has them; the title
       and description are replaced, the tags are typed again).
    4. If no dialog opened in step 2: the card ends as an error "Could not open the draft in
       Studio (after 2 retries on the draft) · The file is already a draft in Studio (…).
       Retry goes on with that draft, without uploading again", with **Retry** and **Open
       draft**; clip 2 still uploads; the Studio tab was not reloaded and its address is
       what it was. **Record** this as the result: the guess was wrong, nothing is lost.
    5. If the card showed an error with no draft id in step 2 (no "…is already a draft…"),
       the dialog had not shown the video's link yet when it was closed: **record** it and
       repeat, closing the dialog later.
    6. The manual way. Do step 1 again with 1 clip, and close Studio's dialog each time it
       opens: three times in all (the first try and both retries). The card ends as an error
       "… (after 2 retries on the draft) · The file is already a draft in Studio (…). Retry
       goes on with that draft, without uploading again". Press **Retry**: the question "This
       video is already in Studio" has **Resume draft** selected and **Upload again** beside
       it. Choose **Resume draft**, then Start: the card says "Opening the draft in
       Studio…", the draft's dialog opens, and the video ends Done, with one video in
       Content. If its release time has passed meanwhile, the card says "Release time must
       be at least 15 minutes in the future" instead: type a new time on the card and Retry.
    7. **Upload again**: on another failed card with a draft, choose **Upload again** and
       Start: the file is uploaded once more, as Retry always did (delete the draft in
       Content first, or there are two videos).
    8. In the background. Repeat step 1 and switch to another browser tab right after closing
       the dialog, for two minutes. **Record** what the card and the console say: every line
       ends with "tab hidden" or "tab visible". This is the lead on the failure that started
       this item: on 2026-10-14 a 3.5-hour video failed with "Could not open the calendar",
       its dialog then would not close, and the two later videos failed on it. Studio draws
       its pop-ups a frame later and a hidden tab gets no frames, which would explain both;
       it is not proven.
    9. A dialog that will not close cannot be made on purpose. If it happens, expect: one
       error on that video ending "Studio's upload dialog could not be closed — the queue
       stopped at this video. Close that dialog yourself, then start again" (with "(the
       Studio tab was in the background)" when it was), the page toast "⛔ Queue stopped: …",
       and **every later video still Queued**, none with an error and none with a draft id.
       **Record** the console lines `[ytup] draft retry: closing…` and `… still open after 3
       tries at its X`. Close the dialog, press Start: the first video is retried on its
       draft through **Retry**, the rest upload.
    10. If "Could not open the calendar" shows again, **record** the console line `[ytup]
       calendar: not open after 3 clicks · tab … · date field … · N calendar input(s) …`.
    11. **Resume drafts (N)**, all at once (not seen in Chrome). Make two or three failed
       cards with a draft id as in step 6 (close Studio's dialog at each of the three tries,
       for each clip), and leave one more failed card without a draft (for example a clip
       whose file you renamed on disk before Start). Above the Start button a line reads "N
       failed video(s) are drafts in Studio" with the button **Resume drafts (N)**; N counts
       only the cards with a draft id. It is there while Start itself shows "Start upload"
       greyed out (no video is waiting).
    12. Press **Resume drafts (N)**. Expect: the N cards go to Queued; the page toast "Left
       as errors: 1 with no draft (use Retry on the card to upload the file)"; then what
       Start always does: the start summary if one is due (one question, for all of them),
       and the run. Each draft is opened and finished in queue order ("Opening the draft in
       Studio…", "Filling in details on the draft…", Done). The card without a draft is
       still an error. In Content: one video per clip, no second upload.
    13. **Cancel** in that summary: nothing runs and nothing is uploaded; the N cards stay
       Queued with their draft ids, and Start resumes them later the same way.
    14. The daily-limit warning in that summary (item 92) does not count the drafts: with 2
       drafts and 1 new clip waiting it reads "+ 1 in this queue".
    15. While a run goes, on a channel that is not the locked one, and while another Studio
       tab runs the queue or copyright work, **Resume drafts** is greyed out as Start is.
       With the Tampermonkey script on in the tab it can be pressed, and the page then says
       why nothing starts (the same toast as for Start); the cards stay errors.
    16. **Cards left by the builds before this fix** (the owner's queue of 2026-10-14 has
       them; not seen in Chrome). They are a failed card ending "… The file is already
       uploaded as a draft (ID). Delete it in Content before retrying to avoid duplicates",
       followed by cards "An upload dialog is still open. Close it, then start again · The
       file is already uploaded as a draft (the same ID)…". Reload the Studio tab with this
       build. Expect, with nothing pressed: the first card (the one whose file really is
       that draft) keeps its draft id and now ends "… The file is already a draft in Studio
       (ID). Retry goes on with that draft, without uploading again"; its **Retry** asks
       with **Resume draft** selected; it is counted in **Resume drafts (N)** (one per
       group: 2 for the two groups of that queue). Each "An upload dialog is still open"
       card of the group is still an error, has no draft id and no **Open draft** button,
       and ends "· This file was not uploaded. Retry uploads it"; its Retry puts it back in
       line without a question. Cards that had no draft id are untouched. The console has
       one line `[ytup] draft retry: repaired N card(s) that never handed a file to Studio
       (draft id dropped), M message(s) reworded`; a second reload logs nothing. If another
       Studio tab is running the queue when this one loads, nothing is repaired until a
       load without one.

### Known behaviour, Phase 4a (note, don't test)

- **A schedule list that arrives late can move the slots after you confirmed.** Before a start
  the channel's scheduled videos are read again, and each of the two waits (the summary, then
  the run) gives up after 10 s and goes on with the slots known so far. If Studio answers
  between the summary and the first upload, the run avoids the slots it then knows, which can
  differ from the times the summary showed. The userscript's refresh during a run did the
  same. A list that could not be read at all is a console warning only (`[YT Presets] scheduled
  list`): the run starts without the channel's taken slots.
- **A scan is stored even when claim details could not be read.** A video whose claims Studio
  did not return (an error, no answer within 30 s, or an answer in an unexpected shape) is
  left out, and the scan replaces the one before it, as in the userscript. When every detail
  call fails, that is a stored scan with 0 claims. The activity log's last line then says
  "Couldn't read the claim details of N of M videos — this scan is incomplete" and the status
  card says "Needs attention"; scan again.
- **A copyright write that failed** (the background refused it or did not answer within 30 s)
  toasts "Couldn't save (…)" in the panel and on the Studio page and adds the same line to the
  activity log; the debug log has it too. The tab goes back to what is stored. A write that
  only timed out may still land.
- **After a reload of the Studio tab** the Copyright tab keeps showing what the old page last
  said (a scan cut short still reads "Scanning…") until the new page answers, a few seconds
  later; an open claim list, song list or tracklist editor stays open, and closes only when the
  new page is on another channel. Clicking around inside Studio changes nothing here. When the
  tab came back without the extension's script (the "reload this tab" banner says so), the
  Copyright tab shows no status and Scan is off; the lists, Copyright settings and Fix tracklist
  still open from what is stored, and an open view stays open. The activity log keeps its lines.

### Known behaviour, Phase 4b (note, don't test)

- **One lock for every Studio tab.** Only one tab changes Studio's pages at a time, whatever
  the channel: an upload run, or a trim / ads / Collab run. A run in review mode keeps the lock
  while it waits for you, so other tabs can't upload meanwhile. A run that is only waiting for
  the upload queue gives the lock back while it waits. Scans take no lock.
- **A hidden tab is slow.** Chrome wakes a tab that has been hidden for more than five minutes
  about once a minute, so a run or an Auto-pilot scan in a tab you never look at takes much
  longer, as it did in the userscript. Keep the working tab in its own window if time matters.
- **Copyright settings: Save writes all ten settings as the view shows them.** A setting changed
  in another window while the view was open is overwritten by Save (the userscript's settings
  window did the same). Close and reopen the view to see the latest values first.
- **The "Auto-pilot is due" notification** appears only if the computer is awake and Chrome is
  running at the cycle's time. An alarm that goes off more than a minute late (the computer
  slept, or Chrome was closed) still wakes a Studio tab if there is one, but shows no
  notification; the cycle then starts when a Studio tab on that channel is open. The wake-up
  also goes to an open Studio tab that has been hidden so long that it looks idle.
  (Both rules were decided by the owner on 2026-10-11: the wake-up to a hidden tab, and no
  notification for a late alarm.)
  - It says "No YouTube Studio tab for … is open" in two cases where a tab is open but can't
    work: a tab Chrome discarded (Memory Saver), and a tab that is in the middle of loading or
    was opened before the extension was loaded. Clicking opens a second tab; that is harmless.
  - Its language can be English for a Thai user when it is the first thing the extension does
    after Chrome was idle (the language setting may not have been read yet).
  - Each notified cycle is remembered in `apNotified` (`chrome.storage.local`, not part of a
    settings backup), so a restart doesn't repeat it. Two channels coming due in the very same
    instant can lose one of the two entries; nothing else uses that list.
  - Every time the background wakes it reads all stored data once to find the channels with
    Auto-pilot on. With a very large scan or song history that takes a moment; nothing waits
    for it.
- **A tab without the extension's script** (the "reload this tab" banner shows): the status card
  is gone and Scan is off. If the panel was already open on that tab, Claim list, Claimed songs,
  Copyright settings and Fix tracklist still open from what is stored, and a view that was open
  stays open. A panel opened on such a tab for the first time has every Copyright button except
  Upload history greyed out and no Auto-pilot switch until the tab is reloaded.
- **Large Collab lists.** The Collab view shows every video of the channel, and each keystroke in
  the handles box and each tick redraws all of them: about 70 ms per keystroke at 3,000 videos
  (measured in tests; Chrome is faster). Fine up to a few hundred videos; typing may feel heavy
  on a very large channel.
- **Ads: "already on" is read from the first video of YouTube's answer**, as in the userscript.
  A wrong "on" only records "Already on" and clicks nothing.
- **Auto-pilot, rare cases.** If the cycle's own time can't be saved (the background is not
  answering), the tab starts the cycle again after each scan until it can. If Studio turns out
  to be on another channel when the cycle begins, that cycle is skipped until its next time,
  with a console warning only.
- **Auto-pilot after an incomplete scan carries on**, as in the userscript (decided by the owner
  on 2026-10-11). When a scan could not read some claimed videos, the activity log shows the red
  "scan is incomplete" line; the cycle still replaces the stored scan, trims what it did read,
  and with "Also turn on ads" goes on to the ads run. It does not stop and wait.
- **Auto-pilot is never on for a tab that doesn't know its channel.** The switch is greyed out
  until the page says which channel it is on.
- **Back button during a step.** A page that Chrome kept for the Back button never carries on
  with a copyright step: when it is shown again it reloads and the run goes on from what is
  stored. A page that comes back with nothing in flight just keeps working. During the Collab invite itself only the reload protects (the invite's own waits are
  the upload code's); whether Studio's video pages are ever kept this way is item 64's record.
- **Userscript parity worth knowing.** A step checks which page it is on once, when it starts.
  If you click over to another video's page while a step is waiting, the ads step (and a trim
  step on a video with a single claim) acts on the page that is there. Don't click around in the
  working tab during a run.

### Known behaviour, Phase 5 (note, don't test)

Not in 5.0.0 yet (also in `CHANGELOG.md`):

- **"Copy a pattern from a video"** (userscript v4.28.0). Planned as extension 5.1.0. A preset
  export from v4.28.0 whose main preset is such a pattern imports with the first preset as
  the main one.
- **The schedule summary's tooltip** lists the times of the videos already scheduled on the
  channel, without their titles (the userscript showed "time · title").
- **The weekly schedule** (item 90; the userscript had none). Things to know, none of them
  seen in Chrome yet:
  - The weeks are counted from the "First video releases" time as you last set it (typed, a
    quick pick, or the moment "Per week" was chosen). The run moving that field on after an
    upload, and "Use this time", do not start the count again, so waiting cards keep their
    times. Setting the field yourself does, and so do a new count, new times or Shuffle:
    every waiting card then gets a new time.
  - On the first-release day itself a video is not before that time: its time is drawn from
    the quarter hours still ahead, and when the "Until" time is already past, that day gets
    no video (the first week then has one fewer).
  - "Never two videos on one day" covers the times the extension makes. A time the channel
    already uses, or one typed on a card, counts as taken when it is less than 12 hours
    from a generated time, and that video moves to the next generated time; a video of the
    channel 12 hours or more away on the same calendar day is not in the way.
  - Removing a card moves every card after it up one time, as in the interval mode.
  - On a day the clocks change, a time that does not exist that day (02:30 when the clocks
    go forward) is released an hour later by the clock.
  - 4 or more a week cannot avoid neighbouring days.
  - Choosing "Per week" again after "Every …" counts the weeks from the first-release time
    as it is then, so waiting cards can get other times than they had.
  - The Studio tab makes the times. A Studio tab still running a build from before this mode
    (possible only with a test build, between rebuilding and reloading it) would go on
    making interval times while the box says "a week"; reload that tab.
- **The copyright activity log** keeps only the lines logged while a side panel is open on
  that tab. After a night of Auto-pilot with the panel closed it is empty, the red "scan is
  incomplete" line included. The userscript kept its lines until the page next loaded.
- **Keyboard focus after a question** goes to the page, not back to the button that asked,
  for every question. Returning it would let a held Enter answer the same question again and
  again (measured in a test page: a held Enter answered yes 20 times in a row), so it waits
  for a guard against the key repeat.

The daily upload limit and batches (additions the userscript did not have; items 91 to 93):

- **A paused queue resumes only in a Studio tab on the channel that met the limit.** The tab
  looks at the clock itself (the background cannot drive a page), so nothing resumes while no
  such tab is open, and no notification says the time has come (decided so: unlike
  Auto-pilot, a passed resume time is not announced): the pause and its time are kept, and
  the first Studio tab on that channel after the time goes on, also days later.
- **After a browser restart the resume needs the files' read access** like any start: the
  page says "The queued files need read access again…", and the queue goes on within a
  minute of **Re-grant access** (or by itself with "Allow on every visit", item 89). Clips
  that were picked in Studio's own dialog are lost with a reload, as before, and fail one by
  one with "This file came from Studio's own upload dialog…".
- **A resumed run asks nothing again.** It is the run you started; a release time you typed
  on a card that has passed meanwhile fails that one video with "Release time must be at least
  15 minutes in the future".
- **The video that met the limit** goes back to Queued. If Studio's dialog already showed a
  video link for it, it stays an error with "The file is already a draft in Studio (…). Retry goes on
  with that draft, without uploading again" and is not uploaded again by the resume.
- **Stop pressed before the limit shows** ends the run as before: no pause.
- **Only a limit that speaks of a day pauses.** Any dialog error that holds "limit" still
  ends the run (the userscript's test), but the pause needs "daily", "24", "รายวัน" or "ต่อวัน"
  in it; a size or length limit stays an error on its video. If Studio's Thai message uses
  other words the queue ends as it did before, with no pause. **Resume now** or **Cancel the
  pause** undo a wrong pause.
- **Pressing Start in a tab on another channel while paused** uploads the queue there and
  ends the pause.
- **The warning before Start counts only this browser's upload history** for the channel
  (the last 24 hours), not uploads from a phone, another computer or Studio's own dialog.
- **Batch size and the daily number travel in a backup**, also one imported as "Someone
  else's": they are general settings, not personal ones.
- **Batches are counted per run.** A run resumed after the daily limit, and a run started
  again by hand, start a new batch. A video that failed is not counted.
- **How a batch's end is known** (item 91). Sure: the batch's last video is not saved while
  its own dialog still says "Uploading" (seen in Chrome, 2026-10-14). Not sure: the batch's
  earlier videos. Nothing was found in the page that shows an upload going on after its
  dialog closed, so when the look at the page finds nothing the run says "Could not check
  whether batch N's earlier videos have finished uploading" and goes on. Uploads run side by
  side and the last video started last, so the earlier ones have usually finished by then;
  a much larger earlier file may not have.
- **The last video of a batch is held only with "Auto-press Save" on.** With it off you press
  Save yourself and nothing holds the dialog.
- **A release time can pass while a batch's last video is held**: Studio may then refuse
  the time, and that video fails. Leave more than the upload time between now and the first slot.
- **A wait ends early** when the progress line has not changed for 10 minutes, and after 6
  hours at most; each says so on the page. A Studio in a language other than English or Thai
  never reads as "uploading": no dialog is held, and the look at the page ends in seconds.
- **The footer cannot say how many of a batch are done**, only how many were still uploading
  when their dialogs closed.

Read access to the queued files (the reasons are from Chrome's source code and
documentation; none of it is measured in Chrome yet, items 88 and 89 are where it is):

- **Chrome decides, per file, and can take the access back.** A file dropped or picked is
  readable at once. By Chrome's source it stays readable only while a page of the extension
  holds it, so the side panel holds every queued file while it is open, and the Studio tab
  holds every file it has read and, from Start on, every file of the run.
- **After a restart, a reload or an update the files must be asked for again**, unless
  "Allow on every visit" was picked (the last point below; seen for a restart, a reload and an update). Quitting
  Chrome, reloading or updating the extension closes all its pages. The banner shows; Start
  asks for the access itself, so pressing Start is enough, and **Re-grant access** does the
  same without starting. The same when the side panel is closed *and* the Studio tab is
  reloaded before Start (with one of the two still open, the files are expected to stay
  readable).
- **The side panel shows no Chrome prompt** for that: by its source Chrome gives an
  extension's side panel the access without asking (an older Chrome may give nothing
  instead). When it did not work, the panel says "The browser still does not allow reading
  N file(s) — click "Always allow…" on the banner and pick "Allow on every visit" on the
  page that opens; if that does not help, remove those videos from the queue and add the
  files again". The page is the first way out; a fresh drop or pick is the last, and is
  always readable. For a blocked file the sentence names only the last.
- **Closing a tab of the extension can end the access a few seconds later.** A tab such as
  the debug page counts for Chrome as "the site is open"; by its source, when the last one
  closes, Chrome withdraws the access of every file about five seconds later, with the panel
  still open. The panel looks again when it is shown or focused and when Start is pressed,
  and Start asks for the access itself, so the next Start is expected to just work. During
  a run the video being uploaded is not affected (Studio already has it); a later video of
  the run can fail with "No permission to read this file — click "Re-grant access" in the
  side panel": click the button, then **Retry** on the card and Start. So: don't close the
  debug page in the middle of a run. The "Allow file access" page is such a tab too: if
  "Allow this time" was picked there, closing it is expected to end that access a few
  seconds later; after "Allow on every visit" closing it is expected to change nothing.
- **A run with the panel closed, and the Studio tab reloaded:** the video in flight fails with
  "The page reloaded during the upload — …" as before, and the videos still waiting are
  asked for again at the next Start.
- **A run with the panel closed, and the extension's hidden frame in the Studio tab replaced**
  (suspected from the code, not reproduced). The Studio tab reads files through a hidden
  frame; when Studio removes it or it stops answering, the extension mounts a new one, and
  what the old one held is gone. With the side panel closed nothing else holds the files
  then, and the rest of the run may fail with "No permission to read this file". Open the
  panel, press **Retry** on the cards, then Start.
- **A file the Studio tab cannot read while the panel can** (not expected: both ask Chrome
  about the same file). Start goes to the tab, the tab says "The queued files need read
  access again — click "Re-grant access" …" and the banner shows; the click then says "The
  browser still does not allow reading …". Remove and add the clip.
- **"Allow on every visit" is asked for on its own page, once.** Chrome's lasting
  permission can only be asked for from a normal tab, so the banner's **Always allow…**
  (also Settings → Troubleshooting → **Always allow file access…**) opens `allow.html` in
  one. Its button asks Chrome about one stored file, looks at all of them again, and asks
  about the next only after an answer that made the asked file readable and while some are
  still unanswered. Seen in the owner's Chrome 155: a tab of the extension shows the
  question with the three buttons, one question for three stored files; after "Allow on
  every visit" the banner did not come back when the page's tab was closed, nor after
  Chrome was quit and opened again, nor after the extension and the Studio tab were
  reloaded, nor after an update in place to a test build numbered 5.0.1 (item 89,
  2026-10-12 and 2026-10-13).
  - **It needs a stored file that is not readable at that moment.** Chrome has no
    question about a file the extension can already read: one just dropped or picked, or
    one that Start or Re-grant access made readable. So the page is opened from the banner
    *before* Start or Re-grant; opened at any other time it says the files are readable
    right now and to come back when the banner shows. With an empty queue it says to add a
    video first.
  - The page cannot see which button was clicked: "Allow this time" and "Allow on every
    visit" both leave the files readable at that moment. It says "You can close this tab"
    only after a question asked on the page made a file readable. If the banner comes back
    later, open the page again.
  - Chrome may show the question without "Allow on every visit" on a first visit, or stop
    offering it after it was dismissed several times (from its source; not seen). So a
    dismissed or refused question ends the click's round: the page does not go on to ask
    about the remaining files; the next click does.
  - The permission belongs to Chrome, per extension id: Chrome's site settings can take it
    back, and a test build from before 5.0.0 (another id, see "Update") starts without it.
  - A file a Studio tab reported while the panel could read it stays on the banner through
    a visit to the page: nothing could be asked about it there. Its report goes when
    Re-grant access is clicked, or when the panel itself saw the file unreadable and then
    readable again.

The update check:

- **It asks `api.github.com`** for this repo's latest release, about once a day: whenever the
  extension's background starts and on a daily alarm, but never more than once in 23 hours.
  The request carries no cookies and nothing about you or your channels; GitHub sees your IP
  address, as for any page visit. If GitHub can't be reached, or an office has used up its
  hourly allowance, nothing is shown and it tries again a day later, not sooner. The result
  is `updateCheck` in `chrome.storage.local`; it is not part of a settings backup.
- **The banner can't be dismissed.** It goes when the installed version is the newest.
- **A newer build than the newest release** (a test build) shows no banner.
- **The repository must stay public.** The update check and the install link read it without
  signing in. If it is ever made private, both stop working silently.

Both installed (see "While the userscript is still on" for what waits and what doesn't):

- **A wait has no time limit.** A copyright run that waits for the script to be turned off
  can wait for days and then goes on with the claims it picked back then. Before it trims, it
  asks YouTube again: a claim that is gone is recorded as gone, not trimmed twice. Press Stop
  on a waiting run you no longer want.
- **One step can slip through.** A copyright step that took the lock just before the script
  appeared in the page finishes its one video; the next step waits.
- **With the script on and no panel open,** an Auto-pilot cycle that comes due still scans and
  then waits; the Studio page shows the Tampermonkey sentence once per page load.
- **The extension looks for the script's own element in the page** (`#ytp-root`), nothing
  else. A script that crashed before it drew its button is not seen.
- **Studio tabs opened before this build** must be reloaded once: the tab and the panel check
  that they are the same build, and the panel says "This tab is not connected to the extension
  yet — reload this tab" until they are.

The move file:

- **Importing a move file twice** adds nothing twice, and sets the language to the file's again.
- **Upload history keeps the newest 1000 rows** in all, as before. A row needs a date, a
  channel and a file name; a row the script logged before it knew the channel is left out, and
  so is a row dated more than a day in the future. Rows without a video id are kept.
- **A channel needs only its id.** One the script knew without a name arrives without a name.
  A channel the extension already has keeps its own entry, unless that entry has no name and
  the file's has one. A channel picture is kept only when it is an `https:` link.
- **The import reads the whole file at once** and has no size limit of its own.
- **Any import, move file or not,** replaces the presets and the general settings with the
  file's. As **My file** it also replaces EP numbers, the producer name, the schedule and
  your own artist names; as **Someone else's** those stay yours. The locked channel is never
  taken from a file.

The panel's tab, and messages in the Studio page:

- **A request for a tab lasts 10 seconds.** The round Studio button, the "queue finished"
  notification and a multi-file pick in Studio's dialog store which tab the panel should show
  (`panelTab` in `chrome.storage.session`). A panel you open by hand within 10 s of a refused
  open shows that tab. Two Studio tabs asking in the same moment can overwrite each other
  before a closed panel has opened.
- **The round Studio button with the panel open** switches the panel to the running task's tab
  (the userscript closed its drawer on that click; a page cannot close the side panel). The
  button stays visible while the panel is open.
- **"The progress bar stopped"** is said once per page load, for the progress display and the
  round button together; every failure is still in the debug log (`[ytup] progress`,
  `[ytup] fab`).
- **The second-tab message names both jobs** ("the upload queue or copyright work"): the page
  only knows that another tab holds the one lock.
- **Text in the Studio page** (the round button, the page toast, the reload banner) uses the
  computer's fonts, unless IBM Plex Sans Thai is installed there: the font is bundled for
  the panel only.
- **"Leave site?"** is asked only during a run, or while files picked in Studio's own dialog
  wait. Files added in the panel survive a reload, so a reload with only those waiting asks
  nothing.

Folders:

- **Hidden files are left out** of a picked or dropped folder (names starting with a dot:
  `.DS_Store`, and the `._Clip.mp4` side files some drives make). A real video named with a
  leading dot is left out too when it comes from a folder or is dropped together with one. Hidden *folders* are still read.
- **2000 files from folders, per pick or drop in total.** Over that, nothing is added and a
  message says so. Files dropped loose, beside a folder or without one, are not counted. The
  limit is on the files taken, not on the search: a tree of thousands of hidden files or empty
  folders is still read to the end, and there is no cancel. 2000 is a judgment, not a
  measurement.
- **A folder that can't be read** is passed over; one message says some folders were not read.
- **A folder dropped on a card** beside a `.txt` or an image is not opened, as in the
  userscript.

Questions:

- **The trim question and the Auto-pilot question open on Cancel.** Enter and Space answer as
  Cancel. A press on "Start trim" / "Turn on" in the first 0.8 s, and the second click of a
  double-click at any time, are ignored without a message; Cancel keeps its outline. Tab then
  Enter answers yes at once. A click made after the 0.8 s by someone still clicking the same
  spot, with the mouse moving between clicks, is taken as an answer.
- **The other questions still open on their main button,** as in the userscript: Enter answers
  yes for "Reset all presets", "Delete preset", the import ("My file"), "Upload N video(s)"
  and the retry of a video that already has a draft (Enter answers "Resume draft").

Retry on the draft (item 94; none of it seen in Chrome yet):

- **A video that failed as a draft is tried again on that draft, twice, by itself,** 5 seconds
  after each failure, before the run goes on. The file is not uploaded again. Not retried: a
  video with no draft id, after Stop, at the upload limit, and a video in "Waiting for you to
  Save" that nobody saved for an hour.
- **Only a dialog that shows this very video's link is filled in.** A dialog that shows
  another video, or no link within 15 seconds, is closed and the video stays the error it was,
  with its draft id, **Retry** and **Open draft**. The draft is never deleted and never
  discarded by the extension.
- **The Studio tab is not reloaded** to open a draft. The address bar may show the draft's
  address for a moment; it is put back when no dialog opened. The Back button then has one
  entry more.
- **A resumed video is part of a batch only when its file was handed to Studio in this run.**
  A draft from an earlier run is not counted in a batch and its Save is not held. A video
  waiting with a draft id is not one of the "N in this queue" of the daily-limit estimate
  before Start (it is no new upload), and it is written to the upload history once, when saved.
- **A video waiting with a draft id does not need its video file readable** to start: the
  file is not read. Its thumbnail still is.
- **Resume drafts (N)** puts every failed video with a draft back in line, then starts the
  queue; videos already waiting are uploaded by that run too, as with Start. Failed videos
  without a draft, and cards whose draft id is on more than one card, stay errors; one page
  toast says how many of each. Cancelling the start summary leaves the drafts Queued.
- **The release time of a resumed video** is worked out as for any waiting video: the time
  typed on its card, or its slot in the schedule ("Every …" or "Per week"). A typed time that
  is less than 15 minutes ahead by then fails the video as before; change it on the card.
- **A failed video's dialog that cannot be closed stops the run** with one error on that
  video; the videos after it stay Queued. Before, each of them failed with "An upload dialog
  is still open" and was shown the first video's draft id.
- **Cards that carry such a wrong draft id** (from a run before this build) are repaired when
  the Studio tab loads the queue: a failed card whose stored message is "An upload dialog is
  still open. Close it, then start again" followed by the old "already uploaded as a draft
  (…). Delete it in Content…" never handed its file to Studio, so it loses the draft id and
  says "This file was not uploaded. Retry uploads it". The card left with the id owns the
  draft and can be resumed; its message no longer says to delete it. Only messages stored in
  exactly that form are touched (English or Thai). If a draft id is still on more than one
  card afterwards, none of them is resumed: "Draft … is named on more than one card"; use
  **Open draft** to see which video it is, and Retry → **Upload again** on the others.
- **A video that never handed its file to Studio has no draft id,** whatever dialog is open.
- **"Could not open the calendar"**: the three clicks now go to the date field that is in the
  dialog at that moment, and the message ends with "(the Studio tab was in the background)"
  when it was. Why the calendar did not open on 2026-10-14 is not known.
- **The page-reload error** ("The page reloaded during the upload — check Content for a
  leftover draft, then retry (…)") keeps its wording; its Retry asks the same question.
- **Closing a dialog whose upload is still running**: the extension presses the dialog's X,
  as it always did, and should Studio then ask, only an answer that reads "Save as draft" is
  pressed. What Studio really asks there has not been seen.

The package:

- **No artwork yet.** The toolbar button and the card show Chrome's own tile with a letter, and
  the two desktop notifications ("Upload finished ✅", "Auto-pilot is due") show a small red dot.
- **One ID on every computer:** `cllefnlbgkbdnmifojjflfcpholhniio`, from the manifest key (its
  private half is the owner's and is not in the repo). The debug page is
  `chrome-extension://cllefnlbgkbdnmifojjflfcpholhniio/debug.html` everywhere.

### Known, dev only (note, don't test)

- After a full extension reload during `npm run dev`, WXT re-injects the content script and
  the old instance's "reload this tab" banner can stay over a working page (review M8).
  Production Chrome doesn't re-inject into open tabs.
- Phase 4b's plan had a unit of source pins for the entrypoints' guards (unit E). It was
  dropped: every one of those guards already fails a 4a test when removed.
