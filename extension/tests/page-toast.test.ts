// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageToast } from '../lib/studio/page-toast';

const shadow = () => document.querySelector('#ytup-toast')!.shadowRoot!;
// The declarations of one rule of the toast's stylesheet, by property.
const rule = (selector: string): Record<string, string> => {
  const css = shadow().querySelector('style')!.textContent!;
  const body = css.split('}').map((r) => r.split('{')).find((r) => r[0]?.trim() === selector)?.[1] ?? '';
  return Object.fromEntries(body.split(';').filter((d) => d.includes(':')).map((d) => {
    const at = d.indexOf(':');
    return [d.slice(0, at).trim(), d.slice(at + 1).trim()];
  }));
};
afterEach(() => { vi.useRealTimers(); document.querySelector('#ytup-toast')?.remove(); });

describe('in-page toast', () => {
  it('shows the message with a tick for 3.8 s; the next message replaces it', () => {
    vi.useFakeTimers();
    pageToast('one');
    const box = shadow().querySelector('.toast')!;
    expect(box.textContent).toBe('one');
    expect(box.querySelector('.ti svg')).not.toBe(null);
    expect(box.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(3000);
    pageToast('two');
    expect(shadow().querySelectorAll('.toast').length).toBe(1);
    expect(box.textContent).toBe('two');
    vi.advanceTimersByTime(3799);
    expect(box.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(box.classList.contains('show')).toBe(false);
  });

  // The look the drawer's toast ended with (userscript 2813–2818 under its black and glass
  // layers, with the default 82 % opacity): only Chrome can show the blur itself.
  it('is the glass box with the white tick the drawer ended with', () => {
    pageToast('x');
    const box = rule('.toast');
    expect(box.background).toBe('rgba(12,12,14,.82)');
    expect(box['backdrop-filter']).toBe('blur(26px) saturate(150%)');
    expect(box['-webkit-backdrop-filter']).toBe('blur(26px) saturate(150%)');
    expect(box.border).toBe('1px solid rgba(255,255,255,.12)');
    expect(box.color).toBe('#f2f2f6'); // light text on the dark glass, on Studio's light and dark themes alike
    expect(box['letter-spacing']).toBe('0');
    expect(box['font-feature-settings']).toBe('"tnum" 1');
    expect(box['-webkit-font-smoothing']).toBe('antialiased');
    // `font` resets font-feature-settings: it has to come first.
    expect(Object.keys(box).indexOf('font')).toBeLessThan(Object.keys(box).indexOf('font-feature-settings'));
    const tick = rule('.toast .ti');
    expect(tick.background).toBe('#f4f4f5');
    expect(tick.color).toBe('#0b0b0c');
    expect(shadow().querySelector('style')!.textContent).not.toMatch(/gradient|#111116|#2a2a33/);
  });
});
