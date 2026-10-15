import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { installShortcuts } from '../lib/studio/shortcuts';
import * as state from '../lib/studio/state';

const calls: string[] = [];
const ui = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast: (m: string) => void calls.push(`toast:${m}`),
  openDrawer: () => void calls.push('open'), notifyDone() {}, setTitleMark() {}, confirmStart: async () => false,
} satisfies PageUi;
let handler: (e: Partial<KeyboardEvent>) => void;
const key = (code: string, extra: Partial<KeyboardEvent> = {}) => {
  const e = { altKey: true, ctrlKey: false, metaKey: false, code, target: { tagName: 'DIV' } as unknown as EventTarget, preventDefault: vi.fn(), ...extra };
  handler(e);
  return e;
};

beforeEach(() => {
  calls.length = 0;
  setPageUi(ui);
  vi.stubGlobal('document', {
    addEventListener: (_: string, fn: typeof handler) => (handler = fn),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('navigator', { platform: 'Win32' });
});
afterEach(() => vi.unstubAllGlobals());

describe('installShortcuts', () => {
  it('Alt+2 makes the second preset the default and says so', () => {
    installShortcuts();
    const e = key('Digit2');
    expect(state.activeId).toBe(state.presets[1]!.id);
    expect(calls).toEqual([`toast:Main preset: ${state.presets[1]!.label}`]);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Alt+P asks for the side panel', () => {
    installShortcuts();
    key('KeyP');
    expect(calls).toEqual(['open']);
  });

  it('on a Mac, Option+key while typing is a character, not a shortcut', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    installShortcuts();
    key('Digit1', { target: { tagName: 'INPUT' } as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it('ignores Ctrl/Cmd combinations and digits without a preset', () => {
    installShortcuts();
    key('Digit1', { ctrlKey: true });
    key('Digit9');
    expect(calls).toEqual([]);
  });
});
