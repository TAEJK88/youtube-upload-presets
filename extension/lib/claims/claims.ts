/* eslint-disable @typescript-eslint/no-explicit-any -- Studio's answers, as the userscript read them */
import { inviteOutcome, parseHandles } from '../collab';
import { L, locale } from '../i18n';
import { cachedCfg, chanLabel, getChannel } from '../studio/channel';
import { clickByText, clickIn, shownDialog, sleep as sleepFor, waitFor as waitUntil } from '../studio/automation';
import { inviteCollaborators } from '../studio/collab';
import { otherTabRunning, queue, running, uploadOf } from '../studio/queue-runner';
import { SEL } from '../studio/sel';
import { load as loadState, settings } from '../studio/state';
import { TXT } from '../studio/txt';
import { claimInfo, DEFAULTS, privacyOf, short, songNorm } from './core';
import { count, load, save, write } from './store';
import type {
  AdsRow, AdsScan, Autopilot, ClaimRow, ClaimScan, ClaimsCfg, ClaimsCounts, ClaimsState, ClaimsStatus, ClaimsView, FollowUp, ResultEntry, Run, RunItem, Songs,
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

// A trim run's item (startTrimRun 5707) and what a run is started from (a scan's row, or fuCheck's 5807).
type TrimItem = RunItem & { key: string; claimId: string; song: string };
type TrimPick = { videoId: string; claimId: string; song: string; video: string };

// The userscript's tab lease (5043–5062) has two parts now (4a D21, D26): the channel's worker
// lease, held in the background (one tab per channel runs Auto-pilot, follow-ups and run steps),
// and the automation lock, taken right before a step changes pages. The content script wires
// both to the background; tests wire a fake.
interface ClaimsLock {
  worker(ch: string, force: boolean): Promise<boolean>;
  acquire(): Promise<boolean>;
  release(): void;
  holds(): Promise<boolean>;
}
// Until the content script has wired it, nothing is granted: no tick may act on a guess.
let lockApi: ClaimsLock = { worker: async () => false, acquire: async () => false, release: () => {}, holds: async () => false };
// Call 34 (approved 2026-10-10): asked every 10 s, an answer trusted for 15 s. A closed worker tab's lease is
// dropped at once, so another tab on the channel takes over at its next ask: about 10–15 s. A hung tab: 20 s.
const WORKER_RENEW = 15_000; // an answer is trusted this long: under the lease's 20 s (runner-lock LEASE_STALE)
let workerMine = false; // the background's last answer for this tab and channel
let workerCh = '';
let workerAt = 0;
let lockMine = false; // this tab holds the automation lock for 'claims'
let lockUnsure = false; // …or may: asked again at the next idle tick (recheckLock)
export const setClaimsLock = (l: ClaimsLock) => {
  lockApi = l;
  workerMine = false;
  workerCh = '';
  workerAt = 0;
  workerAnswerAt = 0;
  lockMine = false;
  lockUnsure = false;
  unknownSince = 0;
  settledHere.clear(); // a new wiring is a new page (tests: runs started in the same millisecond)
};

// isWorker(force): is this tab the channel's worker? The background's answer, never older than
// WORKER_RENEW: the lease goes stale after 20 s without a renewal (runner-lock LEASE_STALE), and
// an old "yes" could outlive it (4a T4 review r2). Asked again every WORKER_ASK (10 s), so
// in normal running the answer is always fresh; when it isn't (the service worker was slow, the
// first tick of a page), the tab is not the worker until the answer comes. An idle tab does not
// ask on every 0.8 s tick; while a step, a cycle or a follow-up check is busy the tick asks with
// `force` every time, as the userscript wrote its lease on every tick (the background writes the
// lease at most every 5 s). Never asked while the channel is 'unknown' (4a T4 review m8): that
// lease would name no channel. An ask that fails is "no", and drops an earlier "yes".
// `force` takes the lease, as the userscript's did: a run started from this tab, a busy tab, and
// the tab that holds the job for an active run (holdsRun). Without the last one the lease and the
// lock can end up in two tabs — this one's lease lapsed while it was hidden or loading a step's
// page — and then neither moves the run: the other tab is the worker and is refused the lock,
// this one holds the lock and is never the worker. Only one tab can hold the lock, so two tabs
// never both force for it.
const WORKER_ASK = 10_000; // asked this often: well inside both limits, and not a message every few ticks
let workerAnswerAt = 0; // when the background last answered for workerCh
function askWorker(ch: string, force: boolean): Promise<boolean> {
  workerCh = ch;
  workerAt = Date.now();
  return lockApi.worker(ch, force).then(
    (v) => {
      if (workerCh === ch) {
        workerMine = v;
        workerAnswerAt = Date.now();
      }
      return v;
    },
    () => {
      if (workerCh === ch) workerMine = false;
      return false;
    },
  );
}
// A tick that found its answer too old ticks again when the new one is "yes": a hidden tab's
// timers run once a minute (Chrome, after five minutes), so every tick there finds an old answer,
// and would never work on one (Auto-pilot, follow-up checks). The userscript read and took its
// lease inside the tick.
const workerTrusted = () => workerMine && Date.now() - workerAnswerAt <= WORKER_RENEW;
function isWorker(force = false): boolean {
  const ch = currentChannel();
  if (ch === 'unknown') return false;
  if (ch !== workerCh) workerMine = false;
  if (force || ch !== workerCh || Date.now() - workerAt > WORKER_ASK) {
    const late = !force && !workerTrusted();
    void askWorker(ch, force || holdsRun())
      .then((mine) => { if (mine && late) claimsTick(); })
      .catch((e) => console.error('[ytup] copyright tick', e));
    if (force) {
      workerMine = true;
      workerAnswerAt = Date.now();
    }
  }
  return workerTrusted();
}
// Right before a step changes pages (trimStep / adsStep / collabStep): the automation lock, so two
// tabs never drive Studio at once (4a D21). Refused: the step waits, and its card says why.
async function claimLock(): Promise<boolean> {
  lockMine = await lockApi.acquire().catch(() => false);
  return lockMine;
}
const lockWait = () => L('⏸ รอแท็บ Studio อื่นทำงานเสร็จก่อน (ต้องเปลี่ยนหน้า)', '⏸ Waiting for another Studio tab to finish (page change needed)');
const runActive = () => [getRun(), getAdsRun(), getCollabRun()].some((r) => !!(r && r.active));
const holdsRun = () => lockMine && runActive();
// After each tick: let the job go once no run needs this tab any more, and also while its run
// can only wait for the upload queue. The lock is one for all Studio tabs: held by a waiting run
// it would keep every other tab from starting the queue or a copyright job (and the queue it
// waits for may be another tab's to start). When the queue is clear the tick's step asks again.
// Not under a step that is still clicking, and not while the channel is 'unknown' (ytcfg is late
// on a step's new page): no run is found under that name, which is not "no run left". A page
// that stays 'unknown' lets go after 30 s all the same, or it would keep the lock from every tab
// for as long as it is open; if its run turns up later, the step asks again.
const UNKNOWN_HOLD_MS = 30_000;
let unknownSince = 0;
function settleLock(): void {
  if (!lockMine) return recheckLock();
  if (trimBusy || adsBusy || collabBusy || trimStarting) return;
  if (currentChannel() !== 'unknown') unknownSince = 0;
  else if (Date.now() - (unknownSince ||= Date.now()) < UNKNOWN_HOLD_MS) return;
  if (runActive() && !uploadBusy()) return;
  lockMine = false;
  lockUnsure = true;
  lockApi.release();
}
// runner:release is sent and not awaited, and at startup runner:holds may not have answered: in
// both cases the background may hold the job for this tab while the tab thinks it doesn't, until
// the tab closes. So the tab asks once more at an idle tick; a "yes" is let go by the next one.
function recheckLock(): void {
  if (!lockUnsure || trimBusy || adsBusy || collabBusy) return;
  lockUnsure = false;
  void lockApi.holds().then((held) => { if (held) lockMine = true; }, () => { lockUnsure = true; });
}
// The background answers in milliseconds; the content script waits for these before it mounts
// the FAB and wires the queue, so each wait has a limit.
const LOCK_ANSWER_MS = 5000;
function within<T, F>(p: Promise<T>, fallback: F): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<F>((resolve) => { timer = setTimeout(() => resolve(fallback), LOCK_ANSWER_MS); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
// At startup: is this tab the channel's worker, and does a page back from its own reload mid-run
// still hold the job (D21)? Asked before the first tick, so a new tab never acts on a guess.
export async function initClaimsLock(): Promise<void> {
  const ch = currentChannel();
  if (ch !== 'unknown') await within(askWorker(ch, false), false);
  const held = await within(lockApi.holds().catch(() => false), null);
  lockMine = held === true;
  lockUnsure = held === null;
  if (ch !== 'unknown' && !workerMine && holdsRun()) await within(askWorker(ch, true), false);
}
// A page restored from the back/forward cache resumes a step where it was frozen, with the lock it
// asked for before: meanwhile this tab's next page, or another tab, may have gone on with the run,
// and the next click here could be "Confirm changes". It starts over instead (as the queue does,
// queue-sync watchLockLifecycle): the reloaded page asks for the job and the lease afresh, and
// the item, still pending, goes through trimOne's own check with YouTube.
// Between the reload and the document going away the page still runs, so a page that was hidden
// for the cache (`left`, set on pagehide, before the freeze) never goes on by itself either: every
// click of the ported steps comes after a sleep() or a waitFor(), which are this module's here,
// and one that ends after the page left never returns. (inviteCollaborators has its own waits in
// lib/studio/collab.ts; for those there is the reload.) A scan, a cycle or a follow-up check caught
// that way would wait for ever, so the restored page reloads for those too.
let left = false;
const never = new Promise<never>(() => {});
const sleep = (ms: number) => sleepFor(ms).then(() => (left ? never : undefined));
const waitFor: typeof waitUntil = (fn, timeout, step) => waitUntil(fn, timeout, step).then((v) => (left ? never : v));
export function installBackGuard(reload: () => void = () => location.reload()): () => void {
  const hide = (e: PageTransitionEvent) => { if (e.persisted) left = true; };
  // Back with something in flight: start over. Back idle: the page stays, and works again
  // (`left` kept would end every later wait of this module in nothing: a scan stuck for good).
  const back = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    if (lockMine || trimBusy || adsBusy || collabBusy || approving || scanning || adsScanning || collabScanning || apBusy || fuBusy) reload();
    else left = false;
  };
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', back);
  return () => {
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', back);
  };
}

// chainAcceptInvites() switches channel through the channel switcher (lib/channel-switch.ts).
// Its own check, uploadBusy(), leaves a queue that runs in another tab to that tab; the switch
// changes the channel for every Studio tab, so it is not done under that upload either (a Stop in
// a tab that was waiting for the lock can end a run with invites done while another tab uploads).
let switcher: (t: { handle?: string; name?: string }, next: string) => void = () => {};
export const setChannelSwitcher = (fn: typeof switcher) => { switcher = fn; };
const switchToChannel: typeof switcher = (t, next) => {
  if (otherTabRunning()) return log(L('คิวอัปโหลดยังวิ่งอยู่ — ยังไม่สลับช่องไปกดยอมรับคำเชิญ', 'Upload queue is running — not switching channels to accept the invite yet'), 'warn');
  switcher(t, next);
};

// @port-begin
  const cfg = (): ClaimsCfg => Object.assign({}, DEFAULTS, load('cfg', {}));
  const saveCfg = (c: ClaimsCfg) => save('cfg', c);
  const visible = (el: any): boolean => !!el && (el.offsetParent !== null ||
    (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'));
  const findText = (re: RegExp, sel = SEL.clickable, rootEl: ParentNode = document): HTMLElement[] =>
    [...rootEl.querySelectorAll<HTMLElement>(sel)].filter((el) => visible(el) && re.test(el.innerText.trim()));
  const isDisabled = (el: any): boolean =>
    el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' ||
    !!el.closest('[disabled],[aria-disabled="true"]');
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
  function otherJobBusy(except: string) {
    const tr = getRun(), ar = getAdsRun(), cr = getCollabRun();
    return (except !== 'trim' && (trimBusy || !!(tr && tr.active))) ||
      (except !== 'ads' && (adsBusy || !!(ar && ar.active))) ||
      (except !== 'collab' && (collabBusy || !!(cr && cr.active)));
  }
  function startAdsRun(rows: { videoId: string; video: string }[]) {
    if (otherJobBusy('ads')) { log(L('ยังมีงานตัดลิขสิทธิ์/Collab อยู่ — รอให้เสร็จหรือกดหยุดก่อนแล้วค่อยเปิดโฆษณา', 'A trim/Collab job is still running — wait for it or press Stop before turning on ads'), 'warn'); return; }
    if (uploadBusy()) { log(L('คิวอัปโหลดยังทำงานอยู่ — การเปิดโฆษณาต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', 'Upload queue is still running — turning on ads needs page changes, will start after the upload queue finishes'), 'warn'); }
    isWorker(true);
    setAdsRun({ active: true, items: rows.map((r) => ({ videoId: r.videoId, video: r.video, state: 'pending', msg: '' })), started: new Date().toISOString() });
    log(L(`💰 กำลังเปิดโฆษณา ${rows.length} คลิป`, `💰 Turning on ads for ${rows.length} videos`), 'ok');
    adsStep();
  }
  function stopAdsRun(reason = L('เปิดโฆษณาเสร็จ', 'Ads turned on')) {
    const run = getAdsRun();
    if (!run || !run.active) return;
    run.active = false;
    chMerge('adsRun', { active: false });
    const on = run.items.filter((i) => i.state === 'on').length;
    const failed = run.items.filter((i) => i.state === 'failed').length;
    const left = run.items.filter((i) => i.state === 'pending').length;
    const summary = [L(`เปิดแล้ว ${on}`, `On ${on}`), failed ? L(`ไม่สำเร็จ ${failed}`, `Failed ${failed}`) : '', left ? L(`ยังไม่ได้ทำ ${left}`, `Not done ${left}`) : ''].filter(Boolean).join(' · ');
    adsStage = { idx: -1, detail: '' };
    log(`${reason}: ${summary}`, 'ok');
    flash(reason, summary, failed ? 'err' : 'ok', 15000);
  }
  function setAdsResult(item: RunItem, state: string, msg = '') {
    chMerge('adsResults', { [item.videoId]: { state, msg, date: new Date().toISOString() } });
    chRunItem('adsRun', 'videoId', item.videoId, state, msg);
    log(L(`${state === 'on' ? '✅ เปิดโฆษณาแล้ว' : '❌ เปิดโฆษณาไม่สำเร็จ'}: ${item.video}${msg ? ' (' + msg + ')' : ''}`, `${state === 'on' ? '✅ Ads turned on' : '❌ Failed to turn on ads'}: ${item.video}${msg ? ' (' + msg + ')' : ''}`), state === 'on' ? 'ok' : 'err');
  }
  async function adsIsOn(videoId: string) {
    const j = await yti('creator/get_creator_videos', { failOnError: true, videoIds: [videoId], mask: { videoId: true, monetization: { all: true } } });
    const v = (j.videos || [])[0] || {};
    return /_ON$/.test(((v.monetization || {}).adMonetization || {}).userSetMonetization || '');
  }

  let adsBusy = false;
  async function adsStep() {
    const run = getAdsRun();
    if (!run || !run.active || adsBusy) return;
    const item = run.items.find((i) => i.state === 'pending' && !isSettled(run, i));
    if (!item) return stopAdsRun();
    adsBusy = true;
    if (!(await claimLock())) { setAdsStage(-1, lockWait()); adsBusy = false; return; }
    if (!(getAdsRun() || {} as Partial<Run>).active) { adsBusy = false; return; }
    if (!location.pathname.startsWith(`/video/${item.videoId}/monetization`)) {
      if (uploadBusy()) { setAdsStage(-1, L('⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ค้าง/ผิดพลาดในคิวออก', '⏸ Waiting for the upload queue to clear (page change needed) — upload or remove stuck/failed videos from the queue')); adsBusy = false; return; }
      setAdsStage(0, L('กำลังเปิดหน้าการสร้างรายได้ของคลิป…', 'Opening the video\'s monetisation page…'));
      location.href = `/video/${item.videoId}/monetization`;
      setTimeout(() => { adsBusy = false; }, 15000); // ถ้าเปลี่ยนหน้าไม่สำเร็จ (เช่นกด Stay ใน Leave site?) ให้ลองใหม่ได้
      return;
    }
    try {
      await adsOne(item);
    } catch (e: any) {
      setAdsResult(item, 'failed', e.message);
    }
    setAdsStage(-1, L('คลิปถัดไปในไม่กี่วินาที…', 'Next video in a few seconds…'));
    await sleep(3000);
    adsBusy = false;
  }

  async function adsOne(item: RunItem) {
    if (await adsIsOn(item.videoId)) return setAdsResult(item, 'on', L('เปิดอยู่แล้ว', 'Already on'));
    setAdsStage(1, L('กด "Edit video monetisation status"…', 'Clicking "Edit video monetisation status"…'));
    const box: any = await waitFor(() => { const b = document.querySelector(SEL.monetBox); return b && visible(b) ? b : null; }, 25000);
    if (!box) throw new Error(L('ไม่พบส่วนการสร้างรายได้ในหน้า', 'Monetisation section not found on the page'));
    await sleep(2500);
    let on: any = null;
    for (let i = 0; i < 4 && !on; i++) {
      const edit = [...box.querySelectorAll(SEL.iconOrButton)].find((b) => visible(b) &&
        TXT.monetStatus.test(b.getAttribute('aria-label') || '')) || box.querySelector(SEL.iconButton);
      if (!edit) throw new Error(L('ไม่พบปุ่ม "Edit video monetisation status"', '"Edit video monetisation status" button not found'));
      edit.click();
      on = await waitFor(() => [...document.querySelectorAll(SEL.radioOn)].find(visible), 3000);
      if (!on) await sleep(1500);
    }
    if (!on) throw new Error(L('ตัวเลือก On / Off ไม่เปิดขึ้นมา', 'On / Off options did not open'));
    setAdsStage(2, L('เลือก "On"…', 'Selecting "On"…'));
    on.click();
    await sleep(600);
    const pop = on.closest(SEL.paperDialog) || document;
    const nextBtn = await waitFor(() => [...pop.querySelectorAll('button')].find((b) => visible(b) && TXT.nextOrDone.test(b.innerText.trim()) && !isDisabled(b)), 5000);
    if (nextBtn) nextBtn.click();
    const qDlg: any = await waitFor(() => [...document.querySelectorAll<HTMLElement>(SEL.paperDialog)].find((d) => visible(d) && TXT.tellUsWhats.test(d.innerText)), 6000);
    if (qDlg) {
      setAdsStage(3, L('คำถามความเหมาะสม: ติ๊ก "None of the above"…', 'Ad suitability questions: ticking "None of the above"…'));
      const submitBtn = () => [...qDlg.querySelectorAll('button')].find((b) => visible(b) && TXT.submit.test(b.innerText.trim()));
      const inner = qDlg.querySelector('[role="checkbox"][aria-label="None of the above"]') ||
        deepAll(qDlg, '[role="checkbox"]').find((e) => TXT.noneOfAbove.test(e.getAttribute('aria-label') || ''));
      if (!inner) throw new Error(L('ไม่พบ "None of the above" ในคำถาม', '"None of the above" not found in the questions'));
      const host = inner.closest(SEL.checkboxLit) || inner;
      if (inner.getAttribute('aria-checked') !== 'true') host.click();
      let ready = await waitFor(() => { const b = submitBtn(); return b && !isDisabled(b) ? b : null; }, 3000);
      if (!ready && inner.getAttribute('aria-checked') !== 'true') { inner.click(); ready = await waitFor(() => { const b = submitBtn(); return b && !isDisabled(b) ? b : null; }, 3000); }
      if (!ready) throw new Error(L('ปุ่ม Submit ยังกดไม่ได้หลังติ๊ก "None of the above"', 'Submit button still disabled after ticking "None of the above"'));
      ready.click();
      const closed = await waitFor(() => !visible(qDlg), 15000);
      if (!closed) throw new Error(L('หน้าต่างคำถามไม่ปิดหลังกด Submit', 'Questions dialog did not close after Submit'));
      await sleep(800);
    }
    setAdsStage(3, L('กด Save…', 'Clicking Save…'));
    const saveHost: any = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && visible(x) && !isDisabled(x) ? x : null; }, 10000);
    if (!saveHost) throw new Error(L('ปุ่ม Save ไม่พร้อม', 'Save button not ready'));
    (saveHost.querySelector('button') || saveHost).click();
    const saved = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && isDisabled(x); }, 20000);
    const extra = [...document.querySelectorAll<HTMLElement>(SEL.paperDialog)].find((d) => visible(d));
    if (!saved && extra) throw new Error(L('YouTube ถามเพิ่มหลัง Save: "', 'YouTube asked more after Save: "') + extra.innerText.replace(/\s+/g, ' ').slice(0, 120) + L('" — ทำคลิปนี้ด้วยมือ', '" — do this video manually'));
    setAdsStage(4, L('ตรวจกับ YouTube ว่าเปิดโฆษณาแล้ว…', 'Checking with YouTube that ads are on…'));
    let okNow = false;
    for (let i = 0; i < 5 && !okNow; i++) { await sleep(1500); okNow = await adsIsOn(item.videoId); }
    if (!okNow) throw new Error(L('บันทึกแล้ว แต่ YouTube ยังแจ้งว่าปิดโฆษณาอยู่', 'Saved, but YouTube still reports ads are off'));
    setAdsResult(item, 'on', qDlg ? L('ตอบคำถาม: none of the above', 'Answered questions: none of the above') : '');
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
  function startCollabRun(rows: { videoId: string; video: string }[], handles: string[]) {
    const tr = getRun();
    const ar = getAdsRun();
    if (otherJobBusy('collab') || (tr && tr.active) || (ar && ar.active)) { log(L('ยังมีงานตัดลิขสิทธิ์/เปิดโฆษณาอยู่ — รอให้เสร็จก่อนแล้วค่อยเชิญ', 'A trim/ads job is still running — wait for it to finish before inviting'), 'warn'); return; }
    if (uploadBusy()) log(L('คิวอัปโหลดยังทำงานอยู่ — การเชิญต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', 'Upload queue is still running — inviting needs page changes, will start after the upload queue finishes'), 'warn');
    isWorker(true);
    setCollabRun({ active: true, handles, items: rows.map((r) => ({ videoId: r.videoId, video: r.video, state: 'pending', msg: '' })), started: new Date().toISOString() });
    log(L(`🤝 กำลังเชิญ ${handles.join(', ')} ใน ${rows.length} คลิป`, `🤝 Inviting ${handles.join(', ')} to ${rows.length} videos`), 'ok');
    collabStep();
  }
  function stopCollabRun(reason = L('เชิญเสร็จ', 'Invites finished')) {
    const run = getCollabRun();
    if (!run || !run.active) return;
    run.active = false;
    chMerge('collabRun', { active: false });
    collabStage = { idx: -1, detail: '' };
    const done = run.items.filter((i) => i.state === 'done').length;
    const failed = run.items.filter((i) => i.state === 'failed').length;
    const left = run.items.filter((i) => i.state === 'pending').length;
    const summary = [L(`สำเร็จ ${done}`, `Done ${done}`), failed ? L(`ไม่สำเร็จ ${failed}`, `Failed ${failed}`) : '', left ? L(`ยังไม่ได้ทำ ${left}`, `Not done ${left}`) : ''].filter(Boolean).join(' · ');
    log(`${reason}: ${summary}`, 'ok');
    flash(reason, summary + L(' · อย่าลืมส่งลิงก์คำเชิญให้อีกฝ่าย (ปุ่ม 🤝 Collab)', ' · Remember to send the invite link (🤝 Collab button)'), failed ? 'err' : 'ok', 15000);
    if (done) chainAcceptInvites();
  }

  // เชิญเสร็จแล้วงานยังไม่จบ — ลิงก์คำเชิญต้องมีคนเปิดและกดยอมรับ ถ้าช่องที่ถูกเชิญ
  // เป็นช่องของเราเองก็สลับไปช่องนั้นแล้วให้ watchInvite กดยอมรับให้ต่อได้เลย
  // (การสลับช่องมีผลกับทุกแท็บ Studio จึงไม่ทำระหว่างที่คิวอัปโหลดยังวิ่งอยู่)
  function chainAcceptInvites() {
    if (settings.autoAcceptInvite === false) return;
    const links = Object.entries(collabLinks());
    if (!links.length) return;
    const mine = loadState<{ id: string; name: string; handle?: string }[]>('channels', []);
    // เลือกเฉพาะช่องที่อยู่ในรายการช่องของเราเอง — ช่องคนอื่นเราสลับไปไม่ได้อยู่แล้ว
    const target = links
      .map(([handle, link]) => ({ handle, link, chan: mine.find((c) => c.handle && c.handle.toLowerCase() === handle.toLowerCase()) }))
      .find((x) => x.chan && x.chan.id !== currentChannel());
    if (!target) return;
    if (uploadBusy()) {
      log(L('คิวอัปโหลดยังวิ่งอยู่ — ยังไม่สลับช่องไปกดยอมรับคำเชิญ', 'Upload queue is running — not switching channels to accept the invite yet'), 'warn');
      return;
    }
    log(L(`สลับไปช่อง ${target.handle} เพื่อกดยอมรับคำเชิญ…`, `Switching to ${target.handle} to accept the invite…`), 'ok');
    switchToChannel({ handle: target.handle, name: target.chan!.name }, target.link);
  }
  function setCollabResult(item: RunItem, state: string, msg: string) {
    chMerge('collabResults', { [item.videoId]: { state, msg, date: new Date().toISOString() } });
    chRunItem('collabRun', 'videoId', item.videoId, state, msg);
    log(`${state === 'done' ? '🤝' : '❌'} ${item.video}: ${msg}`, state === 'done' ? 'ok' : 'err');
  }

  async function collabStep() {
    const run = getCollabRun();
    if (!run || !run.active || collabBusy) return;
    const item = run.items.find((i) => i.state === 'pending' && !isSettled(run, i));
    if (!item) return stopCollabRun();
    collabBusy = true;
    if (!(await claimLock())) { setCollabStage(-1, lockWait()); collabBusy = false; return; }
    if (!(getCollabRun() || {} as Partial<Run>).active) { collabBusy = false; return; }
    if (!location.pathname.startsWith(`/video/${item.videoId}/edit`)) {
      if (uploadBusy()) { setCollabStage(-1, L('⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า)', '⏸ Waiting for the upload queue to clear (page change needed)')); collabBusy = false; return; }
      setCollabStage(0, L('กำลังเปิดหน้ารายละเอียดของคลิป…', 'Opening the video details page…'));
      location.href = `/video/${item.videoId}/edit`;
      setTimeout(() => { collabBusy = false; }, 15000); // ถ้าเปลี่ยนหน้าไม่สำเร็จ (เช่นกด Stay ใน Leave site?) ให้ลองใหม่ได้
      return;
    }
    try {
      const page = await waitFor(() => { const p = document.querySelector(SEL.detailsSection); return p && visible(p) ? p : null; }, 25000);
      if (!page) throw new Error(L('ไม่พบหน้ารายละเอียดคลิป', 'Video details page not found'));
      await sleep(2000);
      setCollabStage(1, L(`เชิญ ${run.handles!.join(', ')}…`, `Inviting ${run.handles!.join(', ')}…`));
      const r = await inviteCollaborators(run.handles!, page);
      // เก็บลิงก์ไว้เสมอ แม้บันทึกไม่สำเร็จ — ลิงก์ผูกกับช่อง ไม่ได้ผูกกับคลิป
      if (r.links.length) chMerge('collabLinks', Object.fromEntries(r.links.map((x) => [x.handle, x.link])));
      if (r.links.length && r.saved) {
        setCollabStage(2, L('กด Save…', 'Clicking Save…'));
        // หน้าแก้ไขคลิป: ปุ่ม Save ของหน้าอาจเปิดให้กดช้า — รอสูงสุด 8 วิ
        // (ถ้าไม่เปิดเลย = ไม่มีอะไรค้างให้บันทึก เพราะหน้าต่างเชิญปิดไปเรียบร้อยแล้ว)
        const sv: any = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && visible(x) && !isDisabled(x) ? x : null; }, 8000);
        if (sv) {
          (sv.querySelector('button') || sv).click();
          const saved = await waitFor(() => { const x = document.querySelector(SEL.studioSaveHost); return x && isDisabled(x); }, 20000);
          if (!saved) { r.saved = false; r.errors.push(L('กด Save ของหน้าแล้วแต่ยังไม่บันทึก', 'Clicked the page Save but it did not save')); }
        }
      }
      // หน้าต่างเชิญค้างอยู่จะบังหน้าถัดไป — ปิดให้เรียบร้อยก่อนเปลี่ยนหน้า
      if (!r.saved && shownDialog(SEL.collabDialog)) {
        clickIn(shownDialog(SEL.collabDialog), SEL.dialogCancel) || clickByText(shownDialog(SEL.collabDialog), TXT.cancelButton);
        await waitFor(() => !shownDialog(SEL.collabDialog), 5000);
      }
      const out = inviteOutcome(r);
      setCollabResult(item, out.state, out.msg);
    } catch (e: any) {
      setCollabResult(item, 'failed', e.message);
    }
    setCollabStage(-1, L('คลิปถัดไปในไม่กี่วินาที…', 'Next video in a few seconds…'));
    await sleep(3000);
    collabBusy = false;
  }
  const TRIM_LABEL = (): Record<string, string> => ({
    pending: L('⏳ รอ', '⏳ Pending'), saved: L('✅ ตัดแล้ว', '✅ Trimmed'), gone: L('✅ claim หายไปแล้ว', '✅ Claim gone'), failed: L('❌ ไม่สำเร็จ', '❌ Failed'),
    skipped: L('⏭ ข้าม', '⏭ Skipped'), later: L('⏳ รอคิว — จะตัดหลังการตัดครั้งก่อนในคลิปนี้เสร็จ', '⏳ Queued — will trim after the previous trim on this video finishes'),
  });
  const getRun = (): Run | null => chGet('trimRun', null);
  const setRun = (r: Run | null) => chSet('trimRun', r);
  function setResult(item: TrimItem, state: string, msg = '') {
    chMerge('trimResults', { [item.key]: { state, msg, date: new Date().toISOString() } });
    chRunItem('trimRun', 'key', item.key, state, msg, true);
    if (state === 'saved' || state === 'gone') chList('trimQueue', { del: [item.key] });
    fuOnResult(item, state);
    log(`${TRIM_LABEL()[state] || state}: ${item.video} — ${item.song}${msg ? ' (' + msg + ')' : ''}`,
      state === 'failed' ? 'err' : state === 'saved' || state === 'gone' ? 'ok' : 'warn');
  }
  function startTrimRun(rows: TrimPick[], mode: 'auto' | 'review', fromFollowUp = false) {
    const cur = getRun();
    if (cur && cur.active) {
      log(L('ยังตัดชุดก่อนไม่เสร็จ — รอให้เสร็จหรือกดหยุดก่อน แล้วค่อยเริ่มชุดใหม่', 'Previous batch is still trimming — wait for it to finish or press Stop before starting a new batch'), 'warn');
      cui.toast(L('ยังตัดชุดก่อนไม่เสร็จ', 'Previous batch still trimming'));
      return;
    }
    if (otherJobBusy('trim')) { log(L('ยังมีงานเปิดโฆษณา/Collab อยู่ — รอให้เสร็จหรือกดหยุดก่อนแล้วค่อยตัด', 'An ads/Collab job is still running — wait for it or press Stop before trimming'), 'warn'); return; }
    const seen = new Set<string>();
    const waiting: FollowUp = fromFollowUp ? {} : fuGet();
    const items = rows.map((r) => {
      const first = !seen.has(r.videoId) && !waiting[r.videoId];
      seen.add(r.videoId);
      return { key: r.videoId + ':' + r.claimId, videoId: r.videoId, claimId: r.claimId, song: r.song, video: r.video, state: first ? 'pending' : 'later', msg: '' };
    });
    // แก้บัคเดิม: ตั้ง run ใหม่ก่อน แล้วค่อยบันทึกผล "later" (เดิมไปแก้ items ของ run เก่า)
    setRun({ active: true, mode, items, started: new Date().toISOString(), channel: currentChannel() });
    items.filter((i) => i.state === 'later').forEach((i) => { fuAdd(i); setResult(i, 'later'); });
    fuNext = Date.now() + Math.max(2, parseFloat(cfg().followUpMinutes) || 10) * 60e3;
    isWorker(true);
    log(L(`เริ่มตัด (${mode === 'auto' ? 'บันทึกอัตโนมัติ' : 'ตรวจเองทีละอัน'}) — ${items.filter((i) => i.state === 'pending').length} รายการ`, `Trim started (${mode === 'auto' ? 'auto-save' : 'review each'}) — ${items.filter((i) => i.state === 'pending').length} items`), 'ok');
    trimStep();
  }

  // byUser: ผู้ใช้กดหยุดเอง → ยกเลิกคิวตัดต่อทั้งหมดของช่องนี้ด้วย ไม่ให้ fuCheck เริ่มตัดต่อเอง (การตัดย้อนกลับไม่ได้)
  function stopTrimRun(reason = L('หยุดแล้ว', 'Stopped'), byUser = false) {
    if (byUser && fuCount()) {
      const n = fuCount();
      fuSet({});
      log(L(`ยกเลิกคิวตัดต่อ ${n} claim แล้ว`, `Cancelled ${n} queued follow-up trims`), 'warn');
    }
    const run = getRun();
    if (!run || !run.active) return;
    run.active = false;
    chMerge('trimRun', { active: false });
    const c = run.items.reduce((a, i) => { a[i.state] = (a[i.state] || 0) + 1; return a; }, {} as Record<string, number>);
    const summary = [L(`ตัดแล้ว ${c.saved || 0}`, `Trimmed ${c.saved || 0}`), c.gone ? L(`claim หายแล้ว ${c.gone}`, `Claim gone ${c.gone}`) : '', c.skipped ? L(`ข้าม ${c.skipped}`, `Skipped ${c.skipped}`) : '',
      c.failed ? L(`ไม่สำเร็จ ${c.failed}`, `Failed ${c.failed}`) : '', c.later ? L(`รอคิวตัดต่อ ${c.later}`, `Queued for follow-up ${c.later}`) : '', c.pending ? L(`ยังไม่ได้ทำ ${c.pending}`, `Not done ${c.pending}`) : ''].filter(Boolean).join(' · ');
    log(`${reason}: ${summary}`, 'ok');
    trimStage = { idx: -1, detail: '' };
    flash(reason, summary, c.failed ? 'err' : 'ok', 15000);
  }
  const fuGet = (): FollowUp => chGet('followUp', {});
  const fuSet = (v: FollowUp) => chSet('followUp', v);
  const fuHas = (videoId: string, claimId: string) => !!(fuGet()[videoId] || { pending: [] }).pending.some((p) => p.claimId === claimId);
  function fuAdd(item: TrimItem) {
    const fu = fuGet();
    const v = fu[item.videoId] || (fu[item.videoId] = { video: item.video, pending: [], lastClaimId: null, lastSavedAt: 0 });
    if (!v.pending.some((p) => p.claimId === item.claimId)) v.pending.push({ key: item.key, claimId: item.claimId, song: item.song, tries: 0 });
    fuSet(fu);
  }
  function fuOnResult(item: TrimItem, state: string) {
    if (state === 'saved') markSongTrimmed(item);
    const fu = fuGet();
    const v = fu[item.videoId];
    if (!v || state === 'later') return;
    const i = v.pending.findIndex((p) => p.claimId === item.claimId);
    if (state === 'saved') {
      v.lastClaimId = item.claimId;
      v.lastSavedAt = Date.now();
      if (i >= 0) v.pending.splice(i, 1);
    } else if (state === 'gone' || state === 'skipped') {
      if (i >= 0) v.pending.splice(i, 1);
    } else if (state === 'failed' && i >= 0) {
      v.pending[i]!.tries = (v.pending[i]!.tries || 0) + 1;
      if (v.pending[i]!.tries >= 3) v.pending.splice(i, 1);
    }
    if (!v.pending.length) delete fu[item.videoId];
    fuSet(fu);
  }
  const fuCount = () => Object.values(fuGet()).reduce((a, v) => a + v.pending.length, 0);
  let fuBusy = false;
  let fuNext = 0;
  async function fuCheck() {
    if (fuBusy || scanning) return;
    const run = getRun();
    if (run && run.active) return;
    const fu = fuGet();
    const vids = Object.keys(fu);
    if (!vids.length) return;
    fuBusy = true;
    fuNext = Date.now() + Math.max(2, parseFloat(cfg().followUpMinutes) || 10) * 60e3;
    try {
      const ready: TrimPick[] = [];
      for (const videoId of vids) {
        const v = fu[videoId]!;
        let j: any;
        try {
          j = await yti('creator/list_creator_received_claims', { videoId, criticalRead: true, includeLicensingOptions: false, isCreatorMusicV2: true });
        } catch (e: any) { log(L(`เช็กคลิป ${v.video} ไม่สำเร็จ: ${e.message}`, `Failed to check video ${v.video}: ${e.message}`), 'warn'); continue; }
        const active: Record<string, any> = {};
        (j.receivedClaims || []).forEach((c: any) => { if (c.status === 'RECEIVED_CLAIM_STATUS_ACTIVE') active[c.claimId] = c; });
        v.pending = v.pending.filter((p) => {
          if (active[p.claimId]) return true;
          chMerge('trimResults', { [p.key]: { state: 'gone', msg: L('ปล่อยแล้ว', 'Released'), date: new Date().toISOString() } });
          log(L(`✅ claim หายไปแล้ว: ${v.video} — ${p.song}`, `✅ Claim gone: ${v.video} — ${p.song}`), 'ok');
          return false;
        });
        if (!v.pending.length) { delete fu[videoId]; continue; }
        const stillThere = v.lastClaimId && active[v.lastClaimId];
        const hours = (Date.now() - (v.lastSavedAt || 0)) / 3600e3;
        if (stillThere && hours < 48) {
          log(L(`⏳ ${v.video}: การตัดครั้งก่อนยังประมวลผล (${hours < 1 ? Math.round(hours * 60) + ' นาที' : hours.toFixed(1) + ' ชม.'}) — รอ ${v.pending.length} claim`, `⏳ ${v.video}: previous trim still processing (${hours < 1 ? Math.round(hours * 60) + ' min' : hours.toFixed(1) + ' h'}) — ${v.pending.length} claims waiting`));
          continue;
        }
        const next = v.pending.find((p) => ((active[p.claimId].nontakedownClaimActions || {}).options || []).includes('NON_TAKEDOWN_CLAIM_OPTION_TRIM'));
        if (!next) { log(L(`⏳ ${v.video}: ยังไม่มีตัวเลือก Trim — จะเช็กใหม่`, `⏳ ${v.video}: no Trim option yet — will check again`)); continue; }
        ready.push({ videoId, claimId: next.claimId, song: next.song, video: v.video });
      }
      fuSet(fu);
      if (ready.length) {
        log(L(`▶ ${ready.length} คลิปประมวลผลเสร็จแล้ว — ตัด claim ถัดไป`, `▶ ${ready.length} videos finished processing — trimming next claim`), 'ok');
        startTrimRun(ready, cfg().autoSaveTrim ? 'auto' : 'review', true);
      } else if (Object.keys(fu).length) {
        log(L(`เช็กครั้งถัดไป ${new Date(fuNext).toLocaleTimeString(locale()).slice(0, 5)}`, `Next check ${new Date(fuNext).toLocaleTimeString(locale()).slice(0, 5)}`));
      }
    } finally {
      fuBusy = false;
    }
  }
  const getAP = (): Autopilot => chGet('autopilot', { on: false, next: 0 });
  const setAP = (v: Autopilot) => chSet('autopilot', v);
  function apPick(rows: ClaimRow[]) {
    const c = cfg();
    const maxPct = parseFloat(c.apMaxPct) || 100;
    const results = chGet<Record<string, ResultEntry>>('trimResults', {});
    const out: ClaimRow[] = [];
    // คลิปที่ตั้งเวลาปล่อยไว้และใกล้ถึงเวลา ตัดก่อน
    const sorted = rows.slice().sort((a, b) => (a.publishAt > Date.now() ? a.publishAt : Infinity) - (b.publishAt > Date.now() ? b.publishAt : Infinity));
    for (const r of sorted) {
      const res = results[r.videoId + ':' + r.claimId];
      if (res && (res.state === 'saved' || res.state === 'gone')) continue;
      if (!r.canTrim) continue;
      if (c.apSkipOwn && r.own) continue;
      if (c.apOnlyImpact && !r.hasImpact) continue;
      if (r.length && (r.claimedSec / r.length) * 100 > maxPct) continue;
      if (fuHas(r.videoId, r.claimId)) continue;
      out.push(r);
      if (out.length >= (parseInt(c.apMaxPerCycle, 10) || 10)) break;
    }
    return out;
  }

  let apBusy = false;
  async function apCycle() {
    if (apBusy || scanning) return;
    const run = getRun();
    if (run && run.active) return;
    apBusy = true;
    try {
      const hours = Math.max(0.5, parseFloat(cfg().apEveryHours) || 6);
      chMerge('autopilot', { next: Date.now() + hours * 3600e3, last: Date.now() });
      log(L(`🤖 Auto-pilot เริ่มรอบใหม่ที่ ${channelName()}`, `🤖 Auto-pilot starting a new cycle on ${channelName()}`), 'ok');
      if (!(await freshCfg())) return;
      const rows = await scanClaims({ show: false });
      if (!rows) return;
      const pick = apPick(rows);
      if (!pick.length) {
        log(L(`🤖 ไม่มีอะไรต้องตัด เช็กครั้งถัดไป ${new Date(getAP().next).toLocaleString(locale())}`, `🤖 Nothing to trim, next check ${new Date(getAP().next).toLocaleString(locale())}`), 'ok');
        if (cfg().apAdsOn) {
          const adsRows = await scanAds({ show: false });
          const todo = (adsRows || []).filter((r) => !r.ineligible);
          if (todo.length) { log(L(`🤖 เปิดโฆษณา ${todo.length} คลิป`, `🤖 Turning on ads for ${todo.length} videos`), 'warn'); startAdsRun(todo); }
        }
        return;
      }
      log(L(`🤖 ตัดอัตโนมัติ ${pick.length} claim`, `🤖 Auto-trimming ${pick.length} claims`), 'warn');
      startTrimRun(pick, 'auto');
    } finally {
      apBusy = false;
    }
  }
  let confirmClickedAt = 0;
  const installConfirmWatch = () => {
  const ac = new AbortController();
  document.addEventListener('click', (e: any) => {
    const b = e.target && e.target.closest && e.target.closest(SEL.buttonOrYtcp);
    if (b && TXT.confirmChanges.test((b.innerText || '').trim())) confirmClickedAt = Date.now();
  }, { capture: true, signal: ac.signal });
  return () => ac.abort();
  };
  function findConfirmDialog() {
    return [...document.querySelectorAll<HTMLElement>(SEL.anyDialog)].find((d) =>
      visible(d) && TXT.confirmChangesLoose.test(d.innerText) && TXT.acknowledge.test(d.innerText) &&
      !d.querySelector(SEL.nestedDialog)) || null;
  }
  function deepAll(rootEl: ParentNode, sel: string, out: Element[] = []): Element[] {
    rootEl.querySelectorAll(sel).forEach((e) => out.push(e));
    rootEl.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(e.shadowRoot, sel, out); });
    return out;
  }
  function fullClick(el: Element) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }
  let approving = false;
  async function approveConfirm(dlg: Element): Promise<boolean> {
    if (approving) return false;
    approving = true;
    try {
      const confirmBtn = () => [...dlg.querySelectorAll('button')].find((b) => visible(b) && TXT.confirmChanges.test(b.innerText.trim()));
      const ready = () => { const b = confirmBtn(); return b && !isDisabled(b) ? b : null; };
      if (!ready()) {
        const host: any = dlg.querySelector(SEL.checkboxHost);
        const inner: any = deepAll(dlg, '[role="checkbox"], input[type="checkbox"], #checkbox').find(visible);
        const label = [...dlg.querySelectorAll('*')].find((e) => e.childElementCount === 0 && TXT.acknowledgeFull.test(e.textContent!));
        const tries = [
          () => host && host.click(),
          () => inner && inner.click(),
          () => host && fullClick(host),
          () => inner && fullClick(inner),
          () => label && fullClick(label),
          () => { const t = inner || host; if (t) { t.focus && t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, composed: true }));
            t.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, composed: true })); } },
        ];
        for (const t of tries) {
          t();
          if (await waitFor(ready, 1200)) break;
          const tickedNow = [host, inner].some((e) => e && (e.getAttribute('aria-checked') === 'true' || e.checked === true || e.hasAttribute('checked')));
          if (tickedNow) { await waitFor(ready, 3000); break; }
        }
      }
      const btn = await waitFor(ready, 3000);
      if (!btn) {
        const info = deepAll(dlg, SEL.checkboxAny).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')).join(', ');
        log(L('ติ๊ก "I acknowledge" ไม่ได้ — ติ๊กเองด้วยมือ (เจอ: ', 'Couldn\'t tick "I acknowledge" — tick it manually (found: ') + (info || L('ไม่มี checkbox', 'no checkbox')) + ')', 'err');
        return false;
      }
      btn.click();
      confirmClickedAt = Date.now();
      log(L('✔ ยืนยันการตัดแล้ว (YouTube จะประมวลผลภายในไม่กี่นาทีถึงหลายชั่วโมง)', '✔ Trim confirmed (YouTube will process it within a few minutes to several hours)'), 'ok');
      return true;
    } finally {
      approving = false;
    }
  }

  let trimBusy = false;
  async function trimStep() {
    const run = getRun();
    if (!run || !run.active || trimBusy) return;
    const item = run.items.find((i) => i.state === 'pending' && !isSettled(run, i)) as TrimItem | undefined;
    if (!item) return stopTrimRun(L('ตัดเสร็จแล้ว', 'Trimming finished'));
    trimBusy = true;
    if (!(await claimLock())) { setTrimStage(-1, lockWait()); trimBusy = false; return; }
    if (!(getRun() || {} as Partial<Run>).active) { trimBusy = false; return; }
    const path = `/video/${item.videoId}/claims`;
    if (!new RegExp(`^/video/${item.videoId}/(claims|copyright)`).test(location.pathname)) {
      if (uploadBusy()) { setTrimStage(-1, L('⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ค้าง/ผิดพลาดในคิวออก', '⏸ Waiting for the upload queue to clear (page change needed) — upload or remove stuck/failed videos from the queue')); trimBusy = false; return; }
      setTrimStage(0, L('กำลังเปิดหน้า claim ของคลิปนี้…', 'Opening this video\'s claims page…'));
      log(L(`กำลังเปิด ${item.video}…`, `Opening ${item.video}…`));
      location.href = path;
      setTimeout(() => { trimBusy = false; }, 15000); // ถ้าเปลี่ยนหน้าไม่สำเร็จ (เช่นกด Stay ใน Leave site?) ให้ลองใหม่ได้
      return;
    }
    try {
      await trimOne(item, run.mode!);
    } catch (e: any) {
      setResult(item, 'failed', e.message);
    }
    setTrimStage(-1, L('claim ถัดไปในไม่กี่วินาที…', 'Next claim in a few seconds…'));
    await sleep(4000);
    trimBusy = false;
  }

  const closeDialogs = () => document.querySelectorAll<HTMLElement>(SEL.paperDialog).forEach((d) => {
    if (!visible(d)) return;
    const c = [...d.querySelectorAll('button')].find((b) => visible(b) && TXT.cancelOrClose.test(b.innerText.trim()));
    c && c.click();
  });

  function pickRow(rows: HTMLElement[], allClaims: any[], claim: any, song: string): HTMLElement | null {
    if (rows.length === 1) return rows[0]!;
    const t = songNorm(song);
    if (t) {
      const sameTitle = allClaims.filter((c) => songNorm(claimInfo(c).title) === t);
      const k = Math.max(0, sameTitle.findIndex((c) => c.claimId === claim.claimId));
      const hits = rows.filter((r) => songNorm(r.innerText).includes(t));
      if (hits.length === 1) return hits[0]!;
      if (hits.length > 1 && hits.length === sameTitle.length) return hits[k]!;
    }
    const idx = allClaims.findIndex((c) => c.claimId === claim.claimId);
    if (idx >= 0 && rows.length === allClaims.length) return rows[idx]!;
    const activeC = allClaims.filter((c) => c.status === 'RECEIVED_CLAIM_STATUS_ACTIVE');
    const aIdx = activeC.findIndex((c) => c.claimId === claim.claimId);
    if (aIdx >= 0 && rows.length === activeC.length) return rows[aIdx]!;
    return null;
  }

  async function trimOne(item: TrimItem, mode: 'auto' | 'review') {
    if (!studioIsEnglish()) throw new Error(L('Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ — เปลี่ยนเป็น English แล้วลองใหม่', 'Studio is not set to English — switch to English and try again'));
    setTrimStage(1, L('เช็กว่า claim ยังอยู่…', 'Checking the claim is still there…'));
    const j = await yti('creator/list_creator_received_claims', { videoId: item.videoId, criticalRead: true, includeLicensingOptions: false, isCreatorMusicV2: true });
    const claim = (j.receivedClaims || []).find((c: any) => c.claimId === item.claimId);
    if (!claim || claim.status !== 'RECEIVED_CLAIM_STATUS_ACTIVE') return setResult(item, 'gone', claim ? short(claim.status) : L('ปล่อยแล้ว', 'Released'));
    const opts = (claim.nontakedownClaimActions || {}).options || [];
    if (!opts.includes('NON_TAKEDOWN_CLAIM_OPTION_TRIM')) return setResult(item, 'failed', L('ไม่มีตัวเลือก Trim แล้ว (คลิปอาจยังประมวลผลการแก้ครั้งก่อน)', 'Trim option no longer available (the video may still be processing a previous edit)'));
    const song = (claimInfo(claim).title || (item.song !== '(ไม่ทราบชื่อ)' ? item.song : '') || '').trim();
    const allClaims = j.receivedClaims || [];

    setTrimStage(2, L('หา claim ในหน้าแล้วกด "Take action"…', 'Finding the claim on the page and clicking "Take action"…'));
    const rows = await waitFor(() => {
      const r = [...document.querySelectorAll<HTMLElement>(SEL.claimRow)].filter(visible);
      return r.length ? r : null;
    }, 25000);
    if (!rows) throw new Error(L('รายการ claim ไม่โหลด', 'Claim list did not load'));
    const row = pickRow(rows, allClaims, claim, song);
    if (!row) throw new Error(L(`แยกไม่ออกว่าแถวไหนใน ${rows.length} claim คือ "${song || 'claim นี้'}" — ทำด้วยมือ`, `Can't tell which of the ${rows.length} claim rows is "${song || 'this claim'}" — do it manually`));
    const take = [...row.querySelectorAll('button')].find((b) => visible(b) && TXT.takeAction.test(b.innerText.trim()));
    if (!take) throw new Error(L('ไม่มีปุ่ม "Take action" สำหรับ claim นี้', 'No "Take action" button for this claim'));
    take.click();

    const leaf: any = await waitFor(() => [...document.querySelectorAll(`${SEL.paperDialog} *`)].find((e) =>
      visible(e) && e.childElementCount === 0 && TXT.trimOutSegment.test(e.textContent!.trim())), 8000);
    if (!leaf) { closeDialogs(); throw new Error(L('ไม่มีตัวเลือก "Trim out segment"', 'No "Trim out segment" option')); }
    const opt = leaf.closest('button') || leaf;
    if (isDisabled(opt)) { closeDialogs(); throw new Error(L('Trim ถูกปิดสำหรับ claim นี้', 'Trim is disabled for this claim')); }
    opt.click();
    const cont = await waitFor(() => findText(TXT.continueBtn).find((b) => b.tagName === 'BUTTON' && !isDisabled(b)), 5000);
    if (!cont) { closeDialogs(); throw new Error(L('ปุ่ม Continue กดไม่ได้', 'Continue button is disabled')); }
    cont.click();

    setTrimStage(3, L('เปิดหน้าตัด…', 'Opening the trim editor…'));
    const dlg: any = await waitFor(() => {
      const d = document.querySelector(SEL.trimDialog);
      return d && visible(d.querySelector(SEL.trimContinue)) ? d : null;
    }, 20000);
    if (!dlg) { closeDialogs(); throw new Error(L('หน้าตัดไม่เปิด', 'Trim editor did not open')); }
    const times = (dlg.innerText.match(TXT.trimTimes) || []).slice(1).join('–');
    const saveBtn = dlg.querySelector(`${SEL.trimContinue} button`) || dlg.querySelector(SEL.trimContinue);
    let saveAt = 0;
    saveBtn.addEventListener('click', () => { saveAt = Date.now(); }, { capture: true });

    if (cfg().autoSaveTrim) mode = 'auto';
    if (mode === 'auto') {
      await sleep(1500);
      await waitFor(() => !isDisabled(saveBtn), 10000);
      setTrimStage(4, L(`บันทึกการตัด ${times}…`, `Saving trim ${times}…`));
      log(L(`บันทึกการตัด ${times} ใน ${item.video}…`, `Saving trim ${times} in ${item.video}…`));
      saveBtn.click();
      saveAt = saveAt || Date.now();
    } else {
      setTrimStage(4, L(`👉 ตาคุณ: เช็กช่วง ${times} แล้วกด Save (หรือ Cancel เพื่อข้าม)`, `👉 Your turn: check range ${times}, then click Save (or Cancel to skip)`));
      log(L(`👉 เช็กช่วง ${times} ใน "${item.video}" แล้วกด Save (หรือ Cancel เพื่อข้าม)`, `👉 Check range ${times} in "${item.video}", then click Save (or Cancel to skip)`), 'warn');
    }

    const t0 = Date.now();
    for (;;) {
      await sleep(700);
      const run = getRun();
      if (!run || !run.active) return;
      const cd = findConfirmDialog();
      if (cd && saveAt && confirmClickedAt < saveAt) {
        if (mode === 'auto') {
          setTrimStage(5, L('ติ๊ก "I acknowledge" แล้วกด "Confirm changes"…', 'Ticking "I acknowledge" and clicking "Confirm changes"…'));
          await approveConfirm(cd);
        } else setTrimStage(5, L('👉 ตาคุณ: ติ๊ก "I acknowledge" แล้วกด "Confirm changes"', '👉 Your turn: tick "I acknowledge" and click "Confirm changes"'));
      }
      const open = visible(dlg.querySelector(SEL.paperDialog)) || visible(dlg.querySelector(SEL.trimContinue)) || findConfirmDialog();
      if (!open) break;
      if (mode === 'auto' && Date.now() - t0 > 90000) throw new Error(L('ยืนยันการตัดไม่เสร็จภายใน 90 วินาที', 'Trim confirmation did not finish within 90 seconds'));
    }
    const saved = !!saveAt && confirmClickedAt >= saveAt;
    if (saved) {
      const extra = await waitFor(() => [...document.querySelectorAll<HTMLElement>(SEL.paperDialog)].filter(visible)
        .map((d) => [...d.querySelectorAll('button')].find((b) => visible(b) && !isDisabled(b) && TXT.okOrGotIt.test(b.innerText.trim())))
        .find(Boolean), 3000);
      if (extra) extra.click();
    }
    setResult(item, saved ? 'saved' : 'skipped', saved ? times : L('ยกเลิก', 'Cancelled'));
  }
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
  let trimStarting = false;
  function tick() {
    const run = getRun();
    const running2 = !!(run && run.active);
    // แย่งสิทธิ์ทำงานเฉพาะตอนแท็บนี้กำลังทำงานที่เปลี่ยนหน้าอยู่ (การสแกนอ่านอย่างเดียว ไม่ต้องแย่งจากแท็บที่กำลังตัด)
    const busy = trimBusy || apBusy || fuBusy || adsBusy || collabBusy;
    const ready = !!ycfg('INNERTUBE_CONTEXT') && isWorker(busy);
    workerHere = ready;
    const arun = getAdsRun();
    const crun = getCollabRun();
    const adsRunning = !!(arun && arun.active) || !!(crun && crun.active);
    // งานที่ต้องเปลี่ยนหน้า (ตัด / เปิดโฆษณา / Collab) รอจนคิวอัปโหลดว่าง และไม่เปลี่ยนหน้าระหว่างที่แท็บนี้กำลังสแกน
    const canNavigate = !uploadBusy() && !scanning && !adsScanning && !collabScanning;
    if (ready && canNavigate && adsRunning && !running2 && !adsBusy && !collabBusy && !trimBusy && !trimStarting) {
      trimStarting = true;
      setTimeout(() => { trimStarting = false; crun && crun.active ? collabStep() : adsStep(); }, 2500);
    }
    const ap = getAP();
    if (ready && canNavigate && !adsRunning && !adsScanning && ap.on && !running2 && !apBusy && !scanning && Date.now() >= (ap.next || 0)) apCycle();
    if (ready && canNavigate && !adsRunning && !adsScanning && !running2 && !apBusy && !scanning && !fuBusy && Date.now() >= fuNext && fuCount()) fuCheck();
    if (ready && canNavigate && running2 && !trimBusy && !adsBusy && !collabBusy && !trimStarting) {
      trimStarting = true;
      setTimeout(() => { trimStarting = false; trimStep(); }, 2500);
    }
    // ตัดเองด้วยมือในหน้า claim: กด Save ให้เฉพาะเมื่อเปิดตั้งค่าไว้ / ยืนยัน "Confirm changes" ให้เมื่อเปิดตัดอัตโนมัติ
    const c = cfg();
    if (!running2 && /\/video\/[^/]+\/(claims|copyright)/.test(location.pathname)) {
      if (c.autoSaveManualTrim) {
        const ed: any = document.querySelector(SEL.trimDialog);
        const sb = ed && (ed.querySelector(`${SEL.trimContinue} button`) || ed.querySelector(SEL.trimContinue));
        if (visible(sb) && !isDisabled(sb) && !findConfirmDialog() && !ed.__tbxSaving) {
          ed.__tbxSaving = true;
          setTimeout(() => {
            if (visible(sb) && !isDisabled(sb)) { log(L('บันทึกการตัดให้อัตโนมัติ…', 'Auto-saving trim…')); sb.click(); }
            setTimeout(() => { ed.__tbxSaving = false; }, 10000);
          }, 1500);
        }
      }
      if (c.autoSaveManualTrim) {
        const cd: any = findConfirmDialog();
        if (cd && !cd.__tbxSeen) { cd.__tbxSeen = true; approveConfirm(cd).then(() => setTimeout(() => { cd.__tbxSeen = false; }, 8000)); }
      }
    }
    renderStatus();
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
const chRunItem = (name: string, by: 'key' | 'videoId', id: string, state: string, msg: string, onlyActive = false, ch = currentChannel()) => {
  const run = chGet<Run | null>(name, null, ch);
  // remembered only where the userscript would have written it (5661: a trim result goes into an active run only)
  if (run && state !== 'pending' && (!onlyActive || run.active)) {
    if (!settledHere.has(run.started)) settledHere.set(run.started, new Map());
    settledHere.get(run.started)!.set(id, { name, by, state, msg });
  }
  write({ op: 'runItem', key: name + ':' + ch, by, id, state, msg, onlyActive });
};

// markSongTrimmed() (5093–5103) is a background op now (songs.ts).
function markSongTrimmed(item: { song?: string; videoId: string }): void {
  write({ op: 'songs', songs: { fn: 'trimmed', song: item.song ?? '', videoId: item.videoId } });
  invalidateCounts();
}

// The content script's 0.8 s tick (6361): the ported tick, then the lock.
export function claimsTick(): void {
  resendSettled();
  tick();
  settleLock();
}

const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// claims:trim — openTrimConfirm()'s data part (5673–5680, 5695): the panel asked; the rows come
// from this channel's stored scan, the mode from the settings.
export function trimFromPanel(keys: unknown): void {
  if (!strList(keys)) return;
  const scan = chGet<{ rows: ClaimRow[] } | null>('claimScan', null);
  const picked = new Set(keys);
  const rows = (scan ? scan.rows : []).filter((r) => picked.has(r.videoId + ':' + r.claimId));
  if (!rows.length) return log(L('ยังไม่ได้เลือก claim', 'No claims selected'), 'warn');
  startTrimRun(rows, cfg().autoSaveTrim ? 'auto' : 'review');
}
// claims:ads — showAds()'s go button (5294–5298).
export function adsFromPanel(ids: unknown): void {
  if (!strList(ids)) return;
  const scan = chGet<{ rows: { videoId: string; video: string }[] } | null>('adsScan', null);
  const rows = (scan ? scan.rows : []).filter((r) => ids.includes(r.videoId));
  if (rows.length) startAdsRun(rows);
}
// claims:collab — showCollab()'s go button (5494–5500). The panel sends parseHandles() output
// (lib/collab.ts); checked again here, after the message: one @name each, no space or comma.
const isHandle = (h: string) => h.length > 1 && h.length <= 100 && parseHandles(h).length === 1 && parseHandles(h)[0] === h;
export function collabFromPanel(d: unknown): void {
  const v = d as { videoIds?: unknown; handles?: unknown } | null;
  if (!v || !strList(v.videoIds) || !strList(v.handles) || !v.handles.length || !v.handles.every(isHandle)) return;
  const scan = chGet<{ rows: { videoId: string; video: string }[] } | null>('collabScan', null);
  const rows = (scan ? scan.rows : []).filter((r) => (v.videoIds as string[]).includes(r.videoId));
  if (rows.length) startCollabRun(rows, v.handles);
}
// claims:stop — UI.stopBtn (6193).
export function stopAll(): void {
  stopTrimRun(L('คุณกดหยุด', 'You stopped it'), true);
  stopAdsRun(L('คุณกดหยุด', 'You stopped it'));
  stopCollabRun(L('คุณกดหยุด', 'You stopped it'));
  renderStatus();
}
// claims:autopilot — the background's alarm for a channel (D25): the tab on it ticks now.
// The background sends it to the channel's worker only; the lease may have moved since, so the
// tab asks again and ticks only on a fresh "yes" (4a T4 review r2).
export async function autopilotDue(ch: unknown): Promise<void> {
  if (typeof ch !== 'string' || ch === 'unknown' || ch !== currentChannel()) return;
  if (await askWorker(ch, false)) claimsTick();
}

// A result this page wrote for a run item. The background may be slow: after 30 s the write
// counts as failed and the tab's copy goes back to what storage holds, though the write may
// still land (store.ts). The step must not take the item as still pending and do it again
// (a second trim of the same claim): items settled here are skipped, and their result is sent
// again while storage still says pending (the ops are idempotent). Per page: after a page change
// the copy was read from storage afresh.
// The re-send is not "for an active run only" even for a trim: the run may have ended since (the
// last item's step ends it seconds after the result), and that op would be ignored, then sent
// again on every tick. The item was written into the run it names (`started`), which is enough.
// Only the run item is sent again. The same result's other writes (trimResults, trimQueue, the
// song mark, followUp) are not, and a run that ends before the re-send lands counts the item as
// "not done" in its summary. What then stands between a lost trimResults entry and a second trim
// is trimOne's own check with YouTube (the claim is gone, or has no Trim option while it processes).
const settledHere = new Map<string, Map<string, { name: string; by: 'key' | 'videoId'; state: string; msg: string }>>();
const isSettled = (run: Run, i: { key?: string; videoId: string }) => !!settledHere.get(run.started)?.has(i.key || i.videoId);
function resendSettled(): void {
  for (const [started, items] of settledHere) {
    for (const [id, r] of items) {
      const run = chGet<Run | null>(r.name, null);
      if (!run || run.started !== started) { settledHere.delete(started); break; }
      const it = run.items.find((x) => (r.by === 'key' ? x.key : x.videoId) === id);
      if (it && it.state === 'pending') write({ op: 'runItem', key: r.name + ':' + currentChannel(), by: r.by, id, state: r.state, msg: r.msg, onlyActive: false });
    }
  }
}

// Auto-pilot's cycle reads ytcfg again before it scans (4a T6 review m7): the copy may be from
// page load, and the scan's channel and "Studio has loaded" check use it. The content script sets it.
// A read that fails doesn't end the cycle (its next time is already written): the scan goes on
// with the copy it has, and says so itself if Studio's context is missing (as page.ts scan()).
// A read that names another channel does end it (false): the cycle was started, and its times
// written, for the channel the tick saw; the scan and the trims must not be another one's.
let cfgRefresh: () => Promise<void> = async () => {};
export const setCfgRefresh = (fn: typeof cfgRefresh) => { cfgRefresh = fn; };
async function freshCfg(): Promise<boolean> {
  const ch = currentChannel();
  await cfgRefresh().catch((e) => console.warn('[ytup] ytcfg before an Auto-pilot scan', e));
  if (currentChannel() === ch) return true;
  console.warn('[ytup] the channel changed under an Auto-pilot cycle', ch, currentChannel());
  return false;
}

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
  visible, findText, isDisabled, otherJobBusy, startAdsRun, stopAdsRun, setAdsResult, adsIsOn, adsStep, adsOne, startCollabRun, stopCollabRun, chainAcceptInvites, setCollabResult,
  collabStep, setResult, startTrimRun, stopTrimRun, fuHas, fuAdd, fuOnResult, fuCheck, apPick, apCycle, installConfirmWatch, findConfirmDialog, deepAll, approveConfirm, trimStep, closeDialogs, pickRow, trimOne, tick,
};
