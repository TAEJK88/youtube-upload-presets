import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ClaimsOp } from '../lib/claims/ops';
import { disposeClaimsStore, flushClaims, initClaimsStore, load, SEND_TIMEOUT_MS, setWriteFailed, storedRef, write } from '../lib/claims/store';
import { claimsOpInOrder } from '../lib/store-writer';

beforeEach(() => fakeBrowser.reset());
afterEach(() => {
  setWriteFailed(null);
  disposeClaimsStore();
  vi.useRealTimers();
});

describe('claims store in the Studio tab', () => {
  it('reads the per-channel and global keys there are', async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { rows: [1] }, cfg: { ownNames: 'x' }, settings: {} });
    await initClaimsStore(async () => {});
    expect(load('claimScan:UC1', null)).toEqual({ rows: [1] });
    expect(load('cfg', {})).toEqual({ ownNames: 'x' });
    expect(load('claimScan:UC2', 'none')).toBe('none');
  });

  it('a write shows at once and goes to the background as an op', async () => {
    const sent: ClaimsOp[] = [];
    await initClaimsStore(async (op) => { sent.push(op); await claimsOpInOrder(op); }); // the background, in process
    write({ op: 'merge', key: 'trimResults:UC1', entries: { k1: { state: 'saved' } } });
    write({ op: 'merge', key: 'trimResults:UC1', entries: { k2: { state: 'gone' } } });
    expect(Object.keys(load<object>('trimResults:UC1', {}))).toEqual(['k1', 'k2']); // both, before the background answers
    await flushClaims();
    expect(sent.map((o) => o.op)).toEqual(['merge', 'merge']);
    expect(Object.keys((await browser.storage.local.get('trimResults:UC1'))['trimResults:UC1'] as object)).toEqual(['k1', 'k2']);
  });

  it('storedRef(): the same object while the value stands, another after a write here, its result, or a change from elsewhere', async () => {
    await browser.storage.local.set({ songHistory: { a: { title: 'A' } } });
    await initClaimsStore(claimsOpInOrder);
    const first = storedRef('songHistory');
    expect(storedRef('songHistory')).toBe(first); // not a copy
    write({ op: 'songs', songs: { fn: 'delete', key: 'a' } });
    const written = storedRef('songHistory');
    expect(written).not.toBe(first);
    await flushClaims();
    expect(storedRef('songHistory')).toEqual({}); // the same content read back may keep the object
    await browser.storage.local.set({ songHistory: { b: { title: 'B' } } }); // the panel, another tab
    await vi.waitFor(() => expect(storedRef('songHistory')).toEqual({ b: { title: 'B' } }));
    expect(storedRef('songHistory')).not.toBe(written);
    disposeClaimsStore();
    expect(storedRef('songHistory')).toBe(undefined); // a new, empty store
  });

  it('a refused write is logged and the copy goes back to what storage holds', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await initClaimsStore(async () => { throw new Error('claims:op: not allowed'); });
    write({ op: 'set', key: 'logOpen', value: true });
    await flushClaims();
    expect(load('logOpen', false)).toBe(false);
    expect(err).toHaveBeenCalled();
  });

  // Review m5: a background that never answers would freeze the key and hang flushClaims().
  it('a write the background never answers times out, and the copy goes back to what storage holds', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await browser.storage.local.set({ logOpen: false });
    await initClaimsStore(() => new Promise<void>(() => {}));
    vi.useFakeTimers();
    write({ op: 'set', key: 'logOpen', value: true });
    expect(load('logOpen', null)).toBe(true);
    let flushed = false;
    void flushClaims().then(() => (flushed = true));
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS - 1);
    expect(flushed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(flushed).toBe(true));
    expect(load('logOpen', null)).toBe(false);
    expect(String(err.mock.calls[0]?.[1])).toContain('timed out (it may still be applied)');
  });

  // Final review m5: a failed write was in the console only, while the scan said "complete".
  it('a refused or timed-out write is reported to whoever asked to hear (the content script), a stored one is not', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = vi.fn();
    setWriteFailed(failed);
    let answer: () => Promise<void> = async () => { throw new Error('claims:op: not allowed'); };
    await initClaimsStore(() => answer());
    write({ op: 'set', key: 'logOpen', value: true });
    await flushClaims();
    expect(failed.mock.calls).toEqual([['logOpen', expect.objectContaining({ message: 'claims:op: not allowed' })]]);
    answer = async () => {};
    write({ op: 'set', key: 'logOpen', value: true });
    await flushClaims();
    expect(failed).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    answer = () => new Promise<void>(() => {});
    write({ op: 'set', key: 'cfg', value: {} });
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    expect(failed).toHaveBeenLastCalledWith('cfg', expect.objectContaining({ message: expect.stringMatching(/timed out/) }));
    // a listener that throws does not break the write
    setWriteFailed(() => { throw new Error('listener'); });
    answer = async () => { throw new Error('again'); };
    vi.useRealTimers();
    write({ op: 'set', key: 'logOpen', value: false });
    await flushClaims();
  });

  it('an answer in time clears the timer', async () => {
    vi.useFakeTimers();
    await initClaimsStore(async () => {});
    write({ op: 'set', key: 'logOpen', value: true });
    await flushClaims();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposed while loading: the loaded store is dropped', async () => {
    await browser.storage.local.set({ cfg: { ownNames: 'x' } });
    const p = initClaimsStore(async () => {});
    disposeClaimsStore();
    await p;
    expect(load('cfg', null)).toBe(null);
  });

  it('after dispose, writes go nowhere and do not throw (extension reloaded)', async () => {
    await initClaimsStore(async () => {});
    disposeClaimsStore();
    expect(() => write({ op: 'set', key: 'logOpen', value: true })).not.toThrow();
  });
});
