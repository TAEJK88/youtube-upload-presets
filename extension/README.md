# YouTube Upload Presets — Chrome extension (in progress)

Replaces the Tampermonkey userscript in the repo root. Design:
`docs/superpowers/specs/2026-10-05-chrome-extension-design.md`.

## Develop

```sh
cd extension
npm install
npm run dev      # builds, opens Chrome with the extension, reloads on change
npm run check    # tsc + vitest + port-check + ui-check --coverage — run before every commit
npm run build    # .output/chrome-mv3 → chrome://extensions → Load unpacked
```

Ported code is checked against the userscript at the pinned commit (v4.27.1, `d15ef87`):
`npm run port-check` (configs in `scripts/port/`; `node scripts/port-check.mjs --print <name>`
prints the code a port starts from).

The side panel (`entrypoints/sidepanel/`, React + Tailwind v4 + `components/ui/`) talks to the
Studio tab active in its window: it asks for a `QueueView` and sends `queue:*` messages; it
never touches Studio's DOM. Logic the panel needs lives in `lib/panel/` (unit-tested).
`npm run ui-check` proves every shipped UI string is one of the userscript's `L()` pairs (or
is listed with a reason in `scripts/strings/extension-only.mjs`) and that no text is below 12px;
with `--coverage` (as in `npm run check`), also that every pair of the userscript's drawer and
copyright module is used by some `L()` call in the extension's shipping code or listed with a reason in
`scripts/strings/dropped.mjs`. "Used" is not "shown in the panel": a pair kept alive only by
page-side code (the FAB, page toasts) or by dead code passes too.
`tests/panel-i18n.test.tsx` renders the whole panel (every tab, card state, question and banner),
the FAB and the reload banner in Thai, and fails on any English pair and on any Latin word
outside its short, commented allowlist and the presets' own text (whole pieces of a label,
title, description line or tag, and their artist names; not their words on their own).
`settings` and `counters` have one writer, the background (`store:patch`, `lib/store-writer.ts`);
the copyright data has the same writer (`claims:op`).
Console lines from the extension start with `[ytup]`.

## Layout

- `entrypoints/` — background, content scripts (`studio.content.ts` isolated, `studio-main.content.ts` MAIN world), side panel, file-bridge iframe
- `lib/` — logic ported from the userscript; pure modules are unit-tested
- `lib/studio/` — page automation ported from the userscript (`port-check` keeps it honest);
  `page-ui.ts` is the seam between the runner and any UI
- `entrypoints/invite.content.ts` — www.youtube.com: channel switcher and invite accept
- `lib/studio/txt.ts`, `lib/studio/sel.ts` — the `TXT` / `SEL` tables (see the root README)
- `lib/claims/` — the copyright module ported from the userscript (`claims.ts`, port-checked); its
  data: per-channel keys, one writer (`claims:op` in the background)
- `lib/claims/alarms.ts` — Auto-pilot's alarms in the background (one per channel at its next
  cycle) and the "Auto-pilot is due" notification
- `lib/main-youtubei.ts` — Studio's `/youtubei/v1` calls, run in the MAIN world
- `entrypoints/sidepanel/` — the side panel (React); `lib/panel/` — its logic; `components/ui/` — shadcn-style components
- `scripts/ui-check.mjs`, `scripts/strings/` — strings parity with the userscript, 12px floor
- `tests/*.test.mjs` — tests ported from `../test/` (bodies unchanged); `tests/*.test.ts` — new tests

## Licences

`public/THIRD-PARTY-NOTICES.txt`, packaged as `THIRD-PARTY-NOTICES.txt` in the build, has the
bundled IBM Plex Sans Thai font (SIL OFL 1.1), the embedded Material Symbols Rounded icon paths
(Apache 2.0) and the npm packages in the bundle (React, Radix, Sonner, Tailwind's CSS and the
rest, mostly MIT), each with its licence text taken from its `node_modules` package.

The package list is kept by hand. It was taken from the build's source maps; after adding or
upgrading a runtime dependency, build with `build.sourcemap` on and list the `node_modules`
packages in the maps' `sources` (Vite strips the licence comments from the minified scripts).

## Moving from the userscript

In the userscript: Settings → Backup / share → Export. Import that file in the extension
(Settings → Back up / share settings → Import). Upload history and per-channel copyright data
(claim scans, trim results, follow-up trims, Auto-pilot on/off) aren't part of the backup, as in
the userscript; the copyright settings are. After moving: rescan each channel and turn Auto-pilot
on again; let pending follow-up trims finish in the userscript before switching. The
claimed-songs history can come along as a CSV (userscript: Claimed songs → ⬇ CSV; extension:
Copyright → Claimed songs → ⬆ Import CSV), but the CSV keeps only titles, artists, claimants,
counts and the first channel, not which video was which: imported songs count their videos by
title, and a rescan adds the real videos beside them, so a song's "claimed in N videos" can
count a video twice. The import takes a file of up to 16 MB.

## CSV exports

The Copyright tab's CSV files (claims, claimed songs, upload history) are written as the
userscript wrote them: every cell quoted, nothing else changed. A video or song title that
starts with `=`, `+`, `-` or `@` is therefore read as a formula by Excel or Google Sheets. The
titles come from YouTube, so open these files as text, or with formulas off, if a channel's
titles aren't yours. The cells are left alone on purpose: the claimed-songs CSV is also the
file the extension imports, and a changed cell would come back as a different song.

## Debugging

When something goes wrong, open the **debug page**. It works without a Studio tab and with a
broken background:

- from the panel: Settings → Troubleshooting → **Open debug page**;
- from an error screen: the panel shows the error with **Copy details**, **Open debug page** and
  **Reload panel** instead of going blank (also when it is still waiting for the background
  after 8 s), and a tab that fails to render has an **Open debug page** link;
- or type `chrome-extension://<id>/debug.html` in the address bar (the id is on
  `chrome://extensions`, or in the debug page's Overview).

What it shows: the version, id, permissions, browser and data schema, and whether the background
answers (Overview); the error log of every part of the extension (background, panel, Studio and
youtube.com pages, file bridge, debug page; newest first, filterable, each entry's stack on a
click; it follows new entries live, and **Clear log** empties it); every stored key with its
size and value, and under `storage.session` the automation lock (`runnerTabId`), what it is held
for (`runnerJobs`) and the copyright worker of each channel (`claimsWorkers`), and under
`storage.local` the Auto-pilot cycles already notified (`apNotified`); the open Studio
tabs and whether each one's page script answers; the stored file handles and whether the queue
uses them. It changes nothing except **Clear log**.

To send a report: **Copy diagnostic report** (paste it into a message) or **Download report
(.json)** (attach the file). The report holds every section above and the last 300 log entries.
It contains everything the extension stores: your presets and settings, the queue (video
titles, descriptions, tracklists and file names), the upload history, the copyright data (claim
scans, the trim list and the claimed-songs history: video and song titles, artists and
claimants), channel ids, names and avatar links, and the stored file names; the open Studio tabs' titles and URLs (with channel and
video ids); and log messages, which can quote titles. It contains no files and no sign-in data
(no cookies, tokens or YouTube auth headers: the extension never stores or logs them). Look it
over before sending it outside your team. The log keeps the newest 300 entries in
`chrome.storage.local` (`debugLog`), dropping info lines before warnings and errors; a line
repeated back to back is kept once, shown with ×N. It is not part of a settings backup; nor is
`apNotified`. Errors inside Studio's page-world script
(`studio-main`) are not captured (it has no extension APIs): see Studio's DevTools console.

