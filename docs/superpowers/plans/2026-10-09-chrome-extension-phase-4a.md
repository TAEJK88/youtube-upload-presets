# Chrome Extension — Phase 4a (Copyright: foundations, carried-over fixes, youtubei, scan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Phase 3b (`docs/superpowers/plans/2026-10-09-chrome-extension-phase-3b.md`) and its fix rounds are complete on `extension-phase-2` (HEAD `fa4e4ca` or later): the Upload tab, `store:patch`, the runner lock, `QueueView` / `queue:*`, the debug page and the theme toggle.

**Goal:** Lay the ground the copyright module stands on — per-channel storage keys, one background writer for the copyright data, one automation lock shared by every job that drives Studio, Studio's internal API (`/youtubei/v1`) through the MAIN world — fix the four items Phase 3 left for this phase (two-window card edits, the start summary vs. settings changed elsewhere, the blocked-file error, the bfcache overlap), feed the channel's scheduled videos to the queue's scheduler, port the claim / ads / Collab scans, the copyright status and its activity log, and build the read side of the **Copyright** tab: status, scan, the claim list (with picking), the claimed-songs history and the tracklist fix.

**Architecture:** The userscript's `Claims` IIFE (user.js 4592–6357) becomes page code in `lib/claims/claims.ts` (its closure variables become module variables, port-checked like `lib/studio/queue-runner.ts`), pure helpers in `lib/claims/core.ts` and `lib/claims/songs.ts` (importable by the side panel), and Studio's API calls in the MAIN world (`lib/main-youtubei.ts`). Copyright data stays under the userscript's keys (`claimScan:<channelId>`, … and the global `cfg`, `songHistory`, `collabHandles`, `logOpen`). The Studio tab reads them through a prefix-aware `SyncStore`; every write — from a Studio tab or the panel — is a `claims:op` to the background, which applies the ops one at a time in the same queue as `store:patch`, while the tab applies the same op to its own copy at once. The Studio tab broadcasts a `ClaimsState` (the userscript's status card) and log lines; the panel shows them like it shows the queue's live state, and reads the copyright data from storage itself.

**Tech Stack:** as Phase 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` — "Messaging" (Phase 4 adds `claims:*`), "Background" (Autopilot), "Error handling" (MAIN world not answering), rollout row 4. The second half of Phase 4 is `docs/superpowers/plans/2026-10-09-chrome-extension-phase-4b.md` (trim, follow-ups, ads and Collab runs, autopilot on alarms, the rest of the Copyright tab, the Phase 4 exit checklist).

## Global Constraints

Identical to Phase 3a / 3b's **Global Constraints** (exact versions, nothing outside `extension/` except these plans and the spec amendment in 4b, no edits to `youtube-upload-presets.user.js` / root `test/` / ported regions except through their port configs, `L()` pairs from the userscript or listed in `scripts/strings/extension-only.mjs` with a `why`, 12px floor, exact manifest permissions `sidePanel, storage, unlimitedStorage, alarms, notifications` and hosts `https://studio.youtube.com/*, https://www.youtube.com/*, https://api.github.com/*`, strict TS with `noUncheckedIndexedAccess`, component tests in happy-dom with `cleanup()`, commands from `extension/`, commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, never stage `.claude/`, `extension/.claude/`, `extension/.vitest/`, `test/.claude/` or `.superpowers/`). Decisions D1–D18 of Phase 3 apply. Also:

