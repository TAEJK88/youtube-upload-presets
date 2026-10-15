import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import type { Schedule } from '../lib/settings';
import { DRAFT_RETRIES } from '../lib/studio/draft-retry';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as B from '../lib/studio/queue-batch';
import { setBridge } from '../lib/studio/queue-files';
import { resumeDrafts, retryItem } from '../lib/studio/queue-ops';
import * as Q from '../lib/studio/queue-runner';
import { SEL } from '../lib/studio/sel';
import { load, save, settings } from '../lib/studio/state';
import { fakeBridge } from './bridge-fake';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// A video that fails after its file became a draft in Studio (P5-draft-retry), through
// runQueue() with Studio's dialog faked at the automation layer as in queue-limits.test.ts.
// The draft's dialog itself (openDraft) is faked here; lib/studio/draft-retry.ts has its own tests.
const CH = 'UCabcdefghijklmn';
const DRAFT = 'r9u2Pn0ve-g';
const CALENDAR = 'Could not open the calendar';
const studio = vi.hoisted(() => ({
  open: false,
  stuck: false, // the dialog's X does nothing
  uploads: [] as string[], // file names handed to Studio
  opened: [] as string[], // drafts whose dialog was opened again
  openErr: '', // why a draft's dialog would not open
  link: '', // the video link the open dialog shows
  nextId: [] as string[], // the ids Studio gives the files handed to it, in order
  schedule: [] as string[], // what the date picker answers, one per try ('' = done)
  set: [] as number[], // the times it was asked for
  progress: '',
  dialogError: '',
  onSchedule: (() => {}) as () => void,
  onFill: (() => {}) as () => void,
}));
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));
vi.mock('../lib/studio/page-toast', () => ({ pageToast: vi.fn() }));
vi.mock('../lib/studio/queue-store', () => ({ persistQueue: vi.fn() }));
vi.mock('../lib/studio/schedule', () => ({
  setSchedule: async (d: Date) => (studio.set.push(d.getTime()), studio.onSchedule(), studio.schedule.shift() ?? ''),
}));
vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
  isVisible: (el: unknown) => !!el,
  detailsOpen: () => studio.open,
  uploadDialogOpen: () => studio.open,
  getTitleBox: () => (studio.dialogError ? null : { textContent: 'from Studio' }),
  fillDetails: async () => (studio.onFill(), true),
  getDialog: () => ({
    querySelector: (s: string) =>
      s === SEL.doneButton
        ? { hasAttribute: () => false, querySelector: () => ({ disabled: false, getAttribute: () => null, click: () => { studio.open = false; } }) }
        : s === SEL.videoLink && studio.link ? { href: 'https://youtu.be/' + studio.link }
        : null,
    querySelectorAll: () => [],
  }),
}));
vi.mock('../lib/studio/upload-dialog', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/upload-dialog')>()),
  openFilePicker: async () => ({ input: {} }),
  injectUploadFile: async (_i: unknown, f: File) => (studio.uploads.push(f.name), (studio.link = studio.nextId.shift() ?? ''), (studio.open = true), true),
  closeStudioUploadDialog: () => { if (!studio.stuck) studio.open = false; },
  goToVisibility: async () => true,
  ackNoticeDialogs: () => false,
  closeAfterDialogs: () => {},
  dialogError: () => studio.dialogError,
  uploadProgressText: () => studio.progress,
}));
vi.mock('../lib/studio/draft-retry', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/draft-retry')>()), // closing the dialog is the real code
  openDraft: async ({ id }: { id: string }) => {
    studio.opened.push(id);
    if (studio.openErr) return studio.openErr;
    studio.link = id;
    studio.open = true;
    return '';
  },
}));

const toasts: string[] = [];
const said: string[] = []; // every message a card showed, as "name: message"
const recorder: PageUi = {
  item: (it) => void said.push(`${it.file.name}: ${it.msg}`),
  run: () => {}, queue: () => {}, schedule: () => {}, presetPreview: () => {},
  toast: (msg) => void toasts.push(msg),
  openDrawer: () => {}, notifyDone: () => {}, setTitleMark: () => {},
  confirmStart: async () => true,
};

