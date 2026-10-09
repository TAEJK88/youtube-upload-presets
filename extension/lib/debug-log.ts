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
// The key is optional (absent on old installs), so it needs no migration; the backup
// export picks its keys by name and never includes it; SyncStores ignore keys they don't manage.
export const DEBUG_LOG_KEY = 'debugLog';
export const LOG_CAP = 300;
const MSG_MAX = 2000;
const STACK_MAX = 4000;
const DEBOUNCE_MS = 500;

export type LogCtx = 'background' | 'panel' | 'studio' | 'studio-main' | 'invite' | 'bridge' | 'debug';
export type LogLevel = 'error' | 'warn' | 'info';
export interface LogEntry { t: number; ctx: LogCtx; level: LogLevel; msg: string; stack?: string }

let pending: LogEntry[] = [];
let memory: LogEntry[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();

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
    memory = [...memory, e].slice(-LOG_CAP);
    if (!alive()) return;
    pending.push(e);
    if (timer === undefined) timer = setTimeout(() => void flushLog(), DEBOUNCE_MS);
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
  chain = chain.then(async () => {
    try {
      if (!alive()) return;
      const cur = (await browser.storage.local.get(DEBUG_LOG_KEY))[DEBUG_LOG_KEY];
      const list = Array.isArray(cur) ? (cur as LogEntry[]) : [];
      await browser.storage.local.set({ [DEBUG_LOG_KEY]: [...list, ...batch].slice(-LOG_CAP) });
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
}

// Message and stack of anything thrown or logged.
export function errorText(e: unknown): { msg: string; stack?: string } {
  try {
    if (e instanceof Error) return { msg: `${e.name}: ${e.message}`, stack: e.stack };
    if (typeof e === 'string') return { msg: e };
    return { msg: JSON.stringify(e) ?? String(e) };
  } catch {
    return { msg: String(e) };
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
