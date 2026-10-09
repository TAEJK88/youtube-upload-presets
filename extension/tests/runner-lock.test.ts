import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { acquireRunner, claimWorker, registerRunnerLock, releaseRunner, runnerElsewhere, runnerHeld, runnerHolds } from '../lib/runner-lock';

beforeEach(() => fakeBrowser.reset());
const tab = async () => (await browser.tabs.create({ url: 'https://studio.youtube.com/' })).id!;

describe('runner lock', () => {
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
});
