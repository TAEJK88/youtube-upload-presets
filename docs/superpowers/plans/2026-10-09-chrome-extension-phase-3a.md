# Chrome Extension — Phase 3a (Side panel: plumbing, shell, Settings, Presets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Phases 0–2 are complete on branch `extension-phase-2` (373 tests, `npm run check` green, `port-check` 14 configs `ok`).

**Goal:** Replace the developer panel with the real side panel — React 19 + Tailwind v4 + shadcn/ui, themed with the userscript's black glass tokens — and ship its shell (channel bar, activity bar, tabs), the **Settings** tab (incl. backup import/export) and the **Presets** tab with behaviour parity to the userscript drawer. Before any UI, fix the storage and messaging seams the panel needs: one writer for `settings`/`counters`, a queue view and queue edits the panel can ask the Studio tab for, a real channel-switch message, language changes followed everywhere, and a check that every shipped UI string is the userscript's.

**Architecture:**
- **The panel never touches Studio's DOM.** It reads and writes `chrome.storage.local` through `lib/` modules and talks to the Studio tab active in its window with the typed messages in `lib/messages.ts`. The runner in the Studio tab stays authoritative for the queue: the panel asks it for a `QueueView` (items plus what only the runner can compute — release times, tracklist checks, the channel) and sends `queue:edit` operations instead of writing `queue` itself.
- **One writer for `settings` and `counters`:** the background. Both the panel and the Studio content script send `store:patch` (top-level keys; `schedule` one level deeper); the background applies patches one after another (`lib/store-writer.ts`), so a whole-object write from a stale copy can no longer undo the other side's change (Phase 2a review). The content script keeps a pending patch applied on top of what storage holds until the background's write comes back. Backup import goes through the same queue (`backup:write`). Presets, `activeId` and `channels` stay plain writes (one writer each in practice; see Decisions).
- **Panel code layout:** logic that can be tested without a browser lives in `lib/panel/*.ts` (Vitest, `fakeBrowser`); React components in `entrypoints/sidepanel/**` stay thin; shadcn components are copied into `components/ui/`.
- **Strings:** every user-facing string is `L(th, en)`. `scripts/ui-check.mjs` proves each pair the extension ships is a pair from the userscript at the pinned commit, or is listed in `scripts/strings/extension-only.mjs` with a reason, and (from Phase 3b's last task) that every drawer pair is used or listed in `scripts/strings/dropped.mjs`.

**Tech Stack:** WXT 0.21.4, TypeScript 7.0.2, Vitest 5.0.3 + `wxt/testing` fakeBrowser, `@webext-core/messaging` 4.0.0, Node 22. New (all `-E`): React 19.3.0, `@wxt-dev/module-react` 1.2.2, Tailwind CSS 4.3.3 + `@tailwindcss/vite` 4.3.3, `radix-ui` 1.7.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `sonner` 2.0.8, `@fontsource/ibm-plex-sans-thai` 5.3.0; tests: `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.7, `happy-dom` 20.14.5.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` — "Side panel UI", "Messaging", "Error handling", rollout row 3.

**Why two plans:** the drawer is ~2,100 userscript lines rebuilt as React plus new plumbing on both sides of the message boundary. **3a** (this file) is everything except the Upload tab: storage/messaging seams, the strings check, the toolchain and theme, the panel shell, Settings and Presets. **3b** (`docs/superpowers/plans/2026-10-09-chrome-extension-phase-3b.md`) builds the Upload tab (file intake, cards, schedule box, start/stop/retry confirmations), the in-page FAB and "Reload this tab" banner, turns on the drawer-coverage check, and rewrites the README manual checklist so all of Phase 2's and Phase 3's checks run from the real panel. 3a leaves the Upload tab empty; nothing in 3a imports anything 3b creates.

## Decisions (made while planning; the user confirms them in the report)

| # | Topic | Decision |
|---|---|---|
| D1 | Settings writer | The background is the only writer of `settings` and `counters` (`store:patch`, serialized). Content script: `save('settings'|'counters', …)` becomes a diff → patch, held as an overlay until echoed. |
| D2 | Glass | `glass` / `glassV2` leave `Settings`. Migration step 5 deletes them from stored settings; `BACKUP_SCHEMA` stays 4, so `writeBackup` runs step 5 on an imported userscript file. The ported `tests/migrations.test.mjs` asserts `schemaVersion` `4` in three places: those three literals become `5` (the only edit ever made to a ported test body; recorded in the commit message). |
| D3 | Language default | `loadSettings()` no longer writes. The background stores the starting language once at startup (`ensureLang`, what the userscript did at first load). |
| D4 | Language switch | Instant everywhere (panel re-renders, content `state.ts` already follows, `watchLang` for www.youtube.com and the background). In-page quick-action bars pick it up the next time they mount. The userscript's "stop the queue first" refusal and "the page reloads" note are dropped. |
| D5 | Off-Studio | Keep Phase 0's behaviour: the panel is disabled on non-Studio tabs (no "Open YouTube Studio" screen). When the active Studio tab has no live content script, the panel shows **Reload this tab**. Spec amended in 3b. |
| D6 | Update banner | Phase 5 (it needs GitHub Releases, which Phase 5 creates). Not in Phase 3. |
| D7 | Dev panel | Deleted in Task 5. `spike:cfg` and `dev:switchChannel` are removed (Task 3); `channel:switch` replaces the latter and validates `next`. The README checklist is rewritten for the real panel in 3b. |
| D8 | Tabs | The userscript's four tabs — Upload, Presets, Copyright, Settings — with the schedule box inside Upload (the spec's separate "Schedule" tab didn't exist in the drawer). Copyright is a placeholder until Phase 4. |
| D9 | Components | shadcn-style components copied by hand into `components/ui/` (no shadcn CLI: its Sonner wrapper pulls in `next-themes`, and the CLI rewrites `package.json` with caret ranges). Native `<select>` and `<input type="datetime-local">` as in the drawer, instead of Radix Select / Calendar / Popover; `title` tooltips as in the drawer instead of Radix Tooltip; the panel page scrolls natively (no ScrollArea). |
| D10 | Theme | Dark only: the userscript's black theme overrides its light and Studio-dark variants, so the drawer was always black. |
| D11 | Icons | The userscript's embedded Material Symbols Rounded paths (`ICONS` in `lib/studio/dom.ts`), rendered by a React `<Icon>`; no icon font. |
| D12 | Presets / activeId / channels | Plain whole-value writes: presets and `activeId` are written by the panel only (plus Alt+digit in the page, a scalar); `channels` is read-modify-written by the page's channel memory and the panel's channel list, as the userscript did across tabs. |
| D13 | Import while running | Refused while any tab holds the runner lock (new string). The userscript's "clear the queue first, the page reloads" guard is dropped: the queue now survives an import. |

## Global Constraints

- Node ≥ 22, npm, every dependency installed with `-E` (exact version). Only the dependencies listed in Task 5 are added.
- All new code lives under `extension/` (plus this plan and, in 3b, a spec amendment). **Do not modify** `youtube-upload-presets.user.js`, `test/`, or the userscript sections of the root `README.md`.
- Ported code (`// @port-begin` … `// @port-end` regions checked by `scripts/port-check.mjs`) is not edited in this phase. `npm run port-check` must stay `ok` for all 14 configs. Exports added outside port blocks are allowed (`port-check` ignores them).
- **Strings:** every script-authored user-facing string is `L('ไทย', 'English')`. Pairs come verbatim from the userscript at `d15ef87caaddb7a6d3187d2851b83a484c4bb9e7`; a pair that isn't there needs an entry in `scripts/strings/extension-only.mjs` with a reason (Task 4 lists every one this plan adds). Text that is the same in both languages in the userscript (e.g. `'Paid promotion'`, `'None of the above'`, `'Language / ภาษา'`) stays a plain literal, exactly as the userscript had it. `[ytup]` console lines are exempt.
- **Minimum text size 12px** in the panel and in-page UI (enforced by `ui-check`). Font: IBM Plex Sans Thai, bundled.
- Manifest permissions, exactly: `sidePanel`, `storage`, `unlimitedStorage`, `alarms`, `notifications`. Host permissions, exactly: `https://studio.youtube.com/*`, `https://www.youtube.com/*`, `https://api.github.com/*`. (`commands` is a manifest key, not a permission: 3b adds Alt+P.)
- TypeScript `strict` with `noUncheckedIndexedAccess`. New tests are `*.test.ts`, or `*.test.tsx` for component tests, which start with `// @vitest-environment happy-dom` and call `cleanup()` in `afterEach`. Ported `*.test.mjs` bodies stay byte-identical (one recorded exception: D2).
- React components get logic-light: anything worth a unit test goes in `lib/panel/*.ts`. Component tests only where they protect behaviour (forms writing the right patch, confirmations, list states).
- Run every command from `extension/` unless a step says otherwise.
- Every commit message ends with the `Co-Authored-By:` line your agent environment specifies (examples show `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Never stage `.claude/`, `extension/.claude/`, `extension/.vitest/` or `test/.claude/`.
- **Manual Chrome checks** for all of Phase 3 run once, at the end of 3b (README checklist). 3a ends with automated checks and a build only.

## File Structure

```
extension/
  scripts/
    ui-check.mjs                 NEW  strings parity + 12px minimum (+ drawer coverage, enabled in 3b)
    strings/extension-only.mjs   NEW  L() pairs the userscript never had, each with a reason
    strings/dropped.mjs          NEW  drawer pairs the panel no longer shows, each with a reason
  lib/
    settings.ts                  MOD  no glass; mergeSettings, SettingsPatch, settingsDiff, applySettingsPatch, countersDiff; loadSettings read-only
    store-writer.ts              NEW  background: serialized store:patch / backup:write; ensureLang
    migrations.ts                MOD  step 5: drop glass / glassV2
    messages.ts                  MOD  store:patch, backup:write, queue:view, queue:edit, channel:switch; QueueState.channel; dev handlers gone
    i18n.ts                      MOD  watchLang()
    utils.ts                     NEW  cn() for components/ui
    fs-permissions.d.ts          MOD  showOpenFilePicker / showDirectoryPicker (used in 3b)
    studio/
      state.ts                   MOD  patched keys, setActiveId, STATE_KEYS + channels, fabPos
      queue-view.ts              NEW  QueueView / ChannelView for the panel
      queue-edit.ts              NEW  the drawer's card edits as operations; follow stored preset/settings changes
      channels.ts                NEW  rememberChannel (the drawer's channel memory) + safe channel switch
      shortcuts.ts               NEW  Alt+P / Alt+1…9 in Studio
      content-ui.ts              MOD  QueueState carries the channel; state()
      dom.ts                     MOD  export ICONS (outside the port block)
    panel/
      data.ts                    NEW  stored data the panel shows (+ watch)
      target.ts                  NEW  the Studio tab the panel works with; the runner tab
      view-sync.ts               NEW  fetch QueueView on demand, debounced; link status
      bus.ts                     NEW  one onMessage per broadcast type, many subscribers
      writes.ts                  NEW  patchSettings, setCounter, setActiveId, savePresets, saveChannels
      channels.ts                NEW  channelUrl, parseChannelId, add/remove in the stored list
      presets.ts                 NEW  new / duplicate / delete / reset, list parsing
      backup-io.ts               NEW  export file, import decision → backup:write
      format.ts                  NEW  fmtSize, fmtDur (+ re-exports fmtWhen, toLocalInput, readText)
  components/ui/
    button.tsx input.tsx textarea.tsx label.tsx native-select.tsx switch.tsx tabs.tsx
    dialog.tsx badge.tsx progress.tsx sonner.tsx                                     NEW
  entrypoints/
    background.ts                MOD  store:patch, backup:write, ensureLang, watchLang
    studio.content.ts            MOD  new handlers; dev handlers removed; channel memory; shortcuts
    invite.content.ts            MOD  watchLang
    sidepanel/
      index.html                 MOD  React root (replaces the developer panel)
      main.ts                    DEL
      main.tsx                   NEW  waits for migrations, mounts <App>
      style.css                  NEW  Tailwind v4, black glass tokens, fonts
      App.tsx                    NEW  shell: channel bar, banners, activity bar, tabs, footers, toasts
      Icon.tsx                   NEW  ICONS as React
      panel.tsx                  NEW  PanelProvider / usePanel(): data, target, view, states, lang
      ask.tsx                    NEW  the drawer's ask() as a promise-returning dialog
      fields.tsx                 NEW  inputs that don't fight the user while focused
      shell/ChannelBar.tsx shell/ActivityBar.tsx shell/Banners.tsx                     NEW
      tabs/SettingsTab.tsx tabs/PresetsTab.tsx tabs/CopyrightTab.tsx tabs/QueueTab.tsx  NEW (QueueTab empty until 3b)
  tests/
    store-writer.test.ts queue-view.test.ts queue-edit.test.ts channels.test.ts shortcuts.test.ts
    ui-check.test.mjs panel-data.test.ts panel-target.test.ts panel-view-sync.test.ts
    panel-presets.test.ts panel-backup.test.ts panel-channels.test.ts
    panel-ask.test.tsx panel-settings.test.tsx panel-presets-tab.test.tsx panel-shell.test.tsx     NEW
    settings.test.ts state.test.ts i18n.test.ts migrations.test.mjs (D2 literals)      MOD
  package.json wxt.config.ts vitest.config.ts tsconfig.json                           MOD
```

Userscript line map (pinned commit): `ask()` 3204–3237 · shell, channel bar, channel list 3286–3440 · FAB 3453–3486 · tabs 3442–3451 · drop zone 3500–3591 · schedule box 3603–3717 · queue footer 3731–3744 · cards 3746–4024 · `renderQueue` / `updateRunUI` / activity 4025–4136 · presets tab 4138–4356 · glass 4357–4365 · settings tab 4367–4572 · `refreshLabels` 4574–4585 · tick and keyboard shortcuts 6361–6403. Phase 2 already ported the runner's start summary (2112–2143) into `startSummary()`.

---
### Task 1: One writer for `settings` and `counters`; glass removed; language stored once

**Files:**
- Create: `extension/lib/store-writer.ts`, `extension/tests/store-writer.test.ts`
- Modify: `extension/lib/settings.ts`, `extension/lib/migrations.ts`, `extension/lib/messages.ts`, `extension/lib/studio/state.ts`, `extension/entrypoints/background.ts`
- Test (modify): `extension/tests/settings.test.ts`, `extension/tests/state.test.ts`, `extension/tests/migrations.test.mjs` (D2: three literals only)

**Interfaces:**
- Consumes: `defaultSettings`, `loadSettings`, `Settings`, `Schedule` (`lib/settings.ts`); `writeBackup`, `BackupWrites` (`lib/backup.ts`); `getLang`, `resolveLang` (`lib/i18n.ts`); `initState`, `save`, `saveSettings`, `flushState`, `disposeState` (`lib/studio/state.ts`).
- Produces:
  - `lib/settings.ts`: `Settings` without `glass` / `glassV2`; `mergeSettings(stored, legacy?): Settings`; `type SettingsPatch = Partial<Omit<Settings, 'schedule'>> & { schedule?: Partial<Schedule> }`; `settingsDiff(before: Settings, after: Settings): SettingsPatch`; `applySettingsPatch(stored: Record<string, unknown>, patch: SettingsPatch): Record<string, unknown>`; `countersDiff(before, after): Record<string, number>`; `loadSettings()` no longer writes.
  - `lib/store-writer.ts`: `type StorePatch = { key: 'settings'; patch: SettingsPatch } | { key: 'counters'; patch: Record<string, number> }`; `applyStorePatch(p)`, `patchStore(p)`, `writeBackupInOrder(w)`, `ensureLang()` (the last three run one after another).
  - `lib/messages.ts`: `ProtocolMap['store:patch'](p: StorePatch): void`, `ProtocolMap['backup:write'](w: BackupWrites): void`.
  - `lib/studio/state.ts`: `initState(ensureMigrated?, timeoutMs?, patch?: (p: StorePatch) => Promise<void>)`; `save('settings' | 'counters', v)` sends a patch once `initState` has run; `flushState()` also waits for patches.
  - `MIGRATIONS[4]` (step 5): deletes `glass` and `glassV2` from stored settings. `SCHEMA_VERSION` becomes 5.

- [ ] **Step 1: Write the failing tests**

`extension/tests/store-writer.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLang } from '../lib/i18n';
import { applySettingsPatch, countersDiff, defaultSettings, settingsDiff } from '../lib/settings';
import { ensureLang, patchStore } from '../lib/store-writer';

beforeEach(() => {
  fakeBrowser.reset();
  setLang('en');
});

describe('settings patches', () => {
  it('a diff names only the changed keys, and schedule by its own keys', () => {
    const a = defaultSettings();
    const b = { ...a, notify: false, schedule: { ...a.schedule, start: '2026-10-10T08:00' } };
    expect(settingsDiff(a, b)).toEqual({ notify: false, schedule: { start: '2026-10-10T08:00' } });
    expect(settingsDiff(a, structuredClone(a))).toEqual({});
  });

  it('a patch merges into what is stored, schedule one level deeper', () => {
    const stored = { producer: 'Me', schedule: { on: true, start: 'x', every: 2, unit: 'hour' } };
    expect(applySettingsPatch(stored, { notify: false, schedule: { start: 'y' } })).toEqual({
      producer: 'Me', notify: false, schedule: { on: true, start: 'y', every: 2, unit: 'hour' },
    });
    // nothing stored yet: the schedule's other keys come from the defaults
    expect(applySettingsPatch({}, { schedule: { on: true } })).toEqual({ schedule: { ...defaultSettings().schedule, on: true } });
  });

  it('counters diff keeps the changed presets only', () => {
    expect(countersDiff({ a: 1, b: 2 }, { a: 1, b: 3, c: 0 })).toEqual({ b: 3, c: 0 });
  });
});

describe('patchStore', () => {
  it('two writers no longer undo each other', async () => {
    await browser.storage.local.set({ settings: { producer: 'Me' }, counters: { a: 1 } });
    // the page moves the schedule while the panel turns notifications off
    await Promise.all([
      patchStore({ key: 'settings', patch: { schedule: { start: '2026-10-10T08:00' } } }),
      patchStore({ key: 'settings', patch: { notify: false } }),
      patchStore({ key: 'counters', patch: { b: 4 } }),
    ]);
    const got = await browser.storage.local.get(['settings', 'counters']);
    expect(got.settings).toMatchObject({ producer: 'Me', notify: false, schedule: { start: '2026-10-10T08:00' } });
    expect(got.counters).toEqual({ a: 1, b: 4 });
  });

  it('refuses keys it does not own', async () => {
    await expect(patchStore({ key: 'queue', patch: {} } as never)).rejects.toThrow('store:patch');
  });
});

describe('ensureLang', () => {
  it('stores the language the install started in, once', async () => {
    setLang('th');
    await ensureLang();
    expect((await browser.storage.local.get('settings')).settings).toEqual({ lang: 'th' });
    setLang('en');
    await ensureLang();
    expect((await browser.storage.local.get('settings')).settings).toEqual({ lang: 'th' });
  });
});
```

In `extension/tests/settings.test.ts`, replace the four tests `'moves the old 72% glass default to 82% once'`, `'fills a missing lang from whether presets exist, not the module language'`, `'no stored lang and no presets → lang defaults to en'` and `'leaves a user-chosen glass value alone'` with:
```ts
  it('fills a missing lang from whether presets exist, without writing', async () => {
    setLang('en'); // loadSettings must ignore this and read storage instead
    await browser.storage.local.set({ settings: { delay: 4 }, presets: [{ id: 'x' }] });
    expect((await loadSettings()).lang).toBe('th');
    expect((await browser.storage.local.get('settings')).settings).toEqual({ delay: 4 });
  });

  it('no stored lang and no presets → lang defaults to en', async () => {
    setLang('th');
    await browser.storage.local.set({ settings: {} });
    expect((await loadSettings()).lang).toBe('en');
  });

  it('has no panel opacity any more', () => {
    expect(defaultSettings()).not.toHaveProperty('glass');
  });

  it('migration 5 drops the stored glass keys and keeps the rest', async () => {
    await browser.storage.local.set({ presets: [{ id: 'x' }], schemaVersion: 4, settings: { glass: 60, glassV2: true, delay: 7 } });
    await runMigrations();
    const got = await browser.storage.local.get(['settings', 'schemaVersion']);
    expect(got.settings).toEqual({ delay: 7 });
    expect(got.schemaVersion).toBe(5);
  });
```
and add `import { runMigrations } from '../lib/migrations';` to its imports. In the `'stored values override defaults'` test, change `{ producer: 'ThaiBeats', delay: 9, glassV2: true, lang: 'en' }` to `{ producer: 'ThaiBeats', delay: 9, lang: 'en' }`.

In `extension/tests/migrations.test.mjs`, change the three literals `4` in `assert.equal(store.schemaVersion, 4);` (twice) and `schemaVersion: 4,` (once) to `5`. Nothing else in that file changes.

In `extension/tests/state.test.ts`, add `import { patchStore } from '../lib/store-writer';`, change the `'save() writes through to chrome.storage'` test's `await state.initState(current);` to `await state.initState(current, 10_000, patchStore);`, and add to `describe('initState', …)`:
```ts
  it('settings and counters go to the background as patches, and a concurrent change survives', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { producer: 'Me' }, counters: { a: 1 } });
    const sent: unknown[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await state.initState(current, 10_000, async (p) => {
      sent.push(structuredClone(p));
      await gate; // the background is slow
      await patchStore(p);
    });
    state.settings.schedule.start = '2026-10-10T08:00';
    state.saveSettings();
    expect(sent).toEqual([{ key: 'settings', patch: { schedule: { start: '2026-10-10T08:00' } } }]);
    // the side panel turns notifications off before the background stored the page's patch
    await patchStore({ key: 'settings', patch: { notify: false } });
    expect(state.settings.schedule.start).toBe('2026-10-10T08:00'); // the pending patch stays on top
    expect(state.settings.notify).toBe(false);
    release();
    await state.flushState();
    const got = (await browser.storage.local.get('settings')).settings;
    expect(got).toMatchObject({ producer: 'Me', notify: false, schedule: { start: '2026-10-10T08:00' } });
    state.counters.b = 2;
    state.save('counters', state.counters);
    await state.flushState();
    expect(sent.at(-1)).toEqual({ key: 'counters', patch: { b: 2 } });
    expect((await browser.storage.local.get('counters')).counters).toEqual({ a: 1, b: 2 });
  });

  it('a failed patch puts back what storage holds', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { delay: 3 } });
    await state.initState(current, 10_000, async () => { throw new Error('no background'); });
    state.settings.delay = 9;
    state.saveSettings();
    await state.flushState();
    expect(state.settings.delay).toBe(3);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/store-writer.test.ts tests/settings.test.ts tests/state.test.ts tests/migrations.test.mjs`
Expected: FAIL — `lib/store-writer` does not exist; `settingsDiff` / `applySettingsPatch` / `countersDiff` are not exported; `schemaVersion` is still 4.

- [ ] **Step 3: Settings without glass, read-only `loadSettings`, patch helpers**

In `extension/lib/settings.ts`:
- Delete the `glass: number; …` line and the `glassV2?: boolean;` line from `Settings`, and `glass: 82,` from `defaultSettings`.
- Replace `loadSettings` with the code below and add the helpers after it:

```ts
// What the userscript's settings object held: defaults (with the pre-settings
// autoApply / autoNext keys) ← stored.
export function mergeSettings(stored: Partial<Settings> | undefined, legacy: { autoApply?: boolean; autoNext?: boolean } = {}): Settings {
  return Object.assign(defaultSettings(legacy), stored ?? {});
}

// Read-only: the background stores the language once (store-writer ensureLang) and is the
// only writer of settings (store:patch).
export async function loadSettings(): Promise<Settings> {
  const [autoApply, autoNext, stored] = await Promise.all([
    load('autoApply', true),
    load('autoNext', false),
    load<Partial<Settings>>('settings', {}),
  ]);
  const s = mergeSettings(stored, { autoApply, autoNext });
  // Same rule the userscript used: LANG was computed from storage at load.
  if (s.lang === undefined) s.lang = resolveLang(stored, (await load('presets', undefined)) !== undefined);
  return s;
}

// A change to settings as top-level keys; schedule is merged one level deeper, so the page
// moving schedule.start and the panel switching schedule.on don't overwrite each other.
export type SettingsPatch = Partial<Omit<Settings, 'schedule'>> & { schedule?: Partial<Schedule> };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function settingsDiff(before: Settings, after: Settings): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after) as (keyof Settings)[]) {
    if (k === 'schedule') {
      const s: Record<string, unknown> = {};
      for (const [sk, v] of Object.entries(after.schedule)) if (!same((before.schedule as unknown as Record<string, unknown>)[sk], v)) s[sk] = v;
      if (Object.keys(s).length) out.schedule = s;
    } else if (!same(before[k], after[k])) out[k] = after[k];
  }
  return out as SettingsPatch;
}

export function applySettingsPatch(stored: Record<string, unknown>, patch: SettingsPatch): Record<string, unknown> {
  const next: Record<string, unknown> = { ...stored, ...patch };
  if (patch.schedule) next.schedule = { ...defaultSettings().schedule, ...(isObj(stored.schedule) ? stored.schedule : {}), ...patch.schedule };
  return next;
}

export function countersDiff(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k] !== v));
}
```

Delete `export const saveSettings = …` from this file (its only caller was the old `loadSettings`; the page's own `saveSettings` lives in `lib/studio/state.ts`) and change the storage import to `import { load } from './storage';`.

- [ ] **Step 4: Migration step 5**

Append to `MIGRATIONS` in `extension/lib/migrations.ts`:
```ts
  { // 5: the side panel is docked, not see-through: the opacity setting goes (Phase 3)
    async run() {
      const s = await load<Record<string, unknown>>('settings', {});
      if (!('glass' in s) && !('glassV2' in s)) return;
      const { glass: _glass, glassV2: _glassV2, ...rest } = s;
      await save('settings', rest);
    },
  },
```
`BACKUP_SCHEMA` in `lib/backup.ts` stays `4`: a userscript backup represents schema 4, so `writeBackup` → `runMigrations()` runs step 5 on it.

- [ ] **Step 5: The background writer**

`extension/lib/store-writer.ts`:
```ts
import { browser } from 'wxt/browser';
import { writeBackup, type BackupWrites } from './backup';
import { getLang } from './i18n';
import { applySettingsPatch, type SettingsPatch } from './settings';

