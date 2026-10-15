import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTitleMark } from '../lib/studio/page-notify';

afterEach(() => vi.unstubAllGlobals());

describe('setTitleMark', () => {
  it('puts one mark in front of the tab title and replaces it', () => {
    const doc = { title: 'Channel content - YouTube Studio' };
    vi.stubGlobal('document', doc);
    setTitleMark('(1/3) ⬆');
    expect(doc.title).toBe('(1/3) ⬆ Channel content - YouTube Studio');
    setTitleMark('✅');
    expect(doc.title).toBe('✅ Channel content - YouTube Studio');
    setTitleMark('');
    expect(doc.title).toBe('Channel content - YouTube Studio');
  });
});
