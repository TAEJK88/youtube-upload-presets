# Changelog

The version is `version` in `package.json` (the manifest's version). A release is the tag
`v<version>` on GitHub with the zip attached.

TODO(key): once the public key line is in `wxt.config.ts`, add to the 5.0.0 section, under "New in this release": "- One extension ID on every computer and for every folder: `<the id computed from the key>`. A test build installed before 5.0.0 has another ID: see README, "Update"." This line sits above the section on purpose: the section is cut as the release notes.

## 5.0.0 — unreleased

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
- One Studio tab works at a time: an upload run, or a trim / ads / Collab run.
- Auto-pilot wakes its Studio tab on time, and a desktop notification says when a cycle is due
  and no Studio tab is open.
- The language changes without a reload.

New in this release:

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
