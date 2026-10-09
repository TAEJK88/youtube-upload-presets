// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountFab, type FabModel } from '../lib/studio/fab';
import { load } from '../lib/studio/state';

const model = (over: Partial<FabModel> = {}): FabModel => ({
  channel: 'Mine', problem: '', locked: false, preset: '🌑 TrapSoul Mix', activity: null, pending: 2, total: 3, ...over,
});
const shadow = () => document.querySelector('#ytup-fab')!.shadowRoot!;
let fab: ReturnType<typeof mountFab> | undefined;
afterEach(() => { fab?.remove(); fab = undefined; });

describe('in-page FAB', () => {
  it('shows the channel, the default preset and the waiting count; a click opens the panel', () => {
    const open = vi.fn();
    fab = mountFab(open);
    fab.update(model());
    const b = shadow().querySelector('button')!;
    expect(shadow().querySelector('.fch')!.textContent).toBe('Mine');
    expect(shadow().querySelector('.fpr')!.textContent).toBe('🌑 TrapSoul Mix');
    expect(shadow().querySelector('.badge')!.textContent).toBe('2');
    expect(b.title).toBe('Current channel: Mine');
    expect(b.getAttribute('aria-label')).toBe('Click to open · drag to move');
    b.click();
    expect(open).toHaveBeenCalledOnce();
  });

  it('a running upload shows its progress; a channel problem turns it red', () => {
    fab = mountFab(() => {});
    fab.update(model({ activity: { task: 'upload', icon: '⬆', tab: 'queue', count: { at: 1, of: 2 }, title: '', detail: '', progress: 0.25 } }));
    const b = shadow().querySelector('button')!;
    // The userscript draws the activity's emoji as its icon (emojiIcon: ⬆ → upload).
    const badge = shadow().querySelector('.badge')!;
    expect(badge.querySelector('svg')).not.toBe(null);
    expect(badge.textContent).toBe(' 25%');
    expect(b.classList.contains('busy')).toBe(true);
    fab.update(model({ problem: 'Currently on channel "Mine" but locked to "Other"' }));
    expect(b.classList.contains('bad')).toBe(true);
    expect(b.title).toBe('Currently on channel "Mine" but locked to "Other"');
  });

  it('dragging moves it, remembers where, and is not a click', () => {
    const open = vi.fn();
    fab = mountFab(open);
    const b = shadow().querySelector('button')!;
    b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 500, clientY: 500, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 450 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
    b.click();
    expect(open).not.toHaveBeenCalled();
    expect(load<{ r: number; b: number } | null>('fabPos', null)).not.toBe(null);
  });

  it('replaces a FAB left by an earlier instance of the script', () => {
    fab = mountFab(() => {});
    const again = mountFab(() => {});
    expect(document.querySelectorAll('#ytup-fab')).toHaveLength(1);
    again.remove();
  });
});
