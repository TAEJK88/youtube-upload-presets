import { describe, expect, it } from 'vitest';
import { channelKeys, isClaimsKey, splitKey } from '../lib/claims/keys';
import { applyOp, isClaimsOp, opKey } from '../lib/claims/ops';

describe('copyright keys', () => {
  it('knows the per-channel and global keys, and nothing else', () => {
    expect(splitKey('claimScan:UCabc_-1')).toEqual({ name: 'claimScan', ch: 'UCabc_-1' });
    expect(splitKey('cfg')).toEqual({ name: 'cfg', ch: null });
    expect(isClaimsKey('claimScan:unknown')).toBe(true);
    for (const bad of ['settings', 'presets', 'tabLock:UC1', 'claimScan:', 'claimScan:../x', 'claimScan', 7]) expect(isClaimsKey(bad)).toBe(false);
    expect(channelKeys('UC1')).toContain('trimRun:UC1');
    expect(channelKeys('UC1')).toContain('songHistory');
  });
});

describe('ops', () => {
  it('set replaces, and undefined removes', () => {
    expect(applyOp({ a: 1 }, { op: 'set', key: 'cfg', value: { b: 2 } })).toEqual({ b: 2 });
    expect(applyOp({ a: 1 }, { op: 'set', key: 'cfg', value: undefined })).toBe(undefined);
  });

  it('merge adds and replaces entries; null removes one', () => {
    expect(applyOp({ a: 1, b: 2 }, { op: 'merge', key: 'trimResults:UC1', entries: { b: 3, c: 4, a: null } })).toEqual({ b: 3, c: 4 });
    expect(applyOp(undefined, { op: 'merge', key: 'autopilot:UC1', entries: { on: true } })).toEqual({ on: true });
  });

  it('list adds once and removes', () => {
    expect(applyOp(['a', 'b'], { op: 'list', key: 'trimQueue:UC1', add: ['b', 'c'], del: ['a'] })).toEqual(['b', 'c']);
  });

  it('runItem changes one item, and only in an active run when asked', () => {
    const run = { active: true, items: [{ key: 'v:c1', state: 'pending', msg: '' }, { key: 'v:c2', state: 'pending', msg: '' }] };
    expect(applyOp(run, { op: 'runItem', key: 'trimRun:UC1', by: 'key', id: 'v:c2', state: 'saved', msg: '0:10–0:20', onlyActive: true }))
      .toEqual({ active: true, items: [run.items[0], { key: 'v:c2', state: 'saved', msg: '0:10–0:20' }] });
    const stopped = { ...run, active: false };
    expect(applyOp(stopped, { op: 'runItem', key: 'trimRun:UC1', by: 'key', id: 'v:c2', state: 'saved', msg: '', onlyActive: true })).toEqual(stopped);
  });

  it('songs ops run the reducers on a copy', () => {
    const cur = {};
    const next = applyOp(cur, { op: 'songs', songs: { fn: 'record', rows: [{ song: 'S', artists: '', label: '', claimant: '', type: '', videoId: 'v', video: 'M', impact: '' }], chName: 'C', now: '2026-10-01T00:00:00Z' } }) as Record<string, unknown>;
    expect(Object.keys(next)).toEqual(['s|']);
    expect(cur).toEqual({});
    expect(applyOp(next, { op: 'songs', songs: { fn: 'delete', key: 's|' } })).toEqual({});
    expect(applyOp(next, { op: 'songs', songs: { fn: 'clear' } })).toEqual({});
    expect(opKey({ op: 'songs', songs: { fn: 'clear' } })).toBe('songHistory');
  });

  it('isClaimsOp refuses other keys, the wrong op for a key, and prototype keys', () => {
    expect(isClaimsOp({ op: 'set', key: 'claimScan:UC1', value: {} })).toBe(true);
    expect(isClaimsOp({ op: 'set', key: 'settings', value: {} })).toBe(false);
    expect(isClaimsOp({ op: 'merge', key: 'claimScan:UC1', entries: {} })).toBe(false); // scans are written whole
    expect(isClaimsOp({ op: 'merge', key: 'cfg', entries: JSON.parse('{"__proto__":{"x":1}}') })).toBe(false);
    expect(isClaimsOp({ op: 'list', key: 'trimResults:UC1', add: ['a'] })).toBe(false);
    expect(isClaimsOp({ op: 'list', key: 'trimQueue:UC1', add: [1] })).toBe(false);
    expect(isClaimsOp({ op: 'runItem', key: 'trimRun:UC1', by: 'title', id: 'x', state: 's', msg: '' })).toBe(false);
    expect(isClaimsOp({ op: 'songs', songs: { fn: 'import', text: 'x', now: 'n' } })).toBe(true);
    expect(isClaimsOp({ op: 'songs', songs: { fn: 'eval' } })).toBe(false);
    expect(isClaimsOp(null)).toBe(false);
  });
});
