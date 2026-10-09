import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { clearLog, DEBUG_LOG_KEY, readLog, type LogCtx, type LogEntry, type LogLevel } from '@/lib/debug-log';
import { L, locale } from '@/lib/i18n';
import {
  buildReport, filterLog, overview, reportFileName, settle, storedData, storedFiles, studioTabs,
  pingBackground, type Answer, type FileStore, type Section,
} from '@/lib/debug/report';
import { copyText, crashButtons, errorDetail } from '../sidepanel/crash-kit';
import { ThemeToggle } from '../sidepanel/ThemeToggle';

// debug.html: everything that can go wrong, visible and copyable, with no Studio tab open
// and with a broken background. Each section loads on its own and shows its own failure.
// Raw values (keys, JSON, stacks, ids, user agent) are data and are shown as such.
export interface DebugDeps { ping?: () => Promise<unknown>; pingTab?: (tabId: number) => Promise<unknown>; files?: FileStore }

const CTXS: LogCtx[] = ['background', 'panel', 'studio', 'studio-main', 'invite', 'bridge', 'debug'];
const LEVELS: LogLevel[] = ['error', 'warn', 'info'];

const failed = (e: string) => L(`โหลดส่วนนี้ไม่สำเร็จ: ${e}`, `This section failed: ${e}`);
const Data = ({ children }: { children: ReactNode }) => <code className="font-mono text-xs break-all text-fg2">{children}</code>;
const Pre = ({ children }: { children: ReactNode }) => (
  <pre className="mt-1 max-h-96 overflow-auto rounded-[8px] border border-line bg-surface p-2 font-mono text-xs break-words whitespace-pre-wrap text-fg2 select-text">{children}</pre>
);
const json = (v: unknown) => JSON.stringify(v, null, 2) ?? String(v);

// A section's render error stays in the section.
class SectionBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('render error') };
  }
  override componentDidCatch(e: unknown) {
    console.error('[ytup] debug section crashed', e);
  }
  override render() {
    if (this.state.error === null) return this.props.children;
    return <p role="alert" className="text-xs text-err">{failed(errorDetail(this.state.error))}</p>;
  }
}

function Block({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[15px] font-semibold">{title}</h2>
        {actions}
      </div>
      <SectionBoundary>{children}</SectionBoundary>
    </section>
  );
}

function useSection<T>(load: () => Promise<T>) {
  const [s, setS] = useState<Section<T> | null>(null);
  const reload = useCallback(() => void settle(load).then(setS), [load]);
  useEffect(reload, [reload]);
  return [s, reload] as const;
}

function Loaded<T>({ s, children }: { s: Section<T> | null; children: (v: T) => ReactNode }) {
  if (!s) return <p className="text-xs text-fg3">{L('กำลังโหลด…', 'Loading…')}</p>;
  if (!s.ok) return <p role="alert" className="text-xs text-err">{failed(s.error)}</p>;
  return <>{children(s.value)}</>;
}

function answerText(a: Answer | { ok: true; ms: number; items: number }) {
  return a.ok ? L(`ตอบใน ${a.ms} ms`, `answered in ${a.ms} ms`) : L(`ไม่ตอบ: ${a.error}`, `no answer: ${a.error}`);
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,180px)_1fr] gap-x-3 py-1 text-[13px]">
      <span className="text-fg3">{k}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function OverviewSection({ ping }: { ping?: () => Promise<unknown> }) {
  const load = useCallback(() => overview(ping ?? pingBackground), [ping]);
  const [s] = useSection(load);
  return (
    <Block title={L('ภาพรวม', 'Overview')}>
      <Loaded s={s}>
        {(o) => (
          <>
            <Row k={L('เวอร์ชัน', 'Version')}><Data>{o.version}</Data></Row>
            <Row k="ID"><Data>{o.id}</Data></Row>
            <Row k={L('สิทธิ์', 'Permissions')}><Data>{o.permissions.join(', ')}</Data></Row>
            <Row k={L('สิทธิ์โฮสต์', 'Host permissions')}><Data>{o.hostPermissions.join(', ')}</Data></Row>
            <Row k={L('เบราว์เซอร์', 'Browser')}><Data>{o.userAgent}</Data></Row>
            <Row k="schemaVersion"><Data>{`${json(o.schemaVersion.stored)} / SCHEMA_VERSION ${o.schemaVersion.build}`}</Data></Row>
            <Row k={L('เบื้องหลัง (ensureMigrated)', 'Background (ensureMigrated)')}>
              <span className={o.background.ok ? 'text-ok' : 'text-err'}>{answerText(o.background)}</span>
              {o.background.ok && <> <Data>{json(o.background.result)}</Data></>}
            </Row>
          </>
        )}
      </Loaded>
    </Block>
  );
}

