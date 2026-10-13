import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { weekOf } from '../lib/schedule-week';
import { SCHEDULE_MIN_LEAD } from '../lib/constants';
import type { Schedule } from '../lib/settings';
import { createContentUi, resumeFromPause } from '../lib/studio/content-ui';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as B from '../lib/studio/queue-batch';
import { setBridge } from '../lib/studio/queue-files';
import { stopQueue } from '../lib/studio/queue-ops';
import { createPauseWatch, endPause, PAUSE_KEY, PAUSE_MS, pauseQueue, queuePause } from '../lib/studio/queue-pause';
import * as Q from '../lib/studio/queue-runner';
import { SEL } from '../lib/studio/sel';
import { load, save, settings } from '../lib/studio/state';
import { fakeBridge } from './bridge-fake';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// The daily upload limit (pause and resume), batches and the estimate before Start
// (P5-daily-limit, P5-upload-batches), through runQueue() with Studio's dialog faked at the
// automation layer as in queue-run-flow.test.ts.
const LIMIT = 'Daily upload limit reached. You can upload more videos in 24 hours.';
const said = vi.hoisted(() => ({ error: '' }));
const CH = 'UCabcdefghijklmn';
const studio = vi.hoisted(() => ({
  open: false,
  uploads: [] as string[], // file names handed to Studio
  limitFrom: Infinity, // Studio refuses from this upload on (0-based)
  draft: '', // the video link the dialog shows
  progress: '', // the dialog's upload progress text
  fill: (async () => {}) as () => Promise<void>,
  onInject: (() => {}) as () => void,
}));
const refused = () => studio.uploads.length > studio.limitFrom;
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));
vi.mock('../lib/studio/page-toast', () => ({ pageToast: vi.fn() }));
vi.mock('../lib/studio/queue-store', () => ({ persistQueue: vi.fn() }));
vi.mock('../lib/studio/schedule', () => ({ setSchedule: async () => '' })); // the date picker answers "done"
vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
  isVisible: (el: unknown) => !!el,
  detailsOpen: () => studio.open,
  uploadDialogOpen: () => studio.open,
  getTitleBox: () => (refused() ? null : { textContent: 'from Studio' }),
  fillDetails: async () => (await studio.fill(), true),
  getDialog: () => ({
    querySelector: (s: string) =>
      s === SEL.doneButton
        ? { hasAttribute: () => false, querySelector: () => ({ disabled: false, getAttribute: () => null, click: () => { studio.open = false; } }) }
        : s === SEL.videoLink && studio.draft ? { href: 'https://youtu.be/' + studio.draft }
        : null,
  }),
}));
vi.mock('../lib/studio/upload-dialog', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/upload-dialog')>()),
  openFilePicker: async () => ({ input: {} }),
  injectUploadFile: async (_i: unknown, f: File) => (studio.uploads.push(f.name), studio.onInject(), (studio.open = true), true),
  closeStudioUploadDialog: () => { studio.open = false; },
  goToVisibility: async () => true,
  ackNoticeDialogs: () => false,
  closeAfterDialogs: () => {},
  dialogError: () => (refused() ? said.error : ''),
  uploadProgressText: () => studio.progress,
}));

const toasts: string[] = [];
const notes: { title: string; text: string; ok?: boolean }[] = [];
const recorder: PageUi = {
  item: () => {}, run: () => {}, queue: () => {}, schedule: () => {}, presetPreview: () => {},
  toast: (msg) => void toasts.push(msg),
  openDrawer: () => {},
  notifyDone: (title, text, ok) => void notes.push({ title, text, ok }),
  setTitleMark: () => {},
  confirmStart: async () => true,
};
const lock = { acquire: vi.fn(async () => true), release: vi.fn() };

