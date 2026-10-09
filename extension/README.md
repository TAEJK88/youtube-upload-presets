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

Ported code is checked against the userscript at the pinned commit:
`npm run port-check` (configs in `scripts/port/`; `node scripts/port-check.mjs --print <name>`
prints the code a port starts from).

The side panel (`entrypoints/sidepanel/`, React + Tailwind v4 + `components/ui/`) talks to the
Studio tab active in its window: it asks for a `QueueView` and sends `queue:*` messages; it
never touches Studio's DOM. Logic the panel needs lives in `lib/panel/` (unit-tested).
`npm run ui-check` proves every shipped UI string is one of the userscript's `L()` pairs (or
is listed with a reason in `scripts/strings/extension-only.mjs`) and that no text is below 12px;
with `--coverage` (as in `npm run check`), also that every pair of the userscript's drawer is
used by some `L()` call in the extension's shipping code or listed with a reason in
`scripts/strings/dropped.mjs`. "Used" is not "shown in the panel": a pair kept alive only by
page-side code (the FAB, page toasts) or by dead code passes too.
`tests/panel-i18n.test.tsx` renders the whole panel (every tab, card state, question and banner),
the FAB and the reload banner in Thai, and fails on any English pair and on any Latin word
outside its short, commented allowlist and the presets' own text (whole pieces of a label,
title, description line or tag, and their artist names; not their words on their own).
`settings` and `counters` have one writer, the background (`store:patch`, `lib/store-writer.ts`).
Console lines from the extension start with `[ytup]`.

## Layout

- `entrypoints/` — background, content scripts (`studio.content.ts` isolated, `studio-main.content.ts` MAIN world), side panel, file-bridge iframe
- `lib/` — logic ported from the userscript; pure modules are unit-tested
- `lib/studio/` — page automation ported from the userscript (`port-check` keeps it honest);
  `page-ui.ts` is the seam between the runner and any UI
- `entrypoints/invite.content.ts` — www.youtube.com: channel switcher and invite accept
- `lib/studio/txt.ts`, `lib/studio/sel.ts` — the `TXT` / `SEL` tables (see the root README)
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
aren't part of the backup.

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
size and value; the open Studio tabs and whether each one's page script answers; the stored file
handles and whether the queue uses them. It changes nothing except **Clear log**.

To send a report: **Copy diagnostic report** (paste it into a message) or **Download report
(.json)** (attach the file). The report holds every section above and the last 300 log entries.
It contains everything the extension stores: your presets and settings, the queue (video
titles, descriptions, tracklists and file names), the upload history, channel ids, names and
avatar links, and the stored file names; the open Studio tabs' titles and URLs (with channel and
video ids); and log messages, which can quote titles. It contains no files and no sign-in data
(no cookies, tokens or YouTube auth headers: the extension never stores or logs them). Look it
over before sending it outside your team. The log keeps the newest 300 entries in
`chrome.storage.local` (`debugLog`), dropping info lines before warnings and errors; a line
repeated back to back is kept once, shown with ×N. It is not part of a settings backup. Errors inside Studio's page-world script
(`studio-main`) are not captured (it has no extension APIs): see Studio's DevTools console.

## Phase 3 exit check (manual, in Chrome)

Needs the logged-in Chrome profile. Run `npm run build`, reload the unpacked extension
(`.output/chrome-mv3`), and **disable the userscript in Tampermonkey**. Use a test channel.
In Studio's DevTools, filter the console by `[ytup]` (the ported code also logs `[YT Presets]`
and `[YT Upload Presets]`). Write down pass or fail for each item; any failure blocks Phase 4.
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
   Copyright tab says "Copyright scan and trim arrive in a later version of the extension".
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
      the queue there"). If another tab started a run meanwhile, the restored page toasts
      "Another Studio tab is already running the queue" and stops at once: its video stays
      a draft in Studio (the other tab shows it as interrupted), and only the other tab
      uploads.
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

### Known, dev only (note, don't test)

- After a full extension reload during `npm run dev`, WXT re-injects the content script and
  the old instance's "reload this tab" banner can stay over a working page (review M8).
  Production Chrome doesn't re-inject into open tabs.
