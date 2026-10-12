import { browser } from 'wxt/browser';

// A diagnostic log every extension context appends to, read by the debug page (debug.html).
// It lives in chrome.storage.local under DEBUG_LOG_KEY as a ring buffer of LOG_CAP entries.
//
// Each context writes the key itself (read, append, cut, write) instead of sending entries
// to the background: the log matters most when the background is the thing that's broken,
// and storage works without it. The cost is a lost update when two contexts flush at the
// same moment (one batch overwrites the other's); acceptable for a diagnostic log. Within
// one context flushes run one after another, so its own entries are never lost that way.
//
// Nothing here may throw or log to the console: it runs inside console wrappers and error
// handlers. Failures are swallowed, and the entries stay in memory (memoryLog()).
//
// Error storms (a MutationObserver path that throws on every Studio mutation) and chatty info
// lines are kept cheap three ways:
// - repeats collapse: an entry with the same ctx, level and msg as the one before it only
//   raises that entry's `count` (its time and stack stay the first occurrence's), in memory,
//   in a batch and against the last stored entry;
// - cutting to LOG_CAP drops the oldest info entries before any warn or error, so a run's
//   chatter never pushes out the error that explains it;
// - a context writes at most once every MIN_GAP_MS: the first entry after a quiet spell is
//   written ~DEBOUNCE_MS later, but while entries keep coming each write waits until
//   MIN_GAP_MS after the previous one. Every write rewrites the whole key (and every
//   storage.onChanged listener gets old and new value), so this bounds a storm to one
//   rewrite per 2 s per context however many lines it logs.
// The key is optional (absent on old installs), so it needs no migration; the backup
// export picks its keys by name and never includes it; SyncStores ignore keys they don't manage.
export const DEBUG_LOG_KEY = 'debugLog';
export const LOG_CAP = 300;
const MSG_MAX = 2000;
const STACK_MAX = 4000;
const DEBOUNCE_MS = 500;
const MIN_GAP_MS = 2000;

export type LogCtx = 'background' | 'panel' | 'studio' | 'studio-main' | 'invite' | 'bridge' | 'debug' | 'allow';
export type LogLevel = 'error' | 'warn' | 'info';
// count: how many times it happened in a row (absent = once).
export interface LogEntry { t: number; ctx: LogCtx; level: LogLevel; msg: string; stack?: string; count?: number }

