# Chrome Extension — Phase 3b (Side panel: the Upload tab, in-page FAB, exit check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Phase 3a (`docs/superpowers/plans/2026-10-09-chrome-extension-phase-3a.md`) is complete: `store:patch` / `backup:write`, `queue:view` / `queue:edit` / `channel:switch`, `ui-check`, the React panel with `PanelProvider` / `usePanel()`, `AskProvider` / `useAsk()`, `fields.tsx`, `tests/panel-fake.tsx`, the shell, Settings and Presets.

**Goal:** Build the **Upload** tab with behaviour parity to the userscript drawer — drop or pick files and folders, re-grant file access after a restart, queue cards with every edit, the schedule box, the start confirmation, Stop routed to the running tab, retry-with-draft — plus Alt+P, the in-page FAB, and the "Reload this tab" banner after an extension update. Then switch on the drawer-coverage half of `ui-check`, rewrite the README manual checklist so every Phase 2 and Phase 3 check runs from the real panel, amend the spec, and pass the spec's Phase 3 exit check: **the upload checklist passes using only the panel**.

**Architecture:** As 3a. Files dropped or picked in the panel are stored as `FileSystemFileHandle`s under fresh `crypto.randomUUID()` ids (`lib/file-store.ts`) and handed to the Studio tab by id (`queue:add`, or `queue:edit` `attach` for a card); the tab fetches them through the file bridge (Phase 2). Everything the cards show comes from the tab's `QueueView`; every change is a `queue:*` message. The start confirmation is the runner's `StartSummary` rendered by the panel (`queue:preflight` → `ask()` → `queue:start({ channelId, ids })`). In-page UI (FAB, banner) is plain TS DOM in a Shadow DOM root, like Phase 2's toast.

**Tech Stack:** as Phase 3a. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` — "File intake", "Side panel UI", "In-page UI", "Error handling", rollout row 3.

## Global Constraints

Identical to Phase 3a's **Global Constraints** (exact versions, nothing outside `extension/` except this plan and the spec amendment in Task 6, no edits to the userscript / `test/` / ported regions, `L()` pairs from the userscript or listed in `scripts/strings/extension-only.mjs`, 12px floor, exact manifest permissions, strict TS, component tests in happy-dom with `cleanup()`, commands from `extension/`, commit trailer per agent environment, never stage `.claude/` / `.vitest/` dirs). Decisions D1–D13 of Phase 3a apply. Phase 3b adds:

| # | Topic | Decision |
|---|---|---|
| D14 | Stop | Sent to the tab holding the runner lock. When that isn't the panel's tab, the panel says which tab will stop (new string); the panel shows toasts from its own tab only. |
| D15 | Channel switch while files are queued | Allowed (the files survive now); refused only while a run is in progress (Phase 3a Task 3). |
| D16 | FAB | Kept as the userscript's FAB — channel, default preset, activity badge, drag to move (`fabPos`) — and a click opens the side panel through the background. It no longer takes dropped files (the panel is the drop target; files dropped on a page can't be stored for the bridge). If the manual check finds that `sidePanel.open()` doesn't accept the click (Phase 0 spike item), delete the FAB mount in `studio.content.ts` (one line, Task 5) and record it. |
| D17 | Alt+P | A manifest command (`_execute_action`, suggested Alt+P) opens the panel from anywhere in Chrome; the page's own Alt+P (Phase 3a) is the fallback when Chrome didn't assign the key. Neither can close the panel. |
| D18 | Re-grant | One banner button, "Re-grant access (N files)", shown while any waiting or failed item's file has lost read permission; it asks for every such handle in one click. |

## File Structure

```
extension/
  lib/
    panel/
      intake.ts                NEW  drop / pick / folder → handles → stored ids → the tab
      regrant.ts               NEW  which queued files lost permission; ask again
      schedule-quick.ts        NEW  the schedule box's quick picks and parsing
      start.ts                 NEW  start (preflight → confirm → start) and stop routing
    studio/
      fab.ts                   NEW  the userscript's FAB in a Shadow DOM root
      reload-banner.ts         NEW  "Reload this tab" after the extension was updated / reloaded
  entrypoints/
    studio.content.ts          MOD  refused adds let their files go; FAB; banner; spike FAB removed
    sidepanel/
      App.tsx                  MOD  whole-panel drop target, Upload footer
      tabs/QueueTab.tsx        MOD  drop zone, toolbar, schedule box, stats, list
      tabs/QueueCard.tsx       NEW  one queue item
      tabs/ScheduleBox.tsx     NEW  the schedule box
      tabs/QueueFooter.tsx     NEW  Start / Stop / Clear done; the start summary
      shell/Banners.tsx        MOD  re-grant banner
  wxt.config.ts                MOD  commands: _execute_action Alt+P
  scripts/strings/extension-only.mjs   MOD  3b's new pairs
  package.json                 MOD  check runs ui-check --coverage
  README.md                    MOD  Phase 3 exit checklist (replaces the Phase 2 one)
  tests/
    panel-intake.test.ts panel-regrant.test.ts panel-schedule.test.ts panel-start.test.ts
    panel-queue.test.tsx panel-i18n.test.tsx fab.test.ts reload-banner.test.ts       NEW
docs/superpowers/specs/2026-10-05-chrome-extension-design.md   MOD  amendments (Task 6)
```

Userscript line map (pinned commit): drop zone and drop handling 3500–3591 · toolbar 3569–3586 · stats / progress 3587–3601 · schedule box 3603–3717 · footer 3731–3744 · `buildCard` 3752–3872 · `updateItemUI` 3878–3936 · `attachToItem` 3938–3947 · `renderAttachments` 3949–4023 · `renderQueue` 4025–4042 · `updateRunUI` 4044–4077 · FAB 3288–3300, 3453–3486, 4119–4135 · start summary (runner) 2111–2143.

---
### Task 1: File intake and re-grant (`lib/panel/intake.ts`, `lib/panel/regrant.ts`)

**Files:**
- Create: `extension/lib/panel/intake.ts`, `extension/lib/panel/regrant.ts`, `extension/tests/panel-intake.test.ts`, `extension/tests/panel-regrant.test.ts`
- Modify: `extension/entrypoints/studio.content.ts` (refused adds let their files go), `extension/entrypoints/sidepanel/shell/Banners.tsx` (re-grant banner), `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Consumes: `putHandle`, `getHandle`, `deleteHandle` (`lib/file-store.ts`); `VIDEO_EXT`-style extension lists; `QueueItem`; `dropFiles` (`queue-files.ts`); `mayEdit`.
- Produces:
  - `lib/panel/intake.ts`: `hasFiles(dt)`, `dropHandles(dt): Promise<(FileSystemHandle | null)[]>` (call it synchronously inside the drop event), `expandHandles(handles): Promise<FileSystemFileHandle[]>`, `storeHandles(files, put?): Promise<string[]>`, `sendFiles(files, deliver, put?, del?): Promise<number>`, `pickFiles(win?)`, `pickFolder(win?)`, `pickAttachments(win?)`, `PICK_VIDEO`, `PICK_ATTACH`.
  - `lib/panel/regrant.ts`: `queuedFileIds(items): string[]`, `needingGrant(ids, get?): Promise<string[]>`, `regrant(ids, get?): Promise<number>`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/panel-intake.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { expandHandles, pickFiles, sendFiles, storeHandles } from '../lib/panel/intake';

const file = (name: string) => ({ kind: 'file', name }) as unknown as FileSystemFileHandle;
const dir = (name: string, kids: unknown[]) => ({
  kind: 'directory', name,
  async *values() { yield* kids; },
}) as unknown as FileSystemDirectoryHandle;

describe('intake', () => {
  it('reads folders two levels deep and skips hidden files inside them (filesFromDrop)', async () => {
    const tree = dir('Mixes', [
      file('Mix 1.mp4'), file('.DS_Store'),
      dir('Covers', [file('Mix 1.jpg'), dir('Old', [file('ignored.mp4')])]),
    ]);
    const got = await expandHandles([tree, file('Mix 2.mp4'), null]);
    expect(got.map((h) => h.name).sort()).toEqual(['Mix 1.jpg', 'Mix 1.mp4', 'Mix 2.mp4']);
  });

  it('stores each file under a fresh unguessable id', async () => {
    const put = vi.fn(async () => {});
    const ids = await storeHandles([file('a.mp4'), file('b.mp4')], put);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(put.mock.calls.map(([id]) => id)).toEqual(ids);
  });

  it('a tab that does not take the files gets them forgotten again', async () => {
    const del = vi.fn(async () => {});
    await expect(sendFiles([file('a.mp4')], async () => { throw new Error('no receiver'); }, async () => {}, del)).rejects.toThrow('no receiver');
    expect(del).toHaveBeenCalledOnce();
    expect(await sendFiles([], async () => {})).toBe(0);
  });

  it('a cancelled picker is no files, not an error', async () => {
    const win = { showOpenFilePicker: async () => { throw new DOMException('cancelled', 'AbortError'); } } as unknown as Window;
    expect(await pickFiles(win)).toEqual([]);
  });
});
```

`extension/tests/panel-regrant.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { needingGrant, queuedFileIds, regrant } from '../lib/panel/regrant';
import type { QueueItem } from '../lib/studio/queue-runner';

const item = (id: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}) =>
  ({ id, src: 'bridge', status, thumb: null, ...extra }) as QueueItem;
const handle = (state: PermissionState, after: PermissionState = state) =>
  ({ queryPermission: async () => state, requestPermission: async () => after }) as unknown as FileSystemFileHandle;

