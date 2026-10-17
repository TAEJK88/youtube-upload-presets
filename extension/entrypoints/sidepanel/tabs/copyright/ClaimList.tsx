import { useEffect, useId } from 'react';
import { Button } from '@/components/ui/button';
import { claimsCsvRows, fmt } from '@/lib/claims/core';
import { chKey } from '@/lib/claims/keys';
import type { ClaimsState } from '@/lib/claims/types';
import { L, locale } from '@/lib/i18n';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { doneKeys, isDone, rowKey, selectWhere, trimSummary, type Pick } from '@/lib/panel/claims';
import { downloadCsv } from '@/lib/panel/download';
import { fmtWhen } from '@/lib/panel/format';
import { cn } from '@/lib/utils';
import { useAsk } from '../../ask';
import { usePanel } from '../../panel';
import { notConnected, saveFailed } from '../../save-failed';
import { SubView } from './SubView';
import { VideoList, VideoRow, type RowNote } from './VideoList';

// showClaims() (4860–4936): one card per claim (D23), the pick chips, CSV, Rescan, Trim selected,
// Close. Ticking writes this channel's trimQueue through the background (claims:op list, D20).
const TRIM_LABEL = (): Record<string, string> => ({
  pending: L('⏳ รอ', '⏳ Pending'), saved: L('✅ ตัดแล้ว', '✅ Trimmed'), gone: L('✅ claim หายไปแล้ว', '✅ Claim gone'), failed: L('❌ ไม่สำเร็จ', '❌ Failed'),
  skipped: L('⏭ ข้าม', '⏭ Skipped'), later: L('⏳ รอคิว — จะตัดหลังการตัดครั้งก่อนในคลิปนี้เสร็จ', '⏳ Queued — will trim after the previous trim on this video finishes'),
});
const STATE_TONE: Record<string, string> = { saved: 'text-ok', gone: 'text-ok', failed: 'text-err', skipped: 'text-warn', later: 'text-warn' };

