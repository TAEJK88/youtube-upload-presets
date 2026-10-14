// Parity rows: the drawer. Switches, sections, tabs, and lines 2428-4586 (styles, shell, FAB, Upload, Presets, Settings).
const PANEL = 'entrypoints/sidepanel/';
const APP = PANEL + 'App.tsx';
const STYLE = PANEL + 'style.css';
const FIELDS = PANEL + 'fields.tsx';
const CHANNEL_BAR = PANEL + 'shell/ChannelBar.tsx';
const ACTIVITY_BAR = PANEL + 'shell/ActivityBar.tsx';
const QUEUE = PANEL + 'tabs/QueueTab.tsx';
const CARD = PANEL + 'tabs/QueueCard.tsx';
const FOOTER = PANEL + 'tabs/QueueFooter.tsx';
const SCHEDULE = PANEL + 'tabs/ScheduleBox.tsx';
const PRESETS = PANEL + 'tabs/PresetsTab.tsx';
const SETTINGS = PANEL + 'tabs/SettingsTab.tsx';
const COPYRIGHT = PANEL + 'tabs/CopyrightTab.tsx';
const FAB = 'lib/studio/fab.ts';

const SPEC_UI = 'spec: Side panel UI';
const SPEC_GM = 'spec: GM replacements';
const SPEC_FILES = 'spec: File intake (drop on the Side Panel)';
const OPACITY = 'dropped.mjs: Panel opacity';

const T_SHELL = 'tests/panel-shell.test.tsx';
const T_QUEUE = 'tests/panel-queue.test.tsx';
const T_PRESETS = 'tests/panel-presets-tab.test.tsx';
const T_SETTINGS = 'tests/panel-settings.test.tsx';

// A stylesheet block: the panel's Tailwind classes and tokens draw it again (spec: Side panel UI).
const css = (lines, home, note, readme = [2, 50]) => ({ lines, status: 'changed', home, cite: SPEC_UI, readme, note });
// A Settings → General row that only stores its value.
const general = (lines, note) => ({ lines, status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [35], note });

