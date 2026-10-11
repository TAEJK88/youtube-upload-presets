import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { checkForUpdate, newer, registerUpdateCheck, UPDATE_ALARM, UPDATE_KEY, updateAvailable } from '../lib/update-check';

const NOW = Date.UTC(2026, 9, 12);
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const REL = 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/';
const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
const stored = async () => (await browser.storage.local.get(UPDATE_KEY))[UPDATE_KEY];
beforeEach(() => { fakeBrowser.reset(); vi.restoreAllMocks(); });

describe('newer', () => {
  it('compares dotted numbers, not text', () => {
    expect(newer('5.0.10', '5.0.9')).toBe(true);
    expect(newer('5.1.0', '5.0.99')).toBe(true);
    expect(newer('5.0.0', '5.0.0')).toBe(false);
    expect(newer('4.29.0', '5.0.0')).toBe(false);
    expect(newer('5.0', '5.0.0')).toBe(false);
    expect(newer('5.0.1', '5.0')).toBe(true);
  });
  it('anything that is not a dotted version is never newer', () => {
    for (const bad of ['', 'latest', '5.x', 'userscript-4.29.0', '5.0.0-beta']) expect(newer(bad, '1.0.0'), bad).toBe(false);
  });
});

describe('checkForUpdate', () => {
  it('asks GitHub for the latest release and stores its version and page', async () => {
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0', draft: false, prerelease: false });
    expect(await checkForUpdate(NOW, f)).toEqual({ at: NOW, latest: '5.1.0', url: REL + 'v5.1.0' });
    expect(vi.mocked(f).mock.calls[0]![0]).toBe('https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest');
    expect(await stored()).toEqual({ at: NOW, latest: '5.1.0', url: REL + 'v5.1.0' });
  });

  it('asks once in 23 hours at most', async () => {
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0' });
    await checkForUpdate(NOW, f);
    await checkForUpdate(NOW + 23 * HOUR - 1, f);
    expect(f).toHaveBeenCalledTimes(1);
    // a little under a day: the daily alarm fires 24 h after the last one and must get through
    await checkForUpdate(NOW + 23 * HOUR, f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('sends no cookies and no auth: nothing about the user goes to GitHub', async () => {
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0' });
    await checkForUpdate(NOW, f);
    const init = vi.mocked(f).mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(Object.keys(init.headers as object).map((h) => h.toLowerCase())).toEqual(['accept']);
  });

  it('a stored time in the future (the clock was set back) does not stop the check for ever', async () => {
    await browser.storage.local.set({ [UPDATE_KEY]: { at: NOW + 10 * DAY, latest: '5.0.0', url: REL + 'v5.0.0' } });
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0' });
    await checkForUpdate(NOW, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no release yet (404)', () => answer({ message: 'Not Found' }, 404)],
    ['rate limited (403)', () => answer({ message: 'API rate limit exceeded' }, 403)],
    ['not JSON', () => answer('<html>', 200)],
    ['a tag that is not a version', () => answer({ tag_name: 'userscript-4.29.0', html_url: REL + 'userscript-4.29.0' })],
    ['a link that is not this repo\'s release page', () => answer({ tag_name: 'v9.0.0', html_url: 'https://evil.example/releases/tag/v9.0.0' })],
    ['offline', () => vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch],
  ])('%s: the last good answer stays, nothing throws, and the next try waits a day', async (_name, make) => {
    const f = make();
    const good = { at: NOW - 2 * DAY, latest: '5.0.1', url: REL + 'v5.0.1' };
    await browser.storage.local.set({ [UPDATE_KEY]: good });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await checkForUpdate(NOW, f)).toEqual({ ...good, at: NOW });
    await checkForUpdate(NOW + 1000, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a failure with nothing stored stores only the time of the try', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await checkForUpdate(NOW, answer({}, 404))).toEqual({ at: NOW, latest: '', url: '' });
  });
});

describe('updateAvailable', () => {
  const info = { at: NOW, latest: '5.1.0', url: REL + 'v5.1.0' };
  it('only for a version above the installed one', () => {
    expect(updateAvailable(info, '5.0.0')).toEqual(info);
    expect(updateAvailable(info, '5.1.0')).toBeNull();
    expect(updateAvailable(info, '5.2.0')).toBeNull();
  });
  it('nothing for a stored value in another shape, or with a link from elsewhere', () => {
    for (const bad of [undefined, null, 'x', {}, { latest: '9.0.0' }, { ...info, url: 'javascript:alert(1)' }, { ...info, url: 'https://github.com/other/repo/releases/tag/v9' }]) {
      expect(updateAvailable(bad, '5.0.0'), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('registerUpdateCheck', () => {
  it('keeps one daily alarm, and a second start does not move it', async () => {
    registerUpdateCheck();
    await vi.waitFor(async () => expect(await browser.alarms.get(UPDATE_ALARM)).toBeTruthy());
    const first = (await browser.alarms.get(UPDATE_ALARM))!.scheduledTime;
    registerUpdateCheck();
    await new Promise((r) => setTimeout(r, 10));
    expect((await browser.alarms.get(UPDATE_ALARM))!.scheduledTime).toBe(first);
    expect((await browser.alarms.getAll()).filter((a) => a.name === UPDATE_ALARM)).toHaveLength(1);
  });
});