// `busy`: a scan or run is on (here, or another tab's run): no trim from this (maybe outgoing) list until it
// ends. `idle`: the bound tab itself is free: a rescan takes no lock (D26), so only that gates it.
export function ClaimList({ data, state, busy, idle, onTracklist }: {
  data: ClaimsData; state: ClaimsState; busy: boolean; idle: boolean; onTracklist(videoId: string): void;
}) {
  const { send } = usePanel();
  const ask = useAsk();
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
      <SubView title={title}>
        <div className="text-xs text-warn">{L(`ยังไม่ได้สแกนช่อง ${state.channelName} — กด "สแกน claim" ก่อน`, `Channel ${state.channelName} not scanned yet — press "Scan claims" first`)}</div>
      </SubView>
    );
  }
  const rows = scan.rows;
  const videos = new Set(rows.map((r) => r.videoId)).size;
  const ownCount = rows.filter((r) => r.own).length;
  const chip = (kind: Pick, label: string) => <Button key={kind} size="sm" className="h-auto min-h-8 py-1 whitespace-normal" onClick={() => write(selectWhere(kind, rows, data.trimResults))}>{label}</Button>;
  const rescan = () => void send('claims:scan', 'claims').catch(notConnected);
  // openTrimConfirm() (5672–5696): the tab starts the run from its stored scan (claims:trim, D27).
  const pickedRows = rows.filter((r) => picked.has(rowKey(r)) && !isDone(data.trimResults[rowKey(r)]));
  const trim = async () => {
    if (!pickedRows.length || busy) return;
    const t = trimSummary(pickedRows);
    const go = await ask({
      title: L(`ตัด ${t.claims} claim ใน ${t.videos} คลิป?`, `Trim ${t.claims} claims in ${t.videos} videos?`),
      icon: 'cut',
      body: (
        <div className="flex flex-col gap-2 leading-relaxed">
          <div>{L(`จะตัดภาพ + เสียงออกรวม ${fmt(t.total)} ด้วยเครื่องมือ "Trim out segment" ของ YouTube `, `This will cut video + audio totalling ${fmt(t.total)} using YouTube's "Trim out segment" tool. `)}
            <b>{L('การตัดที่บันทึกแล้วย้อนกลับไม่ได้', 'Saved trims cannot be undone')}</b>{L(' และ YouTube ใช้เวลาประมวลผลหลายชั่วโมงต่อคลิป', ', and YouTube takes several hours to process each video')}</div>
          {t.own > 0 && <div className="text-warn">{L(`⚠ ${t.own} รายการเป็น claim บนเพลงของคุณเอง (★) ถ้าตัดจะเสียเพลงของตัวเองออกจากคลิป`, `⚠ ${t.own} items are claims on your own music (★) — trimming will remove your own music from the video`)}</div>}
          {state.uploadBusy && <div className="text-warn">{L('⏸ คิวอัปโหลดยังมีไฟล์อยู่ การตัดต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', '⏸ Upload queue still has files. Trimming needs page changes, will start after the upload queue finishes')}</div>}
          {!state.english && <div className="text-err">{L('⚠ Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ ปุ่มต่าง ๆ จะหาไม่เจอ — เปลี่ยนภาษาเป็น English ก่อน', "⚠ Studio is not set to English, buttons won't be found — switch the language to English first")}</div>}
          <div className="text-xs text-fg3">{L('คลิปหนึ่งตัดได้ทีละครั้ง ถ้าคลิปเดียวมีหลาย claim จะตัดอันแรกก่อน ที่เหลือจะตัดต่อให้เองเมื่อ YouTube ประมวลผลเสร็จ', 'Each video can only be trimmed once at a time. If a video has several claims, the first is trimmed now and the rest continue automatically once YouTube finishes processing')}</div>
          <div className="rounded-[12px] bg-tint/5 p-2.5">
            {data.cfg.autoSaveTrim ? L('⚡ อัตโนมัติทั้งหมด: Save → "I acknowledge" → Confirm changes ทุก claim', '⚡ Fully automatic: Save → "I acknowledge" → Confirm changes for every claim') : L('👀 โหมดตรวจเอง: คุณกด Save และยืนยันการตัดเองทีละอัน', '👀 Review mode: you click Save and confirm each trim yourself')}
            <div className="text-xs text-fg3">{L('เปลี่ยนได้ที่ เครื่องมือ → ⚙ ตัวเลือก → "ตัดอัตโนมัติทั้งหมด"', 'Change this in Tools → ⚙ Options → "Fully automatic trim"')}</div>
          </div>
        </div>
      ),
      ok: L('เริ่มตัด', 'Start trim'),
      cancel: L('ยกเลิก', 'Cancel'),
      focus: 'cancel',
    });
    if (go !== true) return;
    await send('claims:trim', pickedRows.map(rowKey)).catch(notConnected);
  };
  return (
    <SubView
      title={title}
      sub={<>
        {L(`${rows.length} claim ใน ${videos} คลิป (จากทั้งหมด ${scan.total}) · สแกนเมื่อ ${new Date(scan.date).toLocaleString(locale())}`, `${rows.length} claims in ${videos} videos (of ${scan.total} total) · scanned ${new Date(scan.date).toLocaleString(locale())}`)}
        {ownCount ? L(` · ${ownCount} รายการดูเหมือนเป็นเพลงของคุณเอง (★) — ให้ค่ายเพลง/ดิสทริบิวเตอร์ allowlist ช่องแทนการตัด`, ` · ${ownCount} look like your own songs (★) — have your label/distributor allowlist the channel instead of trimming`) : null}
      </>}
      footer={<>
        <span className="basis-full text-xs text-fg3">{L('ติ๊กเลือกแค่สร้างรายการ ยังไม่มีอะไรเปลี่ยนบน YouTube จนกว่าจะกดเริ่มตัด', 'Ticking only builds a list — nothing changes on YouTube until you start trimming')}</span>
        <Button size="sm" onClick={() => downloadCsv(claimsCsvRows(scan), `youtube-claims-${scan.date.slice(0, 10)}.csv`)}>⬇ CSV</Button>
        <Button size="sm" disabled={!idle} onClick={rescan}>{L('↻ สแกนใหม่', '↻ Rescan')}</Button>
        <Button variant="go" size="sm" disabled={!pickedRows.length || busy} onClick={() => void trim()}>
          {L(`✂ ตัดที่เลือก (${pickedRows.length})`, `✂ Trim selected (${pickedRows.length})`)}
        </Button>
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
        <VideoList key={scan.date} claims total={rows.length} count={rows.length} picked={pickedRows.length}>
          {(compact) => { const seen = new Set<string>(); return rows.map((r, i) => {
            const k = rowKey(r);
            const res = data.trimResults[k];
            const doneAlready = isDone(res);
            const pct = r.length ? Math.round((r.claimedSec / r.length) * 100) : 0;
            const first = !seen.has(r.videoId);
            seen.add(r.videoId);
            const soon = r.publishAt && r.publishAt > Date.now();
            const more = [r.artists, r.label].filter(Boolean).join(' · ');
            const song = <span id={`${id}s${i}`}>{r.song}{more && <span className="text-xs text-fg3">{' · ' + more}</span>}</span>;
            const notes: RowNote[] = soon ? [{ text: L(`⏰ ตั้งเวลาปล่อย ${fmtWhen(r.publishAt)}`, `⏰ Scheduled ${fmtWhen(r.publishAt)}`), tone: 'text-warn', icon: '⏰' }] : [];
            // A compact row: the song in words (a video's claims would look alike without it), the rest
            // as icons, and a failure's reason kept in words (#21). The full card keeps its order.
            if (compact) {
              if (r.own) notes.push({ text: L('★ เพลงของคุณเอง', '★ Your own song'), tone: 'text-warn', icon: '★' });
              if (res) {
                const text = `${TRIM_LABEL()[res.state] || res.state}${res.msg ? ' — ' : ''}${res.msg}`;
                notes.push({ text, tone: STATE_TONE[res.state], icon: [...text][0], keep: res.state === 'failed' });
              }
            }
            return (
              // Named by what it does (the userscript's title), described by its video and song.
              <VideoRow key={k} hook={{ 'data-claim': k }} compact={compact} title={r.video} url={`https://studio.youtube.com/video/${r.videoId}/claims`} meta={`${r.privacy} · ${fmt(r.length)}`}
                notes={notes} tone={r.own ? 'border-warn/35' : undefined} checked={picked.has(k) && !doneAlready}
                box={{
                  title: doneAlready ? L('จัดการแล้ว', 'Already handled') : r.canTrim ? L('เพิ่มในรายการตัด', 'Add to trim list') : L('YouTube ไม่มีตัวเลือก Trim สำหรับ claim นี้', 'YouTube offers no Trim option for this claim'),
                  describedBy: `${id}s${i}`, disabled: !r.canTrim || doneAlready,
                }}
                onCheck={(on) => write(on ? { add: [k] } : { del: [k] })}
                sub={<>{song}<span className="text-fg3">{' · ' + r.claimant}</span></>}>
                <div className="mt-1.5">{song}</div>
                <div className="text-xs text-fg2">{r.claimant}{r.own && <span className="ml-1 text-warn">{L('★ เพลงของคุณเอง', '★ Your own song')}</span>}</div>
                <div className="text-xs">
                  {(r.segments.map((sg) => fmt(sg[0]) + '–' + fmt(sg[1])).join(', ') || '?') + ' '}
                  <span className={pct >= 50 ? 'text-err' : 'text-fg3'}>{L(`${fmt(r.claimedSec)} (${pct}% ของคลิป)`, `${fmt(r.claimedSec)} (${pct}% of video)`)}</span>
                </div>
                <div className="text-xs text-fg2">{r.impact || L('ไม่มีผลกระทบ', 'No impact')}{!r.canTrim && <>{' · '}<span className="text-fg3">{L('ไม่มีตัวเลือก Trim', 'No Trim option')}</span></>}</div>
                {res && <div className={cn('text-xs', STATE_TONE[res.state])}>{TRIM_LABEL()[res.state] || res.state}{res.msg ? ' — ' : ''}{res.msg}</div>}
                {first && <Button size="sm" className="mt-1.5" onClick={() => onTracklist(r.videoId)}>{L('📝 tracklist หลังตัด', '📝 Tracklist after trim')}</Button>}
              </VideoRow>
            );
          }); }}
        </VideoList>
      ) : <div className="text-[13px] text-ok">{L('ไม่พบ claim 🎉', 'No claims found 🎉')}</div>}
    </SubView>
  );
}
