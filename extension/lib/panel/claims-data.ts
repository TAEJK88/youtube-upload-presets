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

// Follows one channel's keys: one full read, then each change is applied from its event
// (re-reading 17 keys, the song history among them, per run-item write would cost seconds at size).
export function watchClaims(ch: string, fn: (d: ClaimsData) => void): () => void {
  const keys = new Set(channelKeys(ch));
  let raw: Record<string, unknown> | null = null;
  let early: Record<string, { newValue?: unknown }>[] = [];
  let failed = false; // the read was refused: the next change tries again
  const apply = (changes: Record<string, { newValue?: unknown }>) => {
    for (const [k, c] of Object.entries(changes)) {
      if (!keys.has(k)) continue;
      if (c.newValue === undefined) delete raw![k];
      else raw![k] = c.newValue;
    }
  };
  const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !Object.keys(changes).some((k) => keys.has(k))) return;
    if (!raw) {
      early.push(changes); // before the first read lands
      if (failed) read();
      return;
    }
    apply(changes);
    fn(toClaimsData(ch, raw));
  };
  const read = () => {
    failed = false;
    void browser.storage.local.get(channelKeys(ch)).then((got) => {
      raw = got;
      early.forEach(apply);
      early = [];
      fn(toClaimsData(ch, raw));
    }).catch((e) => {
      failed = true;
      console.error('[ytup] read copyright data', e);
    });
  };
  browser.storage.onChanged.addListener(changed);
  read();
  return () => browser.storage.onChanged.removeListener(changed);
}

export const claimsWrite = (op: ClaimsOp) => sendMessage('claims:op', op);
