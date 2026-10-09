# YouTube Upload Presets

Tampermonkey userscript for YouTube Studio: multi-file upload with presets, scheduling, thumbnails, and copyright claim scanning/trimming.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Open: https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js
3. Click **Install**

After installing, set your producer name in **Settings → General** and your own artist/label names in the **Copyright** tab settings. Use **Settings → Backup / share** to export or import presets as JSON.

**Copy a pattern from a video.** Every preset dropdown also lists your top 10 public videos from the last
6 months by views (⭐ = most viewed). Picking one learns its title, description and tags as a template:
the tracklist, artists, track count, year, BPM and quoted beat name become variables, so each new upload
gets its own values in the same format. You review the learned pattern before it's used; it is stored per
channel and is not added to your preset list.

## Running tests

The pure functions (templating, chapter rules, tracklist rewriting, storage migrations,
collab matching) are covered by zero-dependency tests. They slice the relevant blocks out
of the userscript and run them with stubs, so there is no build step:

```sh
node --test test/*.test.mjs
```

Run them before bumping `@version`.

The collab flows talk to Studio, so they cannot be tested as pure functions.
`test/fake-dom.mjs` is a small DOM (selectors, `closest`, `click`, visibility) that two
mocks build on:

- `test/mock-studio.mjs` → the collaborator dialog, driving the real
  `inviteCollaborators()` in `test/collab-dialog.test.mjs`.
- `test/mock-invite.mjs` → the "Collaboration requests" list and its accept modal,
  driving the real `watchInvite()` in `test/invite-accept.test.mjs`.

Both mocks record what actually happened (saved / accepted) separately from what the
script reports, which is what catches a run that claims success without doing anything.
Both are built from markup captured off real Studio pages; if YouTube changes that
markup, update the mock alongside `SEL` so the tests keep describing reality.

## Where to look when YouTube changes Studio

Everything tied to Studio's markup lives in two tables near the top of the script:

- `SEL` — every element name and id the script looks for
- `TXT` — every regex matched against text Studio renders (adding a language = editing this table)

With the upload dialog open on the details step, the **Copy upload dialog info** button in
Settings dumps a `selectors` report listing which `SEL` entries no longer match anything on
the page.

`TXT` holds the regexes matched against text *YouTube* renders. It is separate from `L(th, en)`,
which holds the script's own UI strings.

## Releasing a new version

Bump `@version` in the header and push to `main`. Tampermonkey picks up the update automatically.

## Language

The UI is available in English and Thai. Switch in **Settings → General → Language / ภาษา**. New installs start in English.
