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
| Side panel UI | React 19 + Tailwind v4 + shadcn/ui-style components, themed with black glass tokens, the userscript's Material Symbols Rounded paths as inline SVG (no icon font) |
| In-page UI | Plain TS DOM inside Shadow DOM (quick actions, tracklist-fix dialog, FAB). No React in content scripts |
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
| Google Fonts link | IBM Plex Sans Thai bundled in the extension; Material Symbols Rounded paths embedded as inline SVG |

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
step 4 works.

## Messaging

All message types live in `lib/messages.ts`, built on `@webext-core/messaging`.

- **Panel → page (the Studio tab):** `queue:add`, `queue:preflight`, `queue:start`,
  `queue:stop`, `queue:retry`, `queue:remove`, `queue:clearDone`, `queue:view`,
  `queue:edit`, `channel:switch`, `fill:apply`, `diag:dialogInfo`. Phase 4 adds
  `claims:scan`, `claims:trim`, `claims:autopilot`.
- **Page → panel:** `queue:state` broadcasts the live runner state (running, stopping,
  progress, a revision number, the channel) and `queue:toast` the page's toasts. The panel
  doesn't take the queue from them: a `queue:state` whose revision changed, a storage
  change or a minute's timer makes it ask its tab for `queue:view` again. Phase 4 adds
  `claims:state`.
- **Page → background:** `openPanel`, `ensureMigrated`, `files:delete`, `notify`,
  `runner:acquire`, `runner:release`, `runner:elsewhere`, `store:patch`. **Panel →
  background:** `store:patch`, `backup:write`. `files:delete`, `store:patch` and
  `backup:write` are refused from senders that may not write (`mayWrite`).
- **Persistent state** (settings, presets, upload history, queue metadata, per-channel
  claims data) is read and written through `chrome.storage.local`. Both sides react to
  `storage.onChanged`.
- **One writer for settings and counters.** The background is the only writer of
  `settings` and `counters`: the panel and the Studio tabs send `store:patch` (a diff), and
  the background applies patches one at a time, so two writers never lose each other's
  change. An import goes through `backup:write` the same way. `presets` and `activeId` are
  written whole by the panel (plus Alt+1…9 in Studio); `channels` is read-modify-written by
  the page's channel memory and the panel's channel list, as the userscript did across tabs.
- **Target tab.** The panel binds to the active Studio tab in its window. The background
  enables the panel on Studio tabs only, so there is no "Open YouTube Studio" screen; when the
  Studio tab has no live content script (opened before the extension loaded or reloaded), the
  panel shows **Reload this tab**.
- **One runner at a time.** A `storage.session` lock `{runnerTabId}` stops two Studio
  tabs from running queues at once. The lock is released when the runner stops or when
  its tab closes (`tabs.onRemoved` in the background).
- **Stop goes to the lock holder.** The panel's Stop is sent to the tab that holds the
  runner lock, which may not be the panel's own tab. When it isn't, the panel names the tab
  that will stop ("Will stop the queue in the tab "…" after the current video finishes").
  The panel shows toasts from its own tab only (plan 3b D14).
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
  focuses the tab, and opens the panel if Chrome accepts the click as the user gesture
  `sidePanel.open()` needs (recorded in the manual check). The tab-title mark and the sound stay in the page.
- **Update check.** Once a day, the background fetches the latest GitHub release of
  `TAEJK88/youtube-upload-presets` and compares versions. If a newer one exists, the
  panel shows an "Update available" banner linking to the release. Built in Phase 5, with
  the GitHub Releases it checks.
- **No in-memory state.** The service worker can be killed at any time; everything it
  needs is in storage.

## Side panel UI

- **Same content.** The drawer's tabs — Upload (with the schedule box), Presets, Copyright,
  Settings — with the same fields, actions and EN/TH strings as v4.27.1, the userscript
  commit `npm run ui-check` pins (it proves the strings). Backup/share stays inside Settings.
- **Built from shadcn/ui** components (Button, Tabs, Dialog, Switch, Input, Textarea, Badge,
  Progress, Sonner) copied into `components/ui/`, on Tailwind v4; native `<select>` and
  date-time inputs as in the drawer. The theme is defined as CSS variables carrying the black
  glass tokens from the current Design B. IBM Plex Sans Thai, 12px minimum text, the
  userscript's embedded Material Symbols Rounded icons, drawn as inline SVG paths (no icon
  font). Dark only.
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
  and opens the side panel. It no longer takes dropped files: the panel is the drop target.
  If `sidePanel.open()` turns out not to accept the FAB's click, the FAB is dropped and the
  toolbar icon / Alt+P are the way in.
- **Alt+P** opens the panel on a Studio tab: a manifest command (`_execute_action`, suggested
  Alt+P), plus the page's own shortcut when Chrome didn't assign the key. The panel is
  disabled on other tabs, so Alt+P does nothing there. Neither can close the panel.

## In-page UI

The quick-action buttons under Studio's title and description, the tracklist-fix dialog
and the FAB are plain TS DOM inside a Shadow DOM root. They keep their current behavior
and look.

## Data migration from the userscript

Tampermonkey storage cannot be read by the extension. Users export JSON from the
userscript (Settings → Backup / share), then import it in the extension's Settings.
The import accepts the v4.26.1 export format and runs it through the existing
`migrations` code before writing to `chrome.storage.local`. An import is refused while any
Studio tab runs the queue ("Stop the queue before importing"); otherwise the queue survives
it (no page reload, so the userscript's "clear the queue first" guard is gone).

## Error handling

- **Extension reloaded or updated while a Studio tab is open.** The content script
  detects the invalidated context (`chrome.runtime.id` undefined) and shows a "Reload
  this tab" banner.
- **Bridge failures.** If a handle is missing, permission is denied or the file was moved
  or renamed, the item goes to `error` with that specific reason and **Retry**. While any
  waiting or failed item's file has lost read permission (after a browser restart), the
  panel shows one banner button, **Re-grant access (N files)**, that asks for every such
  file in one click.
- **MAIN world not answering.** A `youtubei`/`getCfg` request times out after 10 s and
  surfaces as a scan error, as API failures do today.
- **Studio markup drift.** The `SEL` / `TXT` tables and the "Copy upload dialog info"
  diagnostic are kept as they are.

## Testing

- **Runner and checks.** Vitest with WXT's `fakeBrowser`. `npm run check` runs
  `tsc --noEmit`, `vitest run`, `port-check` (ported code against the pinned userscript)
  and `ui-check --coverage` (UI strings and the 12px floor), and must pass before every
  release.
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
| 5. Cutover | Parity checklist against v4.26.1; `wxt zip` → GitHub Release; last userscript version shows a "moved to the extension" notice | Team on the extension |

**Permissions:** `sidePanel`, `storage`, `unlimitedStorage`, `alarms`, `notifications`. Host permissions:
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
