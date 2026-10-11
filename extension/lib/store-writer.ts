import { browser } from 'wxt/browser';
import { applyBackup, cleanPresets, writeBackup, type BackupImport } from './backup';
import { applyOp, isClaimsOp, opKey } from './claims/ops';
import { getLang } from './i18n';
import { isStudioUrl } from './panel-scope';
import { applySettingsPatch, defaultSettings, loadSettings, type SettingsPatch } from './settings';
import { load } from './storage';
import type { StoredChannel } from './studio/channels';
import type { UploadRecord } from './studio/queue-runner';

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

// Who may send the writes. Content scripts on www.youtube.com (the invite page) and the
// file bridge (an extension page inside a Studio tab) never write settings or the copyright
// data (claims:op), or forget stored file handles (files:delete); an import comes from the
// side panel only. `ext` is browser.runtime.getURL('/').
interface Sender { tab?: unknown; url?: string }
const extensionPage = (s: Sender, ext: string) => !s.tab && !!s.url?.startsWith(ext);
export function mayWrite(type: 'store:patch' | 'backup:write' | 'files:delete' | 'claims:op', s: Sender, ext: string): boolean {
  if (type === 'backup:write') return extensionPage(s, ext);
  return extensionPage(s, ext) || (!!s.tab && isStudioUrl(s.url));
}

// The payload crosses a message boundary: only known settings keys holding the type their
// default has get through (lockChannel: null or { id, name }; lang: th / en). Own keys only:
// `in` would let __proto__, constructor and the like through.
const isLock = (v: unknown) => v === null || (isObj(v) && typeof v.id === 'string' && typeof v.name === 'string');
const sameType = (v: unknown, d: unknown) => typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v));
function cleanSettingsPatch(patch: Record<string, unknown>): SettingsPatch {
  const defs = defaultSettings() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'lang') { if (v === 'th' || v === 'en') out.lang = v; }
    else if (k === 'lockChannel') { if (isLock(v)) out.lockChannel = v; }
    else if (k === 'schedule') {
      if (!isObj(v)) continue;
      const sd = defs.schedule as Record<string, unknown>;
      const sch = Object.fromEntries(Object.entries(v).filter(([sk, sv]) => Object.hasOwn(sd, sk) && sameType(sv, sd[sk]) && (sk !== 'unit' || sv === 'hour' || sv === 'day')));
      if (Object.keys(sch).length) out.schedule = sch;
    } else if (Object.hasOwn(defs, k) && sameType(v, defs[k])) out[k] = v;
  }
  return out as SettingsPatch;
}
function cleanStorePatch(p: unknown): StorePatch {
  if (!isObj(p) || (p.key !== 'settings' && p.key !== 'counters')) throw new Error(`store:patch: ${String(isObj(p) ? p.key : p)} is not patched here`);
  if (!isObj(p.patch)) throw new Error('store:patch: the patch is not an object');
  return p.key === 'settings' ? { key: 'settings', patch: cleanSettingsPatch(p.patch) } : { key: 'counters', patch: p.patch as Record<string, number> };
}

export const patchStore = async (p: StorePatch) => {
  const clean = cleanStorePatch(p);
  return serial(() => applyStorePatch(clean));
};

// Import replaces settings as a whole: built from storage in its turn in the same queue,
// so a patch queued before it is kept and none can land in between. The panel parsed and
// cleaned the file; it is cleaned again here, since the message crossed a boundary.
export const writeBackupInOrder = async ({ data, presets, own }: BackupImport) => {
  const list = cleanPresets(presets);
  if (!isObj(data) || !list) throw new Error('backup:write: not a usable backup');
  return serial(async () => {
    const cur = {
      settings: await loadSettings(), cfg: await load<Record<string, unknown>>('cfg', {}),
      uploads: await load<UploadRecord[]>('uploads', []), channels: await load<StoredChannel[]>('channels', []),
    };
    await writeBackup(applyBackup(data, list, own === true, cur));
  });
};

// The copyright data's one writer (D20): each op reads the key from storage and writes the result,
// in the same queue as settings patches and imports, so none lands in between.
export const claimsOpInOrder = async (op: unknown) => {
  if (!isClaimsOp(op)) throw new Error('claims:op: malformed');
  return serial(async () => {
    const key = opKey(op);
    const next = applyOp((await browser.storage.local.get(key))[key], op);
    if (next === undefined) await browser.storage.local.remove(key);
    else await browser.storage.local.set({ [key]: next });
  });
};

// The userscript stored the language on its first load; a new install's language must
// not flip to Thai later just because presets get saved.
export const ensureLang = () =>
  serial(async () => {
    const s = (await browser.storage.local.get('settings')).settings;
    if (isObj(s) && (s.lang === 'th' || s.lang === 'en')) return;
    await applyStorePatch({ key: 'settings', patch: { lang: getLang() } });
  });

// What ensureMigrated answers. An import stores BACKUP_SCHEMA and then migrates it up, so
// the version is read in the queue: after any import written so far, never in between.
export const schemaVersionInOrder = () => serial(() => load('schemaVersion', 0));
