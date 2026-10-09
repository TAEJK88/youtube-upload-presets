import { parseUploadPct } from '../activity';
import { checkTracklist } from '../chapters';
import { DESC_MAX, IMG_EXT, SCHEDULE_MIN_LEAD, TITLE_MAX, TXT_EXT, VIDEO_EXT } from '../constants';
import { L, locale } from '../i18n';
import { visLabels } from '../presets';
import { makeTitle, pad, renderDesc, renderDescFull, renderTags } from '../template';
import { detailsOpen, fillDetails, getDialog, getTitleBox, isVisible, sleep, uploadDialogOpen, waitFor } from './automation';
import { buildVars, chanLabel, channelProblem, getChannel, refreshCfg } from './channel';
import { ui } from './page-ui';
import { bridgeAnswers, dropFiles, getQueueFile, getThumbFile, pageFiles } from './queue-files';
import { setSchedule } from './schedule';
import { SEL } from './sel';
import { activeId, counters, load, presetById, presets, save, saveSettings, settings } from './state';
import { TXT } from './txt';
import {
  ackNoticeDialogs, closeAfterDialogs, closeStudioUploadDialog, dialogError, goToVisibility, injectingFile,
  injectUploadFile, openFilePicker, setThumbnail, thumbUnusable, uploadProgressText,
} from './upload-dialog';
import { videoDuration } from './video-duration';

export type FileSrc = 'bridge' | 'page';
export interface FileMeta { name: string; size: number; type: string }
export interface FileRef extends FileMeta { id: string; src: FileSrc }
// A File handed to addFiles(), tagged with its item / file-store id and where it lives.
export type QFile = File & { qid: string; src: FileSrc };
export const fileMeta = (f: File): FileMeta => ({ name: f.name, size: f.size, type: f.type });

export type ItemStatus = 'pending' | 'uploading' | 'review' | 'done' | 'error';
// One upload history row ('uploads', newest first, at most 1000).
export interface UploadRecord {
  date: string; channel: string; channelName: string; videoId: string; title: string; file: string; size: number;
  txt: string; description: string; publishAt: number | null; visibility: string;
}
// A queue item as stored in chrome.storage.local ('queue'). The userscript kept the File
// itself in `file` / `thumb`; here they hold name / size / type (plus the thumbnail's
// own id), and the File is fetched by id when the item uploads.
export interface QueueItem {
  id: string; // crypto.randomUUID(): also the file-store key, so it must stay unguessable
  src: FileSrc;
  file: FileMeta;
  presetId: string;
  n: number;
  title: string;
  titleEdited: boolean;
  status: ItemStatus;
  msg: string;
  txt: string;
  txtName: string;
  thumb: FileRef | null;
  duration: number;
  durState?: 'loading' | 'ok' | 'fail';
  prev?: UploadRecord | null; // the same file was uploaded to this channel before
  artists?: string;
  artistsEdited?: boolean;
  publishAt?: number | null;
  publishEdited?: boolean;
  publishFinal?: number;
  draftId?: string;
  videoId?: string;
}

// Scheduled videos already on the channel come from the copyright module's youtubei
// calls (Phase 4). Until it sets these hooks the queue only avoids its own items — what
// the userscript did when that module was missing.
export interface ClaimsHooks { listScheduled?: () => Promise<{ videoId: string; at: number }[] | null> }
export let Claims: ClaimsHooks | null = null;
export const setClaims = (c: ClaimsHooks | null) => { Claims = c; };

// What saveMemo() keeps per file (name|size) so re-adding it restores the edits.
interface Memo { title?: string; artists?: string; publishAt?: number; presetId?: string; t: number }

// One Studio tab runs the queue at a time (lib/runner-lock.ts, through the background).
let lock = { acquire: async () => true, release: () => {} };
export const setRunnerLock = (l: typeof lock) => { lock = l; };
// Another Studio tab holds that lock; the content script keeps this fresh (runner:elsewhere).
// This tab's queue is then only a mirror of that tab's: it isn't saved from here, and the
// intercept (which must decide synchronously) leaves Studio's own dialog alone.
let otherTabRuns = false;
export const setOtherTabRuns = (v: boolean) => { otherTabRuns = v; };
export const otherTabRunning = () => otherTabRuns;

// getChannel() falls back to a copy of ytcfg that refreshCfg() made. Read it again right
// before the preflight / start channel checks, so a stale copy can't pass channelProblem().
// The content script sets the reader (MAIN-world ytcfg); without one nothing is refreshed.
type CfgReader = (keys: string[]) => Promise<Record<string, unknown>>;
let cfgReader: CfgReader | null = null;
export const setCfgReader = (r: CfgReader | null) => { cfgReader = r; };
const freshCfg = () => (cfgReader ? refreshCfg(cfgReader) : Promise.resolve());

// @port-begin
// ความคืบหน้าของคลิปที่กำลังอัป · อัปเดตจาก tick ทุก 0.8 วินาที (uploadOne ไม่ต้องรู้เรื่องนี้)
let uploadProg: { pct: number | null; text: string } | null = null; // { pct: 0..1 | null, text: string }
function pollUploadProgress() {
  if (!running) { uploadProg = null; return; }
  const text = uploadProgressText();
  uploadProg = { pct: parseUploadPct(text), text };
}
// ===== คิวอัปโหลด =====
/** @type {{id:number,file:File,presetId:string,n:number,title:string,titleEdited:boolean,status:string,msg:string,ui?:any}[]} */
const queue: QueueItem[] = [];

