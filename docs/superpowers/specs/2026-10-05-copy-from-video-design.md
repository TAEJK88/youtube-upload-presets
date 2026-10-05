# Copy the pattern from an existing video

**Date:** 2026-10-05
**Target:** `youtube-upload-presets.user.js` (v4.26.0)
**Status:** approved design, not yet implemented

## Problem

Every queued clip gets its title, description and tags from a preset. The best
template a channel has is often the format of its own most-watched video, but
copying that format into a preset is manual work: read the video, swap the
artists, year and tracklist for variables by hand, then save a new preset.

## Goal

Wherever a preset can be picked, an existing upload can be picked instead. The
script learns a template from that video (the same format, with the changing
parts replaced by variables) and uses it as if it were a preset. The channel's
top videos by views over the last 6 months are offered, with #1 marked as the
recommendation. Nothing is added to the preset list.

## Non-goals

- Saving learned templates as normal presets, or overwriting existing presets.
- Searching every upload. Only the top 10 are offered.
- Copying non-text settings (category, playlists, made-for-kids, thumbnails).
- Auto-selecting the recommended video. It is marked ⭐ but never replaces the
  user's default preset unless the user picks it.

## Design

### 1. Video list

`listTopVideos()` reads the current channel's uploads with
`creator/list_creator_videos` (same filter as `listVideos`, order
`VIDEO_ORDER_DISPLAY_TIME_DESC`, `pageSize: 50`), and the mask asks for
video id, title, privacy, publish time and view count.

- Paging stops at the first video published more than 6 months ago, or after
  10 pages, whichever comes first.
- Only public videos are kept. They are sorted by views (descending) and cut to
  10.
- The result is cached per channel in memory for the session. A "↻ Refresh"
  option in the dropdown group reloads it.
- The read starts when the panel first opens and Studio is ready
  (`ycfg('INNERTUBE_CONTEXT')`). Until it finishes, the group shows
  "Loading…".

The exact mask and response field names for publish time and view count must
be confirmed against a live Studio response before implementation relies on
them, in the same way `listScheduled` records its verified shape in a comment.

### 2. Dropdown

`presetOptions(selected)` returns two `<optgroup>`s:

1. **Presets**: the existing options, unchanged.
2. **Copy from video (last 6 mo, by views)**: one option per top video,
   `value = 'v:' + videoId`, labelled `⭐ <title…>  182K` for #1 and
   `<title…>  94K` for the rest (titles shortened to fit, views in compact
   form). If the list is still loading, failed or is empty, the group holds a
   single disabled option that says so.

This applies to both the "preset for new videos" select and each card's
select. `Alt+1…9` still selects real presets only.

### 3. Video templates in place of presets

A learned template is a preset-shaped object
`{ id: 'v:<videoId>', label, title, description, tags, visibility, artistPriority, artistMax, source: { videoId, title, views } }`.

Learned templates are stored per channel under one GM key
(`videoTemplates:<channelId>` → `{ [id]: template }`). `presetById(id)` looks
up `v:` ids there first, and otherwise behaves as today. Because every render
path (card preview, `itemVars`, `itemTracklist`, `uploadOne`, Apply to all)
already goes through `presetById`, these paths need no changes.

If a `v:` id is no longer stored (for example after a channel switch),
`presetById` falls back to `presets[0]` as it already does for unknown ids,
and the card shows a warning chip so the fallback is visible.

The video templates are not included in the JSON backup, because they belong
to one channel.

### 4. Learning: `learnTemplate(video)` (pure)

Input: `{ title, description, tags, publishedYear }`. Output: the
`title` / `description` / `tags` / `artistMax` of a template. Steps, in order:

1. **Tracklist.** Find the longest run of 3 or more consecutive description
   lines that start with a timestamp (the same timestamp pattern as
   `parseTracks`). Replace that run with `{txt}`, keeping any heading such as
   `Tracklist:` that sits above it. Parse the run with `parseTracks()` to get
   the source's `artistList` and `trackcount`.
2. **Artists.** In the title and the rest of the description, find the longest
   run of names from `artistList` joined by `, ` (also ` x `, ` & `) and
   replace it with `{artists}`. `artistMax` = the number of names in the
   title's run (minimum 1, default 4 if the title had none).
3. **Track count.** A number equal to `trackcount` that sits next to
   "songs"/"tracks"/"เพลง" becomes `{trackcount}`.
4. **Year.** A standalone `20xx` equal to the publish year or the current
   year becomes `{year}`.
5. **BPM.** `<number> BPM` becomes `{bpm} BPM`.
6. **Tags.** Tags that equal a name in `artistList` (case-insensitive) are
   removed and a single `{artists}` tag is added in place of the first one.
   The other tags get step 4 applied.

When there is no tracklist, steps 1 to 3 do nothing. The artists stay as plain
text and the result carries `warnings: ['no-tracklist']`.

Visibility is `PRIVATE` (as with the built-in presets). The schedule settings
still decide the final publish state. `artistPriority` is `[]`.

### 5. Review dialog

The first time a video is picked (from either select), the script fetches its
description and tags with `creator/get_creator_videos` for that one video id,
runs `learnTemplate`, and opens a dialog with:

- the source video's title and views,
- editable title, description and tags fields holding the learned template,
- a live preview rendered with the first queued clip's values (or sample
  values when the queue is empty), using the existing render functions,
- any warnings, e.g. "No tracklist found: artists were kept as plain text".

**Use this pattern** stores the template and applies the pick. **Cancel**
puts the select back to its previous value. Picking the same video later uses
the stored template without a dialog. A "Re-learn" link in the dialog's
source line fetches and learns again.

### 6. Errors

- The list fails to load: the group shows "Couldn't load videos ↻" and the
  presets keep working.
- `get_creator_videos` fails: log the error, show it in the dialog, and put
  the select back.
- Studio isn't ready: the existing "Studio hasn't finished loading" warning.

### 7. UI strings

Every new string goes through `L(th, en)`. Studio text is not matched, so
`TXT` and `SEL` don't change.

## Testing

- `test/learn-template.test.mjs` (zero-dependency, sliced out of the script
  like the existing tests) covers `learnTemplate`:
  - round trip: learn from a source, render it with the source's own tracklist
    through `buildVars` / `makeTitle` / `renderDesc`, and get the original
    title and description back;
  - the TrapSoul and Playlist formats of the default presets;
  - no tracklist → no `{artists}` and a `no-tracklist` warning;
  - a year that isn't the publish year or the current year stays literal;
  - artist tags collapse into one `{artists}` tag.
- The top-videos selection (6-month cutoff, public only, sort, top 10) is a
  pure function over the API's video list and is tested the same way.
- `presetById` resolves `v:` ids and falls back for missing ones.
- Manual check on live Studio: the list loads with real view counts, picking
  ⭐ opens the review dialog, and a queued clip uploads with the learned title.

## Release

Minor version bump (v4.27.0), with tests run before the bump as the README
requires.
