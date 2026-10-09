import { describe, expect, it } from 'vitest';
import { isStudioUrl } from '../lib/panel-scope';

describe('isStudioUrl', () => {
  it('accepts Studio pages', () => {
    expect(isStudioUrl('https://studio.youtube.com/')).toBe(true);
    expect(isStudioUrl('https://studio.youtube.com/channel/UCabc/videos/upload?d=ud')).toBe(true);
  });
  it('rejects other YouTube hosts and look-alikes', () => {
    expect(isStudioUrl('https://www.youtube.com/channel_switcher')).toBe(false);
    expect(isStudioUrl('https://studio.youtube.com.evil.example/')).toBe(false);
  });
  it('rejects missing or unparsable URLs', () => {
    expect(isStudioUrl(undefined)).toBe(false);
    expect(isStudioUrl('')).toBe(false);
    expect(isStudioUrl('not a url')).toBe(false);
  });
});
