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

A Manifest V3 Chrome extension with feature parity with v4.26.1, built from real
modules, with the main UI in Chrome's Side Panel. The userscript keeps working until
the extension reaches parity.

## Decisions

| Topic | Decision |
|---|---|
| Audience | Me and my team. Unpacked zip from GitHub Releases, no Chrome Web Store |
| Main UI | Chrome Side Panel |
| Migration | Port first (logic unchanged, split into modules), improve afterwards |
| Framework | WXT (pinned exact version), TypeScript, npm, Node 22 |
| Side panel UI | React 19 + Tailwind v4 + shadcn/ui, themed with black glass tokens, Material Symbols Rounded icons |
| In-page UI | Plain TS DOM inside Shadow DOM (quick actions, tracklist-fix dialog, FAB). No React in content scripts |
| File intake | Drop on the Side Panel; files reach Studio through an extension-origin bridge iframe |
| Tests | Vitest + WXT `fakeBrowser`; existing fake-dom mocks kept |

## Architecture

```
┌──────────── Side Panel (React + shadcn) ────┐      ┌── Background SW ──┐
│ Queue · Schedule · Presets · Settings ·     │◄────►│ chrome.alarms     │
│ Copyright                                   │ msgs │ (autopilot),      │
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
| `lib/claims/*`, `lib/studio/trim.ts`, MAIN-world youtubei | 4521–end | content + MAIN |
| `entrypoints/sidepanel/tabs/Copyright.tsx` | copyright UI in 4521–end | panel |
| `lib/messages.ts` | new | all |
| `lib/file-store.ts` | new | panel, bridge |

### GM replacements

| Userscript | Extension |
|---|---|
| `GM_getValue` / `GM_setValue` | `chrome.storage.local` (same keys and per-channel `key:channelId` layout) |
| `GM_addStyle` | Bundled CSS (Tailwind in the panel, Shadow DOM styles in the page) |
| `GM_setClipboard` | `navigator.clipboard` in the panel; the page sends data to the panel to copy |
| `GM_notification` | `chrome.notifications` from the background |
| `unsafeWindow` | MAIN-world content script |
| `GM_info` | `chrome.runtime.getManifest()` |
| Google Fonts link | IBM Plex Sans Thai and Material Symbols Rounded bundled in the extension |

## File intake (drop on the Side Panel)

`File` objects cannot travel over `chrome.runtime` messaging, and Studio's upload input
needs a real `File` inside the Studio tab (`DataTransfer` injection, current line 1543).

1. **Drop.** The panel's drop handler calls `DataTransferItem.getAsFileSystemHandle()` for
   every video, thumbnail and `.txt`. Handles go into extension IndexedDB as
   `{itemId → handle}` (`lib/file-store.ts`). Queue metadata (preset, title, schedule,
   pairing by base name) goes into `chrome.storage.local`. `.txt` contents are read in
   the panel at drop time (UTF-8, falling back to windows-874 as today) and stored with
   the item.
2. **Bridge.** `studio.content.ts` mounts a hidden `file-bridge.html` iframe. It has the
   same origin as the panel, so it sees the same IndexedDB.
3. **Fetch.** When the runner reaches an item, it asks the bridge for `itemId`. The bridge
   calls `handle.getFile()` and `postMessage`s the `File` to the content script
   (structured clone passes a reference, not a copy). The existing `DataTransfer`
   injection runs unchanged.
4. **Reload and restart.** Handles persist, so the queue survives tab reloads and channel
   switches. After a browser restart, read permission may go back to `prompt`. The panel
   then shows one **Re-grant access (N files)** button, which calls `requestPermission()`
   on a user click. One grant covers the extension origin, and the queue resumes.
5. **Cleanup.** A handle is deleted when its item is done or removed from the queue.

The rule "don't change pages or channels while the queue has files" goes away once
step 4 works.

## Messaging

All message types live in `lib/messages.ts`, built on `@webext-core/messaging`.

- **Panel → page:** `queue:start`, `queue:stop`, `queue:edit`, `queue:remove`,
  `claims:scan`, `claims:trim`, `claims:autopilot`, `diag:dialogInfo`.
- **Page → panel:** `queue:state` and `claims:state` broadcasts (live runner state:
  current item, step, progress percentage).
- **Persistent state** (settings, presets, upload history, queue metadata, per-channel
  claims data) is read and written through `chrome.storage.local`. Both sides react to
  `storage.onChanged`.
- **Target tab.** The panel binds to the active Studio tab in its window. On a
  non-Studio tab it shows "Open YouTube Studio".
- **One runner at a time.** A `storage.session` lock `{runnerTabId}` stops two Studio
  tabs from running queues at once. The lock is released when the runner stops or when
  its tab closes (`tabs.onRemoved` in the background).
- **Content ↔ MAIN world.** `window.postMessage` on a fixed channel name
  (`ytup:main`). Requests carry an id; responses echo it. The MAIN script answers only
  `getCfg` and `youtubei`, and ignores any message whose `source` is not `window` or
  whose shape doesn't match.

## Background

- **Side panel.** `sidePanel.setOptions({ tabId, enabled })` turns the panel on for
  `studio.youtube.com` tabs only. The toolbar icon opens it.
- **Autopilot.** One `chrome.alarms` alarm per channel, named `ap:<channelId>`, with the
  period from `apEveryHours`. When it fires, the run starts in an open Studio tab for
  that channel. If no such tab exists, the channel is marked `due` in storage, and the
  run starts the next time that channel opens in Studio.
- **Notifications.** "Queue finished" goes through `chrome.notifications`. A click
  focuses the tab and opens the panel. The tab-title mark and the sound stay in the page.
- **Update check.** Once a day, the background fetches the latest GitHub release of
  `TAEJK88/youtube-upload-presets` and compares versions. If a newer one exists, the
  panel shows an "Update available" banner linking to the release.
- **No in-memory state.** The service worker can be killed at any time; everything it
  needs is in storage.

## Side panel UI

- **Same content.** Same tabs (Queue, Schedule, Presets, Settings, Copyright), the same
  fields, actions and EN/TH strings as v4.26.1. Backup/share stays inside Settings.
- **Built from shadcn/ui** components (Button, Tabs, Dialog, Popover, Calendar, Select,
  Switch, Input, Textarea, ScrollArea, Tooltip, Badge, Progress, Sonner) on Tailwind v4.
  The theme is defined as CSS variables carrying the black glass tokens from the current
  Design B. IBM Plex Sans Thai, 12px minimum text, Material Symbols Rounded icons.
- **Visual differences from today:**
  - The panel is docked and resizable (Chrome's minimum is about 320px), not floating.
  - The see-through blur of Studio behind the panel is gone, and so is the opacity slider.
  - Changing the language re-renders instantly instead of reloading the page.
- **FAB.** A small FAB stays in Studio as a shortcut to open the panel, if the Phase 0
  spike shows `sidePanel.open()` can be triggered from a page click. If it can't, the
  FAB is dropped and the toolbar icon is the only way in.

## In-page UI

The quick-action buttons under Studio's title and description, the tracklist-fix dialog
and the FAB are plain TS DOM inside a Shadow DOM root. They keep their current behavior
and look.

## Data migration from the userscript

Tampermonkey storage cannot be read by the extension. Users export JSON from the
userscript (Settings → Backup / share), then import it in the extension's Settings.
The import accepts the v4.26.1 export format and runs it through the existing
`migrations` code before writing to `chrome.storage.local`.

## Error handling

- **Extension reloaded or updated while a Studio tab is open.** The content script
  detects the invalidated context (`chrome.runtime.id` undefined) and shows a "Reload
  this tab" banner.
- **Bridge failures.** If a handle is missing, permission is denied or the file was moved
  or renamed, the item goes to `error` with that specific reason and a **Re-pick file**
  action.
- **MAIN world not answering.** A `youtubei`/`getCfg` request times out after 10 s and
  surfaces as a scan error, as API failures do today.
- **Studio markup drift.** The `SEL` / `TXT` tables and the "Copy upload dialog info"
  diagnostic are kept as they are.

## Testing

- **Runner and checks.** Vitest with WXT's `fakeBrowser`. `npm run check` runs
  `tsc --noEmit` and `vitest run`, and must pass before every release.
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
| 3. Side panel | shadcn setup and theme; Queue (with bridge), Schedule, Presets, Settings (incl. Backup) | Upload checklist passes using only the panel |
| 4. Copyright | youtubei via MAIN world, scan, trim, autopilot on alarms, Copyright tab | Scan/trim/autopilot checklist passes |
| 5. Cutover | Parity checklist against v4.26.1; `wxt zip` → GitHub Release; last userscript version shows a "moved to the extension" notice | Team on the extension |

**Permissions:** `sidePanel`, `storage`, `alarms`, `notifications`. Host permissions:
`https://studio.youtube.com/*`, `https://www.youtube.com/*`, `https://api.github.com/*`.

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
