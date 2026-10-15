# Chrome extension: replace the userscript

**Date:** 2026-10-05
**Source:** `youtube-upload-presets.user.js` (v4.26.1, 6,348 lines, one IIFE)
**Status:** approved design, not yet implemented

## Problem

The userscript has outgrown Tampermonkey. Upload queue, presets, scheduling, collab
invites, channel switching, quick actions, a full panel UI and the copyright
scanner/trimmer with autopilot all live in one 500 KB IIFE. Nothing can be imported, so
the tests slice source blocks out by comment anchors (`test/harness.mjs`). The panel
fights Studio's CSS and z-index, and `unsafeWindow` is the only way to reach `ytcfg`
and Studio's internal API.

## Goal

A Manifest V3 Chrome extension with feature parity with v4.27.1 (the commit
`npm run port-check` pins), built from real modules, with the main UI in Chrome's Side Panel. The userscript keeps working until
the extension reaches parity.

## Decisions

| Topic | Decision |
|---|---|
| Audience | Me and my team. Unpacked zip from GitHub Releases, no Chrome Web Store. A manifest `key` gives one extension id on every machine and for every folder; its private half is the owner's and is never in the repo (approved 2026-10-11, decision P5-5) |
| Main UI | Chrome Side Panel |
| Migration | Port first (logic unchanged, split into modules), improve afterwards |
| Framework | WXT (pinned exact version), TypeScript, npm, Node 22 |
| Side panel UI | React 19 + Tailwind v4 + shadcn/ui-style components, themed with black glass tokens, the userscript's Material Symbols Rounded paths as inline SVG (no icon font) |
| In-page UI | Plain TS DOM inside Shadow DOM (quick actions, FAB, page toast, reload banner). No React in content scripts. The tracklist-fix dialog is a view of the Copyright tab (decision P4-17) |
| File intake | Drop on the Side Panel; files reach Studio through an extension-origin bridge iframe |
| Tests | Vitest + WXT `fakeBrowser`; existing fake-dom mocks kept |

## Architecture

```
┌──────────── Side Panel (React + shadcn) ────┐      ┌── Background SW ──┐
│ Upload (with the schedule box) · Presets ·  │◄────►│ chrome.alarms     │
│ Copyright · Settings                        │ msgs │ (autopilot),      │
└──────────────▲──────────────────────────────┘      │ notifications,    │
               │ typed messages + storage.onChanged   │ panel enable/tab  │
┌──────────────▼──────── Studio tab ──────────────────┴───────────────────┐
│ studio.content.ts (isolated) — owns queue runner + File objects,        │
│   DOM automation (SEL/TXT), quick actions, upload/collab/trim           │
│ studio-main.content.ts (MAIN world) — ytcfg + /youtubei/v1 calls        │
│ file-bridge.html (hidden iframe, extension origin) — handles → Files    │
└─────────────────────────────────────────────────────────────────────────┘
www.youtube.com → invite.content.ts (channel switch + invite accept)
```

### Entrypoints

| Entrypoint | Context | Job |
|---|---|---|
| `entrypoints/background.ts` | service worker | Enable the side panel on `studio.youtube.com` only; autopilot alarms; notifications; update check |
| `entrypoints/studio.content.ts` | `studio.youtube.com`, isolated world | Queue runner, DOM automation, quick actions, manual-fill, trim, mounts the bridge iframe |
| `entrypoints/studio-main.content.ts` | `studio.youtube.com`, MAIN world | Exposes `getCfg(keys)` and `youtubei(path, body)` only |
| `entrypoints/invite.content.ts` | `www.youtube.com` | Channel switcher flow and invite accept (current lines 224–414) |
| `entrypoints/sidepanel/` | extension page | React app |
| `entrypoints/file-bridge/` | extension page, web-accessible | Reads file handles from IndexedDB, posts `File`s to the content script |

### Modules (cut along the seams already in the IIFE)

