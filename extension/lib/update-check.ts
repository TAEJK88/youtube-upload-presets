import { browser } from 'wxt/browser';

// Update check (spec "Background"): the team installs an unpacked zip, so nothing updates the
// extension for them. About once a day the background asks GitHub for the repo's latest release;
// the side panel shows a banner when its version is above the installed one. Any failure is
// silent, keeps the last good answer, and is tried again a day later (not sooner: call 21).
export const UPDATE_KEY = 'updateCheck';
export const UPDATE_ALARM = 'update-check';
const LATEST = 'https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest';
const RELEASES = 'https://github.com/TAEJK88/youtube-upload-presets/releases/';
// A little under a day: the daily alarm fires 24 h after the last one, and a gate of exactly
// 24 h would skip its call by the milliseconds the last check took.
const GATE = 23 * 3600e3;
const TIMEOUT = 10_000;

export interface UpdateInfo { at: number; latest: string; url: string }

const VERSION = /^\d+(\.\d+){0,3}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function newer(a: string, b: string): boolean {
  if (!VERSION.test(a) || !VERSION.test(b)) return false;
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

const asInfo = (v: unknown): UpdateInfo | null =>
  isObj(v) && typeof v.at === 'number' && typeof v.latest === 'string' && typeof v.url === 'string'
    ? { at: v.at, latest: v.latest, url: v.url }
    : null;

// The link as the browser would open it ('..' resolved), if it is one of this repo's release
// pages; null for any other link and for text that is not a URL.
function releasePage(url: string): string | null {
  try {
    const href = new URL(url).href;
    return href.startsWith(RELEASES) ? href : null;
  } catch {
    return null;
  }
}

export function updateAvailable(info: unknown, current: string): UpdateInfo | null {
  const i = asInfo(info);
  const url = i && releasePage(i.url);
  return i && url && newer(i.latest, current) ? { ...i, url } : null;
}

async function latestRelease(fetchFn: typeof fetch): Promise<{ latest: string; url: string }> {
  // credentials: 'omit' — no cookie for github.com goes along, whatever the user is signed in to.
  const res = await fetchFn(LATEST, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' });
  if (!res.ok) throw new Error('GitHub answered ' + res.status);
  const body: unknown = await res.json();
  if (!isObj(body) || typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') throw new Error('unexpected answer');
  const latest = body.tag_name.replace(/^v/, '');
  const url = releasePage(body.html_url);
  if (!VERSION.test(latest) || !url) throw new Error('not a release of this extension: ' + body.tag_name);
  return { latest, url };
}

export async function checkForUpdate(now = Date.now(), fetchFn: typeof fetch = fetch): Promise<UpdateInfo | null> {
  const old = asInfo((await browser.storage.local.get(UPDATE_KEY))[UPDATE_KEY]);
  // A time in the future is a clock that was set back: ask again rather than wait for it.
  if (old && old.at <= now && now - old.at < GATE) return old;
  let next: UpdateInfo = { at: now, latest: old?.latest ?? '', url: old?.url ?? '' };
  try {
    next = { at: now, ...(await latestRelease(fetchFn)) };
  } catch (e) {
    console.warn('[ytup] update check', e);
  }
  await browser.storage.local.set({ [UPDATE_KEY]: next });
  return next;
}

// Called once from the background, at its top level (MV3 listeners).
export function registerUpdateCheck(): void {
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === UPDATE_ALARM) void checkForUpdate().catch((e) => console.warn('[ytup] update check', e));
  });
  void browser.alarms.get(UPDATE_ALARM)
    .then((cur) => (cur ? undefined : browser.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 24 * 60 })))
    .catch((e) => console.warn('[ytup] update alarm', e));
}
