# YouTube Upload Presets

Chrome extension for YouTube Studio: multi-file upload with presets, scheduling, thumbnails, and copyright claim scanning/trimming.

The extension lives in [`extension/`](extension/). How to install, update and use it, and how to
develop it: [`extension/README.md`](extension/README.md). What each version brought:
[`extension/CHANGELOG.md`](extension/CHANGELOG.md).

The Tampermonkey userscript this started as is no longer developed; its last version (4.28.0)
is in the git history.

## Working on this repo with Claude Code

`CLAUDE.md` holds the agent rules. The skills, plugins and tools they assume, and how to
install them, are in [`docs/agents/setup.md`](docs/agents/setup.md).

## Running tests

```sh
cd extension
npm install
npm run check    # tsc + vitest + ui-check
```

## Where to look when YouTube changes Studio

Everything tied to Studio's markup lives in two tables:

- `extension/lib/studio/sel.ts` (`SEL`) — every element name and id the extension looks for
- `extension/lib/studio/txt.ts` (`TXT`) — every regex matched against text Studio renders
  (adding a language = editing this table)

`TXT` holds the regexes matched against text *YouTube* renders. It is separate from `L(th, en)`,
which holds the extension's own UI strings.

## Releasing a new version

See "Release check" in [`extension/README.md`](extension/README.md): bump `version` in
`extension/package.json`, add its `CHANGELOG.md` section, run `npm run release:check` on main,
then tag `v<version>` and attach the zip to a GitHub release.

## Language

The UI is available in English and Thai. New installs start in English.
