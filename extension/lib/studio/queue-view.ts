import { fixChapters, type TracklistCheck } from '../chapters';
import { getSongs } from '../claims/claims';
import { claimedSongsIn } from '../claims/core';
import { onClaimsStored, storedRef } from '../claims/store';
import type { QueueState } from '../messages';
import { chanLabel, channelProblem, getChannel, type Channel } from './channel';
import {
  currentItemId, effectiveStart, itemPublishAt, itemTracklist, itemVars, queue, queueSlots, refreshChanSched,
  scheduleOn, scheduleProblem, startIsPast, takenSlots, type QueueItem,
} from './queue-runner';
import { presetById, settings } from './state';

// What the side panel shows that only the Studio tab can work out: the drawer's
// updateItemUI() / renderAttachments() / onScheduleChange() / updateChannelUI() read
// these from the runner directly. The panel asks for a fresh copy whenever the page says
// something changed (QueueState.rev / channel) or storage did.
export interface ChannelView extends Channel { label: string; problem: string }
export const channelView = (): ChannelView => {
  const c = getChannel();
  return { ...c, label: chanLabel(c), problem: channelProblem() };
};

export type ViewItem = QueueItem & {
  at: number | null; // itemPublishAt(): the release time this item will get, or null
  timeProblem: string; // scheduleProblem(at) while the item can still change
  artists: string; // what {artists} becomes (typed on the card, or from the .txt)
  usesArtists: boolean; // the preset mentions {artists}: the card shows the Artists field
  tracklist: TracklistCheck | null; // the chapter check of the description it will get
  fixChanges: string[]; // what "Fix tracklist" would change (only offered while there are errors)
  claimed: { line: string; song: string; artists: string; times: number }[]; // claimedSongsIn(txt): songs claimed before (4010)
};

export interface ScheduleView {
  on: boolean; // the switch
  set: boolean; // scheduleOn(): switched on and a start time picked
  start: number; // effectiveStart() when set
  late: boolean; // startIsPast()
  times: number[]; // release times of the items not done, earliest first
  skipped: number; // slots skipped because the channel already has videos there
  taken: number[]; // the channel's scheduled videos (from Phase 4's youtubei)
}

export interface QueueView {
  items: ViewItem[];
  current: string | null; // the item the run is working on (Remove stays hidden on it)
  schedule: ScheduleView;
  channel: ChannelView;
  state: QueueState;
}

// claimedSongsIn() per tracklist text, kept until the song history changes: the check clones the
// whole history and builds its title index, and queue:view runs on every change the panel hears.
type Claimed = ViewItem['claimed'];
const claimedCache = new Map<string, Claimed>();
let claimedFor: unknown; // the stored history the kept checks were made against
export const forgetClaimed = () => claimedCache.clear();
// The content script calls it once the claims store is loaded; returns the undo. It frees the
// kept checks early; this tab's own song writes (a scan) have no event, so claimedIn() looks itself.
export const watchClaimedSongs = (): (() => void) => onClaimsStored('songHistory', forgetClaimed);
function claimedIn(txt: string): Claimed {
  const history = storedRef('songHistory');
  if (history !== claimedFor) forgetClaimed();
  claimedFor = history;
  let hit = claimedCache.get(txt);
  if (!hit) {
    hit = claimedSongsIn(txt, getSongs());
    claimedCache.set(txt, hit);
  }
  return hit.map((x) => ({ ...x })); // a copy: the view goes to the panel
}

export function queueView(state: QueueState): QueueView {
  const set = scheduleOn();
  if (set) void refreshChanSched(); // as onScheduleChange() did; cached 5 min, ends in ui.schedule()
  const items = queue.map((it): ViewItem => {
    const editable = it.status === 'pending' || it.status === 'error';
    const p = presetById(it.presetId);
    const at = itemPublishAt(it);
    const tracklist = it.txt ? itemTracklist(it) : null;
    return {
      ...structuredClone(it),
      at,
      timeProblem: editable ? scheduleProblem(at) : '',
      artists: itemVars(it).artists,
      usesArtists: `${p.title} ${p.description} ${(p.tags || []).join(' ')}`.includes('{artists}'),
      tracklist,
      fixChanges: tracklist && tracklist.errors.length && editable ? fixChapters(it.txt).changes : [],
      claimed: it.txt ? claimedIn(it.txt) : [],
    };
  });
  return {
    items,
    current: currentItemId(),
    schedule: {
      on: !!settings.schedule.on,
      set,
      start: set ? effectiveStart() : 0,
      late: set && startIsPast(),
      times: queue.filter((i) => i.status !== 'done').map(itemPublishAt).filter((t): t is number => !!t).sort((a, b) => a - b),
      skipped: set ? queueSlots().skipped : 0,
      taken: set ? takenSlots().map((x) => x.at) : [],
    },
    channel: channelView(),
    state,
  };
}
