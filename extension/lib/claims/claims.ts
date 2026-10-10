/* eslint-disable @typescript-eslint/no-explicit-any -- Studio's answers, as the userscript read them */
import { L } from '../i18n';
import { cachedCfg, chanLabel, getChannel } from '../studio/channel';
import { sleep } from '../studio/automation';
import { otherTabRunning, queue, running, uploadOf } from '../studio/queue-runner';
import { claimInfo, DEFAULTS, privacyOf, short } from './core';
import { count, load, save, write } from './store';
import type {
  AdsRow, AdsScan, Autopilot, ClaimRow, ClaimScan, ClaimsCfg, ClaimsCounts, ClaimsState, ClaimsStatus, ClaimsView, FollowUp, ResultEntry, Run, Songs,
} from './types';
import { yti } from './youtubei';

// The userscript's copyright module (user.js 4592–6357) as page code: its closure's variables
// are this module's. Reads come from the claims store (lib/claims/store.ts); writes go to the
// background as ops (D20). ycfg is ytcfg as refreshCfg last copied it from the MAIN world.
// CHANNEL_ID names the keys the data is stored under, and like every MAIN-world answer it is
// page data (main-ops.ts): only a real channel id is taken, anything else falls back to the
// address (currentChannel(), 4625).
const ycfg = (k: string): any => {
  const v = cachedCfg(k);
  return k === 'CHANNEL_ID' && !(typeof v === 'string' && /^UC[\w-]{22}$/.test(v)) ? undefined : v;
};

// The drawer's side of the module, now the side panel's: the Studio content script sets it
// (lib/claims/page.ts); tests set a recorder; until then nothing happens.
export interface ClaimsUi {
  show(view: ClaimsView): void; // showClaims() / showAds() / showCollab() after a scan
  status(): void; // renderStatus(): the state changed
  log(msg: string, type: string): void; // a line in the activity log
  toast(msg: string): void;
}
const quiet: ClaimsUi = { show() {}, status() {}, log() {}, toast() {} };
let cui: ClaimsUi = quiet;
export const setClaimsUi = (u: ClaimsUi | null) => { cui = u ?? quiet; };
const renderStatus = () => cui.status();

// The userscript's uploadBusy() (1723) looked at its own tab's queue, kept in memory and gone on
// reload. The queue is shared and stored now, so the copyright module asks it this way:
//  - a run in another Studio tab is that tab's (this tab's page changes wait for the lock instead);
//  - failed items don't hold copyright work back (they'd block it in every tab until removed);
//  - waiting and in-flight items do, as in the userscript: their upload needs the page.
// While it holds, the status card says so ("⏸ Waiting for the upload queue…").
const uploadBusy = () => running || (!otherTabRunning() && queue.some((i) => ['pending', 'uploading', 'review'].includes(i.status)));

// getCounts() (4646) counted the keys of a copy of the whole song history, every 3 s in every Studio tab.
const songCount = () => count('songHistory');

type ScanProg = { label: string; done: number; total: number };

// The userscript skips a video whose claims it can't read and stores the scan as complete (4785,
// 4823), over the scan before it. Its fetch had no time limit and read any answer; here the 30 s
// limit (D22) and the answer check (answers.ts) can fail every detail call, which would read as
// "0 claims". The stored scan stays the userscript's; the last log line and the status card say
// how many videos are missing from it.
let skipped = 0;
function detailsSkipped(claimed: number): void {
  if (skipped) log(L(`อ่านรายละเอียด claim ไม่ได้ ${skipped} จาก ${claimed} คลิป — ผลสแกนนี้ไม่ครบ`, `Couldn't read the claim details of ${skipped} of ${claimed} videos — this scan is incomplete`), 'err');
}

