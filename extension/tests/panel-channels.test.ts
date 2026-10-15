import { describe, expect, it } from 'vitest';
import { channelUrl, parseChannelId, withChannel } from '../lib/panel/channels';

describe('channel list helpers', () => {
  it('opens the same Studio page on another channel', () => {
    expect(channelUrl('https://studio.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos/upload?x=1', 'UCbbbbbbbbbbbbbbbbbbbbbb'))
      .toBe('https://studio.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb/videos/upload');
    expect(channelUrl('https://studio.youtube.com/', 'UCbbbbbbbbbbbbbbbbbbbbbb')).toBe('https://studio.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('finds a channel id in an id or a link', () => {
    expect(parseChannelId('https://www.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb?x')).toBe('UCbbbbbbbbbbbbbbbbbbbbbb');
    expect(parseChannelId('@handle')).toBe('');
  });

  it('adds an unknown id at the end, once', () => {
    const one = withChannel([], 'UC1');
    expect(one).toEqual([{ id: 'UC1', name: '', avatar: '', handle: '' }]);
    expect(withChannel(one, 'UC1')).toBe(one);
  });
});
