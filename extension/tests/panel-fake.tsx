import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { ClaimsContext, LiveContext, PanelContext, type ClaimsApi, type LiveApi, type PanelApi } from '../entrypoints/sidepanel/panel';
import type { ClaimsState } from '../lib/claims/types';
import { toPanelData } from '../lib/panel/data';
import { PROTOCOL, type QueueState } from '../lib/messages';
import type { QueueView, ViewItem } from '../lib/studio/queue-view';

// A PanelApi / LiveApi for component tests (shared by the panel tests in 3a and 3b).
export const state = (over: Partial<QueueState> = {}): QueueState => ({
  proto: PROTOCOL, running: false, stopping: false, prog: null, rev: 1,
  channel: { id: 'UC1', name: 'Mine', avatar: '', handle: '@mine', label: 'Mine', problem: '' }, ...over,
});

export const viewWith = (items: Partial<ViewItem>[] = [], over: Partial<QueueView> = {}): QueueView => ({
  items: items.map((it, i) => ({
    id: `i${i}`, src: 'bridge', file: { name: `Clip ${i + 1}.mp4`, size: 2e8, type: 'video/mp4' }, presetId: 'trapsoul', n: i + 1,
    title: `Title ${i + 1}`, titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0,
    at: null, timeProblem: '', artists: '', usesArtists: true, tracklist: null, fixChanges: [], claimed: [], ...it,
  }) as ViewItem),
  current: null,
  schedule: { on: false, set: false, start: 0, late: false, times: [], skipped: 0, taken: [] },
  channel: state().channel,
  state: state(),
  userscript: false,
  proto: PROTOCOL,
  ...over,
});

export function fakePanel(over: Partial<PanelApi> = {}): PanelApi {
  const send = vi.fn(async () => undefined) as unknown as PanelApi['send'];
  return {
    lang: 'en',
    data: toPanelData({}),
    target: { tabId: 1, windowId: 1, url: 'https://studio.youtube.com/channel/UC1/videos', title: 'Studio' },
    link: 'ok',
    view: viewWith(),
    runner: null,
    elsewhere: false,
    busyElsewhere: !!over.elsewhere, // a queue run elsewhere holds the lock too (panel.tsx api)
    send,
    sendTo: () => send,
    write: {
      settings: vi.fn(async () => {}), counter: vi.fn(async () => {}), activeId: vi.fn(async () => {}),
      presets: vi.fn(async () => {}), presetsAndActive: vi.fn(async () => {}), channels: vi.fn(async () => {}),
    },
    refresh: vi.fn(),
    noAccess: [],
    lost: [],
    grantRev: 0,
    regrant: vi.fn(),
    accessForStart: vi.fn(async () => true),
    ...over,
  };
}

// The live state lives in its own context (useLive()), apart from usePanel().
export const fakeLive = (over: Partial<LiveApi> = {}): LiveApi => ({ state: state(), liveState: state(), ...over });

// The copyright module's state as a Studio tab sends it (claims:state), and the panel's ClaimsApi.
export const claimsStateWith = (over: Partial<ClaimsState> = {}): ClaimsState => ({
  proto: PROTOCOL, channel: 'UC1', channelName: 'Mine', ready: true, english: true, uploadBusy: false,
  status: { icon: '✓', kind: 'idle', title: 'Ready', detail: 'Click "Scan claims" to check this channel' },
  counts: { hasScan: false, scanDate: '', claims: 0, claimVideos: 0, songs: 0, hasAdsScan: false, adsTodo: 0 },
  busyRun: false, busyScan: false, waiting: 0, workerHere: true, ...over,
});
// `live` is the bound tab's state unless another tab runs copyright work (panel.tsx `holder ?? state`).
export function fakeClaims(over: Partial<ClaimsApi> = {}): ClaimsApi {
  const state = over.state !== undefined ? over.state : claimsStateWith();
  return { state, live: state, log: [], shown: null, addLog: vi.fn(), ...over };
}

export const renderPanel = (ui: ReactElement, api: PanelApi = fakePanel(), live: LiveApi = fakeLive(), claims: ClaimsApi = fakeClaims()) =>
  render(
    <PanelContext.Provider value={api}>
      <LiveContext.Provider value={live}>
        <ClaimsContext.Provider value={claims}>
          <AskProvider>{ui}</AskProvider>
        </ClaimsContext.Provider>
      </LiveContext.Provider>
    </PanelContext.Provider>,
  );
