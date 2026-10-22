import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { createContentUi } from '../lib/studio/content-ui';
import { setTitleMark } from '../lib/studio/page-notify';
import { pageToast } from '../lib/studio/page-toast';
import { setPageUi } from '../lib/studio/page-ui';
import { removeItem } from '../lib/studio/queue-ops';
import { setBridge } from '../lib/studio/queue-files';
import { settings } from '../lib/studio/state';
import * as Q from '../lib/studio/queue-runner';
import { persistQueue } from '../lib/studio/queue-store';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

vi.mock('../lib/studio/queue-store', () => ({ persistQueue: vi.fn() }));
vi.mock('../lib/studio/page-toast', () => ({ pageToast: vi.fn() }));
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));

const item = (id: string, extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status: 'review', msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});

beforeEach(() => {
  vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
  vi.stubGlobal('document', makeDocument());
  vi.stubGlobal('location', { pathname: '/' }); // the broadcast state reads the channel
  vi.mocked(persistQueue).mockClear();
  vi.mocked(pageToast).mockClear();
  Q.queue.splice(0);
  Q.setTornDown(false); // dispose() sets it for the whole runner
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Q.queue.splice(0);
});

describe('content ui', () => {
  // D16's manual check needs the evidence when Chrome refuses the gesture.
  it('a failed openPanel is logged, not swallowed', async () => {
    const err = new Error('may only be called in response to a user gesture');
    vi.mocked(messages.sendMessage).mockRejectedValueOnce(err);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createContentUi().openDrawer();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[ytup] openPanel failed', err));
  });

  // P5-row-tab-choice: openDrawer(tab) (3488). The tab to show goes with the request to open.
  it('openDrawer(tab) asks for the panel on that tab; with no tab, or one the panel does not have, on the one it shows', () => {
    const send = vi.mocked(messages.sendMessage);
    const ui = createContentUi();
    ui.openDrawer('queue');
    ui.openDrawer('claims');
    ui.openDrawer();
    ui.openDrawer('drawer');
    expect(send.mock.calls.filter(([t]) => t === 'openPanel')).toEqual([['openPanel', 'queue'], ['openPanel', 'claims'], ['openPanel', undefined], ['openPanel', undefined]]);
  });

  it('the broadcast state carries the channel; a channel change is sent again', () => {
    const send = vi.mocked(messages.sendMessage);
    const ui = createContentUi();
    ui.tick();
    vi.stubGlobal('location', { pathname: '/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos' });
    ui.tick();
    ui.tick();
    const states = send.mock.calls.filter(([t]) => t === 'queue:state').map(([, s]) => s as messages.QueueState);
    expect(states.map((s) => s.channel.id)).toEqual(['', 'UCaaaaaaaaaaaaaaaaaaaaaa']);
    expect(ui.state()).toEqual(states[1]);
    expect(states.map((s) => s.proto)).toEqual([messages.PROTOCOL, messages.PROTOCOL]); // the panel drops another build's
  });

  // uploadOne() reads the draft id while waiting for Save without telling the UI; a reload
  // in that wait must still find it in storage (the running case: queue-run-flow.test.ts).
  // An idle tab that adopts another tab's draft ids (its Clear done, say) keeps them to
  // itself: writing its copy could land over that tab's next edit.
  it('an idle tab does not save the queue when the tick sees new draft ids', () => {
    Q.queue.push(item('a'));
    const ui = createContentUi();
    ui.tick();
    vi.mocked(persistQueue).mockClear();
    Q.queue[0]!.draftId = 'abcdefghijk';
    ui.tick();
    expect(persistQueue).not.toHaveBeenCalled();
  });

  // P5-row-progress-toast: the progress half of the userscript's 0.8 s tick (6373–6383).
  it('a tick that throws tells the user once per page and still throws for the caller to log', () => {
    const send = vi.mocked(messages.sendMessage);
    const ui = createContentUi();
    vi.stubGlobal('location', { get pathname(): string { throw new Error('boom'); } }); // the broadcast reads the channel
    expect(() => ui.tick()).toThrow('boom');
    expect(() => ui.tick()).toThrow('boom');
    const said = ['⚠ The progress bar stopped: boom — try reloading the page'];
    expect(vi.mocked(pageToast).mock.calls).toEqual([said]);
    expect(send.mock.calls.filter(([t]) => t === 'queue:toast')).toEqual([['queue:toast', ...said]]);
    // a tick that works again does not arm it again
    vi.stubGlobal('location', { pathname: '/' });
    ui.tick();
    vi.stubGlobal('location', { get pathname(): string { throw new Error('again'); } });
    expect(() => ui.tick()).toThrow('again');
    expect(vi.mocked(pageToast)).toHaveBeenCalledOnce();
  });

  // review A-1: renderActivity() (6375) drew the FAB's badge in the same half of the tick, under the
  // same once-flag; here the FAB's update has its own try, and reports through progressFailed().
  it('a failing FAB update and a failing tick share the one toast', () => {
    const ui = createContentUi();
    ui.progressFailed(new Error('fab broke'));
    vi.stubGlobal('location', { get pathname(): string { throw new Error('boom'); } });
    expect(() => ui.tick()).toThrow('boom');
    ui.progressFailed(new Error('fab broke'));
    expect(vi.mocked(pageToast).mock.calls).toEqual([['⚠ The progress bar stopped: fab broke — try reloading the page']]);
  });

  it('ui.schedule() tells the panel without saving the queue', () => {
    const send = vi.mocked(messages.sendMessage);
    const ui = createContentUi();
    const before = ui.state().rev;
    ui.schedule();
    expect(persistQueue).not.toHaveBeenCalled();
    expect(ui.state().rev).toBe(before + 1);
    expect(send).toHaveBeenCalledWith('queue:state', ui.state());
  });

  // A run still in flight when the extension reloads ends later: its finally must not put
  // ✅/⚠️ back on a tab whose mark the teardown cleared.
  it('sets no title mark once torn down', () => {
    document.title = 'Channel content';
    const ui = createContentUi();
    ui.setTitleMark('(1/2) ⬆');
    expect(document.title).toBe('(1/2) ⬆ Channel content');
    ui.dispose();
    setTitleMark(''); // what the content script's teardown does
    ui.setTitleMark('⚠️');
    expect(document.title).toBe('Channel content');
  });

  // The run starts (running is true) and the teardown lands before ui.run() paints "(n/N) ⬆".
  it('does not apply the (n/N) ⬆ mark when disposed before a run paints it', async () => {
    vi.stubGlobal('location', { pathname: '/channel/UCabcdefghijklmn/videos' });
    Object.assign(document, { hasFocus: () => true });
    setBridge(null);
    document.title = 'Channel content';
    const ui = createContentUi();
    setPageUi(ui);
    Q.queue.push(item('a', { status: 'pending' }));
    Q.setRunnerLock({ acquire: async () => (ui.dispose(), true), release: () => {} });
    const confirm = settings.confirmStart;
    settings.confirmStart = false;
    const titles: string[] = [];
    ui.toast = () => {}; // the end-of-run toast needs a real DOM
    ui.notifyDone = () => {};
    const orig = ui.run.bind(ui);
    ui.run = () => { orig(); titles.push(document.title); };
    try {
      // torn down before the first file fetch: the run stops with an error (queue-run-flow tests)
      await expect(Q.runQueue()).rejects.toThrow('The extension was reloaded');
    } finally {
      settings.confirmStart = confirm;
      Q.setRunnerLock({ acquire: async () => true, release: () => {} });
    }
    expect(titles[0]).toBe('Channel content');
  });

  // spec: File intake, step 5 — a finished item's handles go, once.
  it("releases a done item's files exactly once, and only on done", () => {
    const send = vi.mocked(messages.sendMessage);
    const ui = createContentUi();
    const it = item('a', { status: 'uploading', thumb: { id: 't', src: 'bridge', name: 'a.jpg', size: 1, type: '' } });
    Q.queue.push(it);
    for (const s of ['pending', 'uploading', 'review', 'error'] as const) ui.item({ ...it, status: s });
    expect(send).not.toHaveBeenCalledWith('files:delete', expect.anything());
    it.status = 'done';
    ui.item(it);
    ui.item(it);
    expect(send.mock.calls.filter(([type]) => type === 'files:delete')).toEqual([['files:delete', ['a', 't']]]);
  });
});

// renderQueue() ran assignNumbers() (4026): every add and Remove showed fresh
// titles and EP numbers.
describe('ui.queue() works titles and numbers out again', () => {
  let ui: ReturnType<typeof createContentUi>;
  beforeEach(() => {
    ui = createContentUi();
    setPageUi(ui);
  });
  const pending = (id: string, extra: Partial<Q.QueueItem> = {}) => item(id, { status: 'pending', ...extra });

  it('after an add', async () => {
    await Q.addQueued([Object.assign(new File(['x'], 'Mix 1.mp4'), { qid: 'v1', src: 'bridge' as const })]);
    expect(Q.queue[0]!.n).toBeGreaterThan(0);
    expect(Q.queue[0]!.title).not.toBe('');
  });

  it('after a remove', () => {
    Q.queue.push(pending('a'), pending('b'));
    Q.assignNumbers();
    const { n } = Q.queue[1]!;
    Q.queue[1]!.title = 'stale';
    removeItem('a');
    expect(Q.queue[0]!.n).toBe(n - 1);
    expect(Q.queue[0]!.title).not.toBe('stale');
  });
});