## Exit checks (manual, in Chrome)

Needs the logged-in Chrome profile, with **the userscript disabled in Tampermonkey**. Use a test
channel.

### Before you start: load or update the build

Do this every time the build folder is new or was replaced (`npm run build` writes
`.output/chrome-mv3`), in this order:

1. Close the side panel in every Chrome window. Do not open it again until step 4.
2. `chrome://extensions` → the extension's card → the round **reload** arrow. (First time: turn
   on **Developer mode**, **Load unpacked**, pick the build folder.)
3. Reload **every** open YouTube Studio tab and every open youtube.com tab (or close them and
   open new ones).
4. Now open the side panel.

Why the order matters: the side panel reads its files from the folder each time it opens, but
the background and the scripts inside the tabs keep running the old build until steps 2 and 3.
A panel opened too early is a new panel talking to old scripts: it can show an error screen
instead of the panel, an empty Copyright tab, or "This tab is not connected to the extension
yet — reload this tab". Nothing it shows then can be trusted. If that happens, close the panel
and do steps 2 to 4 again.

### How to write the results down

In Studio's DevTools, filter the console by `[ytup]` (the ported code also logs `[YT Presets]`
and `[YT Upload Presets]`). Write down pass or fail for each item; any failure blocks the next
phase.
Items marked **record** ask for an observation; write down what happened.
Settings are changed in the panel's Settings tab (no DevTools snippets any more).
The panel's own console: right-click inside the panel → Inspect.

### The panel

1. **Where it opens.** The toolbar icon opens the panel on a Studio tab; on example.com the
   panel is not available (it is enabled on Studio tabs only).
   - `chrome://extensions/shortcuts` lists **Alt+P** for the extension. **Record** whether
     Chrome assigned it on install; assign it if it was left empty.
   - Alt+P through the manifest command opens the panel on a Studio tab. On a non-Studio tab
     it does nothing (the panel is disabled there).
   - The page's own Alt+P (the fallback, through the background): unassign the command in
     `chrome://extensions/shortcuts`, click into Studio, press Alt+P. **Record** whether the
     panel opens (the gesture may be lost on the way to the background). Reassign Alt+P.
   - Neither Alt+P closes the panel.
2. **Look.** Black glass, Thai and English text in IBM Plex Sans Thai, nothing smaller than
   12px, icons on tabs and section headings. Tabs: Upload · Presets · Copyright · Settings; the
   Copyright tab shows the status card and Scan claims, then Claim list, Claimed songs, Fix
   tracklist and Upload history, and the activity log under "Show activity ▾"; since Phase 4b
   also Ads off, Collab, Stop (while something runs), the Auto-pilot switch and Copyright
   settings (items 46 to 74).
3. **Language.** Settings → General → Language / ภาษา → ไทย: the whole panel switches at once,
   without a reload, with no English left. The next toast from Studio is Thai too. Switch
   back to English.
4. **Channel bar.** Shows the Studio tab's channel (avatar, name, `UC…` id, green dot).
   **Lock channel** → toast "Locked to channel "…". Uploads will be blocked on other channels".
   Switch Studio to another channel: the bar turns red with "Currently on channel … but locked
   to …", the dot is red, Start reads "Channel does not match the locked one". **Locked** →
   "Channel unlocked".
5. **Channel list** (the ⇄ button). The current channel says "· this tab"; **New tab** opens
   the same Studio page on it. Another channel's **Switch** goes through the channel switcher
   (console `switch: looking for @…`, `switch: switching to @…`) and lands in Studio on that
   channel — for an owned channel and for a channel you only manage (extra `switch: confirming
   the manager-channel notice`).
   - **Record** that the panel closes while the tab is on www.youtube.com (the panel is
     disabled there) and that the toolbar icon / Alt+P open it again once back in Studio.
   - During a run, Switch toasts "Upload queue is still running — switching channels now would
     stop it". With files queued but nothing running, Switch is allowed and the queue survives.
   - Add a channel by `UC…` id or link; `@handle` toasts "No channel ID found (starts with UC,
     24 characters)"; ✕ removes one.
6. **Reload this tab.** With a Studio tab open, reload the extension in `chrome://extensions`.
   Within about a second the page shows "The extension was updated or reloaded — reload this
   tab to keep using it" and the FAB goes away; the panel on that tab shows "This tab is not
   connected to the extension yet — reload this tab". Either button reloads the tab, and the
   panel works again.
7. **FAB.** Bottom right in Studio: the channel and the default preset; the badge shows how
   many videos wait. Drag it elsewhere and reload: it stays there. Click it with the panel
   closed: **record whether the side panel opens.** If Chrome refuses the gesture, copy the
   console error (`[ytup] openPanel …`); the fallback is plan 3b D16: delete the `mountFab`
   lines in `entrypoints/studio.content.ts` and record that the FAB was dropped. During a run
   the badge shows the upload icon and the percentage, with a line along the bottom; with a
   channel-lock problem it turns red.
8. **In-Studio navigation.** Move between Studio pages (Dashboard → Content → a video's
   details) with the panel open. The panel may show its loading state briefly, but the "not
   connected" banner never flashes during the ~2 s grace after a navigation (N5). **Record**
   any flash.

### Uploading (Phase 2's checks, now from the panel)

9. **Real upload, end to end.** Drag `Clip 1.mp4`, `Clip 1.txt` (3-line tracklist from
   `0:00`), `Clip 1.jpg` (under 2 MB) and `Clip 2.mp4` onto the panel: the frame "Drop to add
   to the queue" appears; two cards appear with their titles and EP numbers at once (not
   after a later refresh); Clip 1 shows "Clip 1.txt · 3 lines", "3 chapters" and the thumbnail
   (preview and "Thumbnail · … MB"). **Start**: the summary dialog shows the channel (avatar,
   name, id), "Videos 2", "Release Per preset (PRIVATE)", "No .txt 1 video(s)"; confirm.
   Expected: Studio opens the upload dialog itself; title, description and tags fill in; Clip 1
   gets its thumbnail; Monetisation, Ad suitability and Visibility follow the settings; Save is
   clicked; the card turns Done; Clip 2 runs. The activity bar shows "Uploading 1/2" with its
   upload icon and a percentage, and the running card a progress bar; the Start button's play
   icon spins while running; the tab title shows `(1/2) ⬆`, then `✅` if the tab isn't focused.
   A desktop notification "Upload finished ✅" appears when the panel is closed or the tab
   unfocused; clicking it focuses the tab. Both videos are in Content.
   - **Bridge diagnostics (record).** In Phase 0 the bridge iframe was missing from the DOM
     after load. Write down the `[ytup] file bridge:` lines the console shows: expected `#1
     mounted (readyState …)`, `#1 loaded, connect sent`, `#1 connected (ack after … ms)`; note
     any `#1 removed from the DOM by the page …` or `#1 dropped (…)`.
10. **Picking.** A click anywhere on the drop zone opens a multi-file picker; picked files are
    added. From the keyboard, Tab reaches "or click to select files" and "pick a whole folder",
    and Space or Enter opens each picker. "pick a whole folder": a folder with a `Covers/`
    subfolder adds the videos with their `.txt` and images paired by name; hidden files
    (`.DS_Store`) are skipped. Cancelling a picker is silent. Drop a folder of 30+ files on
    the panel: everything is added, with one toast. With the Presets tab open, drop a video
    anywhere on the panel: the panel switches to the Upload tab and the card appears there.
