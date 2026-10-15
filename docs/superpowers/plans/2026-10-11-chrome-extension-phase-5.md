# Chrome Extension — Phase 5 (Cutover: parity checklist, packaging and release, the userscript's last version) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Entry gate (nothing below starts before it):** the owner has passed the Phase 4 manual checklist (`extension/README.md` items 46–74) on the 4b build, and whatever that pass turned up is fixed and merged into `extension-phase-2`. Those fixes are not in this plan. Phase 4's calls 35 and 36 were approved as built on 2026-10-11, and Auto-pilot carries on after an incomplete scan (userscript parity; README commit `95f3aae`). The one Phase 4 point still open for Phase 5 is the FAB (README item 7: does its click open the panel). Every line number below was read at `2250ed2`; if the fixes moved a line, the code wins.

**Four owner points inside the plan.** Tasks 0–8 are agent work on the branch, with one stop: **after Task 2 the list of `missing` parity rows goes to the owner, and Task 3 starts only with their answer.** Tasks 9, 10 and 11 each begin with a step only the owner can do or approve (merge and push, publish a GitHub Release, publish the userscript's last version). No agent pushes, opens a PR, tags, creates a release or edits `youtube-upload-presets.user.js` / root `test/` before the owner's go for that task. In this environment a runtime hook also refuses any `gh release …` command from an agent, including read-only ones. If call 5 is approved, the owner also generates the extension's key pair themselves (Task 7 Step 1A).

**Goal:** Make the extension the thing the team uses: prove parity with the userscript at v4.27.1 row by row, ship a zip the team can install and update without losing data, tell them when a newer build exists, and release one last userscript version that says "moved to the extension" while it keeps working.

**Architecture:** Parity is data, not prose: `scripts/parity-check.mjs` derives an inventory from the pinned userscript (`git show d15ef87:…`): its named things, each port config, and **every line of code no port config covers**. `scripts/parity/rows/*.mjs` must hold one row per item, each with a home, a proof and (when changed or dropped) a citation that resolves to a tracked file; `PARITY.md` is generated from the rows and `--release` refuses a `missing` row. The update check is one background module (`lib/update-check.ts`) writing one storage key the panel's banner reads. Packaging is `wxt zip` plus `scripts/release-check.mjs`, which builds, zips and inspects the result and prints a content hash, so the build the owner tested can be shown to be the build that ships. The userscript's notice is a small pure block (testable through `test/harness.mjs`) plus one element in the drawer.

**Tech Stack:** as Phase 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` — "Background" (Update check), "Data migration from the userscript", "Rollout" row 5, "Decisions" (audience: unpacked zip from GitHub Releases).

## What was verified before writing this (at `2250ed2`)

| Claim | How it was checked | Result |
|---|---|---|
| The userscript on the branch is the pin | `git diff --quiet d15ef87 HEAD -- youtube-upload-presets.user.js test` | unchanged; root tests 163 pass / 0 fail |
| What exists after the pin | `git ls-remote --heads origin`, `git log d15ef87..origin/main` | `origin/main` is `c2564c3`: 4 commits past the pin, **userscript v4.28.0 "copy the pattern from a top video"** (+291 lines, 23 new `L()` lines, a new per-channel key `videoTemplates:<ch>`, `activeId` may now be `'v:<videoId>'`, 18 new root tests: 181 pass). Local `main` is still `d15ef87`. |
| Other branches | `git merge-base --is-ancestor`, `gh pr list --state all` | `recommend-pattern-upload-962a217c` (local and on `origin`) is `c2564c3` itself, the source of v4.28.0. `review-improvements-*` and `tampermonkey-to-extension-*` are the squash-merged PRs #1–#3 (stale). `r2-backup-setup-beeb961d` (Cloudflare R2 backup, header v4.26.0, branched at v4.25.1, 12 commits, adds `worker/`) is **local only and unmerged**. |
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
| D31 | Manifest | Permissions stay exactly `sidePanel, storage, unlimitedStorage, alarms, notifications`; hosts `https://studio.youtube.com/*`, `https://www.youtube.com/*`, `https://api.github.com/*`; only `file-bridge.html` web-accessible. The only manifest additions this plan may make are `key` (call 5) and `icons` (call 6), each only if the owner says yes; the plan works without either (Task 7 Step 1B). The key pair is generated and kept by the owner; only its public half is ever given to an agent or written to the repo. |
| D32 | Update check | Background only. `GET https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest`, with `credentials: 'omit'`, no auth header, 10 s limit. Asked each time the service worker starts and on a daily alarm, but never more than once in 23 h (a little under a day, so the alarm's own call is not skipped by milliseconds). Its result is stored as `updateCheck` in `storage.local` (not part of a backup, like `apNotified`). A link is shown only if it starts with `https://github.com/TAEJK88/youtube-upload-presets/releases/`. Any failure (offline, 403 rate limit, 404 no release, bad JSON) is silent: a console warning, no banner, the last good answer kept, and the next try a day later (call 21). No test may reach the network: every test that starts the background stubs `fetch`. |
| D33 | Strings | Every new `L()` pair in the extension is registered in `scripts/strings/extension-only.mjs` with Thai and a `why`. The userscript's notice strings live in the userscript only. |
| D34 | Commits | End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `.claude/`, `extension/.claude/`, `extension/.vitest/`, `test/.claude/`, `.superpowers/`, `.harness-worktrees/`. |
| D35 | After every task | `cd extension && npm run check && npm run build` pass, in every unit's worktree and on the integration branch after every merge; `node --test test/*.test.mjs` at the repo root passes with the count D30 gives. A new worktree runs `npm run build` once before its first `npm run check` (the build generates `.wxt/`). |
| D36 | Decisions are tracked | An owner decision that a parity row or a doc cites is written to `extension/scripts/parity/DECISIONS.md` (in git). Nothing committed cites a file under `.superpowers/`. |
| D37 | Exploration | `.codegraph/` does not exist in this repo: use `grep`, `git show` and the files themselves. |

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
| 16 | `PROTOCOL` goes from 2 to 3 because the queue view gains a field (call 7) | B | Task 5 |
| 17 | The owner generates the key pair and keeps or deletes the private half; agents only ever see the public half | | Task 7 Step 1A |
| 18 | A move file's language replaces the language chosen in the extension, each time it is imported as "My file" | B | Task 6 |
| 19 | Upload-history rows without a video id are imported; a row needs a date, a channel and a file name | B | Task 6 |
| 20 | The team is told to move only after userscript v4.29.0 is out; before that only the owner and one pilot install | B | Task 10 Step 7, Task 11 Step 11 |
| 21 | A failed update check is tried again a day later, not sooner; the check runs whenever the background starts, at most once in 23 h | B (minor) | Task 4 |
| 22 | Call 7 cannot cover www.youtube.com (invite accept, channel switch) or the script's own fill-in, quick actions and intercept in Studio; the README says so | | Task 5, Task 8 |
| 23 | The README tells people to keep the userscript installed but off, and warns that deleting it deletes the only other copy of their history | | Task 8 |
| 24 | Decisions that close a parity row live in `extension/scripts/parity/DECISIONS.md` | | Task 1, Task 3 |
| 25 | The root README is rebuilt with the extension first and the userscript as "no longer developed" | B (docs) | Task 9 |

## Review Focus

- **A v4.28.0 export.** Most teammates are on v4.28.0 today (Tampermonkey updated them). Their export can carry `activeId: 'v:<videoId>'`. The import must land on the first preset, not on a dangling id (Task 0 Step 2 pins it).
- **GitHub says no.** Offline, 403 (rate limit: 60 per hour per IP, an office shares one), 404 (no release yet), HTML instead of JSON, a tag like `userscript-4.29.0`. None may show a banner, throw in the service worker or erase the last good answer (Task 4 tests).
- **An older "latest".** The owner runs a build newer than the newest release. No "Update available" for an older or equal version (Task 4 test).
- **Both installed.** A teammate installs the extension and forgets Tampermonkey. Two automations in one tab must not both trim or both start uploads (Task 5, call 7; README item).
- **A new folder per version.** macOS unzips to a folder named after the zip. Without a `key` that is a new extension id and an empty extension next to the old one (Task 7 Step 1; README "Update"; a manual item records what Chrome does).
- **A move file from someone else.** Upload history and channels are personal. They are imported only on "My file", row by row, with avatar links limited to `https:` (Task 6 tests).
- **Upload-history rows without a video id.** The userscript writes `videoId: ''` for many rows, and the "already uploaded" warning never used the id. The move import must keep them (Task 6 tests).
- **Tests and the network.** The background checks for updates when it starts, and a test file starts the background before every test. No test may call GitHub (Task 4 Step 4 stubs `fetch` first).
- **The key is declined.** Every later step must still work with no `key` in the manifest, and the release check must not demand one (Task 7 Step 1B; `inspect` tests both ways).
- **The notice during a run.** The daily toast must not replace a queue toast mid-upload, and a clock set back must not silence it for ever (Task 11 tests).

## Parallel execution map

**Worktrees.** The controller creates each agent's worktree by hand; the Agent tool's automatic worktree isolation is not used (in Phase 4b it put seven agents in one tree on the wrong base). For each unit:

```sh
git worktree add <scratch>/p5/<unit> -b p5-<unit> <base>
ln -s <main checkout>/extension/node_modules <scratch>/p5/<unit>/extension/node_modules
cd <scratch>/p5/<unit>/extension && npm run build     # once, before the first `npm run check`
```

The build comes first because `tsconfig.json` extends `./.wxt/tsconfig.json`, which only a build (or `wxt prepare`) generates, and a symlinked `node_modules` runs no `postinstall`. The task sections stay the source of each unit's steps.

### The limits, plainly

- **Shared files with one owner each:** `package.json` and the marker lines of `scripts/strings/extension-only.mjs` (K); `entrypoints/background.ts`, `tests/background-guards.test.ts` and `entrypoints/sidepanel/shell/Banners.tsx` (U in wave 1, then G); `tests/panel-i18n.test.tsx`, `README.md`, the spec, `PARITY.md`, `CHANGELOG.md` and `scripts/parity/DECISIONS.md` (Z only: U, M and G describe their Thai render case in their report and Z writes all three).
- **`npm run check` is green in every unit at every commit.** The parity check in it is structural only; `PARITY.md` does not exist until Z writes it, and its freshness is checked only by `--release`.
- **Rows have one writer at a time.** A1–A4 each own one rows file. In Task 3 the controller, not the port agents, edits rows and registers new strings after each merge.
- **Tasks 9–11 are serial and owner-gated.** Nothing runs beside them.

### Units

| Unit | From | Depends on | Creates / modifies (hot files in **bold**) |
|---|---|---|---|
| **K** carry-ins and the checker | all of Task 0; all of Task 1 | entry gate | Task 0's files; `scripts/parity-check.mjs`, `tests/parity-check.test.ts`, `scripts/parity/rows/{pre-ui,ui-upload,ui-copyright,page}.mjs` (seeded `missing`), `scripts/parity/DECISIONS.md` (the earlier phases' decisions); **`package.json`** (`parity`, `release:check`, `check` gains `parity-check`); **`extension-only.mjs`**: three marker lines |
| **A1** rows: before the UI | Task 2 | K | `scripts/parity/rows/pre-ui.mjs`: every id of kind `header:`, `store:`, `session:`, `setting:`, `cfg:`, `preset:`, `var:`, and the code lines of 1–2427 |
| **A2** rows: drawer | Task 2 | K | `scripts/parity/rows/ui-upload.mjs`: `switch:`, `section:`, `tab:`, and the lines of 2428–4586 (the notification, title mark and sound at 3261–3290 are A2's alone) |
| **A3** rows: copyright UI | Task 2 | K | `scripts/parity/rows/ui-copyright.mjs`: the lines of 4587–6356 |
| **A4** rows: page side | Task 2 | K | `scripts/parity/rows/page.mjs`: `port:`, `key:`, the lines of 6357–6414, and manual rows for page behaviour with no line of its own outside a port (none of A2's) |
| **U** update check | Task 4 | K | `lib/update-check.ts`, `tests/update-check.test.ts`, **`entrypoints/background.ts`** (one block at the end), **`tests/background-guards.test.ts`**, **`Banners.tsx`** (one banner), `tests/panel-shell.test.tsx`, `extension-only.mjs` under its marker |
| **M** move file, extension side (call 8) | Task 6 | K | `lib/backup.ts`, `lib/store-writer.ts`, `entrypoints/sidepanel/tabs/SettingsTab.tsx`, `tests/backup.test.ts`, `tests/store-writer.test.ts`, `tests/panel-backup.test.ts`, `extension-only.mjs` under its marker |
| **R** packaging | Task 7 | K | `wxt.config.ts` (call 5), `public/icon/*`, `lib/notify.ts`, `lib/claims/alarms.ts`, `tests/notify.test.ts`, `tests/claims-alarms.test.ts` (call 6), `scripts/release-check.mjs`, `tests/release-check.test.ts` |
| **G** userscript in the tab (call 7) | Task 5 | U merged (`Banners.tsx`, `panel-shell.test.tsx`) | `lib/studio/userscript-here.ts`, `tests/userscript-here.test.ts`, `lib/messages.ts` (`PROTOCOL`), `lib/studio/queue-view.ts`, `entrypoints/studio.content.ts`, `tests/studio-wiring.test.ts`, `Banners.tsx`, `tests/queue-view.test.ts`, `tests/panel-shell.test.tsx`, `extension-only.mjs` under its marker |
| **C** close `missing` rows | Task 3 | A1–A4 merged **and the owner's answer** | one agent per port; two run at once only when they touch different code files; rows and `extension-only.mjs` are edited by the controller after each merge |
| **Z** docs and exit | Task 8 | everything above | **`README.md`**, `CHANGELOG.md`, `PARITY.md` (first written here), `DECISIONS.md`, **`tests/panel-i18n.test.tsx`**, the spec, full verification |

R and K both touch `tests/claims-alarms.test.ts` (K adds one test in Task 0, R changes an expectation for call 6): R starts from K's commit, so there is nothing to merge.

### Waves

```
entry gate ─► K ─┬─► A1 A2 A3 A4 ─► [owner: the missing list] ─► C ─┐
                 ├─► U ─► G                                          ├─► Z ─► [owner] 9 ─► [owner] 10 ─► [owner] 11
                 ├─► M                                               │
                 └─► R ──────────────────────────────────────────────┘
```

Wave 1 is seven agents (A1–A4, U, M, R). If that is too many: run A1–A4 first, since the owner's stop and C depend on what they find, and that is the unknown in the schedule.

### Things that only work once merged (Z checks them)

- `npm run parity -- --release` passes only when no row is `missing` and `PARITY.md` is fresh.
- `npm run release:check` runs the parity release check, so it fails until C and Z are done.
- The Thai renders of the new banners and of the import question's new lines (`panel-i18n`), once U, M and G are all in.

## File Structure

```
extension/
  CHANGELOG.md                         new (Z): one section per released version
  PARITY.md                            new, generated, first written by Z: parity-check --write
  README.md                            Z: title, Install, Update, Moving, items 75+, known behaviour
  wxt.config.ts                        R: key (call 5), nothing else
  public/icon/{16,32,48,128}.png       R (call 6): WXT turns public/icon/<size>.png into manifest icons
  lib/update-check.ts                  U: fetch, compare, store
  lib/studio/userscript-here.ts        G (call 7): is #ytp-root in this page; the held lock request
  lib/messages.ts                      G (call 7): PROTOCOL 3
  lib/backup.ts                        M (call 8): the move file's extra fields
  scripts/parity-check.mjs             K: inventory, row checks, --write, --release
  scripts/parity/DECISIONS.md          K seeds it (Phase 4's decisions); the controller and Z add Phase 5's
  scripts/parity/rows/pre-ui.mjs       A1: named data ids and lines 1–2427
  scripts/parity/rows/ui-upload.mjs    A2: drawer, lines 2428–4586 (styles, shell, FAB, Upload, Presets, Settings)
  scripts/parity/rows/ui-copyright.mjs A3: copyright UI, lines 4587–6356 outside the port regions
  scripts/parity/rows/page.mjs         A4: ports, shortcuts, lines 6357–6414, page-side feature rows
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
- Create: `extension/scripts/parity/rows/{pre-ui,ui-upload,ui-copyright,page}.mjs` (seeded), `extension/scripts/parity/DECISIONS.md`
- Modify: `extension/package.json` (scripts), `extension/scripts/strings/extension-only.mjs` (three marker comments)

`PARITY.md` is **not** created here: Z writes it for the first time (Task 8), and only `--release` checks that it is fresh. So `npm run check` stays green while rows are being filled.

**Interfaces:**
- Produces:
  - `inventory(text: string, portRegions: [number, number][]): string[]` — the ids below, sorted, unique. `pinnedInventory(): Promise<string[]>` — the same for the pinned file with today's port configs, plus the `port:` ids.
  - Row shape: `{ id?: string, lines?: string[], status: 'same' | 'changed' | 'dropped' | 'missing', home?: string | string[], readme?: number[], test?: string | string[], unseen?: string, cite?: string, note?: string, manual?: true }`.
  - `check(rows, inv, ctx): string[]` — problems, empty when fine. `ctx = { read(path), readmeItems, cites, release }`.
  - `render(rows): string` — the text of `PARITY.md`.
  - CLI: `node scripts/parity-check.mjs` (structure), `--release` (also: no `missing`, `PARITY.md` fresh; prints every changed and dropped row), `--write` (writes `PARITY.md`), `--seed` (prints a row for every named item that has none).

**What the inventory is** (all from the pinned file, so ids never move):

| Id | From | Count at the pin |
|---|---|---|
| `header:<directive> <value>` | the `@match`, `@grant`, `@run-at`, `@updateURL` lines | 11 |
| `store:<key>`, `store:<key>:<channel>` | `load('k'` / `save('k'`, the `*_KEY = '…'` constants (255–257), `legacy: '…'` flags; `chGet('k'` / `chSet('k'`, and `tabLock:` (5053) | 35 |
| `session:<key>` | `sessionStorage.getItem/setItem('k'` (5045) | 1 |
| `setting:<key>` | the keys of the settings object (666–691) | 22 |
| `cfg:<key>` | the keys of `Claims`' `DEFAULTS` (4593–4604) | 10 |
| `preset:<field>` | the fields of the default presets (500–587) | 8 |
| `switch:<key>` | `sw('key'` (4469–4483) | 9 |
| `section:<English title>` | `sec(L('…', '…')` | 11 |
| `var:{name}` | `VARS` (579) | 11 |
| `key:Alt+<code>` | `e.code === 'KeyP'`, `/^Digit[1-9]$/` (6391–6394) | 2 |
| `tab:<pane>` | `panes.<name> = ` | 4 |
| `port:<config>` | each file in `scripts/port/` (port-check proves these; the row names the home) | 19 |
| `ui:<line>` | **every line of code in the whole file that no port region covers** and that wires a user action (`onclick: …`, `n.onclick = …`, `addEventListener(`) | 160 |
| `code:<line>` | every other line of code that no port region covers (not blank, not a comment) | 2,908 |

3,211 items in all (a dry run of the code below gave these numbers). The last two rows are what makes the list complete by construction: 580 such lines before the UI (the `TXT` table, default presets, migrations, the hand-ported template, chapter and tracklist logic, `mp4Duration`, `parseUploadPct`, `activityFrom`), 595 of stylesheet (2428–3190), 1,264 of drawer code, 575 in the copyright module outside its port regions, 54 at the end. A `lines` row covers a range of them; every line must be covered exactly once.

Strings are not in the inventory: `ui-check --coverage` already proves every `L()` pair of 2428–6356 is used or in `dropped.mjs`. Hand-listed rows (`manual: true`, id starting `feature:`) are allowed for behaviour that deserves its own line in `PARITY.md` (the FAB's drag, the sound), but nothing depends on anyone remembering them: their code lines are in the inventory anyway.

**What a row must prove** (all checked by `check()`):

| Rule | Why |
|---|---|
| A `store:` / `setting:` / `cfg:` / `preset:` / `switch:` / `section:` / `var:` row that is `same` or `changed`: its key (or the section's English title) occurs in a `home` file | a home that exists is not evidence |
| `same` and `changed` need a proof: `readme: [item numbers]`, or `test: 'tests/…'` (a file that exists), or `unseen: '<why nothing can be seen or tested>'` | "same" with nothing to show for it is a guess |
| `changed` and `dropped` need a `cite` that resolves: `dropped.mjs: <English>` and `extension-only.mjs: <English>` to an entry of that file; `README: <text>` and `spec: <text>` to a heading containing it; `decision: <id>` to a line `- **<id>**` of `scripts/parity/DECISIONS.md` | any non-empty text would otherwise pass |
| A `lines` row that is not `missing`: a `note` naming the one feature it covers, at least one inventory line inside it, at most 150 lines and at most 12 handler lines | one row must not close a region |
| A row whose `id` is not in the inventory is refused unless it is `manual: true` and starts `feature:` | no row for something the userscript doesn't have |
| `--release`: no `missing` row; `PARITY.md` equals the render; every `changed` and `dropped` row is printed | the owner reads that list (README item 81) |

- [ ] **Step 1: Write the failing test**

`tests/parity-check.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script
import { check, inventory, MAX_LINES, pinnedInventory, render } from '../scripts/parity-check.mjs';

const SRC = [
  '// ==UserScript==',                                        // 1
  '// @match        https://studio.youtube.com/*',
  '// @grant        GM_setClipboard',
  '// ==/UserScript==',
  "  const SWITCH_KEY = 'pendingChannelSwitch';",             // 5
  "  const VARS = ['name', 'bpm'];",
  '  const DEFAULT_PRESETS = [',
  '    {',
  '      artistMax: 4,',
  '    },',                                                   // 10
  '  ];',
  '  const settings = Object.assign(',
  '    {',
  '      autoSave: true, // x',
  '      schedule: { on: false },',                           // 15
  '    },',
  "    load('settings', {})",
  '  );',
  '  const saveSettings = () => 1;',
  "  const fab = h('button', { onclick: () => open() });",    // 20
  '  /* a block',
  '     comment */',
  '  // a comment',
  '',
  '  n.onclick = () => focus();',                             // 25
  "    sec(L('ทั่วไป', 'General'), 'gear',",
  "      sw('autoSave', L('ก', 'Auto-press Save')),",
  '    const DEFAULTS = {',
  "      apMaxPct: '25',",
  '    };',                                                   // 30
  '    const cfg = () => 1;',
  "    chSet('trimQueue', []);",
  "    if (e.code === 'KeyP') {}",
  '  panes.queue = h();',
  '  const onlyActive = { onlyActive: true };',               // 35
].join('\n');

describe('parity inventory', () => {
  it('lists the named things and every line of code, handler lines as ui:', () => {
    const inv = inventory(SRC, []);
    for (const id of [
      'header:match https://studio.youtube.com/*', 'header:grant GM_setClipboard',
      'store:pendingChannelSwitch', 'store:settings', 'store:trimQueue:<channel>',
      'setting:autoSave', 'setting:schedule', 'cfg:apMaxPct', 'preset:artistMax', 'switch:autoSave', 'section:General',
      'var:{name}', 'var:{bpm}', 'key:Alt+KeyP', 'tab:queue',
      'ui:20', 'ui:25', 'code:5', 'code:35',
    ]) expect(inv, id).toContain(id);
    // comments and blank lines are not code; a property that only starts with "on" is no handler
    for (const id of ['code:1', 'code:21', 'code:22', 'code:23', 'code:24', 'ui:35', 'code:20']) expect(inv, id).not.toContain(id);
    expect(inv).toEqual([...new Set(inv)].sort());
  });

  it('a line inside a ported region is not listed', () => {
    const inv = inventory(SRC, [[20, 25]]);
    expect(inv).not.toContain('ui:20');
    expect(inv).not.toContain('ui:25');
    expect(inv).toContain('code:19');
  });

  // As ui-check pins pairsHash: the inventory of the real pinned file cannot shrink unseen. It
  // changes only when a port config gains or loses a region; update both numbers in that commit
  // and say in its message which lines moved.
  it('the pinned userscript yields 3211 items', async () => {
    const inv = await pinnedInventory();
    expect(inv).toHaveLength(3211);
    expect(inv.filter((id: string) => id.startsWith('ui:'))).toHaveLength(160);
    expect(createHash('sha256').update(inv.join('\n')).digest('hex')).toBe('024d53ceaf14bb9cbdd6452e6998a4e34898c9472fcc4b847cda90eb8b623873');
    expect(inv).toContain('ui:3267'); // n.onclick = …, the assignment form
  });
});

describe('parity rows', () => {
  const inv = ['store:settings', 'ui:15', 'code:16', 'ui:40'];
  const files: Record<string, string> = { 'lib/settings.ts': "load('settings')", 'tests/settings.test.ts': '', 'README.md': '' };
  const cites = {
    dropped: new Set(['Panel opacity']), extensionOnly: new Set(['Get the update']),
    readmeHeadings: ["Known behaviour, Phase 4b (note, don't test)"], specHeadings: ['GM replacements'], decisions: new Set(['P4-17']),
  };
  const ctx = { read: (p: string) => files[p] ?? null, readmeItems: new Set([35]), cites, release: false };
  const ok = [
    { id: 'store:settings', status: 'same', home: 'lib/settings.ts', readme: [35] },
    { lines: ['10-50'], status: 'dropped', cite: 'dropped.mjs: Panel opacity', note: 'the opacity slider' },
  ];
  const problems = (rows: unknown[], c = ctx, i = inv) => check(rows, i, c).join('\n');

  it('passes when every inventory item has exactly one row', () => expect(problems(ok)).toBe(''));

  it('names an inventory item with no row, and one with two', () => {
    expect(problems([ok[0]])).toMatch(/ui:15: no row/);
    expect(problems([...ok, { ...ok[0] }])).toMatch(/store:settings: 2 rows/);
  });

  it('refuses a row for something the userscript does not have, unless it is a manual feature: row', () => {
    const extra = { id: 'store:nope', status: 'same', home: 'lib/settings.ts', readme: [35] };
    expect(problems([...ok, extra])).toMatch(/store:nope: not in the inventory/);
    expect(problems([...ok, { ...extra, manual: true }])).toMatch(/not in the inventory/);
    expect(problems([...ok, { ...extra, id: 'feature:fab drag', manual: true }])).toBe('');
  });

  it('a home must exist and must contain the key', () => {
    expect(problems([{ ...ok[0], home: 'lib/gone.ts' }, ok[1]])).toMatch(/home lib\/gone\.ts does not exist/);
    expect(problems([{ ...ok[0], home: 'README.md' }, ok[1]])).toMatch(/"settings" does not occur in its home/);
  });

  it('same and changed need a proof: a README item, a test that exists, or a reason nothing can be seen', () => {
    expect(problems([{ ...ok[0], readme: undefined }, ok[1]])).toMatch(/needs a proof/);
    expect(problems([{ ...ok[0], readme: undefined, test: 'tests/settings.test.ts' }, ok[1]])).toBe('');
    expect(problems([{ ...ok[0], readme: undefined, test: 'tests/gone.test.ts' }, ok[1]])).toMatch(/test tests\/gone\.test\.ts does not exist/);
    expect(problems([{ ...ok[0], readme: undefined, unseen: 'a key with no UI' }, ok[1]])).toBe('');
    expect(problems([{ ...ok[0], readme: [999] }, ok[1]])).toMatch(/README item 999/);
  });

  it('changed and dropped need a cite that resolves', () => {
    expect(problems([{ ...ok[0], status: 'changed' }, ok[1]])).toMatch(/store:settings: changed needs a cite/);
    for (const cite of ['because', 'dropped.mjs: Not there', 'decision: P9-1', 'README: No such heading', 'spec: Nope']) {
      expect(problems([ok[0], { ...ok[1], cite }]), cite).toMatch(/10-50: dropped (needs a cite|cite .* resolves to nothing)/);
    }
    for (const cite of ['extension-only.mjs: Get the update', 'decision: P4-17', 'README: Known behaviour, Phase 4b', 'spec: GM replacements']) {
      expect(problems([ok[0], { ...ok[1], cite }]), cite).toBe('');
    }
  });

  it('a lines row names its feature, hits the inventory and stays small', () => {
    const drop = { lines: ['100-999'], status: 'dropped', cite: 'decision: P4-17', note: 'x' };
    expect(problems([ok[0], { ...ok[1], note: undefined }])).toMatch(/needs a note/);
    expect(problems([...ok, { ...drop, lines: ['60-70'] }])).toMatch(/60-70: covers no line/);
    const big = Array.from({ length: MAX_LINES + 1 }, (_, i) => 'code:' + (100 + i));
    expect(problems([drop], ctx, big)).toMatch(/151 lines in one row/);
    expect(problems([drop], ctx, Array.from({ length: 13 }, (_, i) => 'ui:' + (100 + i)))).toMatch(/13 handler lines in one row/);
    expect(problems([{ lines: ['100-999'], status: 'missing' }], ctx, big)).toBe(''); // a seeded row may be large
  });

  it('missing rows pass the structure check and fail the release check', () => {
    const rows = [{ id: 'store:settings', status: 'missing' }, ok[1]];
    expect(problems(rows)).toBe('');
    expect(problems(rows, { ...ctx, release: true })).toMatch(/store:settings: MISSING/);
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
// ids never move: its named things (storage keys, settings, preset fields, switches, sections,
// variables, shortcuts, tabs, header lines), each port config, and every line of code that no
// port config covers. scripts/parity/rows/*.mjs must hold one row per item saying where it lives
// in the extension and what proves it, or why it is gone. Strings are ui-check's job, ported
// code port-check's.
//   node scripts/parity-check.mjs            structure: every item has one row, rows hold up
//   node scripts/parity-check.mjs --release  also: no `missing` row, PARITY.md is fresh; prints
//                                            every changed and dropped row for the owner to read
//   node scripts/parity-check.mjs --write    writes PARITY.md
//   node scripts/parity-check.mjs --seed     prints a `missing` row for every named item without one
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'd15ef87caaddb7a6d3187d2851b83a484c4bb9e7'; // userscript v4.27.1, as scripts/port-check.mjs
const STATUSES = ['same', 'changed', 'dropped', 'missing'];
export const MAX_LINES = 150; // one `lines` row is one feature, not a region
export const MAX_HANDLERS = 12;

const all = (text, re, f = (m) => m[1]) => [...text.matchAll(re)].map(f);
const between = (text, a, b) => {
  const i = text.indexOf(a);
  const j = i < 0 ? -1 : text.indexOf(b, i);
  return i < 0 || j < 0 ? '' : text.slice(i, j);
};
export const span = (s) => { const [a, b = a] = String(s).split('-').map(Number); return [a, b]; };
const inAny = (n, spans) => spans.some(([a, b]) => n >= a && n <= b);
// A line that wires a user action: a property (`onclick: () =>`), an assignment (`n.onclick = …`)
// or addEventListener. These are `ui:<line>`; every other line of code is `code:<line>`.
const HANDLER = /\bon[a-z]+\s*[:=]\s*(?:\(|async\b|[A-Za-z_$][\w$.]*\s*[,;})])|addEventListener\(/;

// Line numbers that are code: not blank, not a // comment, not inside a /* */ block.
export function codeLines(text) {
  const out = [];
  let block = false;
  text.split('\n').forEach((raw, i) => {
    const l = raw.trim();
    if (block) { if (l.includes('*/')) block = false; return; }
    if (!l || l.startsWith('//')) return;
    if (l.startsWith('/*')) { if (!l.includes('*/')) block = true; return; }
    out.push(i + 1);
  });
  return out;
}

export function inventory(text, portRegions) {
  const header = between(text, '// ==UserScript==', '// ==/UserScript==');
  const keysOf = (block) => all(block, /^ {6}(\w+):/gm);
  const lines = text.split('\n');
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
    ...keysOf(between(text, 'const DEFAULT_PRESETS = [', '\n  ];')).map((k) => 'preset:' + k),
    ...all(text, /\bsw\('(\w+)'/g).map((k) => 'switch:' + k),
    ...all(text, /\bsec\(L\('(?:[^'\\]|\\.)*', '((?:[^'\\]|\\.)*)'\)/g).map((k) => 'section:' + k.replace(/\\(.)/g, '$1')),
    ...all(text, /const VARS = \[([^\]]*)\]/g).flatMap((s) => all(s, /'(\w+)'/g)).map((k) => `var:{${k}}`),
    ...all(text, /e\.code === '(\w+)'/g).map((k) => 'key:Alt+' + k),
    ...(text.includes('/^Digit[1-9]$/') ? ['key:Alt+Digit1-9'] : []),
    ...all(text, /^\s*panes\.(\w+) = /gm).map((k) => 'tab:' + k),
    ...codeLines(text).filter((n) => !inAny(n, portRegions)).map((n) => (HANDLER.test(lines[n - 1]) ? 'ui:' : 'code:') + n),
  ])].sort();
}

const label = (r) => r.id ?? (r.lines ?? []).join(', ');
const list = (v) => (v === undefined ? [] : [].concat(v));
const isLine = (id) => id.startsWith('ui:') || id.startsWith('code:');
const lineOf = (id) => Number(id.slice(id.indexOf(':') + 1));
// What must be found in a named item's home: the key itself, or the section's English title.
function needle(id) {
  const m = id.match(/^(store|setting|cfg|preset|switch|section|var):(.+)$/);
  if (!m) return null;
  return m[2].replace(/:<channel>$/, '').replace(/^\{(.+)\}$/, '$1');
}
// cite: '<kind>: <text>'. Each kind resolves against a tracked file.
function citeProblem(cite, c) {
  const m = /^(dropped\.mjs|extension-only\.mjs|README|spec|decision): (.+)$/.exec(cite ?? '');
  if (!m) return 'needs a cite of the form "dropped.mjs: <English>", "extension-only.mjs: <English>", "README: <heading>", "spec: <heading>" or "decision: <id>"';
  const [, kind, what] = m;
  const found =
    kind === 'dropped.mjs' ? c.dropped.has(what)
    : kind === 'extension-only.mjs' ? c.extensionOnly.has(what)
    : kind === 'README' ? c.readmeHeadings.some((h) => h.includes(what))
    : kind === 'spec' ? c.specHeadings.some((h) => h.includes(what))
    : c.decisions.has(what);
  return found ? null : `cite "${cite}" resolves to nothing`;
}

// ctx: { read(path) → text | null (a file under extension/), readmeItems: Set<number>, cites, release }
export function check(rows, inv, ctx) {
  const out = [];
  const known = new Set(inv);
  const hits = new Map(inv.map((id) => [id, 0]));
  const bump = (id) => hits.set(id, hits.get(id) + 1);
  for (const r of rows) {
    const name = label(r);
    if (!r.id && !r.lines?.length) { out.push('a row has neither id nor lines'); continue; }
    if (!STATUSES.includes(r.status)) out.push(`${name}: status must be one of ${STATUSES.join(' / ')}`);
    if (r.id && known.has(r.id)) bump(r.id);
    else if (r.id && !(r.manual && r.id.startsWith('feature:'))) out.push(`${name}: not in the inventory (a hand-listed row is manual: true with an id starting "feature:")`);
    if (r.lines) {
      const spans = r.lines.map(span);
      const covered = inv.filter((id) => isLine(id) && inAny(lineOf(id), spans));
      covered.forEach(bump);
      if (!covered.length) out.push(`${name}: covers no line of the inventory`);
      if (r.status !== 'missing') {
        if (!r.note) out.push(`${name}: a lines row needs a note naming the one feature it covers`);
        const handlers = covered.filter((id) => id.startsWith('ui:')).length;
        if (covered.length > MAX_LINES) out.push(`${name}: ${covered.length} lines in one row (at most ${MAX_LINES}): split it by feature`);
        if (handlers > MAX_HANDLERS) out.push(`${name}: ${handlers} handler lines in one row (at most ${MAX_HANDLERS}): split it by feature`);
      }
    }
    if (r.status === 'same' || r.status === 'changed') {
      const homes = list(r.home);
      if (!homes.length) out.push(`${name}: ${r.status} needs a home (a file under extension/)`);
      const texts = homes.map((h) => [h, ctx.read(h)]);
      for (const [h, t] of texts) if (t === null) out.push(`${name}: home ${h} does not exist`);
      const key = r.id ? needle(r.id) : null;
      if (key && homes.length && !texts.some(([, t]) => t?.includes(key))) out.push(`${name}: "${key}" does not occur in its home`);
      for (const t of list(r.test)) if (ctx.read(t) === null) out.push(`${name}: test ${t} does not exist`);
      if (!list(r.readme).length && !list(r.test).length && !r.unseen) out.push(`${name}: ${r.status} needs a proof: a README item (readme), a test file (test), or unseen: '<why nothing can be seen or tested>'`);
    }
    if (r.status === 'changed' || r.status === 'dropped') {
      const p = citeProblem(r.cite, ctx.cites);
      if (p) out.push(`${name}: ${r.status} ${p}`);
    }
    for (const n of list(r.readme)) if (!ctx.readmeItems.has(n)) out.push(`${name}: README item ${n} does not exist`);
    if (ctx.release && r.status === 'missing') out.push(`${name}: MISSING — port it, or record the owner's decision in scripts/parity/DECISIONS.md`);
  }
  for (const [id, n] of hits) {
    if (n === 0) out.push(`${id}: no row`);
    if (n > 1) out.push(`${id}: ${n} rows`);
  }
  return out;
}

const ORDER = { missing: 0, changed: 1, dropped: 2, same: 3 };
const proof = (r) => [list(r.readme).join(', '), ...list(r.test).map((t) => '`' + t + '`'), r.unseen ? 'not visible: ' + r.unseen : ''].filter(Boolean).join('; ');
export function render(rows) {
  const line = (r) => `| \`${label(r)}\` | ${r.status} | ${list(r.home).map((h) => '`' + h + '`').join(', ')} | ${[r.cite, r.note].filter(Boolean).join(' — ')} | ${proof(r)} |`;
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || label(a).localeCompare(label(b)));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return [
    '# Parity with the userscript v4.27.1',
    '',
    'Generated by `npm run parity -- --write` from `scripts/parity/rows/`. Do not edit by hand.',
    '',
    `${rows.length} rows: ${count('same')} same, ${count('changed')} changed on purpose, ${count('dropped')} dropped on purpose, ${count('missing')} missing.`,
    '',
    'The first column is the item in the pinned userscript; line numbers are lines of the file at `d15ef87`. Decisions are in `scripts/parity/DECISIONS.md`. "Proof" is the README exit-check item that shows it in Chrome, or the test that pins it.',
    '',
    '| Userscript | Status | In the extension | Why / note | Proof (README item, test) |',
    '|---|---|---|---|---|',
    ...sorted.map(line),
    '',
  ].join('\n');
}

const headings = (md) => all(md, /^#{1,4} (.+)$/gm);
const entries = async (file) => new Set((await import(pathToFileURL(join(EXT, file)).href)).default.map((p) => p.en));

// The inventory of the pinned userscript, with the port configs as they are now. A port config
// that gains a region takes lines out of it (tests/parity-check.test.ts pins the count and hash).
export async function pinnedInventory() {
  const text = execFileSync('git', ['show', `${PIN}:youtube-upload-presets.user.js`], { cwd: join(EXT, '..'), encoding: 'utf8', maxBuffer: 1 << 26 });
  const portDir = join(EXT, 'scripts/port');
  const ports = readdirSync(portDir).filter((f) => f.endsWith('.mjs'));
  const regions = [];
  for (const f of ports) regions.push(...((await import(pathToFileURL(join(portDir, f)).href)).default.regions ?? []).map(span));
  return [...inventory(text, regions), ...ports.map((f) => 'port:' + f.replace(/\.mjs$/, ''))].sort();
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const inv = await pinnedInventory();
  const rowDir = join(EXT, 'scripts/parity/rows');
  const rows = [];
  for (const f of readdirSync(rowDir).filter((x) => x.endsWith('.mjs')).sort()) rows.push(...(await import(pathToFileURL(join(rowDir, f)).href)).default);
  if (args.has('--seed')) {
    const have = new Set(rows.map((r) => r.id));
    for (const id of inv) if (!have.has(id) && !isLine(id)) console.log(`  { id: ${JSON.stringify(id)}, status: 'missing', note: 'not looked at yet' },`);
    return;
  }
  const cache = new Map();
  const read = (p) => {
    if (!cache.has(p)) cache.set(p, existsSync(join(EXT, p)) ? readFileSync(join(EXT, p), 'utf8') : null);
    return cache.get(p);
  };
  const readme = read('README.md') ?? '';
  const ctx = {
    read,
    readmeItems: new Set(all(readme, /^(\d+)\. \*\*/gm).map(Number)),
    release: args.has('--release'),
    cites: {
      dropped: await entries('scripts/strings/dropped.mjs'),
      extensionOnly: await entries('scripts/strings/extension-only.mjs'),
      readmeHeadings: headings(readme),
      specHeadings: headings(readFileSync(join(EXT, '../docs/superpowers/specs/2026-10-05-chrome-extension-design.md'), 'utf8')),
      decisions: new Set(all(read('scripts/parity/DECISIONS.md') ?? '', /^- \*\*([\w-]+)\*\*/gm)),
    },
  };
  const problems = check(rows, inv, ctx);
  const md = render(rows);
  if (args.has('--write')) writeFileSync(join(EXT, 'PARITY.md'), md);
  else if (ctx.release && read('PARITY.md') !== md) problems.push('PARITY.md is missing or out of date: run `npm run parity -- --write`');
  if (problems.length) {
    console.error(`parity-check: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  if (ctx.release) {
    console.log('Changed or dropped on purpose — the owner reads this list before a release (README item 81):');
    for (const r of rows.filter((x) => x.status === 'changed' || x.status === 'dropped')) console.log(`  ${r.status.padEnd(7)} ${label(r)} — ${r.cite}${r.note ? ' — ' + r.note : ''}`);
  }
  console.log(`parity-check: ok (${inv.length} items, ${rows.length} rows, ${rows.filter((r) => r.status === 'missing').length} missing)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/parity-check.test.ts`
Expected: PASS (12 tests). The pinned count and hash were computed with exactly this code against `d15ef87` and the 19 port configs at `2250ed2`; if a Phase 4 fix changed a port config's `regions` since, the hash differs: recompute, read which lines moved, and update the two numbers.

Then read twenty of the `ui:` lines in the pinned source (`git show d15ef87:youtube-upload-presets.user.js | sed -n '<n>p'`): each must wire a user action. Do **not** narrow `HANDLER` to make the list shorter: a line it drops is still in the inventory as `code:<line>`.

- [ ] **Step 5: `DECISIONS.md` and the seeded rows**

`scripts/parity/DECISIONS.md` is the tracked record a `decision: <id>` cite resolves to (the planning reports under `.superpowers/` are not in git). One line per decision, in this form:

```markdown
# Decisions the parity rows cite

Each line is one decision the owner approved. `<phase>-<number>` is the judgment call's number
in that phase's planning report; `owner-<date>` is an answer given outside a numbered call.

## Phase 4 (approved 2026-10-10, calls 35 and 36 on 2026-10-11)

- **P4-4** Per-channel copyright data is not migrated from the userscript; the claimed-songs history moves as a lossy CSV.
- **P4-8** A trim, ads or Collab page change waits while any other Studio tab uploads or does copyright work.
```

K copies **every** judgment call of `.superpowers/sdd/p4/planning-report.md` (1–34, in its own words, one line each), calls 35 and 36 and the 2026-10-11 answers from `.superpowers/sdd/progress.md` and README commit `95f3aae`, under `## Phase 4`; and adds an empty `## Phase 5` heading for Task 3 and for this plan's approved calls (Z fills those: `P5-4` … as the owner answers). Earlier phases' decisions are cited through the spec and the README, which were amended for them.

Then the four rows files, each `export default [ … ];` with a one-line comment naming its area (create them empty first: `--seed` needs the directory):

1. `pre-ui.mjs`: the `--seed` output for ids starting `header:`, `store:`, `session:`, `setting:`, `cfg:`, `preset:`, `var:`, plus `{ lines: ['1-2427'], status: 'missing', note: 'not looked at yet' }`.
2. `ui-upload.mjs`: the seeded `switch:`, `section:`, `tab:` rows, plus `{ lines: ['2428-4586'], status: 'missing', note: 'not looked at yet' }`.
3. `ui-copyright.mjs`: `{ lines: ['4587-6356'], status: 'missing', note: 'not looked at yet' }`.
4. `page.mjs`: the seeded `port:` and `key:` rows, plus `{ lines: ['6357-6414'], status: 'missing', note: 'not looked at yet' }`.

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

Run: `npm run build && npm run check`
Expected: green, ending `parity-check: ok (3211 items, N rows, N missing)` (every row is `missing`; write N in the report). `node scripts/parity-check.mjs --release` fails, naming every row: that is right until Task 3 is done.

```bash
git add extension/scripts/parity-check.mjs extension/scripts/parity extension/tests/parity-check.test.ts extension/package.json extension/scripts/strings/extension-only.mjs
git commit -m "Parity checker: an inventory of the pinned userscript (named things, port configs and every line of code no port covers), one row per item with a home, a proof and a cite that resolves; every row starts as missing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fill the rows (four agents at once, one file each)

**Files:** each agent edits exactly one of `scripts/parity/rows/{pre-ui,ui-upload,ui-copyright,page}.mjs` and nothing else. Nobody runs `--write` and nobody creates `PARITY.md`.

**Interfaces:**
- Consumes: the row shape, the rules and the CLI from Task 1; `scripts/parity/DECISIONS.md` (read only).
- Produces: rows that are no longer "not looked at yet". A row may stay `missing`, with a `note` that says exactly what the extension lacks. That is a finding, not a failure.

**How a row is decided** (the same rule for every agent):

1. Read the item in the pinned source: `git show d15ef87:youtube-upload-presets.user.js | sed -n '<a>,<b>p'`.
2. Find it in the extension (`grep -rn` for its storage key, its English string, its setting name, its function name). `home` is the file that implements it, not a test and not a doc.
3. `same`: the extension does what the userscript did, read on both sides. Proof: the README exit-check item(s) that show it (`readme`), or the test that pins it (`test`; for hand-ported pure logic this is the ported test file, e.g. `tests/template.test.mjs`), or `unseen` with the reason (a stylesheet rule the panel's Tailwind classes replace is not `same`; see 5).
4. `changed`: it does it differently on purpose, with a `cite` in one of the five forms and the same kind of proof.
5. `dropped`: gone on purpose, with a `cite`. **A drop with nothing to cite is `missing`**: an agent never decides a drop. If you believe an earlier decision covers it but `DECISIONS.md` has no line for it, leave the row `missing` with `note: 'decided: <where>'`; the controller adds the line after the merge (Task 3 Step 2.3).
6. `lines` rows: split the seeded range into rows of one feature each (a button, a dialog, a list, a helper function, a block of styles for one component), at most 150 lines and 12 handler lines per row, each with a `note` naming the feature. Every `code:` and `ui:` line of your range must be covered exactly once; the checker names any that is not.

**Known answers (verified while planning; start from these):**

| Item | Row |
|---|---|
| `header:updateURL …` | `missing` with note "Task 4" until U merges; then `changed`, home `lib/update-check.ts`, cite `spec: Background`, readme item 77 (the controller flips it) |
| `header:grant GM_*` / `unsafeWindow` | `changed`, cite `spec: GM replacements`, homes per that table, proof per feature |
| `header:match https://www.youtube.com/*` | `same`, home `entrypoints/invite.content.ts`, readme `[38]` |
| `store:tabLock:<channel>`, `session:tbxTabId` | `changed`, homes `['lib/runner-lock.ts', 'lib/claims/keys.ts']` (the second names `tabLock` in its comment, which satisfies the key rule; `session:` ids have no key rule), cite `spec: GM replacements`, readme `[52]` |
| `setting:glass` | `dropped`, cite `spec: Side panel UI` |
| `store:addedPlaylist`, `store:addedTrapsoul`, `store:migratedOwnNames` | `same`, home `lib/migrations.ts`, test `tests/migrations.test.mjs` |
| `store:uploads`, `store:channels`, `store:fabPos`, `store:queueMemo` | `same`, home `lib/studio/state.ts` plus the file that reads and writes each |
| `key:Alt+KeyP` | `changed`, home `wxt.config.ts`, cite `dropped.mjs: Close (Alt+P)` (opens, can't close), readme `[1]` |
| `key:Alt+Digit1-9` | `same`, home: where `installShortcuts` lives, readme `[34]` |
| `tab:queue` / `presets` / `claims` / `settings` | `same`, homes `entrypoints/sidepanel/tabs/{QueueTab,PresetsTab,CopyrightTab,SettingsTab}.tsx`, readme `[2]` |
| `port:*` | `same`, home `scripts/port/<name>.mjs`, `unseen: 'port-check compares the text'`, note names the config's target file |
| lines 2428–3190 (stylesheet, Design B, glass) | `changed`, several rows by component, home `entrypoints/sidepanel/style.css` (and the page's shadow styles for the FAB, toast and quick-action bars), cite `spec: Side panel UI`, readme `[2, 50]` |
| the opacity slider and `applyGlass` | `dropped`, cite `dropped.mjs: Panel opacity` |
| the FAB's `drop` / `dragover` handlers (3570 and neighbours) | `dropped`, cite `spec: Side panel UI` (the FAB "no longer takes dropped files") |
| the notification's click (3263–3267) | `changed`, home `lib/notify.ts`, cite `README: Uploading`, readme `[24]` |

**Areas** (a clean partition by line, so no two agents own one line):

- **A1 `pre-ui.mjs`** — 1–2427 and the named data ids: `TXT` and `SEL` tables (31–178, compared with `lib/studio/txt.ts` / `sel.ts`), the pure collab helpers, invite and channel switch outside their port regions, default presets and `preset:` fields, settings defaults, storage, migrations, the template / chapters / tracklist logic (709–939, proof: the ported tests), `mp4Duration`, `parseUploadPct`, `activityFrom`, and whatever of 985–2427 no port region covers.
- **A2 `ui-upload.mjs`** — 2428–4586: stylesheet, icons, `h()`, toast and `ask()`, notification, title mark and sound (3261–3290), FAB, tab bar and activity bar, channel bar and list, drawer open and close, drop zone and pickers, queue pane and cards, presets pane, backup, settings pane; and the `switch:`, `section:`, `tab:` ids. Timers count as code lines here (3281 title mark, 3440 channel bar, 3724 schedule refresh): each gets a row.
- **A3 `ui-copyright.mjs`** — 4587–6356 outside the port regions: the pane, the claim-list modal, the tracklist editor, claimed songs, Ads, Collab, the trim confirm, Auto-pilot's switch and question, the settings modal, the status card and log.
- **A4 `page.mjs`** — `port:` and `key:` ids, 6357–6414 (the pane's mount, the 800 ms tick and its two failure toasts, the keydown handler, start-up), and manual `feature:` rows for page behaviour worth its own line (quick-action bars, the tracklist-fix dialog, manual fill, intercept, the "Leave site?" guard, invite accept and channel switch on www.youtube.com). Not the notification, title mark or sound: those lines are A2's.

- [ ] **Step 1 (each agent): fill the file by the rule above.**
- [ ] **Step 2 (each agent): run** `node scripts/parity-check.mjs` **until it prints `ok`.** Other areas' rows are still seeded `missing`, which passes. Then `npm run check`: green.
- [ ] **Step 3 (each agent): report** the count per status and, for every `missing` row: the userscript lines, what the extension lacks, a size guess (a string, a handler, a feature, more than one task), and whether a user would notice.
- [ ] **Step 4 (each agent): commit your one file.**

```bash
git add extension/scripts/parity/rows/<area>.mjs
git commit -m "Parity rows, <area>: N same, N changed, N dropped, N missing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5 (reviewer, per area): read every `changed` and `dropped` row and a sample of `same`.** The checker has already proved that homes exist, keys occur, proofs exist and cites resolve. The reviewer checks what it cannot: that the cited decision says what the row says; that the README item or test really exercises this item; that a `same` row's behaviour was read on both sides (sample: every tenth `same` row, and every `same` row with `unseen`). A `same` that turns out different goes back as `missing`.

---

### Task 3: Close every `missing` row — starts with an OWNER STOP

- [ ] **Step 1 (controller): the list goes to the owner before anything is ported.** After A1–A4 are merged, `node scripts/parity-check.mjs --release` prints every `MISSING` row. Put them in one table for the owner, in plain words: what the old script did, what the extension does instead (or nothing), whether a user would notice, the size guess, and the controller's recommendation (port now / decide to drop / port after 5.0.0 as a known gap). Then **stop and wait for the owner's answer on every row.** No port is dispatched before it.

  If the list has more than five ports, or any port larger than one task, say so at the top and ask the owner to choose between (a) porting all of them and releasing later, and (b) releasing 5.0.0 with the chosen rows recorded as known gaps. A known gap is still an owner decision: it gets a line in `DECISIONS.md` ("not in 5.0.0, planned"), its row becomes `dropped` citing it, and the CHANGELOG's "Not in the extension yet" list names it.

- [ ] **Step 2 (controller): act on each answer.**
  1. **Port it.** One agent per port, in its own worktree. Two run at once only if they touch different code files. Brief: the userscript lines; the test to write first (the behaviour, in the module's existing test file); if the code is ported text, the `scripts/port/*.mjs` config it extends (`node scripts/port-check.mjs --print <name>` gives the starting text; a new region takes lines out of the inventory, so the pinned count and hash in `tests/parity-check.test.ts` change: the agent says in its report which lines moved and leaves the two numbers alone on its branch if another port is running, since the hash depends on every port's regions together); the new string pairs **in its report**, not in `extension-only.mjs`; the text of a README item if the feature can be seen. After each merge the controller registers the strings, sets the row to `same` with its `home` and proof, **recomputes the pinned inventory count and hash** (run the test, read the new numbers from its failure, check that the lines that left are the port's new regions, update both) and runs `npm run check`.
  2. **Drop it, or leave it as a known gap.** The controller adds the line to `DECISIONS.md` under `## Phase 5` (`- **P5-row-<n>** <date>: <the owner's words>`), sets the row to `dropped` citing `decision: P5-row-<n>` (for a known gap the row's `note` **starts with "not in 5.0.0, planned"**, so the list the owner reads for item 81 tells "gone for good" from "comes later"), and adds the strings to `dropped.mjs` if `ui-check --coverage` then asks for them.
  3. **Already decided.** The agent's note names where. The controller checks it, adds the missing `DECISIONS.md` line (or uses a `spec:` / `README:` cite) and fixes the row.

- [ ] **Step 3: gate.** `node scripts/parity-check.mjs` exits 0 with `0 missing`. (`--release` also wants `PARITY.md`, which Z writes in Task 8.)

- [ ] **Step 4: commit** — each port by its agent; the rows, `DECISIONS.md` and string registrations by the controller, one commit per closed row.

---

### Task 4: Update check (spec "Background": built in Phase 5)

**Files:**
- Create: `extension/lib/update-check.ts`, `extension/tests/update-check.test.ts`
- Modify: `extension/entrypoints/background.ts` (after the Auto-pilot block at the end), `extension/entrypoints/sidepanel/shell/Banners.tsx`, `extension/tests/panel-shell.test.tsx`, `extension/tests/background-guards.test.ts` (a `fetch` stub, one behaviour test, one source pin), `extension/scripts/strings/extension-only.mjs`. (`tests/panel-i18n.test.tsx` is Z's: describe the Thai render case in the report.)

**Interfaces:**
- Produces:
  - `UPDATE_KEY = 'updateCheck'`, `UPDATE_ALARM = 'update-check'`
  - `interface UpdateInfo { at: number; latest: string; url: string }` — the last good answer. `latest` is a dotted version without the `v`.
  - `newer(a: string, b: string): boolean` — is version `a` higher than `b`.
  - `checkForUpdate(now?: number, fetchFn?: typeof fetch): Promise<UpdateInfo | null>` — at most one request per 23 h; returns what is stored afterwards.
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
const HOUR = 3600e3;
const DAY = 24 * HOUR;
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

  it('asks once in 23 hours at most', async () => {
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0' });
    await checkForUpdate(NOW, f);
    await checkForUpdate(NOW + 23 * HOUR - 1, f);
    expect(f).toHaveBeenCalledTimes(1);
    // a little under a day: the daily alarm fires 24 h after the last one and must get through
    await checkForUpdate(NOW + 23 * HOUR, f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('sends no cookies and no auth: nothing about the user goes to GitHub', async () => {
    const f = answer({ tag_name: 'v5.1.0', html_url: REL + 'v5.1.0' });
    await checkForUpdate(NOW, f);
    const init = vi.mocked(f).mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(Object.keys(init.headers as object).map((h) => h.toLowerCase())).toEqual(['accept']);
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
// extension for them. About once a day the background asks GitHub for the repo's latest release;
// the side panel shows a banner when its version is above the installed one. Any failure is
// silent, keeps the last good answer, and is tried again a day later (not sooner: call 21).
export const UPDATE_KEY = 'updateCheck';
export const UPDATE_ALARM = 'update-check';
const LATEST = 'https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest';
const RELEASES = 'https://github.com/TAEJK88/youtube-upload-presets/releases/';
// A little under a day: the daily alarm fires 24 h after the last one, and a gate of exactly
// 24 h would skip its call by the milliseconds the last check took.
const GATE = 23 * 3600e3;
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
  // credentials: 'omit' — no cookie for github.com goes along, whatever the user is signed in to.
  const res = await fetchFn(LATEST, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' });
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
  if (old && old.at <= now && now - old.at < GATE) return old;
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

- [ ] **Step 4: Wire it in the background — the test file first, so no test reaches GitHub**

`tests/background-guards.test.ts` runs `background.main!()` in its `beforeEach`. Once the background checks for updates at start, every test in that file would call GitHub with Node's real `fetch`. So, **before** touching `background.ts`:

```ts
// with the file's other consts
const LATEST = 'https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest';
const github = vi.fn(async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }));

// first lines of the existing beforeEach
  github.mockClear();
  vi.stubGlobal('fetch', github);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
```

and `afterEach(() => { vi.unstubAllGlobals(); });` (add `afterEach` to the vitest import). Then the new tests, in that file's style:

```ts
describe('the update check', () => {
  it('asks GitHub once when the background starts, and not again for a second start the same day', async () => {
    await vi.waitFor(() => expect(github).toHaveBeenCalledTimes(1));
    expect(github.mock.calls[0]![0]).toBe(LATEST);
    handlers.clear();
    background.main!(); // the service worker was stopped and started again
    await new Promise((r) => setTimeout(r, 20));
    expect(github).toHaveBeenCalledTimes(1);
  });

  it('is registered at the top level, and is the only user of api.github.com', () => {
    const src = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/^  registerUpdateCheck\(\);$/m); // two spaces: defineBackground's own body, not a callback
    // (walk lib/, entrypoints/ and components/ with readdirSync, as scripts/ui-check.mjs does)
    // every file containing 'api.github.com' must be lib/update-check.ts
  });
});
```

Write the walk in the second test out in full (a recursive `readdirSync` over the three folders; expect the list of files containing `api.github.com` to equal `['lib/update-check.ts']`).

Run: `npx vitest run tests/background-guards.test.ts` — Expected: the first new test FAILS (0 calls), the second fails on the missing line; every older test still passes.

Then `entrypoints/background.ts`: add `import { checkForUpdate, registerUpdateCheck } from '@/lib/update-check';` and, after the Auto-pilot block at the end of `defineBackground`:

```ts
  // Update check (spec "Background"): a daily alarm, and each time the service worker starts
  // (which is many times a day; lib/update-check.ts lets one request through in 23 h).
  registerUpdateCheck();
  void ready.then(() => checkForUpdate()).catch((e) => console.warn('[ytup] update check', e));
```

Run the file again — Expected: PASS. Check that no other test file starts the background: `grep -ln "entrypoints/background'" tests`; any that does gets the same stub.

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

- [ ] **Step 7: Thai — for Z.** `tests/panel-i18n.test.tsx` is Z's file. In the report, describe the case Z adds: store `updateCheck: { at: 1, latest: '9.9.9', url: 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/v9.9.9' }`, render the panel in Thai, expect `มีเวอร์ชันใหม่` and no English leak. Until then, render `<Banners />` in Thai once by hand in a scratch test and confirm both strings are Thai.

- [ ] **Step 8: Verify and commit**

Run: `npm run check && npm run build`, then confirm the manifest is unchanged: `node -e "const m=require('./.output/chrome-mv3/manifest.json');console.log(m.permissions.join(), m.host_permissions.join())"`
Expected: `sidePanel,storage,unlimitedStorage,alarms,notifications https://studio.youtube.com/*,https://www.youtube.com/*,https://api.github.com/*`

```bash
git add extension/lib/update-check.ts extension/tests/update-check.test.ts extension/entrypoints/background.ts extension/entrypoints/sidepanel/shell/Banners.tsx extension/tests/panel-shell.test.tsx extension/tests/background-guards.test.ts extension/scripts/strings/extension-only.mjs
git commit -m "Update check: once a day the background asks GitHub for the latest release; the panel shows \"Update available\" with a link when it is above the installed version; every failure is silent and keeps the last good answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The userscript is still active in this tab (call 7 — only if approved)

Both installed is the likeliest cutover mistake. Each has its own storage, so each can have Auto-pilot on and each can start a queue, in the same page. The extension can see the userscript in Studio (its root element is `#ytp-root`, userscript 3192, appended to `body` at 6408); the reverse would need new code in userscript versions people may not update to. So the extension is the one that waits.

**Design: hold the starts and the lock, leave everything else running.**

| Held while `#ytp-root` is in the page | How |
|---|---|
| A queue Start | `queue:preflight` answers `{ error }` (so no summary is shown first) and `queue:start` refuses with the same sentence |
| A trim / ads / Collab run asked from the panel | the three handlers refuse with the sentence |
| Any copyright step that changes pages, whoever started it (a run that began before the userscript's root appeared, an Auto-pilot cycle's trims, a follow-up trim) | the tab's `acquire` for the `claims` job answers `false` without asking the background, so the step waits exactly as it waits for another tab (`claimLock()`, `lib/claims/claims.ts:159`); on the first refusal the tab also releases the `claims` job in case it already held it, so nothing is held from other tabs |

**Not held** (so the tab stays honest and nothing freezes): the 800 ms tick itself (the status card, the worker lease, the ytcfg re-read, "press Save for me" on a manual trim), scans (read-only; an Auto-pilot cycle that comes due still scans and then waits at its first page change), every edit and setting, and **Stop**.

**Cannot be held, and the README says so:** on `www.youtube.com` the userscript shows no element, so its invite accept and channel switch cannot be detected there; both scripts watch those pages (each clicks Accept, which is harmless twice, and each may try the channel switcher). In Studio, manual fill, the quick-action bars and the multi-file intercept also run in both. The banner's instruction (turn the script off) is the fix for all of these.

**Files:**
- Create: `extension/lib/studio/userscript-here.ts`, `extension/tests/userscript-here.test.ts`
- Modify: `extension/lib/messages.ts` (`PROTOCOL` 2 → 3), `extension/lib/studio/queue-view.ts` (`QueueView.userscript`), `extension/entrypoints/studio.content.ts`, `extension/entrypoints/sidepanel/shell/Banners.tsx`, `extension/tests/studio-wiring.test.ts`, `extension/tests/queue-view.test.ts`, `extension/tests/panel-shell.test.tsx`, `extension/scripts/strings/extension-only.mjs`; any test that pins the number 2 for `PROTOCOL` (`grep -rn "proto: 2\|PROTOCOL" tests`)

**Interfaces:**
- Produces: `userscriptHere(doc?: Document): boolean`; `USERSCRIPT_HERE(): string` (a lazy `L()`, as Phase 4's call 23 requires); `heldAcquire(ask: () => Promise<boolean>, here?: () => boolean, said?: (msg: string) => void, release?: () => void): () => Promise<boolean>`; `QueueView.userscript: boolean`; `PROTOCOL = 3`.

**`PROTOCOL` goes to 3 (call 16).** `lib/messages.ts:12-17` says to raise it whenever `QueueView` gains a field. The effect: after this build is loaded, a Studio tab still running the previous build shows "This tab is not connected to the extension yet — reload this tab" until it is reloaded, which the update steps require anyway.

- [ ] **Step 1: Failing tests**

`tests/userscript-here.test.ts`:

```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { heldAcquire, userscriptHere } from '../lib/studio/userscript-here';

afterEach(() => { document.body.innerHTML = ''; });
const addRoot = () => { const r = document.createElement('div'); r.id = 'ytp-root'; document.body.append(r); return r; };

describe('userscriptHere', () => {
  it("is true only while the userscript's root element is in the page", () => {
    expect(userscriptHere()).toBe(false);
    const root = addRoot();
    expect(userscriptHere()).toBe(true);
    root.remove();
    expect(userscriptHere()).toBe(false);
  });
  it("the extension's own elements do not count", () => {
    const qa = document.createElement('div');
    qa.className = 'ytp-qa';
    document.body.append(qa);
    expect(userscriptHere()).toBe(false);
  });
});

describe('heldAcquire', () => {
  it('asks the background as before when the userscript is not there', async () => {
    const ask = vi.fn(async () => true);
    expect(await heldAcquire(ask, () => false)()).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it('answers false without asking while it is there, and says why once per page load', async () => {
    const ask = vi.fn(async () => true);
    const said = vi.fn();
    let here = true;
    const acquire = heldAcquire(ask, () => here, said);
    expect(await acquire()).toBe(false);
    expect(await acquire()).toBe(false);
    expect(ask).not.toHaveBeenCalled(); // the lock is not asked for
    expect(said).toHaveBeenCalledTimes(1);
    here = false; await acquire(); here = true; await acquire(); // gone and back: not said again on this page
    expect(said).toHaveBeenCalledTimes(1);
  });
  // R1: claimLock() takes a refusal as "not mine" and never lets go by itself (settleLock returns
  // on !lockMine). A tab that held the lock when the userscript appeared would keep it until closed.
  it('a tab that held the lock lets it go on the first refusal, once', async () => {
    let here = true;
    const release = vi.fn();
    const acquire = heldAcquire(async () => true, () => here, () => {}, release);
    await acquire();
    await acquire();
    await acquire();
    expect(release).toHaveBeenCalledTimes(1);
    here = false; // the script was turned off: the lock is asked for and taken again
    expect(await acquire()).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    here = true; // and on again: let go again
    await acquire();
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('asks again as soon as the userscript is gone', async () => {
    let here = true;
    const ask = vi.fn(async () => true);
    const acquire = heldAcquire(ask, () => here, () => {});
    expect(await acquire()).toBe(false);
    here = false;
    expect(await acquire()).toBe(true);
  });
});
```

In `tests/queue-view.test.ts`: `queueView(…).userscript` is `true` with `#ytp-root` in the document and `false` without (build the view as that file's other tests do; if the file runs without a DOM, give `queueView` the flag through the same seam it uses for other page reads, and test the seam).

In `tests/panel-shell.test.tsx`: with a view whose `userscript` is `true`, `<Banners />` shows the sentence; without, it doesn't. (Read `fakePanel` and `viewWith` in `tests/panel-fake.tsx` for how a test sets the view; the code wins.)

In `tests/studio-wiring.test.ts` (source pins of the content script, in that file's style):

```ts
  // Call 7: while the Tampermonkey userscript is in the page this tab starts nothing. The
  // behaviour of each guard is tested in userscript-here.test.ts; these pin that it is applied.
  it('holds every start while the userscript is in the page', () => {
    expect(studio).toMatch(/onMessage\('queue:preflight', \(\) => \(userscriptHere\(\) \? \{ error: USERSCRIPT_HERE\(\) \} : startSummary\(\)\)\)/);
    expect(studio).toMatch(/onMessage\('queue:start', \(\{ data: seen \}\) => \{\s*if \(userscriptHere\(\)\) return void ui\.toast\(USERSCRIPT_HERE\(\)\);/);
    for (const m of ['trim', 'ads', 'collab']) expect(studio).toMatch(new RegExp(`onMessage\\('claims:${m}', \\(\\{ data \\}\\) => unlessUserscript\\(`));
    expect(studio).toMatch(/acquire: heldAcquire\(\(\) => sendMessage\('runner:acquire', 'claims'\), userscriptHere, \(m\) => ui\.toast\(m\), releaseClaims\)/);
    expect(studio).toMatch(/release: releaseClaims,/); // the same release the copyright module itself uses
  });
  it('holds neither the tick, nor a scan, nor Stop', () => {
    expect(studio).toMatch(/^\s*claims\.tick\(\);$/m); // unconditional
    expect(studio).toMatch(/onMessage\('claims:scan', \(\{ data \}\) => void claims\.scan\(data\)\)/);
    expect(studio).toMatch(/onMessage\('claims:stop', \(\) => stopAll\(\)\)/);
    expect(studio).toMatch(/onMessage\('queue:stop', \(\) => \{\s*stopQueue\(\);/);
  });
  it('tells the panel when the userscript appears or goes', () => {
    expect(studio).toMatch(/if \(userscriptHere\(\) !== userscriptSeen\) \{\s*userscriptSeen = !userscriptSeen;\s*ui\.schedule\(\);/);
  });
```

Run them — Expected: FAIL (module missing; `userscript` undefined; no such text; the pins don't match).

- [ ] **Step 2: Implement**

`lib/studio/userscript-here.ts`:

```ts
import { L } from '../i18n';

// The Tampermonkey userscript and the extension must not both drive one Studio page: each has
// its own queue and its own Auto-pilot. The userscript's root element is #ytp-root (user.js
// 3192). While it is in the page this tab starts no upload and no copyright run, and takes the
// automation lock for no copyright step; scans, the status and Stop go on (call 7).
export const userscriptHere = (doc: Document = document): boolean => !!doc.getElementById('ytp-root');
export const USERSCRIPT_HERE = () => L(
  'สคริปต์ Tampermonkey ยังเปิดอยู่ในแท็บนี้ — ปิดใน Tampermonkey แล้วโหลดแท็บนี้ใหม่ การอัปโหลด การตัด และ Auto-pilot จะรอจนกว่าจะปิด',
  'The Tampermonkey script is still on in this tab — turn it off in Tampermonkey, then reload this tab. Uploads, trims and Auto-pilot wait until then');

// The copyright module's way to the automation lock (setClaimsLock's `acquire`). Refused here,
// a step waits as it waits for another tab; the background is not asked. claimLock() takes a
// refusal as "the lock is not mine" and then never releases it, so a tab that already held the
// lock (a run begun before the userscript's root appeared, or kept across a reload) lets it go
// here, once per time the userscript is there. `said` tells the page why, once per page load.
export function heldAcquire(
  ask: () => Promise<boolean>, here: () => boolean = userscriptHere,
  said: (msg: string) => void = () => {}, release: () => void = () => {},
): () => Promise<boolean> {
  let held = false;
  let told = false;
  return async () => {
    if (!here()) { held = false; return ask(); }
    if (!held) { held = true; release(); }
    if (!told) { told = true; said(USERSCRIPT_HERE()); }
    return false;
  };
}
```

Register the pair under `// 5 G (userscript in the tab)` with `why: 'cutover: the userscript and the extension would both automate the page'`.

`lib/messages.ts`: `export const PROTOCOL = 3;`. Update every test that writes the number (`grep -rn "proto: 2" tests`): those that mean "this build" should use the constant.

`lib/studio/queue-view.ts`: `userscript: boolean; // the Tampermonkey userscript is active in this page (call 7)` in `QueueView`, and `userscript: userscriptHere()` where the view object is built.

`entrypoints/studio.content.ts` (five places; the pins in Step 1 give the exact text):

```ts
    // above setClaimsLock: one release for both users
    const releaseClaims = () => void sendMessage('runner:release', 'claims').catch(() => {});
    // in setClaimsLock({ … })
      acquire: heldAcquire(() => sendMessage('runner:acquire', 'claims'), userscriptHere, (m) => ui.toast(m), releaseClaims),
      release: releaseClaims,
```

```ts
    // a run asked from the panel: refused with the reason (call 7)
    const unlessUserscript = <T,>(run: () => T) => (userscriptHere() ? void ui.toast(USERSCRIPT_HERE()) : run());
    onMessage('claims:trim', ({ data }) => unlessUserscript(() => trimFromPanel(data)));
    onMessage('claims:ads', ({ data }) => unlessUserscript(() => adsFromPanel(data)));
    onMessage('claims:collab', ({ data }) => unlessUserscript(() => collabFromPanel(data)));
```

```ts
    onMessage('queue:preflight', () => (userscriptHere() ? { error: USERSCRIPT_HERE() } : startSummary()));
    onMessage('queue:start', ({ data: seen }) => {
      if (userscriptHere()) return void ui.toast(USERSCRIPT_HERE());
      if (!isStartBinding(seen)) return;
```

```ts
    // in the 800 ms interval, before lockFollower.tick(): the userscript appends its root after
    // this script may have answered a first queue:view; a change is told to the panel at once.
      if (userscriptHere() !== userscriptSeen) {
        userscriptSeen = !userscriptSeen;
        ui.schedule();
      }
```

with `let userscriptSeen = false;` declared beside the interval. `ui.schedule()` (`lib/studio/content-ui.ts`) raises `rev` and broadcasts `queue:state`, which makes the panel ask for `queue:view` again. Check in `lib/messages.ts` what the three `claims:*` messages are declared to return; all three are fire-and-forget today (`void`), and if one returns a value, return that type's "nothing started" value from `unlessUserscript`. `{ error: string }` is already in `queue:preflight`'s return type (`lib/messages.ts:61`), and the panel already shows it as a toast instead of a summary; confirm in `lib/panel/start.ts` and add a `panel-queue` test if no test covers an `{ error }` answer.

`Banners.tsx`, first in the fragment (it explains why Start does nothing):

```tsx
      {view?.userscript && <Banner icon="alert" text={USERSCRIPT_HERE()} />}
```

(`alert` is in `lib/studio/dom.ts` `ICONS`.)

- [ ] **Step 3: While held, a scan's end and a Stop still reach the panel (tests).** In `tests/claims-runs.test.ts` (or the file where the lock glue is tested: `grep -ln "setClaimsLock" tests`), with `setClaimsLock({ acquire: heldAcquire(ask, () => true, () => {}, release), release, holds: async () => true, … })` (`holds` answers `true`: this tab held the lock when the page loaded, which is what `initClaimsLock` then believes):
  1. start a scan with the fake youtubei answers that file already uses, run the ticks, and expect the status to reach "Scan complete" and the `claims:state` broadcast to carry it;
  2. with an active trim run stored, tick several times: the step's stage is the lock-wait line, `ask` was never called, no `location.href` change was made, and **`release` was called exactly once** (R1: the lock this tab held is given back, so other tabs are not kept waiting); then `stopAll()`: the run is inactive, "You stopped it" is logged, and the follow-ups are cancelled.

- [ ] **Step 4: Remove each guard in turn and see a test fail** (six mutants: preflight, start, the three run handlers as one, `heldAcquire`'s refusal, its release, the rev bump). List them in the report.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run build` — Expected: green. Give Z the Thai render case for `tests/panel-i18n.test.tsx` in the report (a view with `userscript: true`; expect `สคริปต์ Tampermonkey ยังเปิดอยู่`).

```bash
git add extension/lib/studio/userscript-here.ts extension/tests/userscript-here.test.ts extension/lib/messages.ts extension/lib/studio/queue-view.ts extension/entrypoints/studio.content.ts extension/entrypoints/sidepanel/shell/Banners.tsx extension/tests extension/scripts/strings/extension-only.mjs
git commit -m "While the Tampermonkey userscript is active in a Studio tab the extension starts no upload and no copyright run there and takes the lock for no copyright step; scans, the status and Stop go on; the panel says why (PROTOCOL 3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The move file, extension side (call 8 — only if approved)

The userscript's backup was made to be shared, so it leaves out what is personal: upload history, the channel list, the language. A teammate who moves loses the "already uploaded" warning for everything uploaded before, and Fix tracklist loses the tracklists of older videos. The last userscript version gets a second export, "everything for the extension" (Task 11 Step 5): the same format-1 file with one extra field. The extension reads that field only on **My file**.

Per-channel copyright data still starts fresh, and the claimed-songs history still moves by CSV: the owner decided both on 2026-10-10 (`DECISIONS.md` P4-4).

```json
{ "app": "yt-upload-presets", "format": 1, "version": "4.29.0", "presets": [], "activeId": "…", "counters": {}, "settings": {}, "claimsCfg": {},
  "move": { "lang": "th", "uploads": [ { "date": "…", "channel": "UC…", "videoId": "", "title": "…", "file": "Clip 1.mp4", "size": 123 } ], "channels": [ { "id": "UC…", "name": "…", "avatar": "https://…", "handle": "@…" } ] } }
```

**What an upload-history row is for decides what a valid row is (call 19).** The "already uploaded" warning matches on **file name, size and channel** (userscript 1809), and the userscript logs `videoId: it.draftId || ''` (2055), so a row with an empty video id is normal and must be kept. A row needs a date, a channel and a file name. Two rows are the same upload when they have the same video id, or, without one, the same date, channel, file and size.

**Files:**
- Modify: `extension/lib/backup.ts` (`BackupWrites`, `applyBackup`, new `cleanUploads`, `cleanChannels`, `movePreview`), `extension/lib/store-writer.ts:84` (hand `applyBackup` the stored `uploads` and `channels`), `extension/entrypoints/sidepanel/tabs/SettingsTab.tsx:108-130` (the import question), `extension/tests/backup.test.ts`, `extension/tests/store-writer.test.ts`, `extension/tests/panel-backup.test.ts`, `extension/scripts/strings/extension-only.mjs` (under `// 5 M`)

**Interfaces:**
- Consumes: `UploadRecord` (`lib/studio/queue-runner.ts:30`), `StoredChannel` (`lib/studio/channels.ts:9`), `isChannelId` (`lib/claims/keys.ts`).
- Produces: `applyBackup(data, presets, own, cur)` where `cur` gains optional `uploads?: UploadRecord[]` and `channels?: StoredChannel[]`; `BackupWrites` gains optional `uploads` and `channels`; `movePreview(data): { uploads: number; channels: number; lang: 'th' | 'en' | null } | null` (what of the file's move part would pass the cleaning; `null` without one). Without `data.move`, or with `own === false`, `applyBackup`'s result is exactly what it is today.

- [ ] **Step 1: Failing tests** (in `tests/backup.test.ts`, a new `describe('the move file', …)`; add `movePreview` to the import)

```ts
  const up = (file: string, date: string, over: Record<string, unknown> = {}) =>
    ({ date, channel: 'UC1', channelName: 'One', videoId: '', title: 'T ' + file, file, size: 10, txt: '', description: '', publishAt: null, visibility: 'PUBLIC', ...over });
  const move = (m: Record<string, unknown>) => {
    const r = parseBackup(exported({ move: m }));
    if (!r.ok) throw new Error('fixture');
    return r;
  };

  it('my file: upload history is added to what is there, newest first, 1000 at most', () => {
    const r = move({ uploads: [up('b.mp4', '2026-10-02T00:00:00.000Z'), up('a.mp4', '2026-10-01T00:00:00.000Z')] });
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: [up('c.mp4', '2026-10-03T00:00:00.000Z')] as never });
    expect(w.uploads!.map((u) => u.file)).toEqual(['c.mp4', 'b.mp4', 'a.mp4']);
    const many = move({ uploads: Array.from({ length: 1200 }, (_, i) => up(`v${i}.mp4`, new Date(Date.UTC(2020, 0, 1) + i * 1000).toISOString())) });
    expect(applyBackup(many.data, many.presets, true, cur()).uploads).toHaveLength(1000);
  });

  it('a row without a video id is kept: the "already uploaded" warning goes by file, size and channel', () => {
    const r = move({ uploads: [up('a.mp4', '2026-10-01T00:00:00.000Z', { videoId: '' })] });
    expect(applyBackup(r.data, r.presets, true, cur()).uploads).toEqual([up('a.mp4', '2026-10-01T00:00:00.000Z')]);
  });

  it('the same upload is taken once: by video id when it has one, otherwise by date, channel, file and size', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ uploads: [
      up('a.mp4', d, { videoId: 'vidA', title: 'from the file' }), // same video id as a stored row
      up('b.mp4', d),                                              // same date, channel, file, size as a stored row
      up('b.mp4', d, { size: 11 }),                                // another size: another upload
      up('b.mp4', d, { channel: 'UC2' }),                          // another channel: another upload
      up('c.mp4', d), up('c.mp4', d),                              // twice in the file
    ] });
    const have = [up('a-renamed.mp4', d, { videoId: 'vidA', title: 'already here' }), up('b.mp4', d)];
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: have as never });
    expect(w.uploads).toHaveLength(5);
    expect(w.uploads!.find((u) => u.videoId === 'vidA')!.title).toBe('already here'); // what is stored wins
    expect(w.uploads!.filter((u) => u.file === 'b.mp4')).toHaveLength(3);
    expect(w.uploads!.filter((u) => u.file === 'c.mp4')).toHaveLength(1);
  });

  it('a row that is not an upload record is left out, and odd fields are made safe', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ uploads: [up('ok.mp4', d, { size: 'big', publishAt: 'soon', extra: { x: 1 }, videoId: 7 }), { videoId: 'x' }, null, 'x', up('', d), up('nodate.mp4', ''), up('nochannel.mp4', d, { channel: '' })] });
    const w = applyBackup(r.data, r.presets, true, cur());
    expect(w.uploads).toEqual([up('ok.mp4', d, { size: 0 })]);
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
    const r = move({ lang: 'th', uploads: [up('a.mp4', '2026-10-01T00:00:00.000Z')], channels: [{ id: 'UC2', name: 'Two', avatar: '', handle: '' }] });
    const w = applyBackup(r.data, r.presets, false, cur());
    expect(w.uploads).toBeUndefined();
    expect(w.channels).toBeUndefined();
    expect(w.settings?.lang).toBe('en');
  });

  it('a file without a move part writes neither key', () => {
    const r = parseBackup(exported());
    if (!r.ok) throw new Error('fixture');
    const w = applyBackup(r.data, r.presets, true, { ...cur(), uploads: [up('c.mp4', '2026-10-03T00:00:00.000Z')] as never });
    expect('uploads' in w).toBe(false);
    expect('channels' in w).toBe(false);
    expect(movePreview(r.data)).toBeNull();
  });

  it('the preview counts what would be imported, not what the file holds', () => {
    const d = '2026-10-01T00:00:00.000Z';
    const r = move({ lang: 'th', uploads: [up('a.mp4', d), up('a.mp4', d), null, up('', d)], channels: [{ id: 'UC2', name: 'Two' }, { id: 'bad id!' }] });
    expect(movePreview(r.data)).toEqual({ uploads: 1, channels: 1, lang: 'th' });
    expect(movePreview(move({ lang: 'fr' }).data)).toEqual({ uploads: 0, channels: 0, lang: null });
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
// A row needs a date, a channel and a file name: the "already uploaded" warning goes by file,
// size and channel (user.js 1809), and a row's video id is often '' (2055). The same upload is
// taken once: by video id when it has one, otherwise by date, channel, file and size. Rows
// already stored win.
const uploadKey = (u: { videoId: string; date: string; channel: string; file: string; size: number }) =>
  (u.videoId ? 'v:' + u.videoId : `f:${u.date}|${u.channel}|${u.file}|${u.size}`);
export function cleanUploads(list: unknown, have: UploadRecord[] = []): UploadRecord[] {
  const seen = new Set(have.map(uploadKey));
  const out = [...have];
  for (const u of Array.isArray(list) ? list : []) {
    if (!isObj(u) || !str(u.date) || !str(u.channel) || !str(u.file)) continue;
    const row: UploadRecord = {
      date: str(u.date), channel: str(u.channel), channelName: str(u.channelName), videoId: str(u.videoId), title: str(u.title),
      file: str(u.file), size: Number.isFinite(u.size) ? (u.size as number) : 0, txt: str(u.txt), description: str(u.description),
      publishAt: Number.isFinite(u.publishAt) ? (u.publishAt as number) : null, visibility: str(u.visibility),
    };
    if (seen.has(uploadKey(row))) continue;
    seen.add(uploadKey(row));
    out.push(row);
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

// What the import question tells the user about a move file: what would pass the cleaning.
export function movePreview(data: Record<string, unknown>): { uploads: number; channels: number; lang: 'th' | 'en' | null } | null {
  if (!isObj(data.move)) return null;
  const m = data.move;
  return { uploads: cleanUploads(m.uploads).length, channels: cleanChannels(m.channels).length, lang: m.lang === 'th' || m.lang === 'en' ? m.lang : null };
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

Reword the comment above `applyBackup` ("lang is always the current one…") to add "except from the move part of the user's own file (call 18)". Both new imports are `import type` or pure (`isChannelId` is a regex test): check after `npm run build` that the background script did not grow by page code.

`lib/store-writer.ts`, inside `writeBackupInOrder`'s `serial`:

```ts
    const cur = {
      settings: await loadSettings(), cfg: await load<Record<string, unknown>>('cfg', {}),
      uploads: await load<UploadRecord[]>('uploads', []), channels: await load<StoredChannel[]>('channels', []),
    };
```

`writeBackup` already writes every defined key of `BackupWrites`; Studio tabs follow `uploads` and `channels` through `STATE_KEYS` (`lib/studio/state.ts:16`), and an import is refused during a run. The language goes through `settings`, which every context follows (`watchLang`).

Run the two test files — Expected: PASS.

- [ ] **Step 3: The import question tells the truth about a move file — tests first**

Today the question says "Existing presets and settings on this device will be replaced (locked channel and language stay unchanged)." (`SettingsTab.tsx:120`). For a move file with a language that is false. Register under `// 5 M (move file)`:

```js
  { th: 'พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้ไม่เปลี่ยน)', en: 'Existing presets and settings on this device will be replaced (the locked channel stays unchanged).', why: "the import question for a move file that carries a language: the userscript's sentence also promised the language stays" },
  { th: 'เมื่อเลือก "ไฟล์ของฉัน" ไฟล์นี้จะเพิ่มประวัติการอัปโหลด ${} รายการ และช่อง ${} ช่องจากสคริปต์ Tampermonkey', en: 'With "My file" this file also adds ${} upload history rows and ${} channels from the Tampermonkey script', why: "the last userscript's move export carries personal data the shared backup never did" },
  { th: 'และเปลี่ยนภาษาของแผงเป็น ${}', en: 'and sets the panel\'s language to ${}', why: 'the move file carries the language the userscript was in (call 18)' },
```

In `tests/panel-backup.test.ts` (that file's style; read how it drives the import and the `ask` dialog):

1. Importing a move file whose `move` holds 2 valid rows, 1 invalid row, 1 valid channel and `lang: 'th'` shows the new first sentence, "With "My file" this file also adds 2 upload history rows and 1 channels from the Tampermonkey script" and "and sets the panel's language to ไทย", and does **not** show "language stay unchanged".
2. A move file without a usable `lang` keeps today's first sentence (the language does stay) and shows the counts line without the language part.
3. A plain backup shows today's sentence and no move line.

Implement in `doImport`: `const preview = movePreview(step.data);` and the conditional lines in the dialog body. The language names are the ones the language setting already shows (`ไทย` / `English`; find them in `SettingsTab.tsx`).

A second import of the same move file adds nothing twice and sets the language to the file's again; the README says so (Task 8). An import, move file or not, replaces presets, settings and EP numbers with the file's, as it always did. Give Z the Thai render case for `tests/panel-i18n.test.tsx` in the report (the import question with a move file).

- [ ] **Step 4: Verify and commit**

Run: `npm run check && npm run build` — Expected: green.

```bash
git add extension/lib/backup.ts extension/lib/store-writer.ts extension/entrypoints/sidepanel/tabs/SettingsTab.tsx extension/tests/backup.test.ts extension/tests/store-writer.test.ts extension/tests/panel-backup.test.ts extension/scripts/strings/extension-only.mjs
git commit -m "Import: a move file from the last userscript version adds its upload history (rows without a video id too), channel list and language, from the user's own file only; the question says what comes along

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Packaging

**Files:**
- Modify: `extension/wxt.config.ts` (call 5 only)
- Create (call 6 only): `extension/public/icon/{16,32,48,128}.png`; modify `extension/lib/notify.ts`, `extension/lib/claims/alarms.ts`, `extension/tests/notify.test.ts`, `extension/tests/claims-alarms.test.ts`
- Create: `extension/scripts/release-check.mjs`, `extension/tests/release-check.test.ts`

**Interfaces:**
- Produces: `npm run release:check` — builds, zips, inspects, runs the parity release check; prints the zip's path and sha256, a **content hash** of the build's files, and the commands the owner runs in Task 10. It never pushes, tags or calls GitHub.
- `inspect(files: string[], manifest: object, pkgVersion: string, opts?: { key?: boolean; icons?: boolean }): string[]` — problems with a build's file list and manifest.
- `contentHash(entries: { path: string; sha256: string }[]): { lines: string[]; hash: string }` — one hash for what is in the build, whatever the zip's timestamps.

**Both branches of call 5 are written here.** Steps 3–6 are the same either way; Step 1 has an A (key approved) and a B (declined).

- [ ] **Step 1A (call 5 approved): a stable extension id — the OWNER makes the key**

An unpacked extension's id is a hash of its folder's path unless the manifest has a `key`. Storage and the queued file handles belong to the id.

The key is a public/private pair. **Only the public half goes in the manifest. The private half is generated and kept by the owner: never by an agent, never in the repo, never in a scratch folder.** An unpacked extension never needs the private half again; it would matter only if the same id were ever wanted for a packed `.crx`.

1. **[owner]** In a folder of their own (not the repo), the owner runs:

```sh
openssl genrsa -out ytup-extension-key.pem 2048
openssl rsa -in ytup-extension-key.pem -pubout -outform DER | openssl base64 -A; echo
```

   and gives the controller **the one long line the second command prints** (the public key). The `.pem` file stays with the owner: stored somewhere safe, or deleted. (The plan asks the owner to choose in open question 13; deleting is fine.)
2. **[agent]** `wxt.config.ts`, first line of `manifest`:

```ts
    // One id on every machine and for every folder the build is unpacked into (README "Update"):
    // without it the id follows the folder's path, and a new folder is a new, empty extension.
    // This is the public half of a key pair; the private half is the owner's and is not in the repo.
    key: '<the line the owner gave>',
```

3. **[agent]** The id that key gives, computed from the public key alone, for the README, the CHANGELOG and the debug page's address:

```sh
node -e "const c=require('crypto');const k=process.argv[1];const h=c.createHash('sha256').update(Buffer.from(k,'base64')).digest('hex').slice(0,32);console.log([...h].map(x=>'abcdefghijklmnop'[parseInt(x,16)]).join(''))" '<the line the owner gave>'
```

4. **[agent]** `npm run build`, then `node -e "console.log(typeof require('./.output/chrome-mv3/manifest.json').key)"` — Expected: `string`. `npm run check` — Expected: green (if a test pins the manifest's exact keys, add `key` there).

**The owner's own copy.** The key changes the id of every copy already installed; today that is the owner's. Data stays under the old id and the keyed build starts empty. The extension's own export carries presets, settings, EP numbers and the copyright settings. It does **not** carry: upload history, the channel list, the queue, claim scans, trim results, the trim list, pending follow-up trims, Auto-pilot on/off (the claimed-songs history has its CSV). So the owner moves like this, with a way back at every step:

1. In the old copy: let the upload queue and any trim "waiting for YouTube to process" finish; turn Auto-pilot off on every channel; Settings → Back up / share settings → **Export (.json)**; Copyright → Claimed songs → **⬇ CSV**; Copyright → **Upload history** CSV (a record only: it cannot be imported). Settings → Troubleshooting → Open debug page → **Download report (.json)**: that file holds every stored key, upload history and channel list included.
2. `chrome://extensions`: switch the old copy **off** with its toggle. Do **not** press Remove: switched off, it keeps its data.
3. **Load unpacked** the keyed build from a **new folder** beside the old one. Check that its id is the one Step 1A.3 printed.
4. Import the `.json` as **My file**, import the songs CSV, scan each channel, turn Auto-pilot on again.
5. Upload history and the channel list, if wanted: the controller prepares, from the debug report, a two-line snippet for the new copy's service worker console (`chrome.storage.local.set({ uploads: …, channels: … })`). The channel list also rebuilds itself as each channel is opened in Studio.
6. Only when everything is there: **Remove** the old copy and delete its folder. If anything is wrong before that: switch the new copy off and the old one on again.

When to do it is the owner's choice (open question 14): now, so the Phase 5 checks run on the final id, or at the release.

- [ ] **Step 1B (call 5 declined): no key**

Nothing in `wxt.config.ts` changes. The plan still works, with these differences, which Z writes into the docs:

1. README "Update" keeps its rule and says why in stronger words: "Always put the new files into the **same folder, in the same place**. If you load the extension from a different folder, Chrome treats it as a new, empty extension: your presets, queue and history stay with the old one, and both run until you remove one."
2. README item 75 drops "the id is the same on every machine"; item 76's second-folder check expects two copies, and tells the tester to remove the second.
3. The debug page's address differs per machine (the README already says where to find the id).
4. `release-check` sees no `key:` line and expects no `key` in the manifest; it fails if one appears.
5. `DECISIONS.md` gets `- **P5-5** <date>: no manifest key; the id follows the folder.`

- [ ] **Step 2 (call 6 approved): icons**

WXT turns `public/icon/<size>.png` into the manifest's `icons` and the toolbar icon. The artwork is the owner's (open question 5): a square PNG of at least 128 px. Make the four sizes with `sips -z 16 16 src.png --out public/icon/16.png` (and 32, 48, 128), and commit them (an untracked file under `public/` fails the release check).

The desktop notifications' icon changes with it. Test first: in `tests/notify.test.ts` and `tests/claims-alarms.test.ts`, the expected `iconUrl` becomes a string ending `/icon/128.png`; run and see them fail. Then `lib/notify.ts`: `NOTIFY_ICON` becomes `export const notifyIcon = () => browser.runtime.getURL('/icon/128.png' as never);` and both callers (`notifyQueueDone`, and `notifyAutopilotDue` in `lib/claims/alarms.ts`) call it; remove the base64 red dot and its comment. With call 6 declined this step is skipped whole: the release ships with Chrome's letter tile and the red dot.

- [ ] **Step 3: Failing test for the release check**

`tests/release-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script
import { contentHash, inspect } from '../scripts/release-check.mjs';

const manifest = {
  manifest_version: 3, version: '5.0.0',
  permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'],
  host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
  web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
};
const files = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js', 'chunks/a.js', 'assets/a.woff2'];
const icons = ['icon/16.png', 'icon/32.png', 'icon/48.png', 'icon/128.png'];

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
    for (const bad of ['chunks/a.js.map', '.vitest/x', '.claude/settings.json', 'tests/a.test.ts', 'stats.html', '.DS_Store', 'node_modules/x/index.js', 'ytup-extension-key.pem']) {
      expect(inspect([...files, bad], manifest, '5.0.0').join('\n'), bad).toContain(bad);
    }
  });
  it('names a file the extension needs that is not there', () => {
    for (const need of ['manifest.json', 'background.js', 'sidepanel.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt', 'content-scripts/studio.js']) {
      expect(inspect(files.filter((f) => f !== need), manifest, '5.0.0').join('\n'), need).toContain(need);
    }
  });
  it('the key: there when the config sets one, absent when it does not', () => {
    expect(inspect(files, manifest, '5.0.0', { key: true }).join('\n')).toMatch(/no key/);
    expect(inspect(files, { ...manifest, key: 'MIIB…' }, '5.0.0', { key: true })).toEqual([]);
    expect(inspect(files, { ...manifest, key: 'MIIB…' }, '5.0.0').join('\n')).toMatch(/has a key/);
  });
  it('the icons: all four sizes when public/icon/ has them, none otherwise', () => {
    const withIcons = { ...manifest, icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' } };
    expect(inspect([...files, ...icons], withIcons, '5.0.0', { icons: true })).toEqual([]);
    expect(inspect(files, manifest, '5.0.0', { icons: true }).join('\n')).toMatch(/manifest icons/);
    expect(inspect([...files, 'icon/16.png'], { ...manifest, icons: { 16: 'icon/16.png' } }, '5.0.0').join('\n')).toMatch(/not complete/);
  });
  it('the content hash depends on the files, not on their order', () => {
    const a = contentHash([{ path: 'b', sha256: '2' }, { path: 'a', sha256: '1' }]);
    expect(a.lines).toEqual(['1  a', '2  b']);
    expect(contentHash([{ path: 'a', sha256: '1' }, { path: 'b', sha256: '2' }]).hash).toBe(a.hash);
    expect(contentHash([{ path: 'a', sha256: '1' }, { path: 'b', sha256: '3' }]).hash).not.toBe(a.hash);
  });
});
```

Run: `npx vitest run tests/release-check.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 4: Write `scripts/release-check.mjs`**

```js
// Everything that must be true of the zip the team installs. Builds, zips and looks; publishes
// nothing. `npm run release:check` — run it on a clean tree, at the commit that will be tagged.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PERMS = ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'];
const HOSTS = ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'];
const WAR = [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }];
const NEEDED = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js'];
const BANNED = /(\.map$|\.test\.|^tests\/|(^|\/)\.[^/]+(\/|$)|^node_modules\/|^stats\.html$|\.pem$|\.ts$|\.tsx$)/;
const ICONS = ['16', '32', '48', '128'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// opts.key / opts.icons: what this build is meant to have (calls 5 and 6). Both directions are
// checked: a key or icons that should be there and aren't, and ones that shouldn't and are.
export function inspect(files, manifest, pkgVersion, { key = false, icons = false } = {}) {
  const out = [];
  if (manifest.version !== pkgVersion) out.push(`manifest version ${manifest.version} is not package.json's ${pkgVersion}`);
  if (!same(manifest.permissions, PERMS)) out.push(`permissions are ${JSON.stringify(manifest.permissions)}, expected ${JSON.stringify(PERMS)}`);
  if (!same(manifest.host_permissions, HOSTS)) out.push(`host_permissions are ${JSON.stringify(manifest.host_permissions)}, expected ${JSON.stringify(HOSTS)}`);
  if (!same(manifest.web_accessible_resources, WAR)) out.push(`web_accessible_resources are ${JSON.stringify(manifest.web_accessible_resources)}, expected ${JSON.stringify(WAR)}`);
  if (key !== (typeof manifest.key === 'string')) out.push(key ? 'the manifest has no key: the extension id would follow the folder' : 'the manifest has a key that wxt.config.ts does not set');
  const sizes = Object.keys(manifest.icons ?? {}).sort((a, b) => a - b);
  if (icons && !same(sizes, ICONS)) out.push(`manifest icons are ${JSON.stringify(sizes)}, expected ${JSON.stringify(ICONS)}`);
  if (icons) for (const s of ICONS) if (!files.includes(`icon/${s}.png`)) out.push(`icon/${s}.png is missing from the build`);
  if (!icons && sizes.length) out.push('the manifest has icons but public/icon/ is not complete');
  for (const f of files) if (BANNED.test(f)) out.push(`${f} must not be in the build`);
  for (const f of NEEDED) if (!files.includes(f)) out.push(`${f} is missing from the build`);
  return out;
}

// One hash for what is inside the build, whatever the zip's timestamps: the sha256 of every
// file, by path. Two builds with the same content hash are the same extension.
export function contentHash(entries) {
  const lines = [...entries].sort((a, b) => (a.path < b.path ? -1 : 1)).map((e) => `${e.sha256}  ${e.path}`);
  return { lines, hash: createHash('sha256').update(lines.join('\n')).digest('hex') };
}

const walk = (dir, root = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split(sep).join('/')]);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: EXT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function main() {
  const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf8'));
  const problems = [];
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no', '--', '.']).trim();
  if (dirty) problems.push('the working tree has uncommitted changes under extension/:\n' + dirty);
  // public/ is copied into the build as it is: an untracked file there would ship.
  const stray = run('git', ['ls-files', '--others', '--exclude-standard', '--', 'public']).trim();
  if (stray) problems.push('untracked files under public/ would be zipped:\n' + stray);
  run('npx', ['wxt', 'zip']); // builds first
  const out = join(EXT, '.output/chrome-mv3');
  const zip = join(EXT, `.output/${pkg.name}-${pkg.version}-chrome.zip`);
  const files = walk(out).sort();
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  problems.push(...inspect(files, manifest, pkg.version, {
    key: /^\s*key:/m.test(readFileSync(join(EXT, 'wxt.config.ts'), 'utf8')), // a line of its own: not `suggested_key:`
    icons: ICONS.every((s) => existsSync(join(EXT, `public/icon/${s}.png`))),
  }));
  const zipped = run('unzip', ['-Z1', zip]).split('\n').filter((l) => l && !l.endsWith('/')).sort();
  if (!same(zipped, files)) problems.push('the zip does not hold exactly the build folder\'s files');
  const log = join(EXT, 'CHANGELOG.md');
  if (!existsSync(log) || !readFileSync(log, 'utf8').includes(`## ${pkg.version} `)) problems.push(`CHANGELOG.md has no "## ${pkg.version} " section`);
  try { run('node', ['scripts/parity-check.mjs', '--release']); } catch { problems.push('parity-check --release failed (see above)'); }
  if (problems.length) {
    console.error(`release-check: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  const content = contentHash(files.map((f) => ({ path: f, sha256: sha(join(out, f)) })));
  writeFileSync(join(EXT, '.output/release-files.txt'), content.lines.join('\n') + '\n');
  console.log([
    `release-check: ok — ${files.length} files, ${(statSync(zip).size / 1024).toFixed(0)} KB`,
    `zip:        ${zip}`,
    `zip sha256: ${sha(zip)}   (changes with every build: a zip stores times)`,
    `content:    ${content.hash}   (the same for two builds of the same source; the list is .output/release-files.txt)`,
    `commit:     ${run('git', ['rev-parse', 'HEAD']).trim()}`,
    '',
    'To publish (the owner runs these; nothing here does):',
    `  git tag v${pkg.version} && git push --dry-run origin v${pkg.version} && git push origin v${pkg.version}`,
    `  gh release create v${pkg.version} "${zip}" --draft --title "v${pkg.version}" --notes-file <the CHANGELOG section saved to a file>`,
    '  then read the draft on GitHub and press Publish.',
  ].join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

Three points of this script exist because of what the code is today: `wxt.config.ts` already contains the text `suggested_key:`, so the key test is a line that **starts** with `key:`; `git status --untracked-files=no` would not see a stray untracked file under `public/`, which the build copies as it is, so those are listed separately; and a zip stores file times, so the zip's own sha256 differs between two builds of the same source, which is why the content hash exists (Task 10 compares it).

Run: `npx vitest run tests/release-check.test.ts` — Expected: PASS (8 tests). (`CHANGELOG.md` and `PARITY.md` are Z's; until they exist `npm run release:check` reports them, which is right.)

- [ ] **Step 5: The licence list, checked once for this release**

As the README's "Licences" section says: temporarily add `build: { sourcemap: true }` to the `vite:` function's return in `wxt.config.ts`, `npm run build`, then

```sh
node -e "const fs=require('fs'),p=require('path');const s=new Set();(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())w(f);else if(f.endsWith('.map'))for(const x of JSON.parse(fs.readFileSync(f,'utf8')).sources){const m=x.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);if(m)s.add(m[m.length-1].slice(13))}}})('.output/chrome-mv3');console.log([...s].sort().join('\n'))"
```

Every package printed must be named in `public/THIRD-PARTY-NOTICES.txt`; add a missing one with its licence text from `node_modules/<pkg>/LICENSE*`. **Revert the `sourcemap` line** and rebuild; `git diff --stat -- wxt.config.ts` must show only Step 1A's change (or nothing).

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm run build` — Expected: green; permissions line as in Task 4 Step 8.

```bash
git add extension/wxt.config.ts extension/public extension/lib/notify.ts extension/lib/claims/alarms.ts extension/scripts/release-check.mjs extension/tests/release-check.test.ts extension/tests/notify.test.ts extension/tests/claims-alarms.test.ts
git commit -m "Packaging: release-check builds and zips, then refuses a wrong version, a changed permission, a stray file, a missing CHANGELOG section or a missing parity row, and prints a content hash of the build; a manifest key gives one extension id for every folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Leave out of the message, and of `git add`, whatever a declined call left unchanged.)

---

### Task 8: README, CHANGELOG, PARITY.md, spec, verification (serial, last agent task)

**Files:**
- Modify: `extension/README.md`, `extension/tests/panel-i18n.test.tsx`, `extension/scripts/parity/DECISIONS.md`, `extension/scripts/parity/rows/*.mjs` (only `readme` numbers for the new items), `docs/superpowers/specs/2026-10-05-chrome-extension-design.md`
- Create: `extension/CHANGELOG.md`, `extension/PARITY.md` (first written here)

- [ ] **Step 1: README title and a section for people who only install it**

Line 1 becomes `# YouTube Upload Presets — Chrome extension`. After the opening paragraph, before "Develop", add (drop the sentences of a declined call; with call 5 declined use Task 7 Step 1B's wording for "Update"):

```markdown
## Install (for the team)

1. Download `youtube-upload-presets-extension-<version>-chrome.zip` from the newest release:
   https://github.com/TAEJK88/youtube-upload-presets/releases/latest
2. Make a folder that will stay where it is, for example `Documents/YouTube Upload Presets`.
   Unzip the file and put **what is inside it** (`manifest.json` and the rest) into that folder.
3. In Chrome open `chrome://extensions`, turn on **Developer mode** (top right), click
   **Load unpacked** and pick that folder.
4. In Tampermonkey, turn the "YouTube Upload Presets" script **off** (don't delete it yet: see
   "Moving from the userscript"). The two must not run together: while the script is on, the
   extension waits and its panel says so.
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

If you used a test build from before 5.0.0: that copy has a different id, and its data does
not follow. Export a backup from it first, load 5.0.0 from a new folder, import, and only then
remove the old copy.
```

(The last paragraph only with call 5 approved; it is the short form of Task 7 Step 1A's procedure, for anyone besides the owner who ran a test build.)

- [ ] **Step 2: "Moving from the userscript" rewritten as steps**

Replace the section's paragraph (lines 65–76). With calls 7 and 8 approved:

```markdown
## Moving from the userscript

**First update the script to v4.29.0** (Tampermonkey → Dashboard → the script → "Check for
userscript updates", or wait a day). Only that version has **Export everything for the
extension**. With an older version you can still move, but upload history, your channel list
and the language stay behind.

What moves, and how:

| What | How |
|---|---|
| Presets, the main preset, EP numbers, settings, copyright settings | the export file (steps below) |
| Upload history, your channel list, the language | the same file, when it was exported with **Export everything for the extension** (userscript v4.29.0) and imported as **My file** |
| Claimed-songs history | a CSV: userscript Copyright → Claimed songs → ⬇ CSV; extension Copyright → Claimed songs → ⬆ Import CSV. It keeps titles, artists, claimants, counts and the first channel, not which video was which: a later rescan can count a video twice. Up to 16 MB |
| Claim scans, trim results, the trim list, Ads and Collab lists, Auto-pilot on/off | don't move: scan each channel again and turn Auto-pilot on again |
| Videos waiting in the queue | don't move: upload them first, or add the files again |
| "Copy from video" patterns (userscript v4.28.0) | don't move: the extension doesn't have that feature yet (see CHANGELOG) |

Do the move **once, before you change anything in the extension**. An import replaces the
extension's presets, settings and EP numbers with the file's. (Upload history and channels are
only added to, never replaced.)

1. In the userscript, let anything in progress finish: the upload queue, trim runs, and trims
   "waiting for YouTube to process" (follow-up trims are not carried over).
2. Userscript: Settings → Back up / share settings → **Export everything for the extension**
   (or the notice's **Export my data**). Also save the claimed-songs CSV if you use it.
3. Install the extension (see "Install") and turn the userscript **off** in Tampermonkey.
4. Extension: Settings → Back up / share settings → **Import** → pick the file → **My file**.
   The question tells you how many history rows and channels come along, and the language.
5. Copyright → Claimed songs → ⬆ Import CSV, if you saved one.
6. On each channel: Copyright → **Scan claims**, then turn Auto-pilot on again if you use it.
7. Keep the userscript installed but **off**. Deleting it in Tampermonkey deletes its stored
   data, and that is the only other copy of your upload history and claim history. Delete it
   only when you are sure nothing is missing in the extension, and keep the exported file.
```

With call 8 declined: drop the opening paragraph and the table's second row, say "Upload history and the channel list don't move; the extension starts them empty", change step 2 to **Export (.json)**, and add a step after 4: "If the panel is in the wrong language: Settings → General → Language / ภาษา". Step 7 then matters more: the userscript's storage is the **only** copy of the upload history.

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

Above them, one note: "Items 75–78 and 81 are done on the test zip **before** the release (the controller gives you the zip and its content hash). Items 79 and 80 need userscript v4.29.0: do them on the file you are handed before it is published (Task 11), not before."

```markdown
75. **Install from the zip.** On a Chrome profile that never had the extension, follow "Install"
    with **the zip you were given** (before the first release there is nothing to download yet).
    The panel opens on Studio. `chrome://extensions` shows version 5.0.0. **Record** the
    extension's id; with the manifest key it is the same on every machine: `<the id>`.
76. **Update in place.** Ask the controller for a **test zip of a higher version** (it is the
    same build with `"version": "5.0.1"`, made in a scratch folder and never released). Follow
    "Update" with it. Presets, settings, queue cards and upload history are all still there
    afterwards, and `chrome://extensions` shows 5.0.1. Then update back to the 5.0.0 zip the
    same way.
    - **A different folder (record).** Unzip the same build into a *second* folder and Load
      unpacked from it. **Record** what Chrome does: replaces the first copy and keeps the data,
      refuses, or shows two copies. Remove the second copy if there are two.
77. **Update available.** In the service worker console (item 42 says how to open it):
    `await chrome.storage.local.set({ updateCheck: { at: Date.now(), latest: '99.0.0', url: 'https://github.com/TAEJK88/youtube-upload-presets/releases/latest' } })`.
    The panel shows "Update available: version 99.0.0 (you have …)"; **Get the update** opens the
    release page in a new tab. In Thai the banner is Thai.
    - **The real check.** `await chrome.storage.local.remove('updateCheck')`, then close that
      console, press the extension card's round **reload** arrow, and reload the Studio tab
      (as "Update" says). Open the service worker console again and look at
      `await chrome.storage.local.get('updateCheck')`.
      *Before the first release exists:* `latest` is empty, the console has one warning
      `[ytup] update check Error: GitHub answered 404`, and the panel shows no banner.
      *After a release:* `latest` is the released version and there is no banner when you
      have that version.
    - **Record** what the request carries: service worker console → Network → the request to
      `api.github.com` → Request Headers. Expected: no `Cookie` and no `Authorization` line;
      an `Origin: chrome-extension://<id>` line may be there (write down whether it is).
78. **Both installed.** Turn the Tampermonkey script on again and reload Studio: within a second
    or two the panel shows "The Tampermonkey script is still on in this tab — …". **Start** toasts
    the same sentence, shows no summary and uploads nothing; a trim asked from the Copyright tab
    does the same. **Scan claims** still runs to "Scan complete", and the status card keeps
    updating. Turn the script off and reload the tab: the banner is gone and Start works.
    - **Record** (optional, on a test channel with one claim): start a trim in review mode with
      the script off, then turn the script on and reload the tab. The step waits ("⏸ Waiting
      for another Studio tab to finish…"), Stop still ends the run, and another Studio tab can
      start its queue meanwhile.
79. **The move.** In the userscript (v4.29.0): the drawer shows "This script has moved to a Chrome
    extension"; **Export my data** saves `yt-upload-presets-move-YYYY-MM-DD.json`. Import it in
    the extension as **My file**: the question says how many upload-history rows and channels
    come along and which language; afterwards Copyright → Upload history has the old uploads,
    the ⇄ channel list has your channels, the panel is in the language the userscript was in,
    and a clip you uploaded before shows "Already uploaded …" when added to the queue. Import
    the same file again: no row appears twice. Import it as **Someone else's**: history,
    channels and language are not touched.
80. **The userscript's notice.** With v4.29.0: the notice is at the top of the drawer on every
    tab of it; **How to move** opens the README's "Moving to the Chrome extension" on GitHub; a
    toast "This script has moved to a Chrome extension — …" appears a few seconds after Studio
    loads with an empty queue, once a day, and not while the queue holds videos; everything
    else in the script works as before (upload one clip).
81. **Read the differences (gate).** Run `npm run parity -- --release` (or ask for its output):
    it lists every row that is *changed* or *dropped* on purpose, each with its reason. Read the
    whole list. The release waits until you have said, in your own words, that you read it and
    accept it; anything you do not accept goes back to Task 3 as a `missing` row.
```

Leave out item 78 if call 7 was declined, 79's move-file sentences if call 8 was, and item 75's id sentence if call 5 was (and use Step 1B's expectation in 76). Then set `readme` on the rows these items prove (the controller's job in Z: `header:updateURL …` → `[77]`, and any row closed in Task 3 whose agent wrote an item).

Add to "Known behaviour" a `### Known behaviour, Phase 5 (note, don't test)` list:

```markdown
- **The update check** asks `api.github.com` for this repo's latest release, about once a day
  (whenever the extension's background starts, but never more than once in 23 hours). The
  request carries no cookies and nothing about you or your channels; GitHub sees your IP
  address, as for any page visit. If GitHub can't be reached, or an office has used up its
  hourly allowance, nothing is shown and it tries again a day later. The result is
  `updateCheck` in `chrome.storage.local`; it is not part of a settings backup.
- **The banner can't be dismissed.** It goes when the installed version is the newest.
- **A newer build than the newest release** (a test build) shows no banner.
- **The repository must stay public.** The update check and the install link read it without
  signing in. If it is ever made private, both stop working silently.
- **Both installed.** The extension can see the Tampermonkey script only in YouTube Studio.
  On www.youtube.com (accepting a collaboration invite, switching channel) both scripts act
  if both are on; Accept pressed twice is harmless. In Studio, the script's own fill-in,
  quick-action bars and multi-file pick also still work beside the extension's. Turn the
  script off.
- **With the script on and no panel open,** an Auto-pilot cycle that comes due still scans and
  then waits; the Studio page shows a toast with the reason once, when the page first has to wait
  (not again until the tab is reloaded). The status card reads "Waiting for another Studio tab
  to finish"; the banner gives the real reason.
- **Importing a move file twice** adds nothing twice, and sets the language to the file's again.
```

- [ ] **Step 5: `CHANGELOG.md`**

```markdown
# Changelog

The version is `version` in `package.json` (the manifest's version). A release is the tag
`v<version>` on GitHub with the zip attached.

## 5.0.0 — unreleased

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

Adjust the last two lines to the owner's answers (open question 1; calls 4, 7, 8) and add every "known gap" row of Task 3 to "Not in the extension yet". `unreleased` becomes the date in Task 10; `release-check` looks for `## 5.0.0 ` and accepts both.

- [ ] **Step 6: Spec amendments, and the decisions in a tracked place**

`scripts/parity/DECISIONS.md`, under `## Phase 5`: one line per call of this plan the owner answered (`- **P5-<n>** <date>: <the answer in their words>`), approved or declined.

The spec:

1. "Goal": `feature parity with v4.26.1` → `feature parity with v4.27.1 (the commit `npm run port-check` pins)`.
2. Rollout row 5: `Parity checklist against v4.27.1 (\`extension/PARITY.md\`, \`npm run parity -- --release\`; decisions in \`extension/scripts/parity/DECISIONS.md\`); \`npm run release:check\` → zip → GitHub Release (published by the owner); the userscript's last version (v4.29.0) shows a "moved to the extension" notice and keeps working`.
3. "Background → Update check": replace the paragraph with what was built (D32): the endpoint, at each start of the background and on a daily alarm but never more than once in 23 h, no credentials, `updateCheck` in `storage.local`, the link's prefix check, silence on failure, no dismiss.
4. "Data migration from the userscript": add the move file and the language (calls 8, 18, 19); add what the extension holds while the userscript is active in a Studio tab, and what it cannot see (call 7).
5. "Messaging": `PROTOCOL` is 3 (call 16), if Task 5 was done.
6. "Decisions → Audience": add "a manifest `key` gives one extension id on every machine; its private half is the owner's" (call 5), or, if declined, "the extension id follows the folder it is loaded from".
7. "Permissions": unchanged; add "`https://api.github.com/*` is used only by the update check".

Leave "Source: … (v4.26.1, 6,348 lines…)" as it is: it says where the design started.

- [ ] **Step 7: The Thai renders**

`tests/panel-i18n.test.tsx`, from the cases U, M and G described in their reports, each next to the case it resembles ("…nor with the Re-grant banner" for the banners; the import question for the move file):

1. the update banner (`updateCheck: { at: 1, latest: '9.9.9', url: 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/v9.9.9' }` in storage): expect `มีเวอร์ชันใหม่`;
2. the userscript banner (a view with `userscript: true`): expect `สคริปต์ Tampermonkey ยังเปิดอยู่`;
3. the import question with a move file: expect `ประวัติการอัปโหลด`.

Each must pass the file's own English-leak check. Run: `npx vitest run tests/panel-i18n.test.tsx` — Expected: PASS.

- [ ] **Step 8: Write `PARITY.md` and verify everything**

In a clean worktree at the branch tip (`npm ci` here, not a symlink: this is the release's own check):

```sh
cd extension && npm ci && npm run build
npm run parity -- --write          # creates PARITY.md
npm run check
node -e "const m=require('./.output/chrome-mv3/manifest.json');console.log(m.version, m.permissions.join(), m.host_permissions.join(), JSON.stringify(m.web_accessible_resources))"
git add PARITY.md README.md CHANGELOG.md scripts/parity tests/panel-i18n.test.tsx ../docs/superpowers/specs/2026-10-05-chrome-extension-design.md
git commit -m "Phase 5 docs: Install, Update and Moving for the team, exit-check items 75-81, CHANGELOG 5.0.0, PARITY.md and its decisions, spec amendments (update check, move file, parity pin v4.27.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run parity -- --release
npm run release:check              # needs the commit above: it refuses a dirty tree
cd .. && node --test test/*.test.mjs 2>&1 | tail -8
git diff --stat d15ef87 HEAD -- youtube-upload-presets.user.js test
```

Expected: check and build green; version `5.0.0`, the five permissions, the three hosts, `file-bridge.html` only; parity `0 missing` followed by the changed/dropped list; `release-check: ok` with the zip's path, its sha256 and the **content hash**; root tests `# pass 163`, `# fail 0`; the last command prints nothing.

Record in `.superpowers/sdd/progress.md`: the commit, the content hash, and where the zip is.

- [ ] **Step 9: Manual gate.** The owner does README items 75–78 and 81 on **that zip** (copy it out of `.output/` and hand it over with its content hash). For item 76 the controller makes the higher-version test zip: in a scratch copy of the same commit, set `"version": "5.0.1"` in `package.json`, run `npx wxt zip`, hand over that zip, and delete the scratch copy; nothing of it is committed. Any failure is fixed and Step 8 run again (a new content hash) before Task 9. Items 79 and 80 wait for Task 11.

---

### Task 9: To `main` — OWNER-GATED

Nothing in this task runs before the owner says "go for Task 9" in their own words. Steps marked **[owner]** are the owner's to run or to approve one by one.

**State when it starts:** `extension-phase-2` has never been pushed; it is 261 commits ahead of `d15ef87` at `6bfbae6`, plus Phase 5's. `origin/main` is `c2564c3`, four commits ahead of `d15ef87` (userscript v4.28.0). Local `main` is `d15ef87`.

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

<the "Moving from the userscript" opening paragraph, table and steps, copied from extension/README.md>

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
git push --dry-run -u origin extension-phase-2    # shows what would go; sends nothing
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

- [ ] **Step 2: Build the zip from `main`'s commit, and show it is the build that was tested.** In a clean worktree at `origin/main`: `cd extension && npm ci && npm run release:check`. Expected: `release-check: ok`, with the zip's path, its sha256, the **content hash** and the commit.

  Compare the content hash with the one recorded in Task 8 Step 8 (the build the owner did items 75–78 on). A zip stores file times, so the two zips' own sha256 differ; the content hash is over the files inside.
  - **Equal:** this zip is, file for file, what was tested. Go on.
  - **Different:** `diff` the two `.output/release-files.txt` lists and say which files differ and why (a merge that changed source, a dependency that resolved differently). Then **stop**: the owner repeats README items 75–77 on this zip before Step 3.

  Save the CHANGELOG's 5.0.0 section, followed by the README's "Install" steps, to a file for the notes. Give the owner: the zip's path, its sha256, the content hash, the commit, the notes file.

- [ ] **Step 3 [owner]: tag and draft.**

```bash
git tag v5.0.0 <the commit from Step 2>
git push --dry-run origin v5.0.0    # shows what would go; sends nothing
git push origin v5.0.0
gh release create v5.0.0 "<zip path>" --draft --title "v5.0.0" --notes-file "<notes file>"
```

- [ ] **Step 4 [owner]: read the draft on GitHub.** The zip is attached and downloads; unzipped, `manifest.json` says `"version": "5.0.0"`; `shasum -a 256` of the download equals Step 2's.

- [ ] **Step 5 [owner]: Publish.** Not as a pre-release: `releases/latest` (the update check, and the README's link) skips drafts and pre-releases.

- [ ] **Step 6: Confirm from the outside** (read-only): `curl -s https://api.github.com/repos/TAEJK88/youtube-upload-presets/releases/latest | grep -E '"tag_name"|"html_url"' | head -2`. Expected: `"tag_name": "v5.0.0"`. An installed 5.0.0 shows no banner (equal versions).

- [ ] **Step 7 [owner]: the owner and one pilot only — not the team yet (call 20).** The owner installs from the release (README item 75 again, this time with the real download), and one teammate of the owner's choice does the same **to try it, not to move**: the pilot keeps working in the script and does their real move after Task 11, with v4.29.0's export, like everyone else (or knowingly moves now without history, channel list and language). Nobody else is told yet: the README's "Moving" starts with userscript v4.29.0, which does not exist until Task 11. A teammate who moved today would export without history, channels or language, and could get them later only by an import that also replaces their presets and settings with the script's older ones. The team announcement is Task 11 Step 11.

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
3. The daily toast. That `root.classList.toggle('dark', …)` line occurs twice in v4.28.0 (3611, inside `openDrawer`, and 6679). The place is the **second**: the one directly followed by `  applyGlass();` and `  root.append(fab, drawer, toastEl);`. Directly above it:

```js
  // toast เตือนวันละครั้ง หลังหน้าโหลดสักครู่ · ไม่ขึ้นตอนคิวหรืองานลิขสิทธิ์กำลังทำงาน (รอบถัดไปค่อยขึ้น)
  setTimeout(() => {
    let busy = uploadBusy();
    try { busy = busy || (Claims.status() || {}).kind === 'busy'; } catch (e) { /* สถานะลิขสิทธิ์อ่านไม่ได้ ไม่เป็นไร */ }
    if (!movedToastDue(load('movedNoticeAt', 0), Date.now(), busy)) return;
    save('movedNoticeAt', Date.now());
    toast(mv.toast);
  }, 6000);
```

   `uploadBusy()` (v4.28.0 line 1840) is true while the queue runs **and** while it merely holds waiting, in-review or failed videos. So a user who leaves videos in the queue for days sees no toast on those days. That is accepted: the notice in the drawer is always there, and a toast must never replace a run's own toast. The copyright module's work is not covered by `uploadBusy()`. `Claims.status()` (the module's `computeStatus`, v4.27.1 line 6122, exported at 6357 and already called at 4090) returns an object whose `kind` is `'busy'` while a scan or a trim / ads / Collab run is going. So the toast's third argument is `uploadBusy() || (Claims.status() || {}).kind === 'busy'`, in a `try` like line 4090's (a throw there must not stop the page): use that in the snippet above. `Claims` is assigned before this point of the IIFE.

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

- [ ] **Step 9 [owner]: publish.** The owner runs, one line at a time:

```bash
git push --dry-run -u origin userscript-moved-notice    # shows what would go; sends nothing
git push -u origin userscript-moved-notice
gh pr create --base main --head userscript-moved-notice --title "The script has moved to a Chrome extension (v4.29.0)" --body-file <a file with the summary>
```

  then reads the PR's diff on GitHub (three files plus the README line) and merges it. From that moment every Tampermonkey install picks v4.29.0 up on its next update check (a day or so by default; "Check for userscript updates" in Tampermonkey does it at once). It cannot be recalled, only followed by a v4.29.1.

- [ ] **Step 10: Afterwards.** `curl -s https://raw.githubusercontent.com/TAEJK88/youtube-upload-presets/main/youtube-upload-presets.user.js | sed -n 4p` — Expected: `// @version      4.29.0` (GitHub's raw cache can lag a few minutes). The owner does README items 79 and 80 with the published version. Record in `.superpowers/sdd/progress.md`: the release's tag and commit, the userscript's commit, the date.

- [ ] **Step 11 [owner]: now tell the team (call 20).** Send them: the link to the root README's "Moving to the Chrome extension", and three lines in their language: update the script to v4.29.0 first; export with **Export everything for the extension**; install the extension and turn the script off, don't delete it. The script's own notice says the same to anyone who misses the message. Scratch worktrees and local `p4b-*` / `p5-*` branches can be removed once the owner agrees.

---

## Phase 5 exit check

- `npm run check`, `npm run build`, `npm run parity -- --release` and `npm run release:check` pass at the tagged commit.
- README items 75–81 are passed or recorded; for 81 the owner has said they read the changed/dropped list and accept it.
- The released zip's content hash equals the tested build's, or items 75–77 were repeated on the released zip.
- `v5.0.0` is published on GitHub with the zip; `releases/latest` answers with it.
- Userscript v4.29.0 is on `main`; Tampermonkey shows the notice; the script still uploads. The team was told after that, not before.
- The spec's exit check for row 5: **the team is on the extension**. The owner says when.

## What comes next (not in this plan)

- "Copy a pattern from a video" (userscript v4.28.0) in the extension, if the owner wants it (open question 1). It would be a plan of its own: a second pin (or the pin moved to v4.28.0 with every port config re-run), `videoTemplates:<ch>`, the preset picker's second group, 23 string lines.
- Removing the userscript file from `main`. Not before every teammate has moved: Tampermonkey's `@updateURL` points at it, and it is the only way to reach them again.
