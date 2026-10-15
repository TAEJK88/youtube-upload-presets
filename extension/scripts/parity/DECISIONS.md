# Decisions the parity rows cite

Each line is one decision the owner approved. `<phase>-<number>` is the judgment call's number
in that phase's planning report; `owner-<date>` is an answer given outside a numbered call.

## Phase 4 (approved 2026-10-10, calls 35 and 36 on 2026-10-11)

- **P4-1** The pin: line numbers and port-checks use `d15ef87` (v4.27.1), which is `port-check`'s `PIN`.
- **P4-2** Two plans (4a and 4b); the ads and Collab scans are in 4a.
- **P4-3** Deferred item 8 is dropped: it was already done in `36727ff`.
- **P4-4** Per-channel copyright data is not migrated from the userscript; the claimed-songs history moves as a lossy CSV.
- **P4-5** file-gc is unchanged: no copyright key holds a file handle.
- **P4-6** Ops for the one writer (`set`, `merge`, `list`, `runItem`, `songs`) in the `store:patch` queue: partial ops replace the userscript's whole-object writes.
- **P4-7** Scans take no lock, as the userscript let a scan overlap an upload.
- **P4-8** A trim, ads or Collab page change waits while any other Studio tab uploads or does copyright work.
- **P4-9** Takeover: the background frees the lock and the worker lease when a tab closes or leaves Studio; another tab on the channel takes over about 10–15 s after a closed worker tab and 20 s after one that hangs.
- **P4-10** A page restored from the back/forward cache that lost the lock stops at once; its video stays a draft.
- **P4-11** Queue Start is refused while another tab does copyright page changes, with a banner.
- **P4-12** The queue holds copyright page changes and Auto-pilot's start back only while videos are waiting or uploading and no other tab is uploading them; failed uploads no longer hold them back.
- **P4-13** Auto-pilot runs on alarms: one one-shot alarm per channel for a future cycle; it wakes only that channel's worker tab, and with no Studio tab nothing runs until one opens.
- **P4-14** youtubei calls time out after 30 s; the MAIN world serves only the four endpoints the module uses.
- **P4-15** "Not signed in" is said by the content script (the MAIN world has no language).
- **P4-16** `INNERTUBE_CONTEXT` comes from the `refreshCfg` copy, re-read every 10 s while missing.
- **P4-17** Copyright UI layout: modals become views with Close, tables become one card per row, confirmations use `ask()`; "Settings saved" is a panel toast; the Auto-pilot on/off log line shows only in the panel that clicked.
- **P4-18** The activity log lives in the panel (last 80 lines from the bound tab and the lock holder) and survives a trim's page changes.
- **P4-19** CSV downloads come from the panel, with the same file names and columns.
- **P4-20** The same queue card edited in two windows: a per-item merge, the later save wins.
- **P4-21** The queue's confirmation signature covers schedule, thumbnails and the pending presets' visibility, with a new refusal string.
- **P4-22** A file the browser blocked says "The browser blocked reading this file — remove it from the queue and add it again".
- **P4-23** `L()` constants are lazy (fixes "always English").
- **P4-24** The confirm-changes watcher is removable.
- **P4-25** Collab handles are saved 400 ms after typing.
- **P4-26** Ads and bulk Collab are in scope ("port, don't redesign").
- **P4-27** Trim lives in `lib/claims/claims.ts`; the spec is amended.
- **P4-28** `tabLock:<ch>` moves to `storage.session` (`claimsWorkers`).
- **P4-29** Stop goes to the lock holder when it runs copyright work elsewhere.
- **P4-30** A backup import is refused during any lock job, reusing "Stop the queue before importing".
- **P4-31** One worker per channel, as in the userscript: the tab lease returns as a background lease; exactly one Studio tab per channel runs Auto-pilot, follow-ups and run steps, and gets the alarm.
- **P4-32** A Stop that lands while a step waits for the lock ends the step before any page change.
- **P4-33** The "Auto-pilot is due" desktop notification: when a channel's alarm fires and no Studio tab can run the cycle, one notification names the channel, once per channel and due time; a click opens Studio on that channel.
- **P4-34** The worker lease is asked every 10 s and its answer trusted for 15 s (approved 2026-10-10).
- **P4-35** The Auto-pilot alarm also wakes an open Studio tab whose lease looks expired (Chrome slows a hidden tab's timers); the notification shows only when no tab can be reached (approved as built, 2026-10-11).
- **P4-36** An alarm more than 60 s past its time still wakes the tab but shows no notification (approved as built, 2026-10-11).
- **owner-2026-10-11-incomplete-scan** Auto-pilot carries on after an incomplete scan, as in the userscript; stopping on an incomplete scan was declined.

## Phase 5 (answered 2026-10-11)

- **P5-1** 2026-10-11: The parity base stays v4.27.1. "Copy a pattern from a video" (userscript v4.28.0) is ported after the switch, as extension 5.1.0, not before.
- **P5-4** 2026-10-11: The "Update available" banner stays until the user updates; no "Later" or hide button.
- **P5-5** 2026-10-11: Yes to a manifest key, so the extension has one id on every computer.
- **P5-7** 2026-10-11: Yes. While the Tampermonkey script is on in a Studio tab, the extension starts nothing there and says why.
- **P5-8** 2026-10-11: Yes to the move file. Upload history, the channel list and the language move with people.
- **P5-9** 2026-10-11: The script's "we moved" notice as planned: always in its panel, one toast a day, never during a run, and the script keeps working.
- **P5-12** 2026-10-11: The work goes to `main` as one combined entry, like the earlier pull requests.
- **P5-17** 2026-10-11: The owner runs the key commands himself; agents only ever see the public half.
- **owner-2026-10-11-key-now** The owner moves his own installed copy to the keyed build now, not at the release.
- **owner-2026-10-11-thai** The team's instructions are written in Thai as well as English.
- **P5-4-check** 2026-10-11: Yes to the update check itself: the background asks GitHub for the latest release once a day; no off switch.

## Phase 5 (answered 2026-10-12): the parity rows and the points raised by the reviews

- **P5-row-progress-toast** 2026-10-12: Port it. When the progress bar's tick fails, the page says once "The progress bar stopped … try reloading the page", as the userscript did.
- **P5-row-tab-choice** 2026-10-12: Port it. A click on the Studio button opens the panel on the running task's tab; a click on the "queue finished" notification and a multi-file pick in Studio's own dialog show the Upload tab.
- **P5-row-intercept-second-tab** 2026-10-12: While another Studio tab runs the queue, a multi-file pick in this tab is left to Studio (it uploads the files itself, without presets), and the page now says so with a toast.
- **P5-row-toast-look** 2026-10-12: Port it. The toast in the Studio page gets the look the drawer ended with (glass box, white tick).
- **P5-row-folder-depth** 2026-10-12: Port it. "Pick a whole folder" takes the files at every depth, as the userscript did.
- **P5-row-schedule-tooltip** 2026-10-12: Not in 5.0.0, planned. The schedule summary's tooltip lists the times of the videos already scheduled, without their titles.
- **P5-row-page-font** 2026-10-12: As built. IBM Plex Sans Thai is not loaded into the Studio page; the Studio button, the page toast and the reload banner use the computer's fonts. The font would have to be made readable by the Studio page, which the manifest rule does not allow.
- **P5-row-fab-visible** 2026-10-12: As built. The Studio button stays visible and clickable while the side panel is open; the page is not told whether the panel is open.
- **P5-row-trim-count** 2026-10-12: As built. "Trim selected (N)" counts the picks that are in the latest scan and not done, the ones that will be trimmed.
- **P5-row-message-place** 2026-10-12: As built. A message raised by a button shows where the user is looking: the claim list and the tracklist fix open their view and say there that nothing is scanned or claimed yet, and an invite with no handle says so in a toast.
- **P5-ask-cancel** 2026-10-12: The trim question and the Auto-pilot question open with Cancel selected, so Enter does not start a trim or turn Auto-pilot on.
- **P5-log-panel-closed** 2026-10-12: Not in 5.0.0, planned. The copyright activity log keeps only the lines logged while a side panel is open on the tab; what happened with the panel closed is not shown.
- **P5-7-save** 2026-10-12: While the Tampermonkey script is in the page the extension does not press Save on a trim for anyone ("press Save for me" waits too).
- **P5-7-run-stop** 2026-10-12: An upload run that started before the Tampermonkey script appeared in the page stops after the video in progress.
- **P5-8-nameless** 2026-10-12: A move file's channel without a name is imported (the userscript and the extension both store such channels).
- **P5-folder-extras** 2026-10-12: Keep all three. A folder's hidden (dot-named) files are left out; a folder with more than 2000 files is refused whole with a message; a folder dropped on the panel is read at every depth, like a picked one.

## Phase 5: what the answers of 2026-10-11 carry with them

These three were not asked as separate questions: the plan lists them as parts of calls 7 and 8, which the owner approved.

- **P5-16** 2026-10-11: Follows from P5-7. The tab-and-panel protocol number goes from 2 to 3, because the queue view gains a field (is the Tampermonkey script in the page); a Studio tab left open from an older build is reloaded once.
- **P5-18** 2026-10-11: Part of P5-8, as planned. A move file's language replaces the language chosen in the extension, each time the file is imported as "My file".
- **P5-19** 2026-10-11: Part of P5-8, as planned. Upload-history rows without a video id are imported; a row needs a date, a channel and a file name.

## Phase 5 (2026-10-12): read access to the queued files

The owner reported that every Start asked for "Re-grant access" and said: "i want to grant always one time only". Nothing below is a parity row; the userscript read files the page was given and had no stored file access to lose.

- **P5-file-start-gate** 2026-10-12: Start is no longer switched off while queued files lack read access. The button stays enabled whatever the banner says.
- **P5-file-start-asks** 2026-10-12: Start asks the browser for read access inside its own click, before anything else, for the files of that run. The run is not sent while one of them stays at "ask"; a blocked file fails its own item when its turn comes.
- **P5-file-allow-once** 2026-10-12: The answer to "grant once" is a page of the extension opened in a normal tab, "Allow file access". The owner's Chrome shows no prompt in the side panel and the three-button prompt in a tab; choosing "Allow on every visit" there is expected to keep every queued file readable in the panel and in Studio, across restarts and updates. Seen in his Chrome: the three buttons. Not yet seen: that the choice lasts. Copying the videos into the extension's own storage was the other way to get "once" and was not taken (every video would be on the disk twice).
- **P5-file-allow-once-seen** 2026-10-12: Seen in the owner's Chrome 155 with the build of `e28864f` (README item 89): the page's button brought one question with three buttons; he picked "Allow on every visit"; no banner after the page's tab was closed, and none after Chrome was quit and opened again. The choice lasts across a restart. Not yet seen: the same after a reload or an update of the extension.
- **P5-file-allow-once-reload** 2026-10-13: Seen in the owner's Chrome (README item 89, second half of step 7): with two more clips queued, the extension and the Studio tab were reloaded and no banner showed. The choice lasts across a reload of the extension, for files added after it was made. Not yet seen: the same after an update to a newer version.
- **P5-file-allow-once-update** 2026-10-13: Seen in the owner's Chrome: the folder Chrome loads from was replaced by a test build numbered 5.0.1 (the code of `f284abc`, only the version changed) and the extension reloaded. The card read 5.0.1, no banner showed, Start uploaded the queued clips and Chrome asked nothing. The choice lasts across an update to a newer version. "Grant once" is now seen for a closed tab, a restart, a reload and an update.

## Phase 5 (2026-10-13): an addition the userscript never had

- **P5-week-schedule** 2026-10-13: The owner asked for an "anti-same pattern": a number of videos a week, spread over different days and times. Built into 5.0.0 as a second way to schedule, next to "Every N days/hours", which stays the default and is unchanged. Times: random inside a daily window he sets, on Studio's 15-minute steps. Days: random, different from week to week, never two videos on one day, spread out over the week.
- **P5-daily-limit** 2026-10-13: The owner asked for more than the userscript did at YouTube's daily upload limit (the userscript stopped the queue). Built into 5.0.0: when Studio reports the limit the queue pauses instead of ending, shows when it resumes, and goes on by itself 24 hours later. Before Start, a warning compares this browser's uploads to the channel in the last 24 hours plus the queue with a number he sets in Settings (default 15), and says it is an estimate: YouTube publishes no number, and counts uploads from every device.
- **P5-artist-pool** 2026-10-13: The owner asked that a video title "do not need to check the tracklist, use random from artist pool", and that the Artists field be chips. Built into 5.0.0: a preset's artist list is the pool, and `{artists}` is a random pick of "Max in video title" names from it, in the title, the description and the tags alike. The pick is drawn from the clip's file name and number, so one clip keeps its names every time they are built and another clip gets others. Names typed on a queue card still win. A preset with an empty pool reads the tracklist as before. The userscript is unchanged (it still orders the tracklist's names).
- **P5-upload-batches** 2026-10-13: The owner asked for uploads in batches: after 15 videos have been handed to Studio, the queue waits until Studio has finished uploading them, then goes on with the next 15. The userscript went on to the next video as soon as a video's dialog closed, however many files Studio was still uploading. Built into 5.0.0 with the batch size in Settings (default 15, 0 turns it off).
- **P5-week-schedule-seen** 2026-10-14: Seen in the owner's Chrome with the build of `666b202` (README item 90): "Per week" shows its fields; 7 queued clips got different days and quarter-hour times between 17:00 and 21:00; the times stayed after the panel was reopened; Shuffle changed them. Not yet reported: a real upload scheduled at a card's time, removing a clip, the window and count limits, a time the channel already uses, a start that has passed, the switch back to "Every …", and the backup.
- **P5-week-schedule-upload** 2026-10-14: Seen in the owner's Chrome (README item 90, step 9): a run of 2 clips was started in "Per week" mode and the first video was "Scheduled" in Studio → Content at exactly the time its card showed. The weekly times reach YouTube. Not yet reported: the second video of that run, removing a clip, the window and count limits, a time the channel already uses, a start that has passed, the switch back to "Every …", and the backup.
- **P5-draft-retry** 2026-10-14: The owner asked for a way to retry a video that failed after its file was already uploaded as a draft, without uploading the file again (seen in his Chrome: "Scheduling failed: Could not open the calendar" on a 3.5-hour video, and the two videos after it failed with "An upload dialog is still open" and the first video's draft id). Built into 5.0.0: such a video is retried on its draft, automatically during the run and from the card's Retry; a video that never gave its file to Studio is not called a draft; a dialog that cannot be closed stops the run instead of failing every video after it. The userscript asked the user to delete the draft and upload again.
- **P5-draft-retry-seen** 2026-10-14: Seen in the owner's Chrome (README item 94, step 2): after he closed Studio's dialog on an uploading video, the card said "Retrying on the draft (1 of 2)…". The failure is noticed and the retry starts. Not yet reported: whether the draft's dialog opened again and the video was finished on it.
- **P5-switch-by-handle** 2026-10-15: The owner asked that a channel switch pick the channel switcher's row by @handle only, and warn instead of guessing from the name. The userscript fell back to the first row that starts with the name, which picks "TrapSoul Mix 2" for "TrapSoul Mix" and moves every Studio tab to the wrong channel. None of the owner's three stored channels had a handle (Studio's drawer did not show one), so the panel looks a missing handle up on the channel's public page (www.youtube.com/channel/<id>, its own externalId and vanityChannelUrl) and remembers it. When none is found the switch is refused with a toast that points to YouTube's own Switch account.
- **P5-switch-home** 2026-10-15: Seen in the owner's Chrome with the build of PR #6: after a switch to PLAYNOW®, `studio.youtube.com/channel/<id>` (without `?sttick=0`) still said "Oops, you don't have permission to view this page", while Studio's own "Return to Studio" opened PLAYNOW® normally. The owner asked that, once the two retries on the clean URL still show Oops, the recovery go to `studio.youtube.com/` once instead of giving up. The userscript gave up there and left the tab on Oops.
- **P5-invite-settle** 2026-10-15: The owner reported that accepting a collaboration invite errors because "there is no time for the data to show up". The userscript clicked Accept on the first poll after its 2.5 s pause, and closed a "Collaboration requests" box with no rows on the first poll that saw it, although the box may only be loading its rows. Now the Accept card must stay unchanged (its text) for 5 polls before Accept is clicked, a row must be seen for 3 polls before it is opened, and a row-less box must stay so for 8 polls before it is closed. The watcher's console lines start with "[ytup] invite:" so they reach the debug report. Seen in the owner's Chrome with that build the same day: both requests were handled (each card closed and the link then offered no more), but after each accept the URL had lost `d=acd` and `inviterChannelId`, so the link was not reopened for the next request. The inviter (and the channel) seen when the watcher starts is now kept, from the query or from the `/collaboration/<inviter>` link itself.
