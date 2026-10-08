# YouTube Upload Presets — Chrome extension (in progress)

Replaces the Tampermonkey userscript in the repo root. Design:
`docs/superpowers/specs/2026-10-05-chrome-extension-design.md`.

## Develop

```sh
cd extension
npm install
npm run dev      # builds, opens Chrome with the extension, reloads on change
npm run check    # tsc + vitest — run before every commit
npm run build    # .output/chrome-mv3 → chrome://extensions → Load unpacked
```

## Layout

- `entrypoints/` — background, content scripts (`studio.content.ts` isolated, `studio-main.content.ts` MAIN world), side panel, file-bridge iframe
- `lib/` — logic ported from the userscript; pure modules are unit-tested
- `lib/studio/txt.ts`, `lib/studio/sel.ts` — the `TXT` / `SEL` tables (see the root README)
- `tests/*.test.mjs` — tests ported from `../test/` (bodies unchanged); `tests/*.test.ts` — new tests

## Moving from the userscript

In the userscript: Settings → Backup / share → Export. Import that file in the extension
(the Settings tab arrives in Phase 3). Upload history and per-channel copyright data
aren't part of the backup.

## Phase 2 exit check (manual, in Chrome)

Needs the logged-in Chrome profile. Run `npm run build`, reload the unpacked extension
(`.output/chrome-mv3`), and **disable the userscript in Tampermonkey**. Use a test
channel. In DevTools, filter the console by `[ytup]`. Write down pass or fail for each
item. Any failure blocks Phase 3.

1. **Real upload, end to end.**
   - Drop these on the developer panel: `Clip 1.mp4`, `Clip 1.txt` (a 3-line tracklist
     starting at `0:00`), `Clip 1.jpg` (under 2 MB), and `Clip 2.mp4`.
   - Click **Add all to queue**. The queue list shows 2 items `[pending]` with titles,
     and the `.txt` handle disappears from the Files list.
   - Click **Start…**. The summary text appears; confirm it.
   - Expected:
     - Studio opens the upload dialog by itself, and the bridge logs `#1 loaded` and
       `connected`.
     - Title, description and tags fill in. `Clip 1` gets its thumbnail.
     - Monetisation, Ad suitability and Visibility are handled as the settings say.
     - Save is clicked, the item turns `[done]`, then `Clip 2` runs.
     - The tab title shows `(1/2) ⬆`, then `✅` if the tab isn't focused.
     - A desktop notification "Upload finished ✅" appears when the panel is closed or the
       tab is unfocused. Clicking it focuses the tab.
     - Both videos are in Content with the right titles.
2. **Scheduling.**
   - In DevTools, set `settings.schedule` in `chrome.storage.local` to
     `{ on: true, start: <tomorrow 08:00>, every: 1, unit: 'day' }`.
   - Queue 2 clips and Start.
   - Expected: the two are scheduled one day apart, and `settings.schedule.start` moves
     to the slot after the last one.
3. **Reload survival.** Queue 2 clips and reload the Studio tab before Start.
   - Expected: the queue is still listed `[pending]`, and Start works (the files come
     through the bridge again).
4. **Interrupted run.** Start a 2-clip queue and reload Studio while the first one
   uploads.
   - Expected: that item comes back as `[error] The page reloaded during the upload — …`.
   - Retry (confirm the draft prompt if asked) puts it back in the queue.
5. **Browser restart, then re-grant.** Queue 1 clip, restart Chrome, open Studio and the
   panel, then Start.
   - Expected: the item errors with "No permission to read this file — click "Re-grant
     access"…".
   - **Re-grant access**, then **Retry**: it uploads.
6. **One runner.** Open a second Studio tab and Start there while tab 1 runs.
   - Expected: the toast "Another Studio tab is already running the queue".
7. **Intercept.** Open Studio's own upload dialog and pick 2 videos.
   - Expected: the dialog closes, both appear in the queue (`src: page`), and Start
     uploads them.
   - Reloading while they are pending asks "Leave site?".
8. **Manual fill.** Upload one file through Studio's own dialog.
   - Expected: the details fill in from the active preset by themselves, with the toast
     "Details filled in: …".
9. **Quick actions.** Check both the details page and `/video/<id>/edit`.
   - The bars appear under the title and the description. In Elements they are in a
     shadow root: `div.ytp-qa` → `#shadow-root`.
   - Dark mode switches their colours.
   - These all work: Preset title, Copy, Preset description, Load .txt, Fix chapters,
     Check chapters, Preset tags, Apply all. Undo reverts.
10. **Dialog info.** With the details page open, **Dialog info** logs the diagnostic JSON,
    and its `version` is the manifest version.
11. **Button state in the isolated world.** During items 1, 7 and 8, Save/Next must be
    clicked only once Studio enables them. Check that the extension reads the
    enabled/disabled state of Studio's custom-element buttons correctly from its isolated
    world. Watch for "Could not click Save (button still disabled…)" while the button is
    plainly enabled, or a click that does nothing.
12. **Notification click and the side panel.** With the panel closed, finish a run (item
    1) and click the desktop notification.
    - Note whether the side panel opens, i.e. whether `sidePanel.open` accepts a
      notification click as a user gesture. If it doesn't, the tab is still focused;
      record the console error.
13. **Extension reload under a live Studio tab.** With Studio open and the bars showing,
    reload the extension in `chrome://extensions`. Don't reload the tab.
    - Expected: the console logs `[ytup] extension reloaded — page automation stopped`,
      the quick-action bars and the `UP` button go away, and the tab-title mark clears.
    - Picking 2 files in Studio's own dialog is now left to Studio (not intercepted).
    - Also try it with a run in flight: once that run ends, the tab title must not get a
      ✅/⚠️ back (the torn-down page UI ignores title marks; covered by a unit test).
14. **Bridge not answering.** Queue a clip from the panel. Then, in the Studio tab's
    DevTools, block `file-bridge.html` (Network → right-click → Block request URL),
    reload the tab, and Start.
    - DevTools request blocking may not apply to a `chrome-extension://` iframe. If the
      Network tab doesn't show `file-bridge.html` as blocked, use this instead: reload
      the tab, then before Start paste this in its console (top frame), so every bridge
      frame is removed as soon as it is made:
      `setInterval(() => document.querySelector('iframe[src*="file-bridge"]')?.remove(), 20)`.
    - Expected: the toast "The side panel's file access is not answering — reload the
      Studio tab, then start again" appears within about 10 s, and the item stays
      `[pending]`.
