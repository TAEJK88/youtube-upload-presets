// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleOnEditPage } from '../lib/studio/reschedule-page';

vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));

// Studio's Visibility popup on a scheduled video's edit page, captured live by studio-watcher-1
// (2026-10-29, Apr 1, 2027 12:00 AM, English UI, read-only): the Schedule section is open, its
// expand button `hidden`, Done (#save-button) disabled until something changes, and the calendar's
// ytcp-date-picker at the end (Studio appends it to BODY). happy-dom has no layout: an element is
// "visible" here unless it or an ancestor has the `hidden` attribute, as in the capture.
const POPUP = readFileSync(join(__dirname, 'fixtures/visibility-popup.html'), 'utf8');
const rects = Element.prototype.getClientRects;

beforeEach(() => {
  Element.prototype.getClientRects = function (this: Element) {
    for (let n: Element | null = this; n; n = n.parentElement) if (n.hasAttribute('hidden')) return [] as unknown as DOMRectList;
    return [{}] as unknown as DOMRectList;
  };
  document.documentElement.lang = 'en';
  // The browser's typing into the focused field (happy-dom has no execCommand).
  Object.assign(document, { execCommand: (cmd: string, _ui: boolean, text: string) => {
    const el = document.activeElement as HTMLInputElement | null;
    if (cmd === 'insertText' && el && 'value' in el) el.value = text;
    return true;
  } });
  // The edit page around it: the Visibility field's opener and the page's Save.
  document.body.innerHTML = '<ytcp-video-metadata-visibility><ytcp-icon-button id="select-button" aria-disabled="false"></ytcp-icon-button></ytcp-video-metadata-visibility>'
    + POPUP
    + '<ytcp-video-details-section><ytcp-button id="save" disabled aria-disabled="true"><button>Save</button></ytcp-button></ytcp-video-details-section>';
  // Values Studio keeps as properties (the capture has the markup only).
  const [time, date] = [...document.querySelectorAll<HTMLInputElement>('tp-yt-paper-input input')];
  time!.value = '12:00 AM';
  date!.value = 'Apr 1, 2027';
});
afterEach(() => {
  Element.prototype.getClientRects = rects;
  document.body.innerHTML = '';
});

describe('the live Visibility popup (fixture)', () => {
  it('finds the popup, leaves the open Schedule section alone, and reaches Done', async () => {
    const expand = document.querySelector<HTMLElement>('#second-container-expand-button')!;
    const clicked: string[] = [];
    expand.addEventListener('click', () => clicked.push('expand'));
    document.querySelector('#datepicker-trigger')!.addEventListener('click', () => clicked.push('date'));
    const stage = vi.fn();
    // The same time again: Studio keeps Done disabled (nothing changed), so the run stops before Save.
    // As studio-watcher-1 saw: the first Escape closes the open calendar, the next the popup.
    const escape = vi.fn(() => {
      const calendar = document.querySelector('ytcp-date-picker');
      if (calendar && !calendar.hasAttribute('hidden')) calendar.setAttribute('hidden', '');
      else document.querySelector('ytcp-video-visibility-edit-popup tp-yt-paper-dialog')!.setAttribute('hidden', '');
    });
    const keys = new AbortController();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') escape(); }, { signal: keys.signal });
    expect(await scheduleOnEditPage(new Date(2027, 3, 1, 0, 0), stage, () => true)).toEqual({ error: "Visibility's Done button is not ready", dirty: false });
    expect(document.querySelector('ytcp-video-visibility-edit-popup tp-yt-paper-dialog')!.hasAttribute('hidden')).toBe(true); // closed, not left over the page
    keys.abort();
    expect(clicked).not.toContain('expand');
    expect(stage).toHaveBeenCalledWith(1, 'Setting the date and time…');
    expect(document.querySelector('ytcp-video-details-section #save')!.hasAttribute('disabled')).toBe(true); // nothing saved
  });

  it('a changed time enables Done: it is pressed', async () => {
    const done = document.querySelector<HTMLElement>('ytcp-video-visibility-edit-popup #save-button')!;
    done.removeAttribute('disabled');
    done.setAttribute('aria-disabled', 'false');
    const pressed = vi.fn(() => document.querySelector('ytcp-video-visibility-edit-popup tp-yt-paper-dialog')!.setAttribute('hidden', ''));
    done.addEventListener('click', pressed);
    const save = document.querySelector<HTMLElement>('ytcp-video-details-section #save')!;
    save.removeAttribute('disabled');
    save.setAttribute('aria-disabled', 'false');
    save.addEventListener('click', () => save.setAttribute('disabled', ''));
    expect(await scheduleOnEditPage(new Date(2027, 3, 1, 0, 0), vi.fn(), () => true)).toEqual({ error: '', dirty: false });
    expect(pressed).toHaveBeenCalled();
    expect(save.hasAttribute('disabled')).toBe(true); // Save pressed, and Studio took it
  });
});
