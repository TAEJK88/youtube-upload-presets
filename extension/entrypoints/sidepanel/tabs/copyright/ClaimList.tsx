import { useEffect, useId, type ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { claimsCsvRows, fmt } from '@/lib/claims/core';
import { chKey } from '@/lib/claims/keys';
import type { ClaimsState } from '@/lib/claims/types';
import { L, locale } from '@/lib/i18n';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { doneKeys, isDone, rowKey, selectWhere, type Pick } from '@/lib/panel/claims';
import { downloadCsv } from '@/lib/panel/download';
import { fmtWhen } from '@/lib/panel/format';
import { cn } from '@/lib/utils';
import { usePanel } from '../../panel';
import { saveFailed } from '../../save-failed';
import { SubView } from './SubView';

// showClaims() (4860–4936): one card per claim (D23), the pick chips, CSV, Rescan, Close. Ticking
// writes this channel's trimQueue through the background (claims:op list, D20).
const TRIM_LABEL = (): Record<string, string> => ({
  pending: L('⏳ รอ', '⏳ Pending'), saved: L('✅ ตัดแล้ว', '✅ Trimmed'), gone: L('✅ claim หายไปแล้ว', '✅ Claim gone'), failed: L('❌ ไม่สำเร็จ', '❌ Failed'),
  skipped: L('⏭ ข้าม', '⏭ Skipped'), later: L('⏳ รอคิว — จะตัดหลังการตัดครั้งก่อนในคลิปนี้เสร็จ', '⏳ Queued — will trim after the previous trim on this video finishes'),
});
const STATE_TONE: Record<string, string> = { saved: 'text-ok', gone: 'text-ok', failed: 'text-err', skipped: 'text-warn', later: 'text-warn' };
const openTab = (url: string) => void browser.tabs.create({ url });

export function ClaimList({ data, state, onClose, onTracklist, trimButton }: {
  data: ClaimsData; state: ClaimsState; onClose(): void; onTracklist(videoId: string): void; trimButton?: ReactNode;
}) {
  const { send } = usePanel();
  const id = useId();
  const scan = data.scan;
  const key = chKey('trimQueue', data.ch);
  const picked = new Set(data.trimQueue);
  const write = (d: { add?: string[]; del?: string[] }) => void claimsWrite({ op: 'list', key, ...d }).catch(saveFailed);
  // Done picks leave the list when it opens (4886, 4911).
  const done = scan ? doneKeys(scan.rows, data.trimResults, data.trimQueue) : [];
  useEffect(() => { if (done.length) write({ del: done }); }, [key, done.join('\n')]);
  const title = L(`Claim ลิขสิทธิ์ — ${scan?.channelName || state.channelName}`, `Copyright claims — ${scan?.channelName || state.channelName}`);
  if (!scan) {
    return (
      <SubView title={title} onClose={onClose}>
        <div className="text-xs text-warn">{L(`ยังไม่ได้สแกนช่อง ${state.channelName} — กด "สแกน claim" ก่อน`, `Channel ${state.channelName} not scanned yet — press "Scan claims" first`)}</div>
      </SubView>
    );
  }
  const rows = scan.rows;
  const videos = new Set(rows.map((r) => r.videoId)).size;
  const ownCount = rows.filter((r) => r.own).length;
  const seen = new Set<string>();
  const chip = (kind: Pick, label: string) => <Button key={kind} size="sm" className="h-auto min-h-8 py-1 whitespace-normal" onClick={() => write(selectWhere(kind, rows, data.trimResults))}>{label}</Button>;
  const rescan = () => {
    onClose();
    void send('claims:scan', 'claims').catch((e) => {
      console.error('[ytup] copyright', e);
      toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
    });
  };
  return (
    <SubView
      title={title}
      sub={<>
        {L(`${rows.length} claim ใน ${videos} คลิป (จากทั้งหมด ${scan.total}) · สแกนเมื่อ ${new Date(scan.date).toLocaleString(locale())}`, `${rows.length} claims in ${videos} videos (of ${scan.total} total) · scanned ${new Date(scan.date).toLocaleString(locale())}`)}
        {ownCount ? L(` · ${ownCount} รายการดูเหมือนเป็นเพลงของคุณเอง (★) — ให้ค่ายเพลง/ดิสทริบิวเตอร์ allowlist ช่องแทนการตัด`, ` · ${ownCount} look like your own songs (★) — have your label/distributor allowlist the channel instead of trimming`) : null}
      </>}
      onClose={onClose}
      footer={<>
        <span className="basis-full text-xs text-fg3">{L('ติ๊กเลือกแค่สร้างรายการ ยังไม่มีอะไรเปลี่ยนบน YouTube จนกว่าจะกดเริ่มตัด', 'Ticking only builds a list — nothing changes on YouTube until you start trimming')}</span>
        <Button size="sm" onClick={() => downloadCsv(claimsCsvRows(scan), `youtube-claims-${scan.date.slice(0, 10)}.csv`)}>⬇ CSV</Button>
        <Button size="sm" onClick={rescan}>{L('↻ สแกนใหม่', '↻ Rescan')}</Button>
        {trimButton}
      </>}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-fg3">{L('เลือก:', 'Select:')}</span>
        {chip('all', L('ทุกอันที่ตัดได้', 'All trimmable'))}
        {chip('notOwn', L('ไม่ใช่เพลงของตัวเอง', 'Not my own songs'))}
        {chip('impact', L('กระทบวิดีโอ (รายได้/จำกัด/บล็อก)', 'Affects video (revenue/restricted/blocked)'))}
        {chip('scheduledImpact', L('⏰ ตั้งเวลาไว้ + กระทบ', '⏰ Scheduled + affected'))}
        {chip('short', L('ช่วงที่โดน < 20%', 'Claimed range < 20%'))}
        {chip('none', L('ไม่เลือก', 'None'))}
      </div>
      {rows.length ? (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const k = rowKey(r);
            const res = data.trimResults[k];
            const doneAlready = isDone(res);
            const pct = r.length ? Math.round((r.claimedSec / r.length) * 100) : 0;
            const first = !seen.has(r.videoId);
            seen.add(r.videoId);
            const soon = r.publishAt && r.publishAt > Date.now();
            const url = `https://studio.youtube.com/video/${r.videoId}/claims`;
            const more = [r.artists, r.label].filter(Boolean).join(' · ');
            return (
              <div key={k} data-claim={k} className={cn('flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]', r.own && 'border-warn/35')}>
                {/* Named by what it does (the userscript's title), described by its video and song. */}
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-fg" checked={picked.has(k) && !doneAlready} disabled={!r.canTrim || doneAlready}
                  aria-describedby={`${id}v${i} ${id}s${i}`}
                  title={doneAlready ? L('จัดการแล้ว', 'Already handled') : r.canTrim ? L('เพิ่มในรายการตัด', 'Add to trim list') : L('YouTube ไม่มีตัวเลือก Trim สำหรับ claim นี้', 'YouTube offers no Trim option for this claim')}
                  onChange={(e) => write(e.target.checked ? { add: [k] } : { del: [k] })} />
                <div className="min-w-0 flex-1 break-words">
                  <a id={`${id}v${i}`} className="font-medium underline-offset-2 hover:underline" href={url} onClick={(e) => { e.preventDefault(); openTab(url); }}>{r.video}</a>
                  <div className="text-xs text-fg3">{`${r.privacy} · ${fmt(r.length)}`}</div>
                  {soon ? <div className="text-xs text-warn">{L(`⏰ ตั้งเวลาปล่อย ${fmtWhen(r.publishAt)}`, `⏰ Scheduled ${fmtWhen(r.publishAt)}`)}</div> : null}
                  <div id={`${id}s${i}`} className="mt-1.5">{r.song}{more && <span className="text-xs text-fg3">{' · ' + more}</span>}</div>
                  <div className="text-xs text-fg2">{r.claimant}{r.own && <span className="ml-1 text-warn">{L('★ เพลงของคุณเอง', '★ Your own song')}</span>}</div>
                  <div className="text-xs">
                    {(r.segments.map((sg) => fmt(sg[0]) + '–' + fmt(sg[1])).join(', ') || '?') + ' '}
                    <span className={pct >= 50 ? 'text-err' : 'text-fg3'}>{L(`${fmt(r.claimedSec)} (${pct}% ของคลิป)`, `${fmt(r.claimedSec)} (${pct}% of video)`)}</span>
                  </div>
                  <div className="text-xs text-fg2">{r.impact || L('ไม่มีผลกระทบ', 'No impact')}{!r.canTrim && <>{' · '}<span className="text-fg3">{L('ไม่มีตัวเลือก Trim', 'No Trim option')}</span></>}</div>
                  {res && <div className={cn('text-xs', STATE_TONE[res.state])}>{TRIM_LABEL()[res.state] || res.state}{res.msg ? ' — ' : ''}{res.msg}</div>}
                  {first && <Button size="sm" className="mt-1.5" onClick={() => onTracklist(r.videoId)}>{L('📝 tracklist หลังตัด', '📝 Tracklist after trim')}</Button>}
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="text-[13px] text-ok">{L('ไม่พบ claim 🎉', 'No claims found 🎉')}</div>}
    </SubView>
  );
}
