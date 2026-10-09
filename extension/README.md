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
