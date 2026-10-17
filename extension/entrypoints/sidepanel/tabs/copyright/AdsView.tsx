import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/claims/core';
import type { ClaimsState } from '@/lib/claims/types';
import { L, locale } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { cn } from '@/lib/utils';
import { adsInitial, adsWhere, type AdsPick } from '@/lib/panel/claims-runs';
import { usePanel } from '../../panel';
import { notConnected } from '../../save-failed';
import { SubView } from './SubView';
import { useDropFinished } from './use-drop-finished';
import { tick, VideoList, VideoRow, type RowNote } from './VideoList';

// showAds() (5289–5334): one card per video with ads off (D23), the pick chips, Recheck, Close and
// "Turn on ads (N)". The ticks are the view's own; the bound tab starts the run from its stored scan.
const tile = (n: number, label: string, tone?: string) => (
  <div className="flex min-w-0 flex-col rounded-[10px] bg-tint/5 px-2 py-1.5">
    <b className={cn('text-[15px] font-semibold tabular-nums', tone)}>{n}</b>
    <span className="text-xs break-words text-fg3">{label}</span>
  </div>
);

// `onOptions` opens Copyright → Options, where Auto-pilot's own "turn on ads too" is set.
// `busy`: a scan or run is on (here, or another tab's run): no run starts from this list until it ends.
// `idle`: the bound tab itself is free: a rescan takes no lock (D26), so only that gates it.
export function AdsView({ data, state, busy, idle, onOptions }: { data: ClaimsData; state: ClaimsState; busy: boolean; idle: boolean; onOptions?(): void }) {
  const { send } = usePanel();
  const scan = data.adsScan!; // the route opens this view only with a scan
  const [picked, setPicked] = useState(() => new Set(adsInitial(scan, data.adsResults)));
  // A newer scan can land under the open view (Recheck opens it before the stored scan is read):
  // the ticks start again from its rows, as the modal's did each time it opened.
  const [of, setOf] = useState(scan.date);
  if (of !== scan.date) {
    setOf(scan.date);
    setPicked(new Set(adsInitial(scan, data.adsResults)));
  }
  useDropFinished(data.adsResults, 'on', picked, setPicked);
  const chip = (kind: AdsPick, label: string) => <Button size="sm" className="h-auto min-h-8 py-1 whitespace-normal" onClick={() => setPicked(new Set(adsWhere(kind, scan.rows)))}>{label}</Button>;
  const ok = scan.rows.filter((r) => !r.ineligible).length;
  const go = () => {
    const ids = scan.rows.filter((r) => picked.has(r.videoId)).map((r) => r.videoId);
    if (!ids.length || busy) return;
    void send('claims:ads', ids).catch(notConnected);
  };
  return (
    <SubView
      title={L(`คลิปที่ปิดโฆษณาอยู่ — ${state.channelName}`, `Videos with ads off — ${state.channelName}`)}
      sub={L(`หาคลิปที่ปิดโฆษณาแล้วเปิดให้ · ${scan.rows.length} จาก ${scan.total} คลิป · เช็กเมื่อ ${new Date(scan.date).toLocaleString(locale())}`, `Finds videos with ads off and turns them on · ${scan.rows.length} of ${scan.total} videos · checked ${new Date(scan.date).toLocaleString(locale())}`)}
      footer={<>
        <Button size="sm" disabled={!idle} onClick={() => void send('claims:scan', 'ads').catch(notConnected)}>{L('↻ เช็กใหม่', '↻ Recheck')}</Button>
        <span className="flex-1" />
        <Button variant="go" size="sm" disabled={!picked.size || busy} onClick={go}>{L(`💰 เปิดโฆษณา (${picked.size})`, `💰 Turn on ads (${picked.size})`)}</Button>
      </>}
    >
      {/* The scan in three numbers: what is off, what only the setting holds back, what YouTube blocks. */}
      <div className="grid grid-cols-3 gap-1.5">
        {tile(scan.rows.length, L('ปิดอยู่', 'Off'))}
        {tile(ok, L('แค่ปิดในการตั้งค่า', 'Only off in settings'), 'text-ok')}
        {tile(scan.rows.length - ok, L('YouTube แจ้งว่าไม่มีสิทธิ์', 'YouTube says ineligible'), scan.rows.length > ok ? 'text-warn' : undefined)}
      </div>
      <div className="text-xs break-words text-fg3">{L('"ไม่มีสิทธิ์" หมายถึง YouTube บล็อกโฆษณาเอง (เช่นโดน claim หรือติดนโยบาย) เปิดการตั้งค่าได้ แต่คลิปนั้นอาจยังไม่มีรายได้จนกว่าจะแก้สาเหตุ', '"Ineligible" means YouTube blocks ads itself (e.g. a claim or policy issue). You can turn the setting on, but the video may not earn until the cause is fixed.')}</div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] bg-tint/5 px-2.5 py-2 text-xs text-fg2">
        <span className="min-w-0 flex-1">{data.cfg.apAdsOn ? L('Auto-pilot เปิดโฆษณาให้ด้วย: เปิด', 'Auto-pilot also turns on ads: on') : L('Auto-pilot เปิดโฆษณาให้ด้วย: ปิด', 'Auto-pilot also turns on ads: off')}</span>
        {onOptions && <Button size="sm" onClick={onOptions}>{L('เปลี่ยนในตัวเลือก', 'Change in Options')}</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-fg3">{L('เลือก:', 'Select:')}</span>
        {chip('settings', L('แค่ปิดในการตั้งค่า', 'Only off in settings'))}
        {chip('public', L('เฉพาะสาธารณะ', 'Public only'))}
        {chip('all', L('ทั้งหมด', 'All'))}
        {chip('none', L('ไม่เลือก', 'None'))}
      </div>
      {scan.rows.length ? (
        <VideoList total={scan.rows.length} count={scan.rows.length} picked={picked.size}>
          {(compact) => scan.rows.map((r) => {
            const res = data.adsResults[r.videoId];
            const notes: RowNote[] = [r.ineligible ? { text: L('⚠ YouTube แจ้งว่าไม่มีสิทธิ์', '⚠ YouTube says ineligible'), tone: 'text-warn', icon: '⚠' } : { text: L('ปิดโฆษณาไว้ (ตั้งค่า)', 'Ads off (setting)') }];
            if (res) notes.push(res.state === 'on' ? { text: L('✅ เปิดแล้ว', '✅ Turned on'), tone: 'text-ok', icon: '✅' } : { text: '❌ ' + res.msg, tone: 'text-err', icon: '❌', keep: true });
            return (
              <VideoRow key={r.videoId} compact={compact} title={r.video} url={`https://studio.youtube.com/video/${r.videoId}/monetization`} meta={`${r.privacy} · ${fmt(r.length)}`}
                notes={notes} checked={picked.has(r.videoId)} onCheck={(on) => setPicked(tick(r.videoId, on))} />
            );
          })}
        </VideoList>
      ) : <div className="text-[13px] text-ok">{L('🎉 ทุกคลิปเปิดโฆษณาแล้ว', '🎉 All videos have ads on')}</div>}
    </SubView>
  );
}
