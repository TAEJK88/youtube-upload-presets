# Chrome Extension — Phase 4b (Copyright: trim, follow-ups, ads, Collab, Auto-pilot on alarms, exit check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Phase 4a (`docs/superpowers/plans/2026-10-09-chrome-extension-phase-4a.md`) is complete: the claims store and `claims:op`, the runner lock with jobs, youtubei through the MAIN world, `lib/claims/claims.ts` with the scans and the status, `claims:state` routing, and the Copyright tab's home, claim list, songs and tracklist fix.

**4a as shipped (reconciled 2026-10-10; where a sample below differs from the code, the code wins):**
- `lib/claims/`: `keys.ts` (`isChannelId`, `chKey`, `splitKey`, `channelKeys`), `ops.ts` (`ClaimsOp`, `applyOp`, `isClaimsOp`, `okId`, `SONGS_CSV_MAX`), `store.ts` (`load`, `save`, `write`, `useMemoryClaims`, `flushClaims`; a write that isn't answered in `SEND_TIMEOUT_MS` = 30 s counts as failed **but may still be applied**), `songs.ts`, `core.ts`, `claims.ts` (4a's port + `ClaimsUi`, its own `uploadBusy()`, `chMerge` / `chList` / `chRunItem`, `claimsState`, `claimsStatus`, `startScan`), `answers.ts` (`checkAnswer(path, answer)`: every youtubei answer is copied as plain data and shape-checked; **`creator/get_creator_videos` has no check yet, so its answers are refused**), `page.ts` (`createClaimsPage(…)` → `{ ui, tick(), scan(what), dispose() }`; `scan` refreshes ytcfg first), `wiring.ts` (`wireClaims(call)`, `loadClaimsData()`), `youtubei.ts` (`yti` = call + `checkAnswer`).
- `lib/runner-lock.ts`: jobs as planned, plus `studioTab(sender)` (lock and lease messages are refused from non-Studio senders), and the worker lease stored as `claimsWorkers: { [ch]: { tabId, at } }`, stale after `LEASE_STALE` = 20 s without a renewal, renewal written at most every 5 s, a discarded tab not live. So **a worker must ask again at least every few seconds or it loses the lease**.
- `lib/studio/queue-runner.ts`: `abortRun(err | null)` / `abortedRun()`, `refreshForStart()` (the bounded ytcfg + scheduled-list refresh before a start).
- Panel: `ClaimsContext` / `useClaims()` (`state`, `live`, `log`, `shown`, `addLog`), `PanelApi.busyElsewhere`, `CopyrightTab.tsx` (`useClaimsData(ch)` returns `null` until the data is that channel's; `useClaimsGlobals()`; an open view closes when `state.channel` changes; the home's buttons are a wrapping flex row with `data-view` attributes for focus return; `saveFailed` for failed writes), `SubView` (focuses its title, sticky footer), `ClaimList` (still takes an optional `trimButton`), `tests/panel-fake.tsx` (`claimsStateWith`, `fakeClaims`, `renderPanel(ui, api, live, claims)`).
- `studio.content.ts`: `const claims = createClaimsPage(…)`, `claims.tick()` in the 800 ms interval, `claims:scan` → `claims.scan(data)`; a second `rpcClient` (`yt`, 30 s) feeds `wireClaims`.

**Goal:** Finish the copyright module with behaviour parity to the userscript: trim claims through "Trim out segment" (automatic or reviewed), follow-up trims for videos with several claims, the manual-trim auto-save, turning ads on in bulk, inviting collaborators in bulk (and accepting on your own channel), Auto-pilot — with `chrome.alarms` waking the Studio tab — and the rest of the Copyright tab (trim confirm, Stop, Auto-pilot switch, Ads and Collab views, Copyright settings). Then cover the module's strings, write the README Phase 4 checklist, amend the spec and pass the spec's Phase 4 exit check: **the scan / trim / autopilot checklist passes**.

**Architecture:** As 4a. `lib/claims/claims.ts` grows to the whole `Claims` IIFE (the port config reaches its final regions); jobs that change pages (trim / ads / Collab runs) take the automation lock for `'claims'` before they navigate and let it go when no run is left (D21); `isWorker()` becomes the background's per-channel worker lease (the userscript's tab lease, 4a D21). The background keeps one alarm per channel at its next cycle and, when it fires, nudges that channel's worker tab (`claims:autopilot`), which runs the cycle exactly as its own 0.8 s tick would (D25).

