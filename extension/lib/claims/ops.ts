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
  // undefined removes the key, like the userscript's save(k, undefined) then load(k, d) giving d;
  // over the message boundary (JSON) it arrives as no `value` at all, which means the same.
  | { op: 'set'; key: string; value: unknown }
  | { op: 'merge'; key: string; entries: Record<string, unknown> } // a null entry removes it
  | { op: 'list'; key: string; add?: string[]; del?: string[] }
  | { op: 'runItem'; key: string; by: 'key' | 'videoId'; id: string; state: string; msg: string; onlyActive?: boolean }
  | { op: 'songs'; songs: SongsOp };

// The most a songs CSV may hold, in UTF-16 units (a file's bytes are never fewer, so a file the
// panel accepts by its size is never refused here). The history is every channel's, and Thai is
// 3 bytes a character: 10,000 songs x 5 videos with Thai titles export to 7.9 MB, 5,000 x 20 to
// 13 MB (T8 re-review R2). importSongs is linear (13 MB in 0.4 s), so 16 MB costs nothing; the
// limit keeps a wrong file (a video, a database dump) from being parsed, sent as one message and
// held in the one writer's queue.
export const SONGS_CSV_MAX = 16 * 1024 * 1024;

export const opKey = (op: ClaimsOp): string => (op.op === 'songs' ? 'songHistory' : op.key);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const MERGE = new Set(['cfg', 'trimResults', 'adsResults', 'collabResults', 'collabLinks', 'autopilot', 'trimRun', 'adsRun', 'collabRun']);
const RUNS = new Set(['trimRun', 'adsRun', 'collabRun']);
const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
// recordSongs / markSongTrimmed index `e.videos` by videoId: any name Object.prototype has
// (__proto__, toString, …) would read and write the shared built-ins in the background.
// (The song keys always hold a '|', so they can't be one.)
const ROW = ['song', 'artists', 'label', 'claimant', 'type', 'videoId', 'video', 'impact'] as const;
export const okId = (s: unknown): s is string => typeof s === 'string' && !PROTO.has(s) && !(s in Object.prototype);
const isRow = (r: unknown) => isObj(r) && ROW.every((f) => r[f] === undefined || typeof r[f] === 'string') && okId(r.videoId);
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
    case 'record': return Array.isArray(v.rows) && v.rows.every(isRow) && typeof v.chName === 'string' && typeof v.now === 'string';
    case 'trimmed': return typeof v.song === 'string' && okId(v.videoId);
    case 'import': return typeof v.text === 'string' && v.text.length <= SONGS_CSV_MAX && typeof v.now === 'string';
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
    case 'set': return true; // no value: it was undefined before JSON, a removal
    case 'merge': return MERGE.has(name) && isObj(v.entries) && Object.keys(v.entries).every((k) => !PROTO.has(k));
    case 'list': return name === 'trimQueue' && (v.add === undefined || strs(v.add)) && (v.del === undefined || strs(v.del));
    case 'runItem': return RUNS.has(name) && (v.by === 'key' || v.by === 'videoId') && typeof v.id === 'string'
      && typeof v.state === 'string' && typeof v.msg === 'string' && (v.onlyActive === undefined || typeof v.onlyActive === 'boolean');
  }
  return false;
}
