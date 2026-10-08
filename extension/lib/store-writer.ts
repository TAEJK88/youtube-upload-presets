import { browser } from 'wxt/browser';
import { writeBackup, type BackupWrites } from './backup';
import { getLang } from './i18n';
import { applySettingsPatch, type SettingsPatch } from './settings';

// settings and counters are written by the side panel and by the Studio page. Each side
// sends only what it changed, and the background applies the changes one at a time, so
// neither can undo the other's with a whole-object write from a stale copy.
export type StorePatch =
  | { key: 'settings'; patch: SettingsPatch }
  | { key: 'counters'; patch: Record<string, number> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

export async function applyStorePatch(p: StorePatch): Promise<void> {
  if (p.key !== 'settings' && p.key !== 'counters') throw new Error(`store:patch: ${String((p as { key: unknown }).key)} is not patched here`);
  const got = (await browser.storage.local.get(p.key))[p.key];
  const base = isObj(got) ? got : {};
  const next = p.key === 'settings'
    ? applySettingsPatch(base, p.patch)
    : { ...base, ...Object.fromEntries(Object.entries(p.patch).filter(([, v]) => Number.isFinite(v))) };
  await browser.storage.local.set({ [p.key]: next });
}

export const patchStore = (p: StorePatch) => serial(() => applyStorePatch(p));

// Import replaces settings as a whole: in the same queue, so a patch can't land in between.
export const writeBackupInOrder = (w: BackupWrites) => serial(() => writeBackup(w));

// The userscript stored the language on its first load; a new install's language must
// not flip to Thai later just because presets get saved.
export const ensureLang = () =>
  serial(async () => {
    const s = (await browser.storage.local.get('settings')).settings;
    if (isObj(s) && (s.lang === 'th' || s.lang === 'en')) return;
    await applyStorePatch({ key: 'settings', patch: { lang: getLang() } });
  });