// @port-begin
  const cfg = (): ClaimsCfg => Object.assign({}, DEFAULTS, load('cfg', {}));
  const saveCfg = (c: ClaimsCfg) => save('cfg', c);
  const studioIsEnglish = () => /^en/i.test(document.documentElement.lang || 'en');
  function currentChannel(): string {
    const m = location.pathname.match(/\/channel\/(UC[\w-]{22})/);
    return ycfg('CHANNEL_ID') || (m && m[1]) || 'unknown';
  }
  const channelName = () => chanLabel(getChannel()) || currentChannel();
  const chGet = <T>(name: string, def: T, ch = currentChannel()): T => load(name + ':' + ch, def);
  const chSet = (name: string, val: unknown, ch = currentChannel()) => { invalidateCounts(); return save(name + ':' + ch, val); };
  const COUNTS_TTL = 3000;
  let countsAt = 0;
  let countsCache: ClaimsCounts | null = null;
  function invalidateCounts() { countsAt = 0; }
  function getCounts(): ClaimsCounts {
    if (countsCache && Date.now() - countsAt < COUNTS_TTL) return countsCache;
    const scan = chGet<ClaimScan | null>('claimScan', null);
    const adsScan = chGet<AdsScan | null>('adsScan', null);
    const adsResults = chGet<Record<string, ResultEntry>>('adsResults', {});
    countsCache = {
      hasScan: !!scan,
      scanDate: scan ? scan.date : '',
      claims: scan ? scan.rows.length : 0,
      claimVideos: scan ? new Set(scan.rows.map((r) => r.videoId)).size : 0,
      songs: songCount(),
      hasAdsScan: !!adsScan,
      adsTodo: adsScan ? adsScan.rows.filter((r) => !(adsResults[r.videoId] || {} as Partial<ResultEntry>).state).length : 0,
    };
    countsAt = Date.now();
    return countsCache;
  }
  let scanning = false;
  let scanProg: ScanProg | null = null;
  async function listVideos(mask: Record<string, unknown>, label: string) {
    const CH = currentChannel();
    const vids: any[] = [];
    let tok: string | undefined, pages = 0;
    do {
      const body: Record<string, unknown> = {
        filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
        order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50, mask,
      };
      if (tok) body.pageToken = tok;
      const j = await yti('creator/list_creator_videos', body);
      vids.push(...(j.videos || []));
      tok = j.nextPageToken;
      pages++;
      scanProg = { label: L(`${label} อ่านแล้ว ${vids.length} คลิป`, `${label}: read ${vids.length} videos`), done: 0, total: 0 };
      renderStatus();
      await sleep(300);
    } while (tok && pages < 400);
    return vids;
  }

  // คลิปที่ตั้งเวลาเผยแพร่ไว้แล้วในช่องนี้ (อ่านอย่างเดียว) -> [{ videoId, title, at }] เรียงตามเวลา
  // ตรวจกับ Studio จริง (ต.ค. 2026): scheduledPublishingDetails.scheduledPublishings[] = { scheduledTimeSeconds, action, status }
  // ดู 200 คลิปล่าสุดพอ: คลิปที่รอปล่อยเป็นของที่เพิ่งอัปทั้งนั้น
  async function listScheduled(): Promise<{ videoId: string; title: string; at: number }[] | null> {
    if (!ycfg('INNERTUBE_CONTEXT')) return null;
    const CH = currentChannel();
    const out: { videoId: string; title: string; at: number }[] = [];
    let tok: string | undefined, pages = 0;
    do {
      const body: Record<string, unknown> = {
        filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
        order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50,
        mask: { videoId: true, title: true, scheduledPublishingDetails: { all: true } },
      };
      if (tok) body.pageToken = tok;
      const j = await yti('creator/list_creator_videos', body);
      for (const v of j.videos || []) {
        for (const sp of (v.scheduledPublishingDetails || {}).scheduledPublishings || []) {
          const at = (+sp.scheduledTimeSeconds || 0) * 1000;
          if (/SCHEDULED$/.test(sp.status || '') && at > Date.now()) out.push({ videoId: v.videoId, title: v.title || '', at });
        }
      }
      tok = j.nextPageToken;
      pages++;
    } while (tok && pages < 4);
    return out.sort((a, b) => a.at - b.at);
  }
  async function scanClaims({ show = true }: { show?: boolean } = {}): Promise<ClaimRow[] | null> {
    if (scanning) return null;
    if (!ycfg('INNERTUBE_CONTEXT')) { log(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'Studio hasn\'t finished loading — try again in a few seconds'), 'warn'); return null; }
    scanning = true;
    scanProg = { label: L('กำลังอ่านรายการวิดีโอ…', 'Reading video list…'), done: 0, total: 0 };
    const CH = currentChannel();
    const chName = channelName();
    const own = cfg().ownNames.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    try {
      log(L('สแกน: กำลังอ่านรายการวิดีโอ…', 'Scan: reading video list…'));
      const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true, copyrightSummary: { all: true }, allRestrictions: { all: true } }, L('กำลังอ่านรายการวิดีโอ…', 'Reading video list…'));
      const claimed = vids.filter((v) =>
        +((v.copyrightSummary || {}).activeThirdPartyClaimsCount || 0) > 0 ||
        ((v.allRestrictions || {}).restrictions || []).some((r: any) => r.reason === 'VIDEO_RESTRICTION_REASON_COPYRIGHT'));
      log(L(`สแกน: ${claimed.length} จาก ${vids.length} คลิปมี claim — กำลังอ่านรายละเอียด…`, `Scan: ${claimed.length} of ${vids.length} videos have a claim — reading details…`));

      const rows: ClaimRow[] = [];
      skipped = 0;
      for (let i = 0; i < claimed.length; i++) {
        const v = claimed[i];
        const impacts = (((v.allRestrictions || {}).summary || {}).impacts || []).map(short)
          .map((x: string) => x.replace(/^(monetization|visibility|video) /, '')).join(', ');
        let j: any;
        try {
          j = await yti('creator/list_creator_received_claims', { videoId: v.videoId, criticalRead: false, includeLicensingOptions: false, isCreatorMusicV2: true });
        } catch (e: any) { log(`${v.title}: ${e.message}`, 'err'); skipped++; continue; }
        const owners: Record<string, string> = Object.create(null);
        (j.contentOwners || []).forEach((o: any) => { owners[o.contentOwnerId] = o.displayName; });
        const up = uploadOf(v.videoId);

        for (const c of j.receivedClaims || []) {
          const rec = claimInfo(c);
          const claimant = (c.contentOwnerIds || []).map((id: string) => owners[id] || id).join(', ');
          const artists = rec.artists.join(', ');
          let segs: [number, number][] = [];
          try {
            const m = await yti('copyright/get_creator_received_claim_matches', { videoId: v.videoId, channelId: CH, claimId: c.claimId });
            segs = (((m.matches || {}).claimMatches) || []).map((x: any) => x.videoSegment).filter(Boolean)
              .map((sg: any) => [(+sg.startMillis || 0) / 1000, (+sg.endMillis || 0) / 1000]);
          } catch (e: any) { log(L(`${v.title}: ช่วงเวลา — ${e.message}`, `${v.title}: time ranges — ${e.message}`), 'warn'); }
          if (!segs.length && c.matchDetails) {
            const st = +c.matchDetails.longestMatchStartTimeSeconds || 0;
            segs = [[st, st + (+c.matchDetails.longestMatchDurationSeconds || 0)]];
          }
          const opts = ((c.nontakedownClaimActions || {}).options || []).map(short);
          // แก้บัคเดิม: เดิมอ่าน rec.recordLabel ซึ่งไม่มีอยู่จริง ทำให้ label ว่างตลอด
          const hay = (artists + ' ' + claimant + ' ' + rec.label).toLowerCase();
          rows.push({
            videoId: v.videoId, video: v.title, privacy: privacyOf(v.privacy), length: +v.lengthSeconds || 0,
            claimId: c.claimId, song: rec.title || '(ไม่ทราบชื่อ)', artists, label: rec.label, claimant,
            type: short(c.type), status: short(c.status), impact: impacts, segments: segs,
            claimedSec: segs.reduce((a, sg) => a + (sg[1] - sg[0]), 0),
            canTrim: opts.includes('trim'), options: opts.join(', '),
            own: own.some((n) => hay.includes(n)), hasImpact: !!impacts,
            publishAt: up && up.publishAt ? up.publishAt : 0,
          });
          await sleep(250);
        }
        scanProg = { label: L(`อ่านรายละเอียด claim ${i + 1} / ${claimed.length}: ${v.title}`, `Reading claim details ${i + 1} / ${claimed.length}: ${v.title}`), done: i + 1, total: claimed.length };
        renderStatus();
        await sleep(300);
      }

      chSet('claimScan', { date: new Date().toISOString(), total: vids.length, rows, channel: CH, channelName: chName }, CH);
      recordSongs(rows, chName);
      log(L(`สแกนเสร็จ ✓ ${chName}: ${rows.length} claim ใน ${claimed.length} คลิป`, `Scan complete ✓ ${chName}: ${rows.length} claims in ${claimed.length} videos`), 'ok');
      flash(L('สแกนเสร็จแล้ว', 'Scan complete'), L(`${rows.length} claim ใน ${claimed.length} จาก ${vids.length} คลิป`, `${rows.length} claims in ${claimed.length} of ${vids.length} videos`));
      detailsSkipped(claimed.length);
      if (show) cui.show('claims');
      return rows;
    } catch (e: any) {
      log(L('สแกนไม่สำเร็จ: ', 'Scan failed: ') + e.message, 'err');
      return null;
    } finally {
      scanning = false;
      scanProg = null;
      renderStatus();
    }
  }
  const getSongs = (): Songs => load('songHistory', {});
  const ADS_STEPS = () => [L('เปิดคลิป', 'Open video'), L('แก้สถานะ', 'Edit status'), L('เลือก On', 'Select On'), L('ตอบคำถาม & Save', 'Answer questions & Save'), L('ตรวจผล', 'Verify')];
  let adsScanning = false;
  let adsStage = { idx: -1, detail: '' };
  const setAdsStage = (idx: number, detail = '') => { adsStage = { idx, detail }; renderStatus(); };
  const getAdsRun = (): Run | null => chGet('adsRun', null);
  const setAdsRun = (r: Run | null) => chSet('adsRun', r);
  async function scanAds({ show = true }: { show?: boolean } = {}): Promise<AdsRow[] | null> {
    if (adsScanning || scanning) return null;
    if (!ycfg('INNERTUBE_CONTEXT')) { log(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'Studio hasn\'t finished loading — try again in a few seconds'), 'warn'); return null; }
    adsScanning = true;
    scanProg = { label: L('กำลังเช็กคลิปที่ปิดโฆษณา…', 'Checking videos with ads off…'), done: 0, total: 0 };
    try {
      const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true, monetization: { all: true } }, L('กำลังเช็กคลิปที่ปิดโฆษณา…', 'Checking videos with ads off…'));
      const rows = vids.filter((v) => /_OFF$/.test(((v.monetization || {}).adMonetization || {}).userSetMonetization || ''))
        .map((v) => {
          const eff = ((v.monetization || {}).adMonetization || {}).effectiveStatus || '';
          return { videoId: v.videoId, video: v.title, privacy: privacyOf(v.privacy), length: +v.lengthSeconds || 0, ineligible: /INELIGIBLE/.test(eff), status: short(eff) };
        });
      chSet('adsScan', { date: new Date().toISOString(), total: vids.length, rows });
      const ok = rows.filter((r) => !r.ineligible).length;
      log(L(`💰 ${rows.length} จาก ${vids.length} คลิปปิดโฆษณาอยู่ (${ok} คลิปเปิดได้เลย)`, `💰 ${rows.length} of ${vids.length} videos have ads off (${ok} can be turned on now)`), 'ok');
      flash(L('เช็กโฆษณาเสร็จแล้ว', 'Ads check complete'), L(`${rows.length} คลิปปิดโฆษณา · ${ok} คลิปพร้อมเปิด`, `${rows.length} videos with ads off · ${ok} ready to turn on`));
      if (show) cui.show('ads');
      return rows;
    } catch (e: any) {
      log(L('เช็กโฆษณาไม่สำเร็จ: ', 'Ads check failed: ') + e.message, 'err');
      return null;
    } finally {
      adsScanning = false;
      scanProg = null;
      renderStatus();
    }
  }
  const COLLAB_STEPS = () => [L('เปิดคลิป', 'Open video'), L('เชิญ', 'Invite'), L('บันทึก', 'Save')];
  let collabScanning = false;
  let collabBusy = false;
  let collabStage = { idx: -1, detail: '' };
  const setCollabStage = (idx: number, detail = '') => { collabStage = { idx, detail }; renderStatus(); };
  const getCollabRun = (): Run | null => chGet('collabRun', null);
  const setCollabRun = (r: Run | null) => chSet('collabRun', r);
  const collabLinks = (): Record<string, string> => chGet('collabLinks', {}); // handle -> link
  async function scanCollab(): Promise<void> {
    if (collabScanning || scanning || adsScanning) return;
    if (!ycfg('INNERTUBE_CONTEXT')) { log(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', 'Studio hasn\'t finished loading — try again in a few seconds'), 'warn'); return; }
    collabScanning = true;
    try {
      const vids = await listVideos({ videoId: true, title: true, privacy: true, lengthSeconds: true }, L('กำลังอ่านรายการคลิป…', 'Reading video list…'));
      const rows = vids.map((v) => ({ videoId: v.videoId, video: v.title, privacy: privacyOf(v.privacy), length: +v.lengthSeconds || 0 }));
      chSet('collabScan', { date: new Date().toISOString(), total: rows.length, rows });
      log(L(`🤝 อ่านรายการแล้ว ${rows.length} คลิป`, `🤝 Loaded ${rows.length} videos`), 'ok');
      cui.show('collab');
    } catch (e: any) {
      log(L('อ่านรายการคลิปไม่สำเร็จ: ', 'Could not read the video list: ') + e.message, 'err');
    } finally {
      collabScanning = false;
      scanProg = null;
      renderStatus();
    }
  }
  const getRun = (): Run | null => chGet('trimRun', null);
  const setRun = (r: Run | null) => chSet('trimRun', r);
  const fuGet = (): FollowUp => chGet('followUp', {});
  const fuSet = (v: FollowUp) => chSet('followUp', v);
  const fuCount = () => Object.values(fuGet()).reduce((a, v) => a + v.pending.length, 0);
  let fuBusy = false;
  let fuNext = 0;
  const getAP = (): Autopilot => chGet('autopilot', { on: false, next: 0 });
  const setAP = (v: Autopilot) => chSet('autopilot', v);
  let apBusy = false;
  const TRIM_STEPS = () => [L('เปิดคลิป', 'Open video'), L('เช็ก claim', 'Check claim'), 'Take action', L('หน้าตัด', 'Trim editor'), 'Save', L('ยืนยัน', 'Confirm')];
  let trimStage = { idx: -1, detail: '' };
  let transient: (ClaimsStatus & { until: number }) | null = null;
  let workerHere = true;
  const setTrimStage = (idx: number, detail = '') => { trimStage = { idx, detail }; renderStatus(); };
  function flash(title: string, detail = '', kind = 'ok', ms = 8000) {
    const ic = { ok: '✅', err: '⚠️', wait: '⏳', busy: '⚙️' }[kind as 'ok'] || 'ℹ️';
    transient = { icon: ic, title, detail, kind, until: Date.now() + ms };
    renderStatus();
  }
  const dur = (ms: number) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? L(`${m} นาที`, `${m} min`) : L(`${Math.floor(m / 60)} ชม. ${m % 60} นาที`, `${Math.floor(m / 60)} h ${m % 60} min`);
  };
  function computeStatus(): ClaimsStatus {
    const run = getRun();
    if (collabScanning) return { icon: '🤝', kind: 'busy', title: L('กำลังอ่านรายการคลิปสำหรับ Collab', 'Reading videos for Collab'), detail: (scanProg || {} as Partial<ScanProg>).label || '', progress: null };
    if (scanning || adsScanning) {
      const p = scanProg || { label: L('กำลังเริ่ม…', 'Starting…') } as ScanProg;
      return { icon: adsScanning ? '💰' : '🔍', kind: 'busy', title: adsScanning ? L('กำลังหาคลิปที่ปิดโฆษณา', 'Finding videos with ads off') : L('กำลังสแกน claim ของช่องนี้', 'Scanning this channel\'s claims'),
        detail: p.label, progress: p.total ? p.done / p.total : null };
    }
    const crun = getCollabRun();
    if (crun && crun.active) {
      const fin = crun.items.filter((i) => i.state !== 'pending').length;
      const cur = crun.items.find((i) => i.state === 'pending');
      return { icon: '🤝', kind: 'busy', title: L(`กำลังเชิญ Collab คลิป ${Math.min(fin + 1, crun.items.length)} จาก ${crun.items.length}`, `Inviting collaborators: video ${Math.min(fin + 1, crun.items.length)} of ${crun.items.length}`),
        detail: cur ? cur.video : L('กำลังจบ…', 'Finishing…'), progress: crun.items.length ? fin / crun.items.length : 0,
        steps: COLLAB_STEPS(), stepIdx: workerHere ? collabStage.idx : -1, stepDetail: workerHere ? collabStage.detail : L('↪ ทำงานอยู่ในแท็บ Studio อื่น', '↪ Running in another Studio tab') };
    }
    const arun = getAdsRun();
    if (arun && arun.active) {
      const fin = arun.items.filter((i) => i.state !== 'pending').length;
      const cur = arun.items.find((i) => i.state === 'pending');
      return { icon: '💰', kind: 'busy', title: L(`กำลังเปิดโฆษณา คลิป ${Math.min(fin + 1, arun.items.length)} จาก ${arun.items.length}`, `Turning on ads: video ${Math.min(fin + 1, arun.items.length)} of ${arun.items.length}`),
        detail: cur ? cur.video : L('กำลังจบ…', 'Finishing…'), progress: arun.items.length ? fin / arun.items.length : 0,
        steps: ADS_STEPS(), stepIdx: workerHere ? adsStage.idx : -1, stepDetail: workerHere ? adsStage.detail : L('↪ ทำงานอยู่ในแท็บ Studio อื่น', '↪ Running in another Studio tab') };
    }
    if (run && run.active) {
      const todo = run.items.filter((i) => i.state !== 'later');
      const finished = todo.filter((i) => i.state !== 'pending').length;
      const cur = todo.find((i) => i.state === 'pending');
      return { icon: '✂️', kind: 'busy', title: L(`กำลังตัด claim ${Math.min(finished + 1, todo.length)} จาก ${todo.length}`, `Trimming claim ${Math.min(finished + 1, todo.length)} of ${todo.length}`),
        detail: cur ? `${cur.video} — ${cur.song}` : L('กำลังจบ…', 'Finishing…'), progress: todo.length ? finished / todo.length : 0,
        steps: TRIM_STEPS(), stepIdx: workerHere ? trimStage.idx : -1, stepDetail: workerHere ? trimStage.detail : L('↪ ทำงานอยู่ในแท็บ Studio อื่น', '↪ Running in another Studio tab') };
    }
    if (transient && transient.until > Date.now()) return transient;
    if (fuBusy) return { icon: '🔄', kind: 'busy', title: L('กำลังเช็กว่า YouTube ตัดครั้งก่อนเสร็จหรือยัง…', 'Checking whether YouTube finished the previous trim…'), detail: '' };
    if (apBusy) return { icon: '🤖', kind: 'busy', title: L('Auto-pilot กำลังเริ่มรอบใหม่…', 'Auto-pilot starting a new cycle…'), detail: '' };
    const waiting = fuCount();
    if (waiting) {
      const vids = Object.keys(fuGet()).length;
      return { icon: '⏳', kind: 'wait', title: L('รอ YouTube ประมวลผลการตัด', 'Waiting for YouTube to process trims'),
        detail: L(`รอตัดอีก ${waiting} claim ใน ${vids} คลิป · เช็กครั้งถัดไปในอีก ${dur(fuNext - Date.now())}`, `${waiting} claims left to trim in ${vids} videos · next check in ${dur(fuNext - Date.now())}`) };
    }
    const ap = getAP();
    if (ap.on) return { icon: '🤖', kind: 'ok', title: L('Auto-pilot เปิดอยู่', 'Auto-pilot is on'), detail: uploadBusy() ? L('⏸ รอคิวอัปโหลดเสร็จ', '⏸ Waiting for the upload queue to finish') : L(`สแกน + ตัดครั้งถัดไปในอีก ${dur((ap.next || 0) - Date.now())}`, `Next scan + trim in ${dur((ap.next || 0) - Date.now())}`) };
    const n = getCounts();
    if (n.hasScan) {
      return { icon: '✓', kind: 'idle', title: L('พร้อม', 'Ready'), detail: L(`สแกนล่าสุด ${dur(Date.now() - new Date(n.scanDate).getTime())} ที่แล้ว: ${n.claims} claim ใน ${n.claimVideos} คลิป`, `Last scan ${dur(Date.now() - new Date(n.scanDate).getTime())} ago: ${n.claims} claims in ${n.claimVideos} videos`) };
    }
    return { icon: '✓', kind: 'idle', title: L('พร้อม', 'Ready'), detail: L('กด "สแกน claim" เพื่อเช็กช่องนี้', 'Click "Scan claims" to check this channel') };
  }
  function log(msg: string, type = '') {
    console.log('[Upload Studio]', msg);
    if (type === 'err') flash(L('มีเรื่องต้องดู', 'Needs attention'), msg, 'err', 12000);
    cui.log(msg, type);
  }
