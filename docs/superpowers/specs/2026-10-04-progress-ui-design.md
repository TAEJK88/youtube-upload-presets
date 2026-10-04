# Progress UI for long-running tasks

**Date:** 2026-10-04
**Target:** `youtube-upload-presets.user.js` (v4.11.0)
**Status:** approved design, not yet implemented

## Problem

Every long-running operation already tracks its own progress, but that progress is
only visible in one place, and the upload — the slowest operation — barely reports at all.

| Operation | Today |
|---|---|
| Claim scan | Status card: label + `done/total` bar (`scanProg`) |
| Trim run | Status card: 6 named steps + bar (`TRIM_STEPS`) |
| Ads run | Status card: 5 named steps + bar (`ADS_STEPS`) |
| Collab run | Status card: 3 named steps + bar (`COLLAB_STEPS`) |
| Upload queue | Clip-count bar (`done/total`) + per-card status text |

Two concrete gaps:

1. **The file upload has no real progress.** `uploadProgressText()` reads Studio's own
   "Uploading 45% … 3 minutes left" but is called in exactly one place — the
   thumbnail-wait loop. During the rest of the upload the card shows a static phase
   message, and the queue bar only advances when a whole clip finishes. A 2 GB clip
   sits visually frozen for twenty minutes.
2. **Claims progress is invisible unless the Claims tab is open.** With the drawer
   closed, the only indicator is `fabBadge`, which reflects the upload queue only.
   A 40-minute autopilot trim run shows nothing but a `●` on the tab.

## Goal

Any running task is visible from anywhere in the UI, and the upload reports real
in-clip progress. No idle chrome: when nothing runs, nothing new is shown.

## Design

### Model

A single source of truth for "what is running right now":

```js
activity()  // → null when idle, else
            // { task, icon, title, detail, progress, tab }
            //   task:     'upload' | 'scan' | 'trim' | 'ads' | 'collab'
            //   progress: 0..1, or null for indeterminate
            //   tab:      which tab owns it ('queue' | 'claims')
```

Note the field is named `task`, not `kind`. `computeStatus()` already returns a `kind`
meaning *severity* (`busy` / `wait` / `ok` / `idle` / `err`), which drives the Claims
card's colour. Reusing that name here for the task type would be ambiguous, so the
model uses `task` and consumes the severity only as the gate described below.

Priority: the **upload branch** when `running` is true or any queue item is
`uploading`/`review`; otherwise **`Claims.status()`**.

`Claims.status()` is today's `computeStatus()`, added to the Claims export object
(currently `{ buildPane, tick, claimedSongsIn, fixTracklist, renderStatus }`). It
already returns this shape plus `steps`/`stepIdx`, which `activity()` drops — the
Claims card keeps using the full version directly.

`computeStatus()` also returns a status when idle ("Ready", "Auto-pilot is on"), so
only `kind: 'busy'` and `kind: 'wait'` count as an activity. `idle` and `ok` map to
null; this is what stops `flash()` success messages from hijacking the bar.

`activity()` is a thin wrapper over a pure `activityFrom(queueState, claimsStatus)`
so it can be tested through the existing harness.

### Upload progress

```js
let uploadProg = null;                  // { pct: 0..1 | null, text: '' }
const parseUploadPct = (t) => ...;      // /(\d{1,3})\s*%/, clamped to 0..1, null if absent
function pollUploadProgress() { ... }   // reads uploadProgressText() when running
```

`pollUploadProgress()` is driven by the existing 800 ms tick. Nothing inside
`uploadOne` changes — this is the main reason for a poller rather than instrumenting
each `waitFor` call.

Global figure for the upload branch, using the counters `updateRunUI()` already
computes (`total = queue.length`, `done` / `errors` = items with that status):

```
progress = (done + (uploadProg?.pct ?? 0)) / total
title    = "Uploading <done + errors + 1>/<total>"   // matches startTxt today
detail   = uploadProg?.text ?? ''                    // Studio's string, verbatim
```

The bar's base is `done`, matching the meaning of the queue tab's existing
`progressWrap` bar: fraction of clips *successfully* uploaded, plus partial credit for
the one in flight. Errored clips deliberately do not advance it — they are surfaced by
the error stat instead. The title keeps `done + errors + 1` because that is the index
of the clip actually being worked on, which is what `startTxt` already displays.

When the parse fails, `pct` is null and the bar falls back to whole-clip granularity.

### Views

Four views of the one model. Each renders only what it needs.

1. **`activityBar`** — new node inserted between `chanList` and `nav` in the `drawer`
   tree, so it sits above the tab row and is visible on every tab. Shows icon, title,
   percent and a thin bar. Clicking it calls `showTab(a.tab)`. Hidden when idle.
2. **FAB** — when an activity exists, `fabBadge` shows icon + percent and the FAB
   carries a conic-gradient ring driven by a `--p` custom property. When idle it
   reverts to today's pending-count behaviour.
3. **Clip card** — the card for the item being uploaded gains a progress bar fed by
   `uploadProg.pct`. `it.msg` is left alone, including the thumbnail loop's existing
   `round N · <studio text>` concatenation.
4. **Claims card** — unchanged. Still calls `computeStatus()` for the full 6-step display.

`renderActivity()` is called from the 800 ms tick and directly from `setItem` and
`updateRunUI` for immediate response. It is guarded by a signature string in the same
style as `updateChannelUI`'s `lastChanKey`, so an unchanged activity costs no DOM work.

### Styling

About ten lines, reusing the existing `.bar` / `.progress` rules and the
`--info` / `--ok` / `--warn` tokens. The indeterminate case reuses the existing
`.ind` modifier.

### Failure modes

- `activity()` wraps the `Claims.status()` call in try/catch and degrades to the
  upload branch, so a fault in the copyright module cannot take the queue UI with it.
- `renderActivity()` runs inside the tick's existing try/catch.
- A changed Studio progress format costs the in-clip percentage and nothing else:
  `parseUploadPct` returns null, the bar falls back to clip-count, the detail line
  goes blank.

### Decisions

- **Upload outranks claims** when both are live. A scan is read-only and can overlap
  an upload; the upload is the thing that cannot be re-run cheaply.
- **The bar and the FAB are clickable** and jump to the owning tab.
- **Both hide completely when idle.**

## Tests

Added to the existing zero-dependency suite (`node --test test/*.test.mjs`), which
slices pure blocks out of the userscript and runs them with stubs.

`parseUploadPct`:
- `"Uploading 45% … 3 minutes left"` → `0.45`
- the Thai equivalent → `0.45`
- `"Upload complete"` → `null`
- `"100%"` → `1`
- `"250%"` → clamped to `1`
- `""` → `null`

`activityFrom`:
- nothing running → `null`
- upload running alongside a busy claims run → the upload branch wins
- claims status `idle` or `ok` → `null`
- claims status `wait` → shown
- 3 of 12 clips done at 45% through the current clip → `progress ≈ 0.29`
- upload running with an unparseable Studio string → `progress = 3/12`, detail `''`

## Out of scope

- Notification API, sound, or any OS-level alert
- A self-computed ETA — Studio already provides one in its own string
- Run history or a log of past runs
- Hooking the transfer directly; Studio owns the XHR, so parsing its text is the only
  available source of in-clip percentage
