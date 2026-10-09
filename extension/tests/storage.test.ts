import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { load, save } from '../lib/storage';

beforeEach(() => fakeBrowser.reset());

describe('storage', () => {
  it('returns the fallback for a missing key', async () => {
    expect(await load('presets', ['default'])).toEqual(['default']);
  });

  it('round-trips a value', async () => {
    await save('activeId', 'trapsoul');
    expect(await load('activeId', 'x')).toBe('trapsoul');
  });

  it('keeps falsy stored values instead of the fallback (GM_getValue semantics)', async () => {
    await save('flag', false);
    await save('n', 0);
    expect(await load('flag', true)).toBe(false);
    expect(await load('n', 5)).toBe(0);
  });
});
