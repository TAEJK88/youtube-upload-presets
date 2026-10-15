import { useEffect, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { fmt } from '@/lib/claims/core';
import { L } from '@/lib/i18n';
import { claimedVideos, isDone, rowKey } from '@/lib/panel/claims';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { isTxt, readText } from '@/lib/panel/format';
import { fixTracklist } from '@/lib/tracklist';
import { Hint } from '../../fields';
import { SubView } from './SubView';

// showTracklistFix() (4980–5040): pick a claimed video, tick the trimmed ranges, get the
// tracklist with cut songs removed and later times moved up; copy it.
interface Upload { videoId: string; txt?: string }
const stopDrag = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); }; // not the panel's queue drop (usePanelDrop)
// The upload history (uploadOf 2076), read once per view; null while it is being read.
function useUploads(): Upload[] | null {
  const [list, setList] = useState<Upload[] | null>(null);
  useEffect(() => {
    let alive = true;
    void browser.storage.local.get('uploads').then(
      ({ uploads }) => { if (alive) setList(Array.isArray(uploads) ? (uploads as Upload[]) : []); },
      (e) => { console.error('[ytup] upload history', e); if (alive) setList([]); },
    );
    return () => { alive = false; };
  }, []);
  return list;
}

// `from`: the video the editor was left by Back; the picker gives its button the focus.
export function TracklistFix({ data, videoId, from, onPick, onClose }: { data: ClaimsData; videoId: string; from: string; onPick(videoId: string): void; onClose(): void }) {
  if (!videoId) return <Picker data={data} from={from} onPick={onPick} />;
  return <Editor key={videoId} data={data} videoId={videoId} onClose={onClose} />;
}

function Picker({ data, from, onPick }: { data: ClaimsData; from: string; onPick(id: string): void }) {
  const vids = claimedVideos(data.scan);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (from) box.current?.querySelector<HTMLElement>(`[data-video="${CSS.escape(from)}"]`)?.focus({ preventScroll: true });
  }, []);
  const have = new Set((useUploads() ?? []).map((u) => u.videoId));
  return (
    <SubView title={L('📝 เลือกคลิปที่จะแก้ tracklist', '📝 Choose a video to fix its tracklist')}>
      {vids.length ? (
        <div ref={box} className="flex flex-col gap-1.5">
          {vids.map((r) => (
            <button key={r.videoId} data-video={r.videoId} type="button" onClick={() => onPick(r.videoId)} className="cursor-pointer rounded-[12px] border border-tint/[0.09] bg-tint/5 px-3 py-2 text-left text-[13px] break-words hover:bg-surface2">
              <b className="block font-medium">{r.video}</b>
              <span className="text-xs text-fg3">
                {fmt(r.length) + ' · '}{have.has(r.videoId) ? L('มี tracklist จากประวัติการอัป', 'Tracklist from upload history') : L('ต้องวาง tracklist เอง', 'Paste tracklist manually')}
              </span>
            </button>
          ))}
        </div>
      ) : <div className="text-xs text-fg3">{L('ยังไม่มีคลิปที่โดน claim — กด "สแกน claim" ก่อน', 'No claimed videos yet — press "Scan claims" first')}</div>}
    </SubView>
  );
}

