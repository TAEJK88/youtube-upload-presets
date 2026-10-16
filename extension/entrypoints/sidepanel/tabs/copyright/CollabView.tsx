import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/claims/core';
import type { ClaimsState } from '@/lib/claims/types';
import { parseHandles } from '@/lib/collab';
import { L, locale } from '@/lib/i18n';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { collabShown, collabWhere, type CollabPick } from '@/lib/panel/claims-runs';
import { TextField } from '../../fields';
import { usePanel } from '../../panel';
import { notConnected, saveFailed } from '../../save-failed';
import { SubView } from './SubView';
import { useDropFinished } from './use-drop-finished';

// showCollab() (5486–5546), in three steps: the channels to invite, one card per video (D23) with
// search and pick chips, then the invite links to send; Reload list and "Invite (N videos)" below.
// The ticks are the view's own; the bound tab starts the run from its stored scan.
const openTab = (url: string) => void browser.tabs.create({ url });
// The view's work in the order it is done: who to invite, which videos, then the link to send.
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold">
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-tint/15 text-xs font-medium text-fg2 tabular-nums">{n}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

// `busy`: a scan or run is on (here, or another tab's run): no run starts from this list until it ends.
// `idle`: the bound tab itself is free: a rescan takes no lock (D26), so only that gates it.
export function CollabView({ data, state, busy, idle }: { data: ClaimsData; state: ClaimsState; busy: boolean; idle: boolean }) {
  const { send } = usePanel();
  const id = useId();
  const scan = data.collabScan!; // the route opens this view only with a scan
  const [handles, setHandles] = useState(data.collabHandles);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // A newer scan can land under the open view (Reload list opens it before the stored scan is
  // read): the ticks start again, as the modal's did each time it opened.
  const [of, setOf] = useState(scan.date);
  if (of !== scan.date) {
    setOf(scan.date);
    setPicked(new Set());
  }
  useDropFinished(data.collabResults, 'done', picked, setPicked);
  // collabHandles was saved on every keystroke (5492); here a moment after the typing stops (a
  // write is a message to the background), and at once when the view closes before that, or the
  // side panel itself does (pagehide: no cleanup runs in a closing window).
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unsaved = useRef<string | null>(null);
  const saveNow = () => {
    clearTimeout(timer.current);
    if (unsaved.current === null) return;
    void claimsWrite({ op: 'set', key: 'collabHandles', value: unsaved.current }).catch(saveFailed);
    unsaved.current = null;
  };
  const typed = (v: string) => {
    setHandles(v);
    unsaved.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 400);
  };
  useEffect(() => {
    window.addEventListener('pagehide', saveNow);
    return () => {
      window.removeEventListener('pagehide', saveNow);
      saveNow();
    };
  }, []);
  const chip = (kind: CollabPick, label: string) => (
    <Button size="sm" className="h-auto min-h-8 py-1 whitespace-normal" onClick={() => {
      const d = collabWhere(kind, scan.rows, data.collabResults, q);
      setPicked((p) => { const n = new Set(p); d.add.forEach((x) => n.add(x)); d.del.forEach((x) => n.delete(x)); return n; });
    }}>{label}</Button>
  );
  const go = () => {
    const list = parseHandles(handles);
    if (!list.length) return void toast(L('ใส่ @handle ของช่องที่จะเชิญก่อน', 'Enter the @handle of the channel to invite first'));
    const ids = scan.rows.filter((r) => picked.has(r.videoId)).map((r) => r.videoId);
    if (!ids.length || busy) return;
    void send('claims:collab', { videoIds: ids, handles: list }).catch(notConnected);
  };
  const copy = async (hd: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast(L(`คัดลอกลิงก์ของ ${hd} แล้ว`, `Copied ${hd}'s link`));
    } catch (e) {
      console.error('[ytup] copy invite link', e);
      toast(L('คัดลอกไม่สำเร็จ', "Couldn't copy"));
    }
  };
  const links = Object.entries(data.collabLinks);
  const invite = L('ช่องที่จะเชิญ', 'Channels to invite');
  const search = L('ค้นหาชื่อคลิป…', 'Search video titles…');
  return (
    <SubView
      title={L(`Collab — ${state.channelName}`, `Collab — ${state.channelName}`)}
      sub={L(`เชิญช่องอื่นเป็นผู้ร่วมสร้าง · ${scan.total} คลิป · อ่านเมื่อ ${new Date(scan.date).toLocaleString(locale())}`, `Invite other channels as collaborators · ${scan.total} videos · read ${new Date(scan.date).toLocaleString(locale())}`)}
      footer={<>
        <Button size="sm" disabled={!idle} onClick={() => void send('claims:scan', 'collab').catch(notConnected)}>{L('↻ อ่านรายการใหม่', '↻ Reload list')}</Button>
        <span className="flex-1" />
        <Button variant="go" size="sm" disabled={!picked.size || busy} onClick={go}>{L(`🤝 เชิญ (${picked.size} คลิป)`, `🤝 Invite (${picked.size} videos)`)}</Button>
      </>}
    >
      <Step n={1} title={invite}>
        <div className="text-xs text-fg3">{L('@handle คั่นด้วย , (สูงสุด 10)', '@handle, comma-separated (max 10)')}</div>
        <TextField value={handles} onValue={typed} placeholder="@handle1, @handle2" aria-label={invite} />
      </Step>
      <Step n={2} title={L(`เลือกคลิป (${picked.size})`, `Pick videos (${picked.size})`)}>
        <div className="flex flex-wrap items-center gap-1.5">
          <TextField className="min-w-40 flex-1" value={q} onValue={setQ} placeholder={search} aria-label={search} />
          {chip('shown', L('ทั้งหมดที่แสดง', 'All shown'))}
          {chip('public', L('เฉพาะสาธารณะ', 'Public only'))}
          {chip('never', L('ยังไม่เคยเชิญ', 'Not invited yet'))}
          {chip('failed', L('เฉพาะที่ไม่สำเร็จ', 'Failed only'))}
          {chip('none', L('ไม่เลือก', 'None'))}
        </div>
        {scan.rows.length ? (
          <div className="flex flex-col gap-2">
            {collabShown(scan.rows, q).map((r) => {
              const res = data.collabResults[r.videoId];
              const url = `https://studio.youtube.com/video/${r.videoId}/edit`;
              return (
                <div key={r.videoId} className="flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-fg" checked={picked.has(r.videoId)} aria-labelledby={`${id}${r.videoId}`}
                    onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.videoId); else n.delete(r.videoId); return n; })} />
                  <div className="min-w-0 flex-1 break-words">
                    <a id={`${id}${r.videoId}`} className="font-medium underline-offset-2 hover:underline" href={url} onClick={(e) => { e.preventDefault(); openTab(url); }}>{r.video}</a>
                    <div className="text-xs text-fg3">{`${r.privacy} · ${fmt(r.length)}`}</div>
                    {res && <div className={res.state === 'done' ? 'text-xs text-ok' : 'text-xs text-err'}>{(res.state === 'done' ? '✅ ' : '❌ ') + res.msg}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="text-[13px] text-ok">{L('ช่องนี้ยังไม่มีคลิป', 'This channel has no videos yet')}</div>}
      </Step>
      <Step n={3} title={L('ส่งลิงก์คำเชิญให้อีกฝ่าย', 'Send the invite link')}>
        <div className="text-xs break-words text-fg3">{L('YouTube ไม่ส่งคำเชิญให้เอง หลังเชิญเสร็จต้องส่งลิงก์คำเชิญให้อีกฝ่ายเปิดแล้วกดยอมรับ (ช่องละลิงก์เดียว ใช้ได้กับทุกคลิป)', "YouTube doesn't send the invite itself: after inviting, send the invite link to the other channel to open and accept (one link per channel, covers every video)")}</div>
        {links.length > 0 ? (
          <div className="rounded-[12px] bg-tint/5 p-2.5 text-[13px]">
            <b className="font-medium">{L('ลิงก์คำเชิญ (ส่งให้อีกฝ่าย)', 'Invite links (send to the other channel)')}</b>
            {links.map(([hd, link]) => (
              <div key={hd} className="mt-1 flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate">{`${hd}: ${link}`}</span>
                <Button size="sm" onClick={() => void copy(hd, link)}>{L('คัดลอก', 'Copy')}</Button>
              </div>
            ))}
          </div>
        ) : <div className="text-xs text-fg3">{L('ลิงก์จะขึ้นตรงนี้หลังกดเชิญ', 'The links show here after you invite')}</div>}
      </Step>
    </SubView>
  );
}