11. **Card edits.** Expand a card: edit the title (the counter follows; ↻ regenerates it);
    change its preset (the title follows); type artists, then clear them (back to "auto from
    .txt"); with scheduling on, type a release time into its date-time field (nothing resets
    it to the queue time while you type; it saves once complete, "Manual"; ↻ goes back to
    "Queue"); move cards up and down (EP numbers / times follow); **Apply to all**; **Expand
    all / Collapse all**. Drop a `.txt` or an image on a waiting card: it attaches; drop a
    video on a card: it goes to the queue. **Attach .txt / thumbnail** opens a picker. ✕ on
    the `.txt` and thumbnail chips removes them. A tracklist starting at `0:05` shows
    "Tracklist: 1 problem(s)" and **Fix tracklist**, which toasts "Tracklist fixed: …".
12. **Two idle Studio tabs.** Open Studio in windows A and B (nothing running). In A's panel
    edit a card's title; in B's panel change the default preset's title template. A's
    edited title survives (no lost update); the other cards follow the new template.
    - **Two windows' edits both survive.** Queue 2 clips. Edit clip 1's title in A's panel and,
      as close to the same moment as you can (within about a third of a second), set clip 2's
      artists in B's panel. Both edits are in both panels afterwards; neither window's save
      replaced the other's.
13. **Scheduling (the schedule box).** Switch "Schedule releases" on: the first release is
    tomorrow 19:00.
    - Quick picks fill "First video releases":
      - "Next 18:00" at least 15 minutes before 18:00 (e.g. at 17:40): today 18:00. Less
        than 15 minutes before it, or later (e.g. at 17:50): tomorrow 18:00. "Next 20:00" the
        same around 20:00.
      - "Tomorrow 19:00": tomorrow 19:00, whatever the time.
      - "Within 1 hr": an hour from now, rounded up to the quarter hour (at 14:07: 15:15).
    - Type into the date-time field: it isn't reset while focused. Typing a year digit by
      digit (partial years, M4) and clearing one segment save `''` and the summary reads
      "Pick the first video's release time", as the userscript did.
    - "Every": leave it blank, then 0 (M3): 1 is saved; the field shows what you typed until
      the stored value changes (as the userscript's `oninput`).
    - The header click folds and unfolds the box; a click on the switch only toggles the
      switch. From the keyboard, Tab to the header shows a visible focus outline, and Enter or
      Space folds it.
    - Set every 1 day. Cards show their release times; the summary reads "… → … · every 1
      days". Start 2 clips: they are scheduled one day apart, and afterwards the box's first
      release has moved to the slot after the last one.
    - Set a time in the past: the box gets an amber border and a note says when the queue will
      start instead; **Use this time** stores it. Clear the time: the border and note go.
14. **Reload survival.** Queue 2 clips and reload the Studio tab before Start: the queue is still
    there, Start works (the files come through the bridge again).
15. **Interrupted run.** Start 2 clips and reload Studio while the first uploads: that card comes
    back as an error, "The page reloaded during the upload — …". **Retry** with a draft id asks
    "This video is already in Studio"; **Open draft** opens it in Studio in a new tab; "Deleted
    it, upload again" puts it back in the queue.
16. **Browser restart, then re-grant.** Queue 2 clips (one with a thumbnail), quit Chrome fully,
    reopen Studio and the panel: the banner "Files in the queue need read access again after a
    browser restart" with **Re-grant access (N files)**; the card's thumbnail preview is gone.
    - **Start while Re-grant is showing.** Before clicking Re-grant: Start is disabled (greyed
      out, nothing happens on click), in this window's panel and in any other window's panel
      on a Studio tab. Force it: inspect the panel, delete the Start button's `disabled`
      attribute in Elements, click Start (and confirm the summary if it shows).
      Studio and the panel toast "The queued files need read access again — click "Re-grant
      access" in the side panel, then start again"; nothing runs and every card stays
      waiting (none turns to an error, none shows "No permission to read this file").
    - Click Re-grant. **Record** how many permission prompts one click shows, and whether one
      click granted all files (if the banner stays with fewer files, click again).
    - Afterwards the banner is gone, Start is enabled again, and the card's thumbnail preview
      is back without closing or reopening the panel. Start: they upload.
    - Repeat with 3+ files from a dropped folder and block one prompt by clicking **Don't allow** (Esc usually
      only dismisses it, which leaves the file at 'prompt' and Start disabled). The banner
      stays with that one file (**Record** whether its button then does nothing), but Start is
      enabled: Start waits only on files the run will read whose access went back to
      'prompt'. Start: the blocked file's item fails with "The browser blocked reading this
      file — remove it from the queue and add it again", the others upload. **Record**
      whether clicking Re-grant afterwards can unblock it (if it can, that error's advice is
      more than needed).
    - Start ignores files the run won't read. With one error card left from an earlier run
      (its file still needs a grant) and the waiting clips granted, Start is enabled while
      the banner still counts the error card's file. With Settings → thumbnails off, a
      waiting clip's thumbnail that needs a grant doesn't disable Start; with thumbnails on
      it does.
17. **Start, confirm and refuse.**
    - Settings → **Confirm channel name before starting the queue** on: the summary dialog
      shows; Enter or "Upload N video(s)" starts; Esc, a click outside or Cancel starts nothing.
    - With it off and no warnings, Start starts at once with no dialog.
    - Click Start, and while the summary is open edit a card's title, then confirm: "The queue
      changed after you confirmed — click Start again to see the new summary".
    - **Another window changes something.** Open Studio in windows A and B. Click Start in A
      and leave the summary open. In B's panel switch "Schedule releases" (or change the
      default preset's visibility), then confirm in A: "Settings or presets changed after you
      confirmed — click Start again to see the new summary". Again with a card: with A's
      summary open, change a waiting card's preset or release time in B (or attach a `.txt` or
      a thumbnail to it), then confirm in A: "The queue changed after you confirmed — …".
      Nothing runs either time; a second Start shows the new summary and runs.
    - **Record**: with the summary open, switch the browser to another Studio tab (the panel
      rebinds), then confirm: whether any refusal is shown.
    - The footer's look: the disabled Start subtitle is readable; the Stop icon's hover colour
      is red; the play icon doesn't look broken while disabled.
18. **One runner, and Stop from anywhere.** Open Studio in tabs A and B. Start in A. On B, the
    panel shows "Another Studio tab is running the queue — change the queue there" with **Go to
    that tab**; Start is disabled, Stop is enabled; adding, removing, retrying or clearing from
    B toasts the same refusal. **Stop** in B's panel toasts "Will stop the queue in the tab "…"
    after the current video finishes" (naming A's tab) and A stops after its current video.
    Stop in A's own panel shows only the page's toast, "Will stop after the current video
    finishes".
    - **Record**: inspect B's panel and switch to tab A: whether the hidden panel in B keeps
      polling (requests in its console / Network) while A's panel is the visible one.
    - Phase 2's "Nothing is running in this Studio tab" (a Stop sent to a tab that isn't
      running) can't be reached from the panel in normal use: Stop is disabled unless some
      tab runs the queue, and it goes to the running tab. If A's run ends just as you click
      Stop in B, A's Studio page may show that toast (B's panel doesn't show A's toasts); if
      A was closed or left Studio, B's panel toasts "That tab is no longer running the
      queue". Expected otherwise: neither appears.
19. **Intercept.** In Studio's own upload dialog pick 2 videos: the dialog closes, both appear in
    the queue, Start uploads them. Reloading while they wait asks "Leave site?".
