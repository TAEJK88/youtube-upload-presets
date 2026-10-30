import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSchedule } from '../lib/studio/schedule';
import { scheduleOnEditPage } from '../lib/studio/reschedule-page';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { El, makeDocument } from './fake-dom.mjs';

vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
// The date and time typing is setSchedule's (tests/schedule.test.ts); here the clicks around it.
vi.mock('../lib/studio/schedule', () => ({ setSchedule: vi.fn(async () => '') }));

// A scheduled video's edit page as studio-watcher-1 read it live (2026-10-29, ids and tags only):
// ytcp-video-metadata-visibility #select-button opens ytcp-video-visibility-edit-popup >
// tp-yt-paper-dialog, whose Done is ytcp-button#save-button; the page's Save is
// ytcp-video-details-section ytcp-button#save, disabled until something changes.
const el = (tag: string, id = '') => { const e = new El(tag); if (id) e.id = id; return e; };
let clicks: string[];
// The browser's keydown (node has no KeyboardEvent); Studio's overlays close on Escape.
class Key { type: string; key: string; bubbles = true; constructor(type: string, o: { key: string }) { this.type = type; this.key = o.key; } }
function page(o: { fieldOff?: boolean; doneOff?: boolean; saveStaysOn?: boolean; escapeKeepsChange?: boolean } = {}) {
  const doc = makeDocument();
  const field = el('ytcp-video-metadata-visibility');
  const select = el('ytcp-icon-button', 'select-button');
  select.setAttribute('aria-disabled', o.fieldOff ? 'true' : 'false');
  field.append(select);
  const popup = el('ytcp-video-visibility-edit-popup');
  const dialog = el('tp-yt-paper-dialog', 'dialog');
  dialog.hidden = true; // closed until the field is clicked
  const done = el('ytcp-button', 'save-button');
  if (o.doneOff) done.setAttribute('disabled', '');
  dialog.append(done);
  popup.append(dialog);
  const details = el('ytcp-video-details-section');
  const save = el('ytcp-button', 'save');
  save.setAttribute('disabled', '');
  details.append(save);
  doc.body.append(field, popup, details);
  // As in Studio: the page's Save turns on once Done has put a change into the page.
  select.onclick = () => { clicks.push('visibility'); dialog.hidden = false; };
  done.onclick = () => { clicks.push('done'); dialog.hidden = true; save.removeAttribute('disabled'); };
  save.onclick = () => { clicks.push('save'); if (!o.saveStaysOn) save.setAttribute('disabled', ''); };
  // Escape closes the popup (studio-watcher-1: the first closes an open calendar, the next the popup).
  doc.addEventListener('keydown', (e: { key: string }) => {
    if (e.key !== 'Escape' || dialog.hidden) return;
    clicks.push('escape');
    dialog.hidden = true;
    if (o.escapeKeepsChange) save.removeAttribute('disabled');
  });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('KeyboardEvent', Key);
  return { popup, save };
}
const at = new Date(2027, 2, 2, 19, 0);
const stage = vi.fn();
const on = () => true;

beforeEach(() => { clicks = []; vi.mocked(setSchedule).mockReset().mockResolvedValue(''); });
afterEach(() => vi.unstubAllGlobals());

describe('scheduleOnEditPage (Studio\'s own Visibility popup and Save)', () => {
  it('opens Visibility, sets the time in the popup, presses Done, then the page\'s Save', async () => {
    const { popup } = page();
    expect(await scheduleOnEditPage(at, stage, on)).toEqual({ error: '', dirty: false });
    expect(setSchedule).toHaveBeenCalledWith(at, popup);
    expect(clicks).toEqual(['visibility', 'done', 'save']);
  });

  it('a time Studio did not take: the popup is closed with Escape, nothing is saved, the page is clean', async () => {
    page();
    vi.mocked(setSchedule).mockResolvedValueOnce('Studio rejected the date/time');
    expect(await scheduleOnEditPage(at, stage, on)).toEqual({ error: 'Studio rejected the date/time', dirty: false });
    expect(clicks).toEqual(['visibility', 'escape']);
  });

  it('a change that stays in the page after Escape is reported dirty', async () => {
    page({ escapeKeepsChange: true });
    vi.mocked(setSchedule).mockResolvedValueOnce('Studio rejected the date/time');
    expect(await scheduleOnEditPage(at, stage, on)).toEqual({ error: 'Studio rejected the date/time', dirty: true });
  });

  it('Stop after the time is set: the popup closes and neither Done nor Save is pressed', async () => {
    page();
    let running = true;
    vi.mocked(setSchedule).mockImplementationOnce(async () => { running = false; return ''; }); // Stop pressed meanwhile
    expect(await scheduleOnEditPage(at, stage, () => running)).toEqual({ error: 'Stopped', dirty: false });
    expect(clicks).toEqual(['visibility', 'escape']);
  });

  it('Stop after Done: Save is not pressed, and the page is left dirty (said so)', async () => {
    page();
    let n = 0;
    expect(await scheduleOnEditPage(at, stage, () => ++n < 2)).toEqual({ error: 'Stopped', dirty: true });
    expect(clicks).toEqual(['visibility', 'done']);
  });

  it('a Save that does not take is dirty', async () => {
    page({ saveStaysOn: true });
    expect(await scheduleOnEditPage(at, stage, on)).toEqual({ error: 'Clicked Save but it did not save', dirty: true });
  });

  it('a Visibility field that is off is not clicked', async () => {
    page({ fieldOff: true });
    expect(await scheduleOnEditPage(at, stage, on)).toEqual({ error: 'Visibility field not found on the video page', dirty: false });
    expect(clicks).toEqual([]);
  });

  it('a Done that stays off (nothing changed): no Save', async () => {
    page({ doneOff: true });
    expect(await scheduleOnEditPage(at, stage, on)).toEqual({ error: "Visibility's Done button is not ready", dirty: false });
    expect(clicks).toEqual(['visibility', 'escape']);
  });
});