| Module | From (current lines) | Used by |
|---|---|---|
| `lib/i18n.ts` (`L`, `LANG`, `LOCALE`) | 24–30 | all |
| `lib/studio/txt.ts`, `lib/studio/sel.ts` | 31–178 | content |
| `lib/collab.ts` (pure) | 179–223 | content, tests |
| `lib/invite.ts`, `lib/channel-switch.ts` | 224–414 | invite + studio content |
| `lib/settings.ts`, `lib/storage.ts`, `lib/migrations.ts` | 415–642 | all |
| `lib/template.ts`, `lib/chapters.ts`, `lib/tracklist.ts` | 643–873 | all (pure) |
| `lib/activity.ts` | 874–918 | all (pure) |
| `lib/studio/automation.ts` | 919–1034 | content |
| `lib/studio/collab.ts` | 1035–1316 | content |
| `lib/studio/schedule.ts` | 1317–1626 | content |
| `lib/studio/channel.ts` | 1627–1649 | content |
| `lib/studio/queue-runner.ts` | 1650–2151 | content |
| `lib/studio/manual-fill.ts`, `lib/studio/quick-actions.ts` | 2152–2361 | content |
| `entrypoints/sidepanel/*` | 2362–4520 (UI rewritten, same behavior) | panel |
| `lib/claims/*` (`claims.ts`: the ported module incl. trim; `core.ts`, `songs.ts`: pure; `ops.ts` / `store.ts`: data; `alarms.ts`: Auto-pilot in the background), `lib/main-youtubei.ts` (MAIN world) | 4587–6357 | content + MAIN + background |
| `entrypoints/sidepanel/tabs/CopyrightTab.tsx` (+ `tabs/copyright/*`) | copyright UI in 4587–6357 | panel |
| `lib/messages.ts` | new | all |
| `lib/file-store.ts` | new | panel, bridge |

### GM replacements

| Userscript | Extension |
|---|---|
| `GM_getValue` / `GM_setValue` | `chrome.storage.local` (same keys and per-channel `key:channelId` layout), except `tabLock:<ch>`: the tab lease is the background's worker lease `claimsWorkers` in `storage.session` (`{ tabId, at }` per channel, stale after 20 s without a renewal, written every 5 s at most, asked by a tab every 10 s, an answer trusted for 15 s) |
| `GM_addStyle` | Bundled CSS (Tailwind in the panel, Shadow DOM styles in the page) |
| `GM_setClipboard` | `navigator.clipboard`: in the panel for the dialog info, the new tracklist and invite links; the quick-action Copy buttons copy in the page |
| `GM_notification` | `chrome.notifications` from the background |
| `unsafeWindow` | MAIN-world content script |
| `GM_info` | `chrome.runtime.getManifest()` |
| Google Fonts link | IBM Plex Sans Thai bundled in the extension for the panel; Material Symbols Rounded paths embedded as inline SVG. The font is not loaded into the Studio page: the FAB, the page toast and the reload banner fall back to the computer's fonts (decision P5-row-page-font) |

## File intake (drop on the Side Panel)

`File` objects cannot travel over `chrome.runtime` messaging, and Studio's upload input
needs a real `File` inside the Studio tab (`DataTransfer` injection, current line 1543).

1. **Drop.** The panel's drop handler (and its pickers) calls
   `DataTransferItem.getAsFileSystemHandle()` for every video, thumbnail and `.txt`.
   Handles go into extension IndexedDB as `{id → handle}`, one random id per file
   (`lib/file-store.ts`), and the panel sends the ids to the Studio tab (`queue:add`). The
   Studio tab fetches the files through the bridge (step 2) and does the rest, as the
   userscript did: it reads each `.txt` (UTF-8, falling back to windows-874 as today) and
   stores its text with the item, pairs files by base name, and writes the queue metadata
   (preset, title, schedule) to `chrome.storage.local`. The panel never builds queue items.
   A picked or dropped folder is read at every depth. Hidden files (names starting with a
   dot) are left out; more than 2000 files from folders in one pick or drop is refused whole
   with a message (files dropped loose are not counted); a folder that can't be read is passed
   over with a message (decisions P5-row-folder-depth, P5-folder-extras).