20. **Manual fill.** Upload one file through Studio's own dialog: the details fill in from the
    default preset, with the toast "Details filled in: …". Presets → **Apply to open window**
    fills an open dialog too.
21. **Quick actions.** On the details page and on `/video/<id>/edit`: bars under the title and
    the description (Elements: `div.ytp-qa` → `#shadow-root`); dark mode switches their colours;
    Preset title, Copy, Preset description, Load .txt, Fix chapters, Check chapters, Preset tags,
    Apply all work; Undo reverts. After switching the panel to Thai, the bars are Thai the next
    time the dialog opens.
22. **Dialog info and the clipboard.** With the details page open, Settings → Troubleshooting →
    **Copy upload dialog info**, then paste: JSON whose `version` is the manifest version.
    **Record** whether the copy works on the first click (the clipboard write runs after the
    tab's reply; it needs the panel to keep focus).
23. **Button state in the isolated world.** During items 9, 19 and 20, Save/Next are clicked
    only once Studio enables them: no "Could not click Save (button still disabled…)" while the
    button is plainly enabled, and no click that does nothing.
24. **Notification click and the side panel.** With the panel closed, finish a run and click the
    notification: **record whether the side panel opens** (`sidePanel.open` from a notification
    click, i.e. whether it counts as a user gesture). The tab is focused either way.
25. **Extension reload under a live Studio tab.** With the bars showing, reload the extension:
    the console logs `[ytup] extension reloaded — page automation stopped`; the bars and the FAB
    go away; the tab-title mark clears; the reload banner appears (item 6). Picking 2 files in
    Studio's dialog is now left to Studio.
26. **Bridge not answering.** Queue a clip, reload the tab, and before Start paste in its console
    `setInterval(() => document.querySelector('iframe[src*="file-bridge"]')?.remove(), 20)`.
    Start: within about 10 s the toast "The side panel's file access is not answering — reload
    the Studio tab, then start again"; the card stays waiting.
27. **Stop mid-run.** Queue 3, Start, **Stop** during clip 1: "Will stop after the current video
    finishes"; clip 1 finishes Done, 2 and 3 wait; "Queue stopped (1 video(s) done)". Start works
    again. **Clear finished videos from the list** (the footer's clear button) is disabled until a
    video is done, then removes the Done cards.
28. **Review mode.** Settings → turn off **Auto-press Save**; queue 2 and Start: details fill in,
    the card shows "Waiting for you to Save" with "Check the details in the YouTube dialog, then
    click Save to move to the next file" and no ✕; clicking Save yourself finishes it and clip 2
    starts. With **Press Next to the Visibility page** on, the dialog moves to Visibility first.
    Turn Auto-press Save back on.
29. **The running tab closes while another is open.** Start in A, close A during clip 1: within
    about a second (at once when B gets focus) clip 1 shows the reload error in B's panel; the
    rest wait; after deleting the draft, Retry and Start in B work. Also let a run in A end
    normally with B open: every card ends Done.
30. **Channel lock and the confirmation.** Lock to another channel (item 4) and Start: the toast
    "⛔ Currently on channel … but locked to …" and nothing runs; unlock. Click Start and leave
    the summary open; switch Studio's channel, then confirm: "The channel changed after you
    confirmed — click Start again to see the new summary". The same with the queue: with the
    summary open, pick 2 files in Studio's dialog, then confirm: "The queue changed after you
    confirmed — …".
31. **Duplicate guards.** Add `Clip 1.mp4` twice: one card, toast "1 already in the queue". After
    it uploaded, **Clear finished videos from the list** (the footer's clear button) and add it
    again: "1 already uploaded to this channel (red
    badge)", the card's red "Already uploaded …" chip opens that video in a new tab, and the
    Start summary warns "1 already uploaded to this channel — they will be duplicated".
32. **Extension reload with a run in flight.** Start 2 and reload the extension during clip 1:
    one in-page toast "The extension was reloaded during an upload — …"; Studio's console (filter
    `[YT Presets]`) logs `[YT Presets] Error: The extension was reloaded — the queue stopped in
    this page` (the Thai text in Thai) when the run reaches its next step; the orphaned run
    clicks nothing more and starts nothing; no ✅/⚠️ comes back to the title. Finish the upload in the
    dialog by hand, reload the tab: clip 1 shows the reload error and clip 2 waits. Remove clip 1
    (Retry would upload it twice).
33. **Navigation during an add (rare).** Drop a large folder and navigate Studio to another page
    while the cards are still arriving. **Record** whether any item later fails with "no longer
    available" (the panel may forget handles the old page had already queued).

### Presets, settings, backup

34. **Presets.** Edit the default preset: the YouTube preview and the title counter follow; a
    typo like `{artist}` shows "⚠ Unknown variable {artist} …"; variable chips insert at the
    cursor of the field last edited; dropping a `.txt` on Description inserts its text; dropping
    a real `.mp4`/`.txt` on the test field changes the preview. **New** (the name is selected
    for typing), **Duplicate**, **Set as default** ("Set "…" as the default preset"); Alt+1…9 in
    Studio does the same with "Main preset: …". **Delete** asks first; a queued video on that
    preset moves to the default preset. **Next EP** changes the next card's `{n}`. **Reset to
    defaults** asks first.
35. **Settings.** Each switch and list keeps its value after closing and reopening the panel, and
    the Studio tab follows without a reload (e.g. **Pause between files** during a run). During a
    scheduled run, turn **Notify when the queue finishes** off: after the next clip both your
    change and the moved first-release time are kept (one settings writer).
36. **Backup.** **Export (.json)** saves `yt-upload-presets-YYYY-MM-DD.json` and toasts "Exported
    N presets". **Import** a userscript export: the dialog lists the presets and asks My file /
    Someone else's; "Someone else's" keeps your producer name and schedule; the toast "Imported N
    presets"; presets and settings show at once. Import during a run toasts "Stop the queue
    before importing".

### Carried over from Phase 2a

37. **Bridge after idle.** After item 9, wait 2 minutes and Start another clip: if the page had
    removed the frame, the console shows `[ytup] file bridge: #1 dropped (no longer in the
    DOM)`, `#2 mounted …`, `#2 connected …`, and the upload works.
38. **Invite accept.** Open an "ACCEPT INVITATION" link from a collaboration email: `invite:
    watching …`, `invite: opening request 1: …`, `invite: accepting request 1`, the link reopens
    for the next request until none remain, then "Invitation accepted" / "Accepted N
    collaboration requests". The side panel closes on www.youtube.com (**record** it). With
    Settings → **Auto-accept channel permission invites** off, reopening a link logs nothing
    from `invite:`.

### During a run

39. **Edits during a run.** Queue 3 clips and Start; while clip 1 uploads:
    - Clip 1's card (and, while its file is fetched, the card of the clip about to upload)
      refuses edits: its title, preset, release time and artists fields are disabled, it has
      no ↑/↓, no ✕ and no attach buttons, and a `.txt` dropped on it is not attached (the
      panel adds it to the queue as a new file instead).
    - Edit clip 2 (title, preset, artists, release time), attach a `.txt` to it and move it
      below clip 3: each change shows at once, and when its turn comes Studio's dialog gets
      the new title, description and release time, in the new order.
    - Remove clip 3: its card goes; the run ends after clip 2.
    - Retry an error card (one left from an earlier item) during the run: it goes back to
      waiting and is uploaded in this run, in its place in the list.
    - With scheduling on, click into the schedule box's "First video releases" field before
      clip 1 finishes, and leave the focus there until clip 1 is Done (the runner moves the
      start to the slot after clip 1). Click out of the field: it now shows the moved start,
      not the one it showed while focused. Nudge its minutes: the next clip is scheduled from
      the moved start, never in clip 1's slot. The same goes for a card's title field: after
      a change from elsewhere, leaving the field shows the new value.
    - **Attach a `.txt` that can't be read.** In Terminal, `chmod 000 Unreadable.txt`, then drop
      it on a waiting card: the toast reads "Could not add 1 file(s): " followed by a reason
      (not "This tab is not connected to the extension yet — reload this tab"), and the card
      keeps its old `.txt`. `chmod 644` it afterwards. **Record** the reason. Expected:
      Chrome's own `NotReadableError` text, passed through as it is (English in Thai mode
      too): "The requested file could not be read, typically due to permission problems that
      have occurred after a reference to a file was acquired." The handle's `getFile()` only
      reads metadata and succeeds, so the bridge hands the file over; the read fails in the
      Studio tab's `readText()` (`arrayBuffer()`), and `attach` (`lib/studio/queue-edit.ts`)
      puts the error's message after "Could not add 1 file(s): ". If Chrome fails
      `getFile()` instead, the reason is the bridge's "Could not read this file (moved or
      renamed?) — add it again".
    - **Leave Studio mid-run, then Back.** During clip 1 navigate the tab to another site,
      confirm "Leave site?", then press Back. If Chrome restored the page from its
      back/forward cache with the run still going: the run carries on and keeps the lock (in
      another Studio tab the panel shows "Another Studio tab is running the queue — change
      the queue there").
    - **Back after another tab took the lock.** As above, but before pressing Back start the
      queue in another Studio tab. The restored page toasts "Another Studio tab is already
      running the queue or copyright work" and stops at once: it clicks nothing more, its
      video stays a draft in Studio (the other tab shows it as interrupted), and only the
      other tab uploads, each clip once. While the other tab runs, and until the restored tab
      has read that run's results back (within a second of its end), Start in the restored
      tab is refused with the same toast; after that it works, and the cards the other tab
      finished show Done there.
      **Record** whether the page came back from the cache at all (if Studio reloads instead,
      the item comes back as interrupted, as in item 15).

### Phase 0 spike checks still open (ledger: Task 7)

Record what happens; the Phase 0 spike results document
(`docs/superpowers/specs/2026-10-05-spike-results.md`) is written from these observations.

40. **Moved or renamed file (spike #8).** Queue `Clip 1.mp4` with `Clip 1.jpg`, and `Clip
    2.mp4`. Rename `Clip 1.mp4` in Finder, then Start: clip 1 goes to error with "Could not read
    this file (moved or renamed?) — add it again" and **Retry**; clip 2 still uploads. Then
    queue `Clip 3.mp4` with `Clip 3.jpg`, rename `Clip 3.jpg`, Start: clip 3 fails with
    `Thumbnail "Clip 3.jpg": Could not read this file (moved or renamed?) — add it again`.
    (A `.txt` renamed after queuing changes nothing: its text was read when it was added.)
41. **A ~1 GB video through the bridge (spike #3).** Queue one ~1 GB `.mp4` and Start: Studio's
    dialog starts uploading it within a few seconds of its turn, shows the full file size and
    finishes; the console shows no `[ytup] file bridge: … dropped` and no "Could not get the
    file from the side panel (…)" error. **Record** the time from Start to Studio's upload
    progress appearing.
42. **Service worker smoke test (Task 16).** `chrome://extensions` → the extension → **service
    worker** → Inspect; in its console `await chrome.storage.local.get('schemaVersion')` gives
    `{schemaVersion: 5}`, and there is no `[ytup] startup` error.
43. **Leftover handles are swept (optional).** Drop 3 files on the panel and close the panel at
    once, before the cards appear (or reload the extension right after the drop). Note the
    ids in the panel's DevTools → Application → IndexedDB → `ytup-files` → `handles`. Quit
    and restart Chrome, open the service worker console: the handles of files no queue item
    uses are gone from `ytup-files`; the queued items' handles are still there, and there is
    no `[ytup] handle sweep` error. Known window: files dropped within about 1 s of Chrome
    starting can be swept before their item is saved, and then fail with "This file is no
    longer available — add it again" (handles carry no timestamp to skip new ones).
44. **Bridge parent-source check (note, nothing to run).** The bridge accepts a connect only
    from its Studio parent frame (origin `https://studio.youtube.com`, `source` is its
    parent, a port attached): `isBridgeConnect` in `lib/file-bridge.ts`, unit-tested in
    `tests/file-bridge.test.ts`. Items 9 and 37 show it working in real Studio; close the
    ledger item from those.

45. **Debug page and crash guard.** Settings → Troubleshooting → **Open debug page** opens
    `debug.html` in a tab: Overview shows schemaVersion 5 / 5 and "answered in … ms"; the Studio
    tab answers; the error log lists recent `[ytup]` errors with their context. **Copy
    diagnostic report** and paste: it has every section and the log. **Record** anything a
    section shows as failed. Then, in the service worker console, run `chrome.storage.local.get(
    'debugLog')` to see the same entries.

### Copyright, Phase 4a (scan, lists, one lock)

These check what 4a added (trim, Auto-pilot, Ads and Collab are items 54 to 74). Use a channel
with at least one copyright claim.

46. **Scan claims and the status card.** Copyright → **Scan claims**: the status card shows the
    scan with its progress, then "Scan complete"; **Claim list (N)** and **Claimed songs (N)**
    get their counts; "Show activity ▾" lists the scan's lines, ending "Scan complete ✓ …".
    With Studio in Thai the tab warns "⚠ Studio is set to Thai — …". **Record** any "Unexpected
    answer from …" line in the activity log, and a last line "Couldn't read the claim details
    of N of M videos — this scan is incomplete" (the card then says "Needs attention" instead
    of "Scan complete"; see "Known behaviour, Phase 4a").
    - **Claim list.** One card per claim; the "Select:" chips tick claims (ticking only builds
      a list, nothing changes on YouTube); **⬇ CSV**; **↻ Rescan**.
    - **Claimed songs.** Search, sort, **Remove from history** and **Delete all** (each asks
      again first). **⬇ CSV**, then **⬆ Import CSV** of that file: "Imported N songs into
      history". A file over 16 MB toasts "This file is too large — the limit is 16 MB"; a CSV
      without a song column, "This is not a song history CSV …". The import is lossy (see
      "Moving from the userscript") and the CSV cells are not neutralised (see "CSV exports").
    - **Fix tracklist.** Pick a claimed video (its tracklist comes from the upload history, or
      paste one; a `.txt` dropped on the box stays in the box), tick the trimmed ranges,
      **📋 Copy new tracklist**: "New tracklist copied — paste it into the video description".
    - **The chip.** After the scan, drop a clip whose `.txt` names a claimed song: the card
      shows "N song(s) previously claimed", and its tooltip lists the lines.
47. **The scheduler avoids a taken slot.** Schedule a video on the channel in Studio for
    tomorrow 19:00. In the panel set "First video releases" to the same time and queue 2 clips:
    the schedule box's summary adds "· 1 already scheduled on the channel (next …) — skipped 1
    slot(s)", and the cards' times start at the next slot. Start: neither clip is scheduled at
    tomorrow 19:00.
48. **A scan during an upload.** Start a clip and, while it uploads, press **Scan claims**: the
    scan runs to "Scan complete" and the upload finishes Done (a scan takes no lock). The
    activity bar keeps showing the upload.
49. **Status in a second window and in the activity bar.** With Studio in windows A and B on
    the same channel and nothing uploading, press Scan claims in A: the activity bar in A's
    panel shows the copyright status; after the scan, B's Copyright tab shows the same counts
    within a few seconds, without a reload.
50. **Light and dark, narrow.** Drag the panel to its narrowest (about 320px) and look at the
    Copyright tab, the claim list (scrolled to its end: the footer stays at the bottom edge),
    Claimed songs and the tracklist editor, in Chrome's light and dark themes, English and
    Thai: no sideways scroll, no clipped button, error text readable in light.
51. **CSV downloads in the real side panel.** **Upload history**, the claim list's **⬇ CSV**
    and Claimed songs' **⬇ CSV** each save a file from the side panel (no new tab, no blocked
    download). **Record** the file names and whether Chrome asked anything.
