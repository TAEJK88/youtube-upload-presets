// Parity rows: the copyright UI, lines 4587-6356 outside the port regions.
const TAB = 'entrypoints/sidepanel/tabs/CopyrightTab.tsx';
const VIEW = 'entrypoints/sidepanel/tabs/copyright/';
const T_TAB = 'tests/panel-copyright.test.tsx';
const T_RUN = 'tests/panel-copyright-run.test.tsx';
const T_ADS = 'tests/panel-ads-collab.test.tsx';
const T_PICK = 'tests/panel-claims.test.ts';
const T_SET = 'tests/panel-copyright-settings.test.tsx';
const NOT_IN_SCAN = 'extension-only.mjs: The chosen videos are not in the latest scan — scan again and try again';

export default [
  // the module
  { lines: ['4592', '6356'], status: 'changed', home: ['lib/claims/claims.ts', 'lib/claims/page.ts', 'lib/claims/wiring.ts'], cite: 'spec: Modules (cut along the seams already in the IIFE)', test: 'tests/claims-page.test.ts',
    note: "the Claims module's wrapper and what it hands out: an ES module now. tick is claimsTick, status is claimsStatus, renderStatus is the claims:state broadcast, listScheduled is wired in wiring.ts; claimedSongsIn is in lib/claims/core.ts, fixTracklist in lib/tracklist.ts, buildPane is the Copyright tab" },
  { lines: ['4621-4622'], status: 'changed', home: ['lib/claims/claims.ts', 'lib/studio/channel.ts'], cite: 'decision: P4-16', test: ['tests/claims-page.test.ts', 'tests/claims-scan.test.ts'], readme: [55],
    note: "ycfg(): Studio's ytcfg is read from the copy the MAIN world hands over (no unsafeWindow), again every 10 s while the context is missing; a CHANNEL_ID that is not a channel id is not taken" },

  // the claim list's CSV
  { lines: ['4839-4840', '4842-4848', '4931'], status: 'changed', home: ['lib/claims/core.ts', VIEW + 'ClaimList.tsx', 'lib/panel/download.ts'], cite: 'decision: P4-19', test: ['tests/claims-core.test.ts', T_TAB], readme: [46, 51],
    note: "claimsCSV() and the claim list's CSV button: the same columns and file name, saved from the panel" },
  { lines: ['4841'], status: 'dropped', cite: 'dropped.mjs: Not scanned yet', note: 'claimsCSV() without a scan logged "Not scanned yet": the CSV button is only in a list that has a scan' },

  // modals
  { lines: ['4851-4858'], status: 'changed', home: VIEW + 'SubView.tsx', cite: 'decision: P4-17', test: T_TAB, readme: [46, 50],
    note: 'openModal() / closeModal(): a modal is a view of the Copyright tab with its title and Close. A click beside the box closed a modal; a view has no outside to click' },

  // the claim list (showClaims)
  { lines: ['4860-4862'], status: 'changed', home: VIEW + 'ClaimList.tsx', cite: 'decision: P4-17', test: T_TAB,
    note: 'Claim list before a scan: the userscript opened nothing and wrote "Channel … not scanned yet" to the activity log; the view opens and says it there' },
  { lines: ['4863-4868', '4875-4877', '4879-4880', '4882-4911'], status: 'changed', home: [VIEW + 'ClaimList.tsx', 'lib/panel/claims.ts'], cite: 'decision: P4-17', test: T_TAB, readme: [46, 54, 56],
    note: 'the claim list\'s rows: one card per claim instead of a table row, with the same texts (video link, privacy and length, scheduled time, song, claimant, ranges and % of the video, impact, result), the tick box with its three tooltips and "Tracklist after trim" once per video. A tick is one write through the background (P4-6); picks that are done leave the stored list; the open list follows what is stored' },
  { lines: ['4881'], status: 'dropped', cite: 'dropped.mjs: Claimed song', note: "the claim table's header row (Trim, Video, Claimed song, Claimant, Claimed range, Impact / Result): cards have no header" },
  { lines: ['4870-4874', '4913'], status: 'missing',
    note: 'the "✂ Trim selected (N)" button. Nothing to port; built differently with no decision line: the userscript counted every stored pick, also a claim that is no longer in the scan, and the question that followed then named fewer; the panel counts the picks that are in the scan and not done, the ones that will be trimmed (entrypoints/sidepanel/tabs/copyright/ClaimList.tsx, pinned by tests/panel-copyright-run.test.tsx)' },
  { lines: ['4912', '4920-4927'], status: 'same', home: ['lib/panel/claims.ts', VIEW + 'ClaimList.tsx'], test: [T_PICK, T_TAB], readme: [56],
    note: 'the claim list\'s "Select:" chips (All trimmable, Not my own songs, Affects video, Scheduled + affected, Claimed range < 20%, None)' },
  { lines: ['4915-4919', '4928-4930', '4932-4936'], status: 'changed', home: [VIEW + 'ClaimList.tsx', VIEW + 'SubView.tsx'], cite: 'decision: P4-17', test: T_TAB, readme: [46, 50],
    note: 'the claim list\'s frame: title, the counts line, "No claims found", the "Ticking only builds a list" line, Rescan and Close. A view, its button row at the bottom edge' },

  // the tracklist after a trim
  { lines: ['4939-4978'], status: 'same', home: 'lib/tracklist.ts', test: T_TAB, readme: [68],
    note: 'parseTime() and fixTracklist(): the tracklist after a trim (cut songs removed, later times moved up, the first one at 00:00). Its own tests are tests/tracklist.test.mjs' },
  { lines: ['4980-4982', '4984', '4986-4992'], status: 'changed', home: [VIEW + 'TracklistFix.tsx', 'lib/panel/claims.ts'], cite: 'decision: P4-17', test: [T_TAB, T_PICK], readme: [46, 68],
    note: 'Fix tracklist, choosing a video: each claimed video once, with its length and where its tracklist will come from. A view' },
  { lines: ['4985'], status: 'changed', home: VIEW + 'TracklistFix.tsx', cite: 'decision: P4-17', test: T_TAB,
    note: 'Fix tracklist with no claimed video: the userscript opened nothing and toasted "No claimed videos yet"; the view opens and says it there' },
  { lines: ['4993-4997', '5006-5033', '5038-5040'], status: 'changed', home: VIEW + 'TracklistFix.tsx', cite: 'decision: P4-17', test: T_TAB, readme: [46, 50, 68],
    note: 'the tracklist editor: the uploaded tracklist filled in, a tick per trimmed range (already trimmed ones ticked), the new tracklist and its summary line. A view' },
  { lines: ['4998-5005'], status: 'same', home: VIEW + 'TracklistFix.tsx', test: T_TAB, readme: [46, 68], note: "a .txt dropped on the tracklist editor's box replaces its text" },
  { lines: ['5034-5037'], status: 'changed', home: VIEW + 'TracklistFix.tsx', cite: 'spec: GM replacements', test: T_TAB, readme: [68],
    note: '"Copy new tracklist": navigator.clipboard in the panel instead of GM_setClipboard, the same toast; a refused copy is said ("Couldn\'t copy the tracklist")' },

  // one worker tab per channel
  { lines: ['5043-5049'], status: 'changed', home: ['lib/runner-lock.ts', 'entrypoints/background.ts'], cite: 'spec: GM replacements', test: 'tests/runner-lock.test.ts', readme: [52],
    note: "TAB_ID: the tab's own name for the lease. The background uses Chrome's tab id of the tab that asks; nothing is kept in sessionStorage" },
  { lines: ['5050-5062'], status: 'changed', home: ['lib/claims/claims.ts', 'lib/runner-lock.ts'], cite: 'decision: P4-31', test: ['tests/runner-lock.test.ts', 'tests/claims-status.test.ts'], readme: [52, 64],
    note: "isWorker(): one worker tab per channel, stale after 20 s, renewed every 5 s, force takes it. The lease is the background's (P4-28); a tab asks every 10 s and trusts the answer for 15 s (P4-34); a closed tab frees it at once (P4-9)" },

  // claimed songs
  { lines: ['5067'], status: 'changed', home: ['lib/claims/songs.ts', 'lib/claims/ops.ts'], cite: 'decision: P4-6', test: ['tests/claims-songs.test.ts', 'tests/claims-keys-ops.test.ts'],
    note: 'setSongs(): the song history was written whole; every change is one op the background applies (record, trimmed, import, delete, clear)' },
  { lines: ['5105-5114', '5246'], status: 'changed', home: ['lib/claims/core.ts', VIEW + 'Songs.tsx', 'lib/panel/download.ts'], cite: 'decision: P4-19', test: ['tests/claims-core.test.ts', T_TAB], readme: [51, 67],
    note: "songsCSV() and Claimed songs' CSV button: the same columns and file name, saved from the panel" },
  { lines: ['5188'], status: 'same', home: ['lib/studio/queue-view.ts', 'entrypoints/sidepanel/panel.tsx'], test: 'tests/queue-view.test.ts', readme: [67],
    note: 'refreshClaimWarnings(): the queue cards\' "previously claimed" chips follow a change of the song history' },
  { lines: ['5190-5204'], status: 'same', home: ['lib/panel/claims.ts', VIEW + 'Songs.tsx'], test: [T_PICK, T_TAB], readme: [46, 67],
    note: 'Claimed songs: the list searched (song, artist, label, claimant), sorted four ways, with its count line' },
  { lines: ['5205-5223'], status: 'changed', home: VIEW + 'Songs.tsx', cite: 'decision: P4-17', test: T_TAB, readme: [46, 67],
    note: 'Claimed songs\' rows: one card per song instead of a table row, with the same texts; ✕ asks "Sure?" then removes it (one write through the background); "No matching songs" and "No data yet"' },
  { lines: ['5224-5227'], status: 'same', home: VIEW + 'Songs.tsx', test: T_TAB, readme: [46, 67], note: "Claimed songs' search box and sort menu" },
  { lines: ['5228', '5244'], status: 'changed', home: [VIEW + 'Songs.tsx', 'lib/claims/songs.ts'], cite: 'extension-only.mjs: This file is too large — the limit is ${} MB', test: [T_TAB, 'tests/claims-songs.test.ts'], readme: [46, 67],
    note: '"Import CSV": the same file and the same two toasts; the background adds the rows (P4-6). New: a file over 16 MB is refused, and a file that can\'t be read is said' },
  { lines: ['5229-5233'], status: 'same', home: VIEW + 'Songs.tsx', test: T_TAB, readme: [46, 67], note: '"Delete all" asks once more ("Press again to delete all")' },
  { lines: ['5234-5239', '5241-5243', '5245', '5247-5251'], status: 'changed', home: [VIEW + 'Songs.tsx', VIEW + 'SubView.tsx'], cite: 'decision: P4-17', test: T_TAB, readme: [46, 50],
    note: "Claimed songs' frame: title, the explaining line, the button row, Close, the search box focused. A view" },
  { lines: ['5240'], status: 'dropped', cite: 'dropped.mjs: Claimed in', note: "the claimed-songs table's header row (Song, Artist, Claimant, Claimed in, Channel, Latest): cards have no header" },

  // Ads
  { lines: ['5289-5293'], status: 'same', home: [TAB, 'lib/panel/claims-runs.ts', VIEW + 'AdsView.tsx'], test: [T_ADS, T_RUN], readme: [65],
    note: '"Ads off": with no list it scans first; the list opens with the eligible videos not turned on yet ticked' },
  { lines: ['5294-5300'], status: 'changed', home: [VIEW + 'AdsView.tsx', 'lib/claims/claims.ts'], cite: NOT_IN_SCAN, test: [T_ADS, 'tests/claims-runs.test.ts'], readme: [65],
    note: '"Turn on ads (N)": the panel sends the ticked videos and the tab starts the run from its own stored scan (the userscript ran the rows the modal held); videos that scan no longer has are said in the activity log' },
  { lines: ['5301-5302', '5304-5314'], status: 'changed', home: VIEW + 'AdsView.tsx', cite: 'decision: P4-17', test: T_ADS, readme: [65],
    note: "the Ads list's rows: one card per video instead of a table row, with the same texts (video link, length, privacy, ineligible or off in settings, the result)" },
  { lines: ['5303'], status: 'dropped', cite: 'dropped.mjs: YouTube status', note: "the Ads table's header row (Video, Visibility, YouTube status, Result): cards have no header" },
  { lines: ['5315', '5321-5326'], status: 'same', home: ['lib/panel/claims-runs.ts', VIEW + 'AdsView.tsx'], test: T_ADS, readme: [65],
    note: 'the Ads list\'s "Select:" chips (Only off in settings, Public only, All, None)' },
  { lines: ['5316-5320', '5327-5334'], status: 'changed', home: [VIEW + 'AdsView.tsx', VIEW + 'SubView.tsx'], cite: 'decision: P4-17', test: T_ADS, readme: [65, 66],
    note: 'the Ads list\'s frame: title, the counts line, what "Ineligible" means, "All videos have ads on", Recheck and Close. A view' },

  // Collab
  { lines: ['5486-5490'], status: 'same', home: [TAB, VIEW + 'CollabView.tsx'], test: [T_ADS, T_RUN], readme: [66], note: '"Collab": with no list it reads the channel\'s videos first; the list opens with nothing ticked' },
  { lines: ['5491-5492'], status: 'changed', home: VIEW + 'CollabView.tsx', cite: 'decision: P4-25', test: T_ADS, readme: [66],
    note: 'the "Channels to invite" box: kept for next time, saved 400 ms after the typing stops (and when the view or the panel closes) instead of on every key' },
  { lines: ['5493', '5517-5519', '5533-5538'], status: 'same', home: ['lib/panel/claims-runs.ts', VIEW + 'CollabView.tsx'], test: T_ADS, readme: [66],
    note: "the Collab list's title search and its chips (All shown, Public only, Not invited yet, Failed only, None), which act on the rows the search shows" },
  { lines: ['5494-5495', '5497-5502'], status: 'changed', home: [VIEW + 'CollabView.tsx', 'lib/claims/claims.ts'], cite: NOT_IN_SCAN, test: [T_ADS, 'tests/claims-runs.test.ts'], readme: [66],
    note: '"Invite (N videos)": the panel sends the ticked videos and the handles (checked again in the tab) and the tab starts the run from its own stored scan; videos that scan no longer has are said in the activity log' },
  { lines: ['5496'], status: 'changed', home: VIEW + 'CollabView.tsx', cite: 'decision: P4-17', test: T_ADS,
    note: 'Invite with no handle: "Enter the @handle of the channel to invite first" was a red line on the status card (behind the modal); it is a toast in the panel, and the view stays open' },
  { lines: ['5503-5504', '5506-5516'], status: 'changed', home: VIEW + 'CollabView.tsx', cite: 'decision: P4-17', test: T_ADS, readme: [66],
    note: "the Collab list's rows: one card per video instead of a table row, with the same texts (video link, length, privacy, the invite's result)" },
  { lines: ['5505'], status: 'dropped', cite: 'dropped.mjs: Visibility', note: "the Collab table's header row (Video, Visibility, Collab): cards have no header" },
  { lines: ['5520', '5527-5530'], status: 'same', home: VIEW + 'CollabView.tsx', test: T_ADS, readme: [66], note: '"Invite links (send to the other channel)": one line per invited channel with its link' },
  { lines: ['5531'], status: 'changed', home: VIEW + 'CollabView.tsx', cite: 'spec: GM replacements', test: T_ADS, readme: [66],
    note: 'an invite link\'s Copy: navigator.clipboard in the panel instead of GM_setClipboard; "Copied …\'s link" is a toast (it was a line on the status card); a refused copy is said ("Couldn\'t copy")' },
  { lines: ['5521-5526', '5532', '5539-5546'], status: 'changed', home: [VIEW + 'CollabView.tsx', VIEW + 'SubView.tsx'], cite: 'decision: P4-17', test: T_ADS, readme: [66],
    note: 'the Collab list\'s frame: title, the line about sending the invite link, the handles\' label, "This channel has no videos yet", Reload list and Close. A view' },

  // questions
  { lines: ['5672-5696'], status: 'changed', home: [VIEW + 'ClaimList.tsx', 'lib/panel/claims.ts', 'lib/claims/claims.ts'], cite: 'decision: P4-17', test: [T_RUN, T_PICK, 'tests/claims-trim.test.ts'], readme: [57],
    note: 'the trim question (openTrimConfirm): asked with ask() in the panel, the same texts and warnings (own music, a busy upload queue, Studio not in English, automatic or review mode); "Start trim" sends the picks and the tab starts the run from its stored scan' },
  { lines: ['5875-5904'], status: 'changed', home: [VIEW + 'AutopilotSwitch.tsx', 'lib/panel/claims.ts'], cite: 'decision: P4-17', test: [T_RUN, T_PICK], readme: [69],
    note: 'toggleAutopilot(): off at once, on after a question that lists the rules, asked with ask() in the panel. On and off are one write of autopilot:<channel>; the "Auto-pilot turned on / off for …" line is added to the log of the panel that clicked' },

  // the pane (buildPane)
  { lines: ['6173', '6184'], status: 'changed', home: [VIEW + 'ActivityLog.tsx', 'entrypoints/sidepanel/panel.tsx'], cite: 'decision: P4-18', test: T_TAB, readme: [74],
    note: 'the activity log\'s box: the lines are kept by the panel (the last 80, from the bound tab and the tab holding the lock) and survive a trim\'s page changes; it starts open or closed as stored (logOpen)' },
  { lines: ['6182-6183', '6185', '6204-6211', '6215-6216'], status: 'same', home: TAB, test: T_TAB, readme: [46, 50],
    note: "the pane's layout: Status (the card, Scan · Ads off · Stop, then Claim list · Claimed songs · Collab), the Auto-pilot switch with the three small buttons, Activity. Buttons that don't fit a narrow panel wrap to the next line" },
  { lines: ['6186-6187', '6254'], status: 'same', home: TAB, test: [T_TAB, 'tests/claims-status.test.ts'], readme: [46, 61], note: 'the red "Studio is set to Thai" warning, shown while Studio is not in English' },
  { lines: ['6188'], status: 'same', home: [TAB, 'lib/claims/page.ts'], test: [T_TAB, 'tests/claims-page.test.ts'], readme: [46], note: 'the "Scan claims" button (the tab reads ytcfg again, then scans)' },
  { lines: ['6189', '6192'], status: 'same', home: TAB, test: T_RUN, readme: [65], note: 'the "Ads off" button: opens the list, or scans when there is none yet' },
  { lines: ['6190', '6194'], status: 'same', home: TAB, test: T_TAB, readme: [46], note: 'the "Claim list" button' },
  { lines: ['6191'], status: 'dropped', cite: 'dropped.mjs: Claimed songs', note: "the Claimed songs button's text before the first status: the panel's button always shows its count" },
  { lines: ['6193'], status: 'changed', home: [TAB, 'lib/claims/claims.ts'], cite: 'decision: P4-29', test: T_RUN, readme: [60],
    note: 'the Stop button: stops the trim, ads and Collab runs ("You stopped it"). It goes to the tab holding the lock when that tab runs the copyright work' },
  { lines: ['6195'], status: 'same', home: TAB, test: T_RUN, readme: [66], note: 'the "Collab" button: opens the list, or reads the videos when there is none yet' },
  { lines: ['6196'], status: 'same', home: TAB, test: T_TAB, readme: [46, 67], note: 'the "Claimed songs" button' },
  { lines: ['6197-6198'], status: 'changed', home: VIEW + 'AutopilotSwitch.tsx', cite: 'README: Known behaviour, Phase 4b', test: T_RUN, readme: [69],
    note: "the Auto-pilot switch and the line under it. Greyed out while the tab doesn't know its channel yet (the userscript would switch it on for a channel named 'unknown')" },
  { lines: ['6199-6203'], status: 'same', home: [TAB, VIEW + 'ActivityLog.tsx'], test: T_TAB, readme: [74], note: '"Show activity ▾" / "Hide activity ▴", and the choice kept' },
  { lines: ['6212'], status: 'same', home: TAB, test: T_RUN, readme: [62], note: 'the "Copyright settings" button' },
  { lines: ['6213'], status: 'same', home: TAB, test: T_TAB, readme: [46, 68], note: 'the "Fix tracklist" button' },
  { lines: ['6214'], status: 'changed', home: [TAB, 'lib/claims/core.ts', 'lib/panel/download.ts'], cite: 'decision: P4-19', test: [T_TAB, 'tests/claims-core.test.ts'], readme: [51],
    note: 'the "Upload history" button: the same CSV, saved from the panel; a history that can\'t be read is said ("Couldn\'t export")' },

  // the status (renderStatus)
  { lines: ['6218-6230', '6232-6234'], status: 'changed', home: ['lib/claims/page.ts', 'lib/claims/claims.ts', 'entrypoints/sidepanel/panel.tsx'], cite: 'spec: Messaging', test: ['tests/claims-page.test.ts', 'tests/claims-status.test.ts'], readme: [46, 49],
    note: "renderStatus(): what the pane shows is gathered in the tab and drawn only when it changed. The tab sends it to the panel (claims:state), which shows the bound tab's, or the lock holder's while that tab runs copyright work" },
  { lines: ['6235-6244'], status: 'same', home: VIEW + 'StatusCard.tsx', test: T_TAB, readme: [46, 57], note: 'the status card: icon and title, detail, the progress bar (moving when no number is known), the steps of a run with the current one marked' },
  { lines: ['6245-6247'], status: 'same', home: TAB, test: T_TAB, readme: [46], note: 'the counts on the buttons: Claim list (N), Claimed songs (N), Ads off (N)' },
  { lines: ['6248-6251'], status: 'changed', home: TAB, cite: 'decision: P4-29', test: [T_TAB, T_RUN], readme: [60, 64],
    note: "which buttons show: Scan, Ads off and the three lists hide during a run or a scan; Stop shows during a run and while follow-up trims wait. Stop also shows for a run in the tab holding the lock, another channel's included" },
  { lines: ['6252-6253'], status: 'same', home: VIEW + 'AutopilotSwitch.tsx', test: T_RUN, readme: [69], note: 'the Auto-pilot switch follows what is stored; its line says "On · scan + trim every N h" or "Off · …"' },
  { lines: ['6255-6256'], status: 'same', home: 'entrypoints/sidepanel/App.tsx', test: T_RUN, readme: [66], note: "the dot on the Copyright tab's name while a copyright run is active" },

  // copyright settings
  { lines: ['6259-6274'], status: 'same', home: 'lib/panel/claims-settings.ts', test: T_SET, readme: [62], note: 'SETTINGS: the ten copyright settings in two groups, with their labels and help texts' },
  { lines: ['6275-6307'], status: 'changed', home: VIEW + 'CopyrightSettings.tsx', cite: 'decision: P4-17', test: T_SET, readme: [62],
    note: 'openSettings(): a view instead of a modal. A tick box for on/off, text for the rest; Save writes them and says "Settings saved" in a toast (it was a line on the status card); Reset to defaults asks once more and logs "Copyright settings reset" in the panel that clicked; Cancel. A write that fails leaves the view open' },
];
