// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageToast } from '../lib/studio/page-toast';

const shadow = () => document.querySelector('#ytup-toast')!.shadowRoot!;
// What the toast's stylesheet ends up declaring for one selector: every rule with that
// selector, a later declaration replacing an earlier one.
const rule = (selector: string): Record<string, string> => {
  const css = shadow().querySelector('style')!.textContent!;
  const out: Record<string, string> = {};
  for (const r of css.split('}').map((r) => r.split('{'))) {
    if (r[0]?.trim() !== selector) continue;
    for (const d of (r[1] ?? '').split(';').filter((d) => d.includes(':'))) {
      const at = d.indexOf(':');
      const prop = d.slice(0, at).trim();
      delete out[prop]; // a later declaration also moves to the end
      out[prop] = d.slice(at + 1).trim();
    }
  }
  return out;
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
    expect(box['box-sizing']).toBe('border-box'); // max-width counts the padding and the border
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