52. **One worker per channel.** Turn Auto-pilot on (item 69) with two Studio tabs open on the same
    channel. In the service worker console, `await chrome.storage.session.get('claimsWorkers')`
    (easier: the debug page, Settings → Troubleshooting → **Open debug page** → Stored data →
    `storage.session` → `claimsWorkers`; reload the debug page to see it change. Item 42 says how
    to open the service worker console.)
    names one tab for the channel (`{ tabId, at }`, `at` moving about every 10 s). One cycle runs,
    not two; during a run the other tab's card shows "↪ Running in another Studio tab". Close the
    worker tab: within about 10–15 s the entry names the other tab, and it carries on. **Record** what
    happens when the worker tab hangs instead (DevTools → pause script execution): the other tab
    takes over after about 20–30 s.
53. **Start refused during copyright work.** Start a trim run in Studio tab A (item 57). In tab B
    the panel shows "Another Studio tab is busy with copyright work — wait for it, or press Stop in
    the Copyright tab" with **Go to that tab**, Start is disabled, and a forced Start (item 16's
    way) toasts "Another Studio tab is already running the queue or copyright work". When A's run
    ends, B's banner goes and Start works.
    - The banner appears within a second or two of A's run starting and goes as quickly when it
      ends, A's tab is closed, or A's tab is moved to another site (type example.com in it) (tabs
      are told when the lock changes; they no longer ask every
      second). The same for item 18's "Another Studio tab is running the queue". **Record** a
      banner that takes longer than a few seconds, or stays.
    - **Record**: with a Studio tab open and nothing running, does the service worker go
      "inactive" on `chrome://extensions` after about a minute? (Every Studio tab tells the
      extension's background every 10 s that it is still there, so the background may stay
      awake; that is expected, write down what you see.)