let running = false;
let stopReq = false;
// ห้ามเปลี่ยนหน้า/สลับช่องระหว่างที่คิวอัปโหลดยังมีไฟล์ (ไฟล์อยู่ในหน่วยความจำของหน้า จะหายถ้าเปลี่ยนหน้า)
const uploadBusy = () => running || queue.some((i) => ['pending', 'uploading', 'review', 'error'].includes(i.status));

const STATUS = () => ({
  pending: [L('รอคิว', 'Queued'), 'muted'],
  uploading: [L('กำลังทำงาน', 'Working'), 'info'],
  review: [L('รอคุณกด Save', 'Waiting for you to Save'), 'warn'],
  done: [L('เสร็จแล้ว', 'Done'), 'ok'],
  error: [L('ผิดพลาด', 'Error'), 'err'],
});

const isVideo = (f: FileMeta) => (f.type || '').startsWith('video/') || VIDEO_EXT.test(f.name);
const isTxt = (f: FileMeta) => TXT_EXT.test(f.name);
const isImg = (f: FileMeta) => (f.type || '').startsWith('image/') || IMG_EXT.test(f.name);
const baseKey = (name: string) => name.replace(/\.[^.]+$/, '').trim().toLowerCase();

// อ่าน .txt เป็น UTF-8 ถ้าอ่านแล้วเพี้ยนให้ลองแบบภาษาไทยของ Windows (windows-874)
async function readText(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  return utf8.includes('�') ? new TextDecoder('windows-874').decode(buf) : utf8;
}

async function attachTxt(it: QueueItem, file: File) {
  it.txt = await readText(file);
  it.txtName = file.name;
}
function attachThumb(it: QueueItem, file: QFile) {
  it.thumb = { id: file.qid, src: file.src, ...fileMeta(file) };
}

// รับไฟล์ปนกันได้: คลิป + .txt + ภาพปก จับคู่ด้วยชื่อไฟล์ (ไม่รวมนามสกุล)
// ไฟล์เก็บข้ามการรีโหลดไม่ได้ แต่ค่าที่พิมพ์แก้ไว้เก็บได้: ชื่อคลิป, ศิลปิน, เวลาปล่อยที่ตั้งเอง, พรีเซ็ต
const memoKey = (it: QueueItem) => it.file.name + '|' + it.file.size;
let memoTimer: ReturnType<typeof setTimeout> | undefined;
function saveMemo() {
  clearTimeout(memoTimer);
  memoTimer = setTimeout(() => {
    const memo = load<Record<string, Memo>>('queueMemo', {});
    for (const it of queue) {
      const k = memoKey(it);
      if (it.status === 'done') { delete memo[k]; continue; }
      if (!(it.status === 'pending' || it.status === 'error')) continue;
      const m: Partial<Memo> = {};
      if (it.titleEdited) m.title = it.title;
      if (it.artistsEdited) m.artists = it.artists;
      if (it.publishEdited && it.publishAt) m.publishAt = it.publishAt;
      if (it.presetId !== activeId) m.presetId = it.presetId;
      if (Object.keys(m).length) memo[k] = { ...m, t: Date.now() };
      else delete memo[k];
    }
    // เก็บแค่ 200 รายการล่าสุด
    const keys = Object.keys(memo).sort((a, b) => memo[b]!.t - memo[a]!.t);
    for (const k of keys.slice(200)) delete memo[k];
    save('queueMemo', memo);
  }, 600);
}
function restoreMemo(items: QueueItem[]): number {
  const memo = load<Record<string, Memo>>('queueMemo', {});
  let n = 0;
  for (const it of items) {
    const m = memo[memoKey(it)];
    if (!m) continue;
    if (m.presetId && presets.some((p) => p.id === m.presetId)) it.presetId = m.presetId;
    if (typeof m.title === 'string') { it.title = m.title; it.titleEdited = true; }
    if (typeof m.artists === 'string') { it.artists = m.artists; it.artistsEdited = true; }
    if (m.publishAt && m.publishAt > Date.now() + SCHEDULE_MIN_LEAD) { it.publishAt = m.publishAt; it.publishEdited = true; }
    n++;
  }
  return n;
}