let n = 0;
const qfile = (name: string) => Object.assign(new File(['x'], name), { qid: `dr-${++n}`, src: 'bridge' as const });
const add = async (...names: string[]) => {
  await Q.addFiles(names.map(qfile));
  toasts.length = 0; // "Added 3 video(s)"
};
const getFile = vi.fn(async (id: string) => new File(['x'], Q.queue.find((i) => i.id === id)?.file.name ?? id));
const statuses = () => Q.queue.map((i) => i.status);
const drafts = () => Q.queue.map((i) => i.draftId || '');
const binding = () => ({ channelId: CH, ids: Q.queue.filter((i) => i.status === 'pending').map((i) => i.id), editRev: Q.getEditRev(), sig: Q.startSig(), asked: true });
const NOW = new Date(2026, 9, 14, 9, 0).getTime();
const daily: Schedule = { on: true, start: '2026-10-14T19:00', every: 1, unit: 'day' };
const at = (day: number, h = 19) => new Date(2026, 9, day, h, 0).getTime();
const TAIL = (id: string) => ` · The file is already a draft in Studio (${id}). Retry goes on with that draft, without uploading again`;

let was: { batch: number; confirmStart: boolean; autoSave: boolean; schedule: Schedule };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.stubGlobal('document', Object.assign(makeDocument(), { hasFocus: () => true, title: 'Channel content', visibilityState: 'visible' }));
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  setPageUi(recorder);
  getFile.mockClear();
  setBridge(fakeBridge(getFile));
  Q.queue.splice(0);
  toasts.length = 0;
  said.length = 0;
  Object.assign(studio, {
    open: false, stuck: false, uploads: [], opened: [], openErr: '', link: '', nextId: [], schedule: [], set: [], progress: '', dialogError: '', onSchedule: () => {}, onFill: () => {},
  });
  was = { batch: settings.batch, confirmStart: settings.confirmStart, autoSave: settings.autoSave, schedule: settings.schedule };
  Object.assign(settings, { batch: 0, confirmStart: false, autoSave: true, schedule: { ...daily } });
  save('uploads', []);
});
afterEach(() => {
  Object.assign(settings, was);
  setBridge(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// What the owner saw: card 1 failed at the calendar and its dialog stayed open; cards 2 and 3
// then failed on "an upload dialog is still open" and were given card 1's draft id.
describe('a failed video whose dialog stays open', () => {
  it('stops the run there with one message; the rest stay queued and get no draft id', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR];
    studio.stuck = true;
    await Q.runQueue();
    expect(statuses()).toEqual(['error', 'pending', 'pending']);
    expect(drafts()).toEqual([DRAFT, '', '']);
    expect(studio.uploads).toEqual(['A.mp4']);
    const STUCK = "Studio's upload dialog could not be closed — the queue stopped at this video. Close that dialog yourself, then start again";
    expect(Q.queue[0]!.msg).toBe(`Scheduling failed: ${CALENDAR}${TAIL(DRAFT)} · ${STUCK}`);
    expect(toasts[0]).toBe(`⛔ Queue stopped: ${STUCK}`);
    expect(studio.opened).toEqual([]); // nothing is opened over a dialog that would not close
  });

  it('says when the tab was in the background', async () => {
    await add('A.mp4', 'B.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR];
    studio.stuck = true;
    (document as unknown as { visibilityState: string }).visibilityState = 'hidden';
    await Q.runQueue();
    expect(Q.queue[0]!.msg.endsWith('then start again (the Studio tab was in the background)')).toBe(true);
  });

  it('a video that never handed its file to Studio takes no id from a dialog left open', async () => {
    await add('A.mp4', 'B.mp4');
    studio.open = true; // a dialog the user left open, on another video
    studio.link = 'otherVideo1';
    await Q.runQueue();
    expect(Q.queue[0]).toMatchObject({ status: 'error', msg: 'An upload dialog is still open. Close it, then start again' });
    expect(drafts()[0]).toBe('');
    expect(getFile).toHaveBeenCalledTimes(1); // A's file was never fetched; the dialog closed, so B went up
    expect(statuses()[1]).toBe('done');
  });

  it('nor when the video before it had handed its file over', async () => {
    await add('A.mp4');
    studio.nextId = ['aaaaaaaaaaa'];
    await Q.runQueue();
    expect(statuses()).toEqual(['done']);
    await add('B.mp4');
    studio.open = true;
    studio.link = 'otherVideo1';
    await Q.runQueue();
    expect(Q.queue[1]).toMatchObject({ status: 'error', msg: 'An upload dialog is still open. Close it, then start again' });
    expect(drafts()[1]).toBe('');
  });

  it('a failure after the file was handed over still reads its own draft id', async () => {
    await add('A.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = Array(DRAFT_RETRIES + 1).fill(CALENDAR);
    await Q.runQueue();
    expect(drafts()).toEqual([DRAFT]);
  });
});

describe('the retry on the draft, by itself', () => {
  it('opens that draft again and finishes it: the file goes up once, and the next video follows', async () => {
    await add('A.mp4', 'B.mp4');
    studio.nextId = [DRAFT, 'bbbbbbbbbbb'];
    studio.schedule = [CALENDAR]; // the first try fails, the second sets the time
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'done']);
    expect(studio.uploads).toEqual(['A.mp4', 'B.mp4']);
    expect(getFile).toHaveBeenCalledTimes(2);
    expect(studio.opened).toEqual([DRAFT]);
    expect(Q.queue[0]).toMatchObject({ videoId: DRAFT, publishFinal: at(14) });
    expect(studio.set).toEqual([at(14), at(14), at(15)]); // the card's time again, then B's
    expect(load<Q.UploadRecord[]>('uploads', []).map((u) => u.videoId)).toEqual(['bbbbbbbbbbb', DRAFT]); // once each
    const a = said.filter((m) => m.startsWith('A.mp4: ')).map((m) => m.slice(7));
    expect(a).toContain('Retrying on the draft (1 of 2)…');
    expect(a).toContain('Filling in details on the draft…');
    expect(a).not.toContain(`Scheduling failed: ${CALENDAR}${TAIL(DRAFT)}`); // never shown as an error
    expect(console.warn).toHaveBeenCalledWith(`[ytup] draft retry: "A.mp4" failed as draft ${DRAFT} ("Scheduling failed: ${CALENDAR}"), try 1 of 2 follows`);
  });

  it(`gives up after ${DRAFT_RETRIES} retries: the error says so and keeps the draft id, and the run moves on`, async () => {
    await add('A.mp4', 'B.mp4');
    studio.nextId = [DRAFT, 'bbbbbbbbbbb'];
    studio.schedule = [CALENDAR, CALENDAR, CALENDAR];
    await Q.runQueue();
    expect(DRAFT_RETRIES).toBe(2);
    expect(statuses()).toEqual(['error', 'done']);
    expect(studio.opened).toEqual([DRAFT, DRAFT]);
    expect(studio.uploads).toEqual(['A.mp4', 'B.mp4']);
    expect(Q.queue[0]!.msg).toBe(`Scheduling failed: ${CALENDAR} (after 2 retries on the draft)${TAIL(DRAFT)}`);
    expect(drafts()[0]).toBe(DRAFT);
    // the pause before each retry and the opening of the draft say the same number
    expect(said.filter((m) => m.startsWith('A.mp4: Retrying'))).toEqual([1, 1, 2, 2].map((k) => `A.mp4: Retrying on the draft (${k} of 2)…`));
  });

  it('a draft that cannot be opened: the video is the error it was, with its draft id, and nothing is uploaded twice', async () => {
    await add('A.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR];
    studio.openErr = 'Could not open the draft in Studio';
    await Q.runQueue();
    expect(statuses()).toEqual(['error']);
    expect(studio.uploads).toEqual(['A.mp4']);
    expect(Q.queue[0]!.msg).toBe(`Could not open the draft in Studio (after 2 retries on the draft)${TAIL(DRAFT)}`);
  });

  it('a video with no draft is not retried', async () => {
    await add('A.mp4');
    studio.schedule = [CALENDAR]; // the dialog showed no video link
    await Q.runQueue();
    expect(Q.queue[0]).toMatchObject({ status: 'error', msg: `Scheduling failed: ${CALENDAR}` });
    expect(studio.opened).toEqual([]);
  });

  it('not after Stop, and not at the upload limit', async () => {
    await add('A.mp4', 'B.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR];
    studio.onSchedule = () => Q.requestStop();
    await Q.runQueue();
    expect(statuses()).toEqual(['error', 'pending']);
    expect(studio.opened).toEqual([]);

    Q.queue.splice(0);
    await add('C.mp4');
    Object.assign(studio, { nextId: ['ccccccccccc'], dialogError: 'Upload limit reached for this file', onSchedule: () => {} });
    await Q.runQueue();
    expect(Q.queue[0]).toMatchObject({ status: 'error', draftId: 'ccccccccccc' });
    expect(studio.opened).toEqual([]);
  });

  it('not for a video the user was asked to Save and did not', async () => {
    settings.autoSave = false;
    settings.schedule = { ...daily, on: false };
    await add('A.mp4');
    studio.nextId = [DRAFT]; // the dialog never closes: nobody presses Save
    await Q.runQueue();
    expect(Q.queue[0]!.msg).toBe(`Waited over 1 hour for you to click Save${TAIL(DRAFT)}`);
    expect(studio.opened).toEqual([]);
  });

  it('a release time the card fixed that has passed by then fails as it always did', async () => {
    await add('A.mp4');
    Object.assign(Q.queue[0]!, { publishAt: at(14, 10), publishEdited: true });
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR];
    studio.onSchedule = () => vi.setSystemTime(at(14, 10)); // the upload took until then
    await Q.runQueue();
    expect(Q.queue[0]!.status).toBe('error');
    expect(Q.queue[0]!.msg).toMatch(/^Release time must be at least 15 minutes in the future \(.+\) \(after 2 retries on the draft\) · The file is already a draft/);
    expect(studio.opened).toEqual([]); // refused before any dialog
  });

  it('a time from the schedule that has passed by then moves on by the schedule\'s own rule', async () => {
    await add('A.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR];
    studio.onSchedule = () => { if (studio.set.length === 1) vi.setSystemTime(at(14, 19)); };
    await Q.runQueue();
    expect(statuses()).toEqual(['done']);
    expect(studio.set).toEqual([at(14), at(15)]);
    expect(Q.queue[0]!.publishFinal).toBe(at(15));
  });

  it('works with the weekly schedule: the retry asks for the same generated time', async () => {
    settings.schedule = { on: true, start: '2026-10-14T10:00', every: 6, unit: 'hour', mode: 'week', perWeek: 3, from: '17:00', to: '21:00', seed: 20261013, anchor: '2026-10-14T10:00' };
    await add('A.mp4', 'B.mp4');
    studio.nextId = [DRAFT, 'bbbbbbbbbbb'];
    studio.schedule = [CALENDAR];
    const [first, second] = Q.queue.map(Q.itemPublishAt);
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'done']);
    expect(studio.set).toEqual([first, first, second]);
  });
});

// The lines a capture of a card left on "Retrying (1 of 2)" is read by (README item 94).
describe('the retry says how it ended', () => {
  const retryLine = (level: 'info' | 'warn', text: string) =>
    expect(console[level]).toHaveBeenCalledWith(expect.stringContaining(`[ytup] draft retry: ${text}`));

  it('done after a retry', async () => {
    await add('A.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR];
    await Q.runQueue();
    retryLine('info', `"A.mp4" ended done after 1 retry on draft ${DRAFT} · tab visible`);
  });

  it('an error after every retry', async () => {
    await add('A.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR, CALENDAR, CALENDAR];
    await Q.runQueue();
    retryLine('info', `"A.mp4" ended as error after 2 retries: Scheduling failed: ${CALENDAR} (after 2 retries on the draft)`);
  });

  it('a run aborted during a retry names the text the card was left on, and ends as before', async () => {
    await add('A.mp4', 'B.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR, CALENDAR];
    studio.onSchedule = () => { if (studio.set.length === 2) Q.abortRun(new Error('Another tab took the lock')); };
    try {
      await Q.runQueue();
    } finally {
      Q.abortRun(null);
      Q.setOtherTabRuns(false);
    }
    retryLine('warn', '"A.mp4": run ended (aborted: Another tab took the lock) during retry 1; the card says "Scheduling for Wed 14 Oct, 19:00…"');
    expect(statuses()).toEqual(['error', 'pending']);
    expect(studio.opened).toEqual([DRAFT]);
  });

  it('a video that was never a draft says nothing', async () => {
    await add('A.mp4');
    await Q.runQueue();
    expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('ended done'));
  });
});

describe('Retry → Resume draft', () => {
  const failed = async () => {
    await add('A.mp4');
    studio.nextId = [DRAFT];
    studio.schedule = [CALENDAR, CALENDAR, CALENDAR];
    await Q.runQueue();
    expect(statuses()).toEqual(['error']);
    Object.assign(studio, { uploads: [], opened: [], set: [] });
    getFile.mockClear();
  };

  it('goes on in the draft: the file is neither fetched nor handed to Studio again', async () => {
    await failed();
    retryItem(Q.queue[0]!.id, true);
    expect(Q.queue[0]).toMatchObject({ status: 'pending', draftId: DRAFT });
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done']);
    expect(getFile).not.toHaveBeenCalled();
    expect(studio.uploads).toEqual([]);
    expect(studio.opened).toEqual([DRAFT]);
    expect(said).toContain('A.mp4: Opening the draft in Studio…');
    expect(Q.queue[0]).toMatchObject({ videoId: DRAFT, publishFinal: at(14) });
    expect(load<Q.UploadRecord[]>('uploads', [])).toHaveLength(1);
  });

  it('"Upload again" forgets the draft and uploads the file', async () => {
    await failed();
    retryItem(Q.queue[0]!.id);
    await Q.startQueue(binding());
    expect(studio.uploads).toEqual(['A.mp4']);
    expect(studio.opened).toEqual([]);
  });

  it('is retried by itself too when it fails again', async () => {
    await failed();
    retryItem(Q.queue[0]!.id, true);
    studio.schedule = [CALENDAR];
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done']);
    expect(studio.opened).toEqual([DRAFT, DRAFT]);
  });

  it('a draft id that is on several cards is not opened for any of them', async () => {
    await add('A.mp4', 'B.mp4');
    for (const it of Q.queue) Object.assign(it, { status: 'error', draftId: DRAFT }); // what the old bug stored
    for (const it of Q.queue) retryItem(it.id, true);
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['error', 'error']);
    expect(studio.opened).toEqual([]);
    expect(Q.queue[0]!.msg).toMatch(/^Draft r9u2Pn0ve-g is named on more than one card/);
    expect(Q.queue[0]!.msg).not.toContain('retries on the draft'); // refused once, not three times
  });

  it('a draft of an earlier run is no upload of this one, also when it is the first video of the run', async () => {
    await failed(); // that run handed A's file to Studio
    await add('B.mp4');
    retryItem(Q.queue[0]!.id, true);
    settings.batch = 1;
    studio.progress = 'Uploading 5% ... 8 minutes left';
    const wait = vi.spyOn(B, 'waitForUploads').mockResolvedValue('done');
    vi.spyOn(B, 'pageUploadText').mockReturnValue(null);
    vi.spyOn(B, 'batchCensus').mockReturnValue('');
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done']);
    expect(wait).not.toHaveBeenCalled(); // A's Save is not held, and B is the last video
  });

  it('keeps the id it was opened by when the dialog shows no link while the details go in', async () => {
    await failed();
    retryItem(Q.queue[0]!.id, true);
    studio.onFill = () => { studio.link = ''; };
    await Q.startQueue(binding());
    expect(Q.queue[0]).toMatchObject({ status: 'done', videoId: DRAFT });
  });

  // A draft from an earlier run was uploaded long ago: it is no part of this run's batch.
  it('is not held by the batch wait and is not counted in a batch', async () => {
    await failed();
    await add('B.mp4', 'C.mp4');
    Q.queue.unshift(Q.queue.splice(1, 1)[0]!); // B, then the draft A, then C
    retryItem(Q.queue[1]!.id, true);
    settings.batch = 2;
    studio.progress = 'Uploading 5% ... 8 minutes left';
    studio.nextId = ['bbbbbbbbbbb', 'ccccccccccc'];
    const waits: string[] = [];
    vi.spyOn(B, 'pageUploadText').mockReturnValue(null);
    vi.spyOn(B, 'batchCensus').mockReturnValue('');
    vi.spyOn(B, 'waitForUploads').mockImplementation(async (d) => (waits.push(`${d.where} after ${studio.uploads.length} upload(s)`), 'done'));
    await Q.startQueue(binding());
    expect(Q.queue.map((i) => `${i.file.name} ${i.status}`)).toEqual(['B.mp4 done', 'A.mp4 done', 'C.mp4 done']);
    expect(studio.uploads).toEqual(['B.mp4', 'C.mp4']);
    // B and the draft are two videos but one upload of this run: the draft's Save is not held as
    // "the batch's last", and no batch is full before C, after which nothing waits.
    expect(waits).toEqual([]);
  });
});

// The Upload tab's "Resume drafts (N)": queue:resumeAll, then the usual Start.
describe('Resume drafts, then Start', () => {
  it('finishes every failed draft in queue order in one run without a file; a failed video with no draft stays an error', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    const [a, b, c] = Q.queue;
    Object.assign(a!, { status: 'error', draftId: 'aaaaaaaaaaa' });
    Object.assign(b!, { status: 'error' });
    Object.assign(c!, { status: 'error', draftId: 'ccccccccccc' });
    expect(resumeDrafts()).toBe(2);
    expect(toasts).toEqual(['Left as errors: 1 with no draft (use Retry on the card to upload the file)']);
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'error', 'done']);
    expect(studio.opened).toEqual(['aaaaaaaaaaa', 'ccccccccccc']);
    expect(studio.uploads).toEqual([]);
    expect(getFile).not.toHaveBeenCalled();
    expect(load<Q.UploadRecord[]>('uploads', [])).toHaveLength(2);
  });

  it('a draft\'s video file that lost read access does not hold the Start back: it is not read', async () => {
    await add('A.mp4', 'B.mp4');
    const [a, b] = Q.queue;
    Object.assign(a!, { status: 'error', draftId: 'aaaaaaaaaaa' });
    setBridge(fakeBridge(getFile, (id) => (id === a!.id ? 'prompt' : 'granted')));
    resumeDrafts();
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done']);
    // and a waiting video without a draft still does
    await add('C.mp4');
    setBridge(fakeBridge(getFile, (id) => (id === b!.id ? 'granted' : 'prompt')));
    toasts.length = 0;
    await Q.startQueue(binding());
    expect(toasts[0]).toMatch(/need read access again/);
  });
});