export default [
  { id: "section:All presets", status: 'same', home: PRESETS, test: T_PRESETS, readme: [34] },
  { id: "section:Artists", status: 'same', home: PRESETS, test: T_PRESETS, readme: [34] },
  { id: "section:Back up / share settings", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [36] },
  { id: "section:General", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [35] },
  { id: "section:Publishing", status: 'same', home: PRESETS, test: T_PRESETS, readme: [34] },
  { id: "section:Queue upload", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [35] },
  { id: "section:Safety", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [35] },
  { id: "section:Single-file upload (YouTube's normal dialog)", status: 'same', home: 'entrypoints/sidepanel/tabs/SettingsTab.tsx', readme: [35], note: 'the same three switches' },
  { id: "section:Troubleshooting", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [22], note: 'also holds "Open debug page", which the userscript did not have' },
  { id: "section:Video details", status: 'same', home: PRESETS, test: T_PRESETS, readme: [34] },
  { id: "section:YouTube preview", status: 'same', home: PRESETS, test: T_PRESETS, readme: [34] },
  { id: "switch:autoAcceptInvite", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [38] },
  { id: "switch:autoApply", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [20] },
  { id: "switch:autoNext", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [28] },
  { id: "switch:autoSave", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [28] },
  { id: "switch:confirmStart", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [17] },
  { id: "switch:intercept", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [19] },
  { id: "switch:notify", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [9, 35] },
  { id: "switch:quickActions", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [21] },
  { id: "switch:thumb", status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [9] },
  { id: "tab:claims", status: 'same', home: COPYRIGHT, readme: [2] },
  { id: "tab:presets", status: 'same', home: PRESETS, readme: [2] },
  { id: "tab:queue", status: 'same', home: QUEUE, readme: [2] },
  { id: "tab:settings", status: 'same', home: SETTINGS, readme: [2] },

  // The notification, title mark and sound: their text is ported (port:page-notify), so they have no line of their own.
  { id: 'feature:queue-finished sound (3240-3257)', manual: true, status: 'same', home: ['lib/studio/page-notify.ts', 'lib/studio/content-ui.ts'], test: 'tests/page-notify.test.ts', readme: [9], note: 'beep(): two rising notes when the queue ends well, two falling ones otherwise; played in the Studio page' },
  { id: 'feature:tab-title mark (3271-3284)', manual: true, status: 'same', home: ['lib/studio/page-notify.ts', 'lib/studio/content-ui.ts'], test: ['tests/page-notify.test.ts', 'tests/content-ui.test.ts'], readme: [9, 25], note: '"(3/10) ⬆" while running, then ✅ / ⚠️ until the tab is looked at; the 1.5 s timer (3281) puts the mark back after Studio retitles the tab' },

  // ----- helpers before the stylesheet -----
  { lines: ['2503-2508'], status: 'same', home: 'lib/activity.ts', test: 'tests/activity-icon.test.ts', note: 'EMOJI_ICON: which icon a status emoji is drawn as' },
  { lines: ['2524-2527'], status: 'same', home: ['lib/activity.ts', FAB, ACTIVITY_BAR], test: ['tests/activity-icon.test.ts', 'tests/fab.test.ts'], note: 'emojiIcon(): the icon for a status emoji, or the emoji as text' },
  { lines: ['2528'], status: 'same', home: FIELDS, test: T_QUEUE, note: 'iconBtn(): an icon-only button whose title is its name (IconButton)' },

  // ----- the stylesheet (2530-3186) -----
  css(['2530-2549'], STYLE, 'styles: the base palette (light and dark tokens), resets and the mono font. The light tokens are the panel\'s light theme'),
  css(['2552-2568', '2921'], FAB, 'styles: the FAB and the logo tile, as the FAB\'s Shadow DOM stylesheet (the look after the black and glass layers)', [7]),
  { lines: ['2920'], status: 'dropped', cite: 'decision: P5-row-fab-visible', note: 'the old script hid the FAB while the drawer was open (opacity 0, no clicks). The button stays visible and clickable while the side panel is open (the page is not told whether the panel is open)' },
  css(['2571-2581'], [APP, 'components/ui/button.tsx'], 'styles: the floating drawer (slide-in, shadow) and icon buttons. The panel is docked, so the slide-in is gone'),
  css(['2584-2602', '2939-2940'], CHANNEL_BAR, 'styles: the channel bar (avatar with its dot, name, id, lock pill, the red "wrong channel" state)', [2, 4]),
  css(['2605-2617'], [APP, 'components/ui/tabs.tsx'], 'styles: the tab bar with its count badge, the scrolling body and the footer strip'),
  css(['2620-2636'], 'components/ui/button.tsx', 'styles: buttons (plain, small, ghost, danger, the wide go button with its icon and two lines)'),
  css(['2639', '2657-2678'], ['components/ui/input.tsx', 'components/ui/textarea.tsx', 'components/ui/native-select.tsx', 'components/ui/label.tsx'], 'styles: text, number, date-time fields, selects, textareas, labels and the character counter'),
  css(['2640-2656', '2914-2919', '2927-2930', '2941'], SCHEDULE, 'styles: the schedule box (header, fields, the per-card release-time row, the amber "time has passed" state, the fold arrow)', [2, 13]),
  css(['2681-2684'], FIELDS, 'styles: a section and its heading'),
  css(['2687-2695', '2913', '2931-2935'], QUEUE, 'styles: the drop zone, its compact form once the queue has videos, and the folder link', [2, 10]),
  css(['2698-2709', '2906', '2936-2938'], [QUEUE, 'components/ui/progress.tsx'], 'styles: the stats row, the queue progress bar and the toolbar'),
  css(['2712-2755', '2895-2905', '2942-2944'], [CARD, 'components/ui/badge.tsx', QUEUE], 'styles: queue cards (thumbnail, status, message box per status, attachment chips, the folded header, move buttons) and the empty state. The status is coloured text without the pill\'s dot', [2, 9, 11]),
  css(['2758-2766'], PRESETS, 'styles: chips, variable chips and the three-way visibility control', [2, 34]),
  css(['2769-2780', '2923-2926'], PRESETS, 'styles: the preset list. One visible difference: the drawer showed a preset\'s title template only on the selected row (2925-2926); the panel shows it on every row', [2, 34]),
  css(['2783-2791'], PRESETS, 'styles: the YouTube-style preview card and the tag line', [2, 34]),
  css(['2794-2810'], ['components/ui/switch.tsx', FIELDS, SETTINGS], 'styles: switches, the title-and-control rows, hints and key caps', [2, 35]),
  { lines: ['2813-2818'], status: 'same', home: 'lib/studio/page-toast.ts', test: 'tests/page-toast.test.ts', readme: [84], note: 'styles: the toast. The panel\'s own toast (components/ui/sonner.tsx) follows the theme; the toast in the Studio page has the look the drawer ended with (2968 white tick, 3041 black box, 3084 glass at the default 82 %), in its own Shadow DOM (decision P5-row-toast-look). The blur is seen only in Chrome' },
  css(['2821-2828', '2836-2851'], [COPYRIGHT, PANEL + 'tabs/copyright/StatusCard.tsx', PANEL + 'tabs/copyright/ActivityLog.tsx'], 'styles: the Copyright tab\'s status card, progress bar, step chips, button grids, log and notes', [2, 46, 50]),
  css(['2829-2835'], ACTIVITY_BAR, 'styles: the activity bar', [2, 9]),
  css(['2852-2867'], [PANEL + 'tabs/copyright/SubView.tsx', PANEL + 'tabs/copyright/ClaimList.tsx', PANEL + 'tabs/copyright/Songs.tsx'], 'styles: the copyright modal, its tables and checkboxes. Modals are views of the Copyright tab and tables are lists of cards', [2, 50]),
  css(['2869-2892'], [PANEL + 'ask.tsx', 'components/ui/dialog.tsx', FOOTER], 'styles: the confirm box, with the start summary\'s channel block, facts and warning boxes', [9, 17]),
  css(['2909-2911'], APP, 'styles: the "Drop to add to the queue" frame over the whole panel', [9]),
  { lines: ['2912'], status: 'dropped', cite: SPEC_UI, note: 'styles: the FAB\'s highlight while files are dragged over it. The FAB no longer takes dropped files' },
  css(['2945-2948'], [FOOTER, 'components/ui/progress.tsx'], 'styles: the animations. Kept: the Start icon\'s spin and the moving stripe of a bar with no percentage. Not kept: the pulsing dot on an uploading card\'s pill (no dot)', [9]),
  css(['2951-3060'], STYLE, 'styles: the black theme layer (one colour, colour only for status; flat sections, underlined tabs, white go button). The panel\'s dark tokens come from it'),
  css(['3062-3070'], [PANEL + 'Icon.tsx', APP], 'styles: icon alignment on tabs, the FAB, the activity bar and the status card'),
  css(['3072-3092'], [STYLE, FAB], 'styles: the glass layer (blurred Studio behind the drawer, the FAB, the toast and the dialogs). The docked panel is solid; the FAB keeps the glass', [2, 7]),
  { lines: ['3093'], status: 'dropped', cite: OPACITY, note: 'styles: the opacity slider' },
  css(['3095-3186'], [STYLE, QUEUE, CARD, FOOTER], 'styles: Design B (pill tabs in one box, one-line drop zone, stats as one line, rounder cards, the footer). One visible difference: Design B hid the Start button\'s play icon (3156); the panel shows it, spinning during a run', [2, 9, 17]),

  // ----- shell: fonts, toast, ask, notification, FAB, tabs, channel bar -----
  { lines: ['3188-3191'], status: 'dropped', cite: 'decision: P5-row-page-font', note: 'the Google Fonts link for IBM Plex Sans Thai, added to the Studio page. The panel bundles the font (spec: GM replacements), but nothing loads it into the Studio page any more: the FAB, the in-page toast and the reload banner name it and fall back to Leelawadee UI / Segoe UI / the system font unless the computer has it installed' },
  { lines: ['3192-3193', '3302-3307', '3319-3320', '3413-3415'], status: 'changed', home: [APP, PANEL + 'index.html'], cite: SPEC_UI, readme: [2], test: T_SHELL, note: 'the drawer\'s frame (root element, the tab / pane / footer holders, the body, the drawer element): the side panel\'s App' },
  { lines: ['3194-3202'], status: 'same', home: ['lib/studio/page-toast.ts', 'components/ui/sonner.tsx', 'lib/studio/content-ui.ts'], readme: [27, 31], note: 'toast(): a message at the bottom for 3.8 s. The drawer had one toast and replaced its text; the panel can show several at once, and a message from the Studio page shows twice: in the page and in the panel bound to that tab' },
  { lines: ['3207-3237'], status: 'same', home: PANEL + 'ask.tsx', test: 'tests/panel-ask.test.tsx', readme: [17], note: 'ask(): the confirm box (main button true, second false, Esc or a click outside null; Enter confirms; a new question closes the open one)' },
  { lines: ['3258-3270'], status: 'changed', home: ['lib/notify.ts', 'lib/studio/content-ui.ts'], cite: 'spec: Background', test: 'tests/notify.test.ts', readme: [9, 24], note: 'notifyDone(): the sound plays in the page; the desktop notification comes from the background (chrome.notifications), not when the tab is focused with the panel open; a click focuses the tab and tries to open the panel; which tab the panel then shows is the row "feature:notification click shows the Upload tab"' },
  { id: 'feature:notification click shows the Upload tab (3264, 3267)', manual: true, status: 'same', home: ['lib/notify.ts', 'lib/panel-tab.ts'], test: ['tests/notify.test.ts', 'tests/panel-tab.test.ts'], readme: [82], note: 'a click on the "queue finished" notification opens the panel and asks it for the Upload tab; a panel already open on that Studio tab switches to it (decision P5-row-tab-choice)' },
  { lines: ['3287-3293', '3296-3300'], status: 'changed', home: [FAB, 'lib/studio/content-ui.ts'], cite: SPEC_UI, test: 'tests/fab.test.ts', readme: [7], note: 'the FAB (channel, default preset, badge): a click opens the side panel; it cannot close it' },
  { lines: ['3294-3295'], status: 'changed', home: ['entrypoints/studio.content.ts', 'lib/studio/fab.ts', 'lib/studio/content-ui.ts', 'lib/panel-tab.ts', 'entrypoints/sidepanel/App.tsx'], cite: 'decision: P5-row-tab-choice', test: ['tests/panel-tab.test.ts', 'tests/panel-shell.test.tsx', 'tests/fab.test.ts', 'tests/studio-wiring.test.ts'], readme: [82], note: 'a FAB click opens the panel on the tab of the running task (Copyright while a copyright job runs, Upload during a run). An open panel switches to that tab, where the userscript closed the drawer on that click (the panel cannot be closed from the page); with nothing running an open panel keeps its tab' },
  { lines: ['3309-3318'], status: 'same', home: ACTIVITY_BAR, test: T_SHELL, readme: [9, 49], note: 'the activity bar above the tabs: icon, title, percentage, bar; a click or Enter / Space goes to the task\'s tab' },
  { lines: ['3321-3325'], status: 'same', home: APP, test: T_SHELL, readme: [2], note: 'the four tab buttons (Upload, Presets, Copyright, Settings) with their icons and the queue count' },
  { lines: ['3328-3348', '3401-3410'], status: 'same', home: CHANNEL_BAR, test: T_SHELL, readme: [4], note: 'the channel bar: avatar, name, id or problem, the ⇄ button, and the lock button with its three toasts' },
  { lines: ['3352-3363'], status: 'same', home: 'lib/studio/channels.ts', test: 'tests/channels.test.ts', readme: [5], note: 'rememberChannel(): every channel Studio was opened on is kept in `channels`, newest first, read fresh each time' },
  { lines: ['3364-3377'], status: 'same', home: ['lib/panel/channels.ts', CHANNEL_BAR], test: ['tests/panel-channels.test.ts', T_SHELL], readme: [5], note: 'channelUrl() and adding a channel by UC… id or link (button or Enter)' },
  { lines: ['3378-3389', '3394-3400'], status: 'same', home: CHANNEL_BAR, test: T_SHELL, readme: [5], note: 'the channel list: rows with avatar and name, "· this tab", New tab for the current channel, ✕ to remove, the empty text and the add row' },
  { lines: ['3390-3393'], status: 'changed', home: [CHANNEL_BAR, 'lib/studio/channels.ts'], cite: SPEC_FILES, test: ['tests/channels.test.ts', T_SHELL], readme: [5], note: 'the channel list\'s Switch: refused only while a run is in progress (in any Studio tab). The drawer also refused while files waited or had failed; queued files now survive a switch' },
  { lines: ['3412'], status: 'dropped', cite: 'dropped.mjs: Close (Alt+P)', note: 'the drawer\'s close button' },
  { lines: ['3417-3439'], status: 'same', home: ['lib/studio/queue-view.ts', CHANNEL_BAR, FAB, SETTINGS], test: [T_SHELL, 'tests/fab.test.ts'], readme: [4, 7], note: 'updateChannelUI(): the channel bar, the lock state, the FAB\'s channel line and red state, and the producer field\'s placeholder follow the page\'s channel' },
  { lines: ['3440'], status: 'same', home: ['entrypoints/studio.content.ts', 'lib/studio/content-ui.ts'], test: 'tests/content-ui.test.ts', readme: [4], note: 'timer: the channel is looked at again every 1.5 s. Here the page\'s 0.8 s tick remembers the channel and tells the panel when it changed' },
  { lines: ['3442-3450'], status: 'same', home: APP, test: T_SHELL, readme: [2], note: 'showTab(): one pane and its footer at a time, opened at its top' },
  { lines: ['3452-3486'], status: 'same', home: FAB, test: 'tests/fab.test.ts', readme: [7], note: 'the FAB\'s drag: moves after 6 px, is not a click, the place is kept in `fabPos` as distances from the right and bottom edge and pulled back inside on resize' },
  { lines: ['3488-3489', '3491-3498'], status: 'changed', home: ['entrypoints/background.ts', 'lib/studio/content-ui.ts'], cite: SPEC_UI, test: 'tests/content-ui.test.ts', readme: [1], note: 'openDrawer() / closeDrawer(): Chrome opens the side panel (toolbar icon, Alt+P, the FAB); only Chrome\'s own button closes it' },
  { lines: ['3490'], status: 'changed', home: 'lib/theme.ts', cite: 'extension-only.mjs: Switch to light theme', test: 'tests/theme.test.tsx', readme: [50], note: 'the drawer took dark or light from Studio\'s theme when it opened (the black theme then drew both dark). The panel has its own toggle, dark by default' },

  // ----- Upload tab -----
  { lines: ['3501', '3504-3509', '3511-3512'], status: 'changed', home: [QUEUE, 'lib/panel/intake.ts'], cite: SPEC_FILES, test: [T_QUEUE, 'tests/panel-intake.test.ts'], readme: [10], note: 'the drop zone and its file picker (videos, .txt, images; many at once): a click anywhere picks files. Files are taken as handles, which the Studio tab reads through the bridge' },
  { lines: ['3503'], status: 'changed', home: 'lib/panel/intake.ts', cite: 'decision: P5-folder-extras', test: ['tests/panel-intake.test.ts', 'tests/panel-queue.test.tsx'], readme: [10, 85], note: '"pick a whole folder": the drawer\'s folder input took every file at any depth, and the panel\'s folder picker reads every depth too (decision P5-row-folder-depth). Not as the drawer: hidden files (names starting with a dot) are left out; more than 2000 files in the picked folder is refused with a message; a folder inside it that can\'t be read is passed over and a toast says so' },
  { lines: ['3510'], status: 'dropped', cite: 'dropped.mjs: .mp4 video', note: 'the drop zone\'s three file-type hints (.mp4 video, .txt description, .jpg thumbnail), which Design B already hid' },
  { lines: ['3515-3536'], status: 'changed', home: 'lib/panel/intake.ts', cite: 'decision: P5-folder-extras', test: ['tests/panel-intake.test.ts', 'tests/panel-queue.test.tsx'], readme: [10, 85], note: 'filesFromDrop(): dropped files as they are; with a folder in the drop, folders at every depth (the drawer stopped two levels down), no hidden files, at most 2000 files from all the dropped folders together (loose files not counted), a folder that can\'t be read passed over (as readDir() did) with a toast. Read as file handles' },
  { lines: ['3538-3567'], status: 'same', home: [QUEUE, APP], test: T_QUEUE, readme: [9, 10], note: 'a drop anywhere on the panel: the "Drop to add to the queue" frame while dragging, then the Upload tab opens and the files are added' },
  { lines: ['3569-3570'], status: 'dropped', cite: SPEC_UI, note: 'dropping files on the FAB' },
  { lines: ['3572-3591'], status: 'same', home: [QUEUE, 'lib/studio/queue-edit.ts'], test: [T_QUEUE, 'tests/queue-edit.test.ts'], readme: [11], note: 'the toolbar: the default preset for new videos, Apply to all, Expand all / Collapse all' },
  { lines: ['3592-3601', '3726-3733'], status: 'same', home: QUEUE, test: T_QUEUE, readme: [9], note: 'the Upload pane: the card list, the stats (Total, Queued, Done, Errors) and the queue progress bar' },
  { lines: ['3604-3677'], status: 'same', home: [SCHEDULE, 'lib/panel/schedule-quick.ts'], test: [T_QUEUE, 'tests/panel-schedule.test.ts'], readme: [13], note: 'the schedule box: the switch, first release time, every N days / hours, four quick picks, "Use this time", the folding header' },
  { lines: ['3680-3683'], status: 'same', home: FIELDS, test: 'tests/panel-fields.test.tsx', readme: [39], note: 'syncScheduleInput(): the first-release field follows the start a run moved, but not while it is being typed in' },
  { lines: ['3685-3709', '3711-3722'], status: 'same', home: [SCHEDULE, 'lib/studio/queue-view.ts'], test: [T_QUEUE, 'tests/queue-view.test.ts'], readme: [13, 47], note: 'onScheduleChange(): the box\'s summary line (off / pick a time / first → last · every N, the channel\'s already-scheduled videos and skipped slots), the "time has passed" note, and the cards\' release times' },
  { lines: ['3710'], status: 'dropped', cite: 'decision: P5-row-schedule-tooltip', note: 'not in 5.0.0, planned: the schedule summary\'s tooltip listed each video already scheduled on the channel as "time · title". The panel\'s tooltip lists the times only: QueueView.schedule.taken carries no titles (ScheduleBox.tsx says so in a comment)' },
  { lines: ['3724'], status: 'same', home: PANEL + 'panel.tsx', unseen: 'needs a minute of waiting: the panel asks the tab for the view again every 60 s (panel.tsx `minute`), so release times move past "15 minutes ahead"', note: 'timer: the schedule is drawn again every minute while it is on' },
  { lines: ['3735-3744'], status: 'changed', home: [FOOTER, 'lib/panel/start.ts', 'lib/studio/queue-ops.ts'], cite: 'extension-only.mjs: Confirm the upload in the side panel first', test: [T_QUEUE, 'tests/panel-start.test.ts', 'tests/queue-ops.test.ts'], readme: [17, 18, 27], note: 'the footer: Start (the summary is asked in the panel, then the tab starts what was confirmed), Stop (goes to the tab that runs the queue), Clear finished. The cite covers Start; Stop going to the running tab is README item 18' },
  { lines: ['3746-3750', '3874-3877'], status: 'same', home: ['lib/panel/format.ts', QUEUE], test: 'tests/panel-presets.test.ts', note: 'fmtSize(), fmtDur() and the numbered preset options' },
  { lines: ['3752-3760'], status: 'same', home: CARD, test: T_QUEUE, readme: [9], note: 'a queue card\'s frame: status, title counter, message box, upload bar, thumbnail box with the size' },
  { lines: ['3761-3788'], status: 'same', home: [CARD, 'lib/studio/queue-edit.ts'], test: [T_QUEUE, 'tests/queue-edit.test.ts'], readme: [11], note: 'a card\'s fields: title with ↻, artists, release time with ↻, preset' },
  { lines: ['3789-3800'], status: 'changed', home: [CARD, 'lib/studio/queue-ops.ts'], cite: 'decision: P5-draft-retry', test: [T_QUEUE, 'tests/queue-ops.test.ts', 'tests/queue-draft-retry.test.ts'], readme: [15, 94], note: 'a card\'s Retry, Open draft and Remove. Decision P5-draft-retry: Retry on a video that left a draft in Studio still asks first, but the question no longer says "Retrying will create a duplicate. Delete the draft in Content first" with the one answer "Deleted it, upload again". It offers "Resume draft" (selected: the video waits again with its draft id and the run goes on in that draft, the file is not uploaded again) and "Upload again" (what the userscript\'s answer did). Open draft\'s tooltip lost "to delete it before retrying". Remove is unchanged' },
  { lines: ['3802-3813'], status: 'same', home: [CARD, 'lib/studio/queue-edit.ts'], test: [T_QUEUE, 'tests/queue-edit.test.ts'], readme: [11], note: 'Move up / Move down, only between videos not yet uploaded' },
  { lines: ['3814-3848'], status: 'same', home: CARD, test: T_QUEUE, readme: [11], note: 'a card\'s layout and folding: a click on the header opens it and puts the cursor in the title; the hidden attach picker' },
  { lines: ['3850-3867'], status: 'same', home: [CARD, 'lib/studio/queue-edit.ts'], test: [T_QUEUE, 'tests/queue-edit.test.ts'], readme: [11], note: 'a .txt or image dropped on a waiting card attaches to it; a video or a folder goes to the panel' },
  { lines: ['3868-3870'], status: 'same', home: CARD, unseen: 'bookkeeping: the card\'s elements kept on the item for later redraws; React keeps them', note: 'it.ui: the card\'s element references' },
  { lines: ['3872', '3878-3936'], status: 'same', home: [CARD, 'lib/studio/queue-view.ts'], test: [T_QUEUE, 'tests/queue-view.test.ts'], readme: [11, 39], note: 'updateItemUI(): what a card shows for its item (status, folded title, which fields can change, the Artists field only when the preset uses {artists}, release time and its problem, Retry / Open draft / Remove, the counter, the message, the upload bar)' },
  { lines: ['3938-3947'], status: 'same', home: 'lib/studio/queue-edit.ts', test: 'tests/queue-edit.test.ts', readme: [11], note: 'attachToItem(): a .txt becomes the description, an image the thumbnail, the title is made again' },
  { lines: ['3949-4022'], status: 'same', home: [CARD, 'lib/studio/queue-view.ts'], test: [T_QUEUE, 'tests/queue-view.test.ts'], readme: [9, 11, 31], note: 'renderAttachments(): the thumbnail preview and the chips (.txt with ✕, Fix tracklist, tracklist problems and warnings, chapters, thumbnail with ✕, already uploaded, songs claimed before, Attach)' },
  { lines: ['4024-4042'], status: 'same', home: [QUEUE, 'lib/studio/content-ui.ts'], test: [T_QUEUE, 'tests/content-ui.test.ts'], readme: [9], note: 'renderQueue(): numbers assigned again, the empty state, the compact drop zone, the schedule box folding when the first videos arrive' },
  { lines: ['4044-4076'], status: 'same', home: [FOOTER, QUEUE, 'lib/studio/content-ui.ts'], test: [T_QUEUE, 'tests/content-ui.test.ts'], readme: [9, 17], note: 'updateRunUI(): the Start button\'s two lines and when it, Stop, Clear and Apply to all are off; the stats; the tab\'s count; the title mark while running. Start is also off while the tab is not connected or another tab works. Files that need a re-grant do not turn it off: its click asks the browser for them first and sends nothing to the tab if one stays unreadable' },
  { lines: ['4079-4096'], status: 'same', home: [ACTIVITY_BAR, FAB], test: [T_SHELL, 'tests/fab.test.ts'], readme: [9, 49], note: 'activity(): the one task running now (the upload wins over a copyright job)' },
  { lines: ['4100-4136'], status: 'same', home: [ACTIVITY_BAR, FAB, CARD], test: [T_SHELL, 'tests/fab.test.ts', T_QUEUE], readme: [7, 9], note: 'renderActivity(): the activity bar, the uploading card\'s bar and the FAB\'s badge (icon and percentage with a line along the bottom, or the count waiting)' },

  // ----- Presets tab -----
  { lines: ['4139-4171'], status: 'same', home: PRESETS, test: T_PRESETS, readme: [34], note: 'the preset editor\'s fields, the sample file name and tracklist, the preview elements and the variable chips' },
  { lines: ['4173-4192'], status: 'same', home: PRESETS, test: T_PRESETS, readme: [34], note: 'insertVar(): a chip, or a .txt dropped on Description, goes in at the cursor of the field last edited' },
  { lines: ['4194-4209'], status: 'same', home: [PRESETS, 'lib/panel/presets.ts'], test: [T_PRESETS, 'tests/panel-presets.test.ts'], readme: [34], note: 'bind(): each keystroke in name, title, description, tags, artist priority and artist max is saved' },
  { lines: ['4210-4225'], status: 'same', home: PRESETS, test: T_PRESETS, readme: [34], note: 'the "Test with a file" field: typing, or dropping a real .mp4 / .txt, changes the preview' },
  { lines: ['4226-4231'], status: 'same', home: [PRESETS, 'lib/panel/presets.ts'], test: [T_PRESETS, 'tests/panel-presets.test.ts'], readme: [34], note: 'Next EP: the preset\'s counter, and the queue\'s numbers follow' },
  { lines: ['4233-4250'], status: 'same', home: PRESETS, test: T_PRESETS, readme: [34], note: 'renderPresetList(): numbered rows with the Alt+N hint and the Default mark; the selected one is kept in view inside the list box' },
  { lines: ['4252-4269'], status: 'same', home: PRESETS, test: T_PRESETS, readme: [34], note: 'renderPresetEditor(): the fields of the selected preset and the three visibility buttons; a preset that is gone falls back to the default one' },
  { lines: ['4271-4287'], status: 'same', home: [PRESETS, 'lib/template.ts'], test: T_PRESETS, readme: [34], note: 'renderPresetPreview(): the title as YouTube will show it, channel and visibility, the tags, the counter, the unknown-variable warning' },
  { lines: ['4289'], status: 'same', home: FIELDS, readme: [2], note: 'sec(): a section with an icon and a heading' },
  { lines: ['4291-4316'], status: 'same', home: [PRESETS, 'lib/panel/presets.ts', 'lib/studio/queue-edit.ts'], test: [T_PRESETS, 'tests/panel-presets.test.ts', 'tests/queue-edit.test.ts'], readme: [34], note: 'the preset list\'s buttons: New, Duplicate, Set as default, Delete (asks first, keeps one, queued videos move to the default preset)' },
  { lines: ['4317-4347'], status: 'same', home: PRESETS, test: T_PRESETS, readme: [34], note: 'the Presets pane\'s sections: Video details, YouTube preview, Artists, Publishing, with their labels and hints' },
  { lines: ['4348-4357'], status: 'same', home: [PRESETS, 'lib/studio/manual-fill.ts'], test: T_PRESETS, readme: [20, 34], note: 'the Presets footer: Apply to open window, Reset to defaults (asks first)' },

  // ----- Settings tab -----
  { lines: ['4360-4365'], status: 'dropped', cite: OPACITY, note: 'applyGlass(): the drawer\'s opacity' },
  { lines: ['4368-4374'], status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [35], note: 'sw(): a switch with a title and a note that saves its setting' },
  { lines: ['4379-4402'], status: 'same', home: 'lib/backup.ts', test: 'tests/backup.test.ts', note: 'the backup file\'s constants and cleanPresets(): presets from a file made safe to use' },
  { lines: ['4403-4417'], status: 'changed', home: ['lib/backup.ts', 'lib/panel/backup-io.ts', SETTINGS], cite: SPEC_GM, test: ['tests/backup.test.ts', 'tests/panel-backup.test.ts'], readme: [36], note: 'exportBackup(): the same file, name and toast; its `version` is the extension\'s (chrome.runtime.getManifest()), not the userscript\'s' },
  { lines: ['4418-4463'], status: 'changed', home: ['lib/backup.ts', 'lib/panel/backup-io.ts', 'lib/store-writer.ts', SETTINGS], cite: 'spec: Data migration from the userscript', test: ['tests/backup.test.ts', T_SETTINGS, 'tests/store-writer.test.ts'], readme: [36], note: 'importBackup(): the same checks, question and rules for what is taken. Refused while an upload run or a copyright job holds the lock (decision P4-30); files waiting no longer block it. No page reload, a toast "Imported N presets" instead' },
  { lines: ['4464-4465'], status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [36], note: 'the hidden .json picker behind Import' },
  { lines: ['4467-4484'], status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [35], note: 'the Settings pane\'s first three sections and their nine switches, with the "Lock channel" hint' },
  { lines: ['4485-4493'], status: 'changed', home: [SETTINGS, 'lib/studio/upload-dialog.ts'], cite: SPEC_GM, test: T_SETTINGS, readme: [22], note: 'Copy upload dialog info: the Studio tab reads the dialog and the panel copies it (navigator.clipboard), which can fail and then says so' },
  { lines: ['4494-4501'], status: 'changed', home: [SETTINGS, 'lib/i18n.ts'], cite: SPEC_UI, test: [T_SETTINGS, 'tests/i18n.test.ts'], readme: [3], note: 'Language: changes at once without a reload, also during a run; the "page reloads" note and the "stop the queue first" refusal are gone' },
  { lines: ['4502-4507'], status: 'dropped', cite: OPACITY, note: 'the Panel opacity slider' },
  general(['3351', '4508-4512'], 'Producer name {producer}: saved trimmed on each keystroke; the placeholder is the current channel\'s name'),
  general(['4513-4516'], 'Category: saved trimmed on each keystroke'),
  general(['4517-4521'], 'Paid promotion: No / Yes / Don\'t answer'),
  general(['4522-4526'], 'Monetisation step: Ads on / Ads off / Manual'),
  general(['4527-4531'], 'Ad suitability step: None of the above / Manual'),
  general(['4532-4536'], 'AI use: Don\'t answer / No / Yes'),
  general(['4537-4543'], 'Year used in {year}: blank means the current year'),
  general(['4544-4547'], 'Max thumbnail wait: minutes, at least 1, saved when the field is left'),
  general(['4548-4552'], 'Pace: Normal / Slow / Very slow, with a toast naming it'),
  general(['4553-4557'], 'Pause between files: seconds, at least 0, saved when the field is left'),
  { lines: ['4558-4565'], status: 'same', home: SETTINGS, test: T_SETTINGS, readme: [36], note: 'the Back up / share section: its hint and the Export (.json) and Import buttons' },
  { lines: ['4566-4568'], status: 'changed', home: SETTINGS, cite: SPEC_UI, readme: [1], note: 'the shortcut hint: Alt+P "open the panel" (it cannot close it), Alt+1…9 select the default preset' },
  { lines: ['4569-4572'], status: 'changed', home: SETTINGS, cite: 'decision: P5-daily-limit', test: 'tests/panel-limits.test.tsx', readme: [35, 93], note: 'the hint "While the queue is running, don\'t close or refresh this tab · YouTube limits uploads per day…". Its ending is no longer "if you hit the limit the queue stops automatically" but "at the limit the queue pauses and resumes by itself 24 hours later", which is what happens now' },
  { lines: ['4574-4585'], status: 'same', home: [FAB, QUEUE, 'lib/studio/queue-edit.ts'], test: ['tests/fab.test.ts', 'tests/queue-edit.test.ts'], readme: [12, 34], note: 'refreshLabels(): after a preset, default preset, counter or setting change, the FAB\'s preset name, the preset lists and every waiting card\'s title and number follow' },
];
