# Changelog

The version is `version` in `package.json` (the manifest's version). A release is the tag
`v<version>` on GitHub with the zip attached.

## 5.2.2 — 2026-10-18

The Claim list folds away and shrinks to one line per claim, like the Collab and Ads off lists.
To update, follow README, "Update"; the extension ID stays `cllefnlbgkbdnmifojjflfcpholhniio`,
so presets, settings and history stay.

- **Fold the Claim list.** Above the claims a bar reads `▾ Claims (12) · 3 picked`. Press it to
  fold the list away (the ticks stay) so `✂ Trim selected` is in reach; with a search on it reads
  `Showing 2 of 12 claims · 3 picked`.
- **Compact rows.** `☰ Compact rows` / `▤ Full rows` puts each claim on one line: the tick, the
  video, the song and claimant under it, and as icons what a trim is decided on (⛔ an impact,
  the share when it is half the video or more, ⏰ scheduled, ★ your own song, the trim's state), with their text on
  hover. "No Trim option" and a failed trim's reason stay in words. A scan of 16 claims or more
  opens compact.
- **Tabs.** "Get the update" in the update banner and a channel in the channel bar open their tab
  through the same helper as the lists, which logs a tab the browser refuses.
- **One chevron.** Every fold in the panel (the lists, the schedule box, a queue card) turns its
  chevron with the same motion, and none with "Reduce motion" on.

## 5.2.1 — 2026-10-17

Long video lists in Collab and Ads off fold away and shrink to one line per video, so the step
under them is in reach without a long scroll. To update, follow README, "Update"; the extension ID
stays `cllefnlbgkbdnmifojjflfcpholhniio`, so presets, settings and history stay.

- **Fold the list.** Above the videos in Collab (step 2) and Ads off, a bar reads
  `▾ Video list (40) · 3 picked`. Press it to fold the whole list away and press again to bring it
  back; the ticks stay. With a search on it reads `Showing 1 of 40 videos · 3 picked`, a search
  typed while the list is folded opens it, and a search that finds nothing says so.
- **Compact rows.** `☰ Compact rows` / `▤ Full rows` puts each video on one line: the tick, the
  title (the full title on hover), ✅ / ⚠ as icons (their text on hover) and privacy · length.
  A failure keeps its reason in words under the line. A scan of 16 videos or more opens compact,
  a shorter one opens with full cards; a newer scan starts again from its own size.
- **Video titles** in Collab, Ads off, the Claim list and the upload queue open Studio through
  one helper, which now logs a tab the browser refuses instead of failing silently.

## 5.2.0 — 2026-10-16

The Tools tab in three groups, so Ads and Collab no longer look like copyright tools. To
update, follow README, "Update"; the extension ID stays `cllefnlbgkbdnmifojjflfcpholhniio`, so
presets, settings and history stay.

- **Three groups.** Under the status card, the Tools tab opens on three buttons: **Copyright**,
  **Ads off** and **Collab**, each with its count (claims, videos with ads off, videos read).
  Copyright keeps its four tools (Claim list, Songs, Fix tracklist, Options) in an underlined
  bar below, and opens again on the one it was left on.
- **Ads off** shows its scan in three numbers (off, only off in settings, ineligible) and says
  whether Auto-pilot turns ads on too, with a button to change it in Options.
- **Collab** is laid out as three steps: the channels to invite, the videos to pick, and the
  invite link to send.
- **Which group is working.** While a scan or run goes on, the status card names its group and
  that group's button shows a dot.

## 5.1.1 — 2026-10-15

Apply a preset to drafts already in Studio, and Tools sub-tabs that fit a narrow panel. To
update, follow README, "Update"; the extension ID stays `cllefnlbgkbdnmifojjflfcpholhniio`, so
presets, settings and history stay.

- **Apply preset to ticked drafts.** In Studio's Content → Videos list, tick drafts and press
  **Apply preset (N)** in Studio's selection bar, after "More actions". The drafts go into the
  Upload queue with the preset picked in the panel, sorted by title, and the panel opens. Press
  **Start upload**: each draft gets its title, description and tags from the preset, its
  visibility or release time, and is saved, as an uploaded file is. No file is uploaded again.
  Ticked videos that are not drafts are skipped, and a message says how many. A draft has no
  `.txt`, so `{txt}` is empty; `{name}` and `{filename}` are the draft's title in Studio.
  Retry on such a card goes on in its draft.
- **Tools sub-tabs in a narrow panel.** Below about 480px of panel the sub-tabs are two to a
  row instead of three, so "Claim list (3)", "Fix tracklist" and the Thai labels with their
  counts are no longer cut off.

## 5.1.0 — 2026-10-15

The Copyright tab is now the **Tools** tab, with its own sub-tab for each tool. To update,
follow README, "Update"; the extension ID stays `cllefnlbgkbdnmifojjflfcpholhniio`, so
presets, settings and history stay.

- **One sub-tab per tool.** Under the status card and Stop, the Tools tab has six sub-tabs:
  Claim list, Songs, Fix tracklist, Ads, Collab and Options. They replace the buttons that
  opened each tool over the pane. A tool keeps what was typed or ticked in it when you switch
  to another one and back. Changing channel starts every tool again.
- **Ads and Collab open from their sub-tab.** With no check yet for the channel, the sub-tab
  offers "Check for ads off" or "Read video list". A finished check or scan opens its sub-tab.
- **A finished run is not run again by a second click.** After a run, the videos it turned on
  (Ads) or invited (Collab) are unticked; a failed one stays ticked to try again. A new ads or
  Collab batch is refused while the previous one is still running.
- **Options follows settings saved elsewhere.** A setting saved from another panel window
  shows in the open form, and Save writes only what was changed in this one. Cancel drops the
  changes made here.
- Rescan, Recheck and Reload list stay available while another Studio tab runs a job. Trim,
  Turn on ads and Invite wait for that job to end.

## 5.0.3 — 2026-10-15

A fix for accepting collaboration invites. To update, follow README, "Update"; the extension ID
stays `cllefnlbgkbdnmifojjflfcpholhniio`, so presets, settings and history stay.

- **Accepting an invite waits for YouTube to load it.** Before, Accept was pressed as soon as
  the invite card showed, before its details had loaded, and YouTube showed an error. Now the
  card must stay unchanged for about 5 seconds first, a request in the "Collaboration requests"
  list is opened after about 3 seconds, and that list is closed as empty only after it has had
  no rows for about 8 seconds (it may still be loading them).
- **Several invites are accepted from one click on the link.** After each accept, YouTube
  removes the inviting channel from the address, so the extension could not open the invite
  link again for the next request, and the link had to be opened again by hand. It now
  remembers the inviting channel from the start.
- The invite steps (`[ytup] invite: …`) are now in the debug report's log.

## 5.0.2 — 2026-10-15

Two more fixes for switching channels. To update, follow README, "Update"; the extension ID
stays `cllefnlbgkbdnmifojjflfcpholhniio`, so presets, settings and history stay.

- **A switch picks the channel by its @handle, never by its name.** YouTube's channel
  switcher lists each channel by name and @handle only. Before, a channel with no stored
  @handle was picked by the first row starting with its name, so "TrapSoul Mix" could pick
  "TrapSoul Mix 2" and move every Studio tab to the wrong channel. Now Switch in the channel
  list looks a missing @handle up on the channel's public YouTube page and remembers it. If
  none is found, it says "Couldn't find the @handle of "…", so not switching" and stays on
  the current channel; use YouTube's own Switch account then.
- **No more Oops after a switch when the channel's own page refuses.** After a switch, the
  extension opens the channel's page again when YouTube shows "Oops, you don't have
  permission to view this page". Sometimes that page kept refusing, while Studio's own
  "Return to Studio" worked. Now, after two tries, it opens the Studio home page once, as
  that button does. You then land on the channel's dashboard rather than the page you came
  from.

## 5.0.1 — 2026-10-15

A fix for switching channels. To update, follow README, "Update"; the extension ID stays
`cllefnlbgkbdnmifojjflfcpholhniio`, so presets, settings and history stay.

- **Switching channels no longer sticks on "Oops, you don't have permission to view this
  page".** Right after a switch, YouTube often lands on that page (`?sttick=0`) before the
  new channel takes effect, and the extension then loads the channel's page again by itself.
  In 5.0.0 that step failed on every Studio tab ("TypeError: Illegal invocation" in the debug
  log, hundreds of times), so the tab stayed on Oops although the switch had worked. It now
  loads the page again and the tab arrives in Studio.

## 5.0.0 — 2026-10-15

The first release of the extension. It replaces the Tampermonkey userscript (v4.27.1); see
`README.md`, "Install" and "Moving from the userscript", and `PARITY.md` for every difference.

What is different from the userscript:

- The panel is Chrome's side panel (toolbar button or Alt+P). It is docked, not see-through.
- Files are dropped on the side panel. The queue survives reloads and channel switches. After
  a browser restart, or after the extension is reloaded or updated, the queued files must be
  asked for again: pressing Start does it (so does "Re-grant access"), with no Chrome prompt
  expected. In between, the extension keeps hold of the queued files, looks at their access
  again whenever the panel is shown, and asks inside the Start click. Chrome's source code
  suggests that holding a file is what keeps it readable; this is not yet confirmed in
  Chrome (README item 88).
- To be asked once instead: when that banner shows, and before pressing Start or "Re-grant
  access", its "Always allow…" button (also Settings → Troubleshooting) opens a page in a
  tab where Chrome can show its own question; pick "Allow on every visit" there. After that
  the queued files are expected to stay readable through restarts and updates with no
  click; that part is from Chrome's documentation and not yet confirmed in Chrome (README
  item 89).
- A preset's artist list is a pool: `{artists}` is a random pick from it for each video, not
  the names found in the tracklist (a preset with an empty pool still reads the tracklist).
  The pool is edited as chips.
- One Studio tab works at a time: an upload run, or a trim / ads / Collab run.
- Auto-pilot wakes its Studio tab on time, and a desktop notification says when a cycle is due
  and no Studio tab is open.
- The language changes without a reload.

New in this release:

- One extension ID on every computer and for every folder: `cllefnlbgkbdnmifojjflfcpholhniio`.
  A test build installed before 5.0.0 has another ID: see README, "Update".
- **Update available.** About once a day the extension looks at this repo's latest GitHub
  release, and the panel shows a banner with a link when it is newer than the installed
  version. The banner stays until you update.
- **The move file.** Import reads the file the userscript's last version (v4.29.0) exports
  with "Export everything for the extension": your upload history, channel list and language
  come along when you say the file is yours.
- **The Tampermonkey script still on.** While it is on in a Studio tab, the extension starts
  no upload and no copyright run there, its copyright steps wait, it does not press Save on a
  trim for you, and a queue already running stops after its current video. The side panel and
  the status card say so. Scans, the status and Stop keep working.
- **Per week** (the userscript did not have this). The schedule box has a second way to make
  the release times, next to "Every N days/hours", which is unchanged and stays the default:
  a number of videos a week (1 to 7) between two times of day. The days change from week to
  week, are spread over the week and never hold two videos; the times are quarter hours
  inside the window and change from video to video. "Shuffle" draws another set. Not yet
  tried in Chrome (README item 90).
- Studio tabs opened before this build must be reloaded once: the tab and the panel now check
  that they are the same build.
- The round Studio button opens the side panel on the tab of what is running (Upload during a
  run, Copyright during copyright work). A click on the "queue finished" notification and a
  multi-file pick in Studio's own dialog show the Upload tab. A panel that is already open
  switches too.
- While another Studio tab runs the queue or copyright work, a multi-file pick or drop in this
  tab is left to YouTube's own upload, and the page now says so.
- When the progress display or the round Studio button in the page fails, the page says so
  once ("The progress bar stopped … try reloading the page"), as the userscript did.
- The message shown in the Studio page (toast) has the look it had in the userscript: a dark
  glass box and a white tick.
- "Pick a whole folder" and a dropped folder take the files at every depth. More than 2000
  files in the picked or dropped folders is refused with a message; a folder that can't be
  read is passed over with a message; hidden files are left out.
- The trim question and the Auto-pilot question open with Cancel selected: Enter does not
  start a trim or turn Auto-pilot on (a trim cannot be undone). A double-click on Trim
  selected or on the Auto-pilot switch cannot answer the question either: a press in its first
  0.8 s and the second click of a double-click are ignored, and Cancel stays selected.
- An ads, trim or Collab run that waits for the upload queue now says what ends the wait:
  "upload or remove the videos still waiting in the queue". Failed videos don't hold it back,
  and the ads and trim message no longer says to remove them.
- **Additions the userscript did not have: the daily upload limit.** When Studio reports
  YouTube's daily upload limit the queue pauses instead of ending: the refused video goes back
  to Queued, the panel shows "Paused: daily upload limit … resumes <time>", and 24 hours later
  a Studio tab on that channel goes on by itself (Start resumes sooner, Stop cancels the
  pause). The pause survives reloads and a browser restart. Before Start, a warning says when
  this browser's uploads to the channel in the last 24 hours plus the queue go over your own
  number (Settings → "Daily upload limit", default 15, 0 = off). It is an estimate and blocks
  nothing: YouTube publishes no number and counts uploads from every device. Studio's real
  limit message has not been seen yet (README item 93).
- **Addition the userscript did not have: batches.** After 15 videos (Settings → "Batch
  size", 0 = off, 50 at most) the queue waits until Studio has finished uploading them, then
  goes on. The batch's last video is not saved while its own dialog still says "Uploading".
  Whether the batch's earlier uploads have finished cannot be read from Studio so far; the
  queue then says "Could not check…" and goes on (README item 91).
- **Addition the userscript did not have: retry on the draft.** A video that fails after its
  file became a draft in Studio is no longer uploaded again. The queue opens that draft's
  upload dialog again and redoes what is left (details, thumbnail, release time, Save), twice
  by itself before it moves on; the card says "Retrying on the draft (1 of 2)…". **Retry** on
  such a card asks "Resume draft" (selected) or "Upload again". When the draft cannot be
  opened the card is the error it was, with its draft id. How Studio opens a draft's dialog
  is a guess that has not been tried in Chrome (README item 94).
- **Resume drafts (N).** When failed videos are drafts in Studio, the Upload tab shows one
  button above Start that puts all of them back in line and starts the queue: each is
  finished in its draft, no file is uploaded again. Failed videos with no draft stay errors
  and a toast says how many. Drafts being resumed are not counted in the daily-limit warning
  and their video files need not be readable. Not tried in Chrome (README item 94).
- A failed video whose Studio dialog cannot be closed now stops the queue with one message;
  the videos after it stay Queued. Before, each of them failed with "An upload dialog is still
  open" and was shown the first video's draft id. A video that never handed its file to
  Studio gets no draft id any more.
  Cards an earlier build of 5.0.0 left that way are repaired when the Studio tab loads the
  queue: the cards that failed on "An upload dialog is still open" lose the draft id that
  was not theirs, and the card that owns the draft can be resumed.
- "Could not open the calendar": the clicks go to the date field that is in the dialog at
  that moment, and the message says when the Studio tab was in the background. The cause of
  the failure seen on a 3.5-hour video is not known.

Not in the extension yet:

- "Copy a pattern from a video" (userscript v4.28.0). Planned as 5.1.0.
- The schedule summary's tooltip lists the times of the videos already scheduled on the
  channel, without their titles.
- The copyright activity log keeps only the lines logged while a side panel is open on the
  tab; what happened with the panel closed is not shown.
- After a question closes, keyboard focus does not go back to the button that asked.

Not carried over from the userscript: claim scans, trim results, the trim list, Ads and
Collab lists, Auto-pilot on/off (scan again and turn Auto-pilot on again), and videos waiting
in the queue. The claimed-songs history moves as a CSV.

The extension has no icon artwork yet: Chrome shows its own tile with a letter, and desktop
notifications show a red dot.