- **Pin.** Ported code is checked against the userscript at `d15ef87caaddb7a6d3187d2851b83a484c4bb9e7` (v4.27.1, `scripts/port-check.mjs` `PIN`). The working-tree userscript is byte-identical to it; every line number in this plan is a line of that file. `node scripts/port-check.mjs --print <name> [A-B]` prints the code a port starts from.
- `npm run check` (tsc + vitest + port-check + `ui-check --coverage`) and `npm run build` pass after every task. Root `node --test test/*.test.mjs` stays 163/0.
- The panel never imports `lib/studio/state`, `lib/studio/queue-runner`, `lib/claims/claims` or `lib/claims/store` (Task 7 adds the last two to `tests/panel-imports.test.ts`).
- New contexts or entrypoints install debug capture first (`lib/debug-capture/`). This plan adds none (the MAIN-world script has no extension APIs; README already says its errors aren't captured).
- Manual Chrome checks for all of Phase 4 run once, at the end of 4b (README checklist). 4a ends with automated checks and a build.
- Light and dark themes: colours from tokens only (`text-fg3`, `bg-tint/5`, `text-warn`, `text-ok`, `text-err`, …), never literal colours.

| # | Topic | Decision |
|---|---|---|
| D19 | Copyright storage | The userscript's keys, unchanged: per channel `<name>:<channelId>` for `claimScan adsScan adsResults adsRun collabScan collabResults collabRun collabLinks trimQueue trimResults trimRun followUp autopilot`; global `cfg songHistory collabHandles logOpen`. `tabLock:<ch>` moves to `storage.session` (D21's worker lease). Only `cfg` is in a settings backup (as the userscript's `claimsCfg`). |
| D20 | One writer | Every write to those keys is a `claims:op` to the background: `set` (whole value), `merge` (object entries), `list` (add / remove strings), `runItem` (one run item's state), `songs` (record / trimmed / import / delete / clear). The background applies ops one at a time in the `store:patch` queue (`lib/store-writer.ts serial`), reading the stored value first, so a tab and the panel never undo each other. A Studio tab applies the same op to its cached copy at once (`SyncStore.expect`) and re-reads the key once the background is done. |
| D21 | One automation lock | `storage.session` keeps `runnerTabId` and, new, `runnerJobs: ('queue' \| 'claims')[]`. A tab takes it for `'queue'` (a run) or `'claims'` (a trim / ads / Collab run that changes pages); another tab can take it for nothing until the holder lets every job go. Scans are read-only API calls and take no lock (the userscript let a scan overlap an upload). A tab keeps its `'claims'` job across its own reloads (a trim run changes pages); the background still frees the lock when the tab closes or leaves Studio. **Plus one worker per channel**, the userscript's tab lease (`tabLock:<ch>`, 5043–5062): `storage.session` `claimsWorkers: { [channelId]: tabId }`, held by the first live Studio tab on that channel that asks, renewed every 5 s, freed when the tab closes, leaves Studio or moves to another channel; `force` (a run started from that tab) takes it, as the userscript's `isWorker(true)` did. Only the channel's worker runs Auto-pilot cycles, follow-up checks and run steps, so each channel's copyright data has one page writer. The automation lock is a second, separate gate in front of page changes only. |
| D22 | youtubei | The MAIN world answers `youtubei(path, body)` for the four endpoints the module uses (an allowlist), building the auth header there (it needs `document.cookie` and ytcfg). The content script calls it through its own `rpcClient` with a 30 s timeout (the userscript's `fetch` had none; `getCfg` keeps 10 s); a timeout fails that call like any API error (the scan skips the video or fails). |
| D23 | Copyright UI | The userscript's "ลิขสิทธิ์" pane becomes the Copyright tab. Its modals (claim list, songs, tracklist fix, ads, Collab, settings) become sub-views of the tab with the modal's title and a Close button; confirmations (start trim, Auto-pilot on) use `ask()`. The claim and song tables render one card per row (the panel is ~320–500px wide); the columns become lines of the card, same text. |
| D24 | Status and log | The Studio tab computes the status card (`computeStatus()`, ported) and broadcasts `claims:state` when it changes; the panel shows the bound tab's state, and the lock holder's while it runs a copyright job (the same routing as `queue:state`). Log lines are broadcast as `claims:log`; the panel keeps the last 80 in memory (the userscript's log was per page and lost at every page change of a trim run). |

## Review Focus

- **Storage that changes channel under the page.** A per-channel key the Studio tab never saw at startup (a channel opened later, a key first written by the panel) must still read and follow live — the prefix-aware store reads keys by prefix, not from a fixed list (Task 2 test: "a prefixed key written after start shows up").
- **Studio not loaded yet.** A scan clicked before Studio has its `INNERTUBE_CONTEXT` must log "Studio hasn't finished loading — try again in a few seconds" and change nothing (Task 6 test).
- **MAIN world silent.** A youtubei call that never answers must end the scan with "Scan failed: …timed out…" in the log, reset `scanning`, and leave the stored scan as it was (Task 6 test).
- **Untrusted writes.** `claims:op` from a www.youtube.com tab, or naming a key outside the copyright keys (`settings`, `presets`, `claimScan:../x`), or merging `__proto__`, is refused by the background (Task 3 test).
- **Extension reloaded mid-scan.** The orphaned page's scan must not throw unhandled rejections forever or leave the panel showing "Scanning…": its writes fail quietly (logged once each) and its last broadcast is replaced when the panel rebinds (Task 6 test: writes after `disposeClaimsStore()` don't throw).

---

## File Structure

```
extension/
  lib/
    sync-store.ts                MOD  key prefixes; expect(key, value, done) for writes made by someone else
    store-writer.ts              MOD  claimsOpInOrder (same serial queue); mayWrite('claims:op')
    runner-lock.ts               MOD  jobs ('queue' | 'claims'): acquire / release / elsewhere / holds per job
    main-ops.ts                  MOD  MainOps.youtubei, YTI_PATHS, NO_SAPISID
    main-youtubei.ts             NEW  authHeader + yti (port), the allowlisted youtubei() the MAIN world serves
    messages.ts                  MOD  claims:op / claims:view / claims:scan / claims:state / claims:log / claims:show; runner:* take a job
    claims/
      keys.ts                    NEW  the copyright keys, per channel and global; isClaimsKey; channelKeys
      types.ts                   NEW  stored shapes (ClaimScan, Run, …), ClaimsCfg, ClaimsStatus, ClaimsState, ClaimsLogLine
      core.ts                    NEW  pure helpers (port): DEFAULTS, fmt, short, privacyOf, claimInfo, songNorm, parseCSV, titleKey, claimedSongsIn; CSV builders
      songs.ts                   NEW  song-history reducers (port): recordSongs, markSongTrimmed, importSongs
      ops.ts                     NEW  ClaimsOp, applyOp, isClaimsOp
      store.ts                   NEW  the Studio tab's copy of the copyright keys; write(op)
      youtubei.ts                NEW  yti() in the Studio tab (through the MAIN world)
      claims.ts                  NEW  the ported Claims runtime (grows in 4b): channel, keys, counts, scans, status, log
      page.ts                    NEW  ClaimsUi for the Studio content script: broadcast state / log / show
    studio/
      queue-merge.ts             NEW  per-item merge of two queue copies (3b M3)
      queue-store.ts             MOD  merge a foreign save while ours waits
      queue-runner.ts            MOD  (outside ports) startSig / StartSummary.sig / StartBinding.sig; abortRun; lock jobs
      queue-files.ts             MOD  a blocked ('denied') file has its own sentence
      queue-sync.ts              MOD  lock calls name their job; bfcache restore that lost the lock aborts at once
      queue-view.ts              MOD  ViewItem.claimed (tracklist songs previously claimed)
      content-ui.ts              MOD  an aborted run stops at its next status change
      channel.ts                 MOD  refreshCfg copies INNERTUBE_CONTEXT too; cachedCfg()
      fab.ts                     MOD  the activity badge includes the copyright status
    panel/
      start.ts                   MOD  queue:start carries the summary's sig
      target.ts                  MOD  RunnerTab.jobs
      bus.ts                     MOD  claims:state / claims:log / claims:show subscribers
      claims-data.ts             NEW  the copyright keys of one channel, read and followed; claimsWrite
      claims.ts                  NEW  claim-list picks, song list filter / sort, tracklist-fix picker
      download.ts                NEW  downloadCsv (the userscript's downloadCSV, in the panel)
  entrypoints/
    background.ts                MOD  claims:op; runner:* jobs
    studio-main.content.ts       MOD  serves youtubei
    studio.content.ts            MOD  claims store, youtubei, Claims hooks, claims:* handlers, lock jobs, abort
    sidepanel/
      panel.tsx                  MOD  ClaimsContext (state, live state, log, show); busyElsewhere
      App.tsx                    MOD  (none in 4a beyond CopyrightTab import staying)
      shell/ActivityBar.tsx      MOD  the copyright status
      shell/Banners.tsx          MOD  "another tab is busy with copyright work"
      tabs/QueueFooter.tsx       MOD  Start disabled while another tab holds the lock for anything
      tabs/QueueCard.tsx         MOD  the "previously claimed" chip
      tabs/CopyrightTab.tsx      MOD  the tab: home, sub-views
      tabs/copyright/StatusCard.tsx  ActivityLog.tsx  SubView.tsx  ClaimList.tsx  Songs.tsx  TracklistFix.tsx   NEW
  scripts/
    port/main-youtubei.mjs claims-core.mjs claims-songs.mjs claims.mjs                                         NEW
    strings/extension-only.mjs   MOD  4a's new pairs; the placeholder pair goes
    strings/dropped.mjs          MOD  the three "previously claimed" pairs are used again
  README.md                      MOD  limitations closed; copyright data on moving from the userscript
  tests/
    queue-merge.test.ts claims-keys-ops.test.ts claims-core.test.ts claims-songs.test.ts claims-store.test.ts
    panel-claims-data.test.ts claims-youtubei.test.ts claims-scan.test.ts claims-status.test.ts claims-page.test.ts
    panel-claims.test.ts panel-copyright.test.tsx                                                               NEW
    sync-store.test.ts store-writer.test.ts runner-lock.test.ts queue-sync.test.ts queue-store.test.ts
    queue-run-flow.test.ts queue-edit.test.ts queue-view.test.ts channel.test.ts panel-start.test.ts
    panel-queue.test.tsx panel-i18n.test.tsx panel-target.test.ts panel-shell.test.tsx panel-imports.test.ts
    panel-fake.tsx fab.test.ts                                                                                  MOD
```

Userscript line map (pinned commit), the `Claims` IIFE: `DEFAULTS` 4593–4604 · `cfg` / `saveCfg` 4605–4606 · DOM helpers 4608–4614 · `studioIsEnglish` 4617 · `W` / `ycfg` 4621–4622 · `currentChannel` / `channelName` / `chGet` / `chSet` 4623–4629 · counts 4633–4653 · `authHeader` 4655–4661 · `yti` 4663–4683 · `fmt` / `short` / `privacyOf` 4685–4691 · `claimInfo` 4694–4707 · `listVideos` 4710–4731 · `listScheduled` 4736–4759 · `scanClaims` 4761–4837 · `claimsCSV` 4839–4848 · modal 4851–4858 · `showClaims` 4860–4936 · `fixTracklist` 4939–4978 (already `lib/tracklist.ts`) · `showTracklistFix` 4980–5040 · tab lease 5043–5062 · songs 5065–5114 · `parseCSV` / `importSongsCSV` 5117–5164 · `titleKey` / `claimedSongsIn` 5167–5187 · `showSongs` 5190–5251 · ads 5254–5453 · Collab run 5458–5647 · trim 5650–5739 · follow-ups 5742–5820 · Auto-pilot 5823–5904 · confirm 5907–5971 · `trimStep` … `trimOne` 5973–6104 · status 6107–6170 · log 6173–6180 · pane 6182–6256 · settings 6259–6307 · tick 6310–6354. Outside the IIFE: `uploadOf` / `uploadsCSV` / `downloadCSV` 2070–2092 (already in `queue-runner.ts`), chanSched 1893–1916 (already), `Claims.claimedSongsIn` chip 4010–4016, `Claims.status` in `activity()` 4089–4096.

### Where every function and setting goes

| Userscript (lines) | Extension | Plan |
|---|---|---|
| `DEFAULTS` 4593–4604, `fmt` `short` `privacyOf` 4685–4691, `claimInfo` 4694–4707, `songNorm` 5065, `parseCSV` 5117–5136, `titleKey` `claimedSongsIn` 5167–5187 | `lib/claims/core.ts` (port `claims-core`) | 4a T3 |
| `recordSongs` 5069–5091, `markSongTrimmed` 5093–5103, `importSongsCSV` 5137–5164 | `lib/claims/songs.ts` reducers (port `claims-songs`), run by the background (`songs` op); the panel shows the toasts | 4a T3, T8 |
| `claimsCSV` 4839–4848, `songsCSV` 5105–5114, `uploadsCSV` 2078–2083, `downloadCSV` 2084–2092 | `csvText`, `claimsCsvRows`, `songsCsvRows`, `uploadsCsvRows` (`core.ts`) + `downloadCsv` (`lib/panel/download.ts`), in the panel | 4a T3, T7, T8 |
| `authHeader` 4655–4661, `yti` 4663–4683 | `lib/main-youtubei.ts` (port `main-youtubei`, MAIN world); `yti()` in the tab is `lib/claims/youtubei.ts` | 4a T5 |
| `W` / `ycfg` 4621–4622 | `cachedCfg()` (`lib/studio/channel.ts`, copied by `refreshCfg`) | 4a T5 |
| `cfg` `saveCfg` 4605–4606, `studioIsEnglish` 4617, `currentChannel` … `chSet` 4623–4629, counts 4633–4653, `listVideos` `listScheduled` `scanClaims` 4710–4837, `getSongs` 5066, ads / Collab scan state and `scanAds` `scanCollab` 5254–5287, 5458–5484, run / follow-up / Auto-pilot getters 5654–5655, 5742–5743, 5770–5773, 5823–5824, 5846, status 6107–6170, `log` 6174–6180 | `lib/claims/claims.ts` (port `claims`) | 4a T5, T6 |
| visible / findText / isDisabled 4608–4614, ads run 5337–5453, Collab run 5548–5647, trim 5650–5739, follow-ups 5742–5820, Auto-pilot 5823–5873, confirm + trim steps 5907–6104, tick 6310–6354 | `lib/claims/claims.ts` (port `claims`, grown) | 4b T1 |
| tab lease `TAB_ID` / `isWorker` 5043–5062 | the per-channel worker lease in the background (`claimWorker`, D21) plus the runner lock with jobs; `isWorker()` re-implemented outside the port | 4a T4, 4b T1 |
| `setSongs` 5067, `refreshClaimWarnings` 5188 | `songs` ops; the queue view is fetched again when `songHistory` changes | 4a T3, T8 |
| `openModal` / `closeModal` 4851–4858 | sub-views of the Copyright tab (`SubView.tsx`) | 4a T7 |
| `showClaims` 4860–4936 | `ClaimList.tsx` (+ `lib/panel/claims.ts`) | 4a T8 (trim button 4b T3) |
| `showTracklistFix` 4980–5040 | `TracklistFix.tsx` | 4a T8 |
| `showSongs` 5190–5251 | `Songs.tsx` | 4a T8 |
| `showAds` 5289–5334, `showCollab` 5486–5546 | `AdsView.tsx`, `CollabView.tsx` | 4b T4 |
| `openTrimConfirm` 5672–5696, `toggleAutopilot` 5875–5904 | `ask()` in `ClaimList.tsx` / `AutopilotSwitch.tsx`; the page keeps the data part (`trimFromPanel`) | 4b T1, T3 |
| `buildPane` 6182–6216, `renderStatus` 6218–6256 | `CopyrightTab.tsx` home, `StatusCard.tsx`, `ActivityLog.tsx`; `claimsState()` in the page | 4a T6, T7 |
| `SETTINGS` / `openSettings` 6259–6307 | `CopyrightSettings.tsx` (writes `cfg` with a `merge` op) | 4b T5 |
| tick's Auto-pilot timing 6328 | the page as before, plus `chrome.alarms` in the background to wake it (D25 in 4b) | 4b T1, T2 |
| `Claims.claimedSongsIn` chip 4010–4016 | `ViewItem.claimed` (`queue-view.ts`) + `QueueCard.tsx` | 4a T8 |
| `Claims.status()` in `activity()` 4089–4096 | `ActivityBar.tsx` (live state) and `fabModel()` (page) | 4a T6 |
| `Claims.listScheduled` → `refreshChanSched` 1899–1916 | `wireClaims()` (`lib/claims/wiring.ts`, called by `studio.content.ts`): `setClaims({ listScheduled })` | 4a T5 |

---

### Task 1: Queue fixes carried from Phase 3 (M3, M11, R2-m2)

Three small fixes the Phase 3b reviews deferred here. **M3:** two idle tabs (two windows' panels) each save their whole queue 300 ms after an edit, and a foreign save landing while ours waits replaces our copy — one edit is lost. **M11:** the start binding notices queue edits but not a settings or preset change made in another window between the summary and the confirm. **R2-m2:** a file whose read permission the user blocked ('denied') fails with advice to click Re-grant, which can't unblock it.

**Files:**
- Create: `extension/lib/studio/queue-merge.ts`, `extension/tests/queue-merge.test.ts`
- Modify: `extension/lib/studio/queue-store.ts`, `extension/lib/studio/queue-runner.ts` (outside the `@port` blocks only), `extension/lib/panel/start.ts`, `extension/lib/studio/queue-files.ts`, `extension/scripts/strings/extension-only.mjs`, `extension/README.md`
- Test: `extension/tests/queue-store.test.ts`, `extension/tests/queue-run-flow.test.ts`, `extension/tests/queue-edit.test.ts`, `extension/tests/panel-start.test.ts`, `extension/tests/panel-queue.test.tsx`, `extension/tests/panel-i18n.test.tsx`, `extension/tests/queue-files.test.ts`

**Interfaces:**
- Consumes: `QueueItem`, `queue`, `presetById`, `settings`, `persistQueue` / `flushQueue` / `restoreQueue` / `followOtherTab`.
- Produces: `mergeQueue(base: QueueItem[], local: QueueItem[], foreign: QueueItem[]): QueueItem[]`; `startSig(): string`; `StartSummary.sig: string`; `StartBinding.sig: string`.

- [ ] **Step 1: Write the failing merge tests**

`extension/tests/queue-merge.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mergeQueue } from '../lib/studio/queue-merge';
import type { QueueItem } from '../lib/studio/queue-runner';

const it_ = (id: string, title = id): QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title,
  titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0,
});
const ids = (l: QueueItem[]) => l.map((i) => i.id);

describe('mergeQueue (two windows editing within 300 ms, 3b M3)', () => {
  const base = [it_('a'), it_('b'), it_('c')];

  it('keeps both edits when each side changed a different item', () => {
    const local = [it_('a', 'mine'), it_('b'), it_('c')];
    const foreign = [it_('a'), it_('b', 'theirs'), it_('c')];
    expect(mergeQueue(base, local, foreign).map((i) => i.title)).toEqual(['mine', 'theirs', 'c']);
  });

  it('this side wins an item both sides changed (its save lands last)', () => {
    expect(mergeQueue(base, [it_('a', 'mine'), it_('b'), it_('c')], [it_('a', 'theirs'), it_('b'), it_('c')])[0]!.title).toBe('mine');
  });

  it('keeps items added on either side, ours after theirs', () => {
    expect(ids(mergeQueue(base, [...base, it_('L')], [...base, it_('F')]))).toEqual(['a', 'b', 'c', 'F', 'L']);
  });

  it('an item removed on either side stays removed', () => {
    expect(ids(mergeQueue(base, [it_('a'), it_('c')], base))).toEqual(['a', 'c']);
    expect(ids(mergeQueue(base, base, [it_('b'), it_('c')]))).toEqual(['b', 'c']);
  });

  it("keeps this side's order when it moved items, the foreign order otherwise", () => {
    expect(ids(mergeQueue(base, [it_('c'), it_('a'), it_('b')], [...base, it_('F')]))).toEqual(['c', 'a', 'b', 'F']);
    expect(ids(mergeQueue(base, [it_('a', 'x'), it_('b'), it_('c')], [it_('b'), it_('a'), it_('c')]))).toEqual(['b', 'a', 'c']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/queue-merge.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/studio/queue-merge"`.

- [ ] **Step 3: Write `queue-merge.ts`**

```ts
import type { QueueItem } from './queue-runner';

// Two idle Studio tabs (two windows' panels) each save their whole queue 300 ms after an edit.
// A foreign save that lands while ours still waits would replace our copy and lose our edit
// (3b review M3). Instead the two copies are merged per item against `base`, the list this tab
// last read from or wrote to storage:
//  - an item this tab changed or added since `base` keeps this tab's version (its save lands last);
//  - an item it didn't touch takes the foreign version;
//  - an item either side removed stays removed;
//  - the order is this tab's when it moved items, otherwise the foreign one, new items after it.
export function mergeQueue(base: QueueItem[], local: QueueItem[], foreign: QueueItem[]): QueueItem[] {
  const before = new Map(base.map((it) => [it.id, JSON.stringify(it)]));
  const mine = new Map(local.map((it) => [it.id, it]));
  const theirs = new Map(foreign.map((it) => [it.id, it]));
  // In both copies, or new on one side; an item of `base` that one side dropped is gone.
  const kept = (id: string) => (mine.has(id) && theirs.has(id)) || !before.has(id);
  const version = (id: string): QueueItem => {
    const l = mine.get(id);
    const f = theirs.get(id);
    if (!l) return f!;
    if (!f) return l;
    return before.get(id) !== JSON.stringify(l) ? l : f;
  };
  const both = (list: QueueItem[]) => list.map((it) => it.id).filter((id) => before.has(id) && mine.has(id));
  const moved = both(local).join('\n') !== both(base).join('\n');
  const order = (moved ? [...local, ...foreign] : [...foreign, ...local]).map((it) => it.id);
  return order.filter((id, i) => order.indexOf(id) === i && kept(id)).map(version);
}
```

- [ ] **Step 4: Run the merge tests**

Run: `npx vitest run tests/queue-merge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing store test**

Add to `extension/tests/queue-store.test.ts` (inside `describe('queue store', …)`):
```ts
  it('a save from another window while ours waits keeps both edits (3b M3)', async () => {
    vi.useFakeTimers();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending'), item('B.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue[0] = { ...queue[0]!, title: 'mine' }; // this window's edit, saved 300 ms later
    persistQueue();
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending'), item('B.mp4', 'pending', { title: 'theirs' })] });
    await vi.advanceTimersByTimeAsync(0); // the other window's save arrives
    expect(queue.map((i) => i.title)).toEqual(['mine', 'theirs']);
    await vi.advanceTimersByTimeAsync(300);
    await flushState();
    expect(((await browser.storage.local.get('queue')).queue as QueueItem[]).map((i) => i.title)).toEqual(['mine', 'theirs']);
  });

  it('with no save of ours waiting, a foreign save replaces the copy as before', async () => {
    await browser.storage.local.set({ queue: [item('A.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    await browser.storage.local.set({ queue: [item('B.mp4', 'pending')] });
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.map((i) => i.file.name)).toEqual(['B.mp4']);
  });
```
Run: `npx vitest run tests/queue-store.test.ts`
Expected: the first new test FAILS (`['A.mp4'…]` titles `['', 'theirs']` — our edit lost).

- [ ] **Step 6: Merge in `queue-store.ts`**

Add the import and a `base` copy; keep every other line as it is:
```ts
import { mergeQueue } from './queue-merge';
```
```ts
// What this tab last read from or wrote to storage: the base the merge compares both copies to.
let base: QueueItem[] = [];
const remember = (list: QueueItem[]) => { base = structuredClone(list); };
```
In `flushQueue()`:
```ts
  if (!blocked()) {
    save(KEY, queue);
    remember(queue);
  }
```
In `restoreQueue()`, after the splice:
```ts
  remember(items);
  // Written back at once, so the side panel (which reads storage) shows the error too.
  if (items.some(cut)) {
    save(KEY, queue);
    remember(queue);
  }
  // Another tab (or the side panel) changed the queue. The tab that is running keeps its own
  // copy: it is the one moving items along. While a save of ours waits, the two copies are
  // merged per item (3b M3); otherwise the stored copy replaces ours.
  onStored(KEY, (v) => {
    if (running) return;
    const foreign = (v as QueueItem[] | undefined) ?? [];
    const next = timer !== undefined ? mergeQueue(base, queue, foreign) : foreign;
    queue.splice(0, queue.length, ...next);
    remember(foreign);
  });
```
In `followOtherTab()`, after `if (stored.some(unfinished)) save(KEY, queue);` change it to:
```ts
  remember(stored);
  if (stored.some(unfinished)) {
    save(KEY, queue);
    remember(queue);
  }
```

Run: `npx vitest run tests/queue-store.test.ts tests/queue-sync.test.ts tests/queue-edit.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing start-binding tests (M11)**

In `extension/tests/queue-run-flow.test.ts`, change the `binding` helper to carry the signature and add a test next to the existing binding tests:
```ts
  const binding = (asked: boolean) => ({ channelId: 'UCabcdefghijklmn', ids: Q.queue.map((i) => i.id), editRev: Q.getEditRev(), sig: Q.startSig(), asked });
```
and, in `describe('queue:start from the panel', …)`:
```ts
  it('refuses when settings or presets changed in another window after the summary (3b M11)', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    const ui = createContentUi();
    setPageUi(ui);
    setBridge({ getFile: async (id: string) => new File(['x'], id) });
    const b = binding(true);
    const was = settings.thumb;
    settings.thumb = !was; // the other window's panel changed a setting the summary showed
    try {
      await startFromPanel(ui, b);
    } finally {
      settings.thumb = was;
    }
    expect(send).toHaveBeenCalledWith('queue:toast', 'Settings or presets changed after you confirmed — click Start again to see the new summary');
    expect(Q.queue[0]!.status).toBe('pending');
  });
```

In `extension/tests/panel-start.test.ts`, add `sig: 's1'` to the summary fixture and expect it back:
```ts
    expect(d.start).toHaveBeenCalledWith({ channelId: 'UC1', ids: ['a', 'b'], editRev: 4, sig: 's1', asked: true });
```
(and the same `sig: 's1'` in the `quiet.start` expectation). In `tests/panel-queue.test.tsx` add `sig: 's'` to the three `StartSummary` fixtures (lines ~587, 603, 626) and to the `toHaveBeenCalledWith('queue:start', …)` expectation (`sig: 's'`); in `tests/panel-i18n.test.tsx` add `sig: 's'` to its `StartSummary` fixture (~line 165); in `tests/queue-edit.test.ts` (~line 174) build the binding with `sig: s.sig`.

Run: `npx vitest run tests/queue-run-flow.test.ts tests/panel-start.test.ts`
Expected: FAIL — `Q.startSig is not a function`, and `sig` missing from the call.

- [ ] **Step 8: Add the signature (outside the port blocks of `queue-runner.ts`)**

Next to `bindingProblem`:
```ts
// What the summary showed that settings and presets decide, apart from the queue itself: the
// schedule, thumbnails on/off and the pending items' presets' visibility. A change made in
// another window between the summary and the confirm refuses the start (3b review M11).
export function startSig(): string {
  const pending = queue.filter((i) => i.status === 'pending');
  return JSON.stringify([
    settings.schedule,
    settings.thumb,
    pending.map((i) => presetById(i.presetId).visibility || 'PRIVATE'),
  ]);
}
```
Add `sig: string` to `StartBinding` (after `editRev`) and to `StartSummary` (after `editRev`, comment `// startSig() when the summary was made; queue:start sends it back`). In `isStartBinding` add `&& typeof b.sig === 'string'`. In `bindingProblem`, after the `editRev` check:
```ts
  if (seen.sig !== startSig()) return L('การตั้งค่าหรือพรีเซ็ตเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', 'Settings or presets changed after you confirmed — click Start again to see the new summary');
```
In `startSummary()`'s returned object add `sig: startSig(),` after `editRev,`. In `lib/panel/start.ts`:
```ts
    await d.start({ channelId: s.channel.id, ids: s.ids, editRev: s.editRev, sig: s.sig, asked: s.needsConfirm });
```

- [ ] **Step 9: The blocked-file sentence (R2-m2)**

Add to `extension/tests/queue-files.test.ts`:
```ts
  it('a blocked file says to add it again, not to re-grant (R2-m2)', async () => {
    setBridge({ getFile: async () => { throw new Error('denied'); } });
    await expect(getQueueFile('x', 'bridge')).rejects.toThrow('The browser blocked reading this file — remove it from the queue and add it again');
  });
```
In `lib/studio/queue-files.ts` `reason()`:
```ts
  if (code === 'permission') return L('ยังไม่ได้อนุญาตให้อ่านไฟล์ — กด "อนุญาตอีกครั้ง" ในแผงด้านข้าง', 'No permission to read this file — click "Re-grant access" in the side panel');
  // Assumed until README item 16 is recorded: Re-grant can't lift a block in the same browser
  // session (requestPermission() answers 'denied' without asking; 3b review R2-m2).
  if (code === 'denied') return L('เบราว์เซอร์บล็อกการอ่านไฟล์นี้ — ลบออกจากคิวแล้วเพิ่มไฟล์อีกครั้ง', 'The browser blocked reading this file — remove it from the queue and add it again');
```

- [ ] **Step 10: Register the two pairs**

Append to `extension/scripts/strings/extension-only.mjs`:
```js
  // Phase 4a
  { th: 'การตั้งค่าหรือพรีเซ็ตเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', en: 'Settings or presets changed after you confirmed — click Start again to see the new summary', why: 'the panel confirms the start; a settings / preset change from another window between summary and confirm refuses it (3b M11)' },
  { th: 'เบราว์เซอร์บล็อกการอ่านไฟล์นี้ — ลบออกจากคิวแล้วเพิ่มไฟล์อีกครั้ง', en: 'The browser blocked reading this file — remove it from the queue and add it again', why: "files come through the side panel's file handles; a blocked one can't be re-granted (3b R2-m2)" },
```

- [ ] **Step 11: README**

In `extension/README.md`, item 39: delete the bullet that starts `**Known limitation (Phase 4), don't count as a failure:**` (two windows within 300 ms). Item 16: replace "(if not, the error's advice to click Re-grant is wrong for blocked files; Phase 4 gives them their own sentence)" with "The blocked file's error reads "The browser blocked reading this file — remove it from the queue and add it again"."

- [ ] **Step 12: Verify and commit**

Run: `npm run check && npm run build`
Expected: all pass (`ui-check: ok`, port-check all `ok`).
```bash
git add extension/lib/studio/queue-merge.ts extension/lib/studio/queue-store.ts extension/lib/studio/queue-runner.ts extension/lib/panel/start.ts extension/lib/studio/queue-files.ts extension/scripts/strings/extension-only.mjs extension/README.md extension/tests/queue-merge.test.ts extension/tests/queue-store.test.ts extension/tests/queue-run-flow.test.ts extension/tests/queue-edit.test.ts extension/tests/panel-start.test.ts extension/tests/panel-queue.test.tsx extension/tests/panel-i18n.test.tsx extension/tests/queue-files.test.ts
git commit -m "Queue: two windows' edits merge per item; the start notices settings changed elsewhere; a blocked file has its own error

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A prefix-aware `SyncStore`, and writes made by someone else

The copyright keys are per channel (`claimScan:UC…`), so a fixed key list can't name them; and their writes go through the background (D20), so the Studio tab needs to show its own write at once while the background makes it.

**Files:**
- Modify: `extension/lib/sync-store.ts`
- Test: `extension/tests/sync-store.test.ts`

**Interfaces:**
- Produces: `createSyncStore(keyList: string[], prefixes?: string[]): Promise<SyncStore>`; `SyncStore.expect(key: string, value: unknown, done: Promise<unknown>): void`; `createMemoryStore` gets `expect` (sets the value).

- [ ] **Step 1: Write the failing tests**

Append to `extension/tests/sync-store.test.ts`:
```ts
describe('key prefixes', () => {
  it('reads every stored key under a prefix, and nothing else', async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { rows: [] }, 'trimRun:UC1': null, other: 1 });
    const kv = await createSyncStore(['cfg'], ['claimScan:']);
    expect(kv.get('claimScan:UC1')).toEqual({ rows: [] });
    expect(kv.get('claimScan:UC2', 'none')).toBe('none'); // known (prefix), not stored
    expect(() => kv.get('trimRun:UC1')).toThrow('unknown key');
    expect(() => kv.get('other')).toThrow('unknown key');
  });

  it('a prefixed key written after start shows up', async () => {
    const kv = await createSyncStore([], ['claimScan:']);
    const seen = vi.fn();
    kv.onChange('claimScan:UC9', seen);
    external({ 'claimScan:UC9': { date: 'd' } });
    expect(kv.get('claimScan:UC9')).toEqual({ date: 'd' });
    expect(seen).toHaveBeenCalledWith({ date: 'd' });
  });
});

describe('expect(): a write someone else makes for us', () => {
  it('shows the value at once and keeps it through an older echo', async () => {
    await browser.storage.local.set({ cfg: { a: 0 } });
    const kv = await createSyncStore(['cfg']);
    let finish!: () => void;
    const done = new Promise<void>((r) => { finish = r; });
    kv.expect('cfg', { a: 1 }, done);
    expect(kv.get('cfg')).toEqual({ a: 1 });
    external({ cfg: { a: 0 } }); // an event from before our write
    expect(kv.get('cfg')).toEqual({ a: 1 });
    await browser.storage.local.set({ cfg: { a: 1, b: 2 } }); // the writer merged with something else
    finish();
    await kv.flush();
    expect(kv.get('cfg')).toEqual({ a: 1, b: 2 }); // read again once the writer is done
  });

  it('a failed write is reconciled with storage', async () => {
    await browser.storage.local.set({ cfg: { a: 0 } });
    const kv = await createSyncStore(['cfg']);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    kv.expect('cfg', { a: 1 }, Promise.reject(new Error('refused')));
    await kv.flush();
    expect(kv.get('cfg')).toEqual({ a: 0 });
  });

  it('the memory store just takes the value', () => {
    const kv = createMemoryStore();
    kv.expect('cfg', { a: 1 }, Promise.resolve());
    expect(kv.get('cfg')).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/sync-store.test.ts`
Expected: FAIL — `kv.expect is not a function`; the prefix tests fail with `unknown key claimScan:UC1`.

- [ ] **Step 3: Implement**

In `extension/lib/sync-store.ts`:

1. Interface — add after `set`:
```ts
  // A write someone else makes for us (the background, D20): the copy shows `value` at once,
  // events for the key wait until `done` settles, and the key is read again then.
  expect(key: string, value: unknown, done: Promise<unknown>): void;
```
2. Signature and key test:
```ts
// `prefixes`: every key starting with one of them is kept too (the copyright module's
// per-channel keys, `claimScan:<channelId>` and the like), also keys first written later.
export async function createSyncStore(keyList: string[], prefixes: string[] = []): Promise<SyncStore> {
  const keys = new Set(keyList);
  const isKey = (key: string) => keys.has(key) || prefixes.some((p) => key.startsWith(p));
```
3. In `onEvent`: `if (!isKey(key)) return;`
4. The first read:
```ts
    // With prefixes the store can't name its keys up front: it reads everything once (the queue,
    // presets, the song history…) and keeps only its own. Once per Studio page load; acceptable.
    const stored = prefixes.length ? await browser.storage.local.get(null) : await browser.storage.local.get(keyList);
    for (const [k, v] of Object.entries(stored)) if (v !== undefined && isKey(k)) cache.set(k, v);
```
5. Rename the throwing helper `known` to `check` and make it use `isKey`:
```ts
  const check = (key: string) => {
    if (!isKey(key)) throw new Error(`SyncStore: unknown key ${key}`);
  };
```
(update its four callers: `get`, `set`, `onChange`, `reread`).
6. Add `expect` to the returned object, after `set`:
```ts
    expect(key, value, done) {
      check(key);
      if (!live) throw new Error('SyncStore: disposed');
      if (value === undefined) cache.delete(key);
      else cache.set(key, copy(value));
      bump(key);
      inflight.set(key, (inflight.get(key) ?? 0) + 1);
      const w = Promise.resolve(done)
        .catch((e) => console.error(`[ytup] write failed for ${key}`, e))
        // Always read again: the writer's result is the truth (it may have merged other changes).
        .then(() => {
          stale.add(key);
          return settle(key);
        })
        .catch((e) => console.error(`[ytup] storage re-read failed for ${key}`, e));
      writes.add(w);
      void w.finally(() => writes.delete(w));
    },
```
7. `createMemoryStore` gains:
```ts
    expect: (key, value) => void (value === undefined ? data.delete(key) : data.set(key, copy(value))),
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/sync-store.test.ts tests/state.test.ts tests/invite-accept.test.mjs`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `npm run check`
```bash
git add extension/lib/sync-store.ts extension/tests/sync-store.test.ts
git commit -m "SyncStore: keys by prefix, and expect() for a write the background makes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The copyright data layer — keys, pure helpers, ops, one writer

Deferred items 1 and 3: per-channel keys, and every copyright write through the background.

**Files:**
- Create: `extension/lib/claims/keys.ts`, `extension/lib/claims/types.ts`, `extension/lib/claims/core.ts`, `extension/lib/claims/songs.ts`, `extension/lib/claims/ops.ts`, `extension/lib/claims/store.ts`, `extension/lib/panel/claims-data.ts`, `extension/scripts/port/claims-core.mjs`, `extension/scripts/port/claims-songs.mjs`
- Modify: `extension/lib/store-writer.ts`, `extension/lib/messages.ts`, `extension/entrypoints/background.ts`
- Test: `extension/tests/claims-keys-ops.test.ts`, `extension/tests/claims-core.test.ts`, `extension/tests/claims-songs.test.ts`, `extension/tests/claims-store.test.ts`, `extension/tests/panel-claims-data.test.ts`, `extension/tests/store-writer.test.ts`

**Interfaces:**
- Consumes: `createSyncStore(keys, prefixes)`, `SyncStore.expect` (Task 2); `serial` in `store-writer.ts`; `mayWrite`.
- Produces:
  - `keys.ts`: `CH_KEYS`, `type ChKey`, `GLOBAL_KEYS`, `CH_PREFIXES: string[]`, `chKey(name: ChKey, ch: string): string`, `splitKey(key: string): { name: string; ch: string | null } | null`, `isClaimsKey(k: unknown): k is string`, `channelKeys(ch: string): string[]`.
  - `types.ts`: `ClaimRow`, `ClaimScan`, `AdsRow`, `AdsScan`, `CollabRow`, `CollabScan`, `ResultEntry`, `RunItem`, `Run`, `FollowUp`, `Autopilot`, `SongEntry`, `Songs`, `ClaimsCfg`, `ClaimsStatus`, `ClaimsCounts`, `ClaimsState`, `ClaimsLogLine`, `ClaimsView`.
  - `core.ts`: `DEFAULTS: ClaimsCfg`, `fmt(sec)`, `short(e)`, `privacyOf(p)`, `claimInfo(c)`, `songNorm(t)`, `parseCSV(text): string[][]`, `titleKey(t)`, `claimedSongsIn(txt, songs: Songs)`, `csvText(rows: unknown[][]): string`, `claimsCsvRows(scan: ClaimScan): unknown[][]`, `songsCsvRows(songs: Songs): unknown[][]`, `uploadsCsvRows(list: UploadRecordLike[]): unknown[][]`.
  - `songs.ts`: `recordSongs(db: Songs, rows: SongRow[], chName: string, now: string): number`, `markSongTrimmed(db: Songs, item: { song: string; videoId: string }): void`, `importSongs(db: Songs, text: string, now: string): number` (−1 = not a song CSV).
  - `ops.ts`: `type SongsOp`, `type ClaimsOp`, `opKey(op): string`, `applyOp(cur: unknown, op: ClaimsOp): unknown`, `isClaimsOp(v: unknown): v is ClaimsOp`.
  - `store.ts`: `initClaimsStore(send?)`, `disposeClaimsStore()`, `useMemoryClaims(initial?, send?)`, `load<T>(key, fallback: T): T`, `save(key, value)`, `write(op)`, `onClaimsStored(key, fn)`, `flushClaims()`.
  - `store-writer.ts`: `claimsOpInOrder(op: unknown): Promise<void>`; `mayWrite('claims:op', …)`.
  - `messages.ts`: `'claims:op'(op: ClaimsOp): void`.
  - `lib/panel/claims-data.ts`: `interface ClaimsData`, `toClaimsData(ch, raw)`, `readClaims(ch)`, `watchClaims(ch, fn)`, `claimsWrite(op)`.

- [ ] **Step 1: Keys and types**

`extension/lib/claims/keys.ts`:
```ts
// Where the copyright module keeps its data in chrome.storage.local: the userscript's keys,
// unchanged (D19). Per channel `<name>:<channelId>` (chGet / chSet, user.js 4628–4629), and
// four global ones. The tab lease `tabLock:<channelId>` (5053) is gone: the runner lock is the
// one lock now (D21).
export const CH_KEYS = [
  'claimScan', 'adsScan', 'adsResults', 'adsRun', 'collabScan', 'collabResults', 'collabRun', 'collabLinks',
  'trimQueue', 'trimResults', 'trimRun', 'followUp', 'autopilot',
] as const;
export type ChKey = (typeof CH_KEYS)[number];
export const GLOBAL_KEYS = ['cfg', 'songHistory', 'collabHandles', 'logOpen'] as const;
export const CH_PREFIXES: string[] = CH_KEYS.map((k) => k + ':');

export const chKey = (name: ChKey, ch: string) => `${name}:${ch}`;

// currentChannel() is a UC id, or 'unknown' before Studio says (4625).
const CH_ID = /^[\w-]{1,64}$/;
export function splitKey(key: string): { name: string; ch: string | null } | null {
  if ((GLOBAL_KEYS as readonly string[]).includes(key)) return { name: key, ch: null };
  const i = key.indexOf(':');
  if (i < 0) return null;
  const name = key.slice(0, i);
  const ch = key.slice(i + 1);
  return (CH_KEYS as readonly string[]).includes(name) && CH_ID.test(ch) ? { name, ch } : null;
}
export const isClaimsKey = (k: unknown): k is string => typeof k === 'string' && splitKey(k) !== null;
// Every key the Copyright tab reads for one channel.
export const channelKeys = (ch: string): string[] => [...CH_KEYS.map((k) => chKey(k, ch)), ...GLOBAL_KEYS];
```

`extension/lib/claims/types.ts`:
```ts
// The shapes the userscript's copyright module stored (scanClaims 4807–4823, scanAds 5271–5273,
// scanCollab 5473–5474, runs 5347 / 5554 / 5714, followUp 5747, autopilot 5823, songs 5078),
// and what the Studio tab tells the side panel.
export interface ClaimRow {
  videoId: string; video: string; privacy: string; length: number; claimId: string; song: string; artists: string;
  label: string; claimant: string; type: string; status: string; impact: string; segments: [number, number][];
  claimedSec: number; canTrim: boolean; options: string; own: boolean; hasImpact: boolean; publishAt: number;
}
export interface ClaimScan { date: string; total: number; rows: ClaimRow[]; channel: string; channelName: string }
export interface AdsRow { videoId: string; video: string; privacy: string; length: number; ineligible: boolean; status: string }
export interface AdsScan { date: string; total: number; rows: AdsRow[] }
export interface CollabRow { videoId: string; video: string; privacy: string; length: number }
export interface CollabScan { date: string; total: number; rows: CollabRow[] }
export interface ResultEntry { state: string; msg: string; date: string }
export interface RunItem { videoId: string; video: string; state: string; msg: string; key?: string; claimId?: string; song?: string }
export interface Run { active: boolean; items: RunItem[]; started: string; mode?: 'auto' | 'review'; channel?: string; handles?: string[] }
export type FollowUp = Record<string, {
  video: string; pending: { key: string; claimId: string; song: string; tries: number }[]; lastClaimId: string | null; lastSavedAt: number;
}>;
export interface Autopilot { on: boolean; next: number; last?: number }
export interface SongEntry {
  title: string; artists: string; label: string; claimants: string[]; types: string[]; firstSeen: string; lastSeen: string;
  videos: Record<string, { video: string; channel: string; status: string; impact?: string }>; trimmed: number;
}
export type Songs = Record<string, SongEntry>;
export interface ClaimsCfg {
  autoSaveTrim: boolean; autoSaveManualTrim: boolean; followUpMinutes: string; ownNames: string; apEveryHours: string;
  apSkipOwn: boolean; apOnlyImpact: boolean; apMaxPct: string; apMaxPerCycle: string; apAdsOn: boolean;
}
// computeStatus() (6122–6170): what the status card shows.
export interface ClaimsStatus {
  icon: string; kind: string; title: string; detail: string;
  progress?: number | null; steps?: string[]; stepIdx?: number; stepDetail?: string;
}
// getCounts() (4637–4653).
export interface ClaimsCounts { hasScan: boolean; scanDate: string; claims: number; claimVideos: number; songs: number; hasAdsScan: boolean; adsTodo: number }
// What renderStatus() (6219–6256) read, as the Studio tab sends it (claims:state / claims:view).
export interface ClaimsState {
  channel: string; // currentChannel(): the suffix of this channel's keys
  channelName: string;
  ready: boolean; // Studio's INNERTUBE_CONTEXT is there (scans can start)
  english: boolean; // studioIsEnglish(): trimming / ads need Studio in English
  uploadBusy: boolean; // the upload queue has work: jobs that change pages wait
  status: ClaimsStatus;
  counts: ClaimsCounts;
  busyRun: boolean; // a trim / ads / Collab run is active
  busyScan: boolean;
  waiting: number; // fuCount(): claims waiting for a follow-up trim
  workerHere: boolean; // no other Studio tab holds the runner lock
}
export interface ClaimsLogLine { at: number; msg: string; type: string }
export type ClaimsView = 'claims' | 'ads' | 'collab';
```

- [ ] **Step 2: The pure helpers (port `claims-core`)**

`extension/scripts/port/claims-core.mjs`:
```js
// lib/claims/core.ts ← the copyright module's pure helpers: settings defaults, formatting,
// claimInfo, the song key and parseCSV, and the tracklist check against claimed songs
// (which takes the song history as an argument instead of reading it).
export default {
  file: 'lib/claims/core.ts',
  regions: ['4593-4604', '4685-4691', '4694-4707', '5065-5065', '5117-5136', '5167-5187'],
  subs: [
    ['function claimedSongsIn(txt) {', 'function claimedSongsIn(txt, songs) {', 1],
    ['const db = Object.values(getSongs());', 'const db = Object.values(songs);', 1],
  ],
};
```
Write `extension/lib/claims/core.ts`:
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import type { ClaimScan, ClaimsCfg, Songs } from './types';

// The userscript's copyright module (user.js 4592–6357), its pure parts: the side panel and
// the Studio tab both use them.

EOF
  echo '// @port-begin'; port claims-core; echo '// @port-end'; } > lib/claims/core.ts
```
Then edit the printed code into TypeScript (types only; `port-check` erases them): `const DEFAULTS: ClaimsCfg = {`, `const fmt = (sec: number) =>`, `const short = (e: unknown) =>`, `const privacyOf = (p: unknown) =>`, `function claimInfo(c: any)` with `const found: { title: string; artists: string[]; label: string } = …` and `(function walk(o: any, d: number): void {`, `const songNorm = (t: unknown) =>`, `function parseCSV(text: string): string[][]` with `const rows: string[][] = []; let row: string[] = [], cell = '', q = false;`, `const titleKey = (t: unknown) =>`, `function claimedSongsIn(txt: string, songs: Songs)` with `const hits: { line: string; song: string; artists: string; times: number }[] = [];`. Then append below `// @port-end`:
```ts
// downloadCSV()'s text (user.js 2084–2085): a BOM, every cell quoted.
export const csvText = (rows: unknown[][]): string =>
  '﻿' + rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');

// claimsCSV() (4842–4846).
export function claimsCsvRows(scan: ClaimScan): unknown[][] {
  const head = ['video', 'video_url', 'privacy', 'video_length', 'song', 'artists', 'label', 'claimant', 'own_music',
    'type', 'status', 'impact', 'claimed_segments', 'claimed_total', 'can_trim', 'options', 'claim_id'];
  const lines = scan.rows.map((r) => [r.video, `https://studio.youtube.com/video/${r.videoId}/claims`, r.privacy, fmt(r.length),
    r.song, r.artists, r.label, r.claimant, r.own ? 'yes' : 'no', r.type, r.status, r.impact,
    r.segments.map((sg) => fmt(sg[0]) + '-' + fmt(sg[1])).join(' ; '), fmt(r.claimedSec), r.canTrim ? 'yes' : 'no', r.options, r.claimId]);
  return [head, ...lines];
}

// songsCSV() (5106–5112).
export function songsCsvRows(songs: Songs): unknown[][] {
  const head = ['song', 'artists', 'label', 'claimants', 'claim_type', 'videos_claimed', 'videos_trimmed', 'channels', 'first_seen', 'last_seen', 'videos'];
  const lines = Object.values(songs).map((e) => {
    const vids = Object.values(e.videos);
    return [e.title, e.artists, e.label, e.claimants.join('; '), e.types.join('; '), vids.length, e.trimmed || 0,
      [...new Set(vids.map((v) => v.channel))].join('; '), e.firstSeen.slice(0, 10), e.lastSeen.slice(0, 10), vids.map((v) => v.video).join(' | ')];
  });
  return [head, ...lines];
}

// uploadsCSV() (2079–2081).
export interface UploadRecordLike { date: string; channel: string; channelName?: string; title: string; file: string; videoId: string; visibility: string; publishAt: number | null }
export function uploadsCsvRows(list: UploadRecordLike[]): unknown[][] {
  const head = ['date', 'channel', 'title', 'file', 'video_id', 'url', 'visibility', 'publish_at'];
  const rows = list.map((u) => [u.date, u.channelName || u.channel, u.title, u.file, u.videoId,
    u.videoId ? 'https://youtu.be/' + u.videoId : '', u.visibility, u.publishAt ? new Date(u.publishAt).toISOString() : '']);
  return [head, ...rows];
}

export { DEFAULTS, fmt, short, privacyOf, claimInfo, songNorm, parseCSV, titleKey, claimedSongsIn };
```

`extension/tests/claims-core.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { claimInfo, claimedSongsIn, claimsCsvRows, csvText, DEFAULTS, fmt, parseCSV, privacyOf, short, songsCsvRows } from '../lib/claims/core';
import type { ClaimScan, Songs } from '../lib/claims/types';

describe('copyright helpers', () => {
  it('formats like the userscript', () => {
    expect(fmt(65)).toBe('1:05');
    expect(fmt(3725)).toBe('1:02:05');
    expect(short('VIDEO_RESTRICTION_IMPACT_MONETIZATION_DISABLED')).toBe('monetization disabled');
    expect(privacyOf('VIDEO_PRIVACY_PUBLIC')).toBe('public');
    expect(DEFAULTS.apEveryHours).toBe('6');
  });

  it('claimInfo walks nested metadata for title, artists and label', () => {
    expect(claimInfo({ asset: { metadata: { soundRecording: { title: ' Song ', artists: [{ name: 'A' }, 'B'], recordLabel: 'L' } } } }))
      .toEqual({ title: 'Song', artists: ['A', 'B'], label: 'L' });
    expect(claimInfo(null)).toEqual({ title: '', artists: [], label: '' });
  });

  it('parseCSV reads quotes, escaped quotes, CRLF and a BOM', () => {
    expect(parseCSV('﻿song,artists\r\n"A, B","x ""y"""\n\n')).toEqual([['song', 'artists'], ['A, B', 'x "y"']]);
  });

  it('claimedSongsIn finds tracklist lines whose song was claimed before', () => {
    const songs = { 'k': { title: 'Midnight Rain', artists: 'Lena', videos: { v1: {}, v2: {} } } } as unknown as Songs;
    expect(claimedSongsIn('00:00 Lena - Midnight Rain (Remix)\n03:00 Other - Thing', songs))
      .toEqual([{ line: 'Lena - Midnight Rain (Remix)', song: 'Midnight Rain', artists: 'Lena', times: 2 }]);
    expect(claimedSongsIn('', songs)).toEqual([]);
  });

  it('CSV text quotes every cell and starts with a BOM', () => {
    expect(csvText([['a', 'b "c"'], [1, null]])).toBe('﻿"a","b ""c"""\n"1",""');
  });

  it('the claims and songs CSVs keep the userscript columns', () => {
    const scan = { date: '2026-10-01T00:00:00Z', total: 1, channel: 'UC1', channelName: 'C', rows: [{
      videoId: 'v1', video: 'Mix', privacy: 'public', length: 600, claimId: 'c1', song: 'S', artists: 'A', label: 'L', claimant: 'Co',
      type: 'audio', status: 'active', impact: 'blocked', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: 'trim', own: false,
      hasImpact: true, publishAt: 0 }] } as ClaimScan;
    expect(claimsCsvRows(scan)[1]).toEqual(['Mix', 'https://studio.youtube.com/video/v1/claims', 'public', '10:00', 'S', 'A', 'L', 'Co', 'no',
      'audio', 'active', 'blocked', '1:00-1:30', '0:30', 'yes', 'trim', 'c1']);
    expect(songsCsvRows({})[0]![0]).toBe('song');
  });
});
```

- [ ] **Step 3: The song-history reducers (port `claims-songs`)**

`extension/scripts/port/claims-songs.mjs`:
```js
// lib/claims/songs.ts ← recordSongs / markSongTrimmed / importSongsCSV as reducers over the song
// history: the background runs them for the songs op (D20), so they take the history and the
// time as arguments and return what the userscript logged or toasted (the callers show it).
export default {
  file: 'lib/claims/songs.ts',
  regions: ['5069-5091', '5093-5103', '5137-5164'],
  subs: [
    ['function recordSongs(rows, chName) {\n      const db = getSongs();\n      const now = new Date().toISOString();', 'function recordSongs(db, rows, chName, now) {', 1],
    ["      setSongs(db);\n      if (added) log(L(`🎵 เพิ่มเพลงใหม่ ${added} เพลงในประวัติ`, `🎵 Added ${added} new songs to history`), 'ok');", '      return added;', 1],
    ['function markSongTrimmed(item) {\n      const db = getSongs();', 'function markSongTrimmed(db, item) {', 1],
    ['      }\n      setSongs(db);\n    }\n', '      }\n    }\n', 1],
    ['async function importSongsCSV(file) {\n      const rows = parseCSV(await file.text());', 'function importSongs(db, text, now) {\n      const rows = parseCSV(text);', 1],
    ["      if (col('song') < 0) return toast(L('ไฟล์นี้ไม่ใช่ CSV ประวัติเพลง (ต้องมีคอลัมน์ song)', 'This is not a song history CSV (needs a song column)'));\n      const db = getSongs();", "      if (col('song') < 0) return -1;", 1],
    ['new Date().toISOString().slice(0, 10)', 'now.slice(0, 10)', 2],
    ["      setSongs(db);\n      toast(L(`นำเข้าประวัติเพลง ${n} เพลงแล้ว`, `Imported ${n} songs into history`));\n      renderStatus();\n      refreshClaimWarnings();", '      return n;', 1],
  ],
};
```
(The sub counts were checked against the pinned userscript.)
```bash
{ cat <<'EOF'
import { parseCSV, songNorm } from './core';
import type { ClaimRow, Songs } from './types';

export type SongRow = Pick<ClaimRow, 'song' | 'artists' | 'label' | 'claimant' | 'type' | 'videoId' | 'video' | 'impact'>;

EOF
  echo '// @port-begin'; port claims-songs; echo '// @port-end'; printf '\nexport { recordSongs, markSongTrimmed, importSongs };\n'; } > lib/claims/songs.ts
```
Types: `function recordSongs(db: Songs, rows: SongRow[], chName: string, now: string): number`, `function markSongTrimmed(db: Songs, item: { song: string; videoId: string }): void`, `function importSongs(db: Songs, text: string, now: string): number`, `const g = (name: string) =>`, `const col = (n: string) =>`, `let e = db[key];` (stays; `noUncheckedIndexedAccess` makes it `SongEntry | undefined`, narrowed by `if (!e)`), `const v = e.videos[r.videoId] || (e.videos[r.videoId] = { … });`.

`extension/tests/claims-songs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { importSongs, markSongTrimmed, recordSongs } from '../lib/claims/songs';
import type { Songs } from '../lib/claims/types';

const row = (song: string, videoId: string, extra = {}) => ({ song, artists: 'A', label: '', claimant: 'Co', type: 'audio', videoId, video: 'Mix ' + videoId, impact: '', ...extra });

describe('song history reducers', () => {
  it('recordSongs adds new songs, counts them, and merges claimants and videos', () => {
    const db: Songs = {};
    expect(recordSongs(db, [row('S', 'v1'), row('S', 'v2', { claimant: 'Other' }), row('(ไม่ทราบชื่อ)', 'v3')], 'Chan', '2026-10-01T00:00:00Z')).toBe(1);
    const e = db['s|a']!;
    expect(e.claimants).toEqual(['Co', 'Other']);
    expect(Object.keys(e.videos)).toEqual(['v1', 'v2']);
    expect(e.videos.v1!.channel).toBe('Chan');
    expect(recordSongs(db, [row('S', 'v1')], 'Chan', '2026-10-02T00:00:00Z')).toBe(0);
    expect(db['s|a']!.lastSeen).toBe('2026-10-02T00:00:00Z');
  });

  it('markSongTrimmed counts a video once', () => {
    const db: Songs = {};
    recordSongs(db, [row('S', 'v1')], 'Chan', '2026-10-01T00:00:00Z');
    markSongTrimmed(db, { song: 'S', videoId: 'v1' });
    markSongTrimmed(db, { song: 'S', videoId: 'v1' });
    expect(db['s|a']!.trimmed).toBe(1);
    expect(db['s|a']!.videos.v1!.status).toBe('trimmed');
  });

  it('importSongs reads the old script CSV, and refuses a file without a song column', () => {
    const db: Songs = {};
    const csv = 'song,artists,claimants,claim_type,videos_trimmed,channels,first_seen,last_seen,videos\nS,A,Co; X,audio,2,Chan,2026-01-01,2026-02-01,Mix 1 | Mix 2\n';
    expect(importSongs(db, csv, '2026-10-01T00:00:00Z')).toBe(1);
    expect(db['s|a']).toMatchObject({ claimants: ['Co', 'X'], trimmed: 2, firstSeen: '2026-01-01T00:00:00Z' });
    expect(Object.values(db['s|a']!.videos).map((v) => v.video)).toEqual(['Mix 1', 'Mix 2']);
    expect(importSongs(db, 'title\nx', '2026-10-01T00:00:00Z')).toBe(-1);
  });
});
```

- [ ] **Step 4: The ops (failing tests first)**

`extension/tests/claims-keys-ops.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { channelKeys, isClaimsKey, splitKey } from '../lib/claims/keys';
import { applyOp, isClaimsOp, opKey } from '../lib/claims/ops';

describe('copyright keys', () => {
  it('knows the per-channel and global keys, and nothing else', () => {
    expect(splitKey('claimScan:UCabc_-1')).toEqual({ name: 'claimScan', ch: 'UCabc_-1' });
    expect(splitKey('cfg')).toEqual({ name: 'cfg', ch: null });
    expect(isClaimsKey('claimScan:unknown')).toBe(true);
    for (const bad of ['settings', 'presets', 'tabLock:UC1', 'claimScan:', 'claimScan:../x', 'claimScan', 7]) expect(isClaimsKey(bad)).toBe(false);
    expect(channelKeys('UC1')).toContain('trimRun:UC1');
    expect(channelKeys('UC1')).toContain('songHistory');
  });
});

describe('ops', () => {
  it('set replaces, and undefined removes', () => {
    expect(applyOp({ a: 1 }, { op: 'set', key: 'cfg', value: { b: 2 } })).toEqual({ b: 2 });
    expect(applyOp({ a: 1 }, { op: 'set', key: 'cfg', value: undefined })).toBe(undefined);
  });

  it('merge adds and replaces entries; null removes one', () => {
    expect(applyOp({ a: 1, b: 2 }, { op: 'merge', key: 'trimResults:UC1', entries: { b: 3, c: 4, a: null } })).toEqual({ b: 3, c: 4 });
    expect(applyOp(undefined, { op: 'merge', key: 'autopilot:UC1', entries: { on: true } })).toEqual({ on: true });
  });

  it('list adds once and removes', () => {
    expect(applyOp(['a', 'b'], { op: 'list', key: 'trimQueue:UC1', add: ['b', 'c'], del: ['a'] })).toEqual(['b', 'c']);
  });

  it('runItem changes one item, and only in an active run when asked', () => {
    const run = { active: true, items: [{ key: 'v:c1', state: 'pending', msg: '' }, { key: 'v:c2', state: 'pending', msg: '' }] };
    expect(applyOp(run, { op: 'runItem', key: 'trimRun:UC1', by: 'key', id: 'v:c2', state: 'saved', msg: '0:10–0:20', onlyActive: true }))
      .toEqual({ active: true, items: [run.items[0], { key: 'v:c2', state: 'saved', msg: '0:10–0:20' }] });
    const stopped = { ...run, active: false };
    expect(applyOp(stopped, { op: 'runItem', key: 'trimRun:UC1', by: 'key', id: 'v:c2', state: 'saved', msg: '', onlyActive: true })).toEqual(stopped);
  });

  it('songs ops run the reducers on a copy', () => {
    const cur = {};
    const next = applyOp(cur, { op: 'songs', songs: { fn: 'record', rows: [{ song: 'S', artists: '', label: '', claimant: '', type: '', videoId: 'v', video: 'M', impact: '' }], chName: 'C', now: '2026-10-01T00:00:00Z' } }) as Record<string, unknown>;
    expect(Object.keys(next)).toEqual(['s|']);
    expect(cur).toEqual({});
    expect(applyOp(next, { op: 'songs', songs: { fn: 'delete', key: 's|' } })).toEqual({});
    expect(applyOp(next, { op: 'songs', songs: { fn: 'clear' } })).toEqual({});
    expect(opKey({ op: 'songs', songs: { fn: 'clear' } })).toBe('songHistory');
  });

  it('isClaimsOp refuses other keys, the wrong op for a key, and prototype keys', () => {
    expect(isClaimsOp({ op: 'set', key: 'claimScan:UC1', value: {} })).toBe(true);
    expect(isClaimsOp({ op: 'set', key: 'settings', value: {} })).toBe(false);
    expect(isClaimsOp({ op: 'merge', key: 'claimScan:UC1', entries: {} })).toBe(false); // scans are written whole
    expect(isClaimsOp({ op: 'merge', key: 'cfg', entries: JSON.parse('{"__proto__":{"x":1}}') })).toBe(false);
    expect(isClaimsOp({ op: 'list', key: 'trimResults:UC1', add: ['a'] })).toBe(false);
    expect(isClaimsOp({ op: 'list', key: 'trimQueue:UC1', add: [1] })).toBe(false);
    expect(isClaimsOp({ op: 'runItem', key: 'trimRun:UC1', by: 'title', id: 'x', state: 's', msg: '' })).toBe(false);
    expect(isClaimsOp({ op: 'songs', songs: { fn: 'import', text: 'x', now: 'n' } })).toBe(true);
    expect(isClaimsOp({ op: 'songs', songs: { fn: 'eval' } })).toBe(false);
    expect(isClaimsOp(null)).toBe(false);
  });
});
```
Run: `npx vitest run tests/claims-keys-ops.test.ts tests/claims-core.test.ts tests/claims-songs.test.ts`
Expected: the ops tests FAIL (no `lib/claims/ops`); core and songs PASS once Steps 2–3 are in (fix any typing slip until they do).

`extension/lib/claims/ops.ts`:
```ts
import { isClaimsKey, splitKey } from './keys';
import { importSongs, markSongTrimmed, recordSongs, type SongRow } from './songs';
import type { Songs } from './types';

// The copyright module's writes, as data (D20). The background applies them one at a time to
// what storage holds (store-writer claimsOpInOrder); a Studio tab applies the same op to its
// copy at once (lib/claims/store.ts). Each op names one key.
export type SongsOp =
  | { fn: 'record'; rows: SongRow[]; chName: string; now: string }
  | { fn: 'trimmed'; song: string; videoId: string }
  | { fn: 'import'; text: string; now: string }
  | { fn: 'delete'; key: string }
  | { fn: 'clear' };
export type ClaimsOp =
  | { op: 'set'; key: string; value: unknown }
  | { op: 'merge'; key: string; entries: Record<string, unknown> } // a null entry removes it
  | { op: 'list'; key: string; add?: string[]; del?: string[] }
  | { op: 'runItem'; key: string; by: 'key' | 'videoId'; id: string; state: string; msg: string; onlyActive?: boolean }
  | { op: 'songs'; songs: SongsOp };

export const opKey = (op: ClaimsOp): string => (op.op === 'songs' ? 'songHistory' : op.key);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const MERGE = new Set(['cfg', 'trimResults', 'adsResults', 'collabResults', 'collabLinks', 'autopilot', 'trimRun', 'adsRun', 'collabRun']);
const RUNS = new Set(['trimRun', 'adsRun', 'collabRun']);
const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
const nameOf = (key: string) => splitKey(key)?.name ?? '';

// The key's next value (undefined: remove it).
export function applyOp(cur: unknown, op: ClaimsOp): unknown {
  switch (op.op) {
    case 'set':
      return op.value === undefined ? undefined : structuredClone(op.value);
    case 'merge': {
      const next: Record<string, unknown> = isObj(cur) ? { ...cur } : {};
      for (const [k, v] of Object.entries(op.entries)) {
        if (v === null) delete next[k];
        else next[k] = structuredClone(v);
      }
      return next;
    }
    case 'list': {
      const del = new Set(op.del ?? []);
      const out = (strs(cur) ? cur : []).filter((x) => !del.has(x));
      for (const x of op.add ?? []) if (!out.includes(x)) out.push(x);
      return out;
    }
    case 'runItem': {
      // setResult() changes the run only while it is active (5661); the ads / Collab results always (5369, 5598).
      if (!isObj(cur) || !Array.isArray(cur.items) || (op.onlyActive && !cur.active)) return cur;
      return { ...cur, items: cur.items.map((it) => (isObj(it) && it[op.by] === op.id ? { ...it, state: op.state, msg: op.msg } : it)) };
    }
    case 'songs': {
      const s = op.songs;
      if (s.fn === 'clear') return {};
      const db = (isObj(cur) ? structuredClone(cur) : {}) as Songs;
      if (s.fn === 'record') recordSongs(db, s.rows, s.chName, s.now);
      else if (s.fn === 'trimmed') markSongTrimmed(db, s);
      else if (s.fn === 'import') importSongs(db, s.text, s.now);
      else delete db[s.key];
      return db;
    }
  }
}

function isSongsOp(v: unknown): v is SongsOp {
  if (!isObj(v)) return false;
  switch (v.fn) {
    case 'record': return Array.isArray(v.rows) && v.rows.every(isObj) && typeof v.chName === 'string' && typeof v.now === 'string';
    case 'trimmed': return typeof v.song === 'string' && typeof v.videoId === 'string';
    case 'import': return typeof v.text === 'string' && typeof v.now === 'string';
    case 'delete': return typeof v.key === 'string' && !PROTO.has(v.key);
    case 'clear': return true;
  }
  return false;
}

// claims:op crosses a message boundary: only well-formed ops on the copyright keys get through.
export function isClaimsOp(v: unknown): v is ClaimsOp {
  if (!isObj(v)) return false;
  if (v.op === 'songs') return isSongsOp(v.songs);
  if (!isClaimsKey(v.key)) return false;
  const name = nameOf(v.key);
  switch (v.op) {
    case 'set': return 'value' in v;
    case 'merge': return MERGE.has(name) && isObj(v.entries) && Object.keys(v.entries).every((k) => !PROTO.has(k));
    case 'list': return name === 'trimQueue' && (v.add === undefined || strs(v.add)) && (v.del === undefined || strs(v.del));
    case 'runItem': return RUNS.has(name) && (v.by === 'key' || v.by === 'videoId') && typeof v.id === 'string'
      && typeof v.state === 'string' && typeof v.msg === 'string' && (v.onlyActive === undefined || typeof v.onlyActive === 'boolean');
  }
  return false;
}
```
Run: `npx vitest run tests/claims-keys-ops.test.ts`
Expected: PASS.

- [ ] **Step 5: The background writer (failing test first)**

Append to `extension/tests/store-writer.test.ts`:
```ts
describe('claims:op', () => {
  it('applies ops one at a time to what storage holds', async () => {
    await browser.storage.local.set({ 'trimResults:UC1': { a: { state: 'saved' } } });
    await Promise.all([
      claimsOpInOrder({ op: 'merge', key: 'trimResults:UC1', entries: { b: { state: 'gone' } } }),
      claimsOpInOrder({ op: 'merge', key: 'trimResults:UC1', entries: { c: { state: 'failed' } } }),
    ]);
    expect(Object.keys((await browser.storage.local.get('trimResults:UC1'))['trimResults:UC1'] as object)).toEqual(['a', 'b', 'c']);
    await claimsOpInOrder({ op: 'set', key: 'trimRun:UC1', value: undefined });
    expect(await browser.storage.local.get('trimRun:UC1')).toEqual({});
  });

  it('refuses malformed ops and keys outside the copyright data', async () => {
    await expect(claimsOpInOrder({ op: 'set', key: 'settings', value: {} })).rejects.toThrow('claims:op: malformed');
    await expect(claimsOpInOrder({ op: 'merge', key: 'cfg', entries: JSON.parse('{"__proto__":{}}') })).rejects.toThrow('claims:op: malformed');
  });

  it('only the side panel and Studio tabs may send it', () => {
    const ext = 'chrome-extension://abc/';
    expect(mayWrite('claims:op', { url: ext + 'sidepanel.html' }, ext)).toBe(true);
    expect(mayWrite('claims:op', { tab: {}, url: 'https://studio.youtube.com/channel/UC1' }, ext)).toBe(true);
    expect(mayWrite('claims:op', { tab: {}, url: 'https://www.youtube.com/' }, ext)).toBe(false);
    expect(mayWrite('claims:op', { url: ext + 'file-bridge.html', tab: {} }, ext)).toBe(false);
  });
});
```
(add `claimsOpInOrder` to the file's import from `../lib/store-writer`.)
Run: `npx vitest run tests/store-writer.test.ts`
Expected: FAIL — `claimsOpInOrder` is not exported.

In `extension/lib/store-writer.ts`:
```ts
import { applyOp, isClaimsOp, opKey } from './claims/ops';
```
Change `mayWrite`'s type to `'store:patch' | 'backup:write' | 'files:delete' | 'claims:op'` (the rule for `claims:op` is the same as `store:patch`: the panel or a Studio tab). Add:
```ts
// The copyright data's one writer (D20): each op reads the key from storage and writes the result,
// in the same queue as settings patches and imports, so none lands in between.
export const claimsOpInOrder = async (op: unknown) => {
  if (!isClaimsOp(op)) throw new Error('claims:op: malformed');
  return serial(async () => {
    const key = opKey(op);
    const next = applyOp((await browser.storage.local.get(key))[key], op);
    if (next === undefined) await browser.storage.local.remove(key);
    else await browser.storage.local.set({ [key]: next });
  });
};
```
In `extension/lib/messages.ts`: `import type { ClaimsOp } from './claims/ops';` and in `ProtocolMap` after `'backup:write'`:
```ts
  // copyright data writes, from Studio tabs and the side panel (lib/claims/ops.ts, D20)
  'claims:op'(op: ClaimsOp): void;
```
In `extension/entrypoints/background.ts`, after the `backup:write` handler (add `claimsOpInOrder` to the store-writer import):
```ts
  onMessage('claims:op', async ({ data, sender }) => {
    if (!mayWrite('claims:op', sender, ext)) throw new Error('claims:op: not allowed from this sender');
    await ready;
    await claimsOpInOrder(data);
  });
```
Run: `npx vitest run tests/store-writer.test.ts`
Expected: PASS.

- [ ] **Step 6: The Studio tab's store (failing test first)**

`extension/tests/claims-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ClaimsOp } from '../lib/claims/ops';
import { disposeClaimsStore, flushClaims, initClaimsStore, load, write } from '../lib/claims/store';
import { claimsOpInOrder } from '../lib/store-writer';

beforeEach(() => fakeBrowser.reset());
afterEach(() => disposeClaimsStore());

describe('claims store in the Studio tab', () => {
  it('reads the per-channel and global keys there are', async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { rows: [1] }, cfg: { ownNames: 'x' }, settings: {} });
    await initClaimsStore(async () => {});
    expect(load('claimScan:UC1', null)).toEqual({ rows: [1] });
    expect(load('cfg', {})).toEqual({ ownNames: 'x' });
    expect(load('claimScan:UC2', 'none')).toBe('none');
  });

  it('a write shows at once and goes to the background as an op', async () => {
    const sent: ClaimsOp[] = [];
    await initClaimsStore(async (op) => { sent.push(op); await claimsOpInOrder(op); }); // the background, in process
    write({ op: 'merge', key: 'trimResults:UC1', entries: { k1: { state: 'saved' } } });
    write({ op: 'merge', key: 'trimResults:UC1', entries: { k2: { state: 'gone' } } });
    expect(Object.keys(load<object>('trimResults:UC1', {}))).toEqual(['k1', 'k2']); // both, before the background answers
    await flushClaims();
    expect(sent.map((o) => o.op)).toEqual(['merge', 'merge']);
    expect(Object.keys((await browser.storage.local.get('trimResults:UC1'))['trimResults:UC1'] as object)).toEqual(['k1', 'k2']);
  });

  it('a refused write is logged and the copy goes back to what storage holds', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await initClaimsStore(async () => { throw new Error('claims:op: not allowed'); });
    write({ op: 'set', key: 'logOpen', value: true });
    await flushClaims();
    expect(load('logOpen', false)).toBe(false);
    expect(err).toHaveBeenCalled();
  });

  it('after dispose, writes go nowhere and do not throw (extension reloaded)', async () => {
    await initClaimsStore(async () => {});
    disposeClaimsStore();
    expect(() => write({ op: 'set', key: 'logOpen', value: true })).not.toThrow();
  });
});
```
Run: `npx vitest run tests/claims-store.test.ts`
Expected: FAIL — no `lib/claims/store`.

`extension/lib/claims/store.ts`:
```ts
import { sendMessage } from '../messages';
import { createMemoryStore, createSyncStore, type SyncStore } from '../sync-store';
import { CH_PREFIXES, GLOBAL_KEYS } from './keys';
import { applyOp, opKey, type ClaimsOp } from './ops';

// The copyright data as the Studio tab reads it, like lib/studio/state.ts holds the settings:
// a synchronous copy of chrome.storage.local (the ported code reads storage synchronously, as
// GM_getValue did), here of the per-channel keys and the four global ones. Writes are ops to
// the background, the one writer (D20); the tab applies the same op to its copy at once, so
// the ported code reads its own write back, and takes the stored value once the background is done.
type Send = (op: ClaimsOp) => Promise<void>;
let kv: SyncStore = createMemoryStore();
let send: Send = async () => {};
let starting: Promise<void> | null = null;

export function initClaimsStore(s: Send = (op) => sendMessage('claims:op', op)): Promise<void> {
  if (starting) return starting;
  const p = (async () => {
    const store = await createSyncStore([...GLOBAL_KEYS], CH_PREFIXES);
    if (starting !== p) return void store.dispose(); // disposed while loading
    kv = store;
    send = s;
  })();
  starting = p;
  p.catch(() => {
    if (starting === p) starting = null;
  });
  return p;
}

// Extension reloaded under the page: back to an empty copy whose writes go nowhere.
export function disposeClaimsStore(): void {
  starting = null;
  kv.dispose();
  kv = createMemoryStore();
  send = async () => {};
}

// Tests: a copy holding `initial`, writes handed to `s`.
export function useMemoryClaims(initial: Record<string, unknown> = {}, s: Send = async () => {}): void {
  disposeClaimsStore();
  kv = createMemoryStore(initial);
  send = s;
}

export const load = <T>(key: string, fallback: T): T => kv.get(key, fallback);
export const onClaimsStored = (key: string, fn: (value: unknown) => void) => kv.onChange(key, fn);
export const flushClaims = () => kv.flush();

export function write(op: ClaimsOp): void {
  const key = opKey(op);
  const next = applyOp(kv.get(key), op);
  const done = send(op);
  try {
    kv.expect(key, next, done);
  } catch (e) {
    void done.catch(() => {});
    console.error('[ytup] claims write', key, e);
  }
}
// The userscript's save(key, value) for these keys: a whole-value write.
export const save = (key: string, value: unknown): void => write({ op: 'set', key, value });
```
Run: `npx vitest run tests/claims-store.test.ts`
Expected: PASS.

- [ ] **Step 7: The panel's copy (failing test first)**

`extension/tests/panel-claims-data.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as messages from '../lib/messages';
import { claimsWrite, readClaims, toClaimsData, watchClaims } from '../lib/panel/claims-data';

beforeEach(() => fakeBrowser.reset());

describe('the Copyright tab data', () => {
  it('fills defaults the way the page does', () => {
    const d = toClaimsData('UC1', {});
    expect(d.cfg.apEveryHours).toBe('6');
    expect(d.autopilot).toEqual({ on: false, next: 0 });
    expect(d.scan).toBe(null);
    expect(d.trimQueue).toEqual([]);
    expect(d.songs).toEqual({});
    expect(d.logOpen).toBe(false);
  });

  it("reads one channel's keys, and follows only those", async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { date: 'd', total: 0, rows: [] }, 'claimScan:UC2': { date: 'x' }, cfg: { ownNames: 'Me' } });
    const d = await readClaims('UC1');
    expect(d.scan?.date).toBe('d');
    expect(d.cfg.ownNames).toBe('Me');
    const fn = vi.fn();
    const off = watchClaims('UC1', fn);
    await browser.storage.local.set({ 'claimScan:UC2': { date: 'y' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fn).not.toHaveBeenCalled();
    await browser.storage.local.set({ 'trimQueue:UC1': ['v:c'] });
    await vi.waitFor(() => expect(fn).toHaveBeenCalled());
    expect(fn.mock.calls.at(-1)![0].trimQueue).toEqual(['v:c']);
    off();
  });

  it('writes go to the background as ops', async () => {
    const spy = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    await claimsWrite({ op: 'list', key: 'trimQueue:UC1', add: ['a'] });
    expect(spy).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['a'] });
  });
});
```

`extension/lib/panel/claims-data.ts`:
```ts
import { browser } from 'wxt/browser';
import { DEFAULTS } from '../claims/core';
import { channelKeys, chKey } from '../claims/keys';
import type { ClaimsOp } from '../claims/ops';
import type { AdsScan, Autopilot, ClaimScan, ClaimsCfg, CollabScan, FollowUp, ResultEntry, Run, Songs } from '../claims/types';
import { sendMessage } from '../messages';

