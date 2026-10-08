import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SCHEMA_VERSION } from '../lib/migrations';
import { queue, setOtherTabRuns, type QueueItem } from '../lib/studio/queue-runner';
import { persistQueue, restoreQueue } from '../lib/studio/queue-store';
import { disposeState, flushState, initState } from '../lib/studio/state';

const item = (name: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}): QueueItem => ({
  id: 'id-' + name, src: 'bridge', file: { name, size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});

beforeEach(async () => {
  disposeState(); // initState() is idempotent: start each test from a fresh store
  fakeBrowser.reset();
  queue.splice(0);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
});
afterEach(() => {
  vi.useRealTimers();
  setOtherTabRuns(false);
});

describe('queue store', () => {
  it('restores the stored queue; an interrupted upload comes back as an error', async () => {
    await browser.storage.local.set({ queue: [item('A.mp4', 'done'), item('B.mp4', 'uploading', { draftId: 'abcdefghijk' }), item('C.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    expect(queue.map((i) => i.status)).toEqual(['done', 'error', 'pending']);
    expect(queue[1]!.msg).toBe('The page reloaded during the upload — check Content for a leftover draft, then retry (abcdefghijk)');
    await flushState(); // written back, so the side panel shows the error too
    expect(((await browser.storage.local.get('queue')).queue as QueueItem[]).map((i) => i.status)).toEqual(['done', 'error', 'pending']);
  });

  it("leaves another tab's running upload alone", async () => {
    await browser.storage.local.set({ queue: [item('B.mp4', 'uploading')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false);
    expect(queue[0]!.status).toBe('uploading');
  });

  it('writes changes back, a moment later', async () => {
    vi.useFakeTimers();
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue.push(item('A.mp4', 'pending'));
    persistQueue();
    vi.advanceTimersByTime(300);
    await flushState();
    expect((await browser.storage.local.get('queue')).queue).toEqual([item('A.mp4', 'pending')]);
  });

  it("writes nothing while another tab runs the queue (that tab's copy is the real one)", async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ queue: [item('A.mp4', 'uploading')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false);
    persistQueue(); // a save already waiting when the other tab took the lock
    setOtherTabRuns(true);
    queue.push(item('B.mp4', 'pending'));
    persistQueue();
    vi.advanceTimersByTime(1000);
    await flushState();
    expect((await browser.storage.local.get('queue')).queue).toEqual([item('A.mp4', 'uploading')]);
  });

  it('follows changes from elsewhere', async () => {
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    await browser.storage.local.set({ queue: [item('Z.mp4', 'pending')] });
    expect(queue.map((i) => i.file.name)).toEqual(['Z.mp4']);
  });
});
