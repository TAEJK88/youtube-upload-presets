import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { armAutopilot, notifyAutopilotDue, nudgeAutopilot, openFromAutopilotNote, registerAutopilotAlarms, syncAutopilotAlarms } from '../lib/claims/alarms';

const NOW = Date.UTC(2026, 9, 9);
beforeEach(() => { fakeBrowser.reset(); vi.restoreAllMocks(); });
const alarms = async () => (await browser.alarms.getAll()).map((a) => [a.name, a.scheduledTime]).sort();
// Every tab is a live Studio tab (workerOf and leasedTab ask tabs.get).
const liveTabs = () =>
  vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) => ({ id, url: 'https://studio.youtube.com/channel/UC' + id })) as never);
const fire = (name: string, scheduledTime: number) => fakeBrowser.alarms.onAlarm.trigger({ name, scheduledTime } as never);

describe('Auto-pilot alarms', () => {
  it('one alarm per channel whose next cycle is in the future; none when off or already due', async () => {
    await browser.storage.local.set({
      'autopilot:UC1': { on: true, next: NOW + 3600e3 },
      'autopilot:UC2': { on: false, next: NOW + 3600e3 },
      'autopilot:UC3': { on: true, next: 0 }, // due: the tab's own tick runs it (no alarm to re-fire)
      'autopilot:UC4': { on: 1, next: NOW + 3600e3 }, // not a stored switch: off
      'autopilot:UC6': { on: true, next: NOW }, // due this very millisecond
    });
    await browser.alarms.create('ap:UC9', { when: NOW + 1 }); // a channel switched off since
    await browser.alarms.create('other', { when: NOW + 1 }); // not ours
    await syncAutopilotAlarms(NOW);
    expect(await alarms()).toEqual([['ap:UC1', NOW + 3600e3], ['other', NOW + 1]]);
  });

  it("no alarm for 'unknown', whatever is stored under it", async () => {
    await browser.storage.local.set({ 'autopilot:unknown': { on: true, next: NOW + 3600e3 } });
    await browser.alarms.create('ap:unknown', { when: NOW + 3600e3 }); // armed by an older build
    await syncAutopilotAlarms(NOW);
    expect(await alarms()).toEqual([]);
    await armAutopilot('unknown', { on: true, next: NOW + 7200e3 }, NOW);
    expect(await alarms()).toEqual([]);
  });

  it('never re-arms the same cycle: a service worker start or a second sync creates nothing', async () => {
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: NOW + 3600e3 } });
    const create = vi.spyOn(browser.alarms, 'create');
    await syncAutopilotAlarms(NOW);
    await syncAutopilotAlarms(NOW + 1000);
    expect(create).toHaveBeenCalledTimes(1);
    await browser.alarms.clear('ap:UC1'); // it fired (a one-shot alarm is gone afterwards)
    await syncAutopilotAlarms(NOW + 3600e3 + 1); // the cycle is due now, not re-armed
    expect(create).toHaveBeenCalledTimes(1);
    await armAutopilot('UC1', { on: true, next: NOW + 7200e3 }, NOW + 3600e3 + 2); // the cycle ran: next time
    expect(create).toHaveBeenCalledTimes(2);
    await armAutopilot('UC1', { on: false, next: 0 }, NOW + 3600e3 + 3);
    expect(await alarms()).toEqual([]);
  });

  it('a new cycle withdraws the "is due" notice of the last one; a channel that stays due keeps it', async () => {
    const clear = vi.spyOn(browser.notifications, 'clear');
    await armAutopilot('UC1', { on: true, next: NOW - 1 }, NOW); // still due (the page wrote something else in the key)
    expect(clear).not.toHaveBeenCalled();
    await armAutopilot('UC1', { on: true, next: NOW + 3600e3 }, NOW); // the cycle started or ran: next time
    expect(clear.mock.calls).toEqual([['apdue:UC1']]);
    await armAutopilot('UC1', { on: true, next: NOW + 3600e3 }, NOW + 1); // the same cycle: nothing to do
    expect(clear).toHaveBeenCalledTimes(1);
    clear.mockRejectedValue(new Error('gone'));
    await armAutopilot('UC1', { on: true, next: NOW + 7200e3 }, NOW + 2); // a failed clear is not an error
    expect(await alarms()).toEqual([['ap:UC1', NOW + 7200e3]]);
  });

  it('a change of autopilot:<ch> arms or clears that channel, in storage.local only', async () => {
    registerAutopilotAlarms();
    const next = Date.now() + 3600e3;
    await browser.storage.session.set({ 'autopilot:UC2': { on: true, next } }); // another area: not the setting
    await browser.storage.local.set({ 'claimScan:UC3': { on: true, next } }); // another key
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next } });
    await vi.waitFor(async () => expect(await alarms()).toEqual([['ap:UC1', next]]));
    await browser.storage.local.remove('autopilot:UC1');
    await vi.waitFor(async () => expect(await alarms()).toEqual([]));
  });

  it("the alarm reaches the channel's tab only; no lease, nothing sent", async () => {
    const send = vi.fn(async () => undefined);
    await browser.storage.session.set({ claimsWorkers: { UC1: { tabId: 3, at: Date.now() }, UC2: { tabId: 1, at: Date.now() }, UC5: { tabId: 4, at: Date.now() - 60_000 } } });
    liveTabs();
    expect(await nudgeAutopilot('ap:UC1', send as never)).toBe(true);
    expect(send.mock.calls).toEqual([['claims:autopilot', 'UC1', 3]]);
    expect(await nudgeAutopilot('ap:UC7', send as never)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    // A hidden tab's lease goes stale (Chrome slows its timers): the tab is nudged all the same (call 35).
    expect(await nudgeAutopilot('ap:UC5', send as never)).toBe(true);
    expect(send.mock.calls[1]).toEqual(['claims:autopilot', 'UC5', 4]);
  });

  it('a leased tab that is gone, discarded, or without a live script: no error, nobody reached', async () => {
    await browser.storage.session.set({ claimsWorkers: { UC1: { tabId: 3, at: Date.now() }, UC5: { tabId: 4, at: Date.now() - 60_000 } } });
    const get = vi.spyOn(browser.tabs, 'get').mockRejectedValue(new Error('No tab'));
    const send = vi.fn(async () => undefined);
    expect(await nudgeAutopilot('ap:UC1', send as never)).toBe(false);
    expect(await nudgeAutopilot('ap:UC5', send as never)).toBe(false);
    get.mockResolvedValue({ id: 4, url: 'https://studio.youtube.com/', discarded: true } as never);
    expect(await nudgeAutopilot('ap:UC5', send as never)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    liveTabs();
    const dead = vi.fn(async () => { throw new Error('Receiving end does not exist'); });
    expect(await nudgeAutopilot('ap:UC1', dead as never)).toBe(false);
    expect(dead).toHaveBeenCalledTimes(1);
  });
});