// What the Copyright tab shows from chrome.storage.local for the bound tab's channel (the
// channel comes from that tab's ClaimsState), followed live. The panel writes through the
// background like the page does (claims:op, D20); it never writes these keys itself.
export interface ClaimsData {
  ch: string;
  cfg: ClaimsCfg;
  scan: ClaimScan | null;
  adsScan: AdsScan | null;
  adsResults: Record<string, ResultEntry>;
  collabScan: CollabScan | null;
  collabResults: Record<string, ResultEntry>;
  collabLinks: Record<string, string>;
  trimQueue: string[];
  trimResults: Record<string, ResultEntry>;
  trimRun: Run | null;
  adsRun: Run | null;
  collabRun: Run | null;
  followUp: FollowUp;
  autopilot: Autopilot;
  songs: Songs;
  collabHandles: string;
  logOpen: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = <T>(v: unknown, d: T): T => (isObj(v) ? (v as T) : d);

export function toClaimsData(ch: string, raw: Record<string, unknown>): ClaimsData {
  const k = (name: Parameters<typeof chKey>[0]) => raw[chKey(name, ch)];
  return {
    ch,
    cfg: { ...DEFAULTS, ...obj<Partial<ClaimsCfg>>(raw.cfg, {}) }, // cfg() (4605)
    scan: obj<ClaimScan | null>(k('claimScan'), null),
    adsScan: obj<AdsScan | null>(k('adsScan'), null),
    adsResults: obj(k('adsResults'), {}),
    collabScan: obj<CollabScan | null>(k('collabScan'), null),
    collabResults: obj(k('collabResults'), {}),
    collabLinks: obj(k('collabLinks'), {}),
    trimQueue: Array.isArray(k('trimQueue')) ? (k('trimQueue') as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    trimResults: obj(k('trimResults'), {}),
    trimRun: obj<Run | null>(k('trimRun'), null),
    adsRun: obj<Run | null>(k('adsRun'), null),
    collabRun: obj<Run | null>(k('collabRun'), null),
    followUp: obj(k('followUp'), {}),
    autopilot: obj<Autopilot>(k('autopilot'), { on: false, next: 0 }), // getAP() (5823)
    songs: obj(raw.songHistory, {}),
    collabHandles: typeof raw.collabHandles === 'string' ? raw.collabHandles : '',
    logOpen: raw.logOpen === true,
  };
}

export const readClaims = async (ch: string) => toClaimsData(ch, await browser.storage.local.get(channelKeys(ch)));

export function watchClaims(ch: string, fn: (d: ClaimsData) => void): () => void {
  const keys = new Set(channelKeys(ch));
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && Object.keys(changes).some((k) => keys.has(k))) void readClaims(ch).then(fn);
  };
  browser.storage.onChanged.addListener(changed);
  return () => browser.storage.onChanged.removeListener(changed);
}