function Editor({ data, videoId, onClose }: { data: ClaimsData; videoId: string; onClose(): void }) {
  const rows = (data.scan?.rows ?? []).filter((r) => r.videoId === videoId);
  const length = rows[0]?.length || 0;
  const up = useUploads()?.find((u) => u.videoId === videoId);
  const [src, setSrc] = useState<string | null>(null); // typed or dropped here; until then the uploaded .txt
  const segs = rows.flatMap((r) => r.segments.map((sg) => ({ sg, song: r.song, saved: data.trimResults[rowKey(r)]?.state === 'saved' })));
  const [ticked, setTicked] = useState<boolean[]>(() => segs.map((s) => s.saved));
  const text = src ?? up?.txt ?? '';
  const chosen = segs.filter((_, i) => ticked[i]).map((s) => s.sg);
  const r = fixTracklist(text, chosen, length);
  const onDrop = async (e: DragEvent) => {
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => isTxt(x));
    if (!f) return; // anything else is the panel's, as everywhere
    stopDrag(e);
    setSrc(await readText(f));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.text);
      toast(L('คัดลอก tracklist ใหม่แล้ว ไปวางในคำอธิบายของวิดีโอได้เลย', 'New tracklist copied — paste it into the video description'));
    } catch (e) {
      console.error('[ytup] copy tracklist', e);
      toast(L(`คัดลอก tracklist ไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't copy the tracklist (${(e as Error)?.message ?? e})`));
    }
  };
  const original = L('tracklist เดิม', 'Original tracklist');
  const fixed = L('tracklist ใหม่', 'New tracklist');
  return (
    <SubView title={L('📝 tracklist หลังตัดลิขสิทธิ์', '📝 Tracklist after copyright trim')}
      sub={<>
        {L(`${rows[0]?.video || videoId} · ความยาวเดิม ${fmt(length)}`, `${rows[0]?.video || videoId} · original length ${fmt(length)}`)}
        {up ? L(' · ดึง tracklist จากประวัติการอัปโหลด', ' · tracklist pulled from upload history') : null}
      </>}
      onClose={onClose}
      footer={<Button variant="go" size="sm" className="ml-auto" onClick={() => void copy()}>{L('📋 คัดลอก tracklist ใหม่', '📋 Copy new tracklist')}</Button>}
    >
      <b className="text-xs font-medium text-fg2">{L('ช่วงที่ตัด', 'Trimmed ranges')}</b>
      {segs.length ? (
        <div className="flex flex-col gap-1.5">
          {segs.map((s, i) => (
            <label key={i} className="flex items-start gap-2 text-[13px] break-words">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-fg" checked={!!ticked[i]} onChange={(e) => setTicked((t) => segs.map((_, j) => (j === i ? e.target.checked : !!t[j])))} />
              <span className="min-w-0">{`${fmt(s.sg[0])}–${fmt(s.sg[1])} · ${s.song}`}{s.saved && <span className="text-ok">{L(' (ตัดแล้ว)', ' (trimmed)')}</span>}</span>
            </label>
          ))}
        </div>
      ) : <div className="text-xs text-fg3">{L('ไม่มีข้อมูลช่วงเวลา — สแกน claim ใหม่ก่อน', 'No time range data — rescan claims first')}</div>}
      <b className="text-xs font-medium text-fg2">{original}</b>
      {/* Local text, not a stored value: a plain box, so a drop shows even while it has focus. */}
      <Textarea aria-label={original} value={text} onChange={(e) => setSrc(e.target.value)} onDragOver={stopDrag} onDrop={(e) => void onDrop(e)} rows={6}
        placeholder={L('วาง tracklist เดิม (00:00 ศิลปิน - เพลง) หรือลากไฟล์ .txt มาวาง', 'Paste the original tracklist (00:00 Artist - Song) or drop a .txt file here')} />
      <b className="text-xs font-medium text-fg2">{fixed}</b>
      <Textarea aria-label={fixed} readOnly value={r.text} rows={6} />
      <div className="text-xs break-words text-fg3">
        {chosen.length
          ? L(`ตัด ${chosen.length} ช่วง · ลบ ${r.removed.length} เพลง${r.removed.length ? ': ' + r.removed.join(', ') : ''} · เหลือ ${r.kept} เพลง`, `Trim ${chosen.length} ranges · remove ${r.removed.length} songs${r.removed.length ? ': ' + r.removed.join(', ') : ''} · ${r.kept} songs left`)
          : L('ติ๊กช่วงที่ถูกตัด (หรือจะตัด) เพื่อดูผล', 'Tick the trimmed (or to-be-trimmed) ranges to see the result')}
      </div>
      <Hint>{L('เพลงที่ถูกตัดเกินครึ่งจะถูกลบ เวลาของเพลงหลังจุดตัดจะเลื่อนขึ้นตามความยาวที่ตัด ใช้หลังจาก YouTube ประมวลผลการตัดเสร็จแล้ว', 'Songs more than half trimmed are removed; songs after a cut shift earlier by the trimmed length. Use after YouTube has finished processing the trim.')}</Hint>
    </SubView>
  );
}