// settings and counters are written by the side panel and by the Studio page. Each side
// sends only what it changed, and the background applies the changes one at a time, so
// neither can undo the other's with a whole-object write from a stale copy.
export type StorePatch =
  | { key: 'settings'; patch: SettingsPatch }
  | { key: 'counters'; patch: Record<string, number> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

export async function applyStorePatch(p: StorePatch): Promise<void> {
  if (p.key !== 'settings' && p.key !== 'counters') throw new Error(`store:patch: ${String((p as { key: unknown }).key)} is not patched here`);
  const got = (await browser.storage.local.get(p.key))[p.key];
  const base = isObj(got) ? got : {};
  const next = p.key === 'settings'
    ? applySettingsPatch(base, p.patch)
    : { ...base, ...Object.fromEntries(Object.entries(p.patch).filter(([, v]) => Number.isFinite(v))) };
  await browser.storage.local.set({ [p.key]: next });
}

export const patchStore = (p: StorePatch) => serial(() => applyStorePatch(p));

// Import replaces settings as a whole: in the same queue, so a patch can't land in between.
export const writeBackupInOrder = (w: BackupWrites) => serial(() => writeBackup(w));

// The userscript stored the language on its first load; a new install's language must
// not flip to Thai later just because presets get saved.
export const ensureLang = () =>
  serial(async () => {
    const s = (await browser.storage.local.get('settings')).settings;
    if (isObj(s) && (s.lang === 'th' || s.lang === 'en')) return;
    await applyStorePatch({ key: 'settings', patch: { lang: getLang() } });
  });
```

In `extension/lib/messages.ts` add the imports `import type { BackupWrites } from './backup';` and `import type { StorePatch } from './store-writer';`, and to `ProtocolMap` under `// content → background`:
```ts
  // settings / counters changes (lib/store-writer.ts); also sent by the side panel
  'store:patch'(p: StorePatch): void;
  // side panel → background: Settings → Import
  'backup:write'(w: BackupWrites): void;
```

In `extension/entrypoints/background.ts`: import `{ ensureLang, patchStore, writeBackupInOrder }` from `@/lib/store-writer`; change the `ready` line to
```ts
  const ready = initI18n().then(runMigrations).then(ensureLang).catch((e) => console.error('[ytup] startup', e));
```
and add after the `ensureMigrated` handler:
```ts
  // The one writer of settings and counters (lib/store-writer.ts).
  onMessage('store:patch', async ({ data }) => {
    await ready;
    await patchStore(data);
  });
  onMessage('backup:write', async ({ data }) => {
    await ready;
    await writeBackupInOrder(data);
  });
```

- [ ] **Step 6: The page sends patches**

In `extension/lib/studio/state.ts`:

1. Imports become:
```ts
import { getLang, setLang } from '../i18n';
import { sendMessage } from '../messages';
import { SCHEMA_VERSION } from '../migrations';
import { defaultPresets, type Preset } from '../presets';
import { applySettingsPatch, countersDiff, defaultSettings, loadSettings, mergeSettings, settingsDiff, type Settings } from '../settings';
import { load as loadStored } from '../storage';
import type { StorePatch } from '../store-writer';
import { createMemoryStore, createSyncStore, type SyncStore } from '../sync-store';
```
2. Replace the lines from `export const load = …` through `export const flushState = () => kv.flush();` with:
```ts
export const load = <T>(key: string, fallback: T): T => kv.get(key, fallback);
export const onStored = (key: string, fn: (value: unknown) => void) => kv.onChange(key, fn);

// settings and counters are written by the side panel too. Once initState() has run, a
// save sends only what changed to the background (lib/store-writer.ts), and the change
// stays applied on top of what storage holds until the background's write comes back.
type Patcher = (p: StorePatch) => Promise<void>;
interface Pending { p: StorePatch; done: boolean }
let patcher: Patcher | null = null;
const pending: Pending[] = [];
const patchWrites = new Set<Promise<void>>();

export const save = (key: string, value: unknown): void => {
  if (!patcher || (key !== 'settings' && key !== 'counters')) return kv.set(key, value);
  const p: StorePatch = key === 'settings'
    ? { key, patch: settingsDiff(effectiveSettings(), value as Settings) }
    : { key, patch: countersDiff(effectiveCounters(), value as Record<string, number>) };
  if (!Object.keys(p.patch).length) return;
  const entry: Pending = { p, done: false };
  pending.push(entry);
  const w = patcher(p).then(
    // Kept until storage's echo arrives (dropDone), so the value never flips back meanwhile.
    () => void (entry.done = true),
    (e) => {
      console.error(`[ytup] storage write failed for ${key}`, e);
      pending.splice(pending.indexOf(entry), 1);
      refresh(key);
    },
  );
  patchWrites.add(w);
  void w.finally(() => patchWrites.delete(w));
};

export const flushState = async (): Promise<void> => {
  await kv.flush();
  while (patchWrites.size) await Promise.all([...patchWrites]);
};
```
3. Below `export const saveSettings = () => save('settings', settings);` add:
```ts
// Alt+1…9 in the page and the side panel's default-preset choice (a plain value: last write wins).
export function setActiveId(id: string): void {
  activeId = id;
  save('activeId', id);
}
```
4. Replace `refreshSettings` and `refreshCounters` with:
```ts
function effectiveSettings(): Settings {
  let stored = load<Record<string, unknown>>('settings', {});
  for (const { p } of pending) if (p.key === 'settings') stored = applySettingsPatch(stored, p.patch);
  // Same merge as the userscript: defaults (with the pre-settings autoApply/autoNext keys) ← stored
  return mergeSettings(stored as Partial<Settings>, { autoApply: load('autoApply', true), autoNext: load('autoNext', false) });
}
function effectiveCounters(): Record<string, number> {
  let c = load<Record<string, number>>('counters', {});
  for (const { p } of pending) if (p.key === 'counters') c = { ...c, ...p.patch };
  return c;
}
// A stored value arrived: patches the background has written are in it now.
function dropDone(key: StorePatch['key']) {
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.done && pending[i]!.p.key === key) pending.splice(i, 1);
}
function refreshSettings() {
  replace(settings, effectiveSettings());
  if (settings.lang && settings.lang !== getLang()) setLang(settings.lang);
}
function refreshCounters() {
  replace(counters, effectiveCounters());
}
const refresh = (key: string) => (key === 'settings' ? refreshSettings() : refreshCounters());
```
5. `initState` takes the patcher:
```ts
export function initState(
  ensureMigrated = () => sendMessage('ensureMigrated', undefined),
  timeoutMs = 10_000,
  patch: Patcher = (p) => sendMessage('store:patch', p),
): Promise<void> {
  if (starting) return starting;
  const gen = generation;
  const p = start(ensureMigrated, timeoutMs, gen, patch);
```
(the rest of `initState` unchanged), and in `start(…, gen: number, patch: Patcher)`, after `kv = store;` add `patcher = patch;`, and change the subscriptions to:
```ts
  unsubscribe = [
    kv.onChange('settings', () => { dropDone('settings'); refreshSettings(); }),
    ...['autoApply', 'autoNext'].map((k) => kv.onChange(k, refreshSettings)),
    kv.onChange('presets', () => { refreshPresets(); refreshActiveId(); }),
    kv.onChange('activeId', refreshActiveId),
    kv.onChange('counters', () => { dropDone('counters'); refreshCounters(); }),
  ];
```
6. In `disposeState()`, before `kv.dispose();` add `patcher = null; pending.length = 0;`.

`defaultSettings` stays imported (it is still used by `settings` at module load).

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/store-writer.test.ts tests/settings.test.ts tests/state.test.ts tests/migrations.test.mjs tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 8: Full check**

Run: `npm run check`
Expected: tsc clean; all tests pass (373 − 4 replaced + 4 settings + 6 store-writer + 2 state = 381); port-check `ok` ×14. If `tsc` reports a use of `settings.glass` anywhere, that code is dead with the drawer gone: delete the use.

- [ ] **Step 9: Commit**

```bash
git add extension/lib/settings.ts extension/lib/store-writer.ts extension/lib/migrations.ts extension/lib/messages.ts extension/lib/studio/state.ts extension/entrypoints/background.ts extension/tests/store-writer.test.ts extension/tests/settings.test.ts extension/tests/state.test.ts extension/tests/migrations.test.mjs
git commit -m "One writer for settings and counters; drop the glass opacity setting

The side panel and the Studio page both changed settings with whole-object
writes from their own copies. Both now send patches to the background, which
applies them one at a time. Migration 5 removes glass/glassV2 (and runs on
imported userscript backups, BACKUP_SCHEMA 4). loadSettings no longer writes;
the background stores the starting language once.

The ported migrations test asserted schemaVersion 4 in three places; those
literals are now 5 — the only edit made to a ported test body.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: What the panel asks the Studio tab for — `queue:view` and `queue:edit`

**Files:**
- Create: `extension/lib/studio/queue-view.ts`, `extension/lib/studio/queue-edit.ts`, `extension/tests/queue-view.test.ts`, `extension/tests/queue-edit.test.ts`
- Modify: `extension/lib/messages.ts`, `extension/lib/studio/content-ui.ts`, `extension/entrypoints/studio.content.ts`

**Interfaces:**
- Consumes: from `queue-runner`: `queue`, `running`, `stopReq`, `uploadProg`, `currentItemId`, `assignNumbers`, `saveMemo`, `itemPublishAt`, `itemTracklist`, `itemVars`, `scheduleOn`, `effectiveStart`, `startIsPast`, `scheduleProblem`, `queueSlots`, `takenSlots`, `refreshChanSched`, `readText`, `isTxt`, `isImg`, `fileMeta`, `QueueItem`; `getChannel`, `chanLabel`, `channelProblem` (`channel.ts`); `presetById`, `presets`, `activeId`, `settings`, `onStored` (`state.ts`); `bridgeFiles`, `dropFiles` (`queue-files.ts`); `fixChapters`, `TracklistCheck` (`lib/chapters.ts`); `ui` (`page-ui.ts`); `mayEdit` (`queue-sync.ts`).
- Produces:
  - `lib/studio/queue-view.ts`: `interface ChannelView { id; name; avatar; handle; label: string; problem: string }`, `channelView(): ChannelView`; `type ViewItem = QueueItem & { at: number | null; timeProblem: string; artists: string; usesArtists: boolean; tracklist: TracklistCheck | null; fixChanges: string[] }`; `interface ScheduleView { on: boolean; set: boolean; start: number; late: boolean; times: number[]; skipped: number; taken: number[] }`; `interface QueueView { items: ViewItem[]; current: string | null; schedule: ScheduleView; channel: ChannelView; state: QueueState }`; `queueView(state: QueueState): QueueView`.
  - `lib/studio/queue-edit.ts`: `type QueueEdit` (union below); `editQueue(e: QueueEdit): Promise<void>`; `followStoredChanges(): () => void`.
  - `lib/messages.ts`: `QueueState` gains `channel: ChannelView`; `ProtocolMap['queue:view'](): QueueView`; `ProtocolMap['queue:edit'](e: QueueEdit): void`.
  - `content-ui.ts`: `ui.state(): QueueState`.

`QueueEdit` (each is one control of the drawer's card or toolbar; line numbers are the pinned userscript):
```ts
export type QueueEdit =
  | { op: 'title'; id: string; title: string }          // titleIn oninput 3761
  | { op: 'resetTitle'; id: string }                    // resetBtn 3765
  | { op: 'artists'; id: string; artists: string }      // artistsIn 3768
  | { op: 'publishAt'; id: string; at: number | null }  // whenIn 3771 / whenReset 3781 (null)
  | { op: 'preset'; id: string; presetId: string }      // presetSel 3786
  | { op: 'move'; id: string; by: -1 | 1 }              // up/down 3803
  | { op: 'presetAll'; presetId: string }               // "Apply to all" 3576
  | { op: 'attach'; id: string; fileIds: string[] }     // attachToItem 3938 (files the panel stored)
  | { op: 'dropTxt'; id: string }                       // .txt chip ✕ 3963
  | { op: 'dropThumb'; id: string }                     // thumbnail chip ✕ 4003
  | { op: 'fixTracklist'; id: string };                 // "Fix tracklist" 3970
```

- [ ] **Step 1: Write the failing tests**

`extension/tests/queue-view.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueState } from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';
import { queueView } from '../lib/studio/queue-view';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

const ui = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast() {}, openDrawer() {}, notifyDone() {},
  setTitleMark() {}, confirmStart: async () => false,
} satisfies PageUi;
const item = (id: string, status: Q.QueueItem['status'], extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 1, title: 't',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});
const state = { running: false, stopping: false, prog: null, rev: 1 } as unknown as QueueState;

beforeEach(() => {
  vi.stubGlobal('document', makeDocument());
  vi.stubGlobal('location', { pathname: '/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos' });
  setPageUi(ui);
  Q.queue.splice(0);
  settings.schedule = { on: false, start: '', every: 1, unit: 'day' };
});
afterEach(() => vi.unstubAllGlobals());

describe('queueView', () => {
  it('copies the items and adds what only the runner knows', () => {
    Q.queue.push(item('a', 'pending', { txt: '0:00 A - One\n3:00 B - Two\n6:00 C - Three' }), item('b', 'done'));
    const v = queueView(state);
    expect(v.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(v.items[0]!.tracklist?.count).toBe(3);
    expect(v.items[0]!.usesArtists).toBe(true); // the trapsoul preset title has {artists}
    expect(v.items[0]!.artists).toBe('A, B, C');
    expect(v.items[1]!.tracklist).toBe(null);
    expect(v.channel.id).toBe('UCaaaaaaaaaaaaaaaaaaaaaa');
    expect(v.state).toBe(state);
    v.items[0]!.title = 'changed'; // a copy: the panel can't reach the runner's items
    expect(Q.queue[0]!.title).toBe('t');
  });

  it('schedules: release times per item and the box summary', () => {
    const start = new Date(Date.now() + 86400e3);
    start.setMinutes(0, 0, 0);
    settings.schedule = { on: true, start: Q.toLocalInput(start.getTime()), every: 1, unit: 'day' };
    Q.queue.push(item('a', 'pending'), item('b', 'pending'));
    const v = queueView(state);
    expect(v.schedule).toMatchObject({ on: true, set: true, late: false, skipped: 0 });
    expect(v.items.map((i) => i.at)).toEqual([start.getTime(), start.getTime() + 86400e3]);
    expect(v.schedule.times).toEqual([start.getTime(), start.getTime() + 86400e3]);
  });

  it('a release time in the past is a problem only while the item can still change', () => {
    Q.queue.push(item('a', 'error', { publishEdited: true, publishAt: Date.now() - 1000 }), item('b', 'done', { publishFinal: Date.now() - 1000 }));
    settings.schedule = { on: true, start: Q.toLocalInput(Date.now() + 86400e3), every: 1, unit: 'day' };
    const [a, b] = queueView(state).items;
    expect(a!.timeProblem).toBe('Release time must be at least 15 minutes in the future');
    expect(b!.timeProblem).toBe('');
  });
});
```

`extension/tests/queue-edit.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as files from '../lib/studio/queue-files';
import * as Q from '../lib/studio/queue-runner';
import { editQueue } from '../lib/studio/queue-edit';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

const calls: string[] = [];
const ui = {
  item() {}, run() {}, queue: () => void calls.push('queue'), schedule() {}, presetPreview() {},
  toast: (m: string) => void calls.push(`toast:${m}`), openDrawer() {}, notifyDone() {}, setTitleMark() {},
  confirmStart: async () => false,
} satisfies PageUi;
const item = (id: string, status: Q.QueueItem['status'], extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});
const qfile = (name: string, qid: string, body = '') => Object.assign(new File([body], name), { qid, src: 'bridge' as const });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('document', makeDocument());
  vi.stubGlobal('location', { pathname: '/' });
  setPageUi(ui);
  calls.length = 0;
  Q.queue.splice(0);
});
afterEach(() => vi.unstubAllGlobals());

describe('editQueue', () => {
  it('title: typed by hand, kept through renumbering; reset regenerates it', async () => {
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'title', id: 'a', title: 'Mine' });
    expect(Q.queue[0]).toMatchObject({ title: 'Mine', titleEdited: true });
    Q.assignNumbers();
    expect(Q.queue[0]!.title).toBe('Mine');
    await editQueue({ op: 'resetTitle', id: 'a' });
    expect(Q.queue[0]!.titleEdited).toBe(false);
    expect(Q.queue[0]!.title).not.toBe('Mine');
    expect(calls).toEqual(['queue', 'queue']);
  });

  it('artists: empty goes back to automatic', async () => {
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'artists', id: 'a', artists: 'SZA' });
    expect(Q.queue[0]).toMatchObject({ artists: 'SZA', artistsEdited: true });
    await editQueue({ op: 'artists', id: 'a', artists: '  ' });
    expect(Q.queue[0]!.artistsEdited).toBe(false);
  });

  it('release time: set by hand, null goes back to the queue time', async () => {
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'publishAt', id: 'a', at: 1_900_000_000_000 });
    expect(Q.queue[0]).toMatchObject({ publishAt: 1_900_000_000_000, publishEdited: true });
    await editQueue({ op: 'publishAt', id: 'a', at: null });
    expect(Q.queue[0]).toMatchObject({ publishAt: null, publishEdited: false });
  });

  it('nothing changes on an item that is uploading, done, or being fetched for upload', async () => {
    Q.queue.push(item('a', 'uploading'), item('b', 'done'));
    await editQueue({ op: 'title', id: 'a', title: 'x' });
    await editQueue({ op: 'title', id: 'b', title: 'x' });
    expect(Q.queue.map((i) => i.title)).toEqual(['', '']);
    expect(calls).toEqual([]);
  });

  it('move swaps with a neighbour that can still change, never past one that cannot', async () => {
    Q.queue.push(item('a', 'done'), item('b', 'pending'), item('c', 'error'));
    await editQueue({ op: 'move', id: 'b', by: -1 });
    expect(Q.queue.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    await editQueue({ op: 'move', id: 'b', by: 1 });
    expect(Q.queue.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('preset per item and for all items not yet uploaded', async () => {
    Q.queue.push(item('a', 'pending', { titleEdited: true }), item('b', 'done', { presetId: 'lofi' }), item('c', 'error'));
    await editQueue({ op: 'preset', id: 'a', presetId: 'lofi' });
    expect(Q.queue[0]).toMatchObject({ presetId: 'lofi', titleEdited: false });
    await editQueue({ op: 'presetAll', presetId: 'shorts' });
    expect(Q.queue.map((i) => i.presetId)).toEqual(['shorts', 'lofi', 'shorts']);
  });

  it('attach: a .txt is read and let go, a thumbnail replaces the old one', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    vi.spyOn(files, 'bridgeFiles').mockResolvedValue({
      files: [qfile('a.txt', 't1', '0:00 X - Y'), qfile('a.jpg', 'i1')], failed: [],
    });
    Q.queue.push(item('a', 'pending', { titleEdited: true, thumb: { id: 'old', src: 'bridge', name: 'o.jpg', size: 1, type: '' } }));
    await editQueue({ op: 'attach', id: 'a', fileIds: ['t1', 'i1'] });
    expect(Q.queue[0]).toMatchObject({ txt: '0:00 X - Y', txtName: 'a.txt', titleEdited: false, thumb: { id: 'i1', name: 'a.jpg' } });
    expect(drop.mock.calls.flat(2).map((r) => r.id).sort()).toEqual(['old', 't1']);
  });

  it('attach to an item that started uploading meanwhile lets every file go', async () => {
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    vi.spyOn(files, 'bridgeFiles').mockImplementation(async () => {
      Q.queue[0]!.status = 'uploading';
      return { files: [qfile('a.txt', 't1')], failed: [] };
    });
    Q.queue.push(item('a', 'pending'));
    await editQueue({ op: 'attach', id: 'a', fileIds: ['t1'] });
    expect(Q.queue[0]!.txt).toBe('');
    expect(drop).toHaveBeenCalledWith([{ id: 't1', src: 'bridge' }]);
  });

  it('dropping the thumbnail lets its file go; dropping the .txt resets the title', async () => {
    vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const drop = vi.spyOn(files, 'dropFiles').mockImplementation(() => {});
    Q.queue.push(item('a', 'pending', { txt: 'x', txtName: 'a.txt', titleEdited: true, thumb: { id: 'i', src: 'bridge', name: 'a.jpg', size: 1, type: '' } }));
    await editQueue({ op: 'dropThumb', id: 'a' });
    expect(Q.queue[0]!.thumb).toBe(null);
    expect(drop).toHaveBeenCalledWith([{ id: 'i', src: 'bridge' }]);
    await editQueue({ op: 'dropTxt', id: 'a' });
    expect(Q.queue[0]).toMatchObject({ txt: '', txtName: '', titleEdited: false });
  });

  it('fix tracklist rewrites the .txt and says what changed', async () => {
    Q.queue.push(item('a', 'pending', { txt: '0:05 A - One\n3:00 B - Two\n6:00 C - Three' }));
    await editQueue({ op: 'fixTracklist', id: 'a' });
    expect(Q.queue[0]!.txt.startsWith('0:00')).toBe(true);
    expect(calls.some((c) => c.startsWith('toast:Tracklist fixed: '))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/queue-view.test.ts tests/queue-edit.test.ts`
Expected: FAIL — the modules don't exist.

- [ ] **Step 3: `queue-view.ts`**

`extension/lib/studio/queue-view.ts`:
```ts
import { fixChapters, type TracklistCheck } from '../chapters';
import type { QueueState } from '../messages';
import { chanLabel, channelProblem, getChannel, type Channel } from './channel';
import {
  currentItemId, effectiveStart, itemPublishAt, itemTracklist, itemVars, queue, queueSlots, refreshChanSched,
  scheduleOn, scheduleProblem, startIsPast, takenSlots, type QueueItem,
} from './queue-runner';
import { presetById, settings } from './state';

// What the side panel shows that only the Studio tab can work out: the drawer's
// updateItemUI() / renderAttachments() / onScheduleChange() / updateChannelUI() read
// these from the runner directly. The panel asks for a fresh copy whenever the page says
// something changed (QueueState.rev / channel) or storage did.
export interface ChannelView extends Channel { label: string; problem: string }
export const channelView = (): ChannelView => {
  const c = getChannel();
  return { ...c, label: chanLabel(c), problem: channelProblem() };
};

export type ViewItem = QueueItem & {
  at: number | null; // itemPublishAt(): the release time this item will get, or null
  timeProblem: string; // scheduleProblem(at) while the item can still change
  artists: string; // what {artists} becomes (typed on the card, or from the .txt)
  usesArtists: boolean; // the preset mentions {artists}: the card shows the Artists field
  tracklist: TracklistCheck | null; // the chapter check of the description it will get
  fixChanges: string[]; // what "Fix tracklist" would change (only offered while there are errors)
};

export interface ScheduleView {
  on: boolean; // the switch
  set: boolean; // scheduleOn(): switched on and a start time picked
  start: number; // effectiveStart() when set
  late: boolean; // startIsPast()
  times: number[]; // release times of the items not done, earliest first
  skipped: number; // slots skipped because the channel already has videos there
  taken: number[]; // the channel's scheduled videos (from Phase 4's youtubei)
}

export interface QueueView {
  items: ViewItem[];
  current: string | null; // the item the run is working on (Remove stays hidden on it)
  schedule: ScheduleView;
  channel: ChannelView;
  state: QueueState;
}

export function queueView(state: QueueState): QueueView {
  const set = scheduleOn();
  if (set) void refreshChanSched(); // as onScheduleChange() did; cached 5 min, ends in ui.schedule()
  const items = queue.map((it): ViewItem => {
    const editable = it.status === 'pending' || it.status === 'error';
    const p = presetById(it.presetId);
    const at = itemPublishAt(it);
    const tracklist = it.txt ? itemTracklist(it) : null;
    return {
      ...structuredClone(it),
      at,
      timeProblem: editable ? scheduleProblem(at) : '',
      artists: itemVars(it).artists,
      usesArtists: `${p.title} ${p.description} ${(p.tags || []).join(' ')}`.includes('{artists}'),
      tracklist,
      fixChanges: tracklist && tracklist.errors.length && editable ? fixChapters(it.txt).changes : [],
    };
  });
  return {
    items,
    current: currentItemId(),
    schedule: {
      on: !!settings.schedule.on,
      set,
      start: set ? effectiveStart() : 0,
      late: set && startIsPast(),
      times: queue.filter((i) => i.status !== 'done').map(itemPublishAt).filter((t): t is number => !!t).sort((a, b) => a - b),
      skipped: set ? queueSlots().skipped : 0,
      taken: set ? takenSlots().map((x) => x.at) : [],
    },
    channel: channelView(),
    state,
  };
}
```

- [ ] **Step 4: `queue-edit.ts`**

`extension/lib/studio/queue-edit.ts`:
```ts
import { fixChapters } from '../chapters';
import { L } from '../i18n';
import { ui } from './page-ui';
import { bridgeFiles, dropFiles } from './queue-files';
import { assignNumbers, currentItemId, fileMeta, isImg, isTxt, queue, readText, saveMemo, type FileSrc, type QueueItem } from './queue-runner';
import { activeId, onStored, presets } from './state';

// The drawer's queue-card controls (UI section 3752–4024) and its "Apply to all" button,
// as operations the side panel sends. Each does what the control's handler did, then
// what updateItemUI()/renderQueue() did to the data: remember the edits (saveMemo) and
// save + tell the panel (ui.queue()).
export type QueueEdit =
  | { op: 'title'; id: string; title: string }
  | { op: 'resetTitle'; id: string }
  | { op: 'artists'; id: string; artists: string }
  | { op: 'publishAt'; id: string; at: number | null }
  | { op: 'preset'; id: string; presetId: string }
  | { op: 'move'; id: string; by: -1 | 1 }
  | { op: 'presetAll'; presetId: string }
  | { op: 'attach'; id: string; fileIds: string[] }
  | { op: 'dropTxt'; id: string }
  | { op: 'dropThumb'; id: string }
  | { op: 'fixTracklist'; id: string };

// The card's inputs were disabled unless the item was waiting or had failed; the item
// the run is fetching a file for is still 'pending' but is no longer the user's.
const canEdit = (it: QueueItem | undefined): it is QueueItem =>
  !!it && (it.status === 'pending' || it.status === 'error') && it.id !== currentItemId();
const done = () => {
  saveMemo();
  ui.queue();
};

export async function editQueue(e: QueueEdit): Promise<void> {
  if (e.op === 'presetAll') {
    for (const it of queue) if (it.status === 'pending' || it.status === 'error') { it.presetId = e.presetId; it.titleEdited = false; }
    assignNumbers();
    return done();
  }
  const it = queue.find((x) => x.id === e.id);
  if (e.op === 'attach') return attach(it, e.fileIds);
  if (!canEdit(it)) return;
  switch (e.op) {
    case 'title':
      it.title = e.title;
      it.titleEdited = true;
      break;
    case 'resetTitle':
      it.titleEdited = false;
      assignNumbers();
      break;
    case 'artists':
      it.artists = e.artists;
      it.artistsEdited = !!e.artists.trim();
      assignNumbers();
      break;
    case 'publishAt':
      it.publishEdited = !!e.at;
      it.publishAt = e.at || null;
      break;
    case 'preset':
      it.presetId = e.presetId;
      it.titleEdited = false;
      assignNumbers();
      break;
    case 'move': {
      const i = queue.indexOf(it);
      const other = queue[i + e.by];
      if (!canEdit(other)) return;
      [queue[i], queue[i + e.by]] = [other, it];
      assignNumbers();
      break;
    }
    case 'dropTxt':
      it.txt = '';
      it.txtName = '';
      it.titleEdited = false;
      assignNumbers();
      break;
    case 'dropThumb':
      if (it.thumb) dropFiles([{ id: it.thumb.id, src: it.thumb.src }]);
      it.thumb = null;
      break;
    case 'fixTracklist': {
      const fx = it.txt ? fixChapters(it.txt) : null;
      if (!fx || !fx.changes.length) return;
      it.txt = fx.text;
      it.titleEdited = false;
      assignNumbers();
      ui.toast(L('แก้ tracklist แล้ว: ', 'Tracklist fixed: ') + fx.changes.join(' · '));
      break;
    }
  }
  done();
}

// attachToItem(): .txt files become the description, an image the thumbnail. The panel
// stored the files' handles under fresh ids; files no item keeps are let go.
async function attach(it: QueueItem | undefined, ids: string[]): Promise<void> {
  if (!canEdit(it)) return dropFiles(ids.map((id) => ({ id, src: 'bridge' })));
  const { files, failed } = await bridgeFiles(ids);
  if (failed.length) ui.toast(L(`เพิ่มไม่ได้ ${failed.length} ไฟล์: `, `Could not add ${failed.length} file(s): `) + failed[0]!.reason);
  if (!canEdit(it)) return dropFiles(files.map((f) => ({ id: f.qid, src: f.src })));
  const unused: { qid: string; src: FileSrc }[] = [];
  for (const f of files) {
    if (isTxt(f)) {
      it.txt = await readText(f);
      it.txtName = f.name;
      unused.push(f); // read: the file itself is no longer needed
    } else if (isImg(f)) {
      if (it.thumb) unused.push({ qid: it.thumb.id, src: it.thumb.src });
      it.thumb = { id: f.qid, src: f.src, ...fileMeta(f) };
    } else unused.push(f);
  }
  if (unused.length) dropFiles(unused.map((f) => ({ id: f.qid, src: f.src })));
  it.titleEdited = false;
  assignNumbers();
  done();
}

// Presets, the default preset, EP counters and settings are changed in the side panel.
// The drawer re-rendered the queue after each (refreshLabels / renderQueue): titles and
// numbers follow, and items whose preset was deleted move to the default preset.
// Coalesced: one write from the panel can change several keys.
export function followStoredChanges(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requeue = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const it of queue) if (!presets.some((p) => p.id === it.presetId)) it.presetId = activeId;
      assignNumbers();
      ui.queue();
    }, 0);
  };
  const offs = ['presets', 'activeId', 'counters', 'settings'].map((k) => onStored(k, requeue));
  return () => {
    clearTimeout(timer);
    for (const off of offs) off();
  };
}
```

- [ ] **Step 5: Messages, the page's state, wiring**

In `extension/lib/messages.ts`:
- Add `import type { QueueEdit } from './studio/queue-edit';` and `import type { ChannelView, QueueView } from './studio/queue-view';`.
- `QueueState` gains `channel: ChannelView; // what the channel bar shows; a change makes the panel re-read`.
- Under `// side panel → content (the Studio tab)` add:
```ts
  'queue:view'(): QueueView;
  'queue:edit'(e: QueueEdit): void;
```

In `extension/lib/studio/content-ui.ts`:
- `import { channelView } from './queue-view';`
- `broadcast` builds the state through a new `state()` function:
```ts
  const state = (): QueueState => ({ running, stopping: running && stopReq, prog: uploadProg, rev, channel: channelView() });
  const broadcast = () => {
    const s = state();
    const sig = JSON.stringify(s);
    if (sig === last) return;
    last = sig;
    sendMessage('queue:state', s).catch(() => {}); // fails when no side panel is open
  };
```
- The `ui` type gains `state(): QueueState`, and the object gains `state,` (after `tick()`).

In `extension/entrypoints/studio.content.ts`, import `{ editQueue, followStoredChanges }` from `@/lib/studio/queue-edit` and `{ queueView }` from `@/lib/studio/queue-view`, and after the `onMessage('queue:clearDone', …)` handler add:
```ts
    onMessage('queue:view', () => queueView(ui.state()));
    onMessage('queue:edit', async ({ data }) => {
      if (await mayEdit()) await editQueue(data);
    });
    stop.add(followStoredChanges());
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/queue-view.test.ts tests/queue-edit.test.ts tests/content-ui.test.ts tests/queue-ops.test.ts`
Expected: PASS. (`content-ui.test.ts` may compare a broadcast `QueueState` literally: if it fails only because the state now has `channel`, add `channel: expect.any(Object)` to that expected object.)

- [ ] **Step 7: Full check and commit**

Run: `npm run check` → all pass, port-check `ok` ×14.
```bash
git add extension/lib/studio/queue-view.ts extension/lib/studio/queue-edit.ts extension/lib/messages.ts extension/lib/studio/content-ui.ts extension/entrypoints/studio.content.ts extension/tests/queue-view.test.ts extension/tests/queue-edit.test.ts extension/tests/content-ui.test.ts
git commit -m "Studio tab answers queue:view and applies queue:edit for the side panel

The runner stays authoritative for the queue: the panel asks for items plus what
only the runner computes (release times, tracklist checks, channel), and sends
the drawer's card edits as operations. Preset, counter and settings changes
renumber the queue as the drawer's refreshLabels did.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Channel memory, a real channel switch, Alt shortcuts, language everywhere; dev handlers out

**Files:**
- Create: `extension/lib/studio/channels.ts`, `extension/lib/studio/shortcuts.ts`, `extension/tests/channels.test.ts`, `extension/tests/shortcuts.test.ts`
- Modify: `extension/lib/studio/state.ts`, `extension/lib/i18n.ts`, `extension/lib/messages.ts`, `extension/entrypoints/studio.content.ts`, `extension/entrypoints/invite.content.ts`, `extension/entrypoints/background.ts`, `extension/entrypoints/sidepanel/main.ts` + `index.html` (the developer panel loses its two dev controls; it is deleted in Task 5)
- Test (modify): `extension/tests/i18n.test.ts`

**Interfaces:**
- Consumes: `getChannel`, `Channel` (`channel.ts`); `load`, `save`, `presets`, `setActiveId` (`state.ts`); `running` (`queue-runner.ts`); `ui` (`page-ui.ts`); `createChannelSwitch(env).switchToChannel` (`lib/channel-switch.ts`).
- Produces:
  - `lib/studio/state.ts`: `STATE_KEYS` gains `'channels'` and `'fabPos'`.
  - `lib/studio/channels.ts`: `interface StoredChannel { id: string; name: string; avatar: string; handle: string }`; `rememberChannel(c: Channel): void`; `interface SwitchRequest { name: string; handle: string; next: string }`; `switchChannel(sw: { switchToChannel(t: { name?: string; handle?: string }, next: string): void }, req: SwitchRequest, isRunning?: () => boolean): void`.
  - `lib/studio/shortcuts.ts`: `installShortcuts(): () => void`.
  - `lib/i18n.ts`: `watchLang(onChange?: (l: Lang) => void): () => void`.
  - `lib/messages.ts`: `ProtocolMap['channel:switch'](req: SwitchRequest): void`; `spike:cfg` and `dev:switchChannel` removed.

- [ ] **Step 1: Write the failing tests**

`extension/tests/channels.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { rememberChannel, switchChannel } from '../lib/studio/channels';
import { load, save } from '../lib/studio/state';

const toasts: string[] = [];
const ui = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast: (m: string) => void toasts.push(m),
  openDrawer() {}, notifyDone() {}, setTitleMark() {}, confirmStart: async () => false,
} satisfies PageUi;
const ch = (id: string, name: string, extra = {}) => ({ id, name, avatar: '', handle: '', ...extra });

beforeEach(() => {
  setPageUi(ui);
  toasts.length = 0;
  save('channels', []);
});
afterEach(() => vi.restoreAllMocks());

describe('rememberChannel (the drawer remembered every channel it saw)', () => {
  it('puts the current channel first, once', () => {
    save('channels', [ch('UC1', 'One')]);
    rememberChannel(ch('UC2', 'Two'));
    rememberChannel(ch('UC2', 'Two'));
    expect(load('channels', []).map((c: { id: string }) => c.id)).toEqual(['UC2', 'UC1']);
  });

  it('keeps a known handle when the page shows none, and skips a channel without a name', () => {
    save('channels', [ch('UC1', 'One', { handle: '@one' })]);
    rememberChannel(ch('UC1', 'One renamed'));
    expect(load('channels', [])).toEqual([ch('UC1', 'One renamed', { handle: '@one' })]);
    rememberChannel(ch('UC3', ''));
    expect(load('channels', [])).toHaveLength(1);
  });
});

describe('switchChannel', () => {
  const sw = { switchToChannel: vi.fn() };
  beforeEach(() => sw.switchToChannel.mockClear());

  it('goes through the channel switcher', () => {
    switchChannel(sw, { name: 'Two', handle: '@two', next: 'https://studio.youtube.com/channel/UC2' }, () => false);
    expect(sw.switchToChannel).toHaveBeenCalledWith({ name: 'Two', handle: '@two' }, 'https://studio.youtube.com/channel/UC2');
  });

  it('only continues to Studio', () => {
    expect(() => switchChannel(sw, { name: '', handle: '', next: 'https://evil.example/' }, () => false)).toThrow('Studio');
    expect(sw.switchToChannel).not.toHaveBeenCalled();
  });

  it('not while the queue runs in this tab', () => {
    switchChannel(sw, { name: 'Two', handle: '', next: 'https://studio.youtube.com/' }, () => true);
    expect(sw.switchToChannel).not.toHaveBeenCalled();
    expect(toasts).toEqual(['Upload queue is still running — switching channels now would stop it']);
  });
});
```

`extension/tests/shortcuts.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { installShortcuts } from '../lib/studio/shortcuts';
import * as state from '../lib/studio/state';

const calls: string[] = [];
const ui = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast: (m: string) => void calls.push(`toast:${m}`),
  openDrawer: () => void calls.push('open'), notifyDone() {}, setTitleMark() {}, confirmStart: async () => false,
} satisfies PageUi;
let handler: (e: Partial<KeyboardEvent>) => void;
const key = (code: string, extra: Partial<KeyboardEvent> = {}) => {
  const e = { altKey: true, ctrlKey: false, metaKey: false, code, target: { tagName: 'DIV' } as unknown as EventTarget, preventDefault: vi.fn(), ...extra };
  handler(e);
  return e;
};