function LogSection() {
  const [s, reload] = useSection(readLog);
  const [ctx, setCtx] = useState<LogCtx | ''>('');
  const [level, setLevel] = useState<LogLevel | ''>('');
  const [open, setOpen] = useState<Set<number>>(new Set());
  useEffect(() => {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && DEBUG_LOG_KEY in changes) reload();
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, [reload]);
  const toggle = (i: number) => setOpen((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <Block
      title={L('บันทึกข้อผิดพลาด', 'Error log')}
      actions={
        <>
          <NativeSelect aria-label={L('ที่มา', 'Context')} value={ctx} onChange={(e) => setCtx(e.target.value as LogCtx | '')}>
            <option value="">{L('ทุกที่มา', 'All contexts')}</option>
            {CTXS.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
          <NativeSelect aria-label={L('ระดับ', 'Level')} value={level} onChange={(e) => setLevel(e.target.value as LogLevel | '')}>
            <option value="">{L('ทุกระดับ', 'All levels')}</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </NativeSelect>
          <Button size="sm" onClick={reload}>{L('รีเฟรช', 'Refresh')}</Button>
          <Button size="sm" variant="ghostDanger" onClick={() => void clearLog().then(reload, reload)}>{L('ล้างบันทึก', 'Clear log')}</Button>
        </>
      }
    >
      <Loaded s={s}>
        {(log) => {
          const shown = filterLog(log, { ctx: ctx || undefined, level: level || undefined });
          if (!shown.length) return <p className="text-xs text-fg3">{L('ไม่มีบันทึก', 'No entries')}</p>;
          return (
            <ul className="divide-y divide-line">
              {shown.map((e: LogEntry, i) => (
                <li key={`${e.t}-${i}`} className="py-1.5">
                  <button type="button" className="w-full cursor-pointer text-left" aria-expanded={open.has(i)} onClick={() => toggle(i)}>
                    <span className={`mr-2 font-mono text-xs ${e.level === 'error' ? 'text-err' : e.level === 'warn' ? 'text-warn' : 'text-info'}`}>{e.level}</span>
                    <Data>{`${new Date(e.t).toLocaleString(locale())} · ${e.ctx}`}</Data>
                    <span className="block font-mono text-xs break-words whitespace-pre-wrap text-fg">{e.msg}</span>
                  </button>
                  {open.has(i) && e.stack && <Pre>{e.stack}</Pre>}
                </li>
              ))}
            </ul>
          );
        }}
      </Loaded>
    </Block>
  );
}

function StoredSection() {
  const [s, reload] = useSection(storedData);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <Block title={L('ข้อมูลที่เก็บไว้', 'Stored data')} actions={<Button size="sm" onClick={reload}>{L('รีเฟรช', 'Refresh')}</Button>}>
      <Loaded s={s}>
        {(d) => (
          <>
            <ul className="divide-y divide-line">
              {d.local.map((k) => (
                <li key={k.key} className="py-1.5">
                  <div className="flex items-center gap-2">
                    <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" aria-expanded={open === k.key} onClick={() => setOpen(open === k.key ? null : k.key)}>
                      <Data>{`${k.key} · ${k.bytes} B`}</Data>
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => void copyText(json(k.value)).then((ok) => ok && setCopied(k.key))}>
                      {copied === k.key ? crashButtons().copied : L('คัดลอก', 'Copy')}
                    </Button>
                  </div>
                  {open === k.key && <Pre>{json(k.value)}</Pre>}
                </li>
              ))}
            </ul>
            <Row k="storage.session"><Data>{`runnerTabId: ${json(d.session.runnerTabId)}`}</Data></Row>
          </>
        )}
      </Loaded>
    </Block>
  );
}