export const claimsWrite = (op: ClaimsOp) => sendMessage('claims:op', op);
```
Run: `npx vitest run tests/panel-claims-data.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify and commit**

Run: `npm run check && npm run build`
Expected: all pass; port-check prints `ok   claims-core` and `ok   claims-songs`.
```bash
git add extension/lib/claims extension/lib/panel/claims-data.ts extension/lib/store-writer.ts extension/lib/messages.ts extension/entrypoints/background.ts extension/scripts/port/claims-core.mjs extension/scripts/port/claims-songs.mjs extension/tests/claims-keys-ops.test.ts extension/tests/claims-core.test.ts extension/tests/claims-songs.test.ts extension/tests/claims-store.test.ts extension/tests/panel-claims-data.test.ts extension/tests/store-writer.test.ts
git commit -m "Copyright data: the userscript's per-channel keys, pure helpers, and one writer (claims:op in the background)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One automation lock (jobs), one worker per channel, and the bfcache overlap closed

Deferred item 2: scan-and-trim jobs and the upload queue share the runner lock (D21), so two Studio tabs never drive Studio at once. The userscript's per-channel tab lease (`tabLock:<ch>`, 5043–5062) comes back as a background-held worker lease, so exactly one tab per channel runs Auto-pilot, follow-ups and run steps (4b uses it). The same work closes R-M3 (README item 39): a page restored from the back/forward cache mid-run that finds another tab holding the lock now stops at once instead of finishing its video alongside the other run.

**Files:**
- Modify: `extension/lib/runner-lock.ts`, `extension/lib/messages.ts`, `extension/entrypoints/background.ts`, `extension/entrypoints/studio.content.ts`, `extension/lib/studio/queue-sync.ts`, `extension/lib/studio/queue-runner.ts` (outside ports), `extension/lib/studio/content-ui.ts`, `extension/lib/panel/target.ts`, `extension/entrypoints/sidepanel/panel.tsx`, `extension/entrypoints/sidepanel/shell/Banners.tsx`, `extension/entrypoints/sidepanel/tabs/QueueFooter.tsx`, `extension/scripts/strings/extension-only.mjs`, `extension/README.md`
- Test: `extension/tests/runner-lock.test.ts`, `extension/tests/queue-sync.test.ts`, `extension/tests/panel-target.test.ts`, `extension/tests/panel-shell.test.tsx`, `extension/tests/panel-fake.tsx`, `extension/tests/queue-run-flow.test.ts`

**Interfaces:**
- Produces:
  - `runner-lock.ts`: `type Job = 'queue' | 'claims'`, `isJob(v): v is Job`, `acquireRunner(tabId, job: Job): Promise<boolean>`, `releaseRunner(tabId, job: Job | 'all'): Promise<void>`, `runnerElsewhere(tabId, job: Job | 'any'): Promise<boolean>`, `runnerHolds(tabId, job: Job): Promise<boolean>`, `runnerHeld()` (unchanged), `JOBS_KEY = 'runnerJobs'`, `WORKERS_KEY = 'claimsWorkers'`, `claimWorker(tabId: number, ch: string, force: boolean): Promise<boolean>`.
  - `messages.ts`: `'runner:acquire'(job: Job): boolean`, `'runner:release'(job: Job | 'all'): void`, `'runner:elsewhere'(job: Job | 'any'): boolean`, `'runner:holds'(job: Job): boolean`, `'runner:worker'(d: { ch: string; force: boolean }): boolean`.
  - `queue-runner.ts`: `abortRun(err: Error): void`, `abortedRun(): Error | null`.
  - `target.ts`: `RunnerTab.jobs: Job[]`.
  - `PanelApi.busyElsewhere: boolean` (another tab holds the lock for any job); `PanelApi.elsewhere` keeps its meaning (another tab runs the **queue**).

- [ ] **Step 1: Write the failing lock tests**

Replace the first test of `extension/tests/runner-lock.test.ts` and update the others to name their job (`acquireRunner(a, 'queue')`, `releaseRunner(a, 'all')`, `runnerElsewhere(b, 'queue')`); then add:
```ts
  it('a tab holds the lock for its jobs; another tab gets it only when all are gone', async () => {
    const a = await tab();
    const b = await tab();
    expect(await acquireRunner(a, 'claims')).toBe(true);
    expect(await acquireRunner(a, 'queue')).toBe(true); // the same tab may add a job
    expect(await acquireRunner(b, 'queue')).toBe(false);
    expect(await runnerElsewhere(b, 'queue')).toBe(true);
    expect(await runnerElsewhere(b, 'any')).toBe(true);
    await releaseRunner(a, 'queue');
    expect(await runnerElsewhere(b, 'queue')).toBe(false); // the queue isn't running anywhere
    expect(await runnerElsewhere(b, 'any')).toBe(true); // but a copyright job still holds the lock
    expect(await acquireRunner(b, 'queue')).toBe(false);
    expect(await runnerHolds(a, 'claims')).toBe(true);
    await releaseRunner(a, 'claims');
    expect(await acquireRunner(b, 'queue')).toBe(true);
    expect((await browser.storage.session.get('runnerJobs')).runnerJobs).toEqual(['queue']);
  });

  it("'all' lets every job of the tab go; a lock from before jobs existed counts as the queue's", async () => {
    const a = await tab();
    await acquireRunner(a, 'claims');
    await acquireRunner(a, 'queue');
    await releaseRunner(a, 'all');
    expect(await runnerHeld()).toBe(false);
    await browser.storage.session.set({ runnerTabId: a }); // written by an older build
    expect(await runnerHolds(a, 'queue')).toBe(true);
  });

  // The userscript's tab lease (5043–5062): one Studio tab per channel runs its copyright jobs.
  it('one worker per channel: the first tab that asks; another channel has its own', async () => {
    const a = await tab();
    const b = await tab();
    expect(await claimWorker(a, 'UC1', false)).toBe(true);
    expect(await claimWorker(b, 'UC1', false)).toBe(false); // two tabs on one channel: one worker
    expect(await claimWorker(a, 'UC1', false)).toBe(true); // renewing
    expect(await claimWorker(b, 'UC2', false)).toBe(true);
  });

  it('force takes it (isWorker(true)); a closed tab, or one gone to another channel, frees it', async () => {
    const a = await tab();
    const b = await tab();
    await claimWorker(a, 'UC1', false);
    expect(await claimWorker(b, 'UC1', true)).toBe(true);
    expect(await claimWorker(a, 'UC1', false)).toBe(false);
    await claimWorker(b, 'UC2', false); // b's page is on UC2 now
    expect(await claimWorker(a, 'UC1', false)).toBe(true);
    registerRunnerLock();
    await fakeBrowser.tabs.onRemoved.trigger(a, { windowId: 1, isWindowClosing: false });
    await vi.waitFor(async () => expect(await claimWorker(b, 'UC1', false)).toBe(true));
  });
```
Run: `npx vitest run tests/runner-lock.test.ts`
(Add `claimWorker` to the file's import from `../lib/runner-lock`.)
Expected: FAIL (`runnerHolds` and `claimWorker` missing; jobs not kept).

- [ ] **Step 2: Implement the jobs in `runner-lock.ts`**

```ts
// One automation lock for every job that drives Studio (D21): the upload queue ('queue') and
// the copyright jobs that change pages — trim, ads, Collab runs ('claims'). The holder's tab id
// and its jobs live in storage.session … (keep the rest of the file's header comment)
const KEY = 'runnerTabId';
export const JOBS_KEY = 'runnerJobs';
export type Job = 'queue' | 'claims';
export const isJob = (v: unknown): v is Job => v === 'queue' || v === 'claims';

interface Holder { id: number; jobs: Job[] }
async function holder(): Promise<Holder | null> {
  const got = await browser.storage.session.get([KEY, JOBS_KEY]);
  const id = got[KEY];
  if (typeof id !== 'number') return null;
  const onStudio = await browser.tabs.get(id).then((t) => isStudioUrl(t?.url), () => false);
  if (!onStudio) {
    await browser.storage.session.remove([KEY, JOBS_KEY]);
    return null;
  }
  // A lock written before jobs existed was the queue's.
  const jobs = Array.isArray(got[JOBS_KEY]) ? (got[JOBS_KEY] as unknown[]).filter(isJob) : ['queue' as Job];
  return { id, jobs };
}

export const acquireRunner = (tabId: number, job: Job) =>
  serial(async () => {
    const h = await holder();
    if (h && h.id !== tabId) return false;
    const jobs = h ? [...new Set([...h.jobs, job])] : [job];
    await browser.storage.session.set({ [KEY]: tabId, [JOBS_KEY]: jobs });
    return true;
  });

export const releaseRunner = (tabId: number, job: Job | 'all') =>
  serial(async () => {
    const h = await holder();
    if (!h || h.id !== tabId) return;
    const jobs = job === 'all' ? [] : h.jobs.filter((j) => j !== job);
    if (jobs.length) await browser.storage.session.set({ [JOBS_KEY]: jobs });
    else await browser.storage.session.remove([KEY, JOBS_KEY]);
  });

// Another tab holds the lock — for `job`, or for anything ('any').
export const runnerElsewhere = (tabId: number, job: Job | 'any') =>
  serial(async () => {
    const h = await holder();
    return !!h && h.id !== tabId && (job === 'any' || h.jobs.includes(job));
  });

// This tab holds the lock for `job` (a page back after its own reload asks).
export const runnerHolds = (tabId: number, job: Job) =>
  serial(async () => {
    const h = await holder();
    return !!h && h.id === tabId && h.jobs.includes(job);
  });

export const runnerHeld = () => serial(async () => (await holder()) !== null);
```
The worker lease, after `runnerHeld` (same `serial` queue):
```ts
// One worker per channel (D21), the userscript's tab lease tabLock:<ch> (5043–5062): the first
// live Studio tab on the channel that asks; `force` takes it (isWorker(true), a run started there).
// A tab is the worker of one channel at most: asking for another lets the old one go.
export const WORKERS_KEY = 'claimsWorkers';
const liveStudio = (id: number) => browser.tabs.get(id).then((t) => isStudioUrl(t?.url), () => false);
export const claimWorker = (tabId: number, ch: string, force: boolean) =>
  serial(async () => {
    const got = (await browser.storage.session.get(WORKERS_KEY))[WORKERS_KEY];
    const w: Record<string, number> = got && typeof got === 'object' ? { ...(got as Record<string, number>) } : {};
    for (const [c, id] of Object.entries(w)) if (id === tabId && c !== ch) delete w[c];
    const cur = w[ch];
    const mine = force || cur === tabId || cur === undefined || !(await liveStudio(cur));
    if (mine) w[ch] = tabId;
    await browser.storage.session.set({ [WORKERS_KEY]: w });
    return mine;
  });
const dropWorker = (tabId: number) =>
  serial(async () => {
    const got = (await browser.storage.session.get(WORKERS_KEY))[WORKERS_KEY] as Record<string, number> | undefined;
    if (!got) return;
    const w = Object.fromEntries(Object.entries(got).filter(([, id]) => id !== tabId));
    await browser.storage.session.set({ [WORKERS_KEY]: w });
  });
```
`registerRunnerLock()` releases `'all'` and calls `dropWorker(tabId)` on `tabs.onRemoved`.

- [ ] **Step 3: Messages and the background**

`messages.ts` (`import type { Job } from './runner-lock';`):
```ts
  // the one automation lock (D21; the sender's tab is the asker)
  'runner:acquire'(job: Job): boolean;
  'runner:release'(job: Job | 'all'): void;
  'runner:elsewhere'(job: Job | 'any'): boolean;
  'runner:holds'(job: Job): boolean;
  // the channel's copyright worker (the userscript's tab lease)
  'runner:worker'(d: { ch: string; force: boolean }): boolean;
```
`background.ts`:
```ts
  onMessage('runner:acquire', ({ data, sender }) => acquireRunner(tabOf(sender), isJob(data) ? data : 'queue'));
  onMessage('runner:release', ({ data, sender }) => releaseRunner(tabOf(sender), isJob(data) ? data : 'all'));
  onMessage('runner:elsewhere', ({ data, sender }) => runnerElsewhere(tabOf(sender), isJob(data) ? data : 'any'));
  onMessage('runner:holds', ({ data, sender }) => runnerHolds(tabOf(sender), isJob(data) ? data : 'queue'));
  onMessage('runner:worker', ({ data, sender }) => {
    const d = data as { ch?: unknown; force?: unknown } | null;
    if (typeof d?.ch !== 'string' || !/^[\w-]{1,64}$/.test(d.ch)) throw new Error('runner:worker: malformed');
    return claimWorker(tabOf(sender), d.ch, d.force === true);
  });
```

- [ ] **Step 4: The queue names its job; a lost bfcache lock aborts (failing tests first)**

In `extension/tests/queue-sync.test.ts`, the fake `sendMessage` records `type + ':' + JSON.stringify(data)`; update `'releases a lock left by a reload first…'` to expect `['runner:release:"queue"', 'runner:elsewhere:"queue"']` (and adjust the other assertions on `sent` the same way). Add:
```ts
describe('back from the back/forward cache', () => {
  it('another tab took the lock meanwhile: the run aborts at once', async () => {
    const target = new EventTarget();
    const abort = vi.fn();
    const stop = watchLockLifecycle(target, {
      release: () => {}, acquire: async () => false, running: () => true, abort, toast: (m) => void toasts.push(m),
    });
    const show = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(show, 'persisted', { value: true });
    target.dispatchEvent(show);
    await vi.waitFor(() => expect(abort).toHaveBeenCalled());
    expect(toasts).toEqual(['Another Studio tab is already running the queue']);
    stop();
  });
});
```
In `extension/tests/queue-run-flow.test.ts`, after `describe('a run after teardown', …)`:
```ts
// Back from the back/forward cache while another tab took the lock (queue-sync abort).
describe('a run that lost the lock', () => {
  afterEach(() => Q.abortRun(null));

  it('stops at its next status change: no Save click, no next item, and no more saves from this tab', async () => {
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    const ui = createContentUi();
    setPageUi(ui);
    ui.setConfirmed(true);
    setBridge({ getFile: async (id: string) => new File(['x'], id) });
    const click = vi.fn();
    studio.click = click;
    studio.onVisibility = () => Q.abortRun(new Error('Another Studio tab is already running the queue'));
    await expect(Q.runQueue()).rejects.toThrow('Another Studio tab is already running the queue');
    expect(click).not.toHaveBeenCalled();
    expect(D.closeStudioUploadDialog).not.toHaveBeenCalled(); // its upload stays a draft in Studio
    expect(Q.queue[1]!.status).toBe('pending');
    expect(Q.otherTabRunning()).toBe(true); // this tab's queue saves are blocked from now on
  });
});
```
Run: `npx vitest run tests/queue-sync.test.ts tests/queue-run-flow.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement**

`queue-sync.ts`:
- `elsewhere()`: `sendMessage('runner:elsewhere', 'queue')`.
- `resumeQueue()`: `sendMessage('runner:release', 'queue')` — a reload ends a queue run, but a copyright job (a trim run that changes pages) keeps the lock (D21).
- `watchLockLifecycle`: the dependency `stop(): void` becomes `abort(): void`, and the failed re-acquire calls `d.abort()` instead of `d.stop()`; update its comment: "…with its run still going, it takes the lock again, or, when another tab took it meanwhile, aborts the run at once: the other tab already cut this tab's in-flight item to 'interrupted' (its upload stays a draft in Studio), so nothing is uploaded twice and no release slot is shared (closes 3b R-M3)."

`queue-runner.ts` (outside ports, next to `setTornDown`):
```ts
// Back from the back/forward cache while another tab took the runner lock (queue-sync
// watchLockLifecycle): this run must not go on beside that one. Like a teardown, the next
// status change throws (content-ui item()); this tab's saves stop, as for any mirror tab.
let aborted: Error | null = null;
export const abortedRun = () => aborted;
// null clears it (a later Start in this tab is a fresh run; tests).
export function abortRun(err: Error | null): void {
  aborted = err;
  if (!err) return;
  otherTabRuns = true;
  stopReq = true;
}
```
and in `uploadCurrent()` after the `torn` check: `if (aborted) throw aborted;`. Clear it when the panel starts a run: first line of `startQueue()`: `aborted = null;`.

`content-ui.ts` `item(it)`: after the torn-down check add `const a = abortedRun(); if (a) throw a;` (import `abortedRun`).

`studio.content.ts`:
```ts
    const releaseLock = () => void sendMessage('runner:release', 'queue').catch(() => {});
    const acquireLock = () => sendMessage('runner:acquire', 'queue')
      .then((ok) => (ok && setOtherTabRuns(false), ok))
      .catch((e) => (console.error('[ytup] runner lock', e), false));
```
`watchLockLifecycle(window, { release: releaseLock, acquire: acquireLock, running: () => running, abort: () => abortRun(new Error(L('มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่', 'Another Studio tab is already running the queue'))), toast: (m) => ui.toast(m) })`; and the teardown `stop.add(() => { offLock(); requestStop(); void sendMessage('runner:release', 'all').catch(() => {}); });`.

- [ ] **Step 6: The panel knows the holder's jobs (failing tests first)**

`extension/tests/panel-target.test.ts`, in the `runnerTab` test:
```ts
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    expect(await runnerTab()).toEqual({ tabId: 9, windowId: 2, title: 'A', jobs: ['claims'] });
```
(and the existing `{ tabId: 9, windowId: 2, title: 'A' }` expectation gets `jobs: ['queue']` — no `runnerJobs` stored).

`extension/tests/panel-shell.test.tsx`:
```ts
  it('another tab busy with copyright work: its own banner, and Start is disabled', () => {
    renderPanel(<><Banners /><QueueFooter /></>, fakePanel({ runner: { tabId: 2, windowId: 1, title: 'B', jobs: ['claims'] }, busyElsewhere: true, view: viewWith([{}]) }));
    expect(screen.getByText('Another Studio tab is busy with copyright work — wait for it, or press Stop in the Copyright tab')).toBeTruthy();
    expect(screen.queryByText('Another Studio tab is running the queue — change the queue there')).toBe(null);
    expect((screen.getByRole('button', { name: /Start/ }) as HTMLButtonElement).disabled).toBe(true);
  });
```
(`fakePanel` gets `busyElsewhere: false` by default; `RunnerTab` fixtures elsewhere in the tests get `jobs: ['queue']`.)

