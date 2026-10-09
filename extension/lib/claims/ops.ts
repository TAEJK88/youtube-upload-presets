import { isClaimsKey, splitKey } from './keys';
import { importSongs, markSongTrimmed, recordSongs, type SongRow } from './songs';
import type { Songs } from './types';

// The copyright module's writes, as data (D20). The background applies them one at a time to
// what storage holds (store-writer claimsOpInOrder); a Studio tab applies the same op to its
// copy at once (lib/claims/store.ts). Each op names one key.
export type SongsOp =
  | { fn: 'record'; rows: SongRow[]; chName: string; now: string }
  | { fn: 'trimmed'; song: string; videoId: string }
  | { fn: 'import'; text: string; now: string }
  | { fn: 'delete'; key: string }
  | { fn: 'clear' };
export type ClaimsOp =
  | { op: 'set'; key: string; value: unknown }
  | { op: 'merge'; key: string; entries: Record<string, unknown> } // a null entry removes it
  | { op: 'list'; key: string; add?: string[]; del?: string[] }
  | { op: 'runItem'; key: string; by: 'key' | 'videoId'; id: string; state: string; msg: string; onlyActive?: boolean }
  | { op: 'songs'; songs: SongsOp };

export const opKey = (op: ClaimsOp): string => (op.op === 'songs' ? 'songHistory' : op.key);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const MERGE = new Set(['cfg', 'trimResults', 'adsResults', 'collabResults', 'collabLinks', 'autopilot', 'trimRun', 'adsRun', 'collabRun']);
const RUNS = new Set(['trimRun', 'adsRun', 'collabRun']);
const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
const nameOf = (key: string) => splitKey(key)?.name ?? '';

// The key's next value (undefined: remove it).
export function applyOp(cur: unknown, op: ClaimsOp): unknown {
  switch (op.op) {
    case 'set':
      return op.value === undefined ? undefined : structuredClone(op.value);
    case 'merge': {
      const next: Record<string, unknown> = isObj(cur) ? { ...cur } : {};
      for (const [k, v] of Object.entries(op.entries)) {
        if (v === null) delete next[k];
        else next[k] = structuredClone(v);
      }
      return next;
    }
    case 'list': {
      const del = new Set(op.del ?? []);
      const out = (strs(cur) ? cur : []).filter((x) => !del.has(x));
      for (const x of op.add ?? []) if (!out.includes(x)) out.push(x);
      return out;
    }
    case 'runItem': {
      // setResult() changes the run only while it is active (5661); the ads / Collab results always (5369, 5598).
      if (!isObj(cur) || !Array.isArray(cur.items) || (op.onlyActive && !cur.active)) return cur;
      return { ...cur, items: cur.items.map((it) => (isObj(it) && it[op.by] === op.id ? { ...it, state: op.state, msg: op.msg } : it)) };
    }
    case 'songs': {
      const s = op.songs;
      if (s.fn === 'clear') return {};
      const db = (isObj(cur) ? structuredClone(cur) : {}) as Songs;
      if (s.fn === 'record') recordSongs(db, s.rows, s.chName, s.now);
      else if (s.fn === 'trimmed') markSongTrimmed(db, s);
      else if (s.fn === 'import') importSongs(db, s.text, s.now);
      else delete db[s.key];
      return db;
    }
  }
}

function isSongsOp(v: unknown): v is SongsOp {
  if (!isObj(v)) return false;
  switch (v.fn) {
    case 'record': return Array.isArray(v.rows) && v.rows.every(isObj) && typeof v.chName === 'string' && typeof v.now === 'string';
    case 'trimmed': return typeof v.song === 'string' && typeof v.videoId === 'string';
    case 'import': return typeof v.text === 'string' && typeof v.now === 'string';
    case 'delete': return typeof v.key === 'string' && !PROTO.has(v.key);
    case 'clear': return true;
  }
  return false;
}

// claims:op crosses a message boundary: only well-formed ops on the copyright keys get through.
export function isClaimsOp(v: unknown): v is ClaimsOp {
  if (!isObj(v)) return false;
  if (v.op === 'songs') return isSongsOp(v.songs);
  if (!isClaimsKey(v.key)) return false;
  const name = nameOf(v.key);
  switch (v.op) {
    case 'set': return 'value' in v;
    case 'merge': return MERGE.has(name) && isObj(v.entries) && Object.keys(v.entries).every((k) => !PROTO.has(k));
    case 'list': return name === 'trimQueue' && (v.add === undefined || strs(v.add)) && (v.del === undefined || strs(v.del));
    case 'runItem': return RUNS.has(name) && (v.by === 'key' || v.by === 'videoId') && typeof v.id === 'string'
      && typeof v.state === 'string' && typeof v.msg === 'string' && (v.onlyActive === undefined || typeof v.onlyActive === 'boolean');
  }
  return false;
}
