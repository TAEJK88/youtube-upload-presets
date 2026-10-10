import { browser } from 'wxt/browser';
import { isStudioUrl } from './panel-scope';

// One automation lock for every job that drives Studio (D21): the upload queue ('queue') and
// the copyright jobs that change pages — trim, ads, Collab runs ('claims'). The holder's tab id
// and its jobs live in storage.session, so they survive the service worker being stopped.
// storage.session is cleared when the browser closes AND when the extension is reloaded or
// updated, which is the safety net for a stale lock. A holder whose tab is gone, discarded,
// or no longer on Studio doesn't count. Known limitation: a live Studio tab whose runner died
// (content script gone, or the page hung) keeps the lock until that tab navigates away,
// closes, or reloads.
export const LOCK_KEY = 'runnerTabId';
export const JOBS_KEY = 'runnerJobs';
export type Job = 'queue' | 'claims';
export const isJob = (v: unknown): v is Job => v === 'queue' || v === 'claims';

// A tab that is there, not discarded (Memory Saver), and on Studio.
const liveStudio = (id: number) =>
  browser.tabs.get(id).then((t) => !!t && !t.discarded && isStudioUrl(t.url), () => false);

// The asking tab, for messages only a Studio tab may send (the lock, the worker lease).
export const studioTab = (s: { tab?: { id?: number; url?: string }; url?: string }): number | null =>
  s.tab?.id !== undefined && isStudioUrl(s.tab.url ?? s.url) ? s.tab.id : null;

// Calls run one after another, so two tabs can't both see "free" and both take it.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

interface Holder { id: number; jobs: Job[] }
async function holder(): Promise<Holder | null> {
  const got = await browser.storage.session.get([LOCK_KEY, JOBS_KEY]);
  const id = got[LOCK_KEY];
  if (typeof id !== 'number') return null;
  if (!(await liveStudio(id))) {
    await browser.storage.session.remove([LOCK_KEY, JOBS_KEY]);
    return null;
  }
  // A lock written before jobs existed was the queue's.
  const jobs = Array.isArray(got[JOBS_KEY]) ? (got[JOBS_KEY] as unknown[]).filter(isJob) : ['queue' as Job];
  return { id, jobs };
}

export const acquireRunner = (tabId: number, job: Job) =>
  serial(async () => {
    const h = await holder();
    if (h && h.id !== tabId) return false;
    const jobs = h ? [...new Set([...h.jobs, job])] : [job];
    await browser.storage.session.set({ [LOCK_KEY]: tabId, [JOBS_KEY]: jobs });
    return true;
  });

export const releaseRunner = (tabId: number, job: Job | 'all') =>
  serial(async () => {
    const h = await holder();
    if (!h || h.id !== tabId) return;
    const jobs = job === 'all' ? [] : h.jobs.filter((j) => j !== job);
    if (jobs.length) await browser.storage.session.set({ [JOBS_KEY]: jobs });
    else await browser.storage.session.remove([LOCK_KEY, JOBS_KEY]);
  });

// Another tab holds the lock — for `job`, or for anything ('any').
export const runnerElsewhere = (tabId: number, job: Job | 'any') =>
  serial(async () => {
    const h = await holder();
    return !!h && h.id !== tabId && (job === 'any' || h.jobs.includes(job));
  });

// This tab holds the lock for `job` (a page back after its own reload asks).
export const runnerHolds = (tabId: number, job: Job) =>
  serial(async () => {
    const h = await holder();
    return !!h && h.id === tabId && h.jobs.includes(job);
  });

// Any live holder at all: the background refuses a backup import while a run is going.
export const runnerHeld = () => serial(async () => (await holder()) !== null);
// The error message backup:write rejects with then; the panel says "stop the queue first".
export const RUNNER_HELD = 'runner-held';

// One worker per channel (D21), the userscript's tab lease tabLock:<ch> (5043–5062): the first
// live Studio tab on the channel that asks; `force` takes it (isWorker(true), a run started there).
// A tab is the worker of one channel at most: asking for another lets the old one go. A lease
// not renewed for LEASE_STALE is free (a hung page, a dead script: the userscript's 20 s); a
// closed tab's goes at once (registerRunnerLock). Renewals are written every RENEW at most.
export const WORKERS_KEY = 'claimsWorkers';
export const LEASE_STALE = 20_000;
const RENEW = 5_000;
interface Lease { tabId: number; at: number }
type Leases = Record<string, Lease>;
// A null-prototype map: a channel id like '__proto__' is an ordinary key.
async function readLeases(): Promise<Leases> {
  const got = (await browser.storage.session.get(WORKERS_KEY))[WORKERS_KEY];
  const w: Leases = Object.create(null);
  if (got && typeof got === 'object') {
    for (const [c, l] of Object.entries(got as Record<string, unknown>)) {
      const x = l as Partial<Lease> | null;
      if (typeof x?.tabId === 'number' && typeof x.at === 'number') w[c] = { tabId: x.tabId, at: x.at };
    }
  }
  return w;
}
export const claimWorker = (tabId: number, ch: string, force: boolean) =>
  serial(async () => {
    const now = Date.now();
    const w = await readLeases();
    let changed = false;
    for (const [c, l] of Object.entries(w)) {
      if (l.tabId === tabId && c !== ch) {
        delete w[c];
        changed = true;
      }
    }
    const cur = w[ch];
    const mine = force || !cur || cur.tabId === tabId || now - cur.at > LEASE_STALE || !(await liveStudio(cur.tabId));
    if (mine && (cur?.tabId !== tabId || now - cur.at >= RENEW)) {
      w[ch] = { tabId, at: now };
      changed = true;
    }
    if (changed) await browser.storage.session.set({ [WORKERS_KEY]: w });
    return mine;
  });
// The channel's worker tab, for the Auto-pilot alarm: a lease that isn't stale, in a live tab.
export const workerOf = (ch: string) =>
  serial(async () => {
    const l = (await readLeases())[ch];
    return l && Date.now() - l.at <= LEASE_STALE && (await liveStudio(l.tabId)) ? l.tabId : null;
  });
const dropWorker = (tabId: number) =>
  serial(async () => {
    const w = await readLeases();
    const keep = Object.entries(w).filter(([, l]) => l.tabId !== tabId);
    if (keep.length !== Object.keys(w).length) await browser.storage.session.set({ [WORKERS_KEY]: Object.fromEntries(keep) });
  });

// Called once from the background: a closed tab frees the lock and its worker lease right away.
// `onChange` hears every change of the lock or its jobs (not of the worker leases).
export function registerRunnerLock(onChange?: () => void) {
  browser.tabs.onRemoved.addListener((tabId) => {
    releaseRunner(tabId, 'all').catch(console.error);
    dropWorker(tabId).catch(console.error);
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && (LOCK_KEY in changes || JOBS_KEY in changes)) onChange?.();
  });
}