### Phase 4: copyright (scan, trim, Auto-pilot)

Use a test channel with at least two videos that carry claims (one with two claims), Studio in
English. Write down pass or fail; items marked **record** ask for an observation.

> **These items change real videos.** A saved trim cuts the video and its sound for good
> (YouTube cannot undo it). "Turn on ads" changes a video's monetisation. A Collab invite adds
> another channel to a video. Auto-pilot does all of the first two by itself, on every video its
> rules pick, without asking.
>
> - Items 57 to 60, 62 and 64 (trim): only on videos you are willing to cut. Safest: upload a
>   private or unlisted test video that contains a song you know gets claimed, wait for its
>   claim, and trim that one.
> - Item 65 (ads) and item 66 (Collab): tick only private test videos; for Collab invite a
>   channel of your own.
> - Items 52, 69 and 70 (Auto-pilot): first open Copyright settings, set "Max claims per cycle"
>   to 1, and read the rules in the question before you turn it on. Use a channel where the only
>   claims are on test videos.
> - When you finish: turn Auto-pilot off, turn "When trimming manually…" off, set "Fully
>   automatic trim", "Run every N hours" and "Check every N minutes" back, and switch Studio
>   back to English after item 61.
>
> Suggested order for one sitting: 54 to 62, then 53 and 63 to 68, then 69, 52 and 70, then 71
> to 74 (item 52 needs Auto-pilot on, item 53 needs a trim run).

54. **Scan, on a claim-heavy channel.** (Items 46 and 51 cover the scan, the status card, the
    lists and the CSV files.) Scan the channel with the most claims you have: the claim list shows
    one card per claim with video, privacy · length, song · artists · label, claimant, ranges with
    % of the video, and impact. Then open **Show activity ▾**: no "Unexpected answer from …"
    lines. **Record** any, with its text (it names the endpoint and the field: Studio answered in
    a shape the check doesn't know).
55. **Scan before Studio loaded / not signed in.** Reload Studio and click Scan at once:
    "Studio hasn't finished loading — try again in a few seconds" in the activity log. (Optional:
    in a signed-out profile, "Not signed in (SAPISID cookie not found)".)
    - **Record** how long the round button (bottom right in Studio) takes to appear after a
      reload. It waits for the background to answer two questions first: normally well under a
      second, 15 s at the very worst.
56. **Picks.** Each chip ticks the right rows; ticks survive closing and reopening the panel and
    show in another window's panel on the same channel.
57. **Trim, automatic.** Tick one claim, **✂ Trim selected (1)** → the question (total length,
    "Saved trims cannot be undone", ⚡ Fully automatic) → **Start trim**. The tab opens the
    video's claims page, the card shows the steps (Open video → … → Confirm). When the run ends
    open **Claim list** again: the claim's card says "✅ Trimmed" with its range; the Upload tab's
    queue is untouched. **Record** the time it took.
    - **The right claim.** On a video with several claims (best: two with the same song title),
      turn on review mode (item 59) and, before you click Save, compare the times in YouTube's
      trim editor with the range on that claim's card: they are the same claim's.
    - **The confirmation.** In automatic mode the "I acknowledge" box of YouTube's "Confirm
      changes" dialog gets ticked, Confirm is clicked, and an "OK" / "Got it" dialog that follows
      is closed. The activity log says "✔ Trim confirmed …".
    - **When YouTube says no.** **Record** what a claim that can't be trimmed ends as (no "Take
      action" button, the Trim option greyed out, the editor not opening): its card shows ❌ with
      a reason, YouTube's dialogs are closed, and the run goes on to the next claim.
58. **Several claims on one video.** Trim both claims of the two-claim video: the first trims, the
    second shows "⏳ Queued — will trim after the previous trim on this video finishes"; the card
    says "Waiting for YouTube to process trims" with the next check time. Set Copyright settings →
    "Check every N minutes" to 2 and wait: the second trims after YouTube finishes (can take hours;
    **record** whether it happened before the end of the session).
    - While YouTube is still working the activity log says "⏳ …: previous trim still processing".
      A claim that YouTube released meanwhile ends "✅ Claim gone". Reloading the Studio tab
      checks at once instead of waiting for the next check time. Leave the tab hidden for more
      than five minutes while it waits: the check still happens, up to a minute late.
59. **Review mode.** Turn off "Fully automatic trim": the trim editor opens and waits ("👉 Your
    turn…"); Cancel ends it "⏭ Skipped"; Save + I acknowledge + Confirm changes ends it "✅ Trimmed".
    - While the editor waits for you, another Studio tab can't start its queue (item 53's
      banner): a review holds the one lock until you answer.
60. **Stop.** During a run, **Stop** (also from a second window's panel on another Studio tab of the
    same channel): the run ends after the current step, "You stopped it: …"; queued follow-ups are
    cancelled ("Cancelled N queued follow-up trims").
    - Try Stop during a trim, during an ads run (item 65) and during a Collab run (item 66):
      after the step in progress nothing more is clicked.
    - With the run in a tab of **another window**, Stop in this window's panel still reaches it.
61. **Studio in Thai.** Switch Studio to Thai: the red warning shows on the Copyright tab, Scan still
    works, a trim fails with "Studio is not set to English — switch to English and try again" and
    nothing is clicked on the page.
62. **Manual trim auto-save.** Copyright settings → turn on "When trimming manually…"; trim a claim
    by hand in Studio: Save is clicked about 1.5 s after the editor opens, Confirm changes is ticked
    and confirmed. Turn it off again: nothing is clicked for you. During a trim run the helper is
    off: the run does its own clicks.
    - **Copyright settings, the view itself.** Ten settings in two groups. **Save** closes the
      view and toasts; **Reset to defaults** asks once more; **Cancel** changes nothing. In a
      short panel the three buttons stay at the bottom edge while the list scrolls. With the
      keyboard only: Tab reaches every field and button in order. With a screen reader each
      field is read with its label and, where it has one, its help text. **Record** anything
      that isn't.
63. **One lock.** Start a trim run in Studio tab A; in tab B (same browser) the Upload tab's Start is
    disabled with "Another Studio tab is busy with copyright work — wait for it, or press Stop in
    the Copyright tab" and **Go to that tab**. Reverse: with a queue running in A, a trim run
    started in B (another channel) waits at its first page change (its card shows "⏸ Waiting for
    another Studio tab to finish (page change needed)") and goes on after A's queue ends. (An
    Auto-pilot cycle that comes due in B while A's queue runs still scans, because scans take no
    lock; the trims it then starts wait the same way.) With no tab running the queue, a trim, ads
    or Collab run waits while the queue has **waiting** videos ("⏸ Waiting for the upload queue to clear…"); a **failed**
    upload left in the queue doesn't hold it back.
    - **A waiting run doesn't block the others.** Put two clips in A's queue without starting,
      then start a trim run from A's panel: it waits for the queue. Now in B, Start (or a trim
      run) works. When the queue is clear again, A's run goes on by itself.
    - **The channel changed elsewhere.** During a run in A, switch channel in another Studio
      tab. A's next page is on the new channel: the run stops there (it is kept for the old
      channel) and other tabs can start again.
