import { L } from '../i18n';
import { isChannelId } from './keys';
import { okId } from './ops';

// Studio's answers reach the tab through the MAIN world, where any page script can answer first
// (lib/main-ops.ts): they are page data. Before the copyright module reads or stores one it is
// copied as plain data (JSON values only, no __proto__ / constructor keys, bounded in depth, size
// and string length), and the parts the module stores or indexes by are checked: the lists are
// lists, the ids make safe keys (the claims:op key rules, ops.ts / keys.ts), the titles are text.
// Anything else refuses the whole answer: the call fails like any other API error.
const MAX_DEPTH = 16;
const MAX_NODES = 200_000;
const MAX_STR = 10_000;
const MAX_LIST = 1000; // a page holds 50 videos (pageSize); a video has a handful of claims

class Bad extends Error {}
const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

function plain(v: unknown): unknown {
  let nodes = 0;
  const copy = (x: unknown, depth: number, at: string): unknown => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Bad(at || 'size');
    if (x === null || typeof x === 'boolean') return x;
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (typeof x === 'string') { if (x.length > MAX_STR) throw new Bad(at); return x; }
    if (Array.isArray(x)) {
      if (x.length > MAX_LIST) throw new Bad(at);
      return x.map((y, i) => copy(y, depth + 1, `${at}[${i}]`));
    }
    if (!isPlain(x)) throw new Bad(at || 'answer');
    const out: Record<string, unknown> = {};
    for (const [k, y] of Object.entries(x)) if (!UNSAFE.has(k) && y !== undefined) out[k] = copy(y, depth + 1, at ? `${at}.${k}` : k);
    return out;
  };
  return copy(v, 0, '');
}

// The checks, on the copy.
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const need = (ok: boolean, at: string) => { if (!ok) throw new Bad(at); };
const obj = (v: unknown, at: string): Obj => (need(isPlain(v), at), v as Obj);
const optObj = (v: unknown, at: string): Obj => (v === undefined ? {} : obj(v, at));
const list = (v: unknown, at: string): unknown[] => (v === undefined ? [] : (need(Array.isArray(v), at), v as unknown[]));
const optStr = (v: unknown, at: string) => need(v === undefined || typeof v === 'string', at);
const optNum = (v: unknown, at: string) => need(v == null || typeof v === 'string' || typeof v === 'number', at); // read with +v
const videoId = (v: unknown, at: string) => need(isChannelId(v) && okId(v), at); // [\w-]{1,64}, not a built-in's name
const someId = (v: unknown, at: string) => need(typeof v === 'string' && v.length > 0 && v.length <= 200 && okId(v), at);

const CHECKS: Record<string, (a: Obj) => void> = {
  // listVideos / listScheduled (4722, 4748)
  'creator/list_creator_videos': (a) => {
    list(a.videos, 'videos').forEach((v, i) => {
      const at = `videos[${i}]`;
      const o = obj(v, at);
      videoId(o.videoId, `${at}.videoId`);
      optStr(o.title, `${at}.title`);
      optStr(o.privacy, `${at}.privacy`);
      optNum(o.lengthSeconds, `${at}.lengthSeconds`);
      const cs = optObj(o.copyrightSummary, `${at}.copyrightSummary`);
      optNum(cs.activeThirdPartyClaimsCount, `${at}.copyrightSummary`);
      const ar = optObj(o.allRestrictions, `${at}.allRestrictions`);
      list(ar.restrictions, `${at}.allRestrictions`).forEach((r) => optStr(obj(r, `${at}.allRestrictions`).reason, `${at}.allRestrictions`));
      list(optObj(ar.summary, `${at}.allRestrictions`).impacts, `${at}.allRestrictions`).forEach((x) => optStr(x, `${at}.allRestrictions`));
      const am = optObj(optObj(o.monetization, `${at}.monetization`).adMonetization, `${at}.monetization`);
      optStr(am.userSetMonetization, `${at}.monetization`);
      optStr(am.effectiveStatus, `${at}.monetization`);
      const sp = optObj(o.scheduledPublishingDetails, `${at}.scheduledPublishingDetails`);
      list(sp.scheduledPublishings, `${at}.scheduledPublishingDetails`).forEach((p) => {
        const s = obj(p, `${at}.scheduledPublishingDetails`);
        optNum(s.scheduledTimeSeconds, `${at}.scheduledPublishingDetails`);
        optStr(s.status, `${at}.scheduledPublishingDetails`);
      });
    });
    optStr(a.nextPageToken, 'nextPageToken');
  },
  // scanClaims (4784): the owners are indexed by id, the claims stored by id
  'creator/list_creator_received_claims': (a) => {
    list(a.contentOwners, 'contentOwners').forEach((o, i) => {
      const c = obj(o, `contentOwners[${i}]`);
      someId(c.contentOwnerId, `contentOwners[${i}].contentOwnerId`);
      optStr(c.displayName, `contentOwners[${i}].displayName`);
    });
    list(a.receivedClaims, 'receivedClaims').forEach((x, i) => {
      const at = `receivedClaims[${i}]`;
      const c = obj(x, at);
      someId(c.claimId, `${at}.claimId`);
      list(c.contentOwnerIds, `${at}.contentOwnerIds`).forEach((id) => need(typeof id === 'string', `${at}.contentOwnerIds`));
      optStr(c.type, `${at}.type`);
      optStr(c.status, `${at}.status`);
      list(optObj(c.nontakedownClaimActions, `${at}.nontakedownClaimActions`).options, `${at}.nontakedownClaimActions`)
        .forEach((x) => optStr(x, `${at}.nontakedownClaimActions`));
      const md = optObj(c.matchDetails, `${at}.matchDetails`);
      optNum(md.longestMatchStartTimeSeconds, `${at}.matchDetails`);
      optNum(md.longestMatchDurationSeconds, `${at}.matchDetails`);
      optObj(c.asset, `${at}.asset`); // claimInfo() walks it and keeps strings only
    });
  },
  // scanClaims (4796)
  'copyright/get_creator_received_claim_matches': (a) => {
    list(optObj(a.matches, 'matches').claimMatches, 'matches').forEach((m, i) => {
      const s = optObj(obj(m, `matches[${i}]`).videoSegment, `matches[${i}]`);
      optNum(s.startMillis, `matches[${i}]`);
      optNum(s.endMillis, `matches[${i}]`);
    });
  },
  // 'creator/get_creator_videos' (4b) has no check yet: its answers are refused until it does.
};

// Studio's answer to `path`, as plain data that passed its check; throws otherwise.
export function checkAnswer(path: string, answer: unknown): Obj {
  try {
    const check = CHECKS[path];
    if (!Object.hasOwn(CHECKS, path) || !check) throw new Bad('no check');
    const a = obj(plain(answer), 'answer');
    check(a);
    return a;
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    throw new Error(L(`คำตอบจาก ${path} ผิดรูปแบบ (${e.message})`, `Unexpected answer from ${path} (${e.message})`));
  }
}
