import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVars, cachedCfg, channelProblem, getChannel, refreshCfg, resetCfg } from '../lib/studio/channel';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// A Studio page: the URL path plus the navigation drawer's name / handle / avatar.
function page(pathname: string, drawer?: { name: string; handle: string; avatar: string }) {
  const doc = makeDocument();
  if (drawer) {
    const nav = doc.createElement('ytcp-navigation-drawer');
    const name = doc.createElement('div');
    name.setAttribute('id', 'entity-name');
    name.textContent = ` ${drawer.name} `;
    const sub = doc.createElement('div');
    sub.setAttribute('id', 'entity-subtitle');
    sub.textContent = `Your channel ${drawer.handle}`;
    const av = doc.createElement('div');
    av.setAttribute('id', 'avatar');
    const img = doc.createElement('img');
    img.src = drawer.avatar;
    av.append(img);
    nav.append(name, sub, av);
    doc.body.append(nav);
  }
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { pathname });
}

afterEach(() => {
  resetCfg();
  settings.year = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  settings.lockChannel = null;
  settings.producer = '';
});

describe('getChannel', () => {
  it('takes the id from the URL and the rest from the navigation drawer', () => {
    page('/channel/UCabcdefghijklmn/videos/upload', { name: 'Thai Beats', handle: '@thaibeats', avatar: 'https://yt3/a.jpg' });
    expect(getChannel()).toEqual({ id: 'UCabcdefghijklmn', name: 'Thai Beats', avatar: 'https://yt3/a.jpg', handle: '@thaibeats' });
  });

  it('falls back to ytcfg CHANNEL_ID from the MAIN world, and keeps it if a later read fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    page('/');
    await refreshCfg(async (keys) => Object.fromEntries(keys.map((k) => [k, 'UCfromytcfg12345'])));
    expect(getChannel().id).toBe('UCfromytcfg12345');
    expect(cachedCfg('INNERTUBE_CONTEXT')).toBe('UCfromytcfg12345');
    await refreshCfg(async () => { throw new Error('getCfg: timed out after 10000 ms'); });
    expect(getChannel().id).toBe('UCfromytcfg12345');
  });
});

describe('getChannel without a channel', () => {
  it('has an empty id when the URL has no /channel/UC… and ytcfg has nothing', () => {
    page('/feed/subscriptions');
    expect(getChannel().id).toBe('');
  });

  it('does not keep a ytcfg id from an earlier test (resetCfg)', async () => {
    page('/');
    await refreshCfg(async () => ({ CHANNEL_ID: 'UCleftover123456' }));
    expect(getChannel().id).toBe('UCleftover123456');
    resetCfg();
    expect(getChannel().id).toBe('');
  });
});

describe('channelProblem', () => {
  it('is empty when no channel is locked or the lock matches', () => {
    page('/channel/UCabcdefghijklmn');
    expect(channelProblem()).toBe('');
    settings.lockChannel = { id: 'UCabcdefghijklmn', name: 'Thai Beats' };
    expect(channelProblem()).toBe('');
  });

  it('says it could not detect the channel when locked and no id can be found', () => {
    page('/');
    settings.lockChannel = { id: 'UCabcdefghijklmn', name: 'Thai Beats' };
    expect(channelProblem()).toBe('Could not detect the current channel (locked to "Thai Beats")');
  });

  it('names both channels when they differ', () => {
    page('/channel/UCotherchannel99', { name: 'Other', handle: '@other', avatar: '' });
    settings.lockChannel = { id: 'UCabcdefghijklmn', name: 'Thai Beats' };
    expect(channelProblem()).toBe('Currently on channel "Other" but locked to "Thai Beats"');
  });
});

describe('buildVars', () => {
  it('uses the producer setting, else the current channel name', () => {
    page('/channel/UCabcdefghijklmn', { name: 'Thai Beats', handle: '@thaibeats', avatar: '' });
    expect(buildVars('Midnight 140bpm.mp4', 1).producer).toBe('Thai Beats');
    settings.producer = 'BLXD';
    expect(buildVars('Midnight 140bpm.mp4', 1).producer).toBe('BLXD');
  });

  it('uses settings.year when set', () => {
    page('/channel/UCabcdefghijklmn', { name: 'Thai Beats', handle: '@thaibeats', avatar: '' });
    settings.year = '2031';
    expect(buildVars('Midnight 140bpm.mp4', 1).year).toBe('2031');
  });
});
