import { L } from '../i18n';
import { sendMessage } from '../messages';
import type { FileRef, FileSrc, QFile } from './queue-runner';

// Where a queue item's File comes from at upload time:
//   'bridge' — dropped on the side panel; its handle sits in the extension's IndexedDB
//              under the item id and is read through the file-bridge iframe.
//   'page'   — picked in Studio's own upload dialog (the intercept); kept in this page only.
const local = new Map<string, File>();
let bridge: { getFile(id: string): Promise<File> } | null = null;
export const setBridge = (b: typeof bridge) => { bridge = b; };

const tag = (file: File, qid: string, src: FileSrc): QFile => Object.assign(file, { qid, src });

export const pageFiles = (list: ArrayLike<File>): QFile[] =>
  Array.from(list, (f) => {
    const id = crypto.randomUUID(); // unguessable: see lib/file-bridge.ts
    local.set(id, f);
    return tag(f, id, 'page');
  });

// The side panel stored a handle per id; fetch them all, keep what could be read.
export async function bridgeFiles(ids: string[]): Promise<{ files: QFile[]; failed: { id: string; reason: string }[] }> {
  const files: QFile[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      files.push(tag(await getQueueFile(id, 'bridge'), id, 'bridge'));
    } catch (e) {
      failed.push({ id, reason: (e as Error).message });
    }
  }
  return { files, failed };
}

// The bridge answers with codes (lib/file-bridge.ts readHandle); the queue shows sentences.
function reason(code: string): string {
  if (code === 'missing') return L('ไม่พบไฟล์นี้แล้ว — เพิ่มไฟล์อีกครั้ง', 'This file is no longer available — add it again');
  if (code === 'permission') return L('ยังไม่ได้อนุญาตให้อ่านไฟล์ — กด "อนุญาตอีกครั้ง" ในแผงด้านข้าง', 'No permission to read this file — click "Re-grant access" in the side panel');
  // Assumed until README item 16 is recorded: Re-grant can't lift a block in the same browser
  // session (requestPermission() answers 'denied' without asking; 3b review R2-m2).
  if (code === 'denied') return L('เบราว์เซอร์บล็อกการอ่านไฟล์นี้ — ลบออกจากคิวแล้วเพิ่มไฟล์อีกครั้ง', 'The browser blocked reading this file — remove it from the queue and add it again');
  if (code === 'read') return L('อ่านไฟล์ไม่ได้ (ถูกย้ายหรือเปลี่ยนชื่อ?) — เพิ่มไฟล์อีกครั้ง', 'Could not read this file (moved or renamed?) — add it again');
  return L(`ดึงไฟล์จากแผงด้านข้างไม่ได้ (${code})`, `Could not get the file from the side panel (${code})`);
}

export async function getQueueFile(id: string, src: FileSrc): Promise<File> {
  if (src === 'page') {
    const f = local.get(id);
    if (!f) throw new Error(L('ไฟล์นี้มาจากหน้าต่างอัปโหลดของ Studio และหายไปเมื่อโหลดหน้าใหม่ — เพิ่มไฟล์อีกครั้ง', "This file came from Studio's own upload dialog and was lost when the page reloaded — add it again"));
    return f;
  }
  if (!bridge) throw new Error(reason('bridge not ready'));
  try {
    return await bridge.getFile(id);
  } catch (e) {
    throw new Error(reason(e instanceof Error ? e.message : String(e)));
  }
}

// A thumbnail that can't be read fails its item, and the message says it was the thumbnail.
export async function getThumbFile(ref: FileRef): Promise<File> {
  try {
    return await getQueueFile(ref.id, ref.src);
  } catch (e) {
    throw new Error(L(`ภาพปก "${ref.name}": `, `Thumbnail "${ref.name}": `) + (e as Error).message);
  }
}

// Before a run: does the bridge answer at all? A file it hands over, or a code about the
// file itself ('missing', 'read'), means yes; no bridge, a bridge error, or silence for `ms`
// means no ('silent'). Without this every item would fail after the bridge's own timeouts
// (30 s, then 30 s more with a fresh frame). 'permission' answers too, but is told apart:
// after a browser restart every queued file has lost read access, and the run would fail
// them one by one until the user re-grants in the side panel. 'denied' (a blocked prompt)
// is about that file only: it fails its own item, as the panel's Start gate expects.
export type BridgeProbe = 'answers' | 'permission' | 'silent';
const FILE_CODES = new Set(['missing', 'read', 'denied']);
export async function probeBridge(id: string, ms = 10_000): Promise<BridgeProbe> {
  if (!bridge) return 'silent';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silent = new Promise<BridgeProbe>((resolve) => { timer = setTimeout(() => resolve('silent'), ms); });
  const answer = bridge.getFile(id).then(
    (): BridgeProbe => 'answers',
    (e: unknown): BridgeProbe => {
      const code = e instanceof Error ? e.message : String(e);
      return code === 'permission' ? 'permission' : FILE_CODES.has(code) ? 'answers' : 'silent';
    },
  );
  try {
    return await Promise.race([answer, silent]);
  } finally {
    clearTimeout(timer);
  }
}

// Forget files no queue item needs any more (the side panel's handles via the background).
export function dropFiles(refs: Pick<FileRef, 'id' | 'src'>[]): void {
  const ids: string[] = [];
  for (const r of refs) {
    if (r.src === 'page') local.delete(r.id);
    else ids.push(r.id);
  }
  if (ids.length) sendMessage('files:delete', ids).catch((e) => console.warn('[ytup] files:delete', e));
}
