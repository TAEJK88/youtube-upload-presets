import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as messages from '../lib/messages';
import { claimsWrite, readClaims, toClaimsData, watchClaims } from '../lib/panel/claims-data';

beforeEach(() => fakeBrowser.reset());

describe('the Copyright tab data', () => {
  it('fills defaults the way the page does', () => {
    const d = toClaimsData('UC1', {});
    expect(d.cfg.apEveryHours).toBe('6');
    expect(d.autopilot).toEqual({ on: false, next: 0 });
    expect(d.scan).toBe(null);
    expect(d.trimQueue).toEqual([]);
    expect(d.songs).toEqual({});
    expect(d.logOpen).toBe(false);
  });

  it("reads one channel's keys, and follows only those", async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { date: 'd', total: 0, rows: [] }, 'claimScan:UC2': { date: 'x' }, cfg: { ownNames: 'Me' } });
    const d = await readClaims('UC1');
    expect(d.scan?.date).toBe('d');
    expect(d.cfg.ownNames).toBe('Me');
    const fn = vi.fn();
    const off = watchClaims('UC1', fn);
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1)); // the first read
    expect(fn.mock.calls[0]![0].scan?.date).toBe('d');
    await browser.storage.local.set({ 'claimScan:UC2': { date: 'y' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fn).toHaveBeenCalledTimes(1);
    await browser.storage.session.set({ 'claimScan:UC1': { date: 'session' } }); // review m3: local only
    await new Promise((r) => setTimeout(r, 0));
    expect(fn).toHaveBeenCalledTimes(1);
    await browser.storage.local.set({ 'trimQueue:UC1': ['v:c'] });
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    expect(fn.mock.calls.at(-1)![0].trimQueue).toEqual(['v:c']);
    off();
  });

  it('a change is applied from the event, without reading storage again', async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { date: 'd', total: 0, rows: [] }, songHistory: { a: {} } });
    const fn = vi.fn();
    const off = watchClaims('UC1', fn);
    await vi.waitFor(() => expect(fn).toHaveBeenCalled()); // the first full read
    const get = vi.spyOn(browser.storage.local, 'get');
    await browser.storage.local.set({ 'trimQueue:UC1': ['v:c'] });
    await vi.waitFor(() => expect(fn.mock.calls.at(-1)![0].trimQueue).toEqual(['v:c']));
    expect(fn.mock.calls.at(-1)![0].scan?.date).toBe('d'); // the rest kept
    expect(get).not.toHaveBeenCalled();
    await browser.storage.local.remove('claimScan:UC1');
    await vi.waitFor(() => expect(fn.mock.calls.at(-1)![0].scan).toBe(null));
    get.mockRestore();
    off();
  });

  it('a change that lands before the first read answers is not lost', async () => {
    let answer!: (v: Record<string, unknown>) => void;
    const get = vi.spyOn(browser.storage.local, 'get').mockReturnValue(new Promise((ok) => { answer = ok; }) as never);
    const fn = vi.fn();
    const off = watchClaims('UC1', fn);
    await browser.storage.local.set({ 'trimQueue:UC1': ['v:c'] });
    await new Promise((r) => setTimeout(r, 0));
    expect(fn).not.toHaveBeenCalled();
    answer({ 'trimQueue:UC1': [] }); // read before the change
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(fn.mock.calls[0]![0].trimQueue).toEqual(['v:c']);
    get.mockRestore();
    off();
  });

  it('a failed read while following is logged, not left unhandled (review m3)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fn = vi.fn();
    const get = vi.spyOn(browser.storage.local, 'get').mockRejectedValue(new Error('context invalidated'));
    const off = watchClaims('UC1', fn);
    await browser.storage.local.set({ 'trimQueue:UC1': ['v:c'] });
    await vi.waitFor(() => expect(err).toHaveBeenCalled());
    expect(fn).not.toHaveBeenCalled();
    get.mockRestore();
    err.mockRestore();
    off();
  });

  it('writes go to the background as ops', async () => {
    const spy = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    await claimsWrite({ op: 'list', key: 'trimQueue:UC1', add: ['a'] });
    expect(spy).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['a'] });
  });
});
