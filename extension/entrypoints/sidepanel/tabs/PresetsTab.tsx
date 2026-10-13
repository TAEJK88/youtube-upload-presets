import { Fragment, useEffect, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TITLE_MAX, TXT_EXT, VARS, type Visibility } from '@/lib/constants';
import { L } from '@/lib/i18n';
import { isTxt, isVideo, readText } from '@/lib/panel/format';
import { artistMaxOf, deletePreset, duplicatePreset, epCounter, newPreset, resetPresets, splitList } from '@/lib/panel/presets';
import { visLabels, type Preset } from '@/lib/presets';
import { buildVars, makeTitle, renderTags, unknownVars } from '@/lib/template';
import { cn } from '@/lib/utils';
import { useAsk } from '../ask';
import { AreaField, Hint, Kv, NumberField, Section, TextField } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';
import { saveFailed } from '../save-failed';

// The drawer's sample for the preview (4153–4159); drop a real .txt on the test field to change it.
const SAMPLE_TXT = [
  '00:00 BLXD - Late Night Calls',
  '02:50 Nessy J. - Toxic Craving',
  '05:10 BLXD x Chris Brown - When I Call Your Name',
  '08:30 SZA - Snooze (Cover by BLXD)',
  '11:20 BLXD - Waiting On Me (ft. Brent Faiyaz)',
].join('\n');

type Field = HTMLInputElement | HTMLTextAreaElement;
type Slot = 'title' | 'description' | 'tags'; // the fields a variable chip inserts into
const stopDrag = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
// Reset is in the footer; the editor follows it to the default preset (the drawer's
// `activeId = editId = presets[0].id`, 4353).
const resetListeners = new Set<(id: string) => void>();