describe('a video retried by itself is one of its batch', () => {
  it('is counted once, and held like any last video of a batch while its dialog says "Uploading"', async () => {
    await add('A.mp4', 'B.mp4', 'C.mp4');
    settings.batch = 2;
    studio.progress = 'Uploading 5% ... 8 minutes left';
    studio.nextId = ['aaaaaaaaaaa', DRAFT, 'ccccccccccc'];
    studio.schedule = ['', CALENDAR]; // B, the batch's last, fails once
    const waits: string[] = [];
    vi.spyOn(B, 'pageUploadText').mockReturnValue(null);
    vi.spyOn(B, 'batchCensus').mockReturnValue('');
    vi.spyOn(B, 'waitForUploads').mockImplementation(async (d) => (waits.push(`${d.where} after ${studio.uploads.length} upload(s)`), 'done'));
    await Q.startQueue(binding());
    expect(statuses()).toEqual(['done', 'done', 'done']);
    expect(studio.opened).toEqual([DRAFT]);
    expect(waits).toEqual(['dialog after 2 upload(s)', 'page after 2 upload(s)']);
  });
});

// Drafts ticked in Studio's Content list (lib/studio/draft-select.ts): queued with the active
// preset, each goes the way a resumed draft does, and no file is ever uploaded or read.
describe('drafts queued from the Content list', () => {
  const row = (videoId: string, title: string, duration = 0) => ({ videoId, title, duration });

  it('are queued in title order with the active preset, once, and say so', () => {
    expect(Q.addDrafts([row('vid00000012', 'Mix 12', 3000), row('vid00000002', 'Mix 2'), row('vid00000003', 'Mix 3')])).toBe(3);
    expect(Q.queue.map((i) => [i.file.name, i.draftId, i.fromDraft, i.status, i.presetId === Q.queue[0]!.presetId])).toEqual([
      ['Mix 2', 'vid00000002', true, 'pending', true],
      ['Mix 3', 'vid00000003', true, 'pending', true],
      ['Mix 12', 'vid00000012', true, 'pending', true],
    ]);
    expect(Q.queue[2]!.duration).toBe(3000);
    expect(toasts).toEqual(['Added 3 draft(s) to the queue']);
    toasts.length = 0;
    expect(Q.addDrafts([row('vid00000002', 'Mix 2'), row('vid00000004', 'Mix 4')])).toBe(1);
    expect(toasts).toEqual(['Added 1 draft(s) to the queue · 1 already in the queue']);
    expect(drafts()).toEqual(['vid00000002', 'vid00000003', 'vid00000012', 'vid00000004']);
  });

  it('a run opens each draft, fills it in and saves it, and uploads no file', async () => {
    Q.addDrafts([row('vid00000001', 'Mix 1'), row('vid00000002', 'Mix 2')]);
    await Q.runQueue();
    expect(statuses()).toEqual(['done', 'done']);
    expect(studio.opened).toEqual(['vid00000001', 'vid00000002']);
    expect(studio.uploads).toEqual([]);
    expect(getFile).not.toHaveBeenCalled();
  });

  it('Retry keeps the draft: such a card has no file to upload again', async () => {
    Q.addDrafts([row('vid00000001', 'Mix 1')]);
    studio.openErr = 'Could not open the draft in Studio';
    await Q.runQueue();
    expect(statuses()).toEqual(['error']);
    retryItem(Q.queue[0]!.id); // the plain Retry, which forgets a file's draft
    expect(Q.queue[0]!.status).toBe('pending');
    expect(drafts()).toEqual(['vid00000001']);
  });
});

