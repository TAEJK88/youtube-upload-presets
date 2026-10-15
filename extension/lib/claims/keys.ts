// Where the copyright module keeps its data in chrome.storage.local: the userscript's keys,
// unchanged (D19). Per channel `<name>:<channelId>` (chGet / chSet, user.js 4628–4629), and
// four global ones. The tab lease `tabLock:<channelId>` (5053) moved to storage.session: the
// background's worker lease (runner-lock claimWorker, D21).
export const CH_KEYS = [
  'claimScan', 'adsScan', 'adsResults', 'adsRun', 'collabScan', 'collabResults', 'collabRun', 'collabLinks',
  'trimQueue', 'trimResults', 'trimRun', 'followUp', 'autopilot',
] as const;
export type ChKey = (typeof CH_KEYS)[number];
export const GLOBAL_KEYS = ['cfg', 'songHistory', 'collabHandles', 'logOpen'] as const;
export const CH_PREFIXES: string[] = CH_KEYS.map((k) => k + ':');

export const chKey = (name: ChKey, ch: string) => `${name}:${ch}`;

// currentChannel() is a UC id, or 'unknown' before Studio says (4625).
const CH_ID = /^[\w-]{1,64}$/;
export const isChannelId = (ch: unknown): ch is string => typeof ch === 'string' && CH_ID.test(ch);
export function splitKey(key: string): { name: string; ch: string | null } | null {
  if ((GLOBAL_KEYS as readonly string[]).includes(key)) return { name: key, ch: null };
  const i = key.indexOf(':');
  if (i < 0) return null;
  const name = key.slice(0, i);
  const ch = key.slice(i + 1);
  return (CH_KEYS as readonly string[]).includes(name) && CH_ID.test(ch) ? { name, ch } : null;
}
export const isClaimsKey = (k: unknown): k is string => typeof k === 'string' && splitKey(k) !== null;
// Every key the Copyright tab reads for one channel.
export const channelKeys = (ch: string): string[] => [...CH_KEYS.map((k) => chKey(k, ch)), ...GLOBAL_KEYS];
