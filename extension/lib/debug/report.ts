import { browser } from 'wxt/browser';
import { DEBUG_LOG_KEY, errorText, readLog, type LogCtx, type LogEntry, type LogLevel } from '../debug-log';
import { getHandle, listIds } from '../file-store';
import { sendMessage } from '../messages';
import { SCHEMA_VERSION } from '../migrations';
import { pad } from '../template';

// What the debug page (debug.html) shows, section by section. Each section loads on its
// own and reports its own failure (settle), so one broken part — the background, a tab, the
// file store — never hides the others. Read-only: nothing here writes.

export const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

export type Section<T> = { ok: true; value: T } | { ok: false; error: string };
export async function settle<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: errorText(e).msg };
  }
}

export type Answer<T = unknown> = { ok: true; ms: number; result: T } | { ok: false; ms: number; error: string };
async function timed<T>(fn: () => Promise<T>, ms: number): Promise<Answer<T>> {
  const t0 = performance.now();
  try {
    const result = await withTimeout(Promise.resolve().then(fn), ms);
    return { ok: true, ms: Math.round(performance.now() - t0), result };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: errorText(e).msg };
  }
}

export const pingBackground = () => sendMessage('ensureMigrated', undefined);

export interface Overview {
  version: string; id: string; permissions: string[]; hostPermissions: string[]; userAgent: string;
  schemaVersion: { stored: unknown; build: number };
  background: Answer;
}
export async function overview(ping: () => Promise<unknown> = pingBackground): Promise<Overview> {
  const m = browser.runtime.getManifest();
  const stored = (await browser.storage.local.get('schemaVersion')).schemaVersion;
  return {
    version: m.version,
    id: browser.runtime.id,
    permissions: (m.permissions ?? []).map(String),
    hostPermissions: (m.host_permissions ?? []).map(String),
    userAgent: navigator.userAgent,
    schemaVersion: { stored, build: SCHEMA_VERSION },
    background: await timed(ping, 3000),
  };
}

export interface StoredKey { key: string; bytes: number; value: unknown }
export interface StoredData { local: StoredKey[]; session: { runnerTabId: unknown } }
export async function storedData(): Promise<StoredData> {
  const all = await browser.storage.local.get(null);
  const local = Object.keys(all).sort().map((key) => ({ key, bytes: (JSON.stringify(all[key]) ?? '').length, value: all[key] }));
  const session = await browser.storage.session.get('runnerTabId');
  return { local, session: { runnerTabId: session.runnerTabId } };
}

export interface StudioTab { id: number; title: string; url: string; runner: boolean; answer: Answer<never> | { ok: true; ms: number; items: number } }
type PingTab = (tabId: number) => Promise<unknown>;
export const pingTab: PingTab = (tabId) => sendMessage('queue:view', undefined, tabId);
export async function studioTabs(ping: PingTab = pingTab): Promise<StudioTab[]> {
  const tabs = await browser.tabs.query({ url: 'https://studio.youtube.com/*' });
  const lock = (await browser.storage.session.get('runnerTabId')).runnerTabId;
  return Promise.all(
    tabs.filter((t) => t.id !== undefined).map(async (t) => {
      const a = await timed(() => ping(t.id!), 2000);
      const items = a.ok ? (a.result as { items?: unknown[] } | undefined)?.items : undefined;
      const answer = a.ok ? { ok: true as const, ms: a.ms, items: Array.isArray(items) ? items.length : 0 } : a;
      return { id: t.id!, title: t.title ?? '', url: t.url ?? '', runner: lock === t.id, answer } as StudioTab;
    }),
  );
}

export interface StoredFile { id: string; name?: string; permission?: string; error?: string; queued: boolean }
export interface FileStore { listIds: () => Promise<string[]>; getHandle: (id: string) => Promise<FileSystemFileHandle | undefined> }
const realFiles: FileStore = { listIds, getHandle };
export async function storedFiles(store: FileStore = realFiles): Promise<{ count: number; files: StoredFile[] }> {
  const ids = await store.listIds();
  const queue = (await browser.storage.local.get('queue')).queue;
  const used = new Set<string>();
  for (const it of Array.isArray(queue) ? queue : []) {
    const item = it as { id?: unknown; thumb?: { id?: unknown } };
    if (typeof item?.id === 'string') used.add(item.id);
    if (typeof item?.thumb?.id === 'string') used.add(item.thumb.id);
  }
  const files: StoredFile[] = [];
  for (const id of ids) {
    try {
      const h = await store.getHandle(id);
      if (!h) files.push({ id, error: 'missing', queued: used.has(id) });
      else files.push({ id, name: h.name, permission: await h.queryPermission({ mode: 'read' }), queued: used.has(id) });
    } catch (e) {
      files.push({ id, error: errorText(e).msg, queued: used.has(id) });
    }
  }
  return { count: ids.length, files };
}

export const filterLog = (log: LogEntry[], f: { ctx?: LogCtx; level?: LogLevel }) =>
  log.filter((e) => (!f.ctx || e.ctx === f.ctx) && (!f.level || e.level === f.level)).sort((a, b) => b.t - a.t);

export interface Report {
  generatedAt: string;
  overview: Section<Overview>;
  storage: Section<StoredData>;
  studioTabs: Section<StudioTab[]>;
  files: Section<{ count: number; files: StoredFile[] }>;
  log: LogEntry[];
}
export async function buildReport(deps: { ping?: () => Promise<unknown>; pingTab?: PingTab; files?: FileStore } = {}): Promise<Report> {
  const [ov, storage, tabs, files, log] = await Promise.all([
    settle(() => overview(deps.ping)),
    // the log is the report's own section: not again under stored data
    settle(async () => {
      const d = await storedData();
      return { ...d, local: d.local.map((k) => (k.key === DEBUG_LOG_KEY ? { ...k, value: '(see log)' } : k)) };
    }),
    settle(() => studioTabs(deps.pingTab)),
    settle(() => storedFiles(deps.files)),
    readLog().catch(() => [] as LogEntry[]),
  ]);
  return { generatedAt: new Date().toISOString(), overview: ov, storage, studioTabs: tabs, files, log };
}

export const reportFileName = (d = new Date()) =>
  `ytup-debug-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