describe('re-grant', () => {
  it('only files of items still to upload, from the panel', () => {
    expect(queuedFileIds([
      item('a', 'pending', { thumb: { id: 't', src: 'bridge', name: 'a.jpg', size: 1, type: '' } }),
      item('b', 'error'), item('c', 'done'), item('d', 'pending', { src: 'page' }), item('e', 'uploading'),
    ])).toEqual(['a', 't', 'b']);
  });

  it('finds the handles that lost permission, and asks for all of them', async () => {
    const handles: Record<string, FileSystemFileHandle> = { a: handle('granted'), b: handle('prompt', 'granted'), c: handle('prompt', 'denied') };
    const get = async (id: string) => handles[id];
    expect(await needingGrant(['a', 'b', 'c', 'gone'], get)).toEqual(['b', 'c']);
    expect(await regrant(['b', 'c'], get)).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/panel-intake.test.ts tests/panel-regrant.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`extension/lib/panel/intake.ts`:
```ts
import { deleteHandle, putHandle } from '../file-store';

// Files dropped on the panel or picked with its buttons (UI section 3500–3591). Their handles
// go into the extension's IndexedDB under fresh ids — the queue item ids, which must stay
// unguessable (lib/file-bridge.ts) — and the Studio tab fetches each File through the bridge.

export const hasFiles = (dt: DataTransfer | null | undefined) => [...(dt?.types ?? [])].includes('Files');

// getAsFileSystemHandle() must be called for every item inside the drop event, before the
// first await: the DataTransfer is emptied afterwards.
export const dropHandles = (dt: DataTransfer | null | undefined): Promise<(FileSystemHandle | null)[]> =>
  Promise.all([...(dt?.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFileSystemHandle()));

// filesFromDrop(): a dropped or picked folder is read two levels deep; hidden files inside
// folders are skipped.
export async function expandHandles(handles: (FileSystemHandle | null)[]): Promise<FileSystemFileHandle[]> {
  const out: FileSystemFileHandle[] = [];
  const walk = async (h: FileSystemHandle, depth: number) => {
    if (h.kind === 'file') {
      if (depth === 0 || !h.name.startsWith('.')) out.push(h as FileSystemFileHandle);
    } else if (depth < 2) {
      for await (const c of (h as FileSystemDirectoryHandle).values()) await walk(c, depth + 1);
    }
  };
  for (const h of handles) if (h) await walk(h, 0);
  return out;
}

export async function storeHandles(files: FileSystemFileHandle[], put = putHandle): Promise<string[]> {
  const ids: string[] = [];
  for (const f of files) {
    const id = crypto.randomUUID();
    await put(id, f);
    ids.push(id);
  }
  return ids;
}

// Store, then hand the ids to the Studio tab (queue:add, or a card's attach). If the tab
// doesn't take them, nothing else will ever ask for these handles: forget them.
export async function sendFiles(
  files: FileSystemFileHandle[], deliver: (ids: string[]) => Promise<unknown>,
  put = putHandle, del = deleteHandle,
): Promise<number> {
  if (!files.length) return 0;
  const ids = await storeHandles(files, put);
  try {
    await deliver(ids);
  } catch (e) {
    for (const id of ids) await del(id).catch(() => {});
    throw e;
  }
  return ids.length;
}

// The drawer's <input type=file accept="video/*,.txt,image/*"> and accept=".txt,image/*".
const VIDEO = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.wmv', '.flv', '.3gp', '.mpg', '.mpeg'];
const IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
export const PICK_VIDEO: FilePickerAcceptType[] = [{ accept: { 'video/*': VIDEO, 'text/plain': ['.txt'], 'image/*': IMAGE } }];
export const PICK_ATTACH: FilePickerAcceptType[] = [{ accept: { 'text/plain': ['.txt'], 'image/*': IMAGE } }];

const cancelled = (e: unknown) => (e as DOMException)?.name === 'AbortError';

export async function pickFiles(win: Window = window, types = PICK_VIDEO): Promise<FileSystemFileHandle[]> {
  try {
    return await win.showOpenFilePicker({ multiple: true, types });
  } catch (e) {
    if (cancelled(e)) return [];
    throw e;
  }
}
export const pickAttachments = (win: Window = window) => pickFiles(win, PICK_ATTACH);

export async function pickFolder(win: Window = window): Promise<FileSystemFileHandle[]> {
  try {
    return await expandHandles([await win.showDirectoryPicker()]);
  } catch (e) {
    if (cancelled(e)) return [];
    throw e;
  }
}
```

`extension/lib/panel/regrant.ts`:
```ts
import { getHandle } from '../file-store';
import type { QueueItem } from '../studio/queue-runner';

// After a browser restart, read permission on stored handles can go back to 'prompt'
// (spec: File intake, step 4). The panel shows one button for all of them; one click asks
// for each (a user gesture is needed, and the panel has one).
export const queuedFileIds = (items: QueueItem[]): string[] =>
  items
    .filter((it) => it.status === 'pending' || it.status === 'error')
    .flatMap((it) => [...(it.src === 'bridge' ? [it.id] : []), ...(it.thumb?.src === 'bridge' ? [it.thumb.id] : [])]);

type Get = (id: string) => Promise<FileSystemFileHandle | undefined>;

export async function needingGrant(ids: string[], get: Get = getHandle): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const h = await get(id).catch(() => undefined);
    if (h && (await h.queryPermission({ mode: 'read' })) !== 'granted') out.push(id);
  }
  return out;
}

export async function regrant(ids: string[], get: Get = getHandle): Promise<number> {
  let granted = 0;
  for (const id of ids) {
    const h = await get(id).catch(() => undefined);
    if (h && (await h.requestPermission({ mode: 'read' })) === 'granted') granted++;
  }
  return granted;
}
```

In `extension/entrypoints/studio.content.ts`, a refused add or attach must let its stored handles go (nothing else will ask for them). Import `dropFiles` with `bridgeFiles` from `@/lib/studio/queue-files`, and change the two handlers:
```ts
    const letGo = (ids: string[]) => dropFiles(ids.map((id) => ({ id, src: 'bridge' as const })));
    onMessage('queue:add', async ({ data: ids }) => {
      if (!(await mayEdit())) return letGo(ids);
      const { files, failed } = await bridgeFiles(ids);
      if (failed.length) ui.toast(L(`เพิ่มไม่ได้ ${failed.length} ไฟล์: `, `Could not add ${failed.length} file(s): `) + failed[0]!.reason);
      if (files.length) await addQueued(files);
    });
```
```ts
    onMessage('queue:edit', async ({ data }) => {
      if (await mayEdit()) await editQueue(data);
      else if (data.op === 'attach') letGo(data.fileIds);
    });
```

`extension/entrypoints/sidepanel/shell/Banners.tsx` — add the re-grant banner. Imports: `useEffect, useState` from `react`, `{ needingGrant, queuedFileIds, regrant }` from `@/lib/panel/regrant`. Inside `Banners()`, before `return`:
```tsx
  const { view, refresh } = usePanel();
  const [lost, setLost] = useState<string[]>([]);
  const ids = view ? queuedFileIds(view.items).join(',') : '';
  useEffect(() => {
    let alive = true;
    void needingGrant(ids ? ids.split(',') : []).then((l) => { if (alive) setLost(l); });
    return () => { alive = false; };
  }, [ids]);
```
(merge `view` and `refresh` into the existing `usePanel()` destructuring), and inside the fragment, first:
```tsx
      {lost.length > 0 && (
        <Banner icon="lock" text={L('ไฟล์ในคิวต้องขออนุญาตอ่านอีกครั้งหลังเปิดเบราว์เซอร์ใหม่', 'Files in the queue need read access again after a browser restart')}>
          <Button size="sm" onClick={() => void regrant(lost).then(() => needingGrant(lost)).then((l) => { setLost(l); refresh(); })}>
            {L(`อนุญาตอีกครั้ง (${lost.length} ไฟล์)`, `Re-grant access (${lost.length} files)`)}
          </Button>
        </Banner>
      )}
```

Add a Phase 3b block to `scripts/strings/extension-only.mjs`:
```js
  // Phase 3b: the Upload tab, FAB, banner
  { th: 'ไฟล์ในคิวต้องขออนุญาตอ่านอีกครั้งหลังเปิดเบราว์เซอร์ใหม่', en: 'Files in the queue need read access again after a browser restart', why: 'file handles lose permission after a restart (spec: File intake step 4)' },
  { th: 'อนุญาตอีกครั้ง (${} ไฟล์)', en: 'Re-grant access (${} files)', why: 'one click re-grants every queued file' },
```

- [ ] **Step 4: Run, check, commit**

Run: `npx vitest run tests/panel-intake.test.ts tests/panel-regrant.test.ts` → PASS. `npm run check` → pass.
```bash
git add extension/lib/panel/intake.ts extension/lib/panel/regrant.ts extension/entrypoints/studio.content.ts extension/entrypoints/sidepanel/shell/Banners.tsx extension/scripts/strings/extension-only.mjs extension/tests/panel-intake.test.ts extension/tests/panel-regrant.test.ts
git commit -m "Panel file intake (drop, pick, folders) and one-click re-grant

Handles go into the extension's IndexedDB under fresh ids and reach the Studio
tab by id; a tab that refuses them lets them go.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Upload tab and its cards

**Files:**
- Create: `extension/entrypoints/sidepanel/tabs/QueueCard.tsx`, `extension/tests/panel-queue.test.tsx`
- Modify: `extension/entrypoints/sidepanel/tabs/QueueTab.tsx`, `extension/entrypoints/sidepanel/App.tsx` (whole-panel drop target)

**Interfaces:**
- Consumes: `usePanel()` (`data`, `view`, `liveState`, `send`, `write`), `useAsk`, intake (`hasFiles`, `dropHandles`, `expandHandles`, `sendFiles`, `pickFiles`, `pickFolder`, `pickAttachments`), `fmtSize`, `fmtDur`, `fmtWhen`, `toLocalInput`, `statusLabel`, `isVideo` (`lib/panel/format.ts`), `presetIn`, `getHandle`, `QueueEdit`, `ViewItem`, `THUMB_MAX`, `TITLE_MAX`, `locale`.
- Produces: `QueueTab` (drop zone, toolbar, `ScheduleBox` slot — Task 3 —, stats, progress, list, empty state); `QueueCard({ it, prev, next, open, onOpen })`; `useAddFiles(): (files: FileSystemFileHandle[]) => Promise<void>`; `usePanelDrop(onDrop: () => void): { dropping: boolean; handlers }` for `App`.

- [ ] **Step 1: Write the failing test**

`extension/tests/panel-queue.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueueCard } from '../entrypoints/sidepanel/tabs/QueueCard';
import { QueueTab } from '../entrypoints/sidepanel/tabs/QueueTab';
import type { QueueView, ViewItem } from '../lib/studio/queue-view';
import { fakePanel, renderPanel, state, viewWith } from './panel-fake';

afterEach(cleanup);

const one = (it: Partial<ViewItem>, over: Partial<QueueView> = {}) => {
  const view = viewWith([it], over);
  const api = fakePanel({ view });
  renderPanel(<QueueCard it={view.items[0]!} open={false} onOpen={() => {}} />, api);
  return api;
};

describe('queue card', () => {
  it('Remove is offered while waiting, and sends queue:remove', () => {
    const api = one({ status: 'pending' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from queue' }));
    expect(api.send).toHaveBeenCalledWith('queue:remove', 'i0');
  });

  it('no Remove while uploading, waiting for Save, or while its file is being fetched', () => {
    one({ status: 'uploading' });
    expect(screen.queryByRole('button', { name: 'Remove from queue' })).toBe(null);
    cleanup();
    one({ status: 'review' });
    expect(screen.queryByRole('button', { name: 'Remove from queue' })).toBe(null);
    cleanup();
    one({ status: 'pending' }, { current: 'i0' });
    expect(screen.queryByRole('button', { name: 'Remove from queue' })).toBe(null);
  });

  it('Retry with a leftover draft asks first', async () => {
    const api = one({ status: 'error', draftId: 'abcdefghijk', msg: 'boom' });
    expect(screen.getByRole('button', { name: 'Open draft' })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(screen.getByText('This video is already in Studio')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(api.send).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Deleted it, upload again' })));
    expect(api.send).toHaveBeenCalledWith('queue:retry', 'i0');
  });

  it('Retry without a draft goes straight away', () => {
    const api = one({ status: 'error' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.send).toHaveBeenCalledWith('queue:retry', 'i0');
  });

  it('expanded: edits go to the Studio tab as queue:edit', () => {
    const view = viewWith([{ status: 'pending', at: 1_900_000_000_000 }]);
    const api = fakePanel({ view });
    renderPanel(<QueueCard it={view.items[0]!} open onOpen={() => {}} />, api);
    fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'Mine' } });
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'title', id: 'i0', title: 'Mine' });
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'lofi' } });
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'preset', id: 'i0', presetId: 'lofi' });
    fireEvent.change(screen.getByLabelText('Artists'), { target: { value: 'SZA' } });
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'artists', id: 'i0', artists: 'SZA' });
  });

  it('tracklist chips and the fix button', () => {
    const api = one({ status: 'pending', txt: '0:05 A\n0:07 B', txtName: 'c.txt', tracklist: { errors: ['First timestamp must be 0:00 (currently 0:05)', 'Needs at least 3 timestamps (has 2)'], warnings: [], count: 2 }, fixChanges: ['First timestamp 0:05 → 0:00'] });
    expect(screen.getByText('c.txt · 2 lines')).toBeTruthy();
    expect(screen.getByText('Tracklist: 2 problem(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fix tracklist/ }));
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'fixTracklist', id: 'i0' });
  });

  it('a past release time is flagged while the item can change', () => {
    one({ status: 'pending', at: Date.now() - 1000, timeProblem: 'Release time must be at least 15 minutes in the future' });
    expect(screen.getByTitle('Release time must be at least 15 minutes in the future')).toBeTruthy();
  });
});