64. **Run survives page changes; takeover.** During a run with 3 claims on different videos, the tab
    changes pages per video and keeps going. Close that tab mid-run with a second Studio tab on the
    same channel open: the second tab continues within about 10–15 s.
    - While the run changes pages, the other tab's card says "↪ Running in another Studio tab".
      In the running tab's panel open **Fix tracklist** (or Copyright settings) during the run:
      the view stays open through each page change. (The Claim list button is hidden while a
      run is going; that is expected.)
    - **A hidden tab.** Start a run in A, switch to another tab or window and leave A hidden
      for more than five minutes: the run keeps going (slowly: Chrome wakes a hidden tab about
      once a minute). It must not stop for good with A saying "Running in another Studio tab"
      and B saying "Waiting for another Studio tab".
    - **Memory Saver.** If Chrome discards the running tab (`chrome://discards` → Urgent
      Discard), the other tab takes over as if it had been closed. With a third thing to watch:
      B's "Another Studio tab is busy…" banner goes within a few seconds of the discard.
      **Record** if it takes about 30 s.
    - **Back button. Record**: can Chrome bring a Studio video page back from its Back-button
      memory (the "back/forward cache": Chrome keeps the last page frozen so Back is instant)?
      Check: in the running tab, DevTools → Application → Back/forward cache → **Test
      back/forward cache** on a video's claims page, and write down what it says. If it says
      the page can be restored: start a run with claims on two videos, wait until the tab has
      moved to the second video's page, and press Back once. The first video's page must load
      again by itself (you see it reload) and click nothing; the run then goes on. **Record**
      a page that comes back and clicks Save or Confirm without reloading. Also, if pages can
      be restored: move an idle Studio tab B to another site, start the queue in A, press Back
      in B: within a second or two B refuses a queue edit with "Another Studio tab is running
      the queue — change the queue there".
    - **Extension reloaded mid-step.** Reload the extension on `chrome://extensions` while a
      trim step is on screen: the old page stops before "Confirm changes". Reload the tab; the
      run goes on.
65. **Ads.** **Ads off** (first time: it scans) → the list with ineligible ones marked → **💰 Turn
    on ads (N)**: each video's monetisation page opens, "None of the above" is answered when asked,
    Save; the status card counts the videos, and when the run ends open **Ads off** again: each
    card says "✅ Turned on". **Record** any "YouTube asked more after Save" message.
    - A video whose ads were already on: nothing is clicked, the activity log says "✅ Ads turned
      on: … (Already on)" and its card says "✅ Turned on".
    - **↻ Recheck** with a list already there: when the new list opens, the ticks start again
      from the new list and the number on **💰 Turn on ads (N)** matches the ticked rows.
66. **Collab in bulk.** **Collab** → type `@handle` (kept after reopening), pick videos, **🤝 Invite
    (N videos)**:
    each video's edit page opens, the invite is sent and saved; "Invite links" lists the link with
    **Copy**. If the handle is one of your own channels (in the channel list), the tab switches to
    it and accepts (with "Auto-accept channel permission invites" on).
    - **Copy** puts the link on the clipboard and toasts "Copied …'s link". If Chrome refuses
      the clipboard, the toast is "Couldn't copy".
    - Type a handle and close the side panel straight away, then open it again: the handle is
      there. **Record** if the last letters are missing.
    - **A large channel. Record** how typing in the handles box and ticking feel in the Collab
      view on the channel with the most videos you have (see "Known behaviour, Phase 4b").
    - The switch to your own channel does not happen while the upload queue has work, here or
      in another tab.
    - **Narrow, both themes.** At about 320px, light and dark, English and Thai: the Copyright
      tab's buttons, the trim and Auto-pilot questions, the Ads and Collab views and Copyright
      settings show no sideways scroll and no clipped button; the "Select:" chips are readable;
      the small dot on the Copyright tab's name (while something runs) doesn't push the name
      out of the tab bar.
67. **Claimed songs.** The list searches and sorts; ✕ asks "Sure?"; ⬇ CSV / ⬆ Import CSV round-trip
    (`claimed-songs-*.csv` from the userscript imports with "Imported N songs into history");
    "Delete all" asks once more ("Press again to delete all"). A `.txt` dropped into the queue with
    a claimed song shows "1 song(s) previously claimed" on its card, the tooltip listing it. A card
    that was in the queue before the scan gets the chip after it, without reloading the tab.
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
    - **The rules.** With nothing left to trim the log says "🤖 Nothing to trim, next check …".
      Copyright settings → "Also turn on ads for videos that have them off": on, a cycle that
      has nothing to trim also turns ads on; off, it doesn't. Clips waiting in the upload
      queue hold the cycle back until the queue is clear.
    - If the panel opens on a Studio tab that doesn't know its channel yet (the first moment
      of a page load), the switch is greyed out until it does.
