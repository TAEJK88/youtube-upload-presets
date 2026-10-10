// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CopyrightTab } from '../entrypoints/sidepanel/tabs/CopyrightTab';
import { registerAutopilotAlarms } from '../lib/claims/alarms';
import { disposeClaimsStore, flushClaims, initClaimsStore } from '../lib/claims/store';
import type { ClaimsState } from '../lib/claims/types';
import { setYoutubei } from '../lib/claims/youtubei';
import * as messages from '../lib/messages';
import { claimWorker } from '../lib/runner-lock';
import { claimsOpInOrder } from '../lib/store-writer';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import { fakeClaims, fakePanel, renderPanel } from './panel-fake';

vi.mock('../lib/studio/automation', async (orig) => ({ ...(await orig<typeof import('../lib/studio/automation')>()), sleep: async () => {} }));
import * as C from '../lib/claims/claims';

// 4b Z: the panel's views and the page's handlers were each tested against a fake of the other.
// Here they meet: the real Copyright tab sends, the payload crosses a message boundary (JSON),
// the real handlers of the Studio tab act on what is stored, and their writes go through the
// background's one writer into the storage the panel reads.
const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const TAB = 3;
const wire = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
// studio.content.ts's handlers (pinned there by claims-page.test.ts).
const page: Record<string, (d: unknown) => unknown> = {
  'claims:view': () => C.claimsState(),
  'claims:trim': (d) => C.trimFromPanel(d),
  'claims:ads': (d) => C.adsFromPanel(d),
  'claims:collab': (d) => C.collabFromPanel(d),
  'claims:stop': () => C.stopAll(),
  'claims:autopilot': (d) => void C.autopilotDue(d),
};
const toTab = vi.fn(async (type: string, data?: unknown) => wire(page[type](wire(data))));
const stored = async <T,>(key: string) => (await browser.storage.local.get(key))[key] as T;
const row = (n: number) => ({ videoId: 'v' + n, video: 'Mix ' + n, privacy: 'public', length: 600, claimId: 'c' + n, song: 'Song ' + n, artists: '', label: '', claimant: 'Co',
  type: '', status: '', impact: 'blocked', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: 'trim', own: false, hasImpact: true, publishAt: 0 });
const vid = (n: number) => ({ videoId: 'v' + n, video: 'Mix ' + n, privacy: 'public', length: 600 });
const date = '2026-10-01T00:00:00Z';

async function start(data: Record<string, unknown>) {
  await browser.storage.local.set(data);
  await initClaimsStore((op) => claimsOpInOrder(wire(op)));
  // The lease is the background's; the lock is refused, so no step changes pages here.
  C.setClaimsLock({ worker: (ch, force) => claimWorker(TAB, ch, force), acquire: async () => false, release: vi.fn(), holds: async () => false });
  await C.initClaimsLock();
}
// The panel as the bound tab's claims:view answers it.
const panel = () => {
  const state = toTab.getMockImplementation()!('claims:view') as unknown as Promise<ClaimsState>;
  return state.then((s) => renderPanel(<CopyrightTab />, fakePanel({ send: toTab as never }), undefined, fakeClaims({ state: s })));
};

