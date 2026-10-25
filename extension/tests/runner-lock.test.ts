import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { acquireRunner, claimWorker, JOBS_KEY, leasedTab, LOCK_KEY, registerRunnerLock, releaseRunner, runnerChannel, runnerElsewhere, runnerHeld, runnerHolds, studioTab, workerOf, WORKERS_KEY } from '../lib/runner-lock';

beforeEach(() => fakeBrowser.reset());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const tab = async () => (await browser.tabs.create({ url: 'https://studio.youtube.com/' })).id!;

describe('runner lock', () => {
  // Written with the lock, so no tab ever sees the queue held without the holder's channel.
  it("the queue's holder channel is stored with the lock and told to other tabs", async () => {
    const a = await tab();
    const b = await tab();
    const set = vi.spyOn(browser.storage.session, 'set');
    expect(await acquireRunner(a, 'queue', 'UCaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(set.mock.calls[0]![0]).toEqual({ [LOCK_KEY]: a, [JOBS_KEY]: ['queue'], runnerChannel: 'UCaaaaaaaaaaaaaaaaaaaaaa' });
    expect(await runnerChannel(b)).toBe('UCaaaaaaaaaaaaaaaaaaaaaa');
    expect(await runnerChannel(a)).toBe(''); // its own lock
    await releaseRunner(a, 'queue');
    expect(await runnerChannel(b)).toBe('');
    expect(await acquireRunner(b, 'claims')).toBe(true); // a copyright job holds no queue channel
    expect(await runnerChannel(a)).toBe('');
  });

  it('a tab holds the lock for its jobs; another tab gets it only when all are gone', async () => {
    const a = await tab();
    const b = await tab();
    expect(await acquireRunner(a, 'claims')).toBe(true);
    expect(await acquireRunner(a, 'queue')).toBe(true); // the same tab may add a job
    expect(await acquireRunner(b, 'queue')).toBe(false);
    expect(await runnerElsewhere(b, 'queue')).toBe(true);
    expect(await runnerElsewhere(b, 'any')).toBe(true);
    await releaseRunner(a, 'queue');
    expect(await runnerElsewhere(b, 'queue')).toBe(false); // the queue isn't running anywhere
    expect(await runnerElsewhere(b, 'any')).toBe(true); // but a copyright job still holds the lock
    expect(await acquireRunner(b, 'queue')).toBe(false);
    expect(await runnerHolds(a, 'claims')).toBe(true);
    expect(await runnerHolds(a, 'queue')).toBe(false); // a holds it for copyright work only
    expect(await runnerHolds(b, 'claims')).toBe(false);
    await releaseRunner(a, 'claims');
    expect(await acquireRunner(b, 'queue')).toBe(true);
    expect((await browser.storage.session.get('runnerJobs')).runnerJobs).toEqual(['queue']);
  });

  it("'all' lets every job of the tab go; a lock from before jobs existed counts as the queue's", async () => {
    const a = await tab();
    await acquireRunner(a, 'claims');
    await acquireRunner(a, 'queue');
    await releaseRunner(a, 'all');
    expect(await runnerHeld()).toBe(false);
    await browser.storage.session.set({ runnerTabId: a }); // written by an older build
    expect(await runnerHolds(a, 'queue')).toBe(true);
  });

  // The userscript's tab lease (5043–5062): one Studio tab per channel runs its copyright jobs.
  it('one worker per channel: the first tab that asks; another channel has its own', async () => {
    const a = await tab();
    const b = await tab();
    expect(await claimWorker(a, 'UC1', false)).toBe(true);
    expect(await claimWorker(b, 'UC1', false)).toBe(false); // two tabs on one channel: one worker
    expect(await claimWorker(a, 'UC1', false)).toBe(true); // renewing
    expect(await claimWorker(b, 'UC2', false)).toBe(true);
  });

  it('force takes it (isWorker(true)); a closed tab, or one gone to another channel, frees it', async () => {
    const a = await tab();
    const b = await tab();
    await claimWorker(a, 'UC1', false);
    expect(await claimWorker(b, 'UC1', true)).toBe(true);
    expect(await claimWorker(a, 'UC1', false)).toBe(false);
    await claimWorker(b, 'UC2', false); // b's page is on UC2 now
    expect(await claimWorker(a, 'UC1', false)).toBe(true);
    registerRunnerLock();
    // fakeBrowser's onRemoved.trigger only fires the event: tab a stays in the fake (tabs.get
    // still answers with Studio), so here only dropWorker can free UC1 for b.
    await fakeBrowser.tabs.onRemoved.trigger(a, { windowId: 1, isWindowClosing: false });
    await vi.waitFor(async () => expect(await claimWorker(b, 'UC1', false)).toBe(true));
  });

  it('runnerHeld: any live holder counts', async () => {
    const a = await tab();
    expect(await runnerHeld()).toBe(false);
    await acquireRunner(a, 'queue');
    expect(await runnerHeld()).toBe(true);
    await releaseRunner(a, 'all');
    expect(await runnerHeld()).toBe(false);
    await acquireRunner(9999, 'queue'); // no such tab
    expect(await runnerHeld()).toBe(false);
  });

  it('only the holder releases it', async () => {
    const a = await tab();
    const b = await tab();
    await acquireRunner(a, 'queue');
    await releaseRunner(b, 'all');
    expect(await acquireRunner(b, 'queue')).toBe(false);
    await releaseRunner(a, 'all');
    expect(await acquireRunner(b, 'queue')).toBe(true);
  });

  it('a holder whose tab is gone frees the lock', async () => {
    const b = await tab();
    await acquireRunner(9999, 'queue'); // no such tab
    expect(await runnerElsewhere(b, 'queue')).toBe(false);
    expect(await acquireRunner(b, 'queue')).toBe(true);
  });

  it('two tabs asking at once: exactly one wins', async () => {
    const a = await tab();
    const b = await tab();
    const got = await Promise.all([acquireRunner(a, 'queue'), acquireRunner(b, 'queue')]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });

  it('a holder that navigated away from Studio frees the lock', async () => {
    const a = await tab();
    const b = await tab();
    await acquireRunner(a, 'queue');
    expect(await acquireRunner(b, 'queue')).toBe(false);
    await browser.tabs.update(a, { url: 'https://www.youtube.com/' });
    expect(await runnerElsewhere(b, 'queue')).toBe(false);
    expect(await acquireRunner(b, 'queue')).toBe(true);
  });

  it('closing the holder tab clears the key without any read', async () => {
    registerRunnerLock();
    const a = await tab();
    await acquireRunner(a, 'queue');
    expect((await browser.storage.session.get('runnerTabId')).runnerTabId).toBe(a);
    await fakeBrowser.tabs.onRemoved.trigger(a, { windowId: 0, isWindowClosing: false });
    await vi.waitFor(async () =>
      expect(await browser.storage.session.get('runnerTabId')).toEqual({}),
    );
  });

  it('closing the worker tab removes its lease entry without any read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    registerRunnerLock();
    const a = await tab();
    const b = await tab();
    await claimWorker(a, 'UC1', false);
    await claimWorker(b, 'UC2', false);
    await fakeBrowser.tabs.onRemoved.trigger(a, { windowId: 0, isWindowClosing: false });
    await vi.waitFor(async () =>
      expect((await browser.storage.session.get('claimsWorkers')).claimsWorkers).toEqual({ UC2: { tabId: b, at: 1_000_000 } }),
    );
  });

  it('mixed calls queued together stay consistent', async () => {
    const a = await tab();
    const b = await tab();
    const c = await tab();
    const got = await Promise.all([
      acquireRunner(a, 'queue'), // true
      acquireRunner(b, 'queue'), // false
      runnerElsewhere(c, 'queue'), // true (a holds)
      releaseRunner(b, 'all'), // no-op
      acquireRunner(c, 'queue'), // false
      releaseRunner(a, 'all'),
      runnerElsewhere(b, 'queue'), // false
      acquireRunner(c, 'queue'), // true
      runnerElsewhere(a, 'queue'), // true
    ]);
    expect(got).toEqual([true, false, true, undefined, false, undefined, false, true, true]);
  });
  it('a worker whose tab left Studio frees the lease', async () => {
    const a = await tab();
    const b = await tab();
    await claimWorker(a, 'UC1', false);
    await browser.tabs.update(a, { url: 'https://www.youtube.com/' });
    expect(await claimWorker(b, 'UC1', false)).toBe(true);
  });

  // The userscript's LEASE_STALE (5050–5058): a worker that stops renewing (a hung page, a
  // dead script) is taken over after 20 s; a closed one at once (onRemoved, above).
  it('a lease not renewed for 20 s is taken by another tab; renewing keeps it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const a = await tab();
    const b = await tab();
    vi.setSystemTime(1_000_000);
    await claimWorker(a, 'UC1', false);
    vi.setSystemTime(1_000_000 + 15_000);
    expect(await claimWorker(a, 'UC1', false)).toBe(true); // renewed
    vi.setSystemTime(1_000_000 + 30_000);
    expect(await claimWorker(b, 'UC1', false)).toBe(false); // 15 s since the renewal
    vi.setSystemTime(1_000_000 + 36_000);
    expect(await claimWorker(b, 'UC1', false)).toBe(true); // 21 s: stale
    expect(await claimWorker(a, 'UC1', false)).toBe(false);
  });

  it('renewing writes storage.session only every 5 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const a = await tab();
    vi.setSystemTime(1_000_000);
    const set = vi.spyOn(browser.storage.session, 'set');
    await claimWorker(a, 'UC1', false);
    vi.setSystemTime(1_000_000 + 4_000);
    await claimWorker(a, 'UC1', false);
    expect(set).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_000_000 + 5_000);
    await claimWorker(a, 'UC1', false);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('a discarded tab holds neither the lock nor the lease', async () => {
    const a = await tab();
    const b = await tab();
    await acquireRunner(a, 'queue');
    await claimWorker(a, 'UC1', false);
    const get = browser.tabs.get.bind(browser.tabs);
    vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) =>
      id === a ? { ...(await get(id)), discarded: true } : get(id)) as never);
    expect(await runnerElsewhere(b, 'any')).toBe(false);
    expect(await acquireRunner(b, 'queue')).toBe(true);
    expect(await claimWorker(b, 'UC1', false)).toBe(true);
  });

  it('a channel id that is a prototype name is an ordinary channel', async () => {
    const a = await tab();
    const b = await tab();
    expect(await claimWorker(a, '__proto__', false)).toBe(true);
    expect(await claimWorker(b, '__proto__', false)).toBe(false);
    expect(await claimWorker(b, 'constructor', false)).toBe(true);
  });

  it('tells its listener when the lock or its jobs change, also when a stale holder is cleaned up', async () => {
    const changed = vi.fn();
    registerRunnerLock(changed);
    const a = await tab();
    await acquireRunner(a, 'queue');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    await acquireRunner(a, 'claims');
    await releaseRunner(a, 'all');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(3));
    await claimWorker(a, 'UC1', false); // the worker lease is not the lock
    await new Promise((r) => setTimeout(r, 0));
    expect(changed).toHaveBeenCalledTimes(3);
    await browser.storage.session.set({ [LOCK_KEY]: 999, [JOBS_KEY]: ['queue'] }); // a holder whose tab is gone
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(4));
    expect(await runnerHeld()).toBe(false); // cleaned up: one more change
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(5));
    await browser.storage.session.set({ [JOBS_KEY]: ['claims'] }); // one job let go: the jobs alone
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(6));
    await browser.storage.session.set({ [LOCK_KEY]: 5 });
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(7));
    await browser.storage.local.set({ [LOCK_KEY]: 5 }); // the same name in another area is not the lock
    await new Promise((r) => setTimeout(r, 0));
    expect(changed).toHaveBeenCalledTimes(7);
  });

  it("workerOf: the channel's worker tab while its lease is fresh", async () => {
    const a = await tab();
    await claimWorker(a, 'UC1', false);
    expect(await workerOf('UC1')).toBe(a);
    expect(await workerOf('UC9')).toBe(null);
    const get = vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: a, url: 'https://studio.youtube.com/', discarded: true } as never);
    expect(await workerOf('UC1')).toBe(null); // Memory Saver: no script runs there
    get.mockRestore();
    await browser.storage.session.set({ [WORKERS_KEY]: { UC1: { tabId: a, at: Date.now() - 21_000 } } });
    expect(await workerOf('UC1')).toBe(null);
  });

  // A hidden tab's timers run about once a minute, so its lease is stale most of the time.
  it("leasedTab: the lease's tab whatever the lease's age, while that tab is live", async () => {
    const a = await tab();
    expect(await leasedTab('UC1')).toBe(null); // no lease
    await browser.storage.session.set({ [WORKERS_KEY]: { UC1: { tabId: a, at: Date.now() - 60_000 }, UC2: { tabId: 999, at: Date.now() } } });
    expect(await workerOf('UC1')).toBe(null);
    expect(await leasedTab('UC1')).toBe(a);
    expect(await leasedTab('UC2')).toBe(null); // the tab is gone
    vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: a, url: 'https://studio.youtube.com/', discarded: true } as never);
    expect(await leasedTab('UC1')).toBe(null);
  });

  it('only a Studio tab may ask for the lock or the lease', () => {
    expect(studioTab({ tab: { id: 4, url: 'https://studio.youtube.com/channel/UC1' } })).toBe(4);
    expect(studioTab({ tab: { id: 4 }, url: 'https://studio.youtube.com/' })).toBe(4);
    expect(studioTab({ tab: { id: 4, url: 'https://www.youtube.com/' } })).toBe(null);
    expect(studioTab({ url: 'chrome-extension://x/sidepanel.html' })).toBe(null);
  });
});
