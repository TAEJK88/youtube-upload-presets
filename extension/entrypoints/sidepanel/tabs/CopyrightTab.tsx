import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { uploadsCsvRows, type UploadRecordLike } from '@/lib/claims/core';
import type { ClaimsState } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import { claimsWrite, watchClaims, type ClaimsData } from '@/lib/panel/claims-data';
import { downloadCsv } from '@/lib/panel/download';
import { cn } from '@/lib/utils';
import { Section } from '../fields';
import { Icon } from '../Icon';
import { useClaims, usePanel } from '../panel';
import { notConnected, saveFailed } from '../save-failed';
import { ActivityLog } from './copyright/ActivityLog';
import { AdsView } from './copyright/AdsView';
import { AutopilotSwitch } from './copyright/AutopilotSwitch';
import { ClaimList } from './copyright/ClaimList';
import { CollabView } from './copyright/CollabView';
import { CopyrightSettings } from './copyright/CopyrightSettings';
import { Songs } from './copyright/Songs';
import { StatusCard } from './copyright/StatusCard';
import { TracklistFix } from './copyright/TracklistFix';

// The drawer's "ลิขสิทธิ์" pane (buildPane 6183–6216, renderStatus 6219–6256) and its modals as
// views (D23). Status and counts come from the Studio tab (useClaims, D24); lists and results
// from storage, for the channel that tab is on.
export type CopyrightView =
  | { name: 'home' } | { name: 'claims' } | { name: 'songs' } | { name: 'tracklist'; videoId: string }
  | { name: 'ads' } | { name: 'collab' } | { name: 'settings' };

export function useClaimsData(ch: string | null): ClaimsData | null {
  const [data, setData] = useState<ClaimsData | null>(null);
  useEffect(() => {
    if (!ch) return void setData(null);
    let alive = true;
    const off = watchClaims(ch, (d) => { if (alive) setData(d); }); // the first read, then every change
    return () => { alive = false; off(); };
  }, [ch]);
  // Never another channel's data: the bound tab moved and the new read is pending, or failed.
  return data?.ch === ch ? data : null;
}

// What the pane keeps for every channel, read without a Studio tab: whether the activity log
// is open (logOpen, 6184) and how many songs were ever claimed (songHistory, 5066).
const GLOBALS = ['logOpen', 'songHistory'];
function useClaimsGlobals(): { logOpen: boolean; songs: number } {
  const [g, setG] = useState({ logOpen: false, songs: 0 });
  useEffect(() => {
    let alive = true;
    const read = () => void browser.storage.local.get(GLOBALS).then((raw) => {
      const songs = raw.songHistory;
      if (alive) setG({ logOpen: raw.logOpen === true, songs: songs && typeof songs === 'object' && !Array.isArray(songs) ? Object.keys(songs).length : 0 });
    }).catch((e) => console.error('[ytup] read copyright data', e));
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && GLOBALS.some((k) => k in changes)) read();
    };
    read();
    browser.storage.onChanged.addListener(changed);
    return () => { alive = false; browser.storage.onChanged.removeListener(changed); };
  }, []);
  return g;
}

