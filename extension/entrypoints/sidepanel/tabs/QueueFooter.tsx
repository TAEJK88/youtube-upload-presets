import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { failedByDraft } from '@/lib/drafts';
import { L } from '@/lib/i18n';
import { fmtWhen } from '@/lib/panel/format';
import { runReads } from '@/lib/panel/regrant';
import { cn } from '@/lib/utils';
import { startFlow, stopFlow } from '@/lib/panel/start';
import type { StartSummary } from '@/lib/studio/queue-runner';
import { useAsk } from '../ask';
import { IconButton } from '../fields';
import { Icon } from '../Icon';
import { useLive, usePanel } from '../panel';

// What the drawer's start ask() showed (runner 2111–2143; .who / .facts / .warnbox 2882–2892):
// the destination channel, the count, the release, and the problems worth knowing first.
export function StartSummaryBody({ s }: { s: StartSummary }) {
  const t = s.times;
  const queued = s.daily?.queued ?? s.pendingN; // a tab of an older build sends no `queued`
  const release = t.length
    ? (t.length > 1 ? `${fmtWhen(t[0]!)} → ${fmtWhen(t[t.length - 1]!)}` : fmtWhen(t[0]!))
    : L(`ทันทีตามพรีเซ็ต (${s.vis})`, `Per preset (${s.vis})`);
  const warn = (head: string, lines: string[]) => (
    <div className="mt-2 rounded-[12px] border border-warn/35 bg-warn/10 px-3 py-2.5 text-xs leading-[1.55] text-warn">
      <b className="mb-1 flex items-center gap-1.5"><Icon name="alert" size={13} />{head}</b>
      <ul className="m-0 list-disc pl-[18px] text-fg2">
        {lines.slice(0, 5).map((x, i) => <li key={i}>{x}</li>)}
        {lines.length > 5 && <li>{L(`… และอีก ${lines.length - 5} คลิป`, `… and ${lines.length - 5} more`)}</li>}
      </ul>
    </div>
  );
  const fact = (k: string, v: string) => (
    <><span className="text-fg3">{k}</span><span className="font-semibold text-fg">{v}</span></>
  );
  return (
    <div className="whitespace-normal">
      <div className="mt-1 mb-2.5 flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5">
        {s.channel.avatar
          ? <img src={s.channel.avatar} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          : <div className="grid size-10 shrink-0 place-items-center rounded-full bg-surface2 text-fg3"><Icon name="tv" size={18} /></div>}
        <div className="min-w-0">
          <small className="block text-xs text-fg3">{L('ไปที่ช่อง', 'To channel')}</small>
          <b className="block truncate text-sm text-fg">{s.channel.name}</b>
          <small className="block font-mono text-xs text-fg3">{s.channel.id || ''}</small>
        </div>
      </div>
      <div className="mb-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        {fact(L('คลิป', 'Videos'), String(s.pendingN))}
        {fact(L('เผยแพร่', 'Release'), release)}
        {s.noTxt > 0 && fact(L('ไม่มี .txt', 'No .txt'), L(`${s.noTxt} คลิป`, `${s.noTxt} video(s)`))}
        {s.noThumb > 0 && fact(L('ไม่มีภาพปก', 'No thumbnail'), L(`${s.noThumb} คลิป`, `${s.noThumb} video(s)`))}
      </div>
      {s.badTime.length > 0 && warn(
        L(`เวลาปล่อยผ่านไปแล้ว/เร็วไป ${s.badTime.length} คลิป`, `${s.badTime.length} release time(s) in the past / too soon`),
        s.badTime.map((x) => `${x.name}: ${fmtWhen(x.at)}`))}
      {s.prevUp.length > 0 && warn(
        L(`เคยอัปขึ้นช่องนี้แล้ว ${s.prevUp.length} คลิป — จะได้คลิปซ้ำ`, `${s.prevUp.length} already uploaded to this channel — they will be duplicated`),
        s.prevUp.map((x) => `${x.name}: ${x.title}`))}
      {s.badTl.length > 0 && warn(
        L(`tracklist มีปัญหา ${s.badTl.length} คลิป — YouTube จะไม่สร้าง Chapters`, `${s.badTl.length} tracklist problem(s) — YouTube won't create chapters`),
        s.badTl.map((x) => `${x.name}: ${x.error}`))}
      {/* P5-daily-limit: a warning, not a block, and only an estimate. */}
      {s.daily && warn(
        L('อาจเกินขีดจำกัดอัปโหลดต่อวัน (ประมาณการ)', 'May go over the daily upload limit (an estimate)'),
        [
          L(`24 ชั่วโมงที่ผ่านมา เบราว์เซอร์นี้อัปขึ้นช่องนี้ ${s.daily.recent} คลิป + คิวนี้ ${queued} คลิป = ${s.daily.recent + queued} · ขีดจำกัดที่คุณตั้งไว้คือ ${s.daily.limit}`, `This browser uploaded ${s.daily.recent} to this channel in the last 24 hours + ${queued} in this queue = ${s.daily.recent + queued} · your limit is ${s.daily.limit}`),
          L('YouTube ไม่เปิดเผยตัวเลขจริง และนับการอัปโหลดจากทุกอุปกรณ์ — ส่วนขยายรู้เฉพาะที่อัปจากเบราว์เซอร์นี้', 'YouTube publishes no number and counts uploads from every device — the extension only knows its own'),
          L('เริ่มได้ตามปกติ: ถ้าชนขีดจำกัดจริง คิวจะพักแล้วอัปโหลดต่อเองใน 24 ชั่วโมง', 'You can still start: at the real limit the queue pauses and resumes by itself 24 hours later'),
        ])}
      {(s.badTl.length > 0 || s.badTime.length > 0 || s.prevUp.length > 0) && (
        <div className="mt-2 text-fg3">{L('กดยกเลิกเพื่อกลับไปแก้ — ดูรายละเอียดได้ที่ป้ายสีแดงในการ์ด', 'Cancel to go back and fix — details are on the red badges in each card')}</div>
      )}
    </div>
  );
}