describe('upload tab', () => {
  it('stats, apply-to-all with the default preset, and the empty state', () => {
    const api = fakePanel({ view: viewWith([{ status: 'pending' }, { status: 'done' }, { status: 'error' }]) });
    renderPanel(<QueueTab />, api);
    const stats = screen.getByTestId('stats');
    expect(within(stats).getByText('Total').previousSibling?.textContent).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: /Apply to all/ }));
    expect(api.send).toHaveBeenCalledWith('queue:edit', { op: 'presetAll', presetId: 'trapsoul' });
    cleanup();
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([]) }));
    expect(screen.getByText('No videos in the queue yet')).toBeTruthy();
  });

  it('Apply to all is off while the queue runs', () => {
    renderPanel(<QueueTab />, fakePanel({ view: viewWith([{ status: 'uploading' }]), liveState: state({ running: true }) }));
    expect((screen.getByRole('button', { name: /Apply to all/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the default preset select writes activeId', () => {
    const api = fakePanel({ view: viewWith([]) });
    renderPanel(<QueueTab />, api);
    fireEvent.change(screen.getByTitle('Preset for newly added videos'), { target: { value: 'lofi' } });
    expect(api.write.activeId).toHaveBeenCalledWith('lofi');
    expect(vi.mocked(api.send)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/panel-queue.test.tsx`
Expected: FAIL — `QueueCard` missing, `QueueTab` empty.

- [ ] **Step 3: `QueueCard.tsx`**

`extension/entrypoints/sidepanel/tabs/QueueCard.tsx`:
```tsx
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { THUMB_MAX, TITLE_MAX } from '@/lib/constants';
import { getHandle } from '@/lib/file-store';
import { L, locale } from '@/lib/i18n';
import { presetIn } from '@/lib/panel/data';
import { fmtDur, fmtSize, fmtWhen, isVideo, statusLabel, toLocalInput } from '@/lib/panel/format';
import { dropHandles, expandHandles, hasFiles, pickAttachments, sendFiles } from '@/lib/panel/intake';
import type { QueueEdit } from '@/lib/studio/queue-edit';
import type { FileRef, ItemStatus } from '@/lib/studio/queue-runner';
import type { ViewItem } from '@/lib/studio/queue-view';
import { cn } from '@/lib/utils';
import { useAsk } from '../ask';
import { IconButton, TextField } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

// One queue item: the drawer's buildCard() / updateItemUI() / renderAttachments()
// (3752–4023). The data is the Studio tab's (QueueView); every control sends queue:*.
const MSG_ICON: Record<ItemStatus, string> = { pending: 'alert', uploading: 'upload', review: 'alert', done: 'check', error: 'alert' };
const TONE: Record<string, string> = { muted: 'text-fg3', info: 'text-info', warn: 'text-warn', ok: 'text-ok', err: 'text-err' };
const waiting = (x?: ViewItem) => !!x && (x.status === 'pending' || x.status === 'error');
type Edit = QueueEdit extends infer E ? (E extends { id: string } ? Omit<E, 'id'> : never) : never;

// The thumbnail dropped on the panel, shown on the card (only while read access holds).
function useThumbUrl(ref: FileRef | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!ref || ref.src !== 'bridge') return void setUrl(null);
    let alive = true;
    let made: string | null = null;
    void (async () => {
      const h = await getHandle(ref.id).catch(() => undefined);
      if (!h || (await h.queryPermission({ mode: 'read' })) !== 'granted') return;
      const f = await h.getFile().catch(() => null);
      if (!f || !alive) return;
      made = URL.createObjectURL(f);
      setUrl(made);
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [ref?.id, ref?.src]);
  return url;
}

const openTab = (url: string) => void browser.tabs.create({ url });
const Chip = ({ children, className, ...rest }: { children: ReactNode; className?: string; title?: string; onClick?(): void }) =>
  rest.onClick
    ? <button type="button" className={cn('inline-flex cursor-pointer items-center gap-1 rounded-full border border-line2 px-2 py-0.5 text-xs text-fg2 hover:text-fg', className)} {...rest}>{children}</button>
    : <Badge className={className} title={rest.title}>{children}</Badge>;
const RemoveX = ({ onClick }: { onClick(): void }) => (
  <span role="button" tabIndex={0} title={L('เอาออก', 'Remove')} aria-label={L('เอาออก', 'Remove')} onClick={onClick} className="ml-0.5 cursor-pointer opacity-70 hover:opacity-100">
    <Icon name="x" size={11} />
  </span>
);

export function QueueCard({ it, prev, next, open, onOpen }: { it: ViewItem; prev?: ViewItem; next?: ViewItem; open: boolean; onOpen(open: boolean): void }) {
  const { data, view, liveState, send } = usePanel();
  const ask = useAsk();
  const titleEl = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const thumbUrl = useThumbUrl(it.thumb);
  const current = it.id === view?.current;
  const editable = waiting(it) && !current;
  const edit = (e: Edit) => void send('queue:edit', { ...e, id: it.id } as QueueEdit);
  useEffect(() => {
    if (open && editable) titleEl.current?.focus({ preventScroll: true });
  }, [open]); // focus the title when the card opens, as the drawer did
  if (!data) return null;

  const p = presetIn(data, it.presetId);
  const status = statusLabel(it.status);
  const at = it.at;
  const bad = editable ? it.timeProblem : '';
  const pct = it.status === 'uploading' && liveState?.prog && liveState.prog.pct !== null ? Math.round(liveState.prog.pct * 100) : null;
  const removable = it.status !== 'uploading' && it.status !== 'review' && !current;

  const attachFiles = async (files: FileSystemFileHandle[]) => {
    try {
      await sendFiles(files, (ids) => send('queue:edit', { op: 'attach', id: it.id, fileIds: ids }));
    } catch {
      toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
    }
  };
  // A .txt or image dropped on the card attaches to it; videos and folders go to the panel.
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer) || !editable) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDrag(true);
  };
  const onDrop = (e: DragEvent) => {
    setDrag(false);
    if (!hasFiles(e.dataTransfer) || !editable) return;
    const files = [...e.dataTransfer.files];
    if (!files.length || files.some(isVideo) || e.dataTransfer.items[0]?.webkitGetAsEntry()?.isDirectory) return;
    e.preventDefault();
    e.stopPropagation();
    const pending = dropHandles(e.dataTransfer); // inside the event, before any await
    void pending.then(expandHandles).then(attachFiles);
  };
  const retry = async () => {
    if (it.draftId && !(await ask({
      title: L('คลิปนี้อยู่ใน Studio แล้ว', 'This video is already in Studio'),
      body: L(`อัปขึ้นไปเป็นฉบับร่างแล้ว (${it.draftId}) ถ้าลองใหม่จะได้คลิปซ้ำ\nลบฉบับร่างในหน้า Content ก่อน แล้วค่อยอัปใหม่`, `It was already uploaded as a draft (${it.draftId}). Retrying will create a duplicate.\nDelete the draft in Content first, then upload again.`),
      ok: L('ลบแล้ว อัปใหม่', 'Deleted it, upload again'), icon: 'refresh',
    }))) return;
    void send('queue:retry', it.id);
  };

  // renderAttachments()
  const chips: ReactNode[] = [];
  const tc = it.tracklist;
  if (it.txt) {
    const lines = it.txt.trim().split(/\r?\n/).length;
    chips.push(
      <Chip key="txt" title={it.txt.slice(0, 600)}>
        <Icon name="file" size={13} /><span>{L(`${it.txtName} · ${lines} บรรทัด`, `${it.txtName} · ${lines} lines`)}</span>
        {editable && <RemoveX onClick={() => edit({ op: 'dropTxt' })} />}
      </Chip>,
    );
  }
  if (it.txt && tc) {
    if (it.fixChanges.length && editable) {
      chips.push(
        <Chip key="fix" className="border-transparent bg-[#f4f4f5] font-semibold text-[#0b0b0c] hover:bg-white hover:text-[#0b0b0c]" title={it.fixChanges.join('\n')} onClick={() => edit({ op: 'fixTracklist' })}>
          <Icon name="note" size={13} />{L('แก้ tracklist ให้', 'Fix tracklist')}
        </Chip>,
      );
    }
    if (tc.errors.length) {
      chips.push(
        <Badge key="tlerr" tone="bad" title={L('YouTube จะไม่สร้าง Chapters จนกว่าจะแก้:\n', 'YouTube won\'t create chapters until fixed:\n') + tc.errors.map((x) => '• ' + x).join('\n') + (tc.warnings.length ? '\n\n' + tc.warnings.map((x) => '• ' + x).join('\n') : '')}>
          <Icon name="alert" size={13} /><span>{L(`tracklist: ${tc.errors.length} ปัญหา`, `Tracklist: ${tc.errors.length} problem(s)`)}</span>
        </Badge>,
      );
    } else if (tc.warnings.length) {
      chips.push(
        <Badge key="tlwarn" tone="bad" title={[...tc.errors, ...tc.warnings].map((x) => '• ' + x).join('\n')}>
          <Icon name="alert" size={13} /><span>{L(`tracklist: ${tc.warnings.length} คำเตือน`, `Tracklist: ${tc.warnings.length} warning(s)`)}</span>
        </Badge>,
      );
    }
    if (tc.count && !tc.errors.length) {
      const durNote = it.duration ? '' : it.durState === 'loading'
        ? L(' · กำลังอ่านความยาวคลิป…', ' · reading video length…')
        : L(' · อ่านความยาวคลิปไม่ได้ จึงยังไม่ได้เช็กว่า timestamp เกินความยาวคลิปไหม', ' · could not read the video length, so timestamps were not checked against it');
      chips.push(
        <Badge key="tlok" tone={it.durState === 'fail' ? 'warn' : undefined} title={L('ผ่านกฎ Chapters ของ YouTube', 'Passes YouTube\'s chapter rules') + durNote}>
          <Icon name={it.durState === 'fail' ? 'alert' : 'check'} size={13} />
          <span>{L(`Chapters ${tc.count} ช่วง`, `${tc.count} chapters`) + (it.durState === 'fail' ? L(' · ไม่ได้เช็กความยาว', ' · length not checked') : '')}</span>
        </Badge>,
      );
    } else if (!tc.count) {
      chips.push(
        <Badge key="tlnone" tone="bad" title={L('ไฟล์ .txt ไม่มีบรรทัดที่ขึ้นต้นด้วยเวลา เช่น 00:00 ชื่อเพลง', 'The .txt has no lines starting with a time, e.g. 00:00 Song name')}>
          <Icon name="alert" size={13} /><span>{L('ไม่มี timestamp — ไม่มี Chapters', 'No timestamps — no chapters')}</span>
        </Badge>,
      );
    }
  }
  if (it.thumb) {
    const big = it.thumb.size > THUMB_MAX;
    chips.push(
      <Badge key="thumb" tone={big ? 'bad' : undefined} title={it.thumb.name}>
        <Icon name="image" size={13} />
        <span>{big ? L('ภาพปกเกิน 2MB', 'Thumbnail over 2MB') : L(`ภาพปก · ${fmtSize(it.thumb.size)}`, `Thumbnail · ${fmtSize(it.thumb.size)}`)}</span>
        {editable && <RemoveX onClick={() => edit({ op: 'dropThumb' })} />}
      </Badge>,
    );
  }
  if (it.prev && editable) {
    const when = new Intl.DateTimeFormat(locale() === 'th-TH' ? 'th-TH-u-ca-gregory' : locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(it.prev.date));
    const videoId = it.prev.videoId;
    chips.push(
      <Chip key="prev" className="border-transparent bg-warn/[0.12] text-warn hover:text-warn"
        title={L(`ไฟล์นี้เคยอัปขึ้นช่องนี้แล้ว: ${it.prev.title || ''}\nคลิกเพื่อเปิดคลิปนั้น · ถ้าตั้งใจอัปซ้ำ ปล่อยไว้ได้`, `This file was already uploaded to this channel: ${it.prev.title || ''}\nClick to open that video · leave it if the re-upload is intended`)}
        onClick={() => { if (videoId) openTab(`https://studio.youtube.com/video/${videoId}/edit`); }}>
        <Icon name="alert" size={13} /><span>{L(`เคยอัปแล้ว ${when}`, `Already uploaded ${when}`)}</span>
      </Chip>,
    );
  }
  if (editable && (!it.txt || !it.thumb)) {
    chips.push(
      <Chip key="add" className="border-dashed" onClick={() => void pickAttachments().then(attachFiles)}>
        <Icon name="clip" size={13} />{L('แนบ .txt / ภาพปก', 'Attach .txt / thumbnail')}
      </Chip>,
    );
  }

  const toggle = () => onOpen(!open);
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={cn(
        'mt-2 rounded-[16px] border border-white/[0.09] bg-white/5 p-3 hover:border-white/[0.16]',
        (it.status === 'uploading' || it.status === 'review') && 'border-info/35',
        it.status === 'error' && 'border-err/35',
        drag && 'border-fg2',
      )}
    >
      <div
        className="flex cursor-pointer gap-3"
        onClick={(e) => { if (!(e.target as HTMLElement).closest('button:not([data-exp]),input,select,a,[role=button]')) toggle(); }}
      >
        <div className="relative grid h-[52px] w-[92px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white/[0.06] text-fg3" title={fmtSize(it.file.size)}>
          {thumbUrl ? <img src={thumbUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <Icon name="film" size={22} />}
          <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-xs text-white">{it.duration ? fmtDur(it.duration) : fmtSize(it.file.size)}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={it.file.name}>{it.file.name}</span>
            <IconButton data-exp icon="chev" className={cn('size-7 transition-transform', open && 'rotate-180')}
              title={open ? L('ย่อ', 'Collapse') : editable ? L('แก้ไขรายละเอียด', 'Edit details') : L('ดูรายละเอียด', 'Show details')} onClick={toggle} />
            {removable && <IconButton icon="x" className="size-7 hover:text-err" title={L('เอาออกจากคิว', 'Remove from queue')} onClick={() => void send('queue:remove', it.id)} />}
          </div>
          {!open && <div className={cn('truncate text-xs text-white/60', it.title.length > TITLE_MAX && 'text-err')} title={it.title}>{it.title || '—'}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-xs', TONE[status.tone])}>{status.text}</span>
            {at !== null && (
              <span className={cn('inline-flex items-center gap-1 text-xs text-fg2', bad && 'text-warn')}
                title={bad || (it.publishEdited ? L('เวลาที่ตั้งเอง', 'Manually set time') : L('เวลาตามคิว', 'Queue time'))}>
                <Icon name={bad ? 'alert' : 'clock'} size={11} />{fmtWhen(at)}
              </span>
            )}
            {it.status === 'error' && <Button size="sm" onClick={() => void retry()}><Icon name="refresh" size={13} />{L('ลองใหม่', 'Retry')}</Button>}
            {it.status === 'error' && it.draftId && (
              <Button size="sm" title={L('เปิดฉบับร่างที่ค้างใน Studio (แท็บใหม่) เพื่อลบก่อนลองใหม่', 'Open the leftover draft in Studio (new tab) to delete it before retrying')}
                onClick={() => openTab(`https://studio.youtube.com/video/${it.draftId}/edit`)}>
                <Icon name="ext" size={13} />{L('เปิดฉบับร่าง', 'Open draft')}
              </Button>
            )}
          </div>
        </div>
        {editable && (
          <div className="flex flex-col">
            <IconButton icon="up" className="size-7" title={L('เลื่อนขึ้น', 'Move up')} disabled={!waiting(prev)} onClick={() => edit({ op: 'move', by: -1 })} />
            <IconButton icon="down" className="size-7" title={L('เลื่อนลง', 'Move down')} disabled={!waiting(next)} onClick={() => edit({ op: 'move', by: 1 })} />
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-2.5">
          <div>
            <div className="mb-1 text-xs text-fg2">{L('พรีเซ็ต', 'Preset')}</div>
            <NativeSelect aria-label={L('พรีเซ็ต', 'Preset')} className="w-full" disabled={!editable} value={p.id} onChange={(e) => edit({ op: 'preset', presetId: e.target.value })}>
              {data.presets.map((x, i) => <option key={x.id} value={x.id}>{`${i + 1}. ${x.label}`}</option>)}
            </NativeSelect>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-fg2">
              <span>{L('ชื่อคลิป', 'Video title')}</span>
              <span className={cn('text-fg3', it.title.length > TITLE_MAX && 'text-err')}>{`${it.title.length}/${TITLE_MAX}`}</span>
            </div>
            <div className="flex gap-1.5">
              <TextField ref={titleEl} aria-label={L('ชื่อคลิป', 'Video title')} placeholder={L('ชื่อคลิป', 'Video title')} disabled={!editable}
                value={it.title} onValue={(v) => edit({ op: 'title', title: v })} />
              {editable && it.titleEdited && <IconButton icon="refresh" title={L('สร้างชื่อจากพรีเซ็ตใหม่', 'Regenerate title from preset')} className="border border-line" onClick={() => edit({ op: 'resetTitle' })} />}
            </div>
          </div>
          {at !== null && (
            <div>
              <div className="mb-1 text-xs text-fg2">{L('เวลาปล่อย', 'Release time')}</div>
              <div className={cn('flex items-center gap-1.5', bad && '[&_input]:border-warn')}>
                <TextField type="datetime-local" aria-label={L('เวลาปล่อย', 'Release time')} disabled={!editable} value={toLocalInput(at)}
                  onValue={(v) => edit({ op: 'publishAt', at: new Date(v).getTime() || null })} />
                <span className={cn('inline-flex items-center gap-1 text-xs whitespace-nowrap text-fg3', bad && 'text-warn')} title={bad || ''}>
                  <Icon name={bad ? 'alert' : 'clock'} size={12} />
                  {bad ? L('อดีต/เร็วไป', 'Past/too soon') : it.publishEdited ? L('ตั้งเอง', 'Manual') : L('ตามคิว', 'Queue')}
                </span>
                {editable && it.publishEdited && <IconButton icon="refresh" title={L('ใช้เวลาตามคิว', 'Use queue time')} className="border border-line" onClick={() => edit({ op: 'publishAt', at: null })} />}
              </div>
            </div>
          )}
          {`${p.title} ${p.description} ${(p.tags || []).join(' ')}`.includes('{artists}') && (
            <div>
              <div className="mb-1 text-xs text-fg2">
                {L('ศิลปิน', 'Artists')}{' '}
                <span className="text-fg3">{it.artistsEdited ? L('· พิมพ์เอง (ลบให้ว่าง = อัตโนมัติ)', '· manual (clear = auto)') : L('· อัตโนมัติจาก .txt', '· auto from .txt')}</span>
              </div>
              <TextField aria-label={L('ศิลปิน', 'Artists')} placeholder={L('คั่นด้วย , (อัตโนมัติจาก .txt)', 'Comma-separated (auto from .txt)')} disabled={!editable}
                value={it.artists} onValue={(v) => edit({ op: 'artists', artists: v })} />
            </div>
          )}
        </div>
      )}

      {chips.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{chips}</div>}
      {pct !== null && <Progress value={pct} className="mt-2.5" />}
      {it.msg && (
        <div className="mt-2.5 flex gap-2 rounded-[12px] bg-white/5 px-2.5 py-2 text-xs text-fg2">
          <Icon name={MSG_ICON[it.status]} size={14} className="mt-px shrink-0" />
          <span>{it.msg}</span>
        </div>
      )}
    </div>
  );
}
```

(`usesArtists` from the view is the same test as the inline one above; the card uses the inline one because the preset may have just changed in the panel before the tab's view catches up.)

- [ ] **Step 4: `QueueTab.tsx` and the panel-wide drop target**

`extension/entrypoints/sidepanel/tabs/QueueTab.tsx` (replaces the 3a stub):
```tsx
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { L } from '@/lib/i18n';
import { dropHandles, expandHandles, hasFiles, pickFiles, pickFolder, sendFiles } from '@/lib/panel/intake';
import { Icon } from '../Icon';
import { usePanel } from '../panel';
import { QueueCard } from './QueueCard';
import { ScheduleBox } from './ScheduleBox';

// Files from a drop or a picker → stored → the Studio tab's queue (addFiles there).
export function useAddFiles() {
  const { send } = usePanel();
  return async (files: FileSystemFileHandle[]) => {
    try {
      await sendFiles(files, (ids) => send('queue:add', ids));
    } catch {
      toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'));
    }
  };
}

// The whole panel takes dropped files (the drawer's dragenter/dragover/drop, 3536–3567); the
// "Drop to add to the queue" frame hides itself once dragover stops.
export function usePanelDrop(onDropped: () => void) {
  const add = useAddFiles();
  const [dropping, setDropping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const accept = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDropping(false), 150);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    setDropping(false);
    const pending = dropHandles(e.dataTransfer); // inside the event, before any await
    onDropped();
    void pending.then(expandHandles).then(add);
  };
  return { dropping, handlers: { onDragEnter: accept, onDragOver: accept, onDrop } };
}

export function QueueTab() {
  const { data, view, liveState, send, write } = usePanel();
  const add = useAddFiles();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [schedOpen, setSchedOpen] = useState(true);
  const items = view?.items ?? [];
  const has = items.length > 0;
  // renderQueue(): the schedule box folds away when the first videos arrive and opens
  // again when the queue empties, giving the cards the room (short screens).
  const hadQueue = useRef(false);
  useEffect(() => {
    if (has && !hadQueue.current) setSchedOpen(false);
    if (!has) setSchedOpen(true);
    hadQueue.current = has;
  }, [has]);
  if (!data) return null;

  const count = (s: string) => items.filter((i) => i.status === s).length;
  const total = items.length;
  const done = count('done');
  const errors = count('error');
  const running = !!liveState?.running;
  const pct = total ? Math.round(((done + errors) / total) * 100) : 0;
  const anyOpen = items.some((i) => open.has(i.id));
  const setOne = (id: string, on: boolean) => setOpen((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => void pickFiles().then(add)}
        onKeyDown={(e) => { if (e.key === 'Enter') void pickFiles().then(add); }}
        className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-white/[0.22] px-3.5 py-3 hover:border-fg3 hover:bg-surface"
      >
        <div className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/10"><Icon name="upload" size={16} /></div>
        <div className="min-w-0">
          <b className="block text-[13px] font-medium">{L('ลากไฟล์หรือโฟลเดอร์มาวางตรงไหนของแผงก็ได้', 'Drop files or a folder anywhere on this panel')}</b>
          <span className="text-xs text-white/60">
            {L('หรือคลิกเพื่อเลือกไฟล์ · ', 'or click to select files · ')}
            <button type="button" className="cursor-pointer text-white underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); void pickFolder().then(add); }}>
              {L('เลือกทั้งโฟลเดอร์', 'pick a whole folder')}
            </button>
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <NativeSelect className="min-w-0 flex-1" title={L('พรีเซ็ตสำหรับคลิปที่เพิ่มใหม่', 'Preset for newly added videos')} value={data.activeId} onChange={(e) => void write.activeId(e.target.value)}>
          {data.presets.map((p, i) => <option key={p.id} value={p.id}>{`${i + 1}. ${p.label}`}</option>)}
        </NativeSelect>
        <Button size="sm" disabled={running} title={L('เปลี่ยนพรีเซ็ตของทุกคลิปที่ยังไม่ได้อัป', 'Change the preset of all videos not yet uploaded')}
          onClick={() => void send('queue:edit', { op: 'presetAll', presetId: data.activeId })}>
          <Icon name="layers" size={14} />{L('ใช้กับทุกคลิป', 'Apply to all')}
        </Button>
        {has && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(anyOpen ? new Set() : new Set(items.map((i) => i.id)))}>
            <Icon name={anyOpen ? 'up' : 'down'} size={14} />{anyOpen ? L('ย่อทั้งหมด', 'Collapse all') : L('ขยายทั้งหมด', 'Expand all')}
          </Button>
        )}
      </div>

      <ScheduleBox open={schedOpen} onOpen={setSchedOpen} />

      {has && (
        <div data-testid="stats" className="mt-3 flex flex-wrap items-baseline text-xs">
          {([[total, L('ทั้งหมด', 'Total'), ''], [count('pending'), L('รอคิว', 'Queued'), 'text-info'], [done, L('เสร็จแล้ว', 'Done'), 'text-ok'], [errors, L('ผิดพลาด', 'Errors'), 'text-err']] as const).map(([n, label, tone], i) => (
            <span key={label} className="flex items-baseline gap-1">
              {i > 0 && <span className="mx-2 text-white/40">·</span>}
              <b className={tone}>{n}</b><span className="text-white/70">{label}</span>
            </span>
          ))}
        </div>
      )}
      {has && (running || done > 0) && (
        <div className="mt-2 flex items-center gap-2">
          <Progress value={pct} className="flex-1" />
          <span className="text-xs text-fg3">{`${pct}%`}</span>
        </div>
      )}

      {has ? items.map((it, i) => (
        <QueueCard key={it.id} it={it} prev={items[i - 1]} next={items[i + 1]} open={open.has(it.id)} onOpen={(on) => setOne(it.id, on)} />
      )) : (
        <div className="mt-6 flex flex-col items-center gap-1.5 text-center text-fg3">
          <div className="grid size-11 place-items-center rounded-full bg-surface2"><Icon name="film" size={24} /></div>
          <b className="text-[13px] text-fg">{L('ยังไม่มีคลิปในคิว', 'No videos in the queue yet')}</b>
          <span className="text-xs">{L('ลากโฟลเดอร์คลิปทั้งชุดมาวางด้านบนได้เลย', 'Drag a whole folder of videos onto the area above')}</span>
        </div>
      )}
    </div>
  );
}
```

`ScheduleBox` arrives in Task 3; for this task create `extension/entrypoints/sidepanel/tabs/ScheduleBox.tsx` as:
```tsx
export function ScheduleBox(_: { open: boolean; onOpen(open: boolean): void }) {
  return null;
}
```

In `extension/entrypoints/sidepanel/App.tsx`: import `{ usePanelDrop }` from `./tabs/QueueTab`; in `App`, `const drop = usePanelDrop(() => setTab('queue'));`; spread `{...drop.handlers}` on the root `<div className="flex h-dvh flex-col">`, and add as its last child:
```tsx
      {drop.dropping && (
        <div className="pointer-events-none fixed inset-2 z-40 grid place-items-center rounded-[16px] border-2 border-dashed border-fg2 bg-[rgba(12,12,14,.6)] text-[15px] font-semibold text-fg">
          {L('วางเพื่อเพิ่มเข้าคิว', 'Drop to add to the queue')}
        </div>
      )}
```

- [ ] **Step 5: Run, check, commit**

Run: `npx vitest run tests/panel-queue.test.tsx` → PASS. `npm run check && npm run build` → pass.
```bash
git add extension/entrypoints/sidepanel extension/tests/panel-queue.test.tsx
git commit -m "Upload tab: drop zone, file and folder pickers, toolbar, stats, queue cards

Cards show what the Studio tab's runner computed and send every edit as
queue:edit; Remove is hidden on the item being processed; Retry asks first
when a draft was left in Studio.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: The schedule box

**Files:**
- Create: `extension/lib/panel/schedule-quick.ts`, `extension/tests/panel-schedule.test.ts`
- Modify: `extension/entrypoints/sidepanel/tabs/ScheduleBox.tsx` (replaces the Task 2 stub), `extension/tests/panel-queue.test.tsx` (schedule cases)

**Interfaces:**
- Consumes: `usePanel()` (`data.settings.schedule`, `view.schedule`, `write.settings`), `fmtWhen`, `toLocalInput`, `SCHEDULE_MIN_LEAD`, `Switch`, `TextField`.
- Produces: `lib/panel/schedule-quick.ts`: `tomorrow19(now?)`, `nextAt(hour, now?)`, `withinHour(now?)`, `everyOf(text)`; `ScheduleBox({ open, onOpen })`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/panel-schedule.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { everyOf, nextAt, tomorrow19, withinHour } from '../lib/panel/schedule-quick';

// 2026-10-09 17:50 local
const now = new Date(2026, 9, 9, 17, 50).getTime();

describe('schedule quick picks (the drawer\'s chips)', () => {
  it('tomorrow 19:00', () => expect(tomorrow19(now)).toBe('2026-10-10T19:00'));
  it('the next 18:00 skips today once it is less than 15 minutes away', () => {
    expect(nextAt(18, now)).toBe('2026-10-10T18:00');
    expect(nextAt(20, now)).toBe('2026-10-09T20:00');
  });
  it('within an hour, on a quarter', () => expect(withinHour(now)).toBe('2026-10-09T19:00'));
  it('every: at least 1', () => {
    expect(everyOf('3')).toBe(3);
    expect(everyOf('0')).toBe(1);
    expect(everyOf('')).toBe(1);
  });
});
```

Add to `extension/tests/panel-queue.test.tsx` (import `{ ScheduleBox }` from `'../entrypoints/sidepanel/tabs/ScheduleBox'` and `{ toPanelData }` from `'../lib/panel/data'`):
```tsx
describe('schedule box', () => {
  it('off: says so; switching on picks tomorrow 19:00 when no start is set', () => {
    const api = fakePanel();
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    expect(screen.getByText("Off · videos are published using the preset's visibility")).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule releases' }));
    const patch = vi.mocked(api.write.settings).mock.calls[0]![0];
    expect(patch.schedule).toMatchObject({ on: true });
    expect(patch.schedule!.start).toMatch(/T19:00$/);
  });

  it('on and set: the summary, and a start time that has passed', () => {
    const start = Date.now() + 2 * 86400e3;
    const api = fakePanel({
      data: toPanelData({ settings: { schedule: { on: true, start: '2026-01-01T08:00', every: 1, unit: 'day' } } }),
      view: viewWith([{}, {}], { schedule: { on: true, set: true, start, late: true, times: [start, start + 86400e3], skipped: 0, taken: [] } }),
    });
    renderPanel(<ScheduleBox open onOpen={() => {}} />, api);
    expect(screen.getByText(/ → .* · every 1 days$/)).toBeTruthy();
    expect(screen.getByText(/has passed — the queue will start/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use this time' }));
    expect(api.write.settings).toHaveBeenCalledWith({ schedule: { start: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/) } });
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 19:00' }));
    expect(vi.mocked(api.write.settings).mock.calls.at(-1)![0].schedule!.start).toMatch(/T19:00$/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/panel-schedule.test.ts tests/panel-queue.test.tsx`
Expected: FAIL — `schedule-quick` missing; the stub renders nothing.

- [ ] **Step 3: Implement**

`extension/lib/panel/schedule-quick.ts`:
```ts
import { SCHEDULE_MIN_LEAD } from '../constants';
import { toLocalInput } from './format';

// The schedule box's quick picks (3610–3628).
export function tomorrow19(now = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return toLocalInput(d.getTime());
}

// Today at that hour, or tomorrow when that is less than 15 minutes away.
export function nextAt(hour: number, now = Date.now()): string {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() < now + SCHEDULE_MIN_LEAD) d.setDate(d.getDate() + 1);
  return toLocalInput(d.getTime());
}

export const withinHour = (now = Date.now()) => toLocalInput(Math.ceil((now + 3600e3) / 900e3) * 900e3);
export const everyOf = (text: string) => Math.max(1, parseInt(text, 10) || 1);
```

`extension/entrypoints/sidepanel/tabs/ScheduleBox.tsx`:
```tsx
import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { L } from '@/lib/i18n';
import { fmtWhen, toLocalInput } from '@/lib/panel/format';
import { everyOf, nextAt, tomorrow19, withinHour } from '@/lib/panel/schedule-quick';
import type { Schedule } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Hint, TextField } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

// The drawer's schedule box (3603–3717): first release time, interval, quick picks, and a
// summary of what the queue will get. Release times themselves come from the Studio tab
// (QueueView.schedule), which also knows the channel's already-scheduled videos.
export function ScheduleBox({ open, onOpen }: { open: boolean; onOpen(open: boolean): void }) {
  const { data, view, write } = usePanel();
  if (!data) return null;
  const s = data.settings.schedule;
  const sv = view?.schedule;
  const set = (patch: Partial<Schedule>) => void write.settings({ schedule: patch });
  const unit = s.unit === 'hour' ? L('ชั่วโมง', 'hours') : L('วัน', 'days');

  let summary: string;
  if (!s.on) summary = L('ปิดอยู่ · คลิปจะเผยแพร่ตามการเปิดเผยของพรีเซ็ต', 'Off · videos are published using the preset\'s visibility');
  else if (!sv?.set) summary = L('เลือกเวลาปล่อยคลิปแรก', 'Pick the first video\'s release time');
  else {
    const t = sv.times;
    summary = t.length > 1
      ? L(`${fmtWhen(t[0]!)} → ${fmtWhen(t[t.length - 1]!)} · ทุก ${s.every} ${unit}`, `${fmtWhen(t[0]!)} → ${fmtWhen(t[t.length - 1]!)} · every ${s.every} ${unit}`)
      : L(`เริ่ม ${fmtWhen(sv.start)} · ทุก ${s.every} ${unit}`, `Starts ${fmtWhen(sv.start)} · every ${s.every} ${unit}`);
    const ext = sv.taken.length;
    if (ext) {
      const next = sv.taken[0]!;
      summary += L(` · ในช่องมีคลิปรอปล่อย ${ext} คลิป (ถัดไป ${fmtWhen(next)})`, ` · ${ext} already scheduled on the channel (next ${fmtWhen(next)})`)
        + (sv.skipped ? L(` — ข้ามให้ ${sv.skipped} ช่วง`, ` — skipped ${sv.skipped} slot(s)`) : '');
    }
  }
  const late = !!sv?.set && sv.late;
  const quick = (label: string, value: () => string) => (
    <button type="button" key={label} onClick={() => set({ start: value() })}
      className="cursor-pointer rounded-full border border-line2 px-2.5 py-1 text-xs text-fg2 hover:border-fg3 hover:text-fg">{label}</button>
  );
  const onHead = (e: MouseEvent) => {
    if (!s.on || (e.target as HTMLElement).closest('[role=switch]')) return;
    onOpen(!open);
  };

  return (
    <div className={cn('mt-3 rounded-[14px] border border-white/10 bg-white/[0.06]', late && 'border-warn/45')}>
      <div className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5" onClick={onHead}
        title={s.on ? (open ? L('คลิกเพื่อย่อ', 'Click to collapse') : L('คลิกเพื่อแก้เวลา', 'Click to edit times')) : ''}>
        <span className="grid w-[22px] place-items-center text-white/75"><Icon name="clock" size={16} /></span>
        <div className="min-w-0 flex-1">
          <b className="block text-[13px] font-medium">{L('ตั้งเวลาปล่อยคลิป', 'Schedule releases')}</b>
          <small className="block text-xs text-white/65" title={sv?.taken.map((at) => fmtWhen(at)).join('\n') || ''}>{summary}</small>
        </div>
        {s.on && <Icon name="chev" size={14} className={cn('text-fg3 transition-transform', open && 'rotate-180')} />}
        <Switch aria-label={L('ตั้งเวลาปล่อยคลิป', 'Schedule releases')} checked={!!s.on}
          onCheckedChange={(on) => set(on && !s.start ? { on, start: tomorrow19() } : { on })} />
      </div>
      {late && sv && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-[10px] bg-warn/[0.1] px-2.5 py-2 text-xs text-warn">
          <Icon name="alert" size={14} className="shrink-0" />
          <span className="flex-1">
            {L(`เวลาที่ตั้ง (${fmtWhen(new Date(s.start).getTime())}) ผ่านไปแล้ว — คิวจะเริ่ม ${fmtWhen(sv.start)} แทน`,
              `The set time (${fmtWhen(new Date(s.start).getTime())}) has passed — the queue will start ${fmtWhen(sv.start)} instead`)}
          </span>
          <Button size="sm" onClick={() => set({ start: toLocalInput(sv.start) })}>{L('ใช้เวลานี้', 'Use this time')}</Button>
        </div>
      )}
      {s.on && open && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-[1fr_72px_96px] gap-2">
            <div>
              <div className="mb-1 text-xs text-fg2">{L('คลิปแรกปล่อย', 'First video releases')}</div>
              <TextField type="datetime-local" aria-label={L('คลิปแรกปล่อย', 'First video releases')} value={s.start || ''} onValue={(v) => set({ start: v })} />
            </div>
            <div>
              <div className="mb-1 text-xs text-fg2">{L('ทุก ๆ', 'Every')}</div>
              <TextField type="number" min={1} max={999} aria-label={L('ทุก ๆ', 'Every')} value={String(s.every || 1)} onValue={(v) => set({ every: everyOf(v) })} />
            </div>
            <div>
              <div className="mb-1 text-xs text-fg2">{'\u00a0'}</div>
              <NativeSelect className="w-full" aria-label={unit} value={s.unit === 'hour' ? 'hour' : 'day'} onChange={(e) => set({ unit: e.target.value as Schedule['unit'] })}>
                <option value="day">{L('วัน', 'days')}</option>
                <option value="hour">{L('ชั่วโมง', 'hours')}</option>
              </NativeSelect>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {quick(L('พรุ่งนี้ 19:00', 'Tomorrow 19:00'), () => tomorrow19())}
            {quick(L('18:00 ถัดไป', 'Next 18:00'), () => nextAt(18))}
            {quick(L('20:00 ถัดไป', 'Next 20:00'), () => nextAt(20))}
            {quick(L('ภายใน 1 ชม.', 'Within 1 hr'), () => withinHour())}
          </div>
          <Hint className="mt-2.5">{L('คลิปจะอัปเป็นส่วนตัว แล้วเปลี่ยนเป็นสาธารณะเองตามเวลาที่ตั้ง · แก้เวลาของแต่ละคลิปได้ในการ์ด', 'Videos upload as private, then go public at the set time · edit each video\'s time in its card')}</Hint>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, check, commit**

Run: `npx vitest run tests/panel-schedule.test.ts tests/panel-queue.test.tsx` → PASS. `npm run check` → pass.
```bash
git add extension/lib/panel/schedule-quick.ts extension/entrypoints/sidepanel/tabs/ScheduleBox.tsx extension/tests/panel-schedule.test.ts extension/tests/panel-queue.test.tsx
git commit -m "Upload tab: the schedule box

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Start, Stop, Clear done — the footer and the start confirmation

**Files:**
- Create: `extension/lib/panel/start.ts`, `extension/entrypoints/sidepanel/tabs/QueueFooter.tsx`, `extension/tests/panel-start.test.ts`
- Modify: `extension/entrypoints/sidepanel/App.tsx` (`footers.queue`), `extension/tests/panel-queue.test.tsx` (footer cases), `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Consumes: `queue:preflight` → `StartSummary | { error }`, `queue:start(StartBinding)`, `queue:stop`, `queue:clearDone`; `RunnerTab`; `useAsk`; `fmtWhen`.
- Produces:
  - `lib/panel/start.ts`: `startFlow({ preflight, confirm, start, toast }): Promise<'error' | 'cancelled' | 'started'>`; `stopFlow({ bound, runner, stop, toast }): Promise<void>`.
  - `QueueFooter`, `StartSummaryBody({ s })`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/panel-start.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { startFlow, stopFlow } from '../lib/panel/start';
import type { StartSummary } from '../lib/studio/queue-runner';

const summary = (over: Partial<StartSummary> = {}): StartSummary => ({
  pendingN: 2, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: ['a', 'b'], times: [], vis: 'PRIVATE',
  noTxt: 0, noThumb: 0, badTime: [], prevUp: [], badTl: [], needsConfirm: true, ...over,
});

describe('startFlow (the drawer\'s Start button, confirmed in the panel)', () => {
  it('preflight error → toast, nothing starts', async () => {
    const d = { preflight: async () => ({ error: 'No videos waiting in the queue' }), confirm: vi.fn(), start: vi.fn(), toast: vi.fn() };
    expect(await startFlow(d)).toBe('error');
    expect(d.toast).toHaveBeenCalledWith('No videos waiting in the queue');
    expect(d.start).not.toHaveBeenCalled();
  });

  it('confirmed → starts with exactly the channel and items the user saw', async () => {
    const d = { preflight: async () => summary(), confirm: vi.fn(async () => true), start: vi.fn(async () => {}), toast: vi.fn() };
    expect(await startFlow(d)).toBe('started');
    expect(d.start).toHaveBeenCalledWith({ channelId: 'UC1', ids: ['a', 'b'] });
  });

  it('cancelled → nothing starts; no confirmation needed → starts directly', async () => {
    const no = { preflight: async () => summary(), confirm: vi.fn(async () => false), start: vi.fn(), toast: vi.fn() };
    expect(await startFlow(no)).toBe('cancelled');
    expect(no.start).not.toHaveBeenCalled();
    const quiet = { preflight: async () => summary({ needsConfirm: false }), confirm: vi.fn(), start: vi.fn(async () => {}), toast: vi.fn() };
    expect(await startFlow(quiet)).toBe('started');
    expect(quiet.confirm).not.toHaveBeenCalled();
  });
});

describe('stopFlow', () => {
  it('stops the tab that runs the queue and names it when it is another tab', async () => {
    const d = { bound: 1, runner: { tabId: 7, windowId: 1, title: 'Channel content - YouTube Studio' }, stop: vi.fn(async () => {}), toast: vi.fn() };
    await stopFlow(d);
    expect(d.stop).toHaveBeenCalledWith(7);
    expect(d.toast).toHaveBeenCalledWith('Will stop the queue in the tab "Channel content - YouTube Studio" after the current video finishes');
  });

  it('this tab runs it: the page says so itself', async () => {
    const d = { bound: 1, runner: { tabId: 1, windowId: 1, title: 'x' }, stop: vi.fn(async () => {}), toast: vi.fn() };
    await stopFlow(d);
    expect(d.stop).toHaveBeenCalledWith(1);
    expect(d.toast).not.toHaveBeenCalled();
  });
});
```

Add to `extension/tests/panel-queue.test.tsx` (import `{ QueueFooter }` from `'../entrypoints/sidepanel/tabs/QueueFooter'`):
```tsx
describe('upload footer', () => {
  it('Start shows the count, the schedule and the channel; Clear needs a finished video', () => {
    renderPanel(<QueueFooter />, fakePanel({ view: viewWith([{ status: 'pending' }, { status: 'pending' }], { schedule: { on: true, set: true, start: 1, late: false, times: [], skipped: 0, taken: [] } }) }));
    expect(screen.getByText('Upload 2 video(s) · scheduled')).toBeTruthy();
    expect(screen.getByText('To channel Mine')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Clear finished videos from the list' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Stop after the current video' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a channel that is not the locked one blocks Start', () => {
    const view = viewWith([{ status: 'pending' }], { channel: { ...state().channel, problem: 'Currently on channel "Mine" but locked to "Other"' } });
    renderPanel(<QueueFooter />, fakePanel({ view }));
    expect(screen.getByText('Channel does not match the locked one')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Channel does not match/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Start → summary → confirm → queue:start', async () => {
    const api = fakePanel({ view: viewWith([{ status: 'pending' }]) });
    vi.mocked(api.send).mockImplementation((async (type: string) =>
      type === 'queue:preflight'
        ? { pendingN: 1, channel: { id: 'UC1', name: 'Mine', avatar: '' }, ids: ['i0'], times: [], vis: 'PRIVATE', noTxt: 1, noThumb: 0, badTime: [], prevUp: [{ name: 'Clip 1.mp4', title: 'Old' }], badTl: [], needsConfirm: true }
        : undefined) as never);
    renderPanel(<QueueFooter />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Upload 1 video\(s\)/ })));
    expect(screen.getByText('1 already uploaded to this channel — they will be duplicated')).toBeTruthy();
    expect(screen.getByText('Clip 1.mp4: Old')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Upload 1 video(s)' }).at(-1)!));
    expect(api.send).toHaveBeenCalledWith('queue:start', { channelId: 'UC1', ids: ['i0'] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/panel-start.test.ts tests/panel-queue.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`extension/lib/panel/start.ts`:
```ts
import { L } from '../i18n';
import type { StartBinding, StartSummary } from '../studio/queue-runner';
import type { RunnerTab } from './target';

// The drawer's Start button: the run's pre-start ask() (2111–2143) now happens in the panel.
// The page answers queue:preflight with what the ask showed; once confirmed, queue:start
// carries the channel and items the user saw, and the page starts only if both still hold.
export async function startFlow(d: {
  preflight(): Promise<StartSummary | { error: string }>;
  confirm(s: StartSummary): Promise<boolean>;
  start(b: StartBinding): Promise<unknown>;
  toast(msg: string): void;
}): Promise<'error' | 'cancelled' | 'started'> {
  const s = await d.preflight();
  if ('error' in s) {
    d.toast(s.error);
    return 'error';
  }
  if (s.needsConfirm && !(await d.confirm(s))) return 'cancelled';
  await d.start({ channelId: s.channel.id, ids: s.ids });
  return 'started';
}

// Stop goes to the tab that holds the runner lock. When that is this panel's tab its page
// announces the stop itself (queue-ops stopQueue); when it is another tab, the panel names it.
export async function stopFlow(d: {
  bound: number | null;
  runner: RunnerTab | null;
  stop(tabId: number): Promise<unknown>;
  toast(msg: string): void;
}): Promise<void> {
  if (d.runner && d.runner.tabId !== d.bound) {
    await d.stop(d.runner.tabId);
    d.toast(L(`จะหยุดคิวในแท็บ "${d.runner.title}" หลังคลิปปัจจุบันเสร็จ`, `Will stop the queue in the tab "${d.runner.title}" after the current video finishes`));
    return;
  }
  if (d.bound !== null) await d.stop(d.bound);
}
```

`extension/entrypoints/sidepanel/tabs/QueueFooter.tsx`:
```tsx
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';
import { fmtWhen } from '@/lib/panel/format';
import { startFlow, stopFlow } from '@/lib/panel/start';
import type { StartSummary } from '@/lib/studio/queue-runner';
import { useAsk } from '../ask';
import { IconButton } from '../fields';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

// What the drawer's start ask() showed (runner 2111–2143): the destination channel, the
// count, the release, and the problems worth knowing before starting.
export function StartSummaryBody({ s }: { s: StartSummary }) {
  const t = s.times;
  const release = t.length
    ? (t.length > 1 ? `${fmtWhen(t[0]!)} → ${fmtWhen(t[t.length - 1]!)}` : fmtWhen(t[0]!))
    : L(`ทันทีตามพรีเซ็ต (${s.vis})`, `Per preset (${s.vis})`);
  const warn = (head: string, lines: string[]) => (
    <div className="mt-2 rounded-[10px] bg-warn/[0.1] px-2.5 py-2 text-warn">
      <b className="flex items-center gap-1"><Icon name="alert" size={13} />{head}</b>
      <ul className="mt-1 list-disc pl-5">
        {lines.slice(0, 5).map((x) => <li key={x}>{x}</li>)}
        {lines.length > 5 && <li>{L(`… และอีก ${lines.length - 5} คลิป`, `… and ${lines.length - 5} more`)}</li>}
      </ul>
    </div>
  );
  return (
    <div className="whitespace-normal">
      <div className="flex items-center gap-2.5 rounded-[12px] bg-surface p-2.5">
        {s.channel.avatar
          ? <img src={s.channel.avatar} alt="" className="size-9 rounded-full" />
          : <div className="grid size-9 place-items-center rounded-full bg-surface2"><Icon name="tv" size={18} /></div>}
        <div className="min-w-0">
          <small className="block text-xs text-fg3">{L('ไปที่ช่อง', 'To channel')}</small>
          <b className="block truncate text-fg">{s.channel.name}</b>
          <small className="block font-mono text-xs text-fg3">{s.channel.id || ''}</small>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <span>{L('คลิป', 'Videos')}</span><span className="text-fg">{String(s.pendingN)}</span>
        <span>{L('เผยแพร่', 'Release')}</span><span className="text-fg">{release}</span>
        {s.noTxt > 0 && <><span>{L('ไม่มี .txt', 'No .txt')}</span><span className="text-fg">{L(`${s.noTxt} คลิป`, `${s.noTxt} video(s)`)}</span></>}
        {s.noThumb > 0 && <><span>{L('ไม่มีภาพปก', 'No thumbnail')}</span><span className="text-fg">{L(`${s.noThumb} คลิป`, `${s.noThumb} video(s)`)}</span></>}
      </div>
      {s.badTime.length > 0 && warn(
        L(`เวลาปล่อยผ่านไปแล้ว/เร็วไป ${s.badTime.length} คลิป`, `${s.badTime.length} release time(s) in the past / too soon`),
        s.badTime.map((x) => `${x.name}: ${fmtWhen(x.at)}`))}
      {s.prevUp.length > 0 && warn(
        L(`เคยอัปขึ้นช่องนี้แล้ว ${s.prevUp.length} คลิป — จะได้คลิปซ้ำ`, `${s.prevUp.length} already uploaded to this channel — they will be duplicated`),
        s.prevUp.map((x) => `${x.name}: ${x.title}`))}
      {s.badTl.length > 0 && warn(
        L(`tracklist มีปัญหา ${s.badTl.length} คลิป — YouTube จะไม่สร้าง Chapters`, `${s.badTl.length} tracklist problem(s) — YouTube won't create chapters`),
        s.badTl.map((x) => `${x.name}: ${x.error}`))}
      {(s.badTl.length > 0 || s.badTime.length > 0 || s.prevUp.length > 0) && (
        <div className="mt-2 text-fg3">{L('กดยกเลิกเพื่อกลับไปแก้ — ดูรายละเอียดได้ที่ป้ายสีแดงในการ์ด', 'Cancel to go back and fix — details are on the red badges in each card')}</div>
      )}
    </div>
  );
}

// The Upload tab's footer (3731–3744) and its labels (updateRunUI 4044–4077).
export function QueueFooter() {
  const { view, state, liveState, runner, elsewhere, link, target, send, sendTo } = usePanel();
  const ask = useAsk();
  const items = view?.items ?? [];
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const pending = count('pending');
  const done = count('done');
  const errors = count('error');
  const total = items.length;
  const running = !!state?.running;
  const blocked = !!view?.channel.problem;
  const sched = view?.schedule.set ? L(' · ตั้งเวลา', ' · scheduled') : '';
  const ch = view?.channel.label ?? '—';
  const title = running
    ? L(`กำลังอัปโหลด ${done + errors + 1}/${total}`, `Uploading ${done + errors + 1}/${total}`)
    : blocked ? L('ช่องไม่ตรงกับที่ล็อกไว้', 'Channel does not match the locked one')
    : pending ? L(`เริ่มอัปโหลด ${pending} คลิป${sched}`, `Upload ${pending} video(s)${sched}`)
    : L('เริ่มอัปโหลด', 'Start upload');
  const sub = blocked ? L('ปลดล็อกหรือสลับกลับไปช่องที่ล็อกไว้', 'Unlock, or switch back to the locked channel') : L(`ไปที่ช่อง ${ch}`, `To channel ${ch}`);

  const start = () => void startFlow({
    preflight: () => send('queue:preflight', undefined),
    confirm: async (s) => !!(await ask({
      title: L(`อัปโหลด ${s.pendingN} คลิป`, `Upload ${s.pendingN} video(s)`),
      icon: 'upload',
      ok: L(`เริ่มอัปโหลด ${s.pendingN} คลิป`, `Upload ${s.pendingN} video(s)`),
      body: <StartSummaryBody s={s} />,
    })),
    start: (b) => send('queue:start', b),
    toast: (m) => void toast(m),
  });
  const stop = () => void stopFlow({
    bound: target?.tabId ?? null,
    runner,
    stop: (tabId) => sendTo(tabId)('queue:stop', undefined),
    toast: (m) => void toast(m),
  });

  return (
    <div className="flex gap-2 border-t border-line px-[18px] py-3.5">
      <Button variant="go" size="lg" className="flex-1 flex-col items-start gap-0 text-left"
        disabled={running || !pending || blocked || elsewhere || link !== 'ok'} onClick={start}>
        <b className="text-[13.5px] font-semibold">{title}</b>
        <small className="text-xs font-normal text-[#55555c]">{sub}</small>
      </Button>
      <IconButton icon="stop" title={L('หยุดหลังคลิปปัจจุบันเสร็จ', 'Stop after the current video')}
        className="h-auto w-12 self-stretch rounded-[14px] border border-white/[0.16] bg-white/[0.06] text-white hover:text-err disabled:opacity-35"
        disabled={!liveState?.running} onClick={stop} />
      <IconButton icon="clear" title={L('ล้างคลิปที่อัปเสร็จออกจากรายการ', 'Clear finished videos from the list')}
        className="h-auto w-12 self-stretch rounded-[14px] border border-white/[0.16] bg-white/[0.06] text-white disabled:opacity-35"
        disabled={!done} onClick={() => void send('queue:clearDone', undefined)} />
    </div>
  );
}
```

In `App.tsx`: import `{ QueueFooter }` from `./tabs/QueueFooter`; `footers` gains `queue: () => <QueueFooter />`.

Add to the Phase 3b block of `scripts/strings/extension-only.mjs`:
```js
  { th: 'จะหยุดคิวในแท็บ "${}" หลังคลิปปัจจุบันเสร็จ', en: 'Will stop the queue in the tab "${}" after the current video finishes', why: 'Stop is sent to the tab that runs the queue, which may not be this panel\'s tab' },
```

- [ ] **Step 4: Run, check, commit**

Run: `npx vitest run tests/panel-start.test.ts tests/panel-queue.test.tsx` → PASS. `npm run check && npm run build` → pass.
```bash
git add extension/lib/panel/start.ts extension/entrypoints/sidepanel extension/scripts/strings/extension-only.mjs extension/tests/panel-start.test.ts extension/tests/panel-queue.test.tsx
git commit -m "Upload footer: Start with the run summary confirmed in the panel, Stop sent to the running tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Alt+P, the in-page FAB, and "Reload this tab" in the page

**Files:**
- Create: `extension/lib/studio/fab.ts`, `extension/lib/studio/reload-banner.ts`, `extension/tests/fab.test.ts`, `extension/tests/reload-banner.test.ts`
- Modify: `extension/entrypoints/studio.content.ts`, `extension/wxt.config.ts`, `extension/scripts/strings/extension-only.mjs`

**Interfaces:**
- Consumes: `h`, `icon` (`dom.ts`); `load`, `save`, `active`, `settings` (`state.ts`); `queue`, `running`, `uploadProg` (`queue-runner.ts`); `channelView` (`queue-view.ts`); `activityFrom`, `Activity`; `ui.openDrawer()` (→ `openPanel` → background `sidePanel.open`).
- Produces:
  - `lib/studio/fab.ts`: `interface FabModel { channel: string; problem: string; locked: boolean; preset: string; activity: Activity | null; pending: number; total: number }`; `fabModel(): FabModel`; `mountFab(open: () => void): { update(m: FabModel): void; remove(): void }`.
  - `lib/studio/reload-banner.ts`: `showReloadBanner(reload?: () => void): HTMLElement`.
  - Manifest: `commands._execute_action` with suggested key Alt+P.

- [ ] **Step 1: Write the failing tests**

`extension/tests/fab.test.ts`:
```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountFab, type FabModel } from '../lib/studio/fab';
import { load } from '../lib/studio/state';

const model = (over: Partial<FabModel> = {}): FabModel => ({
  channel: 'Mine', problem: '', locked: false, preset: '🌑 TrapSoul Mix', activity: null, pending: 2, total: 3, ...over,
});
const shadow = () => document.querySelector('#ytup-fab')!.shadowRoot!;
let fab: ReturnType<typeof mountFab> | undefined;
afterEach(() => { fab?.remove(); fab = undefined; });

describe('in-page FAB', () => {
  it('shows the channel, the default preset and the waiting count; a click opens the panel', () => {
    const open = vi.fn();
    fab = mountFab(open);
    fab.update(model());
    const b = shadow().querySelector('button')!;
    expect(shadow().querySelector('.fch')!.textContent).toBe('Mine');
    expect(shadow().querySelector('.fpr')!.textContent).toBe('🌑 TrapSoul Mix');
    expect(shadow().querySelector('.badge')!.textContent).toBe('2');
    expect(b.title).toBe('Current channel: Mine');
    expect(b.getAttribute('aria-label')).toBe('Click to open · drag to move');
    b.click();
    expect(open).toHaveBeenCalledOnce();
  });

  it('a running upload shows its progress; a channel problem turns it red', () => {
    fab = mountFab(() => {});
    fab.update(model({ activity: { task: 'upload', icon: '⬆', tab: 'queue', count: { at: 1, of: 2 }, title: '', detail: '', progress: 0.25 } }));
    const b = shadow().querySelector('button')!;
    expect(shadow().querySelector('.badge')!.textContent).toBe('⬆ 25%');
    expect(b.classList.contains('busy')).toBe(true);
    fab.update(model({ problem: 'Currently on channel "Mine" but locked to "Other"' }));
    expect(b.classList.contains('bad')).toBe(true);
    expect(b.title).toBe('Currently on channel "Mine" but locked to "Other"');
  });

  it('dragging moves it, remembers where, and is not a click', () => {
    const open = vi.fn();
    fab = mountFab(open);
    const b = shadow().querySelector('button')!;
    b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 500, clientY: 500, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 450 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
    b.click();
    expect(open).not.toHaveBeenCalled();
    expect(load<{ r: number; b: number } | null>('fabPos', null)).not.toBe(null);
  });

  it('replaces a FAB left by an earlier instance of the script', () => {
    fab = mountFab(() => {});
    const again = mountFab(() => {});
    expect(document.querySelectorAll('#ytup-fab')).toHaveLength(1);
    again.remove();
  });
});
```

`extension/tests/reload-banner.test.ts`:
```ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { showReloadBanner } from '../lib/studio/reload-banner';

describe('reload banner', () => {
  it('says why and reloads on click; only one at a time', () => {
    const reload = vi.fn();
    showReloadBanner(reload);
    const host = showReloadBanner(reload);
    expect(document.querySelectorAll('#ytup-reload')).toHaveLength(1);
    const root = host.shadowRoot!;
    expect(root.textContent).toContain('The extension was updated or reloaded — reload this tab to keep using it');
    root.querySelector('button')!.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/fab.test.ts tests/reload-banner.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`extension/lib/studio/fab.ts`:
```ts
import { activityFrom, type Activity } from '../activity';
import { L } from '../i18n';
import { h, icon } from './dom';
import { queue, running, uploadProg } from './queue-runner';
import { channelView } from './queue-view';
import { active, load, save, settings } from './state';

// The userscript's floating button (UI section 3288–3300, drag 3453–3486, badge 4119–4135)
// as a Shadow DOM island: the channel and the default preset, what is running, drag to move
// (kept in 'fabPos'), click to open the side panel. Design B glass, as the drawer's FAB.
const CSS = `
.fab{position:fixed;right:18px;bottom:18px;touch-action:none;z-index:100001;display:flex;align-items:center;gap:10px;
  background:rgba(12,12,14,.82);-webkit-backdrop-filter:blur(26px) saturate(150%);backdrop-filter:blur(26px) saturate(150%);
  color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:8px 14px 8px 8px;cursor:pointer;text-align:left;
  box-shadow:0 12px 32px -10px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .15s,box-shadow .15s;
  font:13px/1.25 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif;font-feature-settings:"tnum" 1}
.fab:hover{transform:translateY(-2px)}
.fab.moving{cursor:grabbing;transition:none;transform:none}
.fab.bad{border-color:#f87171;box-shadow:0 0 0 3px rgba(244,63,94,.35),0 10px 30px -6px rgba(0,0,0,.45)}
.fab.busy{background-image:linear-gradient(90deg,#f4f4f5 calc(var(--p,0) * 1%),#2a2a33 0);background-repeat:no-repeat;
  background-size:calc(100% - 16px) 3px;background-position:8px calc(100% - 5px)}
.logo{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#f4f4f5;color:#0b0b0c;flex:0 0 auto}
.fcol{display:flex;flex-direction:column;min-width:0;max-width:220px}
.fch{font-size:12px;color:#a3a3b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fab.bad .fch{color:#fda4af}
.fch .ic{display:inline-block;vertical-align:-1px}
.fpr{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{display:inline-flex;align-items:center;gap:3px;background:#f4f4f5;color:#0b0b0c;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}
.badge[hidden]{display:none}
.ic{flex:0 0 auto;display:block}`;

export interface FabModel {
  channel: string;
  problem: string;
  locked: boolean;
  preset: string;
  activity: Activity | null;
  pending: number;
  total: number;
}

// What the FAB shows, from the page's live state (the 800 ms tick calls this).
export function fabModel(): FabModel {
  const c = channelView();
  const count = (s: string) => queue.filter((i) => i.status === s).length;
  const activity = activityFrom(
    { running, inFlight: queue.some((i) => i.status === 'uploading' || i.status === 'review'), total: queue.length, done: count('done'), errors: count('error') },
    null,
    uploadProg,
  );
  return { channel: c.label, problem: c.problem, locked: !!settings.lockChannel, preset: active()?.label ?? '', activity, pending: count('pending'), total: queue.length };
}

export function mountFab(open: () => void): { update(m: FabModel): void; remove(): void } {
  document.querySelector('#ytup-fab')?.remove(); // left by an earlier instance (extension reloaded)
  const host = h('div', { id: 'ytup-fab' });
  const chan = h('span', { className: 'fch' });
  const label = h('span', { className: 'fpr' });
  const badge = h('span', { className: 'badge', hidden: true });
  let dragged = false;
  const fab = h('button', {
    className: 'fab',
    'aria-label': L('คลิกเพื่อเปิดแผง · ลากเพื่อย้ายตำแหน่ง', 'Click to open · drag to move'),
    onclick: () => { if (!dragged) open(); },
  }, h('span', { className: 'logo' }, icon('cloud', 18)), h('span', { className: 'fcol' }, chan, label), badge);

  // Kept as distances from the right / bottom edge, so it stays in its corner when the window resizes.
  const place = (pos: { r: number; b: number } | null) => {
    if (!pos) { fab.style.right = fab.style.bottom = ''; return; }
    const w = fab.offsetWidth || 180, hgt = fab.offsetHeight || 52;
    fab.style.right = Math.min(Math.max(4, pos.r), Math.max(4, innerWidth - w - 4)) + 'px';
    fab.style.bottom = Math.min(Math.max(4, pos.b), Math.max(4, innerHeight - hgt - 4)) + 'px';
  };
  fab.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    const r0 = fab.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    dragged = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      fab.classList.add('moving');
      place({ r: innerWidth - r0.right - dx, b: innerHeight - r0.bottom - dy });
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      fab.classList.remove('moving');
      if (!moved) return;
      dragged = true; // the release after a drag is not a click
      setTimeout(() => { dragged = false; }, 0);
      save('fabPos', { r: parseFloat(fab.style.right), b: parseFloat(fab.style.bottom) });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  fab.addEventListener('dblclick', (e) => e.preventDefault());
  const onResize = () => place(load('fabPos', null));
  addEventListener('resize', onResize);
  host.attachShadow({ mode: 'open' }).append(h('style', {}, CSS), fab);
  document.documentElement.append(host);
  setTimeout(onResize, 0);

  let last = '';
  return {
    update(m) {
      const sig = JSON.stringify(m);
      if (sig === last) return;
      last = sig;
      chan.replaceChildren(...(m.problem ? [icon('alert', 11), ' '] : m.locked ? [icon('lock', 11), ' '] : []), m.channel);
      label.textContent = m.preset;
      fab.classList.toggle('bad', !!m.problem);
      fab.title = m.problem || L(`ช่องปัจจุบัน: ${m.channel}`, `Current channel: ${m.channel}`);
      // Busy: icon + percentage and a progress line along the bottom; idle: the count waiting.
      const a = m.activity;
      const pct = a && a.progress !== null ? Math.round(a.progress * 100) : null;
      fab.classList.toggle('busy', !!a && pct !== null);
      fab.style.setProperty('--p', String(pct ?? 0));
      badge.hidden = !a && !m.total;
      if (a) badge.replaceChildren(a.icon, ...(pct === null ? [] : [` ${pct}%`]));
      else badge.textContent = String(m.pending || m.total);
    },
    remove() {
      removeEventListener('resize', onResize);
      host.remove();
    },
  };
}
```

`extension/lib/studio/reload-banner.ts`:
```ts
import { L } from '../i18n';
import { h, icon } from './dom';

// After the extension is updated or reloaded, the content script in an open Studio tab is
// orphaned (spec: Error handling): say so at the top of the page, with the one fix.
const CSS = `
.bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100003;display:flex;align-items:center;gap:10px;
  background:#0f0f12;color:#f4f4f5;border:1px solid rgba(251,191,36,.45);border-radius:14px;padding:9px 10px 9px 14px;
  box-shadow:0 16px 40px -10px rgba(0,0,0,.6);font:13px/1.4 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif}
.bar .ic{color:#fbbf24;flex:0 0 auto}
button{font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:10px;padding:6px 12px;background:#f4f4f5;color:#0b0b0c}`;

export function showReloadBanner(reload: () => void = () => location.reload()): HTMLElement {
  document.querySelector('#ytup-reload')?.remove();
  const host = h('div', { id: 'ytup-reload' });
  host.attachShadow({ mode: 'open' }).append(
    h('style', {}, CSS),
    h('div', { className: 'bar', role: 'alert' },
      icon('sync', 16),
      h('span', {}, L('ส่วนขยายถูกอัปเดตหรือโหลดใหม่ — โหลดแท็บนี้ใหม่เพื่อใช้งานต่อ', 'The extension was updated or reloaded — reload this tab to keep using it')),
      h('button', { onclick: reload }, L('โหลดแท็บนี้ใหม่', 'Reload this tab'))),
  );
  document.documentElement.append(host);
  return host;
}
```

In `extension/entrypoints/studio.content.ts`:
- Delete the spike `mountFab()` function, its comment, and the lines `const fab = mountFab();` / `stop.add(() => fab.remove());`.
- Import `{ fabModel, mountFab }` from `@/lib/studio/fab` and `{ showReloadBanner }` from `@/lib/studio/reload-banner`.
- Right after `const stop = stopOnInvalidated(ctx);` add:
```ts
    // Orphaned by an extension update / reload: tell the user to reload the tab.
    stop.add(() => void showReloadBanner());
```
- After `stop.add(() => ui.dispose());` add:
```ts
    // The userscript's FAB: opens the side panel (needs the click's user gesture — see README).
    const fab = mountFab(() => ui.openDrawer());
    stop.add(() => fab.remove());
```
- In the 800 ms tick's `try`, after `ui.tick();` add `fab.update(fabModel());`.

In `extension/wxt.config.ts`, add to `manifest` (after `action`):
```ts
    // Alt+P opens the side panel from anywhere in Chrome (the userscript's Alt+P; it can't close it).
    commands: { _execute_action: { suggested_key: { default: 'Alt+P' } } },
```

Add to the Phase 3b block of `scripts/strings/extension-only.mjs`:
```js
  { th: 'ส่วนขยายถูกอัปเดตหรือโหลดใหม่ — โหลดแท็บนี้ใหม่เพื่อใช้งานต่อ', en: 'The extension was updated or reloaded — reload this tab to keep using it', why: 'orphaned content script (spec: Error handling)' },
```

- [ ] **Step 4: Run, check, build, commit**

Run: `npx vitest run tests/fab.test.ts tests/reload-banner.test.ts` → PASS (if happy-dom lacks `PointerEvent`, create the events with `new MouseEvent(type, init)`; the handlers only read `button`, `clientX`, `clientY`).
Run: `npm run check && npm run build`, then `grep -c '"_execute_action"' .output/chrome-mv3/manifest.json` → `1`, and `grep -c '"permissions"' .output/chrome-mv3/manifest.json` → `1` with the permission list unchanged.
```bash
git add extension/lib/studio/fab.ts extension/lib/studio/reload-banner.ts extension/entrypoints/studio.content.ts extension/wxt.config.ts extension/scripts/strings/extension-only.mjs extension/tests/fab.test.ts extension/tests/reload-banner.test.ts
git commit -m "In-page FAB (channel, preset, activity, drag) opens the panel; reload banner; Alt+P command

Replaces the Phase 0 spike button.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Coverage on, Thai rendering check, README checklist, spec amendments, Phase 3 verification

**Files:**
- Create: `extension/tests/panel-i18n.test.tsx`
- Modify: `extension/package.json` (`check` uses `--coverage`), `extension/README.md`, `docs/superpowers/specs/2026-10-05-chrome-extension-design.md`

- [ ] **Step 1: Every drawer string is in the panel or dropped with a reason**

In `extension/package.json`, `check` becomes:
```json
"check": "tsc --noEmit && vitest run && node scripts/port-check.mjs && node scripts/ui-check.mjs --coverage",
```
Run: `node scripts/ui-check.mjs --coverage`
Expected: `ui-check: ok`. A `drawer pair not in the panel` line means the panel is missing something the drawer showed: add it where the drawer had it. Add to `scripts/strings/dropped.mjs` only for a pair the panel cannot show for a reason this plan names (D-numbers), and report each such addition.

- [ ] **Step 2: In Thai, no English is left (the leak test)**

`extension/tests/panel-i18n.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AskProvider } from '../entrypoints/sidepanel/ask';
import { PanelContext } from '../entrypoints/sidepanel/panel';
import { ChannelBar } from '../entrypoints/sidepanel/shell/ChannelBar';
import { PresetsFooter, PresetsTab } from '../entrypoints/sidepanel/tabs/PresetsTab';
import { QueueFooter } from '../entrypoints/sidepanel/tabs/QueueFooter';
import { QueueTab } from '../entrypoints/sidepanel/tabs/QueueTab';
import { SettingsTab } from '../entrypoints/sidepanel/tabs/SettingsTab';
import { setLang } from '../lib/i18n';
import { toPanelData } from '../lib/panel/data';
// @ts-expect-error -- untyped build script, shared with npm run ui-check
import { userscriptPairs } from '../scripts/ui-check.mjs';
import { fakePanel, viewWith } from './panel-fake';

afterEach(() => {
  cleanup();
  setLang('en');
});

// English text of the userscript's pairs (those that differ from the Thai and have no ${}).
const english = new Set<string>(
  (userscriptPairs() as { th: string; en: string }[]).filter((p) => p.th !== p.en && !p.en.includes('${}')).map((p) => p.en.trim()).filter(Boolean),
);

function leaks(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (english.has(n.textContent!.trim())) out.push(n.textContent!.trim());
  for (const el of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
    for (const a of ['title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute(a)?.trim();
      if (v && english.has(v)) out.push(`${a}="${v}"`);
    }
  }
  return out;
}

describe('the panel in Thai', () => {
  it('shows no English string from the userscript', () => {
    setLang('th');
    const api = fakePanel({
      data: toPanelData({ settings: { lang: 'th', schedule: { on: true, start: '2030-01-01T08:00', every: 1, unit: 'day' } } }),
      view: viewWith([
        { status: 'pending', txt: '0:00 A - B\n3:00 C - D\n6:00 E - F', txtName: 'a.txt', tracklist: { errors: [], warnings: [], count: 3 }, at: 1_900_000_000_000 },
        { status: 'error', draftId: 'abcdefghijk', msg: 'x' },
        { status: 'uploading' }, { status: 'done' },
      ], { schedule: { on: true, set: true, start: 1_900_000_000_000, late: false, times: [1_900_000_000_000], skipped: 0, taken: [] } }),
    });
    const { container } = render(
      <PanelContext.Provider value={api}>
        <AskProvider>
          <ChannelBar /><QueueTab /><QueueFooter /><PresetsTab /><PresetsFooter /><SettingsTab />
        </AskProvider>
      </PanelContext.Provider>,
    );
    expect(leaks(container)).toEqual([]);
  });
});
```
Run: `npx vitest run tests/panel-i18n.test.tsx` → PASS. A failure lists each English string rendered in Thai mode: wrap it in the userscript's `L()` pair.

- [ ] **Step 3: README — the Phase 3 exit checklist**

In `extension/README.md`:
- Replace the `## Moving from the userscript` section's last sentence `(the Settings tab arrives in Phase 3)` with `(Settings → Back up / share settings → Import)`.
- Replace the whole `## Phase 2 exit check (manual, in Chrome)` section (its intro and items 1–20) with the section below. It carries every Phase 2 item (2b checklist, 2a bridge and invite/switch checks, the Phase 0 spike checks still open) over to the real panel, and adds the panel's own.

```md
## Phase 3 exit check (manual, in Chrome)

Needs the logged-in Chrome profile. Run `npm run build`, reload the unpacked extension
(`.output/chrome-mv3`), and **disable the userscript in Tampermonkey**. Use a test channel.
In Studio's DevTools, filter the console by `[ytup]` (the ported code also logs `[YT Presets]`
and `[YT Upload Presets]`). Write down pass or fail for each item; any failure blocks Phase 4.
Settings are changed in the panel's Settings tab (no DevTools snippets any more).

### The panel

1. **Where it opens.** The toolbar icon opens the panel on a Studio tab; on example.com the
   panel is not available. `chrome://extensions/shortcuts` lists **Alt+P** for the extension
   (assign it if Chrome left it empty); Alt+P opens the panel on a Studio tab. In Studio itself,
   Alt+P also opens it.
2. **Look.** Black glass, Thai and English text in IBM Plex Sans Thai, nothing smaller than
   12px, icons on tabs and section headings. Tabs: Upload · Presets · Copyright · Settings; the
   Copyright tab says scanning arrives in a later version.
3. **Language.** Settings → General → Language / ภาษา → ไทย: the whole panel switches at once,
   without a reload. The next toast from Studio is Thai too. Switch back to English.
4. **Channel bar.** Shows the Studio tab's channel (avatar, name, `UC…` id, green dot).
   **Lock channel** → toast "Locked to channel …". Switch Studio to another channel: the bar
   turns red with "Currently on channel … but locked to …", the dot is red, Start reads
   "Channel does not match the locked one". **Locked** → "Channel unlocked".
5. **Channel list** (the ⇄ button). The current channel says "· this tab"; **New tab** opens
   the same Studio page on it. Another channel's **Switch** goes through the channel switcher
   (console `switch: looking for @…`, `switch: switching to @…`) and lands in Studio on that
   channel — for an owned channel and for a channel you only manage (extra `switch: confirming
   the manager-channel notice`). During a run, Switch toasts "Upload queue is still running —
   switching channels now would stop it". Add a channel by `UC…` id or link; `@handle` toasts
   "No channel ID found…"; ✕ removes one.
6. **Reload this tab.** With a Studio tab open, reload the extension in `chrome://extensions`.
   The page shows "The extension was updated or reloaded — reload this tab to keep using it";
   the panel on that tab shows "This tab is not connected to the extension yet — reload this
   tab". Either button reloads the tab, and the panel works again.
7. **FAB.** Bottom right in Studio: the channel and the default preset; the badge shows how
   many videos wait. Drag it elsewhere and reload: it stays there. Click it with the panel
   closed: **record whether the side panel opens** (if not, copy the console error; the FAB is
   then removed, plan 3b D16). During a run the badge shows ⬆ and the percentage, with a line
   along the bottom; with a channel-lock problem it turns red.

### Uploading (Phase 2's checks, now from the panel)

8. **Real upload, end to end.** Drag `Clip 1.mp4`, `Clip 1.txt` (3-line tracklist from
   `0:00`), `Clip 1.jpg` (under 2 MB) and `Clip 2.mp4` onto the panel: the frame "Drop to add
   to the queue" appears; two cards appear with titles; Clip 1 shows "Clip 1.txt · 3 lines",
   "3 chapters" and the thumbnail (preview and "Thumbnail · … MB"). **Start**: the summary
   dialog shows the channel, "Videos 2", "Release Per preset (PRIVATE)", "No .txt 1 video(s)";
   confirm. Expected: Studio opens the upload dialog itself; the console shows `[ytup] file
   bridge #1 mounted` and `#1 loaded and connected`; title, description and tags fill in; Clip 1
   gets its thumbnail; Monetisation, Ad suitability and Visibility follow the settings; Save is
   clicked; the card turns Done; Clip 2 runs. The activity bar shows "Uploading 1/2" with a
   percentage and the running card a progress bar; the tab title shows `(1/2) ⬆`, then `✅` if
   the tab isn't focused. A desktop notification "Upload finished ✅" appears when the panel is
   closed or the tab unfocused; clicking it focuses the tab. Both videos are in Content.
9. **Picking.** Click the drop zone: a multi-file picker; picked files are added. "pick a whole
   folder": a folder with a `Covers/` subfolder adds the videos with their `.txt` and images
   paired by name; hidden files (`.DS_Store`) are skipped.
10. **Card edits.** Expand a card: edit the title (the counter follows; ↻ regenerates it);
    change its preset (the title follows); type artists, then clear them (back to "auto from
    .txt"); with scheduling on, set its release time ("Manual"; ↻ goes back to "Queue"); move
    cards up and down (EP numbers / times follow); **Apply to all**; **Expand all / Collapse
    all**. Drop a `.txt` on a card: it attaches. **Attach .txt / thumbnail** opens a picker.
    ✕ on the `.txt` and thumbnail chips removes them. A tracklist starting at `0:05` shows
    "Tracklist: 1 problem(s)" and **Fix tracklist**, which toasts "Tracklist fixed: …".
11. **Scheduling.** Switch "Schedule releases" on: the first release is tomorrow 19:00; try the
    quick picks; set every 1 day. Cards show their release times; the summary reads
    "… → … · every 1 days". Start 2 clips: they are scheduled one day apart, and afterwards the
    box's first release has moved to the slot after the last one. Set a time in the past: an
    amber note says when the queue will start instead; **Use this time** stores it.
12. **Reload survival.** Queue 2 clips and reload the Studio tab before Start: the queue is still
    there, Start works (the files come through the bridge again).
13. **Interrupted run.** Start 2 clips and reload Studio while the first uploads: that card comes
    back as an error, "The page reloaded during the upload — …". **Retry** with a draft id asks
    "This video is already in Studio"; **Open draft** opens it in Studio; "Deleted it, upload
    again" puts it back in the queue.
14. **Browser restart, then re-grant.** Queue 2 clips, quit Chrome fully, reopen Studio and the
    panel: the banner "Files in the queue need read access again after a browser restart" with
    **Re-grant access (N files)**. Click it: **record whether one click granted all files** (if
    the banner stays with fewer files, click again). Start: they upload.
15. **One runner, and Stop from anywhere.** Open Studio in tabs A and B. Start in A. On B, the
    panel shows "Another Studio tab is running the queue — change the queue there" with **Go to
    that tab**; Start is disabled; adding, removing, retrying or clearing from B toasts the same
    refusal. **Stop** in B's panel toasts "Will stop the queue in the tab "…" after the current
    video finishes" and A stops after its current video.
16. **Intercept.** In Studio's own upload dialog pick 2 videos: the dialog closes, both appear in
    the queue, Start uploads them. Reloading while they wait asks "Leave site?".
17. **Manual fill.** Upload one file through Studio's own dialog: the details fill in from the
    default preset, with the toast "Details filled in: …". Presets → **Apply to open window**
    fills an open dialog too.
18. **Quick actions.** On the details page and on `/video/<id>/edit`: bars under the title and
    the description (Elements: `div.ytp-qa` → `#shadow-root`); dark mode switches their colours;
    Preset title, Copy, Preset description, Load .txt, Fix chapters, Check chapters, Preset tags,
    Apply all work; Undo reverts. After switching the panel to Thai, the bars are Thai the next
    time the dialog opens.
19. **Dialog info.** With the details page open, Settings → Troubleshooting → **Copy upload
    dialog info**, then paste: JSON whose `version` is the manifest version.
20. **Button state in the isolated world.** During items 8, 16 and 17, Save/Next are clicked
    only once Studio enables them: no "Could not click Save (button still disabled…)" while the
    button is plainly enabled, and no click that does nothing.
21. **Notification click and the side panel.** With the panel closed, finish a run and click the
    notification: record whether the side panel opens (`sidePanel.open` from a notification
    click). The tab is focused either way.
22. **Extension reload under a live Studio tab.** With the bars showing, reload the extension:
    the console logs `[ytup] extension reloaded — page automation stopped`; the bars and the FAB
    go away; the tab-title mark clears; the reload banner appears (item 6). Picking 2 files in
    Studio's dialog is now left to Studio.
23. **Bridge not answering.** Queue a clip, reload the tab, and before Start paste in its console
    `setInterval(() => document.querySelector('iframe[src*="file-bridge"]')?.remove(), 20)`.
    Start: within about 10 s the toast "The side panel's file access is not answering — reload
    the Studio tab, then start again"; the card stays waiting.
24. **Stop mid-run.** Queue 3, Start, **Stop** during clip 1: "Will stop after the current video
    finishes"; clip 1 finishes Done, 2 and 3 wait; "Queue stopped (1 video(s) done)". Start works
    again.
25. **Review mode.** Settings → turn off **Auto-press Save**; queue 2 and Start: details fill in,
    the card shows "Waiting for you to Save" with "Check the details in the YouTube dialog, then
    click Save to move to the next file" and no ✕; clicking Save yourself finishes it and clip 2
    starts. With **Press Next to the Visibility page** on, the dialog moves to Visibility first.
    Turn Auto-press Save back on.
26. **The running tab closes while another is open.** Start in A, close A during clip 1: within
    about a second (at once when B gets focus) clip 1 shows the reload error in B's panel; the
    rest wait; after deleting the draft, Retry and Start in B work. Also let a run in A end
    normally with B open: every card ends Done.
27. **Channel lock and the confirmation.** Lock to another channel (item 4) and Start: the toast
    "⛔ Currently on channel … but locked to …" and nothing runs; unlock. Click Start and leave
    the summary open; switch Studio's channel, then confirm: "The channel changed after you
    confirmed — click Start again to see the new summary". The same with the queue: with the
    summary open, pick 2 files in Studio's dialog, then confirm: "The queue changed after you
    confirmed — …".
28. **Duplicate guards.** Add `Clip 1.mp4` twice: one card, toast "1 already in the queue". After
    it uploaded, **Clear done** and add it again: "1 already uploaded to this channel (red
    badge)", the card's red "Already uploaded …" chip opens that video, and the Start summary
    warns "1 already uploaded to this channel — they will be duplicated".
29. **Extension reload with a run in flight.** Start 2 and reload the extension during clip 1:
    one in-page toast "The extension was reloaded during an upload — …"; the orphaned run clicks
    nothing more and starts nothing; no ✅/⚠️ comes back to the title. Finish the upload in the
    dialog by hand, reload the tab: clip 1 shows the reload error and clip 2 waits. Remove clip 1
    (Retry would upload it twice).

### Presets, settings, backup

30. **Presets.** Edit the default preset: the YouTube preview and the title counter follow; a
    typo like `{artist}` shows "⚠ Unknown variable {artist} …"; variable chips insert at the
    cursor of the field last edited; dropping a `.txt` on Description inserts its text; dropping
    a real `.mp4`/`.txt` on the test field changes the preview. **New** (the name is selected
    for typing), **Duplicate**, **Set as default** ("Set "…" as the default preset"); Alt+1…9 in
    Studio does the same with "Main preset: …". **Delete** asks first; a queued video on that
    preset moves to the default preset. **Next EP** changes the next card's `{n}`. **Reset to
    defaults** asks first.
31. **Settings.** Each switch and list keeps its value after closing and reopening the panel, and
    the Studio tab follows without a reload (e.g. **Pause between files** during a run). During a
    scheduled run, turn **Notify when the queue finishes** off: after the next clip both your
    change and the moved first-release time are kept (one settings writer).
32. **Backup.** **Export (.json)** saves `yt-upload-presets-YYYY-MM-DD.json` and toasts "Exported
    N presets". **Import** a userscript export: the dialog lists the presets and asks My file /
    Someone else's; "Someone else's" keeps your producer name and schedule; the toast "Imported N
    presets"; presets and settings show at once. Import during a run toasts "Stop the queue
    before importing".

### Carried over from Phase 2a

33. **Bridge after idle.** After item 8, wait 2 minutes and Start another clip: if the page had
    removed the frame, the console shows `#1 dropped (no longer in the DOM)`, `#2 mounted`,
    `#2 loaded and connected`, and the upload works.
34. **Invite accept.** Open an "ACCEPT INVITATION" link from a collaboration email: `invite:
    watching …`, `invite: opening request 1: …`, `invite: accepting request 1`, the link reopens
    for the next request until none remain, then "Invitation accepted" / "Accepted N
    collaboration requests". With Settings → **Auto-accept channel permission invites** off,
    reopening a link logs nothing from `invite:`.
```

- [ ] **Step 4: Spec amendments**

In `docs/superpowers/specs/2026-10-05-chrome-extension-design.md`, replace these bullets (each ends where the next bullet starts) with:

Under "Messaging", the **Target tab** bullet:
```md
- **Target tab.** The panel binds to the active Studio tab in its window. The background
  enables the panel on Studio tabs only, so there is no "Open YouTube Studio" screen; when the
  Studio tab has no live content script (opened before the extension loaded or reloaded), the
  panel shows **Reload this tab**.
```

Under "Background", the **Update check** bullet gets this sentence appended: `Built in Phase 5, with the GitHub Releases it checks.`

Under "Side panel UI", the **Same content** and **Built from shadcn/ui** bullets:
```md
- **Same content.** The drawer's tabs — Upload (with the schedule box), Presets, Copyright,
  Settings — with the same fields, actions and EN/TH strings as v4.26.1 (`npm run ui-check`
  proves the strings). Backup/share stays inside Settings.
- **Built from shadcn/ui** components (Button, Tabs, Dialog, Switch, Input, Textarea, Badge,
  Progress, Sonner) copied into `components/ui/`, on Tailwind v4; native `<select>` and
  date-time inputs as in the drawer. The theme is defined as CSS variables carrying the black
  glass tokens from the current Design B. IBM Plex Sans Thai, 12px minimum text, the
  userscript's embedded Material Symbols Rounded icons. Dark only.
```
and the **FAB** bullet:
```md
- **FAB.** The drawer's FAB stays in Studio (channel, default preset, activity, drag to move)
  and opens the side panel. It no longer takes dropped files: the panel is the drop target.
  Alt+P opens the panel (a manifest command, plus the page's own shortcut). If `sidePanel.open()`
  turns out not to accept the FAB's click, the FAB is dropped and the toolbar icon / Alt+P are
  the way in.
```

- [ ] **Step 5: Full verification**

From `extension/`: `npm run check && npm run build`
Expected: tsc clean; every test passes; `port-check` `ok` ×14; `ui-check: ok` (with coverage); the build contains `sidepanel.html`, `manifest.json` with the five permissions, three host permissions and `commands._execute_action`.
From the repo root: `node --test test/*.test.mjs` → 163 pass; `git diff --stat d15ef87 -- youtube-upload-presets.user.js test` → no output.

- [ ] **Step 6: Commit**

```bash
git add extension/package.json extension/README.md extension/tests/panel-i18n.test.tsx docs/superpowers/specs/2026-10-05-chrome-extension-design.md
git commit -m "Phase 3 exit: drawer strings all accounted for, Thai leak test, panel checklist, spec amendments

The README's manual checklist now runs Phase 2's checks from the real panel and
adds the panel's own; spec amended for the off-Studio behaviour, tabs,
components, FAB and the update check's phase.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Manual check (the person with the logged-in Chrome profile)**

Run the README's "Phase 3 exit check" items 1–34 and record pass/fail for each, plus the three recorded observations (item 7 FAB click, item 14 one-click re-grant, item 21 notification click). Any failure blocks Phase 4.

## What comes next (separate plans)

- **Phase 4:** youtubei through the MAIN world; scan / trim / autopilot; the Copyright tab replaces its placeholder; `setClaims({ listScheduled })` fills `QueueView.schedule.taken`; the card's "previously claimed" chip (`scripts/strings/dropped.mjs` entries marked Phase 4 move back into use); `STATE_KEYS` gains `cfg`, `collabHandles`, `songHistory`, `logOpen` and the per-channel keys.
- **Phase 5:** daily GitHub release check and the "Update available" banner; parity checklist; `wxt zip` → GitHub Release; the userscript's "moved to the extension" notice.
