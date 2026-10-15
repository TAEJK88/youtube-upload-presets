import { IMG_EXT, TXT_EXT, VIDEO_EXT } from './constants';
import { L, locale } from './i18n';
import { pad } from './template';
import type { FileMeta, ItemStatus } from './studio/queue-runner';

// The queue's pure helpers the side panel uses too. They are ported here a second time,
// from the same userscript lines as lib/studio/queue-runner.ts (keep the two copies the
// same; nothing checks them now): importing the runner would bring lib/studio/state into the panel, whose
// settings and presets are defaults that never sync there.

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

// อ่าน .txt เป็น UTF-8 ถ้าอ่านแล้วเพี้ยนให้ลองแบบภาษาไทยของ Windows (windows-874)
async function readText(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  return utf8.includes('�') ? new TextDecoder('windows-874').decode(buf) : utf8;
}

const fmtWhen = (ms: number) =>
  new Intl.DateTimeFormat(locale() === 'th-TH' ? 'th-TH-u-ca-gregory' : locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
// แปลง ms <-> ค่าของ <input type=datetime-local> ตามเวลาเครื่อง
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// As lib/studio/queue-runner.ts: the labels are built when asked for, after initI18n().
export const statusLabel = (s: ItemStatus): { text: string; tone: string } => {
  const [text, tone] = STATUS()[s] as [string, string];
  return { text, tone };
};

export { fmtWhen, isImg, isTxt, isVideo, readText, toLocalInput };