let n = 0;
const qfile = (name: string) => Object.assign(new File(['x'], name), { qid: `lim-${++n}`, src: 'bridge' as const });
const add = async (...names: string[]) => {
  await Q.addFiles(names.map(qfile));
  toasts.length = 0; // "Added 3 video(s)"
};
const named = async (id: string) => new File(['x'], Q.queue.find((i) => i.id === id)?.file.name ?? id);
const statuses = () => Q.queue.map((i) => i.status);
const binding = () => ({ channelId: CH, ids: Q.queue.filter((i) => i.status === 'pending').map((i) => i.id), editRev: Q.getEditRev(), sig: Q.startSig(), asked: true });
const NOW = Date.parse('2026-10-13T10:00:00Z');

let was: { batch: number; dailyLimit: number; confirmStart: boolean };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.stubGlobal('document', Object.assign(makeDocument(), { hasFocus: () => true, title: 'Channel content' }));
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  setPageUi(recorder);
  setBridge(fakeBridge(named));
  Q.setRunnerLock(lock);
  lock.acquire.mockReset().mockResolvedValue(true);
  lock.release.mockClear();
  Q.queue.splice(0);
  toasts.length = 0;
  notes.length = 0;
  said.error = LIMIT;
  Object.assign(studio, { open: false, uploads: [], limitFrom: Infinity, draft: '', progress: '', fill: async () => {}, onInject: () => {} });
  was = { batch: settings.batch, dailyLimit: settings.dailyLimit, confirmStart: settings.confirmStart };
  Object.assign(settings, { batch: 0, dailyLimit: 0, confirmStart: false });
  save('uploads', []);
  endPause();
});
afterEach(() => {
  Object.assign(settings, was);
  Q.setRunnerLock({ acquire: async () => true, release: () => {} });
  setBridge(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the daily upload limit', () => {
  it('pauses the queue for 24 hours: the refused video waits again, nothing is an error, the lock is free', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.limitFrom = 1; // A goes up, B is refused
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'pending', 'pending']);
    expect(studio.uploads).toEqual(['A.mp4', 'B.mp4']); // C was never tried
    expect(queuePause()).toEqual({ channel: CH, name: expect.any(String), at: NOW, until: NOW + PAUSE_MS });
    expect(PAUSE_MS).toBe(24 * 3600 * 1000);
    expect(load(PAUSE_KEY, null)).toEqual(queuePause()); // in the stored state, not in the page's memory
    expect(Q.running).toBe(false);
    expect(lock.release).toHaveBeenCalled();
    // Studio's exact wording goes to the debug log (console.warn is captured there).
    expect(warn).toHaveBeenCalledWith(`[ytup] upload limit: Studio said "${LIMIT}"`);
  });

  it('says "paused" with the time, not "finished" and not "needs attention"', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.limitFrom = 1;
    await Q.runQueue();
    const when = Q.fmtWhen(NOW + PAUSE_MS);
    expect(toasts).toEqual([`Queue paused: YouTube's daily upload limit — resumes by itself ${when}`]);
    expect(notes).toEqual([{ title: 'Queue paused — daily upload limit', text: expect.stringContaining(`1 done · 2 left · resumes ${when}`), ok: false }]);
  });

  it('a video Studio already made a draft of stays the error it was (no second upload on resume); the rest still pauses', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.limitFrom = 1;
    studio.onInject = () => { if (refused()) studio.draft = 'abcdefghijk'; };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'error', 'pending']);
    expect(Q.queue[1]!.msg).toContain('already uploaded as a draft (abcdefghijk)');
    expect(queuePause()?.until).toBe(NOW + PAUSE_MS);
  });

  it('nothing left to upload: no pause, and the run ends as before', async () => {
    await add('A.mp4', 'B.mp4');
    studio.limitFrom = 1;
    studio.onInject = () => { if (refused()) studio.draft = 'abcdefghijk'; };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'error']);
    expect(queuePause()).toBe(null);
    expect(notes[0]!.title).toBe('Queue stopped — needs attention ⚠️');
  });

  it('Stop pressed before the limit shows: the run stops as before, nothing is paused', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.limitFrom = 1;
    studio.onInject = () => { if (refused()) Q.requestStop(); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'error', 'pending']);
    expect(queuePause()).toBe(null);
    expect(toasts).toEqual(['Queue stopped (1 video(s) done)']);
  });

  it('another limit (a file too large) is no daily limit: the run ends as before, with the error on the video', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.limitFrom = 1;
    said.error = 'The file is larger than the upload size limit.';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'error', 'pending']);
    expect(queuePause()).toBe(null);
    expect(notes[0]!.title).toBe('Queue stopped — needs attention ⚠️');
    expect(warn).toHaveBeenCalledWith('[ytup] upload limit: Studio said "The file is larger than the upload size limit."');
  });

  it('Thai wording that speaks of a day pauses too', async () => {
    await add('A.mp4', 'B.mp4');
    studio.limitFrom = 0;
    said.error = 'ถึงขีดจำกัดการอัปโหลดรายวันแล้ว';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.runQueue();
    expect(statuses()).toEqual(['pending', 'pending']);
    expect(queuePause()).not.toBe(null);
  });

  it('the broadcast state carries the pause while no run is going', async () => {
    const ui = createContentUi();
    expect(ui.state().paused).toBe(null);
    pauseQueue({ id: CH, name: 'Mine' }, NOW);
    expect(ui.state().paused).toEqual({ until: NOW + PAUSE_MS, channel: CH, name: 'Mine' });
    expect(ui.state().wait).toBe('');
  });
});

