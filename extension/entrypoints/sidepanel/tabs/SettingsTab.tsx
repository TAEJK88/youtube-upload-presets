import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { L, type Lang } from '@/lib/i18n';
import { exportBackup, importBackup, readImport } from '@/lib/panel/backup-io';
import { runnerTab } from '@/lib/panel/target';
import { RUNNER_HELD } from '@/lib/runner-lock';
import type { Settings, SettingsPatch } from '@/lib/settings';
import { useAsk } from '../ask';
import { Hint, Kv, NumberField, Section, TextField } from '../fields';
import { Icon } from '../Icon';
import { useLive, usePanel } from '../panel';
import { saveFailed } from '../save-failed';

type Flag = 'autoSave' | 'thumb' | 'notify' | 'intercept' | 'autoAcceptInvite' | 'confirmStart' | 'autoApply' | 'quickActions' | 'autoNext';

const msg = (e: unknown) => (e as Error)?.message ?? e;

// Every settings write is a message to the background and can reject: say so in the panel.
function useSave() {
  const { write } = usePanel();
  return (patch: SettingsPatch) => write.settings(patch).catch((e: unknown) => {
    saveFailed(e);
    throw e;
  });
}

// The drawer's sw(): a switch with a title and a note.
function Sw({ k, title, desc }: { k: Flag; title: string; desc: string }) {
  const { data } = usePanel();
  const save = useSave();
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <Switch aria-label={title} checked={!!data?.settings[k]} onCheckedChange={(v) => void save({ [k]: v }).catch(() => {})} className="mt-0.5" />
      <span className="min-w-0">
        <b className="block text-[13px] font-medium">{title}</b>
        <small className="block text-xs text-fg3">{desc}</small>
      </span>
    </label>
  );
}

// A <select> whose options are [value, label] pairs, as the drawer built them. `after` runs
// once the value is stored.
function Pick<K extends keyof Settings>({ k, title, options, after }: { k: K; title: string; options: [string, string][]; after?(label: string): void }) {
  const { data } = usePanel();
  const save = useSave();
  return (
    <NativeSelect
      aria-label={title}
      value={String(data?.settings[k] ?? '')}
      onChange={(e) => {
        const label = e.target.selectedOptions[0]?.textContent ?? '';
        void save({ [k]: e.target.value } as SettingsPatch).then(() => after?.(label), () => {});
      }}
    >
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </NativeSelect>
  );
}

const kbd = 'rounded-[5px] border border-b-2 border-line2 bg-surface px-1.5 py-px font-[inherit] text-xs';