Implement:
- `lib/panel/target.ts`: `export interface RunnerTab { tabId: number; windowId: number; title: string; jobs: Job[] }`; `runnerTab()` reads `['runnerTabId', 'runnerJobs']` and returns `jobs` (missing → `['queue']`, filtered with `isJob`); `watchRunner` also fires when `'runnerJobs' in changes`. (Import `isJob`/`Job` from `../runner-lock` — a pure module for the panel's purposes: it imports only `wxt/browser` and `panel-scope`.)
- `panel.tsx`: `sameRunner` compares `jobs.join()`; `PanelApi` gets `busyElsewhere: boolean`; `api` sets `elsewhere: !!runner && runner.tabId !== target?.tabId && runner.jobs.includes('queue')` and `busyElsewhere: !!runner && runner.tabId !== target?.tabId`. Defaults in `PanelContext`: `busyElsewhere: false`.
- `QueueFooter.tsx`: the Start button's `disabled` uses `busyElsewhere` in place of `elsewhere` (Stop keeps `elsewhere`: it stops a queue run only).
- `Banners.tsx`: after the queue banner:
```tsx
      {!elsewhere && busyElsewhere && runner && (
        <Banner icon="shield" text={L('แท็บ Studio อื่นกำลังทำงานด้านลิขสิทธิ์อยู่ — รอให้เสร็จ หรือกดหยุดในแท็บลิขสิทธิ์', 'Another Studio tab is busy with copyright work — wait for it, or press Stop in the Copyright tab')}>
          <Button size="sm" onClick={goToRunner}>{L('ไปที่แท็บนั้น', 'Go to that tab')}</Button>
        </Banner>
      )}
```
- `extension-only.mjs`:
```js
  { th: 'แท็บ Studio อื่นกำลังทำงานด้านลิขสิทธิ์อยู่ — รอให้เสร็จ หรือกดหยุดในแท็บลิขสิทธิ์', en: 'Another Studio tab is busy with copyright work — wait for it, or press Stop in the Copyright tab', why: 'one automation lock for the queue and the copyright jobs (D21); the userscript let a trim in one tab run beside an upload in another' },
```

- [ ] **Step 7: README**

Item 39, "Leave Studio mid-run, then Back": replace "If another tab started a run meanwhile, the restored page toasts "Another Studio tab is already running the queue" and stops after its current video. Known overlap (accepted, Phase 4 lock work): … No item is uploaded twice." with "If another tab started a run meanwhile, the restored page toasts "Another Studio tab is already running the queue" and stops at once: its video stays a draft in Studio (the other tab shows it as interrupted), and only the other tab uploads."

- [ ] **Step 8: Verify and commit**

Run: `npm run check && npm run build`
```bash
git add extension/lib/runner-lock.ts extension/lib/messages.ts extension/entrypoints/background.ts extension/entrypoints/studio.content.ts extension/lib/studio/queue-sync.ts extension/lib/studio/queue-runner.ts extension/lib/studio/content-ui.ts extension/lib/panel/target.ts extension/entrypoints/sidepanel/panel.tsx extension/entrypoints/sidepanel/shell/Banners.tsx extension/entrypoints/sidepanel/tabs/QueueFooter.tsx extension/scripts/strings/extension-only.mjs extension/README.md extension/tests/runner-lock.test.ts extension/tests/queue-sync.test.ts extension/tests/queue-run-flow.test.ts extension/tests/panel-target.test.ts extension/tests/panel-shell.test.tsx extension/tests/panel-fake.tsx
git commit -m "One automation lock: the queue and the copyright jobs share it; a page back from the cache that lost it stops at once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: youtubei through the MAIN world, and the channel's scheduled videos for the scheduler

Deferred item 9: the queue avoids the channel's existing scheduled videos (`takenSlots`), as the userscript did through `Claims.listScheduled`.

**Files:**
- Create: `extension/lib/main-youtubei.ts`, `extension/lib/claims/youtubei.ts`, `extension/lib/claims/claims.ts`, `extension/lib/claims/wiring.ts`, `extension/scripts/port/main-youtubei.mjs`, `extension/scripts/port/claims.mjs`, `extension/tests/claims-youtubei.test.ts`
- Modify: `extension/lib/main-ops.ts`, `extension/entrypoints/studio-main.content.ts`, `extension/lib/studio/channel.ts`, `extension/entrypoints/studio.content.ts`
- Test: `extension/tests/channel.test.ts`

**Interfaces:**
- Consumes: `rpcClient` (its `timeoutMs` argument), `refreshCfg`, `setClaims` / `refreshChanSched` / `takenSlots` (`queue-runner.ts`), `load` / `save` (`lib/claims/store.ts`).
- Produces: `MainOps.youtubei(path: string, body: Record<string, unknown>): unknown`; `YTI_PATHS`, `NO_SAPISID` (`main-ops.ts`); `youtubei(path, body)` (`main-youtubei.ts`); `setYoutubei(call | null)`, `yti(path, body): Promise<any>` (`lib/claims/youtubei.ts`); `cachedCfg(key)` (`channel.ts`); `currentChannel()`, `channelName()`, `chGet`, `chSet`, `listScheduled()` (`claims.ts`); `wireClaims(call): () => void` (`wiring.ts`): sets `yti`'s call and `setClaims({ listScheduled })`, returns the undo.

- [ ] **Step 1: Write the failing tests**

`extension/tests/claims-youtubei.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listScheduled } from '../lib/claims/claims';
import { useMemoryClaims } from '../lib/claims/store';
import { setYoutubei, yti } from '../lib/claims/youtubei';
import { NO_SAPISID, YTI_PATHS } from '../lib/main-ops';
import { youtubei } from '../lib/main-youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';

const NOW = Date.UTC(2026, 9, 9, 12);
beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubGlobal('location', { pathname: '/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos' });
  useMemoryClaims();
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: 'UCaaaaaaaaaaaaaaaaaaaaaa', INNERTUBE_CONTEXT: { client: {} } }));
});
afterEach(() => {
  setYoutubei(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('youtubei in the MAIN world', () => {
  it('answers only the copyright endpoints', async () => {
    await expect(youtubei('account/delete', {})).rejects.toThrow('youtubei: account/delete is not allowed');
    expect(YTI_PATHS).toContain('creator/list_creator_received_claims');
  });

  it('a missing SAPISID cookie becomes a sentence in the tab', async () => {
    setYoutubei(async () => { throw new Error(NO_SAPISID); });
    await expect(yti('creator/list_creator_videos', {})).rejects.toThrow('Not signed in (SAPISID cookie not found)');
  });

  it('a call before the MAIN world is wired says Studio is still loading', async () => {
    await expect(yti('creator/list_creator_videos', {})).rejects.toThrow("Studio hasn't finished loading — try again in a few seconds");
  });
});

describe('listScheduled (the queue avoids these slots)', () => {
  it("lists the channel's future scheduled videos, earliest first", async () => {
    const call = vi.fn(async (_path: string, body: Record<string, unknown>) => (body.pageToken ? { videos: [] } : {
      videos: [
        { videoId: 'v1', title: 'Later', scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW + 7200e3) / 1000), status: 'SCHEDULED_PUBLISHING_STATUS_SCHEDULED' }] } },
        { videoId: 'v2', title: 'Sooner', scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW + 3600e3) / 1000), status: 'X_SCHEDULED' }] } },
        { videoId: 'v3', title: 'Past', scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW - 1e3) / 1000), status: 'X_SCHEDULED' }] } },
        { videoId: 'v4', title: 'Live' },
      ],
      nextPageToken: 't2',
    }));
    setYoutubei(call);
    expect(await listScheduled()).toEqual([
      { videoId: 'v2', title: 'Sooner', at: NOW + 3600e3 },
      { videoId: 'v1', title: 'Later', at: NOW + 7200e3 },
    ]);
    expect(call.mock.calls[0]![1]).toMatchObject({ filter: { and: { operands: [{ channelIdIs: { value: 'UCaaaaaaaaaaaaaaaaaaaaaa' } }, {}] } }, pageSize: 50 });
  });

  it('nothing until Studio has its context', async () => {
    resetCfg();
    expect(await listScheduled()).toBe(null);
  });
});
```
Deferred item 9 is one line of wiring (the runner's `setClaims` / `refreshChanSched` / `takenSlots` hooks already exist on HEAD and are tested): the test drives that wiring, which the content script calls (`wireClaims`), so dropping it fails the suite. Append to `extension/tests/claims-youtubei.test.ts`:
```ts
import * as Q from '../lib/studio/queue-runner';
import { wireClaims } from '../lib/claims/wiring';

describe('wireClaims (deferred item 9: the schedule avoids the channel\'s scheduled videos)', () => {
  it("gives the queue runner the copyright module's listScheduled, over Studio's API; undone on teardown", async () => {
    const call = vi.fn(async () => ({ videos: [{ videoId: 'v', title: 'T',
      scheduledPublishingDetails: { scheduledPublishings: [{ scheduledTimeSeconds: String((NOW + 3600e3) / 1000), status: 'X_SCHEDULED' }] } }] }));
    const off = wireClaims(call);
    expect(Q.Claims?.listScheduled).toBe(listScheduled);
    expect(await Q.Claims!.listScheduled!()).toEqual([{ videoId: 'v', title: 'T', at: NOW + 3600e3 }]);
    expect(call).toHaveBeenCalledWith('creator/list_creator_videos', expect.any(Object));
    off();
    expect(Q.Claims).toBe(null);
    await expect(yti('creator/list_creator_videos', {})).rejects.toThrow("Studio hasn't finished loading");
  });
});
```
Run: `npx vitest run tests/claims-youtubei.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: `main-ops.ts` and the MAIN-world port**

Append to `extension/lib/main-ops.ts`:
```ts
// Studio's internal API, for the copyright module (D22): MAIN-world ytcfg and cookies.
export type MainOpsYoutubei = { youtubei(path: string, body: Record<string, unknown>): unknown };
// The endpoints the copyright module calls (user.js 4722, 4748, 4784, 4796, 5373, 5789, 6026).
export const YTI_PATHS = [
  'creator/list_creator_videos', 'creator/list_creator_received_claims',
  'copyright/get_creator_received_claim_matches', 'creator/get_creator_videos',
] as const;
// authHeader()'s "not signed in" (4657): the MAIN world has no language, the tab says it in L().
export const NO_SAPISID = 'ytup:no-sapisid';
```
and make `MainOps` include it: `export type MainOps = { getCfg(keys: string[]): Record<string, unknown> } & MainOpsYoutubei;`.

`extension/scripts/port/main-youtubei.mjs`:
```js
// lib/main-youtubei.ts ← authHeader + yti (Studio's /youtubei/v1 calls), run in the MAIN world:
// they need ytcfg and the page's cookies. The "not signed in" sentence is said by the tab.
export default {
  file: 'lib/main-youtubei.ts',
  regions: ['4655-4661', '4663-4683'],
  subs: [
    ["throw new Error(L('ไม่ได้ล็อกอิน (ไม่พบคุกกี้ SAPISID)', 'Not signed in (SAPISID cookie not found)'));", 'throw new Error(NO_SAPISID);', 1],
  ],
};
```
```bash
{ cat <<'EOF'
import { NO_SAPISID, YTI_PATHS } from './main-ops';

// Runs in Studio's MAIN world (studio-main.content.ts): the copyright module's calls to Studio's
// own API (/youtubei/v1). `W` / `ycfg` as the userscript had them (4621–4622).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W = window as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ycfg = (k: string): any => W.ytcfg && W.ytcfg.get(k);

EOF
  echo '// @port-begin'; port main-youtubei; echo '// @port-end'; cat <<'EOF'

// What the MAIN world serves: the allowlisted endpoints only (D22). The page could call the API
// itself; this script just answers nothing else.
export async function youtubei(path: string, body: Record<string, unknown>): Promise<unknown> {
  if (!(YTI_PATHS as readonly string[]).includes(path)) throw new Error(`youtubei: ${path} is not allowed`);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('youtubei: the body must be an object');
  return yti(path, body);
}
EOF
} > lib/main-youtubei.ts
```
Types inside the port: `async function authHeader(): Promise<string>`, `async function yti(path: string, body: Record<string, unknown>)`, `const headers: Record<string, string> = {`.

`extension/entrypoints/studio-main.content.ts`:
```ts
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { youtubei } from '@/lib/main-youtubei';
import { rpcServe, windowEndpoint } from '@/lib/rpc';
…
    const handlers: MainOps = {
      getCfg: (keys) => Object.fromEntries(keys.map((k) => [k, w.ytcfg?.get(k)])),
      youtubei: (path, body) => youtubei(path, body),
    };
```

- [ ] **Step 3: `yti()` in the tab, and ytcfg's context**

`extension/lib/claims/youtubei.ts`:
```ts
import { L } from '../i18n';
import { NO_SAPISID } from '../main-ops';

// yti() as the copyright module calls it in the Studio tab: through the MAIN world
// (studio.content.ts sets the call through wireClaims; its rpcClient times out after 30 s, D22).
type Call = (path: string, body: Record<string, unknown>) => Promise<unknown>;
let call: Call | null = null;
export const setYoutubei = (c: Call | null) => { call = c; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function yti(path: string, body: Record<string, unknown>): Promise<any> {
  if (!call) throw new Error(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', "Studio hasn't finished loading — try again in a few seconds"));
  try {
    return await call(path, body);
  } catch (e) {
    if ((e as Error)?.message === NO_SAPISID) throw new Error(L('ไม่ได้ล็อกอิน (ไม่พบคุกกี้ SAPISID)', 'Not signed in (SAPISID cookie not found)'));
    throw e;
  }
}
```
`extension/lib/studio/channel.ts` (outside the port block):
```ts
// ytcfg lives in the page's MAIN world. The content script copies what the page code needs into
// `cfg` (refreshCfg): CHANNEL_ID for getChannel(), and INNERTUBE_CONTEXT, which the copyright
// module checks to know Studio has loaded (ycfg('INNERTUBE_CONTEXT'), user.js 4737 / 4763 / 6316).
export const CFG_KEYS = ['CHANNEL_ID', 'INNERTUBE_CONTEXT'];
…
    Object.assign(cfg, await read(CFG_KEYS));
…
// ycfg(key) as last copied (refreshCfg), for the copyright module.
export const cachedCfg = (key: string): unknown => cfg[key];
```
(`tests/channel.test.ts` keeps passing: its fake answers every key asked for. Add one assertion to its "falls back to ytcfg" test: `expect(cachedCfg('INNERTUBE_CONTEXT')).toBe('UCfromytcfg12345');`.)

- [ ] **Step 4: `claims.ts`, first cut (port `claims`)**

`extension/scripts/port/claims.mjs`:
```js
// lib/claims/claims.ts ← the copyright module (the Claims IIFE, user.js 4592–6357) as page code:
// its closure's variables are this module's. Storage goes through the claims store (one writer,
// D20), ytcfg is the copy refreshCfg made, the drawer UI is the side panel's (ClaimsUi).
// Task 5: the channel, its keys, and listScheduled (for the queue's schedule).
export default {
  file: 'lib/claims/claims.ts',
  regions: ['4623-4629', '4633-4636', '4736-4759'],
  subs: [],
};
```
```bash
{ cat <<'EOF'
import { cachedCfg, chanLabel, getChannel } from '../studio/channel';
import { load, save } from './store';
import { yti } from './youtubei';

// The userscript's copyright module (user.js 4592–6357) as page code: its closure's variables
// are this module's. Reads come from the claims store (lib/claims/store.ts); writes go to the
// background as ops (D20). ycfg is ytcfg as refreshCfg last copied it from the MAIN world.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ycfg = (k: string): any => cachedCfg(k);

EOF
  echo '// @port-begin'; port claims; echo '// @port-end'; printf '\nexport { currentChannel, channelName, chGet, chSet, listScheduled };\n'; } > lib/claims/claims.ts
```
Types: `function currentChannel(): string`, `const chGet = <T>(name: string, def: T, ch = currentChannel()): T =>`, `const chSet = (name: string, val: unknown, ch = currentChannel()) =>`, `let countsAt = 0;`, `let countsCache: ClaimsCounts | null = null;` (import the type), `async function listScheduled(): Promise<{ videoId: string; title: string; at: number }[] | null>` with `const out: { videoId: string; title: string; at: number }[] = []; let tok: string | undefined, pages = 0;` and `const body: Record<string, unknown> = {`.

- [ ] **Step 5: Wire it in `studio.content.ts`**

