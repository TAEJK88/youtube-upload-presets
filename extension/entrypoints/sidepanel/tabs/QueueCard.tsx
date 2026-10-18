import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { THUMB_MAX, TITLE_MAX } from '@/lib/constants';
import { handles } from '@/lib/file-handles';
import { L, locale } from '@/lib/i18n';
import { presetIn } from '@/lib/panel/data';
import { fmtDur, fmtSize, fmtWhen, isVideo, statusLabel, toLocalInput } from '@/lib/panel/format';
import { dropHandles, hasFiles, pickAttachments, sendFiles } from '@/lib/panel/intake';
import type { QueueEdit } from '@/lib/studio/queue-edit';
import type { FileRef, ItemStatus } from '@/lib/studio/queue-runner';
import type { ViewItem } from '@/lib/studio/queue-view';
import { cn } from '@/lib/utils';
import { useAsk } from '../ask';
import { Chevron, IconButton, TextField } from '../fields';
import { Icon } from '../Icon';
import { openTab } from '../open-tab';
import { useLive, usePanel } from '../panel';

// One queue item: the drawer's buildCard() / updateItemUI() / renderAttachments()
// (3752–4023). The data is the Studio tab's (QueueView); every control sends queue:*.
const MSG_ICON: Record<ItemStatus, string> = { pending: 'alert', uploading: 'upload', review: 'alert', done: 'check', error: 'alert' };
const TONE: Record<string, string> = { muted: 'text-fg3', info: 'text-info', warn: 'text-warn', ok: 'text-ok', err: 'text-err' };
const waiting = (x?: ViewItem) => !!x && (x.status === 'pending' || x.status === 'error');
// The tab's message channel failed or nobody answered: the change never reached the queue.
const notConnected = (e: unknown) => {
  console.error('[ytup] queue card', e);
  toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
};
// .card.error / .done / .review .msg (2733–2735)
const MSG_TONE: Partial<Record<ItemStatus, string>> = { error: 'bg-err/[0.09] text-err', done: 'bg-ok/[0.09] text-ok', review: 'bg-warn/10 text-warn' };
type Edit = QueueEdit extends infer E ? (E extends { id: string } ? Omit<E, 'id'> : never) : never;

// The thumbnail dropped on the panel, shown on the card (only while read access holds;
// read again after each re-grant, `grantRev`).
function useThumbUrl(ref: FileRef | null, grantRev: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!ref || ref.src !== 'bridge') return void setUrl(null);
    let alive = true;
    let made: string | null = null;
    void (async () => {
      const h = await handles.get(ref.id).catch(() => undefined);
      if (!h || (await h.queryPermission({ mode: 'read' }).catch(() => 'denied')) !== 'granted') return;
      const f = await h.getFile().catch(() => null);
      if (!f || !alive) return;
      made = URL.createObjectURL(f);
      setUrl(made);
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [ref?.id, ref?.src, grantRev]);
  return url;
}

const Chip = ({ children, className, ...rest }: { children: ReactNode; className?: string; title?: string; onClick?(): void }) =>
  rest.onClick
    ? <button type="button" className={cn('inline-flex cursor-pointer items-center gap-1 rounded-full border border-line2 px-2 py-0.5 text-xs text-fg2 hover:text-fg', className)} {...rest}>{children}</button>
    : <Badge className={className} title={rest.title}>{children}</Badge>;
const RemoveX = ({ onClick }: { onClick(): void }) => (
  <span role="button" tabIndex={0} title={L('เอาออก', 'Remove')} aria-label={L('เอาออก', 'Remove')} onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    className="ml-0.5 cursor-pointer opacity-70 hover:opacity-100">
    <Icon name="x" size={11} />
  </span>
);