describe('"Auto-pilot is due" notification', () => {
  const MSG = 'No YouTube Studio tab for Lofi Beats is open — click to open one and Auto-pilot will scan and trim';

  it('the alarm with no Studio tab to run the cycle notifies once, naming the channel', async () => {
    registerAutopilotAlarms();
    const NOW = Date.now() - 5_000; // an alarm on time (Chrome may fire a few seconds late)
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: NOW }, 'claimScan:UC1': { channelName: 'Lofi Beats' } });
    const create = vi.spyOn(browser.notifications, 'create');
    vi.spyOn(browser.tabs, 'get').mockRejectedValue(new Error('No tab'));
    await fire('ap:UC1', NOW);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith('apdue:UC1', expect.objectContaining({ type: 'basic', silent: true, title: 'Auto-pilot is due', message: MSG }));
    expect((await browser.storage.local.get('apNotified')).apNotified).toEqual({ UC1: NOW });
    await fire('xx:UC1', NOW + 1); // not ours
    await fire('ap:UC1', NOW); // the same cycle again
    await new Promise((r) => setTimeout(r, 0));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a lease whose tab is gone, or whose tab has no script to take the message, notifies once', async () => {
    const sent = vi.fn(async () => { throw new Error('Receiving end does not exist'); });
    registerAutopilotAlarms(sent as never);
    const NOW = Date.now();
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: NOW }, 'autopilot:UC2': { on: true, next: NOW } });
    await browser.storage.session.set({ claimsWorkers: { UC1: { tabId: 3, at: Date.now() }, UC2: { tabId: 4, at: Date.now() } } });
    const create = vi.spyOn(browser.notifications, 'create');
    const get = vi.spyOn(browser.tabs, 'get').mockRejectedValue(new Error('No tab'));
    await fire('ap:UC1', NOW);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    get.mockRestore();
    liveTabs();
    expect(sent).not.toHaveBeenCalled();
    await fire('ap:UC2', NOW);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(sent.mock.calls).toEqual([['claims:autopilot', 'UC2', 4]]);
    expect(create).toHaveBeenLastCalledWith('apdue:UC2', expect.objectContaining({ title: 'Auto-pilot is due' }));
    await fire('ap:UC2', NOW);
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('once per due cycle: a second alarm or a service-worker restart for the same next says nothing; a new next may', async () => {
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: NOW }, 'autopilot:UC2': { on: true, next: NOW } });
    const create = vi.spyOn(browser.notifications, 'create');
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(true);
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(false); // same cycle (state is in storage.local, not memory)
    expect(await notifyAutopilotDue('UC1', NOW + 6 * 3600e3)).toBe(true);
    expect(await notifyAutopilotDue('UC2', NOW)).toBe(true); // per channel
    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(1, 'apdue:UC1', expect.objectContaining({ message: MSG.replace('Lofi Beats', 'UC1') })); // no scan yet: the id
    expect((await browser.storage.local.get('apNotified')).apNotified).toEqual({ UC1: NOW + 6 * 3600e3, UC2: NOW });
  });

  it('no notification when a tab took the nudge, fresh lease or stale', async () => {
    const sent = vi.fn(async () => undefined);
    registerAutopilotAlarms(sent as never);
    const NOW = Date.now();
    await browser.storage.local.set({ 'autopilot:UC5': { on: true, next: NOW } });
    await browser.storage.session.set({ claimsWorkers: { UC1: { tabId: 3, at: Date.now() }, UC5: { tabId: 4, at: Date.now() - 60_000 } } });
    liveTabs();
    const create = vi.spyOn(browser.notifications, 'create');
    expect(await nudgeAutopilot('ap:UC1', (async () => undefined) as never)).toBe(true);
    await fire('ap:UC5', NOW); // the tab was hidden for a while: its lease is stale, the tab is there
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    expect(sent.mock.calls).toEqual([['claims:autopilot', 'UC5', 4]]);
    await new Promise((r) => setTimeout(r, 0));
    expect(create).not.toHaveBeenCalled();
    expect((await browser.storage.local.get('apNotified')).apNotified).toBeUndefined();
  });

  it('a late alarm (Chrome was closed past the cycle) still nudges, and says nothing (call 36)', async () => {
    const sent = vi.fn(async () => { throw new Error('Receiving end does not exist'); });
    registerAutopilotAlarms(sent as never);
    const late = Date.now() - 61_000;
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: late }, 'autopilot:UC2': { on: true, next: late } });
    await browser.storage.session.set({ claimsWorkers: { UC2: { tabId: 4, at: Date.now() } } });
    liveTabs();
    const create = vi.spyOn(browser.notifications, 'create');
    await fire('ap:UC1', late); // no lease: a restored Studio tab is probably still loading
    await fire('ap:UC2', late); // a tab is there: nudged all the same
    await vi.waitFor(() => expect(sent.mock.calls).toEqual([['claims:autopilot', 'UC2', 4]]));
    await new Promise((r) => setTimeout(r, 0));
    expect(create).not.toHaveBeenCalled();
    expect((await browser.storage.local.get('apNotified')).apNotified).toBeUndefined(); // not counted as said
    await fire('ap:UC1', Date.now() - 30_000); // on time, no lease: the notice
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('no notice for a channel whose Auto-pilot is off (an alarm left over from a switch-off)', async () => {
    const create = vi.spyOn(browser.notifications, 'create');
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(false); // no setting at all
    await browser.storage.local.set({ 'autopilot:UC1': { on: false, next: NOW } });
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(false);
    await browser.storage.local.set({ 'autopilot:UC1': { on: 1, next: NOW } });
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect((await browser.storage.local.get('apNotified')).apNotified).toBeUndefined();
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: NOW } });
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(true);
  });

  it('a click with no Chrome window open opens one; if that fails too, no error and the notice goes', async () => {
    const createTab = vi.spyOn(browser.tabs, 'create').mockRejectedValue(new Error('No current window'));
    const createWin = vi.spyOn(browser.windows, 'create').mockResolvedValue({ id: 1 } as never);
    const clear = vi.spyOn(browser.notifications, 'clear');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await openFromAutopilotNote('apdue:UC1')).toBe(true);
    expect(createTab).toHaveBeenCalledTimes(1);
    expect(createWin.mock.calls).toEqual([[{ url: 'https://studio.youtube.com/channel/UC1' }]]);
    expect(logged).not.toHaveBeenCalled();
    createWin.mockRejectedValue(new Error('no'));
    clear.mockRejectedValue(new Error('gone'));
    expect(await openFromAutopilotNote('apdue:UC1')).toBe(true);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("a click opens Studio on that channel's page in a new tab and clears the notification", async () => {
    const createTab = vi.spyOn(browser.tabs, 'create').mockResolvedValue({ id: 9 } as never);
    const createWin = vi.spyOn(browser.windows, 'create');
    const clear = vi.spyOn(browser.notifications, 'clear');
    expect(await openFromAutopilotNote('apdue:UC1')).toBe(true);
    expect(createTab).toHaveBeenCalledWith({ url: 'https://studio.youtube.com/channel/UC1' });
    expect(clear).toHaveBeenCalledWith('apdue:UC1');
    expect(await openFromAutopilotNote('apdue:unknown')).toBe(true);
    expect(createTab).toHaveBeenLastCalledWith({ url: 'https://studio.youtube.com/' });
    expect(await openFromAutopilotNote('apdue:x/../y?z')).toBe(true); // not a channel id: nothing of it in the URL
    expect(createTab).toHaveBeenLastCalledWith({ url: 'https://studio.youtube.com/' });
    expect(await openFromAutopilotNote('queue:5')).toBe(false); // not ours
    expect(createTab).toHaveBeenCalledTimes(3);
    expect(createWin).not.toHaveBeenCalled();
  });
});
