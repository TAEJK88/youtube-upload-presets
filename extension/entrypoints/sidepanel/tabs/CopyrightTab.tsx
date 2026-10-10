import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { uploadsCsvRows, type UploadRecordLike } from '@/lib/claims/core';
import { L } from '@/lib/i18n';
import { claimsWrite, readClaims, watchClaims, type ClaimsData } from '@/lib/panel/claims-data';
import { downloadCsv } from '@/lib/panel/download';
import { Section } from '../fields';
import { Icon } from '../Icon';
import { useClaims, usePanel } from '../panel';
import { saveFailed } from '../save-failed';
import { ActivityLog } from './copyright/ActivityLog';
import { ClaimList } from './copyright/ClaimList';
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
    void readClaims(ch).then((d) => { if (alive) setData(d); }).catch((e) => console.error('[ytup] read copyright data', e));
    const off = watchClaims(ch, (d) => { if (alive) setData(d); });
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

const failed = (e: unknown) => {
  console.error('[ytup] copyright', e);
  toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
};

export function CopyrightTab() {
  const { send } = usePanel();
  const { state, live, log, shown } = useClaims();
  const data = useClaimsData(state?.channel ?? null);
  const stored = useClaimsGlobals();
  const [view, setView] = useState<CopyrightView>({ name: 'home' });
  const [openLog, setOpenLog] = useState<boolean | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const closed = useRef<CopyrightView['name'] | null>(null); // the view Close just left: its button takes focus back
  const home = () => {
    closed.current = view.name;
    setView({ name: 'home' });
  };
  // The bound tab moved to another channel: an open view was the old channel's (its video, its text).
  const ch = state?.channel ?? null;
  useEffect(() => setView({ name: 'home' }), [ch]);
  // A scan started here ended in the bound tab: open its list (showClaims() after scanClaims()).
  useEffect(() => {
    if (!shown) return;
    const next: CopyrightView = { name: shown.view };
    setView(next);
  }, [shown]);

  // Each view, and the tab on the way back, opens at its top (the pane scrolls: App's [data-pane-scroll]).
  const at = view.name + ':' + (view.name === 'tracklist' ? view.videoId : '');
  useEffect(() => {
    // Not while another panel tab shows (a scan can end and open its list then): the panes share the scroller.
    const scroller = root.current?.closest('[data-state="inactive"]') ? null : root.current?.closest('[data-pane-scroll]');
    if (scroller) scroller.scrollTop = 0;
    if (view.name === 'home' && closed.current) root.current?.querySelector<HTMLElement>(`[data-view="${closed.current}"]`)?.focus({ preventScroll: true });
    closed.current = null;
  }, [at]);

  const sub = !data || !state ? null
    : view.name === 'claims' ? <ClaimList data={data} state={state} onClose={home} onTracklist={(videoId) => setView({ name: 'tracklist', videoId })} />
    : view.name === 'songs' ? <Songs data={data} onClose={home} />
    : view.name === 'tracklist' ? <TracklistFix data={data} videoId={view.videoId} onPick={(videoId) => setView({ name: 'tracklist', videoId })} onClose={home} />
    : null;
  if (sub) return <div ref={root}>{sub}</div>;

  const s = live ?? state;
  const n = state?.counts;
  const busy = !!s && (s.busyRun || s.busyScan);
  const scan = () => void send('claims:scan', 'claims').catch(failed);
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
      {state && !state.english && (
        <div className="mb-3 rounded-[12px] border border-err/35 bg-err/[0.08] px-3 py-2 text-xs text-err">
          {L('⚠ Studio ตั้งเป็นภาษาไทยอยู่ — ส่วนตัด claim / เปิดโฆษณาอัตโนมัติต้องใช้ Studio ภาษาอังกฤษ (รูปโปรไฟล์ → Language → English) การสแกนใช้ได้ทุกภาษา', '⚠ Studio is set to Thai — auto claim trimming / ads need Studio in English (profile picture → Language → English). Scanning works in any language')}
        </div>
      )}
      <Section title={L('สถานะ', 'Status')} icon="shield">
        {s && <StatusCard s={s.status} />}
        {!busy && (
          // The side panel can be 320px wide: a button that doesn't fit beside its neighbour takes the next line.
          <div className="mt-2.5 flex flex-wrap gap-2 [&>button]:grow">
            <Button variant="go" onClick={scan} disabled={!state}><Icon name="scan" size={16} />{L('สแกน claim', 'Scan claims')}</Button>
            <Button data-view="claims" onClick={() => setView({ name: 'claims' })} disabled={!data}>
              <Icon name="queue" size={16} />
              {n?.hasScan ? L(`รายการ claim (${n.claims})`, `Claim list (${n.claims})`) : L('รายการ claim', 'Claim list')}
            </Button>
            <Button data-view="songs" className="basis-full" onClick={() => setView({ name: 'songs' })} disabled={!data}
              title={L('เพลงและศิลปินที่เคยโดน claim ทุกช่อง', 'Songs and artists that have been claimed across all channels')}>
              <Icon name="music" size={16} />{L(`เพลงที่เคยโดน (${n?.songs ?? stored.songs})`, `Claimed songs (${n?.songs ?? stored.songs})`)}
            </Button>
          </div>
        )}
      </Section>
      <Section>
        <div className="flex flex-wrap gap-2">
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
