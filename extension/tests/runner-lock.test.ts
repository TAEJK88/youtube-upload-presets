import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { acquireRunner, releaseRunner, runnerElsewhere } from '../lib/runner-lock';

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
});
