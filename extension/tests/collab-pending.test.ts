import { describe, expect, it } from 'vitest';
import { invitedHandles, inviteWaits, waitingByHandle } from '../lib/panel/collab-pending';

const NJ = 'UCsJN9DLhirdKVdnfTnJyfxg'; // the inviting channel
const BLXD = 'UCcpMHMjwVRDTH1Bg7DWeYvA';
const links = { '@BLXDofficial': `https://studio.youtube.com/channel/${BLXD}/collaboration/${NJ}` };
const done = (msg: string, date = '2026-10-15T15:30:00.000Z') => ({ state: 'done', msg, date });

describe('invitedHandles', () => {
  it('reads the handles the run invited, in either language', () => {
    expect(invitedHandles(done('Invited @BLXDofficial, @thaibeats'))).toEqual(['@BLXDofficial', '@thaibeats']);
    expect(invitedHandles(done('เชิญ @NessyJ.official'))).toEqual(['@NessyJ.official']);
  });
  it('not from failures or "already added"', () => {
    expect(invitedHandles({ state: 'failed', msg: '@BLXDofficial: channel not found', date: '' })).toEqual([]);
    expect(invitedHandles(done('Already added @BLXDofficial'))).toEqual([]);
  });
});

describe('inviteWaits', () => {
  it('waits until the watcher saw the video accepted', () => {
    expect(inviteWaits(NJ, 'v1', done('Invited @BLXDofficial'), links, {})).toEqual([{ handle: '@BLXDofficial', accepted: false }]);
    expect(inviteWaits(NJ, 'v1', done('Invited @BLXDofficial'), links, { [BLXD]: { [NJ]: { videos: { v1: 1 } } } })[0]!.accepted).toBe(true);
  });
  it('a visit that found none left clears what was invited before it, not after', () => {
    const acc = { [BLXD]: { [NJ]: { clearedAt: Date.parse('2026-10-15T15:35:00.000Z') } } };
    expect(inviteWaits(NJ, 'v1', done('Invited @BLXDofficial', '2026-10-15T15:30:00.000Z'), links, acc)[0]!.accepted).toBe(true);
    expect(inviteWaits(NJ, 'v2', done('Invited @BLXDofficial', '2026-10-15T15:40:00.000Z'), links, acc)[0]!.accepted).toBe(false);
  });
  it('another inviter\'s acceptance does not count', () => {
    expect(inviteWaits(NJ, 'v1', done('Invited @BLXDofficial'), links, { [BLXD]: { UCother0000000000000000: { videos: { v1: 1 } } } })[0]!.accepted).toBe(false);
  });
});

it('waitingByHandle counts what still waits per channel', () => {
  const results = { v1: done('Invited @BLXDofficial'), v2: done('Invited @BLXDofficial'), v3: { state: 'failed', msg: 'x', date: '' } };
  expect(waitingByHandle(NJ, results, links, { [BLXD]: { [NJ]: { videos: { v1: 1 } } } })).toEqual({ '@blxdofficial': 1 });
});

it('keeps a handle in any script whole', () => {
  expect(invitedHandles(done('Invited @บีทไทย, @thai.beats-2'))).toEqual(['@บีทไทย', '@thai.beats-2']);
  expect(invitedHandles(done('เชิญ @NessyJ · link copied'))).toEqual(['@NessyJ']);
});

it('waitingByHandle keys by the lowercase handle, whatever spelling the run used', () => {
  const results = { v1: done('Invited @blxdofficial'), v2: done('Invited @BLXDofficial') };
  expect(waitingByHandle(NJ, results, links, {})).toEqual({ '@blxdofficial': 2 });
});