// The Upload tab's footer (3731–3744, glass 3154–3160) and its labels (updateRunUI 4044–4077).
export function QueueFooter() {
  const { data, view, runner, elsewhere, busyElsewhere, link, target, send, sendTo, accessForStart } = usePanel();
  const { state, liveState } = useLive();
  const ask = useAsk();
  // A preflight can take a second or more (fresh config, the channel's schedule): one at a time.
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const items = view?.items ?? [];
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const pending = count('pending');
  const done = count('done');
  const errors = count('error');
  const total = items.length;
  const running = !!state?.running;
  const blocked = !!view?.channel.problem;
  const sched = view?.schedule.set ? L(' · ตั้งเวลา', ' · scheduled') : '';
  const ch = view?.channel.label ?? L('ไม่ทราบช่อง', 'Unknown channel'); // chanLabel()'s fallback
  // The queue met YouTube's daily limit and waits for its 24 hours (P5-daily-limit): Start resumes
  // now, Stop cancels the pause. `wait`: the run waits for Studio to upload a batch (P5-upload-batches).
  const paused = running ? null : state?.paused ?? null;
  const wait = running ? state?.wait ?? '' : '';
  const title = running
    ? L(`กำลังอัปโหลด ${done + errors + 1}/${total}`, `Uploading ${done + errors + 1}/${total}`)
    : blocked ? L('ช่องไม่ตรงกับที่ล็อกไว้', 'Channel does not match the locked one')
    : paused && pending ? L(`อัปโหลดต่อเลย ${pending} คลิป${sched}`, `Resume now: ${pending} video(s)${sched}`)
    : pending ? L(`เริ่มอัปโหลด ${pending} คลิป${sched}`, `Upload ${pending} video(s)${sched}`)
    : L('เริ่มอัปโหลด', 'Start upload');
  const sub = blocked ? L('ปลดล็อกหรือสลับกลับไปช่องที่ล็อกไว้', 'Unlock, or switch back to the locked channel') : L(`ไปที่ช่อง ${ch}`, `To channel ${ch}`);

  // "Resume drafts (N)" (P5-draft-retry): the failed videos whose file is a draft in Studio wait
  // again with their draft ids (queue:resumeAll, what a card's Retry → "Resume draft" does for
  // one), then the usual Start. `first` runs once the files are readable; false = nothing to start.
  const drafts = failedByDraft(items).resumable;
  const resumeAll = () => start(
    items.map((i) => (drafts.includes(i) ? { ...i, status: 'pending' as const } : i)),
    () => send('queue:resumeAll', undefined).then((n) => n > 0, (e: unknown) => {
      console.error('[ytup] resume drafts failed', e);
      toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
      return false;
    }),
  );
  const start = (reads = items, first: () => Promise<boolean> = async () => true) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    // Read access first, inside this click: the browser may have withdrawn it (the Re-grant
    // banner may be showing), and a side panel can ask for it again without a prompt, so
    // Start is not held back for it. What stays locked is said there, with the banner;
    // nothing is sent to the tab then.
    void accessForStart(runReads(reads, !!data?.settings.thumb)).then((ok) => ok && first()).then((ok) => (ok ? startFlow({
    preflight: () => send('queue:preflight', undefined),
    // null (dismissed, or replaced by another question) is a no, like false.
    confirm: async (s) => (await ask({
      title: L(`อัปโหลด ${s.pendingN} คลิป`, `Upload ${s.pendingN} video(s)`),
      icon: 'upload',
      ok: L(`เริ่มอัปโหลด ${s.pendingN} คลิป`, `Upload ${s.pendingN} video(s)`),
      body: <StartSummaryBody s={s} />,
    })) === true,
    start: (b) => send('queue:start', b),
    toast: (m) => void toast(m),
  }) : undefined)).catch((e) => console.error('[ytup] start: read access', e)).finally(() => {
    inFlight.current = false;
    setBusy(false);
  });
  };
  const cancelPause = () => void send('queue:stop', undefined).catch((e: unknown) => {
    console.error('[ytup] cancel pause failed', e);
    toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
  });
  const stop = () => void stopFlow({
    bound: target?.tabId ?? null,
    runner,
    stop: (tabId) => sendTo(tabId)('queue:stop', undefined),
    toast: (m) => void toast(m),
  });
  const clear = () => void send('queue:clearDone', undefined).catch((e: unknown) => {
    console.error('[ytup] clear done failed', e);
    toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
  });

  return (
    <>
    {(paused || wait) && (
      <div role="status" className="flex items-start gap-2 border-t border-tint/[0.08] px-[18px] pt-3 text-xs leading-[1.5] text-fg2">
        <Icon name={paused ? 'pause' : 'wait'} size={14} className="mt-0.5 shrink-0 text-warn" />
        <span className="min-w-0 flex-1">
          {paused
            ? L(`พักคิว: ชนขีดจำกัดอัปโหลดต่อวันของช่อง ${paused.name} — จะอัปโหลดต่อเอง ${fmtWhen(paused.until)} ถ้ามีแท็บ Studio ของช่องนั้นเปิดอยู่`, `Paused: daily upload limit on ${paused.name} — resumes ${fmtWhen(paused.until)} if a Studio tab on that channel is open`)
            : wait}
        </span>
      </div>
    )}
    {drafts.length > 0 && (
      <div className={cn('flex items-center gap-2 px-[18px] pt-3 text-xs leading-[1.5] text-fg2', !(paused || wait) && 'border-t border-tint/[0.08]')}>
        <span className="min-w-0 flex-1">{L(`${drafts.length} คลิปที่ผิดพลาดเป็นฉบับร่างใน Studio แล้ว`, `${drafts.length} failed video(s) are drafts in Studio`)}</span>
        <Button size="sm" title={L('ทำต่อบนฉบับร่างของทุกคลิปที่ผิดพลาด แล้วเริ่มคิว — ไม่อัปโหลดไฟล์ซ้ำ', 'Go on in the draft of every failed video, then start the queue — no file is uploaded again')}
          disabled={running || blocked || busyElsewhere || link !== 'ok' || busy} onClick={resumeAll}>
          <Icon name="refresh" size={13} />{L(`ทำต่อบนฉบับร่าง (${drafts.length})`, `Resume drafts (${drafts.length})`)}
        </Button>
      </div>
    )}
    <div className={cn('flex gap-2 px-[18px] py-3.5', !(paused || wait || drafts.length) && 'border-t border-tint/[0.08]')}>
      <Button variant="go" size="lg" className="group min-w-0 flex-1 justify-start gap-3 text-left"
        disabled={running || !pending || blocked || busyElsewhere || link !== 'ok' || busy} onClick={() => start()}>
        {/* .btn.go .gi: the play icon, spinning while the run goes (.btn.go.running .gi) */}
        <span data-go-icon className={cn('grid size-[30px] shrink-0 place-items-center rounded-full bg-on-fg/10 group-disabled:bg-tint/10', running && 'animate-[spin_1.2s_linear_infinite]')}>
          <Icon name="play" size={14} />
        </span>
        <span className="flex min-w-0 flex-col items-start leading-[1.25]">
          <b className="max-w-full truncate text-[13.5px] font-semibold">{title}</b>
          <small className="max-w-full truncate text-xs font-medium text-on-fg2 group-disabled:text-fg3">{sub}</small>
        </span>
      </Button>
      <IconButton icon="stop" title={paused ? L('ยกเลิกการพักคิว', 'Cancel the pause') : L('หยุดหลังคลิปปัจจุบันเสร็จ', 'Stop after the current video')}
        className="h-auto w-12 self-stretch rounded-[14px] border border-tint/[0.16] bg-tint/[0.06] text-tint hover:text-err disabled:opacity-35"
        disabled={!(liveState?.running || elsewhere || paused)} onClick={paused && !liveState?.running && !elsewhere ? cancelPause : stop} />
      <IconButton icon="clear" title={L('ล้างคลิปที่อัปเสร็จออกจากรายการ', 'Clear finished videos from the list')}
        className="h-auto w-12 self-stretch rounded-[14px] border border-tint/[0.16] bg-tint/[0.06] text-tint disabled:opacity-35"
        disabled={!done} onClick={clear} />
    </div>
    </>
  );
}