**Tech Stack:** as Phase 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` — "Background" (Autopilot), "Messaging" (Phase 4 `claims:*`), "Testing" (Real-Studio checklist: scan, trim and autopilot), rollout row 4.

## Global Constraints

Identical to Phase 4a's **Global Constraints** (which include Phase 3's), decisions D19–D24 included. Phase 4b adds:

| # | Topic | Decision |
|---|---|---|
| D25 | Auto-pilot on alarms | `autopilot:<channelId>` keeps `{ on, next, last }` as the userscript did. The background keeps one one-shot alarm `ap:<channelId>` at `next` for every channel with Auto-pilot on whose `next` is in the future (armed when those keys change, never twice for the same `next`; a due channel gets none) and, when it fires, sends `claims:autopilot(channelId)` to that channel's worker tab only (4a D21). That tab runs its tick at once; the worker's tick also starts the cycle by itself when `next` has passed, as in the userscript. With no Studio tab open, nothing runs: `next` stays in the past ("due"), and the cycle starts as soon as a tab for that channel ticks. Follow-up checks stay on the tab's timer (`fuNext`, every `followUpMinutes`), as in the userscript. |
| D26 | Copyright work, the worker lease and the lock | `isWorker()` is the background's per-channel worker lease (4a D21): asked every 10 s (at once on a channel change), its answer is trusted for 15 s at most (under the lease's 20 s) (call 34, approved by the user 2026-10-10: after a worker tab closes another tab on the channel takes over in about 10–15 s; a hung worker's lease still frees after 20 s), and it is never asked while the channel is `'unknown'`; the alarm's nudge asks afresh before it ticks; `isWorker(true)` takes it, as the userscript's "force" took the tab lease. Only the worker ticks Auto-pilot, follow-ups and run steps. Separately, a trim, ads or Collab step takes the automation lock for `'claims'` right before it changes pages (`claimLock()`); refused, the step waits and the card says "⏸ Waiting for another Studio tab to finish (page change needed)"; after the lock it checks the run is still active (a Stop may have landed). The tab lets the job go after a tick in which no run is active and no step is busy (`settleLock()`); a reload of the same tab keeps it. Scans and Auto-pilot's own scan take no lock, so a queue run in a tab on another channel doesn't stop a cycle: only its page changes wait. |
| D27 | Panel → page | `claims:trim(keys)`, `claims:ads(videoIds)`, `claims:collab({ videoIds, handles })`, `claims:stop()` go to the bound tab (Stop: to the lock holder while it runs a copyright job elsewhere). The panel shows the confirmations (`openTrimConfirm`, `toggleAutopilot`) and validates the handles; the page starts the run from its stored scan, as the modal's buttons did. Auto-pilot on/off is a `claims:op` from the panel (no page needed). |

## Review Focus

- **A trim run across page loads.** Each trim step navigates (`location.href = /video/<id>/claims`), so the content script restarts mid-run; the new page must resume the run (same tab keeps the lock), not release it, and not start the step twice (Task 1 test: "a reloaded page that holds the lock goes on with the run").
- **The tab closes mid-run.** Another Studio tab on the same channel must take the run over (the worker lease and the lock free on close) — the userscript did this after 20 s (Task 1 test: "a tab whose holder closed takes over").
- **Two tabs on one channel.** One alarm, one cycle: only the channel's worker runs it (Task 1 test "two tabs on one channel, one alarm"; 4a T4 lease test).
- **A queue run on another channel.** It must not stop this channel's Auto-pilot cycle; only the trim's page change waits, and says so (Task 1 test).
- **Studio in Thai.** A trim must fail with "Studio is not set to English — switch to English and try again" rather than click blindly (Task 1 test).
- **Auto-pilot with no Studio tab.** The alarm fires with nothing to wake: no error, no re-arming every 30 s, and the next tab on that channel starts the cycle at once (Task 2 tests + README item).
- **Stop from another window.** Stop in a panel bound to a different tab of the same channel must stop the holder's run after its current step and cancel queued follow-ups (Task 1 test on `stopAll()`; Task 3 test on routing).

## Parallel execution map

The user wants 4b run in parallel: units that don't touch the same files run at once, each agent in its own git worktree branched from the same base, and the controller merges. This section says what can run together. The task sections below stay the source of each unit's steps, tests and code; a unit is one or more of their steps.

### The limits, plainly

- **The page side is one chain.** Everything ported lives in `lib/claims/claims.ts` and is proved by `scripts/port/claims.mjs`, whose sub counts are checked against the whole file. Two agents editing either file would produce a merge nobody can port-check until it is resolved by hand. So Task 0's two small claims.ts changes (Step 2(b), Step 4's m9) and all of Task 1 are **one unit, one agent**. It is the largest piece of 4b (about 650 ported lines plus its tests) and it is the critical path.
- **`CopyrightTab.tsx` is the panel's hot file.** Task 0 Steps 1, 2(a) and 4 (m10) and Tasks 3, 4 and 5 all edit it. It gets **one owner**; the Ads, Collab and settings views are made independent of it by landing stub files and their routes first.
- **Shared one-line files** (`lib/messages.ts`, `scripts/strings/extension-only.mjs`, `entrypoints/background.ts`, `entrypoints/studio.content.ts`, `lib/runner-lock.ts`) are handled by a small serial "contracts" unit first, then by a single named owner per wave.
- **`README.md`, the spec, `scripts/ui-check.mjs`, `scripts/strings/dropped.mjs` and `tests/panel-i18n.test.tsx`** are touched only by the last, serial unit.

What that leaves: one short serial unit, then **seven units at once**, then one serial unit. Roughly two thirds of the work by line count runs in the middle wave, but its longest unit (the page side) is as long as Task 1 was.

### Units

| Unit | From | Depends on | Creates / modifies (hot files in **bold**) |
|---|---|---|---|
| **K** contracts | new (parts of T0 Step 3, T0 Step 4, T1 Step 6, T2 Step 2, T3–T5) | 4a fix round merged | **`lib/messages.ts`**: every 4b message type (`runner:changed`, `claims:trim`, `claims:ads`, `claims:collab`, `claims:stop`, `claims:autopilot`). **`lib/runner-lock.ts`**: `LOCK_KEY` exported, `registerRunnerLock(onChange?)`, `workerOf(ch)`, with their tests in `tests/runner-lock.test.ts` (T0 Step 3's first test, T2 Step 2's three assertions). `entrypoints/sidepanel/save-failed.ts`: `notConnected` + its `panel-imports` pin. **`scripts/strings/extension-only.mjs`**: three marker lines, nothing else — `// 4b P (page)`, `// 4b D (alarms)`, `// 4b Q (panel)`, each followed by a blank comment line `//`. New stub files `tabs/copyright/AdsView.tsx`, `CollabView.tsx`, `CopyrightSettings.tsx` (a `SubView` with the modal's title and Close, props as in Tasks 4–5) and their three routes in **`CopyrightTab.tsx`**'s `sub` expression. |
| **P** page side | T0 Step 2(b), T0 Step 4 (m9), all of T1 | K | **`lib/claims/claims.ts`**, **`scripts/port/claims.mjs`**, `lib/claims/answers.ts`, `lib/claims/page.ts`, `lib/sync-store.ts`, `lib/claims/store.ts`, **`entrypoints/studio.content.ts`** (one block after the `claims:scan` handler), `extension-only.mjs` (under its marker); tests `claims-trim`, `claims-runs`, `claims-autopilot` (new), `claims-youtubei`, `claims-page`, `claims-status`, `claims-scan`, `sync-store`. |
| **Q** panel home | T0 Step 1, T0 Step 2(a), T0 Step 4 (m10: `target.ts`, `bus.ts`, callers of `notConnected`), all of T3 | K | **`CopyrightTab.tsx`** (sole owner after K), `ClaimList.tsx`, `AutopilotSwitch.tsx` (new), `App.tsx`, `components/ui/badge.tsx`, `lib/panel/claims-data.ts`, `lib/panel/claims.ts`, `lib/panel/target.ts`, `lib/panel/bus.ts`; tests `panel-copyright`, `panel-copyright-run` (new), `panel-claims`, `panel-claims-data`, `panel-target`, `panel-imports`, `panel-queue`, **`tests/panel-fake.tsx`** (sole owner). Q also writes the home's Ads off / Collab / Copyright settings **buttons** and their tests (T4 Step 5, T5 Step 2's button): the views they open are K's stubs in Q's worktree. |
| **C** content and background plumbing | T0 Step 2(c), T0 Step 3 (the tab and background side) | K | `lib/studio/queue-view.ts`, `lib/studio/queue-sync.ts`, **`entrypoints/studio.content.ts`** (three spots: after `loadClaimsData()`, the focus handler, the interval), **`entrypoints/background.ts`** (the `registerRunnerLock` callback, one line in `tabs.onUpdated`); tests `queue-view`, `queue-sync`. |
| **D** alarms and the notification | T2 (without `workerOf`, which is K's, and without `background.ts`) | K | `lib/claims/alarms.ts` (new), `tests/claims-alarms.test.ts` (new), `extension-only.mjs` (under its marker). It exports `registerAutopilotAlarms`, `syncAutopilotAlarms`, `openFromAutopilotNote`; **it does not wire them**: unit Z does. |
| **E** pins | T0 Step 5 | K | one new file, `tests/wiring-pins.test.ts`. Nothing else. |
| **H** Ads and Collab views | T4 Steps 1–4 | K | `AdsView.tsx`, `CollabView.tsx` (replacing K's stubs), **new** `lib/panel/claims-runs.ts` (the picks: `adsInitial`, `adsWhere`, `collabWhere` — not in `lib/panel/claims.ts`, which is Q's), **new** tests `panel-ads-collab.test.ts(x)` rendering the two views directly. |
| **J** Copyright settings view | T5 | K | `CopyrightSettings.tsx` (replacing K's stub), **new** `lib/panel/claims-settings.ts` (`settingsSections`), **new** test `panel-copyright-settings.test.tsx` rendering the view directly. |
| **Z** integration and exit | T2's `background.ts` wiring, the Thai renders of every new view, all of T6 | everything | **`entrypoints/background.ts`** (alarms + notification click: T2 Step 2 and Step 4's two blocks), **`tests/panel-i18n.test.tsx`** (the claim-list trim question, the Auto-pilot question, Ads, Collab, settings), `scripts/ui-check.mjs`, `scripts/strings/dropped.mjs`, **`README.md`**, the spec, full verification. |

Where a task section says to put something in `lib/panel/claims.ts` or `tests/panel-copyright-run.test.tsx` and this table names another file for unit H or J, **the table wins**: the split files exist so those units don't meet Q.

### Dependency graph

```
4a fix round ──► K ──┬─► P  (T0 2b, m9, T1)        ──┐
                     ├─► Q  (T0 1, 2a, m10, T3)     ──┤
                     ├─► C  (T0 2c, T0 3)           ──┤
                     ├─► D  (T2 alarms + notice)    ──┼─► Z  (wiring, Thai renders, T6)
                     ├─► E  (T0 5 pins)             ──┤
                     ├─► H  (T4 views)              ──┤
                     └─► J  (T5 view)               ──┘
```
No unit in the middle column depends on another one there. What looks like a dependency is covered by K: the message types P and Q speak to each other with, `workerOf` for D, `notConnected` and the view stubs for Q, H and J.

### Waves

**Wave 0 — serial: K.** One agent, small (an hour's work). The controller reviews and merges it before anything else starts; every other worktree branches from the commit that has K.

**Wave 1 — seven agents at once: P, Q, C, D, E, H, J.** Each in its own worktree from K's commit; each runs `npm run check && npm run build` there before it reports. Their reviews can run in parallel too.

Merge order and the conflicts to expect:

| Order | Unit | Conflicts with what is already merged | How it is avoided or resolved |
|---|---|---|---|
| 1 | E | none (one new file) | — |
| 2 | H, J | none (their own view files, replacing stubs nobody else edits; new lib and test files) | Q must not touch K's three stub files. |
| 3 | D | `extension-only.mjs` | Each unit inserts only under its own marker line; the markers are separated by a comment line, so the hunks don't touch. If git still reports a conflict, keep both sides. |
| 4 | C | none yet | — |
| 5 | Q | `extension-only.mjs` (as above; Q adds no pair unless coverage asks) | as above |
| 6 | P | **`entrypoints/studio.content.ts`** with C | C edits three spots (after `loadClaimsData()`, the focus handler, the 800 ms interval); P adds one contiguous block after the `claims:scan` handler and edits nothing else there (its tick change is in `page.ts`). Merge C first; if the block lands beside one of C's lines, keep both. `extension-only.mjs`: as above. |

After each merge the controller runs `npm run check && npm run build` on the merged branch, and the root `node --test test/*.test.mjs`. Port-check is only affected by P's merge.

Rules every wave-1 agent gets in its brief:
- Edit only the files in your row. If you need a change elsewhere, stop and tell the controller.
- No new message types, no edits to `lib/messages.ts`, `lib/runner-lock.ts`, `README.md`, the spec, `tests/panel-i18n.test.tsx`, `scripts/ui-check.mjs`, `scripts/strings/dropped.mjs`.
- New `L()` pairs go under your own marker in `extension-only.mjs` (P, D, Q); H and J use userscript pairs only.
- Commit in your worktree; never push or merge.

**Wave 2 — serial: Z.** One agent on the merged branch: wire the alarms and the notification click in `background.ts`, render the new views in Thai in `tests/panel-i18n.test.tsx`, then Task 6 (coverage, `dropped.mjs`, README items 52–74, spec amendments, full verification). Coverage can only be judged with every view merged, which is why it is last.

### Things that only work once merged (Z checks them)

- Q's Stop, trim and Auto-pilot tests use fakes for the tab; P's tests use fakes for the lock and the panel. The first time both sides meet is the merged build: Z's verification is where a mismatch in a message's payload would show, so K's message types are the contract both must compile against.
- D's notification and nudge are unit-tested but unreachable until Z registers them.
- H's and J's views are reachable from the home only after Q's buttons merge.

### If seven agents is too many

P and Q are the two long units; C, D, E, H and J are short. With fewer agents, run P and Q first and feed the five short ones to whoever frees up: nothing else changes. The fully serial order of the task sections (0 → 6) remains valid for a single agent.

---

## File Structure

```
extension/
  lib/
    claims/
      claims.ts                MOD  the whole module: DOM helpers, ads run, Collab run, trim, follow-ups, Auto-pilot, confirm watcher, tick; lock glue; panel entry points
      page.ts                  MOD  the tick runs the ported tick
      alarms.ts                NEW  one alarm per channel at its next cycle; the nudge to its worker tab
    messages.ts                MOD  claims:trim / claims:ads / claims:collab / claims:stop / claims:autopilot
    panel/claims.ts            MOD  ads / Collab picks; trim summary; Auto-pilot rules; settings fields
  entrypoints/
    background.ts              MOD  registers the Auto-pilot alarms
    studio.content.ts          MOD  claims lock, channel switcher, confirm watcher, claims:* handlers
    sidepanel/
      App.tsx                  MOD  ● on the Copyright tab while a run is active
      tabs/CopyrightTab.tsx    MOD  the pane's full layout: Ads / Stop / Collab, the Auto-pilot section, settings
      tabs/copyright/ClaimList.tsx           MOD  ✂ Trim selected (N) and its confirmation
      tabs/copyright/AdsView.tsx  CollabView.tsx  AutopilotSwitch.tsx  CopyrightSettings.tsx   NEW
  scripts/
    port/claims.mjs            MOD  final regions
    ui-check.mjs               MOD  coverage includes the copyright module
    strings/dropped.mjs        MOD  copyright pairs the extension no longer shows, if any
  README.md                    MOD  Phase 4 exit checklist; storage keys; Auto-pilot needs a tab
  tests/
    claims-trim.test.ts claims-runs.test.ts claims-autopilot.test.ts claims-alarms.test.ts panel-copyright-run.test.tsx   NEW
    panel-claims.test.ts panel-i18n.test.tsx claims-page.test.ts                                                          MOD
docs/superpowers/specs/2026-10-05-chrome-extension-design.md   MOD  Phase 4 amendments (Task 6)
```

Userscript line map: see Phase 4a. The regions this plan adds: DOM helpers 4608–4614 · ads run 5337–5453 · Collab run 5548–5647 · `TRIM_LABEL` / `setResult` 5650–5670 · `startTrimRun` / `stopTrimRun` 5698–5739 · follow-ups 5742–5820 · Auto-pilot 5823–5873 · confirm + `trimStep` … `trimOne` 5907–6104 · tick 6310–6354.

---

### Task 0: Carry-ins from the 4a whole-branch review

`.superpowers/sdd/p4/final-review-4a.md` ("Carry into 4b"). These come first: they change files the later tasks build on, and three of them matter only once run steps write often and a tab can hold the lock for copyright work.

**Depends on the 4a fix round** (a fix agent is landing it; read `git log` and the files before starting, and skip a step it already did):
- review I1 / I2 / m12 (the timing test, pins for the entrypoints' guards and the abort guard): if `tests/` has no pin for a guard listed in I2 or m12, add it in Step 5 below;
- m1 (the panel drops the bound tab's copyright state when the tab stops being linked): Task 3's Stop and Auto-pilot switch assume it, so a stale card can't be acted on;
- m2 (a scan whose detail calls all failed): Task 1's Auto-pilot test "does nothing after a scan whose detail calls all failed" assumes `scanClaims()` then returns `null` (or whatever the fix chose: adapt the test's expectation to it, not the fix to the test) and that the stored scan is not replaced;
- m5 (a failed `claims:op` is shown): Task 1's run steps rely on it for the user to see a lost result; "timed out" still means "maybe applied" (Task 1's `settledHere`);
- m7 (`runnerJobs` and `claimsWorkers` in the debug report): README item 52 reads them.

**Files:**
- Modify: `extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx`, `extension/lib/panel/claims-data.ts`, `extension/lib/sync-store.ts`, `extension/lib/claims/store.ts`, `extension/lib/claims/claims.ts`, `extension/scripts/port/claims.mjs`, `extension/lib/studio/queue-view.ts`, `extension/lib/runner-lock.ts`, `extension/lib/messages.ts`, `extension/entrypoints/background.ts`, `extension/lib/studio/queue-sync.ts`, `extension/entrypoints/studio.content.ts`, `extension/lib/panel/bus.ts`, `extension/lib/panel/target.ts`
- Test: `extension/tests/panel-copyright.test.tsx`, `extension/tests/panel-claims-data.test.ts`, `extension/tests/sync-store.test.ts`, `extension/tests/claims-status.test.ts`, `extension/tests/queue-view.test.ts`, `extension/tests/runner-lock.test.ts`, `extension/tests/queue-sync.test.ts`, `extension/tests/claims-scan.test.ts`, `extension/tests/panel-target.test.ts`

**Interfaces:**
- Produces: `SyncStore.peek<R>(key, fn: (value: unknown) => R): R`; `count(key): number` (`lib/claims/store.ts`); `songCount()` (`claims.ts`); `registerRunnerLock(onChange?: () => void)`; `'runner:changed'(): void` (background → Studio tabs); `createLockFollower(d: { ask(): Promise<unknown>; everyMs?: number }): { tick(): void; now(): void }` (`queue-sync.ts`); `LOCK_KEY` exported from `runner-lock.ts`.

- [ ] **Step 1: Scan stays this tab's button (review carry 3) — failing test, then the fix**

4a hides Scan (and the list buttons) when `live` is busy. From Task 1 on, `live` can be another tab's state, on another channel, while it holds the lock for a trim: Scan would vanish here although scans take no lock. The buttons follow the bound tab's `state`; the status card and Stop (Task 3) follow `live`.

`tests/panel-copyright.test.tsx`:
```tsx
  it("another tab's copyright job shows in the card, but this tab's Scan stays", () => {
    renderPanel(<CopyrightTab />, fakePanel(), undefined, fakeClaims({
      state: claimsStateWith(), // this tab: idle
      live: claimsStateWith({ channel: 'UC2', busyRun: true, status: { icon: '✂️', kind: 'busy', title: 'Trimming claim 1 of 2', detail: '' } }),
    }));
    expect(screen.getByText('Trimming claim 1 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Scan claims/ })).toBeTruthy();
  });
```
Run: `npx vitest run tests/panel-copyright.test.tsx` — Expected: FAIL (no Scan button). Fix in `CopyrightTab.tsx`: `const busy = !!state && (state.busyRun || state.busyScan);` (was computed from `s = live ?? state`); the card keeps `s`. Task 3's layout uses the same split: `busyRun` / `busyScan` for the buttons from `state`, Stop from `s`.

- [ ] **Step 2: Three cheap fixes before run steps write often (review m4) — failing tests first**

(a) **The panel re-reads only what changed.** `watchClaims` re-reads all 17 keys, the whole song history included, on any change; a run writes a `runItem` op per item. `tests/panel-claims-data.test.ts`:
```ts
  it('a change is applied from the event, without reading storage again', async () => {
    await browser.storage.local.set({ 'claimScan:UC1': { date: 'd', total: 0, rows: [] }, songHistory: { a: {} } });
    const fn = vi.fn();
    const off = watchClaims('UC1', fn);
    await vi.waitFor(() => expect(fn).toHaveBeenCalled()); // the first full read
    const get = vi.spyOn(browser.storage.local, 'get');
    await browser.storage.local.set({ 'trimQueue:UC1': ['v:c'] });
    await vi.waitFor(() => expect(fn.mock.calls.at(-1)![0].trimQueue).toEqual(['v:c']));
    expect(fn.mock.calls.at(-1)![0].scan?.date).toBe('d'); // the rest kept
    expect(get).not.toHaveBeenCalled();
    await browser.storage.local.remove('claimScan:UC1');
    await vi.waitFor(() => expect(fn.mock.calls.at(-1)![0].scan).toBe(null));
    off();
  });
```
`lib/panel/claims-data.ts`:
```ts
// Follows one channel's keys: one full read, then each change is applied from its event
// (re-reading 17 keys, the song history among them, per run-item write would cost seconds at size).
export function watchClaims(ch: string, fn: (d: ClaimsData) => void): () => void {
  const keys = new Set(channelKeys(ch));
  let raw: Record<string, unknown> | null = null;
  let early: Record<string, { newValue?: unknown }>[] = [];
  const apply = (changes: Record<string, { newValue?: unknown }>) => {
    for (const [k, c] of Object.entries(changes)) {
      if (!keys.has(k)) continue;
      if (c.newValue === undefined) delete raw![k];
      else raw![k] = c.newValue;
    }
  };
  const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !Object.keys(changes).some((k) => keys.has(k))) return;
    if (!raw) return void early.push(changes); // before the first read lands
    apply(changes);
    fn(toClaimsData(ch, raw));
  };
  browser.storage.onChanged.addListener(changed);
  void browser.storage.local.get(channelKeys(ch)).then((got) => {
    raw = got;
    early.forEach(apply);
    early = [];
    fn(toClaimsData(ch, raw));
  }).catch((e) => console.error('[ytup] read copyright data', e));
  return () => browser.storage.onChanged.removeListener(changed);
}
```
(`watchClaims` now also delivers the first read: `useClaimsData` drops its own `readClaims` call and keeps its `data?.ch === ch` gate; update the 4a test that expected no call before a change.)

(b) **Counting songs without copying them.** `getCounts()` clones the whole history every 3 s in every Studio tab to count its keys.

`tests/sync-store.test.ts`:
```ts
describe('peek(): reading without a copy', () => {
  it('hands the stored value itself to the reader, and returns what it returns', async () => {
    await browser.storage.local.set({ counters: { a: 1, b: 2 } });
    const kv = await createSyncStore(['counters']);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect(kv.peek('counters', (v) => Object.keys(v as object).length)).toBe(2);
    expect(kv.peek('uploads' as never, (v) => v)).toBe(undefined); // a known key that isn't stored
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    expect(kv.get('counters')).toEqual({ a: 1, b: 2 }); // get() still copies
  });

  it('an unknown key throws, as for get()', async () => {
    const kv = await createSyncStore(['counters']);
    expect(() => kv.peek('other', (v) => v)).toThrow('unknown key');
  });

  it('the memory store has it too', () => {
    expect(createMemoryStore({ songHistory: { x: {}, y: {} } }).peek('songHistory', (v) => Object.keys(v as object).length)).toBe(2);
  });
});
```
(The second assertion of the first test needs `'uploads'` in that store's key list: create it with `['counters', 'uploads']`.)

`tests/claims-status.test.ts`:
```ts
  it('counts the claimed songs without copying the history (review m4)', () => {
    const songHistory = Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['k' + i, { title: 't' + i, videos: {} }]));
    useMemoryClaims({ songHistory });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect(C.claimsState().counts.songs).toBe(500);
    // nothing as large as the history went through structuredClone
    expect(clone.mock.calls.some(([v]) => v && typeof v === 'object' && Object.keys(v as object).length === 500)).toBe(false);
    clone.mockRestore();
  });
```
(`getCounts()` caches for 3 s: call `C.invalidateCounts()` first if an earlier test in the file read the counts.)

Run: `npx vitest run tests/sync-store.test.ts tests/claims-status.test.ts` — Expected: FAIL (`kv.peek is not a function`; the history is cloned). Then:
- `sync-store.ts`: `peek<R>(key: string, fn: (value: unknown) => R): R` in the interface — "the stored value itself, not a copy: `fn` must only read it" — implemented as `peek: (key, fn) => (check(key), fn(cache.get(key)))` and, in the memory store, `peek: (key, fn) => fn(data.get(key))`;
- `lib/claims/store.ts`: `export const count = (key: string): number => kv.peek(key, (v) => (v && typeof v === 'object' ? Object.keys(v).length : 0));`
- `claims.ts` (outside the port): `const songCount = () => count('songHistory');` and in `scripts/port/claims.mjs` one more sub (checked: 1): `['songs: Object.keys(getSongs()).length,', 'songs: songCount(),', 1]`.

(c) **The queue view checks a tracklist once.** `queue-view.ts` clones the history and rebuilds the title index for every card on every `queue:view`.

`tests/queue-view.test.ts` — at the top of the file, a counting wrapper around the real function:
```ts
const claimedCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../lib/claims/core', async (orig) => {
  const real = await orig<typeof import('../lib/claims/core')>();
  return { ...real, claimedSongsIn: (...a: Parameters<typeof real.claimedSongsIn>) => (claimedCalls.n++, real.claimedSongsIn(...a)) };
});
```
(import `forgetClaimed`, `watchClaimedSongs` from `../lib/studio/queue-view` and `readFileSync` from `node:fs`), and in `describe('queueView', …)`:
```ts
  const history = { k: { title: 'Midnight Rain', artists: 'Lena', label: '', claimants: [], types: [], firstSeen: '', lastSeen: '', videos: { a: {} }, trimmed: 0 } };

  it('checks a tracklist against the song history once, not on every view (review m4)', () => {
    useMemoryClaims({ songHistory: history });
    forgetClaimed();
    Q.queue.push(item('a', 'pending', { txt: '00:00 Lena - Midnight Rain' }), item('b', 'pending', { txt: '00:00 Lena - Midnight Rain' }), item('c', 'pending'));
    claimedCalls.n = 0;
    const first = queueView(state);
    queueView(state);
    queueView(state);
    expect(claimedCalls.n).toBe(1); // two cards share one tracklist text; three views
    expect(first.items[0]!.claimed).toHaveLength(1);
    expect(queueView(state).items[1]!.claimed).toEqual(first.items[0]!.claimed);
    first.items[0]!.claimed.length = 0; // the panel's copy: the cache is not handed out
    expect(queueView(state).items[0]!.claimed).toHaveLength(1);
  });

  it('a changed tracklist is checked again; a changed song history forgets every check', () => {
    useMemoryClaims({ songHistory: history });
    forgetClaimed();
    Q.queue.push(item('a', 'pending', { txt: '00:00 Lena - Midnight Rain' }));
    queueView(state);
    claimedCalls.n = 0;
    Q.queue[0]!.txt = '00:00 Other - Song';
    expect(queueView(state).items[0]!.claimed).toEqual([]);
    expect(claimedCalls.n).toBe(1);
    useMemoryClaims({ songHistory: {} }); // the history changed…
    forgetClaimed(); // …which is what the store's change listener calls
    Q.queue[0]!.txt = '00:00 Lena - Midnight Rain';
    expect(queueView(state).items[0]!.claimed).toEqual([]);
  });

  // The memory store has no change events, so the link from the store to forgetClaimed() is pinned in the source.
  it('forgets its checks when the stored song history changes', () => {
    const src = readFileSync(new URL('../lib/studio/queue-view.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/onClaimsStored\('songHistory',\s*forgetClaimed\)/);
    const content = readFileSync(new URL('../entrypoints/studio.content.ts', import.meta.url), 'utf8');
    expect(content).toMatch(/stop\.add\(watchClaimedSongs\(\)\)/);
  });
```
Expected: FAIL (`forgetClaimed` is not exported; `claimedCalls.n` is 6). Fix in `queue-view.ts`:
```ts
// claimedSongsIn() per tracklist text, kept until the song history changes: the check clones the
// whole history and builds its title index, and queue:view runs on every change the panel hears.
type Claimed = ViewItem['claimed'];
const claimedCache = new Map<string, Claimed>();
export const forgetClaimed = () => claimedCache.clear();
// The content script calls it once the claims store is loaded; returns the undo.
export const watchClaimedSongs = (): (() => void) => onClaimsStored('songHistory', forgetClaimed);
function claimedIn(txt: string): Claimed {
  let hit = claimedCache.get(txt);
  if (!hit) {
    hit = claimedSongsIn(txt, getSongs());
    claimedCache.set(txt, hit);
  }
  return hit.map((x) => ({ ...x })); // a copy: the view goes to the panel
}
```
and in `queueView()`: `claimed: it.txt ? claimedIn(it.txt) : [],` (drop the per-view `const songs = getSongs();`). `studio.content.ts`, after `await loadClaimsData();`: `stop.add(watchClaimedSongs());` (`onClaimsStored`'s first caller: review m11).

Run: `npx vitest run tests/panel-claims-data.test.ts tests/sync-store.test.ts tests/claims-status.test.ts tests/queue-view.test.ts` — FAIL first, PASS after.

- [ ] **Step 3: The lock is followed by events, not a 0.8 s poll (review m6) — failing tests first**

Since Phase 3 every Studio tab asks `runner:elsewhere` every 0.8 s, which never lets the service worker idle; call 31 claimed otherwise. Decision: the background tells the Studio tabs when the lock changes, and tabs ask on that, on focus (as today) and every 30 s as a fallback. (The worker lease still asks every 10 s — Task 1, call 34 — so with a Studio tab open the service worker is woken a few times a minute, not 75; nothing depends on it sleeping. Call 31's sentence is corrected in the planning report.)

`tests/runner-lock.test.ts`:
```ts
  it('tells its listener when the lock or its jobs change, also when a stale holder is cleaned up', async () => {
    const changed = vi.fn();
    registerRunnerLock(changed);
    const a = await tab();
    await acquireRunner(a, 'queue');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    await acquireRunner(a, 'claims');
    await releaseRunner(a, 'all');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(3));
    await claimWorker(a, 'UC1', false); // the worker lease is not the lock
    await new Promise((r) => setTimeout(r, 0));
    expect(changed).toHaveBeenCalledTimes(3);
  });
```
`tests/queue-sync.test.ts`:
```ts
  it('asks about the lock every 30 s from the tick, and at once when told it changed', () => {
    vi.useFakeTimers();
    const ask = vi.fn(async () => false);
    const f = createLockFollower({ ask });
    for (let i = 0; i < 40; i++) { f.tick(); vi.advanceTimersByTime(800); } // 32 s of ticks
    expect(ask).toHaveBeenCalledTimes(2);
    f.now(); // runner:changed, focus
    expect(ask).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
```
Implement:
- `runner-lock.ts`: export `LOCK_KEY` (today's private `KEY`); `registerRunnerLock(onChange?: () => void)` also adds `browser.storage.onChanged.addListener((changes, area) => { if (area === 'session' && (LOCK_KEY in changes || JOBS_KEY in changes)) onChange?.(); })`.
- `messages.ts`: `'runner:changed'(): void; // background → Studio tabs: the automation lock moved, ask again`.
- `background.ts`: `registerRunnerLock(() => void tellStudioTabs())`, where `tellStudioTabs` sends `runner:changed` to every tab whose URL is Studio (`tabs.query({})` + `isStudioUrl`, each send with its own `.catch(() => {})`); and in the existing `tabs.onUpdated` listener, `if (info.url) void runnerHeld().catch(() => {});` — a holder that left Studio is cleaned up then, which fires the change.
- `queue-sync.ts`:
```ts
// The lock is followed by events (runner:changed from the background, focus), with a slow poll
// as the fallback: asking on every 0.8 s tick kept the service worker awake for good.
export function createLockFollower(d: { ask(): Promise<unknown>; everyMs?: number }) {
  let at = 0;
  const now = () => { at = Date.now(); void d.ask().catch(() => {}); };
  return { now, tick() { if (Date.now() - at >= (d.everyMs ?? 30_000)) now(); } };
}
```
- `studio.content.ts`: `const lockFollower = createLockFollower({ ask: elsewhere });` — the interval calls `lockFollower.tick()` where it called `void elsewhere()`, the focus / visibility handler calls `lockFollower.now()`, and `onMessage('runner:changed', () => lockFollower.now());`.

README item 29 ("the running tab closes… within about a second") still holds: a closed tab frees the lock in `tabs.onRemoved`, which is a change.

- [ ] **Step 4: Clean-ups (review m9, m10) — failing tests first**

**m9.** `tests/claims-scan.test.ts`, in `describe('scanClaims', …)`:
```ts
  it("an owner id that names a built-in prints as the id, not as a function (review m9)", async () => {
    api['creator/list_creator_received_claims'] = () => ({
      contentOwners: [{ contentOwnerId: 'o1', displayName: 'Label Co' }],
      receivedClaims: [{ ...claims().receivedClaims[0]!, contentOwnerIds: ['constructor', 'toString', 'o1'] }],
    });
    const rows = await run(C.scanClaims({ show: false }));
    expect(rows![0]!.claimant).toBe('constructor, toString, Label Co');
  });
```
Expected: FAIL (the claimant starts with `function Object() { [native code] }`). Fix: one more sub in `scripts/port/claims.mjs` (checked: 1): `['const owners = {};', 'const owners = Object.create(null);', 1]`, and the same change in `claims.ts`'s port block (typed `const owners: Record<string, string> = Object.create(null);`).

**m10.** Three small de-duplications, each pinned.

`tests/panel-target.test.ts`:
```ts
  it('the runner tab is read with the lock module\'s own keys, and a discarded tab is nobody (review m10)', async () => {
    await browser.storage.session.set({ [LOCK_KEY]: 9, [JOBS_KEY]: ['claims'] });
    const get = vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: 9, windowId: 2, url: 'https://studio.youtube.com/', title: 'A', discarded: true } as never);
    expect(await runnerTab()).toBe(null); // Memory Saver: no script runs there (holder() says the same)
    get.mockResolvedValue({ id: 9, windowId: 2, url: 'https://studio.youtube.com/', title: 'A', discarded: false } as never);
    expect(await runnerTab()).toEqual({ tabId: 9, windowId: 2, title: 'A', jobs: ['claims'] });
    const src = readFileSync(new URL('../lib/panel/target.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/'runnerTabId'|'runnerJobs'/); // no second copy of the key names
  });
```
(imports: `JOBS_KEY`, `LOCK_KEY` from `../lib/runner-lock`; `readFileSync` from `node:fs`.)

`tests/panel-imports.test.ts` (it already reads sources), a new `describe`:
```ts
describe('one copy of shared helpers (4a review m10)', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
  it('the panel bus uses the lock module\'s studioTab', () => {
    const src = read('lib/panel/bus.ts');
    expect(src).toMatch(/import \{[^}]*\bstudioTab\b[^}]*\} from '\.\.\/runner-lock'/);
    expect(src).not.toMatch(/const studioTab\s*=/);
  });
  it('the "not connected" toast is said in one place', () => {
    const said = ['entrypoints/sidepanel/tabs/CopyrightTab.tsx', 'entrypoints/sidepanel/tabs/copyright/ClaimList.tsx']
      .filter((f) => read(f).includes('This tab is not connected to the extension yet'));
    expect(said).toEqual([]);
    expect(read('entrypoints/sidepanel/save-failed.ts')).toMatch(/export const notConnected\b/);
  });
});
```
`tests/panel-copyright.test.tsx`:
```tsx
  it('a tab that does not answer says so once, through the shared helper', async () => {
    const toastSpy = vi.spyOn(await import('sonner'), 'toast');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakePanel({ send: vi.fn(async () => { throw new Error('Could not establish connection'); }) as never });
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims());
    fireEvent.click(screen.getByRole('button', { name: /Scan claims/ }));
    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith('This tab is not connected to the extension yet — reload this tab', { id: 'not-connected' }));
  });
```
Expected: FAIL (a discarded runner tab is returned; `bus.ts` has its own `studioTab`; the toast has no id and two copies). Fix:
- `lib/panel/target.ts` `runnerTab()`: read `[LOCK_KEY, JOBS_KEY]` (imported from `../runner-lock`), and `const tab = await browser.tabs.get(id).catch(() => undefined); const t = tab?.discarded ? null : asTarget(tab);`; `watchRunner` uses the same two constants.
- `lib/panel/bus.ts`: `import { studioTab } from '../runner-lock';`, its own copy deleted (the shared one returns `null` where the copy returned `undefined`: the callers' `tabId === undefined` tests become `tabId == null`).
- `entrypoints/sidepanel/save-failed.ts`:
```ts
// The Studio tab didn't take a message (no live script there, or it is reloading).
export const notConnected = (e: unknown): void => {
  console.error('[ytup] tab not connected', e);
  toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'), { id: 'not-connected' });
};
```
  used by `CopyrightTab`, `ClaimList`, and wherever this plan's later samples define a local `failed` helper (Tasks 3–5: use `notConnected` instead).
- `isPlain` and the `__proto__` set stay duplicated between `answers.ts` and `main-youtubei.ts`: the MAIN-world bundle must not import tab code. (No test: a comment in each names the other.)

- [ ] **Step 5: Pins the 4a fix round may have left (review I2, m12)**

For each line below, check that some test fails when it is removed (try it); where none does, add a source-text pin in the style of `tests/claims-page.test.ts`: `mayWrite('claims:op'` in `background.ts`; `studioTab(sender)` on `runner:acquire` and `runner:worker`; `isChannelId(d?.ch)`; `runnerHeld()` on `backup:write`; `abort: () => abortRun(` and `stop.add(disposeClaimsStore)` in `studio.content.ts`; `if (!runs && running && abortedRun()) return;` in `queue-store.ts`.

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm run build` (run the full suite twice: the 4a timing test must not flake).
```bash
git add extension/entrypoints extension/lib extension/scripts/port/claims.mjs extension/tests
git commit -m "Before 4b: Scan follows this tab, the panel applies copyright changes from their events, the lock is followed by events instead of a 0.8 s poll, small clean-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(`git add` by directory here is safe only if `git status` shows nothing else changed under them; otherwise list the files.)

---

### Task 1: The page side — trim, follow-ups, ads and Collab runs, Auto-pilot cycle, tick

The rest of the Claims IIFE, port-checked, plus the glue: the lock (D26), the entry points the panel calls (D27) and the Auto-pilot nudge.

**Files:**
- Modify: `extension/scripts/port/claims.mjs`, `extension/lib/claims/claims.ts`, `extension/lib/claims/answers.ts`, `extension/lib/claims/page.ts`, `extension/lib/messages.ts`, `extension/entrypoints/studio.content.ts`, `extension/scripts/strings/extension-only.mjs`
- Create: `extension/tests/claims-trim.test.ts`, `extension/tests/claims-runs.test.ts`, `extension/tests/claims-autopilot.test.ts`
- Test: `extension/tests/claims-page.test.ts`, `extension/tests/claims-youtubei.test.ts`

**First callers (4a review m11).** 4a added these for 4b and nothing used them: the `runner:worker` and `runner:holds` handlers (this task's `setClaimsLock` wiring), `chMerge` / `chList` / `chRunItem` (the port's result writes), the three `set…Stage` (the steps), `ClaimsState.workerHere` (set by the ported tick from `isWorker()`; until now always `true`). Each gets a test in this task: the wiring test in Step 6 pins `runner:worker` / `runner:holds` in `studio.content.ts`'s source, and `tests/claims-status.test.ts` gains "a tab that isn't the channel's worker reports `workerHere: false` and shows '↪ Running in another Studio tab' for a run" (worker fake answering `false`, then `claimsTick()`).

**Interfaces:**
- Consumes: 4a's `claims.ts` (`chGet` / `chSet` / `chMerge` / `chList` / `chRunItem`, `log`, `flash`, `computeStatus`, stages, getters, `scanClaims`, `scanAds`), `write`, `yti`, `waitFor` / `sleep` / `shownDialog` / `clickIn` / `clickByText` (`automation.ts`), `inviteCollaborators` (`studio/collab.ts`), `inviteOutcome` / `parseHandles` (`lib/collab.ts`), `SEL`, `TXT`, `settings` / `load as loadState` (`studio/state.ts`); 4a T6's own `uploadBusy()` in `claims.ts`.
- Produces (all from `claims.ts`): `setClaimsLock(l: { worker(ch: string, force: boolean): Promise<boolean>; acquire(): Promise<boolean>; release(): void; holds(): Promise<boolean> })`, `initClaimsLock(): Promise<void>`, `setCfgRefresh(fn: () => Promise<void>)`, `setChannelSwitcher(fn: (t: { handle?: string; name?: string }, next: string) => void)`, `installConfirmWatch(): () => void`, `claimsTick(): void`, `trimFromPanel(keys: unknown): void`, `adsFromPanel(ids: unknown): void`, `collabFromPanel(d: unknown): void`, `stopAll(): void`, `autopilotDue(ch: unknown): Promise<void>`, and the ported `startTrimRun`, `stopTrimRun`, `setResult`, `trimStep`, `trimOne`, `fuCheck`, `apPick`, `apCycle`, `startAdsRun`, `stopAdsRun`, `adsStep`, `adsOne`, `startCollabRun`, `stopCollabRun`, `collabStep`, `chainAcceptInvites`, `tick`.
- `messages.ts`: `'claims:trim'(keys: string[]): void`, `'claims:ads'(videoIds: string[]): void`, `'claims:collab'(d: { videoIds: string[]; handles: string[] }): void`, `'claims:stop'(): void`, `'claims:autopilot'(channelId: string): void`.

- [ ] **Step 1: Write the failing trim and lock tests**

`extension/tests/claims-trim.test.ts`:
```ts
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsOp } from '../lib/claims/ops';
import { useMemoryClaims, load } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';

vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
import * as C from '../lib/claims/claims';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const ops: ClaimsOp[] = [];
const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
const row = (videoId: string, claimId: string, extra = {}) => ({
  videoId, video: 'Mix ' + videoId, privacy: 'public', length: 600, claimId, song: 'Song ' + claimId, artists: '', label: '', claimant: 'Co',
  type: 'audio', status: 'active', impact: 'blocked', segments: [[10, 20]], claimedSec: 10, canTrim: true, options: 'trim', own: false, hasImpact: true, publishAt: 0, ...extra,
});
const claim = (claimId: string, options = ['NON_TAKEDOWN_CLAIM_OPTION_TRIM']) => ({
  claimId, status: 'RECEIVED_CLAIM_STATUS_ACTIVE', asset: { metadata: { title: 'Song ' + claimId } }, nontakedownClaimActions: { options },
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // happy-dom has no layout: an element in the document is "visible", a removed one is not
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) { return (this.isConnected ? [{}] : []) as unknown as DOMRectList; });
  history.replaceState(null, '', `/video/v1/claims`);
  document.documentElement.lang = 'en';
  document.body.innerHTML = '';
  ops.length = 0;
  useMemoryClaims({ [`claimScan:${CH}`]: { date: '', total: 2, channel: CH, channelName: 'C', rows: [row('v1', 'c1'), row('v1', 'c2'), row('v2', 'c3')] } }, async (op) => void ops.push(op));
  C.setClaimsUi(ui);
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  C.setClaimsLock({ acquire: async () => true, release: vi.fn(), worker: async () => true, holds: async () => false });
  await C.initClaimsLock();
});
afterEach(() => {
  C.setClaimsUi(null);
  setYoutubei(null);
  vi.restoreAllMocks();
});

describe('starting a trim run', () => {
  it('trims the first claim of each video now and queues the rest as follow-ups', () => {
    C.trimFromPanel(['v1:c1', 'v1:c2', 'v2:c3']);
    const run = load<{ active: boolean; mode: string; items: { key: string; state: string }[] }>(`trimRun:${CH}`, null as never);
    expect(run.active).toBe(true);
    expect(run.mode).toBe('auto'); // autoSaveTrim defaults on
    expect(run.items.map((i) => [i.key, i.state])).toEqual([['v1:c1', 'pending'], ['v1:c2', 'later'], ['v2:c3', 'pending']]);
    expect(Object.keys(load(`followUp:${CH}`, {}))).toEqual(['v1']);
    expect(ops.find((o) => o.op === 'merge' && o.key === `trimResults:${CH}`)).toMatchObject({ entries: { 'v1:c2': { state: 'later' } } });
  });

  it('refuses a second batch while one runs', () => {
    C.trimFromPanel(['v2:c3']);
    C.trimFromPanel(['v2:c3']);
    expect(ui.toast).toHaveBeenCalledWith('Previous batch still trimming');
  });

  it('nothing picked: says so', () => {
    C.trimFromPanel([]);
    expect(ui.log).toHaveBeenCalledWith('No claims selected', 'warn');
  });
});

describe('trimOne on the claims page', () => {
  // Studio's claims page, enough of it: a row with Take action → the option list → Continue →
  // the trim editor with Save → the "Confirm changes" dialog with its checkbox.
  function studioPage() {
    document.body.innerHTML = `
      <ytcr-video-content-list-row><span>Song c1</span><button>Take action</button></ytcr-video-content-list-row>`;
    document.querySelector('button')!.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', `<tp-yt-paper-dialog id="opts"><button><span>Trim out segment</span></button><button id="cont">Continue</button></tp-yt-paper-dialog>`);
      document.querySelector('#cont')!.addEventListener('click', () => {
        document.querySelector('#opts')!.remove();
        document.body.insertAdjacentHTML('beforeend', `<ytcr-editing-tool-dialog>Start time 0:10 End time 0:20<div id="continue-button"><button>Save</button></div></ytcr-editing-tool-dialog>`);
        document.querySelector('#continue-button button')!.addEventListener('click', () => {
          document.querySelector('ytcr-editing-tool-dialog')!.remove();
          document.body.insertAdjacentHTML('beforeend', `<div role="dialog" id="cf">Confirm changes<label><input type="checkbox">I acknowledge</label><button disabled>Confirm changes</button></div>`);
          const box = document.querySelector<HTMLInputElement>('#cf input')!;
          const ok = document.querySelector<HTMLButtonElement>('#cf button')!;
          box.addEventListener('click', () => { ok.disabled = false; });
          ok.addEventListener('click', () => document.querySelector('#cf')!.remove());
        });
      });
    });
  }

  it('auto mode: Take action → Trim out segment → Continue → Save → I acknowledge → Confirm changes; saved', async () => {
    setYoutubei(async () => ({ receivedClaims: [claim('c1')] }));
    studioPage();
    const off = C.installConfirmWatch();
    // the run as startTrimRun left it (not started here: its trimStep would run trimOne too)
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: '', items: [{ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'Song c1', video: 'Mix v1', state: 'pending', msg: '' }] } },
      async (op) => void ops.push(op));
    await C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'Song c1', video: 'Mix v1', state: 'pending', msg: '' }, 'auto');
    off();
    expect(ops.find((o) => o.op === 'merge' && o.key === `trimResults:${CH}` && 'v1:c1' in o.entries)).toMatchObject({ entries: { 'v1:c1': { state: 'saved', msg: '0:10–0:20' } } });
    expect(ops.some((o) => o.op === 'songs' && o.songs.fn === 'trimmed')).toBe(true);
    expect(ops.some((o) => o.op === 'list' && o.key === `trimQueue:${CH}` && o.del?.includes('v1:c1'))).toBe(true);
  });

  it('a claim already released is "gone"; one without the Trim option fails', async () => {
    setYoutubei(async () => ({ receivedClaims: [] }));
    await C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: '', video: 'Mix v1', state: 'pending', msg: '' }, 'auto');
    expect(ops.find((o) => o.op === 'merge' && o.key === `trimResults:${CH}`)).toMatchObject({ entries: { 'v1:c1': { state: 'gone', msg: 'Released' } } });
    setYoutubei(async () => ({ receivedClaims: [claim('c1', [])] }));
    await C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: '', video: 'Mix v1', state: 'pending', msg: '' }, 'auto');
    expect(JSON.stringify(ops)).toContain('Trim option no longer available');
  });

  it('Studio not in English: refuses before clicking anything', async () => {
    document.documentElement.lang = 'th';
    await expect(C.trimOne({ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: '', video: '', state: 'pending', msg: '' }, 'auto'))
      .rejects.toThrow('Studio is not set to English — switch to English and try again');
  });
});

describe('stop and the lock', () => {
  it('Stop ends the run and cancels queued follow-ups', () => {
    C.trimFromPanel(['v1:c1', 'v1:c2']);
    C.stopAll();
    expect(ops).toContainEqual({ op: 'merge', key: `trimRun:${CH}`, entries: { active: false } });
    expect(load(`followUp:${CH}`, null)).toEqual({});
    expect(ui.log).toHaveBeenCalledWith('Cancelled 1 queued follow-up trims', 'warn');
  });

  it('a step that changes pages takes the lock first, and waits when another tab holds it', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    const acquire = vi.fn(async () => false);
    C.setClaimsLock({ acquire, release: vi.fn(), worker: async () => true, holds: async () => false });
    C.startTrimRun([row('v2', 'c3')], 'auto');
    await C.trimStep();
    expect(acquire).toHaveBeenCalled();
    expect(location.pathname).toBe('/channel/x/videos'); // did not navigate
    expect(C.trimStage.detail).toBe('⏸ Waiting for another Studio tab to finish (page change needed)'); // the card says why
  });

  it('a Stop that lands while the step waits for the lock: no page change', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    let grant!: (v: boolean) => void;
    C.setClaimsLock({ acquire: () => new Promise<boolean>((r) => { grant = r; }), release: vi.fn(), worker: async () => true, holds: async () => false });
    C.startTrimRun([row('v2', 'c3')], 'auto'); // its trimStep now waits for the lock
    C.stopAll();
    grant(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(location.pathname).toBe('/channel/x/videos');
  });

  it('the job is let go after a tick with no run left', async () => {
    const release = vi.fn();
    C.setClaimsLock({ acquire: async () => true, release, worker: async () => true, holds: async () => true });
    await C.initClaimsLock(); // a page back from its own reload holds the job
    C.claimsTick();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('a tab whose holder closed takes over the run (the userscript waited 20 s for the lease)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: '', items: [{ key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'S', video: 'Mix v1', state: 'pending', msg: '' }] } });
    const acquire = vi.fn(async () => false); // asked; the test stops there
    // the closed tab's lease is free: this tab is the channel's worker now
    C.setClaimsLock({ acquire, release: vi.fn(), worker: async () => true, holds: async () => false });
    await C.initClaimsLock();
    C.claimsTick();
    await vi.advanceTimersByTimeAsync(2500); // tick → trimStep after 2.5 s (6330–6332)
    expect(acquire).toHaveBeenCalled();
    vi.useRealTimers();
  });

  // 4a T4 review r2 / m8
  it("the worker answer expires: older than the renew interval, the tab isn't the worker until a fresh one", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    let answer!: (v: boolean) => void;
    C.setClaimsLock({ worker: () => new Promise<boolean>((r) => { answer = r; }), acquire: async () => true, release: vi.fn(), holds: async () => false });
    const init = C.initClaimsLock();
    answer(true);
    await init;
    await vi.advanceTimersByTimeAsync(16_000); // the background never answers the renewals: past the 15 s an answer is trusted
    C.claimsTick();
    expect(ops).toEqual([]); // no cycle on a stale "yes"
    answer(true);
    await vi.advanceTimersByTimeAsync(0);
    C.claimsTick();
    expect(ops[0]).toMatchObject({ op: 'merge', key: `autopilot:${CH}` }); // fresh: the cycle starts
    vi.useRealTimers();
  });

  it("no lease is asked while the channel is 'unknown'", async () => {
    resetCfg();
    history.replaceState(null, '', '/video/v1/claims'); // no channel in the address, none from ytcfg
    const worker = vi.fn(async () => true);
    C.setClaimsLock({ worker, acquire: async () => true, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    C.claimsTick();
    await C.autopilotDue('unknown');
    expect(worker).not.toHaveBeenCalled();
  });

  // 4a T3 review m4
  it('a result whose write timed out is not done again: the item is skipped and its result re-sent', async () => {
    const run = { active: true, mode: 'auto', started: 's1', items: [
      { key: 'v1:c1', videoId: 'v1', claimId: 'c1', song: 'S', video: 'Mix v1', state: 'pending', msg: '' }] };
    useMemoryClaims({ [`trimRun:${CH}`]: run }, async (op) => void ops.push(op));
    C.setResult(run.items[0] as never, 'saved', '0:10–0:20');
    useMemoryClaims({ [`trimRun:${CH}`]: run }, async (op) => void ops.push(op)); // the write timed out: the copy is storage's again
    ops.length = 0;
    const acquire = vi.fn(async () => true);
    C.setClaimsLock({ worker: async () => true, acquire, release: vi.fn(), holds: async () => false });
    await C.trimStep(); // nothing left to do here: it must not trim v1:c1 a second time
    expect(acquire).not.toHaveBeenCalled();
    C.claimsTick();
    expect(ops).toContainEqual({ op: 'runItem', key: `trimRun:${CH}`, by: 'key', id: 'v1:c1', state: 'saved', msg: '0:10–0:20', onlyActive: true });
  });

  it('a reloaded page that holds the lock goes on with the run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useMemoryClaims({ [`trimRun:${CH}`]: { active: true, mode: 'auto', started: '', items: [{ key: 'v2:c3', videoId: 'v2', claimId: 'c3', song: 'S', video: 'Mix v2', state: 'pending', msg: '' }] } });
    const release = vi.fn();
    C.setClaimsLock({ acquire: async () => true, release, worker: async () => true, holds: async () => true });
    await C.initClaimsLock();
    C.claimsTick();
    expect(release).not.toHaveBeenCalled(); // the run is active: the job stays
    vi.useRealTimers();
  });
});
```
(Location changes: happy-dom's `location.href = '/video/…'` navigates the test page; the "waits" test checks it did not. If happy-dom throws on navigation, stub `location` with `vi.stubGlobal('location', { pathname: …, set href(v) { this.pathname = v; } })` in that test.)


- [ ] **Step 2: Write the failing ads / Collab / follow-up / Auto-pilot tests**

`extension/tests/claims-runs.test.ts`:
```ts
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsOp } from '../lib/claims/ops';
import { load, useMemoryClaims } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';
import { settings } from '../lib/studio/state';

vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
import * as C from '../lib/claims/claims';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const ops: ClaimsOp[] = [];
const ui = { show: vi.fn(), status: vi.fn(), log: vi.fn(), toast: vi.fn() };
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ops.length = 0;
  Q.queue.splice(0);
  C.setClaimsUi(ui);
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  C.setClaimsLock({ acquire: async () => true, release: vi.fn(), worker: async () => true, holds: async () => false });
  await C.initClaimsLock();
});
afterEach(() => { C.setClaimsUi(null); setYoutubei(null); vi.restoreAllMocks(); });

describe('ads run', () => {
  beforeEach(() => useMemoryClaims({ [`adsScan:${CH}`]: { date: '', total: 2, rows: [{ videoId: 'a', video: 'A' }, { videoId: 'b', video: 'B' }] } }, async (op) => void ops.push(op)));

  it('starts from the stored scan; a video already on is recorded as such', async () => {
    C.adsFromPanel(['a']);
    expect(load<{ items: unknown[] }>(`adsRun:${CH}`, null as never).items).toEqual([{ videoId: 'a', video: 'A', state: 'pending', msg: '' }]);
    setYoutubei(async () => ({ videos: [{ monetization: { adMonetization: { userSetMonetization: 'X_ON' } } }] }));
    await C.adsOne({ videoId: 'a', video: 'A', state: 'pending', msg: '' });
    expect(ops).toContainEqual(expect.objectContaining({ op: 'merge', key: `adsResults:${CH}`, entries: { a: expect.objectContaining({ state: 'on', msg: 'Already on' }) } }));
    expect(ops).toContainEqual({ op: 'runItem', key: `adsRun:${CH}`, by: 'videoId', id: 'a', state: 'on', msg: 'Already on', onlyActive: false });
  });

  it('a failed upload left in the queue does not hold the ads run back', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    vi.stubGlobal('location', { pathname: '/channel/x/videos', href: '' });
    C.adsFromPanel(['a']);
    Q.queue.push({ id: 'q', status: 'error' } as Q.QueueItem);
    await C.adsStep();
    expect(location.href).toBe('/video/a/monetization'); // went to the next video's page
    vi.unstubAllGlobals();
  });

  it('waits for the upload queue before changing pages', async () => {
    history.replaceState(null, '', '/channel/x/videos');
    C.adsFromPanel(['a']);
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem);
    await C.adsStep();
    expect(location.pathname).toBe('/channel/x/videos');
    expect(C.computeStatus().stepDetail ?? C.adsStage.detail).toContain('Waiting for the upload queue to clear');
  });
});

describe('Collab run', () => {
  beforeEach(() => useMemoryClaims({ [`collabScan:${CH}`]: { date: '', total: 1, rows: [{ videoId: 'v', video: 'V' }] }, [`collabLinks:${CH}`]: { '@me2': 'https://www.youtube.com/x' } }, async (op) => void ops.push(op)));

  // chainAcceptInvites (5576–5592): the channels this browser knows are in the state store
  // (its in-memory store in tests); @me2 is ours, on another channel id.
  const finish = () => {
    C.collabFromPanel({ videoIds: ['v'], handles: ['@me2'] });
    C.setCollabResult({ videoId: 'v', video: 'V', state: 'pending', msg: '' }, 'done', 'ok');
    C.stopCollabRun();
  };
  beforeEach(() => saveState('channels', [{ id: 'UCother', name: 'Me 2', avatar: '', handle: '@me2' }]));

  it('ends by switching to your own invited channel to accept it', () => {
    const sw = vi.fn();
    C.setChannelSwitcher(sw);
    settings.autoAcceptInvite = true;
    finish();
    expect(sw).toHaveBeenCalledWith({ handle: '@me2', name: 'Me 2' }, 'https://www.youtube.com/x');
  });

  it('not with auto-accept off, nor while the upload queue has work', () => {
    const sw = vi.fn();
    C.setChannelSwitcher(sw);
    settings.autoAcceptInvite = false;
    finish();
    settings.autoAcceptInvite = true;
    Q.queue.push({ id: 'q', status: 'pending' } as Q.QueueItem); // uploadBusy()
    finish();
    expect(sw).not.toHaveBeenCalled();
  });
});
```
(import `save as saveState` from `../lib/studio/state` at the top of the file.)

`extension/tests/claims-autopilot.test.ts`:
```ts
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsOp } from '../lib/claims/ops';
import { load, useMemoryClaims } from '../lib/claims/store';
import { setYoutubei } from '../lib/claims/youtubei';
import { refreshCfg, resetCfg } from '../lib/studio/channel';

vi.mock('../lib/studio/automation', async (orig) => ({ ...(await orig<typeof import('../lib/studio/automation')>()), sleep: async () => {} }));
import * as C from '../lib/claims/claims';
import * as Q from '../lib/studio/queue-runner';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const NOW = Date.UTC(2026, 9, 9);
const r = (id: string, extra = {}) => ({ videoId: 'v' + id, claimId: 'c' + id, canTrim: true, own: false, hasImpact: true, length: 1000, claimedSec: 100, publishAt: 0, ...extra });
const ops: ClaimsOp[] = [];
beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubGlobal('location', { pathname: `/channel/${CH}/videos` });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ops.length = 0;
  resetCfg();
  await refreshCfg(async () => ({ CHANNEL_ID: CH, INNERTUBE_CONTEXT: {} }));
  C.setClaimsLock({ worker: async () => true, acquire: async () => true, release: vi.fn(), holds: async () => false });
  await C.initClaimsLock();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setYoutubei(null); vi.restoreAllMocks(); });

describe('apPick (5825–5844)', () => {
  it('skips own music, no-impact, too long, done, already queued; scheduled first; at most N', () => {
    useMemoryClaims({
      cfg: { apMaxPct: '25', apMaxPerCycle: '2' },
      [`trimResults:${CH}`]: { 'v5:c5': { state: 'saved' } },
      [`followUp:${CH}`]: { v6: { video: '', pending: [{ claimId: 'c6', key: 'v6:c6', song: '', tries: 0 }], lastClaimId: null, lastSavedAt: 0 } },
    });
    const rows = [r('1', { own: true }), r('2', { hasImpact: false }), r('3', { claimedSec: 300 }), r('4'), r('5'), r('6'),
      r('7', { publishAt: NOW + 3600e3 }), r('8')];
    expect(C.apPick(rows as never).map((x) => x.videoId)).toEqual(['v7', 'v4']);
  });
});

// One claimed video with one trimmable claim, as Studio's API answers it.
const studioApi = async (path: string) => ({
  'creator/list_creator_videos': { videos: [{ videoId: 'v1', title: 'Mix', lengthSeconds: '1000', copyrightSummary: { activeThirdPartyClaimsCount: '1' },
    allRestrictions: { summary: { impacts: ['VIDEO_RESTRICTION_IMPACT_MONETIZATION_DISABLED'] } } }] },
  'creator/list_creator_received_claims': { receivedClaims: [{ claimId: 'c1', status: 'RECEIVED_CLAIM_STATUS_ACTIVE', asset: { metadata: { title: 'S' } },
    nontakedownClaimActions: { options: ['NON_TAKEDOWN_CLAIM_OPTION_TRIM'] } }] },
  'copyright/get_creator_received_claim_matches': { matches: { claimMatches: [{ videoSegment: { startMillis: '0', endMillis: '10000' } }] } },
} as Record<string, unknown>)[path];

describe('apCycle (5847–5873)', () => {
  it('schedules the next cycle without touching `on`, scans, and trims what it picked', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    await C.apCycle();
    expect(ops[0]).toEqual({ op: 'merge', key: `autopilot:${CH}`, entries: { next: NOW + 6 * 3600e3, last: NOW } });
    expect(load<{ on: boolean }>(`autopilot:${CH}`, null as never).on).toBe(true);
    const run = load<{ mode: string; items: { key: string }[] }>(`trimRun:${CH}`, null as never);
    expect(run.mode).toBe('auto');
    expect(run.items.map((i) => i.key)).toEqual(['v1:c1']);
  });

  // 4a T6 review m7
  it('reads ytcfg again before it scans', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    const order: string[] = [];
    C.setCfgRefresh(async () => void order.push('cfg'));
    setYoutubei(async (path) => { order.push('api'); return studioApi(path); });
    await C.apCycle();
    expect(order[0]).toBe('cfg');
    C.setCfgRefresh(async () => {});
  });

  // 4a whole-branch review m2: Auto-pilot must not act on a scan that read nothing. Depends on the
  // 4a fix round: if it reports such a scan another way than `null`, expect that instead.
  it('does nothing after a scan whose detail calls all failed', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 }, [`claimScan:${CH}`]: { date: 'old', total: 1, rows: [] } }, async (op) => void ops.push(op));
    setYoutubei(async (path) => { if (path !== 'creator/list_creator_videos') throw new Error('youtubei: timed out after 30000 ms'); return studioApi(path); });
    await C.apCycle();
    expect(load(`trimRun:${CH}`, null)).toBe(null); // no run started
    expect(load<{ date: string }>(`claimScan:${CH}`, null as never).date).toBe('old'); // the good scan is kept
  });

  it('the alarm nudge asks the background afresh before it ticks (a moved lease runs nothing)', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    let mine = true;
    C.setClaimsLock({ worker: async () => mine, acquire: async () => true, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock(); // this tab was the worker
    mine = false; // the lease moved to another tab since
    await C.autopilotDue(CH);
    await new Promise((r) => setTimeout(r, 0));
    expect(ops).toEqual([]);
  });

  it('the alarm nudge runs the tick on that channel only', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    await C.autopilotDue('UCother');
    expect(ops).toEqual([]);
    await C.autopilotDue(CH); // due: the tick starts the cycle, whose first write is the next time
    await vi.waitFor(() => expect(ops[0]).toMatchObject({ op: 'merge', key: `autopilot:${CH}` }));
  });

  // Two Studio tabs on one channel, one alarm (4a D21's worker lease): the background answers
  // "worker" to one of them (runner-lock.test.ts proves that); here the other tab's side.
  it('two tabs on one channel, one alarm: only the worker runs the cycle', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    C.setClaimsLock({ worker: async () => false, acquire: async () => true, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock(); // the other tab is this channel's worker
    await C.autopilotDue(CH);
    C.claimsTick(); // nor does its own tick start one
    await new Promise((r) => setTimeout(r, 0));
    expect(ops).toEqual([]);
  });

  // The userscript's queue was per tab: an upload in a tab on channel X didn't stop Auto-pilot in a
  // tab on channel Y. Here the cycle runs (scan, pick, start the run); only its page changes wait for
  // the automation lock, with the reason on the card.
  it('a queue run in another tab (another channel) does not stop the cycle; the trim step waits for the lock', async () => {
    useMemoryClaims({ [`autopilot:${CH}`]: { on: true, next: 0 } }, async (op) => void ops.push(op));
    setYoutubei(studioApi);
    Q.setOtherTabRuns(true); // tab A uploads; its items are in the shared queue
    Q.queue.splice(0, Q.queue.length, { id: 'a', status: 'uploading' } as Q.QueueItem, { id: 'b', status: 'pending' } as Q.QueueItem);
    const acquire = vi.fn(async () => false); // A holds the lock for 'queue'
    C.setClaimsLock({ worker: async () => true, acquire, release: vi.fn(), holds: async () => false });
    await C.initClaimsLock();
    await C.apCycle();
    expect(load<{ active: boolean }>(`trimRun:${CH}`, null as never).active).toBe(true);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalled());
    expect(C.trimStage.detail).toBe('⏸ Waiting for another Studio tab to finish (page change needed)');
    expect(location.pathname).toBe(`/channel/${CH}/videos`);
    Q.setOtherTabRuns(false);
    Q.queue.splice(0);
  });
});
```

Also append to `extension/tests/claims-youtubei.test.ts` — the ads run's `adsIsOn()` (5373) reads `creator/get_creator_videos`, whose answers 4a refuses until they have a check (4a T5 / T6 reviews):
```ts
import { checkAnswer } from '../lib/claims/answers';
import { YTI_PATHS } from '../lib/main-ops';

describe('creator/get_creator_videos (the ads run)', () => {
  it('a well-formed answer passes as plain data', () => {
    const a = checkAnswer('creator/get_creator_videos', { videos: [{ videoId: 'abcdefghijk', monetization: { adMonetization: { userSetMonetization: 'X_ON' } } }] });
    expect(a.videos[0].monetization.adMonetization.userSetMonetization).toBe('X_ON');
  });
  it('a malformed one is refused like any API error', () => {
    for (const bad of [{ videos: 'x' }, { videos: [{ videoId: '__proto__' }] }, { videos: [{ videoId: 'v', monetization: { adMonetization: { userSetMonetization: 5 } } }] }]) {
      expect(() => checkAnswer('creator/get_creator_videos', bad)).toThrow('Unexpected answer from creator/get_creator_videos');
    }
  });
  // The guard from the 4a T5 review: this list is what the MAIN world will call for the tab.
  it('the MAIN world still serves only read-only endpoints', () => {
    expect([...YTI_PATHS].sort()).toEqual(['copyright/get_creator_received_claim_matches', 'creator/get_creator_videos',
      'creator/list_creator_received_claims', 'creator/list_creator_videos']);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/claims-trim.test.ts tests/claims-runs.test.ts tests/claims-autopilot.test.ts tests/claims-youtubei.test.ts`
Expected: FAIL against 4a's `claims.ts` and `answers.ts` (`Unexpected answer from creator/get_creator_videos (no check)`) — `C.trimFromPanel is not a function`, `C.setClaimsLock is not a function`, `C.apPick is not a function` and the like (the module has only the scans and the status so far).


- [ ] **Step 4: The final port config and the glue**

**youtubei stays read-only.** Trim, ads and Collab change Studio through its own page (clicks), not through the API: the port adds no endpoint. `YTI_PATHS` keeps its four read-only entries (the test above pins them). If a later change ever needs an endpoint that changes the channel, its body must be built inside the MAIN world from typed arguments (a video id, an on/off), never passed through from the tab, and its answer needs a `checkAnswer` entry.

`lib/claims/answers.ts` — the check the ads run needs (`adsIsOn`, 5373–5375), replacing the "no check yet" comment:
```ts
  // adsIsOn (5373): one video's monetization setting
  'creator/get_creator_videos': (a) => {
    list(a.videos, 'videos').forEach((v, i) => {
      const at = `videos[${i}]`;
      const o = obj(v, at);
      videoId(o.videoId, `${at}.videoId`);
      const am = optObj(optObj(o.monetization, `${at}.monetization`).adMonetization, `${at}.monetization`);
      optStr(am.userSetMonetization, `${at}.monetization`);
      optStr(am.effectiveStatus, `${at}.monetization`);
    });
  },
```
Every other answer the new code reads comes from the two endpoints 4a already checks (`creator/list_creator_received_claims` in `trimOne` 6026 and `fuCheck` 5789: `claimId`, `status`, `nontakedownClaimActions.options`, `asset`). The ported code reads those fields only; if tsc or a test shows it reading a field the check doesn't cover, add the field to the check, not a cast.

Replace `extension/scripts/port/claims.mjs` with (every sub count was checked against the pinned userscript, the two added in the 4a reconciliation included: 3 and 1):
```js
// lib/claims/claims.ts ← the copyright module (the Claims IIFE, user.js 4592–6357) as page code:
// its closure's variables are this module's. Storage goes through the claims store (one writer:
// the background, D20); partial writes are ops (chMerge / chList / chRunItem) where the userscript
// read, changed and wrote a whole value. ytcfg is the copy refreshCfg made. The drawer UI is the
// side panel's (ClaimsUi). The tab lease (5043–5062) is the background's worker lease (isWorker)
// plus the automation lock before page changes (claimLock). uploadBusy() is claims.ts's own (4a T6).
// Left out: the modals and the pane (4851–4858, 4860–4936, 4980–5040, 5190–5251, 5289–5334,
// 5486–5546, 5672–5696, 5875–5904, 6182–6307: the Copyright tab), fixTracklist (lib/tracklist.ts),
// the pure helpers (core.ts) and the song reducers (songs.ts).
export default {
  file: 'lib/claims/claims.ts',
  regions: ['4605-4606', '4608-4614', '4617-4617', '4623-4629', '4633-4653', '4710-4759', '4761-4837', '5066-5066', '5254-5259',
    '5261-5287', '5337-5453', '5458-5465', '5467-5484', '5548-5647', '5650-5670', '5698-5739', '5742-5770', '5772-5820',
    '5823-5873', '5907-6104', '6107-6120', '6122-6170', '6174-6180', '6310-6354'],
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
    ['TRIM_LABEL = {', 'TRIM_LABEL = () => ({', 1],
    ["'⏳ Queued — will trim after the previous trim on this video finishes'),\n    };", "'⏳ Queued — will trim after the previous trim on this video finishes'),\n    });", 1],
    ['TRIM_LABEL[state]', 'TRIM_LABEL()[state]', 1],
    ['LOCALE', 'locale()', 4],
    ["toast(L('ยังตัดชุดก่อนไม่เสร็จ'", "cui.toast(L('ยังตัดชุดก่อนไม่เสร็จ'", 1],
    // one op per result instead of read-change-write of the whole object (D20)
    ["      const res = chGet('adsResults', {});\n      res[item.videoId] = { state, msg, date: new Date().toISOString() };\n      chSet('adsResults', res);\n      const run = getAdsRun();\n      if (run) { const it = run.items.find((x) => x.videoId === item.videoId); if (it) { it.state = state; it.msg = msg; } setAdsRun(run); }",
      "      chMerge('adsResults', { [item.videoId]: { state, msg, date: new Date().toISOString() } });\n      chRunItem('adsRun', 'videoId', item.videoId, state, msg);", 1],
    ["      const res = chGet('collabResults', {});\n      res[item.videoId] = { state, msg, date: new Date().toISOString() };\n      chSet('collabResults', res);\n      const run = getCollabRun();\n      if (run) { const it = run.items.find((x) => x.videoId === item.videoId); if (it) { it.state = state; it.msg = msg; } setCollabRun(run); }",
      "      chMerge('collabResults', { [item.videoId]: { state, msg, date: new Date().toISOString() } });\n      chRunItem('collabRun', 'videoId', item.videoId, state, msg);", 1],
    ["      const res = chGet('trimResults', {});\n      res[item.key] = { state, msg, date: new Date().toISOString() };\n      chSet('trimResults', res);\n      const run = getRun();\n      if (run && run.active) {\n        const it = run.items.find((x) => x.key === item.key);\n        if (it) { it.state = state; it.msg = msg; }\n        setRun(run);\n      }\n      if (state === 'saved' || state === 'gone') chSet('trimQueue', chGet('trimQueue', []).filter((k) => k !== item.key));",
      "      chMerge('trimResults', { [item.key]: { state, msg, date: new Date().toISOString() } });\n      chRunItem('trimRun', 'key', item.key, state, msg, true);\n      if (state === 'saved' || state === 'gone') chList('trimQueue', { del: [item.key] });", 1],
    ["const res = chGet('trimResults', {}); res[p.key] = { state: 'gone', msg: L('ปล่อยแล้ว', 'Released'), date: new Date().toISOString() }; chSet('trimResults', res);",
      "chMerge('trimResults', { [p.key]: { state: 'gone', msg: L('ปล่อยแล้ว', 'Released'), date: new Date().toISOString() } });", 1],
    ["if (r.links.length) chSet('collabLinks', Object.assign(collabLinks(), Object.fromEntries(r.links.map((x) => [x.handle, x.link]))));",
      "if (r.links.length) chMerge('collabLinks', Object.fromEntries(r.links.map((x) => [x.handle, x.link])));", 1],
    // Stop from another tab (or the panel) must not write back a stale copy of the run
    ['      run.active = false;\n      setRun(run);', "      run.active = false;\n      chMerge('trimRun', { active: false });", 1],
    ['      run.active = false;\n      setAdsRun(run);', "      run.active = false;\n      chMerge('adsRun', { active: false });", 1],
    ['      run.active = false;\n      setCollabRun(run);', "      run.active = false;\n      chMerge('collabRun', { active: false });", 1],
    // the cycle's times, without writing back an `on` the user may have switched off meanwhile
    ['setAP(Object.assign(getAP(), { next: Date.now() + hours * 3600e3, last: Date.now() }));', "chMerge('autopilot', { next: Date.now() + hours * 3600e3, last: Date.now() });", 1],
    ["(GM_getValue('settings') || {}).autoAcceptInvite === false", 'settings.autoAcceptInvite === false', 1],
    ["const mine = load('channels', []);", "const mine = loadState('channels', []);", 1],
    // a step that changes pages takes the automation lock first (D26)
    // (a Stop that landed while it waited for the lock ends the step before any page change)
    ['      trimBusy = true;\n', '      trimBusy = true;\n      if (!(await claimLock())) { setTrimStage(-1, lockWait()); trimBusy = false; return; }\n      if (!(getRun() || {}).active) { trimBusy = false; return; }\n', 1],
    ['      adsBusy = true;\n', '      adsBusy = true;\n      if (!(await claimLock())) { setAdsStage(-1, lockWait()); adsBusy = false; return; }\n      if (!(getAdsRun() || {}).active) { adsBusy = false; return; }\n', 1],
    ['      collabBusy = true;\n', '      collabBusy = true;\n      if (!(await claimLock())) { setCollabStage(-1, lockWait()); collabBusy = false; return; }\n      if (!(getCollabRun() || {}).active) { collabBusy = false; return; }\n', 1],
    // an item this page already settled is not done again while its write is late (store.ts: a
    // timed-out claims write may still land)
    ["const item = run.items.find((i) => i.state === 'pending');", "const item = run.items.find((i) => i.state === 'pending' && !isSettled(run, i));", 3],
    // the cycle reads ytcfg again before it scans (the cached copy may be from page load)
    ['const rows = await scanClaims({ show: false });', 'await freshCfg();\n        const rows = await scanClaims({ show: false });', 1],
    // Task 0's two (they are in the config since then): counting songs without a copy; owner
    // names in a null-prototype map
    ['songs: Object.keys(getSongs()).length,', 'songs: songCount(),', 1],
    ['const owners = {};', 'const owners = Object.create(null);', 1],
    // the "Confirm changes" click watcher is installed by the content script, and removed with it
    ["    document.addEventListener('click', (e) => {", "    const installConfirmWatch = () => {\n    const ac = new AbortController();\n    document.addEventListener('click', (e) => {", 1],
    ['    }, true);', '    }, { capture: true, signal: ac.signal });\n    return () => ac.abort();\n    };', 1],
  ],
};
```
Print it (`node scripts/port-check.mjs --print claims`) and rebuild `lib/claims/claims.ts`: 4a's head, the head additions below, the printed port block typed, 4a's tail plus the tail additions below. Typing notes: `const visible = (el: any): boolean =>`, `const findText = (re: RegExp, sel = SEL.clickable, rootEl: ParentNode = document): HTMLElement[] =>`, `const isDisabled = (el: any): boolean =>`, `function deepAll(rootEl: ParentNode, sel: string, out: Element[] = []): Element[]` (with `(e as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot` where TS asks), `function fullClick(el: Element)`, `async function approveConfirm(dlg: Element): Promise<boolean>`, `async function trimOne(item: RunItem & { key: string; claimId: string; song: string }, mode: 'auto' | 'review')`, `function pickRow(rows: HTMLElement[], allClaims: any[], claim: any, song: string): HTMLElement | null`, `let trimBusy = false;`, `let fuBusy = false; let fuNext = 0;`, `let apBusy = false;`, `let confirmClickedAt = 0;`, `let approving = false;`, `let trimStarting = false;`, the tick's `const ed: any = document.querySelector(SEL.trimDialog);` and `const cd: any = findConfirmDialog();`. `chGet<T>` keeps reads typed; `getRun()` is `Run | null`.

Head additions:
```ts
import { inviteOutcome } from '../collab';
import { L, locale } from '../i18n';
import { clickByText, clickIn, shownDialog, waitFor } from '../studio/automation';
import { inviteCollaborators } from '../studio/collab';
import { SEL } from '../studio/sel';
import { load as loadState, settings } from '../studio/state';
import { TXT } from '../studio/txt';
import { songNorm } from './core';

// The userscript's tab lease (5043–5062) has two parts now (4a D21, D26): the channel's worker
// lease, held in the background (one tab per channel runs Auto-pilot, follow-ups and run steps),
// and the automation lock, taken right before a step changes pages. The content script wires
// both to the background; tests wire a fake.
interface ClaimsLock {
  worker(ch: string, force: boolean): Promise<boolean>;
  acquire(): Promise<boolean>;
  release(): void;
  holds(): Promise<boolean>;
}
let lockApi: ClaimsLock = { worker: async () => true, acquire: async () => true, release: () => {}, holds: async () => false };
// Call 34 (approved 2026-10-10): asked every 10 s, an answer trusted for 15 s. A closed worker tab's lease is
// dropped at once, so another tab on the channel takes over at its next ask: about 10–15 s. A hung tab: 20 s.
const WORKER_RENEW = 15_000; // an answer is trusted this long: under the lease's 20 s (runner-lock LEASE_STALE)
let workerMine = false; // the background's last answer for this tab and channel
let workerCh = '';
let workerAt = 0;
let lockMine = false; // this tab holds the automation lock for 'claims'
export const setClaimsLock = (l: ClaimsLock) => {
  lockApi = l;
  workerMine = false;
  workerCh = '';
  workerAt = 0;
  workerAnswerAt = 0;
  lockMine = false;
};

// isWorker(force): is this tab the channel's worker? The background's answer, never older than
// WORKER_RENEW: the lease goes stale after 20 s without a renewal (runner-lock LEASE_STALE), and
// an old "yes" could outlive it (4a T4 review r2). Asked again every WORKER_ASK (10 s), so
// in normal running the answer is always fresh; when it isn't (the service worker was slow, the
// first tick of a page), the tab is not the worker until the answer comes. Not asked on every
// 0.8 s tick: that would keep the service worker awake. Never asked while the channel is
// 'unknown' (4a T4 review m8): that lease would name no channel.
// `force` (a run started from this tab) takes the lease, as the userscript's did.
const WORKER_ASK = 10_000; // asked this often: well inside both limits, and not a message every few ticks
let workerAnswerAt = 0; // when the background last answered for workerCh
function askWorker(ch: string, force: boolean): Promise<boolean> {
  workerCh = ch;
  workerAt = Date.now();
  return lockApi.worker(ch, force).then(
    (v) => {
      if (workerCh === ch) {
        workerMine = v;
        workerAnswerAt = Date.now();
      }
      return v;
    },
    () => false,
  );
}
function isWorker(force = false): boolean {
  const ch = currentChannel();
  if (ch === 'unknown') return false;
  if (ch !== workerCh) workerMine = false;
  if (force || ch !== workerCh || Date.now() - workerAt > WORKER_ASK) {
    void askWorker(ch, force);
    if (force) {
      workerMine = true;
      workerAnswerAt = Date.now();
    }
  }
  return workerMine && Date.now() - workerAnswerAt <= WORKER_RENEW;
}
// Right before a step changes pages (trimStep / adsStep / collabStep): the automation lock, so two
// tabs never drive Studio at once (4a D21). Refused: the step waits, and its card says why.
async function claimLock(): Promise<boolean> {
  lockMine = await lockApi.acquire().catch(() => false);
  return lockMine;
}
const lockWait = () => L('⏸ รอแท็บ Studio อื่นทำงานเสร็จก่อน (ต้องเปลี่ยนหน้า)', '⏸ Waiting for another Studio tab to finish (page change needed)');
// After each tick: let the job go once no run needs this tab any more.
function settleLock(): void {
  if (!lockMine || trimBusy || adsBusy || collabBusy || trimStarting) return;
  const active = (r: Run | null) => !!(r && r.active);
  if (active(getRun()) || active(getAdsRun()) || active(getCollabRun())) return;
  lockMine = false;
  lockApi.release();
}
// At startup: is this tab the channel's worker, and does a page back from its own reload mid-run
// still hold the job (D21)? Asked before the first tick, so a new tab never acts on a guess.
export async function initClaimsLock(): Promise<void> {
  const ch = currentChannel();
  if (ch !== 'unknown') await askWorker(ch, false);
  lockMine = await lockApi.holds().catch(() => false);
}

// chainAcceptInvites() switches channel through the channel switcher (lib/channel-switch.ts).
let switchToChannel: (t: { handle?: string; name?: string }, next: string) => void = () => {};
export const setChannelSwitcher = (fn: typeof switchToChannel) => { switchToChannel = fn; };
```
Tail additions:
```ts
// markSongTrimmed() (5093–5103) is a background op now (songs.ts).
function markSongTrimmed(item: { song?: string; videoId: string }): void {
  write({ op: 'songs', songs: { fn: 'trimmed', song: item.song ?? '', videoId: item.videoId } });
  invalidateCounts();
}

// The content script's 0.8 s tick (6361): the ported tick, then the lock.
export function claimsTick(): void {
  resendSettled();
  tick();
  settleLock();
}

const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// claims:trim — openTrimConfirm()'s data part (5673–5680, 5695): the panel asked; the rows come
// from this channel's stored scan, the mode from the settings.
export function trimFromPanel(keys: unknown): void {
  if (!strList(keys)) return;
  const scan = chGet<{ rows: ClaimRow[] } | null>('claimScan', null);
  const picked = new Set(keys);
  const rows = (scan ? scan.rows : []).filter((r) => picked.has(r.videoId + ':' + r.claimId));
  if (!rows.length) return log(L('ยังไม่ได้เลือก claim', 'No claims selected'), 'warn');
  startTrimRun(rows, cfg().autoSaveTrim ? 'auto' : 'review');
}
// claims:ads — showAds()'s go button (5294–5298).
export function adsFromPanel(ids: unknown): void {
  if (!strList(ids)) return;
  const scan = chGet<{ rows: { videoId: string; video: string }[] } | null>('adsScan', null);
  const rows = (scan ? scan.rows : []).filter((r) => ids.includes(r.videoId));
  if (rows.length) startAdsRun(rows);
}
// claims:collab — showCollab()'s go button (5494–5500); the panel checked the handles.
export function collabFromPanel(d: unknown): void {
  const v = d as { videoIds?: unknown; handles?: unknown } | null;
  if (!v || !strList(v.videoIds) || !strList(v.handles) || !v.handles.length) return;
  const scan = chGet<{ rows: { videoId: string; video: string }[] } | null>('collabScan', null);
  const rows = (scan ? scan.rows : []).filter((r) => (v.videoIds as string[]).includes(r.videoId));
  if (rows.length) startCollabRun(rows, v.handles);
}
// claims:stop — UI.stopBtn (6193).
export function stopAll(): void {
  stopTrimRun(L('คุณกดหยุด', 'You stopped it'), true);
  stopAdsRun(L('คุณกดหยุด', 'You stopped it'));
  stopCollabRun(L('คุณกดหยุด', 'You stopped it'));
  renderStatus();
}
// claims:autopilot — the background's alarm for a channel (D25): the tab on it ticks now.
// The background sends it to the channel's worker only; the lease may have moved since, so the
// tab asks again and ticks only on a fresh "yes" (4a T4 review r2).
export async function autopilotDue(ch: unknown): Promise<void> {
  if (typeof ch !== 'string' || ch === 'unknown' || ch !== currentChannel()) return;
  if (await askWorker(ch, false)) claimsTick();
}

// A result this page wrote for a run item. The background may be slow: after 30 s the write
// counts as failed and the tab's copy goes back to what storage holds, though the write may
// still land (store.ts). The step must not take the item as still pending and do it again
// (a second trim of the same claim): items settled here are skipped, and their result is sent
// again while storage still says pending (the ops are idempotent). Per page: after a page change
// the copy was read from storage afresh.
const settledHere = new Map<string, Map<string, { name: string; by: 'key' | 'videoId'; state: string; msg: string; onlyActive: boolean }>>();
const isSettled = (run: Run, i: { key?: string; videoId: string }) => !!settledHere.get(run.started)?.has(i.key || i.videoId);
function resendSettled(): void {
  for (const [started, items] of settledHere) {
    for (const [id, r] of items) {
      const run = chGet<Run | null>(r.name, null);
      if (!run || run.started !== started) { settledHere.delete(started); break; }
      const it = run.items.find((x) => (r.by === 'key' ? x.key : x.videoId) === id);
      if (it && it.state === 'pending') write({ op: 'runItem', key: r.name + ':' + currentChannel(), by: r.by, id, state: r.state, msg: r.msg, onlyActive: r.onlyActive });
    }
  }
}

// Auto-pilot's cycle reads ytcfg again before it scans (4a T6 review m7): the copy may be from
// page load, and the scan's channel and "Studio has loaded" check use it. The content script sets it.
let freshCfg: () => Promise<void> = async () => {};
export const setCfgRefresh = (fn: typeof freshCfg) => { freshCfg = fn; };
```
Change 4a's `chRunItem` (same file, tail) so it remembers what this page settled:
```ts
const chRunItem = (name: string, by: 'key' | 'videoId', id: string, state: string, msg: string, onlyActive = false, ch = currentChannel()) => {
  const run = chGet<Run | null>(name, null, ch);
  if (run && state !== 'pending') {
    if (!settledHere.has(run.started)) settledHere.set(run.started, new Map());
    settledHere.get(run.started)!.set(id, { name, by, state, msg, onlyActive });
  }
  write({ op: 'runItem', key: name + ':' + ch, by, id, state, msg, onlyActive });
};
```
Extend the export list with: `visible, findText, isDisabled, otherJobBusy, startAdsRun, stopAdsRun, setAdsResult, adsIsOn, adsStep, adsOne, startCollabRun, stopCollabRun, chainAcceptInvites, setCollabResult, collabStep, setResult, startTrimRun, stopTrimRun, fuHas, fuAdd, fuOnResult, fuCheck, apPick, apCycle, installConfirmWatch, findConfirmDialog, deepAll, approveConfirm, trimStep, closeDialogs, pickRow, trimOne, tick`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/claims-trim.test.ts tests/claims-runs.test.ts tests/claims-autopilot.test.ts tests/claims-scan.test.ts tests/claims-status.test.ts`
Expected: PASS. Fix typing slips in the port, not the tests' expectations.

- [ ] **Step 6: Wire it in the Studio tab**

`messages.ts` (`side panel → content: the copyright module` block):
```ts
  'claims:trim'(keys: string[]): void; // openTrimConfirm(): the panel asked, the page starts
  'claims:ads'(videoIds: string[]): void;
  'claims:collab'(d: { videoIds: string[]; handles: string[] }): void;
  'claims:stop'(): void;
  // background → content: an Auto-pilot alarm went off for this channel (D25)
  'claims:autopilot'(channelId: string): void;
```
`studio.content.ts`, after the 4a claims lines:
```ts
    setClaimsLock({
      worker: (ch, force) => sendMessage('runner:worker', { ch, force }),
      acquire: () => sendMessage('runner:acquire', 'claims'),
      release: () => void sendMessage('runner:release', 'claims').catch(() => {}),
      holds: () => sendMessage('runner:holds', 'claims'),
    });
    await initClaimsLock();
    setCfgRefresh(() => refreshCfg(readCfg));
    stop.add(() => setCfgRefresh(async () => {}));
    setChannelSwitcher((t, next) => sw.switchToChannel(t, next));
    stop.add(installConfirmWatch());
    onMessage('claims:trim', ({ data }) => trimFromPanel(data));
    onMessage('claims:ads', ({ data }) => adsFromPanel(data));
    onMessage('claims:collab', ({ data }) => collabFromPanel(data));
    onMessage('claims:stop', () => stopAll());
    onMessage('claims:autopilot', ({ data }) => void autopilotDue(data).catch((e) => console.error('[ytup] autopilot nudge', e)));
```
(These go after 4a's `const claims = createClaimsPage(…)` block. The background's `runner:acquire` / `runner:worker` handlers already refuse non-Studio senders (`studioTab`); 4b adds no tab → background message.)
`scripts/strings/extension-only.mjs`:
```js
  // Phase 4b
  { th: '⏸ รอแท็บ Studio อื่นทำงานเสร็จก่อน (ต้องเปลี่ยนหน้า)', en: '⏸ Waiting for another Studio tab to finish (page change needed)', why: "one automation lock (D21/D26): a copyright step that changes pages waits while another tab drives Studio; the userscript's lease was per channel and per tab" },
```
`page.ts` `tick()`: replace `broadcast();` with `claimsTick();` (the ported tick ends in `renderStatus()`, which broadcasts); `scan()` stays as 4a wrote it. Update `tests/claims-page.test.ts`'s first test: it still sees one `claims:state` for two ticks.

- [ ] **Step 7: Verify and commit**

Run: `npm run check && npm run build`
Expected: port-check `ok   claims (lib/claims/claims.ts, … lines)`.
```bash
git add extension/scripts/port/claims.mjs extension/lib/claims/claims.ts extension/lib/claims/answers.ts extension/tests/claims-youtubei.test.ts extension/lib/claims/page.ts extension/lib/messages.ts extension/entrypoints/studio.content.ts extension/scripts/strings/extension-only.mjs extension/tests/claims-trim.test.ts extension/tests/claims-runs.test.ts extension/tests/claims-autopilot.test.ts extension/tests/claims-page.test.ts
git commit -m "Copyright module, page side complete: trim, follow-ups, ads and Collab runs, Auto-pilot cycle, under the automation lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Auto-pilot on `chrome.alarms`

The spec's "one `chrome.alarms` alarm per channel, named `ap:<channelId>`" (D25). The MV3 service worker can't touch the page: the alarm wakes the channel's worker tab (4a D21); without one the channel stays due until a tab for it opens. An alarm is armed only for a cycle in the future and never re-armed for the same time, so a channel that stays due (no tab, or a tab held back by the upload queue) doesn't wake the service worker again and again.

**Files:**
- Create: `extension/lib/claims/alarms.ts`, `extension/tests/claims-alarms.test.ts`
- Modify: `extension/entrypoints/background.ts`, `extension/lib/runner-lock.ts`, `extension/tests/runner-lock.test.ts`, `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Consumes: `splitKey` (`keys.ts`), `sendMessage`, and a new export of `runner-lock.ts`: `workerOf(ch: string): Promise<number | null>` (the channel's worker tab if its lease is not stale and the tab is live).
- Produces: `AP_ALARM = 'ap:'`, `AP_NOTE = 'apdue:'`, `NOTIFIED_KEY = 'apNotified'`, `notifyAutopilotDue(ch: string, next: number): Promise<boolean>`, `openFromAutopilotNote(id: string): Promise<boolean>`, `armAutopilot(ch: string, value: unknown, now?: number): Promise<void>`, `syncAutopilotAlarms(now?: number): Promise<void>`, `nudgeAutopilot(alarmName: string, send?): Promise<boolean>`, `registerAutopilotAlarms(): void`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/claims-alarms.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { armAutopilot, nudgeAutopilot, syncAutopilotAlarms } from '../lib/claims/alarms';

const NOW = Date.UTC(2026, 9, 9);
beforeEach(() => fakeBrowser.reset());
const alarms = async () => (await browser.alarms.getAll()).map((a) => [a.name, a.scheduledTime]).sort();

describe('Auto-pilot alarms', () => {
  it('one alarm per channel whose next cycle is in the future; none when off or already due', async () => {
    await browser.storage.local.set({
      'autopilot:UC1': { on: true, next: NOW + 3600e3 },
      'autopilot:UC2': { on: false, next: 0 },
      'autopilot:UC3': { on: true, next: 0 }, // due: the tab's own tick runs it (no alarm to re-fire)
    });
    await browser.alarms.create('ap:UC9', { when: NOW + 1 }); // a channel switched off since
    await syncAutopilotAlarms(NOW);
    expect(await alarms()).toEqual([['ap:UC1', NOW + 3600e3]]);
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

  it("the alarm reaches the channel's worker tab only; no worker, nothing sent", async () => {
    const send = vi.fn(async () => undefined);
    await browser.storage.session.set({ claimsWorkers: { UC1: { tabId: 3, at: Date.now() }, UC2: { tabId: 1, at: Date.now() }, UC5: { tabId: 4, at: Date.now() - 21_000 } } });
    vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) => ({ id, url: 'https://studio.youtube.com/channel/UC' + id })) as never);
    expect(await nudgeAutopilot('ap:UC1', send as never)).toBe(true);
    expect(send.mock.calls).toEqual([['claims:autopilot', 'UC1', 3]]);
    expect(await nudgeAutopilot('ap:UC7', send as never)).toBe(false);
    expect(await nudgeAutopilot('ap:UC5', send as never)).toBe(false); // a lease not renewed for 20 s is nobody's
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a worker tab without a live script (discarded, or left Studio): no error', async () => {
    await browser.storage.session.set({ claimsWorkers: { UC1: { tabId: 3, at: Date.now() } } });
    vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) => ({ id, url: 'https://studio.youtube.com/' })) as never);
    const send = vi.fn(async () => { throw new Error('Receiving end does not exist'); });
    expect(await nudgeAutopilot('ap:UC1', send as never)).toBe(false);
  });
});
```
Run: `npx vitest run tests/claims-alarms.test.ts`
Expected: FAIL (no module).

- [ ] **Step 2: `alarms.ts`**

First the reader the nudge needs, in `lib/runner-lock.ts` after `claimWorker` (4a stores a lease as `{ tabId, at }`, stale after `LEASE_STALE`; `readLeases` and `liveStudio` are the file's own):
```ts
// The channel's worker tab, for the Auto-pilot alarm: a lease that isn't stale, in a live tab.
export const workerOf = (ch: string) =>
  serial(async () => {
    const l = (await readLeases())[ch];
    return l && Date.now() - l.at <= LEASE_STALE && (await liveStudio(l.tabId)) ? l.tabId : null;
  });
```
(Add to `tests/runner-lock.test.ts`: after `claimWorker(a, 'UC1', false)`, `workerOf('UC1')` is `a`; with the lease's `at` set 21 s back in `storage.session`, it is `null`; `workerOf('UC9')` is `null`. Write these three assertions before the function.)

```ts
import { browser } from 'wxt/browser';
import { sendMessage } from '../messages';
import { workerOf } from '../runner-lock';
import { splitKey } from './keys';

// Auto-pilot on chrome.alarms (spec "Background", D25). The service worker can't drive the page:
// one one-shot alarm per channel at its next cycle (autopilot:<ch>.next) wakes the channel's worker
// tab (4a D21), whose tick then starts the cycle as the userscript's did (6328). Armed only for a
// cycle in the future, and never twice for the same time: a channel that stays due (no Studio tab,
// or the tab waits for the upload queue) is the tab's own tick's job, not a service worker that
// wakes every 30 s. With no Studio tab nothing runs; the next tab on that channel starts the cycle.
export const AP_ALARM = 'ap:';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function armAutopilot(ch: string, value: unknown, now = Date.now()): Promise<void> {
  const name = AP_ALARM + ch;
  const next = isObj(value) && value.on === true ? Number(value.next) || 0 : 0;
  const cur = await browser.alarms.get(name);
  if (next <= now) {
    if (cur) await browser.alarms.clear(name);
    return;
  }
  if (cur?.scheduledTime !== next) await browser.alarms.create(name, { when: next });
}

// At service worker start. It reads all of storage once to find the autopilot:<ch> keys (they
// can't be named up front); changes after that go key by key (registerAutopilotAlarms).
export async function syncAutopilotAlarms(now = Date.now()): Promise<void> {
  const on = new Set<string>();
  for (const [k, v] of Object.entries(await browser.storage.local.get(null))) {
    const s = splitKey(k);
    if (s?.name !== 'autopilot' || !s.ch) continue;
    on.add(AP_ALARM + s.ch);
    await armAutopilot(s.ch, v, now);
  }
  for (const a of await browser.alarms.getAll()) {
    if (a.name.startsWith(AP_ALARM) && !on.has(a.name)) await browser.alarms.clear(a.name);
  }
}

// The alarm went off: tell the channel's worker tab. No worker, or no live script in it (a
// discarded tab, one opened before the extension loaded): nothing runs until a tab ticks.
export async function nudgeAutopilot(alarmName: string, send: typeof sendMessage = sendMessage): Promise<boolean> {
  const ch = alarmName.slice(AP_ALARM.length);
  const tabId = await workerOf(ch);
  if (tabId === null) return false;
  try {
    await send('claims:autopilot', ch, tabId);
    return true;
  } catch {
    return false;
  }
}

export function registerAutopilotAlarms(): void {
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name.startsWith(AP_ALARM)) void nudgeAutopilot(a.name).catch((e) => console.error('[ytup] autopilot nudge', e));
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      const s = splitKey(k);
      if (s?.name === 'autopilot' && s.ch) void armAutopilot(s.ch, newValue).catch((e) => console.error('[ytup] autopilot alarm', e));
    }
  });
}
```
`background.ts`:
```ts
import { registerAutopilotAlarms, syncAutopilotAlarms } from '@/lib/claims/alarms';
…
  // Auto-pilot: one alarm per channel wakes its worker tab (D25).
  registerAutopilotAlarms();
  void ready.then(() => syncAutopilotAlarms()).catch((e) => console.error('[ytup] autopilot alarms', e));
```
Run: `npx vitest run tests/claims-alarms.test.ts`
Expected: PASS.

- [ ] **Step 3: "Auto-pilot is due" on the desktop — the failing tests (user request, call 33)**

When the alarm goes off and no Studio tab can run the cycle (no worker, or the worker has no live script), the user gets one desktop notification for that cycle. It uses the `notifications` permission the extension already has. At most one notification per channel and per due `next`: the notified `next` is kept in `chrome.storage.local` (`apNotified: { [channelId]: next }`), so a service-worker or browser restart doesn't repeat it. A later cycle (a new `next`) can notify again.

Append to `extension/tests/claims-alarms.test.ts` (add `notifyAutopilotDue`, `openFromAutopilotNote` to the import):
```ts
describe('"Auto-pilot is due" notification', () => {
  it('the alarm with no Studio tab to run the cycle notifies once, naming the channel', async () => {
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: NOW }, 'claimScan:UC1': { channelName: 'Lofi Beats' } });
    const create = vi.spyOn(browser.notifications, 'create');
    vi.spyOn(browser.tabs, 'get').mockRejectedValue(new Error('No tab'));
    await browser.alarms.create('ap:UC1', { when: NOW });
    await fakeBrowser.alarms.onAlarm.trigger({ name: 'ap:UC1', scheduledTime: NOW } as never);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith('apdue:UC1', expect.objectContaining({
      type: 'basic', title: 'Auto-pilot is due',
      message: 'No YouTube Studio tab for Lofi Beats is open — click to open one and Auto-pilot will scan and trim',
    }));
    expect((await browser.storage.local.get('apNotified')).apNotified).toEqual({ UC1: NOW });
  });

  it('once per due cycle: a second alarm or a service-worker restart for the same next says nothing; a new next may', async () => {
    const create = vi.spyOn(browser.notifications, 'create');
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(true);
    expect(await notifyAutopilotDue('UC1', NOW)).toBe(false); // same cycle (state is in storage.local, not memory)
    expect(await notifyAutopilotDue('UC1', NOW + 6 * 3600e3)).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('no notification when the worker tab took the nudge', async () => {
    await browser.storage.local.set({ 'autopilot:UC1': { on: true, next: NOW } });
    await browser.storage.session.set({ claimsWorkers: { UC1: { tabId: 3, at: Date.now() } } });
    vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: 3, url: 'https://studio.youtube.com/' } as never);
    const create = vi.spyOn(browser.notifications, 'create');
    expect(await nudgeAutopilot('ap:UC1', (async () => undefined) as never)).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("a click opens Studio on that channel's page in a new tab and clears the notification", async () => {
    const createTab = vi.spyOn(browser.tabs, 'create').mockResolvedValue({ id: 9 } as never);
    const clear = vi.spyOn(browser.notifications, 'clear');
    expect(await openFromAutopilotNote('apdue:UC1')).toBe(true);
    expect(createTab).toHaveBeenCalledWith({ url: 'https://studio.youtube.com/channel/UC1' });
    expect(clear).toHaveBeenCalledWith('apdue:UC1');
    expect(await openFromAutopilotNote('apdue:unknown')).toBe(true);
    expect(createTab).toHaveBeenLastCalledWith({ url: 'https://studio.youtube.com/' });
    expect(await openFromAutopilotNote('queue:5')).toBe(false); // not ours
  });
});
```
(If `fakeBrowser.alarms.onAlarm.trigger` isn't wired to `registerAutopilotAlarms()`'s listener in this file, call `registerAutopilotAlarms()` in the test first.)

Run: `npx vitest run tests/claims-alarms.test.ts`
Expected: FAIL — `notifyAutopilotDue is not a function` (the earlier tests still pass).

- [ ] **Step 4: Implement the notification**

In `lib/claims/alarms.ts` (imports: `L` from `../i18n`, `NOTIFY_ICON` from `../notify`):
```ts
// "Auto-pilot is due" (user request, call 33): the alarm went off and no Studio tab could run the
// cycle. Once per channel and due `next`, kept in storage.local so no restart repeats it.
export const AP_NOTE = 'apdue:';
export const NOTIFIED_KEY = 'apNotified';

export async function notifyAutopilotDue(ch: string, next: number): Promise<boolean> {
  const got = (await browser.storage.local.get([NOTIFIED_KEY, 'claimScan:' + ch]));
  const seen = isObj(got[NOTIFIED_KEY]) ? (got[NOTIFIED_KEY] as Record<string, number>) : {};
  if (seen[ch] === next) return false;
  await browser.storage.local.set({ [NOTIFIED_KEY]: { ...seen, [ch]: next } });
  const scan = got['claimScan:' + ch];
  const name = (isObj(scan) && typeof scan.channelName === 'string' && scan.channelName) || ch;
  await browser.notifications.create(AP_NOTE + ch, {
    type: 'basic', iconUrl: NOTIFY_ICON, silent: true,
    title: L('Auto-pilot ถึงรอบแล้ว', 'Auto-pilot is due'),
    message: L(`ไม่มีแท็บ YouTube Studio ของช่อง ${name} เปิดอยู่ — คลิกเพื่อเปิด แล้ว Auto-pilot จะสแกนและตัดให้`, `No YouTube Studio tab for ${name} is open — click to open one and Auto-pilot will scan and trim`),
  });
  return true;
}

// The click opens Studio on that channel in a new tab: tabs.create needs no `tabs` permission.
// (No existing tab to focus: the notification only exists when no Studio tab could run the cycle.)
// The new tab's first tick on that channel starts the due cycle.
export async function openFromAutopilotNote(id: string): Promise<boolean> {
  if (!id.startsWith(AP_NOTE)) return false;
  const ch = id.slice(AP_NOTE.length);
  const url = /^UC[\w-]{22}$/.test(ch) ? `https://studio.youtube.com/channel/${ch}` : 'https://studio.youtube.com/';
  await browser.tabs.create({ url }).catch((e) => console.error('[ytup] open Studio from notification', e));
  await browser.notifications.clear(id).catch(() => {});
  return true;
}
```
In `registerAutopilotAlarms()`, the alarm listener notifies when the nudge reached no one:
```ts
  browser.alarms.onAlarm.addListener((a) => {
    if (!a.name.startsWith(AP_ALARM)) return;
    const ch = a.name.slice(AP_ALARM.length);
    void nudgeAutopilot(a.name)
      .then((reached) => (reached ? false : notifyAutopilotDue(ch, a.scheduledTime)))
      .catch((e) => console.error('[ytup] autopilot nudge', e));
  });
```
(`a.scheduledTime` is the cycle's `next`: the alarm was armed at exactly that time.) `background.ts`, next to the queue notification's click handler:
```ts
  browser.notifications.onClicked.addListener((id) => void openFromAutopilotNote(id).catch((e) => console.error('[ytup] autopilot note', e)));
```
(`openFromNotification` already ignores ids without its `queue:` prefix.) `scripts/strings/extension-only.mjs`:
```js
  { th: 'Auto-pilot ถึงรอบแล้ว', en: 'Auto-pilot is due', why: 'user request (Phase 4 Q7): desktop notice when an Auto-pilot cycle is due and no Studio tab can run it' },
  { th: 'ไม่มีแท็บ YouTube Studio ของช่อง ${} เปิดอยู่ — คลิกเพื่อเปิด แล้ว Auto-pilot จะสแกนและตัดให้', en: 'No YouTube Studio tab for ${} is open — click to open one and Auto-pilot will scan and trim', why: 'user request (Phase 4 Q7)' },
```
Run: `npx vitest run tests/claims-alarms.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run build` (manifest permissions still exactly the five).
```bash
git add extension/lib/claims/alarms.ts extension/entrypoints/background.ts extension/lib/runner-lock.ts extension/tests/runner-lock.test.ts extension/scripts/strings/extension-only.mjs extension/tests/claims-alarms.test.ts
git commit -m "Auto-pilot on chrome.alarms: one alarm per channel wakes its worker tab, armed once per cycle; a desktop notice when no tab can run it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The panel — trim confirm, Stop, Auto-pilot switch, the pane's full layout

**Files:**
- Create: `extension/entrypoints/sidepanel/tabs/copyright/AutopilotSwitch.tsx`, `extension/tests/panel-copyright-run.test.tsx`
- Modify: `extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx`, `extension/entrypoints/sidepanel/tabs/copyright/ClaimList.tsx`, `extension/lib/panel/claims.ts`, `extension/entrypoints/sidepanel/App.tsx`, `extension/components/ui/badge.tsx`, `extension/tests/panel-claims.test.ts`, `extension/tests/panel-queue.test.tsx`

**Interfaces:**
- Consumes: `useAsk()`, `useClaims()` (`addLog`), `usePanel()` (`runner`, `sendTo`), `claimsWrite`, `ClaimsData`.
- Produces: `trimSummary(rows: ClaimRow[]): { claims: number; videos: number; own: number; total: number }`, `apRules(c: ClaimsCfg): string[]` (in `lib/panel/claims.ts`); `AutopilotSwitch({ data, state })`; `stopTarget(api): ToTab`.

- [ ] **Step 1: Write the failing tests**

Add to `extension/tests/panel-claims.test.ts`:
```ts
import { apRules, trimSummary } from '../lib/panel/claims';
import { DEFAULTS } from '../lib/claims/core';

describe('trim confirmation and Auto-pilot rules', () => {
  it('sums the picked claims (openTrimConfirm 5677–5679)', () => {
    expect(trimSummary([r('1', { own: true }), r('1'), r('2', { claimedSec: 50 })])).toEqual({ claims: 3, videos: 2, own: 1, total: 250 });
  });
  it('lists the rules toggleAutopilot showed (5884–5890)', () => {
    expect(apRules({ ...DEFAULTS, ownNames: 'Me' })).toEqual([
      'Every 6 hours: rescan this channel',
      'Only claims that affect the video (no revenue / restricted / blocked)',
      "Don't trim your own music (Me)",
      'Skip claims longer than 25% of the video',
      'Up to 10 claims per cycle · scheduled videos are trimmed first',
    ]);
  });
});
```
`extension/tests/panel-copyright-run.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CopyrightTab } from '../entrypoints/sidepanel/tabs/CopyrightTab';
import * as messages from '../lib/messages';
import { claimsStateWith, fakeClaims, fakePanel, renderPanel } from './panel-fake';

const scan = { date: '2026-10-01T00:00:00Z', total: 1, channel: 'UC1', channelName: 'Mine', rows: [
  { videoId: 'v1', video: 'Mix 1', privacy: 'public', length: 600, claimId: 'c1', song: 'Song', artists: '', label: '', claimant: 'Co', type: '', status: '',
    impact: 'blocked', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: 'trim', own: false, hasImpact: true, publishAt: 0 },
] };
beforeEach(() => fakeBrowser.reset());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Copyright tab, runs', () => {
  it('Trim selected asks first, then sends the picks to the tab', async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan, 'trimQueue:UC1': ['v1:c1'] });
    const api = fakePanel();
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ state: claimsStateWith({ counts: { hasScan: true, scanDate: '', claims: 1, claimVideos: 1, songs: 0, hasAdsScan: false, adsTodo: 0 } }) }));
    fireEvent.click(await screen.findByRole('button', { name: /Claim list \(1\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: '✂ Trim selected (1)' }));
    expect(await screen.findByText('Trim 1 claims in 1 videos?')).toBeTruthy();
    expect(screen.getByText(/Fully automatic: Save → "I acknowledge" → Confirm changes for every claim/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start trim' }));
    await vi.waitFor(() => expect(api.send).toHaveBeenCalledWith('claims:trim', ['v1:c1']));
  });

  it('Stop shows while a run or follow-ups wait, and goes to the tab holding the lock', async () => {
    const holder = vi.fn(async () => undefined);
    const api = fakePanel({ runner: { tabId: 9, windowId: 1, title: 'B', jobs: ['claims'] }, busyElsewhere: true, sendTo: () => holder as never });
    const live = claimsStateWith({ busyRun: true, status: { icon: '✂️', kind: 'busy', title: 'Trimming claim 1 of 2', detail: '' } });
    renderPanel(<CopyrightTab />, api, undefined, fakeClaims({ state: claimsStateWith(), live }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(holder).toHaveBeenCalledWith('claims:stop', undefined);
    expect(screen.queryByRole('button', { name: /Scan claims/ })).toBe(null);
  });

  it('Auto-pilot on asks with the rules, then writes autopilot:<ch> and logs it', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    const claims = fakeClaims();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    fireEvent.click(await screen.findByRole('switch', { name: /Auto-pilot/ }));
    expect(await screen.findByText('Turn on Auto-pilot for channel Mine?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('claims:op', { op: 'set', key: 'autopilot:UC1', value: { on: true, next: 0 } }));
    expect(claims.addLog).toHaveBeenCalledWith('🤖 Auto-pilot turned on for Mine', 'ok');
  });
});
```
Run: `npx vitest run tests/panel-claims.test.ts tests/panel-copyright-run.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Logic in `lib/panel/claims.ts`**

```ts
import { L } from '../i18n';
import type { ClaimsCfg } from '../claims/types';

// openTrimConfirm()'s numbers (5677–5679).
export const trimSummary = (rows: ClaimRow[]) => ({
  claims: rows.length,
  videos: new Set(rows.map((r) => r.videoId)).size,
  own: rows.filter((r) => r.own).length,
  total: rows.reduce((a, r) => a + r.claimedSec, 0),
});

// toggleAutopilot()'s rules (5884–5890).
export const apRules = (c: ClaimsCfg): string[] => [
  L(`ทุก ${c.apEveryHours} ชั่วโมง: สแกนช่องนี้ใหม่`, `Every ${c.apEveryHours} hours: rescan this channel`),
  c.apOnlyImpact ? L('เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)', 'Only claims that affect the video (no revenue / restricted / blocked)') : L('ทุก claim ที่ตัดได้', 'Every trimmable claim'),
  c.apSkipOwn ? L(`ไม่ตัดเพลงของตัวเอง (${c.ownNames})`, `Don't trim your own music (${c.ownNames})`) : L('รวมเพลงของตัวเองด้วย', 'Include your own music too'),
  L(`ข้าม claim ที่ยาวเกิน ${c.apMaxPct}% ของคลิป`, `Skip claims longer than ${c.apMaxPct}% of the video`),
  L(`สูงสุด ${c.apMaxPerCycle} claim ต่อรอบ · คลิปที่ตั้งเวลาปล่อยไว้จะถูกตัดก่อน`, `Up to ${c.apMaxPerCycle} claims per cycle · scheduled videos are trimmed first`),
];
```

- [ ] **Step 3: The trim confirmation in `ClaimList.tsx`**

In `ClaimList`, build the `trimButton` itself (drop 4a's optional `trimButton` prop) — `openTrimConfirm()` (5672–5696). `const ask = useAsk();` goes at the top of the component with the other hooks (before the "not scanned yet" early return); the rest after `rows` is known:
```tsx
  const ask = useAsk();
  const pickedRows = rows.filter((r) => picked.has(rowKey(r)) && !isDone(data.trimResults[rowKey(r)]));
  const trim = async () => {
    if (!pickedRows.length) return;
    const t = trimSummary(pickedRows);
    const auto = data.cfg.autoSaveTrim;
    const go = await ask({
      title: L(`ตัด ${t.claims} claim ใน ${t.videos} คลิป?`, `Trim ${t.claims} claims in ${t.videos} videos?`),
      icon: 'cut',
      body: (
        <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
          <div>{L(`จะตัดภาพ + เสียงออกรวม ${fmt(t.total)} ด้วยเครื่องมือ "Trim out segment" ของ YouTube `, `This will cut video + audio totalling ${fmt(t.total)} using YouTube's "Trim out segment" tool. `)}
            <b>{L('การตัดที่บันทึกแล้วย้อนกลับไม่ได้', 'Saved trims cannot be undone')}</b>{L(' และ YouTube ใช้เวลาประมวลผลหลายชั่วโมงต่อคลิป', ', and YouTube takes several hours to process each video')}</div>
          {t.own > 0 && <div className="text-warn">{L(`⚠ ${t.own} รายการเป็น claim บนเพลงของคุณเอง (★) ถ้าตัดจะเสียเพลงของตัวเองออกจากคลิป`, `⚠ ${t.own} items are claims on your own music (★) — trimming will remove your own music from the video`)}</div>}
          {state.uploadBusy && <div className="text-warn">{L('⏸ คิวอัปโหลดยังมีไฟล์อยู่ การตัดต้องเปลี่ยนหน้า จะเริ่มหลังคิวอัปโหลดเสร็จ', '⏸ Upload queue still has files. Trimming needs page changes, will start after the upload queue finishes')}</div>}
          {!state.english && <div className="text-err">{L('⚠ Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ ปุ่มต่าง ๆ จะหาไม่เจอ — เปลี่ยนภาษาเป็น English ก่อน', "⚠ Studio is not set to English, buttons won't be found — switch the language to English first")}</div>}
          <div className="text-xs text-fg3">{L('คลิปหนึ่งตัดได้ทีละครั้ง ถ้าคลิปเดียวมีหลาย claim จะตัดอันแรกก่อน ที่เหลือจะตัดต่อให้เองเมื่อ YouTube ประมวลผลเสร็จ', 'Each video can only be trimmed once at a time. If a video has several claims, the first is trimmed now and the rest continue automatically once YouTube finishes processing')}</div>
          <div className="rounded-[12px] bg-tint/5 p-2.5">
            {auto ? L('⚡ อัตโนมัติทั้งหมด: Save → "I acknowledge" → Confirm changes ทุก claim', '⚡ Fully automatic: Save → "I acknowledge" → Confirm changes for every claim') : L('👀 โหมดตรวจเอง: คุณกด Save และยืนยันการตัดเองทีละอัน', '👀 Review mode: you click Save and confirm each trim yourself')}
            <div className="text-xs text-fg3">{L('เปลี่ยนได้ที่ ⚙ ตั้งค่าลิขสิทธิ์ → "ตัดอัตโนมัติทั้งหมด"', 'Change this in ⚙ Copyright settings → "Fully automatic trim"')}</div>
          </div>
        </div>
      ),
      ok: L('เริ่มตัด', 'Start trim'),
      cancel: L('ยกเลิก', 'Cancel'),
    });
    if (go !== true) return;
    onClose();
    await send('claims:trim', pickedRows.map(rowKey)).catch(failed);
  };
  const trimButton = (
    <Button variant="go" size="sm" disabled={!picked.size} onClick={() => void trim()}>
      {L(`✂ ตัดที่เลือก (${picked.size})`, `✂ Trim selected (${picked.size})`)}
    </Button>
  );
```
(`refreshCount()` counted every picked key, 4872; `failed` is the "not connected" toast used by the other views.)

- [ ] **Step 4: `AutopilotSwitch.tsx`**

```tsx
import { Switch } from '@/components/ui/switch';
import { chKey } from '@/lib/claims/keys';
import type { ClaimsState } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import { apRules } from '@/lib/panel/claims';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { useAsk } from '../../ask';
import { Icon } from '../../Icon';
import { useClaims } from '../../panel';

// The pane's Auto-pilot switch (UI.apTog 6197, UI.apSub 6253) and toggleAutopilot() (5875–5904).
// On/off is a write to autopilot:<channel>; the background's alarm and the tab's tick do the rest (D25).
export function AutopilotSwitch({ data, state }: { data: ClaimsData; state: ClaimsState }) {
  const ask = useAsk();
  const { addLog } = useClaims();
  const c = data.cfg;
  const on = !!data.autopilot.on;
  const key = chKey('autopilot', data.ch);
  const toggle = async () => {
    if (on) {
      await claimsWrite({ op: 'set', key, value: { on: false, next: 0 } });
      return addLog(L('🤖 ปิด Auto-pilot ของ ', '🤖 Auto-pilot turned off for ') + state.channelName, 'ok');
    }
    const go = await ask({
      title: L(`เปิด Auto-pilot ให้ช่อง ${state.channelName}?`, `Turn on Auto-pilot for channel ${state.channelName}?`),
      icon: 'robot',
      body: (
        <div className="text-[13px] leading-relaxed">
          <div>{L('สคริปต์จะสแกนและ ', 'The script will scan and ')}<b>{L('บันทึกการตัดโดยไม่ถาม', 'save trims without asking')}</b>{L(' — การตัดย้อนกลับไม่ได้', ' — trims cannot be undone')}</div>
          <ul className="my-2.5 list-disc pl-5">{apRules(c).map((r) => <li key={r}>{r}</li>)}</ul>
          <div className="text-xs text-fg3">{L('ต้องเปิดแท็บ YouTube Studio ของช่องนี้ค้างไว้ 1 แท็บ และเครื่องไม่หลับ ระหว่างที่คิวอัปโหลดยังทำงาน Auto-pilot จะรอ', 'Keep 1 YouTube Studio tab for this channel open and the computer awake. Auto-pilot waits while the upload queue is running')}</div>
        </div>
      ),
      ok: L('เปิด', 'Turn on'),
      cancel: L('ยกเลิก', 'Cancel'),
    });
    if (go !== true) return;
    await claimsWrite({ op: 'set', key, value: { on: true, next: 0 } });
    addLog(L('🤖 เปิด Auto-pilot ของ ', '🤖 Auto-pilot turned on for ') + state.channelName, 'ok');
  };
  return (
    <label className="flex items-center gap-3">
      <Switch checked={on} onCheckedChange={() => void toggle().catch((e) => console.error('[ytup] autopilot', e))} aria-label="Auto-pilot" />
      <span>
        <b className="flex items-center gap-1.5 text-[13px]"><Icon name="robot" size={16} />Auto-pilot</b>
        <small className="block text-xs text-fg3">{on ? L(`เปิด · สแกน + ตัดทุก ${c.apEveryHours} ชม.`, `On · scan + trim every ${c.apEveryHours} h`) : L('ปิด · สแกนและตัดอัตโนมัติตามรอบเวลา', 'Off · scan and trim automatically on a schedule')}</small>
      </span>
    </label>
  );
}
```

- [ ] **Step 5: The pane's full layout in `CopyrightTab.tsx`**

Rework the home to `buildPane()`'s rows and `renderStatus()`'s visibility rules (6204–6251), **on top of the file as 4a shipped it**: keep `useClaimsGlobals()`, the `closed` / `data-view` focus return, the scroll-to-top effect, `saveFailed`, the `sub` expression for the views (Tasks 4 and 5 add their views to it), and the wrapping flex rows (`flex flex-wrap gap-2 [&>button]:grow`) in place of the `grid-cols-3` shown below — the panel can be 320px wide. Only the rows' contents and visibility change:
```tsx
  // Buttons follow the bound tab (`state`); the card and Stop follow `live` (Task 0 Step 1).
  const busyRun = !!state?.busyRun;
  const busyScan = !!state?.busyScan;
  const stoppable = !!s && (s.busyRun || s.waiting > 0);
  // Stop goes to the tab holding the lock while it runs a copyright job elsewhere (D27).
  const stopTo = live && live !== state && runner ? sendTo(runner.tabId) : send;
  const stop = () => void stopTo('claims:stop', undefined).catch(failed);
  …
      <Section title={L('สถานะ', 'Status')} icon="shield">
        {s && <StatusCard s={s.status} />}
        {/* row1: Scan · Ads off · Stop; one column while a run is busy (6204, 6251) */}
        <div className={cn('mt-2.5 grid gap-2', busyRun ? 'grid-cols-1' : 'grid-cols-3')}>{/* 4a's wrapping flex row in the real file */}
          {!busyRun && !busyScan && <Button variant="go" onClick={scan} disabled={!state}><Icon name="scan" size={16} />{L('สแกน claim', 'Scan claims')}</Button>}
          {/* Ads off: Task 4 */}
          {stoppable && <Button variant="danger" onClick={stop}><Icon name="stop" size={14} />{L('หยุด', 'Stop')}</Button>}
        </div>
        {!busyRun && !busyScan && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {/* Claim list · Claimed songs · Collab (Task 4) */}
          </div>
        )}
      </Section>
      <Section>
        {data && state && <AutopilotSwitch data={data} state={state} />}
        <div className="mt-1.5 flex flex-wrap gap-2">
          {/* Copyright settings (Task 5) · Fix tracklist · Upload history */}
        </div>
      </Section>
      <Section>{/* ActivityLog */}</Section>
```
(Keep 4a's buttons in their rows: Claim list and Claimed songs move into row2; Fix tracklist and Upload history into the Auto-pilot section's button row.) `usePanel()` now also gives `runner` and `sendTo`.

**A view must not close on a passing `'unknown'` channel** (4a T8 review R3). 4a closes an open view whenever `state.channel` changes. A trim, ads or Collab step changes pages, and the new page may report `'unknown'` for a moment (`/video/<id>/claims` has no channel in its address; ytcfg arrives a little later), which would close the claim list under the user and empty `useClaimsData`. The tab keeps the last real channel instead:
```tsx
  // The channel the tab shows: the bound tab's, ignoring a passing 'unknown' (a page still loading).
  const lastCh = useRef<string | null>(null);
  const reported = state?.channel ?? null;
  if (reported && reported !== 'unknown') lastCh.current = reported;
  if (!state) lastCh.current = null; // no bound tab: nothing to keep
  const ch = reported === 'unknown' ? lastCh.current ?? 'unknown' : reported;
  const data = useClaimsData(ch);
  useEffect(() => setView({ name: 'home' }), [ch]);
```
(replacing 4a's `const data = useClaimsData(state?.channel ?? null)` and `const ch = state?.channel ?? null`). Test, in `tests/panel-copyright-run.test.tsx`, written first:
```tsx
  it("an open view stays open while the tab's page reports 'unknown' for a moment, and closes on a real other channel", async () => {
    await fakeBrowser.storage.local.set({ 'claimScan:UC1': scan, 'claimScan:UC2': { ...scan, channel: 'UC2', channelName: 'Other' } });
    const counts = { hasScan: true, scanDate: '', claims: 1, claimVideos: 1, songs: 0, hasAdsScan: false, adsTodo: 0 };
    const view = (channel: string) => (
      <PanelContext.Provider value={fakePanel()}><ClaimsContext.Provider value={fakeClaims({ state: claimsStateWith({ channel, counts }) })}>
        <AskProvider><CopyrightTab /></AskProvider>
      </ClaimsContext.Provider></PanelContext.Provider>
    );
    const { rerender } = render(view('UC1'));
    fireEvent.click(await screen.findByRole('button', { name: /Claim list \(1\)/ }));
    expect(await screen.findByText(/Copyright claims — Mine/)).toBeTruthy();
    rerender(view('unknown')); // the trim step's new page, before ytcfg
    expect(screen.getByText(/Copyright claims — Mine/)).toBeTruthy();
    rerender(view('UC2'));
    expect(await screen.findByRole('button', { name: /Scan claims/ })).toBeTruthy(); // back home: another channel's
  });
```
(imports: `render` from `@testing-library/react`, `PanelContext` / `ClaimsContext` from the panel module, `AskProvider` from `../entrypoints/sidepanel/ask`.)

**The "previously claimed" chip in light** (4a T7/T8 review m11): `Badge tone="bad"` is `text-warn` on `bg-warn/[0.12]`, 3.8:1 in the light theme. In `components/ui/badge.tsx` make the bad tone's text `text-fg` and keep the amber on its icon and tint: `tone === 'bad' && 'border-transparent bg-warn/[0.12] text-fg [&>svg]:text-warn'`. Add to `tests/panel-queue.test.tsx`'s chip test: `expect(chip.closest('[data-slot="badge"], span')!.className).toContain('text-fg')`. (Tokens only; both themes ≥ 4.5:1 for the text.)

**Claimed songs without a bound Studio tab: not done.** The review offered it as optional. The panel is enabled on Studio tabs only, so the tab is unbound only on a page with no live script (the "Reload this tab" banner), and the home already shows the song count from storage there (`useClaimsGlobals`). The views keep needing `data` and `state`.

`App.tsx`: the Copyright tab shows `●` while a run is active (`tabCount.claims`, 6255):
```tsx
  const { live } = useClaims();
  …
              {k === 'claims' && live?.busyRun && <span className="text-xs text-fg2">●</span>}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/panel-claims.test.ts tests/panel-copyright-run.test.tsx tests/panel-copyright.test.tsx tests/panel-i18n.test.tsx`
Expected: PASS (render the trim question and the Auto-pilot question in Thai in `panel-i18n.test.tsx`).

- [ ] **Step 7: Verify and commit**

Run: `npm run check && npm run build`
```bash
git add extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx extension/entrypoints/sidepanel/tabs/copyright/ClaimList.tsx extension/entrypoints/sidepanel/tabs/copyright/AutopilotSwitch.tsx extension/entrypoints/sidepanel/App.tsx extension/components/ui/badge.tsx extension/tests/panel-queue.test.tsx extension/lib/panel/claims.ts extension/tests/panel-claims.test.ts extension/tests/panel-copyright-run.test.tsx extension/tests/panel-i18n.test.tsx
git commit -m "Copyright tab: trim confirmation, Stop to the running tab, Auto-pilot switch, the pane's layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The panel — Ads and Collab views

`showAds()` (5289–5334) and `showCollab()` (5486–5546), and their buttons on the home (`UI.adsBtn` 6192, `UI.collabBtn` 6195).

**Files:**
- Create: `extension/entrypoints/sidepanel/tabs/copyright/AdsView.tsx`, `extension/entrypoints/sidepanel/tabs/copyright/CollabView.tsx`
- Modify: `extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx`, `extension/lib/panel/claims.ts`
- Test: `extension/tests/panel-claims.test.ts`, `extension/tests/panel-copyright-run.test.tsx`, `extension/tests/panel-i18n.test.tsx`

**Interfaces:**
- Consumes: `ClaimsData` (`adsScan`, `adsResults`, `collabScan`, `collabResults`, `collabLinks`, `collabHandles`), `parseHandles` (`lib/collab.ts`), `claimsWrite`, `fmt`.
- Produces: `adsInitial(scan, results): string[]`, `type AdsPick = 'settings' | 'public' | 'all' | 'none'`, `adsWhere(kind, rows): string[]`, `type CollabPick = 'shown' | 'public' | 'never' | 'failed' | 'none'`, `collabWhere(kind, rows, results, q): { add: string[]; del: string[] }`; `AdsView({ data, state, onClose })`, `CollabView({ data, state, onClose })`.

- [ ] **Step 1: Write the failing logic tests**

Add to `extension/tests/panel-claims.test.ts`:
```ts
import { adsInitial, adsWhere, collabWhere } from '../lib/panel/claims';

describe('ads and Collab picks', () => {
  const ads = [
    { videoId: 'a', video: 'A', privacy: 'public', length: 1, ineligible: false, status: '' },
    { videoId: 'b', video: 'B', privacy: 'private', length: 1, ineligible: false, status: '' },
    { videoId: 'c', video: 'C', privacy: 'public', length: 1, ineligible: true, status: '' },
  ];
  it('starts with the eligible ones not turned on yet (5293)', () => {
    expect(adsInitial({ date: '', total: 3, rows: ads }, { b: { state: 'on', msg: '', date: '' } })).toEqual(['a']);
  });
  it('the chips (5323–5326)', () => {
    expect(adsWhere('settings', ads)).toEqual(['a', 'b']);
    expect(adsWhere('public', ads)).toEqual(['a']);
    expect(adsWhere('all', ads)).toEqual(['a', 'b', 'c']);
    expect(adsWhere('none', ads)).toEqual([]);
  });
  it('Collab chips act on the rows the search shows (5517–5538)', () => {
    const rows = [{ videoId: 'x', video: 'Lofi Mix', privacy: 'public', length: 1 }, { videoId: 'y', video: 'Jazz', privacy: 'private', length: 1 }];
    const res = { y: { state: 'failed', msg: '', date: '' } };
    expect(collabWhere('shown', rows, res, 'lofi')).toEqual({ add: ['x'], del: [] });
    expect(collabWhere('never', rows, res, '')).toEqual({ add: ['x'], del: ['y'] });
    expect(collabWhere('failed', rows, res, '')).toEqual({ add: ['y'], del: ['x'] });
  });
});
```

- [ ] **Step 2: Implement the logic**

```ts
import type { AdsRow, AdsScan, CollabRow, ResultEntry } from '../claims/types';

export const adsInitial = (scan: AdsScan, results: Record<string, ResultEntry>) =>
  scan.rows.filter((r) => !r.ineligible && results[r.videoId]?.state !== 'on').map((r) => r.videoId);
export type AdsPick = 'settings' | 'public' | 'all' | 'none';
export const adsWhere = (kind: AdsPick, rows: AdsRow[]) => rows.filter((r) =>
  kind === 'settings' ? !r.ineligible : kind === 'public' ? !r.ineligible && /public$/.test(r.privacy) : kind === 'all').map((r) => r.videoId);

export type CollabPick = 'shown' | 'public' | 'never' | 'failed' | 'none';
export function collabWhere(kind: CollabPick, rows: CollabRow[], results: Record<string, ResultEntry>, q: string) {
  const shown = rows.filter((r) => !q.trim() || r.video.toLowerCase().includes(q.trim().toLowerCase()));
  const yes = (r: CollabRow) => kind === 'shown' ? true : kind === 'public' ? /public$/.test(r.privacy)
    : kind === 'never' ? !results[r.videoId] : kind === 'failed' ? results[r.videoId]?.state === 'failed' : false;
  return { add: shown.filter(yes).map((r) => r.videoId), del: shown.filter((r) => !yes(r)).map((r) => r.videoId) };
}
```

- [ ] **Step 3: `AdsView.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/claims/core';
import type { ClaimsState } from '@/lib/claims/types';
import { L, locale } from '@/lib/i18n';
import { adsInitial, adsWhere, type AdsPick } from '@/lib/panel/claims';
import type { ClaimsData } from '@/lib/panel/claims-data';
import { usePanel } from '../../panel';
import { SubView } from './SubView';

// showAds() (5289–5334): the videos with ads off, the picks, Recheck, and "Turn on ads (N)".
const failed = (e: unknown) => { console.error('[ytup] ads', e); toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab')); };
export function AdsView({ data, state, onClose }: { data: ClaimsData; state: ClaimsState; onClose(): void }) {
  const { send } = usePanel();
  const scan = data.adsScan!;
  const [picked, setPicked] = useState(() => new Set(adsInitial(scan, data.adsResults)));
  const pick = (kind: AdsPick) => setPicked(new Set(adsWhere(kind, scan.rows)));
  const ok = scan.rows.filter((r) => !r.ineligible).length;
  const go = () => {
    const ids = scan.rows.filter((r) => picked.has(r.videoId)).map((r) => r.videoId);
    if (!ids.length) return;
    onClose();
    void send('claims:ads', ids).catch(failed);
  };
  return (
    <SubView title={L(`💰 คลิปที่ปิดโฆษณา — ${state.channelName}`, `💰 Videos with ads off — ${state.channelName}`)}
      sub={<>
        <div>{L(`${scan.rows.length} จาก ${scan.total} คลิป · ${ok} คลิปแค่ปิดในการตั้งค่า · เช็กเมื่อ ${new Date(scan.date).toLocaleString(locale())}`, `${scan.rows.length} of ${scan.total} videos · ${ok} only turned off in settings · checked ${new Date(scan.date).toLocaleString(locale())}`)}</div>
        <div className="mt-1">{L('"ไม่มีสิทธิ์" หมายถึง YouTube บล็อกโฆษณาเอง (เช่นโดน claim หรือติดนโยบาย) เปิดการตั้งค่าได้ แต่คลิปนั้นอาจยังไม่มีรายได้จนกว่าจะแก้สาเหตุ', '"Ineligible" means YouTube blocks ads itself (e.g. a claim or policy issue). You can turn the setting on, but the video may not earn until the cause is fixed.')}</div>
      </>}
      onClose={onClose}
      footer={<>
        <Button size="sm" onClick={() => { onClose(); void send('claims:scan', 'ads').catch(failed); }}>{L('↻ เช็กใหม่', '↻ Recheck')}</Button>
        <span className="flex-1" />
        <Button variant="go" size="sm" disabled={!picked.size} onClick={go}>{L(`💰 เปิดโฆษณา (${picked.size})`, `💰 Turn on ads (${picked.size})`)}</Button>
      </>}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-fg3">{L('เลือก:', 'Select:')}</span>
        <Button size="sm" onClick={() => pick('settings')}>{L('แค่ปิดในการตั้งค่า', 'Only off in settings')}</Button>
        <Button size="sm" onClick={() => pick('public')}>{L('เฉพาะสาธารณะ', 'Public only')}</Button>
        <Button size="sm" onClick={() => pick('all')}>{L('ทั้งหมด', 'All')}</Button>
        <Button size="sm" onClick={() => pick('none')}>{L('ไม่เลือก', 'None')}</Button>
      </div>
      {scan.rows.length ? (
        <div className="flex flex-col gap-2">
          {scan.rows.map((r) => {
            const res = data.adsResults[r.videoId];
            return (
              <label key={r.videoId} className="flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
                <input type="checkbox" className="mt-1" checked={picked.has(r.videoId)}
                  onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.videoId); else n.delete(r.videoId); return n; })} />
                <div className="min-w-0 flex-1">
                  <a className="font-medium hover:underline" href={`https://studio.youtube.com/video/${r.videoId}/monetization`} target="_blank" rel="noreferrer">{r.video}</a>
                  <div className="text-xs text-fg3">{fmt(r.length)} · {r.privacy}</div>
                  <div className="text-xs">{r.ineligible ? <span className="text-warn">{L('⚠ YouTube แจ้งว่าไม่มีสิทธิ์', '⚠ YouTube says ineligible')}</span> : L('ปิดโฆษณาไว้ (ตั้งค่า)', 'Ads off (setting)')}</div>
                  {res && <div className={res.state === 'on' ? 'text-xs text-ok' : 'text-xs text-err'}>{res.state === 'on' ? L('✅ เปิดแล้ว', '✅ Turned on') : '❌ ' + res.msg}</div>}
                </div>
              </label>
            );
          })}
        </div>
      ) : <div className="text-[13px] text-ok">{L('🎉 ทุกคลิปเปิดโฆษณาแล้ว', '🎉 All videos have ads on')}</div>}
    </SubView>
  );
}
```

- [ ] **Step 4: `CollabView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/claims/core';
import type { ClaimsState } from '@/lib/claims/types';
import { parseHandles } from '@/lib/collab';
import { L, locale } from '@/lib/i18n';
import { collabWhere, type CollabPick } from '@/lib/panel/claims';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { TextField } from '../../fields';
import { usePanel } from '../../panel';
import { SubView } from './SubView';