70. **Auto-pilot with no Studio tab.** With Auto-pilot on, a few minutes before its next cycle
    (the card's "Next scan + trim in …"), close every Studio tab, wait past the time, then open
    Studio on that channel: the cycle starts within a few seconds of the page loading. While you
    waited, the extension's card on `chrome://extensions` showed its service worker as
    "inactive" (**record** if it never did). **Record** whether a backgrounded
    Studio tab started its cycle on time (the alarm wakes it); a tab Chrome discarded (Memory Saver)
    has no script and does not wake.
    - **The "due" notification.** In that same wait, when the cycle's time came with no Studio tab
      open, one desktop notification "Auto-pilot is due" naming the channel appears (once: restarting
      Chrome or the extension doesn't show it again for the same cycle). Clicking it opens Studio on
      that channel in a new tab, and the cycle starts there within a few seconds. With a Studio tab
      on that channel open, no notification. The computer must be awake and Chrome running at
      the cycle's time (see "Known behaviour, Phase 4b").
    - **A tab hidden for a long time.** Leave the channel's Studio tab hidden for more than
      five minutes across a cycle's time: the cycle starts on time and **no** notification
      appears.
    - **In Thai.** With the panel's language set to Thai, the notification is in Thai
      ("Auto-pilot ถึงรอบแล้ว"). **Record** its language when it is the first thing that happens
      after Chrome sat idle for a while (it can come out in English then).
    - **No window open (macOS).** Close every Chrome window but leave Chrome running, then click
      the notification: a new window opens with Studio on that channel.
    - **Chrome closed at the cycle's time.** Quit Chrome before the cycle's time and start it
      after: no notification; the cycle starts when a Studio tab on that channel loads.
    - **The notification goes away.** Leave it unclicked and open Studio on the channel
      yourself: once the cycle has started, the notification is withdrawn.
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
    - **When a save fails. Record** only if you see it: "Couldn't save (…)" appears once per
      message per minute, not on every tick.

### Known behaviour, Phase 4a (note, don't test)

- **A schedule list that arrives late can move the slots after you confirmed.** Before a start
  the channel's scheduled videos are read again, and each of the two waits (the summary, then
  the run) gives up after 10 s and goes on with the slots known so far. If Studio answers
  between the summary and the first upload, the run avoids the slots it then knows, which can
  differ from the times the summary showed. The userscript's refresh during a run did the
  same. A list that could not be read at all is a console warning only (`[YT Presets] scheduled
  list`): the run starts without the channel's taken slots.
- **A scan is stored even when claim details could not be read.** A video whose claims Studio
  did not return (an error, no answer within 30 s, or an answer in an unexpected shape) is
  left out, and the scan replaces the one before it, as in the userscript. When every detail
  call fails, that is a stored scan with 0 claims. The activity log's last line then says
  "Couldn't read the claim details of N of M videos — this scan is incomplete" and the status
  card says "Needs attention"; scan again.
- **A copyright write that failed** (the background refused it or did not answer within 30 s)
  toasts "Couldn't save (…)" in the panel and on the Studio page and adds the same line to the
  activity log; the debug log has it too. The tab goes back to what is stored. A write that
  only timed out may still land.
- **After a reload of the Studio tab** the Copyright tab keeps showing what the old page last
  said (a scan cut short still reads "Scanning…") until the new page answers, a few seconds
  later; an open claim list, song list or tracklist editor stays open, and closes only when the
  new page is on another channel. Clicking around inside Studio changes nothing here. When the
  tab came back without the extension's script (the "reload this tab" banner says so), the
  Copyright tab shows no status and Scan is off; the lists, Copyright settings and Fix tracklist
  still open from what is stored, and an open view stays open. The activity log keeps its lines.

### Known behaviour, Phase 4b (note, don't test)

- **One lock for every Studio tab.** Only one tab changes Studio's pages at a time, whatever
  the channel: an upload run, or a trim / ads / Collab run. A run in review mode keeps the lock
  while it waits for you, so other tabs can't upload meanwhile. A run that is only waiting for
  the upload queue gives the lock back while it waits. Scans take no lock.
- **A hidden tab is slow.** Chrome wakes a tab that has been hidden for more than five minutes
  about once a minute, so a run or an Auto-pilot scan in a tab you never look at takes much
  longer, as it did in the userscript. Keep the working tab in its own window if time matters.
- **Copyright settings: Save writes all ten settings as the view shows them.** A setting changed
  in another window while the view was open is overwritten by Save (the userscript's settings
  window did the same). Close and reopen the view to see the latest values first.
- **The "Auto-pilot is due" notification** appears only if the computer is awake and Chrome is
  running at the cycle's time. An alarm that goes off more than a minute late (the computer
  slept, or Chrome was closed) still wakes a Studio tab if there is one, but shows no
  notification; the cycle then starts when a Studio tab on that channel is open. The wake-up
  also goes to an open Studio tab that has been hidden so long that it looks idle.
  - It says "No YouTube Studio tab for … is open" in two cases where a tab is open but can't
    work: a tab Chrome discarded (Memory Saver), and a tab that is in the middle of loading or
    was opened before the extension was loaded. Clicking opens a second tab; that is harmless.
  - Its language can be English for a Thai user when it is the first thing the extension does
    after Chrome was idle (the language setting may not have been read yet).
  - Each notified cycle is remembered in `apNotified` (`chrome.storage.local`, not part of a
    settings backup), so a restart doesn't repeat it. Two channels coming due in the very same
    instant can lose one of the two entries; nothing else uses that list.
  - Every time the background wakes it reads all stored data once to find the channels with
    Auto-pilot on. With a very large scan or song history that takes a moment; nothing waits
    for it.
- **A tab without the extension's script** (the "reload this tab" banner shows): the status card
  is gone and Scan is off. If the panel was already open on that tab, Claim list, Claimed songs,
  Copyright settings and Fix tracklist still open from what is stored, and a view that was open
  stays open. A panel opened on such a tab for the first time has every Copyright button greyed
  out and no Auto-pilot switch until the tab is reloaded.
- **Large Collab lists.** The Collab view shows every video of the channel, and each keystroke in
  the handles box and each tick redraws all of them: about 70 ms per keystroke at 3,000 videos
  (measured in tests; Chrome is faster). Fine up to a few hundred videos; typing may feel heavy
  on a very large channel.
- **Ads: "already on" is read from the first video of YouTube's answer**, as in the userscript.
  A wrong "on" only records "Already on" and clicks nothing.
- **Auto-pilot, rare cases.** If the cycle's own time can't be saved (the background is not
  answering), the tab starts the cycle again after each scan until it can. If Studio turns out
  to be on another channel when the cycle begins, that cycle is skipped until its next time,
  with a console warning only.
- **Auto-pilot is never on for a tab that doesn't know its channel.** The switch is greyed out
  until the page says which channel it is on.
- **Back button during a step.** A page that Chrome kept for the Back button never carries on
  with a copyright step: when it is shown again it reloads and the run goes on from what is
  stored. A page that comes back with nothing in flight just keeps working. During the Collab invite itself only the reload protects (the invite's own waits are
  the upload code's); whether Studio's video pages are ever kept this way is item 64's record.
- **Userscript parity worth knowing.** A step checks which page it is on once, when it starts.
  If you click over to another video's page while a step is waiting, the ads step (and a trim
  step on a video with a single claim) acts on the page that is there. Don't click around in the
  working tab during a run.

### Known, dev only (note, don't test)

- After a full extension reload during `npm run dev`, WXT re-injects the content script and
  the old instance's "reload this tab" banner can stay over a working page (review M8).
  Production Chrome doesn't re-inject into open tabs.
- Phase 4b's plan had a unit of source pins for the entrypoints' guards (unit E). It was
  dropped: every one of those guards already fails a 4a test when removed.