beforeEach(() => {
  calls.length = 0;
  setPageUi(ui);
  vi.stubGlobal('document', {
    addEventListener: (_: string, fn: typeof handler) => (handler = fn),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('navigator', { platform: 'Win32' });
});
afterEach(() => vi.unstubAllGlobals());

describe('installShortcuts', () => {
  it('Alt+2 makes the second preset the default and says so', () => {
    installShortcuts();
    const e = key('Digit2');
    expect(state.activeId).toBe(state.presets[1]!.id);
    expect(calls).toEqual([`toast:Main preset: ${state.presets[1]!.label}`]);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Alt+P asks for the side panel', () => {
    installShortcuts();
    key('KeyP');
    expect(calls).toEqual(['open']);
  });

  it('on a Mac, Option+key while typing is a character, not a shortcut', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    installShortcuts();
    key('Digit1', { target: { tagName: 'INPUT' } as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it('ignores Ctrl/Cmd combinations and digits without a preset', () => {
    installShortcuts();
    key('Digit1', { ctrlKey: true });
    key('Digit9');
    expect(calls).toEqual([]);
  });
});
```

Add to `extension/tests/i18n.test.ts` (and add `watchLang` to its import from `'../lib/i18n'`):
```ts
  it('watchLang follows a language change made in another context', async () => {
    const seen: string[] = [];
    const off = watchLang((l) => seen.push(l));
    await browser.storage.local.set({ settings: { lang: 'th' } });
    expect(getLang()).toBe('th');
    await browser.storage.local.set({ settings: { lang: 'th', delay: 3 } }); // same language: no call
    off();
    await browser.storage.local.set({ settings: { lang: 'en' } });
    expect(seen).toEqual(['th']);
    expect(getLang()).toBe('th'); // stopped following
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/channels.test.ts tests/shortcuts.test.ts tests/i18n.test.ts`
Expected: FAIL — modules and `watchLang` missing.

- [ ] **Step 3: Implement**

`extension/lib/studio/channels.ts`:
```ts
import { L } from '../i18n';
import type { Channel } from './channel';
import { ui } from './page-ui';
import { running } from './queue-runner';
import { load, save } from './state';

// The drawer remembered every channel it was opened on (rememberChannel, UI section 3355),
// for the channel list. Read fresh each time: several Studio tabs write this list.
export interface StoredChannel { id: string; name: string; avatar: string; handle: string }

export function rememberChannel(c: Channel): void {
  if (!c.id || !c.name) return;
  const channels = load<StoredChannel[]>('channels', []);
  const old = channels.find((x) => x.id === c.id);
  if (old && old.name === c.name && old.avatar === c.avatar && old.handle === (c.handle || old.handle)) return;
  save('channels', [
    { id: c.id, name: c.name, avatar: c.avatar, handle: c.handle || old?.handle || '' },
    ...channels.filter((x) => x.id !== c.id),
  ]);
}

// The channel list's "Switch" (3391): through www.youtube.com/channel_switcher, which then
// continues to `next`. A message can come from any extension page, so `next` must be Studio.
// The drawer refused while the queue held files, because they lived in the page; the files
// now survive a channel switch, so only a run in progress is refused.
export interface SwitchRequest { name: string; handle: string; next: string }

export function switchChannel(
  sw: { switchToChannel(t: { name?: string; handle?: string }, next: string): void },
  req: SwitchRequest,
  isRunning = () => running,
): void {
  if (!req.next.startsWith('https://studio.youtube.com/')) throw new Error('channel:switch: next must be a Studio URL');
  if (isRunning()) return ui.toast(L('คิวอัปโหลดยังทำงานอยู่ — สลับช่องตอนนี้คิวจะหยุด', 'Upload queue is still running — switching channels now would stop it'));
  sw.switchToChannel({ name: req.name, handle: req.handle }, req.next);
}
```

`extension/lib/studio/shortcuts.ts`:
```ts
import { L } from '../i18n';
import { ui } from './page-ui';
import { presets, setActiveId } from './state';

// The userscript's keyboard shortcuts in Studio (6386–6403): Alt+P opens the panel (the
// side panel can't be closed from a page, so it no longer toggles), Alt+1…9 picks the
// default preset. Returns a disposer.
export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    // Typing in a field: let it type (on a Mac, Option+P / Option+digit types a special character)
    const t = e.target as HTMLElement | null;
    if (/Mac/i.test(navigator.platform) && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.code === 'KeyP') {
      ui.openDrawer();
      e.preventDefault();
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const p = presets[Number(e.code.slice(5)) - 1];
      if (p) {
        setActiveId(p.id);
        ui.toast(L(`พรีเซ็ตหลัก: ${p.label}`, `Main preset: ${p.label}`));
        e.preventDefault();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
```

In `extension/lib/i18n.ts` append:
```ts
// The language is a setting the side panel changes; every context follows it at once
// (the userscript reloaded the page instead). Returns a disposer.
export function watchLang(onChange?: (l: Lang) => void): () => void {
  const fn = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !changes.settings) return;
    const l = (changes.settings.newValue as { lang?: unknown } | undefined)?.lang;
    if ((l !== 'th' && l !== 'en') || l === current) return;
    current = l;
    onChange?.(l);
  };
  browser.storage.onChanged.addListener(fn);
  return () => browser.storage.onChanged.removeListener(fn);
}
```

In `extension/lib/studio/state.ts`: `STATE_KEYS` becomes
```ts
export const STATE_KEYS = ['settings', 'autoApply', 'autoNext', 'presets', 'activeId', 'counters', 'queueMemo', 'uploads', 'queue', 'channels', 'fabPos'];
```
(`cfg`, `collabHandles`, `songHistory`, `logOpen` and the per-channel `name:channelId` keys belong to the copyright module: Phase 4 adds them, with a prefix-aware store for the per-channel keys.)

In `extension/lib/messages.ts`: import `type { SwitchRequest }` from `'./studio/channels'`; delete the `spike:cfg` and `dev:switchChannel` entries and their comment; add under `// side panel → content`:
```ts
  'channel:switch'(req: SwitchRequest): void;
```

In `extension/entrypoints/studio.content.ts`:
- Delete `onMessage('dev:switchChannel', …)` and `onMessage('spike:cfg', …)`.
- Add imports `{ rememberChannel, switchChannel }` from `@/lib/studio/channels`, `{ installShortcuts }` from `@/lib/studio/shortcuts`, `{ getChannel }` from `@/lib/studio/channel`.
- After the `queue:edit` handler add:
```ts
    onMessage('channel:switch', ({ data }) => switchChannel(sw, data));
    stop.add(installShortcuts());
```
- In the 800 ms `ctx.setInterval` callback, before `ui.tick()` inside the `try`, add `rememberChannel(getChannel());` (the drawer did this every 1.5 s in `updateChannelUI`).

In the developer panel (deleted in Task 5; until then it must still compile): in `extension/entrypoints/sidepanel/main.ts` delete the `$('#cfg').addEventListener(…)` line and the `$('#switch').addEventListener(…)` handler; in its `index.html` delete `<button id="cfg">Read ytcfg</button>` and the `<p>` holding `#handle` / `#switch`.

In `extension/entrypoints/invite.content.ts`: import `watchLang` with `initI18n`, and after `const stop = stopOnInvalidated(ctx);` add `stop.add(watchLang());`.

In `extension/entrypoints/background.ts`: import `watchLang` with `initI18n` and add `watchLang();` right after the `ready` line (migrations and notifications use the current language).

- [ ] **Step 4: Run the tests, full check, commit**

Run: `npx vitest run tests/channels.test.ts tests/shortcuts.test.ts tests/i18n.test.ts` → PASS. Then `npm run check` → all pass, port-check `ok` ×14.
```bash
git add extension/lib/studio/channels.ts extension/lib/studio/shortcuts.ts extension/lib/studio/state.ts extension/lib/i18n.ts extension/lib/messages.ts extension/entrypoints/studio.content.ts extension/entrypoints/invite.content.ts extension/entrypoints/background.ts extension/entrypoints/sidepanel extension/tests/channels.test.ts extension/tests/shortcuts.test.ts extension/tests/i18n.test.ts
git commit -m "Channel memory, channel:switch, Alt shortcuts in Studio; language followed everywhere

Removes the developer handlers spike:cfg and dev:switchChannel. channel:switch
only continues to a Studio URL and refuses while the queue runs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Strings parity and the 12px floor — `scripts/ui-check.mjs`

**Files:**
- Create: `extension/scripts/ui-check.mjs`, `extension/scripts/strings/extension-only.mjs`, `extension/scripts/strings/dropped.mjs`, `extension/tests/ui-check.test.mjs`
- Modify: `extension/package.json` (`check` script, `ui-check` script)

**Interfaces:**
- Produces: `scripts/ui-check.mjs` exports `extractPairs(text): { th: string; en: string; line: number }[]` (`${…}` inside template literals compared as `${}`), `pairKey(p)`, `userscriptPairs()`, `smallText(text): { line: number; px: number }[]`, `check({ coverage, files, us, extOnly, dropped }): string[]` (errors), `DRAWER = [2428, 4586]`. CLI: `node scripts/ui-check.mjs [--coverage]` prints `ok` or the errors and exits 1.
- `scripts/strings/extension-only.mjs` / `dropped.mjs`: `export default [{ th, en, why }]`.

- [ ] **Step 1: Write the failing test**

`extension/tests/ui-check.test.mjs`:
```js
import { describe, expect, it } from 'vitest';
import { check, extractPairs, pairKey, smallText } from '../scripts/ui-check.mjs';

const us = extractPairs([
  "L('ตกลง', 'OK')",
  'L(`ลบ ${n} รายการ`, `Delete ${n} items`)',
  "L('ไฟล์\\'s', \"File's\")",
  "L('ลาก', 'Drag')",
].join('\n')).map((p) => ({ ...p, line: 3000 }));

describe('extractPairs', () => {
  it('reads both literals, any quote style, and blanks template expressions', () => {
    expect(extractPairs("x = L(`ลบ ${it.n + 1} ไฟล์`, `Delete ${it.n + 1} file(s)`) + L('ก', \"Don't\")")).toEqual([
      { th: 'ลบ ${} ไฟล์', en: 'Delete ${} file(s)', line: 1 },
      { th: 'ก', en: "Don't", line: 1 },
    ]);
  });

  it('skips L() with a non-literal argument and other functions ending in L', () => {
    expect(extractPairs('L(a, b); URL("x", "y"); obj.L("a", "b")')).toEqual([]);
  });
});

describe('check', () => {
  const file = (text) => ({ path: 'entrypoints/sidepanel/X.tsx', text });

  it('accepts userscript pairs whatever the expression inside ${}', () => {
    expect(check({ files: [file('L(`ลบ ${count} รายการ`, `Delete ${count} items`)')], us, extOnly: [], dropped: [] })).toEqual([]);
  });

  it('flags a pair the userscript never had, unless it is listed with a reason', () => {
    const f = [file("L('ใหม่', 'New thing')")];
    expect(check({ files: f, us, extOnly: [], dropped: [] })).toEqual([
      'entrypoints/sidepanel/X.tsx:1 not in the userscript: L("ใหม่", "New thing") — add it to scripts/strings/extension-only.mjs with a reason, or use the userscript\'s pair',
    ]);
    expect(check({ files: f, us, extOnly: [{ th: 'ใหม่', en: 'New thing', why: 'test' }], dropped: [] })).toEqual([]);
  });

  it('flags a listed pair nothing uses any more', () => {
    expect(check({ files: [], us, extOnly: [{ th: 'ใหม่', en: 'New thing', why: 'test' }], dropped: [] })).toEqual([
      'scripts/strings/extension-only.mjs lists a pair no source uses: L("ใหม่", "New thing")',
    ]);
  });

  it('with coverage, every drawer pair is used or dropped with a reason', () => {
    const files = [file("L('ตกลง', 'OK'); L('ไฟล์\\'s', \"File's\"); L(`ลบ ${x} รายการ`, `Delete ${x} items`)")];
    expect(check({ coverage: true, files, us, extOnly: [], dropped: [] })).toEqual([
      'userscript:3000 drawer pair not in the panel: L("ลาก", "Drag") — use it, or add it to scripts/strings/dropped.mjs with a reason',
    ]);
    expect(check({ coverage: true, files, us, extOnly: [], dropped: [{ th: 'ลาก', en: 'Drag', why: 'test' }] })).toEqual([]);
  });

  it('flags text below 12px', () => {
    expect(smallText('a { font: 600 11px system-ui } <b class="text-[10px] text-[12px]">').map((s) => s.px)).toEqual([10, 11]);
    expect(check({ files: [file('<i className="text-[11px]">')], us, extOnly: [], dropped: [] })).toEqual([
      'entrypoints/sidepanel/X.tsx:1 text is 11px: the minimum is 12px',
    ]);
  });

  it('pairKey is th and en joined', () => {
    expect(pairKey({ th: 'a', en: 'b' })).toBe('a\u0000b');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ui-check.test.mjs`
Expected: FAIL — `scripts/ui-check.mjs` missing.

- [ ] **Step 3: The checker**

`extension/scripts/ui-check.mjs`:
```js
// Two promises the side panel rebuild makes, checked:
// 1. Strings: every L('ไทย', 'English') pair the extension ships is one the userscript had at
//    the pinned commit, or is listed in scripts/strings/extension-only.mjs with the reason it
//    is new. With --coverage, every pair of the userscript's drawer UI (lines DRAWER) is used
//    somewhere in the extension, or is listed in scripts/strings/dropped.mjs with the reason
//    the panel no longer shows it.
// 2. No style in the extension sets text below 12px.
//
//   node scripts/ui-check.mjs [--coverage]
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'd15ef87caaddb7a6d3187d2851b83a484c4bb9e7'; // userscript v4.27.1, as scripts/port-check.mjs
export const DRAWER = [2428, 4586]; // "===== UI =====" up to the copyright module (Phase 4)
const SOURCE_DIRS = ['lib', 'entrypoints', 'components'];
const MIN_PX = 12;

// L( calls whose two arguments are string literals. Template literals compare with every
// ${…} replaced by ${}, so a variable renamed in the rebuild still matches.
export function extractPairs(text) {
  const out = [];
  const n = text.length;
  const lineStarts = [0];
  for (let k = 0; k < n; k++) if (text[k] === '\n') lineStarts.push(k + 1);
  const lineOf = (idx) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStarts[m] <= idx) lo = m; else hi = m - 1; }
    return lo + 1;
  };
  const ws = (i) => { while (i < n && /\s/.test(text[i])) i++; return i; };
  const literal = (i) => {
    const q = text[i];
    if (q !== "'" && q !== '"' && q !== '`') return null;
    let j = i + 1, body = '';
    while (j < n) {
      const c = text[j];
      if (c === '\\') { body += c + text[j + 1]; j += 2; continue; }
      if (c === q) break;
      if (q === '`' && c === '$' && text[j + 1] === '{') {
        let depth = 1;
        j += 2;
        while (j < n && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
        body += '\u0001';
        continue;
      }
      if (q !== '`' && c === '\n') return null;
      body += c;
      j++;
    }
    let value;
    try { value = new Function(`return ${q}${body}${q}`)(); } catch { return null; }
    return { value: value.replace(/\u0001/g, '${}'), end: j + 1 };
  };
  const re = /(?<![\w$.])L\(/g;
  let m;
  while ((m = re.exec(text))) {
    let i = ws(m.index + 2);
    const a = literal(i);
    if (!a) continue;
    i = ws(a.end);
    if (text[i] !== ',') continue;
    const b = literal(ws(i + 1));
    if (!b) continue;
    i = ws(b.end);
    if (text[i] !== ')' && text[i] !== ',') continue;
    out.push({ th: a.value, en: b.value, line: lineOf(m.index) });
  }
  return out;
}

export const pairKey = (p) => p.th + '\u0000' + p.en;
const show = (p) => `L(${JSON.stringify(p.th)}, ${JSON.stringify(p.en)})`;

export const userscriptPairs = () =>
  extractPairs(execFileSync('git', ['show', `${PIN}:youtube-upload-presets.user.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }));

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
export const sourceFiles = (root = ROOT) =>
  SOURCE_DIRS.flatMap((d) => { try { return walk(join(root, d)); } catch { return []; } })
    .filter((p) => /\.(ts|tsx|css|html)$/.test(p) && !p.endsWith('.d.ts'))
    .map((p) => ({ path: relative(root, p), text: readFileSync(p, 'utf8') }));

// Font sizes in CSS (font-size: / font: shorthand) and Tailwind arbitrary text-[Npx].
export function smallText(text) {
  const out = [];
  const res = [/text-\[(\d+(?:\.\d+)?)px\]/g, /font-size\s*:\s*(\d+(?:\.\d+)?)px/g, /\bfont\s*:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g];
  text.split('\n').forEach((l, i) => {
    for (const re of res) for (const m of l.matchAll(re)) if (+m[1] < MIN_PX) out.push({ line: i + 1, px: +m[1] });
  });
  return out;
}

export function check({ coverage = false, files, us, extOnly, dropped }) {
  const errors = [];
  const known = new Set(us.map(pairKey));
  const listed = new Set(extOnly.map(pairKey));
  const used = new Set();
  for (const f of files) {
    if (/\.(ts|tsx)$/.test(f.path)) {
      for (const p of extractPairs(f.text)) {
        used.add(pairKey(p));
        if (!known.has(pairKey(p)) && !listed.has(pairKey(p))) {
          errors.push(`${f.path}:${p.line} not in the userscript: ${show(p)} — add it to scripts/strings/extension-only.mjs with a reason, or use the userscript's pair`);
        }
      }
    }
    for (const s of smallText(f.text)) errors.push(`${f.path}:${s.line} text is ${s.px}px: the minimum is ${MIN_PX}px`);
  }
  for (const p of extOnly) if (!used.has(pairKey(p))) errors.push(`scripts/strings/extension-only.mjs lists a pair no source uses: ${show(p)}`);
  if (coverage) {
    const gone = new Set(dropped.map(pairKey));
    const seen = new Set();
    for (const p of us) {
      if (p.line < DRAWER[0] || p.line > DRAWER[1] || seen.has(pairKey(p))) continue;
      seen.add(pairKey(p));
      if (!used.has(pairKey(p)) && !gone.has(pairKey(p))) {
        errors.push(`userscript:${p.line} drawer pair not in the panel: ${show(p)} — use it, or add it to scripts/strings/dropped.mjs with a reason`);
      }
    }
    for (const p of dropped) if (used.has(pairKey(p))) errors.push(`scripts/strings/dropped.mjs lists a pair the extension uses: ${show(p)}`);
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const load = async (name) => (await import(pathToFileURL(join(ROOT, 'scripts/strings', name)).href)).default;
  const errors = check({
    coverage: process.argv.includes('--coverage'),
    files: sourceFiles(),
    us: userscriptPairs(),
    extOnly: await load('extension-only.mjs'),
    dropped: await load('dropped.mjs'),
  });
  for (const e of errors) console.error(e);
  console.log(errors.length ? `ui-check: ${errors.length} problem(s)` : 'ui-check: ok');
  process.exit(errors.length ? 1 : 0);
}
```

- [ ] **Step 4: The lists**

`extension/scripts/strings/dropped.mjs` (used from 3b's last task, when `--coverage` is turned on):
```js
// Pairs of the userscript's drawer (lines 2428–4586) the side panel doesn't show, and why.
export default [
  { th: 'ปิด (Alt+P)', en: 'Close (Alt+P)', why: "Chrome's side panel has its own close button; a page can't close it" },
  { th: 'ความทึบของแผง', en: 'Panel opacity', why: 'the docked panel is not see-through (spec: no opacity slider)' },
  { th: '${}% · น้อย = เห็นพื้นหลังมากขึ้น', en: '${}% · lower = more see-through', why: 'opacity slider removed' },
  { th: 'เปลี่ยนแล้วหน้าจะรีโหลด', en: 'The page reloads after changing', why: 'the language now changes without a reload' },
  { th: 'หยุดคิวก่อนแล้วค่อยเปลี่ยนภาษา', en: 'Stop the queue before changing language', why: 'no reload, so nothing to protect a run from' },
  { th: 'ล้างคิวอัปโหลดก่อนแล้วค่อยนำเข้า (หน้าจะรีโหลด ไฟล์ในคิวจะหาย)', en: 'Clear the upload queue before importing (the page reloads and queued files would be lost)', why: 'import no longer reloads and the queue survives; replaced by "Stop the queue before importing"' },
  { th: 'พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้และภาษาไม่เปลี่ยน) แล้วหน้าจะรีโหลด', en: 'Existing presets and settings on this device will be replaced (locked channel and language stay unchanged) and the page will reload.', why: 'no reload any more; the same sentence without its last clause is in extension-only' },
  { th: '.mp4 คลิป', en: '.mp4 video', why: 'Design B hid these drop-zone chips (.drop .kbd{display:none})' },
  { th: '.txt คำอธิบาย', en: '.txt description', why: 'hidden in Design B' },
  { th: '.jpg ภาพปก', en: '.jpg thumbnail', why: 'hidden in Design B' },
  { th: ' เปิด/ปิดแผง · ', en: ' toggle panel · ', why: 'Alt+P opens the side panel but cannot close it; replaced by " open the panel · "' },
  { th: 'เพลงใน tracklist ที่เคยโดน claim:\n', en: 'Tracklist songs previously claimed:\n', why: 'claim history comes with the copyright module (Phase 4)' },
  { th: '• ${}  (เคยโดน ${} คลิป)', en: '• ${}  (claimed on ${} video(s))', why: 'Phase 4' },
  { th: '${} เพลงเคยโดน claim', en: '${} song(s) previously claimed', why: 'Phase 4' },
];
```

`extension/scripts/strings/extension-only.mjs` — every pair Phases 0–3 add, with its reason. The first block exists today (Phase 2); Phases 3a and 3b add the rest as the tasks below introduce them (`check` fails on an entry nothing uses, so each entry lands in the same commit as the code that uses it; this task commits only the Phase 2 block):
```js
// L() pairs the userscript never had, and why each is new.
export default [
  // Phase 2: the runner talks to the side panel, files come through the bridge, one tab runs
  { th: 'ยืนยันการอัปโหลดในแผงด้านข้างก่อน', en: 'Confirm the upload in the side panel first', why: 'the start confirmation moved to the panel' },
  { th: 'ส่วนขยายถูกโหลดใหม่ระหว่างอัปโหลด — ถ้าหน้าต่างอัปโหลดของ Studio ยังเปิดอยู่ ให้ทำต่อแล้วกด Save เอง', en: "The extension was reloaded during an upload — if Studio's upload dialog is still open, finish that upload and click Save yourself", why: 'extension reloads orphan a running content script' },
  { th: 'ไม่พบไฟล์นี้แล้ว — เพิ่มไฟล์อีกครั้ง', en: 'This file is no longer available — add it again', why: 'file bridge: missing handle' },
  { th: 'ยังไม่ได้อนุญาตให้อ่านไฟล์ — กด "อนุญาตอีกครั้ง" ในแผงด้านข้าง', en: 'No permission to read this file — click "Re-grant access" in the side panel', why: 'file bridge: permission back to prompt after a restart' },
  { th: 'อ่านไฟล์ไม่ได้ (ถูกย้ายหรือเปลี่ยนชื่อ?) — เพิ่มไฟล์อีกครั้ง', en: 'Could not read this file (moved or renamed?) — add it again', why: 'file bridge: read failed' },
  { th: 'ดึงไฟล์จากแผงด้านข้างไม่ได้ (${})', en: 'Could not get the file from the side panel (${})', why: 'file bridge: other failure' },
  { th: 'ไฟล์นี้มาจากหน้าต่างอัปโหลดของ Studio และหายไปเมื่อโหลดหน้าใหม่ — เพิ่มไฟล์อีกครั้ง', en: "This file came from Studio's own upload dialog and was lost when the page reloaded — add it again", why: 'intercepted files live in the page only' },
  { th: 'ภาพปก "${}": ', en: 'Thumbnail "${}": ', why: 'prefix for a thumbnail file error' },
  { th: 'แท็บ Studio นี้ไม่ได้อัปโหลดคิวอยู่', en: 'Nothing is running in this Studio tab', why: 'Stop sent to a tab that is not running' },
  { th: 'ลบวิดีโอที่กำลังอัปโหลดไม่ได้', en: "Can't remove the video that is being uploaded", why: 'Remove on the item the run is fetching' },
  { th: 'มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่', en: 'Another Studio tab is already running the queue', why: 'one runner across tabs' },
  { th: 'ส่วนขยายถูกโหลดใหม่ — หยุดคิวในหน้านี้แล้ว', en: 'The extension was reloaded — the queue stopped in this page', why: 'orphaned run' },
  { th: 'ช่องเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', en: 'The channel changed after you confirmed — click Start again to see the new summary', why: 'confirmation and start are two messages' },
  { th: 'คิวเปลี่ยนไปหลังจากที่คุณยืนยัน — กดเริ่มอีกครั้งเพื่อดูสรุปใหม่', en: 'The queue changed after you confirmed — click Start again to see the new summary', why: 'confirmation and start are two messages' },
  { th: 'แผงด้านข้างไม่ตอบเรื่องไฟล์ — โหลดแท็บ Studio ใหม่ แล้วกดเริ่มอีกครั้ง', en: "The side panel's file access is not answering — reload the Studio tab, then start again", why: 'bridge probe before a run' },
  { th: 'หน้าโหลดใหม่ระหว่างอัปโหลด — ดูใน Content ว่ามีฉบับร่างค้างไหม แล้วค่อยกดลองใหม่', en: 'The page reloaded during the upload — check Content for a leftover draft, then retry', why: 'the queue survives reloads now' },
  { th: 'แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', en: 'Another Studio tab is running the queue — change the queue there', why: 'one runner across tabs' },
  { th: 'เพิ่มไม่ได้ ${} ไฟล์: ', en: 'Could not add ${} file(s): ', why: 'bridge failures when adding' },
];
```
(Task 2's `queue-edit.ts` already uses `เพิ่มไม่ได้ ${} ไฟล์: `, so that entry is used.)

In `extension/package.json` scripts: add `"ui-check": "node scripts/ui-check.mjs"` and change `check` to
```json
"check": "tsc --noEmit && vitest run && node scripts/port-check.mjs && node scripts/ui-check.mjs",
```

- [ ] **Step 5: Run**

Run: `npx vitest run tests/ui-check.test.mjs` → PASS. Then `npm run ui-check` → `ui-check: ok`. (If it lists a pair from Phase 2 code not in the list above, the list above is out of date with the code: add the pair with a reason — the code has priority over this plan.) Then `npm run check` → all pass.

- [ ] **Step 6: Commit**

```bash
git add extension/scripts/ui-check.mjs extension/scripts/strings extension/tests/ui-check.test.mjs extension/package.json
git commit -m "ui-check: shipped strings are the userscript's L() pairs; text never below 12px

New pairs need a reason in scripts/strings/extension-only.mjs. The drawer
coverage half (--coverage, with scripts/strings/dropped.mjs) is switched on once
the Upload tab exists (Phase 3b).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Toolchain, theme, components — and the developer panel goes

**Files:**
- Modify: `extension/package.json`, `extension/package-lock.json`, `extension/wxt.config.ts`, `extension/vitest.config.ts`, `extension/tsconfig.json`, `extension/lib/fs-permissions.d.ts`, `extension/lib/studio/dom.ts` (export list only), `extension/entrypoints/sidepanel/index.html`
- Create: `extension/lib/utils.ts`, `extension/components/ui/{button,input,textarea,label,native-select,switch,tabs,dialog,badge,progress,sonner}.tsx`, `extension/entrypoints/sidepanel/{main.tsx,style.css,App.tsx,Icon.tsx}`, `extension/tests/panel-smoke.test.tsx`
- Delete: `extension/entrypoints/sidepanel/main.ts`

**Interfaces:**
- Produces: `cn(...classes)` (`lib/utils.ts`); `Button` (`variant`: `default | go | ghost | danger | ghostDanger`, `size`: `default | sm | icon | lg`), `Input`, `Textarea`, `Label`, `NativeSelect`, `Switch`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Dialog`/`DialogContent`/`DialogTitle`/`DialogDescription`, `Badge`, `Progress` (`value: number | null`, null = indeterminate), `Toaster`; `<Icon name size? className?>`; `ICONS` exported from `lib/studio/dom.ts`; `App` (shell with four empty tabs; Tasks 6–9 fill it).

- [ ] **Step 1: Install (exact versions)**

```bash
npm install -E react@19.3.0 react-dom@19.3.0 radix-ui@1.7.0 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.7.0 sonner@2.0.8 @fontsource/ibm-plex-sans-thai@5.3.0
npm install -E -D @wxt-dev/module-react@1.2.2 @types/react@19.3.0 @types/react-dom@19.3.0 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/user-event@14.6.7 happy-dom@20.14.5
```
Check `package.json`: every new entry is an exact version (no `^`).

- [ ] **Step 2: Configuration**

`extension/wxt.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'YouTube Upload Presets',
    description: 'Bulk-upload videos to YouTube Studio with presets and scheduling, plus scan and trim copyright-claimed segments',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'],
    host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
    action: { default_title: 'YouTube Upload Presets' },
    web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
  },
});
```

`extension/tsconfig.json`:
```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ESNext", "DOM", "DOM.Iterable", "DOM.AsyncIterable"]
  }
}
```

`extension/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: { include: ['tests/**/*.test.{ts,tsx,mjs}'] },
});
```

Append to `extension/lib/fs-permissions.d.ts` (Phase 3b's file picking uses them):
```ts
interface FilePickerAcceptType { description?: string; accept: Record<string, string[]> }
interface Window {
  showOpenFilePicker(options?: { multiple?: boolean; types?: FilePickerAcceptType[]; excludeAcceptAllOption?: boolean }): Promise<FileSystemFileHandle[]>;
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}
```

In `extension/lib/studio/dom.ts`, the last line `export { h, icon };` becomes `export { h, icon, ICONS };` (outside the port block; `port-check` is unaffected).

- [ ] **Step 3: Theme and components**

`extension/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

`extension/entrypoints/sidepanel/style.css`:
```css
@import 'tailwindcss';
@import '@fontsource/ibm-plex-sans-thai/400.css';
@import '@fontsource/ibm-plex-sans-thai/500.css';
@import '@fontsource/ibm-plex-sans-thai/600.css';
@import '@fontsource/ibm-plex-sans-thai/700.css';

@source '../../components';
@source '.';

/* The userscript drawer's look: the black theme + Design B glass (UI CSS 2950–3196).
   The docked panel is not see-through, so the glass background is its solid colour
   (rgba(12,12,14,.82) over black). Dark only: the black theme overrode the light one. */
:root {
  color-scheme: dark;
  --bg: #0c0c0e;
  --surface: rgba(255, 255, 255, 0.05);
  --surface2: rgba(255, 255, 255, 0.09);
  --line: rgba(255, 255, 255, 0.09);
  --line2: rgba(255, 255, 255, 0.16);
  --fg: #f4f4f5;
  --fg2: #bcbcc4;
  --fg3: #8a8a94;
  --ok: #4ade80;
  --warn: #fbbf24;
  --err: #f87171;
  --info: #93c5fd;
  --muted: #66666e;
  --popover: #151517;
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface2: var(--surface2);
  --color-line: var(--line);
  --color-line2: var(--line2);
  --color-fg: var(--fg);
  --color-fg2: var(--fg2);
  --color-fg3: var(--fg3);
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-err: var(--err);
  --color-info: var(--info);
  --color-muted: var(--muted);
  --color-popover: var(--popover);
  --font-sans: 'IBM Plex Sans Thai', 'Leelawadee UI', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
}

@layer base {
  html, body { background: var(--bg); color: var(--fg); }
  /* 12px is the smallest text anywhere (the drawer's rule); numbers keep their width */
  body { margin: 0; font: 13.5px/1.5 var(--font-sans); -webkit-font-smoothing: antialiased; font-feature-settings: 'tnum' 1; }
  input, select, textarea, button { font-family: inherit; }
  ::placeholder { color: var(--fg3); opacity: 1; }
  select option { background: var(--popover); color: var(--fg); }
  :focus-visible { outline: 2px solid var(--fg2); outline-offset: 2px; }
}
```

`extension/components/ui/button.tsx`:
```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// The drawer's .btn family (Design B): glass secondary buttons, a white primary ("go").
export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-line2 bg-transparent text-fg hover:bg-surface2',
        go: 'border-transparent bg-fg text-[#0b0b0c] hover:bg-white active:bg-[#d8d8dc] disabled:bg-surface2 disabled:text-fg3 disabled:opacity-100',
        ghost: 'border-transparent bg-transparent text-fg2 hover:bg-surface2 hover:text-fg',
        danger: 'border-transparent bg-err text-[#0b0b0c] hover:bg-[#fca5a5]',
        ghostDanger: 'border-transparent bg-transparent text-fg2 hover:text-err',
      },
      size: {
        default: 'h-9 rounded-[12px] px-3.5 text-[13px]',
        sm: 'h-8 rounded-[10px] px-2.5 text-xs',
        icon: 'size-8 rounded-[10px] p-0',
        lg: 'rounded-[14px] px-4 py-2.5 text-[13.5px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type={type} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

`extension/components/ui/input.tsx`:
```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const fieldClass =
  'w-full min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-fg3 disabled:opacity-50 [color-scheme:dark]';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(fieldClass, 'h-9', className)} {...props} />;
}
```

`extension/components/ui/textarea.tsx`:
```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldClass, 'min-h-28 resize-y leading-[1.5]', className)} {...props} />;
}
```

`extension/components/ui/native-select.tsx`:
```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';

