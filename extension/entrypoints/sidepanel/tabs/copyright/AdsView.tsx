import { useId, useState } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/claims/core';
import type { ClaimsState } from '@/lib/claims/types';
import { L, locale } from '@/lib/i18n';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { adsInitial, adsWhere, type AdsPick } from '@/lib/panel/claims-runs';
import { usePanel } from '../../panel';
import { notConnected } from '../../save-failed';
import { SubView } from './SubView';

// showAds() (5289–5334): one card per video with ads off (D23), the pick chips, Recheck, Close and
// "Turn on ads (N)". The ticks are the view's own; the bound tab starts the run from its stored scan.
const openTab = (url: string) => void browser.tabs.create({ url });

// `busy`: a scan or run is on in the bound tab: nothing new starts from this list until it ends.
export function AdsView({ data, state, busy }: { data: ClaimsData; state: ClaimsState; busy: boolean }) {
  const { send } = usePanel();
  const id = useId();
  const scan = data.adsScan!; // the route opens this view only with a scan
  const [picked, setPicked] = useState(() => new Set(adsInitial(scan, data.adsResults)));
  // A newer scan can land under the open view (Recheck opens it before the stored scan is read):
  // the ticks start again from its rows, as the modal's did each time it opened.
  const [of, setOf] = useState(scan.date);
  if (of !== scan.date) {
    setOf(scan.date);
    setPicked(new Set(adsInitial(scan, data.adsResults)));
  }
  // The list stays mounted after its run (a Tools sub-tab): a video the run just turned on leaves
  // the picks, so a second press does not run the batch again (THAIB-1 review).
  const [seen, setSeen] = useState(data.adsResults);
  if (seen !== data.adsResults) {
    const on = [...picked].filter((v) => data.adsResults[v]?.state === 'on' && seen[v]?.state !== 'on');
    setSeen(data.adsResults);
    if (on.length) setPicked((p) => new Set([...p].filter((v) => !on.includes(v))));
  }
  const chip = (kind: AdsPick, label: string) => <Button size="sm" className="h-auto min-h-8 py-1 whitespace-normal" onClick={() => setPicked(new Set(adsWhere(kind, scan.rows)))}>{label}</Button>;
  const ok = scan.rows.filter((r) => !r.ineligible).length;
  const go = () => {
    const ids = scan.rows.filter((r) => picked.has(r.videoId)).map((r) => r.videoId);
    if (!ids.length || busy) return;
    void send('claims:ads', ids).catch(notConnected);
  };
  return (
    <SubView
      title={L(`💰 คลิปที่ปิดโฆษณา — ${state.channelName}`, `💰 Videos with ads off — ${state.channelName}`)}
      sub={<>
        <div>{L(`${scan.rows.length} จาก ${scan.total} คลิป · ${ok} คลิปแค่ปิดในการตั้งค่า · เช็กเมื่อ ${new Date(scan.date).toLocaleString(locale())}`, `${scan.rows.length} of ${scan.total} videos · ${ok} only turned off in settings · checked ${new Date(scan.date).toLocaleString(locale())}`)}</div>
        <div className="mt-1">{L('"ไม่มีสิทธิ์" หมายถึง YouTube บล็อกโฆษณาเอง (เช่นโดน claim หรือติดนโยบาย) เปิดการตั้งค่าได้ แต่คลิปนั้นอาจยังไม่มีรายได้จนกว่าจะแก้สาเหตุ', '"Ineligible" means YouTube blocks ads itself (e.g. a claim or policy issue). You can turn the setting on, but the video may not earn until the cause is fixed.')}</div>
      </>}
      footer={<>
        <Button size="sm" disabled={busy} onClick={() => void send('claims:scan', 'ads').catch(notConnected)}>{L('↻ เช็กใหม่', '↻ Recheck')}</Button>
        <span className="flex-1" />
        <Button variant="go" size="sm" disabled={!picked.size || busy} onClick={go}>{L(`💰 เปิดโฆษณา (${picked.size})`, `💰 Turn on ads (${picked.size})`)}</Button>
      </>}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-fg3">{L('เลือก:', 'Select:')}</span>
        {chip('settings', L('แค่ปิดในการตั้งค่า', 'Only off in settings'))}
        {chip('public', L('เฉพาะสาธารณะ', 'Public only'))}
        {chip('all', L('ทั้งหมด', 'All'))}
        {chip('none', L('ไม่เลือก', 'None'))}
      </div>
      {scan.rows.length ? (
        <div className="flex flex-col gap-2">
          {scan.rows.map((r) => {
            const res = data.adsResults[r.videoId];
            const url = `https://studio.youtube.com/video/${r.videoId}/monetization`;
            return (
              <div key={r.videoId} className="flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-fg" checked={picked.has(r.videoId)} aria-labelledby={`${id}${r.videoId}`}
                  onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.videoId); else n.delete(r.videoId); return n; })} />
                <div className="min-w-0 flex-1 break-words">
                  <a id={`${id}${r.videoId}`} className="font-medium underline-offset-2 hover:underline" href={url} onClick={(e) => { e.preventDefault(); openTab(url); }}>{r.video}</a>
                  <div className="text-xs text-fg3">{`${r.privacy} · ${fmt(r.length)}`}</div>
                  <div className="text-xs text-fg2">{r.ineligible ? <span className="text-warn">{L('⚠ YouTube แจ้งว่าไม่มีสิทธิ์', '⚠ YouTube says ineligible')}</span> : L('ปิดโฆษณาไว้ (ตั้งค่า)', 'Ads off (setting)')}</div>
                  {res && <div className={res.state === 'on' ? 'text-xs text-ok' : 'text-xs text-err'}>{res.state === 'on' ? L('✅ เปิดแล้ว', '✅ Turned on') : '❌ ' + res.msg}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="text-[13px] text-ok">{L('🎉 ทุกคลิปเปิดโฆษณาแล้ว', '🎉 All videos have ads on')}</div>}
    </SubView>
  );
}
