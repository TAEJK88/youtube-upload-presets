// @vitest-environment happy-dom
import { within } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activityTab, fabModel, mountFab, type FabModel } from '../lib/studio/fab';
import { useMemoryClaims } from '../lib/claims/store';
import * as Q from '../lib/studio/queue-runner';
import { active, load, save } from '../lib/studio/state';

const model = (over: Partial<FabModel> = {}): FabModel => ({
  channel: 'Mine', problem: '', locked: false, preset: '🌑 TrapSoul Mix', activity: null, pending: 2, total: 3, ...over,
});
const shadow = () => document.querySelector('#ytup-fab')!.shadowRoot!;
let fab: ReturnType<typeof mountFab> | undefined;
afterEach(() => { fab?.remove(); fab = undefined; save('fabPos', null); Q.queue.splice(0); });

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

  it('a plain press and release is still a click', () => {
    const open = vi.fn();
    fab = mountFab(open);
    const b = shadow().querySelector('button')!;
    b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 500, clientY: 500, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 502, clientY: 503 })); // under the 6px threshold
    window.dispatchEvent(new PointerEvent('pointerup', {}));
    b.click();
    expect(open).toHaveBeenCalledOnce();
    expect(load('fabPos', null)).toBe(null);
  });

  it('a saved position off the screen is pulled back inside the window', () => {
    save('fabPos', { r: 5000, b: 5000 });
    fab = mountFab(() => {});
    const b = shadow().querySelector('button')!;
    window.dispatchEvent(new Event('resize'));
    // No layout here, so the FAB counts as 180 × 52.
    expect(b.style.right).toBe(innerWidth - 180 - 4 + 'px');
    expect(b.style.bottom).toBe(innerHeight - 52 - 4 + 'px');
  });

  it('the badge hides when nothing runs and the queue is empty', () => {
    fab = mountFab(() => {});
    const badge = shadow().querySelector<HTMLElement>('.badge')!;
    fab.update(model());
    expect(badge.hidden).toBe(false);
    fab.update(model({ pending: 0, total: 0 }));
    expect(badge.hidden).toBe(true);
  });

  it('after remove() a resize no longer moves it', () => {
    fab = mountFab(() => {});
    const b = shadow().querySelector('button')!;
    fab.remove();
    fab = undefined;
    save('fabPos', { r: 100, b: 100 });
    window.dispatchEvent(new Event('resize'));
    expect(b.style.right).toBe('');
  });

  // The userscript's name came from the content (its hint was only the first title, which
  // updateChannelUI() replaced at once): channel, preset and progress; the title says more.
  it('its accessible name is the channel, the preset and the progress', () => {
    fab = mountFab(() => {});
    fab.update(model({ activity: { task: 'upload', icon: '⬆', tab: 'queue', count: { at: 1, of: 2 }, title: '', detail: '', progress: 0.25 } }));
    const b = within(shadow() as unknown as HTMLElement).getByRole('button', { name: /^Mine\s*🌑 TrapSoul Mix\s*25%$/ });
    expect(b.title).toBe('Current channel: Mine');
  });
});

describe('fabModel()', () => {
  it('reads the queue: what waits, the total, and the upload in flight', () => {
    const it0 = { src: 'bridge', file: { name: 'x.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '', titleEdited: false, msg: '', txt: '', txtName: '', thumb: null, duration: 0 };
    Q.queue.push(
      { ...it0, id: 'a', status: 'done' } as Q.QueueItem,
      { ...it0, id: 'b', status: 'uploading' } as Q.QueueItem,
      { ...it0, id: 'c', status: 'pending' } as Q.QueueItem,
      { ...it0, id: 'd', status: 'pending' } as Q.QueueItem,
    );
    const m = fabModel();
    expect(m.pending).toBe(2);
    expect(m.total).toBe(4);
    expect(m.preset).toBe(active()!.label);
    expect(m.activity).toMatchObject({ task: 'upload', icon: '⬆', count: { at: 2, of: 4 }, progress: 0.25 });
    Q.queue.splice(0);
    expect(fabModel()).toMatchObject({ activity: null, pending: 0, total: 0 });
  });
});

// P5-row-tab-choice (3294–3295): the tab the click asks the panel for.
describe('activityTab()', () => {
  afterEach(() => { useMemoryClaims(); vi.unstubAllGlobals(); });
  const up = { id: 'a', src: 'bridge', file: { name: 'x.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '', titleEdited: false, msg: '', txt: '', txtName: '', thumb: null, duration: 0, status: 'uploading' } as Q.QueueItem;

  it('Upload during a run, Copyright during copyright work, none while nothing runs', () => {
    expect(activityTab()).toBeUndefined();
    useMemoryClaims({ 'trimRun:unknown': { active: true, started: '', items: [{ key: 'v:1', videoId: 'v', video: 'Mix', song: 'S1', state: 'pending', msg: '' }] } });
    expect(activityTab()).toBe('claims');
    Q.queue.push(up); // the upload comes first (activityFrom)
    expect(activityTab()).toBe('queue');
  });

  // review B-2: the click must open the panel whatever the model does
  it('a model that cannot be built: no tab, logged', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    Q.queue.push(up);
    vi.stubGlobal('location', { get pathname(): string { throw new Error('boom'); } });
    expect(activityTab()).toBeUndefined();
    expect(err).toHaveBeenCalledWith('[ytup] fab', expect.objectContaining({ message: 'boom' }));
    err.mockRestore();
  });
});

describe('fabModel() and the copyright module', () => {
  afterEach(() => useMemoryClaims());
  const trimming = { active: true, started: '', items: [{ key: 'v:1', videoId: 'v', video: 'Mix', song: 'S1', state: 'pending', msg: '' }] };

  it('shows a copyright job while the queue is idle (activity(), 4089)', () => {
    useMemoryClaims({ 'trimRun:unknown': trimming });
    expect(fabModel().activity).toMatchObject({ task: 'claims', icon: '✂️', tab: 'claims', title: 'Trimming claim 1 of 1', progress: 0 });
  });

  it('a broken copyright module leaves the upload progress alone', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    useMemoryClaims({ 'trimRun:unknown': { active: true, items: 'broken' } });
    expect(fabModel().activity).toBe(null);
    expect(err).toHaveBeenCalledWith('[ytup] copyright status', expect.any(TypeError));
    err.mockRestore();
  });
});
