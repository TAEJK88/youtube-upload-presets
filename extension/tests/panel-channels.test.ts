import { describe, expect, it, vi } from 'vitest';
import { channelUrl, lookupHandle, parseChannelId, parseVanityHandle, withChannel } from '../lib/panel/channels';

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

// What www.youtube.com/channel/<id> carries (seen 2026-10-15): the channel's own externalId and
// vanityChannelUrl in channelMetadataRenderer.
const ID = 'UCsJN9DLhirdKVdnfTnJyfxg';
const PAGE = `..."channelMetadataRenderer":{"title":"Nessy J.","externalId":"${ID}","vanityChannelUrl":"http://www.youtube.com/@NessyJ.official","x":1}...`;

describe('the @handle of a channel with none stored', () => {
  it("reads it from the channel's public page", () => {
    expect(parseVanityHandle(PAGE, ID)).toBe('@NessyJ.official');
  });

  it("not from another channel's page, nor from a page without one", () => {
    expect(parseVanityHandle(PAGE, 'UCbbbbbbbbbbbbbbbbbbbbbb')).toBe('');
    expect(parseVanityHandle(`"externalId":"${ID}"`, ID)).toBe('');
    expect(parseVanityHandle('', ID)).toBe('');
  });

  it('fetches the page without cookies; a failed or refused fetch finds nothing', async () => {
    const get = vi.fn(async () => new Response(PAGE));
    expect(await lookupHandle(ID, get as unknown as typeof fetch)).toBe('@NessyJ.official');
    expect(get).toHaveBeenCalledWith(`https://www.youtube.com/channel/${ID}`, { credentials: 'omit' });
    expect(await lookupHandle(ID, (async () => new Response(PAGE, { status: 404 })) as unknown as typeof fetch)).toBe('');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await lookupHandle(ID, (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toBe('');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
