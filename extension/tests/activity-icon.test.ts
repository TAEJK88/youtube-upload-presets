import { describe, expect, it } from 'vitest';
import { emojiIconName } from '../lib/activity';

describe('emojiIconName (the userscript\'s EMOJI_ICON)', () => {
  it('names the icon for an activity emoji, with or without the emoji variation selector', () => {
    expect(emojiIconName('⬆')).toBe('upload');
    expect(emojiIconName('⬆️')).toBe('upload');
    expect(emojiIconName(' ⚠️ ')).toBe('alert');
    expect(emojiIconName('🔍')).toBe('search');
  });

  it('null for anything else (shown as text)', () => {
    expect(emojiIconName('')).toBe(null);
    expect(emojiIconName('x')).toBe(null);
  });
});