2. **Bridge.** `studio.content.ts` mounts a hidden `file-bridge.html` iframe. It has the
   same origin as the panel, so it sees the same IndexedDB.
3. **Fetch.** When the runner reaches an item, it asks the bridge for `itemId`. The bridge
   calls `handle.getFile()` and `postMessage`s the `File` to the content script
   (structured clone passes a reference, not a copy). The existing `DataTransfer`
   injection runs unchanged.
4. **Reload and restart.** Handles persist, so the queue survives tab reloads and channel
   switches. After a browser restart, read permission may go back to `prompt`. The panel
   then shows one **Re-grant access (N files)** button. One click calls
   `requestPermission()` on each such handle in turn (Chrome may prompt per handle; the
   manual check records how many prompts one click shows), and the queue resumes. Start
   waits until no file the run will read needs a grant (pending items' videos, and their
   thumbnails when thumbnails are on; a file the user blocked, 'denied', fails its own
   item instead); the Studio tab refuses a start that slips through.
5. **Cleanup.** A handle is deleted when its item is done or removed from the queue.

The rule "don't change pages or channels while the queue has files" goes away once
step 4 works. The page asks "Leave site?" only during a run or while files picked in
Studio's own dialog wait; files added in the panel survive a reload.

Two windows can edit one queue: their saves are merged per item, so an edit in one window
doesn't undo an edit to another item in the other. A start is bound to what the summary
showed: a signature of the schedule, thumbnails on/off and the waiting items' presets'
visibility, and a start whose signature no longer matches is refused ("Settings or presets
changed after you confirmed — click Start again to see the new summary"). The read of the
channel's scheduled videos before a start is limited to 10 s.

## Messaging

All message types live in `lib/messages.ts`, built on `@webext-core/messaging`.

- **Panel → page (the Studio tab):** `queue:add`, `queue:preflight`, `queue:start`,
  `queue:stop`, `queue:retry`, `queue:remove`, `queue:clearDone`, `queue:view`,
  `queue:edit`, `channel:switch`, `fill:apply`, `diag:dialogInfo`. Phase 4 adds
  `claims:view`, `claims:scan`, `claims:trim`, `claims:ads`, `claims:collab`, `claims:stop`.
  The panel asks the confirmations (trim, Auto-pilot) and checks the handles; the page starts
  each run from its stored scan. Those two questions open with Cancel selected, and ignore a
  hasty or double click on yes in their first 0.8 s (decision P5-ask-cancel). The Copyright tab's buttons follow the bound tab; its Stop
  goes to the lock holder while that tab runs copyright work.
- **Page → panel:** `queue:state` broadcasts the live runner state (running, stopping,
  progress, a revision number, the channel) and `queue:toast` the page's toasts. The panel
  doesn't take the queue from them: a `queue:state` whose revision changed, a storage
  change or a minute's timer makes it ask its tab for `queue:view` again. Phase 4 adds
  `claims:state`, `claims:log` and `claims:show`: they come from the bound tab, or from the
  lock holder while it runs copyright work. The activity log is the panel's last 80 lines;
  a line logged while no panel is open on the tab is not kept (known gap, decision
  P5-log-panel-closed).
- **Page → background:** `openPanel` (with the tab the panel should show, if any: the
  background stores it as `panelTab` in `storage.session`, and a panel bound to that Studio
  tab follows it once, while it is at most 10 s old; decision P5-row-tab-choice), `ensureMigrated`, `files:delete`, `notify`,
  `runner:acquire`, `runner:release`, `runner:elsewhere`, `runner:holds`, `runner:worker`,
  `store:patch`, `claims:op`. **Panel → background:** `store:patch`, `backup:write`,
  `claims:op` (Auto-pilot on/off is one: no page needed). `files:delete`, `store:patch`,
  `backup:write` and `claims:op` are refused from senders that may not write (`mayWrite`);
  `runner:acquire` and `runner:worker` are refused from senders that are not Studio tabs.
- **Background → page:** `runner:changed` (the lock moved: every Studio tab asks again) and
  `claims:autopilot` (an Auto-pilot alarm, to that channel's worker tab).
- **Persistent state** (settings, presets, upload history, queue metadata, per-channel
  claims data) is read and written through `chrome.storage.local`. Both sides react to
  `storage.onChanged`.
- **One writer for settings, counters and the copyright keys.** The background is the only
  writer of `settings` and `counters`: the panel and the Studio tabs send `store:patch` (a diff), and
  the background applies patches one at a time, so two writers never lose each other's
  change. An import goes through `backup:write` the same way. The copyright data (the
  per-channel keys and the four global ones) is written the same way: pages and the panel
  send `claims:op` (one op, one key), applied one at a time in the same queue. A Studio tab
  applies the op to its own copy at once and re-reads the key when the background is done. A
  write unanswered in 30 s counts as failed but may still land; a failed one is shown ("Couldn't
  save (…)"). No op is accepted for `autopilot:unknown`. `presets` and `activeId` are
  written whole by the panel (plus Alt+1…9 in Studio); `channels` is read-modify-written by
  the page's channel memory and the panel's channel list, as the userscript did across tabs.
- **Target tab.** The panel binds to the active Studio tab in its window. The background
  enables the panel on Studio tabs only, so there is no "Open YouTube Studio" screen; when the
  Studio tab has no live content script (opened before the extension loaded or reloaded), the
  panel shows **Reload this tab**. The same for a tab of another build: a tab's answers carry
  `PROTOCOL` (`lib/messages.ts`; 3 since `QueueView` has `userscript`), and the panel takes
  nothing from a tab whose number differs.
- **One runner at a time.** A `storage.session` lock with jobs (`runnerTabId` +
  `runnerJobs`: `queue` / `claims`) stops two Studio tabs from driving Studio at once: the
  upload queue, or a trim / ads / Collab run, which takes the `claims` job right before it
  changes pages and gives it back when no run is left (or while its run only waits for the
  upload queue). The lock is released when the runner stops or when its tab closes
  (`tabs.onRemoved` in the background), is discarded or leaves Studio. A page restored from
  the back/forward cache that lost the lock aborts its queue run at once, and one that holds the
  `claims` job or has copyright work in flight (a step, a scan, a cycle, a follow-up check)
  reloads; an idle one works on. Scans take no lock. A backup import is refused during any
  lock job. Studio tabs follow the lock through `runner:changed`, focus and a 30 s poll.
  While another Studio tab holds the lock, the intercept is off: two or more files picked in
  Studio's own upload dialog stay with Studio, which uploads them without presets, and the
  page says so in a toast (decision P5-row-intercept-second-tab).
- **One copyright worker per channel.** Only the channel's worker tab ticks Auto-pilot,
  follow-up checks and run steps: the lease `claimsWorkers` (see "GM replacements"). The tab
  that holds the `claims` job for a run keeps the lease with it.
- **Stop goes to the lock holder.** The panel's Stop is sent to the tab that holds the
  runner lock, which may not be the panel's own tab. When it isn't, the panel names the tab
  that will stop ("Will stop the queue in the tab "…" after the current video finishes").
  The panel shows toasts from its own tab only (plan 3b D14).
- **Content ↔ MAIN world.** `window.postMessage` on a fixed channel name
  (`ytup:main`). Requests carry an id; responses echo it. The MAIN script answers only
  `getCfg` and `youtubei` (for an allowlist of four read-only endpoints), and ignores any
  message whose `source` is not `window` or whose shape doesn't match. Its answers are page
  data: copied as plain data and shape-checked before use. `CHANNEL_ID` names a storage key
  only when it is a real channel id.

## Background

- **Side panel.** `sidePanel.setOptions({ tabId, enabled })` turns the panel on for
  `studio.youtube.com` tabs only. The toolbar icon opens it.
- **Autopilot.** One one-shot `chrome.alarms` alarm per channel, named `ap:<channelId>`, at
  its next cycle (`autopilot:<channelId>.next`), armed only for a future cycle and once per
  cycle. When it fires, the background sends `claims:autopilot` to that channel's worker tab
  (one Studio tab per channel, the userscript's tab lease, kept in `storage.session`; a tab
  whose lease looks stale because it is hidden is still sent to), which runs its cycle. With
  no such tab, the channel's next cycle stays due and starts when a tab for that channel
  opens. Follow-up checks run on the worker tab's own timer.
- **Autopilot is due (user request).** When an alarm fires and no Studio tab can run the
  cycle, the background shows one "Auto-pilot is due" notification for that cycle (per channel
  and `next`, remembered in `storage.local` as `apNotified`, which is not in the backup);
  clicking it opens Studio on that channel in a new tab. No notification for an alarm more
  than 60 s late (the computer slept or Chrome was closed past the cycle's time).
- **Notifications.** "Queue finished" goes through `chrome.notifications`. A click
  focuses the tab, and opens the panel if Chrome accepts the click as the user gesture
  `sidePanel.open()` needs (recorded in the manual check); the panel is asked for the Upload
  tab. The tab-title mark and the sound stay in the page.
- **Update check** (`lib/update-check.ts`, built in Phase 5). The background sends
  `GET https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest` each time
  it starts and on a daily alarm (`update-check`), but never more than once in 23 h. The
  request has `credentials: 'omit'`, no auth header and a 10 s limit. The answer is stored as
  `updateCheck` (`{ at, latest, url }`) in `storage.local`; it is not part of a backup. When
  `latest` is above the installed version the panel shows an "Update available" banner with
  a link, shown only if it is one of this repo's release pages (it starts with
  `https://github.com/TAEJK88/youtube-upload-presets/releases/` after the address is
  resolved). The banner has no dismiss and no off switch (decision P5-4). Any failure
  (offline, a 403 rate limit, a 404 with no release yet, an answer that is not a release of
  this extension) is a console warning only: no banner, the last good answer kept, and the
  next try a day later.
- **No in-memory state.** The service worker can be killed at any time; everything it
  needs is in storage.

## Side panel UI

- **Same content.** The drawer's tabs — Upload (with the schedule box), Presets, Copyright,
  Settings — with the same fields, actions and EN/TH strings as v4.27.1, the userscript
  commit `npm run ui-check` pins (it proves the strings). Backup/share stays inside Settings.
  The copyright pane's modals are views of the Copyright tab; claim and song tables are lists
  of cards. CSV files (claims, songs, upload history) are saved from the panel; the queue card
  shows "N song(s) previously claimed".
- **Built from shadcn/ui** components (Button, Tabs, Dialog, Switch, Input, Textarea, Badge,
  Progress, Sonner) copied into `components/ui/`, on Tailwind v4; native `<select>` and
  date-time inputs as in the drawer. The theme is defined as CSS variables carrying the black
  glass tokens from the current Design B. IBM Plex Sans Thai, 12px minimum text, the
  userscript's embedded Material Symbols Rounded icons, drawn as inline SVG paths (no icon
  font). A dark and a light theme, switched by a button at the top of the panel.
- **Visual differences from today:**
  - The panel is docked and resizable (Chrome's minimum is about 320px), not floating.
  - The see-through blur of Studio behind the panel is gone, and so is the opacity slider.
  - Changing the language re-renders instantly instead of reloading the page, everywhere:
    the panel, the Studio tab and www.youtube.com follow at once; the in-page quick-action
    bars pick it up the next time they appear. The userscript's "stop the queue first"
    refusal and its "the page reloads" note are gone.
  - `glass` / `glassV2` leave the settings: migration step 5 deletes them from stored
    settings (and from an imported userscript file; the backup schema stays 4).
- **FAB.** The drawer's FAB stays in Studio (channel, default preset, activity, drag to move)
  and opens the side panel, on the tab of the running task; an open panel switches to that
  tab (decision P5-row-tab-choice). It stays visible while the panel is open (decision
  P5-row-fab-visible). It no longer takes dropped files: the panel is the drop target.
  If `sidePanel.open()` turns out not to accept the FAB's click, the FAB is dropped and the
  toolbar icon / Alt+P are the way in.
- **Alt+P** opens the panel on a Studio tab: a manifest command (`_execute_action`, suggested
  Alt+P), plus the page's own shortcut when Chrome didn't assign the key. The panel is
  disabled on other tabs, so Alt+P does nothing there. Neither can close the panel.

## In-page UI

The quick-action buttons under Studio's title and description, the FAB, the page toast and
the reload banner are plain TS DOM inside a Shadow DOM root. They keep their current behavior
and look. The tracklist-fix dialog is not in the page: it is a view of the Copyright tab
(decision P4-17).

## Data migration from the userscript

Tampermonkey storage cannot be read by the extension. Users export JSON from the
userscript (Settings → Backup / share), then import it in the extension's Settings.
The import accepts the userscript's export format (format 1, as v4.26.1 to v4.28.0 write
it; a main preset the extension doesn't know, such as v4.28.0's `'v:<videoId>'`, falls back
to the first preset) and runs it through the existing `migrations` code before writing to
`chrome.storage.local`. An import is refused while any
Studio tab runs the queue ("Stop the queue before importing"); otherwise the queue survives
it (no page reload, so the userscript's "clear the queue first" guard is gone).

Per-channel copyright data is not in the backup (as in the userscript); the copyright
settings are. The claimed-songs history moves as a CSV: that import is lossy (titles, artists,
claimants and counts, not which video was which) and limited to 16 MB. The debug report
contains the copyright data and the lock state.

**The move file** (decision P5-8). The userscript's last version (v4.29.0) can export a
format-1 backup with one more field, `move`: `{ lang, uploads, channels }`. The extension
reads `move` only when the user answers **My file**. Upload-history rows are added to the
stored ones (a stored row wins; the newest 1000 are kept); a row needs a real date no later
than a day from now, a channel id and a file name, and rows without a video id are kept.
Channels need only a valid id; a known channel keeps its entry, unless it has no name and
the file's has one; an avatar is kept only as an `https:` link. `lang` (`th` or `en`)
replaces the panel's language, each time such a file is imported. Importing the same file
twice adds nothing twice.

**While the userscript is still on** (decisions P5-7, P5-7-save, P5-7-run-stop). The
extension sees the userscript by its root element `#ytp-root`, in Studio pages only. While
it is in a page, that tab starts no upload queue and no trim, ads or Collab run, takes the
automation lock for no copyright step (a tab that held it gives it back), does not press
Save or "Confirm changes" on a trim, and stops a queue found running after its current
video; the panel shows a banner with the reason (`QueueView.userscript`). Scans, the tick,
edits, settings and Stop are not held. Not covered: www.youtube.com (invite accept, channel
switch), and in Studio the manual fill, the quick-action bars, the multi-file intercept, the
invite page's accept and the switch recovery, the panel's `channel:switch` and
`fill:apply`, and the channel switch at the end of a Collab run whose invites were already
sent.

## Error handling

- **Extension reloaded or updated while a Studio tab is open.** The content script
  detects the invalidated context (`chrome.runtime.id` undefined) and shows a "Reload
  this tab" banner.
- **Bridge failures.** If a handle is missing, permission is denied or the file was moved
  or renamed, the item goes to `error` with that specific reason and **Retry**. A file whose
  read permission the user blocked ('denied') fails with "The browser blocked reading this
  file — remove it from the queue and add it again". While any
  waiting or failed item's file has lost read permission (after a browser restart), the
  panel shows one banner button, **Re-grant access (N files)**, that asks for every such
  file in one click.
- **MAIN world not answering.** A `getCfg` request times out after 10 s, a `youtubei`
  request after 30 s (the userscript's fetch had none); a timeout fails that call like any
  API error.
- **Studio markup drift.** The `SEL` / `TXT` tables and the "Copy upload dialog info"
  diagnostic are kept as they are.

## Testing

- **Runner and checks.** Vitest with WXT's `fakeBrowser`. `npm run check` runs
  `tsc --noEmit`, `vitest run`, `port-check` (ported code against the pinned userscript),
  `ui-check --coverage` (UI strings and the 12px floor) and `parity-check` (one row per
  item of the pinned userscript), and must pass before every release, as must
  `npm run release:check` (the zip, its manifest and files, the CHANGELOG, no `missing`
  parity row).
- **Ported tests.** The template, chapters, tracklist, migrations, collab, activity and
  details-host tests import modules directly. `test/harness.mjs` is deleted.
- **DOM tests.** `fake-dom.mjs`, `mock-studio.mjs` and `mock-invite.mjs` are kept as they
  are. `collab-dialog` and `invite-accept` tests import the real functions from their new
  modules.
- **New tests:**
  - importing a userscript export into extension storage;
  - `file-store` with `fake-indexeddb`;
  - the runner lock;
  - the MAIN-world request/response matching.
- **Real-Studio checklist** at the end of each phase:
  - 2 videos with a thumbnail and `.txt`;
  - scheduling;
  - collab invite;
  - invite accept and channel switch;
  - scan, trim and autopilot;
  - browser restart, then resume the queue.

## Rollout

The extension lives in `extension/` in this repo. The userscript stays at its current
path because Tampermonkey's `@updateURL` points at it, and it gets bug fixes only until
cutover.

| Phase | Deliverable | Exit check |
|---|---|---|
| 0. Spike | WXT scaffold; panel opens on Studio; MAIN-world `ytcfg` read; a 1 GB video dropped on the panel reaches Studio's upload dialog through the bridge; restart → re-grant works; FAB → `sidePanel.open()` tested | All proven, or the fallback below is taken |
| 1. Foundation | i18n, settings, storage, migrations, pure libs, ported tests, import from userscript JSON | `npm run check` green |
| 2. Page automation | SEL/TXT, automation, schedule, collab, invite/switch, quick actions, manual-fill, queue runner | Runner drives a real upload from a dev command |
| 3. Side panel | shadcn setup and theme; Upload (with bridge and the schedule box), Presets, Copyright placeholder, Settings (incl. Backup) | Upload checklist passes using only the panel |
| 4. Copyright | youtubei via MAIN world, scan, trim, autopilot on alarms, Copyright tab | Scan/trim/autopilot checklist passes |
| 5. Cutover | Parity checklist against v4.27.1 (`extension/PARITY.md`, `npm run parity -- --release`; decisions in `extension/scripts/parity/DECISIONS.md`); `npm run release:check` → zip → GitHub Release (published by the owner); the userscript's last version (v4.29.0) shows a "moved to the extension" notice and keeps working | Team on the extension |

**Permissions:** `sidePanel`, `storage`, `unlimitedStorage`, `alarms`, `notifications`. Host permissions:
`https://studio.youtube.com/*`, `https://www.youtube.com/*`, `https://api.github.com/*`.
`https://api.github.com/*` is used only by the update check.

## Risks (retired by the Phase 0 spike)

1. **Storage partitioning.** The bridge iframe is embedded in `studio.youtube.com` and has
   to see the same IndexedDB as the panel. Chrome partitions third-party iframe storage,
   and an exemption for extension frames on sites with host permission is expected but
   not verified. **Fallback:** files come in through a drop target on the Studio page
   (the content script owns them, as today), the queue no longer survives reloads, and
   the rest of this design is unchanged.
2. **Permission re-grant after restart.** `requestPermission()` from a panel click must
   restore read access for handles that the bridge then uses.
3. **MAIN world timing.** `ytcfg` must be readable by the time the content script asks,
   at `document_idle`.
4. **WXT is 0.x.** The version is pinned exactly; upgrades are deliberate.

## Out of scope

- A visual redesign beyond the move to shadcn components and the side panel.
- Chrome Web Store publishing.
- Firefox, Safari and other browsers.
- Playwright end-to-end tests against live Studio.
