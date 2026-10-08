import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as messages from '../lib/messages';
import { SCHEMA_VERSION } from '../lib/migrations';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { otherTabRunning, queue, setOtherTabRuns, type QueueItem } from '../lib/studio/queue-runner';
import { elsewhere, mayEdit, resumeQueue } from '../lib/studio/queue-sync';
import { disposeState, initState } from '../lib/studio/state';

// The Studio content script's startup and edit gate, without WXT's defineContentScript.
const item = (name: string, status: QueueItem['status']): QueueItem => ({
  id: 'id-' + name, src: 'bridge', file: { name, size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0,
});

const toasts: string[] = [];
const sent: string[] = [];
let otherTab = false;
beforeEach(async () => {
  disposeState();
  fakeBrowser.reset();
  queue.splice(0);
  toasts.length = 0;
  sent.length = 0;
  const noop = () => {};
  setPageUi({
    item: noop, run: noop, queue: noop, schedule: noop, presetPreview: noop, openDrawer: noop, notifyDone: noop,
    setTitleMark: noop, confirmStart: async () => false, toast: (m) => void toasts.push(m),
  } satisfies PageUi);
  vi.spyOn(messages, 'sendMessage').mockImplementation((async (type: string) => {
    sent.push(type);
    return type === 'runner:elsewhere' ? otherTab : undefined;
  }) as typeof messages.sendMessage);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, queue: [item('A.mp4', 'uploading'), item('B.mp4', 'pending')] });
  await initState(async () => SCHEMA_VERSION);
});
afterEach(() => {
  vi.restoreAllMocks();
  setOtherTabRuns(false);
});

describe('startup', () => {
  it('releases a lock left by a reload first, then cuts the interrupted item', async () => {
    otherTab = false;
    await resumeQueue();
    expect(sent).toEqual(['runner:release', 'runner:elsewhere']);
    expect(queue.map((i) => i.status)).toEqual(['error', 'pending']);
  });

  it("leaves another tab's running item alone (markInterrupted = !elsewhere)", async () => {
    otherTab = true;
    await resumeQueue();
    expect(queue.map((i) => i.status)).toEqual(['uploading', 'pending']);
    expect(otherTabRunning()).toBe(true);
  });
});

describe('a failed runner:elsewhere', () => {
  it('keeps the cached flag and cuts nothing', async () => {
    queue.push(item('A.mp4', 'uploading'), item('B.mp4', 'pending'));
    setOtherTabRuns(true);
    vi.mocked(messages.sendMessage).mockImplementation((async () => { throw new Error('no background'); }) as typeof messages.sendMessage);
    expect(await elsewhere()).toBe(true);
    expect(otherTabRunning()).toBe(true);
    expect(queue.map((i) => i.status)).toEqual(['uploading', 'pending']);
  });
});

describe('mayEdit', () => {
  it('refuses while another tab runs the queue, and says so', async () => {
    otherTab = true;
    expect(await mayEdit()).toBe(false);
    expect(toasts).toEqual(['Another Studio tab is running the queue — change the queue there']);
  });

  it('allows it otherwise', async () => {
    otherTab = false;
    expect(await mayEdit()).toBe(true);
    expect(toasts).toEqual([]);
  });
});