// @port-end

// recordSongs() (5069–5091) is a background op now (songs.ts); the tab logs what it added.
function recordSongs(rows: ClaimRow[], chName: string): void {
  const before = Object.keys(getSongs()).length;
  write({ op: 'songs', songs: { fn: 'record', rows, chName, now: new Date().toISOString() } });
  invalidateCounts();
  const added = Object.keys(getSongs()).length - before;
  if (added) log(L(`🎵 เพิ่มเพลงใหม่ ${added} เพลงในประวัติ`, `🎵 Added ${added} new songs to history`), 'ok');
}

// Partial writes, one op each (D20): what the userscript did with chGet → change → chSet.
const chMerge = (name: string, entries: Record<string, unknown>, ch = currentChannel()) => {
  invalidateCounts();
  write({ op: 'merge', key: name + ':' + ch, entries });
};
const chList = (name: string, d: { add?: string[]; del?: string[] }, ch = currentChannel()) => {
  invalidateCounts();
  write({ op: 'list', key: name + ':' + ch, ...d });
};
const chRunItem = (name: string, by: 'key' | 'videoId', id: string, state: string, msg: string, onlyActive = false, ch = currentChannel()) =>
  write({ op: 'runItem', key: name + ':' + ch, by, id, state, msg, onlyActive });