After `await initState()` (and its `ctx.isInvalid` check):
```ts
    // The copyright data (per channel; one writer, the background) and Studio's own API.
    await initClaimsStore();
    stop.add(disposeClaimsStore);
    // Studio's API for the copyright module (its own client: 30 s, the userscript's fetch had no
    // timeout; getCfg keeps 10 s, D22), and the queue's schedule avoids the channel's scheduled
    // videos (refreshChanSched, user.js 1899).
    const yt = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH, 30_000);
    stop.add(() => yt.dispose('extension reloaded'));
    stop.add(wireClaims((path, body) => yt('youtubei', path, body)));
```
(imports: `initClaimsStore`, `disposeClaimsStore` from `@/lib/claims/store`; `wireClaims` from `@/lib/claims/wiring`. Two `rpcClient`s on one channel don't mix answers: each keeps only the ids it sent.)

`extension/lib/claims/wiring.ts`:
```ts
import { setClaims } from '../studio/queue-runner';
import { listScheduled } from './claims';
import { setYoutubei } from './youtubei';

// The Studio content script's link from the copyright module to Studio's API (through the MAIN
// world), and from the queue's schedule to the channel's scheduled videos (refreshChanSched asked
// Claims.listScheduled, user.js 1899). Returns the undo for the content script's teardown.
export function wireClaims(call: (path: string, body: Record<string, unknown>) => Promise<unknown>): () => void {
  setYoutubei(call);
  setClaims({ listScheduled });
  return () => {
    setYoutubei(null);
    setClaims(null);
  };
}
``` Narrow `ClaimsHooks.listScheduled`'s return to the richer type by leaving `queue-runner.ts`'s `{ videoId: string; at: number }[]` as is — `{ videoId, title, at }` is assignable.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/claims-youtubei.test.ts tests/queue-view.test.ts tests/channel.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

Run: `npm run check && npm run build`
Expected: port-check `ok   main-youtubei`, `ok   claims`.
```bash
git add extension/lib/main-ops.ts extension/lib/main-youtubei.ts extension/lib/claims/youtubei.ts extension/lib/claims/claims.ts extension/lib/studio/channel.ts extension/entrypoints/studio-main.content.ts extension/entrypoints/studio.content.ts extension/scripts/port/main-youtubei.mjs extension/scripts/port/claims.mjs extension/lib/claims/wiring.ts extension/tests/claims-youtubei.test.ts extension/tests/channel.test.ts
git commit -m "youtubei through the MAIN world; the queue's schedule avoids the channel's scheduled videos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Scans, status and log in the Studio tab; `claims:state` to every panel

Deferred item 4: the copyright state reaches the panel from the bound tab, or from the tab holding the lock for a copyright job.

**Files:**
- Create: `extension/lib/claims/page.ts`, `extension/tests/claims-scan.test.ts`, `extension/tests/claims-status.test.ts`, `extension/tests/claims-page.test.ts`
- Modify: `extension/scripts/port/claims.mjs`, `extension/lib/claims/claims.ts`, `extension/lib/messages.ts`, `extension/entrypoints/studio.content.ts`, `extension/lib/studio/fab.ts`, `extension/lib/panel/bus.ts`, `extension/entrypoints/sidepanel/panel.tsx`, `extension/entrypoints/sidepanel/shell/ActivityBar.tsx`, `extension/tests/panel-fake.tsx`
- Test: `extension/tests/panel-provider.test.tsx`, `extension/tests/panel-shell.test.tsx`, `extension/tests/fab.test.ts`

**Interfaces:**
- Consumes: Task 5's `claims.ts`; `write` / `load` (`store.ts`); `running`, `otherTabRunning`, `queue`, `uploadOf` (`queue-runner.ts`); `sleep` (`automation.ts`); `DEFAULTS`, `claimInfo`, `short`, `privacyOf` (`core.ts`).
- Produces:
  - `claims.ts`: `interface ClaimsUi { show(view: ClaimsView): void; status(): void; log(msg: string, type: string): void; toast(msg: string): void }`, `setClaimsUi(u | null)`, `cfg()`, `scanClaims({ show? })`, `scanAds({ show? })`, `scanCollab()`, `computeStatus(): ClaimsStatus`, `claimsState(): ClaimsState`, `claimsStatus(): ClaimsStatus | null` (for the FAB; never throws), `log(msg, type?)`, `startScan(what: unknown): void`, `getSongs()`, `chMerge`, `chList`, `chRunItem`, `getRun`, `getAdsRun`, `getCollabRun`, `fuGet`, `fuCount`, `getAP`, `scanning`, `adsScanning`, `collabScanning`, `workerHere`, `studioIsEnglish`.
  - `page.ts`: `createClaimsPage(d: { send?, toast(msg): void; refreshCfg(): Promise<void> }): { ui: ClaimsUi; tick(): void; dispose(): void }`.
  - `messages.ts`: `'claims:view'(): ClaimsState`, `'claims:scan'(what: 'claims' | 'ads' | 'collab'): void`, `'claims:state'(s: ClaimsState): void`, `'claims:log'(l: ClaimsLogLine): void`, `'claims:show'(view: ClaimsView): void`.
  - `bus.ts`: `onClaimsState(fn)`, `onClaimsLog(fn)`, `onClaimsShow(fn)`.
  - `panel.tsx`: `interface ClaimsApi { state: ClaimsState | null; live: ClaimsState | null; log: ClaimsLogLine[]; shown: { view: ClaimsView; n: number } | null; addLog(msg: string, type?: string): void }`, `ClaimsContext`, `useClaims()`.

- [ ] **Step 1: Grow the port to the 4a regions**

Replace `extension/scripts/port/claims.mjs`'s `regions` / `subs` with (counts checked against the pinned userscript):
```js
  // 4a: the channel, its keys, counts, the three scans, the run / follow-up / Auto-pilot getters
  // the status reads, the status card and the log. 4b grows it to the whole module.
  regions: ['4605-4606', '4617-4617', '4623-4629', '4633-4653', '4710-4759', '4761-4837', '5066-5066', '5254-5259', '5261-5287',
    '5458-5465', '5467-5484', '5654-5655', '5742-5743', '5770-5770', '5772-5773', '5823-5824', '5846-5846', '6107-6120', '6122-6170', '6174-6180'],
  replaceLines: [
    // the log box is the side panel's: the line goes there (claims:log)
    { lines: '6177-6179', to: '      cui.log(msg, type);' },
  ],
  subs: [
    // the claim / ads / Collab lists are the side panel's views: it opens them when the scan ends
    ['if (show) showClaims();', "if (show) cui.show('claims');", 1],
    ['if (show) showAds();', "if (show) cui.show('ads');", 1],
    ['        showCollab();', "        cui.show('collab');", 1],
    // built when used, after initI18n() (as STATUS in queue-runner)
    ['const ADS_STEPS = [', 'const ADS_STEPS = () => [', 1],
    ['const COLLAB_STEPS = [', 'const COLLAB_STEPS = () => [', 1],
    ['const TRIM_STEPS = [', 'const TRIM_STEPS = () => [', 1],
    ['steps: ADS_STEPS,', 'steps: ADS_STEPS(),', 1],
    ['steps: COLLAB_STEPS,', 'steps: COLLAB_STEPS(),', 1],
    ['steps: TRIM_STEPS,', 'steps: TRIM_STEPS(),', 1],
  ],
```
Re-print and rebuild `claims.ts` keeping Task 5's head, then the head below, the port block, the tail below. Print with `node scripts/port-check.mjs --print claims`.

Head additions (above `// @port-begin`):
```ts
import { L } from '../i18n';
import { sleep } from '../studio/automation';
import { otherTabRunning, queue, running, uploadOf } from '../studio/queue-runner';
import { claimInfo, DEFAULTS, privacyOf, short } from './core';
import { load, save, write } from './store';
import type { Autopilot, ClaimRow, ClaimsCounts, ClaimsState, ClaimsStatus, ClaimsView, FollowUp, Run, Songs } from './types';

// The drawer's side of the module, now the side panel's: the Studio content script sets it
// (lib/claims/page.ts); tests set a recorder; until then nothing happens.
export interface ClaimsUi {
  show(view: ClaimsView): void; // showClaims() / showAds() / showCollab() after a scan
  status(): void; // renderStatus(): the state changed
  log(msg: string, type: string): void; // a line in the activity log
  toast(msg: string): void;
}
const quiet: ClaimsUi = { show() {}, status() {}, log() {}, toast() {} };
let cui: ClaimsUi = quiet;
export const setClaimsUi = (u: ClaimsUi | null) => { cui = u ?? quiet; };
const renderStatus = () => cui.status();

// The userscript's uploadBusy() (1723) looked at its own tab's queue, kept in memory and gone on
// reload. The queue is shared and stored now, so the copyright module asks it this way:
//  - a run in another Studio tab is that tab's (this tab's page changes wait for the lock instead);
//  - failed items don't hold copyright work back (they'd block it in every tab until removed);
//  - waiting and in-flight items do, as in the userscript: their upload needs the page.
// While it holds, the status card says so ("⏸ Waiting for the upload queue…").
const uploadBusy = () => running || (!otherTabRunning() && queue.some((i) => ['pending', 'uploading', 'review'].includes(i.status)));
```
Tail (below `// @port-end`):
```ts
// recordSongs() (5069–5091) is a background op now (songs.ts); the tab logs what it added.
function recordSongs(rows: ClaimRow[], chName: string): void {
  const before = Object.keys(getSongs()).length;
  write({ op: 'songs', songs: { fn: 'record', rows, chName, now: new Date().toISOString() } });
  invalidateCounts();
  const added = Object.keys(getSongs()).length - before;
  if (added) log(L(`🎵 เพิ่มเพลงใหม่ ${added} เพลงในประวัติ`, `🎵 Added ${added} new songs to history`), 'ok');
}

// Partial writes, one op each (D20): what the userscript did with chGet → change → chSet.
const chMerge = (name: string, entries: Record<string, unknown>, ch = currentChannel()) => {
  invalidateCounts();
  write({ op: 'merge', key: name + ':' + ch, entries });
};
const chList = (name: string, d: { add?: string[]; del?: string[] }, ch = currentChannel()) => {
  invalidateCounts();
  write({ op: 'list', key: name + ':' + ch, ...d });
};
const chRunItem = (name: string, by: 'key' | 'videoId', id: string, state: string, msg: string, onlyActive = false, ch = currentChannel()) =>
  write({ op: 'runItem', key: name + ':' + ch, by, id, state, msg, onlyActive });

// What renderStatus() (6219–6256) read, for the side panel (claims:state / claims:view).
export function claimsState(): ClaimsState {
  const active = (r: Run | null) => !!(r && r.active);
  return {
    channel: currentChannel(),
    channelName: channelName(),
    ready: !!ycfg('INNERTUBE_CONTEXT'),
    english: studioIsEnglish(),
    uploadBusy: uploadBusy(),
    status: computeStatus(),
    counts: getCounts(),
    busyRun: active(getRun()) || active(getAdsRun()) || active(getCollabRun()),
    busyScan: scanning || adsScanning || collabScanning,
    waiting: fuCount(),
    workerHere,
  };
}

// The FAB's activity (activity(), 4089–4091): a broken copyright module must not take the
// upload's progress down with it.
export function claimsStatus(): ClaimsStatus | null {
  try {
    return computeStatus();
  } catch (e) {
    console.error('[ytup] copyright status', e);
    return null;
  }
}

// claims:scan from the panel's buttons (UI.scanBtn 6188; UI.adsBtn / UI.collabBtn 6192 / 6195
// when there is no list yet). The panel opens an existing list itself.
export function startScan(what: unknown): void {
  if (what === 'claims') void scanClaims();
  else if (what === 'ads') void scanAds();
  else if (what === 'collab') void scanCollab();
}

export {
  cfg, studioIsEnglish, currentChannel, channelName, chGet, chSet, chMerge, chList, chRunItem, invalidateCounts, getCounts,
  scanning, scanProg, listVideos, listScheduled, scanClaims, getSongs, adsScanning, scanAds, collabScanning, scanCollab,
  getRun, setRun, getAdsRun, setAdsRun, getCollabRun, setCollabRun, collabLinks, fuGet, fuSet, fuCount, fuBusy, fuNext,
  getAP, setAP, apBusy, trimStage, adsStage, collabStage, workerHere, setTrimStage, setAdsStage, setCollabStage, flash, dur,
  computeStatus, log,
};
```
Typing the port: `let scanning = false;`, `let scanProg: { label: string; done: number; total: number } | null = null;`, `async function listVideos(mask: Record<string, unknown>, label: string)` with `const vids: any[] = [];`, `async function scanClaims({ show = true }: { show?: boolean } = {}): Promise<ClaimRow[] | null>` with `const rows: ClaimRow[] = [];` / `let j: any;` / `const owners: Record<string, string> = {};` / `let segs: [number, number][] = [];`, `const getSongs = (): Songs => load('songHistory', {});`, `const getRun = (): Run | null => chGet('trimRun', null);` (likewise ads / Collab), `const fuGet = (): FollowUp => chGet('followUp', {});`, `const getAP = (): Autopilot => chGet('autopilot', { on: false, next: 0 });`, `let transient: (ClaimsStatus & { until: number }) | null = null;`, `function computeStatus(): ClaimsStatus`, `function log(msg: string, type = '')`, `const cfg = (): ClaimsCfg => Object.assign({}, DEFAULTS, load('cfg', {}));`. `fmtWhen` isn't in these regions. If tsc reports an unused import, drop it.

- [ ] **Step 2: Write the failing scan / status tests**

`extension/tests/claims-scan.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import type { ClaimsOp } from '../lib/claims/ops';
import { useMemoryClaims } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const ops: ClaimsOp[] = [];
const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
const videos = [
  { videoId: 'v1', title: 'Mix 1', privacy: 'VIDEO_PRIVACY_PUBLIC', lengthSeconds: '600', copyrightSummary: { activeThirdPartyClaimsCount: '1' },
    allRestrictions: { summary: { impacts: ['VIDEO_RESTRICTION_IMPACT_MONETIZATION_DISABLED'] } } },
  { videoId: 'v2', title: 'Clean', privacy: 'VIDEO_PRIVACY_PRIVATE', lengthSeconds: '300' },
];
const api: Record<string, (body: any) => unknown> = {
  'creator/list_creator_videos': () => ({ videos }),
  'creator/list_creator_received_claims': () => ({
    contentOwners: [{ contentOwnerId: 'o1', displayName: 'Label Co' }],
    receivedClaims: [{ claimId: 'c1', contentOwnerIds: ['o1'], type: 'CLAIM_TYPE_AUDIO', status: 'RECEIVED_CLAIM_STATUS_ACTIVE',
      asset: { metadata: { soundRecording: { title: 'Song', artists: ['Mine Artist'] } } },
      nontakedownClaimActions: { options: ['NON_TAKEDOWN_CLAIM_OPTION_TRIM'] } }],
  }),
  'copyright/get_creator_received_claim_matches': () => ({ matches: { claimMatches: [{ videoSegment: { startMillis: '60000', endMillis: '90000' } }] } }),
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ops.length = 0;
  useMemoryClaims({ cfg: { ownNames: 'mine artist' } }, async (op) => void ops.push(op));
  C.setClaimsUi(ui);
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: { client: {} } }));
  setYoutubei(async (path, body) => api[path]!(body));
});
afterEach(() => {
  C.setClaimsUi(null);
  setYoutubei(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const run = async <T>(p: Promise<T>) => { await vi.runAllTimersAsync(); return p; };

describe('scanClaims', () => {
  it('stores the claimed videos as rows, records the songs, and opens the list', async () => {
    const rows = await run(C.scanClaims());
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ videoId: 'v1', song: 'Song', artists: 'Mine Artist', claimant: 'Label Co', segments: [[60, 90]],
      claimedSec: 30, canTrim: true, own: true, hasImpact: true, impact: 'disabled', privacy: 'public' });
    const set = ops.find((o) => o.op === 'set' && o.key === `claimScan:${CH}`) as Extract<ClaimsOp, { op: 'set' }>;
    expect(set.value).toMatchObject({ total: 2, channel: CH });
    expect(ops.some((o) => o.op === 'songs')).toBe(true);
    expect(ui.show).toHaveBeenCalledWith('claims');
    expect(C.scanning).toBe(false);
  });

  it('before Studio has its context: says so, changes nothing', async () => {
    resetCfg();
    expect(await C.scanClaims()).toBe(null);
    expect(ui.log).toHaveBeenCalledWith("Studio hasn't finished loading — try again in a few seconds", 'warn');
    expect(ops).toEqual([]);
  });

  it('the MAIN world not answering ends the scan as an error, and scanning is reset', async () => {
    setYoutubei(async () => { throw new Error('youtubei: timed out after 30000 ms'); });
    expect(await run(C.scanClaims())).toBe(null);
    expect(ui.log).toHaveBeenLastCalledWith('Scan failed: youtubei: timed out after 30000 ms', 'err');
    expect(C.scanning).toBe(false);
    expect(ops).toEqual([]);
  });
});

describe('scanAds', () => {
  it('lists the videos whose ads are off in settings, and marks the ineligible ones', async () => {
    api['creator/list_creator_videos'] = () => ({ videos: [
      { videoId: 'a', title: 'A', monetization: { adMonetization: { userSetMonetization: 'X_OFF', effectiveStatus: 'X_INELIGIBLE' } } },
      { videoId: 'b', title: 'B', monetization: { adMonetization: { userSetMonetization: 'X_OFF', effectiveStatus: 'X_OFF' } } },
      { videoId: 'c', title: 'C', monetization: { adMonetization: { userSetMonetization: 'X_ON' } } },
    ] });
    const rows = await run(C.scanAds({ show: false }));
    expect(rows!.map((r) => [r.videoId, r.ineligible])).toEqual([['a', true], ['b', false]]);
    expect(ui.show).not.toHaveBeenCalled();
  });
});
```
`extension/tests/claims-status.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import { useMemoryClaims } from '../lib/claims/store';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
beforeEach(async () => {
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.stubGlobal('document', { documentElement: { lang: 'en' } });
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
});
afterEach(() => vi.unstubAllGlobals());

describe('computeStatus / claimsState', () => {
  it('idle, never scanned', () => {
    useMemoryClaims();
    expect(C.computeStatus()).toEqual({ icon: '✓', kind: 'idle', title: 'Ready', detail: 'Click "Scan claims" to check this channel' });
    expect(C.claimsState()).toMatchObject({ channel: CH, ready: true, english: true, busyRun: false, busyScan: false, waiting: 0 });
  });

  it('a trim run in progress shows its claim, progress and steps', () => {
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, started: '', items: [
      { key: 'v:1', videoId: 'v', video: 'Mix', song: 'S1', state: 'saved', msg: '' },
      { key: 'v:2', videoId: 'v', video: 'Mix', song: 'S2', state: 'pending', msg: '' },
    ] } });
    const s = C.computeStatus();
    expect(s.title).toBe('Trimming claim 2 of 2');
    expect(s.detail).toBe('Mix — S2');
    expect(s.progress).toBe(0.5);
    expect(s.steps).toEqual(['Open video', 'Check claim', 'Take action', 'Trim editor', 'Save', 'Confirm']);
    expect(C.claimsState().busyRun).toBe(true);
  });

  it('counts come from the last scan and the song history', () => {
    useMemoryClaims({ [`claimScan:${CH}`]: { date: new Date().toISOString(), total: 3, rows: [{ videoId: 'a' }, { videoId: 'a' }, { videoId: 'b' }] }, songHistory: { x: {}, y: {} } });
    expect(C.claimsState().counts).toMatchObject({ hasScan: true, claims: 3, claimVideos: 2, songs: 2 });
  });

  it('the upload queue holds copyright work back only with waiting or in-flight videos, not failed ones, nor a run in another tab', () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: Date.now() + 3600e3 } });
    const item = (status: Q.QueueItem['status']) => ({ id: status, status }) as Q.QueueItem;
    Q.queue.splice(0, Q.queue.length, item('error'), item('done'));
    expect(C.claimsState().uploadBusy).toBe(false);
    expect(C.computeStatus().detail).toMatch(/^Next scan \+ trim in/);
    Q.queue.push(item('pending'));
    expect(C.claimsState().uploadBusy).toBe(true);
    expect(C.computeStatus().detail).toBe('⏸ Waiting for the upload queue to finish'); // the card says why
    Q.setOtherTabRuns(true); // another tab is uploading them
    expect(C.claimsState().uploadBusy).toBe(false);
    Q.setOtherTabRuns(false);
    Q.queue.splice(0);
  });

  it('Studio in Thai is reported', () => {
    vi.stubGlobal('document', { documentElement: { lang: 'th' } });
    useMemoryClaims();
    expect(C.claimsState().english).toBe(false);
  });
});
```
Run: `npx vitest run tests/claims-scan.test.ts tests/claims-status.test.ts`
Expected: FAIL until Step 1's rebuild compiles; then PASS. (If a scan test hangs, the fake timers miss a `sleep`: `sleep` uses `setTimeout`, faked above.)

- [ ] **Step 3: The page side: broadcast state, log, show (failing test first)**

`extension/tests/claims-page.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../lib/claims/claims';
import { createClaimsPage } from '../lib/claims/page';
import { useMemoryClaims } from '../lib/claims/store';

beforeEach(() => {
  vi.stubGlobal('location', { pathname: '/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos' });
  vi.stubGlobal('document', { documentElement: { lang: 'en' } });
  useMemoryClaims();
});

describe('the copyright module in the Studio tab', () => {
  it('broadcasts its state when it changes, once', () => {
    const send = vi.fn(async () => undefined);
    const page = createClaimsPage({ send: send as never, toast: () => {}, refreshCfg: async () => {} });
    C.setClaimsUi(page.ui);
    page.tick();
    page.tick();
    expect(send.mock.calls.filter(([t]) => t === 'claims:state')).toHaveLength(1);
    C.log('hello', 'ok');
    expect(send).toHaveBeenCalledWith('claims:log', expect.objectContaining({ msg: 'hello', type: 'ok' }));
    page.ui.show('claims');
    expect(send).toHaveBeenCalledWith('claims:show', 'claims');
    page.dispose();
    C.setClaimsUi(null);
  });

  it('while Studio has no context yet, reads ytcfg again every 10 s', () => {
    vi.useFakeTimers();
    const refreshCfg = vi.fn(async () => {});
    const page = createClaimsPage({ send: (async () => undefined) as never, toast: () => {}, refreshCfg });
    page.tick();
    page.tick();
    expect(refreshCfg).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_001);
    page.tick();
    expect(refreshCfg).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    page.dispose();
  });
});
```
`extension/lib/claims/page.ts`:
```ts
import { cachedCfg } from '../studio/channel';
import { sendMessage } from '../messages';
import { claimsState, type ClaimsUi } from './claims';

// The Studio content script's side of the copyright module: what the drawer's pane did, sent to
// the side panel instead (D24). A broadcast fails when no panel is open; that is fine.
export function createClaimsPage(d: {
  send?: typeof sendMessage;
  toast(msg: string): void;
  refreshCfg(): Promise<void>; // ytcfg again (INNERTUBE_CONTEXT arrives after the page script runs)
}) {
  const send = d.send ?? sendMessage;
  let last = '';
  let cfgAt = 0;
  let live = true;
  const broadcast = () => {
    if (!live) return;
    const s = claimsState();
    const sig = JSON.stringify(s);
    if (sig === last) return;
    last = sig;
    send('claims:state', s).catch(() => {});
  };
  const ui: ClaimsUi = {
    show: (view) => void send('claims:show', view).catch(() => {}),
    status: broadcast,
    log: (msg, type) => void send('claims:log', { at: Date.now(), msg, type }).catch(() => {}),
    toast: (msg) => d.toast(msg),
  };
  return {
    ui,
    // Every 0.8 s (the userscript's tick, 6361): until Studio has its context, read ytcfg again
    // every 10 s; then the state, if it changed.
    tick() {
      if (!cachedCfg('INNERTUBE_CONTEXT') && Date.now() - cfgAt > 10_000) {
        cfgAt = Date.now();
        void d.refreshCfg().catch(() => {});
      }
      broadcast();
    },
    dispose() {
      live = false;
    },
  };
}
```
`messages.ts` (`import type { ClaimsLogLine, ClaimsState, ClaimsView } from './claims/types';`):
```ts
  // side panel → content: the copyright module
  'claims:view'(): ClaimsState;
  'claims:scan'(what: 'claims' | 'ads' | 'collab'): void;
  // content → side panel (broadcast)
  'claims:state'(s: ClaimsState): void;
  'claims:log'(l: ClaimsLogLine): void;
  'claims:show'(view: ClaimsView): void; // a scan this tab ran ended: open its list
```
`studio.content.ts`, after `setClaims(...)`:
```ts
    const claims = createClaimsPage({ toast: (m) => ui.toast(m), refreshCfg: () => refreshCfg(readCfg) });
    setClaimsUi(claims.ui);
    stop.add(() => { claims.dispose(); setClaimsUi(null); });
    onMessage('claims:view', () => claimsState());
    onMessage('claims:scan', ({ data }) => startScan(data));
```
(`ui` is the content UI created a few lines below in today's file: move these lines after `const ui = createContentUi();`.) In the 800 ms interval, add its own try:
```ts
      try {
        claims.tick();
      } catch (e) {
        console.error('[ytup] copyright tick', e);
      }
```
`lib/studio/fab.ts`: `activityFrom(…, claimsStatus(), uploadProg)` (import from `../claims/claims`).
Run: `npx vitest run tests/claims-page.test.ts tests/fab.test.ts`
Expected: PASS.

- [ ] **Step 4: The panel follows the copyright state (failing tests first)**

`extension/tests/panel-fake.tsx`: add
```ts
export const claimsStateWith = (over: Partial<ClaimsState> = {}): ClaimsState => ({
  channel: 'UC1', channelName: 'Mine', ready: true, english: true, uploadBusy: false,
  status: { icon: '✓', kind: 'idle', title: 'Ready', detail: 'Click "Scan claims" to check this channel' },
  counts: { hasScan: false, scanDate: '', claims: 0, claimVideos: 0, songs: 0, hasAdsScan: false, adsTodo: 0 },
  busyRun: false, busyScan: false, waiting: 0, workerHere: true, ...over,
});
export const fakeClaims = (over: Partial<ClaimsApi> = {}): ClaimsApi => ({ state: claimsStateWith(), live: claimsStateWith(), log: [], shown: null, addLog: vi.fn(), ...over });
```
and make `renderPanel(ui, api, live, claims = fakeClaims())` wrap the tree in `<ClaimsContext.Provider value={claims}>`.

In `extension/tests/panel-shell.test.tsx`:
```ts
  it('the activity bar shows a copyright job when the queue is idle', () => {
    renderPanel(<ActivityBar onGo={() => {}} />, fakePanel(), fakeLive(), fakeClaims({
      live: claimsStateWith({ status: { icon: '🔍', kind: 'busy', title: "Scanning this channel's claims", detail: 'Reading video list…', progress: null } }),
    }));
    expect(screen.getByText("Scanning this channel's claims")).toBeTruthy();
  });
```
In `extension/tests/panel-provider.test.tsx` (it mocks `onMessage` into `handlers`; the bound tab is 3, the lock holder 9):
```tsx
function ClaimsProbe() {
  const c = useClaims();
  return <div data-testid="c">{`${c.state?.channelName ?? '-'}|${c.live?.channelName ?? '-'}|${c.log.length}|${c.log[0]?.msg ?? '-'}`}</div>;
}
const deliver = (type: string, data: unknown, tabId: number) => act(async () => { handlers.get(type)!({ data, sender: { tab: { id: tabId } } }); });
const cs = (name: string, busyRun = false) => ({ channelName: name, busyRun }) as unknown as ClaimsState;

describe('copyright state routing', () => {
  it('the bound tab, and the lock holder while it runs a copyright job; other tabs ignored', async () => {
    await browser.storage.session.set({ runnerTabId: 9, runnerJobs: ['claims'] });
    vi.mocked(sendMessage).mockImplementation((async (type: string) => (type === 'claims:view' ? cs('bound') : { items: [] })) as never);
    render(<PanelProvider><ClaimsProbe /></PanelProvider>);
    await flush();
    await deliver('claims:state', cs('other'), 5);
    expect(screen.getByTestId('c').textContent).toBe('bound|bound|0|-');
    await deliver('claims:state', cs('holder', true), 9);
    expect(screen.getByTestId('c').textContent).toBe('bound|holder|0|-');
    for (let i = 0; i < 81; i++) await deliver('claims:log', { at: i, msg: 'line ' + i, type: '' }, 3);
    await deliver('claims:log', { at: 0, msg: 'ignored', type: '' }, 5);
    expect(screen.getByTestId('c').textContent).toBe('bound|holder|80|line 80');
  });
});
```
(imports: `useClaims` from the panel module, `type ClaimsState` from `../lib/claims/types`. The `claims:view` fetch happens once the view link is `'ok'`: the mocked `sendMessage` answers `queue:view` with `{ items: [] }`, which the view sync takes as a view.)

- [ ] **Step 5: Implement the panel side**

`lib/panel/bus.ts`:
```ts
const claimStates = new Set<Fn<ClaimsState>>();
const claimLogs = new Set<Fn<ClaimsLogLine>>();
const claimShows = new Set<Fn<ClaimsView>>();
// in installBus():
  onMessage('claims:state', ({ data, sender }) => { for (const fn of claimStates) fn(data, sender.tab?.id); });
  onMessage('claims:log', ({ data, sender }) => { for (const fn of claimLogs) fn(data, sender.tab?.id); });
  onMessage('claims:show', ({ data, sender }) => { for (const fn of claimShows) fn(data, sender.tab?.id); });
export const onClaimsState = (fn: Fn<ClaimsState>) => (claimStates.add(fn), () => void claimStates.delete(fn));
export const onClaimsLog = (fn: Fn<ClaimsLogLine>) => (claimLogs.add(fn), () => void claimLogs.delete(fn));
export const onClaimsShow = (fn: Fn<ClaimsView>) => (claimShows.add(fn), () => void claimShows.delete(fn));
```
`entrypoints/sidepanel/panel.tsx`:
```ts
// The copyright module's live state (D24): the bound tab's, and the lock holder's while it runs a
// copyright job in another tab (like LiveApi for the queue). The log is kept here, newest first.
export interface ClaimsApi {
  state: ClaimsState | null; // the bound tab's
  live: ClaimsState | null; // the lock holder's while it runs a copyright job elsewhere, else `state`
  log: ClaimsLogLine[];
  shown: { view: ClaimsView; n: number } | null; // the bound tab finished a scan: open this list
  addLog(msg: string, type?: string): void; // a line the panel itself logs (Auto-pilot on/off)
}
export const ClaimsContext = createContext<ClaimsApi>({ state: null, live: null, log: [], shown: null, addLog: () => {} });
export const useClaims = () => useContext(ClaimsContext);
const LOG_MAX = 80; // logBox kept 80 lines (6179)
```
In `PanelProvider`:
```ts
  const [claimStates, setClaimStates] = useState<ReadonlyMap<number, ClaimsState>>(new Map());
  const [log, setLog] = useState<ClaimsLogLine[]>([]);
  const [shown, setShown] = useState<ClaimsApi['shown']>(null);
  const addLog = useCallback((msg: string, type = '') => setLog((l) => [{ at: Date.now(), msg, type }, ...l].slice(0, LOG_MAX)), []);
  // The bound tab's copyright state at bind time (later changes come as broadcasts).
  useEffect(() => {
    if (targetId === undefined || link !== 'ok') return;
    let alive = true;
    void sendMessage('claims:view', undefined, targetId)
      .then((s) => { if (alive) setClaimStates((m) => new Map(m).set(targetId, s)); })
      .catch((e) => console.error('[ytup] claims:view failed', e));
    return () => { alive = false; };
  }, [targetId, link]);
  useEffect(() => {
    installBus();
    const ours = (tabId: number | undefined) => tabId !== undefined && (tabId === targetRef.current?.tabId || tabId === runnerRef.current);
    const offState = onClaimsState((s, tabId) => { if (ours(tabId)) setClaimStates((m) => new Map(m).set(tabId!, s)); });
    const offLog = onClaimsLog((l, tabId) => { if (ours(tabId)) setLog((cur) => [l, ...cur].slice(0, LOG_MAX)); });
    const offShow = onClaimsShow((view, tabId) => {
      if (tabId !== undefined && tabId === targetRef.current?.tabId) setShown((s) => ({ view, n: (s?.n ?? 0) + 1 }));
    });
    return () => { offState(); offLog(); offShow(); };
  }, []);
  const claims = useMemo<ClaimsApi>(() => {
    const state = targetId !== undefined ? claimStates.get(targetId) ?? null : null;
    const holder = runner && runner.tabId !== targetId && runner.jobs.includes('claims') ? claimStates.get(runner.tabId) ?? null : null;
    return { state, live: holder ?? state, log, shown, addLog };
  }, [claimStates, targetId, runner, log, shown, addLog]);
```
Prune `claimStates` like `states` (keep only the target and the runner). Wrap the children: `<ClaimsContext.Provider value={claims}>`.

`ActivityBar.tsx`: `const { live } = useClaims();` and pass `live?.status ?? null` in place of the `null` placeholder (delete its "arrives in Phase 4" comment).

Run: `npx vitest run tests/panel-provider.test.tsx tests/panel-shell.test.tsx`
Expected: PASS.

- [ ] **Step 6: Extension reloaded mid-scan**

Add to `extension/tests/claims-scan.test.ts`:
```ts
  it('extension reloaded mid-scan: the orphaned writes go nowhere quietly', async () => {
    const p = C.scanClaims();
    disposeClaimsStore(); // the content script's teardown
    await expect(run(p)).resolves.toBeTruthy();
  });
```
(import `disposeClaimsStore`). Expected: PASS without change (Task 3's `write` swallows a disposed store).

- [ ] **Step 7: Verify and commit**

Run: `npm run check && npm run build`
```bash
git add extension/lib/claims extension/lib/messages.ts extension/entrypoints/studio.content.ts extension/lib/studio/fab.ts extension/lib/panel/bus.ts extension/entrypoints/sidepanel/panel.tsx extension/entrypoints/sidepanel/shell/ActivityBar.tsx extension/scripts/port/claims.mjs extension/tests/claims-scan.test.ts extension/tests/claims-status.test.ts extension/tests/claims-page.test.ts extension/tests/panel-fake.tsx extension/tests/panel-provider.test.tsx extension/tests/panel-shell.test.tsx extension/tests/fab.test.ts
git commit -m "Copyright scans, status and log in the Studio tab; claims:state reaches the panel from the bound tab or the lock holder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Copyright tab — status, scan, activity log, upload history

The drawer's "ลิขสิทธิ์" pane (`buildPane` 6183–6216, `renderStatus` 6219–6256), read side: the Studio-language warning, the status card, **Scan claims**, **Claim list (N)**, **Claimed songs (N)**, **Fix tracklist**, **Upload history** and the activity log. (Ads, Collab, Stop, Auto-pilot and Copyright settings arrive in 4b.)

**Files:**
- Create: `extension/entrypoints/sidepanel/tabs/copyright/StatusCard.tsx`, `ActivityLog.tsx`, `SubView.tsx`, `extension/lib/panel/download.ts`, `extension/tests/panel-copyright.test.tsx`
- Modify: `extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx`, `extension/scripts/strings/extension-only.mjs` (the placeholder pair goes), `extension/tests/panel-imports.test.ts`, `extension/tests/panel-i18n.test.tsx`

**Interfaces:**
- Consumes: `useClaims()`, `usePanel()`, `readClaims` / `watchClaims` / `claimsWrite`, `uploadsCsvRows` / `csvText`, `emojiIconName`.
- Produces: `downloadCsv(rows: unknown[][], name: string, doc?: Document): void`; `useClaimsData(ch: string | null): ClaimsData | null` (exported from `CopyrightTab.tsx`); `type CopyrightView = { name: 'home' } | { name: 'claims' } | { name: 'songs' } | { name: 'tracklist'; videoId: string } | { name: 'ads' } | { name: 'collab' } | { name: 'settings' }`; `SubView({ title, children, footer, onClose })`; `StatusCard({ s })`.

- [ ] **Step 1: Write the failing component tests**

`extension/tests/panel-copyright.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CopyrightTab } from '../entrypoints/sidepanel/tabs/CopyrightTab';
import { claimsStateWith, fakeClaims, fakePanel, renderPanel } from './panel-fake';

beforeEach(() => fakeBrowser.reset());
afterEach(cleanup);

describe('Copyright tab', () => {
  it('shows the status card and the buttons, with counts', async () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({
      counts: { hasScan: true, scanDate: '', claims: 4, claimVideos: 2, songs: 9, hasAdsScan: false, adsTodo: 0 },
    }) }));
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Claim list \(4\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Claimed songs \(9\)/ })).toBeTruthy();
  });

  it('Scan claims asks the bound tab', () => {
    const api = fakePanel();
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: /Scan claims/ }));
    expect(api.send).toHaveBeenCalledWith('claims:scan', 'claims');
  });

  it('while scanning, the buttons hide and the card shows the progress', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ busyScan: true,
      status: { icon: '🔍', kind: 'busy', title: "Scanning this channel's claims", detail: 'Reading claim details 1 / 3: Mix', progress: 1 / 3 } }) }));
    expect(screen.getByText('Reading claim details 1 / 3: Mix')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null);
  });

  it('Studio in Thai: the warning shows', () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ english: false }) }));
    expect(screen.getByText(/Studio is set to Thai/)).toBeTruthy();
  });

  it('the activity log opens, and keeps that choice', async () => {
    const send = vi.spyOn(await import('../lib/messages'), 'sendMessage').mockResolvedValue(undefined as never);
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ log: [{ at: Date.UTC(2026, 0, 1, 10, 5), msg: 'Scan complete ✓', type: 'ok' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Show activity ▾' }));
    expect(screen.getByText(/Scan complete ✓/)).toBeTruthy();
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'set', key: 'logOpen', value: true });
  });
});
```
Run: `npx vitest run tests/panel-copyright.test.tsx`
Expected: FAIL (the placeholder tab).

- [ ] **Step 2: `download.ts`**

```ts
import { csvText } from '../claims/core';