// The drawer used plain <select>s; so does the panel (keyboard and screen readers for free).
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn(fieldClass, 'h-9 w-auto pr-7', className)} {...props} />;
}
```

`extension/components/ui/label.tsx`:
```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// The drawer's .lbl: a field caption with an optional muted note on the right.
export function Label({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="label" className={cn('mt-3 mb-1.5 flex items-baseline justify-between gap-2 text-xs text-fg2 first:mt-0 [&>span+span]:text-fg3', className)} {...props} />;
}
```

`extension/components/ui/switch.tsx`:
```tsx
import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn('inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line2 transition-colors data-[state=checked]:bg-fg disabled:opacity-40', className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[#0b0b0c]" />
    </SwitchPrimitive.Root>
  );
}
```

`extension/components/ui/tabs.tsx`:
```tsx
import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

// Design B: pill tabs in one glass box, the selected one white.
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('grid grid-cols-4 gap-1 rounded-[14px] bg-white/[0.07] p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'group flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] py-2 text-[13.5px] font-medium text-white/75 hover:bg-white/[0.06] hover:text-white',
        'data-[state=active]:bg-[#f4f4f5] data-[state=active]:font-semibold data-[state=active]:text-[#0b0b0c] [&_svg]:opacity-80 data-[state=active]:[&_svg]:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
```

`extension/components/ui/dialog.tsx`:
```tsx
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

// The drawer's .ask box (Design B glass), on a lightly blurred overlay.
export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[4px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
          'rounded-[22px] border border-white/[0.12] bg-[#0f0f12] p-5 text-fg shadow-[0_30px_80px_-20px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.07)] outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
```

`extension/components/ui/badge.tsx`:
```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// The drawer's .chip: rounded, outlined; `tone` colours problems (Design B: amber on a tint).
export function Badge({ className, tone, ...props }: ComponentProps<'span'> & { tone?: 'bad' | 'warn' }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-line2 px-2 py-0.5 text-xs text-fg2',
        tone === 'bad' && 'border-transparent bg-warn/[0.12] text-warn',
        tone === 'warn' && 'text-warn',
        className,
      )}
      {...props}
    />
  );
}
```

`extension/components/ui/progress.tsx`:
```tsx
import { cn } from '@/lib/utils';

// A thin white bar (.progress / .tbx-bar). null = no percentage known: a moving stripe.
export function Progress({ value, className }: { value: number | null; className?: string }) {
  return (
    <div role="progressbar" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100} className={cn('relative h-1 overflow-hidden rounded-full bg-line2', className)}>
      {value === null
        ? <i className="absolute inset-y-0 w-1/3 animate-[ytup-ind_1.2s_ease-in-out_infinite] rounded-full bg-fg" />
        : <i className="absolute inset-y-0 left-0 rounded-full bg-fg transition-[width]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
      <style>{'@keyframes ytup-ind{0%{left:-33%}100%{left:100%}}'}</style>
    </div>
  );
}
```

`extension/components/ui/sonner.tsx`:
```tsx
import { Toaster as Sonner } from 'sonner';

// The drawer's toast: bottom centre, black glass, 3.8 s.
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      duration={3800}
      toastOptions={{ style: { background: '#0f0f12', border: '1px solid rgba(255,255,255,.12)', color: '#f4f4f5', fontFamily: 'inherit', fontSize: '13px' } }}
    />
  );
}
```

`extension/entrypoints/sidepanel/Icon.tsx`:
```tsx
import { ICONS } from '@/lib/studio/dom';

// The userscript's embedded Material Symbols Rounded paths (no icon font to load).
export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} aria-hidden="true" className={className}>
      <path d={ICONS[name] || ICONS.info} fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 4: The panel page replaces the developer panel**

Delete `extension/entrypoints/sidepanel/main.ts`. Replace `extension/entrypoints/sidepanel/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>YouTube Upload Presets</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`extension/entrypoints/sidepanel/main.tsx`:
```tsx
import './style.css';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@/lib/i18n';
import { sendMessage } from '@/lib/messages';
import { App } from './App';

async function main() {
  // Like the content script: read storage only once the background's migrations have run.
  await sendMessage('ensureMigrated', undefined).catch((e) => console.error('[ytup] ensureMigrated', e));
  await initI18n();
  createRoot(document.getElementById('root')!).render(<App />);
}
void main();
```

`extension/entrypoints/sidepanel/App.tsx` (Task 7 replaces it with the full shell):
```tsx
import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';

export type TabKey = 'queue' | 'presets' | 'claims' | 'settings';
// The drawer's tabs, in its order (3317).
export const tabDefs = (): [TabKey, string, string][] => [
  ['queue', L('อัปโหลด', 'Upload'), 'queue'],
  ['presets', L('พรีเซ็ต', 'Presets'), 'layers'],
  ['claims', L('ลิขสิทธิ์', 'Copyright'), 'shield'],
  ['settings', L('ตั้งค่า', 'Settings'), 'sliders'],
];