function TabsSection({ pingTab }: { pingTab?: (tabId: number) => Promise<unknown> }) {
  const load = useCallback(() => studioTabs(pingTab), [pingTab]);
  const [s, reload] = useSection(load);
  return (
    <Block title={L('แท็บ Studio', 'Studio tabs')} actions={<Button size="sm" onClick={reload}>{L('รีเฟรช', 'Refresh')}</Button>}>
      <Loaded s={s}>
        {(tabs) =>
          tabs.length ? (
            <ul className="divide-y divide-line">
              {tabs.map((t) => (
                <li key={t.id} className="py-1.5 text-[13px]">
                  <div className="font-medium">{t.title}</div>
                  <Data>{`#${t.id} · ${t.url}`}</Data>
                  <div className={t.answer.ok ? 'text-ok' : 'text-err'}>
                    {answerText(t.answer)}
                    {t.answer.ok && 'items' in t.answer && <> <Data>{`queue:view · ${t.answer.items}`}</Data></>}
                  </div>
                  {t.runner && <div className="text-warn">{L('ถือล็อกคิวอยู่', 'Holds the runner lock')}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg3">{L('ไม่มีแท็บ Studio ที่เปิดอยู่', 'No Studio tabs open')}</p>
          )
        }
      </Loaded>
    </Block>
  );
}

function FilesSection({ files }: { files?: FileStore }) {
  const load = useCallback(() => storedFiles(files), [files]);
  const [s, reload] = useSection(load);
  return (
    <Block title={L('ไฟล์ที่เก็บไว้', 'Stored files')} actions={<Button size="sm" onClick={reload}>{L('รีเฟรช', 'Refresh')}</Button>}>
      <Loaded s={s}>
        {(f) =>
          f.count ? (
            <ul className="divide-y divide-line">
              {f.files.map((x) => (
                <li key={x.id} className="py-1.5 text-[13px]">
                  <Data>{`${x.name ?? '—'} · ${x.permission ?? x.error ?? ''} · ${x.id}`}</Data>
                  <div className={x.queued ? 'text-fg2' : 'text-fg3'}>{x.queued ? L('อยู่ในคิว', 'In the queue') : L('ไม่อยู่ในคิว', 'Not in the queue')}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg3">{L('ไม่มีไฟล์ที่เก็บไว้', 'No stored files')}</p>
          )
        }
      </Loaded>
    </Block>
  );
}

function ActionsSection(deps: DebugDeps) {
  const [note, setNote] = useState('');
  const [migr, setMigr] = useState<string | null>(null);
  const report = async () => JSON.stringify(await buildReport(deps), null, 2);
  const copy = async () => {
    const ok = await copyText(await report());
    setNote(ok ? crashButtons().copied : L('คัดลอกไม่สำเร็จ', "Couldn't copy"));
  };
  const download = async () => {
    const url = URL.createObjectURL(new Blob([await report()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const migrate = async () => {
    setMigr(null);
    const r = await settle(() => (deps.ping ?? pingBackground)());
    setMigr(r.ok ? `ensureMigrated → ${json(r.value)}` : `ensureMigrated ✗ ${r.error}`);
  };
  return (
    <Block title={L('การทำงาน', 'Actions')}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="go" onClick={() => void copy()}>{L('คัดลอกรายงานวินิจฉัย', 'Copy diagnostic report')}</Button>
        <Button size="sm" onClick={() => void download()}>{L('ดาวน์โหลดรายงาน (.json)', 'Download report (.json)')}</Button>
        <Button size="sm" onClick={() => void migrate()}>{L('รันการย้ายข้อมูลอีกครั้ง (ensureMigrated)', 'Re-run migrations (ensureMigrated)')}</Button>
      </div>
      {note && <p role="status" className="mt-2 text-xs text-fg2">{note}</p>}
      {migr && <Pre>{migr}</Pre>}
    </Block>
  );
}

export function DebugPage(deps: DebugDeps = {}) {
  return (
    <main className="mx-auto flex max-w-[900px] flex-col gap-3 px-4 py-5">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">YouTube Upload Presets · {L('หน้าดีบัก', 'Debug page')}</h1>
        <ThemeToggle />
      </div>
      <OverviewSection ping={deps.ping} />
      <LogSection />
      <StoredSection />
      <TabsSection pingTab={deps.pingTab} />
      <FilesSection files={deps.files} />
      <ActionsSection {...deps} />
    </main>
  );
}