let pending: LogEntry[] = [];
let memory: LogEntry[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();
let lastFlush = -Infinity;

const same = (a: LogEntry | undefined, b: LogEntry) => !!a && a.ctx === b.ctx && a.level === b.level && a.msg === b.msg;

// Appends e to list (a new array), collapsing it into the last entry when it repeats it.
function push(list: LogEntry[], e: LogEntry): LogEntry[] {
  const last = list.at(-1);
  if (!same(last, e)) return [...list, e];
  return [...list.slice(0, -1), { ...last!, count: (last!.count ?? 1) + (e.count ?? 1) }];
}

// The newest LOG_CAP entries, dropping the oldest info entries first.
function cap(list: LogEntry[]): LogEntry[] {
  let extra = list.length - LOG_CAP;
  if (extra <= 0) return list;
  const kept = list.filter((e) => (extra > 0 && e.level === 'info' ? (extra--, false) : true));
  return kept.slice(-LOG_CAP);
}

// After an extension reload, a content script's chrome.runtime.id reads undefined and every
// extension API throws: from then on the log is a no-op.
const alive = () => {
  try {
    return !!browser?.runtime?.id && !!browser.storage?.local;
  } catch {
    return false;
  }
};

export function appendLog(ctx: LogCtx, level: LogLevel, msg: string, stack?: string): void {
  try {
    const e: LogEntry = { t: Date.now(), ctx, level, msg: String(msg).slice(0, MSG_MAX) };
    if (stack) e.stack = String(stack).slice(0, STACK_MAX);
    memory = cap(push(memory, e));
    if (!alive()) return;
    pending = push(pending, e);
    if (timer === undefined) timer = setTimeout(() => void flushLog(), Math.max(DEBOUNCE_MS, lastFlush + MIN_GAP_MS - Date.now()));
  } catch {
    // never throw from the log
  }
}

// Writes what is pending now. Never rejects.
export function flushLog(): Promise<void> {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  const batch = pending;
  pending = [];
  if (!batch.length) return chain;
  lastFlush = Date.now();
  chain = chain.then(async () => {
    try {
      if (!alive()) return;
      const cur = (await browser.storage.local.get(DEBUG_LOG_KEY))[DEBUG_LOG_KEY];
      const list = Array.isArray(cur) ? (cur as LogEntry[]) : [];
      await browser.storage.local.set({ [DEBUG_LOG_KEY]: cap(batch.reduce(push, list)) });
    } catch {
      // storage full, context gone, …: the entries stay in memoryLog()
    }
  });
  return chain;
}

export const memoryLog = (): LogEntry[] => memory.slice();

export async function readLog(): Promise<LogEntry[]> {
  const v = (await browser.storage.local.get(DEBUG_LOG_KEY))[DEBUG_LOG_KEY];
  return Array.isArray(v) ? (v as LogEntry[]) : [];
}

export async function clearLog(): Promise<void> {
  await flushLog();
  memory = [];
  await browser.storage.local.remove(DEBUG_LOG_KEY);
}

export function resetLogForTests(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  pending = [];
  memory = [];
  chain = Promise.resolve();
  lastFlush = -Infinity;
}

// Message and stack of anything thrown or logged.
export function errorText(e: unknown): { msg: string; stack?: string } {
  try {
    if (e instanceof Error) return { msg: `${e.name}: ${e.message}`, stack: e.stack };
    if (typeof e === 'string') return { msg: e };
    return { msg: JSON.stringify(e) ?? String(e) };
  } catch {
    try {
      return { msg: String(e) };
    } catch {
      return { msg: Object.prototype.toString.call(e) }; // no toString, a revoked Proxy, …
    }
  }
}

const argText = (a: unknown) => (typeof a === 'string' ? a : errorText(a).msg);

interface CaptureOpts {
  target?: EventTarget; // self in the service worker, window in pages
  console?: Console;
  // Content scripts: only error events from the extension's own files (the page's own
  // errors are not ours).
  ownFilesOnly?: boolean;
}

// Wraps console.error / warn (and console.info / log lines starting with "[ytup]"), and
// listens to error / unhandledrejection, appending each to the log. The console still prints.
// Installed before anything else evaluates: in background, studio.content and invite.content
// through lib/debug-capture/<ctx>.ts (their first import), in the side panel and the debug page
// through the crash guard (likewise imported first), and at the top of the file bridge. Not in
// studio-main.content.ts: the MAIN world has no extension APIs; its errors stay in Studio's
// DevTools console.
// A visible side effect of wrapping: DevTools shows this file (the wrapper's orig(...args) line)
// as the source of every console.error / warn line instead of the caller; the expanded stack
// still has the caller. Only a source-map ignore list could hide the wrapper frame, and the build
// ships no source maps, so it stays.
export function installDebugCapture(ctx: LogCtx, opts: CaptureOpts = {}): void {
  const con = opts.console ?? console;
  const target = opts.target ?? globalThis;
  let busy = false; // a wrapper called from inside the log: don't loop
  const wrap = (name: 'error' | 'warn' | 'info' | 'log', level: LogLevel, onlyOurs: boolean) => {
    const orig = con[name].bind(con);
    con[name] = (...args: unknown[]) => {
      if (!busy && (!onlyOurs || (typeof args[0] === 'string' && args[0].startsWith('[ytup]')))) {
        busy = true;
        try {
          const err = args.find((a) => a instanceof Error) as Error | undefined;
          appendLog(ctx, level, args.map(argText).join(' '), err?.stack);
        } catch {
          // never let the log break the console: the line below still prints
        } finally {
          busy = false;
        }
      }
      orig(...args);
    };
  };
  try {
    wrap('error', 'error', false);
    wrap('warn', 'warn', false);
    wrap('info', 'info', true);
    wrap('log', 'info', true);
    target.addEventListener('error', (ev) => {
      const e = ev as ErrorEvent;
      if (opts.ownFilesOnly && !String(e.filename ?? '').startsWith('chrome-extension://')) return;
      const t = e.error !== undefined && e.error !== null ? errorText(e.error) : { msg: String(e.message ?? 'error') };
      appendLog(ctx, 'error', t.msg, t.stack);
    });
    target.addEventListener('unhandledrejection', (ev) => {
      const t = errorText((ev as PromiseRejectionEvent).reason);
      appendLog(ctx, 'error', `Unhandled rejection: ${t.msg}`, t.stack);
    });
  } catch {
    // a context without these APIs: nothing to capture
  }
}