export function CopyrightTab() {
  const { send, sendTo, runner, target } = usePanel();
  const { state, live, log, shown: opened } = useClaims();
  // What the bound tab last said for real: its channel and state survive a page load of that tab
  // (state null, or 'unknown' before ytcfg), which every trim / ads / Collab step is. Another bound
  // tab starts from nothing.
  const kept = useRef<{ tabId: number | undefined; ch: string | null; state: ClaimsState | null }>({ tabId: undefined, ch: null, state: null });
  if (kept.current.tabId !== target?.tabId) kept.current = { tabId: target?.tabId, ch: null, state: null };
  if (state && state.channel !== 'unknown') kept.current = { tabId: target?.tabId, ch: state.channel, state };
  const shown = state && state.channel !== 'unknown' ? state : kept.current.state ?? state; // what the views and buttons read
  const ch = kept.current.ch ?? state?.channel ?? null;
  const data = useClaimsData(ch);
  const stored = useClaimsGlobals();
  const [view, setView] = useState<CopyrightView>({ name: 'home' });
  const [openLog, setOpenLog] = useState<boolean | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const closed = useRef<CopyrightView['name'] | null>(null); // the view Close just left: its button takes focus back
  const home = () => {
    closed.current = view.name;
    setView({ name: 'home' });
  };
  // A different real channel (or another tab): an open view was the old one's (its video, its text).
  useEffect(() => setView({ name: 'home' }), [ch]);
  // A scan started here ended in the bound tab: open its list (showClaims() after scanClaims()).
  useEffect(() => {
    if (!opened) return;
    const next: CopyrightView = { name: opened.view };
    setView(next);
  }, [opened]);

  // Each view, and the tab on the way back, opens at its top (the pane scrolls: App's [data-pane-scroll]).
  const at = view.name + ':' + (view.name === 'tracklist' ? view.videoId : '');
  useEffect(() => {
    // Not while another panel tab shows (a scan can end and open its list then): the panes share the scroller.
    const scroller = root.current?.closest('[data-state="inactive"]') ? null : root.current?.closest('[data-pane-scroll]');
    if (scroller) scroller.scrollTop = 0;
    if (view.name === 'home' && closed.current) root.current?.querySelector<HTMLElement>(`[data-view="${closed.current}"]`)?.focus({ preventScroll: true });
    closed.current = null;
  }, [at]);

  const sub = !data || !shown ? null
    : view.name === 'claims' ? <ClaimList data={data} state={shown} onClose={home} onTracklist={(videoId) => setView({ name: 'tracklist', videoId })} />
    : view.name === 'songs' ? <Songs data={data} onClose={home} />
    : view.name === 'tracklist' ? <TracklistFix data={data} videoId={view.videoId} onPick={(videoId) => setView({ name: 'tracklist', videoId })} onClose={home} />
    : view.name === 'ads' && data.adsScan ? <AdsView data={data} state={shown} onClose={home} />
    : view.name === 'collab' && data.collabScan ? <CollabView data={data} state={shown} onClose={home} />
    : view.name === 'settings' ? <CopyrightSettings data={data} onClose={home} />
    : null;
  if (sub) return <div ref={root}>{sub}</div>;

  // The buttons follow the bound tab; the card and Stop follow the tab that works (`live`): another
  // tab's trim holds the lock, but scans take none (D26).
  const s = live ?? shown;
  const n = shown?.counts;
  const idle = !shown?.busyRun && !shown?.busyScan; // renderStatus()'s row visibility (6251)
  const stoppable = !!s && (s.busyRun || s.waiting > 0);
  const scan = (what: 'claims' | 'ads' | 'collab') => void send('claims:scan', what).catch(notConnected);
  // Stop goes to the tab holding the lock while it runs a copyright job elsewhere (D27).
  const stopTo = live && live !== state && runner ? sendTo(runner.tabId) : send;
  const stop = () => void stopTo('claims:stop', undefined).catch(notConnected);
  const uploads = async () => {
    try {
      const list = (await browser.storage.local.get('uploads')).uploads;
      downloadCsv(uploadsCsvRows(Array.isArray(list) ? (list as UploadRecordLike[]) : []), `uploads-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      console.error('[ytup] upload history', e);
      toast(L(`ส่งออกไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't export (${(e as Error)?.message ?? e})`));
    }
  };
  // logOpen is stored (6201) and also follows this click at once.
  const logOpen = openLog ?? stored.logOpen;
  const toggleLog = () => {
    setOpenLog(!logOpen);
    void claimsWrite({ op: 'set', key: 'logOpen', value: !logOpen }).catch(saveFailed);
  };
  return (
    <div ref={root}>
      {shown && !shown.english && (
        <div className="mb-3 rounded-[12px] border border-err/35 bg-err/[0.08] px-3 py-2 text-xs text-err">
          {L('⚠ Studio ตั้งเป็นภาษาไทยอยู่ — ส่วนตัด claim / เปิดโฆษณาอัตโนมัติต้องใช้ Studio ภาษาอังกฤษ (รูปโปรไฟล์ → Language → English) การสแกนใช้ได้ทุกภาษา', '⚠ Studio is set to Thai — auto claim trimming / ads need Studio in English (profile picture → Language → English). Scanning works in any language')}
        </div>
      )}
      <Section title={L('สถานะ', 'Status')} icon="shield">
        {s && <StatusCard s={s.status} />}
        {/* The side panel can be 320px wide: a button that doesn't fit beside its neighbour takes the next line. */}
        {/* row1 (6204): Scan · Ads off · Stop */}
        {(idle || stoppable) && (
          <div className="mt-2.5 flex flex-wrap gap-2 [&>button]:grow">
            {idle && <Button variant="go" onClick={() => scan('claims')} disabled={!shown}><Icon name="scan" size={16} />{L('สแกน claim', 'Scan claims')}</Button>}
            {idle && (
              <Button data-view="ads" onClick={() => (data?.adsScan ? setView({ name: 'ads' }) : scan('ads'))} disabled={!data}
                title={L('หาคลิปที่ปิดโฆษณาแล้วเปิดให้', 'Find videos with ads off and turn them on')}>
                <Icon name="paid" size={16} />{n?.hasAdsScan ? L(`โฆษณาปิดอยู่ (${n.adsTodo})`, `Ads off (${n.adsTodo})`) : L('โฆษณาปิดอยู่', 'Ads off')}
              </Button>
            )}
            {stoppable && <Button variant="danger" onClick={stop}><Icon name="stop" size={14} />{L('หยุด', 'Stop')}</Button>}
          </div>
        )}
        {/* row2 (6205): Claim list · Claimed songs · Collab */}
        {idle && (
          <div className="mt-2 flex flex-wrap gap-2 [&>button]:grow">
            <Button data-view="claims" onClick={() => setView({ name: 'claims' })} disabled={!data}>
              <Icon name="queue" size={16} />
              {n?.hasScan ? L(`รายการ claim (${n.claims})`, `Claim list (${n.claims})`) : L('รายการ claim', 'Claim list')}
            </Button>
            <Button data-view="songs" onClick={() => setView({ name: 'songs' })} disabled={!data}
              title={L('เพลงและศิลปินที่เคยโดน claim ทุกช่อง', 'Songs and artists that have been claimed across all channels')}>
              <Icon name="music" size={16} />{L(`เพลงที่เคยโดน (${n?.songs ?? stored.songs})`, `Claimed songs (${n?.songs ?? stored.songs})`)}
            </Button>
            <Button data-view="collab" onClick={() => (data?.collabScan ? setView({ name: 'collab' }) : scan('collab'))} disabled={!data}
              title={L('เลือกคลิปที่อัปแล้ว แล้วเชิญช่องอื่นเป็นผู้ร่วมสร้าง', 'Pick uploaded videos and invite other channels as collaborators')}>
              <Icon name="collab" size={16} />Collab
            </Button>
          </div>
        )}
      </Section>
      <Section>
        {data && shown && <AutopilotSwitch data={data} state={shown} />}
        <div className={cn('flex flex-wrap gap-2', data && shown && 'mt-2.5')}>
          <Button data-view="settings" size="sm" onClick={() => setView({ name: 'settings' })} disabled={!data}><Icon name="sliders" size={14} />{L('ตั้งค่าลิขสิทธิ์', 'Copyright settings')}</Button>
          <Button data-view="tracklist" size="sm" onClick={() => setView({ name: 'tracklist', videoId: '' })} disabled={!data}><Icon name="note" size={14} />{L('แก้ tracklist', 'Fix tracklist')}</Button>
          <Button size="sm" onClick={() => void uploads()} title={L('ประวัติคลิปที่อัปผ่านสคริปต์นี้', 'History of videos uploaded with this script')}>
            <Icon name="history" size={14} />{L('ประวัติการอัป', 'Upload history')}
          </Button>
        </div>
      </Section>
      <Section>
        <ActivityLog open={logOpen} lines={log} onToggle={toggleLog} />
      </Section>
    </div>
  );
}