export function QueueCard({ it, prev, next, open, onOpen }: { it: ViewItem; prev?: ViewItem; next?: ViewItem; open: boolean; onOpen(open: boolean): void }) {
  const { data, view, send, grantRev } = usePanel();
  const { liveState } = useLive();
  const ask = useAsk();
  const titleEl = useRef<HTMLInputElement>(null);
  const focusTitle = useRef(false);
  const [drag, setDrag] = useState(false);
  const thumbUrl = useThumbUrl(it.thumb, grantRev);
  const current = it.id === view?.current;
  const editable = waiting(it) && !current;
  // The tab's move refuses a neighbour that can't change (queue-edit canEdit).
  const movable = (x?: ViewItem) => waiting(x) && x!.id !== view?.current;
  const edit = (e: Edit) => void send('queue:edit', { ...e, id: it.id } as QueueEdit).catch(notConnected);
  // A card opened by a click gets its title focused, as the drawer did (not on Expand all).
  useEffect(() => {
    if (open && focusTitle.current) titleEl.current?.focus({ preventScroll: true });
    focusTitle.current = false;
  }, [open]);
  if (!data) return null;

  const p = presetIn(data, it.presetId);
  const status = statusLabel(it.status);
  const at = it.at;
  const bad = editable ? it.timeProblem : '';
  const pct = it.status === 'uploading' && liveState?.prog && liveState.prog.pct !== null ? Math.round(liveState.prog.pct * 100) : null;
  const removable = it.status !== 'uploading' && it.status !== 'review' && !current;

  // As useAddFiles: a tab that didn't answer is "not connected"; handles that couldn't be
  // stored are files that could not be added.
  const attachFiles = async (files: FileSystemFileHandle[]) => {
    let delivering = false;
    try {
      await sendFiles(files, (ids) => { delivering = true; return send('queue:edit', { op: 'attach', id: it.id, fileIds: ids }); });
    } catch (e) {
      if (delivering) return notConnected(e);
      toast(L(`เพิ่มไม่ได้ ${files.length} ไฟล์: `, `Could not add ${files.length} file(s): `) + ((e as Error)?.message ?? String(e)));
    }
  };
  // A .txt or image dropped on the card attaches to it; videos and folders go to the panel.
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer) || !editable) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDrag(true);
  };
  const onDrop = (e: DragEvent) => {
    setDrag(false);
    if (!hasFiles(e.dataTransfer) || !editable) return;
    const files = [...e.dataTransfer.files];
    if (!files.length || files.some(isVideo) || e.dataTransfer.items[0]?.webkitGetAsEntry()?.isDirectory) return;
    e.preventDefault();
    e.stopPropagation();
    const pending = dropHandles(e.dataTransfer); // inside the event, before any await
    // The drawer attached the dropped files themselves (3862–3866): a folder among them is not read.
    void pending.then((hs) => attachFiles(hs.filter((h): h is FileSystemFileHandle => h?.kind === 'file')))
      .catch((err) => console.error('[ytup] card drop', err));
  };
  // A video that is a draft in Studio goes on in that draft (P5-draft-retry; the userscript's
  // question offered only "Deleted it, upload again"). Uploading the file again stays possible.
  const retry = async () => {
    // A card queued from a draft ticked in Studio has no file: it can only go on in its draft.
    const resume = !it.draftId ? false : it.fromDraft ? true : await ask({
      title: L('คลิปนี้อยู่ใน Studio แล้ว', 'This video is already in Studio'),
      body: L(`ไฟล์ขึ้นไปเป็นฉบับร่างแล้ว (${it.draftId})\n"ทำต่อบนฉบับร่าง" จะเปิดฉบับร่างนั้นแล้วกรอกส่วนที่เหลือ ไม่อัปโหลดไฟล์ซ้ำ\n"อัปโหลดใหม่" จะส่งไฟล์ขึ้นไปอีกครั้ง: ลบฉบับร่างในหน้า Content ก่อน ไม่อย่างนั้นจะได้คลิปซ้ำ`, `The file is already a draft in Studio (${it.draftId}).\n"Resume draft" opens that draft and fills in what is left, without uploading the file again.\n"Upload again" sends the file once more: delete the draft in Content first, or there will be two videos.`),
      ok: L('ทำต่อบนฉบับร่าง', 'Resume draft'), no: L('อัปโหลดใหม่', 'Upload again'), icon: 'refresh',
    });
    if (resume == null) return;
    void send(resume ? 'queue:resume' : 'queue:retry', it.id).catch(notConnected);
  };

  // renderAttachments()
  const chips: ReactNode[] = [];
  const tc = it.tracklist;
  if (it.txt) {
    const lines = it.txt.trim().split(/\r?\n/).length;
    chips.push(
      <Chip key="txt" title={it.txt.slice(0, 600)}>
        <Icon name="file" size={13} /><span>{L(`${it.txtName} · ${lines} บรรทัด`, `${it.txtName} · ${lines} lines`)}</span>
        {editable && <RemoveX onClick={() => edit({ op: 'dropTxt' })} />}
      </Chip>,
    );
  }
  if (it.txt && tc) {
    if (it.fixChanges.length && editable) {
      chips.push(
        <Chip key="fix" className="border-transparent bg-fg font-semibold text-on-fg hover:bg-fg-hover hover:text-on-fg" title={it.fixChanges.join('\n')} onClick={() => edit({ op: 'fixTracklist' })}>
          <Icon name="note" size={13} />{L('แก้ tracklist ให้', 'Fix tracklist')}
        </Chip>,
      );
    }
    if (tc.errors.length) {
      chips.push(
        <Badge key="tlerr" tone="bad" title={L('YouTube จะไม่สร้าง Chapters จนกว่าจะแก้:\n', 'YouTube won\'t create chapters until fixed:\n') + tc.errors.map((x) => '• ' + x).join('\n') + (tc.warnings.length ? '\n\n' + tc.warnings.map((x) => '• ' + x).join('\n') : '')}>
          <Icon name="alert" size={13} /><span>{L(`tracklist: ${tc.errors.length} ปัญหา`, `Tracklist: ${tc.errors.length} problem(s)`)}</span>
        </Badge>,
      );
    } else if (tc.warnings.length) {
      chips.push(
        <Badge key="tlwarn" tone="bad" title={[...tc.errors, ...tc.warnings].map((x) => '• ' + x).join('\n')}>
          <Icon name="alert" size={13} /><span>{L(`tracklist: ${tc.warnings.length} คำเตือน`, `Tracklist: ${tc.warnings.length} warning(s)`)}</span>
        </Badge>,
      );
    }
    if (tc.count && !tc.errors.length) {
      const durNote = it.duration ? '' : it.durState === 'loading'
        ? L(' · กำลังอ่านความยาวคลิป…', ' · reading video length…')
        : L(' · อ่านความยาวคลิปไม่ได้ จึงยังไม่ได้เช็กว่า timestamp เกินความยาวคลิปไหม', ' · could not read the video length, so timestamps were not checked against it');
      chips.push(
        <Badge key="tlok" tone={it.durState === 'fail' ? 'warn' : undefined} title={L('ผ่านกฎ Chapters ของ YouTube', 'Passes YouTube\'s chapter rules') + durNote}>
          <Icon name={it.durState === 'fail' ? 'alert' : 'check'} size={13} />
          <span>{L(`Chapters ${tc.count} ช่วง`, `${tc.count} chapters`) + (it.durState === 'fail' ? L(' · ไม่ได้เช็กความยาว', ' · length not checked') : '')}</span>
        </Badge>,
      );
    } else if (!tc.count) {
      chips.push(
        <Badge key="tlnone" tone="bad" title={L('ไฟล์ .txt ไม่มีบรรทัดที่ขึ้นต้นด้วยเวลา เช่น 00:00 ชื่อเพลง', 'The .txt has no lines starting with a time, e.g. 00:00 Song name')}>
          <Icon name="alert" size={13} /><span>{L('ไม่มี timestamp — ไม่มี Chapters', 'No timestamps — no chapters')}</span>
        </Badge>,
      );
    }
  }
  if (it.thumb) {
    const big = it.thumb.size > THUMB_MAX;
    chips.push(
      <Badge key="thumb" tone={big ? 'bad' : undefined} title={it.thumb.name}>
        <Icon name="image" size={13} />
        <span>{big ? L('ภาพปกเกิน 2MB', 'Thumbnail over 2MB') : L(`ภาพปก · ${fmtSize(it.thumb.size)}`, `Thumbnail · ${fmtSize(it.thumb.size)}`)}</span>
        {editable && <RemoveX onClick={() => edit({ op: 'dropThumb' })} />}
      </Badge>,
    );
  }
  if (it.prev && editable) {
    const when = new Intl.DateTimeFormat(locale() === 'th-TH' ? 'th-TH-u-ca-gregory' : locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(it.prev.date));
    const videoId = it.prev.videoId;
    chips.push(
      <Chip key="prev" className="border-transparent bg-warn/[0.12] text-warn hover:text-warn"
        title={L(`ไฟล์นี้เคยอัปขึ้นช่องนี้แล้ว: ${it.prev.title || ''}\nคลิกเพื่อเปิดคลิปนั้น · ถ้าตั้งใจอัปซ้ำ ปล่อยไว้ได้`, `This file was already uploaded to this channel: ${it.prev.title || ''}\nClick to open that video · leave it if the re-upload is intended`)}
        onClick={() => { if (videoId) openTab(`https://studio.youtube.com/video/${videoId}/edit`); }}>
        <Icon name="alert" size={13} /><span>{L(`เคยอัปแล้ว ${when}`, `Already uploaded ${when}`)}</span>
      </Chip>,
    );
  }
  // renderAttachments()'s claim warning (4010–4016)
  if (it.claimed.length) {
    chips.push(
      <Badge key="claimed" tone="bad"
        title={L('เพลงใน tracklist ที่เคยโดน claim:\n', 'Tracklist songs previously claimed:\n') + it.claimed.map((x) => L(`• ${x.line}  (เคยโดน ${x.times} คลิป)`, `• ${x.line}  (claimed on ${x.times} video(s))`)).join('\n')}>
        <Icon name="alert" size={13} /><span>{L(`${it.claimed.length} เพลงเคยโดน claim`, `${it.claimed.length} song(s) previously claimed`)}</span>
      </Badge>,
    );
  }
  if (editable && (!it.txt || !it.thumb)) {
    chips.push(
      <Chip key="add" className="border-dashed" onClick={() => void pickAttachments().then(attachFiles, (e) => console.error('[ytup] attach picker', e))}>
        <Icon name="clip" size={13} />{L('แนบ .txt / ภาพปก', 'Attach .txt / thumbnail')}
      </Chip>,
    );
  }

  // The header toggles the card (the expand button included); other controls don't.
  const toggle = () => {
    focusTitle.current = !open && editable;
    onOpen(!open);
  };
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={cn(
        'mt-2 rounded-[16px] border border-tint/[0.09] bg-tint/5 p-3 hover:border-tint/[0.16]',
        (it.status === 'uploading' || it.status === 'review') && 'border-info/35',
        it.status === 'error' && 'border-err/35',
        drag && 'border-fg2',
      )}
    >
      <div
        className="flex cursor-pointer gap-3"
        onClick={(e) => { if (!(e.target as HTMLElement).closest('button:not([data-exp]),input,select,a,[role=button]')) toggle(); }}
      >
        <div className="relative grid h-[52px] w-[92px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-tint/[0.06] text-fg3" title={fmtSize(it.file.size)}>
          {thumbUrl ? <img src={thumbUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <Icon name="film" size={22} />}
          <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-xs text-white">{it.duration ? fmtDur(it.duration) : fmtSize(it.file.size)}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={it.file.name}>{it.file.name}</span>
            <IconButton data-exp aria-expanded={open} icon={<Chevron open={open} size={16} />} className="size-7"
              title={open ? L('ย่อ', 'Collapse') : editable ? L('แก้ไขรายละเอียด', 'Edit details') : L('ดูรายละเอียด', 'Show details')} />
            {removable && <IconButton icon="x" className="size-7 hover:text-err" title={L('เอาออกจากคิว', 'Remove from queue')} onClick={() => void send('queue:remove', it.id).catch(notConnected)} />}
          </div>
          {!open && <div className={cn('truncate text-xs text-tint/60', it.title.length > TITLE_MAX && 'text-err')} title={it.title}>{it.title || '—'}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-xs', TONE[status.tone])}>{status.text}</span>
            {at !== null && (
              <span className={cn('inline-flex items-center gap-1 text-xs text-fg2', bad && 'text-warn')}
                title={bad || (it.publishEdited ? L('เวลาที่ตั้งเอง', 'Manually set time') : L('เวลาตามคิว', 'Queue time'))}>
                <Icon name={bad ? 'alert' : 'clock'} size={11} />{fmtWhen(at)}
              </span>
            )}
            {it.status === 'error' && <Button size="sm" onClick={() => void retry()}><Icon name="refresh" size={13} />{L('ลองใหม่', 'Retry')}</Button>}
            {it.status === 'error' && it.draftId && (
              <Button size="sm" title={L('เปิดฉบับร่างที่ค้างใน Studio (แท็บใหม่)', 'Open the leftover draft in Studio (new tab)')}
                onClick={() => openTab(`https://studio.youtube.com/video/${it.draftId}/edit`)}>
                <Icon name="ext" size={13} />{L('เปิดฉบับร่าง', 'Open draft')}
              </Button>
            )}
          </div>
        </div>
        {editable && (
          <div className="flex flex-col">
            <IconButton icon="up" className="size-7" title={L('เลื่อนขึ้น', 'Move up')} disabled={!movable(prev)} onClick={() => edit({ op: 'move', by: -1 })} />
            <IconButton icon="down" className="size-7" title={L('เลื่อนลง', 'Move down')} disabled={!movable(next)} onClick={() => edit({ op: 'move', by: 1 })} />
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-2.5">
          <div>
            <div className="mb-1 text-xs text-fg2">{L('พรีเซ็ต', 'Preset')}</div>
            <NativeSelect aria-label={L('พรีเซ็ต', 'Preset')} className="w-full" disabled={!editable} value={p.id} onChange={(e) => edit({ op: 'preset', presetId: e.target.value })}>
              {data.presets.map((x, i) => <option key={x.id} value={x.id}>{`${i + 1}. ${x.label}`}</option>)}
            </NativeSelect>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-fg2">
              <span>{L('ชื่อคลิป', 'Video title')}</span>
              <span className={cn('text-fg3', it.title.length > TITLE_MAX && 'text-err')}>{`${it.title.length}/${TITLE_MAX}`}</span>
            </div>
            <div className="flex gap-1.5">
              <TextField ref={titleEl} aria-label={L('ชื่อคลิป', 'Video title')} placeholder={L('ชื่อคลิป', 'Video title')} disabled={!editable}
                value={it.title} onValue={(v) => edit({ op: 'title', title: v })} />
              {editable && it.titleEdited && <IconButton icon="refresh" title={L('สร้างชื่อจากพรีเซ็ตใหม่', 'Regenerate title from preset')} className="border border-line" onClick={() => edit({ op: 'resetTitle' })} />}
            </div>
          </div>
          {at !== null && (
            <div>
              <div className="mb-1 text-xs text-fg2">{L('เวลาปล่อย', 'Release time')}</div>
              <div className={cn('flex items-center gap-1.5', bad && '[&_input]:border-warn')}>
                <TextField type="datetime-local" aria-label={L('เวลาปล่อย', 'Release time')} disabled={!editable} value={toLocalInput(at)}
                  onValue={(v) => edit({ op: 'publishAt', at: new Date(v).getTime() || null })} />
                <span className={cn('inline-flex items-center gap-1 text-xs whitespace-nowrap text-fg3', bad && 'text-warn')} title={bad || ''}>
                  <Icon name={bad ? 'alert' : 'clock'} size={12} />
                  {bad ? L('อดีต/เร็วไป', 'Past/too soon') : it.publishEdited ? L('ตั้งเอง', 'Manual') : L('ตามคิว', 'Queue')}
                </span>
                {editable && it.publishEdited && <IconButton icon="refresh" title={L('ใช้เวลาตามคิว', 'Use queue time')} className="border border-line" onClick={() => edit({ op: 'publishAt', at: null })} />}
              </div>
            </div>
          )}
          {/* Not the view's usesArtists: the preset may have just changed here, before the view follows. */}
          {`${p.title} ${p.description} ${(p.tags || []).join(' ')}`.includes('{artists}') && (
            <div>
              <div className="mb-1 text-xs text-fg2">
                {L('ศิลปิน', 'Artists')}{' '}
                <span className="text-fg3">{it.artistsEdited ? L('· พิมพ์เอง (ลบให้ว่าง = อัตโนมัติ)', '· manual (clear = auto)') : L('· อัตโนมัติ', '· auto')}</span>
              </div>
              <TextField aria-label={L('ศิลปิน', 'Artists')} placeholder={L('คั่นด้วย , (ว่าง = อัตโนมัติ)', 'Comma-separated (empty = auto)')} disabled={!editable}
                value={it.artists} onValue={(v) => edit({ op: 'artists', artists: v })} />
            </div>
          )}
        </div>
      )}

      {chips.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{chips}</div>}
      {pct !== null && <Progress value={pct} className="mt-2.5" />}
      {it.msg && (
        <div className={cn('mt-2.5 flex gap-2 rounded-[12px] bg-tint/5 px-2.5 py-2 text-xs text-fg2', MSG_TONE[it.status])}>
          <Icon name={MSG_ICON[it.status]} size={14} className="mt-px shrink-0" />
          <span>{it.msg}</span>
        </div>
      )}
    </div>
  );
}
