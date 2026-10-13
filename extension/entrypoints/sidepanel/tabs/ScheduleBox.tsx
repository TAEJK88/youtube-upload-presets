import { useId, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { L } from '@/lib/i18n';
import { fmtWhen, toLocalInput } from '@/lib/panel/format';
import { everyOf, newSeed, nextAt, startAt, tomorrow19, windowWith, withinHour } from '@/lib/panel/schedule-quick';
import { weekField, weekPrefs } from '@/lib/schedule-week';
import type { Schedule } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Hint, TextField } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';
import { saveFailed } from '../save-failed';

// The drawer's schedule box (3603–3717): first release time, interval, quick picks, and a
// summary of what the queue will get. Release times themselves come from the Studio tab
// (QueueView.schedule), which also knows the channel's already-scheduled videos.
// "Per week" is the extension's own second mode (P5-week-schedule): N videos a week on days
// and times that vary, between two times of day. The tab makes those times too.
export function ScheduleBox({ open, onOpen }: { open: boolean; onOpen(open: boolean): void }) {
  const { data, view, write } = usePanel();
  const everyId = useId();
  const perWeekId = useId();
  if (!data) return null;
  const s = data.settings.schedule;
  const sv = view?.schedule;
  const setAt = startAt(s.start); // null: no start picked (scheduleOn() is false)
  const set = (patch: Partial<Schedule>) => void write.settings({ schedule: patch }).catch(saveFailed);
  const unit = s.unit === 'hour' ? L('ชั่วโมง', 'hours') : L('วัน', 'days');
  const week = s.mode === 'week';
  const w = weekPrefs(s);
  // In week mode a start the user sets is also where the weeks are counted from (the run moves
  // `start` on after each upload, and "Use this time" moves it too: neither moves the anchor).
  const setStart = (start: string) => set(week ? { start, anchor: start } : { start });
  const setWindow = (from: string, to: string, moved: 'from' | 'to') => {
    const next = windowWith(from, to, moved);
    if (next) set(next);
  };
  const weekTail = L(` · ${w.perWeek} คลิปต่อสัปดาห์ ${w.from}–${w.to}`, ` · ${w.perWeek} a week, ${w.from}–${w.to}`);

  let summary: string;
  if (!s.on) summary = L('ปิดอยู่ · คลิปจะเผยแพร่ตามการเปิดเผยของพรีเซ็ต', 'Off · videos are published using the preset\'s visibility');
  else if (setAt === null) summary = L('เลือกเวลาปล่อยคลิปแรก', 'Pick the first video\'s release time');
  // No view yet (no Studio tab, still loading, or from before the switch): the stored start.
  else if (!sv?.set) {
    summary = week
      ? L(`ตั้งแต่ ${fmtWhen(setAt)}`, `From ${fmtWhen(setAt)}`) + weekTail // the first time is the tab's to work out
      : L(`เริ่ม ${fmtWhen(setAt)} · ทุก ${s.every} ${unit}`, `Starts ${fmtWhen(setAt)} · every ${s.every} ${unit}`);
  } else {
    const t = sv.times;
    if (week) summary = (t.length > 1 ? `${fmtWhen(t[0]!)} → ${fmtWhen(t[t.length - 1]!)}` : L(`เริ่ม ${fmtWhen(sv.start)}`, `Starts ${fmtWhen(sv.start)}`)) + weekTail;
    else summary = t.length > 1
      ? L(`${fmtWhen(t[0]!)} → ${fmtWhen(t[t.length - 1]!)} · ทุก ${s.every} ${unit}`, `${fmtWhen(t[0]!)} → ${fmtWhen(t[t.length - 1]!)} · every ${s.every} ${unit}`)
      : L(`เริ่ม ${fmtWhen(sv.start)} · ทุก ${s.every} ${unit}`, `Starts ${fmtWhen(sv.start)} · every ${s.every} ${unit}`);
    const ext = sv.taken.length;
    if (ext) {
      const next = sv.taken[0]!;
      summary += L(` · ในช่องมีคลิปรอปล่อย ${ext} คลิป (ถัดไป ${fmtWhen(next)})`, ` · ${ext} already scheduled on the channel (next ${fmtWhen(next)})`)
        + (sv.skipped ? L(` — ข้ามให้ ${sv.skipped} ช่วง`, ` — skipped ${sv.skipped} slot(s)`) : '');
    }
  }
  // The view's `late` trails the stored settings by one queue:view round trip.
  const late = !!s.on && setAt !== null && !!sv?.set && sv.late;
  const quick = (label: string, value: () => string) => (
    <button type="button" key={label} onClick={() => setStart(value())}
      className="cursor-pointer rounded-full border border-line2 px-2.5 py-1 text-xs text-fg2 hover:border-fg3 hover:text-fg">{label}</button>
  );
  const mode = (m: 'every' | 'week', label: string) => (
    <button type="button" aria-pressed={week === (m === 'week')}
      // The first time, a seed is stored; the weeks are counted from the start as it is now.
      onClick={() => {
        if (week === (m === 'week')) return; // a click on the mode it is in must not move the anchor
        set(m === 'week' ? { mode: m, anchor: s.start, ...(weekField('seed', s.seed) ? {} : { seed: newSeed() }) } : { mode: m });
      }}
      className={cn('cursor-pointer rounded-[9px] py-1.5 text-xs text-fg2 hover:text-fg', week === (m === 'week') && 'bg-surface2 text-fg')}>{label}</button>
  );
  const startField = (
    <div>
      <div className="mb-1 text-xs font-semibold text-fg3">{L('คลิปแรกปล่อย', 'First video releases')}</div>
      <TextField type="datetime-local" aria-label={L('คลิปแรกปล่อย', 'First video releases')} value={s.start || ''} onValue={setStart} />
    </div>
  );
  // The header folds the box while it is on; the switch is not part of that click.
  const Head = s.on ? 'button' : 'div';
  const onHead = (e: MouseEvent) => {
    if (!s.on || (e.target as HTMLElement).closest('[role=switch]')) return;
    onOpen(!open);
  };

  return (
    <div className={cn('mt-3 rounded-[14px] border border-tint/10 bg-tint/[0.06]', late && 'border-warn/45')}>
      <div className={cn('flex items-center gap-2.5 px-3 py-2.5', s.on && 'cursor-pointer')} onClick={onHead}
        title={s.on ? (open ? L('คลิกเพื่อย่อ', 'Click to collapse') : L('คลิกเพื่อแก้เวลา', 'Click to edit times')) : ''}>
        {/* A button while on, for the keyboard: its click bubbles to the row's handler. */}
        <Head {...(s.on ? { type: 'button', 'aria-expanded': open } : {})}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg2">
          <span className="grid w-[22px] shrink-0 place-items-center text-tint/75"><Icon name="clock" size={16} /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13px] font-medium">{L('ตั้งเวลาปล่อยคลิป', 'Schedule releases')}</b>
            {/* The drawer's tooltip also named each video; the view carries their times only. */}
            <small className={cn('block truncate text-xs text-tint/65', late && 'text-warn')} title={sv?.set ? sv.taken.map((at) => fmtWhen(at)).join('\n') : ''}>{summary}</small>
          </span>
          {s.on && <Icon name="chev" size={14} className={cn('shrink-0 text-fg3 transition-transform', open && 'rotate-180')} />}
        </Head>
        <Switch aria-label={L('ตั้งเวลาปล่อยคลิป', 'Schedule releases')} checked={!!s.on}
          onCheckedChange={(on) => {
            const start = tomorrow19();
            set(on && !s.start ? { on, start, ...(week ? { anchor: start } : {}) } : { on });
          }} />
      </div>
      {late && sv && setAt !== null && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-[10px] border border-warn/35 bg-warn/[0.1] px-2.5 py-2 text-xs leading-[1.45] text-warn">
          <Icon name="alert" size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {L(`เวลาที่ตั้ง (${fmtWhen(setAt)}) ผ่านไปแล้ว — คิวจะเริ่ม ${fmtWhen(sv.start)} แทน`,
              `The set time (${fmtWhen(setAt)}) has passed — the queue will start ${fmtWhen(sv.start)} instead`)}
          </span>
          <Button size="sm" className="shrink-0" onClick={() => set({ start: toLocalInput(sv.start) })}>{L('ใช้เวลานี้', 'Use this time')}</Button>
        </div>
      )}
      {s.on && open && (
        <div className="grid gap-2.5 px-3 pb-3">
          <div role="group" aria-label={L('รูปแบบการปล่อย', 'Release pattern')} className="grid grid-cols-2 gap-1 rounded-[12px] border border-line bg-surface p-1">
            {mode('every', L('ทุก ๆ …', 'Every …'))}
            {mode('week', L('รายสัปดาห์', 'Per week'))}
          </div>
          {week ? (
            <>
              <div className="grid grid-cols-[1fr_96px] items-end gap-2">
                {startField}
                <div>
                  <div id={perWeekId} className="mb-1 text-xs font-semibold text-fg3">{L('คลิปต่อสัปดาห์', 'Videos a week')}</div>
                  <NativeSelect className="w-full" aria-labelledby={perWeekId} value={String(w.perWeek)} onChange={(e) => set({ perWeek: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div>
                  <div className="mb-1 text-xs font-semibold text-fg3">{L('ตั้งแต่', 'From')}</div>
                  <TextField type="time" aria-label={L('ตั้งแต่', 'From')} value={w.from} onValue={(v) => setWindow(v, w.to, 'from')} />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-fg3">{L('ถึง', 'Until')}</div>
                  <TextField type="time" aria-label={L('ถึง', 'Until')} value={w.to} onValue={(v) => setWindow(w.from, v, 'to')} />
                </div>
                <Button title={L('สุ่มวันและเวลาชุดใหม่', 'Draw a new set of days and times')} onClick={() => set({ seed: newSeed() })}>{L('สุ่มใหม่', 'Shuffle')}</Button>
              </div>
            </>
          ) : (
          <div className="grid grid-cols-[1fr_70px_96px] items-end gap-2">
            {startField}
            <div>
              <div id={everyId} className="mb-1 text-xs font-semibold text-fg3">{L('ทุก ๆ', 'Every')}</div>
              <TextField type="number" min={1} max={999} aria-label={L('ทุก ๆ', 'Every')} value={String(s.every || 1)} onValue={(v) => set({ every: everyOf(v) })} />
            </div>
            <div>
              <div className="mb-1 text-xs">{' '}</div>
              <NativeSelect className="w-full" aria-labelledby={everyId} value={s.unit === 'hour' ? 'hour' : 'day'} onChange={(e) => set({ unit: e.target.value as Schedule['unit'] })}>
                <option value="day">{L('วัน', 'days')}</option>
                <option value="hour">{L('ชั่วโมง', 'hours')}</option>
              </NativeSelect>
            </div>
          </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {quick(L('พรุ่งนี้ 19:00', 'Tomorrow 19:00'), () => tomorrow19())}
            {quick(L('18:00 ถัดไป', 'Next 18:00'), () => nextAt(18))}
            {quick(L('20:00 ถัดไป', 'Next 20:00'), () => nextAt(20))}
            {quick(L('ภายใน 1 ชม.', 'Within 1 hr'), () => withinHour())}
          </div>
          {week && <Hint icon="clock">{L('วันและเวลาจะสุ่มใหม่ทุกสัปดาห์ ไม่มีวันไหนได้เกินหนึ่งคลิป · กด "สุ่มใหม่" เพื่อเปลี่ยนทั้งชุด', 'Days and times are drawn anew each week, never two videos on one day · "Shuffle" draws a new set')}</Hint>}
          <Hint>{L('คลิปจะอัปเป็นส่วนตัว แล้วเปลี่ยนเป็นสาธารณะเองตามเวลาที่ตั้ง · แก้เวลาของแต่ละคลิปได้ในการ์ด', 'Videos upload as private, then go public at the set time · edit each video\'s time in its card')}</Hint>
        </div>
      )}
    </div>
  );
}