export function App() {
  const [tab, setTab] = useState<TabKey>('queue');
  return (
    <div className="flex h-dvh flex-col">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-[18px] mt-3">
          {tabDefs().map(([k, label, ic]) => (
            <TabsTrigger key={k} value={k}>
              <Icon name={ic} size={17} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-4 pb-[18px]">
          {tabDefs().map(([k]) => <TabsContent key={k} value={k} />)}
        </div>
      </Tabs>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 5: A smoke test for the React test setup**

`extension/tests/panel-smoke.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../components/ui/button';
import { Icon } from '../entrypoints/sidepanel/Icon';

afterEach(cleanup);

describe('panel test setup', () => {
  it('renders components with JSX and Tailwind classes', () => {
    render(<Button variant="go"><Icon name="play" />Start</Button>);
    const b = screen.getByRole('button', { name: 'Start' });
    expect(b.className).toContain('bg-fg');
    expect(b.querySelector('path')?.getAttribute('d')?.startsWith('M320-258')).toBe(true);
  });
});
```

- [ ] **Step 6: Run**

Run: `npx vitest run tests/panel-smoke.test.tsx`
Expected: PASS. If it fails with a JSX syntax error or `React is not defined`, Vitest is not picking up `"jsx": "react-jsx"`: run `npm install -E -D @vitejs/plugin-react@6.1.2`, add `import react from '@vitejs/plugin-react';` to `vitest.config.ts` and change its `plugins` to `[WxtVitest(), react()]`, then re-run.

Run: `npm run check && npm run build`
Expected: all pass (the ui-check sees the four tab labels, all userscript pairs); the build writes `.output/chrome-mv3/sidepanel.html` and a CSS asset that contains `IBM Plex Sans Thai` and `--color-fg`:
```bash
grep -l "IBM Plex Sans Thai" .output/chrome-mv3/assets/*.css && grep -c "woff2" .output/chrome-mv3/assets/*.css
```
Expected: one CSS file listed; a non-zero woff2 count.

- [ ] **Step 7: Commit**

```bash
git add extension/package.json extension/package-lock.json extension/wxt.config.ts extension/vitest.config.ts extension/tsconfig.json extension/lib/fs-permissions.d.ts extension/lib/studio/dom.ts extension/lib/utils.ts extension/components extension/entrypoints/sidepanel extension/tests/panel-smoke.test.tsx
git commit -m "Side panel: React 19 + Tailwind v4 + shadcn-style components, black glass theme

Replaces the developer panel. Components are copied into components/ui; the
theme carries the drawer's black theme + Design B tokens; IBM Plex Sans Thai is
bundled; icons are the userscript's embedded Material Symbols paths.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Panel core — data, the bound tab, the view, confirmations, fields, banners

**Files:**
- Create: `extension/lib/panel/{data,target,view-sync,bus,writes}.ts`, `extension/entrypoints/sidepanel/{panel.tsx,ask.tsx,fields.tsx}`, `extension/entrypoints/sidepanel/shell/Banners.tsx`
- Modify: `extension/entrypoints/sidepanel/main.tsx`, `extension/entrypoints/sidepanel/App.tsx` (wrap in providers, show banners), `extension/scripts/strings/extension-only.mjs`
- Test: `extension/tests/panel-data.test.ts`, `extension/tests/panel-target.test.ts`, `extension/tests/panel-view-sync.test.ts`, `extension/tests/panel-ask.test.tsx`

**Interfaces:**
- Consumes: `queue:view`, `queue:state`, `queue:toast`, `store:patch` (Tasks 1–2); `mergeSettings`, `SettingsPatch`; `resolveLang`, `getLang`, `setLang`; `isStudioUrl`; `StoredChannel`.
- Produces:
  - `lib/panel/data.ts`: `interface PanelData { settings: Settings; presets: Preset[]; activeId: string; counters: Record<string, number>; channels: StoredChannel[] }`; `DATA_KEYS`; `toPanelData(raw)`; `readPanelData()`; `watchPanelData(fn): () => void`; `presetIn(data, id): Preset`.
  - `lib/panel/target.ts`: `interface Target { tabId; windowId; url; title }`; `asTarget(tab)`; `activeStudioTab(windowId)`; `type TabEvent = 'switched' | 'loading' | 'loaded'`; `watchTabs(windowId, fn)`; `interface RunnerTab { tabId; windowId; title }`; `runnerTab()`; `watchRunner(fn)`; `focusTab(t)`.
  - `lib/panel/view-sync.ts`: `type LinkStatus = 'noTab' | 'loading' | 'ok' | 'noScript'`; `createViewSync({ fetch, onView, onStatus, delayMs? }): { bind(tabId | null), loading(), poke(), dispose() }`.
  - `lib/panel/bus.ts`: `installBus()`, `onQueueState(fn(s, tabId))`, `onQueueToast(fn(msg, tabId))`.
  - `lib/panel/writes.ts`: `interface Writes { settings(p: SettingsPatch); counter(presetId, value); activeId(id); presets(list); channels(fn) }`, `writes: Writes`.
  - `panel.tsx`: `interface PanelApi { lang; data; target; link; view; state; runner; liveState; elsewhere: boolean; send: ToTab; sendTo(tabId): ToTab; write: Writes; refresh() }`, `PanelContext`, `PanelProvider`, `usePanel()`, `type ToTab`. Every component that shows text reads `usePanel()`, so a language change (a new `lang`) re-renders them all in place — tabs and open cards stay as they are.
  - `ask.tsx`: `interface AskOptions { title; body?: ReactNode; ok?; no?: string | null; cancel?; danger?; icon? }`, `AskProvider`, `useAsk(): (o) => Promise<boolean | null>` (true = main button, false = second button or dismissed without one, null = dismissed when there is a second button).
  - `fields.tsx`: `TextField`, `AreaField`, `NumberField` (commits on blur / Enter), `Section`, `Kv`, `Hint`, `IconButton`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/panel-data.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { readPanelData, toPanelData, watchPanelData } from '../lib/panel/data';
import { defaultPresets } from '../lib/presets';

beforeEach(() => fakeBrowser.reset());

describe('panel data', () => {
  it('fills the gaps the way the page does', () => {
    const d = toPanelData({ settings: { delay: 7 }, autoNext: true });
    expect(d.settings).toMatchObject({ delay: 7, autoNext: true, pace: 'slow', lang: 'en' });
    expect(d.presets.map((p) => p.id)).toEqual(defaultPresets().map((p) => p.id));
    expect(d.activeId).toBe('trapsoul');
    expect(d).toMatchObject({ counters: {}, channels: [] });
  });

  it('an install with presets but no stored language is Thai (resolveLang)', () => {
    expect(toPanelData({ presets: [{ id: 'x', label: 'X' }] }).settings.lang).toBe('th');
  });

  it('follows the keys it shows, not others', async () => {
    const seen: number[] = [];
    const off = watchPanelData((d) => seen.push(d.settings.delay));
    await browser.storage.local.set({ settings: { delay: 5 } });
    await browser.storage.local.set({ queue: [] });
    await new Promise((r) => setTimeout(r, 0));
    off();
    expect(seen).toEqual([5]);
    expect((await readPanelData()).settings.delay).toBe(5);
  });
});
```

`extension/tests/panel-target.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { asTarget, runnerTab, watchTabs } from '../lib/panel/target';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('target', () => {
  it('only a Studio tab is a target', () => {
    expect(asTarget({ id: 3, windowId: 1, url: 'https://studio.youtube.com/channel/UC1', title: 'Studio' })).toEqual({
      tabId: 3, windowId: 1, url: 'https://studio.youtube.com/channel/UC1', title: 'Studio',
    });
    expect(asTarget({ id: 3, windowId: 1, url: 'https://www.youtube.com/' })).toBe(null);
    expect(asTarget(undefined)).toBe(null);
  });

  it('the runner tab comes from the lock; a closed or non-Studio tab is nobody', async () => {
    expect(await runnerTab()).toBe(null);
    await browser.storage.session.set({ runnerTabId: 9 });
    const get = vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: 9, windowId: 2, url: 'https://studio.youtube.com/', title: 'A' } as never);
    expect(await runnerTab()).toEqual({ tabId: 9, windowId: 2, title: 'A' });
    get.mockRejectedValue(new Error('No tab with id: 9'));
    expect(await runnerTab()).toBe(null);
  });

  it('tab events of this window only', async () => {
    const seen: string[] = [];
    const off = watchTabs(1, (e) => seen.push(e));
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 2 });
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 1 });
    await fakeBrowser.tabs.onUpdated.trigger(4, { status: 'loading' }, { active: true, windowId: 1 } as never);
    await fakeBrowser.tabs.onUpdated.trigger(4, { status: 'complete' }, { active: true, windowId: 1 } as never);
    await fakeBrowser.tabs.onUpdated.trigger(5, { status: 'complete' }, { active: false, windowId: 1 } as never);
    await fakeBrowser.tabs.onUpdated.trigger(4, { url: 'https://www.youtube.com/' }, { active: true, windowId: 1 } as never);
    off();
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 4, windowId: 1 });
    expect(seen).toEqual(['switched', 'loading', 'loaded', 'switched']);
  });
});
```

`extension/tests/panel-view-sync.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewSync, type LinkStatus } from '../lib/panel/view-sync';
import type { QueueView } from '../lib/studio/queue-view';

const view = (n: number) => ({ items: [], current: null, n }) as unknown as QueueView;
let statuses: LinkStatus[];
let views: (QueueView | null)[];

beforeEach(() => {
  vi.useFakeTimers();
  statuses = [];
  views = [];
});
afterEach(() => vi.useRealTimers());

const make = (fetch: (id: number) => Promise<QueueView>) =>
  createViewSync({ fetch, onView: (v) => views.push(v), onStatus: (s) => statuses.push(s), delayMs: 100 });

describe('createViewSync', () => {
  it('binding fetches at once; pokes are coalesced', async () => {
    let n = 0;
    const fetch = vi.fn(async () => view(++n));
    const s = make(fetch);
    s.bind(7);
    await vi.runAllTimersAsync();
    expect(statuses).toEqual(['loading', 'ok']);
    s.poke();
    s.poke();
    s.poke();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(views.at(-1)).toEqual(view(2));
  });

  it('no content script answering → noScript; a later answer → ok', async () => {
    let up = false;
    const s = make(async () => {
      if (!up) throw new Error('Could not establish connection. Receiving end does not exist.');
      return view(1);
    });
    s.bind(7);
    await vi.runAllTimersAsync();
    expect(statuses).toEqual(['loading', 'noScript']);
    up = true;
    s.poke();
    await vi.advanceTimersByTimeAsync(100);
    expect(statuses).toEqual(['loading', 'noScript', 'ok']);
  });

  it('an answer from the tab bound before is dropped', async () => {
    let release!: (v: QueueView) => void;
    const s = make((id) => (id === 1 ? new Promise((r) => (release = r)) : Promise.resolve(view(2))));
    s.bind(1);
    s.bind(2);
    await vi.runAllTimersAsync();
    release(view(1));
    await vi.runAllTimersAsync();
    expect(views.filter(Boolean)).toEqual([view(2)]);
  });

  it('no tab → noTab and no fetch', async () => {
    const fetch = vi.fn(async () => view(1));
    const s = make(fetch);
    s.bind(3);
    await vi.runAllTimersAsync();
    s.bind(null);
    s.poke();
    await vi.runAllTimersAsync();
    expect(statuses.at(-1)).toBe('noTab');
    expect(views.at(-1)).toBe(null);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
```

`extension/tests/panel-ask.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AskProvider, useAsk, type AskOptions } from '../entrypoints/sidepanel/ask';

afterEach(cleanup);

let ask!: (o: AskOptions) => Promise<boolean | null>;
function Grab() {
  ask = useAsk();
  return null;
}
const open = (o: AskOptions) => {
  let p!: Promise<boolean | null>;
  act(() => { p = ask(o); });
  return p;
};

describe('ask (the drawer\'s confirm box)', () => {
  it('two buttons: OK → true, Cancel → false, Escape → false', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Delete?', ok: 'Delete', danger: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await p).toBe(true);
    p = open({ title: 'Delete?' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await p).toBe(false);
    p = open({ title: 'Delete?' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(await p).toBe(false);
  });

  it('three buttons: the second answers false, dismissing answers null', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Import', ok: 'My file', no: "Someone else's" });
    fireEvent.click(screen.getByRole('button', { name: "Someone else's" }));
    expect(await p).toBe(false);
    p = open({ title: 'Import', ok: 'My file', no: "Someone else's" });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await p).toBe(null);
  });

  it('Enter confirms; a new question dismisses the open one', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    const first = open({ title: 'One', ok: 'Yes', no: 'No' });
    const second = open({ title: 'Two' });
    expect(await first).toBe(null);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(await second).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/panel-data.test.ts tests/panel-target.test.ts tests/panel-view-sync.test.ts tests/panel-ask.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: `lib/panel` modules**

`extension/lib/panel/data.ts`:
```ts
import { browser } from 'wxt/browser';
import { resolveLang } from '../i18n';
import { defaultPresets, type Preset } from '../presets';
import { mergeSettings, type Settings } from '../settings';
import type { StoredChannel } from '../studio/channels';

// What the panel shows from chrome.storage.local, merged the same way the page merges it
// (lib/studio/state.ts), and followed live.
export interface PanelData {
  settings: Settings;
  presets: Preset[];
  activeId: string;
  counters: Record<string, number>;
  channels: StoredChannel[];
}

export const DATA_KEYS = ['settings', 'autoApply', 'autoNext', 'presets', 'activeId', 'counters', 'channels'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function toPanelData(raw: Record<string, unknown>): PanelData {
  const stored = isObj(raw.settings) ? (raw.settings as Partial<Settings>) : undefined;
  const settings = mergeSettings(stored, {
    autoApply: typeof raw.autoApply === 'boolean' ? raw.autoApply : undefined,
    autoNext: typeof raw.autoNext === 'boolean' ? raw.autoNext : undefined,
  });
  if (settings.lang === undefined) settings.lang = resolveLang(stored, raw.presets !== undefined);
  const presets = Array.isArray(raw.presets) ? (raw.presets as Preset[]) : defaultPresets();
  return {
    settings,
    presets,
    activeId: typeof raw.activeId === 'string' ? raw.activeId : presets[0]?.id ?? '',
    counters: isObj(raw.counters) ? (raw.counters as Record<string, number>) : {},
    channels: Array.isArray(raw.channels) ? (raw.channels as StoredChannel[]) : [],
  };
}

export const readPanelData = async () => toPanelData(await browser.storage.local.get(DATA_KEYS));

export function watchPanelData(fn: (d: PanelData) => void): () => void {
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && DATA_KEYS.some((k) => k in changes)) void readPanelData().then(fn);
  };
  browser.storage.onChanged.addListener(changed);
  return () => browser.storage.onChanged.removeListener(changed);
}

// presetById(): an unknown id falls back to the first preset.
export const presetIn = (d: PanelData, id: string): Preset => d.presets.find((p) => p.id === id) || d.presets[0]!;
```

`extension/lib/panel/target.ts`:
```ts
import { browser } from 'wxt/browser';
import { isStudioUrl } from '../panel-scope';

// The panel works with the Studio tab active in its own window (the background enables it
// on Studio tabs only).
export interface Target { tabId: number; windowId: number; url: string; title: string }
interface TabLike { id?: number; windowId?: number; url?: string; title?: string }

export const asTarget = (t: TabLike | undefined): Target | null =>
  t?.id !== undefined && t.windowId !== undefined && isStudioUrl(t.url)
    ? { tabId: t.id, windowId: t.windowId, url: t.url!, title: t.title ?? '' }
    : null;

export async function activeStudioTab(windowId: number): Promise<Target | null> {
  const [tab] = await browser.tabs.query({ active: true, windowId });
  return asTarget(tab);
}

export type TabEvent = 'switched' | 'loading' | 'loaded';
export function watchTabs(windowId: number, fn: (e: TabEvent) => void): () => void {
  const activated = (info: { windowId: number }) => {
    if (info.windowId === windowId) fn('switched');
  };
  const updated = (_id: number, info: { status?: string; url?: string; title?: string }, tab: { active?: boolean; windowId?: number }) => {
    if (!tab.active || tab.windowId !== windowId) return;
    if (info.url) fn('switched');
    else if (info.status === 'loading') fn('loading');
    else if (info.status === 'complete' || info.title) fn('loaded');
  };
  browser.tabs.onActivated.addListener(activated);
  browser.tabs.onUpdated.addListener(updated);
  return () => {
    browser.tabs.onActivated.removeListener(activated);
    browser.tabs.onUpdated.removeListener(updated);
  };
}

// The tab holding the one-runner lock (lib/runner-lock.ts, storage.session). Stop goes there;
// the panel says so when it isn't the bound tab. A tab that is gone or left Studio is nobody.
export interface RunnerTab { tabId: number; windowId: number; title: string }

export async function runnerTab(): Promise<RunnerTab | null> {
  const id = (await browser.storage.session.get('runnerTabId')).runnerTabId;
  if (typeof id !== 'number') return null;
  const t = asTarget(await browser.tabs.get(id).catch(() => undefined));
  return t && { tabId: t.tabId, windowId: t.windowId, title: t.title };
}

export function watchRunner(fn: () => void): () => void {
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === 'session' && 'runnerTabId' in changes) fn();
  };
  browser.storage.onChanged.addListener(changed);
  return () => browser.storage.onChanged.removeListener(changed);
}

export async function focusTab(t: { tabId: number; windowId: number }): Promise<void> {
  await browser.tabs.update(t.tabId, { active: true });
  await browser.windows.update(t.windowId, { focused: true });
}
```

`extension/lib/panel/view-sync.ts`:
```ts
import type { QueueView } from '../studio/queue-view';

// Keeps the panel's copy of the bound tab's QueueView fresh: fetched at once when the panel
// binds to a tab, then again (coalesced) whenever something pokes it — a queue:state
// broadcast, a storage change, the minute timer. 'noScript': the tab has no live content
// script (opened before the extension was installed or reloaded, or still loading).
export type LinkStatus = 'noTab' | 'loading' | 'ok' | 'noScript';

export interface ViewSync {
  bind(tabId: number | null): void;
  loading(): void; // the tab started (re)loading: answers from before are dropped
  poke(): void;
  dispose(): void;
}

export function createViewSync(o: {
  fetch(tabId: number): Promise<QueueView>;
  onView(v: QueueView | null): void;
  onStatus(s: LinkStatus): void;
  delayMs?: number;
}): ViewSync {
  let tabId: number | null = null;
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: LinkStatus = 'noTab';
  const set = (s: LinkStatus) => {
    if (s === status) return;
    status = s;
    o.onStatus(s);
  };
  const run = async () => {
    timer = undefined;
    if (tabId === null) return;
    const g = gen;
    try {
      const v = await o.fetch(tabId);
      if (g !== gen) return;
      set('ok');
      o.onView(v);
    } catch {
      if (g === gen) set('noScript');
    }
  };
  return {
    bind(id) {
      gen++;
      clearTimeout(timer);
      timer = undefined;
      tabId = id;
      o.onView(null);
      if (id === null) return set('noTab');
      set('loading');
      void run();
    },
    loading() {
      if (tabId === null) return;
      gen++;
      set('loading');
    },
    poke() {
      if (tabId === null) return;
      clearTimeout(timer);
      timer = setTimeout(() => void run(), o.delayMs ?? 120);
    },
    dispose() {
      gen++;
      clearTimeout(timer);
      tabId = null;
    },
  };
}
```

`extension/lib/panel/bus.ts`:
```ts
import { onMessage, type QueueState } from '../messages';

// @webext-core/messaging allows one listener per message type in a context; the panel's
// components subscribe here instead. Every Studio tab broadcasts: the tab id tells them apart.
type Fn<T> = (data: T, tabId: number | undefined) => void;
const states = new Set<Fn<QueueState>>();
const toasts = new Set<Fn<string>>();
let installed = false;

export function installBus(): void {
  if (installed) return;
  installed = true;
  onMessage('queue:state', ({ data, sender }) => { for (const fn of states) fn(data, sender.tab?.id); });
  onMessage('queue:toast', ({ data, sender }) => { for (const fn of toasts) fn(data, sender.tab?.id); });
}

export const onQueueState = (fn: Fn<QueueState>) => (states.add(fn), () => void states.delete(fn));
export const onQueueToast = (fn: Fn<string>) => (toasts.add(fn), () => void toasts.delete(fn));
```

`extension/lib/panel/writes.ts`:
```ts
import { browser } from 'wxt/browser';
import { sendMessage } from '../messages';
import type { Preset } from '../presets';
import type { SettingsPatch } from '../settings';
import { save } from '../storage';
import type { StoredChannel } from '../studio/channels';

// Every write the panel makes. settings and counters go through the background (one writer,
// lib/store-writer.ts); presets and the default preset are the panel's own; the channel list
// is read-modify-written like the drawer did (Studio tabs add to it too).
export interface Writes {
  settings(patch: SettingsPatch): Promise<void>;
  counter(presetId: string, value: number): Promise<void>;
  activeId(id: string): Promise<void>;
  presets(list: Preset[]): Promise<void>;
  channels(fn: (list: StoredChannel[]) => StoredChannel[]): Promise<void>;
}

export const writes: Writes = {
  settings: (patch) => sendMessage('store:patch', { key: 'settings', patch }),
  counter: (presetId, value) => sendMessage('store:patch', { key: 'counters', patch: { [presetId]: value } }),
  activeId: (id) => save('activeId', id),
  presets: (list) => save('presets', list),
  async channels(fn) {
    const cur = (await browser.storage.local.get('channels')).channels;
    await save('channels', fn(Array.isArray(cur) ? (cur as StoredChannel[]) : []));
  },
};
```

- [ ] **Step 4: Provider, confirmations, fields**

`extension/entrypoints/sidepanel/panel.tsx`:
```tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { getLang, setLang } from '@/lib/i18n';
import { sendMessage, type ProtocolMap, type QueueState } from '@/lib/messages';
import { installBus, onQueueState, onQueueToast } from '@/lib/panel/bus';
import { readPanelData, watchPanelData, type PanelData } from '@/lib/panel/data';
import { activeStudioTab, runnerTab, watchRunner, watchTabs, type RunnerTab, type Target } from '@/lib/panel/target';
import { createViewSync, type LinkStatus } from '@/lib/panel/view-sync';
import { writes, type Writes } from '@/lib/panel/writes';
import type { QueueView } from '@/lib/studio/queue-view';

export type ToTab = <K extends keyof ProtocolMap>(type: K, data: Parameters<ProtocolMap[K]>[0]) => Promise<Awaited<ReturnType<ProtocolMap[K]>>>;
const toTab = (tabId: number): ToTab => (type, data) => sendMessage(type, data as never, tabId) as never;

export interface PanelApi {
  lang: string; // a change re-renders every consumer (L() is read while rendering)
  data: PanelData | null;
  target: Target | null; // the Studio tab active in this window
  link: LinkStatus;
  view: QueueView | null; // that tab's queue, as its runner sees it
  state: QueueState | null; // that tab's live state (newer than view.state)
  runner: RunnerTab | null; // the tab holding the runner lock, if any (may be the target)
  liveState: QueueState | null; // the running tab's live state, else the target's
  elsewhere: boolean; // another tab is running the queue
  send: ToTab; // to the target
  sendTo(tabId: number): ToTab;
  write: Writes;
  refresh(): void;
}

const noop = () => {};
export const PanelContext = createContext<PanelApi>({
  lang: 'en', data: null, target: null, link: 'noTab', view: null, state: null, runner: null, liveState: null, elsewhere: false,
  send: () => Promise.reject(new Error('no Studio tab')), sendTo: toTab, write: writes, refresh: noop,
});
export const usePanel = () => useContext(PanelContext);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [link, setLink] = useState<LinkStatus>('noTab');
  const [view, setView] = useState<QueueView | null>(null);
  const [states, setStates] = useState<ReadonlyMap<number, QueueState>>(new Map());
  const [runner, setRunner] = useState<RunnerTab | null>(null);
  const [lang, setLangState] = useState(getLang());
  const targetRef = useRef<Target | null>(null);
  const seen = useRef(new Map<number, string>()); // rev + channel per tab: re-read the view when it moves
  const sync = useMemo(
    () => createViewSync({ fetch: (id) => sendMessage('queue:view', undefined, id), onView: setView, onStatus: setLink }),
    [],
  );

  // Stored data, and the language with it.
  useEffect(() => {
    void readPanelData().then(setData);
    const offData = watchPanelData(setData);
    const queueChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'queue' in changes) sync.poke();
    };
    browser.storage.onChanged.addListener(queueChanged);
    return () => {
      offData();
      browser.storage.onChanged.removeListener(queueChanged);
    };
  }, [sync]);
  useEffect(() => {
    const l = data?.settings.lang;
    if (l && l !== getLang()) setLang(l);
    if (l) setLangState(l);
    if (data) sync.poke(); // titles, numbers and times depend on presets / counters / settings
  }, [data, sync]);

  // Which tab.
  useEffect(() => {
    let alive = true;
    let windowId: number | undefined;
    let off = noop;
    const rebind = async () => {
      if (windowId === undefined) return;
      const t = await activeStudioTab(windowId);
      if (!alive) return;
      const changed = t?.tabId !== targetRef.current?.tabId;
      targetRef.current = t;
      setTarget(t);
      if (changed) sync.bind(t?.tabId ?? null);
    };
    void browser.windows.getCurrent().then((w) => {
      if (!alive || w.id === undefined) return;
      windowId = w.id;
      void rebind();
      off = watchTabs(w.id, (e) => {
        if (e === 'loading') return sync.loading();
        void rebind();
        if (e === 'loaded') sync.poke();
      });
    });
    return () => {
      alive = false;
      off();
      sync.dispose();
    };
  }, [sync]);

  // The runner lock.
  useEffect(() => {
    const update = () => void runnerTab().then(setRunner);
    update();
    return watchRunner(update);
  }, []);

  // Live state and toasts from the Studio tabs.
  useEffect(() => {
    installBus();
    const offState = onQueueState((s, tabId) => {
      if (tabId === undefined) return;
      setStates((m) => new Map(m).set(tabId, s));
      const sig = `${s.rev}|${JSON.stringify(s.channel)}`;
      if (tabId === targetRef.current?.tabId && seen.current.get(tabId) !== sig) sync.poke();
      seen.current.set(tabId, sig);
    });
    // Toasts from the bound tab only: a stop sent to another tab is announced by the panel
    // itself, naming that tab (3b), and that tab's own toasts show in its page.
    const offToast = onQueueToast((msg, tabId) => {
      if (tabId !== undefined && tabId === targetRef.current?.tabId) toast(msg);
    });
    // The drawer re-rendered the schedule every minute (times move past "15 minutes ahead").
    const minute = setInterval(() => sync.poke(), 60_000);
    return () => {
      offState();
      offToast();
      clearInterval(minute);
    };
  }, [sync]);

  const api = useMemo<PanelApi>(() => {
    const state = target ? states.get(target.tabId) ?? view?.state ?? null : null;
    const runnerState = runner ? states.get(runner.tabId) ?? null : null;
    return {
      lang, data, target, link, view, state, runner,
      liveState: runnerState ?? state,
      elsewhere: !!runner && runner.tabId !== target?.tabId,
      send: target ? toTab(target.tabId) : () => Promise.reject(new Error('no Studio tab')),
      sendTo: toTab,
      write: writes,
      refresh: () => sync.poke(),
    };
  }, [lang, data, target, link, view, states, runner, sync]);

  return <PanelContext.Provider value={api}>{children}</PanelContext.Provider>;
}
```

`extension/entrypoints/sidepanel/ask.tsx`:
```tsx
import { createContext, useCallback, useContext, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';

// The drawer's ask() (3204–3237): a confirm box in the panel instead of the browser's
// confirm(). Resolves true = main button, false = second button, null = dismissed (Esc,
// click outside, Cancel) — and when there is no second button, dismissing answers false.
export interface AskOptions {
  title: string;
  body?: ReactNode;
  ok?: string;
  no?: string | null;
  cancel?: string;
  danger?: boolean;
  icon?: string;
}
type Ask = (o: AskOptions) => Promise<boolean | null>;
const AskContext = createContext<Ask>(async () => false);
export const useAsk = () => useContext(AskContext);

export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<AskOptions | null>(null);
  const resolver = useRef<((v: boolean | null) => void) | null>(null);
  const finish = useCallback((v: boolean | null) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(null);
    r?.(v);
  }, []);
  const ask = useCallback<Ask>((o) => new Promise((resolve) => {
    resolver.current?.(null); // a new question closes the one still open (askClose?.(null))
    resolver.current = resolve;
    setOpen(o);
  }), []);
  const dismissed = open?.no ? null : false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !/^(TEXTAREA|BUTTON)$/.test((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      finish(true);
    }
  };
  const ok = open?.ok ?? L('ตกลง', 'OK');
  const cancel = open?.cancel ?? L('ยกเลิก', 'Cancel');
  return (
    <AskContext.Provider value={ask}>
      {children}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) finish(dismissed); }}>
        {open && (
          <DialogContent onKeyDown={onKeyDown} {...(open.body ? {} : { 'aria-describedby': undefined })}>
            <DialogTitle className="flex items-center gap-2.5 text-[15px] font-semibold">
              <span className={open.danger ? 'grid size-8 place-items-center rounded-[10px] bg-err/15 text-err' : 'grid size-8 place-items-center rounded-[10px] bg-surface2 text-fg'}>
                <Icon name={open.icon ?? 'alert'} size={17} />
              </span>
              {open.title}
            </DialogTitle>
            {open.body ? <DialogDescription asChild><div className="mt-3 text-[13px] whitespace-pre-line text-fg2">{open.body}</div></DialogDescription> : null}
            <div className="mt-5 flex justify-end gap-2">
              {open.no ? (
                <>
                  <Button variant="ghost" onClick={() => finish(null)}>{cancel}</Button>
                  <Button onClick={() => finish(false)}>{open.no}</Button>
                </>
              ) : (
                <Button onClick={() => finish(false)}>{cancel}</Button>
              )}
              <Button autoFocus variant={open.danger ? 'danger' : 'go'} onClick={() => finish(true)}>{ok}</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AskContext.Provider>
  );
}
```

`extension/entrypoints/sidepanel/fields.tsx`:
```tsx
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

// The drawer saved on every keystroke and never overwrote a field while the user typed in
// it (`if (document.activeElement !== el) el.value = …`). These fields keep their own text
// while focused and follow the stored value otherwise.
function useFollow(value: string) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return { text, setText, focused };
}

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: string; onValue(v: string): void };

// `ref` is a plain prop in React 19 (the Presets tab inserts variables at the cursor).
export function TextField({ value, onValue, onFocus, onBlur, ref, ...rest }: InputProps) {
  const { text, setText, focused } = useFollow(value);
  return (
    <Input
      {...rest}
      ref={ref}
      value={text}
      onFocus={(e) => { focused.current = true; onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; onBlur?.(e); }}
      onChange={(e) => { setText(e.target.value); onValue(e.target.value); }}
    />
  );
}

export function AreaField({ value, onValue, onFocus, onBlur, ...rest }: Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & { value: string; onValue(v: string): void }) {
  const { text, setText, focused } = useFollow(value);
  return (
    <Textarea
      {...rest}
      value={text}
      onFocus={(e) => { focused.current = true; onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; onBlur?.(e); }}
      onChange={(e) => { setText(e.target.value); onValue(e.target.value); }}
    />
  );
}

