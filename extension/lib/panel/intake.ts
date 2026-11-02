import { handles as held } from '../file-handles';
import { deleteHandle, putHandle } from '../file-store';
import { L } from '../i18n';

// Files dropped on the panel or picked with its buttons (UI section 3500–3591). Their handles
// go into the extension's IndexedDB under fresh ids — the queue item ids, which must stay
// unguessable (lib/file-bridge.ts) — and the Studio tab fetches each File through the bridge.

export const hasFiles = (dt: DataTransfer | null | undefined) => [...(dt?.types ?? [])].includes('Files');

// getAsFileSystemHandle() must be called for every item inside the drop event, before the
// first await: the DataTransfer is emptied afterwards.
export const dropHandles = (dt: DataTransfer | null | undefined): Promise<(FileSystemHandle | null)[]> =>
  Promise.all([...(dt?.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFileSystemHandle()));

// Every file a walk takes is written to IndexedDB here and read through the bridge in the
// Studio tab, one after another, whether it is a video or not. A folder with more files than
// this is not a folder of videos (a drive, a project with its dependencies): it is refused
// with a message, and nothing of the drop or the pick is queued. The count is of the files
// taken from all the folders of one drop or pick together (files dropped loose beside them
// are not counted); it does not bound the walk itself (hidden files and folders without
// files are read to the end).
export const MAX_FOLDER_FILES = 2000;
export class TooManyFiles extends Error {
  constructor() {
    super(L(
      `ในโฟลเดอร์มีไฟล์เกิน ${MAX_FOLDER_FILES} ไฟล์ จึงไม่ได้เพิ่มอะไรเข้าคิว — เลือกเฉพาะโฟลเดอร์ที่มีคลิปที่จะอัป`,
      `The folder(s) hold more than ${MAX_FOLDER_FILES} files, so nothing was added — pick only the folder with the videos to upload`,
    ));
  }
}

// A drop or a pick that failed: the refused folder is said to the user, the rest is logged.
export const intakeFailed = (what: string, say: (msg: string) => void) => (e: unknown) => {
  console.error(`[ytup] ${what}`, e);
  if (e instanceof TooManyFiles) say(e.message);
};

// filesFromDrop() and the folder input (3503): files dropped on their own are taken as they
// are; once a folder is part of the drop, or a folder is picked, folders are read at every
// depth, as the folder input's file list was (filesFromDrop() stopped two levels down), and
// hidden files (macOS ._ and .DS_Store) are skipped everywhere, as filesFromDrop() did.
// A folder that can't be read is passed over, as readDir() did (3520–3523): what it gave
// before failing is kept, the folders around it are still read, and `unread` gets its name.
export type Unread = (folder: string) => void;
export async function expandHandles(handles: (FileSystemHandle | null)[], unread: Unread = () => {}): Promise<FileSystemFileHandle[]> {
  const present = handles.filter((h): h is FileSystemHandle => !!h);
  if (!present.some((h) => h.kind === 'directory')) return present as FileSystemFileHandle[];
  const out: FileSystemFileHandle[] = [];
  let taken = 0; // from folders; a file dropped loose is not counted
  const walk = async (h: FileSystemHandle, inFolder: boolean) => {
    if (h.kind === 'file') {
      if (h.name.startsWith('.')) return;
      if (inFolder && taken++ >= MAX_FOLDER_FILES) throw new TooManyFiles();
      out.push(h as FileSystemFileHandle);
      return;
    }
    try {
      for await (const c of (h as FileSystemDirectoryHandle).values()) await walk(c, true);
    } catch (e) {
      if (e instanceof TooManyFiles) throw e;
      console.error('[ytup] folder', h.name, e);
      unread(h.name);
    }
  };
  for (const h of present) await walk(h, false);
  return out;
}

export type Put = (id: string, handle: FileSystemFileHandle) => Promise<unknown>;
export type Del = (id: string) => Promise<unknown>;

// Stored and no longer wanted: out of the store, and no longer held.
export async function forget(ids: string[], del: Del) {
  held.release(ids);
  for (const id of ids) await del(id).catch(() => {});
}

// One fresh id per file (or the ids given: lib/panel/relink.ts stores under lost items' own). If a write fails, the ones already written are forgotten again.
// The panel keeps each handle object from here on (lib/file-handles.ts): Chrome ends the
// read access of a file no page holds.
export async function storeHandles(files: FileSystemFileHandle[], put: Put = putHandle, del: Del = deleteHandle, given?: string[]): Promise<string[]> {
  const ids: string[] = [];
  try {
    for (const [i, f] of files.entries()) {
      const id = given?.[i] ?? crypto.randomUUID();
      await put(id, f);
      held.keep(id, f);
      ids.push(id);
    }
  } catch (e) {
    await forget(ids, del);
    throw e;
  }
  return ids;
}

// Store, then hand the ids to the Studio tab (queue:add, or a card's attach). If the tab
// doesn't take them, nothing else will ever ask for these handles: forget them. A rejection
// means none were taken: the Studio handlers don't reject once they have taken files, and
// let go themselves of what they don't keep (lib/studio/queue-edit.ts).
export async function sendFiles(
  files: FileSystemFileHandle[], deliver: (ids: string[]) => Promise<unknown>,
  put: Put = putHandle, del: Del = deleteHandle,
): Promise<number> {
  if (!files.length) return 0;
  const ids = await storeHandles(files, put, del);
  try {
    await deliver(ids);
  } catch (e) {
    await forget(ids, del);
    throw e;
  }
  return ids.length;
}

// The drawer's <input type=file accept="video/*,.txt,image/*"> and accept=".txt,image/*"
// (the extensions of VIDEO_EXT / IMG_EXT in lib/constants.ts).
const VIDEO = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.wmv', '.flv', '.3gp', '.mpg', '.mpeg'];
const IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
export const PICK_VIDEO: FilePickerAcceptType[] = [{ accept: { 'video/*': VIDEO, 'text/plain': ['.txt'], 'image/*': IMAGE } }];
export const PICK_ATTACH: FilePickerAcceptType[] = [{ accept: { 'text/plain': ['.txt'], 'image/*': IMAGE } }];

const cancelled = (e: unknown) => (e as DOMException)?.name === 'AbortError';

export async function pickFiles(win: Window = window, types = PICK_VIDEO): Promise<FileSystemFileHandle[]> {
  try {
    return await win.showOpenFilePicker({ multiple: true, types });
  } catch (e) {
    if (cancelled(e)) return [];
    throw e;
  }
}
export const pickAttachments = (win: Window = window) => pickFiles(win, PICK_ATTACH);

// The drawer's webkitdirectory input took every file at any depth; a picked folder is read
// here like a dropped one (every depth, no hidden files).
export async function pickFolder(win: Window = window, unread?: Unread): Promise<FileSystemFileHandle[]> {
  try {
    return await expandHandles([await win.showDirectoryPicker()], unread);
  } catch (e) {
    if (cancelled(e)) return [];
    throw e;
  }
}