// The userscript's downloadCSV() (2084–2092), in the panel: the file is saved from the panel
// page, which has the data in storage.
export function downloadCsv(rows: unknown[][], name: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

- [ ] **Step 3: `StatusCard.tsx`, `ActivityLog.tsx`, `SubView.tsx`**

`StatusCard.tsx`:
```tsx
import { Progress } from '@/components/ui/progress';
import { emojiIconName } from '@/lib/activity';
import type { ClaimsStatus } from '@/lib/claims/types';
import { cn } from '@/lib/utils';
import { Icon } from '../../Icon';

// renderStatus()'s card (6235–6243): title with its icon, the detail, a progress bar (no
// number: indeterminate), and the steps of a run with the current one marked.
const TONE: Record<string, string> = { busy: 'border-info/35', wait: 'border-warn/35', err: 'border-err/35', ok: 'border-ok/35', idle: '' };
export function StatusCard({ s }: { s: ClaimsStatus }) {
  const ic = emojiIconName(s.icon);
  const idx = s.stepIdx ?? -1;
  return (
    <div className={cn('rounded-[14px] border border-tint/10 bg-tint/5 px-3 py-2.5', TONE[s.kind])} role="status">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className="grid w-5 place-items-center text-fg2">{ic ? <Icon name={ic} size={17} /> : s.icon}</span>
        <span className="min-w-0 flex-1">{s.title}</span>
      </div>
      {s.detail && <div className="mt-1 text-xs whitespace-pre-line text-fg3">{s.detail}</div>}
      {s.progress !== undefined && <Progress value={s.progress === null ? null : Math.round(s.progress * 100)} className="mt-2" />}
      {s.steps && (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
          {s.steps.map((t, i) => (
            <span key={i} className={i < idx ? 'text-ok' : i === idx ? 'font-semibold text-fg' : 'text-fg3'}>
              {(i < idx ? '✓ ' : i === idx ? '● ' : '') + t}
            </span>
          ))}
        </div>
      )}
      {s.steps && s.stepDetail && <div className="mt-1 text-xs text-fg2">{s.stepDetail}</div>}
    </div>
  );
}
```
`ActivityLog.tsx`:
```tsx
import { Button } from '@/components/ui/button';
import { L, locale } from '@/lib/i18n';
import type { ClaimsLogLine } from '@/lib/claims/types';

// The pane's activity section (6215, logBox 6184, log() 6178): newest first, HH:MM.
const TONE: Record<string, string> = { ok: 'text-ok', err: 'text-err', warn: 'text-warn' };
export function ActivityLog({ open, lines, onToggle }: { open: boolean; lines: ClaimsLogLine[]; onToggle(): void }) {
  return (
    <>
      <div className="flex items-center">
        <b className="flex-1 text-[13px] font-medium">{L('กิจกรรม', 'Activity')}</b>
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {open ? L('ซ่อนกิจกรรม ▴', 'Hide activity ▴') : L('แสดงกิจกรรม ▾', 'Show activity ▾')}
        </Button>
      </div>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-[12px] bg-tint/5 p-2 font-mono text-xs leading-relaxed">
          {lines.map((l, i) => (
            <div key={l.at + ':' + i} className={TONE[l.type] ?? 'text-fg2'}>
              {new Date(l.at).toLocaleTimeString(locale()).slice(0, 5) + '  ' + l.msg}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```
`SubView.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';

// One of the pane's modals (openModal 4851) as a view of the Copyright tab (D23): its title, its
// content, its footer row, and Close back to the tab.
export function SubView({ title, sub, children, footer, onClose }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode; onClose(): void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold">{title}</h3>
        <Button size="sm" onClick={onClose}>{L('ปิด', 'Close')}</Button>
      </div>
      {sub && <div className="text-xs text-fg3">{sub}</div>}
      {children}
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-tint/[0.08] pt-3">{footer}</div>}
    </div>
  );
}
```

- [ ] **Step 4: `CopyrightTab.tsx` (home)**

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { uploadsCsvRows, type UploadRecordLike } from '@/lib/claims/core';
import { L } from '@/lib/i18n';
import { claimsWrite, readClaims, watchClaims, type ClaimsData } from '@/lib/panel/claims-data';
import { downloadCsv } from '@/lib/panel/download';
import { cn } from '@/lib/utils';
import { Section } from '../fields';
import { Icon } from '../Icon';
import { useClaims, usePanel } from '../panel';
import { ActivityLog } from './copyright/ActivityLog';
import { ClaimList } from './copyright/ClaimList';
import { Songs } from './copyright/Songs';
import { StatusCard } from './copyright/StatusCard';
import { TracklistFix } from './copyright/TracklistFix';

// The drawer's "ลิขสิทธิ์" pane (buildPane 6183–6216, renderStatus 6219–6256) and its modals as
// views (D23). Status and counts come from the Studio tab (useClaims, D24); lists and results
// from storage, for the channel that tab is on.
export type CopyrightView =
  | { name: 'home' } | { name: 'claims' } | { name: 'songs' } | { name: 'tracklist'; videoId: string }
  | { name: 'ads' } | { name: 'collab' } | { name: 'settings' };

export function useClaimsData(ch: string | null): ClaimsData | null {
  const [data, setData] = useState<ClaimsData | null>(null);
  useEffect(() => {
    if (!ch) return void setData(null);
    let alive = true;
    void readClaims(ch).then((d) => { if (alive) setData(d); }).catch((e) => console.error('[ytup] read copyright data', e));
    const off = watchClaims(ch, (d) => { if (alive) setData(d); });
    return () => { alive = false; off(); };
  }, [ch]);
  return data;
}

const failed = (e: unknown) => {
  console.error('[ytup] copyright', e);
  toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
};

export function CopyrightTab() {
  const { send } = usePanel();
  const { state, live, log, shown } = useClaims();
  const data = useClaimsData(state?.channel ?? null);
  const [view, setView] = useState<CopyrightView>({ name: 'home' });
  const [openLog, setOpenLog] = useState<boolean | null>(null);
  const home = () => setView({ name: 'home' });
  // A scan started here ended in the bound tab: open its list (showClaims() after scanClaims()).
  useEffect(() => {
    if (shown) setView({ name: shown.view });
  }, [shown]);

  if (data && state) {
    if (view.name === 'claims') return <ClaimList data={data} state={state} onClose={home} onTracklist={(videoId) => setView({ name: 'tracklist', videoId })} />;
    if (view.name === 'songs') return <Songs data={data} onClose={home} />;
    if (view.name === 'tracklist') return <TracklistFix data={data} videoId={view.videoId} onPick={(videoId) => setView({ name: 'tracklist', videoId })} onClose={home} />;
  }

  const s = live ?? state;
  const n = state?.counts;
  const busy = !!s && (s.busyRun || s.busyScan);
  const scan = () => void send('claims:scan', 'claims').catch(failed);
  const uploads = async () => {
    const list = (await browser.storage.local.get('uploads')).uploads;
    downloadCsv(uploadsCsvRows(Array.isArray(list) ? (list as UploadRecordLike[]) : []), `uploads-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  // logOpen is stored (6201) and also follows this click at once.
  const logOpen = openLog ?? data?.logOpen ?? false;
  const toggleLog = () => {
    setOpenLog(!logOpen);
    void claimsWrite({ op: 'set', key: 'logOpen', value: !logOpen }).catch(failed);
  };
  return (
    <div>
      {state && !state.english && (
        <div className="mb-3 rounded-[12px] border border-err/35 bg-err/[0.08] px-3 py-2 text-xs text-err">
          {L('⚠ Studio ตั้งเป็นภาษาไทยอยู่ — ส่วนตัด claim / เปิดโฆษณาอัตโนมัติต้องใช้ Studio ภาษาอังกฤษ (รูปโปรไฟล์ → Language → English) การสแกนใช้ได้ทุกภาษา', '⚠ Studio is set to Thai — auto claim trimming / ads need Studio in English (profile picture → Language → English). Scanning works in any language')}
        </div>
      )}
      <Section title={L('สถานะ', 'Status')} icon="shield">
        {s && <StatusCard s={s.status} />}
        {!busy && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Button variant="go" onClick={scan} disabled={!state}><Icon name="scan" size={16} />{L('สแกน claim', 'Scan claims')}</Button>
            <Button onClick={() => setView({ name: 'claims' })} disabled={!data}>
              <Icon name="queue" size={16} />
              {n?.hasScan ? L(`รายการ claim (${n.claims})`, `Claim list (${n.claims})`) : L('รายการ claim', 'Claim list')}
            </Button>
            <Button className="col-span-2" onClick={() => setView({ name: 'songs' })} disabled={!data}
              title={L('เพลงและศิลปินที่เคยโดน claim ทุกช่อง', 'Songs and artists that have been claimed across all channels')}>
              <Icon name="music" size={16} />{L(`เพลงที่เคยโดน (${n?.songs ?? 0})`, `Claimed songs (${n?.songs ?? 0})`)}
            </Button>
          </div>
        )}
      </Section>
      <Section>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setView({ name: 'tracklist', videoId: '' })} disabled={!data}><Icon name="note" size={14} />{L('แก้ tracklist', 'Fix tracklist')}</Button>
          <Button size="sm" onClick={() => void uploads()} title={L('ประวัติคลิปที่อัปผ่านสคริปต์นี้', 'History of videos uploaded with this script')}>
            <Icon name="history" size={14} />{L('ประวัติการอัป', 'Upload history')}
          </Button>
        </div>
      </Section>
      <Section>
        <ActivityLog open={logOpen} lines={log} onToggle={toggleLog} />
      </Section>
    </div>
  );
}
```
(`cn` stays imported only if used; remove otherwise. `ClaimList`, `Songs` and `TracklistFix` arrive in Task 8: create them now as one-line components returning `null` with the props typed as in Task 8's Interfaces, so this task compiles; Task 8 fills them.)

- [ ] **Step 5: Placeholder pair, import guard, Thai check**

- `extension-only.mjs`: delete the `'Copyright scan and trim arrive in a later version of the extension'` entry.
- `tests/panel-imports.test.ts`: `const FORBIDDEN = ['lib/studio/state.ts', 'lib/studio/queue-runner.ts', 'lib/claims/claims.ts', 'lib/claims/store.ts'];`
- `tests/panel-i18n.test.tsx`: render `<CopyrightTab />` in Thai with `fakeClaims({ state: claimsStateWith({ english: false, counts: { …hasScan: true, claims: 2… } }), log: [] })` alongside the other tabs (follow the file's pattern), so the leak check covers it.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/panel-copyright.test.tsx tests/panel-imports.test.ts tests/panel-i18n.test.tsx`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

Run: `npm run check && npm run build`
```bash
git add extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx extension/entrypoints/sidepanel/tabs/copyright extension/lib/panel/download.ts extension/scripts/strings/extension-only.mjs extension/tests/panel-copyright.test.tsx extension/tests/panel-imports.test.ts extension/tests/panel-i18n.test.tsx
git commit -m "Copyright tab: status card, Scan claims, counts, activity log, upload history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Claim list, claimed songs, tracklist fix; the "previously claimed" chip

`showClaims` (4860–4936), `showSongs` (5190–5251), `showTracklistFix` (4980–5040) as views, and the queue card's chip (4010–4016).

**Files:**
- Create: `extension/lib/panel/claims.ts`, `extension/tests/panel-claims.test.ts`
- Modify: `extension/entrypoints/sidepanel/tabs/copyright/ClaimList.tsx`, `Songs.tsx`, `TracklistFix.tsx`, `extension/lib/studio/queue-view.ts`, `extension/entrypoints/sidepanel/tabs/QueueCard.tsx`, `extension/entrypoints/sidepanel/panel.tsx`, `extension/scripts/strings/dropped.mjs`, `extension/tests/panel-fake.tsx`, `extension/tests/queue-view.test.ts`, `extension/tests/panel-copyright.test.tsx`, `extension/tests/panel-queue.test.tsx`

**Interfaces:**
- Consumes: `ClaimsData`, `claimsWrite`, `fmt`, `songNorm`, `parseCSV` via `importSongs`, `claimsCsvRows`, `songsCsvRows`, `downloadCsv`, `fixTracklist` (`lib/tracklist.ts`), `readText` (`lib/queue-format.ts`), `claimedSongsIn`, `getSongs`.
- Produces:
  - `lib/panel/claims.ts`: `rowKey(r): string`, `isDone(res?)`, `type Pick = 'all' | 'notOwn' | 'impact' | 'scheduledImpact' | 'short' | 'none'`, `selectWhere(kind: Pick, rows: ClaimRow[], results, now): { add: string[]; del: string[] }`, `doneKeys(rows, results, picked): string[]`, `type SongSort = 'count' | 'recent' | 'title' | 'artist'`, `songList(songs, q, sortBy): (SongEntry & { key: string; n: number })[]`, `claimedVideos(scan): ClaimRow[]`.
  - `ViewItem.claimed: { line: string; song: string; artists: string; times: number }[]`.
  - `ClaimList({ data, state, onClose, onTracklist })`, `Songs({ data, onClose })`, `TracklistFix({ data, videoId, onPick, onClose })`.

- [ ] **Step 1: Write the failing logic tests**

`extension/tests/panel-claims.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { claimedVideos, doneKeys, rowKey, selectWhere, songList } from '../lib/panel/claims';
import type { ClaimRow, Songs } from '../lib/claims/types';

const r = (id: string, extra: Partial<ClaimRow> = {}): ClaimRow => ({
  videoId: id, video: 'V' + id, privacy: 'public', length: 1000, claimId: 'c' + id, song: 'S', artists: '', label: '', claimant: '',
  type: '', status: '', impact: '', segments: [], claimedSec: 100, canTrim: true, options: '', own: false, hasImpact: false, publishAt: 0, ...extra,
});
const NOW = 1_000_000;

describe('claim list picks (showClaims chips 4921–4927)', () => {
  const rows = [r('1', { own: true }), r('2', { hasImpact: true, publishAt: NOW + 1 }), r('3', { claimedSec: 300 }), r('4', { canTrim: false }), r('5')];
  const results = { [rowKey(rows[4]!)]: { state: 'saved', msg: '', date: '' } };
  it('only rows that can be trimmed and are not done are touched', () => {
    expect(selectWhere('all', rows, results, NOW)).toEqual({ add: ['1:c1', '2:c2', '3:c3'], del: [] });
    expect(selectWhere('notOwn', rows, results, NOW)).toEqual({ add: ['2:c2', '3:c3'], del: ['1:c1'] });
    expect(selectWhere('scheduledImpact', rows, results, NOW).add).toEqual(['2:c2']);
    expect(selectWhere('short', rows, results, NOW).add).toEqual(['1:c1', '2:c2']); // < 20%
    expect(selectWhere('none', rows, results, NOW)).toEqual({ add: [], del: ['1:c1', '2:c2', '3:c3'] });
  });
  it('picked rows already trimmed or gone leave the list', () => {
    expect(doneKeys(rows, results, ['5:c5', '1:c1'])).toEqual(['5:c5']);
  });
  it('the tracklist picker lists each claimed video once', () => {
    expect(claimedVideos({ date: '', total: 0, channel: '', channelName: '', rows: [r('1'), r('1'), r('2')] }).map((x) => x.videoId)).toEqual(['1', '2']);
  });
});

describe('song list (showSongs draw() 5195–5204)', () => {
  const songs = {
    a: { title: 'Beta', artists: 'Zed', label: 'L1', claimants: ['Co'], types: [], firstSeen: '', lastSeen: '2026-01-02', videos: { v1: {}, v2: {} }, trimmed: 0 },
    b: { title: 'Alpha', artists: 'Ann', label: '', claimants: [], types: [], firstSeen: '', lastSeen: '2026-03-01', videos: { v1: {} }, trimmed: 0 },
  } as unknown as Songs;
  it('sorts and searches like the drawer', () => {
    expect(songList(songs, '', 'count').map((e) => e.title)).toEqual(['Beta', 'Alpha']);
    expect(songList(songs, '', 'recent').map((e) => e.title)).toEqual(['Alpha', 'Beta']);
    expect(songList(songs, '', 'title').map((e) => e.title)).toEqual(['Alpha', 'Beta']);
    expect(songList(songs, '', 'artist').map((e) => e.title)).toEqual(['Alpha', 'Beta']);
    expect(songList(songs, 'co', 'count').map((e) => e.key)).toEqual(['a']); // claimant matches
  });
});
```
Run: `npx vitest run tests/panel-claims.test.ts`
Expected: FAIL.

- [ ] **Step 2: `lib/panel/claims.ts`**

```ts
import { songNorm } from '../claims/core';
import type { ClaimRow, ClaimScan, ResultEntry, SongEntry, Songs } from '../claims/types';

// The logic of the pane's claim list and song list, for the panel's views.
export const rowKey = (r: Pick<ClaimRow, 'videoId' | 'claimId'>) => r.videoId + ':' + r.claimId;
export const isDone = (res?: ResultEntry) => !!res && (res.state === 'saved' || res.state === 'gone');

// The chips (4922–4927): which trimmable, not-done rows to tick and which to untick.
export type Pick = 'all' | 'notOwn' | 'impact' | 'scheduledImpact' | 'short' | 'none';
const PICK: Record<Pick, (r: ClaimRow, now: number) => boolean> = {
  all: () => true,
  notOwn: (r) => !r.own,
  impact: (r) => r.hasImpact,
  scheduledImpact: (r, now) => r.hasImpact && r.publishAt > now,
  short: (r) => !!r.length && r.claimedSec / r.length < 0.2,
  none: () => false,
};
export function selectWhere(kind: Pick, rows: ClaimRow[], results: Record<string, ResultEntry>, now = Date.now()) {
  const add: string[] = [];
  const del: string[] = [];
  for (const r of rows) {
    if (!r.canTrim || isDone(results[rowKey(r)])) continue; // disabled checkboxes (4888)
    (PICK[kind](r, now) ? add : del).push(rowKey(r));
  }
  return { add, del };
}
// showClaims() drops picks that are done already (4886, 4911).
export const doneKeys = (rows: ClaimRow[], results: Record<string, ResultEntry>, picked: string[]) =>
  rows.map(rowKey).filter((k) => picked.includes(k) && isDone(results[k]));

// The tracklist picker (4984): each claimed video once.
export const claimedVideos = (scan: ClaimScan | null): ClaimRow[] => [...new Map((scan?.rows ?? []).map((r) => [r.videoId, r])).values()];

export type SongSort = 'count' | 'recent' | 'title' | 'artist';
export function songList(songs: Songs, q: string, sortBy: SongSort): (SongEntry & { key: string; n: number })[] {
  let list = Object.entries(songs).map(([key, e]) => Object.assign({ key, n: Object.keys(e.videos).length }, e));
  if (q) list = list.filter((e) => songNorm(e.title + ' ' + e.artists + ' ' + e.label + ' ' + e.claimants.join(' ')).includes(songNorm(q)));
  return list.sort((a, b) => sortBy === 'count' ? b.n - a.n || a.title.localeCompare(b.title)
    : sortBy === 'recent' ? b.lastSeen.localeCompare(a.lastSeen)
    : sortBy === 'artist' ? a.artists.localeCompare(b.artists) || a.title.localeCompare(b.title)
    : a.title.localeCompare(b.title));
}
```
Run: `npx vitest run tests/panel-claims.test.ts`
Expected: PASS.

- [ ] **Step 3: `ClaimList.tsx`**

```tsx
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { claimsCsvRows, fmt } from '@/lib/claims/core';
import { chKey } from '@/lib/claims/keys';
import type { ClaimsState } from '@/lib/claims/types';
import { L, locale } from '@/lib/i18n';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { doneKeys, isDone, rowKey, selectWhere, type Pick } from '@/lib/panel/claims';
import { downloadCsv } from '@/lib/panel/download';
import { fmtWhen } from '@/lib/panel/format';
import { cn } from '@/lib/utils';
import { usePanel } from '../../panel';
import { SubView } from './SubView';

// showClaims() (4860–4936): one card per claim (D23), the pick chips, CSV, Rescan, Close. Ticking
// writes this channel's trimQueue through the background (claims:op list, D20).
const TRIM_LABEL = (): Record<string, string> => ({
  pending: L('⏳ รอ', '⏳ Pending'), saved: L('✅ ตัดแล้ว', '✅ Trimmed'), gone: L('✅ claim หายไปแล้ว', '✅ Claim gone'), failed: L('❌ ไม่สำเร็จ', '❌ Failed'),
  skipped: L('⏭ ข้าม', '⏭ Skipped'), later: L('⏳ รอคิว — จะตัดหลังการตัดครั้งก่อนในคลิปนี้เสร็จ', '⏳ Queued — will trim after the previous trim on this video finishes'),
});
const STATE_TONE: Record<string, string> = { saved: 'text-ok', gone: 'text-ok', failed: 'text-err', skipped: 'text-warn', later: 'text-warn' };
const openTab = (url: string) => window.open(url, '_blank', 'noopener');

export function ClaimList({ data, state, onClose, onTracklist, trimButton }: {
  data: ClaimsData; state: ClaimsState; onClose(): void; onTracklist(videoId: string): void; trimButton?: React.ReactNode;
}) {
  const { send } = usePanel();
  const scan = data.scan;
  const key = chKey('trimQueue', data.ch);
  const picked = new Set(data.trimQueue);
  const write = (d: { add?: string[]; del?: string[] }) => void claimsWrite({ op: 'list', key, ...d }).catch((e) => console.error('[ytup] trimQueue', e));
  // Done picks leave the list when it opens (4886, 4911).
  const done = scan ? doneKeys(scan.rows, data.trimResults, data.trimQueue) : [];
  useEffect(() => { if (done.length) write({ del: done }); }, [done.join('\n')]);
  if (!scan) {
    return (
      <SubView title={L('Claim ลิขสิทธิ์', 'Copyright claims')} onClose={onClose}>
        <div className="text-xs text-warn">{L(`ยังไม่ได้สแกนช่อง ${state.channelName} — กด "สแกน claim" ก่อน`, `Channel ${state.channelName} not scanned yet — press "Scan claims" first`)}</div>
      </SubView>
    );
  }
  const rows = scan.rows;
  const videos = new Set(rows.map((r) => r.videoId)).size;
  const ownCount = rows.filter((r) => r.own).length;
  const pick = (kind: Pick) => write(selectWhere(kind, rows, data.trimResults));
  const seen = new Set<string>();
  const chip = (kind: Pick, label: string) => <Button key={kind} size="sm" onClick={() => pick(kind)}>{label}</Button>;
  return (
    <SubView
      title={L(`Claim ลิขสิทธิ์ — ${scan.channelName || state.channelName}`, `Copyright claims — ${scan.channelName || state.channelName}`)}
      sub={L(`${rows.length} claim ใน ${videos} คลิป (จากทั้งหมด ${scan.total}) · สแกนเมื่อ ${new Date(scan.date).toLocaleString(locale())}`, `${rows.length} claims in ${videos} videos (of ${scan.total} total) · scanned ${new Date(scan.date).toLocaleString(locale())}`) +
        (ownCount ? L(` · ${ownCount} รายการดูเหมือนเป็นเพลงของคุณเอง (★) — ให้ค่ายเพลง/ดิสทริบิวเตอร์ allowlist ช่องแทนการตัด`, ` · ${ownCount} look like your own songs (★) — have your label/distributor allowlist the channel instead of trimming`) : '')}
      onClose={onClose}
      footer={<>
        <span className="min-w-0 flex-1 text-xs text-fg3">{L('ติ๊กเลือกแค่สร้างรายการ ยังไม่มีอะไรเปลี่ยนบน YouTube จนกว่าจะกดเริ่มตัด', 'Ticking only builds a list — nothing changes on YouTube until you start trimming')}</span>
        <Button size="sm" onClick={() => downloadCsv(claimsCsvRows(scan), `youtube-claims-${scan.date.slice(0, 10)}.csv`)}>⬇ CSV</Button>
        <Button size="sm" onClick={() => { onClose(); void send('claims:scan', 'claims').catch(() => toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'))); }}>{L('↻ สแกนใหม่', '↻ Rescan')}</Button>
        {trimButton}
      </>}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-fg3">{L('เลือก:', 'Select:')}</span>
        {chip('all', L('ทุกอันที่ตัดได้', 'All trimmable'))}
        {chip('notOwn', L('ไม่ใช่เพลงของตัวเอง', 'Not my own songs'))}
        {chip('impact', L('กระทบวิดีโอ (รายได้/จำกัด/บล็อก)', 'Affects video (revenue/restricted/blocked)'))}
        {chip('scheduledImpact', L('⏰ ตั้งเวลาไว้ + กระทบ', '⏰ Scheduled + affected'))}
        {chip('short', L('ช่วงที่โดน < 20%', 'Claimed range < 20%'))}
        {chip('none', L('ไม่เลือก', 'None'))}
      </div>
      {rows.length ? (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const k = rowKey(r);
            const res = data.trimResults[k];
            const doneAlready = isDone(res);
            const pct = r.length ? Math.round((r.claimedSec / r.length) * 100) : 0;
            const first = !seen.has(r.videoId);
            seen.add(r.videoId);
            const soon = r.publishAt && r.publishAt > Date.now();
            return (
              <label key={k} className={cn('flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]', r.own && 'border-warn/35')}>
                <input type="checkbox" className="mt-1" checked={picked.has(k) && !doneAlready} disabled={!r.canTrim || doneAlready}
                  title={doneAlready ? L('จัดการแล้ว', 'Already handled') : r.canTrim ? L('เพิ่มในรายการตัด', 'Add to trim list') : L('YouTube ไม่มีตัวเลือก Trim สำหรับ claim นี้', 'YouTube offers no Trim option for this claim')}
                  onChange={(e) => write(e.target.checked ? { add: [k] } : { del: [k] })} />
                <div className="min-w-0 flex-1">
                  <a className="font-medium underline-offset-2 hover:underline" href={`https://studio.youtube.com/video/${r.videoId}/claims`} onClick={(e) => { e.preventDefault(); openTab(`https://studio.youtube.com/video/${r.videoId}/claims`); }}>{r.video}</a>
                  <div className="text-xs text-fg3">{`${r.privacy} · ${fmt(r.length)}`}</div>
                  {soon ? <div className="text-xs text-warn">{L(`⏰ ตั้งเวลาปล่อย ${fmtWhen(r.publishAt)}`, `⏰ Scheduled ${fmtWhen(r.publishAt)}`)}</div> : null}
                  <div className="mt-1.5">{r.song}<span className="text-xs text-fg3">{[r.artists, r.label].filter(Boolean).length ? ' · ' + [r.artists, r.label].filter(Boolean).join(' · ') : ''}</span></div>
                  <div className="text-xs text-fg2">{r.claimant}{r.own && <span className="ml-1 text-warn">{L('★ เพลงของคุณเอง', '★ Your own song')}</span>}</div>
                  <div className="text-xs">{r.segments.map((sg) => fmt(sg[0]) + '–' + fmt(sg[1])).join(', ') || '?'}{' '}
                    <span className={pct >= 50 ? 'text-err' : 'text-fg3'}>{L(`${fmt(r.claimedSec)} (${pct}% ของคลิป)`, `${fmt(r.claimedSec)} (${pct}% of video)`)}</span>
                  </div>
                  <div className="text-xs text-fg2">{r.impact || L('ไม่มีผลกระทบ', 'No impact')}{r.canTrim ? '' : ' · ' + L('ไม่มีตัวเลือก Trim', 'No Trim option')}</div>
                  {res && <div className={cn('text-xs', STATE_TONE[res.state])}>{`${TRIM_LABEL()[res.state] || res.state}${res.msg ? ' — ' + res.msg : ''}`}</div>}
                  {first && <Button size="sm" className="mt-1.5" onClick={(e) => { e.preventDefault(); onTracklist(r.videoId); }}>{L('📝 tracklist หลังตัด', '📝 Tracklist after trim')}</Button>}
                </div>
              </label>
            );
          })}
        </div>
      ) : <div className="text-[13px] text-ok">{L('ไม่พบ claim 🎉', 'No claims found 🎉')}</div>}
    </SubView>
  );
}
```
(`trimButton` is filled in 4b Task 3; `React.ReactNode` → import `type ReactNode` from 'react'.)

- [ ] **Step 4: `Songs.tsx`**

```tsx
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { songsCsvRows } from '@/lib/claims/core';
import { importSongs } from '@/lib/claims/songs';
import { L, locale } from '@/lib/i18n';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { songList, type SongSort } from '@/lib/panel/claims';
import { downloadCsv } from '@/lib/panel/download';
import { TextField } from '../../fields';
import { SubView } from './SubView';

// showSongs() (5190–5251): search, sort, delete one (asks once), delete all (asks once), CSV in and out.
const failed = (e: unknown) => { console.error('[ytup] songs', e); toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab')); };
export function Songs({ data, onClose }: { data: ClaimsData; onClose(): void }) {
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<SongSort>('count');
  const [armed, setArmed] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const total = Object.keys(data.songs).length;
  const list = songList(data.songs, q, sortBy);
  const importFile = async (f: File) => {
    const text = await f.text();
    const n = importSongs({}, text, new Date().toISOString()); // counts what the background will add
    if (n < 0) return void toast(L('ไฟล์นี้ไม่ใช่ CSV ประวัติเพลง (ต้องมีคอลัมน์ song)', 'This is not a song history CSV (needs a song column)'));
    await claimsWrite({ op: 'songs', songs: { fn: 'import', text, now: new Date().toISOString() } }).catch(failed);
    toast(L(`นำเข้าประวัติเพลง ${n} เพลงแล้ว`, `Imported ${n} songs into history`));
  };
  return (
    <SubView title={L('🎵 เพลงที่เคยโดน claim', '🎵 Previously claimed songs')}
      sub={L('ทุกเพลงที่เคยโดน claim ในทุกช่องของคุณ เช็กก่อนใส่เพลงในมิกซ์ใหม่ (ตอนลาก .txt เข้าคิว สคริปต์จะเตือนให้อัตโนมัติ)', 'Every song ever claimed across all your channels. Check before adding songs to a new mix (the script warns automatically when you drop a .txt into the queue).')}
      onClose={onClose}
      footer={<>
        <Button size="sm" variant="danger" onClick={() => {
          if (!clearArmed) return setClearArmed(true);
          void claimsWrite({ op: 'songs', songs: { fn: 'clear' } }).catch(failed);
          setClearArmed(false);
        }}>{clearArmed ? L('กดอีกครั้งเพื่อลบทั้งหมด', 'Press again to delete all') : L('ลบทั้งหมด', 'Delete all')}</Button>
        <input ref={fileIn} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
        <Button size="sm" title={L('ไฟล์ claimed-songs-*.csv จากสคริปต์ YT Studio Helper เดิม', 'claimed-songs-*.csv file from the old YT Studio Helper script')} onClick={() => fileIn.current?.click()}>{L('⬆ นำเข้า CSV', '⬆ Import CSV')}</Button>
        <span className="flex-1" />
        <Button size="sm" onClick={() => downloadCsv(songsCsvRows(data.songs), `claimed-songs-${new Date().toISOString().slice(0, 10)}.csv`)}>⬇ CSV</Button>
      </>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TextField autoFocus className="min-w-0 flex-1" value={q} onValue={setQ} placeholder={L('ค้นหาเพลง ศิลปิน ค่าย หรือผู้ claim…', 'Search song, artist, label or claimant…')} />
        <NativeSelect value={sortBy} onChange={(e) => setSortBy(e.target.value as SongSort)}>
          <option value="count">{L('โดนบ่อยสุด', 'Most claimed')}</option>
          <option value="recent">{L('ล่าสุด', 'Latest')}</option>
          <option value="title">{L('ชื่อเพลง A–Z', 'Title A–Z')}</option>
          <option value="artist">{L('ศิลปิน A–Z', 'Artist A–Z')}</option>
        </NativeSelect>
        <span className="text-xs text-fg3">{q ? L(`${list.length} จาก ${total} เพลง`, `${list.length} of ${total} songs`) : L(`${total} เพลง`, `${total} songs`)}</span>
      </div>
      <div className="flex flex-col gap-2">
        {list.map((e) => {
          const vids = Object.values(e.videos);
          const channels = [...new Set(vids.map((v) => v.channel))].filter(Boolean).join(', ');
          return (
            <div key={e.key} className="flex gap-2 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <b>{e.title}</b>{e.types.length ? <span className="text-xs text-fg3">{' · ' + e.types.join(', ')}</span> : null}
                <div className="text-xs text-fg2">{e.artists || '—'}{e.label ? ' · ' + e.label : ''}</div>
                <div className="text-xs text-fg2">{e.claimants.join(', ') || '—'}</div>
                <div className="text-xs"><b>{String(e.n)}</b>{L(' คลิป', ' videos')}{e.trimmed ? <span className="ml-1.5 text-ok">{L(`✂ ตัดแล้ว ${e.trimmed}`, `✂ Trimmed ${e.trimmed}`)}</span> : null}</div>
                <div className="text-xs text-fg3">{channels}{channels ? ' · ' : ''}{new Date(e.lastSeen).toLocaleDateString(locale())}</div>
              </div>
              <Button size="sm" title={L('ลบออกจากประวัติ', 'Remove from history')} onClick={() => {
                if (armed !== e.key) return setArmed(e.key);
                void claimsWrite({ op: 'songs', songs: { fn: 'delete', key: e.key } }).catch(failed);
              }}>{armed === e.key ? L('แน่ใจ?', 'Sure?') : '✕'}</Button>
            </div>
          );
        })}
        {!list.length && (
          <div className="py-4 text-center text-xs text-fg3">
            {total ? L('ไม่พบเพลงที่ค้นหา', 'No matching songs') : L('ยังไม่มีข้อมูล — กด "สแกน claim" หรือนำเข้า CSV จากสคริปต์เดิม', 'No data yet — press "Scan claims" or import a CSV from the old script')}
          </div>
        )}
      </div>
    </SubView>
  );
}
```
(Use `TextField`'s actual prop set: it is `value` / `onValue`; if `autoFocus` / `className` aren't passed through, wrap it.)

- [ ] **Step 5: `TracklistFix.tsx`**

```tsx
import { useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/claims/core';
import { L } from '@/lib/i18n';
import { claimedVideos } from '@/lib/panel/claims';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { isTxt, readText } from '@/lib/panel/format';
import { fixTracklist } from '@/lib/tracklist';
import { AreaField, Hint } from '../../fields';
import { SubView } from './SubView';

// showTracklistFix() (4980–5040): pick a claimed video, tick the trimmed ranges, get the
// tracklist with cut songs removed and later times moved up; copy it.
interface Upload { videoId: string; txt?: string }
function useUploadTxt(videoId: string): { txt: string; found: boolean } | null {
  const [v, setV] = useState<{ txt: string; found: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void browser.storage.local.get('uploads').then(({ uploads }) => {
      const up = Array.isArray(uploads) ? (uploads as Upload[]).find((u) => u.videoId === videoId) : undefined;
      if (alive) setV({ txt: up?.txt || '', found: !!up });
    });
    return () => { alive = false; };
  }, [videoId]);
  return v;
}

export function TracklistFix({ data, videoId, onPick, onClose }: { data: ClaimsData; videoId: string; onPick(videoId: string): void; onClose(): void }) {
  if (!videoId) return <Picker data={data} onPick={onPick} onClose={onClose} />;
  return <Editor key={videoId} data={data} videoId={videoId} onClose={onClose} />;
}

function Picker({ data, onPick, onClose }: { data: ClaimsData; onPick(id: string): void; onClose(): void }) {
  const vids = claimedVideos(data.scan);
  const [have, setHave] = useState<Set<string>>(new Set());
  useEffect(() => {
    void browser.storage.local.get('uploads').then(({ uploads }) =>
      setHave(new Set(Array.isArray(uploads) ? (uploads as Upload[]).map((u) => u.videoId) : [])));
  }, []);
  if (!vids.length) {
    return (
      <SubView title={L('📝 เลือกคลิปที่จะแก้ tracklist', '📝 Choose a video to fix its tracklist')} onClose={onClose}>
        <div className="text-xs text-fg3">{L('ยังไม่มีคลิปที่โดน claim — กด "สแกน claim" ก่อน', 'No claimed videos yet — press "Scan claims" first')}</div>
      </SubView>
    );
  }
  return (
    <SubView title={L('📝 เลือกคลิปที่จะแก้ tracklist', '📝 Choose a video to fix its tracklist')} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        {vids.map((r) => (
          <button key={r.videoId} type="button" onClick={() => onPick(r.videoId)} className="rounded-[12px] border border-tint/[0.09] bg-tint/5 px-3 py-2 text-left text-[13px] hover:bg-surface2">
            <b className="block">{r.video}</b>
            <span className="text-xs text-fg3">{L(`${fmt(r.length)} · ${have.has(r.videoId) ? 'มี tracklist จากประวัติการอัป' : 'ต้องวาง tracklist เอง'}`, `${fmt(r.length)} · ${have.has(r.videoId) ? 'Tracklist from upload history' : 'Paste tracklist manually'}`)}</span>
          </button>
        ))}
      </div>
    </SubView>
  );
}

function Editor({ data, videoId, onClose }: { data: ClaimsData; videoId: string; onClose(): void }) {
  const rows = (data.scan?.rows ?? []).filter((r) => r.videoId === videoId);
  const length = rows[0]?.length || 0;
  const up = useUploadTxt(videoId);
  const [src, setSrc] = useState<string | null>(null);
  const segs = rows.flatMap((r) => r.segments.map((sg) => ({ sg, song: r.song, saved: data.trimResults[r.videoId + ':' + r.claimId]?.state === 'saved' })));
  const [ticked, setTicked] = useState<boolean[]>(() => segs.map((s) => s.saved));
  const text = src ?? up?.txt ?? '';
  const chosen = segs.filter((_, i) => ticked[i]).map((s) => s.sg);
  const r = fixTracklist(text, chosen, length);
  const onDrop = async (e: DragEvent) => {
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => isTxt(x));
    if (!f) return;
    e.preventDefault();
    setSrc(await readText(f));
  };
  return (
    <SubView title={L('📝 tracklist หลังตัดลิขสิทธิ์', '📝 Tracklist after copyright trim')}
      sub={L(`${rows[0]?.video || videoId} · ความยาวเดิม ${fmt(length)}`, `${rows[0]?.video || videoId} · original length ${fmt(length)}`) + (up?.found ? L(' · ดึง tracklist จากประวัติการอัปโหลด', ' · tracklist pulled from upload history') : '')}
      onClose={onClose}
      footer={<Button variant="go" size="sm" className="ml-auto" onClick={() => void navigator.clipboard.writeText(r.text).then(
        () => toast(L('คัดลอก tracklist ใหม่แล้ว ไปวางในคำอธิบายของวิดีโอได้เลย', 'New tracklist copied — paste it into the video description')),
        (e) => console.error('[ytup] copy tracklist', e))}>{L('📋 คัดลอก tracklist ใหม่', '📋 Copy new tracklist')}</Button>}
    >
      <b className="text-xs">{L('ช่วงที่ตัด', 'Trimmed ranges')}</b>
      {segs.length ? segs.map((s, i) => (
        <label key={i} className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={!!ticked[i]} onChange={(e) => setTicked((t) => t.map((x, j) => (j === i ? e.target.checked : x)))} />
          {`${fmt(s.sg[0])}–${fmt(s.sg[1])} · ${s.song}`}{s.saved && <span className="text-ok">{L(' (ตัดแล้ว)', ' (trimmed)')}</span>}
        </label>
      )) : <div className="text-xs text-fg3">{L('ไม่มีข้อมูลช่วงเวลา — สแกน claim ใหม่ก่อน', 'No time range data — rescan claims first')}</div>}
      <b className="text-xs">{L('tracklist เดิม', 'Original tracklist')}</b>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => void onDrop(e)}>
        <AreaField value={text} onValue={setSrc} rows={6} placeholder={L('วาง tracklist เดิม (00:00 ศิลปิน - เพลง) หรือลากไฟล์ .txt มาวาง', 'Paste the original tracklist (00:00 Artist - Song) or drop a .txt file here')} />
      </div>
      <b className="text-xs">{L('tracklist ใหม่', 'New tracklist')}</b>
      <textarea readOnly value={r.text} rows={6} className="w-full rounded-[12px] border border-line2 bg-transparent p-2 text-[13px]" />
      <div className="text-xs text-fg3">
        {chosen.length
          ? L(`ตัด ${chosen.length} ช่วง · ลบ ${r.removed.length} เพลง${r.removed.length ? ': ' + r.removed.join(', ') : ''} · เหลือ ${r.kept} เพลง`, `Trim ${chosen.length} ranges · remove ${r.removed.length} songs${r.removed.length ? ': ' + r.removed.join(', ') : ''} · ${r.kept} songs left`)
          : L('ติ๊กช่วงที่ถูกตัด (หรือจะตัด) เพื่อดูผล', 'Tick the trimmed (or to-be-trimmed) ranges to see the result')}
      </div>
      <Hint>{L('เพลงที่ถูกตัดเกินครึ่งจะถูกลบ เวลาของเพลงหลังจุดตัดจะเลื่อนขึ้นตามความยาวที่ตัด ใช้หลังจาก YouTube ประมวลผลการตัดเสร็จแล้ว', 'Songs more than half trimmed are removed; songs after a cut shift earlier by the trimmed length. Use after YouTube has finished processing the trim.')}</Hint>
    </SubView>
  );
}
```
(Merge the two `react` imports; check `isTxt` accepts a `File` — `lib/queue-format.ts` takes `{ name }`.)

- [ ] **Step 6: The chip — page side (failing test first)**

`extension/tests/queue-view.test.ts`:
```ts
  it('marks tracklist songs claimed before (Claims.claimedSongsIn)', () => {
    useMemoryClaims({ songHistory: { k: { title: 'Midnight Rain', artists: 'Lena', label: '', claimants: [], types: [], firstSeen: '', lastSeen: '', videos: { a: {}, b: {} }, trimmed: 0 } } });
    Q.queue.push(item('a', 'pending', { txt: '00:00 Lena - Midnight Rain\n03:00 X - Y' }));
    expect(queueView(state).items[0]!.claimed).toEqual([{ line: 'Lena - Midnight Rain', song: 'Midnight Rain', artists: 'Lena', times: 2 }]);
  });
```
`queue-view.ts`: add to `ViewItem`:
```ts
  claimed: { line: string; song: string; artists: string; times: number }[]; // claimedSongsIn(txt): songs claimed before (4010)
```
and in `queueView()` before mapping: `const songs = getSongs();` (import `getSongs` from `../claims/claims`, `claimedSongsIn` from `../claims/core`), then in the item: `claimed: it.txt ? claimedSongsIn(it.txt, songs) : [],`. `tests/panel-fake.tsx` `viewWith` default gets `claimed: []`.

`panel.tsx`, in the `queueChanged` storage listener: `if (area === 'local' && ('queue' in changes || 'songHistory' in changes)) sync.poke();` (refreshClaimWarnings, 5188).

- [ ] **Step 7: The chip — card (failing test first)**

`extension/tests/panel-queue.test.tsx`:
```ts
  it('a card whose tracklist has songs claimed before shows the chip with them', () => {
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([{ txt: 'x', claimed: [{ line: 'Lena - Midnight Rain', song: 'Midnight Rain', artists: 'Lena', times: 2 }] }]) }));
    const chip = screen.getByText('1 song(s) previously claimed');
    expect(chip.closest('[title]')!.getAttribute('title')).toBe('Tracklist songs previously claimed:\n• Lena - Midnight Rain  (claimed on 2 video(s))');
  });
```
`QueueCard.tsx`: delete the "waits for the Copyright tab (Phase 4)" comment; after the `prev` chip:
```tsx
  // renderAttachments()'s claim warning (4010–4016)
  if (it.claimed.length) {
    chips.push(
      <Badge key="claimed" tone="bad"
        title={L('เพลงใน tracklist ที่เคยโดน claim:\n', 'Tracklist songs previously claimed:\n') + it.claimed.map((x) => L(`• ${x.line}  (เคยโดน ${x.times} คลิป)`, `• ${x.line}  (claimed on ${x.times} video(s))`)).join('\n')}>
        <Icon name="alert" size={13} /><span>{L(`${it.claimed.length} เพลงเคยโดน claim`, `${it.claimed.length} song(s) previously claimed`)}</span>
      </Badge>,
    );
  }
```
`scripts/strings/dropped.mjs`: delete the three Phase-4 entries (the pairs are used again).

- [ ] **Step 8: View tests**

Append to `extension/tests/panel-copyright.test.tsx`:
```tsx
describe('views', () => {
  const scan = { date: '2026-10-01T00:00:00Z', total: 5, channel: 'UC1', channelName: 'Mine', rows: [
    { videoId: 'v1', video: 'Mix 1', privacy: 'public', length: 600, claimId: 'c1', song: 'Song', artists: 'A', label: '', claimant: 'Co',
      type: 'audio', status: 'active', impact: 'blocked', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: 'trim', own: false, hasImpact: true, publishAt: 0 },
  ] };
  it('the claim list ticks through the background', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    const send = vi.spyOn(await import('../lib/messages'), 'sendMessage').mockResolvedValue(undefined as never);
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ state: claimsStateWith({ counts: { hasScan: true, scanDate: '', claims: 1, claimVideos: 1, songs: 0, hasAdsScan: false, adsTodo: 0 } }) }));
    fireEvent.click(await screen.findByRole('button', { name: /Claim list \(1\)/ }));
    fireEvent.click(await screen.findByTitle('Add to trim list'));
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'list', key: 'trimQueue:UC1', add: ['v1:c1'] });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
  });

  it('a finished scan from this panel opens the list', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan });
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({ shown: { view: 'claims', n: 1 } }));
    expect(await screen.findByText(/Copyright claims — Mine/)).toBeTruthy();
  });
});
```
Run: `npx vitest run tests/panel-copyright.test.tsx tests/panel-queue.test.tsx tests/queue-view.test.ts tests/panel-claims.test.ts tests/panel-i18n.test.tsx`
Expected: PASS. (Add the claim list, songs list and tracklist editor to the Thai render in `panel-i18n.test.tsx` with a stored scan and song history.)

- [ ] **Step 9: Verify and commit**

Run: `npm run check && npm run build`
```bash
git add extension/lib/panel/claims.ts extension/entrypoints/sidepanel/tabs/copyright extension/lib/studio/queue-view.ts extension/entrypoints/sidepanel/tabs/QueueCard.tsx extension/entrypoints/sidepanel/panel.tsx extension/scripts/strings/dropped.mjs extension/tests/panel-claims.test.ts extension/tests/panel-copyright.test.tsx extension/tests/panel-fake.tsx extension/tests/queue-view.test.ts extension/tests/panel-queue.test.tsx extension/tests/panel-i18n.test.tsx
git commit -m "Copyright tab: claim list with picks and CSV, claimed songs with CSV in and out, tracklist fix; the queue card warns of claimed songs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 4a wrap-up