// The preset's artist pool as chips: Enter or a comma adds what is typed, × removes a name.
function ArtistChips({ value, onChange }: { value: string[]; onChange(v: string[]): void }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const next = [...value];
    for (const name of splitList(raw)) if (!next.some((a) => a.toLowerCase() === name.toLowerCase())) next.push(name);
    if (next.length > value.length) onChange(next);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-[10px] border border-line bg-surface p-1.5 focus-within:border-fg3">
      {value.map((a) => (
        <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface2 py-0.5 pl-2 pr-1 text-xs text-fg2">
          {a}
          <button type="button" title={L('เอาออก', 'Remove')} aria-label={L(`เอา ${a} ออก`, `Remove ${a}`)} onClick={() => onChange(value.filter((x) => x !== a))}
            className="cursor-pointer rounded-full p-0.5 opacity-70 hover:opacity-100">
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <input aria-label={L('เพิ่มศิลปิน', 'Add an artist')} placeholder={L('พิมพ์ชื่อ คั่นด้วย ,', 'Type names, separated by ,')}
        className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-[13px] text-fg outline-none"
        value={text}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
        onBlur={() => add(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(text); }
          else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }} />
    </div>
  );
}

export function PresetsTab() {
  const { data, view, write } = usePanel();
  const ask = useAsk();
  const presets = data?.presets ?? [];
  const activeId = data?.activeId ?? '';
  const [editId, setEditId] = useState(activeId);
  const [sampleName, setSampleName] = useState('nessy_j_mix.mp4');
  const [sampleTxt, setSampleTxt] = useState(SAMPLE_TXT);
  const [sampleLbl, setSampleLbl] = useState<string | null>(null);
  const [focusLabel, setFocusLabel] = useState(false);
  // By kind, not element: the editor's fields remount for each preset (key below).
  const lastField = useRef<Slot>('title');
  const fieldEls = useRef<Partial<Record<Slot, Field | null>>>({});
  const labelEl = useRef<HTMLInputElement>(null);
  const listEl = useRef<HTMLDivElement>(null);
  // Writes build on the last list written, not on a render that may not have caught up. While
  // a write of ours is in flight, a re-read of storage may be older than it: it is kept aside
  // and looked at once our writes have settled (see writePresets).
  const latest = useRef(presets);
  const inFlight = useRef(0);
  const skipped = useRef<Preset[] | null>(null);
  const mine = useRef(new Set<string>()); // the lists written in this burst, as JSON
  const failed = useRef(false);
  useEffect(() => {
    if (inFlight.current) skipped.current = presets;
    else latest.current = presets;
  }, [presets]);
  const latestActive = useRef(activeId);
  useEffect(() => { latestActive.current = activeId; }, [activeId]);
  // A preset just added is only in the list once the stored write comes back.
  const pending = useRef<string | null>(null);
  // renderPresetEditor(): a preset that is gone (another window, an import) moves the editor
  // to the default one.
  useEffect(() => {
    if (presets.some((x) => x.id === editId)) {
      if (pending.current === editId) pending.current = null;
    } else if (editId !== pending.current) setEditId(activeId);
  }, [presets]);
  useEffect(() => {
    const follow = (id: string) => setEditId(id);
    resetListeners.add(follow);
    return () => void resetListeners.delete(follow);
  }, []);
  const p = presets.find((x) => x.id === editId) ?? presets.find((x) => x.id === activeId) ?? presets[0];
  useEffect(() => {
    if (!focusLabel || p?.id !== editId) return; // wait for the new preset to arrive
    setFocusLabel(false);
    labelEl.current?.focus();
    labelEl.current?.select();
  }, [focusLabel, p?.id]);
  // The list scrolls in its box: keep the selected one in view without scrolling the panel (4245–4249).
  useEffect(() => {
    const box = listEl.current;
    const on = box?.querySelector<HTMLElement>('[data-on="true"]');
    if (!box || !on) return;
    const top = on.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + on.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - 4;
  }, [p?.id]);
  if (!data || !p) return null;

  // Back to no write in flight: a list that came from storage meanwhile is adopted when it
  // is someone else's (another window, an import), or when one of our writes failed. Our own
  // older echo is not: the last list we wrote is newer, and its echo is still to come.
  const settle = () => {
    if (--inFlight.current) return;
    const got = skipped.current;
    if (got && (failed.current || !mine.current.has(JSON.stringify(got)))) latest.current = got;
    skipped.current = null;
    mine.current.clear();
    failed.current = false;
  };
  const writePresets = (next: Preset[], active?: string): Promise<void> => {
    latest.current = next;
    mine.current.add(JSON.stringify(next));
    inFlight.current++;
    const fail = (e: unknown) => { failed.current = true; throw e; };
    let p: Promise<void>;
    try {
      p = active === undefined ? write.presets(next) : write.presetsAndActive(next, active);
    } catch (e) {
      p = Promise.reject(e);
    }
    return p.catch(fail).finally(settle);
  };
  const update = (patch: Partial<Preset>) => void writePresets(latest.current.map((x) => (x.id === p.id ? { ...x, ...patch } : x))).catch(saveFailed);
  const add = (np: Preset, focus = false) => {
    const back = p.id;
    pending.current = np.id;
    setEditId(np.id);
    setFocusLabel(focus);
    writePresets([...latest.current, np]).catch((e: unknown) => {
      saveFailed(e);
      latest.current = latest.current.filter((x) => x.id !== np.id);
      if (pending.current !== np.id) return;
      pending.current = null;
      setFocusLabel(false);
      setEditId((id) => (id === np.id ? back : id));
    });
  };

  // insertVar(): put text at the cursor of the field last edited (title by default)
  const insert = (text: string) => {
    const f = fieldEls.current[lastField.current] ?? fieldEls.current.title;
    if (!f) return;
    f.focus();
    f.setRangeText(text, f.selectionStart ?? f.value.length, f.selectionEnd ?? f.value.length, 'end');
    f.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const remember = (slot: Slot) => () => { lastField.current = slot; };
  const fieldRef = (slot: Slot) => (el: Field | null) => { fieldEls.current[slot] = el; };

  const n = (data.counters[p.id] || 0) + 1;
  const vars = buildVars(sampleName, n, sampleTxt, { preset: p }, { year: data.settings.year, producer: data.settings.producer, channelName: view?.channel.name ?? '' });
  const t = makeTitle(p, vars);
  const bad = unknownVars(p);
  const VIS = visLabels();

  const onDescDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    const f = [...(e.dataTransfer?.files ?? [])].find(isTxt);
    if (!f) return;
    stopDrag(e);
    lastField.current = 'description';
    insert((await readText(f)).replace(/\r\n/g, '\n').trim());
    toast(L(`แทรกเนื้อหาจาก ${f.name} แล้ว`, `Inserted content from ${f.name}`));
  };
  const onSampleDrop = async (e: DragEvent<HTMLInputElement>) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    const txt = files.find(isTxt);
    const vid = files.find(isVideo);
    if (!txt && !vid) return;
    stopDrag(e);
    if (txt) {
      setSampleTxt(await readText(txt));
      setSampleLbl(txt.name);
    }
    setSampleName((vid || txt)!.name.replace(TXT_EXT, '.mp4'));
  };

  const remove = async () => {
    const id = p.id;
    if (!deletePreset(latest.current, id, activeId)) return void toast(L('ต้องมีพรีเซ็ตอย่างน้อย 1 อัน', 'You must keep at least 1 preset'));
    const go = await ask({
      title: L(`ลบพรีเซ็ต "${p.label}"?`, `Delete preset "${p.label}"?`),
      body: L('คลิปในคิวที่ใช้พรีเซ็ตนี้จะเปลี่ยนไปใช้พรีเซ็ตหลัก', 'Queued videos using this preset will switch to the default preset'),
      ok: L('ลบ', 'Delete'), danger: true, icon: 'clear',
    });
    if (go !== true) return; // null: replaced or dismissed
    // Built after the answer: the list or the default may have changed while the box was open.
    const cur = latestActive.current;
    const at = latest.current.findIndex((x) => x.id === id);
    const gone = latest.current[at];
    const next = deletePreset(latest.current, id, cur);
    if (!next) return;
    try {
      // A new default goes in the same write: the stored default never points at a deleted preset.
      await writePresets(next.presets, next.activeId !== cur ? next.activeId : undefined);
    } catch (e) {
      saveFailed(e);
      // As add's failure handler: the next write builds on what storage still holds.
      if (gone && !latest.current.some((x) => x.id === id)) latest.current = [...latest.current.slice(0, at), gone, ...latest.current.slice(at)];
      return;
    }
    setEditId(next.activeId);
  };
  const setDefault = () => {
    const label = p.label;
    write.activeId(p.id).then(() => toast(L(`ตั้ง "${label}" เป็นพรีเซ็ตหลักแล้ว`, `Set "${label}" as the default preset`)), saveFailed);
  };

  return (
    <div>
      <Section title={L('พรีเซ็ตทั้งหมด', 'All presets')} icon="layers">
        <div ref={listEl} className="max-h-[220px] overflow-y-auto">
          {presets.map((x, i) => (
            <div
              key={x.id}
              role="button"
              tabIndex={0}
              data-on={x.id === p.id}
              aria-current={x.id === p.id || undefined}
              title={L(`Alt+${i + 1} = ตั้งเป็นพรีเซ็ตหลัก`, `Alt+${i + 1} = set as default preset`)}
              onClick={() => setEditId(x.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditId(x.id); } }}
              className={cn('flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-transparent px-2 py-1.5 hover:bg-surface', x.id === p.id && 'border-line2 bg-surface')}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-surface2 text-xs text-fg2">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13px] font-medium">{x.label || L('(ไม่มีชื่อ)', '(untitled)')}</b>
                <span className="block truncate text-xs text-fg3">{x.title || ''}</span>
              </div>
              {x.id === activeId && (
                <span className="flex items-center gap-1 rounded-full bg-surface2 px-2 text-xs text-fg2"><Icon name="star" size={10} />{L('หลัก', 'Default')}</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => add(newPreset(), true)}><Icon name="plus" size={13} />{L('ใหม่', 'New')}</Button>
          <Button size="sm" onClick={() => add(duplicatePreset(p))}><Icon name="copy" size={13} />{L('ทำสำเนา', 'Duplicate')}</Button>
          <Button size="sm" onClick={setDefault}><Icon name="star" size={13} />{L('ตั้งเป็นหลัก', 'Set as default')}</Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghostDanger" onClick={() => void remove()}><Icon name="clear" size={13} />{L('ลบ', 'Delete')}</Button>
        </div>
      </Section>

      {/* One set of fields per preset: a focused field keeps its own text, so it must not
          outlive the preset it shows (a keystroke would write it into another one). */}
      <Fragment key={p.id}>
      <Section title={L('ข้อมูลคลิป', 'Video details')} icon="film">
        <Label>{L('ชื่อพรีเซ็ต', 'Preset name')}</Label>
        <TextField ref={labelEl} aria-label={L('ชื่อพรีเซ็ต', 'Preset name')} value={p.label || ''} onValue={(v) => update({ label: v })} />
        <Label><span>{L('ชื่อคลิป', 'Video title')}</span><span className={cn(t.length > TITLE_MAX && 'text-err')}>{`${t.length}/${TITLE_MAX}`}</span></Label>
        <TextField ref={fieldRef('title')} aria-label={L('ชื่อคลิป', 'Video title')} value={p.title || ''} onFocus={remember('title')} onValue={(v) => update({ title: v })} />
        <Label><span>{L('คำอธิบาย', 'Description')}</span><span>{L('ลาก .txt มาวางเพื่อแทรกข้อความ', 'Drop a .txt here to insert its text')}</span></Label>
        <AreaField ref={fieldRef('description')} aria-label={L('คำอธิบาย', 'Description')} value={p.description || ''} onFocus={remember('description')} onDragOver={stopDrag} onDrop={(e) => void onDescDrop(e)} onValue={(v) => update({ description: v })} />
        <Label>{L('แท็ก', 'Tags')}</Label>
        <TextField ref={fieldRef('tags')} aria-label={L('แท็ก', 'Tags')} placeholder={L('คั่นด้วยเครื่องหมายจุลภาค ,', 'Separate with commas ,')} value={(p.tags || []).join(', ')} onFocus={remember('tags')} onValue={(v) => update({ tags: splitList(v) })} />
        <Label><span>{L('ตัวแปร', 'Variables')}</span><span>{L('คลิกเพื่อแทรกในช่องที่กำลังแก้', 'Click to insert into the field being edited')}</span></Label>
        <div className="flex flex-wrap gap-1.5">
          {VARS.map((v) => (
            <button key={v} type="button" title={L('แทรกลงช่องที่กำลังแก้', 'Insert into the field being edited')}
              onMouseDown={(e) => e.preventDefault()} onClick={() => insert(`{${v}}`)}
              className="cursor-pointer rounded-full border border-line2 px-2 py-0.5 font-mono text-xs text-fg2 hover:border-fg2 hover:text-fg">{`{${v}}`}</button>
          ))}
        </div>
        <Hint className="mt-2.5">{L('ครอบด้วย [[ ... ]] เพื่อให้ส่วนนั้นหายไปเมื่อตัวแปรข้างในว่าง เช่น [[ | {bpm} BPM]]', 'Wrap in [[ ... ]] to hide that part when the variable inside is empty, e.g. [[ | {bpm} BPM]]')}</Hint>
      </Section>

      <Section title={L('ตัวอย่างบน YouTube', 'YouTube preview')} icon="tv">
        <div className="flex gap-3 rounded-[12px] border border-line bg-surface p-2.5">
          <div className="relative grid h-[54px] w-24 shrink-0 place-items-center rounded-lg bg-surface2 text-fg3">
            <Icon name="play" size={26} />
            <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-xs text-white">2:53:12</span>
          </div>
          <div className="min-w-0">
            <div className="line-clamp-2 text-[13px] font-medium">{t || '—'}</div>
            <div className="mt-0.5 text-xs text-fg3">{`${view?.channel.label ?? '—'} · ${VIS[(p.visibility || 'PRIVATE') as Visibility]}`}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {renderTags(p, vars).map((tag, i) => <span key={i} className="rounded bg-surface2 px-1.5 text-xs text-fg2">{tag}</span>)}
        </div>
        {bad.length > 0 && (
          <div className="mt-2 rounded-[10px] bg-warn/[0.12] px-2.5 py-1.5 text-xs text-warn">
            {L(`⚠ ไม่รู้จักตัวแปร ${bad.join(' ')} — จะขึ้นบน YouTube เป็นข้อความตรง ๆ (ดูชื่อที่ใช้ได้ที่ปุ่ม "ตัวแปร" ด้านล่าง)`, `⚠ Unknown variable ${bad.join(' ')} — it will appear on YouTube as literal text (see the "Variables" buttons below for valid names)`)}
          </div>
        )}
        <Label><span>{L('ทดลองกับไฟล์', 'Test with a file')}</span><span>{sampleLbl ?? L('tracklist ตัวอย่าง', 'Sample tracklist')}</span></Label>
        <TextField aria-label={L('ทดลองกับไฟล์', 'Test with a file')} value={sampleName} onValue={setSampleName} onDragOver={stopDrag} onDrop={(e) => void onSampleDrop(e)} />
        <Hint icon="clip" className="mt-1.5">{L('ลาก .mp4 หรือ .txt จริงมาวางที่ช่องนี้เพื่อดูผลลัพธ์', 'Drop a real .mp4 or .txt here to preview the result')}</Hint>
      </Section>

      <Section title={L('ศิลปิน', 'Artists')} icon="queue">
        <Label><span>{L('กลุ่มศิลปินสำหรับ {artists}', 'Artist pool for {artists}')}</span><span>{L('สุ่มให้แต่ละคลิป', 'Picked at random per video')}</span></Label>
        <ArtistChips value={p.artistPriority || []} onChange={(v) => update({ artistPriority: v })} />
        <Kv title={L('จำนวนสูงสุดในชื่อคลิป', 'Max in video title')} note={L('ถ้าชื่อยาวเกิน 100 ตัวอักษรจะลดให้อัตโนมัติ', 'Auto-reduced if the title exceeds 100 characters')}>
          <TextField type="number" min={1} max={10} className="w-24" aria-label={L('จำนวนสูงสุดในชื่อคลิป', 'Max in video title')} value={String(p.artistMax || 4)} onValue={(v) => update({ artistMax: artistMaxOf(v) })} />
        </Kv>
      </Section>

      <Section title={L('การเผยแพร่', 'Publishing')} icon="send">
        <div className="grid grid-cols-3 gap-1 rounded-[12px] border border-line bg-surface p-1">
          {(Object.entries(VIS) as [Visibility, string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={(p.visibility || 'PRIVATE') === k} onClick={() => update({ visibility: k })}
              className={cn('cursor-pointer rounded-[9px] py-1.5 text-xs text-fg2 hover:text-fg', (p.visibility || 'PRIVATE') === k && 'bg-surface2 text-fg')}>{label}</button>
          ))}
        </div>
        <Kv title={L('EP ถัดไป', 'Next EP')} note={L('ค่าของ {n} สำหรับคลิปถัดไป', 'Value of {n} for the next video')}>
          <NumberField aria-label={L('EP ถัดไป', 'Next EP')} min={1} value={String(n)} onValue={(v) => void write.counter(p.id, epCounter(v)).catch(saveFailed)} />
        </Kv>
      </Section>
      </Fragment>
    </div>
  );
}

// The Presets tab footer (4347–4356).
export function PresetsFooter() {
  const { send, write } = usePanel();
  const ask = useAsk();
  const reset = async () => {
    const go = await ask({
      title: L('คืนค่าพรีเซ็ตทั้งหมด?', 'Reset all presets?'),
      body: L('พรีเซ็ตที่แก้ไว้จะหายไป และกลับเป็นค่าเริ่มต้น (ส่งออกไฟล์สำรองในแท็บตั้งค่าก่อนได้)', 'Your edited presets will be lost and replaced by the defaults (you can export a backup in Settings first)'),
      ok: L('คืนค่าเริ่มต้น', 'Reset to defaults'), danger: true, icon: 'refresh',
    });
    if (go !== true) return; // null: replaced or dismissed
    const r = resetPresets();
    try {
      await write.presetsAndActive(r.presets, r.activeId);
    } catch (e) {
      return saveFailed(e);
    }
    resetListeners.forEach((f) => f(r.activeId));
  };
  const apply = () => send('fill:apply', undefined).catch((e: unknown) => {
    console.error('[ytup] fill:apply failed', e);
    toast(L(`ใส่ลงหน้าต่างที่เปิดอยู่ไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't apply to the open window (${(e as Error)?.message ?? e})`));
  });
  return (
    // At 320px the two buttons don't fit side by side in English: the second takes the next line.
    <div className="flex flex-wrap gap-2 border-t border-line px-[18px] py-3.5">
      <Button className="flex-1" title={L('ใส่พรีเซ็ตหลักลงหน้าต่างอัปโหลดที่เปิดอยู่', 'Apply the default preset to the open upload dialog')} onClick={() => void apply()}>
        <Icon name="send" size={14} />{L('ใส่ลงหน้าต่างที่เปิดอยู่', 'Apply to open window')}
      </Button>
      <Button variant="ghostDanger" onClick={() => void reset()}><Icon name="refresh" size={14} />{L('คืนค่าเริ่มต้น', 'Reset to defaults')}</Button>
    </div>
  );
}
