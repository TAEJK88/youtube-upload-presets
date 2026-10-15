import { describe, expect, it } from 'vitest';
import { artistMaxOf, deletePreset, duplicatePreset, epCounter, newPreset, resetPresets, splitList } from '../lib/panel/presets';
import { fmtDur, fmtSize } from '../lib/panel/format';
import { defaultPresets } from '../lib/presets';

const list = defaultPresets();

describe('preset operations (the drawer\'s preset buttons)', () => {
  it('a new preset gets a time-based id and the drawer\'s starting values', () => {
    expect(newPreset(36 ** 3)).toEqual({ id: 'p1000', label: '✨ New preset', title: '{name}', description: '', tags: [], visibility: 'PRIVATE' });
  });

  it('a duplicate is a deep copy with " (copy)"', () => {
    const d = duplicatePreset(list[0]!, 36 ** 3);
    expect(d).toMatchObject({ id: 'p1000', label: '🌑 TrapSoul Mix (copy)', title: list[0]!.title });
    d.tags.push('x');
    expect(list[0]!.tags).not.toContain('x');
  });

  it('deleting keeps at least one preset and moves the default off a deleted one', () => {
    expect(deletePreset([list[0]!], 'trapsoul', 'trapsoul')).toBe(null);
    expect(deletePreset(list, 'trapsoul', 'trapsoul')).toMatchObject({ activeId: 'playlist' });
    expect(deletePreset(list, 'lofi', 'trapsoul')!.presets.some((p) => p.id === 'lofi')).toBe(false);
    expect(deletePreset(list, 'lofi', 'trapsoul')!.activeId).toBe('trapsoul');
  });

  it('reset brings back the defaults with the first as default', () => {
    expect(resetPresets()).toEqual({ presets: defaultPresets(), activeId: 'trapsoul' });
  });

  it('field parsing is the drawer\'s', () => {
    expect(splitList(' a, b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(artistMaxOf('x')).toBe(4);
    expect(artistMaxOf('0')).toBe(4);
    expect(artistMaxOf('2')).toBe(2);
    expect(epCounter('12')).toBe(11); // "Next EP 12" → 11 done
    expect(epCounter('')).toBe(0);
  });

  it('sizes and durations read like the drawer\'s', () => {
    expect(fmtSize(1_500_000_000)).toBe('1.50 GB');
    expect(fmtSize(25_300_000)).toBe('25.3 MB');
    expect(fmtDur(3 * 3600 + 2 * 60 + 5)).toBe('3:02:05');
    expect(fmtDur(65)).toBe('1:05');
  });
});
