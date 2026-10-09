import { browser } from 'wxt/browser';
import { DEFAULTS } from '../claims/core';
import { channelKeys, chKey } from '../claims/keys';
import type { ClaimsOp } from '../claims/ops';
import type { AdsScan, Autopilot, ClaimScan, ClaimsCfg, CollabScan, FollowUp, ResultEntry, Run, Songs } from '../claims/types';
import { sendMessage } from '../messages';

// What the Copyright tab shows from chrome.storage.local for the bound tab's channel (the
// channel comes from that tab's ClaimsState), followed live. The panel writes through the
// background like the page does (claims:op, D20); it never writes these keys itself.
export interface ClaimsData {
  ch: string;
  cfg: ClaimsCfg;
  scan: ClaimScan | null;
  adsScan: AdsScan | null;
  adsResults: Record<string, ResultEntry>;
  collabScan: CollabScan | null;
  collabResults: Record<string, ResultEntry>;
  collabLinks: Record<string, string>;
  trimQueue: string[];
  trimResults: Record<string, ResultEntry>;
  trimRun: Run | null;
  adsRun: Run | null;
  collabRun: Run | null;
  followUp: FollowUp;
  autopilot: Autopilot;
  songs: Songs;
  collabHandles: string;
  logOpen: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = <T>(v: unknown, d: T): T => (isObj(v) ? (v as T) : d);

export function toClaimsData(ch: string, raw: Record<string, unknown>): ClaimsData {
  const k = (name: Parameters<typeof chKey>[0]) => raw[chKey(name, ch)];
  return {
    ch,
    cfg: { ...DEFAULTS, ...obj<Partial<ClaimsCfg>>(raw.cfg, {}) }, // cfg() (4605)
    scan: obj<ClaimScan | null>(k('claimScan'), null),
    adsScan: obj<AdsScan | null>(k('adsScan'), null),
    adsResults: obj(k('adsResults'), {}),
    collabScan: obj<CollabScan | null>(k('collabScan'), null),
    collabResults: obj(k('collabResults'), {}),
    collabLinks: obj(k('collabLinks'), {}),
    trimQueue: Array.isArray(k('trimQueue')) ? (k('trimQueue') as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    trimResults: obj(k('trimResults'), {}),
    trimRun: obj<Run | null>(k('trimRun'), null),
    adsRun: obj<Run | null>(k('adsRun'), null),
    collabRun: obj<Run | null>(k('collabRun'), null),
    followUp: obj(k('followUp'), {}),
    autopilot: obj<Autopilot>(k('autopilot'), { on: false, next: 0 }), // getAP() (5823)
    songs: obj(raw.songHistory, {}),
    collabHandles: typeof raw.collabHandles === 'string' ? raw.collabHandles : '',
    logOpen: raw.logOpen === true,
  };
}

export const readClaims = async (ch: string) => toClaimsData(ch, await browser.storage.local.get(channelKeys(ch)));

export function watchClaims(ch: string, fn: (d: ClaimsData) => void): () => void {
  const keys = new Set(channelKeys(ch));
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area !== 'local' || !Object.keys(changes).some((k) => keys.has(k))) return;
    void readClaims(ch).then(fn, (e) => console.error('[ytup] claims read', e));
  };
  browser.storage.onChanged.addListener(changed);
  return () => browser.storage.onChanged.removeListener(changed);
}

export const claimsWrite = (op: ClaimsOp) => sendMessage('claims:op', op);
