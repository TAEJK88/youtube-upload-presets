import { fixChapters } from '../chapters';
import { L } from '../i18n';
import { ui } from './page-ui';
import { bridgeFiles, dropFiles } from './queue-files';
import { assignNumbers, currentItemId, fileMeta, isImg, isTxt, queue, readText, saveMemo, type FileSrc, type QueueItem } from './queue-runner';
import { activeId, onStored, presets } from './state';

// The drawer's queue-card controls (UI section 3752–4024) and its "Apply to all" button,
// as operations the side panel sends. Each does what the control's handler did, then
// what updateItemUI()/renderQueue() did to the data: remember the edits (saveMemo) and
// save + tell the panel (ui.queue()).
export type QueueEdit =
  | { op: 'title'; id: string; title: string }
  | { op: 'resetTitle'; id: string }
  | { op: 'artists'; id: string; artists: string }
  | { op: 'publishAt'; id: string; at: number | null }
  | { op: 'preset'; id: string; presetId: string }
  | { op: 'move'; id: string; by: -1 | 1 }
  | { op: 'presetAll'; presetId: string }
  | { op: 'attach'; id: string; fileIds: string[] }
  | { op: 'dropTxt'; id: string }
  | { op: 'dropThumb'; id: string }
  | { op: 'fixTracklist'; id: string };

// The card's inputs were disabled unless the item was waiting or had failed; the item
// the run is fetching a file for is still 'pending' but is no longer the user's.
const canEdit = (it: QueueItem | undefined): it is QueueItem =>
  !!it && (it.status === 'pending' || it.status === 'error') && it.id !== currentItemId();
const done = () => {
  saveMemo();
  ui.queue();
};

export async function editQueue(e: QueueEdit): Promise<void> {
  if (e.op === 'presetAll') {
    // Not the item the run is fetching a file for (Phase 2: the run owns it from then on).
    for (const it of queue) if (canEdit(it)) { it.presetId = e.presetId; it.titleEdited = false; }
    assignNumbers();
    return done();
  }
  const it = queue.find((x) => x.id === e.id);
  if (e.op === 'attach') return attach(it, e.fileIds);
  if (!canEdit(it)) return;
  switch (e.op) {
    case 'title':
      it.title = e.title;
      it.titleEdited = true;
      break;
    case 'resetTitle':
      it.titleEdited = false;
      assignNumbers();
      break;
    case 'artists':
      it.artists = e.artists;
      it.artistsEdited = !!e.artists.trim();
      assignNumbers();
      break;
    case 'publishAt':
      it.publishEdited = !!e.at;
      it.publishAt = e.at || null;
      break;
    case 'preset':
      it.presetId = e.presetId;
      it.titleEdited = false;
      assignNumbers();
      break;
    case 'move': {
      const i = queue.indexOf(it);
      const other = queue[i + e.by];
      if (!canEdit(other)) return;
      [queue[i], queue[i + e.by]] = [other, it];
      assignNumbers();
      break;
    }
    case 'dropTxt':
      it.txt = '';
      it.txtName = '';
      it.titleEdited = false;
      assignNumbers();
      break;
    case 'dropThumb':
      if (it.thumb) dropFiles([{ id: it.thumb.id, src: it.thumb.src }]);
      it.thumb = null;
      break;
    case 'fixTracklist': {
      const fx = it.txt ? fixChapters(it.txt) : null;
      if (!fx || !fx.changes.length) return;
      it.txt = fx.text;
      it.titleEdited = false;
      assignNumbers();
      ui.toast(L('แก้ tracklist แล้ว: ', 'Tracklist fixed: ') + fx.changes.join(' · '));
      break;
    }
  }
  done();
}

// attachToItem(): .txt files become the description, an image the thumbnail. The panel
// stored the files' handles under fresh ids; files no item keeps are let go.
async function attach(it: QueueItem | undefined, ids: string[]): Promise<void> {
  if (!canEdit(it)) return dropFiles(ids.map((id) => ({ id, src: 'bridge' })));
  const { files, failed } = await bridgeFiles(ids);
  if (failed.length) ui.toast(L(`เพิ่มไม่ได้ ${failed.length} ไฟล์: `, `Could not add ${failed.length} file(s): `) + failed[0]!.reason);
  if (!canEdit(it)) return dropFiles(files.map((f) => ({ id: f.qid, src: f.src })));
  const unused: { qid: string; src: FileSrc }[] = [];
  for (const f of files) {
    if (isTxt(f)) {
      it.txt = await readText(f);
      it.txtName = f.name;
      unused.push(f); // read: the file itself is no longer needed
    } else if (isImg(f)) {
      if (it.thumb) unused.push({ qid: it.thumb.id, src: it.thumb.src });
      it.thumb = { id: f.qid, src: f.src, ...fileMeta(f) };
    } else unused.push(f);
  }
  if (unused.length) dropFiles(unused.map((f) => ({ id: f.qid, src: f.src })));
  it.titleEdited = false;
  assignNumbers();
  done();
}

// Presets, the default preset, EP counters and settings are changed in the side panel.
// The drawer re-rendered the queue after each (refreshLabels / renderQueue): titles and
// numbers follow, and items whose preset was deleted move to the default preset.
// Coalesced: one write from the panel can change several keys.
export function followStoredChanges(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requeue = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Not an item the run is working on: its upload keeps the preset it started with.
      const owned = (it: QueueItem) => it.status === 'uploading' || it.status === 'review' || it.id === currentItemId();
      for (const it of queue) if (!owned(it) && !presets.some((p) => p.id === it.presetId)) it.presetId = activeId;
      assignNumbers();
      ui.queue();
    }, 0);
  };
  const offs = ['presets', 'activeId', 'counters', 'settings'].map((k) => onStored(k, requeue));
  return () => {
    clearTimeout(timer);
    for (const off of offs) off();
  };
}