// type=number inputs the drawer saved on `change` (blur or Enter), not on every keystroke.
export function NumberField({ value, onValue, ...rest }: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { value: string; onValue(v: string): void }) {
  const { text, setText, focused } = useFollow(value);
  const commit = () => { if (text !== value) onValue(text); };
  return (
    <Input
      {...rest}
      type="number"
      className={cn('w-24', rest.className)}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

// The drawer's .sec: a section heading with an icon, sections separated by a hairline.
export function Section({ title, icon, children, className }: { title?: string; icon?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-[22px] border-white/[0.08] first:mt-0 [&+&]:border-t [&+&]:pt-[18px]', className)}>
      {title && (
        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold tracking-[.03em] text-fg3">
          {icon && <Icon name={icon} size={15} className="opacity-80" />}
          {title}
        </h4>
      )}
      {children}
    </section>
  );
}

// The drawer's .kv row: title + note on the left, the control on the right.
export function Kv({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <b className="block text-[13px] font-medium">{title}</b>
        {note && <small className="block text-xs text-fg3">{note}</small>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// The drawer's .hint line: an icon and muted text.
export function Hint({ icon = 'alert', children, className }: { icon?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-2 text-xs text-fg3', className)}>
      <Icon name={icon} size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// The drawer's iconBtn(): an icon-only button whose label is its title.
export function IconButton({ icon, title, className, ...rest }: Omit<ComponentProps<typeof Button>, 'children'> & { icon: string; title: string }) {
  return (
    <Button variant="ghost" size="icon" title={title} aria-label={title} className={className} {...rest}>
      <Icon name={icon} size={16} />
    </Button>
  );
}
```

`extension/entrypoints/sidepanel/shell/Banners.tsx`:
```tsx
import type { ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';
import { focusTab } from '@/lib/panel/target';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

function Banner({ icon, text, children }: { icon: string; text: string; children?: ReactNode }) {
  return (
    <div className="mx-[18px] mt-3 flex items-center gap-2.5 rounded-[14px] border border-warn/40 bg-warn/[0.08] px-3 py-2.5 text-[13px]">
      <Icon name={icon} size={16} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1">{text}</span>
      {children}
    </div>
  );
}

// What the panel can't do right now, and the one action that fixes it.
export function Banners() {
  const { link, target, runner, elsewhere } = usePanel();
  return (
    <>
      {link === 'noScript' && target && (
        <Banner icon="sync" text={L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab')}>
          <Button size="sm" onClick={() => void browser.tabs.reload(target.tabId)}>{L('โหลดแท็บนี้ใหม่', 'Reload this tab')}</Button>
        </Banner>
      )}
      {elsewhere && runner && (
        <Banner icon="upload" text={L('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', 'Another Studio tab is running the queue — change the queue there')}>
          <Button size="sm" onClick={() => void focusTab(runner)}>{L('ไปที่แท็บนั้น', 'Go to that tab')}</Button>
        </Banner>
      )}
    </>
  );
}
```

- [ ] **Step 5: Mount the providers**

`extension/entrypoints/sidepanel/main.tsx` — replace the `createRoot(…)` line:
```tsx
  createRoot(document.getElementById('root')!).render(
    <PanelProvider>
      <AskProvider>
        <App />
      </AskProvider>
    </PanelProvider>,
  );
```
with imports `import { AskProvider } from './ask';` and `import { PanelProvider } from './panel';`.

In `extension/entrypoints/sidepanel/App.tsx`, import `{ Banners }` from `./shell/Banners` and render `<Banners />` right above `<Tabs …>`.

Add to `extension/scripts/strings/extension-only.mjs` (new block at the end of the array):
```js
  // Phase 3a: the side panel
  { th: 'แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', en: 'This tab is not connected to the extension yet — reload this tab', why: 'Studio tab opened before the extension (re)loaded: no content script to talk to' },
  { th: 'โหลดแท็บนี้ใหม่', en: 'Reload this tab', why: 'button for the banner above, and the in-page banner after an extension update (3b)' },
  { th: 'ไปที่แท็บนั้น', en: 'Go to that tab', why: 'the run is in another Studio tab' },
```

- [ ] **Step 6: Run the tests, full check, commit**

Run: `npx vitest run tests/panel-data.test.ts tests/panel-target.test.ts tests/panel-view-sync.test.ts tests/panel-ask.test.tsx` → PASS.
(If `fakeBrowser.tabs.onActivated.trigger` is not a function in this WXT version, replace the `trigger` calls with capturing the listener: `const add = vi.spyOn(browser.tabs.onActivated, 'addListener'); … add.mock.calls[0]![0]({ tabId: 4, windowId: 1 })`, and the same for `onUpdated`.)
Run: `npm run check && npm run build` → all pass.
```bash
git add extension/lib/panel extension/entrypoints/sidepanel extension/scripts/strings/extension-only.mjs extension/tests/panel-data.test.ts extension/tests/panel-target.test.ts extension/tests/panel-view-sync.test.ts extension/tests/panel-ask.test.tsx
git commit -m "Side panel core: stored data, the bound Studio tab, queue view sync, ask(), banners

The panel binds to the Studio tab active in its window, re-reads that tab's
QueueView when the page or storage says something changed, and shows 'Reload
this tab' when no content script answers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: The shell — channel bar and list, activity bar, tabs with counts, Copyright placeholder

**Files:**
- Create: `extension/lib/panel/channels.ts`, `extension/entrypoints/sidepanel/shell/{ChannelBar,ActivityBar}.tsx`, `extension/entrypoints/sidepanel/tabs/{QueueTab,CopyrightTab}.tsx`, `extension/tests/panel-fake.tsx`, `extension/tests/panel-channels.test.ts`, `extension/tests/panel-shell.test.tsx`
- Modify: `extension/entrypoints/sidepanel/App.tsx`, `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Consumes: `usePanel()` (`data`, `view.channel`, `view.items`, `liveState`, `target`, `send`, `write`), `activityFrom` (`lib/activity.ts`), `useAsk`, `IconButton`.
- Produces:
  - `lib/panel/channels.ts`: `channelUrl(tabUrl: string, id: string): string`, `parseChannelId(text: string): string` (`''` when none), `withChannel(list, id): StoredChannel[]`.
  - `ChannelBar`, `ActivityBar({ onGo })`, `CopyrightTab`, `QueueTab` (empty until 3b), `App` (final shell: channel bar, banners, activity bar, tabs with the Upload count, a scroll area that returns to the top on tab change, per-tab footer slot, toasts).
  - `tests/panel-fake.tsx`: `fakePanel(over?: Partial<PanelApi>): PanelApi` with `vi.fn()` writes / send, `renderPanel(ui, api)` (wraps in `PanelContext` + `AskProvider`), `viewWith(items, over?)`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/panel-fake.tsx` (shared by the panel component tests in 3a and 3b):
```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { PanelContext, type PanelApi } from '../entrypoints/sidepanel/panel';
import { toPanelData } from '../lib/panel/data';
import type { QueueState } from '../lib/messages';
import type { QueueView, ViewItem } from '../lib/studio/queue-view';

export const state = (over: Partial<QueueState> = {}): QueueState => ({
  running: false, stopping: false, prog: null, rev: 1,
  channel: { id: 'UC1', name: 'Mine', avatar: '', handle: '@mine', label: 'Mine', problem: '' }, ...over,
});

export const viewWith = (items: Partial<ViewItem>[] = [], over: Partial<QueueView> = {}): QueueView => ({
  items: items.map((it, i) => ({
    id: `i${i}`, src: 'bridge', file: { name: `Clip ${i + 1}.mp4`, size: 2e8, type: 'video/mp4' }, presetId: 'trapsoul', n: i + 1,
    title: `Title ${i + 1}`, titleEdited: false, status: 'pending', msg: '', txt: '', txtName: '', thumb: null, duration: 0,
    at: null, timeProblem: '', artists: '', usesArtists: true, tracklist: null, fixChanges: [], ...it,
  }) as ViewItem),
  current: null,
  schedule: { on: false, set: false, start: 0, late: false, times: [], skipped: 0, taken: [] },
  channel: state().channel,
  state: state(),
  ...over,
});

export function fakePanel(over: Partial<PanelApi> = {}): PanelApi {
  const send = vi.fn(async () => undefined) as unknown as PanelApi['send'];
  return {
    lang: 'en',
    data: toPanelData({}),
    target: { tabId: 1, windowId: 1, url: 'https://studio.youtube.com/channel/UC1/videos', title: 'Studio' },
    link: 'ok',
    view: viewWith(),
    state: state(),
    runner: null,
    liveState: state(),
    elsewhere: false,
    send,
    sendTo: () => send,
    write: {
      settings: vi.fn(async () => {}), counter: vi.fn(async () => {}), activeId: vi.fn(async () => {}),
      presets: vi.fn(async () => {}), channels: vi.fn(async () => {}),
    },
    refresh: vi.fn(),
    ...over,
  };
}

export const renderPanel = (ui: ReactElement, api: PanelApi = fakePanel()) =>
  render(<PanelContext.Provider value={api}><AskProvider>{ui}</AskProvider></PanelContext.Provider>);
```

`extension/tests/panel-channels.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { channelUrl, parseChannelId, withChannel } from '../lib/panel/channels';

describe('channel list helpers', () => {
  it('opens the same Studio page on another channel', () => {
    expect(channelUrl('https://studio.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos/upload?x=1', 'UCbbbbbbbbbbbbbbbbbbbbbb'))
      .toBe('https://studio.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb/videos/upload');
    expect(channelUrl('https://studio.youtube.com/', 'UCbbbbbbbbbbbbbbbbbbbbbb')).toBe('https://studio.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('finds a channel id in an id or a link', () => {
    expect(parseChannelId('https://www.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb?x')).toBe('UCbbbbbbbbbbbbbbbbbbbbbb');
    expect(parseChannelId('@handle')).toBe('');
  });

  it('adds an unknown id at the end, once', () => {
    const one = withChannel([], 'UC1');
    expect(one).toEqual([{ id: 'UC1', name: '', avatar: '', handle: '' }]);
    expect(withChannel(one, 'UC1')).toBe(one);
  });
});
```

`extension/tests/panel-shell.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ActivityBar } from '../entrypoints/sidepanel/shell/ActivityBar';
import { ChannelBar } from '../entrypoints/sidepanel/shell/ChannelBar';
import { toPanelData } from '../lib/panel/data';
import { fakePanel, renderPanel, state, viewWith } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
beforeEach(() => vi.mocked(toast).mockClear());
afterEach(cleanup);

describe('channel bar', () => {
  it('locks to the current channel, and unlocks', () => {
    const api = fakePanel();
    renderPanel(<ChannelBar />, api);
    expect(screen.getByText('Mine')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lock channel/ }));
    expect(api.write.settings).toHaveBeenCalledWith({ lockChannel: { id: 'UC1', name: 'Mine' } });
    expect(toast).toHaveBeenCalledWith('Locked to channel "Mine". Uploads will be blocked on other channels');
    cleanup();
    const locked = fakePanel({ data: toPanelData({ settings: { lockChannel: { id: 'UC1', name: 'Mine' } } }) });
    renderPanel(<ChannelBar />, locked);
    fireEvent.click(screen.getByRole('button', { name: /Locked/ }));
    expect(locked.write.settings).toHaveBeenCalledWith({ lockChannel: null });
  });

  it('cannot lock without a channel id', () => {
    const api = fakePanel({ view: viewWith([], { channel: { id: '', name: '', avatar: '', handle: '', label: 'Unknown channel', problem: '' } }) });
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: /Lock channel/ }));
    expect(api.write.settings).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Could not detect the channel ID. Open the Dashboard or Content page first');
  });

  it('shows the lock problem instead of the id', () => {
    const problem = 'Currently on channel "Mine" but locked to "Other"';
    renderPanel(<ChannelBar />, fakePanel({ view: viewWith([], { channel: { ...state().channel, problem } }) }));
    expect(screen.getByText(problem)).toBeTruthy();
  });

  it('channel list: add by id or link, switch through the switcher, open this one in a new tab', () => {
    const api = fakePanel({ data: toPanelData({ channels: [{ id: 'UC1', name: 'Mine', avatar: '', handle: '@mine' }, { id: 'UC2', name: 'Two', avatar: '', handle: '@two' }] }) });
    renderPanel(<ChannelBar />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Other channels · open in a new tab' }));
    expect(screen.getByText(/this tab/)).toBeTruthy();
    const input = screen.getByPlaceholderText('Channel ID UC… or channel link');
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(toast).toHaveBeenCalledWith('No channel ID found (starts with UC, 24 characters)');
    fireEvent.change(input, { target: { value: 'https://youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const fn = vi.mocked(api.write.channels).mock.calls[0]![0];
    expect(fn([])).toEqual([{ id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: '', avatar: '', handle: '' }]);
    fireEvent.click(screen.getByRole('button', { name: /Switch$/ }));
    expect(api.send).toHaveBeenCalledWith('channel:switch', { name: 'Two', handle: '@two', next: 'https://studio.youtube.com/channel/UC2/videos' });
  });
});

describe('activity bar', () => {
  it('shows the run in progress and its share done', () => {
    const api = fakePanel({
      view: viewWith([{ status: 'uploading' }, { status: 'pending' }]),
      liveState: state({ running: true, prog: { pct: 0.5, text: 'Uploading 50%' } }),
    });
    const go = vi.fn();
    renderPanel(<ActivityBar onGo={go} />, api);
    expect(screen.getByText('Uploading 1/2')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Uploading 1\/2/ }));
    expect(go).toHaveBeenCalledWith('queue');
  });

  it('is hidden when nothing runs', () => {
    renderPanel(<ActivityBar onGo={() => {}} />, fakePanel({ view: viewWith([{ status: 'pending' }]) }));
    expect(screen.queryByText(/Uploading/)).toBe(null);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/panel-channels.test.ts tests/panel-shell.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`extension/lib/panel/channels.ts`:
```ts
import type { StoredChannel } from '../studio/channels';

// The drawer's channel list helpers (3364–3375).
// The same Studio page, on another channel (or that channel's dashboard).
export function channelUrl(tabUrl: string, id: string): string {
  const p = new URL(tabUrl).pathname;
  return 'https://studio.youtube.com' + (/\/channel\/UC[\w-]+/.test(p) ? p.replace(/\/channel\/UC[\w-]+/, '/channel/' + id) : '/channel/' + id);
}

export const parseChannelId = (text: string): string => (text.match(/UC[\w-]{22}/) || [])[0] ?? '';

export const withChannel = (list: StoredChannel[], id: string): StoredChannel[] =>
  list.some((x) => x.id === id) ? list : [...list, { id, name: '', avatar: '', handle: '' }];
```

`extension/entrypoints/sidepanel/shell/ChannelBar.tsx`:
```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { L } from '@/lib/i18n';
import { channelUrl, parseChannelId, withChannel } from '@/lib/panel/channels';
import { cn } from '@/lib/utils';
import { IconButton } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

// The drawer's channel bar (3326–3350, 3418–3440): where the queue uploads to, whether that
// is the locked channel, the lock button and the list of other channels.
export function ChannelBar() {
  const { data, view, write } = usePanel();
  const [listOpen, setListOpen] = useState(false);
  const c = view?.channel;
  const lock = data?.settings.lockChannel ?? null;
  const problem = c?.problem ?? '';
  const toggleLock = () => {
    if (lock) {
      void write.settings({ lockChannel: null });
      return void toast(L('ปลดล็อกช่องแล้ว', 'Channel unlocked'));
    }
    if (!c?.id) return void toast(L('ตรวจไม่พบรหัสช่อง ลองเข้าหน้า Dashboard หรือ Content ก่อน', 'Could not detect the channel ID. Open the Dashboard or Content page first'));
    void write.settings({ lockChannel: { id: c.id, name: c.label } });
    toast(L(`ล็อกไว้ที่ช่อง "${c.label}" แล้ว ถ้าสลับไปช่องอื่นจะอัปไม่ได้`, `Locked to channel "${c.label}". Uploads will be blocked on other channels`));
  };
  return (
    <>
      <div className={cn('flex items-center gap-3 px-[18px] pt-4 pb-3', problem && 'bg-err/[0.09]')}>
        <div className="relative size-10 shrink-0">
          {c?.avatar
            ? <img src={c.avatar} alt="" className="size-10 rounded-full object-cover shadow-[0_0_0_2px_rgba(255,255,255,.25)]" />
            : <div className="grid size-10 place-items-center rounded-full bg-surface2 text-fg3 shadow-[0_0_0_2px_rgba(255,255,255,.25)]"><Icon name="tv" size={18} /></div>}
          <span className={cn('absolute -right-px -bottom-px size-3 rounded-full border-2 border-[#0c0c0e]', problem ? 'bg-err' : 'bg-ok')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium tracking-[.04em] text-white/60">{L('กำลังอัปไปที่ช่อง', 'Uploading to channel')}</div>
          <div className="truncate text-[15px] font-bold">{c?.label ?? '—'}</div>
          <div className={cn('truncate font-mono text-xs text-fg3', problem && 'font-sans font-semibold whitespace-normal text-err')}>{problem || c?.id || '—'}</div>
        </div>
        <IconButton icon="swap" title={L('ช่องอื่น ๆ · เปิดในแท็บใหม่', 'Other channels · open in a new tab')} className="rounded-full bg-white/[0.08]" onClick={() => setListOpen((o) => !o)} />
        <button
          type="button"
          onClick={toggleLock}
          title={lock ? L(`ล็อกไว้ที่ "${lock.name}" · คลิกเพื่อปลดล็อก`, `Locked to "${lock.name}" · click to unlock`) : L('ล็อกให้อัปได้เฉพาะช่องนี้', 'Only allow uploads to this channel')}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.16] bg-white/10 px-3.5 py-[7px] text-xs font-semibold whitespace-nowrap text-fg hover:bg-white/[0.16]',
            lock && !problem && 'border-fg3',
          )}
        >
          <Icon name={lock ? 'lock' : 'unlock'} size={14} />
          {lock ? L('ล็อกแล้ว', 'Locked') : L('ล็อกช่อง', 'Lock channel')}
        </button>
      </div>
      {listOpen && <ChannelList />}
    </>
  );
}

// The drawer's channel list (3379–3405): this tab's channel opens in a new tab; another
// channel goes through the channel switcher, which affects every Studio tab.
function ChannelList() {
  const { data, view, target, send, write } = usePanel();
  const [text, setText] = useState('');
  const channels = data?.channels ?? [];
  const cur = view?.channel.id ?? '';
  const add = () => {
    const id = parseChannelId(text);
    if (!id) return void toast(L('ไม่พบรหัสช่อง (ขึ้นต้นด้วย UC และยาว 24 ตัว)', 'No channel ID found (starts with UC, 24 characters)'));
    void write.channels((list) => withChannel(list, id));
    setText('');
  };
  return (
    <div className="mx-4 mb-3 rounded-[12px] border border-line p-2">
      {channels.length ? channels.map((c) => (
        <div key={c.id} className="flex items-center gap-2 px-0.5 py-1">
          {c.avatar ? <img src={c.avatar} alt="" className="size-[22px] rounded-full" /> : <Icon name="tv" size={16} />}
          <div className="min-w-0 flex-1 truncate" title={c.id}>
            <b>{c.name || c.id}</b>
            {c.id === cur && <small className="text-fg3">{L(' · ช่องนี้', ' · this tab')}</small>}
          </div>
          {c.id === cur ? (
            <Button size="sm" title={L('เปิดช่องนี้ในแท็บใหม่', 'Open this channel in a new tab')} disabled={!target}
              onClick={() => target && void browser.tabs.create({ url: channelUrl(target.url, c.id) })}>
              <Icon name="ext" size={13} />{L('แท็บใหม่', 'New tab')}
            </Button>
          ) : (
            <Button size="sm" title={L('สลับไปช่องนี้ (มีผลกับทุกแท็บ Studio)', 'Switch to this channel (affects every Studio tab)')} disabled={!target}
              onClick={() => target && void send('channel:switch', { name: c.name, handle: c.handle ?? '', next: channelUrl(target.url, c.id) })}>
              <Icon name="swap" size={13} />{L('สลับไปช่องนี้', 'Switch')}
            </Button>
          )}
          <IconButton icon="x" title={L('เอาออกจากรายการ', 'Remove from list')} onClick={() => void write.channels((list) => list.filter((x) => x.id !== c.id))} />
        </div>
      )) : (
        <small className="text-fg3">{L('ยังไม่มีช่องในรายการ — เข้า Studio ของแต่ละช่องครั้งหนึ่ง สคริปต์จะจำให้เอง หรือใส่รหัสช่องด้านล่าง', 'No channels yet — open each channel in Studio once and the script remembers it, or add a channel ID below')}</small>
      )}
      <div className="mt-2 flex gap-1.5">
        <Input value={text} placeholder={L('รหัสช่อง UC… หรือลิงก์ช่อง', 'Channel ID UC… or channel link')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <Button size="sm" className="h-9" onClick={add}><Icon name="plus" size={13} />{L('เพิ่ม', 'Add')}</Button>
      </div>
    </div>
  );
}
```

`extension/entrypoints/sidepanel/shell/ActivityBar.tsx`:
```tsx
import { Progress } from '@/components/ui/progress';
import { activityFrom } from '@/lib/activity';
import { L } from '@/lib/i18n';
import type { TabKey } from '../App';
import { usePanel } from '../panel';

// The drawer's activity bar (actBar 3304–3312, activity() / renderActivity() 4079–4136):
// what is running right now, on every tab; click to go to it. Hidden when idle.
export function ActivityBar({ onGo }: { onGo(tab: TabKey): void }) {
  const { view, liveState } = usePanel();
  const items = view?.items ?? [];
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const a = activityFrom(
    {
      running: !!liveState?.running,
      inFlight: items.some((i) => i.status === 'uploading' || i.status === 'review'),
      total: items.length,
      done: count('done'),
      errors: count('error'),
    },
    null, // the copyright module's status arrives in Phase 4
    liveState?.prog ?? null,
  );
  if (!a) return null;
  const title = a.task === 'upload' && a.count ? L(`กำลังอัปโหลด ${a.count.at}/${a.count.of}`, `Uploading ${a.count.at}/${a.count.of}`) : a.title;
  const pct = a.progress === null ? null : Math.round(a.progress * 100);
  const go = () => onGo(a.tab);
  return (
    <div
      role="button"
      tabIndex={0}
      title={a.detail}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
      className="mx-[18px] mt-3 cursor-pointer rounded-[14px] border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-surface2"
    >
      <div className="flex items-center gap-2 text-[13px]">
        <span className="grid w-5 place-items-center text-fg2">{a.icon}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span className="text-xs text-fg2">{pct === null ? '' : `${pct}%`}</span>
      </div>
      <Progress value={pct} className="mt-2" />
    </div>
  );
}
```

`extension/entrypoints/sidepanel/tabs/QueueTab.tsx` (Phase 3b builds it):
```tsx
export function QueueTab() {
  return null;
}
```

`extension/entrypoints/sidepanel/tabs/CopyrightTab.tsx`:
```tsx
import { L } from '@/lib/i18n';
import { Icon } from '../Icon';

// The copyright scanner / trimmer / autopilot arrive in Phase 4.
export function CopyrightTab() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-fg3">
      <Icon name="shield" size={24} />
      <span>{L('การสแกนและตัดส่วนที่ติดลิขสิทธิ์จะมาในเวอร์ชันถัดไปของส่วนขยาย', 'Copyright scan and trim arrive in a later version of the extension')}</span>
    </div>
  );
}
```

`extension/entrypoints/sidepanel/App.tsx` (replaces Task 5's):
```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';
import { usePanel } from './panel';
import { ActivityBar } from './shell/ActivityBar';
import { Banners } from './shell/Banners';
import { ChannelBar } from './shell/ChannelBar';
import { CopyrightTab } from './tabs/CopyrightTab';
import { QueueTab } from './tabs/QueueTab';

export type TabKey = 'queue' | 'presets' | 'claims' | 'settings';
// The drawer's tabs, in its order (3317).
export const tabDefs = (): [TabKey, string, string][] => [
  ['queue', L('อัปโหลด', 'Upload'), 'queue'],
  ['presets', L('พรีเซ็ต', 'Presets'), 'layers'],
  ['claims', L('ลิขสิทธิ์', 'Copyright'), 'shield'],
  ['settings', L('ตั้งค่า', 'Settings'), 'sliders'],
];

const panes: Record<TabKey, () => ReactNode> = {
  queue: () => <QueueTab />,
  presets: () => null, // Task 9
  claims: () => <CopyrightTab />,
  settings: () => null, // Task 8
};
const footers: Partial<Record<TabKey, () => ReactNode>> = {};

export function App() {
  const [tab, setTab] = useState<TabKey>('queue');
  const { view } = usePanel();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0; // showTab(): each tab opens at its top
  }, [tab]);
  const total = view?.items.length ?? 0;
  return (
    <div className="flex h-dvh flex-col">
      <ChannelBar />
      <Banners />
      <ActivityBar onGo={setTab} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-[18px] mt-3">
          {tabDefs().map(([k, label, ic]) => (
            <TabsTrigger key={k} value={k}>
              <Icon name={ic} size={17} />
              {label}
              {k === 'queue' && total > 0 && (
                <span className="rounded-full bg-white/[0.18] px-1.5 text-xs text-white group-data-[state=active]:bg-[#0b0b0c]">{total}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-4 pb-[18px]">
          {/* Kept mounted like the drawer's panes: edits and expanded cards survive a tab switch. */}
          {tabDefs().map(([k]) => (
            <TabsContent key={k} value={k} forceMount className="data-[state=inactive]:hidden">
              {panes[k]()}
            </TabsContent>
          ))}
        </div>
        {footers[tab]?.()}
      </Tabs>
      <Toaster />
    </div>
  );
}
```

Add to the Phase 3a block of `extension/scripts/strings/extension-only.mjs`:
```js
  { th: 'การสแกนและตัดส่วนที่ติดลิขสิทธิ์จะมาในเวอร์ชันถัดไปของส่วนขยาย', en: 'Copyright scan and trim arrive in a later version of the extension', why: 'placeholder tab until Phase 4' },
```

- [ ] **Step 4: Run, check, commit**

Run: `npx vitest run tests/panel-channels.test.ts tests/panel-shell.test.tsx` → PASS. `npm run check && npm run build` → pass.
```bash
git add extension/lib/panel/channels.ts extension/entrypoints/sidepanel extension/scripts/strings/extension-only.mjs extension/tests/panel-fake.tsx extension/tests/panel-channels.test.ts extension/tests/panel-shell.test.tsx
git commit -m "Side panel shell: channel bar with lock and channel list, activity bar, tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Settings tab, with backup export / import

**Files:**
- Create: `extension/lib/panel/backup-io.ts`, `extension/entrypoints/sidepanel/tabs/SettingsTab.tsx`, `extension/tests/panel-backup.test.ts`, `extension/tests/panel-settings.test.tsx`
- Modify: `extension/entrypoints/sidepanel/App.tsx` (`panes.settings`), `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Consumes: `buildBackup`, `parseBackup`, `applyBackup`, `BackupWrites` (`lib/backup.ts`); `loadSettings`; `load` (`lib/storage.ts`); `runnerTab`; `usePanel()` (`data.settings`, `view.channel`, `send`, `write`); `useAsk`; `diag:dialogInfo`; `backup:write`.
- Produces:
  - `lib/panel/backup-io.ts`: `backupFileName(d?: Date): string`; `exportBackup(version?: string): Promise<{ name: string; json: string; count: number }>`; `type ImportStep = { kind: 'error'; message: string } | { kind: 'ask'; data: Record<string, unknown>; presets: Preset[] }`; `readImport(text): ImportStep`; `importBackup(data, presets, own, write?): Promise<void>`.
  - `SettingsTab`.

Every row is the drawer's (4467–4572), in the same order, with the same strings. Differences: no "Panel opacity" row (D2); the language row has no "the page reloads" note and changes at once (D4); import refuses only while a run is in progress and doesn't reload (D13); the Alt+P hint says "open the panel" (the panel can't be closed by a key).

- [ ] **Step 1: Write the failing tests**

`extension/tests/panel-backup.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { parseBackup } from '../lib/backup';
import { backupFileName, exportBackup, importBackup, readImport } from '../lib/panel/backup-io';

beforeEach(() => fakeBrowser.reset());

describe('backup export', () => {
  it('names the file by date and leaves the locked channel and language out', async () => {
    expect(backupFileName(new Date(2026, 9, 9))).toBe('yt-upload-presets-2026-10-09.json');
    await browser.storage.local.set({
      presets: [{ id: 'a', label: 'A', title: '{name}', description: '', tags: [], visibility: 'PRIVATE' }],
      settings: { producer: 'Me', lang: 'th', lockChannel: { id: 'UC1', name: 'X' } },
      counters: { a: 3 }, cfg: { ownNames: 'ME' },
    });
    const out = await exportBackup('5.0.0');
    expect(out.count).toBe(1);
    const back = parseBackup(out.json);
    expect(back.ok).toBe(true);
    const file = JSON.parse(out.json);
    expect(file).toMatchObject({ version: '5.0.0', activeId: 'a', counters: { a: 3 }, claimsCfg: { ownNames: 'ME' } });
    expect(file.settings).not.toHaveProperty('lang');
    expect(file.settings).not.toHaveProperty('lockChannel');
    expect(file.settings).not.toHaveProperty('glass');
  });
});

describe('backup import', () => {
  const file = (over: Record<string, unknown> = {}) => JSON.stringify({
    app: 'yt-upload-presets', format: 1, activeId: 'b',
    presets: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    settings: { producer: 'Them', delay: 9, glass: 60 }, counters: { a: 7 }, ...over,
  });

  it('explains files it cannot use', () => {
    expect(readImport('{')).toEqual({ kind: 'error', message: "Can't read the file — it must be a .json file exported from this script" });
    expect(readImport('{"app":"other"}')).toEqual({ kind: 'error', message: 'This is not a YouTube Upload Presets backup file, or it is damaged' });
    expect(readImport(file({ format: 9 }))).toEqual({ kind: 'error', message: 'This backup is from a newer version of the script (format 9) — update the script first, then import again' });
  });

  it("someone else's file keeps your personal values; yours brings them", async () => {
    await browser.storage.local.set({ settings: { producer: 'Me' } });
    const step = readImport(file());
    if (step.kind !== 'ask') throw new Error('expected ask');
    const write = vi.fn(async () => {});
    await importBackup(step.data, step.presets, false, write);
    expect(write.mock.calls[0]![0]).toMatchObject({ activeId: 'b', settings: { producer: 'Me', delay: 9 } });
    expect(write.mock.calls[0]![0]).not.toHaveProperty('counters');
    expect(write.mock.calls[0]![0].settings).not.toHaveProperty('glass');
    await importBackup(step.data, step.presets, true, write);
    expect(write.mock.calls[1]![0]).toMatchObject({ settings: { producer: 'Them' }, counters: { a: 7 } });
  });
});
```

`extension/tests/panel-settings.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { SettingsTab } from '../entrypoints/sidepanel/tabs/SettingsTab';
import { toPanelData } from '../lib/panel/data';
import { fakePanel, renderPanel } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
beforeEach(() => vi.mocked(toast).mockClear());
afterEach(cleanup);

describe('settings tab', () => {
  it('switches write one key each', () => {
    const api = fakePanel();
    renderPanel(<SettingsTab />, api);
    fireEvent.click(screen.getByRole('switch', { name: /Notify when the queue finishes/ }));
    expect(api.write.settings).toHaveBeenCalledWith({ notify: false });
    fireEvent.click(screen.getByRole('switch', { name: /Press Next to the Visibility page/ }));
    expect(api.write.settings).toHaveBeenCalledWith({ autoNext: true });
  });

  it('language changes at once', () => {
    const api = fakePanel();
    renderPanel(<SettingsTab />, api);
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / ภาษา' }), { target: { value: 'th' } });
    expect(api.write.settings).toHaveBeenCalledWith({ lang: 'th' });
  });

  it('text fields write trimmed; number fields on blur, clamped like the drawer', () => {
    const api = fakePanel({ data: toPanelData({ settings: { delay: 3 } }) });
    renderPanel(<SettingsTab />, api);
    fireEvent.change(screen.getByPlaceholderText('Mine'), { target: { value: 'Thai Beats ' } });
    expect(api.write.settings).toHaveBeenCalledWith({ producer: 'Thai Beats' });
    const delay = screen.getByRole('spinbutton', { name: /Pause between files/ });
    fireEvent.focus(delay);
    fireEvent.change(delay, { target: { value: '-4' } });
    expect(api.write.settings).not.toHaveBeenCalledWith({ delay: 0 });
    fireEvent.blur(delay);
    expect(api.write.settings).toHaveBeenCalledWith({ delay: 0 });
  });

  it('pace says which pace it is', () => {
    const api = fakePanel();
    renderPanel(<SettingsTab />, api);
    fireEvent.change(screen.getByRole('combobox', { name: /Pace/ }), { target: { value: 'slower' } });
    expect(api.write.settings).toHaveBeenCalledWith({ pace: 'slower' });
    expect(toast).toHaveBeenCalledWith('Pace: Very slow (x2.5)');
  });

  it('copies the upload dialog info from the Studio tab', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const api = fakePanel();
    vi.mocked(api.send).mockResolvedValueOnce({ version: '5.0.0' } as never);
    renderPanel(<SettingsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy upload dialog info' })));
    expect(api.send).toHaveBeenCalledWith('diag:dialogInfo', undefined);
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ version: '5.0.0' }, null, 1));
    expect(toast).toHaveBeenCalledWith('Troubleshooting info copied — paste it to the developer');
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/panel-backup.test.ts tests/panel-settings.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: `backup-io.ts`**

`extension/lib/panel/backup-io.ts`:
```ts
import { browser } from 'wxt/browser';
import { applyBackup, buildBackup, parseBackup, type BackupWrites } from '../backup';
import { L } from '../i18n';
import { sendMessage } from '../messages';
import { defaultPresets, type Preset } from '../presets';
import { loadSettings } from '../settings';
import { load } from '../storage';
import { pad } from '../template';

// Settings → Back up / share (UI section 4375–4462), without the page: the file is built
// from storage, and an import goes to the background, which writes it in order with every
// other settings change (store-writer) and runs later migrations on it.
export const backupFileName = (d = new Date()) => `yt-upload-presets-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;

export async function exportBackup(version = browser.runtime.getManifest().version): Promise<{ name: string; json: string; count: number }> {
  const presets = await load<Preset[]>('presets', defaultPresets());
  const file = buildBackup({
    presets,
    activeId: await load('activeId', presets[0]?.id ?? ''),
    counters: await load<Record<string, number>>('counters', {}),
    settings: await loadSettings(),
    cfg: await load<Record<string, unknown>>('cfg', {}),
  }, version);
  return { name: backupFileName(), json: JSON.stringify(file, null, 2), count: presets.length };
}

export type ImportStep =
  | { kind: 'error'; message: string }
  | { kind: 'ask'; data: Record<string, unknown>; presets: Preset[] };

export function readImport(text: string): ImportStep {
  const r = parseBackup(text);
  if (r.ok) return { kind: 'ask', data: r.data, presets: r.presets };
  if (r.reason === 'json') return { kind: 'error', message: L('อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .json ที่ส่งออกจากสคริปต์นี้', 'Can\'t read the file — it must be a .json file exported from this script') };
  if (r.reason === 'notBackup') return { kind: 'error', message: L('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ YouTube Upload Presets หรือข้อมูลเสียหาย', 'This is not a YouTube Upload Presets backup file, or it is damaged') };
  const fmt = r.format;
  return { kind: 'error', message: L(
    `ไฟล์สำรองนี้มาจากสคริปต์เวอร์ชันใหม่กว่า (format ${fmt}) — อัปเดตสคริปต์ก่อนแล้วนำเข้าอีกครั้ง`,
    `This backup is from a newer version of the script (format ${fmt}) — update the script first, then import again`) };
}

export async function importBackup(
  data: Record<string, unknown>, presets: Preset[], own: boolean,
  write: (w: BackupWrites) => Promise<void> = (w) => sendMessage('backup:write', w),
): Promise<void> {
  const cur = { settings: await loadSettings(), cfg: await load<Record<string, unknown>>('cfg', {}) };
  await write(applyBackup(data, presets, own, cur));
}
```

- [ ] **Step 4: `SettingsTab.tsx`**

`extension/entrypoints/sidepanel/tabs/SettingsTab.tsx`:
```tsx
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { L, type Lang } from '@/lib/i18n';
import { exportBackup, importBackup, readImport } from '@/lib/panel/backup-io';
import { runnerTab } from '@/lib/panel/target';
import type { Settings } from '@/lib/settings';
import { useAsk } from '../ask';
import { Hint, Kv, NumberField, Section, TextField } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

type Flag = 'autoSave' | 'thumb' | 'notify' | 'intercept' | 'autoAcceptInvite' | 'confirmStart' | 'autoApply' | 'quickActions' | 'autoNext';

// The drawer's sw(): a switch with a title and a note.
function Sw({ k, title, desc }: { k: Flag; title: string; desc: string }) {
  const { data, write } = usePanel();
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <Switch aria-label={title} checked={!!data?.settings[k]} onCheckedChange={(v) => void write.settings({ [k]: v })} className="mt-0.5" />
      <span className="min-w-0">
        <b className="block text-[13px] font-medium">{title}</b>
        <small className="block text-xs text-fg3">{desc}</small>
      </span>
    </label>
  );
}

// A <select> whose options are [value, label] pairs, as the drawer built them.
function Pick<K extends keyof Settings>({ k, title, options, after }: { k: K; title: string; options: [string, string][]; after?(label: string): void }) {
  const { data, write } = usePanel();
  return (
    <NativeSelect
      aria-label={title}
      value={String(data?.settings[k] ?? '')}
      onChange={(e) => {
        void write.settings({ [k]: e.target.value } as never);
        after?.(e.target.selectedOptions[0]?.textContent ?? '');
      }}
    >
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </NativeSelect>
  );
}

export function SettingsTab() {
  const { data, view, send, write } = usePanel();
  const ask = useAsk();
  const fileIn = useRef<HTMLInputElement>(null);
  if (!data) return null;
  const s = data.settings;

  const copyDiag = async () => {
    const info = (await send('diag:dialogInfo', undefined)) as { error?: string } | undefined;
    await navigator.clipboard.writeText(JSON.stringify(info, null, 1));
    toast(info?.error ? info.error : L('คัดลอกข้อมูลตรวจปัญหาแล้ว — วางส่งให้ผู้พัฒนาได้เลย', 'Troubleshooting info copied — paste it to the developer'));
  };

  const doExport = async () => {
    const out = await exportBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out.json], { type: 'application/json' }));
    a.download = out.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast(L(`ส่งออกพรีเซ็ต ${out.count} รายการแล้ว`, `Exported ${out.count} presets`));
  };

  const doImport = async (file: File) => {
    if (await runnerTab()) return void toast(L('หยุดคิวก่อนแล้วค่อยนำเข้า', 'Stop the queue before importing'));
    const step = readImport(await file.text());
    if (step.kind === 'error') return void toast(step.message);
    const n = step.presets.length;
    const own = await ask({
      title: L(`นำเข้าพรีเซ็ต ${n} รายการ`, `Import ${n} presets`),
      icon: 'download',
      body: (
        <div>
          <div><b>{step.presets.map((p) => p.label).join(', ')}</b></div>
          <div className="mt-2">{L('พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้และภาษาไม่เปลี่ยน)', 'Existing presets and settings on this device will be replaced (locked channel and language stay unchanged).')}</div>
          <div className="mt-2.5"><b>{L('เป็นไฟล์สำรองของช่องคุณเองไหม?', 'Is this a backup of your own channel?')}</b></div>
          <div className="text-fg3">{L('ของฉัน = นำเข้าค่าส่วนตัวด้วย (ชื่อโปรดิวเซอร์, ตั้งเวลาปล่อย, ชื่อศิลปินของตัวเอง, เลข EP)\nของคนอื่น = นำเข้าแค่พรีเซ็ตและการตั้งค่าทั่วไป ค่าส่วนตัวของคุณไม่เปลี่ยน', 'Mine = also import personal values (producer name, schedule, your own artist names, EP numbers)\nSomeone else\'s = only presets and general settings; your personal values stay unchanged')}</div>
        </div>
      ),
      ok: L('ไฟล์ของฉัน', 'My file'),
      no: L('ไฟล์ของคนอื่น', 'Someone else\'s'),
    });
    if (own === null) return;
    await importBackup(step.data, step.presets, own);
    toast(L(`นำเข้าพรีเซ็ต ${n} รายการแล้ว`, `Imported ${n} presets`));
  };

  return (
    <div>
      <Section title={L('อัปโหลดแบบคิว', 'Queue upload')} icon="queue">
        <Sw k="autoSave" title={L('กด Save ให้อัตโนมัติ', 'Auto-press Save')} desc={L('ตั้งการเปิดเผยตามพรีเซ็ตแล้วกด Save ต่อไฟล์ถัดไปเลย ถ้าปิดไว้จะรอให้คุณตรวจแล้วกด Save เองทีละคลิป', 'Sets visibility from the preset, presses Save and moves on to the next file. When off, waits for you to review and press Save on each video yourself.')} />
        <Sw k="thumb" title={L('อัปภาพปกให้อัตโนมัติ', 'Auto-upload thumbnail')} desc={L('ใช้ไฟล์ .jpg/.png ชื่อเดียวกับคลิป (ไม่เกิน 2MB และช่องต้องยืนยันตัวตนแล้ว)', 'Uses a .jpg/.png with the same name as the video (max 2MB; channel must be verified)')} />
        <Sw k="notify" title={L('แจ้งเตือนเมื่อคิวเสร็จ', 'Notify when the queue finishes')} desc={L('เด้งแจ้งเตือนบนเดสก์ท็อปพร้อมเสียง และโชว์ความคืบหน้าบนชื่อแท็บ เช่น (3/10) — ไปทำอย่างอื่นได้ไม่ต้องเฝ้า', 'Desktop notification with a sound, plus progress in the tab title like (3/10) — no need to keep watching')} />
        <Sw k="intercept" title={L('รับหลายไฟล์จากหน้าต่างของ YouTube', 'Take multiple files from YouTube\'s dialog')} desc={L('เลือกหรือลากหลายไฟล์ในหน้าต่างอัปโหลดปกติของ Studio จะส่งมาเข้าคิวนี้แทน', 'Selecting or dropping multiple files in Studio\'s normal upload dialog sends them to this queue instead')} />
      </Section>

      <Section title={L('ความปลอดภัย', 'Safety')} icon="lock">
        <Sw k="autoAcceptInvite" title={L('กดยอมรับคำเชิญสิทธิ์ช่องให้อัตโนมัติ', 'Auto-accept channel permission invites')} desc={L('เปิดลิงก์ ACCEPT INVITATION จากอีเมลของ YouTube แล้วสคริปต์กด Accept ให้', 'Open the ACCEPT INVITATION link from the YouTube email and the script presses Accept for you')} />
        <Sw k="confirmStart" title={L('ถามยืนยันชื่อช่องก่อนเริ่มคิว', 'Confirm channel name before starting the queue')} desc={L('แสดงชื่อช่องปัจจุบันให้ยืนยันทุกครั้งที่กดเริ่ม', 'Shows the current channel name for confirmation every time you press Start')} />
        <Hint icon="lock" className="mt-1.5">{L('กดปุ่ม "ล็อกช่อง" ด้านบนเพื่อให้อัปได้เฉพาะช่องนั้น ถ้าสลับช่อง คิวจะหยุดเอง', 'Press the "Lock channel" button above to upload only to that channel. If you switch channels, the queue stops automatically.')}</Hint>
      </Section>

      <Section title={L('อัปโหลดทีละไฟล์ (หน้าต่างปกติของ YouTube)', 'Single-file upload (YouTube\'s normal dialog)')} icon="upload">
        <Sw k="autoApply" title={L('เติมข้อมูลอัตโนมัติ', 'Auto-fill details')} desc={L('ใส่ชื่อ/คำอธิบาย/แท็กจากพรีเซ็ตหลักให้ทันทีเมื่อเลือกไฟล์', 'Fills title/description/tags from the default preset as soon as a file is selected')} />
        <Sw k="quickActions" title={L('ปุ่มลัดใต้ช่องชื่อและคำอธิบาย', 'Quick actions under title and description')} desc={L('ปุ่มใส่ชื่อ/คำอธิบาย/แท็กจากพรีเซ็ต, ใส่ .txt, ตรวจ Chapters และคัดลอก — ทั้งในหน้าต่างอัปโหลดและหน้าแก้ไขคลิป', 'Buttons to apply preset title/description/tags, load a .txt, check chapters and copy — in the upload dialog and on the video edit page')} />
        <Sw k="autoNext" title={L('กด Next ไปหน้าการเปิดเผย', 'Press Next to the Visibility page')} desc={L('เลือกการเปิดเผยตามพรีเซ็ตให้ แต่ไม่กด Save', 'Selects visibility from the preset but doesn\'t press Save')} />
      </Section>

      <Section title={L('ตรวจปัญหา', 'Troubleshooting')} icon="alert">
        <Hint>{L('เปิดหน้าต่างอัปโหลดค้างไว้ที่หน้ากรอกรายละเอียด (มีส่วน Thumbnail) แล้วกดปุ่มนี้ ข้อมูลโครงสร้างหน้าจะถูกคัดลอก ส่งไปให้ผู้พัฒนาแก้สคริปต์ได้ (อ่านอย่างเดียว ไม่กดอะไรในหน้า)', 'Keep the upload dialog open on the details page (with the Thumbnail section) and press this button. The page structure info is copied so you can send it to the developer to fix the script (read-only, nothing on the page is clicked).')}</Hint>
        <Button size="sm" className="mt-2.5" onClick={() => void copyDiag()}>
          <Icon name="copy" size={13} />{L('คัดลอกข้อมูลหน้าต่างอัปโหลด', 'Copy upload dialog info')}
        </Button>
      </Section>

      <Section title={L('ทั่วไป', 'General')} icon="sliders">
        <Kv title="Language / ภาษา">
          <NativeSelect aria-label="Language / ภาษา" value={s.lang ?? 'en'} onChange={(e) => void write.settings({ lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="th">ไทย</option>
          </NativeSelect>
        </Kv>
        <Kv title={L('ชื่อโปรดิวเซอร์ {producer}', 'Producer name {producer}')} note={L('ใช้ในชื่อคลิป/คำอธิบาย/แท็ก เช่น "Prod. by {producer}" · เว้นว่าง = ใช้ชื่อช่องปัจจุบัน', 'Used in video title/description/tags, e.g. "Prod. by {producer}" · blank = current channel name')}>
          <TextField className="w-40" value={s.producer} placeholder={view?.channel.name || L('ชื่อช่อง', 'Channel name')} onValue={(v) => void write.settings({ producer: v.trim() })} />
        </Kv>
        <Kv title={L('หมวดหมู่', 'Category')} note={L('ข้อความตามที่ Studio แสดง เช่น Music หรือ เพลง · เว้นว่าง = ไม่ตั้ง', 'Text as Studio shows it, e.g. Music or เพลง · blank = don\'t set')}>
          <TextField className="w-40" value={s.category} onValue={(v) => void write.settings({ category: v.trim() })} />
        </Kv>
        <Kv title="Paid promotion" note={L('คลิปมีการโปรโมตแบบชำระเงินไหม', 'Does the video include paid promotion?')}>
          <Pick k="paidPromotion" title="Paid promotion" options={[['no', L('ไม่มี', 'No')], ['yes', L('มี', 'Yes')], ['skip', L('ไม่ตอบ', 'Don\'t answer')]]} />
        </Kv>
        <Kv title={L('ขั้น Monetisation', 'Monetisation step')} note={L('เปิด/ปิดโฆษณาให้คลิปใหม่', 'Turn ads on/off for new videos')}>
          <Pick k="monetization" title={L('ขั้น Monetisation', 'Monetisation step')} options={[['on', L('เปิดโฆษณา (On)', 'Ads on (On)')], ['off', L('ปิดโฆษณา (Off)', 'Ads off (Off)')], ['skip', L('ทำเอง', 'Manual')]]} />
        </Kv>
        <Kv title={L('ขั้น Ad suitability', 'Ad suitability step')} note={L('ติ๊ก "None of the above" = ยืนยันว่าคลิปไม่มีเนื้อหาในหมวดเหล่านั้น แล้วกด Submit rating (ส่งแล้วแก้ไม่ได้)', 'Tick "None of the above" = confirm the video has none of that content, then press Submit rating (can\'t be changed after submitting)')}>
          <Pick k="adSuitability" title={L('ขั้น Ad suitability', 'Ad suitability step')} options={[['none', 'None of the above'], ['skip', L('ทำเอง', 'Manual')]]} />
        </Kv>
        <Kv title={L('AI use (เนื้อหาดัดแปลง/สังเคราะห์)', 'AI use (altered/synthetic content)')} note={L('คำถาม "Was AI used to generate or edit your content…"', 'The "Was AI used to generate or edit your content…" question')}>
          <Pick k="alteredContent" title={L('AI use (เนื้อหาดัดแปลง/สังเคราะห์)', 'AI use (altered/synthetic content)')} options={[['skip', L('ไม่ตอบ', 'Don\'t answer')], ['no', L('ไม่ใช่', 'No')], ['yes', L('ใช่', 'Yes')]]} />
        </Kv>
        <Kv title={L('ปีที่ใช้ใน {year}', 'Year used in {year}')} note={L('เว้นว่าง = ปีปัจจุบันอัตโนมัติ', 'Blank = current year automatically')}>
          <TextField type="number" min={2000} max={2100} className="w-24" placeholder={String(new Date().getFullYear())} value={s.year} onValue={(v) => void write.settings({ year: v.trim() })} />
        </Kv>
        <Kv title={L('รอใส่ภาพปกนานสุด', 'Max thumbnail wait')} note={L('นาที · ภาพปกใส่ได้หลังวิดีโออัปขึ้นไปแล้ว ไฟล์ใหญ่ตั้งเผื่อไว้', 'Minutes · thumbnail can be set only after the video has uploaded; allow extra for large files')}>
          <NumberField aria-label={L('รอใส่ภาพปกนานสุด', 'Max thumbnail wait')} min={1} max={600} value={String(s.thumbWaitMin)} onValue={(v) => void write.settings({ thumbWaitMin: Math.max(1, Number(v) || 120) })} />
        </Kv>
        <Kv title={L('จังหวะการทำงาน', 'Pace')} note={L('หน้าเว็บโหลดช้า / เน็ตช้า ให้เลือก "ช้า" หรือ "ช้ามาก" สคริปต์จะพักและรอแต่ละขั้นนานขึ้น', 'If the page or connection is slow, choose "Slow" or "Very slow" — the script will pause and wait longer at each step')}>
          <Pick k="pace" title={L('จังหวะการทำงาน', 'Pace')}
            options={[['normal', L('ปกติ (x1)', 'Normal (x1)')], ['slow', L('ช้า (x1.6)', 'Slow (x1.6)')], ['slower', L('ช้ามาก (x2.5)', 'Very slow (x2.5)')]]}
            after={(label) => toast(L(`จังหวะการทำงาน: ${label}`, `Pace: ${label}`))} />
        </Kv>
        <Kv title={L('พักระหว่างไฟล์', 'Pause between files')} note={L('หน่วยวินาที', 'Seconds')}>
          <NumberField aria-label={L('พักระหว่างไฟล์', 'Pause between files')} min={0} max={120} value={String(s.delay)} onValue={(v) => void write.settings({ delay: Math.max(0, Number(v) || 0) })} />
        </Kv>
      </Section>

      <Section title={L('สำรอง / แชร์การตั้งค่า', 'Back up / share settings')} icon="copy">
        <Hint icon="file">{L('ส่งออกพรีเซ็ต การตั้งค่า และการตั้งค่าแท็บลิขสิทธิ์เป็นไฟล์ .json ไว้สำรองหรือส่งให้เพื่อนนำเข้า (ไม่รวมช่องที่ล็อกไว้และประวัติอัปโหลด)', 'Export presets, settings and copyright tab settings to a .json file as a backup or to share with a friend (excludes the locked channel and upload history)')}</Hint>
        <div className="mt-2.5 flex gap-2">
          <input ref={fileIn} type="file" accept=".json,application/json" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void doImport(f);
          }} />
          <Button size="sm" onClick={() => void doExport()}><Icon name="download" size={13} />{L('ส่งออก (.json)', 'Export (.json)')}</Button>
          <Button size="sm" onClick={() => fileIn.current?.click()}><Icon name="upload" size={13} />{L('นำเข้า', 'Import')}</Button>
        </div>
      </Section>

      <Section>
        <Hint icon="sliders">
          <kbd>Alt</kbd> + <kbd>P</kbd>{L(' เปิดแผง · ', ' open the panel · ')}<kbd>Alt</kbd> + <kbd>1…9</kbd>{L(' เลือกพรีเซ็ตหลัก', ' select default preset')}
        </Hint>
        <Hint className="mt-2">{L('ระหว่างที่คิวทำงาน อย่าปิดหรือรีเฟรชแท็บนี้ · YouTube จำกัดจำนวนอัปโหลดต่อวัน ถ้าชนลิมิตคิวจะหยุดเอง', 'While the queue is running, don\'t close or refresh this tab · YouTube limits uploads per day; if you hit the limit the queue stops automatically')}</Hint>
      </Section>
    </div>
  );
}
```

`App.tsx`: import `{ SettingsTab }` from `./tabs/SettingsTab` and set `settings: () => <SettingsTab />` in `panes`.

Add to the Phase 3a block of `scripts/strings/extension-only.mjs`:
```js
  { th: 'หยุดคิวก่อนแล้วค่อยนำเข้า', en: 'Stop the queue before importing', why: 'import refused only while a run is in progress (no reload any more)' },
  { th: 'พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้และภาษาไม่เปลี่ยน)', en: 'Existing presets and settings on this device will be replaced (locked channel and language stay unchanged).', why: 'the drawer sentence without "and the page will reload"' },
  { th: 'นำเข้าพรีเซ็ต ${} รายการแล้ว', en: 'Imported ${} presets', why: 'the drawer reloaded the page instead of confirming' },
  { th: ' เปิดแผง · ', en: ' open the panel · ', why: 'Alt+P opens the side panel; it cannot close it' },
```

- [ ] **Step 5: Run, check, commit**

Run: `npx vitest run tests/panel-backup.test.ts tests/panel-settings.test.tsx` → PASS. (`getByPlaceholderText('Mine')`: the producer field's placeholder is the channel name from `fakePanel`'s view.) `npm run check && npm run build` → pass.
```bash
git add extension/lib/panel/backup-io.ts extension/entrypoints/sidepanel extension/scripts/strings/extension-only.mjs extension/tests/panel-backup.test.ts extension/tests/panel-settings.test.tsx
git commit -m "Settings tab: the drawer's settings, troubleshooting copy, backup export/import

Language changes at once; import goes to the background (one settings writer)
and is refused only while a run is in progress.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Presets tab

**Files:**
- Create: `extension/lib/panel/presets.ts`, `extension/lib/panel/format.ts`, `extension/entrypoints/sidepanel/tabs/PresetsTab.tsx`, `extension/tests/panel-presets.test.ts`, `extension/tests/panel-presets-tab.test.tsx`
- Modify: `extension/entrypoints/sidepanel/App.tsx` (`panes.presets`, `footers.presets`)

**Interfaces:**
- Consumes: `buildVars`, `makeTitle`, `renderTags`, `unknownVars` (`lib/template.ts`); `VARS`, `TITLE_MAX`, `TXT_EXT`, `Visibility` (`lib/constants.ts`); `visLabels`, `defaultPresets`, `Preset`; `readText`, `isTxt`, `isVideo`, `fmtWhen`, `toLocalInput` (`lib/studio/queue-runner.ts`, pure functions); `usePanel()` (`data`, `view.channel`, `send`, `write`); `useAsk`; `fill:apply`.
- Produces:
  - `lib/panel/presets.ts`: `newPreset(now?)`, `duplicatePreset(p, now?)`, `deletePreset(list, id, activeId): { presets; activeId } | null` (null = it is the last one), `resetPresets(): { presets; activeId }`, `splitList(text): string[]`, `artistMaxOf(text): number`, `epCounter(text): number`.
  - `lib/panel/format.ts`: `fmtSize(bytes)`, `fmtDur(sec)`, and re-exports `fmtWhen`, `toLocalInput`, `readText`, `isTxt`, `isVideo`, `isImg`, `statusLabel` from the runner (pure; importing the runner module runs no page code).
  - `PresetsTab`, `PresetsFooter`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/panel-presets.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { artistMaxOf, deletePreset, duplicatePreset, epCounter, newPreset, resetPresets, splitList } from '../lib/panel/presets';
import { fmtDur, fmtSize } from '../lib/panel/format';
import { defaultPresets } from '../lib/presets';

const list = defaultPresets();

describe('preset operations (the drawer\'s preset buttons)', () => {
  it('a new preset gets a time-based id and the drawer\'s starting values', () => {
    expect(newPreset(36 ** 3)).toEqual({ id: 'p1000', label: '✨ New preset', title: '{name}', description: '', tags: [], visibility: 'PRIVATE' });
  });

  it('a duplicate is a deep copy with " (copy)"', () => {
    const d = duplicatePreset(list[0]!, 36 ** 3);
    expect(d).toMatchObject({ id: 'p1000', label: '🌑 TrapSoul Mix (copy)', title: list[0]!.title });
    d.tags.push('x');
    expect(list[0]!.tags).not.toContain('x');
  });

  it('deleting keeps at least one preset and moves the default off a deleted one', () => {
    expect(deletePreset([list[0]!], 'trapsoul', 'trapsoul')).toBe(null);
    expect(deletePreset(list, 'trapsoul', 'trapsoul')).toMatchObject({ activeId: 'playlist' });
    expect(deletePreset(list, 'lofi', 'trapsoul')!.presets.some((p) => p.id === 'lofi')).toBe(false);
    expect(deletePreset(list, 'lofi', 'trapsoul')!.activeId).toBe('trapsoul');
  });

  it('reset brings back the defaults with the first as default', () => {
    expect(resetPresets()).toEqual({ presets: defaultPresets(), activeId: 'trapsoul' });
  });

  it('field parsing is the drawer\'s', () => {
    expect(splitList(' a, b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(artistMaxOf('x')).toBe(4);
    expect(artistMaxOf('0')).toBe(4);
    expect(artistMaxOf('2')).toBe(2);
    expect(epCounter('12')).toBe(11); // "Next EP 12" → 11 done
    expect(epCounter('')).toBe(0);
  });

  it('sizes and durations read like the drawer\'s', () => {
    expect(fmtSize(1_500_000_000)).toBe('1.50 GB');
    expect(fmtSize(25_300_000)).toBe('25.3 MB');
    expect(fmtDur(3 * 3600 + 2 * 60 + 5)).toBe('3:02:05');
    expect(fmtDur(65)).toBe('1:05');
  });
});
```

`extension/tests/panel-presets-tab.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { PresetsFooter, PresetsTab } from '../entrypoints/sidepanel/tabs/PresetsTab';
import { toPanelData } from '../lib/panel/data';
import { fakePanel, renderPanel } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
beforeEach(() => vi.mocked(toast).mockClear());
afterEach(cleanup);

describe('presets tab', () => {
  it('edits the default preset and previews it', () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    const title = screen.getByLabelText('Video title') as HTMLInputElement;
    expect(title.value).toBe('TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}');
    // the preview fills the sample tracklist's artists
    expect(screen.getByText(/^TrapSoul Mix \| SZA, Chris Brown, Brent Faiyaz, Nessy J\. - /)).toBeTruthy();
    fireEvent.change(title, { target: { value: '{name} {oops}' } });
    const saved = vi.mocked(api.write.presets).mock.calls.at(-1)![0];
    expect(saved[0]!.title).toBe('{name} {oops}');
    expect(saved.slice(1)).toEqual(api.data!.presets.slice(1));
  });

  it('warns about unknown variables', () => {
    const presets = toPanelData({}).presets;
    presets[0]!.title = '{name} {oops}';
    renderPanel(<PresetsTab />, fakePanel({ data: toPanelData({ presets }) }));
    expect(screen.getByText(/Unknown variable \{oops\}/)).toBeTruthy();
  });

  it('set as default, and the EP counter', () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    fireEvent.click(screen.getByText('🎧 Playlist + Tracklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }));
    expect(api.write.activeId).toHaveBeenCalledWith('playlist');
    expect(toast).toHaveBeenCalledWith('Set "🎧 Playlist + Tracklist" as the default preset');
    const ep = screen.getByRole('spinbutton', { name: 'Next EP' });
    fireEvent.focus(ep);
    fireEvent.change(ep, { target: { value: '12' } });
    fireEvent.blur(ep);
    expect(api.write.counter).toHaveBeenCalledWith('playlist', 11);
  });

  it('delete asks first and keeps one preset', async () => {
    const api = fakePanel();
    renderPanel(<PresetsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    expect(screen.getByText('Delete preset "🌑 TrapSoul Mix"?')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!));
    expect(vi.mocked(api.write.presets).mock.calls[0]![0].some((p) => p.id === 'trapsoul')).toBe(false);
    expect(api.write.activeId).toHaveBeenCalledWith('playlist');
  });

  it('footer: apply to the open dialog, reset after asking', async () => {
    const api = fakePanel();
    renderPanel(<PresetsFooter />, api);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to open window' }));
    expect(api.send).toHaveBeenCalledWith('fill:apply', undefined);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' })));
    expect(screen.getByText('Reset all presets?')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Reset to defaults' }).at(-1)!));
    expect(api.write.presets).toHaveBeenCalled();
    expect(api.write.activeId).toHaveBeenCalledWith('trapsoul');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/panel-presets.test.ts tests/panel-presets-tab.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: `presets.ts` and `format.ts`**

`extension/lib/panel/presets.ts`:
```ts
import { L } from '../i18n';
import { defaultPresets, type Preset } from '../presets';

// The drawer's preset buttons (4296–4314) and field parsing (bind() 4195–4218).
const idAt = (now: number) => 'p' + now.toString(36);

export const newPreset = (now = Date.now()): Preset => ({
  id: idAt(now), label: L('✨ พรีเซ็ตใหม่', '✨ New preset'), title: '{name}', description: '', tags: [], visibility: 'PRIVATE',
});

export function duplicatePreset(p: Preset, now = Date.now()): Preset {
  const d = { ...structuredClone(p), id: idAt(now) };
  d.label += L(' (สำเนา)', ' (copy)');
  return d;
}

// null: the last preset can't go. Queued items on the deleted preset move to the default
// preset in the Studio tab (lib/studio/queue-edit.ts followStoredChanges).
export function deletePreset(list: Preset[], id: string, activeId: string): { presets: Preset[]; activeId: string } | null {
  if (list.length < 2) return null;
  const presets = list.filter((p) => p.id !== id);
  return { presets, activeId: presets.some((p) => p.id === activeId) ? activeId : presets[0]!.id };
}

export function resetPresets(): { presets: Preset[]; activeId: string } {
  const presets = defaultPresets();
  return { presets, activeId: presets[0]!.id };
}

export const splitList = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean);
export const artistMaxOf = (text: string) => Math.max(1, parseInt(text, 10) || 4);
// "Next EP" shows counter + 1; the counter is what the next number follows.
export const epCounter = (text: string) => Math.max(1, parseInt(text, 10) || 1) - 1;
```

`extension/lib/panel/format.ts`:
```ts
import { pad } from '../template';

// Formatting the drawer used on cards (3746, 3874). The runner's own pure helpers are
// re-exported: importing lib/studio/queue-runner runs no page code, it only defines functions.
export const fmtSize = (b: number) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');
export const fmtDur = (sec: number) => {
  const t = Math.round(sec), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return (hh ? hh + ':' + pad(mm) : mm) + ':' + pad(ss);
};
export { fmtWhen, isImg, isTxt, isVideo, readText, statusLabel, toLocalInput } from '../studio/queue-runner';
```

- [ ] **Step 4: `PresetsTab.tsx`**

`extension/entrypoints/sidepanel/tabs/PresetsTab.tsx`:
```tsx
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TITLE_MAX, TXT_EXT, VARS, type Visibility } from '@/lib/constants';
import { L } from '@/lib/i18n';
import { isTxt, isVideo, readText } from '@/lib/panel/format';
import { artistMaxOf, deletePreset, duplicatePreset, epCounter, newPreset, resetPresets, splitList } from '@/lib/panel/presets';
import { visLabels, type Preset } from '@/lib/presets';
import { buildVars, makeTitle, renderTags, unknownVars } from '@/lib/template';
import { cn } from '@/lib/utils';
import { useAsk } from '../ask';
import { AreaField, Hint, Kv, NumberField, Section, TextField } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

// The drawer's sample for the preview (4153–4159); drop a real .txt on the test field to change it.
const SAMPLE_TXT = [
  '00:00 BLXD - Late Night Calls',
  '02:50 Nessy J. - Toxic Craving',
  '05:10 BLXD x Chris Brown - When I Call Your Name',
  '08:30 SZA - Snooze (Cover by BLXD)',
  '11:20 BLXD - Waiting On Me (ft. Brent Faiyaz)',
].join('\n');

type Field = HTMLInputElement | HTMLTextAreaElement;
const stopDrag = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };

export function PresetsTab() {
  const { data, view, write } = usePanel();
  const ask = useAsk();
  const presets = data?.presets ?? [];
  const activeId = data?.activeId ?? '';
  const [editId, setEditId] = useState(activeId);
  const [sampleName, setSampleName] = useState('nessy_j_mix.mp4');
  const [sampleTxt, setSampleTxt] = useState(SAMPLE_TXT);
  const [sampleLbl, setSampleLbl] = useState<string | null>(null);
  const [focusLabel, setFocusLabel] = useState(false);
  const lastField = useRef<Field | null>(null);
  const titleEl = useRef<HTMLInputElement>(null);
  const labelEl = useRef<HTMLInputElement>(null);
  const listEl = useRef<HTMLDivElement>(null);
  // Writes build on the last list written, not on a render that may not have caught up.
  const latest = useRef(presets);
  useEffect(() => { latest.current = presets; }, [presets]);
  // renderPresetEditor(): a preset that is gone falls back to the default one
  const p = presets.find((x) => x.id === editId) ?? presets.find((x) => x.id === activeId) ?? presets[0];
  useEffect(() => { if (p && p.id !== editId) setEditId(p.id); }, [p, editId]);
  useEffect(() => {
    if (!focusLabel) return;
    setFocusLabel(false);
    labelEl.current?.focus();
    labelEl.current?.select();
  }, [focusLabel, p?.id]);
  useEffect(() => { listEl.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' }); }, [editId]);
  if (!data || !p) return null;

  const savePresets = (next: Preset[]) => { latest.current = next; void write.presets(next); };
  const update = (patch: Partial<Preset>) => savePresets(latest.current.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
  const add = (np: Preset) => { savePresets([...latest.current, np]); setEditId(np.id); };

  // insertVar(): put text at the cursor of the field last edited (title by default)
  const insert = (text: string) => {
    const f = lastField.current ?? titleEl.current;
    if (!f) return;
    f.focus();
    f.setRangeText(text, f.selectionStart ?? f.value.length, f.selectionEnd ?? f.value.length, 'end');
    f.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const remember = (e: { currentTarget: Field }) => { lastField.current = e.currentTarget; };

  const n = (data.counters[p.id] || 0) + 1;
  const vars = buildVars(sampleName, n, sampleTxt, { preset: p }, { year: data.settings.year, producer: data.settings.producer, channelName: view?.channel.name ?? '' });
  const t = makeTitle(p, vars);
  const bad = unknownVars(p);
  const VIS = visLabels();

  const onDescDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    const f = [...(e.dataTransfer?.files ?? [])].find(isTxt);
    if (!f) return;
    stopDrag(e);
    lastField.current = e.currentTarget;
    insert((await readText(f)).replace(/\r\n/g, '\n').trim());
    toast(L(`แทรกเนื้อหาจาก ${f.name} แล้ว`, `Inserted content from ${f.name}`));
  };
  const onSampleDrop = async (e: DragEvent<HTMLInputElement>) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    const txt = files.find(isTxt);
    const vid = files.find(isVideo);
    if (!txt && !vid) return;
    stopDrag(e);
    if (txt) {
      setSampleTxt(await readText(txt));
      setSampleLbl(txt.name);
    }
    setSampleName((vid || txt)!.name.replace(TXT_EXT, '.mp4'));
  };

  const remove = async () => {
    const next = deletePreset(latest.current, p.id, activeId);
    if (!next) return void toast(L('ต้องมีพรีเซ็ตอย่างน้อย 1 อัน', 'You must keep at least 1 preset'));
    const go = await ask({
      title: L(`ลบพรีเซ็ต "${p.label}"?`, `Delete preset "${p.label}"?`),
      body: L('คลิปในคิวที่ใช้พรีเซ็ตนี้จะเปลี่ยนไปใช้พรีเซ็ตหลัก', 'Queued videos using this preset will switch to the default preset'),
      ok: L('ลบ', 'Delete'), danger: true, icon: 'clear',
    });
    if (!go) return;
    savePresets(next.presets);
    if (next.activeId !== activeId) void write.activeId(next.activeId);
    setEditId(next.activeId);
  };

  return (
    <div>
      <Section title={L('พรีเซ็ตทั้งหมด', 'All presets')} icon="layers">
        <div ref={listEl} className="max-h-[220px] overflow-y-auto">
          {presets.map((x, i) => (
            <div
              key={x.id}
              role="button"
              tabIndex={0}
              data-on={x.id === p.id}
              title={L(`Alt+${i + 1} = ตั้งเป็นพรีเซ็ตหลัก`, `Alt+${i + 1} = set as default preset`)}
              onClick={() => setEditId(x.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditId(x.id); }}
              className={cn('flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-transparent px-2 py-1.5 hover:bg-surface', x.id === p.id && 'border-line2 bg-surface')}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-surface2 text-xs text-fg2">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13px] font-medium">{x.label || L('(ไม่มีชื่อ)', '(untitled)')}</b>
                <span className="block truncate text-xs text-fg3">{x.title || ''}</span>
              </div>
              {x.id === activeId && (
                <span className="flex items-center gap-1 rounded-full bg-surface2 px-2 text-xs text-fg2"><Icon name="star" size={10} />{L('หลัก', 'Default')}</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => { add(newPreset()); setFocusLabel(true); }}><Icon name="plus" size={13} />{L('ใหม่', 'New')}</Button>
          <Button size="sm" onClick={() => add(duplicatePreset(p))}><Icon name="copy" size={13} />{L('ทำสำเนา', 'Duplicate')}</Button>
          <Button size="sm" onClick={() => {
            void write.activeId(p.id);
            toast(L(`ตั้ง "${p.label}" เป็นพรีเซ็ตหลักแล้ว`, `Set "${p.label}" as the default preset`));
          }}><Icon name="star" size={13} />{L('ตั้งเป็นหลัก', 'Set as default')}</Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghostDanger" onClick={() => void remove()}><Icon name="clear" size={13} />{L('ลบ', 'Delete')}</Button>
        </div>
      </Section>

      <Section title={L('ข้อมูลคลิป', 'Video details')} icon="film">
        <Label>{L('ชื่อพรีเซ็ต', 'Preset name')}</Label>
        <TextField ref={labelEl} aria-label={L('ชื่อพรีเซ็ต', 'Preset name')} value={p.label || ''} onValue={(v) => update({ label: v })} />
        <Label><span>{L('ชื่อคลิป', 'Video title')}</span><span className={cn(t.length > TITLE_MAX && 'text-err')}>{`${t.length}/${TITLE_MAX}`}</span></Label>
        <TextField ref={titleEl} aria-label={L('ชื่อคลิป', 'Video title')} value={p.title || ''} onFocus={remember} onValue={(v) => update({ title: v })} />
        <Label><span>{L('คำอธิบาย', 'Description')}</span><span>{L('ลาก .txt มาวางเพื่อแทรกข้อความ', 'Drop a .txt here to insert its text')}</span></Label>
        <AreaField aria-label={L('คำอธิบาย', 'Description')} value={p.description || ''} onFocus={remember} onDragOver={stopDrag} onDrop={(e) => void onDescDrop(e)} onValue={(v) => update({ description: v })} />
        <Label>{L('แท็ก', 'Tags')}</Label>
        <TextField aria-label={L('แท็ก', 'Tags')} placeholder={L('คั่นด้วยเครื่องหมายจุลภาค ,', 'Separate with commas ,')} value={(p.tags || []).join(', ')} onFocus={remember} onValue={(v) => update({ tags: splitList(v) })} />
        <Label><span>{L('ตัวแปร', 'Variables')}</span><span>{L('คลิกเพื่อแทรกในช่องที่กำลังแก้', 'Click to insert into the field being edited')}</span></Label>
        <div className="flex flex-wrap gap-1.5">
          {VARS.map((v) => (
            <button key={v} type="button" title={L('แทรกลงช่องที่กำลังแก้', 'Insert into the field being edited')}
              onMouseDown={(e) => e.preventDefault()} onClick={() => insert(`{${v}}`)}
              className="cursor-pointer rounded-full border border-line2 px-2 py-0.5 font-mono text-xs text-fg2 hover:border-fg2 hover:text-fg">{`{${v}}`}</button>
          ))}
        </div>
        <Hint className="mt-2.5">{L('ครอบด้วย [[ ... ]] เพื่อให้ส่วนนั้นหายไปเมื่อตัวแปรข้างในว่าง เช่น [[ | {bpm} BPM]]', 'Wrap in [[ ... ]] to hide that part when the variable inside is empty, e.g. [[ | {bpm} BPM]]')}</Hint>
      </Section>

      <Section title={L('ตัวอย่างบน YouTube', 'YouTube preview')} icon="tv">
        <div className="flex gap-3 rounded-[12px] border border-line bg-surface p-2.5">
          <div className="relative grid h-[54px] w-24 shrink-0 place-items-center rounded-lg bg-surface2 text-fg3">
            <Icon name="play" size={26} />
            <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-xs text-white">2:53:12</span>
          </div>
          <div className="min-w-0">
            <div className="line-clamp-2 text-[13px] font-medium">{t || '—'}</div>
            <div className="mt-0.5 text-xs text-fg3">{`${view?.channel.label ?? '—'} · ${VIS[(p.visibility || 'PRIVATE') as Visibility]}`}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {renderTags(p, vars).map((tag) => <span key={tag} className="rounded bg-surface2 px-1.5 text-xs text-fg2">{tag}</span>)}
        </div>
        {bad.length > 0 && (
          <div className="mt-2 rounded-[10px] bg-warn/[0.12] px-2.5 py-1.5 text-xs text-warn">
            {L(`⚠ ไม่รู้จักตัวแปร ${bad.join(' ')} — จะขึ้นบน YouTube เป็นข้อความตรง ๆ (ดูชื่อที่ใช้ได้ที่ปุ่ม "ตัวแปร" ด้านล่าง)`, `⚠ Unknown variable ${bad.join(' ')} — it will appear on YouTube as literal text (see the "Variables" buttons below for valid names)`)}
          </div>
        )}
        <Label><span>{L('ทดลองกับไฟล์', 'Test with a file')}</span><span>{sampleLbl ?? L('tracklist ตัวอย่าง', 'Sample tracklist')}</span></Label>
        <TextField aria-label={L('ทดลองกับไฟล์', 'Test with a file')} value={sampleName} onValue={setSampleName} onDragOver={stopDrag} onDrop={(e) => void onSampleDrop(e)} />
        <Hint icon="clip" className="mt-1.5">{L('ลาก .mp4 หรือ .txt จริงมาวางที่ช่องนี้เพื่อดูผลลัพธ์', 'Drop a real .mp4 or .txt here to preview the result')}</Hint>
      </Section>

      <Section title={L('ศิลปิน', 'Artists')} icon="queue">
        <Label><span>{L('ให้ขึ้นก่อนใน {artists}', 'Prioritised in {artists}')}</span><span>{L('เฉพาะคนที่อยู่ใน tracklist', 'Only those in the tracklist')}</span></Label>
        <TextField aria-label={L('ให้ขึ้นก่อนใน {artists}', 'Prioritised in {artists}')} placeholder={L('เช่น SZA, Chris Brown, Nessy J., BLXD', 'e.g. SZA, Chris Brown, Nessy J., BLXD')}
          value={(p.artistPriority || []).join(', ')} onValue={(v) => update({ artistPriority: splitList(v) })} />
        <Kv title={L('จำนวนสูงสุดในชื่อคลิป', 'Max in video title')} note={L('ถ้าชื่อยาวเกิน 100 ตัวอักษรจะลดให้อัตโนมัติ', 'Auto-reduced if the title exceeds 100 characters')}>
          <TextField type="number" min={1} max={10} className="w-24" aria-label={L('จำนวนสูงสุดในชื่อคลิป', 'Max in video title')} value={String(p.artistMax || 4)} onValue={(v) => update({ artistMax: artistMaxOf(v) })} />
        </Kv>
      </Section>

      <Section title={L('การเผยแพร่', 'Publishing')} icon="send">
        <div className="grid grid-cols-3 gap-1 rounded-[12px] border border-line bg-surface p-1">
          {(Object.entries(VIS) as [Visibility, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => update({ visibility: k })}
              className={cn('cursor-pointer rounded-[9px] py-1.5 text-xs text-fg2 hover:text-fg', (p.visibility || 'PRIVATE') === k && 'bg-surface2 text-fg')}>{label}</button>
          ))}
        </div>
        <Kv title={L('EP ถัดไป', 'Next EP')} note={L('ค่าของ {n} สำหรับคลิปถัดไป', 'Value of {n} for the next video')}>
          <NumberField aria-label={L('EP ถัดไป', 'Next EP')} min={1} value={String(n)} onValue={(v) => void write.counter(p.id, epCounter(v))} />
        </Kv>
      </Section>
    </div>
  );
}

// The Presets tab footer (4347–4356).
export function PresetsFooter() {
  const { send, write } = usePanel();
  const ask = useAsk();
  const reset = async () => {
    const go = await ask({
      title: L('คืนค่าพรีเซ็ตทั้งหมด?', 'Reset all presets?'),
      body: L('พรีเซ็ตที่แก้ไว้จะหายไป และกลับเป็นค่าเริ่มต้น (ส่งออกไฟล์สำรองในแท็บตั้งค่าก่อนได้)', 'Your edited presets will be lost and replaced by the defaults (you can export a backup in Settings first)'),
      ok: L('คืนค่าเริ่มต้น', 'Reset to defaults'), danger: true, icon: 'refresh',
    });
    if (!go) return;
    const r = resetPresets();
    await write.presets(r.presets);
    await write.activeId(r.activeId);
  };
  return (
    <div className="flex gap-2 border-t border-line px-[18px] py-3.5">
      <Button className="flex-1" title={L('ใส่พรีเซ็ตหลักลงหน้าต่างอัปโหลดที่เปิดอยู่', 'Apply the default preset to the open upload dialog')} onClick={() => void send('fill:apply', undefined)}>
        <Icon name="send" size={14} />{L('ใส่ลงหน้าต่างที่เปิดอยู่', 'Apply to open window')}
      </Button>
      <Button variant="ghostDanger" onClick={() => void reset()}><Icon name="refresh" size={14} />{L('คืนค่าเริ่มต้น', 'Reset to defaults')}</Button>
    </div>
  );
}
```

In `App.tsx`: import `{ PresetsFooter, PresetsTab }` from `./tabs/PresetsTab`; `presets: () => <PresetsTab />` in `panes`; `footers` becomes `{ presets: () => <PresetsFooter /> }`.

- [ ] **Step 5: Run, check, commit**

Run: `npx vitest run tests/panel-presets.test.ts tests/panel-presets-tab.test.tsx` → PASS. `npm run check && npm run build` → pass.
```bash
git add extension/lib/panel/presets.ts extension/lib/panel/format.ts extension/entrypoints/sidepanel extension/tests/panel-presets.test.ts extension/tests/panel-presets-tab.test.tsx
git commit -m "Presets tab: list, editor, variables, YouTube preview, EP counter, reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Phase 3a wrap-up

**Files:**
- Modify: `extension/README.md`

- [ ] **Step 1: README**

In `extension/README.md`, replace the paragraph that starts `Until the Phase 3 side panel, the developer panel drives the Studio tab:` with:
```md
The side panel (`entrypoints/sidepanel/`, React + Tailwind v4 + `components/ui/`) talks to the
Studio tab active in its window: it asks for a `QueueView` and sends `queue:*` messages; it
never touches Studio's DOM. Logic the panel needs lives in `lib/panel/` (unit-tested).
`npm run ui-check` proves every shipped UI string is one of the userscript's `L()` pairs (or
is listed with a reason in `scripts/strings/extension-only.mjs`) and that no text is below 12px.
`settings` and `counters` have one writer, the background (`store:patch`, `lib/store-writer.ts`).
Console lines from the extension start with `[ytup]`.
```
and in `## Layout` add:
```md
- `entrypoints/sidepanel/` — the side panel (React); `lib/panel/` — its logic; `components/ui/` — shadcn-style components
- `scripts/ui-check.mjs`, `scripts/strings/` — strings parity with the userscript, 12px floor
```

- [ ] **Step 2: Full verification**

From `extension/`: `npm run check && npm run build`
Expected: tsc clean; every test passes; `port-check` `ok` ×14; `ui-check: ok`; build succeeds with `sidepanel.html`.
From the repo root: `node --test test/*.test.mjs` → 163 pass (the userscript's own tests, untouched); `git diff --stat d15ef87 -- youtube-upload-presets.user.js test` → no output.

- [ ] **Step 3: Commit**

```bash
git add extension/README.md
git commit -m "Document the side panel's layout, ui-check and the settings writer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## What comes next

**Phase 3b** (`docs/superpowers/plans/2026-10-09-chrome-extension-phase-3b.md`): the Upload tab (file intake by drop / pick / folder, re-grant, cards with every edit, schedule box, start confirmation, stop routed to the running tab, retry-with-draft), Alt+P as a manifest command, the in-page FAB and "Reload this tab" banner, `ui-check --coverage`, the README checklist for Phases 2 and 3 run from the panel, and the spec amendments (D5, D6, D8, D9).