describe('resuming after the pause', () => {
  const paused = async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.limitFrom = 1;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.runQueue();
    toasts.length = 0;
    notes.length = 0;
    lock.acquire.mockClear();
    lock.release.mockClear();
  };

  it('goes on with what waits, takes the lock again and ends the pause', async () => {
    await paused();
    studio.limitFrom = Infinity;
    vi.setSystemTime(NOW + PAUSE_MS + 1000);
    expect(await Q.resumeAfterPause()).toBe('');
    expect(statuses()).toEqual(['done', 'done', 'done']);
    expect(studio.uploads).toEqual(['A.mp4', 'B.mp4', 'B.mp4', 'C.mp4']); // B once refused, once uploaded
    expect(lock.acquire).toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
    expect(queuePause()).toBe(null);
    expect(toasts[0]).toBe('24 hours since the daily upload limit — the queue goes on');
    expect(notes[0]!.title).toBe('Upload finished ✅');
  });

  it('the limit again: paused again, 24 hours from then', async () => {
    await paused();
    const later = NOW + PAUSE_MS + 5000;
    vi.setSystemTime(later);
    await Q.resumeAfterPause(); // still refused
    expect(statuses()).toEqual(['done', 'pending', 'pending']);
    expect(queuePause()).toMatchObject({ at: later, until: later + PAUSE_MS });
    expect(notes[0]!.title).toBe('Queue paused — daily upload limit');
  });

  it('another tab holds the lock: nothing runs, nothing is said, the pause stays', async () => {
    await paused();
    lock.acquire.mockResolvedValue(false);
    const before = studio.uploads.length;
    expect(await Q.resumeAfterPause()).toBe('');
    expect(studio.uploads.length).toBe(before);
    expect(toasts).toEqual([]);
    expect(queuePause()).not.toBe(null);
  });

  it('files that lost read access: says why, takes no lock, the pause stays', async () => {
    await paused();
    setBridge(fakeBridge(named, () => 'prompt'));
    expect(await Q.resumeAfterPause()).toMatch(/need read access again/);
    expect(lock.acquire).not.toHaveBeenCalled();
    expect(queuePause()).not.toBe(null);
  });

  it('the run asks nothing again: the user confirmed it when it started', async () => {
    await paused();
    studio.limitFrom = Infinity;
    settings.confirmStart = true;
    const ui = createContentUi();
    setPageUi(ui);
    expect(await resumeFromPause(ui)).toBe('');
    expect(statuses()).toEqual(['done', 'done', 'done']);
  });

  it('a lock taken for a run that never started is given back', async () => {
    await paused();
    settings.confirmStart = true;
    setPageUi({ ...recorder, confirmStart: async () => false });
    await Q.resumeAfterPause();
    expect(statuses()).toEqual(['done', 'pending', 'pending']);
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('a manual start ends the pause when it reaches a video', async () => {
    await paused();
    studio.limitFrom = Infinity;
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done', 'done']);
    expect(queuePause()).toBe(null);
  });

  it('Stop while paused cancels the pause and leaves the queue', async () => {
    await paused();
    stopQueue();
    expect(queuePause()).toBe(null);
    expect(statuses()).toEqual(['done', 'pending', 'pending']);
    expect(toasts).toEqual(['Pause cancelled — the queue will not resume by itself']);
    stopQueue(); // no pause any more: the old answer
    expect(toasts[1]).toBe('Nothing is running in this Studio tab');
  });
});

describe('the wake-up (createPauseWatch)', () => {
  const watch = (over: Partial<Parameters<typeof createPauseWatch>[0]> = {}) => {
    const d = { channelId: () => CH, pending: () => 2, running: () => false, resume: vi.fn(async () => ''), toast: vi.fn(), retryMs: 60_000, ...over };
    return { d, w: createPauseWatch(d) };
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('does nothing before the 24 hours are over, and resumes on the first tick after', async () => {
    pauseQueue({ id: CH, name: 'Mine' }, NOW);
    const { d, w } = watch();
    vi.setSystemTime(NOW + PAUSE_MS - 1);
    w.tick();
    expect(d.resume).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + PAUSE_MS);
    w.tick();
    expect(d.resume).toHaveBeenCalledTimes(1);
  });

  it('is found again by a tab loaded later (the state is stored, no timer is armed)', async () => {
    pauseQueue({ id: CH, name: 'Mine' }, NOW);
    vi.setSystemTime(NOW + 3 * PAUSE_MS); // the browser was closed for days
    const { d, w } = watch(); // a new page
    w.tick();
    expect(d.resume).toHaveBeenCalledTimes(1);
  });

  it('only in a tab on the channel that met the limit, and not while a run is going', async () => {
    pauseQueue({ id: CH, name: 'Mine' }, NOW);
    vi.setSystemTime(NOW + PAUSE_MS);
    const other = watch({ channelId: () => 'UCother' });
    other.w.tick();
    expect(other.d.resume).not.toHaveBeenCalled();
    const busy = watch({ running: () => true });
    busy.w.tick();
    expect(busy.d.resume).not.toHaveBeenCalled();
    expect(queuePause()).not.toBe(null);
  });

  it('one resume at a time; one that could not start says why once and is tried again a minute later', async () => {
    pauseQueue({ id: CH, name: 'Mine' }, NOW);
    vi.setSystemTime(NOW + PAUSE_MS);
    const { d, w } = watch({ resume: vi.fn(async () => 'The queued files need read access again') });
    w.tick();
    w.tick(); // still asking
    expect(d.resume).toHaveBeenCalledTimes(1);
    await settle();
    expect(d.toast).toHaveBeenCalledTimes(1);
    w.tick(); // too soon
    expect(d.resume).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + PAUSE_MS + 60_000);
    w.tick();
    expect(d.resume).toHaveBeenCalledTimes(2);
    await settle();
    expect(d.toast).toHaveBeenCalledTimes(1); // the same reason is not said twice
  });

  it('nothing waits any more: the pause is over', () => {
    pauseQueue({ id: CH, name: 'Mine' }, NOW);
    const { d, w } = watch({ pending: () => 0 });
    w.tick();
    expect(queuePause()).toBe(null);
    expect(d.resume).not.toHaveBeenCalled();
  });

  it('a stored value that is not a pause is none', () => {
    save(PAUSE_KEY, { until: 'tomorrow' });
    expect(queuePause()).toBe(null);
    save(PAUSE_KEY, undefined);
  });
});

