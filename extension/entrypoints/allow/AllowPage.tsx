import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { errorText } from '@/lib/debug-log';
import { allowAll, tally, type FileState } from '@/lib/file-allow';
import { handles, type Handles } from '@/lib/file-handles';
import { listIds } from '@/lib/file-store';
import { L } from '@/lib/i18n';
import { ThemeToggle } from '../sidepanel/ThemeToggle';

// allow.html, opened in a normal tab from the side panel: the one place where Chrome shows
// its own question about a stored file, with the answer "Allow on every visit". The side
// panel cannot show that question (lib/file-handles.ts). The page shows what Chrome says
// about each stored file after the click; it cannot see which answer was picked, and it
// never closes itself. Chrome's button names are quoted in English: they are Chrome's.
export interface AllowDeps { files?: Handles; stored?: () => Promise<string[]> }

export function AllowPage({ files = handles, stored = listIds }: AllowDeps) {
  const [states, setStates] = useState<FileState[] | null>(null);
  const [failed, setFailed] = useState('');
  const [asked, setAsked] = useState(false); // a click has asked Chrome
  const [busy, setBusy] = useState(false);
  const ids = useRef<string[]>([]);
  const asking = useRef(false);
  // Reads the store and holds every stored handle, so a click can ask at once.
  const look = useCallback(async () => {
    if (asking.current) return; // the click's own look is the newer one
    try {
      const now = await stored();
      const s = await files.states(now);
      if (asking.current) return;
      ids.current = now;
      setStates(s);
      setFailed('');
    } catch (e) {
      setFailed(errorText(e).msg);
    }
  }, [files, stored]);
  useEffect(() => {
    void look();
    // A video added in the side panel meanwhile, or access changed elsewhere.
    const again = () => { if (document.visibilityState === 'visible') void look(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
    };
  }, [look]);

  const n = tally(states ?? []);
  // requestPermission() goes out inside the click: the handles are held already.
  const ask = () => {
    asking.current = true;
    setBusy(true);
    void allowAll(ids.current, files).then((s) => {
      setStates(s);
      setAsked(true);
    }).finally(() => {
      asking.current = false;
      setBusy(false);
    });
  };

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-3 px-4 py-5">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">YouTube Upload Presets · {L('อนุญาตอ่านไฟล์', 'Allow file access')}</h1>
        <ThemeToggle />
      </div>
      <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-4 text-[13px]">
        <p>{L('วิดีโอในคิวเป็นไฟล์ในเครื่องนี้ Chrome เป็นผู้ตัดสินว่าส่วนขยายอ่านไฟล์เหล่านั้นได้หรือไม่ และอาจถอนสิทธิ์หลังปิดเปิดเบราว์เซอร์หรืออัปเดตส่วนขยาย', 'The videos in the queue are files on this computer. Chrome decides whether the extension may read them, and it can take that back after a restart or an update.')}</p>
        <p className="font-semibold">{L('กดปุ่มด้านล่าง แล้วในหน้าต่างคำถามของ Chrome ให้เลือก "Allow on every visit" (อนุญาตทุกครั้งที่เข้าชม)', 'Press the button below, and in Chrome\'s question pick "Allow on every visit".')}</p>
        <p>{L('ทำครั้งเดียว หลังจากนั้น Chrome ไม่ควรถามเรื่องไฟล์ในคิวอีก', 'You do this once: after that, Chrome should not ask about queued files again.')}</p>
        <div>
          <Button variant="go" disabled={busy || n.prompt === 0} onClick={ask}>{L('ขอสิทธิ์อ่านไฟล์จาก Chrome', 'Ask Chrome for file access')}</Button>
        </div>
        {failed && <p role="alert" className="text-err">{L(`อ่านรายการไฟล์ที่เก็บไว้ไม่สำเร็จ: ${failed}`, `Could not read the stored files: ${failed}`)}</p>}
        {states && (
          <div role="status" className="flex flex-col gap-1.5">
            {n.total === 0
              ? <p>{L('ยังไม่มีไฟล์วิดีโอที่เก็บไว้ Chrome จะถามก็ต่อเมื่อมีไฟล์จริง ให้เพิ่มวิดีโอเข้าคิวในแผงด้านข้างก่อน แล้วกลับมาที่หน้านี้', 'No video is stored yet. Chrome only asks about a real file: add a video to the queue in the side panel first, then come back to this page.')}</p>
              : <p className="text-fg2">{L(`อ่านได้ ${n.granted} จาก ${n.total} ไฟล์ที่เก็บไว้`, `Readable: ${n.granted} of ${n.total} stored file(s)`)}</p>}
            {asked && n.prompt > 0 && <p className="text-warn">{L(`Chrome ยังไม่อนุญาต ${n.prompt} ไฟล์ กดปุ่มอีกครั้งแล้วเลือก "Allow on every visit"`, `Chrome has not allowed ${n.prompt} file(s) yet. Press the button again and pick "Allow on every visit".`)}</p>}
            {n.denied > 0 && <p className="text-err">{L(`เบราว์เซอร์บล็อกการอ่านไฟล์ ${n.denied} ไฟล์ — ลบคลิปนั้นออกจากคิว แล้วเพิ่มไฟล์เข้ามาใหม่`, `The browser blocked reading ${n.denied} file(s) — remove those videos from the queue and add the files again`)}</p>}
            {n.total > 0 && n.granted === n.total && (
              <>
                <p className="text-ok">{L('อ่านไฟล์ที่เก็บไว้ได้ครบแล้ว ปิดแท็บนี้ได้เลย', 'Every stored file is readable. You can close this tab.')}</p>
                <p className="text-fg2">{L('ถ้าภายหลังแผงด้านข้างขอสิทธิ์อ่านไฟล์อีก แปลว่าครั้งนี้เลือก "Allow this time" ไว้ ให้เปิดหน้านี้อีกครั้งแล้วเลือก "Allow on every visit"', 'If the side panel asks for file access again later, "Allow this time" was picked: open this page again and pick "Allow on every visit".')}</p>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