beforeEach(async () => {
  fakeBrowser.reset();
  toTab.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) => ({ id, url: 'https://studio.youtube.com/channel/' + CH, discarded: false })) as never);
  vi.spyOn(messages, 'sendMessage').mockImplementation((async (type: string, data: unknown) => {
    if (type !== 'claims:op') throw new Error('unexpected ' + type);
    await claimsOpInOrder(wire(data));
  }) as never);
  C.setClaimsUi({ show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() });
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
});
afterEach(() => {
  cleanup();
  C.stopAll();
  C.setClaimsUi(null);
  setYoutubei(null);
  disposeClaimsStore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('panel → Studio tab → background, with nothing faked in between', () => {
  it('claims:trim starts a run of the ticked claims, and Stop ends it', async () => {
    await start({ [`claimScan:${CH}`]: { date, total: 2, channel: CH, channelName: 'Mine', rows: [row(1), row(2)] }, [`trimQueue:${CH}`]: ['v2:c2'] });
    const first = await panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Claim list (2)' }));
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start trim' }));
    await vi.waitFor(() => expect(toTab).toHaveBeenCalledWith('claims:trim', ['v2:c2']));
    await flushClaims();
    expect(await stored(`trimRun:${CH}`)).toMatchObject({ active: true, mode: 'auto', items: [{ key: 'v2:c2', videoId: 'v2', claimId: 'c2', state: 'pending' }] });

    first.unmount();
    await panel(); // the tab's state now says a run is on: Stop is there
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await vi.waitFor(() => expect(toTab).toHaveBeenCalledWith('claims:stop', undefined));
    await flushClaims();
    expect(await stored(`trimRun:${CH}`)).toMatchObject({ active: false });
  });

  it('claims:ads starts a run of the ticked videos', async () => {
    await start({ [`adsScan:${CH}`]: { date, total: 3, rows: [vid(1), { ...vid(2), ineligible: true }, vid(3)] } });
    await panel();
    fireEvent.click(await screen.findByRole('button', { name: /Ads off/ }));
    fireEvent.click(await screen.findByRole('button', { name: '💰 Turn on ads (2)' })); // the eligible ones start ticked
    await vi.waitFor(() => expect(toTab).toHaveBeenCalledWith('claims:ads', ['v1', 'v3']));
    await flushClaims();
    expect(await stored(`adsRun:${CH}`)).toMatchObject({ active: true, items: [{ videoId: 'v1', state: 'pending' }, { videoId: 'v3', state: 'pending' }] });
  });

  it('claims:collab starts a run with the typed handles, as the page checks them again', async () => {
    await start({ [`collabScan:${CH}`]: { date, total: 2, rows: [vid(1), vid(2)] } });
    await panel();
    fireEvent.click(await screen.findByRole('button', { name: /Collab/ }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Channels to invite' }), { target: { value: ' @Friend , second.one,@ไทย_ช่อง ' } });
    fireEvent.click(screen.getByRole('button', { name: 'All shown' }));
    fireEvent.click(screen.getByRole('button', { name: '🤝 Invite (2 videos)' }));
    await vi.waitFor(() => expect(toTab).toHaveBeenCalledWith('claims:collab', expect.objectContaining({ videoIds: ['v1', 'v2'] })));
    await flushClaims();
    const run = await stored<{ active: boolean; handles: string[]; items: { videoId: string }[] }>(`collabRun:${CH}`);
    expect(run).toMatchObject({ active: true, items: [{ videoId: 'v1' }, { videoId: 'v2' }] });
    expect(run.handles).toHaveLength(3); // every handle the panel made of the text passed the page's check
  });
});

describe('Auto-pilot from the switch to the next alarm', () => {
  const alarms = async () => (await browser.alarms.getAll()).map((a) => [a.name, a.scheduledTime]);
  const fire = (scheduledTime: number) => fakeBrowser.alarms.onAlarm.trigger({ name: 'ap:' + CH, scheduledTime } as never);
  const HOURS = 6 * 3600e3; // DEFAULTS.apEveryHours

  it('on → the tab starts the due cycle → an alarm at its next time → the nudge starts the next cycle; with no tab, the notice', async () => {
    const NOW = Date.UTC(2026, 9, 9);
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    setYoutubei(async () => ({ videos: [] })); // nothing claimed: the cycle is its scan only
    const nudge = vi.fn(async (type: string, data: unknown, tabId: number) => {
      if (tabId !== TAB) throw new Error('no such tab');
      return toTab(type, data);
    });
    registerAutopilotAlarms(nudge as never);
    const create = vi.spyOn(browser.notifications, 'create');
    await start({});
    await panel();

    fireEvent.click(await screen.findByRole('switch', { name: 'Auto-pilot' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    await vi.waitFor(async () => expect(await stored(`autopilot:${CH}`)).toEqual({ on: true, next: 0 }));
    expect(await alarms()).toEqual([]); // due: the tab's own tick starts it, no alarm

    // (vi.waitFor moves the faked clock on while it waits: the times are read, not computed.)
    const cycle = async (after: number) => {
      await vi.waitFor(async () => expect((await stored<{ next: number }>(`autopilot:${CH}`)).next).toBeGreaterThan(after));
      const ap = await stored<{ on: boolean; next: number; last: number }>(`autopilot:${CH}`);
      expect(ap).toEqual({ on: true, next: ap.last + HOURS, last: ap.last });
      await vi.waitFor(async () => expect(await alarms()).toEqual([['ap:' + CH, ap.next]]));
      await vi.waitFor(() => expect(C.claimsState().busyScan).toBe(false));
      await flushClaims();
      return ap.next;
    };
    await vi.waitFor(() => { C.claimsTick(); expect(C.claimsState().workerHere).toBe(true); }); // the tab's 0.8 s tick, once its lease is answered
    const next = await cycle(NOW);
    expect(nudge).not.toHaveBeenCalled();

    // The cycle's time comes with the tab hidden for hours: its lease is long stale (call 35).
    vi.setSystemTime(next);
    await fire(next);
    await vi.waitFor(() => expect(nudge).toHaveBeenCalledWith('claims:autopilot', CH, TAB));
    const later = await cycle(next);
    expect(create).not.toHaveBeenCalled();

    // The tab is closed (its lease goes with it): the next alarm reaches no one.
    await browser.storage.session.remove('claimsWorkers');
    vi.setSystemTime(later);
    await fire(later);
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith('apdue:' + CH, expect.objectContaining({ title: 'Auto-pilot is due' })));
    expect(nudge).toHaveBeenCalledTimes(1);
  });
});
