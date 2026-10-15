import { useEffect, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { L } from '@/lib/i18n';
import { dropHandles, expandHandles, hasFiles, intakeFailed, pickFiles, pickFolder, sendFiles } from '@/lib/panel/intake';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';
import { useLive, usePanel } from '../panel';
import { saveFailed } from '../save-failed';
import { QueueCard } from './QueueCard';
import { ScheduleBox } from './ScheduleBox';

// The tab's message channel failed or nobody answered: the change never reached the queue.
const notConnected = (e: unknown) => {
  console.error('[ytup] upload tab', e);
  toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
};
// A folder inside a dropped or picked one couldn't be listed: its files are not in the queue.
// One toast, however many folders.
const folderUnread = () => void toast(L('อ่านบางโฟลเดอร์ไม่ได้ — ไฟล์ในโฟลเดอร์นั้นจึงไม่ได้เพิ่มเข้าคิว', "Some folders couldn't be read — the files in them were not added"), { id: 'folder-unread' });

// Files from a drop or a picker → stored → the Studio tab's queue (addFiles there).
export function useAddFiles() {
  const { send } = usePanel();
  return async (files: FileSystemFileHandle[]) => {
    let delivering = false;
    try {
      await sendFiles(files, (ids) => { delivering = true; return send('queue:add', ids); });
    } catch (e) {
      // The tab didn't answer (no content script yet), or the handles couldn't be stored.
      toast(delivering
        ? L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab')
        : L(`เพิ่มไม่ได้ ${files.length} ไฟล์: `, `Could not add ${files.length} file(s): `) + ((e as Error)?.message ?? String(e)));
    }
  };
}

// The whole panel takes dropped files (the drawer's dragenter/dragover/drop, 3536–3567); the
// "Drop to add to the queue" frame hides itself once dragover stops.
export function usePanelDrop(onDropped: () => void) {
  const add = useAddFiles();
  const [dropping, setDropping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const accept = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (e.type !== 'dragover') return; // dropHint() ran on dragover only
    setDropping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDropping(false), 150);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    clearTimeout(timer.current);
    setDropping(false);
    const pending = dropHandles(e.dataTransfer); // inside the event, before any await
    onDropped();
    void pending.then((hs) => expandHandles(hs, folderUnread)).then(add, intakeFailed('drop', toast));
  };
  return { dropping, handlers: { onDragEnter: accept, onDragOver: accept, onDrop } };
}