async function addFiles(fileList: Iterable<QFile>): Promise<void> {
  const files = [...fileList];
  // เรียงตามชื่อแบบตัวเลข (Mix 2 ก่อน Mix 10) — ลำดับในคิว = เลข EP และเวลาปล่อย
  // ข้ามคลิปที่อยู่ในคิวแล้ว (ชื่อ+ขนาดเดียวกัน) กันลากซ้ำแล้วอัปเบิ้ล
  const inQueue = new Set(queue.filter((i) => i.status !== 'done').map((i) => i.file.name + '|' + i.file.size));
  const allVids = files.filter(isVideo).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const vids = allVids.filter((f) => !inQueue.has(f.name + '|' + f.size));
  const dupN = allVids.length - vids.length;
  const added: QueueItem[] = [];
  const chId = getChannel().id;
  const history = getUploads();
  let prevN = 0;
  for (const file of vids) {
    const it: QueueItem = { id: file.qid, src: file.src, file: fileMeta(file), presetId: activeId, n: 0, title: '', titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0 };
    // เคยอัปไฟล์นี้ (ชื่อ+ขนาดเดียวกัน) ขึ้นช่องนี้แล้ว -> ใส่คิวแต่ติดป้ายแดง และเตือนอีกครั้งก่อนเริ่ม (อัปซ้ำโดยตั้งใจยังทำได้)
    it.prev = history.find((u) => u.file === file.name && u.size === file.size && (!chId || u.channel === chId)) || null;
    if (it.prev) prevN++;
    queue.push(it);
    added.push(it);
    it.durState = 'loading';
    videoDuration(file).then((d) => { it.duration = d; it.durState = d ? 'ok' : 'fail'; ui.item(it); }); // ใช้เช็ก timestamp เกินความยาวคลิป
  }
  const byKey = new Map<string, QueueItem>();
  for (const it of queue) if (it.status !== 'done') byKey.set(baseKey(it.file.name), it);

  let txtN = 0, imgN = 0, unmatched = 0, skipped = 0;
  for (const f of files) {
    if (isVideo(f)) continue;
    const it = byKey.get(baseKey(f.name));
    if (isTxt(f) || isImg(f)) {
      if (!it) { unmatched++; continue; }
      if (isTxt(f)) { await attachTxt(it, f); txtN++; }
      else { attachThumb(it, f); imgN++; }
      it.titleEdited = false;
    } else skipped++;
  }

  const parts: string[] = [];
  if (vids.length) parts.push(L(`เพิ่ม ${vids.length} คลิป`, `Added ${vids.length} video(s)`));
  if (txtN) parts.push(L(`คำอธิบาย .txt ${txtN} ไฟล์`, `${txtN} .txt description file(s)`));
  if (imgN) parts.push(L(`ภาพปก ${imgN} ไฟล์`, `${imgN} thumbnail file(s)`));
  if (unmatched) parts.push(L(`ไม่มีคลิปชื่อตรงกัน ${unmatched} ไฟล์`, `${unmatched} file(s) with no matching video name`));
  const restored = restoreMemo(added); // หลังแนบ .txt (การแนบรีเซ็ตชื่อเป็นค่าจากพรีเซ็ต)
  if (restored) parts.push(L(`ใช้ค่าที่แก้ไว้เดิม ${restored} คลิป`, `Restored your edits for ${restored} video(s)`));
  if (prevN) parts.push(L(`เคยอัปขึ้นช่องนี้แล้ว ${prevN} คลิป (ป้ายแดง)`, `${prevN} already uploaded to this channel (red badge)`));
  if (dupN) parts.push(L(`มีในคิวแล้ว ${dupN} คลิป`, `${dupN} already in the queue`));
  if (skipped) parts.push(L(`ข้าม ${skipped} ไฟล์`, `Skipped ${skipped} file(s)`));
  if (parts.length) ui.toast(parts.join(' · '));
  ui.queue();
}

// แจกเลข {n} ตามลำดับในคิว แยกตามพรีเซ็ต แล้วสร้างชื่อใหม่ให้คลิปที่ยังไม่ได้แก้ชื่อเอง
function assignNumbers() {
  const next: Record<string, number> = {};
  for (const it of queue) {
    const base = next[it.presetId] ?? (counters[it.presetId] || 0);
    if (it.status === 'uploading' || it.status === 'review') {
      next[it.presetId] = Math.max(base, it.n);
    } else if (it.status === 'pending' || it.status === 'error') {
      it.n = base + 1;
      next[it.presetId] = it.n;
      if (!it.titleEdited) it.title = makeTitle(presetById(it.presetId), itemVars(it));
    }
  }
}

// เวลาปล่อยของแต่ละคลิป: แก้เองในการ์ด หรือคำนวณจากเวลาเริ่ม + ลำดับในคิว x ระยะห่าง
const scheduleOn = () => settings.schedule.on && !!settings.schedule.start;
const stepMs = () => Math.max(1, Number(settings.schedule.every) || 1) * (settings.schedule.unit === 'hour' ? 3600e3 : 86400e3);
// คลิปที่อัปเสร็จจะจำเวลาไว้ (publishFinal) และเลื่อนเวลาเริ่มไปช่องถัดไป -> ล้างรายการแล้วเพิ่มใหม่ เวลาจะไม่ชนของเดิม
function itemPublishAt(it: QueueItem): number | null {
  if (it.publishFinal) return it.publishFinal;
  if (!scheduleOn()) return null;
  if (it.publishEdited && it.publishAt) return it.publishAt;
  return queueSlots().map.get(it) ?? null;
}
// ช่องเวลาของคลิปในคิวตามลำดับ: เริ่มที่ effectiveStart แล้วทีละ step
// ข้ามช่วงที่ (ก) มีคลิปตั้งเวลาไว้ในช่องแล้ว หรือ (ข) มีคลิปในคิวที่ตั้งเวลาเอง — ถือว่าชนเมื่อห่างกันไม่ถึงครึ่ง step
// (ปล่อยวันละคลิป: คลิปที่ตั้งไว้ 19:00 วันเดียวกันกับช่อง 08:00 ถือว่าชน -> เลื่อนไปวันถัดไป)
function queueSlots() {
  const map = new Map<QueueItem, number>();
  const start = effectiveStart();
  if (!start) return { map, skipped: 0 };
  const step = stepMs();
  const live = (x: QueueItem) => ['pending', 'uploading', 'review'].includes(x.status);
  const taken = [
    ...takenSlots().map((x) => x.at),
    ...queue.filter((x) => live(x) && x.publishEdited && x.publishAt).map((x) => x.publishAt!),
  ];
  const busy = (t: number) => taken.some((a) => Math.abs(a - t) < step / 2);
  let t = start;
  let skipped = 0;
  for (const x of queue.filter((q) => live(q) && !(q.publishEdited && q.publishAt))) {
    for (let g = 0; busy(t) && g < 1000; g++) { t += step; skipped++; }
    map.set(x, t);
    t += step;
  }
  return { map, skipped };
}
// คลิปที่ตั้งเวลาไว้ในช่องปัจจุบัน (แคชต่อช่อง 5 นาที) — ไม่นับคลิปที่คิวนี้เพิ่งอัปเอง
const chanSched: { ch: string; at: number; list: { videoId: string; at: number }[]; loading: Promise<void> | null } = { ch: '', at: 0, list: [], loading: null };
const takenSlots = () => (chanSched.ch && chanSched.ch === getChannel().id
  ? chanSched.list.filter((x) => !queue.some((i) => i.videoId && i.videoId === x.videoId)) : []);