// What renderStatus() (6219–6256) read, for the side panel (claims:state / claims:view).
export function claimsState(): ClaimsState {
  const active = (r: Run | null) => !!(r && r.active);
  return {
    channel: currentChannel(),
    channelName: channelName(),
    ready: !!ycfg('INNERTUBE_CONTEXT'),
    english: studioIsEnglish(),
    uploadBusy: uploadBusy(),
    status: computeStatus(),
    counts: getCounts(),
    busyRun: active(getRun()) || active(getAdsRun()) || active(getCollabRun()),
    busyScan: scanning || adsScanning || collabScanning,
    waiting: fuCount(),
    workerHere,
  };
}

// The FAB's activity (activity(), 4089–4091): a broken copyright module must not take the
// upload's progress down with it.
export function claimsStatus(): ClaimsStatus | null {
  try {
    return computeStatus();
  } catch (e) {
    console.error('[ytup] copyright status', e);
    return null;
  }
}

// claims:scan from the panel's buttons (UI.scanBtn 6188; UI.adsBtn / UI.collabBtn 6192 / 6195
// when there is no list yet). The panel opens an existing list itself.
export function startScan(what: unknown): void {
  if (what === 'claims') void scanClaims();
  else if (what === 'ads') void scanAds();
  else if (what === 'collab') void scanCollab();
}

export {
  cfg, saveCfg, studioIsEnglish, currentChannel, channelName, chGet, chSet, chMerge, chList, chRunItem, invalidateCounts, getCounts,
  scanning, scanProg, listVideos, listScheduled, scanClaims, getSongs, adsScanning, scanAds, collabScanning, collabBusy, scanCollab,
  getRun, setRun, getAdsRun, setAdsRun, getCollabRun, setCollabRun, collabLinks, fuGet, fuSet, fuCount, fuBusy, fuNext,
  getAP, setAP, apBusy, trimStage, adsStage, collabStage, workerHere, setTrimStage, setAdsStage, setCollabStage, flash, dur,
  computeStatus, log,
};