describe('batches', () => {
  const waits = () => vi.mocked(B.waitForUploads).mock.calls.length;
  // The dialog is read every 0.5 s while a video is worked on: let one reading happen.
  const slowFill = () => { studio.fill = () => new Promise((r) => setTimeout(r, 520)); };
  beforeEach(() => {
    vi.spyOn(B, 'waitForUploads').mockImplementation(async (d) => (d.say('Uploading 1 of 2'), 'done'));
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('after `batch` videos the run waits for Studio, then goes on; not after the last video', async () => {
    settings.batch = 2;
    await add('A.mp4', 'B.mp4', 'C.mp4', 'D.mp4', 'E.mp4', 'F.mp4');
    const seen: { at: number; note: string }[] = [];
    vi.mocked(B.waitForUploads).mockImplementation(async (d) => {
      d.say('Uploading 1 of 2');
      seen.push({ at: studio.uploads.length, note: Q.runWait() });
      return 'done';
    });
    await Q.startQueue(binding());
    expect(statuses()).toEqual(Array(6).fill('done'));
    expect(seen).toEqual([
      { at: 2, note: 'Waiting for Studio to finish uploading batch 1 (2 of 2 still uploading) · Uploading 1 of 2' },
      { at: 4, note: 'Waiting for Studio to finish uploading batch 2 (2 of 2 still uploading) · Uploading 1 of 2' },
    ]);
    expect(Q.runWait()).toBe(''); // over with the wait
  });

  it('0 turns it off', async () => {
    settings.batch = 0;
    await add('A.mp4', 'B.mp4', 'C.mp4');
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done', 'done']);
    expect(waits()).toBe(0);
  });

  it('a batch whose uploads had all finished when their dialogs closed needs no wait', async () => {
    settings.batch = 2;
    studio.progress = 'Upload complete … Processing will begin shortly';
    slowFill();
    await add('A.mp4', 'B.mp4', 'C.mp4');
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done', 'done']);
    expect(waits()).toBe(0);
  });

  it('counts the videos the dialog still showed uploading', async () => {
    settings.batch = 2;
    slowFill();
    studio.onInject = () => { studio.progress = studio.uploads.length === 1 ? 'Uploading 40% … 3 minutes left' : 'Upload complete'; };
    await add('A.mp4', 'B.mp4', 'C.mp4');
    let note = '';
    vi.mocked(B.waitForUploads).mockImplementation(async (d) => (d.say(''), (note = Q.runWait()), 'done'));
    await Q.startQueue(binding());
    expect(note).toBe('Waiting for Studio to finish uploading batch 1 (1 of 2 still uploading)');
  });

  it('Stop during the wait ends the run', async () => {
    settings.batch = 1;
    await add('A.mp4', 'B.mp4');
    const stopped: boolean[] = []; // read here, checked below: a failure inside the wait is swallowed
    vi.mocked(B.waitForUploads).mockImplementation(async (d) => {
      stopped.push(d.stopped());
      Q.requestStop();
      stopped.push(d.stopped());
      return 'stopped';
    });
    await Q.startQueue(binding());
    expect(stopped).toEqual([false, true]);
    expect(statuses()).toEqual(['done', 'pending']);
  });

  it('a progress that cannot be read is said, and the run goes on', async () => {
    settings.batch = 1;
    await add('A.mp4', 'B.mp4');
    vi.mocked(B.waitForUploads).mockResolvedValue('blind');
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done']);
    expect(toasts).toContain("Could not read Studio's upload progress — waited 2 minutes for batch 1, then went on");
  });

  it('a wait that fails never turns the uploaded video into an error', async () => {
    settings.batch = 1;
    await add('A.mp4', 'B.mp4');
    vi.mocked(B.waitForUploads).mockRejectedValue(new Error('boom'));
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done']);
  });

  it('each run counts afresh, and so does a run resumed after the daily limit', async () => {
    settings.batch = 2;
    await add('A.mp4', 'B.mp4', 'C.mp4', 'D.mp4');
    studio.limitFrom = 1; // A up, B refused: one video in the batch when the run pauses
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Q.startQueue(binding());
    expect(waits()).toBe(0);
    studio.limitFrom = Infinity;
    const at: number[] = [];
    vi.mocked(B.waitForUploads).mockImplementation(async () => (at.push(studio.uploads.length), 'done'));
    await Q.resumeAfterPause();
    expect(statuses()).toEqual(['done', 'done', 'done', 'done']);
    expect(at).toEqual([4]); // after B and C (2 + the 2 from before), not after B alone
  });
});

// The weekly schedule (P5-week-schedule) with the pause and the batches of this unit.
describe('with the weekly schedule', () => {
  const week: Schedule = { on: true, start: '2026-10-13T10:00', every: 1, unit: 'day', mode: 'week', perWeek: 3, from: '17:00', to: '21:00', seed: 20261013, anchor: '2026-10-13T10:00' };
  const slots = (n: number) => {
    const w = weekOf(week)!;
    const out: number[] = [];
    for (let t = w.notBefore(Date.now() + SCHEDULE_MIN_LEAD); out.length < n; t = w.after(t)) out.push(t);
    return out;
  };
  const finals = () => Q.queue.map((i) => i.publishFinal ?? null);
  let wasSchedule: Schedule;
  beforeEach(() => {
    wasSchedule = settings.schedule;
    settings.schedule = { ...week };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => { settings.schedule = wasSchedule; });

  it('a batch wait does not move the weekly times', async () => {
    settings.batch = 1;
    const want = slots(3);
    await add('A.mp4', 'B.mp4', 'C.mp4');
    vi.spyOn(B, 'waitForUploads').mockImplementation(async () => (vi.setSystemTime(Date.now() + 10 * 60_000), 'done')); // ten minutes each
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done', 'done']);
    expect(finals()).toEqual(want);
  });

  it('a run resumed after the daily limit goes on with the generated weekly times', async () => {
    const want = slots(1);
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.limitFrom = 1;
    await Q.startQueue(binding());
    expect(finals()).toEqual([want[0], null, null]);
    studio.limitFrom = Infinity;
    const resumeAt = NOW + PAUSE_MS + 60_000;
    vi.setSystemTime(resumeAt);
    await Q.resumeAfterPause();
    expect(statuses()).toEqual(['done', 'done', 'done']);
    // The next generated time after A's that can still be scheduled, then the one after it:
    // the same sequence a run without a pause walks, never a time of the interval mode.
    const w = weekOf(week)!;
    const b = w.notBefore(Math.max(w.after(want[0]!), resumeAt + SCHEDULE_MIN_LEAD));
    expect(finals()).toEqual([want[0], b, w.after(b)]);
    expect(settings.schedule).toMatchObject({ mode: 'week', anchor: week.anchor, seed: week.seed });
  });
});

describe('waitForUploads (Studio\'s upload monitor)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  const run = (read: () => string | null, stopped = () => false) => {
    const said: string[] = [];
    const p = B.waitForUploads({ read, stopped, say: (m) => void said.push(m) });
    return { p, said };
  };

  it('waits while the monitor says "uploading" and ends once it stops saying so', async () => {
    const texts = ['Uploading 1 of 2', 'Uploading 2 of 2 · 80%', 'กำลังอัปโหลด 1 จาก 2', 'Uploads complete', 'Uploads complete'];
    let i = 0;
    const { p, said } = run(() => texts[Math.min(i++, texts.length - 1)]!);
    await vi.advanceTimersByTimeAsync(B.BATCH_POLL_MS * 6);
    expect(await p).toBe('done');
    expect(said).toEqual(texts.slice(0, 4)); // ended at the fifth reading: twice in a row without "uploading"
  });

  it('a monitor that was there and is gone means done', async () => {
    const texts: (string | null)[] = ['Uploading 1 of 1', null, null];
    let i = 0;
    const { p } = run(() => texts[Math.min(i++, 2)]!);
    await vi.advanceTimersByTimeAsync(B.BATCH_POLL_MS * 3);
    expect(await p).toBe('done');
  });

  it('a monitor never found: gives up after 2 minutes, not before', async () => {
    let done = '';
    const { p } = run(() => null);
    void p.then((r) => { done = r; });
    await vi.advanceTimersByTimeAsync(B.BATCH_BLIND_MS - B.BATCH_POLL_MS);
    expect(done).toBe('');
    await vi.advanceTimersByTimeAsync(B.BATCH_POLL_MS);
    expect(done).toBe('blind');
    expect(B.BATCH_BLIND_MS).toBe(120_000);
  });

  it('never longer than 6 hours, whatever the monitor says', async () => {
    const { p } = run(() => 'Uploading 1 of 1');
    await vi.advanceTimersByTimeAsync(B.BATCH_MAX_MS);
    expect(await p).toBe('long');
  });

  it('Stop ends it at the next reading', async () => {
    let stop = false;
    const { p } = run(() => 'Uploading 1 of 1', () => stop);
    await vi.advanceTimersByTimeAsync(B.BATCH_POLL_MS);
    stop = true;
    await vi.advanceTimersByTimeAsync(B.BATCH_POLL_MS);
    expect(await p).toBe('stopped');
  });

  it('reads the monitor by SEL.uploadMonitor; one that is hidden counts as not there', () => {
    const el = { hidden: false, getAttribute: () => null, textContent: '  Uploading\n 1 of 2 ' };
    const doc = (found: unknown) => ({ querySelector: (s: string) => (s === SEL.uploadMonitor ? found : null) }) as unknown as Document;
    expect(B.monitorText(doc(el))).toBe('Uploading 1 of 2');
    expect(B.monitorText(doc({ ...el, hidden: true }))).toBe(null);
    expect(B.monitorText(doc(null))).toBe(null);
  });
});

describe('the estimate before Start', () => {
  const row = (channel: string, agoMs: number) => ({ date: new Date(NOW - agoMs).toISOString(), channel, channelName: '', videoId: '', title: '', file: 'x.mp4', size: 1, txt: '', description: '', publishAt: null, visibility: 'PRIVATE' });
  const H = 3600e3;
  const summary = async () => {
    const s = await Q.startSummary();
    if ('error' in s) throw new Error(s.error);
    return s;
  };

  it('warns when this browser\'s uploads to the channel in the last 24 hours plus the queue go over the number', async () => {
    settings.dailyLimit = 4;
    save('uploads', [row(CH, 1 * H), row(CH, 23 * H), row(CH, 25 * H), row('UCother', 2 * H)]);
    await add('A.mp4', 'B.mp4');
    expect((await summary()).daily).toBeUndefined(); // 2 + 2 = 4: not over
    await add('C.mp4');
    const s = await summary();
    expect(s.daily).toEqual({ recent: 2, limit: 4 });
    expect(s.needsConfirm).toBe(true); // the panel asks, although "confirm before start" is off
  });

  it('0 turns the warning off; a warning never blocks the start', async () => {
    save('uploads', [row(CH, 1 * H)]);
    await add('A.mp4', 'B.mp4');
    settings.dailyLimit = 0;
    const off = await summary();
    expect(off.daily).toBeUndefined();
    expect(off.needsConfirm).toBe(false);
    settings.dailyLimit = 1;
    expect((await summary()).daily).toEqual({ recent: 1, limit: 1 });
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done']);
  });
});

// The entrypoint is read as text, as in studio-wiring.test.ts (it only runs in a browser).
describe('the Studio content script', () => {
  it('ticks the pause watch with the page\'s own interval, and holds it while the userscript is in the page', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const studioSrc = readFileSync(join(__dirname, '..', 'entrypoints/studio.content.ts'), 'utf8');
    expect(studioSrc).toMatch(/const pauseWatch = createPauseWatch\(\{\s*channelId: \(\) => getChannel\(\)\.id,\s*pending: \(\) => queue\.filter\(\(i\) => i\.status === 'pending'\)\.length,\s*running: \(\) => running \|\| userscriptHere\(\),\s*resume: \(\) => resumeFromPause\(ui\)\.finally\(elsewhere\),/);
    expect(studioSrc).toMatch(/ctx\.setInterval\(\(\) => \{[\s\S]*pauseWatch\.tick\(\);[\s\S]*\}, 800\);/);
  });
});
