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
