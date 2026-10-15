import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { uploadsCsvRows, type UploadRecordLike } from '@/lib/claims/core';
import type { ClaimsState } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import { claimsWrite, watchClaims, type ClaimsData } from '@/lib/panel/claims-data';
import { downloadCsv } from '@/lib/panel/download';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// The drawer's "ลิขสิทธิ์" pane (buildPane 6183–6216, renderStatus 6219–6256), now the Tools tab:
// each tool (the drawer's modals, D23) has its own sub-tab. Status and counts come from the Studio
// tab (useClaims, D24); lists and results from storage, for the channel that tab is on.
export type ToolTab = 'claims' | 'songs' | 'tracklist' | 'ads' | 'collab' | 'settings';

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
  const { send, sendTo, runner, target, link } = usePanel();
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
  const [tool, setTool] = useState<ToolTab>('claims');
  const [videoId, setVideoId] = useState(''); // the tracklist being fixed; '' shows the picker
  const [cancels, setCancels] = useState(0); // Cancel: the settings form starts again from storage
  const [openLog, setOpenLog] = useState<boolean | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // A different real channel (or another tab): an open tool was the old one's (its video, its text).
  useEffect(() => { setTool('claims'); setVideoId(''); }, [ch]);
  // A scan started here ended in the bound tab: open its list (showClaims() after scanClaims()).
  useEffect(() => { if (opened) setTool(opened.view); }, [opened]);
  const tracklist = (id: string) => { setVideoId(id); setTool('tracklist'); };

  // Each tool opens at its top (the pane scrolls: App's [data-pane-scroll]).
  const at = tool + ':' + (tool === 'tracklist' ? videoId : '');
  useEffect(() => {
    // Not while another panel tab shows (a scan can end and open its list then): the panes share the scroller.
    const scroller = root.current?.closest('[data-state="inactive"]') ? null : root.current?.closest('[data-pane-scroll]');
    if (scroller) scroller.scrollTop = 0;
  }, [at]);

  // The card and Stop follow the tab that works (`live`): another tab's trim holds the lock, but
  // scans take none (D26).
  // A tab without its script (for a moment in a slow load, or for good): what its old page last
  // said is not shown as its card or counts (4a m1); the views above keep `shown`.
  const here = link === 'noScript' ? state : shown;
  const s = live ?? here;
  const n = here?.counts;
  const idle = !here?.busyRun && !here?.busyScan; // renderStatus()'s row visibility (6251)
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
  const ready = !!data && !!shown;
  const scanButton = (what: 'ads' | 'collab', label: string, hint: string) => (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-fg3">{hint}</div>
      <Button variant="go" onClick={() => scan(what)} disabled={!idle}><Icon name="scan" size={16} />{label}</Button>
    </div>
  );
  const tools: [ToolTab, string, string][] = [
    ['claims', n?.hasScan ? L(`ลิขสิทธิ์ (${n.claims})`, `Claims (${n.claims})`) : L('ลิขสิทธิ์', 'Claims'), 'shield'],
    ['songs', L(`เพลง (${n?.songs ?? stored.songs})`, `Songs (${n?.songs ?? stored.songs})`), 'music'],
    ['tracklist', L('แก้ tracklist', 'Tracklist'), 'note'],
    ['ads', n?.hasAdsScan ? L(`โฆษณา (${n.adsTodo})`, `Ads (${n.adsTodo})`) : L('โฆษณา', 'Ads'), 'paid'],
    ['collab', 'Collab', 'collab'],
    ['settings', L('ตัวเลือก', 'Options'), 'sliders'],
  ];
  return (
    <div ref={root}>
      {shown && !shown.english && (
        <div className="mb-3 rounded-[12px] border border-err/35 bg-err/[0.08] px-3 py-2 text-xs text-err">
          {L('⚠ Studio ตั้งเป็นภาษาไทยอยู่ — ส่วนตัด claim / เปิดโฆษณาอัตโนมัติต้องใช้ Studio ภาษาอังกฤษ (รูปโปรไฟล์ → Language → English) การสแกนใช้ได้ทุกภาษา', '⚠ Studio is set to Thai — auto claim trimming / ads need Studio in English (profile picture → Language → English). Scanning works in any language')}
        </div>
      )}
      <Section title={L('สถานะ', 'Status')} icon="shield">
        {s && <StatusCard s={s.status} />}
        {stoppable && <Button variant="danger" className="mt-2.5 w-full" onClick={stop}><Icon name="stop" size={14} />{L('หยุด', 'Stop')}</Button>}
      </Section>
      <Tabs className="mt-[22px]" value={tool} onValueChange={(v) => setTool(v as ToolTab)}>
        {/* Six tools in a 320px panel: two rows of three. */}
        <TabsList aria-label={L('เครื่องมือ', 'Tools')} className="mb-3 grid-cols-3">
          {tools.map(([k, label, icon]) => (
            <TabsTrigger key={k} value={k} disabled={k !== 'claims' && !ready} className="min-w-0 px-1 text-[12.5px] disabled:cursor-default disabled:opacity-50">
              <Icon name={icon} size={14} /><span className="truncate">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="claims" className="flex flex-col gap-3">
          <Button variant="go" onClick={() => scan('claims')} disabled={!idle || !here}><Icon name="scan" size={16} />{L('สแกน claim', 'Scan claims')}</Button>
          {data && shown && <AutopilotSwitch data={data} state={shown} />}
          {data && shown && <ClaimList data={data} state={shown} onTracklist={tracklist} />}
        </TabsContent>
        {data && shown && <>
          <TabsContent value="songs"><Songs data={data} /></TabsContent>
          <TabsContent value="tracklist">
            <TracklistFix data={data} videoId={videoId} onPick={tracklist} onClose={() => setVideoId('')} />
          </TabsContent>
          <TabsContent value="ads">
            {data.adsScan ? <AdsView data={data} state={shown} />
              : scanButton('ads', L('เช็กคลิปที่ปิดโฆษณา', 'Check for ads off'), L('หาคลิปที่ปิดโฆษณาแล้วเปิดให้', 'Find videos with ads off and turn them on'))}
          </TabsContent>
          <TabsContent value="collab">
            {data.collabScan ? <CollabView data={data} state={shown} />
              : scanButton('collab', L('อ่านรายการคลิป', 'Read video list'), L('เลือกคลิปที่อัปแล้ว แล้วเชิญช่องอื่นเป็นผู้ร่วมสร้าง', 'Pick uploaded videos and invite other channels as collaborators'))}
          </TabsContent>
          <TabsContent value="settings">
            {/* Save and Reset change the stored cfg: the form starts again from what was stored. */}
            <CopyrightSettings key={`${cancels}:${JSON.stringify(data.cfg)}`} data={data} onClose={() => setCancels((k) => k + 1)} />
          </TabsContent>
        </>}
      </Tabs>
      <Section>
        <ActivityLog open={logOpen} lines={log} onToggle={toggleLog} />
        <Button size="sm" className="mt-2.5" onClick={() => void uploads()} title={L('ประวัติคลิปที่อัปผ่านสคริปต์นี้', 'History of videos uploaded with this script')}>
          <Icon name="history" size={14} />{L('ประวัติการอัป', 'Upload history')}
        </Button>
      </Section>
    </div>
  );
}