function refreshChanSched(force = false): Promise<void> {
  const ch = getChannel().id;
  if (!ch || !Claims || !Claims.listScheduled) return Promise.resolve();
  if (!force && chanSched.ch === ch && Date.now() - chanSched.at < 300e3) return Promise.resolve();
  if (chanSched.loading) return chanSched.loading;
  chanSched.loading = (async () => {
    try {
      const list = await Claims!.listScheduled!();
      if (list) { chanSched.list = list; chanSched.ch = ch; }
    } catch (e) {
      console.warn('[YT Presets] scheduled list', e);
    } finally {
      chanSched.at = Date.now(); // ล้มเหลวก็พัก 5 นาที ไม่ยิงซ้ำรัว ๆ
      if (chanSched.ch !== ch) { chanSched.ch = ch; chanSched.list = []; }
      chanSched.loading = null;
      ui.schedule();
    }
  })();
  return chanSched.loading;
}
// เวลาเริ่มที่ใช้จริง: ถ้าเวลาที่ตั้งไว้ผ่านไปแล้ว (หรือเหลือไม่ถึง 15 นาที) เลื่อน "ทั้งชุด" ไปช่องแรกที่ยังตั้งได้
// เลื่อนทีละคลิปไม่ได้ — คลิปที่ถูกเลื่อนจะไปชนช่องของคลิปถัดไป (เช่น 2 คลิปได้ 08:00 วันเดียวกัน)
function effectiveStart() {
  const start = new Date(settings.schedule.start).getTime();
  if (!start) return 0;
  const step = stepMs();
  const floor = Date.now() + SCHEDULE_MIN_LEAD;
  return start < floor ? start + Math.ceil((floor - start) / step) * step : start;
}
const startIsPast = () => scheduleOn() && new Date(settings.schedule.start).getTime() < Date.now() + SCHEDULE_MIN_LEAD;
const scheduleProblem = (at: number | null | undefined) => (at && at < Date.now() + SCHEDULE_MIN_LEAD ? L('เวลาปล่อยต้องอยู่ในอนาคตอย่างน้อย 15 นาที', 'Release time must be at least 15 minutes in the future') : '');
const fmtWhen = (ms: number) =>
  new Intl.DateTimeFormat(locale() === 'th-TH' ? 'th-TH-u-ca-gregory' : locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
// แปลง ms <-> ค่าของ <input type=datetime-local> ตามเวลาเครื่อง
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const itemVars = (it: QueueItem) =>
  buildVars(it.file.name, it.n, it.txt, { preset: presetById(it.presetId), artists: it.artistsEdited ? it.artists : '' });
// ผลตรวจ tracklist ของคลิปในคิว (เช็กจากคำอธิบายที่จะอัปจริง)
function itemTracklist(it: QueueItem) {
  const full = renderDescFull(presetById(it.presetId), itemVars(it));
  return checkTracklist(full.slice(0, DESC_MAX), full.length, it.duration || 0);
}

function setItem(it: QueueItem, status: ItemStatus, msg = '') {
  // สลับคลิป: ค่าความคืบหน้าของคลิปก่อนหน้าใช้ต่อไม่ได้ (poll รอบถัดไปอีก 0.8 วินาที)
  if (it.status !== status && (status === 'uploading' || it.status === 'uploading')) uploadProg = null;
  it.status = status;
  it.msg = msg;
  ui.item(it);
  ui.run();
}

async function uploadOne(it: QueueItem): Promise<void> {
  const p = presetById(it.presetId);
  const vars = itemVars(it);
  const title = it.titleEdited ? it.title.slice(0, TITLE_MAX) : makeTitle(p, vars);

  const publishAt = itemPublishAt(it);
  if (scheduleProblem(publishAt)) throw new Error(`${scheduleProblem(publishAt)} (${fmtWhen(publishAt!)})`);
  if (uploadDialogOpen()) throw new Error(L('มีหน้าต่างอัปโหลดค้างอยู่ ปิดก่อนแล้วกดเริ่มใหม่', 'An upload dialog is still open. Close it, then start again'));
  const file = await getQueueFile(it.id, it.src);
  const thumbFile = settings.thumb && it.thumb ? await getThumbFile(it.thumb) : null;
  setItem(it, 'uploading', L('กำลังเปิดหน้าต่างอัปโหลด…', 'Opening upload dialog…'));
  const { input, err: pickErr } = await openFilePicker();
  if (!input) {
    throw new Error(L(`เปิดหน้าต่างอัปโหลดของ Studio ไม่ได้ (${pickErr}) — ลองเปิดหน้าต่างอัปโหลดเองค้างไว้ที่หน้า "เลือกไฟล์" แล้วกด "ลองใหม่" สคริปต์จะใช้หน้าต่างนั้นต่อ`, `Could not open Studio's upload dialog (${pickErr}) — try opening the upload dialog yourself, leave it on the "Select files" page, then click "Retry". The script will continue from that dialog`));
  }

  if (!(await injectUploadFile(input, file))) {
    closeStudioUploadDialog();
    throw new Error(L('Studio ไม่รับไฟล์ที่สคริปต์ส่งให้ (ทั้งแบบเลือกไฟล์และแบบลากวาง) — ส่งข้อความนี้ให้ผู้พัฒนาสคริปต์', 'Studio did not accept the file sent by the script (via both file picker and drag-and-drop) — send this message to the script developer'));
  }

  setItem(it, 'uploading', L('กำลังอัปโหลดและกรอกรายละเอียด…', 'Uploading and filling in details…'));
  const titleBox = await waitFor(() => {
    const t = getTitleBox(getDialog());
    return (isVisible(t) && t) || (dialogError() && 'error');
  }, 60000);
  if (!titleBox || titleBox === 'error') throw new Error(dialogError() || L('ไม่พบหน้ากรอกรายละเอียด', 'Details page not found'));
  await waitFor(() => titleBox.textContent.trim(), 8000); // รอ Studio ใส่ชื่อไฟล์ก่อน จะได้ไม่ทับของเรา
  await sleep(800);

  const description = renderDesc(p, vars);
  const tagsOk = await fillDetails({ title, description, tags: renderTags(p, vars) });
  it.draftId = dialogVideoId(); // อาจยังไม่มีลิงก์ จะอ่านซ้ำก่อนกด Save
  const vis = p.visibility || 'PRIVATE';
  let note = tagsOk ? '' : L(' (หาช่องแท็กไม่เจอ)', ' (tags field not found)');
  if (settings.thumb && it.thumb) {
    // Studio เปิดให้ใส่ภาพปกหลังวิดีโออัปขึ้นไปแล้ว -> ลองทุก ~10 วินาทีจนสำเร็จ หรือครบเวลาที่ตั้งไว้
    const t0 = Date.now();
    const limit = Math.max(1, Number(settings.thumbWaitMin) || 120) * 60e3;
    let err = '';
    for (let round = 1; ; round++) {
      const prog = uploadProgressText();
      setItem(it, 'uploading', L(`รอใส่ภาพปก (รอบที่ ${round})${prog ? ' · ' + prog : ''}`, `Waiting to set thumbnail (round ${round})${prog ? ' · ' + prog : ''}`));
      err = await setThumbnail(thumbFile!, 3000);
      if (!err || thumbUnusable(it.thumb) || stopReq || !detailsOpen() || Date.now() - t0 > limit) break;
      await sleep(7000);
    }
    if (err) note += L(` (ภาพปก: ${err}${Date.now() - t0 > limit ? ` · รอเกิน ${settings.thumbWaitMin} นาที` : ''})`, ` (thumbnail: ${err}${Date.now() - t0 > limit ? ` · waited over ${settings.thumbWaitMin} min` : ''})`);
  }

  // ตั้งเวลาปล่อย: ไปหน้า Visibility แล้วกรอกวัน/เวลา (คลิปจะเป็นส่วนตัวจนถึงเวลาที่ตั้ง)
  if (publishAt) {
    setItem(it, 'uploading', L(`กำลังตั้งเวลาปล่อย ${fmtWhen(publishAt)}…`, `Scheduling for ${fmtWhen(publishAt)}…`));
    // เช็กซ้ำ: ระหว่างรอภาพปก (อาจนานเป็นชั่วโมง) เวลาที่ตั้งไว้อาจผ่านไปแล้ว
    const late = scheduleProblem(publishAt);
    if (late) throw new Error(late);
    if (!(await goToVisibility(null))) throw new Error(L('ไปหน้า Visibility ไม่สำเร็จ', 'Could not go to the Visibility page'));
    await sleep(600);
    const err = await setSchedule(new Date(publishAt));
    if (err) throw new Error(L('ตั้งเวลาไม่สำเร็จ: ', 'Scheduling failed: ') + err);
  }
  const visText = publishAt ? L(`⏰ ปล่อย ${fmtWhen(publishAt)}`, `⏰ Releases ${fmtWhen(publishAt)}`) : visLabels()[vis];

  if (settings.autoSave) {
    setItem(it, 'uploading', L('กำลังบันทึก…', 'Saving…'));
    if (!publishAt && !(await goToVisibility(vis))) throw new Error(L('ไปหน้า Visibility ไม่สำเร็จ', 'Could not go to the Visibility page'));
    await sleep(600);
    // ปุ่ม Save/Schedule: ytcp-button#done-button > button (กดตัว button ข้างใน)
    const done = await waitFor(() => {
      const host = getDialog()?.querySelector<HTMLElement>(SEL.doneButton);
      const b = host && (host.querySelector('button') || host) as HTMLButtonElement;
      return isVisible(host) && !host.hasAttribute('disabled') && !b!.disabled && b!.getAttribute('aria-disabled') !== 'true' && b;
    }, 20000);
    if (!done) throw new Error(L('กดปุ่ม Save ไม่ได้ (ปุ่มยังกดไม่ได้ — อาจยังมีขั้นที่ต้องตอบ)', 'Could not click Save (button still disabled — a step may still need an answer)'));
    it.draftId = it.draftId || dialogVideoId();
    setItem(it, 'uploading', L('กด Save แล้ว รอหน้าต่างปิด…', 'Clicked Save, waiting for the dialog to close…'));
    done.click();
    // หลังกด Save/Schedule อาจมีป๊อปอัปแจ้งเตือน เช่น "We're still checking your content" (ปุ่ม Got it) -> กดรับทราบให้
    const closedOk = () => { ackNoticeDialogs(); return !uploadDialogOpen(); };
    if (!(await waitFor(closedOk, 30000, 500))) {
      // บางครั้งต้องกดซ้ำ (เช่น Studio ยังบันทึกข้อมูลก่อนหน้าอยู่)
      if (isVisible(done)) done.click();
      if (!(await waitFor(closedOk, 30000, 500))) throw new Error(L('กด Save แล้วแต่หน้าต่างไม่ปิด — กด Save เองในหน้าต่าง แล้วกดลองใหม่', 'Clicked Save but the dialog did not close — click Save yourself in the dialog, then click Retry'));
    }
  } else {
    if (settings.autoNext && !publishAt) await goToVisibility(vis);
    setItem(it, 'review', L('ตรวจข้อมูลในหน้าต่าง YouTube แล้วกด Save เพื่อไปไฟล์ถัดไป', 'Check the details in the YouTube dialog, then click Save to move to the next file') + note);
    await waitFor(() => (it.draftId = it.draftId || dialogVideoId()) || !uploadDialogOpen(), 20000, 500);
    // กดหยุดระหว่างนี้ = หยุดหลังคลิปนี้ (ไม่ปิดหน้าต่างที่ผู้ใช้กำลังตรวจทิ้ง) — คิวจะหยุดเองหลังคุณกด Save
    await waitFor(() => { ackNoticeDialogs(); return !uploadDialogOpen(); }, 3600000, 1000);
    if (uploadDialogOpen()) throw new Error(L('รอให้กด Save นานเกิน 1 ชั่วโมง', 'Waited over 1 hour for you to click Save'));
  }
  await sleep(1500);
  closeAfterDialogs();

  counters[p.id] = Math.max(counters[p.id] || 0, it.n);
  save('counters', counters);
  if (publishAt) {
    it.publishFinal = publishAt;
    if (!it.publishEdited) {
      settings.schedule.start = toLocalInput(publishAt + stepMs()); // คลิปถัดไปต่อจากคลิปนี้
      saveSettings();
    }
  }
  const videoId = it.draftId || '';
  logUpload({ videoId, title, file: it.file.name, size: it.file.size, txt: vars.txt, description, publishAt, visibility: publishAt ? 'SCHEDULED' : vis });
  it.videoId = videoId;
  setItem(it, 'done', `${title} · ${visText}${note}`);
  ui.schedule();
}

// รหัสวิดีโอจากลิงก์ในหน้าต่างอัปโหลด (youtu.be/xxxx)
function dialogVideoId() {
  const a = getDialog()?.querySelector<HTMLAnchorElement>(SEL.videoLink);
  const m = a && a.href.match(/(?:youtu\.be\/|\/video\/|[?&]v=|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : '';
}

// ประวัติการอัปโหลด (ใช้ตอนแก้ tracklist หลังตัดลิขสิทธิ์ และดูว่าคลิปไหนตั้งเวลาไว้)
const getUploads = () => load<UploadRecord[]>('uploads', []);
function logUpload(rec: Omit<UploadRecord, 'date' | 'channel' | 'channelName'>) {
  const ch = getChannel();
  const list = getUploads();
  list.unshift(Object.assign({ date: new Date().toISOString(), channel: ch.id, channelName: chanLabel(ch) }, rec));
  save('uploads', list.slice(0, 1000));
}
const uploadOf = (videoId: string) => (videoId ? getUploads().find((u) => u.videoId === videoId) : null);
function uploadsCSV() {
  const head = ['date', 'channel', 'title', 'file', 'video_id', 'url', 'visibility', 'publish_at'];
  const rows = getUploads().map((u) => [u.date, u.channelName || u.channel, u.title, u.file, u.videoId,
    u.videoId ? 'https://youtu.be/' + u.videoId : '', u.visibility, u.publishAt ? new Date(u.publishAt).toISOString() : '']);
  downloadCSV([head, ...rows], `uploads-${new Date().toISOString().slice(0, 10)}.csv`);
}
function downloadCSV(rows: unknown[][], name: string) {
  const csv = '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

async function runQueue() {
  if (running) return;
  const pendingN = queue.filter((i) => i.status === 'pending').length;
  if (!pendingN) return ui.toast(L('ไม่มีคลิปที่รอคิว', 'No videos waiting in the queue'));
  const problem = channelProblem();
  if (problem) {
    ui.openDrawer();
    return ui.toast('⛔ ' + problem);
  }
  // tracklist ที่ YouTube จะไม่สร้าง Chapters ให้ — ถามก่อนเริ่ม (อัปไปแล้วต้องตามแก้คำอธิบายทีละคลิป)
  assignNumbers();
  const pendingItems = queue.filter((i) => i.status === 'pending');
  const badTl = pendingItems.filter((i) => i.txt).map((i) => [i, itemTracklist(i)] as const).filter(([, tc]) => tc.errors.length);
  const badTime = pendingItems.filter((i) => scheduleProblem(itemPublishAt(i)));
  const prevUp = pendingItems.filter((i) => i.prev);
  await refreshChanSched(true); // เช็กคลิปที่ตั้งเวลาไว้ในช่องล่าสุด ก่อนแสดงเวลาที่จะใช้จริง
  // ยืนยันครั้งเดียวในแผง: ช่องปลายทาง + สรุปคิว + ปัญหาที่ควรรู้ก่อนเริ่ม
  if (settings.confirmStart || badTl.length || badTime.length || prevUp.length) {
    const go = await ui.confirmStart();
    if (!go) return;
    if (running) return;
  }
  if (!(await lock.acquire())) return ui.toast(L('มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่', 'Another Studio tab is already running the queue'));
  if (running) return;
  running = true;
  stopReq = false;
  ui.run();
  let ok = 0;
  try {
    while (!stopReq) {
      assignNumbers();
      const it = queue.find((i) => i.status === 'pending');
      if (!it) break;
      const problem = channelProblem();
      if (problem) {
        ui.toast(L('⛔ หยุดคิว: ', '⛔ Queue stopped: ') + problem);
        break;
      }
      try {
        await uploadCurrent(it);
        ok++;
      } catch (e: any) {
        console.error('[YT Presets]', e);
        it.draftId = it.draftId || dialogVideoId();
        setItem(it, 'error', e.message + (it.draftId ? L(` · ไฟล์ขึ้นไปเป็นฉบับร่างแล้ว (${it.draftId}) ลบใน Content ก่อนกดลองใหม่ จะได้ไม่ซ้ำ`, ` · The file is already uploaded as a draft (${it.draftId}). Delete it in Content before retrying to avoid duplicates`) : ''));
        closeStudioUploadDialog();
        if (TXT.uploadLimit.test(e.message)) break;
      }
      if (!stopReq && queue.some((i) => i.status === 'pending')) await sleep(settings.delay * 1000);
    }
  } finally {
    running = false;
    lock.release();
    assignNumbers();
    ui.queue();
    const errN = queue.filter((i) => i.status === 'error').length;
    const left = queue.filter((i) => i.status === 'pending').length;
    const msg = stopReq ? L(`หยุดคิวแล้ว (สำเร็จ ${ok} คลิป)`, `Queue stopped (${ok} video(s) done)`) : L(`คิวเสร็จแล้ว สำเร็จ ${ok} คลิป ✅`, `Queue finished: ${ok} video(s) done ✅`);
    ui.toast(msg);
    const clean = !errN && !left;
    ui.notifyDone(clean ? L('อัปโหลดเสร็จแล้ว ✅', 'Upload finished ✅') : L('คิวหยุด — มีคลิปต้องดู ⚠️', 'Queue stopped — needs attention ⚠️'),
      `${chanLabel(getChannel())} · ` + L(`สำเร็จ ${ok}`, `${ok} done`) + (errN ? L(` · ผิดพลาด ${errN}`, ` · ${errN} error(s)`) : '') + (left ? L(` · ค้าง ${left}`, ` · ${left} left`) : ''), clean);
    ui.setTitleMark(document.hasFocus() ? '' : clean ? '✅' : '⚠️');
  }
}
// @port-end

// The item the run is working on, from before its file is fetched until it is done or
// has failed. Remove leaves it alone: while its file comes, its status is still 'pending'.
let current: string | null = null;
export const currentItemId = () => current;
// Torn down (the extension reloaded under the page; content-ui's dispose sets it): a run
// still in flight must not go on in Studio. The check here comes before the file fetch;
// the UI's item() throws from then on, so the setItem() before the Save click stops the
// item, and the error path's setItem() stops it before it closes Studio's dialog.
let torn = false;
export const setTornDown = (v: boolean) => { torn = v; };
export const tornDown = () => torn;
export const tornError = () => new Error(L('ส่วนขยายถูกโหลดใหม่ — หยุดคิวในหน้านี้แล้ว', 'The extension was reloaded — the queue stopped in this page'));
async function uploadCurrent(it: QueueItem): Promise<void> {
  if (torn) throw tornError();
  current = it.id;
  try {
    await uploadOne(it);
  } finally {
    current = null;
  }
}

// Returns a disposer: an orphaned listener (extension reloaded under a live page) would
// still close Studio's dialog and swallow the user's files.
export function installIntercept(): () => void {
  const ac = new AbortController();
  const { signal } = ac;
  // @port-begin
  // ดักการเลือก/ลากหลายไฟล์ในหน้าต่างของ Studio -> ส่งเข้าคิวของสคริปต์แทน
  document.addEventListener(
    'change',
    (e: any) => {
      const t = e.target;
      if (!settings.intercept || otherTabRuns || !(t instanceof HTMLInputElement) || t.type !== 'file') return;
      if (!t.closest(SEL.dialog) || t.files!.length < 2) return;
      e.stopImmediatePropagation();
      addQueued(pageFiles(t.files!));
      t.value = '';
      closeStudioUploadDialog();
      ui.openDrawer('queue');
    },
    { capture: true, signal }
  );
  document.addEventListener(
    'drop',
    (e: any) => {
      if (injectingFile || !settings.intercept || otherTabRuns || !e.target.closest?.(SEL.dialog)) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length < 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      addQueued(pageFiles(files));
      closeStudioUploadDialog();
      ui.openDrawer('queue');
    },
    { capture: true, signal }
  );
  // @port-end
  return () => ac.abort();
}

// The drawer's Start button: runQueue() after reading the channel again, and after
// making sure the file bridge answers when a pending item's file comes from it (asking
// for the first such file once is the cheapest probe; it is read again when it uploads).
// A wrong channel is left to runQueue(), which says so first.
// `seen` is what the user confirmed (startSummary's channel and pending items): the run
// starts only if both are still what they were.
export interface StartBinding { channelId: string; ids: string[]; editRev: number }
// Bumped by every edit the side panel makes to an item (queue-edit.ts, followStoredChanges):
// a release time or preset changed after the summary must not start with the old summary's OK.
// Not content-ui's `rev`: duration reads and progress bump that one too.
let editRev = 0;
export const getEditRev = () => editRev;
export const bumpEditRev = () => {
  editRev++;
};
const pendingIds = () => queue.filter((i) => i.status === 'pending').map((i) => i.id);
function bindingProblem(seen: StartBinding): string {
  if (getChannel().id !== seen.channelId) return L('ช่องเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', 'The channel changed after you confirmed — click Start again to see the new summary');
  if (pendingIds().join('\n') !== seen.ids.join('\n')) return L('คิวเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', 'The queue changed after you confirmed — click Start again to see the new summary');
  if (seen.editRev !== editRev) return L('คิวเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', 'The queue changed after you confirmed — click Start again to see the new summary');
  return '';
}
export async function startQueue(seen: StartBinding): Promise<void> {
  await freshCfg();
  if (running) return runQueue();
  let problem = bindingProblem(seen);
  if (problem) return ui.toast(problem);
  const next = queue.find((i) => i.status === 'pending' && i.src === 'bridge');
  if (!channelProblem() && next && !(await bridgeAnswers(next.id))) {
    return ui.toast(L('แผงด้านข้างไม่ตอบเรื่องไฟล์ — โหลดแท็บ Studio ใหม่ แล้วกดเริ่มอีกครั้ง', "The side panel's file access is not answering — reload the Studio tab, then start again"));
  }
  // The probe can take seconds: check again right before the run.
  problem = bindingProblem(seen);
  if (problem) return ui.toast(problem);
  return runQueue();
}

// The userscript built STATUS once at load; here that is before initI18n() has read the
// language, so the labels are built when asked for.
export const statusLabel = (s: ItemStatus): { text: string; tone: string } => {
  const [text, tone] = STATUS()[s] as [string, string];
  return { text, tone };
};

// The drawer's Stop button set this directly.
export const requestStop = () => {
  stopReq = true;
};

const queueRefs = () => queue.flatMap((it) => [{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])]);

// addFiles(), then let go of files no item ended up using: a .txt once read, names that
// matched no video, a thumbnail another one replaced.
export async function addQueued(files: QFile[]): Promise<void> {
  const before = queueRefs();
  await addFiles(files);
  const kept = new Set(queueRefs().map((r) => r.id));
  dropFiles([...files.map((f) => ({ id: f.qid, src: f.src })), ...before].filter((r) => !kept.has(r.id)));
}

// What the userscript's start dialog showed (runQueue's ask()), as data: the side panel
// shows it and answers with queue:start(true).
export interface StartSummary {
  pendingN: number;
  channel: { id: string; name: string; avatar: string };
  ids: string[]; // the pending items, in queue order; queue:start sends them back
  editRev: number; // edits so far; queue:start sends it back
  times: number[]; // release times, earliest first; empty = released per preset
  vis: string; // the presets' visibilities
  noTxt: number;
  noThumb: number;
  badTime: { name: string; at: number }[];
  prevUp: { name: string; title: string }[];
  badTl: { name: string; error: string }[];
  needsConfirm: boolean;
}

export async function startSummary(): Promise<StartSummary | { error: string }> {
  const pendingN = queue.filter((i) => i.status === 'pending').length;
  if (!pendingN) return { error: L('ไม่มีคลิปที่รอคิว', 'No videos waiting in the queue') };
  await freshCfg();
  const problem = channelProblem();
  if (problem) return { error: '⛔ ' + problem };
  assignNumbers();
  ui.queue();
  const pendingItems = queue.filter((i) => i.status === 'pending');
  const badTl = pendingItems.filter((i) => i.txt).map((i) => [i, itemTracklist(i)] as const).filter(([, tc]) => tc.errors.length);
  const badTime = pendingItems.filter((i) => scheduleProblem(itemPublishAt(i)));
  const prevUp = pendingItems.filter((i) => i.prev);
  await refreshChanSched(true);
  const ch = getChannel();
  return {
    pendingN,
    channel: { id: ch.id, name: chanLabel(ch), avatar: ch.avatar },
    ids: pendingItems.map((i) => i.id),
    editRev,
    times: pendingItems.map(itemPublishAt).filter((t): t is number => !!t).sort((a, b) => a - b),
    vis: [...new Set(pendingItems.map((i) => presetById(i.presetId).visibility || 'PRIVATE'))].join(', '),
    noTxt: pendingItems.filter((i) => !i.txt).length,
    noThumb: settings.thumb ? pendingItems.filter((i) => !i.thumb).length : 0,
    badTime: badTime.map((i) => ({ name: i.file.name, at: itemPublishAt(i) ?? 0 })),
    prevUp: prevUp.map((i) => ({ name: i.file.name, title: i.prev?.title || i.prev?.videoId || '' })),
    badTl: badTl.map(([i, tc]) => ({ name: i.file.name, error: tc.errors[0] ?? '' })),
    needsConfirm: !!(settings.confirmStart || badTl.length || badTime.length || prevUp.length),
  };
}

export {
  uploadProg, pollUploadProgress, queue, running, stopReq, uploadBusy, isVideo, isTxt, isImg, baseKey, readText,
  saveMemo, restoreMemo, addFiles, assignNumbers, scheduleOn, stepMs, itemPublishAt, queueSlots, takenSlots,
  refreshChanSched, effectiveStart, startIsPast, scheduleProblem, fmtWhen, toLocalInput, itemVars, itemTracklist,
  setItem, uploadOne, dialogVideoId, getUploads, logUpload, uploadOf, uploadsCSV, downloadCSV, runQueue,
};
