import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { L } from '@/lib/i18n';
import type { RunItem } from '@/lib/claims/types';
import type { ScheduledVideo } from '@/lib/messages';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { fmtWhen, toLocalInput } from '@/lib/panel/format';
import { useAsk } from '../../ask';
import { usePanel } from '../../panel';
import { notConnected } from '../../save-failed';
import { SubView } from './SubView';
import { VideoList, VideoRow } from './VideoList';
import { tick } from './video-picks';

// Reschedule: the channel's scheduled videos, as the bound Studio tab reads them (reschedule:list).
// Tick the ones to move and pick a new time for the earliest: every ticked video moves by the same
// offset, so the gaps and each one's time of day stay. The tab reads the channel afresh, checks the
// 15-minute rule and starts a run (reschedule:apply) that sets each time in Studio's own Visibility
// dialog, one video at a time; its rows follow the run (rescheduleRun), and the card above has Stop.
// `busy`: a run or scan is on (here, or another tab's): nothing new starts until it ends.
// `open`: the group shows. Coming back to it starts again (a fresh list, nothing ticked): ticks and a
// typed time never carry over from earlier (the live test, 2026-10-29, moved 25 videos that way),
// and Apply asks first, naming the count and the old → new range.
const note = (it: RunItem, active: boolean) => {
  if (it.state === 'moved') return { text: L(`✅ เลื่อนไป ${fmtWhen(it.at ?? 0)}`, `✅ Moved to ${fmtWhen(it.at ?? 0)}`), tone: 'text-ok', icon: '✅' };
  if (it.state === 'failed') return { text: `❌ ${it.msg}`, tone: 'text-err', icon: '❌', keep: true };
  return active ? { text: L('⏳ รอ', '⏳ Waiting'), icon: '⏳' } : null;
};
export function RescheduleView({ channelName, data, busy, open }: { channelName: string; data: ClaimsData; busy: boolean; open: boolean }) {
  const { send } = usePanel();
  const ask = useAsk();
  const [videos, setVideos] = useState<ScheduledVideo[] | null>(null);
  const [failed, setFailed] = useState('');
  const [picked, setPickedState] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState<string | null>(null); // null: the earliest ticked video's own time
  // Any change to the ticks drops a typed time: it was for the last set.
  const setPicked = (next: Set<string> | ((p: Set<string>) => Set<string>)) => { setPickedState(next); setTyped(null); };
  const [summary, setSummary] = useState('');
  const [moving, setMoving] = useState(false); // the Apply message is on its way
  const run = data.rescheduleRun;

  const load = async () => {
    try {
      const r = await send('reschedule:list', undefined);
      if ('error' in r) return void setFailed(r.error);
      setFailed('');
      setVideos([...r.videos].sort((a, b) => a.at - b.at));
      setPicked(new Set()); // a new list: nothing ticked from the old one
    } catch (e) {
      notConnected(e);
    }
  };
  useEffect(() => { void load(); }, []);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) void load();
    wasOpen.current = open;
  }, [open]);
  // A run that ends (or is stopped) changed the times: read them again.
  const wasActive = useRef(!!run?.active);
  useEffect(() => {
    if (wasActive.current && !run?.active) void load();
    wasActive.current = !!run?.active;
  }, [run?.active]);

  const ticked = (videos ?? []).filter((v) => picked.has(v.videoId));
  const first = ticked[0]?.at ?? 0;
  const last = ticked.at(-1)?.at ?? 0;
  const value = typed ?? (ticked.length ? toLocalInput(first) : '');
  const start = new Date(value).getTime();
  const preview = ticked.length && Number.isFinite(start)
    ? L(`${ticked.length} คลิป: ${fmtWhen(first)} – ${fmtWhen(last)} → ${fmtWhen(start)} – ${fmtWhen(start + last - first)}`,
      `${ticked.length} videos: ${fmtWhen(first)} – ${fmtWhen(last)} → ${fmtWhen(start)} – ${fmtWhen(start + last - first)}`)
    : '';

  const locked = busy || !!run?.active || moving;
  const apply = async () => {
    if (!ticked.length || !Number.isFinite(start) || locked) return;
    const items = ticked.map((v) => ({ videoId: v.videoId, at: v.at })); // exactly what is ticked now, at the times shown
    const n = items.length;
    // A shift of a day or more is said in words: a wrong date reads at a glance (the live test, 2026-10-29).
    const days = Math.round(Math.abs(start - first) / 86400e3);
    const by = days < 1 ? '' : start < first ? L(` เร็วขึ้น ${days} วัน`, ` ${days} days earlier`) : L(` ช้าลง ${days} วัน`, ` ${days} days later`);
    const sure = (await ask({
      title: L(`เลื่อน ${n} คลิป${by}: ${fmtWhen(first)} – ${fmtWhen(last)} → ${fmtWhen(start)} – ${fmtWhen(start + last - first)}?`,
        `Move ${n} videos${by}: ${fmtWhen(first)} – ${fmtWhen(last)} → ${fmtWhen(start)} – ${fmtWhen(start + last - first)}?`),
      body: L('Studio จะเปิดหน้าของแต่ละคลิปแล้วบันทึกเวลาใหม่ทีละคลิป กดหยุดได้ที่การ์ดสถานะด้านบน', "Studio opens each video's page and saves its new time, one video at a time. Stop is on the status card above."),
      icon: 'clock',
      danger: true,
      focus: 'cancel',
      ok: L(`เลื่อน ${n} คลิป`, `Move ${n} videos`),
    })) === true;
    if (!sure) return;
    setMoving(true);
    try {
      const r = await send('reschedule:apply', { items, start });
      if ('error' in r) return void toast(r.error);
      setSummary(L(`เริ่มแล้ว: ${r.started} คลิป`, `Started: ${r.started} videos`));
      setPicked(new Set());
      setTyped(null);
    } catch (e) {
      notConnected(e);
    } finally {
      setMoving(false);
    }
  };

  const count = (st: string) => run ? run.items.filter((i) => i.state === st).length : 0;
  const progress = run && run.items.length ? [L(`เลื่อนแล้ว ${count('moved')}`, `Moved ${count('moved')}`), count('failed') ? L(`ไม่สำเร็จ ${count('failed')}`, `Failed ${count('failed')}`) : '',
    count('pending') ? (run.active ? L(`เหลือ ${count('pending')}`, `Left ${count('pending')}`) : L(`ยังไม่ได้ทำ ${count('pending')}`, `Not done ${count('pending')}`)) : ''].filter(Boolean).join(' · ') : '';
  const label = L('เวลาใหม่ของคลิปแรกที่เลือก', 'New time for the earliest picked video');
  return (
    <SubView
      title={L(`เลื่อนเวลา — ${channelName}`, `Reschedule — ${channelName}`)}
      sub={L('เลือกคลิปที่ตั้งเวลาไว้ แล้วตั้งเวลาใหม่ให้คลิปแรก คลิปอื่นเลื่อนตาม ระยะห่างเท่าเดิม', 'Pick scheduled videos and give the earliest a new time; the others move with it and keep their gaps')}
      footer={<>
        <Button size="sm" disabled={locked} onClick={() => void load()}>{L('↻ อ่านรายการใหม่', '↻ Reload list')}</Button>
        <span className="flex-1" />
        <Button variant="go" size="sm" disabled={!ticked.length || !Number.isFinite(start) || locked} onClick={() => void apply()}>
          {L(`ใช้กับ ${ticked.length} คลิป`, `Apply to ${ticked.length} videos`)}
        </Button>
      </>}
    >
      {failed && <div role="alert" className="text-[13px] text-err">{failed}</div>}
      {summary && <div role="status" className="text-[13px]">{summary}</div>}
      {progress && <div className="text-[13px]">{progress}</div>}
      {videos && (videos.length ? <>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={() => setPicked(new Set(videos.map((v) => v.videoId)))}>{L('ทั้งหมด', 'All')}</Button>
          <Button size="sm" onClick={() => setPicked(new Set())}>{L('ไม่เลือก', 'None')}</Button>
        </div>
        <VideoList total={videos.length} count={videos.length} picked={ticked.length}>
          {(compact) => videos.map((v) => {
            const it = run?.items.find((i) => i.videoId === v.videoId);
            const n = it && note(it, !!run?.active);
            return (
              <VideoRow key={v.videoId} compact={compact} title={v.title || v.videoId} url={`https://studio.youtube.com/video/${v.videoId}/edit`} meta={fmtWhen(v.at)}
                notes={n ? [n] : []}
                checked={picked.has(v.videoId)} onCheck={(on) => setPicked(tick(v.videoId, on))} />
            );
          })}
        </VideoList>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{label}</span>
          {/* Plain state, no follow-while-focused: the box always shows the time Apply sends. */}
          <Input type="datetime-local" aria-label={label} disabled={!ticked.length} value={value} onChange={(e) => setTyped(e.target.value)} />
        </label>
        {preview && <div className="text-xs text-fg2">{preview}</div>}
      </> : <div className="text-[13px] text-fg3">{L('ช่องนี้ไม่มีคลิปที่ตั้งเวลาไว้', 'No scheduled videos on this channel')}</div>)}
    </SubView>
  );
}