export function QueueTab() {
  const { data, view, send, write } = usePanel();
  const { liveState } = useLive();
  const add = useAddFiles();
  const pick = (picker: () => Promise<FileSystemFileHandle[]>) => void picker().then(add, intakeFailed('file picker', toast));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [schedOpen, setSchedOpen] = useState(true);
  const items = view?.items ?? [];
  const has = items.length > 0;
  // renderQueue(): the schedule box folds away when the first videos arrive and opens
  // again when the queue empties, giving the cards the room (short screens).
  const hadQueue = useRef(false);
  useEffect(() => {
    if (has && !hadQueue.current) setSchedOpen(false);
    if (!has) setSchedOpen(true);
    hadQueue.current = has;
  }, [has]);
  if (!data) return null;

  const count = (s: string) => items.filter((i) => i.status === s).length;
  const total = items.length;
  const done = count('done');
  const errors = count('error');
  const running = !!liveState?.running;
  const pct = total ? Math.round(((done + errors) / total) * 100) : 0;
  const anyOpen = items.some((i) => open.has(i.id));
  const setOne = (id: string, on: boolean) => setOpen((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <div>
      {/* The drop zone; compact once the queue has videos (.drop.mini). A click anywhere picks
          files, as in the drawer; from the keyboard its two buttons do (no control inside another). */}
      <div
        onClick={() => pick(pickFiles)}
        className={cn('flex cursor-pointer items-center rounded-[14px] border border-dashed border-tint/[0.22] hover:border-fg3 hover:bg-surface', has ? 'gap-2.5 px-3 py-2' : 'gap-3 px-3.5 py-3')}
      >
        <div className={cn('grid shrink-0 place-items-center bg-tint/10', has ? 'size-[30px] rounded-[9px]' : 'size-8 rounded-[10px]')}><Icon name="upload" size={16} /></div>
        <div className="min-w-0">
          <b className="block text-[13px] font-medium">{L('ลากไฟล์หรือโฟลเดอร์มาวางตรงไหนของแผงก็ได้', 'Drop files or a folder anywhere on this panel')}</b>
          <span className="text-xs text-tint/60">
            <button type="button" className="cursor-pointer rounded-sm" onClick={(e) => { e.stopPropagation(); pick(pickFiles); }}>
              {L('หรือคลิกเพื่อเลือกไฟล์ · ', 'or click to select files · ')}
            </button>
            <button type="button" className="cursor-pointer rounded-sm text-tint underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); pick(() => pickFolder(window, folderUnread)); }}>
              {L('เลือกทั้งโฟลเดอร์', 'pick a whole folder')}
            </button>
          </span>
          {/* The drawer's ".mp4 video / .txt description / .jpg thumbnail" hints are hidden in
              Design B (userscript 3125, .drop .kbd{display:none}). */}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <NativeSelect className="min-w-0 flex-1" title={L('พรีเซ็ตสำหรับคลิปที่เพิ่มใหม่', 'Preset for newly added videos')} value={data.activeId} onChange={(e) => void write.activeId(e.target.value).catch(saveFailed)}>
          {data.presets.map((p, i) => <option key={p.id} value={p.id}>{`${i + 1}. ${p.label}`}</option>)}
        </NativeSelect>
        <Button size="sm" disabled={running} title={L('เปลี่ยนพรีเซ็ตของทุกคลิปที่ยังไม่ได้อัป', 'Change the preset of all videos not yet uploaded')}
          onClick={() => void send('queue:edit', { op: 'presetAll', presetId: data.activeId }).catch(notConnected)}>
          <Icon name="layers" size={14} />{L('ใช้กับทุกคลิป', 'Apply to all')}
        </Button>
        {has && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(anyOpen ? new Set() : new Set(items.map((i) => i.id)))}>
            <Icon name={anyOpen ? 'up' : 'down'} size={14} />{anyOpen ? L('ย่อทั้งหมด', 'Collapse all') : L('ขยายทั้งหมด', 'Expand all')}
          </Button>
        )}
      </div>

      <ScheduleBox open={schedOpen} onOpen={setSchedOpen} />

      {has && (
        <div data-testid="stats" className="mt-3 flex flex-wrap items-baseline text-xs">
          {([[total, L('ทั้งหมด', 'Total'), ''], [count('pending'), L('รอคิว', 'Queued'), 'text-info'], [done, L('เสร็จแล้ว', 'Done'), 'text-ok'], [errors, L('ผิดพลาด', 'Errors'), 'text-err']] as const).map(([n, label, tone], i) => (
            <span key={label} className="flex items-baseline gap-1">
              {i > 0 && <span className="mx-2 text-tint/40">·</span>}
              <b className={tone}>{n}</b><span className="text-tint/70">{label}</span>
            </span>
          ))}
        </div>
      )}
      {has && (running || done > 0) && (
        <div className="mt-2 flex items-center gap-2">
          <Progress value={pct} className="flex-1" />
          <span className="text-xs text-fg3">{`${pct}%`}</span>
        </div>
      )}

      {has ? items.map((it, i) => (
        <QueueCard key={it.id} it={it} prev={items[i - 1]} next={items[i + 1]} open={open.has(it.id)} onOpen={(on) => setOne(it.id, on)} />
      )) : (
        <div className="mt-6 flex flex-col items-center gap-1.5 text-center text-fg3">
          <div className="grid size-11 place-items-center rounded-full bg-surface2"><Icon name="film" size={24} /></div>
          <b className="text-[13px] text-fg">{L('ยังไม่มีคลิปในคิว', 'No videos in the queue yet')}</b>
          <span className="text-xs">{L('ลากโฟลเดอร์คลิปทั้งชุดมาวางด้านบนได้เลย', 'Drag a whole folder of videos onto the area above')}</span>
        </div>
      )}
    </div>
  );
}
