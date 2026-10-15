# Agent setup: what to install

What a Claude Code session needs before it works on this repo. `CLAUDE.md` assumes all of it.
Install once per machine; the per-repo steps run once per clone.

## Required

| What | Why this repo needs it | Install |
| --- | --- | --- |
| **graphify** (CLI + skill) | `CLAUDE.md` tells agents to run `graphify query` before reading source | `uv tool install graphifyy` then `graphify install --platform claude` |
| **Matt Pocock's engineering skills** | `docs/agents/` is their per-repo config: `triage`, `grill-with-docs`, `improve-codebase-architecture`, `tdd` | `npx skills add mattpocock/skills` |
| **superpowers** plugin | The specs and plans in `docs/superpowers/` are written and executed with it (`brainstorming`, `writing-plans`, `subagent-driven-development`) | in Claude Code: `/plugin install superpowers@claude-plugins-official` |
| **GitHub CLI** (`gh`) | Issues are the tracker (`docs/agents/issue-tracker.md`); releases are published with it | `brew install gh` then `gh auth login` |
| **Node 22** + npm | The extension builds with WXT; the userscript tests run on `node --test` | `brew install node@22` |

## Recommended

| What | Why | Install |
| --- | --- | --- |
| **claude-mem** plugin | Memory across sessions; all worktrees of this repo share one memory | `/plugin marketplace add thedotmack/claude-mem`, `/plugin install claude-mem`, then `npx claude-mem install --provider claude` (local, uses your Claude plan) |
| **typescript-lsp** plugin | Go-to-definition and type errors in `extension/` | `/plugin install typescript-lsp@claude-plugins-official` |

claude-mem needs Bun 1.4 or newer on macOS: with Bun 1.3.13 its hook launcher is killed at
start (exit 137) and no memory is recorded. `bun upgrade`, then `npx claude-mem doctor`.
To name projects by GitHub repo, so every worktree shares one memory, set
`"CLAUDE_MEM_PROJECT_NAME_SOURCE": "git-remote"` in `~/.claude-mem/settings.json`.

## Once per clone

```sh
graphify update .             # builds graphify-out/ from the code, no LLM (/graphify for the full graph);
                              # not committed: add graphify-out/ to .git/info/exclude
graphify hook install         # keeps the graph current after commits
cd extension && npm ci        # the extension's dependencies
```

Check the setup: `node --test test/*.test.mjs` (userscript) and `cd extension && npm run check`
(extension) both pass on `main`.

## Releasing the extension

The release steps are in `extension/README.md`, "Release check". Two things live outside the
repo and are the owner's:

- The private half of the manifest key (`wxt.config.ts` has the public half; the extension ID is
  `cllefnlbgkbdnmifojjflfcpholhniio`). Unpacked installs never need it; a move to the Chrome Web
  Store under the same ID does.
- Pushing a `v*` tag and `gh release create`: the extension's update check reads the latest
  published release, so a draft does not count.