// showCollab() (5486–5546): the channels to invite (collabHandles, saved as typed — here after a
// short pause), the invite links to send, the videos with search and picks, "Invite (N videos)".
const failed = (e: unknown) => { console.error('[ytup] collab', e); toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab')); };
export function CollabView({ data, state, onClose }: { data: ClaimsData; state: ClaimsState; onClose(): void }) {
  const { send } = usePanel();
  const scan = data.collabScan!;
  const [handles, setHandles] = useState(data.collabHandles);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const typed = (v: string) => {
    setHandles(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void claimsWrite({ op: 'set', key: 'collabHandles', value: v }).catch(failed), 400);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = scan.rows.filter((r) => !q.trim() || r.video.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (kind: CollabPick) => {
    const d = collabWhere(kind, scan.rows, data.collabResults, q);
    setPicked((p) => { const n = new Set(p); d.add.forEach((x) => n.add(x)); d.del.forEach((x) => n.delete(x)); return n; });
  };
  const go = () => {
    const list = parseHandles(handles);
    if (!list.length) return void toast(L('ใส่ @handle ของช่องที่จะเชิญก่อน', 'Enter the @handle of the channel to invite first'));
    const ids = scan.rows.filter((r) => picked.has(r.videoId)).map((r) => r.videoId);
    if (!ids.length) return;
    onClose();
    void send('claims:collab', { videoIds: ids, handles: list }).catch(failed);
  };
  const links = Object.entries(data.collabLinks);
  return (
    <SubView title={L(`🤝 Collab — ${state.channelName}`, `🤝 Collab — ${state.channelName}`)}
      sub={L(`${scan.total} คลิป · อ่านเมื่อ ${new Date(scan.date).toLocaleString(locale())} · YouTube ไม่ส่งคำเชิญให้เอง หลังเชิญเสร็จต้องส่งลิงก์คำเชิญให้อีกฝ่ายเปิดแล้วกดยอมรับ (ช่องละลิงก์เดียว ใช้ได้กับทุกคลิป)`, `${scan.total} videos · read ${new Date(scan.date).toLocaleString(locale())} · YouTube doesn't send the invite itself: after inviting, send the invite link to the other channel to open and accept (one link per channel, covers every video)`)}
      onClose={onClose}
      footer={<>
        <Button size="sm" onClick={() => { onClose(); void send('claims:scan', 'collab').catch(failed); }}>{L('↻ อ่านรายการใหม่', '↻ Reload list')}</Button>
        <span className="flex-1" />
        <Button variant="go" size="sm" disabled={!picked.size} onClick={go}>{L(`🤝 เชิญ (${picked.size} คลิป)`, `🤝 Invite (${picked.size} videos)`)}</Button>
      </>}
    >
      <div className="flex justify-between gap-2 text-xs"><b>{L('ช่องที่จะเชิญ', 'Channels to invite')}</b><span className="text-fg3">{L('@handle คั่นด้วย , (สูงสุด 10)', '@handle, comma-separated (max 10)')}</span></div>
      <TextField value={handles} onValue={typed} placeholder="@handle1, @handle2" />
      {links.length > 0 && (
        <div className="rounded-[12px] bg-tint/5 p-2.5 text-[13px]">
          <b>{L('ลิงก์คำเชิญ (ส่งให้อีกฝ่าย)', 'Invite links (send to the other channel)')}</b>
          {links.map(([hd, link]) => (
            <div key={hd} className="mt-1 flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate">{`${hd}: ${link}`}</span>
              <Button size="sm" onClick={() => void navigator.clipboard.writeText(link).then(() => toast(L(`คัดลอกลิงก์ของ ${hd} แล้ว`, `Copied ${hd}'s link`)), failed)}>{L('คัดลอก', 'Copy')}</Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <TextField className="min-w-0 flex-1" value={q} onValue={setQ} placeholder={L('ค้นหาชื่อคลิป…', 'Search video titles…')} />
        <Button size="sm" onClick={() => pick('shown')}>{L('ทั้งหมดที่แสดง', 'All shown')}</Button>
        <Button size="sm" onClick={() => pick('public')}>{L('เฉพาะสาธารณะ', 'Public only')}</Button>
        <Button size="sm" onClick={() => pick('never')}>{L('ยังไม่เคยเชิญ', 'Not invited yet')}</Button>
        <Button size="sm" onClick={() => pick('failed')}>{L('เฉพาะที่ไม่สำเร็จ', 'Failed only')}</Button>
        <Button size="sm" onClick={() => pick('none')}>{L('ไม่เลือก', 'None')}</Button>
      </div>
      {scan.rows.length ? (
        <div className="flex flex-col gap-2">
          {shown.map((r) => {
            const res = data.collabResults[r.videoId];
            return (
              <label key={r.videoId} className="flex gap-2.5 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
                <input type="checkbox" className="mt-1" checked={picked.has(r.videoId)}
                  onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.videoId); else n.delete(r.videoId); return n; })} />
                <div className="min-w-0 flex-1">
                  <a className="font-medium hover:underline" href={`https://studio.youtube.com/video/${r.videoId}/edit`} target="_blank" rel="noreferrer">{r.video}</a>
                  <div className="text-xs text-fg3">{fmt(r.length)} · {r.privacy}</div>
                  {res && <div className={res.state === 'done' ? 'text-xs text-ok' : 'text-xs text-err'}>{(res.state === 'done' ? '✅ ' : '❌ ') + res.msg}</div>}
                </div>
              </label>
            );
          })}
        </div>
      ) : <div className="text-[13px] text-ok">{L('ช่องนี้ยังไม่มีคลิป', 'This channel has no videos yet')}</div>}
    </SubView>
  );
}
```

- [ ] **Step 5: Home buttons and views**

In `CopyrightTab.tsx`: add to 4a's `sub` expression `view.name === 'ads' && data.adsScan ? <AdsView data={data} state={state} onClose={home} />` and `view.name === 'collab' && data.collabScan ? <CollabView data={data} state={state} onClose={home} />` (give the two home buttons `data-view="ads"` / `data-view="collab"` so Close returns focus to them); row1 between Scan and Stop:
```tsx
          {!busyRun && !busyScan && (
            <Button onClick={() => (data?.adsScan ? setView({ name: 'ads' }) : void send('claims:scan', 'ads').catch(failed))}
              title={L('หาคลิปที่ปิดโฆษณาแล้วเปิดให้', 'Find videos with ads off and turn them on')}>
              <Icon name="paid" size={16} />{n?.hasAdsScan ? L(`โฆษณาปิดอยู่ (${n.adsTodo})`, `Ads off (${n.adsTodo})`) : L('โฆษณาปิดอยู่', 'Ads off')}
            </Button>
          )}
```
and row2's third button:
```tsx
            <Button onClick={() => (data?.collabScan ? setView({ name: 'collab' }) : void send('claims:scan', 'collab').catch(failed))}
              title={L('เลือกคลิปที่อัปแล้ว แล้วเชิญช่องอื่นเป็นผู้ร่วมสร้าง', 'Pick uploaded videos and invite other channels as collaborators')}>
              <Icon name="collab" size={16} />Collab
            </Button>
```
Add to `tests/panel-copyright-run.test.tsx`: "Ads off with no list scans first; with a list opens it and Turn on ads (N) sends the picked ids" and "Invite without a handle toasts 'Enter the @handle of the channel to invite first'; with one sends { videoIds, handles: ['@a'] }"; render both views in Thai in `panel-i18n.test.tsx`.

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm run build`
```bash
git add extension/entrypoints/sidepanel/tabs/copyright/AdsView.tsx extension/entrypoints/sidepanel/tabs/copyright/CollabView.tsx extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx extension/lib/panel/claims.ts extension/tests/panel-claims.test.ts extension/tests/panel-copyright-run.test.tsx extension/tests/panel-i18n.test.tsx
git commit -m "Copyright tab: turn ads on in bulk, invite collaborators in bulk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Copyright settings

`SETTINGS` / `openSettings()` (6259–6307): the module's own settings (`cfg`), saved through the background.

**Files:**
- Create: `extension/entrypoints/sidepanel/tabs/copyright/CopyrightSettings.tsx`
- Modify: `extension/lib/panel/claims.ts`, `extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx`
- Test: `extension/tests/panel-copyright-run.test.tsx`, `extension/tests/panel-i18n.test.tsx`

**Interfaces:**
- Produces: `settingsSections(): { title: string; items: [keyof ClaimsCfg, string, string?][] }[]` (`lib/panel/claims.ts`); `CopyrightSettings({ data, onClose })`.

- [ ] **Step 1: Write the failing test**

```tsx
  it('Copyright settings saves every field as one merge, and Reset asks twice', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined as never);
    const claims = fakeClaims();
    renderPanel(<CopyrightTab />, fakePanel(), undefined, claims);
    fireEvent.click(await screen.findByRole('button', { name: /Copyright settings/ }));
    fireEvent.change(screen.getByLabelText('Run every N hours'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText(/Fully automatic trim/));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('claims:op', expect.objectContaining({
      op: 'merge', key: 'cfg', entries: expect.objectContaining({ apEveryHours: '12', autoSaveTrim: false }) })));
    fireEvent.click(await screen.findByRole('button', { name: /Copyright settings/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'Click again to reset' }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('claims:op', { op: 'set', key: 'cfg', value: {} }));
    expect(claims.addLog).toHaveBeenCalledWith('Copyright settings reset', 'ok');
  });
```

- [ ] **Step 2: Implement**

`lib/panel/claims.ts`:
```ts
// SETTINGS (6259–6274), built when used (L() after initI18n).
export const settingsSections = (): { title: string; items: [keyof ClaimsCfg, string, string?][] }[] => [
  { title: L('Claim และการตัด', 'Claims and trimming'), items: [
    ['ownNames', L('ชื่อศิลปิน / ค่ายของตัวเอง', 'Your own artist / label names'), L('claim ที่มีชื่อเหล่านี้จะถูกมาร์ก ★ เพลงของคุณเอง (คั่นด้วย ,)', 'Claims with these names are marked ★ your own music (comma-separated)')],
    ['autoSaveTrim', L('ตัดอัตโนมัติทั้งหมด', 'Fully automatic trim'), L('กด Save ในหน้าตัด → ติ๊ก "I acknowledge" → กด "Confirm changes" ให้ ถ้าปิด คุณต้องยืนยันเองทีละอัน', 'Clicks Save in the trim editor → ticks "I acknowledge" → clicks "Confirm changes" for you. If off, you confirm each one yourself')],
    ['autoSaveManualTrim', L('ตอนตัดเองด้วยมือ: กด Save และ Confirm changes ให้อัตโนมัติ', 'When trimming manually: auto-click Save and Confirm changes'), L('ปิดไว้ดีกว่า — ถ้าเปิด สคริปต์จะกด Save หลังเปิดหน้าตัด 1.5 วินาที และยืนยันทุกหน้าต่าง "Confirm changes" (รวม mute / replace song) ให้ทันที', 'Better left off — if on, the script clicks Save 1.5 seconds after the trim editor opens and immediately confirms every "Confirm changes" dialog (including mute / replace song)')],
    ['followUpMinutes', L('เช็กทุก N นาที', 'Check every N minutes'), L('คลิปที่มี 2 claim ขึ้นไป: ความถี่ในการเช็กว่าการตัดครั้งก่อนเสร็จหรือยัง', 'Videos with 2+ claims: how often to check whether the previous trim has finished')],
  ] },
  { title: 'Auto-pilot', items: [
    ['apEveryHours', L('ทำงานทุก N ชั่วโมง', 'Run every N hours')],
    ['apOnlyImpact', L('เฉพาะ claim ที่กระทบวิดีโอ (ไม่มีรายได้ / จำกัด / บล็อก)', 'Only claims that affect the video (no revenue / restricted / blocked)')],
    ['apSkipOwn', L('ไม่ตัดเพลงของตัวเอง (★)', "Don't trim your own music (★)")],
    ['apMaxPct', L('ข้าม claim ที่ยาวเกิน N % ของคลิป', 'Skip claims longer than N % of the video')],
    ['apMaxPerCycle', L('จำนวน claim สูงสุดต่อรอบ', 'Max claims per cycle')],
    ['apAdsOn', L('เปิดโฆษณาให้คลิปที่ปิดไว้ด้วย', 'Also turn on ads for videos that have them off'), L('เฉพาะคลิปที่ปิดในการตั้งค่า ไม่รวมคลิปที่ YouTube แจ้งว่าไม่มีสิทธิ์', 'Only videos turned off in settings, not ones YouTube marks as ineligible')],
  ] },
];
```
`CopyrightSettings.tsx`:
```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DEFAULTS } from '@/lib/claims/core';
import type { ClaimsCfg } from '@/lib/claims/types';
import { L } from '@/lib/i18n';
import { settingsSections } from '@/lib/panel/claims';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { TextField } from '../../fields';
import { useClaims } from '../../panel';
import { SubView } from './SubView';

// openSettings() (6275–6307): checkboxes for the on/off settings, text for the rest (as the
// userscript, numbers stay strings); Save writes them in one merge, Reset asks twice.
export function CopyrightSettings({ data, onClose }: { data: ClaimsData; onClose(): void }) {
  const { addLog } = useClaims();
  const [c, setC] = useState<ClaimsCfg>(data.cfg);
  const [armed, setArmed] = useState(false);
  const set = <K extends keyof ClaimsCfg>(k: K, v: ClaimsCfg[K]) => setC((x) => ({ ...x, [k]: v }));
  const save = async () => {
    await claimsWrite({ op: 'merge', key: 'cfg', entries: { ...c } });
    onClose();
    toast(L('บันทึกการตั้งค่าแล้ว', 'Settings saved'));
  };
  const reset = async () => {
    if (!armed) return setArmed(true);
    await claimsWrite({ op: 'set', key: 'cfg', value: {} });
    onClose();
    addLog(L('คืนค่าตั้งค่าลิขสิทธิ์แล้ว', 'Copyright settings reset'), 'ok');
  };
  const fail = (e: unknown) => console.error('[ytup] copyright settings', e);
  return (
    <SubView title={L('ตั้งค่าลิขสิทธิ์', 'Copyright settings')} onClose={onClose}
      footer={<>
        <Button size="sm" variant="danger" onClick={() => void reset().catch(fail)}>{armed ? L('กดอีกครั้งเพื่อคืนค่า', 'Click again to reset') : L('คืนค่าเริ่มต้น', 'Reset to defaults')}</Button>
        <span className="flex-1" />
        <Button size="sm" onClick={onClose}>{L('ยกเลิก', 'Cancel')}</Button>
        <Button size="sm" variant="go" onClick={() => void save().catch(fail)}>{L('บันทึก', 'Save')}</Button>
      </>}
    >
      {settingsSections().map((sc) => (
        <div key={sc.title} className="flex flex-col gap-2">
          <h4 className="mt-2 text-xs font-semibold tracking-[.03em] text-fg3">{sc.title}</h4>
          {sc.items.map(([k, label, hint]) => typeof DEFAULTS[k] === 'boolean' ? (
            <label key={k} className="flex gap-2.5 text-[13px]">
              <input type="checkbox" className="mt-1" checked={c[k] as boolean} onChange={(e) => set(k, e.target.checked as never)} aria-label={label} />
              <span>{label}{hint && <div className="text-xs text-fg3">{hint}</div>}</span>
            </label>
          ) : (
            <label key={k} className="flex flex-col gap-1 text-[13px]">
              <span className="flex justify-between gap-2"><span>{label}</span>{hint && <span className="text-xs text-fg3">{hint}</span>}</span>
              <TextField value={String(c[k])} onValue={(v) => set(k, v as never)} aria-label={label} />
            </label>
          ))}
        </div>
      ))}
    </SubView>
  );
}
```
`CopyrightTab.tsx`: add `view.name === 'settings' ? <CopyrightSettings data={data} onClose={home} />` to the `sub` expression (the button gets `data-view="settings"`); failed writes use `saveFailed` as the home does; the Auto-pilot section's first button:
```tsx
          <Button size="sm" onClick={() => setView({ name: 'settings' })} disabled={!data}><Icon name="sliders" size={13} />{L('ตั้งค่าลิขสิทธิ์', 'Copyright settings')}</Button>
```

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run tests/panel-copyright-run.test.tsx tests/panel-i18n.test.tsx && npm run check && npm run build`
```bash
git add extension/entrypoints/sidepanel/tabs/copyright/CopyrightSettings.tsx extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx extension/lib/panel/claims.ts extension/tests/panel-copyright-run.test.tsx extension/tests/panel-i18n.test.tsx
git commit -m "Copyright settings in the Copyright tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Coverage, README Phase 4 checklist, spec amendments, verification

**Files:**
- Modify: `extension/scripts/ui-check.mjs`, `extension/scripts/strings/dropped.mjs`, `extension/tests/ui-check.test.mjs` (if it pins `DRAWER`), `extension/README.md`, `docs/superpowers/specs/2026-10-05-chrome-extension-design.md`

- [ ] **Step 1: Coverage of the copyright module**

`ui-check.mjs`: `export const DRAWER = [2428, 6356]; // "===== UI =====" through the copyright module (its pane and modals are the Copyright tab)`. Run `node scripts/ui-check.mjs --coverage`. Every pair it reports as unused is either a real gap (a string the Copyright tab or the page should say: fix the code) or a pair the extension no longer shows; list only the latter in `dropped.mjs` with a reason, e.g.:
```js
  // Phase 4: the copyright module's pane and modals became the Copyright tab
  { th: '…', en: '…', why: 'the modal is a view of the Copyright tab; …' },
```
Expected after: `ui-check: ok` with `--coverage`. Update `tests/ui-check.test.mjs` if it asserts `DRAWER`'s bounds.

- [ ] **Step 2: README — Phase 4 exit checklist**

**Numbering (as of 4a Task 9, `931c067`).** The README's checklist now ends at item 53: 4a added "### Copyright, Phase 4a (scan, lists, one lock)" with items 46–53 (46 scan and status card, 47 the scheduler avoids a taken slot, 48 a scan during an upload, 49 status in a second window, 50 light / dark / narrow, 51 CSV downloads in the real side panel, 52 one worker per channel, 53 Start refused during copyright work). So this step:
- **numbers its new items from 54** (54–74 below); if a later 4a fix round added items after 53, start at the next free number instead and shift every number and cross-reference below by the same amount;
- **doesn't repeat what 46–51 already check**: items 54 and 71 below only add what is new to them;
- **extends items 52 and 53 in place** (they say they can only be exercised in 4b), as written under "Items 52 and 53" below;
- **updates item 2's range**: "(items 46 to 52)" becomes "(items 46 to 74)", and its sentence about the Copyright tab lists what 4b added (Ads off, Collab, Stop, the Auto-pilot switch, Copyright settings).

**Items 52 and 53, rewritten in place:**
```markdown
52. **One worker per channel.** Turn Auto-pilot on (item 69) with two Studio tabs open on the same
    channel. In the service worker console, `await chrome.storage.session.get('claimsWorkers')`
    names one tab for the channel (`{ tabId, at }`, `at` moving every few seconds). One cycle runs,
    not two; during a run the other tab's card shows "↪ Running in another Studio tab". Close the
    worker tab: within about 10–15 s the entry names the other tab, and it carries on. **Record** what
    happens when the worker tab hangs instead (DevTools → pause script execution): the other tab
    takes over after about 20 s.
53. **Start refused during copyright work.** Start a trim run in Studio tab A (item 57). In tab B
    the panel shows "Another Studio tab is busy with copyright work — wait for it, or press Stop in
    the Copyright tab" with **Go to that tab**, Start is disabled, and a forced Start (item 16's
    way) toasts "Another Studio tab is already running the queue or copyright work". When A's run
    ends, B's banner goes and Start works.
```
(Item 52 as 4a wrote it reads the lease from `chrome.storage.local`; it lives in `storage.session`. The rewrite above corrects that.)

Rename "## Phase 3 exit check (manual, in Chrome)" to "## Exit checks (manual, in Chrome)" (unless 4a already did), keep its items, and append:
```markdown
### Phase 4: copyright (scan, trim, Auto-pilot)

Use a test channel with at least two videos that carry claims (one with two claims), Studio in
English. Write down pass or fail; items marked **record** ask for an observation.

54. **Scan, on a claim-heavy channel.** (Items 46 and 51 cover the scan, the status card, the
    lists and the CSV files.) Scan the channel with the most claims you have: the claim list shows
    one card per claim with video, privacy · length, song · artists · label, claimant, ranges with
    % of the video, and impact. Then open **Show activity ▾**: no "Unexpected answer from …"
    lines. **Record** any, with its text (it names the endpoint and the field: Studio answered in
    a shape the check doesn't know).
55. **Scan before Studio loaded / not signed in.** Reload Studio and click Scan at once:
    "Studio hasn't finished loading — try again in a few seconds" in the activity log. (Optional:
    in a signed-out profile, "Not signed in (SAPISID cookie not found)".)
56. **Picks.** Each chip ticks the right rows; ticks survive closing and reopening the panel and
    show in another window's panel on the same channel.
57. **Trim, automatic.** Tick one claim, **✂ Trim selected (1)** → the question (total length,
    "Saved trims cannot be undone", ⚡ Fully automatic) → **Start trim**. The tab opens the
    video's claims page, the card shows the steps (Open video → … → Confirm), the claim ends
    "✅ Trimmed" with its range; the Upload tab's queue is untouched. **Record** the time it took.
58. **Several claims on one video.** Trim both claims of the two-claim video: the first trims, the
    second shows "⏳ Queued — will trim after the previous trim on this video finishes"; the card
    says "Waiting for YouTube to process trims" with the next check time. Set Copyright settings →
    "Check every N minutes" to 2 and wait: the second trims after YouTube finishes (can take hours;
    **record** whether it happened before the end of the session).
59. **Review mode.** Turn off "Fully automatic trim": the trim editor opens and waits ("👉 Your
    turn…"); Cancel ends it "⏭ Skipped"; Save + I acknowledge + Confirm changes ends it "✅ Trimmed".
60. **Stop.** During a run, **Stop** (also from a second window's panel on another Studio tab of the
    same channel): the run ends after the current step, "You stopped it: …"; queued follow-ups are
    cancelled ("Cancelled N queued follow-up trims").
61. **Studio in Thai.** Switch Studio to Thai: the red warning shows on the Copyright tab, Scan still
    works, a trim fails with "Studio is not set to English — switch to English and try again".
62. **Manual trim auto-save.** Copyright settings → turn on "When trimming manually…"; trim a claim
    by hand in Studio: Save is clicked about 1.5 s after the editor opens, Confirm changes is ticked
    and confirmed. Turn it off again.
63. **One lock.** Start a trim run in Studio tab A; in tab B (same browser) the Upload tab's Start is
    disabled with "Another Studio tab is busy with copyright work — wait for it, or press Stop in
    the Copyright tab" and **Go to that tab**. Reverse: with a queue running in A, a trim run
    started in B (another channel) waits at its first page change (its card shows "⏸ Waiting for
    another Studio tab to finish (page change needed)") and goes on after A's queue ends; B's
    Auto-pilot cycle still scans meanwhile. With no tab running the queue, a trim run waits while
    the queue has **waiting** videos ("⏸ Waiting for the upload queue to clear…"); a **failed**
    upload left in the queue doesn't hold it back.
64. **Run survives page changes; takeover.** During a run with 3 claims on different videos, the tab
    changes pages per video and keeps going. Close that tab mid-run with a second Studio tab on the
    same channel open: the second tab continues within a few seconds.
65. **Ads.** **Ads off** (first time: it scans) → the list with ineligible ones marked → **Turn on
    ads (N)**: each video's monetisation page opens, "None of the above" is answered when asked,
    Save; "✅ Turned on". **Record** any "YouTube asked more after Save" message.
66. **Collab in bulk.** **Collab** → type `@handle` (kept after reopening), pick videos, **Invite**:
    each video's edit page opens, the invite is sent and saved; "Invite links" lists the link with
    **Copy**. If the handle is one of your own channels (in the channel list), the tab switches to
    it and accepts (with "Auto-accept channel permission invites" on).
67. **Claimed songs.** The list searches and sorts; ✕ asks "Sure?"; ⬇ CSV / ⬆ Import CSV round-trip
    (`claimed-songs-*.csv` from the userscript imports with "Imported N songs into history");
    "Delete all" asks twice. A `.txt` dropped into the queue with a claimed song shows "1 song(s)
    previously claimed" on its card, the tooltip listing it.
68. **Tracklist fix.** **Fix tracklist** → pick a trimmed video: its upload-history tracklist is
    filled in, the trimmed range ticked, the new tracklist has the cut song removed and later
    times moved up; **Copy new tracklist** toasts. A `.txt` dropped on "Original tracklist" replaces it.
69. **Auto-pilot.** Turn it on (the question lists the rules) with "Run every N hours" = 0.5: the
    card says "Auto-pilot is on · Next scan + trim in …"; within a minute a cycle scans and trims
    what the rules pick. Afterwards, in the service worker console, `await chrome.alarms.getAll()`
    shows one `ap:<channelId>` at the next cycle (none while a cycle is due). Turn it off: the
    alarm is gone.
    - **Two tabs, one channel.** Open a second Studio tab on the same channel: one cycle runs (one
      "🤖 Auto-pilot starting a new cycle" in the log), not two; the other tab's card shows
      "↪ Running in another Studio tab" during runs.
70. **Auto-pilot with no Studio tab.** With Auto-pilot on and its next cycle due, close every
    Studio tab, wait past the time, then open Studio on that channel: the cycle starts within a few
    seconds of the page loading. While it was due with no tab, the service worker stayed asleep
    (its console shows no `[ytup] autopilot` lines every 30 s). **Record** whether a backgrounded
    Studio tab started its cycle on time (the alarm wakes it); a tab Chrome discarded (Memory Saver)
    has no script and does not wake.
    - **The "due" notification.** In that same wait, when the cycle's time came with no Studio tab
      open, one desktop notification "Auto-pilot is due" naming the channel appears (once: restarting
      Chrome or the extension doesn't show it again for the same cycle). Clicking it opens Studio on
      that channel in a new tab, and the cycle starts there within a few seconds. With a Studio tab
      on that channel open, no notification.
71. **Scheduled slots after a trim run.** (Item 47 covers the scheduler avoiding a taken slot.)
    Repeat item 47 right after a trim run changed pages in that tab: the schedule box still
    skips the taken slot (the scheduled list is read again on the new page).
72. **Two windows, one queue.** Two windows with panels on two idle Studio tabs: edit a card's
    title in one and another card's title in the other within half a second: both edits stay.
73. **Settings changed after the summary.** Open the start summary in window A, turn scheduling off
    in window B's panel, confirm in A: "Settings or presets changed after you confirmed — click
    Start again to see the new summary".
74. **Activity log.** **Show activity ▾** shows the lines of scans and trims (they survive the
    trim's page changes); the open/closed choice is kept.
```

Also: under "Moving from the userscript" nothing changes (4a). In the Layout, add `lib/claims/alarms.ts`.

- [ ] **Step 3: Spec amendments**

In `docs/superpowers/specs/2026-10-05-chrome-extension-design.md`:
- **Modules** table: the row `lib/claims/*, lib/studio/trim.ts, MAIN-world youtubei | 4521–end` → `lib/claims/* (claims.ts: the ported module incl. trim; core.ts, songs.ts: pure; ops.ts / store.ts: data), lib/main-youtubei.ts (MAIN world) | 4587–6357`; `entrypoints/sidepanel/tabs/Copyright.tsx` → `entrypoints/sidepanel/tabs/CopyrightTab.tsx` (+ `tabs/copyright/*`).
- **Messaging**: replace "Phase 4 adds `claims:scan`, `claims:trim`, `claims:autopilot`" with "Phase 4 adds `claims:view`, `claims:scan`, `claims:trim`, `claims:ads`, `claims:collab`, `claims:stop`"; page → panel: "`claims:state`, `claims:log`, `claims:show`"; page/panel → background: "`claims:op`" (the one writer of the copyright keys, like `store:patch`); background → page: "`claims:autopilot` (an Auto-pilot alarm)". Replace "One runner at a time … `{runnerTabId}`" with the lock with jobs (`runnerTabId` + `runnerJobs`: `queue` / `claims`).
- **Background → Autopilot**: "one one-shot alarm per channel at its next cycle, armed only for a future cycle and once per cycle; when it fires, the background sends `claims:autopilot` to that channel's worker tab (one Studio tab per channel, the userscript's tab lease, kept in `storage.session`), which runs its cycle; with no such tab, the channel's next cycle stays due and starts when a tab for that channel opens. Follow-up checks run on the worker tab's own timer."
- **Background → Autopilot (user request)**: "when an alarm fires and no Studio tab can run the cycle, the background shows one 'Auto-pilot is due' notification for that cycle (per channel and `next`, remembered in storage.local); clicking it opens Studio on that channel in a new tab."
- **Error handling → MAIN world not answering**: "A `getCfg` request times out after 10 s, a `youtubei` request after 30 s (the userscript's fetch had none); a timeout fails that call like any API error."
- **Side panel UI**: "the copyright pane's modals are views of the Copyright tab; claim and song tables are lists of cards."

And the ten the 4a whole-branch review found missing (its line numbers are the spec's):
1. **Messaging, content → background** (lines 144–146): add `runner:holds`, `runner:worker`; background → content: `runner:changed`; `claims:op` joins the list of messages refused from senders that may not write (`mayWrite`); `runner:acquire` and `runner:worker` are refused from non-Studio senders.
2. **"One writer for settings and counters"** (147–153) becomes "settings, counters and the copyright keys": pages and the panel send `claims:op`; the background applies ops one at a time in the same queue; a Studio tab applies the op to its own copy at once and re-reads the key when the background is done; a write unanswered in 30 s counts as failed but may still land, and a failed one is shown.
3. **Content ↔ MAIN world** (167–169): the MAIN script answers `getCfg` and `youtubei` for an allowlist of four read-only endpoints; its answers are page data, copied as plain data and shape-checked before use; `CHANNEL_ID` names a storage key only when it is a real channel id.
4. **GM replacements** (line 90): per-channel `key:channelId` layout kept, except `tabLock:<ch>`, which is the worker lease `claimsWorkers` in `storage.session` (`{ tabId, at }`, stale after 20 s, written every 5 s at most, asked every 10 s).
5. **One runner at a time** (line 160): add "a page restored from the back/forward cache that lost the lock aborts its run at once; scans take no lock; a backup import is refused during any lock job; Studio tabs follow the lock through `runner:changed`, focus and a 30 s poll."
6. **File intake / queue**: two windows' queue saves are merged per item; the start is bound to a signature of the schedule, thumbnails on/off and the pending presets' visibility ("Settings or presets changed after you confirmed — …"); the scheduled-list refresh before a start is limited to 10 s.
7. **Error handling, bridge failures** (line 123): a file whose read permission the user blocked ('denied') fails with "The browser blocked reading this file — remove it from the queue and add it again".
8. **Messaging, page → panel**: `claims:state`, `claims:log`, `claims:show` come from the bound tab, or from the lock holder while it runs copyright work; the activity log is the panel's last 80 lines; the Copyright tab's buttons follow the bound tab.
9. **Data migration / privacy**: per-channel copyright data is not in the backup; the claimed-songs CSV import is lossy and limited to 16 MB; the debug report contains the copyright data and the lock state.
10. **Side panel UI**: CSV files (claims, songs, upload history) are saved from the panel; the queue card shows "N song(s) previously claimed".

- [ ] **Step 4: Full verification**

From `extension/`: `npm run check && npm run build`. From the root: `node --test test/*.test.mjs` (163/0), `git diff --stat d15ef87 -- youtube-upload-presets.user.js test/` (empty), manifest permissions exactly the five.

- [ ] **Step 5: Commit**

```bash
git add extension/scripts/ui-check.mjs extension/scripts/strings/dropped.mjs extension/tests/ui-check.test.mjs extension/README.md docs/superpowers/specs/2026-10-05-chrome-extension-design.md
git commit -m "Phase 4 exit: copyright strings covered, README checklist (items 52–74), spec amended

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 4 exit check (manual, in Chrome)

The README items 46–74 (4a's 46–53, with 52 and 53 extended, and 4b's 54–74) and the open Phase 3 items, run once by the user at the end of 4b, with the userscript disabled. Any failure blocks Phase 5.

## What comes next

Phase 5 (cutover): the parity checklist against the userscript, `wxt zip` → GitHub Release with the update check, and the userscript's last version saying it moved.