**Files:**
- Modify: `extension/README.md`

- [ ] **Step 1: README**

- "Moving from the userscript": replace "Upload history and per-channel copyright data aren't part of the backup." with: "Upload history and per-channel copyright data (claim scans, trim results, follow-up trims, Auto-pilot on/off) aren't part of the backup, as in the userscript; the copyright settings are. After moving: rescan each channel and turn Auto-pilot on again; let pending follow-up trims finish in the userscript before switching. The claimed-songs history can come along as a CSV (userscript: Claimed songs → ⬇ CSV; extension: Copyright → Claimed songs → ⬆ Import CSV), but the CSV keeps only titles, artists, claimants, counts and the first channel, not which video was which: imported songs count their videos by title, and a rescan adds the real videos beside them, so a song's "claimed in N videos" can count a video twice."
- Layout: add `- lib/claims/ — the copyright module ported from the userscript (claims.ts, port-checked); its data: per-channel keys, one writer (claims:op in the background)` and `- lib/main-youtubei.ts — Studio's /youtubei/v1 calls, run in the MAIN world`.
- Item 2: "the Copyright tab says "Copyright scan and trim arrive in a later version of the extension"" → "the Copyright tab shows the status card and Scan claims".

- [ ] **Step 2: Full verification**

Run, from `extension/`: `npm run check && npm run build`; from the repo root: `node --test test/*.test.mjs` (163 pass, 0 fail); `git diff --stat d15ef87 -- youtube-upload-presets.user.js test/` (empty).
Expected: all green; manifest permissions unchanged (`grep -o '"permissions":\[[^]]*\]' .output/chrome-mv3/manifest.json` → `sidePanel, storage, unlimitedStorage, alarms, notifications`).

- [ ] **Step 3: Commit**

```bash
git add extension/README.md
git commit -m "README: copyright data when moving from the userscript; Phase 4a layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## What 4b does next

`docs/superpowers/plans/2026-10-09-chrome-extension-phase-4b.md`: the rest of the page port (trim, follow-ups, ads and Collab runs, the Auto-pilot cycle, the confirm watcher, the tick) under the automation lock; Auto-pilot on `chrome.alarms`; the Copyright tab's trim confirm, Stop, Auto-pilot switch, Ads and Collab views and Copyright settings; coverage of the copyright module's strings, the README Phase 4 checklist, the spec amendment and the exit check.
