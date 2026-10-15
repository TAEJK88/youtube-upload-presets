// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDraftApply, tickedRows } from '../lib/studio/draft-select';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';

vi.mock('../lib/studio/automation', async (orig) => ({ ...(await orig<typeof import('../lib/studio/automation')>()), isVisible: (el: unknown) => !!el }));
vi.mock('../lib/studio/queue-store', () => ({ persistQueue: vi.fn() }));

// Studio's Content list as read in the owner's Chrome on 2026-10-15: a draft's row has no link,
// its id is in the thumbnail address, and it has an "Edit draft" button; a published row links
// to /video/<id>/edit. A ticked box is ytcp-checkbox-lit with a `checked` attribute and an inner
// [role=checkbox] with aria-checked "true"; the box itself has no aria-checked.
const row = (o: { id: string; title: string; ticked: boolean; draft: boolean; length?: string }) => `
  <ytcp-video-row>
    <ytcp-checkbox-lit${o.ticked ? ' checked' : ''}><div role="checkbox" aria-checked="${o.ticked}"></div></ytcp-checkbox-lit>
    <img src="https://i.ytimg.com/vi/${o.id}/mqdefault.jpg"><span>${o.length ?? ''}</span>
    ${o.draft ? '' : `<a href="/video/${o.id}/edit">x</a>`}
    <span id="video-title">${o.title}</span>
    ${o.draft ? '<ytcp-button><button>Edit draft</button></ytcp-button>' : ''}
  </ytcp-video-row>`;
const list = (bar: boolean) => {
  document.body.innerHTML = (bar ? '<ytcp-bulk-actions><div id="header"><div class="label">3 selected</div><span class="toolbar-wrapper"><div class="toolbar"><ytcp-bulk-add-playlists>Add to playlist</ytcp-bulk-add-playlists><ytcp-select>More actions</ytcp-select></div></span></div></ytcp-bulk-actions>' : '') + [
    row({ id: 'gj2dLpVL8Mw', title: 'TrapSoul Mix', ticked: true, draft: false, length: '55:39' }),
    row({ id: 'exClnwv7QDo', title: '290126 1218', ticked: true, draft: true, length: '58:26' }),
    row({ id: 'vUQWpXgS1KM', title: '290126 1217', ticked: true, draft: true, length: '1:02:03' }),
    row({ id: 'aieN83iVUds', title: '290126 1224', ticked: false, draft: true, length: '55:41' }),
  ].join('');
};

const toasts: string[] = [];
const opened: (string | undefined)[] = [];
const recorder: PageUi = {
  item: () => {}, run: () => {}, queue: () => {}, schedule: () => {}, presetPreview: () => {},
  toast: (m) => void toasts.push(m), openDrawer: (t) => void opened.push(`${t} after ${toasts.length} toast(s)`), // the order: the panel opens only inside the click's gesture notifyDone: () => {}, setTitleMark: () => {},
  confirmStart: async () => true,
};
beforeEach(() => {
  vi.useFakeTimers();
  setPageUi(recorder);
  Q.queue.splice(0);
  toasts.length = 0;
  opened.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('tickedRows', () => {
  it('reads the ticked drafts (id, title, length) and counts the ticked rows that are not drafts', () => {
    list(true);
    expect(tickedRows()).toEqual({
      drafts: [
        { videoId: 'exClnwv7QDo', title: '290126 1218', duration: 58 * 60 + 26 },
        { videoId: 'vUQWpXgS1KM', title: '290126 1217', duration: 3723 },
      ],
      others: 1,
    });
  });
});

describe('Apply preset in Studio\'s selection bar', () => {
  const button = () => document.getElementById('ytup-apply-preset') as HTMLButtonElement | null;

  it('shows with the number of ticked drafts while the bar is there, and goes with it', () => {
    list(true);
    const off = installDraftApply();
    vi.advanceTimersByTime(1000);
    expect(button()?.textContent).toBe('Apply preset (2)');
    expect(button()!.parentElement).toBe(document.querySelector('ytcp-bulk-actions .toolbar')); // in the row, after More actions
    expect(button()!.previousElementSibling!.textContent).toBe('More actions');
    expect(button()!.title).toMatch(/^Queue the 2 ticked draft\(s\) with preset ".+", then press Start upload in the panel$/);
    document.querySelector('ytcp-bulk-actions')!.remove(); // the ticks were cleared
    vi.advanceTimersByTime(1000);
    expect(button()).toBe(null);
    off();
  });

  it('is not shown when only published videos are ticked', () => {
    list(true);
    document.querySelectorAll('ytcp-video-row').forEach((r, i) => { if (i) r.querySelector('ytcp-checkbox-lit')!.replaceWith(Object.assign(document.createElement('ytcp-checkbox-lit'), { innerHTML: '<div role="checkbox" aria-checked="false"></div>' })); });
    const off = installDraftApply();
    vi.advanceTimersByTime(1000);
    expect(button()).toBe(null);
    off();
  });

  it('a click queues the ticked drafts, says what was skipped, and opens the panel on Upload', () => {
    list(true);
    const off = installDraftApply();
    vi.advanceTimersByTime(1000);
    button()!.click();
    expect(Q.queue.map((i) => [i.file.name, i.draftId])).toEqual([['290126 1217', 'vUQWpXgS1KM'], ['290126 1218', 'exClnwv7QDo']]);
    expect(toasts).toEqual(['Added 2 draft(s) to the queue', 'Skipped 1 video(s) that are not drafts']);
    expect(opened).toEqual(['queue after 0 toast(s)']);
    button()!.click(); // again: nothing new, and the panel still opens on the queue
    expect(Q.queue).toHaveLength(2);
    expect(toasts.at(-2)).toBe('2 already in the queue');
    expect(opened).toEqual(['queue after 0 toast(s)', 'queue after 2 toast(s)']);
    off();
    expect(button()).toBe(null); // the disposer takes the button away
  });
});
