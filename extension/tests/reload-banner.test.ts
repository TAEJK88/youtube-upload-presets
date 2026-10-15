// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showIfOrphaned, showReloadBanner } from '../lib/studio/reload-banner';

afterEach(() => document.querySelector('#ytup-reload')?.remove());

describe('reload banner', () => {
  it('says why and reloads on click; only one at a time', () => {
    const reload = vi.fn();
    showReloadBanner(reload);
    const host = showReloadBanner(reload);
    expect(document.querySelectorAll('#ytup-reload')).toHaveLength(1);
    const root = host.shadowRoot!;
    expect(root.textContent).toContain('The extension was updated or reloaded — reload this tab to keep using it');
    root.querySelector('button')!.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  // WXT also invalidates this instance when a newer one starts in the page; that one works.
  it('shows only when the extension context is gone', () => {
    showIfOrphaned({ id: 'abc' });
    expect(document.querySelector('#ytup-reload')).toBe(null);
    showIfOrphaned({});
    expect(document.querySelector('#ytup-reload')).not.toBe(null);
    document.querySelector('#ytup-reload')!.remove();
    showIfOrphaned(undefined);
    expect(document.querySelector('#ytup-reload')).not.toBe(null);
  });
});
