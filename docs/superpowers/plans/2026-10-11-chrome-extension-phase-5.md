# Chrome Extension — Phase 5 (Cutover: parity checklist, packaging and release, the userscript's last version) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Entry gate (nothing below starts before it):** the owner has passed the Phase 4 manual checklist (`extension/README.md` items 46–74) on the 4b build, and whatever that pass turned up is fixed and merged into `extension-phase-2`. Those fixes are not in this plan. Calls 35 and 36 of Phase 4 are either accepted or changed. Every line number below was read at `2250ed2`; if the fixes moved a line, the code wins.

**Three gates inside the plan.** Tasks 0–8 are ordinary agent work on the branch. Tasks 9, 10 and 11 each begin with a step only the owner can do or approve (merge and push, publish a GitHub Release, publish the userscript's last version). No agent pushes, opens a PR, tags, creates a release or edits `youtube-upload-presets.user.js` / root `test/` before the owner's go for that task. In this environment a runtime hook also refuses any `gh release …` command from an agent, including read-only ones.

**Goal:** Make the extension the thing the team uses: prove parity with the userscript at v4.27.1 row by row, ship a zip the team can install and update without losing data, tell them when a newer build exists, and release one last userscript version that says "moved to the extension" while it keeps working.

**Architecture:** Parity is data, not prose: `scripts/parity-check.mjs` derives an inventory from the pinned userscript (`git show d15ef87:…`), and `scripts/parity/rows/*.mjs` must hold one row per inventory item; `PARITY.md` is generated from the rows and `--release` refuses a `missing` row. The update check is one background module (`lib/update-check.ts`) writing one storage key the panel's banner reads. Packaging is `wxt zip` plus `scripts/release-check.mjs`, which builds, zips and inspects the result. The userscript's notice is a small pure block (testable through `test/harness.mjs`) plus one element in the drawer.

**Tech Stack:** as Phase 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` — "Background" (Update check), "Data migration from the userscript", "Rollout" row 5, "Decisions" (audience: unpacked zip from GitHub Releases).

## What was verified before writing this (at `2250ed2`)

| Claim | How it was checked | Result |
|---|---|---|
| The userscript on the branch is the pin | `git diff --quiet d15ef87 HEAD -- youtube-upload-presets.user.js test` | unchanged; root tests 163 pass / 0 fail |
| What exists after the pin | `git ls-remote --heads origin`, `git log d15ef87..origin/main` | `origin/main` is `c2564c3`: 4 commits past the pin, **userscript v4.28.0 "copy the pattern from a top video"** (+291 lines, 23 new `L()` lines, a new per-channel key `videoTemplates:<ch>`, `activeId` may now be `'v:<videoId>'`, 18 new root tests: 181 pass). Local `main` is still `d15ef87`. |
| Other branches | `git merge-base --is-ancestor`, `gh pr list --state all` | `review-improvements-*` and `tampermonkey-to-extension-*` are the squash-merged PRs #1–#3 (stale). `r2-backup-setup-beeb961d` (Cloudflare R2 backup, header v4.26.0, branched at v4.25.1, 12 commits, adds `worker/`) is **local only and unmerged**. |
| Does merging `origin/main` conflict? | `git merge-tree --write-tree HEAD origin/main` | exit 0, no conflict. The branch touched only `extension/` and `docs/`; `origin/main` touched the userscript, root `README.md`, `test/` and two new docs. |
| Port and string checks after such a merge | `scripts/port-check.mjs:22-24`, `scripts/ui-check.mjs:35,170` | both read the userscript with `git show <PIN>:…`, never the working tree. A newer userscript in the tree changes nothing for them. No extension test reads `../test/` or the working-tree userscript. |
| Menus, GitHub sync, update check in the userscript | `grep GM_registerMenuCommand|github|GM_xmlhttp|@connect` at the pin | none. Updates were Tampermonkey's `@updateURL` (raw `main`). Shortcuts: Alt+P and Alt+1…9 only (6386–6404). |
| Update check in the extension | `grep -rni github extension/{lib,entrypoints,components}` | none. `https://api.github.com/*` is a host permission nothing uses yet. The spec says "Built in Phase 5". |
| Repo visibility | `gh repo view --json visibility` | PUBLIC, so the unauthenticated releases API works. `git ls-remote --tags origin`: no tags, so no tagged release exists yet. (`gh release list` is blocked by the hook; not run.) |
| Manifest `key`, icons | `.output/chrome-mv3/manifest.json`, `extension/public/` | no `key`, no `icons`; `public/` holds only `THIRD-PARTY-NOTICES.txt`; notifications use a 48 px red dot (`lib/notify.ts`). |
| `wxt zip` | `package.json` (`"zip": "wxt zip"`), `node_modules/wxt/dist/core/{zip,resolve-config}.mjs` | zips **the build folder only** (`outDir`), to `.output/youtube-upload-presets-extension-5.0.0-chrome.zip`; a sources zip is made for Firefox/Opera only. The current build has 39 files, 1.2 MB, no `.map`. Tests, `.vitest`, `.claude` can't get in unless they are under `public/`. |
| Backup import | `lib/backup.ts`, `lib/store-writer.ts:80-87`, `tests/backup.test.ts`, userscript 4403–4460 | a userscript export (format 1) imports unchanged. The file holds presets, `activeId`, counters, settings (no `lockChannel`, no `lang`) and `claimsCfg`. **Not in the file:** `uploads` (upload history, ≤1000 rows), `channels`, `songHistory`, `collabHandles`, `fabPos`, every per-channel copyright key. An unknown `activeId` (`'v:…'` from v4.28.0) falls back to the first preset (`backup.ts:79`). |
| Language after a move | `lib/i18n.ts:14-18`, `lib/store-writer.ts:103-108` | a fresh extension resolves to English and stores it; the import never takes `lang`. A Thai teammate lands in English and must switch once. |
| Leftovers | `lib/claims/store.ts:55`, `lib/panel/claims-data.ts:59`, `scripts/strings/dropped.mjs:19`, spec Rollout row 5, `tests/claims-alarms.test.ts` | `onClaimsStored` has no caller at all; `readClaims` is called only by its test; 'Claimant' cites line 4881 but is also the songs table's header (5240); the spec still says v4.26.1; the alarm tests pin "each call reads the key itself" (line 85) but not the serial chain. |
| `.codegraph/` | `ls` | does not exist in this worktree (the brief said it does). Plain `grep` was used. |

## Global Constraints

Identical to Phase 4b's **Global Constraints** (which include 4a's and Phase 3's). Phase 5 adds:

| # | Topic | Decision |
|---|---|---|
| D28 | The pin | Parity is against v4.27.1, `d15ef87` (`PIN` in `port-check.mjs`, `ui-check.mjs` and the new `parity-check.mjs`). v4.28.0's copy-from-video is **not** ported here; it is listed in `PARITY.md` under "After the pin" with the owner's decision (open question 1). |
| D29 | No publishing by agents | No `git push`, PR, tag, `gh release`, merge to `main`. Scripts may print the commands for the owner. |
| D30 | Userscript and root `test/` | Untouched until Task 11's go. Root `node --test test/*.test.mjs` is 163/0 until Task 9 merges `origin/main`, then 181/0, then 181 + the notice's tests after Task 11. |
| D31 | Manifest | Permissions stay exactly `sidePanel, storage, unlimitedStorage, alarms, notifications`; hosts `https://studio.youtube.com/*`, `https://www.youtube.com/*`, `https://api.github.com/*`; only `file-bridge.html` web-accessible. The only manifest additions this plan may make are `key` (call 5) and `icons` (call 6), each only if the owner says yes. |
| D32 | Update check | Background only. `GET https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest`, at most once per 24 h, no auth, 10 s limit. Its result is stored as `updateCheck` in `storage.local` (not part of a backup, like `apNotified`). A link is shown only if it starts with `https://github.com/TAEJK88/youtube-upload-presets/releases/`. Any failure (offline, 403 rate limit, 404 no release, bad JSON) is silent: a console warning, no banner, the last good answer kept. |
| D33 | Strings | Every new `L()` pair in the extension is registered in `scripts/strings/extension-only.mjs` with Thai and a `why`. The userscript's notice strings live in the userscript only. |
| D34 | Commits | End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `.claude/`, `extension/.claude/`, `extension/.vitest/`, `test/.claude/`, `.superpowers/`, `.harness-worktrees/`. |
| D35 | After every task | `cd extension && npm run check && npm run build` pass; `node --test test/*.test.mjs` at the repo root passes with the count D30 gives. |

## Judgment calls this plan is built on

Full text, with recommendation, in `.superpowers/sdd/p5/planning-report.md`. **B** = changes what a user sees. Tasks marked "(call N)" are done only if the owner approves that call.

| # | Call | B? | Plan follows |
|---|---|---|---|
| 1 | Pin stays v4.27.1; v4.28.0 is an open question, not ported silently | | recommended |
| 2 | The checklist is data (`scripts/parity/`) rendered to `extension/PARITY.md`; in-Chrome proof is README item numbers on each row | | recommended |
| 3 | A `missing` row closes by a port (test first) or by a recorded owner decision; the release check refuses otherwise | | recommended |
| 4 | Update check as the spec says: daily, banner with a link, no dismiss, no off switch | B | Task 4 |
| 5 | A manifest `key` for one stable extension id | B | Task 7 Step 1 (call 5) |
| 6 | Real icons instead of Chrome's letter tile and the red dot | B (look) | Task 7 Step 2 (call 6) |
| 7 | The extension holds its own automation while the userscript is active in the same tab, and says so | B | Task 5 (call 7) |
| 8 | A "move file": the last userscript exports upload history, channel list and language; the extension imports them from the owner's own file | B | Task 6 + Task 11 Step 5 (call 8) |
| 9 | The notice: always in the drawer, a toast once a day, never during a run; the script keeps working | B | Task 11 |
| 10 | The notice version is v4.29.0 on top of `origin/main`'s v4.28.0 | | Task 11 |
| 11 | The notice links to the root README on `main`, not to a release | | Task 11 |
| 12 | Route to `main`: merge `origin/main` into the branch, then a PR, squash like #1–#3, keep the branch | | Task 9 |
| 13 | First release is 5.0.0 as built; `extension/CHANGELOG.md`; tag `vX.Y.Z` | | Task 7 |
| 14 | Install and update by replacing the contents of one fixed folder | | Task 8 |
| 15 | Delete the two orphans (`onClaimsStored`, `readClaims`) | | Task 0 |

## Review Focus

- **A v4.28.0 export.** Most teammates are on v4.28.0 today (Tampermonkey updated them). Their export can carry `activeId: 'v:<videoId>'`. The import must land on the first preset, not on a dangling id (Task 0 Step 2 pins it).
- **GitHub says no.** Offline, 403 (rate limit: 60 per hour per IP, an office shares one), 404 (no release yet), HTML instead of JSON, a tag like `userscript-4.29.0`. None may show a banner, throw in the service worker or erase the last good answer (Task 4 tests).
- **An older "latest".** The owner runs a build newer than the newest release. No "Update available" for an older or equal version (Task 4 test).
- **Both installed.** A teammate installs the extension and forgets Tampermonkey. Two automations in one tab must not both trim or both start uploads (Task 5, call 7; README item).
- **A new folder per version.** macOS unzips to a folder named after the zip. Without a `key` that is a new extension id and an empty extension next to the old one (Task 7 Step 1; README "Update"; a manual item records what Chrome does).
- **A move file from someone else.** Upload history and channels are personal. They are imported only on "My file", row by row, with avatar links limited to `https:` (Task 6 tests).
- **The notice during a run.** The daily toast must not replace a queue toast mid-upload, and a clock set back must not silence it for ever (Task 11 tests).

## Parallel execution map

Each agent works in its own git worktree, created by hand by the controller from the same base (`git worktree add <scratch>/p5/<unit> -b p5-<unit> <base>`, `node_modules` linked); never `isolation: 'worktree'` (Phase 4b's lesson). The task sections stay the source of each unit's steps.

### The limits, plainly

- **Shared one-line files:** `package.json` (scripts), `scripts/strings/extension-only.mjs`, `entrypoints/background.ts`, `entrypoints/sidepanel/shell/Banners.tsx`, `tests/panel-i18n.test.tsx`. Unit K adds the script entries and marker lines first; after that each has one owner per wave.
- **`README.md`, the spec, `PARITY.md`, `CHANGELOG.md`** are written only by the last serial unit Z.
- **Tasks 9–11 are serial and owner-gated.** Nothing runs beside them.

### Units

| Unit | From | Depends on | Creates / modifies (hot files in **bold**) |
|---|---|---|---|
| **K** carry-ins and contracts | Task 0; Task 1 Steps 1–4 | entry gate | Task 0's files; `scripts/parity-check.mjs`, `tests/parity-check.test.ts`, `scripts/parity/rows/*.mjs` (seeded `missing`); **`package.json`** (`parity`, `release:check`, `check` gains `parity-check`); **`extension-only.mjs`**: three marker lines `// 5 U (update check)`, `// 5 G (userscript in the tab)`, `// 5 M (move file)` |
| **A1** rows: data | Task 2 | K | `scripts/parity/rows/data.mjs` |
| **A2** rows: upload, presets, settings UI | Task 2 | K | `scripts/parity/rows/ui-upload.mjs` |
| **A3** rows: copyright UI | Task 2 | K | `scripts/parity/rows/ui-copyright.mjs` |
| **A4** rows: page side and ports | Task 2 | K | `scripts/parity/rows/page.mjs` |
| **U** update check | Task 4 | K | `lib/update-check.ts`, `tests/update-check.test.ts`, **`entrypoints/background.ts`** (one block at the end), **`Banners.tsx`** (one banner), `tests/panel-shell.test.tsx`, **`tests/panel-i18n.test.tsx`**, `extension-only.mjs` under its marker |
| **M** move file, extension side (call 8) | Task 6 | K | `lib/backup.ts`, `tests/backup.test.ts`, `tests/store-writer.test.ts`, `extension-only.mjs` under its marker (none expected) |
| **R** packaging | Task 7 | K | `wxt.config.ts`, `public/icon/*` (call 6), `scripts/release-check.mjs`, `tests/release-check.test.ts` |
| **G** userscript in the tab (call 7) | Task 5 | U merged (shares `Banners.tsx`, `panel-i18n`) | `lib/studio/userscript-here.ts`, `tests/userscript-here.test.ts`, `lib/studio/queue-view.ts`, `entrypoints/studio.content.ts`, `Banners.tsx`, tests, `extension-only.mjs` under its marker |
| **C** close `missing` rows | Task 3 | A1–A4 merged | one agent per row; files depend on the row |
| **Z** docs and exit | Task 8 | everything above | **`README.md`**, `CHANGELOG.md`, `PARITY.md`, the spec, full verification |

### Waves

```
entry gate ─► K ─┬─► A1 A2 A3 A4 ─► C (one agent per missing row) ─┐
                 ├─► U ─► G                                          ├─► Z ─► [owner] 9 ─► [owner] 10 ─► [owner] 11
                 ├─► M                                               │
                 └─► R ──────────────────────────────────────────────┘
```

Wave 1 is seven agents (A1–A4, U, M, R). If that is too many: run A1–A4 first, since C depends on what they find and is the unknown in the schedule.

### Things that only work once merged (Z checks them)

- `npm run parity -- --release` passes only when no row is `missing`.
- `npm run release:check` runs the parity release check, so it fails until C is done.
- The Thai render of the two new banners (`panel-i18n`) once U and G are both in.

## File Structure

```
extension/
  CHANGELOG.md                         new (Z): one section per released version
  PARITY.md                            new, generated (Z): parity-check --write
  README.md                            Z: title, Install, Update, Moving, items 75+, known behaviour
  wxt.config.ts                        R: key (call 5), nothing else
  public/icon/{16,32,48,128}.png       R (call 6): WXT turns public/icon/<size>.png into manifest icons
  lib/update-check.ts                  U: fetch, compare, store
  lib/studio/userscript-here.ts        G (call 7): is #ytp-root in this page
  lib/backup.ts                        M (call 8): the move file's extra fields
  scripts/parity-check.mjs             K: inventory, row checks, --write, --release
  scripts/parity/rows/data.mjs         A1: header, storage keys, settings, cfg, variables, backup file
  scripts/parity/rows/ui-upload.mjs    A2: drawer 2428–4586 (Upload, Presets, Settings, shell, FAB)
  scripts/parity/rows/ui-copyright.mjs A3: copyright UI inside 4592–6356
  scripts/parity/rows/page.mjs         A4: ports, shortcuts, notifications, tab title, intercept
  scripts/release-check.mjs            R: build, zip, inspect
  tests/{parity-check,update-check,userscript-here,release-check}.test.ts   new
docs/superpowers/specs/2026-10-05-chrome-extension-design.md   Z: amendments
README.md                              Task 9, after the merge: the extension first, the userscript second
youtube-upload-presets.user.js         Task 11 only
test/harness.mjs, test/moved-notice.test.mjs                   Task 11 only
```

---

### Task 0: Carry-ins from Phase 4b

**Files:**
- Modify: `extension/tests/claims-alarms.test.ts` (one test, after line 106)
- Modify: `extension/tests/backup.test.ts` (one test)
- Modify: `extension/lib/claims/store.ts:55`, `extension/lib/panel/claims-data.ts:59`, `extension/tests/panel-claims-data.test.ts:5,22`
- Modify: `extension/scripts/strings/dropped.mjs:19`

**Interfaces:**
- Consumes: `armAutopilot(ch, now?)` (`lib/claims/alarms.ts`), `applyBackup`, `parseBackup` (`lib/backup.ts`).
- Produces: nothing new.

- [ ] **Step 1: Pin the `armAutopilot` chain (test only; it must pass on HEAD and fail when the chain is removed)**

Add inside `describe('Auto-pilot alarms', …)` in `tests/claims-alarms.test.ts`:

```ts
  it('two calls for one channel run one after the other: the later value wins', async () => {
    const t1 = NOW + 3600e3;
    const t2 = NOW + 7200e3;
    await stored('UC1', { on: true, next: t1 });
    // The first call's read of its key is slow; the second call starts while it waits.
    const read = browser.storage.local.get.bind(browser.storage.local);
    let release = () => {};
    const held = new Promise<void>((r) => { release = r; });
    const spy = vi.spyOn(browser.storage.local, 'get').mockImplementationOnce((async (keys: unknown) => {
      const got = await read(keys as never);
      await held;
      return got;
    }) as never);
    const first = armAutopilot('UC1', NOW);
    await stored('UC1', { on: true, next: t2 });
    const second = armAutopilot('UC1', NOW);
    await new Promise((r) => setTimeout(r, 20)); // without the chain the second call finishes here
    release();
    await Promise.all([first, second]);
    spy.mockRestore();
    expect(await alarms()).toEqual([['ap:UC1', t2]]);
  });
```

Run: `cd extension && npx vitest run tests/claims-alarms.test.ts`
Expected: PASS. Then prove it bites: in `lib/claims/alarms.ts` change `const run = chain.then(() => arm(ch, now));` to `const run = arm(ch, now);`, run again, expected FAIL (`ap:UC1` at `t1`), and restore the line. Say in the report that the mutant was killed.

- [ ] **Step 2: Pin the import of a v4.28.0 export (test only)**

Add to `describe('parseBackup', …)` in `tests/backup.test.ts`, next to "falls back to the first preset when activeId is unknown":

```ts
  it('a v4.28.0 export whose main preset is a pattern learnt from a video lands on the first preset', () => {
    const r = parseBackup(exported({ version: '4.28.0', activeId: 'v:dQw4w9WgXcQ' }));
    if (!r.ok) throw new Error('fixture');
    expect(applyBackup(r.data, r.presets, true, cur()).activeId).toBe('mine');
  });
```

Run: `npx vitest run tests/backup.test.ts` — Expected: PASS (it documents shipped behaviour).

- [ ] **Step 3: Remove the two orphans (call 15)**

1. `lib/claims/store.ts`: delete line 55 (`export const onClaimsStored = …`). Confirm first: `grep -rn onClaimsStored extension/lib extension/entrypoints extension/tests` prints that line only.
2. `lib/panel/claims-data.ts`: delete line 59 (`export const readClaims = …`). In `tests/panel-claims-data.test.ts` drop `readClaims` from the import on line 5, add `import { channelKeys } from '../lib/claims/keys';` (if the file doesn't import it yet) and replace `await readClaims('UC1')` on line 22 with `toClaimsData('UC1', await browser.storage.local.get(channelKeys('UC1')))`.
3. If `tsc` then reports an unused import in either file, remove that import; nothing else.

Run: `npm run check` — Expected: all green, the same number of tests as before plus Steps 1–2's two.

- [ ] **Step 4: 'Claimant' cites both tables**

`scripts/strings/dropped.mjs:19` becomes:

```js
  { th: 'ผู้ claim', en: 'Claimant', why: "header of the claim table (4881) and of the claimed-songs table (5240): both are cards" },
```

Run: `node scripts/ui-check.mjs --coverage` — Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add extension/tests/claims-alarms.test.ts extension/tests/backup.test.ts extension/tests/panel-claims-data.test.ts extension/lib/claims/store.ts extension/lib/panel/claims-data.ts extension/scripts/strings/dropped.mjs
git commit -m "Phase 5 carry-ins: the armAutopilot chain and a v4.28.0 export are pinned; onClaimsStored and readClaims removed; 'Claimant' cites both tables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The README update-order paragraph and the spec's Rollout row are Task 8's: Z owns those files.)

---

### Task 1: The parity checker

**Files:**
- Create: `extension/scripts/parity-check.mjs`, `extension/tests/parity-check.test.ts`
- Create: `extension/scripts/parity/rows/{data,ui-upload,ui-copyright,page}.mjs` (seeded)
- Modify: `extension/package.json` (scripts), `extension/scripts/strings/extension-only.mjs` (three marker comments)

**Interfaces:**
- Produces:
  - `inventory(text: string, portRegions: [number, number][]): string[]` — the ids below, sorted, unique.
  - Row shape: `{ id?: string, lines?: string[], status: 'same' | 'changed' | 'dropped' | 'missing', home?: string | string[], cite?: string, readme?: number[], manual?: true, note?: string }`.
  - `check(rows, inv, { files, readmeItems, release }): string[]` — problems, empty when fine.
  - `render(rows): string` — the text of `PARITY.md`.
  - CLI: `node scripts/parity-check.mjs` (structure), `--write` (writes `PARITY.md`), `--release` (also refuses `missing`), `--seed` (prints a row for every inventory id that has none).

**What the inventory is** (all from the pinned file, so ids never move):

| Id | From |
|---|---|
| `header:<directive> <value>` | the `@match`, `@grant`, `@run-at`, `@updateURL` lines |
| `store:<key>` | `load('k'` / `save('k'`, the `*_KEY = '…'` constants (255–257), `legacy: '…'` flags |
| `store:<key>:<channel>` | `chGet('k'` / `chSet('k'`, and `tabLock:` (5053) |
| `session:<key>` | `sessionStorage.getItem/setItem('k'` (5045) |
| `setting:<key>` | the keys of the settings object (666–691) |
| `cfg:<key>` | the keys of `Claims`' `DEFAULTS` (4593–4604) |
| `switch:<key>` | `sw('key'` (4469–4483) |
| `section:<English title>` | `sec(L('…', '…')` |
| `var:{name}` | `VARS` (579) |
| `key:Alt+<code>` | `e.code === 'KeyP'`, `/^Digit[1-9]$/` (6391–6394) |
| `tab:<pane>` | `panes.<name> = ` |
| `port:<config>` | each file in `scripts/port/` (port-check proves these; the row only names the home) |
| `ui:<line>` | every line in 2428–6356 that sets an `on…` handler or calls `addEventListener(`, **unless** it lies in a region of a port config (those are proved by port-check). About 160 lines. A row covers them with `lines: ['3726-3830']`. |

Strings are not in the inventory: `ui-check --coverage` already proves every `L()` pair of 2428–6356 is used or in `dropped.mjs`. Hand-listed things with no anchor in the source (the FAB's drag, the drawer's layout, the tab-title mark, the sound) are rows with `manual: true` and an id starting `feature:`.

- [ ] **Step 1: Write the failing test**

`tests/parity-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script
import { check, inventory, render } from '../scripts/parity-check.mjs';

const SRC = [
  '// ==UserScript==',
  '// @match        https://studio.youtube.com/*',
  '// @grant        GM_setClipboard',
  '// ==/UserScript==',
  "  const SWITCH_KEY = 'pendingChannelSwitch';",
  "  const VARS = ['name', 'bpm'];",
  '  const settings = Object.assign(',
  '    {',
  "      autoSave: true, // x",
  "      schedule: { on: false },",
  '    },',
  "    load('settings', {})",
  '  );',
  '  const saveSettings = () => 1;',
  "  const fab = h('button', { onclick: () => open() });",
  "    sec(L('ทั่วไป', 'General'), 'gear',",
  "      sw('autoSave', L('ก', 'Auto-press Save')),",
  '    const DEFAULTS = {',
  "      apMaxPct: '25',",
  '    };',
  '    const cfg = () => 1;',
  "    const chGet = (name, def) => load(name + ':' + ch, def);",
  "    chSet('trimQueue', []);",
  "    if (e.code === 'KeyP') {}",
  '  panes.queue = h();',
].join('\n');

describe('parity inventory', () => {
  it('lists header lines, storage keys, settings, switches, sections, variables, shortcuts, tabs and handler lines', () => {
    const inv = inventory(SRC, [], [1, 99]);
    for (const id of [
      'header:match https://studio.youtube.com/*', 'header:grant GM_setClipboard',
      'store:pendingChannelSwitch', 'store:settings', 'store:trimQueue:<channel>',
      'setting:autoSave', 'setting:schedule', 'cfg:apMaxPct', 'switch:autoSave', 'section:General',
      'var:{name}', 'var:{bpm}', 'key:Alt+KeyP', 'tab:queue', 'ui:15',
    ]) expect(inv, id).toContain(id);
    expect(inv).toEqual([...new Set(inv)].sort());
  });

  it('a handler line inside a ported region is not listed', () => {
    expect(inventory(SRC, [[15, 15]], [1, 99])).not.toContain('ui:15');
  });
});

describe('parity rows', () => {
  const inv = ['store:settings', 'ui:15', 'ui:40'];
  const ctx = { files: new Set(['lib/settings.ts']), readmeItems: new Set([35]), release: false };
  const ok = [
    { id: 'store:settings', status: 'same', home: 'lib/settings.ts', readme: [35] },
    { lines: ['10-50'], status: 'dropped', cite: 'dropped.mjs: opacity slider' },
  ];

  it('passes when every inventory item has exactly one row', () => {
    expect(check(ok, inv, ctx)).toEqual([]);
  });

  it('names an inventory item with no row, and one with two', () => {
    expect(check([ok[0]], inv, ctx).join('\n')).toMatch(/ui:15.*no row/);
    expect(check([...ok, { id: 'store:settings', status: 'same', home: 'lib/settings.ts' }], inv, ctx).join('\n')).toMatch(/store:settings.*2 rows/);
  });

  it('refuses a row for something the userscript does not have, unless it is marked manual', () => {
    expect(check([...ok, { id: 'store:nope', status: 'same', home: 'lib/settings.ts' }], inv, ctx).join('\n')).toMatch(/store:nope.*not in the inventory/);
    expect(check([...ok, { id: 'feature:fab drag', manual: true, status: 'same', home: 'lib/settings.ts' }], inv, ctx)).toEqual([]);
  });

  it('same and changed need a home that exists; changed and dropped need a cite', () => {
    expect(check([{ ...ok[0], home: 'lib/gone.ts' }, ok[1]], inv, ctx).join('\n')).toMatch(/lib\/gone\.ts.*does not exist/);
    expect(check([{ ...ok[0], status: 'changed' }, ok[1]], inv, ctx).join('\n')).toMatch(/store:settings.*cite/);
    expect(check([ok[0], { lines: ['10-50'], status: 'dropped' }], inv, ctx).join('\n')).toMatch(/10-50.*cite/);
  });

  it('a README item a row points at must exist', () => {
    expect(check([{ ...ok[0], readme: [999] }, ok[1]], inv, ctx).join('\n')).toMatch(/README item 999/);
  });

  it('missing rows pass the structure check and fail the release check', () => {
    const rows = [{ ...ok[0], status: 'missing', home: undefined }, ok[1]];
    expect(check(rows, inv, ctx)).toEqual([]);
    expect(check(rows, inv, { ...ctx, release: true }).join('\n')).toMatch(/store:settings.*MISSING/);
  });

  it('renders one table line per row, missing ones first', () => {
    const md = render([ok[0], { id: 'ui:40', status: 'missing', note: 'x' }]);
    expect(md.indexOf('ui:40')).toBeLessThan(md.indexOf('store:settings'));
    expect(md).toContain('| `store:settings` | same | `lib/settings.ts` |  | 35 |');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/parity-check.test.ts`
Expected: FAIL, cannot find `../scripts/parity-check.mjs`.

- [ ] **Step 3: Write `scripts/parity-check.mjs`**

```js
// Parity with the userscript at PIN (v4.27.1). The inventory comes from the pinned source, so its
// ids never move; scripts/parity/rows/*.mjs must hold one row per item saying where it lives in
// the extension, or why it doesn't. Strings are ui-check's job, ported code port-check's.
//   node scripts/parity-check.mjs            structure: every item has one row, rows are well-formed
//   node scripts/parity-check.mjs --write    also writes PARITY.md
//   node scripts/parity-check.mjs --release  also refuses a row that is still `missing`
//   node scripts/parity-check.mjs --seed     prints a `missing` row for every item without one
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'd15ef87caaddb7a6d3187d2851b83a484c4bb9e7'; // userscript v4.27.1, as scripts/port-check.mjs
const UI = [2428, 6356]; // the drawer and the copyright module, as scripts/ui-check.mjs's coverage
const STATUSES = ['same', 'changed', 'dropped', 'missing'];

const all = (text, re, f = (m) => m[1]) => [...text.matchAll(re)].map(f);
const between = (text, a, b) => {
  const i = text.indexOf(a);
  const j = i < 0 ? -1 : text.indexOf(b, i);
  return i < 0 || j < 0 ? '' : text.slice(i, j);
};
const span = (s) => { const [a, b = a] = String(s).split('-').map(Number); return [a, b]; };
const inAny = (n, spans) => spans.some(([a, b]) => n >= a && n <= b);
const HANDLER = /\bon[a-z]+\s*:\s*(?:\(|async\b|[A-Za-z_$][\w$.]*\s*[,})])|addEventListener\(/;

export function inventory(text, portRegions, ui = UI) {
  const header = between(text, '// ==UserScript==', '// ==/UserScript==');
  const keysOf = (block) => all(block, /^ {6}(\w+):/gm);
  const lines = text.split('\n');
  const handlers = [];
  for (let n = ui[0]; n <= Math.min(ui[1], lines.length); n++) {
    if (HANDLER.test(lines[n - 1]) && !inAny(n, portRegions)) handlers.push('ui:' + n);
  }
  return [...new Set([
    ...all(header, /^\/\/ @(match|grant|run-at|updateURL)\s+(\S+)/gm, (m) => `header:${m[1]} ${m[2]}`),
    ...all(text, /\b(?:load|save)\('([^']+)'/g).map((k) => 'store:' + k),
    ...all(text, /const \w+_KEY = '([^']+)'/g).map((k) => 'store:' + k),
    ...all(text, /\blegacy: '([^']+)'/g).map((k) => 'store:' + k),
    ...all(text, /\bch(?:Get|Set)\('([^']+)'/g).map((k) => `store:${k}:<channel>`),
    ...(text.includes("'tabLock:'") ? ['store:tabLock:<channel>'] : []),
    ...all(text, /sessionStorage\.(?:get|set)Item\('([^']+)'/g).map((k) => 'session:' + k),
    ...keysOf(between(text, 'const settings = Object.assign(', 'const saveSettings')).map((k) => 'setting:' + k),
    ...keysOf(between(text, 'const DEFAULTS = {', 'const cfg = ()')).map((k) => 'cfg:' + k),
    ...all(text, /\bsw\('(\w+)'/g).map((k) => 'switch:' + k),
    ...all(text, /\bsec\(L\('(?:[^'\\]|\\.)*', '((?:[^'\\]|\\.)*)'\)/g).map((k) => 'section:' + k.replace(/\\(.)/g, '$1')),
    ...all(text, /const VARS = \[([^\]]*)\]/g).flatMap((s) => all(s, /'(\w+)'/g)).map((k) => `var:{${k}}`),
    ...all(text, /e\.code === '(\w+)'/g).map((k) => 'key:Alt+' + k),
    ...(text.includes('/^Digit[1-9]$/') ? ['key:Alt+Digit1-9'] : []),
    ...all(text, /^\s*panes\.(\w+) = /gm).map((k) => 'tab:' + k),
    ...handlers,
  ])].sort();
}

const label = (r) => r.id ?? (r.lines ?? []).join(', ');
const homes = (r) => (r.home === undefined ? [] : [].concat(r.home));

export function check(rows, inv, { files, readmeItems, release }) {
  const out = [];
  const known = new Set(inv);
  const hits = new Map(inv.map((id) => [id, 0]));
  const bump = (id) => hits.set(id, hits.get(id) + 1);
  for (const r of rows) {
    const name = label(r);
    if (!r.id && !r.lines?.length) { out.push('a row has neither id nor lines'); continue; }
    if (!STATUSES.includes(r.status)) out.push(`${name}: status must be one of ${STATUSES.join(' / ')}`);
    if (r.id && known.has(r.id)) bump(r.id);
    else if (r.id && !r.manual) out.push(`${name}: not in the inventory (mark it manual: true if the source has no anchor for it)`);
    for (const s of r.lines ?? []) {
      const [a, b] = span(s);
      for (const id of inv) if (id.startsWith('ui:') && inAny(Number(id.slice(3)), [[a, b]])) bump(id);
    }
    if (r.status === 'same' || r.status === 'changed') {
      if (!homes(r).length) out.push(`${name}: ${r.status} needs a home (a file under extension/)`);
      for (const h of homes(r)) if (!files.has(h)) out.push(`${name}: home ${h} does not exist`);
    }
    if ((r.status === 'changed' || r.status === 'dropped') && !r.cite) out.push(`${name}: ${r.status} needs a cite (the approved call, the README's known behaviour, or dropped.mjs)`);
    for (const n of r.readme ?? []) if (!readmeItems.has(n)) out.push(`${name}: README item ${n} does not exist`);
    if (release && r.status === 'missing') out.push(`${name}: MISSING — port it, or record the owner's decision to drop it`);
  }
  for (const [id, n] of hits) {
    if (n === 0) out.push(`${id}: no row`);
    if (n > 1) out.push(`${id}: ${n} rows`);
  }
  return out;
}

const ORDER = { missing: 0, changed: 1, dropped: 2, same: 3 };
export function render(rows) {
  const line = (r) => `| \`${label(r)}\` | ${r.status} | ${homes(r).map((h) => '`' + h + '`').join(', ')} | ${[r.cite, r.note].filter(Boolean).join(' — ')} | ${(r.readme ?? []).join(', ')} |`;
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || label(a).localeCompare(label(b)));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return [
    '# Parity with the userscript v4.27.1',
    '',
    'Generated by `npm run parity -- --write` from `scripts/parity/rows/`. Do not edit by hand.',
    '',
    `${rows.length} rows: ${count('same')} same, ${count('changed')} changed on purpose, ${count('dropped')} dropped on purpose, ${count('missing')} missing.`,
    '',
    'The first column is the item in the pinned userscript (`ui:<line>` and line ranges are lines of the file at `d15ef87`). "In Chrome" is the README exit-check item that shows it working.',
    '',
    '| Userscript | Status | In the extension | Why / note | In Chrome (README item) |',
    '|---|---|---|---|---|',
    ...sorted.map(line),
    '',
  ].join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const text = execFileSync('git', ['show', `${PIN}:youtube-upload-presets.user.js`], { cwd: join(EXT, '..'), encoding: 'utf8', maxBuffer: 1 << 26 });
  const portDir = join(EXT, 'scripts/port');
  const ports = readdirSync(portDir).filter((f) => f.endsWith('.mjs'));
  const regions = [];
  for (const f of ports) regions.push(...((await import(pathToFileURL(join(portDir, f)).href)).default.regions ?? []).map(span));
  const inv = [...inventory(text, regions), ...ports.map((f) => 'port:' + f.replace(/\.mjs$/, ''))].sort();
  const rowDir = join(EXT, 'scripts/parity/rows');
  const rows = [];
  for (const f of readdirSync(rowDir).filter((x) => x.endsWith('.mjs')).sort()) rows.push(...(await import(pathToFileURL(join(rowDir, f)).href)).default);
  if (args.has('--seed')) {
    const have = new Set(rows.map((r) => r.id));
    for (const id of inv) if (!have.has(id) && !id.startsWith('ui:')) console.log(`  { id: ${JSON.stringify(id)}, status: 'missing', note: 'not looked at yet' },`);
    return;
  }
  const readme = readFileSync(join(EXT, 'README.md'), 'utf8');
  const readmeItems = new Set(all(readme, /^(\d+)\. \*\*/gm).map(Number));
  const files = new Set(rows.flatMap(homes).filter((h) => existsSync(join(EXT, h))));
  const problems = check(rows, inv, { files, readmeItems, release: args.has('--release') });
  const md = render(rows);
  const mdPath = join(EXT, 'PARITY.md');
  if (args.has('--write')) writeFileSync(mdPath, md);
  else if (existsSync(mdPath) && readFileSync(mdPath, 'utf8') !== md) problems.push('PARITY.md is out of date: run `npm run parity -- --write`');
  if (problems.length) {
    console.error(`parity-check: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  console.log(`parity-check: ok (${inv.length} items, ${rows.length} rows, ${rows.filter((r) => r.status === 'missing').length} missing)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
```

The `HANDLER` pattern is the one part to tune against the real file: after writing it, print the handler lines (`node -e` over `inventory(...)`, ids starting `ui:`) and read twenty of them in the pinned source (`git show d15ef87:youtube-upload-presets.user.js | sed -n '<n>p'`). Every one must be a line that wires a user action; a false hit (a property that merely starts with `on`, such as `onlyActive:`) means tightening the pattern, and the test's fixture gets that line as a negative case.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/parity-check.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Seed the rows files**

Create the four files, each `export default [ … ];` with a one-line comment naming its area:

1. `data.mjs`: paste the output of `node scripts/parity-check.mjs --seed` for ids starting `header:`, `store:`, `session:`, `setting:`, `cfg:`, `var:`.
2. `page.mjs`: the seeded `port:` and `key:` rows.
3. `ui-upload.mjs`: the seeded `switch:`, `section:`, `tab:` rows, plus one row `{ lines: ['2428-4586'], status: 'missing', note: 'not looked at yet' }`.
4. `ui-copyright.mjs`: one row `{ lines: ['4587-6356'], status: 'missing', note: 'not looked at yet' }`.

(`--seed` needs the rows directory to exist with at least one file exporting `[]`; create the four empty files first.)

- [ ] **Step 6: Wire the scripts and the markers**

`package.json` scripts:

```json
    "check": "tsc --noEmit && vitest run && node scripts/port-check.mjs && node scripts/ui-check.mjs --coverage && node scripts/parity-check.mjs",
    "parity": "node scripts/parity-check.mjs",
    "release:check": "node scripts/release-check.mjs",
```

`scripts/release-check.mjs` doesn't exist yet (Task 7 writes it); the entry is added now so only K edits `package.json`.

`scripts/strings/extension-only.mjs`, before the closing `];`:

```js
  // 5 U (update check)
  // 5 G (userscript in the tab)
  // 5 M (move file)
```

- [ ] **Step 7: Verify and commit**

Run: `node scripts/parity-check.mjs --write && npm run check && npm run build`
Expected: `parity-check: ok (N items, M rows, M missing)` with N = 292 when this was planned (273 from the pinned source, 157 of them handler lines, plus 19 port configs; a dry run of this code gave those numbers), `PARITY.md` written, everything else green.

```bash
git add extension/scripts/parity-check.mjs extension/scripts/parity extension/tests/parity-check.test.ts extension/package.json extension/scripts/strings/extension-only.mjs extension/PARITY.md
git commit -m "Parity checker: an inventory of the pinned userscript (header, storage keys, settings, switches, sections, variables, shortcuts, tabs, handler lines, ports), one row per item, PARITY.md generated; every row starts as missing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fill the rows (four agents at once, one file each)

**Files:** each agent edits exactly one of `scripts/parity/rows/{data,ui-upload,ui-copyright,page}.mjs`. Nobody runs `--write`; Z regenerates `PARITY.md` (a stale `PARITY.md` therefore fails `npm run check` inside a unit's worktree: run `npx tsc --noEmit && npx vitest run && node scripts/port-check.mjs && node scripts/ui-check.mjs --coverage` and `node scripts/parity-check.mjs --write` locally, and do not commit `PARITY.md`).

**Interfaces:**
- Consumes: the row shape and the CLI from Task 1.
- Produces: rows with a status other than "not looked at yet". A row may stay `missing`, with a `note` that says exactly what the extension lacks. That is a finding, not a failure.

**How a row is decided** (the same rule for every agent):

1. Read the item in the pinned source: `git show d15ef87:youtube-upload-presets.user.js | sed -n '<a>,<b>p'`.
2. Find it in the extension (`grep -rn` for its storage key, its English string, its setting name). `home` is the file that implements it, not a test.
3. `same`: the extension does what the userscript did. For a storage key: the same key name and shape (`lib/studio/state.ts:16` `STATE_KEYS`, `lib/claims/keys.ts` `CH_KEYS` / `GLOBAL_KEYS`).
4. `changed`: it does it differently on purpose. `cite` names where that was decided, in one of these forms: `spec: <section>`, `README: <heading>`, `P4 call <n>` / `P3 D<n>` (`.superpowers/sdd/p4/planning-report.md`), `dropped.mjs: <English string>`, `extension-only.mjs: <English string>`.
5. `dropped`: gone on purpose, with the same kind of `cite`. **A drop with nothing to cite is `missing`**, not `dropped`: an agent never decides a drop.
6. `readme`: the exit-check item numbers that show it in Chrome. Leave it out only when nothing can be seen (a storage key with no UI); say so in `note`.
7. For `lines` rows: split the seeded range into rows of one feature each (a button, a dialog, a list, a drag handler). Every `ui:<line>` must be covered by exactly one row; the checker says which lines are uncovered or covered twice.

**Known answers (verified while planning; start from these):**

| Item | Row |
|---|---|
| `header:updateURL …` | `changed`, home `lib/update-check.ts` (exists after Task 4; until U merges use `missing` with note "Task 4"), cite `spec: Background, Update check` |
| `header:grant GM_setClipboard` / `GM_notification` / `unsafeWindow` / `GM_info` / `GM_addStyle` / `GM_getValue` / `GM_setValue` | `changed`, cite `spec: GM replacements`, homes per that table |
| `header:match https://www.youtube.com/*` | `same`, home `entrypoints/invite.content.ts`, readme `[38]` |
| `store:tabLock:<channel>`, `session:tbxTabId` | `changed`, home `lib/runner-lock.ts`, cite `spec: GM replacements` (worker lease in `storage.session`), readme `[52]` |
| `setting:glass` | `dropped`, cite `spec: Side panel UI, visual differences` (migration step 5), plus a manual row `feature:setting glassV2` the same |
| `store:addedPlaylist`, `store:addedTrapsoul`, `store:migratedOwnNames` | `same`, home `lib/migrations.ts` |
| `store:uploads`, `store:channels`, `store:fabPos`, `store:queueMemo` | `same`, home `lib/studio/state.ts` (verify each is read and written, not only listed) |
| `key:Alt+KeyP` | `changed`, home `wxt.config.ts`, cite `dropped.mjs: Close (Alt+P)` (opens, can't close), readme `[1]` |
| `key:Alt+Digit1-9` | `same`, home: wherever `installShortcuts` lives (`grep -rn installShortcuts extension/lib`), readme `[34]` |
| `tab:queue|presets|claims|settings` | `same`, homes `entrypoints/sidepanel/tabs/{QueueTab,PresetsTab,CopyrightTab,SettingsTab}.tsx`, readme `[2]` |
| `port:*` | `same`, home `scripts/port/<name>.mjs` (port-check is the proof), note names the target file from the config's `file` |
| manual `feature:backup file fields` | `same`, home `lib/backup.ts`, readme `[36]` |
| manual `feature:fab accepts dropped files` | `dropped`, cite `spec: Side panel UI, FAB` |
| manual `feature:drawer opacity and blur` | `dropped`, cite `dropped.mjs: Panel opacity` |
| manual `feature:language change reloads the page` | `changed`, cite `spec: Side panel UI, visual differences`, readme `[3]` |
| manual `feature:notification click opens the drawer on the queue tab` | `changed`, home `lib/notify.ts`, cite `README: item 24` (recorded), readme `[24]` |

**Areas:**

- **A1 `data.mjs`**: every `header:`, `store:`, `session:`, `setting:`, `cfg:`, `var:` row, plus manual rows for the backup file's fields, first-run behaviour (language rule 27, `freshInstall` 599, default presets 500–587) and the migrations.
- **A2 `ui-upload.mjs`**: `switch:`, `section:`, `tab:` rows and the handler lines of 2428–4586: styles and Design B (2428–3190, no handlers expected), toast and `ask()` (3194–3260), notification, title mark and sound (3261–3290), FAB (3291–3301), tab bar and activity bar (3302–3320), channel bar and list (3321–3440), drawer open/close (3441–3500), drop zone and pickers, queue pane and cards (3500–4288), presets pane (4289–4374), backup (4375–4466), settings pane (4467–4586).
- **A3 `ui-copyright.mjs`**: the handler lines of 4587–6356 that no port region covers: the pane (`buildPane`), the claim-list modal (4860–4980), the tracklist editor (4981–5044), claimed songs (5066–5257), Ads (5258–5460), Collab (5463–5650), the trim confirm, Auto-pilot's switch and question, the settings modal, the status card and log.
- **A4 `page.mjs`**: `port:` and `key:` rows, plus manual rows for what runs in the page with no handler in 2428–6356: quick-action bars, the tracklist-fix dialog, manual fill, intercept, the unload guard ("Leave site?"), invite accept and channel switch on www.youtube.com, the 800 ms tick's two failure toasts (6363–6383).

- [ ] **Step 1 (each agent): fill the file by the rule above.**
- [ ] **Step 2 (each agent): run** `node scripts/parity-check.mjs --write` **until the only problems left belong to other areas' files.** Expected for your own ids: none.
- [ ] **Step 3 (each agent): report** the count per status and, for every `missing` row, the userscript lines, what the extension lacks, and a size guess (a string, a handler, a feature).
- [ ] **Step 4 (each agent): commit your one file.**

```bash
git add extension/scripts/parity/rows/<area>.mjs
git commit -m "Parity rows, <area>: N same, N changed, N dropped, N missing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5 (reviewer, per area): sample.** Pick 15 rows at random plus every `changed` and `dropped` row: the cited decision exists and says what the row says; the `home` really implements the item; a `same` row's behaviour was read on both sides, not assumed from a matching string. A `same` that turns out different goes back as `missing`.

---

### Task 3: Close every `missing` row

The number of rows is not known until Task 2 reports. The procedure is fixed.

- [ ] **Step 1 (controller): list them.** `node scripts/parity-check.mjs --release` prints every `MISSING` row. Put the list, with the agents' notes, in `.superpowers/sdd/progress.md`.

- [ ] **Step 2 (controller): sort each row into one of three.**
  1. **Port it.** The userscript does something a user would miss, and it fits in one task. Dispatch one agent per row (own worktree), with this brief: the userscript lines; the test to write first (the behaviour, through the module's existing test file); if the code is ported text, the `scripts/port/*.mjs` config it extends (`node scripts/port-check.mjs --print <name>` gives the starting text); any new string registered; the row then becomes `same` with its `home` and a `readme` item (new items are numbered by Z, the agent writes the item's text in its report).
  2. **Ask the owner.** Anything that looks deliberate, costs more than a task, or changes behaviour either way. It goes to the owner as a numbered call ("drop it" or "port it", with a recommendation). A "drop it" answer is recorded under "User decisions" in `.superpowers/sdd/p5/planning-report.md`; the row becomes `dropped` citing `P5 decision <n>`, and its strings go to `dropped.mjs` if `ui-check --coverage` then asks for them.
  3. **Already decided.** The agent missed a citation. Fix the row.

- [ ] **Step 3: gate.** `node scripts/parity-check.mjs --release` exits 0. Expected: `parity-check: ok (N items, M rows, 0 missing)`.

- [ ] **Step 4: commit** (per closed row, by its agent; the controller commits the row-only fixes).

---

### Task 4: Update check (spec "Background": built in Phase 5)

**Files:**
- Create: `extension/lib/update-check.ts`, `extension/tests/update-check.test.ts`
- Modify: `extension/entrypoints/background.ts` (after the Auto-pilot block at the end), `extension/entrypoints/sidepanel/shell/Banners.tsx`, `extension/tests/panel-shell.test.tsx`, `extension/tests/panel-i18n.test.tsx`, `extension/tests/background-guards.test.ts` (one source pin), `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Produces:
  - `UPDATE_KEY = 'updateCheck'`, `UPDATE_ALARM = 'update-check'`
  - `interface UpdateInfo { at: number; latest: string; url: string }` — the last good answer. `latest` is a dotted version without the `v`.
  - `newer(a: string, b: string): boolean` — is version `a` higher than `b`.
  - `checkForUpdate(now?: number, fetchFn?: typeof fetch): Promise<UpdateInfo | null>` — at most one request per 24 h; returns what is stored afterwards.
  - `registerUpdateCheck(): void` — the alarm and its listener; called once at the background's top level.
  - `updateAvailable(info: unknown, current: string): UpdateInfo | null` — for the panel.

- [ ] **Step 1: Write the failing tests**

`tests/update-check.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { checkForUpdate, newer, registerUpdateCheck, UPDATE_ALARM, UPDATE_KEY, updateAvailable } from '../lib/update-check';

const NOW = Date.UTC(2026, 9, 12);
const DAY = 24 * 3600e3;
const REL = 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/';
const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
const stored = async () => (await browser.storage.local.get(UPDATE_KEY))[UPDATE_KEY];
beforeEach(() => { fakeBrowser.reset(); vi.restoreAllMocks(); });

describe('newer', () => {
  it('compares dotted numbers, not text', () => {
    expect(newer('5.0.10', '5.0.9')).toBe(true);
    expect(newer('5.1.0', '5.0.99')).toBe(true);
    expect(newer('5.0.0', '5.0.0')).toBe(false);
    expect(newer('4.29.0', '5.0.0')).toBe(false);
    expect(newer('5.0', '5.0.0')).toBe(false);
    expect(newer('5.0.1', '5.0')).toBe(true);
  });
  it('anything that is not a dotted version is never newer', () => {
    for (const bad of ['', 'latest', '5.x', 'userscript-4.29.0', '5.0.0-beta']) expect(newer(bad, '1.0.0'), bad).toBe(false);
  });
});

describe('checkForUpdate', () => {
  it('asks GitHub for the latest release and stores its version and page', async () => {
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0', draft: false, prerelease: false });
    expect(await checkForUpdate(NOW, f)).toEqual({ at: NOW, latest: '5.1.0', url: REL + 'v5.1.0' });
    expect(vi.mocked(f).mock.calls[0]![0]).toBe('https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest');
    expect(await stored()).toEqual({ at: NOW, latest: '5.1.0', url: REL + 'v5.1.0' });
  });

  it('asks once a day at most', async () => {
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0' });
    await checkForUpdate(NOW, f);
    await checkForUpdate(NOW + DAY - 1, f);
    expect(f).toHaveBeenCalledTimes(1);
    await checkForUpdate(NOW + DAY, f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('a stored time in the future (the clock was set back) does not stop the check for ever', async () => {
    await browser.storage.local.set({ [UPDATE_KEY]: { at: NOW + 10 * DAY, latest: '5.0.0', url: REL + 'v5.0.0' } });
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0' });
    await checkForUpdate(NOW, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no release yet (404)', () => answer({ message: 'Not Found' }, 404)],
    ['rate limited (403)', () => answer({ message: 'API rate limit exceeded' }, 403)],
    ['not JSON', () => answer('<html>', 200)],
    ['a tag that is not a version', () => answer({ tag_name: 'userscript-4.29.0', html_url: REL + 'userscript-4.29.0' })],
    ['a link that is not this repo\'s release page', () => answer({ tag_name: 'v9.0.0', html_url: 'https://evil.example/releases/tag/v9.0.0' })],
    ['offline', () => vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch],
  ])('%s: the last good answer stays, nothing throws, and the next try waits a day', async (_name, make) => {
    const f = make();
    const good = { at: NOW - 2 * DAY, latest: '5.0.1', url: REL + 'v5.0.1' };
    await browser.storage.local.set({ [UPDATE_KEY]: good });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await checkForUpdate(NOW, f)).toEqual({ ...good, at: NOW });
    await checkForUpdate(NOW + 1000, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a failure with nothing stored stores only the time of the try', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await checkForUpdate(NOW, answer({}, 404))).toEqual({ at: NOW, latest: '', url: '' });
  });
});

describe('updateAvailable', () => {
  const info = { at: NOW, latest: '5.1.0', url: REL + 'v5.1.0' };
  it('only for a version above the installed one', () => {
    expect(updateAvailable(info, '5.0.0')).toEqual(info);
    expect(updateAvailable(info, '5.1.0')).toBeNull();
    expect(updateAvailable(info, '5.2.0')).toBeNull();
  });
  it('nothing for a stored value in another shape, or with a link from elsewhere', () => {
    for (const bad of [undefined, null, 'x', {}, { latest: '9.0.0' }, { ...info, url: 'javascript:alert(1)' }, { ...info, url: 'https://github.com/other/repo/releases/tag/v9' }]) {
      expect(updateAvailable(bad, '5.0.0'), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('registerUpdateCheck', () => {
  it('keeps one daily alarm, and a second start does not move it', async () => {
    registerUpdateCheck();
    await vi.waitFor(async () => expect(await browser.alarms.get(UPDATE_ALARM)).toBeTruthy());
    const first = (await browser.alarms.get(UPDATE_ALARM))!.scheduledTime;
    registerUpdateCheck();
    await new Promise((r) => setTimeout(r, 10));
    expect((await browser.alarms.get(UPDATE_ALARM))!.scheduledTime).toBe(first);
    expect((await browser.alarms.getAll()).filter((a) => a.name === UPDATE_ALARM)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/update-check.test.ts` — Expected: FAIL, cannot find `../lib/update-check`.

- [ ] **Step 3: Write `lib/update-check.ts`**

```ts
import { browser } from 'wxt/browser';

// Update check (spec "Background"): the team installs an unpacked zip, so nothing updates the
// extension for them. Once a day the background asks GitHub for the repo's latest release; the
// side panel shows a banner when its version is above the installed one. Any failure is silent.
export const UPDATE_KEY = 'updateCheck';
export const UPDATE_ALARM = 'update-check';
const LATEST = 'https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest';
const RELEASES = 'https://github.com/TAEJK88/youtube-upload-presets/releases/';
const DAY = 24 * 3600e3;
const TIMEOUT = 10_000;

export interface UpdateInfo { at: number; latest: string; url: string }

const VERSION = /^\d+(\.\d+){0,3}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function newer(a: string, b: string): boolean {
  if (!VERSION.test(a) || !VERSION.test(b)) return false;
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

const asInfo = (v: unknown): UpdateInfo | null =>
  isObj(v) && typeof v.at === 'number' && typeof v.latest === 'string' && typeof v.url === 'string'
    ? { at: v.at, latest: v.latest, url: v.url }
    : null;

export function updateAvailable(info: unknown, current: string): UpdateInfo | null {
  const i = asInfo(info);
  return i && i.url.startsWith(RELEASES) && newer(i.latest, current) ? i : null;
}

async function latestRelease(fetchFn: typeof fetch): Promise<{ latest: string; url: string }> {
  const res = await fetchFn(LATEST, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' });
  if (!res.ok) throw new Error('GitHub answered ' + res.status);
  const body: unknown = await res.json();
  if (!isObj(body) || typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') throw new Error('unexpected answer');
  const latest = body.tag_name.replace(/^v/, '');
  if (!VERSION.test(latest) || !body.html_url.startsWith(RELEASES)) throw new Error('not a release of this extension: ' + body.tag_name);
  return { latest, url: body.html_url };
}

export async function checkForUpdate(now = Date.now(), fetchFn: typeof fetch = fetch): Promise<UpdateInfo | null> {
  const old = asInfo((await browser.storage.local.get(UPDATE_KEY))[UPDATE_KEY]);
  // A time in the future is a clock that was set back: ask again rather than wait for it.
  if (old && old.at <= now && now - old.at < DAY) return old;
  let next: UpdateInfo = { at: now, latest: old?.latest ?? '', url: old?.url ?? '' };
  try {
    next = { at: now, ...(await latestRelease(fetchFn)) };
  } catch (e) {
    console.warn('[ytup] update check', e);
  }
  await browser.storage.local.set({ [UPDATE_KEY]: next });
  return next;
}

// Called once from the background, at its top level (MV3 listeners).
export function registerUpdateCheck(): void {
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === UPDATE_ALARM) void checkForUpdate().catch((e) => console.warn('[ytup] update check', e));
  });
  void browser.alarms.get(UPDATE_ALARM)
    .then((cur) => (cur ? undefined : browser.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 24 * 60 })))
    .catch((e) => console.warn('[ytup] update alarm', e));
}
```

Run: `npx vitest run tests/update-check.test.ts` — Expected: PASS. If `fakeBrowser`'s `alarms.create` ignores `delayInMinutes`, pass `when: Date.now() + 60_000` instead and keep the test.

- [ ] **Step 4: Wire it in the background, with a source pin**

`entrypoints/background.ts`: add `import { checkForUpdate, registerUpdateCheck } from '@/lib/update-check';` and, after the Auto-pilot block at the end of `defineBackground`:

```ts
  // Update check (spec "Background"): a daily alarm, and once at each start (it asks GitHub at
  // most once a day whoever calls it).
  registerUpdateCheck();
  void ready.then(() => checkForUpdate()).catch((e) => console.warn('[ytup] update check', e));
```

Read `tests/background-guards.test.ts` and add, in its own style (it pins lines of the entrypoint's source), a test that `background.ts` calls `registerUpdateCheck()` at the top level of `defineBackground` (not inside a `.then`), and that the string `api.github.com` appears in no file under `entrypoints/` or `lib/` other than `lib/update-check.ts` (the host permission has one user).

- [ ] **Step 5: The banner — failing tests first**

In `tests/panel-shell.test.tsx`, a new `describe('update banner', …)`:

```tsx
  const REL = 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/v9.9.9';
  it('shows "Update available" with the two versions and opens the release page', async () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '5.0.0' } as never);
    await browser.storage.local.set({ updateCheck: { at: 1, latest: '9.9.9', url: REL } });
    const open = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    renderPanel(<Banners />, fakePanel());
    await flush();
    expect(screen.getByText('Update available: version 9.9.9 (you have 5.0.0)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Get the update' }));
    expect(open).toHaveBeenCalledWith({ url: REL });
  });
  it('shows nothing when the stored version is not above the installed one, and follows a later check', async () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '5.0.0' } as never);
    await browser.storage.local.set({ updateCheck: { at: 1, latest: '5.0.0', url: REL } });
    renderPanel(<Banners />, fakePanel());
    await flush();
    expect(screen.queryByText(/Update available/)).toBeNull();
    await act(async () => { await browser.storage.local.set({ updateCheck: { at: 2, latest: '9.9.9', url: REL } }); });
    await flush();
    expect(screen.getByText(/Update available/)).toBeTruthy();
  });
```

(`fakeBrowser.reset()` must run before each test in that file; if the file doesn't do it yet, add it to this `describe`'s own `beforeEach`.)

Run: `npx vitest run tests/panel-shell.test.tsx` — Expected: the two new tests FAIL.

- [ ] **Step 6: The banner**

`scripts/strings/extension-only.mjs`, under `// 5 U (update check)`:

```js
  { th: 'มีเวอร์ชันใหม่: ${} (ที่ใช้อยู่คือ ${})', en: 'Update available: version ${} (you have ${})', why: 'the unpacked extension has no auto-update; the background checks GitHub Releases once a day (spec "Background")' },
  { th: 'ดาวน์โหลดเวอร์ชันใหม่', en: 'Get the update', why: "the update banner's button: opens the release page" },
```

`Banners.tsx`: import `updateAvailable, UPDATE_KEY, type UpdateInfo` from `@/lib/update-check`; inside `Banners()`:

```tsx
  // A newer release on GitHub (lib/update-check.ts; the background asks once a day).
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    const current = browser.runtime.getManifest().version;
    const read = () => void browser.storage.local.get(UPDATE_KEY)
      .then((got) => setUpdate(updateAvailable(got[UPDATE_KEY], current)))
      .catch(() => {});
    const changed = (changes: Record<string, unknown>, area: string) => { if (area === 'local' && UPDATE_KEY in changes) read(); };
    read();
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, []);
```

and, as the **last** banner in the fragment (the ones that block work come first):

```tsx
      {update && (
        <Banner icon="download" text={L(`มีเวอร์ชันใหม่: ${update.latest} (ที่ใช้อยู่คือ ${browser.runtime.getManifest().version})`, `Update available: version ${update.latest} (you have ${browser.runtime.getManifest().version})`)}>
          <Button size="sm" onClick={() => void browser.tabs.create({ url: update.url }).catch((e) => console.error('[ytup] open release failed', e))}>{L('ดาวน์โหลดเวอร์ชันใหม่', 'Get the update')}</Button>
        </Banner>
      )}
```

(`download` is an icon `SettingsTab.tsx` already uses. `tabs.create` needs no `tabs` permission, as in `lib/claims/alarms.ts`.)

Run: `npx vitest run tests/panel-shell.test.tsx` — Expected: PASS.

- [ ] **Step 7: Thai**

In `tests/panel-i18n.test.tsx`, next to "…nor with the Re-grant banner", add a case that stores `updateCheck: { at: 1, latest: '9.9.9', url: 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/v9.9.9' }`, renders the panel in Thai and expects `มีเวอร์ชันใหม่` in the text and no English leak (the file's own helper does the leak check; follow the Re-grant case line for line).

- [ ] **Step 8: Verify and commit**

Run: `npm run check && npm run build`, then confirm the manifest is unchanged: `node -e "const m=require('./.output/chrome-mv3/manifest.json');console.log(m.permissions.join(), m.host_permissions.join())"`
Expected: `sidePanel,storage,unlimitedStorage,alarms,notifications https://studio.youtube.com/*,https://www.youtube.com/*,https://api.github.com/*`

```bash
git add extension/lib/update-check.ts extension/tests/update-check.test.ts extension/entrypoints/background.ts extension/entrypoints/sidepanel/shell/Banners.tsx extension/tests/panel-shell.test.tsx extension/tests/panel-i18n.test.tsx extension/tests/background-guards.test.ts extension/scripts/strings/extension-only.mjs
git commit -m "Update check: once a day the background asks GitHub for the latest release; the panel shows \"Update available\" with a link when it is above the installed version; every failure is silent and keeps the last good answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The userscript is still active in this tab (call 7 — only if approved)

Both installed is the likeliest cutover mistake. Each has its own storage, so each can have Auto-pilot on and each can start a queue, in the same page. The extension can see the userscript (its root element is `#ytp-root`, userscript 3192, appended to `body` at 6408); the reverse would need new code in every old userscript version. So the extension is the one that waits.

**Files:**
- Create: `extension/lib/studio/userscript-here.ts`, `extension/tests/userscript-here.test.ts`
- Modify: `extension/lib/studio/queue-view.ts` (`QueueView` gains `userscript?: boolean`), `extension/entrypoints/studio.content.ts` (three guards), `extension/entrypoints/sidepanel/shell/Banners.tsx`, `extension/tests/queue-view.test.ts`, `extension/tests/panel-shell.test.tsx`, `extension/tests/panel-i18n.test.tsx`, `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Produces: `userscriptHere(doc?: Document): boolean`; `USERSCRIPT_HERE(): string` (the sentence, a lazy `L()` as Phase 4's call 23 requires); `QueueView.userscript?: boolean` (optional: a tab of this protocol that predates it reads as "not there").

**What waits while it is there:** a queue Start, a trim / ads / Collab run asked from the panel, and the copyright tick (Auto-pilot cycles, follow-up trims, run steps). **What doesn't:** scans, edits, settings, the panel itself; Stop always works. Manual fill, the quick-action bars and the multi-file intercept are not held: the banner tells the user to turn the script off, and neither changes a published video.

- [ ] **Step 1: Failing tests**

`tests/userscript-here.test.ts`:

```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { userscriptHere } from '../lib/studio/userscript-here';

afterEach(() => { document.body.innerHTML = ''; });

describe('userscriptHere', () => {
  it('is true only while the userscript\'s root element is in the page', () => {
    expect(userscriptHere()).toBe(false);
    const root = document.createElement('div');
    root.id = 'ytp-root';
    document.body.append(root);
    expect(userscriptHere()).toBe(true);
    root.remove();
    expect(userscriptHere()).toBe(false);
  });
  it('the extension\'s own elements do not count', () => {
    const qa = document.createElement('div');
    qa.className = 'ytp-qa';
    document.body.append(qa);
    expect(userscriptHere()).toBe(false);
  });
});
```

In `tests/queue-view.test.ts`: one test that `queueView(…).userscript` is `true` with `#ytp-root` in the document and `false` without (build the view the way that file's other tests do). In `tests/panel-shell.test.tsx`: a banner test, `renderPanel(<Banners />, fakePanel({ view: { ...viewWith([]), userscript: true } }))` shows "The Tampermonkey script is still on in this tab — turn it off in Tampermonkey, then reload this tab. Uploads, trims and Auto-pilot wait until then", and no such text without the flag. (Check `fakePanel`'s and `viewWith`'s real signatures in `tests/panel-fake.tsx`; the code wins.)

Run them — Expected: FAIL (module missing; `userscript` undefined; no such text).

- [ ] **Step 2: Implement**

`lib/studio/userscript-here.ts`:

```ts
import { L } from '../i18n';

// The Tampermonkey userscript and the extension must not both drive one Studio page: each has
// its own queue and its own Auto-pilot. The userscript's root element is #ytp-root (user.js
// 3192); while it is in the page this tab starts no upload, no copyright run and no cycle.
export const userscriptHere = (doc: Document = document): boolean => !!doc.getElementById('ytp-root');
export const USERSCRIPT_HERE = () => L(
  'สคริปต์ Tampermonkey ยังเปิดอยู่ในแท็บนี้ — ปิดใน Tampermonkey แล้วโหลดแท็บนี้ใหม่ การอัปโหลด การตัด และ Auto-pilot จะรอจนกว่าจะปิด',
  'The Tampermonkey script is still on in this tab — turn it off in Tampermonkey, then reload this tab. Uploads, trims and Auto-pilot wait until then');
```

Register that pair under `// 5 G (userscript in the tab)` with `why: 'cutover: the userscript and the extension would both automate the page'`.

`lib/studio/queue-view.ts`: add `userscript?: boolean; // the Tampermonkey userscript is active in this page (call 7)` to `QueueView` and `userscript: userscriptHere()` where the view object is built.

`entrypoints/studio.content.ts`:

```ts
    // (queue:start) — first line of the handler, before isStartBinding
      if (userscriptHere()) return void ui.toast(USERSCRIPT_HERE());
```

```ts
    // (claims:trim / claims:ads / claims:collab) — wrap the three handlers
    const unlessUserscript = <T,>(run: () => T) => (userscriptHere() ? void ui.toast(USERSCRIPT_HERE()) : run());
    onMessage('claims:trim', ({ data }) => unlessUserscript(() => trimFromPanel(data)));
    onMessage('claims:ads', ({ data }) => unlessUserscript(() => adsFromPanel(data)));
    onMessage('claims:collab', ({ data }) => unlessUserscript(() => collabFromPanel(data)));
```

```ts
      // (the 800 ms interval) — the copyright tick
      try {
        if (!userscriptHere()) claims.tick();
      } catch (e) {
```

Check what the three `claims:*` handlers are typed to return in `lib/messages.ts` before wrapping; if one returns a value the panel awaits, return that type's "nothing started" value instead of `void`. `claims:autopilot` (the alarm's nudge) calls `autopilotDue`, which ticks: guard it the same way (`if (!userscriptHere()) void autopilotDue(data)…`).

`Banners.tsx`, first in the fragment (it explains why Start does nothing):

```tsx
      {view?.userscript && <Banner icon="alert" text={USERSCRIPT_HERE()} />}
```

(Use an icon name that exists in `lib/studio/dom.ts` `ICONS`; `alert` is the userscript's warning icon. If it is absent use `shield`.)

- [ ] **Step 3: Pin the guards.** In `tests/background-guards.test.ts`'s style, or in the content script's own wiring test if one exists (`ls tests | grep -i content`), a source pin that the `queue:start` handler's first statement and the interval's `claims.tick()` are both behind `userscriptHere()`. Remove each guard in turn and see the pin fail.

- [ ] **Step 4: Thai render** in `tests/panel-i18n.test.tsx` (a view with `userscript: true`).

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run build` — Expected: green.

```bash
git add extension/lib/studio/userscript-here.ts extension/tests/userscript-here.test.ts extension/lib/studio/queue-view.ts extension/entrypoints/studio.content.ts extension/entrypoints/sidepanel/shell/Banners.tsx extension/tests extension/scripts/strings/extension-only.mjs
git commit -m "While the Tampermonkey userscript is active in a Studio tab the extension starts no upload, no copyright run and no Auto-pilot cycle there, and the panel says why

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The move file, extension side (call 8 — only if approved)

The userscript's backup was made to be shared, so it leaves out what is personal: upload history, the channel list, the language. A teammate who moves loses the "already uploaded" warning for everything uploaded before, and Fix tracklist loses the tracklists of older videos. The last userscript version gets a second export, "everything for the extension" (Task 11 Step 5): the same format-1 file with one extra field. The extension reads that field only on **My file**.

Per-channel copyright data still starts fresh, and the claimed-songs history still moves by CSV: the owner decided both on 2026-10-10 (Phase 4 open question 1).

```json
{ "app": "yt-upload-presets", "format": 1, "version": "4.29.0", "presets": [], "activeId": "…", "counters": {}, "settings": {}, "claimsCfg": {},
  "move": { "lang": "th", "uploads": [ { "date": "…", "channel": "UC…", "videoId": "…", "title": "…", "file": "…" } ], "channels": [ { "id": "UC…", "name": "…", "avatar": "https://…", "handle": "@…" } ] } }
```

**Files:**
- Modify: `extension/lib/backup.ts` (`BackupWrites`, `applyBackup`, new `cleanUploads`, `cleanChannels`), `extension/lib/store-writer.ts:84` (hand `applyBackup` the stored `uploads` and `channels`), `extension/tests/backup.test.ts`, `extension/tests/store-writer.test.ts`

**Interfaces:**
- Consumes: `UploadRecord` (`lib/studio/queue-runner.ts:30`), `StoredChannel` (`lib/studio/channels.ts:9`), `isChannelId` (`lib/claims/keys.ts`).
- Produces: `applyBackup(data, presets, own, cur)` where `cur` gains optional `uploads?: UploadRecord[]` and `channels?: StoredChannel[]`; `BackupWrites` gains optional `uploads` and `channels`. Without `data.move`, or with `own === false`, the result is exactly what it is today.

- [ ] **Step 1: Failing tests** (in `tests/backup.test.ts`, a new `describe('the move file', …)`)

```ts
  const up = (videoId: string, date: string, over: Record<string, unknown> = {}) =>
    ({ date, channel: 'UC1', channelName: 'One', videoId, title: 'T ' + videoId, file: videoId + '.mp4', size: 1, txt: '', description: '', publishAt: null, visibility: 'PUBLIC', ...over });
  const move = (m: Record<string, unknown>) => {
    const r = parseBackup(exported({ move: m }));
    if (!r.ok) throw new Error('fixture');
    return r;
  };

  it('my file: upload history is added to what is there, newest first, each video once, 1000 at most', () => {
    const r = move({ uploads: [up('b', '2026-10-02T00:00:00.000Z'), up('a', '2026-10-01T00:00:00.000Z', { title: 'from the file' })] });
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: [up('c', '2026-10-03T00:00:00.000Z'), up('a', '2026-10-01T00:00:00.000Z', { title: 'already here' })] as never });
    expect(w.uploads!.map((u) => u.videoId)).toEqual(['c', 'b', 'a']);
    expect(w.uploads!.find((u) => u.videoId === 'a')!.title).toBe('already here');
    const many = move({ uploads: Array.from({ length: 1200 }, (_, i) => up('v' + i, new Date(Date.UTC(2020, 0, 1) + i * 1000).toISOString())) });
    expect(applyBackup(many.data, many.presets, true, cur()).uploads).toHaveLength(1000);
  });

  it('my file: a row that is not an upload record is left out, and odd fields are made safe', () => {
    const r = move({ uploads: [up('ok', '2026-10-01T00:00:00.000Z', { size: 'big', publishAt: 'soon', extra: { x: 1 } }), { videoId: 5 }, null, 'x', up('', '2026-10-01T00:00:00.000Z')] });
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(w.uploads).toHaveLength(1);
    expect(w.uploads![0]).toEqual(up('ok', '2026-10-01T00:00:00.000Z', { size: 0 }));
  });

  it('my file: channels are added after the ones already known; only real channel ids and https avatars', () => {
    const r = move({ channels: [
      { id: 'UC2', name: 'Two', avatar: 'https://yt3.ggpht.com/x', handle: '@two' },
      { id: 'UC1', name: 'One, from the file', avatar: '', handle: '' },
      { id: 'UC3', name: 'Three', avatar: 'javascript:alert(1)', handle: 7 },
      { id: 'not an id!', name: 'Bad' }, { id: 'UC4' }, null,
    ] });
    const w = applyBackup(r.data, r.presets, true, { ...cur(), channels: [{ id: 'UC1', name: 'One', avatar: '', handle: '@one' }] });
    expect(w.channels).toEqual([
      { id: 'UC1', name: 'One', avatar: '', handle: '@one' },
      { id: 'UC2', name: 'Two', avatar: 'https://yt3.ggpht.com/x', handle: '@two' },
      { id: 'UC3', name: 'Three', avatar: '', handle: '' },
    ]);
  });

  it('my file: the language comes along; any other value does not', () => {
    const th = move({ lang: 'th' });
    expect(applyBackup(th.data, th.presets, true, cur()).settings?.lang).toBe('th');
    const bad = move({ lang: 'fr' });
    expect(applyBackup(bad.data, bad.presets, true, cur()).settings?.lang).toBe('en');
  });

  it("someone else's file: nothing of the move part is taken", () => {
    const r = move({ lang: 'th', uploads: [up('a', '2026-10-01T00:00:00.000Z')], channels: [{ id: 'UC2', name: 'Two', avatar: '', handle: '' }] });
    const w = applyBackup(r.data, r.presets, false, cur());
    expect(w.uploads).toBeUndefined();
    expect(w.channels).toBeUndefined();
    expect(w.settings?.lang).toBe('en');
  });

  it('a file without a move part writes neither key', () => {
    const r = parseBackup(exported());
    if (!r.ok) throw new Error('fixture');
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: [up('c', '2026-10-03T00:00:00.000Z')] as never });
    expect('uploads' in w).toBe(false);
    expect('channels' in w).toBe(false);
  });
```

And in `tests/store-writer.test.ts`, next to the existing `writeBackupInOrder` tests: store `uploads: [<one row>]` and `channels: [<one channel>]`, call `writeBackupInOrder` with an own move file holding one new row and one new channel, and expect storage to hold both old and new of each.

Run: `npx vitest run tests/backup.test.ts tests/store-writer.test.ts` — Expected: the new tests FAIL.

- [ ] **Step 2: Implement in `lib/backup.ts`**

```ts
import { isChannelId } from './claims/keys';
import type { StoredChannel } from './studio/channels';
import type { UploadRecord } from './studio/queue-runner';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// The move file's upload history ('uploads': newest first, 1000 at most, as the runner keeps it).
// Rows already stored win; a row needs a video id, a channel, a date and a title.
export function cleanUploads(list: unknown, have: UploadRecord[] = []): UploadRecord[] {
  const seen = new Set(have.map((u) => u.videoId));
  const out = [...have];
  for (const u of Array.isArray(list) ? list : []) {
    if (!isObj(u) || !str(u.videoId) || !str(u.channel) || !str(u.date) || !str(u.title) || seen.has(u.videoId as string)) continue;
    seen.add(u.videoId as string);
    out.push({
      date: str(u.date), channel: str(u.channel), channelName: str(u.channelName), videoId: str(u.videoId), title: str(u.title),
      file: str(u.file), size: Number.isFinite(u.size) ? (u.size as number) : 0, txt: str(u.txt), description: str(u.description),
      publishAt: Number.isFinite(u.publishAt) ? (u.publishAt as number) : null, visibility: str(u.visibility),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 1000);
}

// The move file's channel list. The avatar becomes an <img src> in the panel: https only.
export function cleanChannels(list: unknown, have: StoredChannel[] = []): StoredChannel[] {
  const seen = new Set(have.map((c) => c.id));
  const out = [...have];
  for (const c of Array.isArray(list) ? list : []) {
    if (!isObj(c) || !isChannelId(c.id) || !str(c.name) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, name: str(c.name), avatar: /^https:\/\//.test(str(c.avatar)) ? str(c.avatar) : '', handle: str(c.handle) });
  }
  return out;
}
```

`BackupWrites` gains `uploads?: UploadRecord[]; channels?: StoredChannel[];`. `applyBackup`'s `cur` parameter becomes `{ settings: Settings; cfg: Record<string, unknown>; uploads?: UploadRecord[]; channels?: StoredChannel[] }`, and before `return w`:

```ts
  // The last userscript's "everything for the extension" export (call 8): personal, own file only.
  if (own && isObj(data.move)) {
    const m = data.move;
    if (Array.isArray(m.uploads)) w.uploads = cleanUploads(m.uploads, cur.uploads);
    if (Array.isArray(m.channels)) w.channels = cleanChannels(m.channels, cur.channels);
    if (m.lang === 'th' || m.lang === 'en') w.settings = { ...(w.settings ?? cur.settings), lang: m.lang };
  }
```

Reword the comment above `applyBackup` ("lang is always the current one…") to add "except from the move part of the user's own file". If importing `queue-runner`'s type pulls page code into the background bundle (check `npm run build`'s size against the last build; `import type` should erase it), keep it `import type`.

`lib/store-writer.ts`, inside `writeBackupInOrder`'s `serial`:

```ts
    const cur = {
      settings: await loadSettings(), cfg: await load<Record<string, unknown>>('cfg', {}),
      uploads: await load<UploadRecord[]>('uploads', []), channels: await load<StoredChannel[]>('channels', []),
    };
```

`writeBackup` already writes every defined key of `BackupWrites`, so `uploads` and `channels` land in `chrome.storage.local`; Studio tabs follow them through `STATE_KEYS` (`lib/studio/state.ts:16` lists both), and an import is refused during a run. The background also stores the language through `settings`, which every context follows (`watchLang`).

Run the two test files — Expected: PASS.

- [ ] **Step 3: The import question says what else comes along.** Read `SettingsTab.tsx:111-130`. When `isObj(step.data.move)`, the dialog's body gets one more line, registered under `// 5 M (move file)`:

```js
  { th: 'ไฟล์นี้มีประวัติการอัปโหลด ${} รายการ และช่อง ${} ช่องจากสคริปต์ Tampermonkey — จะนำเข้าเมื่อเลือก "ไฟล์ของฉัน"', en: 'This file also holds ${} upload history rows and ${} channels from the Tampermonkey script — they are imported with "My file"', why: "the last userscript's move export carries personal data the shared backup never did" },
```

Test first, in `tests/panel-backup.test.ts`'s style: importing a move file shows the line with the two counts; a plain backup doesn't. Add the Thai render to `tests/panel-i18n.test.tsx`'s import question.

- [ ] **Step 4: Verify and commit**

Run: `npm run check && npm run build` — Expected: green.

```bash
git add extension/lib/backup.ts extension/lib/store-writer.ts extension/entrypoints/sidepanel/tabs/SettingsTab.tsx extension/tests extension/scripts/strings/extension-only.mjs
git commit -m "Import: a move file from the last userscript version adds its upload history, channel list and language, from the user's own file only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Packaging

**Files:**
- Modify: `extension/wxt.config.ts` (call 5)
- Create: `extension/public/icon/{16,32,48,128}.png` (call 6), `extension/scripts/release-check.mjs`, `extension/tests/release-check.test.ts`

**Interfaces:**
- Produces: `npm run release:check` — builds, zips, inspects, runs the parity release check; prints the zip's path, size, sha256 and the commands the owner runs in Task 10. It never pushes, tags or calls GitHub.
- `inspect(files: string[], manifest: object, pkgVersion: string, opts?: { key?: boolean }): string[]` — problems with a build's file list and manifest.

- [ ] **Step 1 (call 5): a stable extension id**

An unpacked extension's id is a hash of its folder's path unless the manifest has a `key`. Storage and the queued file handles belong to the id.

1. In the scratchpad (never in the repo): `openssl genrsa -out ytup-key.pem 2048`, then `openssl rsa -in ytup-key.pem -pubout -outform DER | openssl base64 -A` prints the public key. Tell the owner where `ytup-key.pem` is; it is theirs to keep or delete. It is never committed and the extension never needs it again.
2. `wxt.config.ts`, first line of `manifest`:

```ts
    // One id on every machine and for every folder the build is unpacked into (README "Update"):
    // without it the id follows the folder's path, and a new folder is a new, empty extension.
    key: '<the base64 public key from step 1>',
```

3. Print the id it gives, for the README and the CHANGELOG: `openssl rsa -in ytup-key.pem -pubout -outform DER | openssl dgst -sha256 -binary | head -c 16 | xxd -p | tr '0-9a-f' 'a-p'`.
4. `npm run build`, then `grep -c '"key"' .output/chrome-mv3/manifest.json` — Expected: `1`. `npm run check` — Expected: green (if a test pins the manifest's exact keys, add `key` there).

**This changes the id of every copy already installed**, the owner's included: its data stays under the old id. Before loading the keyed build the owner exports a backup (and the claimed-songs CSV) from the old one, and imports them after. The README's "Update" section says so for 5.0.0 only.

- [ ] **Step 2 (call 6): icons**

WXT turns `public/icon/<size>.png` into the manifest's `icons` (and the toolbar icon). The artwork is the owner's (open question 4): a square PNG of at least 128 px. Make the four sizes with `sips -z 16 16 src.png --out public/icon/16.png` (and 32, 48, 128). Then `lib/notify.ts`'s `NOTIFY_ICON` becomes `browser.runtime.getURL('/icon/128.png')` in a function (it is used by `lib/claims/alarms.ts` too; test first: the notification tests expect an `iconUrl` ending `/icon/128.png`). With no artwork this step is skipped and the release ships with Chrome's letter tile.

- [ ] **Step 3: Failing test for the release check**

`tests/release-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script
import { inspect } from '../scripts/release-check.mjs';

const manifest = {
  manifest_version: 3, version: '5.0.0',
  permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'],
  host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
  web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
};
const files = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js', 'chunks/a.js', 'assets/a.woff2'];

describe('release check', () => {
  it('passes the build as it is', () => expect(inspect(files, manifest, '5.0.0')).toEqual([]));
  it('names a version that differs from package.json', () =>
    expect(inspect(files, manifest, '5.0.1').join('\n')).toMatch(/version 5\.0\.0.*package\.json.*5\.0\.1/));
  it('names any permission, host or web-accessible file added or removed', () => {
    expect(inspect(files, { ...manifest, permissions: [...manifest.permissions, 'tabs'] }, '5.0.0').join('\n')).toMatch(/permissions/);
    expect(inspect(files, { ...manifest, host_permissions: manifest.host_permissions.slice(0, 2) }, '5.0.0').join('\n')).toMatch(/host_permissions/);
    expect(inspect(files, { ...manifest, web_accessible_resources: [{ resources: ['file-bridge.html', 'debug.html'], matches: ['<all_urls>'] }] }, '5.0.0').join('\n')).toMatch(/web_accessible/);
  });
  it('names a file that has no business in the zip', () => {
    for (const bad of ['chunks/a.js.map', '.vitest/x', '.claude/settings.json', 'tests/a.test.ts', 'stats.html', '.DS_Store', 'node_modules/x/index.js']) {
      expect(inspect([...files, bad], manifest, '5.0.0').join('\n'), bad).toContain(bad);
    }
  });
  it('names a file the extension needs that is not there', () => {
    for (const need of ['manifest.json', 'background.js', 'sidepanel.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt', 'content-scripts/studio.js']) {
      expect(inspect(files.filter((f) => f !== need), manifest, '5.0.0').join('\n'), need).toContain(need);
    }
  });
  it('with a key expected, a manifest without one is named', () =>
    expect(inspect(files, manifest, '5.0.0', { key: true }).join('\n')).toMatch(/key/));
});
```

Run: `npx vitest run tests/release-check.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 4: Write `scripts/release-check.mjs`**

```js
// Everything that must be true of the zip the team installs. Builds, zips and looks; publishes
// nothing. `npm run release:check` — run it on a clean tree, at the commit that will be tagged.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PERMS = ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'];
const HOSTS = ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'];
const WAR = [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }];
const NEEDED = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js'];
const BANNED = /(\.map$|\.test\.|^tests\/|(^|\/)\.[^/]+(\/|$)|^node_modules\/|^stats\.html$|\.pem$|\.ts$|\.tsx$)/;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function inspect(files, manifest, pkgVersion, { key = false } = {}) {
  const out = [];
  if (manifest.version !== pkgVersion) out.push(`manifest version ${manifest.version} is not package.json's ${pkgVersion}`);
  if (!same(manifest.permissions, PERMS)) out.push(`permissions are ${JSON.stringify(manifest.permissions)}, expected ${JSON.stringify(PERMS)}`);
  if (!same(manifest.host_permissions, HOSTS)) out.push(`host_permissions are ${JSON.stringify(manifest.host_permissions)}, expected ${JSON.stringify(HOSTS)}`);
  if (!same(manifest.web_accessible_resources, WAR)) out.push(`web_accessible_resources are ${JSON.stringify(manifest.web_accessible_resources)}, expected ${JSON.stringify(WAR)}`);
  if (key && typeof manifest.key !== 'string') out.push('the manifest has no key: the extension id would follow the folder');
  for (const f of files) if (BANNED.test(f)) out.push(`${f} must not be in the build`);
  for (const f of NEEDED) if (!files.includes(f)) out.push(`${f} is missing from the build`);
  return out;
}

const walk = (dir, root = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split(sep).join('/')]);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: EXT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

function main() {
  const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf8'));
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no', '--', '.']).trim();
  const problems = dirty ? ['the working tree has uncommitted changes under extension/:\n' + dirty] : [];
  run('npx', ['wxt', 'zip']); // builds first
  const out = join(EXT, '.output/chrome-mv3');
  const zip = join(EXT, `.output/${pkg.name}-${pkg.version}-chrome.zip`);
  const files = walk(out).sort();
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  problems.push(...inspect(files, manifest, pkg.version, { key: readFileSync(join(EXT, 'wxt.config.ts'), 'utf8').includes('key:') }));
  const zipped = run('unzip', ['-Z1', zip]).split('\n').filter((l) => l && !l.endsWith('/')).sort();
  if (JSON.stringify(zipped) !== JSON.stringify(files)) problems.push('the zip does not hold exactly the build folder\'s files');
  const log = join(EXT, 'CHANGELOG.md');
  if (!existsSync(log) || !readFileSync(log, 'utf8').includes(`## ${pkg.version} `)) problems.push(`CHANGELOG.md has no "## ${pkg.version} " section`);
  try { run('node', ['scripts/parity-check.mjs', '--release']); } catch { problems.push('parity-check --release failed (see above)'); }
  if (problems.length) {
    console.error(`release-check: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  const sha = createHash('sha256').update(readFileSync(zip)).digest('hex');
  console.log([
    `release-check: ok — ${files.length} files, ${(statSync(zip).size / 1024).toFixed(0)} KB`,
    `zip:    ${zip}`,
    `sha256: ${sha}`,
    `commit: ${run('git', ['rev-parse', 'HEAD']).trim()}`,
    '',
    'To publish (the owner runs these; nothing here does):',
    `  git tag v${pkg.version} && git push origin v${pkg.version}`,
    `  gh release create v${pkg.version} "${zip}" --draft --title "v${pkg.version}" --notes-file <the CHANGELOG section saved to a file>`,
    '  then read the draft on GitHub and press Publish.',
  ].join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

Run: `npx vitest run tests/release-check.test.ts` — Expected: PASS. (`CHANGELOG.md` is Z's; until it exists `npm run release:check` reports it missing, which is right.)

- [ ] **Step 5: The licence list, checked once for this release**

As the README's "Licences" section says: temporarily add `build: { sourcemap: true }` to the `vite:` function's return in `wxt.config.ts`, `npm run build`, then

```sh
node -e "const fs=require('fs'),p=require('path');const s=new Set();(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())w(f);else if(f.endsWith('.map'))for(const x of JSON.parse(fs.readFileSync(f,'utf8')).sources){const m=x.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);if(m)s.add(m[m.length-1].slice(13))}}})('.output/chrome-mv3');console.log([...s].sort().join('\n'))"
```

Every package printed must be named in `public/THIRD-PARTY-NOTICES.txt`; add a missing one with its licence text from `node_modules/<pkg>/LICENSE*`. **Revert the `sourcemap` line** and rebuild; `git diff --stat -- wxt.config.ts` must show only Step 1's change (or nothing).

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm run build` — Expected: green; permissions line as in Task 4 Step 8.

```bash
git add extension/wxt.config.ts extension/public extension/lib/notify.ts extension/lib/claims/alarms.ts extension/scripts/release-check.mjs extension/tests
git commit -m "Packaging: release-check builds and zips, then refuses a wrong version, a changed permission, a stray file, a missing CHANGELOG section or a missing parity row; a manifest key gives one extension id for every folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Leave out of the message whatever a declined call left out of the commit.)

---

### Task 8: README, CHANGELOG, PARITY.md, spec, verification (serial, last agent task)

**Files:**
- Modify: `extension/README.md`, `docs/superpowers/specs/2026-10-05-chrome-extension-design.md`
- Create: `extension/CHANGELOG.md`; regenerate `extension/PARITY.md`

- [ ] **Step 1: README title and a section for people who only install it**

Line 1 becomes `# YouTube Upload Presets — Chrome extension`. After the opening paragraph, before "Develop", add (drop the sentences of a declined call):

```markdown
## Install (for the team)

1. Download `youtube-upload-presets-extension-<version>-chrome.zip` from the newest release:
   https://github.com/TAEJK88/youtube-upload-presets/releases/latest
2. Make a folder that will stay where it is, for example `Documents/YouTube Upload Presets`.
   Unzip the file and put **what is inside it** (`manifest.json` and the rest) into that folder.
3. In Chrome open `chrome://extensions`, turn on **Developer mode** (top right), click
   **Load unpacked** and pick that folder.
4. In Tampermonkey, turn the "YouTube Upload Presets" script **off**. The two must not run
   together: while the script is on, the extension waits and its panel says so.
5. Open YouTube Studio and click the extension's icon in the toolbar (or press Alt+P).

Chrome shows "Disable developer mode extensions" when it starts. Close that box; don't press
its button.

## Update

The panel shows "Update available" when a newer release exists (it looks once a day).

1. Download the new zip from the release page the banner opens.
2. Close the side panel in every Chrome window.
3. Delete what is inside your extension folder and put the new zip's contents there. Keep the
   folder itself, in the same place.
4. `chrome://extensions` → the extension's card → the round **reload** arrow.
5. Reload every open YouTube Studio tab and every youtube.com tab.
6. Open the side panel again.

Your presets, settings, queue and history stay: they belong to the extension, not to the
folder. Don't press **Remove** on the extension's card: that deletes them.
```

- [ ] **Step 2: "Moving from the userscript" rewritten as steps**

Replace the section's paragraph (lines 65–76) with numbered steps. With calls 7 and 8 approved:

```markdown
## Moving from the userscript

What moves, and how:

| What | How |
|---|---|
| Presets, the main preset, EP numbers, settings, copyright settings | the export file (steps below) |
| Upload history, your channel list, the language | the same file, when it was exported with **Export everything for the extension** from userscript v4.29.0 or newer and imported as **My file** |
| Claimed-songs history | a CSV: userscript Copyright → Claimed songs → ⬇ CSV; extension Copyright → Claimed songs → ⬆ Import CSV. It keeps titles, artists, claimants, counts and the first channel, not which video was which: a later rescan can count a video twice. Up to 16 MB |
| Claim scans, trim results, the trim list, Ads and Collab lists, Auto-pilot on/off | don't move: scan each channel again and turn Auto-pilot on again |
| Videos waiting in the queue | don't move: upload them first, or add the files again |
| "Copy from video" patterns (userscript v4.28.0) | don't move (see CHANGELOG) |

1. In the userscript, let anything in progress finish: the upload queue, trim runs, and trims
   "waiting for YouTube to process" (follow-up trims are not carried over).
2. Userscript: Settings → Back up / share settings → **Export everything for the extension**
   (or the banner's **Export my data**). Also save the claimed-songs CSV if you use it.
3. Install the extension (see "Install") and turn the userscript off in Tampermonkey.
4. Extension: Settings → Back up / share settings → **Import** → pick the file → **My file**.
5. If the panel is in the wrong language: Settings → General → Language / ภาษา.
6. Copyright → Claimed songs → ⬆ Import CSV, if you saved one.
7. On each channel: Copyright → **Scan claims**, then turn Auto-pilot on again if you use it.
8. Keep the userscript installed but off for a week, then remove it.
```

With call 8 declined: drop the table's second row and say "Upload history and the channel list don't move; the extension starts them empty", change step 2 to **Export (.json)**, keep step 5 (it is then always needed for Thai users).

- [ ] **Step 3: The update-order paragraph (lines 140–145)**

Since 4b the panel recognises a tab or a background of another build, so the paragraph's list of symptoms is out of date. Replace "Why the order matters …" with:

```markdown
Why the order matters: the side panel reads its files from the folder each time it opens, but
the background and the scripts inside the tabs keep running the old build until steps 2 and 3.
A panel opened too early is a new panel talking to old scripts. It notices: it shows "This tab
is not connected to the extension yet — reload this tab" and nothing else from that tab. Do
steps 2 to 4 again. (A build from before Phase 4b can instead show an error screen or an empty
Copyright tab.)
```

Point "Before you start: load or update the build" at the new "Update" section instead of repeating its steps, keeping the developer's `npm run build` line.

- [ ] **Step 4: New exit-check items** (numbered after the last existing item; today that is 74, so 75 onward, under a new heading `### Phase 5: cutover`)

```markdown
75. **Install from the zip.** On a Chrome profile that never had the extension, follow "Install"
    with the release zip. The panel opens on Studio. `chrome://extensions` shows version 5.0.0.
    **Record** the extension's id; with the manifest key it is the same on every machine.
76. **Update in place.** Follow "Update" with a zip of a higher version (ask for a test build).
    Presets, settings, queue cards and upload history are all still there afterwards.
    - **A different folder (record).** Unzip the same build into a *second* folder and Load
      unpacked from it. **Record** what Chrome does: replaces the first copy and keeps the data
      (expected with the key), or shows two copies. Remove the second copy if there are two.
77. **Update available.** In the service worker console (item 42 says how to open it):
    `await chrome.storage.local.set({ updateCheck: { at: Date.now(), latest: '99.0.0', url: 'https://github.com/TAEJK88/youtube-upload-presets/releases/latest' } })`.
    The panel shows "Update available: version 99.0.0 (you have …)"; **Get the update** opens the
    release page in a new tab. In Thai the banner is Thai. Then
    `await chrome.storage.local.remove('updateCheck')`: within a minute or two the key is back
    with the real latest version and the banner is gone (or shows a real update). **Record** a
    `[ytup] update check` warning in that console, with its text.
78. **Both installed.** Turn the Tampermonkey script on again and reload Studio: the panel shows
    "The Tampermonkey script is still on in this tab — …"; Start toasts the same sentence and
    nothing uploads; a trim asked from the Copyright tab does the same; Scan still works. Turn
    the script off and reload the tab: the banner is gone and Start works.
79. **The move.** In the userscript (v4.29.0): the drawer shows "This script has moved to a Chrome
    extension"; **Export my data** saves `yt-upload-presets-move-YYYY-MM-DD.json`. Import it in
    the extension as **My file**: the question says how many upload-history rows and channels the
    file holds; afterwards Copyright → Upload history has the old uploads, the ⇄ channel list has
    your channels, the panel is in the language the userscript was in, and a clip you uploaded
    before shows "Already uploaded …" when added to the queue. Import the same file again: no
    row appears twice. Import it as **Someone else's**: history and channels are not touched.
80. **The userscript's notice.** With v4.29.0: the notice is at the top of the drawer on every
    tab of it; **How to move** opens the README's "Moving to the Chrome extension" on GitHub; a
    toast "This script has moved to a Chrome extension — …" appears a few seconds after Studio
    loads, once a day, and not while the queue is running; everything else in the script works
    as before (upload one clip).
81. **Parity walk.** Open `PARITY.md`. Every row marked *changed* or *dropped* names a README
    item or a reason: read the list once and **record** any row you did not expect.
```

Leave out item 78 if call 7 was declined, 79's move-file sentences if call 8 was, and the id sentence if call 5 was. Items 79 and 80 can only be done after Task 11; say so in a note above them.

Add to "Known behaviour" a `### Known behaviour, Phase 5 (note, don't test)` list:

```markdown
- **The update check** asks `api.github.com` once a day for this repo's latest release. GitHub
  sees your IP address, as for any page visit; nothing about you or your channels is sent. If
  GitHub can't be reached, or an office has used up its hourly allowance, nothing is shown and
  it tries again the next day. The result is `updateCheck` in `chrome.storage.local`; it is not
  part of a settings backup.
- **The banner can't be dismissed.** It goes when the installed version is the newest.
- **A newer build than the newest release** (a test build) shows no banner.
```

- [ ] **Step 5: `CHANGELOG.md`**

```markdown
# Changelog

The version is `version` in `package.json` (the manifest's version). A release is the tag
`v<version>` on GitHub with the zip attached.

## 5.0.0 — <date of the release>

The first release of the extension. It replaces the Tampermonkey userscript (v4.27.1); see
`README.md`, "Install" and "Moving from the userscript", and `PARITY.md` for every difference.

- The panel is Chrome's side panel (toolbar icon or Alt+P). It is docked, not see-through.
- Files are dropped on the side panel. The queue survives reloads, channel switches and, after
  one "Re-grant access" click, browser restarts.
- One Studio tab works at a time: an upload run, or a trim / ads / Collab run.
- Auto-pilot wakes its Studio tab on time, and a desktop notification says when a cycle is due
  and no Studio tab is open.
- The language changes without a reload.
- "Update available" appears in the panel when a newer release exists.

Not in the extension yet: "Copy a pattern from a video" (userscript v4.28.0).
Not carried over from the userscript: claim scans, trim results, Auto-pilot on/off (scan again).
```

Adjust the last two lines to the owner's answers (open question 1; calls 4, 7, 8). `<date of the release>` is filled by the owner's go in Task 10, not guessed now: until then write `unreleased` and make `release-check`'s pattern match `## 5.0.0 ` (it does).

- [ ] **Step 6: Spec amendments**

1. "Goal": `feature parity with v4.26.1` → `feature parity with v4.27.1 (the commit `npm run port-check` pins)`.
2. Rollout row 5: `Parity checklist against v4.27.1 (\`extension/PARITY.md\`, \`npm run parity -- --release\`); \`npm run release:check\` → zip → GitHub Release (published by the owner); the userscript's last version (v4.29.0) shows a "moved to the extension" notice and keeps working`.
3. "Background → Update check": replace the paragraph with what was built (D32): the endpoint, once per 24 h and at each start, `updateCheck` in `storage.local`, the link's prefix check, silence on failure, no dismiss.
4. "Data migration from the userscript": add the move file (call 8) and the language; add "While the userscript is active in a Studio tab the extension starts no upload, no copyright run and no Auto-pilot cycle there" (call 7).
5. "Decisions → Audience": add "a manifest `key` gives one extension id on every machine" (call 5).
6. "Permissions": unchanged; add "`https://api.github.com/*` is used only by the update check".

Leave "Source: … (v4.26.1, 6,348 lines…)" as it is: it says where the design started.

- [ ] **Step 7: Regenerate and verify everything**

In a clean worktree at the branch tip:

```sh
cd extension && npm ci && npm run parity -- --write && git diff --stat -- PARITY.md
npm run check && npm run build
node -e "const m=require('./.output/chrome-mv3/manifest.json');console.log(m.version, m.permissions.join(), m.host_permissions.join(), JSON.stringify(m.web_accessible_resources))"
npm run parity -- --release
npm run release:check
cd .. && node --test test/*.test.mjs 2>&1 | tail -8
git diff --stat d15ef87 HEAD -- youtube-upload-presets.user.js test
```

Expected: `PARITY.md` changes only if rows changed since it was last written; check and build green; version `5.0.0`, the five permissions, the three hosts, `file-bridge.html` only; parity `0 missing`; `release-check: ok` with the zip's path and sha256; root tests `# pass 163`, `# fail 0`; the last command prints nothing.

- [ ] **Step 8: Commit**

```bash
git add extension/README.md extension/CHANGELOG.md extension/PARITY.md docs/superpowers/specs/2026-10-05-chrome-extension-design.md
git commit -m "Phase 5 docs: Install, Update and Moving for the team, exit-check items 75-81, CHANGELOG 5.0.0, PARITY.md, spec amendments (update check, move file, parity pin v4.27.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Manual gate.** The owner does README items 75–78 and 81 on the release-check's build (the same zip that will be attached; its sha256 is in the release-check output). Any failure is fixed and Step 7 run again before Task 9.

---

### Task 9: To `main` — OWNER-GATED

Nothing in this task runs before the owner says "go for Task 9" in their own words. Steps marked **[owner]** are the owner's to run or to approve one by one.

**State when it starts:** `extension-phase-2` has never been pushed; it is about 260 commits ahead of `d15ef87` plus Phase 5's. `origin/main` is `c2564c3`, four commits ahead of `d15ef87` (userscript v4.28.0). Local `main` is `d15ef87`.

- [ ] **Step 1: Look again.** `git fetch origin` (read-only for the remote), then `git log --oneline HEAD..origin/main` and `git merge-tree --write-tree HEAD origin/main; echo $?`. Expected: the four commits known today and exit 0. Anything else (a fifth commit, a conflict): stop and tell the owner what changed before going on.

- [ ] **Step 2: Merge `origin/main` into the branch** (a local commit; reversible until pushed).

```bash
git merge --no-ff origin/main -m "Merge main (userscript v4.28.0) into extension-phase-2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: no conflict; the tree's userscript is now v4.28.0 (`sed -n 4p youtube-upload-presets.user.js`).

- [ ] **Step 3: Verify.**

```sh
git diff --stat origin/main HEAD -- youtube-upload-presets.user.js test   # prints nothing: the branch still changes neither
node --test test/*.test.mjs 2>&1 | tail -8                                # pass 181, fail 0
cd extension && npm run check && npm run build && npm run release:check
```

Expected: all green. `port-check`, `ui-check` and `parity-check` read the pinned commit, so the newer userscript in the tree changes none of them. From here on the root count is 181 (D30).

- [ ] **Step 4: Root `README.md`, now that the merge is in** (it could not be edited earlier without conflicting with `origin/main`'s change to it).

Rewrite the top so the extension comes first, keeping `origin/main`'s text under a "Userscript (no longer developed)" heading:

```markdown
# YouTube Upload Presets

Bulk upload to YouTube Studio with presets, scheduling and thumbnails, plus copyright claim
scanning and trimming. A Chrome extension; it replaced the Tampermonkey userscript in 2026.

## Install the extension

See [extension/README.md](extension/README.md#install-for-the-team): download the zip from the
[latest release](https://github.com/TAEJK88/youtube-upload-presets/releases/latest), unpack it
into a folder, and load that folder in `chrome://extensions`.

## Moving to the Chrome extension

<the "Moving from the userscript" table and the eight steps, copied from extension/README.md>

## Userscript (no longer developed)

`youtube-upload-presets.user.js` is the old Tampermonkey script. Its last version (v4.29.0)
keeps working and shows a notice; it gets no more fixes or features. …<the existing Install,
tests, Updating and Language sections, unchanged>…
```

The heading `## Moving to the Chrome extension` is the link target of the userscript's notice (Task 11): its anchor `#moving-to-the-chrome-extension` must not change afterwards. Commit:

```bash
git add README.md
git commit -m "Root README: the extension first (install, moving), the userscript as the old way

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5 [owner]: push the branch and open the PR.**

```bash
git push -u origin extension-phase-2
gh pr create --base main --head extension-phase-2 --title "Chrome extension: Phases 2–5 (page automation, side panel, copyright, cutover)" --body-file <a file with the summary>
```

The PR body: what the extension is, the manual checklists passed and on which build, the three checks' last output, and "merging this changes no userscript line: nobody's Tampermonkey updates". End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 6 [owner]: merge the PR** — squash, as PRs #1–#3 were (call 12), and **do not delete the branch**: the ledger and the plans cite its commits. `d15ef87` stays an ancestor of `main` either way, so the pin keeps resolving.

- [ ] **Step 7: After the merge.** `git fetch origin && git diff --stat origin/main extension-phase-2` prints nothing (a squash has the same tree). Record `origin/main`'s new commit in `.superpowers/sdd/progress.md`.

---

### Task 10: The GitHub Release — OWNER-GATED

A release is public and the update check of every installed copy will point at it. Nothing here runs before the owner says "go for Task 10". An agent cannot run `gh release` in this environment at all (the runtime hook refuses it); the owner runs every command of Steps 3–5.

- [ ] **Step 1: The date.** Set `## 5.0.0 — <today>` in `extension/CHANGELOG.md` on a branch from `origin/main`, commit, and get it to `main` the same way as Task 9 (a one-line PR). The tag goes on the commit that holds it.

- [ ] **Step 2: Build the zip from `main`'s commit.** In a clean worktree at `origin/main`: `cd extension && npm ci && npm run release:check`. Expected: `release-check: ok`, with the zip's path, its sha256 and the commit. Save the CHANGELOG's 5.0.0 section, followed by the README's "Install" steps, to a file for the notes. Give the owner: the zip's path, the sha256, the commit, the notes file.

- [ ] **Step 3 [owner]: tag and draft.**

```bash
git tag v5.0.0 <the commit from Step 2> && git push origin v5.0.0
gh release create v5.0.0 "<zip path>" --draft --title "v5.0.0" --notes-file "<notes file>"
```

- [ ] **Step 4 [owner]: read the draft on GitHub.** The zip is attached and downloads; unzipped, `manifest.json` says `"version": "5.0.0"`; `shasum -a 256` of the download equals Step 2's.

- [ ] **Step 5 [owner]: Publish.** Not as a pre-release: `releases/latest` (the update check, and the README's link) skips drafts and pre-releases.

- [ ] **Step 6: Confirm from the outside** (read-only): `curl -s https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest | grep -E '"tag_name"|"html_url"' | head -2`. Expected: `"tag_name": "v5.0.0"`. An installed 5.0.0 shows no banner (equal versions).

- [ ] **Step 7 [owner]: tell the team.** Send them the release link and the README's "Install" and "Moving" sections. The userscript's notice (Task 11) follows once at least the owner has installed from the release and done README item 75.

---

### Task 11: The userscript's last version — OWNER-GATED, THE LAST STEP

This is the only change ever made to `youtube-upload-presets.user.js` and root `test/` in this project. Pushing it to `main` with a higher `@version` **publishes it to every Tampermonkey install** within its update interval, and it can't be recalled, only followed by another version. Nothing here runs before the owner says "go for Task 11", and that go comes after Task 10's release is public and the owner has installed from it.

**Base:** `origin/main` after Tasks 9 and 10 — the userscript is v4.28.0 there (6,687 lines). Not the pin: a notice built on v4.27.1 would take copy-from-video away from everyone who has it. **New version:** `4.29.0`. The port-check pin does not move: it names a commit, and the extension is not ported from this version.

**Files:**
- Modify: `youtube-upload-presets.user.js` (header line 4; one pure block; one element in the drawer; one timer; with call 8 one export function and one button)
- Modify: `test/harness.mjs` (one slice, one export)
- Create: `test/moved-notice.test.mjs`

**Interfaces (inside the userscript):**
- `MOVED_URL: string`, `MOVED_EVERY: number`
- `movedToastDue(lastAt, now, busy): boolean`
- `movedText(): { title, body, how, exp, toast }` (each an `L(th, en)` string)
- `buildMoveFile(base, extra): object` (call 8) — the backup object plus `move`.

Line numbers below are v4.28.0's (`git show origin/main:youtube-upload-presets.user.js`); find each place by its text.

- [ ] **Step 1: Branch from `main`.** `git fetch origin && git switch -c userscript-moved-notice origin/main`. `node --test test/*.test.mjs` — Expected: 181 pass.

- [ ] **Step 2: Failing tests**

`test/harness.mjs`: the activity block must now end at the new section, and the new section is sliced on its own. Change

```js
const ACTIVITY = block('// ===== งานที่กำลังทำ (progress) =====', '// ===== Studio DOM automation');
```

to

```js
const ACTIVITY = block('// ===== งานที่กำลังทำ (progress) =====', '// ===== ย้ายไปส่วนขยาย Chrome');
// the "moved to the extension" notice: pure, needs only L
const MOVED = block('// ===== ย้ายไปส่วนขยาย Chrome', '// ===== Studio DOM automation');
export const moved = (lang = 'en') => new Function('L', `'use strict';
  ${MOVED}
  return { MOVED_URL, MOVED_EVERY, movedToastDue, movedText, buildMoveFile };`)((th, en) => (lang === 'en' ? en : th));
export const HEADER = SRC.slice(0, SRC.indexOf('// ==/UserScript=='));
export const SOURCE = SRC;
```

`test/moved-notice.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADER, SOURCE, moved } from './harness.mjs';

const M = moved('en');
const DAY = 24 * 3600e3;
const NOW = Date.UTC(2026, 9, 20);

test('the last version: 4.29.0, still updated from the same place', () => {
  assert.match(HEADER, /^\/\/ @version\s+4\.29\.0$/m);
  assert.match(HEADER, /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/TAEJK88\/youtube-upload-presets\/main\/youtube-upload-presets\.user\.js$/m);
  assert.match(HEADER, /^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/TAEJK88\/youtube-upload-presets\/main\/youtube-upload-presets\.user\.js$/m);
});

test('the link goes to the README section on GitHub', () => {
  assert.equal(M.MOVED_URL, 'https://github.com/TAEJK88/youtube-upload-presets#moving-to-the-chrome-extension');
});

test('the toast shows the first time, then once a day', () => {
  assert.equal(M.movedToastDue(undefined, NOW, false), true);
  assert.equal(M.movedToastDue(0, NOW, false), true);
  assert.equal(M.movedToastDue(NOW - 1000, NOW, false), false);
  assert.equal(M.movedToastDue(NOW - DAY + 1, NOW, false), false);
  assert.equal(M.movedToastDue(NOW - DAY, NOW, false), true);
});

test('never while the queue or copyright work is running', () => {
  assert.equal(M.movedToastDue(undefined, NOW, true), false);
  assert.equal(M.movedToastDue(NOW - 9 * DAY, NOW, true), false);
});

test('a stored time in the future (the clock was set back) does not silence it for ever', () => {
  assert.equal(M.movedToastDue(NOW + 9 * DAY, NOW, false), true);
});

test('a stored value that is not a time counts as never shown', () => {
  for (const bad of ['yesterday', null, NaN, {}, -5]) assert.equal(M.movedToastDue(bad, NOW, false), true, String(bad));
});

test('the notice says it moved, that the script keeps working, and how to move — in both languages', () => {
  const en = M.movedText();
  assert.equal(en.title, 'This script has moved to a Chrome extension');
  assert.match(en.body, /last version/);
  assert.match(en.body, /keeps working/);
  assert.match(en.body, /turn this script off/);
  assert.equal(en.how, 'How to move');
  assert.equal(en.exp, 'Export my data');
  assert.match(en.toast, /moved to a Chrome extension/);
  const th = moved('th').movedText();
  for (const k of ['title', 'body', 'how', 'exp', 'toast']) {
    assert.match(th[k], /[฀-๿]/, k + ' has Thai');
    assert.notEqual(th[k], en[k], k);
  }
});

test('the move file is the normal backup plus the personal part', () => {
  const base = { app: 'yt-upload-presets', format: 1, version: '4.29.0', presets: [{ id: 'a' }], settings: { delay: 3 } };
  const file = M.buildMoveFile(base, { lang: 'th', uploads: [{ videoId: 'x' }], channels: [{ id: 'UC1' }] });
  assert.deepEqual(file, { ...base, move: { lang: 'th', uploads: [{ videoId: 'x' }], channels: [{ id: 'UC1' }] } });
  assert.equal(file.format, 1); // an older script still reads it; it ignores `move`
  assert.equal('move' in base, false); // the object handed in is not changed
});

test('the drawer holds the notice, above the tabs', () => {
  assert.match(SOURCE, /chanBar, chanList, movedBar, actBar, nav, body, footWrap/);
});
```

(Leave out the move-file test, and `buildMoveFile` from the harness's return list, if call 8 was declined.)

Run: `node --test test/*.test.mjs` — Expected: FAIL at import (`harness: block start not found: // ===== ย้ายไปส่วนขยาย Chrome`).

- [ ] **Step 3: The pure block**

In the userscript, directly above the line `  // ===== Studio DOM automation =====`, insert:

```js
  // ===== ย้ายไปส่วนขยาย Chrome (ประกาศในเวอร์ชันสุดท้ายของสคริปต์ — pure มีเทสต์ใน test/moved-notice.test.mjs) =====
  // สคริปต์ยังทำงานตามเดิม · ประกาศอยู่บนแผงตลอด + toast วันละครั้ง (ไม่ขึ้นตอนกำลังอัป/ตัด)
  const MOVED_URL = 'https://github.com/TAEJK88/youtube-upload-presets#moving-to-the-chrome-extension';
  const MOVED_EVERY = 24 * 3600e3;
  // lastAt = เวลาที่โชว์ toast ครั้งล่าสุด (movedNoticeAt) · เวลาในอนาคต = นาฬิกาถูกตั้งถอยหลัง -> โชว์ได้
  const movedToastDue = (lastAt, now, busy) =>
    !busy && !(typeof lastAt === 'number' && lastAt > 0 && lastAt <= now && now - lastAt < MOVED_EVERY);
  const movedText = () => ({
    title: L('สคริปต์นี้ย้ายไปเป็นส่วนขยาย Chrome แล้ว', 'This script has moved to a Chrome extension'),
    body: L(
      'เวอร์ชันนี้เป็นเวอร์ชันสุดท้ายของสคริปต์ ยังใช้งานได้ตามเดิม แต่จะไม่มีการแก้ไขหรือฟีเจอร์ใหม่อีก ติดตั้งส่วนขยายแล้วให้ปิดสคริปต์นี้ใน Tampermonkey',
      'This is the last version of the script. It keeps working, but gets no more fixes or features. After you install the extension, turn this script off in Tampermonkey.'),
    how: L('วิธีย้าย', 'How to move'),
    exp: L('ส่งออกข้อมูลของฉัน', 'Export my data'),
    toast: L('สคริปต์นี้ย้ายไปเป็นส่วนขยาย Chrome แล้ว — เปิดแผง (Alt+P) เพื่อดูวิธีย้าย', 'This script has moved to a Chrome extension — open the panel (Alt+P) to see how to move'),
  });
  // ไฟล์ย้ายข้อมูล = ไฟล์สำรองปกติ (format 1) + ส่วนตัว: ภาษา ประวัติการอัปโหลด รายชื่อช่อง — ส่วนขยายอ่าน move เมื่อเลือก "ไฟล์ของฉัน"
  const buildMoveFile = (base, extra) => ({ ...base, move: { lang: extra.lang, uploads: extra.uploads, channels: extra.channels } });

```

Run: `node --test test/moved-notice.test.mjs` — Expected: the pure tests pass; the header test and the drawer test still FAIL.

- [ ] **Step 4: The header and the drawer**

1. Line 4: `// @version      4.29.0`.
2. Directly above `  const drawer = h('div', { className: 'drawer', 'aria-label': 'Upload Studio' },` (v4.28.0 line 3534):

```js
  // ประกาศย้ายไปส่วนขยาย: อยู่เหนือแท็บตลอด (ไม่มีปุ่มปิด) · ลิงก์ + ส่งออกข้อมูล
  const mv = movedText();
  const movedBar = h('div', { className: 'act', style: 'cursor:default;display:block', role: 'note' },
    h('b', {}, mv.title),
    h('div', { className: 'mut', style: 'margin:4px 0 8px' }, mv.body),
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      h('button', { className: 'btn sm', onclick: () => window.open(MOVED_URL, '_blank', 'noopener') }, icon('ext', 13), mv.how),
      h('button', { className: 'btn sm', onclick: () => exportMove() }, icon('download', 13), mv.exp)));
```

   and the drawer's children become `chanBar, chanList, movedBar, actBar, nav, body, footWrap`. `act`, `mut`, `btn sm`, `icon('ext', …)` and `icon('download', …)` all exist in v4.28.0 (`.act` at 2946, the channel list's "New tab" button uses `ext`, the import question uses `download`); `exportMove` is a function declaration (Step 5), so it is hoisted. With call 8 declined the second button calls `exportBackup()` instead.
3. The daily toast. Directly above the line `  root.classList.toggle('dark', document.documentElement.hasAttribute('dark'));` near the end of the file:

```js
  // toast เตือนวันละครั้ง หลังหน้าโหลดสักครู่ · ไม่ขึ้นตอนคิวหรืองานลิขสิทธิ์กำลังทำงาน (รอบถัดไปค่อยขึ้น)
  setTimeout(() => {
    if (!movedToastDue(load('movedNoticeAt', 0), Date.now(), uploadBusy())) return;
    save('movedNoticeAt', Date.now());
    toast(mv.toast);
  }, 6000);
```

   `uploadBusy()` is the script's own "the queue is running or holds work" test (it guards the channel switch, v4.27.1 line 3394); confirm with `grep -n "uploadBusy" youtube-upload-presets.user.js` that it is in scope at this point of the IIFE and covers a running queue. If a copyright run has its own flag not covered by it (`grep -n "const running\|isRunning\|Claims.status" …`), OR it in: the toast must not replace a run's toast.

Run: `node --test test/*.test.mjs` — Expected: all pass (181 + 9; 8 without the move-file test).

- [ ] **Step 5 (call 8): "Export everything for the extension"**

Directly below `function exportBackup() { … }` (v4.28.0 line 4637), add a sibling that reuses its file-saving lines:

```js
  // ส่งออกทุกอย่างเพื่อย้ายไปส่วนขยาย: ไฟล์สำรองปกติ + ภาษา ประวัติการอัปโหลด รายชื่อช่อง (ข้อมูลส่วนตัว — อย่าแชร์ไฟล์นี้)
  function exportMove() {
    const { lockChannel, lang, ...rest } = settings;
    const data = buildMoveFile({
      app: BACKUP_APP, format: BACKUP_FORMAT, version: GM_info.script.version, exportedAt: new Date().toISOString(),
      presets, activeId, counters, settings: rest, claimsCfg: load('cfg', {}),
    }, { lang: LANG, uploads: getUploads(), channels: load('channels', []) });
    const d = new Date();
    const a = h('a', {
      href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
      download: `yt-upload-presets-move-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`,
    });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(L(`ส่งออกข้อมูลสำหรับส่วนขยายแล้ว (พรีเซ็ต ${presets.length} รายการ, ประวัติ ${data.move.uploads.length} รายการ)`, `Exported for the extension (${presets.length} presets, ${data.move.uploads.length} history rows)`));
  }
```

and in the "Back up / share settings" section (v4.28.0 line 4792), after the existing Export button, one more button in the same style as its neighbours (read them first and copy their `className`): label `L('ส่งออกทุกอย่างเพื่อย้ายไปส่วนขยาย', 'Export everything for the extension')`, `onclick: () => exportMove()`, with a `mut` line under it: `L('มีประวัติการอัปโหลดและรายชื่อช่องของคุณ — ใช้ย้ายไปส่วนขยายเท่านั้น อย่าแชร์ไฟล์นี้', 'Holds your upload history and channel list — for moving to the extension only; don\'t share this file')`.

`activeId` can be `'v:<videoId>'` in v4.28.0; it is exported as it is, and the extension falls back to the first preset (Task 0 Step 2 pins that).

- [ ] **Step 6: Everything still green**

```sh
node --test test/*.test.mjs 2>&1 | tail -8     # pass 190 (189 without call 8), fail 0
node --check youtube-upload-presets.user.js    # the file still parses
cd extension && npm run check                  # unaffected: it reads the pinned commit
git diff --stat origin/main -- . ':!youtube-upload-presets.user.js' ':!test'   # prints nothing
```

- [ ] **Step 7: Try it in Tampermonkey before anyone else gets it.** The owner installs the branch's file by hand in a test profile (Tampermonkey → dashboard → the script → paste, or drag the file in) and does README item 80, and item 79 against the released extension. One clip uploads as before.

- [ ] **Step 8: Commit, and root README's "Updating" note**

In the root README's userscript part, the "Updating" paragraph ("Bump `@version` in the header and push to `main`…") gets one more sentence: "v4.29.0 is the last version: change this file only to fix the notice." Then:

```bash
git add youtube-upload-presets.user.js test/harness.mjs test/moved-notice.test.mjs README.md
git commit -m "The script has moved to a Chrome extension: a notice in the drawer with the way to move and a data export; the script keeps working (v4.29.0)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9 [owner]: publish.** Push the branch, open the PR, merge it to `main`. From that moment every Tampermonkey install picks v4.29.0 up on its next update check (a day or so by default; "Check for userscript updates" in Tampermonkey does it at once).

- [ ] **Step 10: Afterwards.** `curl -s https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js | sed -n 4p` — Expected: `// @version      4.29.0`. Record in `.superpowers/sdd/progress.md`: the release's tag and commit, the userscript's commit, the date. Scratch worktrees and local `p4b-*` / `p5-*` branches can be removed once the owner agrees.

---

## Phase 5 exit check

- `npm run check`, `npm run build`, `npm run parity -- --release` and `npm run release:check` pass at the tagged commit.
- README items 75–81 are passed or recorded.
- `v5.0.0` is published on GitHub with the zip; `releases/latest` answers with it.
- Userscript v4.29.0 is on `main`; Tampermonkey shows the notice; the script still uploads.
- The spec's exit check for row 5: **the team is on the extension**. The owner says when.

## What comes next (not in this plan)

- "Copy a pattern from a video" (userscript v4.28.0) in the extension, if the owner wants it (open question 1). It would be a plan of its own: a second pin (or the pin moved to v4.28.0 with every port config re-run), `videoTemplates:<ch>`, the preset picker's second group, 23 string lines.
- Removing the userscript file from `main`. Not before every teammate has moved: Tampermonkey's `@updateURL` points at it, and it is the only way to reach them again.