export function SettingsTab() {
  const { data, view, send } = usePanel();
  const { liveState } = useLive();
  const save = useSave();
  const ask = useAsk();
  const fileIn = useRef<HTMLInputElement>(null);
  if (!data) return null;
  const s = data.settings;
  const set = (patch: SettingsPatch) => void save(patch).catch(() => {});

  const copyDiag = async () => {
    try {
      const info = (await send('diag:dialogInfo', undefined)) as { error?: string } | undefined;
      await navigator.clipboard.writeText(JSON.stringify(info, null, 1));
      toast(info?.error ? info.error : L('คัดลอกข้อมูลตรวจปัญหาแล้ว — วางส่งให้ผู้พัฒนาได้เลย', 'Troubleshooting info copied — paste it to the developer'));
    } catch (e) {
      console.error('[ytup] copy dialog info failed', e);
      toast(L(`คัดลอกข้อมูลหน้าต่างอัปโหลดไม่สำเร็จ (${msg(e)})`, `Couldn't copy the upload dialog info (${msg(e)})`));
    }
  };

  const doExport = async () => {
    try {
      const out = await exportBackup();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out.json], { type: 'application/json' }));
      a.download = out.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      toast(L(`ส่งออกพรีเซ็ต ${out.count} รายการแล้ว`, `Exported ${out.count} presets`));
    } catch (e) {
      console.error('[ytup] export failed', e);
      toast(L(`ส่งออกไม่สำเร็จ (${msg(e)})`, `Couldn't export (${msg(e)})`));
    }
  };

  // Refused only while a run is in progress (in any tab): files waiting in the queue survive,
  // since nothing reloads any more. Asked again after the question, a run may have started.
  const stopFirst = () => toast(L('หยุดคิวก่อนแล้วค่อยนำเข้า', 'Stop the queue before importing'));
  const doImport = async (file: File) => {
    try {
      if (liveState?.running || (await runnerTab())) return stopFirst();
      const step = readImport(await file.text());
      if (step.kind === 'error') return void toast(step.message);
      const n = step.presets.length;
      const own = await ask({
        title: L(`นำเข้าพรีเซ็ต ${n} รายการ`, `Import ${n} presets`),
        icon: 'download',
        body: (
          <div>
            <div><b>{step.presets.map((p) => p.label).join(', ')}</b></div>
            <div className="mt-2">{L('พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้และภาษาไม่เปลี่ยน)', 'Existing presets and settings on this device will be replaced (locked channel and language stay unchanged).')}</div>
            <div className="mt-2.5"><b>{L('เป็นไฟล์สำรองของช่องคุณเองไหม?', 'Is this a backup of your own channel?')}</b></div>
            <div className="text-xs text-fg3">{L('ของฉัน = นำเข้าค่าส่วนตัวด้วย (ชื่อโปรดิวเซอร์, ตั้งเวลาปล่อย, ชื่อศิลปินของตัวเอง, เลข EP)\nของคนอื่น = นำเข้าแค่พรีเซ็ตและการตั้งค่าทั่วไป ค่าส่วนตัวของคุณไม่เปลี่ยน', 'Mine = also import personal values (producer name, schedule, your own artist names, EP numbers)\nSomeone else\'s = only presets and general settings; your personal values stay unchanged')}</div>
          </div>
        ),
        ok: L('ไฟล์ของฉัน', 'My file'),
        no: L('ไฟล์ของคนอื่น', 'Someone else\'s'),
      });
      if (own == null) return; // dismissed, or replaced by another question
      if (await runnerTab()) return stopFirst();
      await importBackup(step.data, step.presets, own);
      toast(L(`นำเข้าพรีเซ็ต ${n} รายการแล้ว`, `Imported ${n} presets`));
    } catch (e) {
      if (msg(e) === RUNNER_HELD) return stopFirst();
      console.error('[ytup] import failed', e);
      toast(L(`นำเข้าไม่สำเร็จ (${msg(e)})`, `Couldn't import (${msg(e)})`));
    }
  };

  return (
    <div>
      <Section title={L('อัปโหลดแบบคิว', 'Queue upload')} icon="queue">
        <Sw k="autoSave" title={L('กด Save ให้อัตโนมัติ', 'Auto-press Save')} desc={L('ตั้งการเปิดเผยตามพรีเซ็ตแล้วกด Save ต่อไฟล์ถัดไปเลย ถ้าปิดไว้จะรอให้คุณตรวจแล้วกด Save เองทีละคลิป', 'Sets visibility from the preset, presses Save and moves on to the next file. When off, waits for you to review and press Save on each video yourself.')} />
        <Sw k="thumb" title={L('อัปภาพปกให้อัตโนมัติ', 'Auto-upload thumbnail')} desc={L('ใช้ไฟล์ .jpg/.png ชื่อเดียวกับคลิป (ไม่เกิน 2MB และช่องต้องยืนยันตัวตนแล้ว)', 'Uses a .jpg/.png with the same name as the video (max 2MB; channel must be verified)')} />
        <Sw k="notify" title={L('แจ้งเตือนเมื่อคิวเสร็จ', 'Notify when the queue finishes')} desc={L('เด้งแจ้งเตือนบนเดสก์ท็อปพร้อมเสียง และโชว์ความคืบหน้าบนชื่อแท็บ เช่น (3/10) — ไปทำอย่างอื่นได้ไม่ต้องเฝ้า', 'Desktop notification with a sound, plus progress in the tab title like (3/10) — no need to keep watching')} />
        <Sw k="intercept" title={L('รับหลายไฟล์จากหน้าต่างของ YouTube', 'Take multiple files from YouTube\'s dialog')} desc={L('เลือกหรือลากหลายไฟล์ในหน้าต่างอัปโหลดปกติของ Studio จะส่งมาเข้าคิวนี้แทน', 'Selecting or dropping multiple files in Studio\'s normal upload dialog sends them to this queue instead')} />
      </Section>

      <Section title={L('ความปลอดภัย', 'Safety')} icon="lock">
        <Sw k="autoAcceptInvite" title={L('กดยอมรับคำเชิญสิทธิ์ช่องให้อัตโนมัติ', 'Auto-accept channel permission invites')} desc={L('เปิดลิงก์ ACCEPT INVITATION จากอีเมลของ YouTube แล้วสคริปต์กด Accept ให้', 'Open the ACCEPT INVITATION link from the YouTube email and the script presses Accept for you')} />
        <Sw k="confirmStart" title={L('ถามยืนยันชื่อช่องก่อนเริ่มคิว', 'Confirm channel name before starting the queue')} desc={L('แสดงชื่อช่องปัจจุบันให้ยืนยันทุกครั้งที่กดเริ่ม', 'Shows the current channel name for confirmation every time you press Start')} />
        <Hint icon="lock" className="mt-1.5">{L('กดปุ่ม "ล็อกช่อง" ด้านบนเพื่อให้อัปได้เฉพาะช่องนั้น ถ้าสลับช่อง คิวจะหยุดเอง', 'Press the "Lock channel" button above to upload only to that channel. If you switch channels, the queue stops automatically.')}</Hint>
      </Section>

      <Section title={L('อัปโหลดทีละไฟล์ (หน้าต่างปกติของ YouTube)', 'Single-file upload (YouTube\'s normal dialog)')} icon="upload">
        <Sw k="autoApply" title={L('เติมข้อมูลอัตโนมัติ', 'Auto-fill details')} desc={L('ใส่ชื่อ/คำอธิบาย/แท็กจากพรีเซ็ตหลักให้ทันทีเมื่อเลือกไฟล์', 'Fills title/description/tags from the default preset as soon as a file is selected')} />
        <Sw k="quickActions" title={L('ปุ่มลัดใต้ช่องชื่อและคำอธิบาย', 'Quick actions under title and description')} desc={L('ปุ่มใส่ชื่อ/คำอธิบาย/แท็กจากพรีเซ็ต, ใส่ .txt, ตรวจ Chapters และคัดลอก — ทั้งในหน้าต่างอัปโหลดและหน้าแก้ไขคลิป', 'Buttons to apply preset title/description/tags, load a .txt, check chapters and copy — in the upload dialog and on the video edit page')} />
        <Sw k="autoNext" title={L('กด Next ไปหน้าการเปิดเผย', 'Press Next to the Visibility page')} desc={L('เลือกการเปิดเผยตามพรีเซ็ตให้ แต่ไม่กด Save', 'Selects visibility from the preset but doesn\'t press Save')} />
      </Section>

      <Section title={L('ตรวจปัญหา', 'Troubleshooting')} icon="alert">
        <Hint>{L('เปิดหน้าต่างอัปโหลดค้างไว้ที่หน้ากรอกรายละเอียด (มีส่วน Thumbnail) แล้วกดปุ่มนี้ ข้อมูลโครงสร้างหน้าจะถูกคัดลอก ส่งไปให้ผู้พัฒนาแก้สคริปต์ได้ (อ่านอย่างเดียว ไม่กดอะไรในหน้า)', 'Keep the upload dialog open on the details page (with the Thumbnail section) and press this button. The page structure info is copied so you can send it to the developer to fix the script (read-only, nothing on the page is clicked).')}</Hint>
        <Button size="sm" className="mt-2.5" onClick={() => void copyDiag()}>
          <Icon name="copy" size={13} />{L('คัดลอกข้อมูลหน้าต่างอัปโหลด', 'Copy upload dialog info')}
        </Button>
      </Section>

      <Section title={L('ทั่วไป', 'General')} icon="sliders">
        <Kv title="Language / ภาษา">
          <NativeSelect aria-label="Language / ภาษา" value={s.lang ?? 'en'} onChange={(e) => set({ lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="th">ไทย</option>
          </NativeSelect>
        </Kv>
        <Kv title={L('ชื่อโปรดิวเซอร์ {producer}', 'Producer name {producer}')} note={L('ใช้ในชื่อคลิป/คำอธิบาย/แท็ก เช่น "Prod. by {producer}" · เว้นว่าง = ใช้ชื่อช่องปัจจุบัน', 'Used in video title/description/tags, e.g. "Prod. by {producer}" · blank = current channel name')}>
          <TextField className="w-40" value={s.producer} placeholder={view?.channel.name || L('ชื่อช่อง', 'Channel name')} onValue={(v) => set({ producer: v.trim() })} />
        </Kv>
        <Kv title={L('หมวดหมู่', 'Category')} note={L('ข้อความตามที่ Studio แสดง เช่น Music หรือ เพลง · เว้นว่าง = ไม่ตั้ง', 'Text as Studio shows it, e.g. Music or เพลง · blank = don\'t set')}>
          <TextField className="w-40" value={s.category} onValue={(v) => set({ category: v.trim() })} />
        </Kv>
        <Kv title="Paid promotion" note={L('คลิปมีการโปรโมตแบบชำระเงินไหม', 'Does the video include paid promotion?')}>
          <Pick k="paidPromotion" title="Paid promotion" options={[['no', L('ไม่มี', 'No')], ['yes', L('มี', 'Yes')], ['skip', L('ไม่ตอบ', 'Don\'t answer')]]} />
        </Kv>
        <Kv title={L('ขั้น Monetisation', 'Monetisation step')} note={L('เปิด/ปิดโฆษณาให้คลิปใหม่', 'Turn ads on/off for new videos')}>
          <Pick k="monetization" title={L('ขั้น Monetisation', 'Monetisation step')} options={[['on', L('เปิดโฆษณา (On)', 'Ads on (On)')], ['off', L('ปิดโฆษณา (Off)', 'Ads off (Off)')], ['skip', L('ทำเอง', 'Manual')]]} />
        </Kv>
        <Kv title={L('ขั้น Ad suitability', 'Ad suitability step')} note={L('ติ๊ก "None of the above" = ยืนยันว่าคลิปไม่มีเนื้อหาในหมวดเหล่านั้น แล้วกด Submit rating (ส่งแล้วแก้ไม่ได้)', 'Tick "None of the above" = confirm the video has none of that content, then press Submit rating (can\'t be changed after submitting)')}>
          <Pick k="adSuitability" title={L('ขั้น Ad suitability', 'Ad suitability step')} options={[['none', 'None of the above'], ['skip', L('ทำเอง', 'Manual')]]} />
        </Kv>
        <Kv title={L('AI use (เนื้อหาดัดแปลง/สังเคราะห์)', 'AI use (altered/synthetic content)')} note={L('คำถาม "Was AI used to generate or edit your content…"', 'The "Was AI used to generate or edit your content…" question')}>
          <Pick k="alteredContent" title={L('AI use (เนื้อหาดัดแปลง/สังเคราะห์)', 'AI use (altered/synthetic content)')} options={[['skip', L('ไม่ตอบ', 'Don\'t answer')], ['no', L('ไม่ใช่', 'No')], ['yes', L('ใช่', 'Yes')]]} />
        </Kv>
        <Kv title={L('ปีที่ใช้ใน {year}', 'Year used in {year}')} note={L('เว้นว่าง = ปีปัจจุบันอัตโนมัติ', 'Blank = current year automatically')}>
          <TextField type="number" min={2000} max={2100} className="w-24" placeholder={String(new Date().getFullYear())} value={s.year} onValue={(v) => set({ year: v.trim() })} />
        </Kv>
        <Kv title={L('รอใส่ภาพปกนานสุด', 'Max thumbnail wait')} note={L('นาที · ภาพปกใส่ได้หลังวิดีโออัปขึ้นไปแล้ว ไฟล์ใหญ่ตั้งเผื่อไว้', 'Minutes · thumbnail can be set only after the video has uploaded; allow extra for large files')}>
          <NumberField aria-label={L('รอใส่ภาพปกนานสุด', 'Max thumbnail wait')} min={1} max={600} value={String(s.thumbWaitMin)} onValue={(v) => set({ thumbWaitMin: Math.max(1, Number(v) || 120) })} />
        </Kv>
        <Kv title={L('จังหวะการทำงาน', 'Pace')} note={L('หน้าเว็บโหลดช้า / เน็ตช้า ให้เลือก "ช้า" หรือ "ช้ามาก" สคริปต์จะพักและรอแต่ละขั้นนานขึ้น', 'If the page or connection is slow, choose "Slow" or "Very slow" — the script will pause and wait longer at each step')}>
          <Pick k="pace" title={L('จังหวะการทำงาน', 'Pace')}
            options={[['normal', L('ปกติ (x1)', 'Normal (x1)')], ['slow', L('ช้า (x1.6)', 'Slow (x1.6)')], ['slower', L('ช้ามาก (x2.5)', 'Very slow (x2.5)')]]}
            after={(label) => toast(L(`จังหวะการทำงาน: ${label}`, `Pace: ${label}`))} />
        </Kv>
        <Kv title={L('พักระหว่างไฟล์', 'Pause between files')} note={L('หน่วยวินาที', 'Seconds')}>
          <NumberField aria-label={L('พักระหว่างไฟล์', 'Pause between files')} min={0} max={120} value={String(s.delay)} onValue={(v) => set({ delay: Math.max(0, Number(v) || 0) })} />
        </Kv>
      </Section>

      <Section title={L('สำรอง / แชร์การตั้งค่า', 'Back up / share settings')} icon="copy">
        <Hint icon="file">{L('ส่งออกพรีเซ็ต การตั้งค่า และการตั้งค่าแท็บลิขสิทธิ์เป็นไฟล์ .json ไว้สำรองหรือส่งให้เพื่อนนำเข้า (ไม่รวมช่องที่ล็อกไว้และประวัติอัปโหลด)', 'Export presets, settings and copyright tab settings to a .json file as a backup or to share with a friend (excludes the locked channel and upload history)')}</Hint>
        <div className="mt-2.5 flex gap-2">
          <input ref={fileIn} type="file" accept=".json,application/json" hidden data-testid="backup-file" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void doImport(f);
          }} />
          <Button size="sm" onClick={() => void doExport()}><Icon name="download" size={13} />{L('ส่งออก (.json)', 'Export (.json)')}</Button>
          <Button size="sm" onClick={() => fileIn.current?.click()}><Icon name="upload" size={13} />{L('นำเข้า', 'Import')}</Button>
        </div>
      </Section>

      <Section>
        <Hint icon="sliders">
          <kbd className={kbd}>Alt</kbd> + <kbd className={kbd}>P</kbd>{L(' เปิดแผง · ', ' open the panel · ')}<kbd className={kbd}>Alt</kbd> + <kbd className={kbd}>1…9</kbd>{L(' เลือกพรีเซ็ตหลัก', ' select default preset')}
        </Hint>
        <Hint className="mt-2">{L('ระหว่างที่คิวทำงาน อย่าปิดหรือรีเฟรชแท็บนี้ · YouTube จำกัดจำนวนอัปโหลดต่อวัน ถ้าชนลิมิตคิวจะหยุดเอง', 'While the queue is running, don\'t close or refresh this tab · YouTube limits uploads per day; if you hit the limit the queue stops automatically')}</Hint>
      </Section>
    </div>
  );
}
