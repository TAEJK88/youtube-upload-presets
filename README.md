# YouTube Upload Presets

Tampermonkey userscript for YouTube Studio: multi-file upload with presets, scheduling, thumbnails, and copyright claim scanning/trimming.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Open: https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js
3. Click **Install**

After installing, set your producer name in **Settings → General** and your own artist/label names in the **Copyright** tab settings. Use **Settings → Backup / share** to export or import presets as JSON.

## Running tests

The pure functions (templating, chapter rules, tracklist rewriting, storage migrations)
are covered by zero-dependency tests. They slice the relevant blocks out of the userscript
and run them with stubs, so there is no build step:

```sh
node --test test/*.test.mjs
```

Run them before bumping `@version`.

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
