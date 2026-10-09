import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { acquireRunner, registerRunnerLock, releaseRunner, runnerElsewhere, runnerHeld } from '../lib/runner-lock';

beforeEach(() => fakeBrowser.reset());
const tab = async () => (await browser.tabs.create({ url: 'https://studio.youtube.com/' })).id!;

describe('runner lock', () => {
  it('lets one tab run at a time', async () => {
    const a = await tab();
    const b = await tab();
    expect(await acquireRunner(a)).toBe(true);
    expect(await acquireRunner(a)).toBe(true); // the holder may ask again
    expect(await acquireRunner(b)).toBe(false);
    expect(await runnerElsewhere(b)).toBe(true);
    expect(await runnerElsewhere(a)).toBe(false);
  });

  it('runnerHeld: any live holder counts', async () => {
    const a = await tab();
    expect(await runnerHeld()).toBe(false);
    await acquireRunner(a);
    expect(await runnerHeld()).toBe(true);
    await releaseRunner(a);
    expect(await runnerHeld()).toBe(false);
    await acquireRunner(9999); // no such tab
    expect(await runnerHeld()).toBe(false);
  });

  it('only the holder releases it', async () => {
    const a = await tab();
    const b = await tab();
    await acquireRunner(a);
    await releaseRunner(b);
    expect(await acquireRunner(b)).toBe(false);
    await releaseRunner(a);
    expect(await acquireRunner(b)).toBe(true);
  });

  it('a holder whose tab is gone frees the lock', async () => {
    const b = await tab();
    await acquireRunner(9999); // no such tab
    expect(await runnerElsewhere(b)).toBe(false);
    expect(await acquireRunner(b)).toBe(true);
  });

  it('two tabs asking at once: exactly one wins', async () => {
    const a = await tab();
    const b = await tab();
    const got = await Promise.all([acquireRunner(a), acquireRunner(b)]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });

  it('a holder that navigated away from Studio frees the lock', async () => {
    const a = await tab();
    const b = await tab();
    await acquireRunner(a);
    expect(await acquireRunner(b)).toBe(false);
    await browser.tabs.update(a, { url: 'https://www.youtube.com/' });
    expect(await runnerElsewhere(b)).toBe(false);
    expect(await acquireRunner(b)).toBe(true);
  });

  it('closing the holder tab clears the key without any read', async () => {
    registerRunnerLock();
    const a = await tab();
    await acquireRunner(a);
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
      acquireRunner(a), // true
      acquireRunner(b), // false
      runnerElsewhere(c), // true (a holds)
      releaseRunner(b), // no-op
      acquireRunner(c), // false
      releaseRunner(a),
      runnerElsewhere(b), // false
      acquireRunner(c), // true
      runnerElsewhere(a), // true
    ]);
    expect(got).toEqual([true, false, true, undefined, false, undefined, false, true, true]);
  });
});
