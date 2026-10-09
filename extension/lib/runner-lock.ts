import { browser } from 'wxt/browser';
import { isStudioUrl } from './panel-scope';

// One automation lock for every job that drives Studio (D21): the upload queue ('queue') and
// the copyright jobs that change pages — trim, ads, Collab runs ('claims'). The holder's tab id
// and its jobs live in storage.session, so they survive the service worker being stopped.
// storage.session is cleared when the browser closes AND when the extension is reloaded or
// updated, which is the safety net for a stale lock. A holder whose tab is gone, or is no
// longer on Studio, doesn't count. Known limitation: a live Studio tab whose runner died
// (content script gone) keeps the lock until that tab navigates away, closes, or reloads.
const KEY = 'runnerTabId';
export const JOBS_KEY = 'runnerJobs';
export type Job = 'queue' | 'claims';
export const isJob = (v: unknown): v is Job => v === 'queue' || v === 'claims';

// Calls run one after another, so two tabs can't both see "free" and both take it.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

interface Holder { id: number; jobs: Job[] }
async function holder(): Promise<Holder | null> {
  const got = await browser.storage.session.get([KEY, JOBS_KEY]);
  const id = got[KEY];
  if (typeof id !== 'number') return null;
  const onStudio = await browser.tabs.get(id).then((t) => isStudioUrl(t?.url), () => false);
  if (!onStudio) {
    await browser.storage.session.remove([KEY, JOBS_KEY]);
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
    await browser.storage.session.set({ [KEY]: tabId, [JOBS_KEY]: jobs });
    return true;
  });

export const releaseRunner = (tabId: number, job: Job | 'all') =>
  serial(async () => {
    const h = await holder();
    if (!h || h.id !== tabId) return;
    const jobs = job === 'all' ? [] : h.jobs.filter((j) => j !== job);
    if (jobs.length) await browser.storage.session.set({ [JOBS_KEY]: jobs });
    else await browser.storage.session.remove([KEY, JOBS_KEY]);
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
// A tab is the worker of one channel at most: asking for another lets the old one go.
export const WORKERS_KEY = 'claimsWorkers';
const liveStudio = (id: number) => browser.tabs.get(id).then((t) => isStudioUrl(t?.url), () => false);
export const claimWorker = (tabId: number, ch: string, force: boolean) =>
  serial(async () => {
    const got = (await browser.storage.session.get(WORKERS_KEY))[WORKERS_KEY];
    const w: Record<string, number> = got && typeof got === 'object' ? { ...(got as Record<string, number>) } : {};
    for (const [c, id] of Object.entries(w)) if (id === tabId && c !== ch) delete w[c];
    const cur = w[ch];
    const mine = force || cur === tabId || cur === undefined || !(await liveStudio(cur));
    if (mine) w[ch] = tabId;
    await browser.storage.session.set({ [WORKERS_KEY]: w });
    return mine;
  });
const dropWorker = (tabId: number) =>
  serial(async () => {
    const got = (await browser.storage.session.get(WORKERS_KEY))[WORKERS_KEY] as Record<string, number> | undefined;
    if (!got) return;
    const w = Object.fromEntries(Object.entries(got).filter(([, id]) => id !== tabId));
    await browser.storage.session.set({ [WORKERS_KEY]: w });
  });

// Called once from the background: a closed tab frees the lock and its worker lease right away.
export function registerRunnerLock() {
  browser.tabs.onRemoved.addListener((tabId) => {
    releaseRunner(tabId, 'all').catch(console.error);
    dropWorker(tabId).catch(console.error);
  });
}
