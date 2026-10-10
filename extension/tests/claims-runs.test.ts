// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsOp } from '../lib/claims/ops';
import { load, useMemoryClaims } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import { save as saveState, settings } from '../lib/studio/state';

vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
import * as C from '../lib/claims/claims';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const ops: ClaimsOp[] = [];
const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
const noLock = { acquire: async () => false, release: vi.fn(), worker: async () => true, holds: async () => false };
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ops.length = 0;
  Q.queue.splice(0);
  C.setClaimsUi(ui);
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  C.setClaimsLock({ acquire: async () => true, release: vi.fn(), worker: async () => true, holds: async () => false });
  await C.initClaimsLock();
});
afterEach(() => { C.setClaimsUi(null); setYoutubei(null); vi.restoreAllMocks(); });

describe('ads run', () => {
  beforeEach(() => useMemoryClaims({ [`adsScan:${CH}`]: { date: '', total: 2, rows: [{ videoId: 'a', video: 'A' }, { videoId: 'b', video: 'B' }] } }, async (op) => void ops.push(op)));

  it('starts from the stored scan; a video already on is recorded as such', async () => {
    C.setClaimsLock(noLock); // the run's own step waits: adsOne is called here
    C.adsFromPanel(['a']);
    expect(load<{ items: unknown[] }>(`adsRun:${CH}`, null as never).items).toEqual([{ videoId: 'a', video: 'A', state: 'pending', msg: '' }]);
    setYoutubei(async () => ({ videos: [{ videoId: 'a', monetization: { adMonetization: { userSetMonetization: 'X_ON' } } }] }));
    await C.adsOne({ videoId: 'a', video: 'A', state: 'pending', msg: '' });
    expect(ops).toContainEqual(expect.objectContaining({ op: 'merge', key: `adsResults:${CH}`, entries: { a: expect.objectContaining({ state: 'on', msg: 'Already on' }) } }));
    expect(ops).toContainEqual({ op: 'runItem', key: `adsRun:${CH}`, by: 'videoId', id: 'a', state: 'on', msg: 'Already on', onlyActive: false });
  });

  it('a failed upload left in the queue does not hold the ads run back', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal('location', { pathname: '/channel/x/videos', href: '' });
    Q.queue.push({ id: 'q', status: 'error' } as Q.QueueItem);
    C.adsFromPanel(['a']); // starts the run and its first step
    await vi.waitFor(() => expect(location.href).toBe('/video/a/monetization')); // went to the next video's page
    await vi.advanceTimersByTimeAsync(15_000); // the step frees itself if the page didn't change (5389)
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for the upload queue before changing pages', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem);
    C.adsFromPanel(['a']); // starts the run and its first step
    await vi.waitFor(() => expect(C.computeStatus().stepDetail ?? C.adsStage.detail).toContain('Waiting for the upload queue to clear'));
    expect(location.pathname).toBe('/channel/x/videos');
  });
});

describe('Collab run', () => {
  beforeEach(() => useMemoryClaims({ [`collabScan:${CH}`]: { date: '', total: 1, rows: [{ videoId: 'v', video: 'V' }] }, [`collabLinks:${CH}`]: { '@me2': 'https://www.youtube.com/x' } }, async (op) => void ops.push(op)));

  // chainAcceptInvites (5576–5592): the channels this browser knows are in the state store
  // (its in-memory store in tests); @me2 is ours, on another channel id.
  const finish = () => {
    C.setClaimsLock(noLock); // the run's own step waits: the result is set here
    C.collabFromPanel({ videoIds: ['v'], handles: ['@me2'] });
    C.setCollabResult({ videoId: 'v', video: 'V', state: 'pending', msg: '' }, 'done', 'ok');
    C.stopCollabRun();
  };
  beforeEach(() => saveState('channels', [{ id: 'UCother', name: 'Me 2', avatar: '', handle: '@me2' }]));

  it('ends by switching to your own invited channel to accept it', () => {
    const sw = vi.fn();
    C.setChannelSwitcher(sw);
    settings.autoAcceptInvite = true;
    finish();
    expect(sw).toHaveBeenCalledWith({ handle: '@me2', name: 'Me 2' }, 'https://www.youtube.com/x');
  });

  it('not with auto-accept off, nor while the upload queue has work', () => {
    const sw = vi.fn();
    C.setChannelSwitcher(sw);
    settings.autoAcceptInvite = false;
    finish();
    settings.autoAcceptInvite = true;
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem); // uploadBusy()
    finish();
    expect(sw).not.toHaveBeenCalled();
  });
});
