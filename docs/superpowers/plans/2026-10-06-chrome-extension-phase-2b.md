# Chrome Extension — Phase 2b (Page automation: queue runner, in-page features, exit check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Phase 2a (`docs/superpowers/plans/2026-10-06-chrome-extension-phase-2a.md`) is complete: `scripts/port-check.mjs`, `lib/sync-store.ts`, `lib/studio/{state,automation,collab,schedule,upload-dialog,channel}.ts`, `lib/{invite,channel-switch}.ts`, `createFileBridge`.

**Goal:** Port the upload queue runner, manual-fill and the quick-action bars into the Studio content script; persist the queue in `chrome.storage.local` with Files fetched through the bridge by item id; let only one Studio tab run the queue; move every drawer-UI call behind a typed `PageUi` port that broadcasts to the side panel; and pass the spec's Phase 2 exit check — **a real upload driven end-to-end from a dev command**.

**Architecture:**
- **UI seam.** The ported runner calls `ui.item(it)`, `ui.run()`, `ui.queue()`, `ui.schedule()`, `ui.presetPreview()`, `ui.toast()`, `ui.openDrawer()`, `ui.notifyDone()`, `ui.setTitleMark()`, `ui.confirmStart()` (one method per userscript drawer function it replaces). The content script's implementation persists the queue, keeps the page-side effects (tab-title mark, sound, an in-page shadow-DOM toast), asks the background for desktop notifications, and broadcasts a small serializable `queue:state` (`running`, `stopping`, upload progress, `rev`) to the side panel; items themselves are read from storage.
- **Confirmations.** The userscript's pre-run `ask()` becomes data: `queue:preflight` returns a `StartSummary`; the panel shows it and sends `queue:start(true)`. Inside `runQueue` the ask is `ui.confirmStart()`, answered with that flag. Without a confirmation the run doesn't start and the page says "Confirm the upload in the side panel first". Retry-with-draft is confirmed in the panel before `queue:retry`.
- **Queue items** are keyed by `crypto.randomUUID()` (the file-store key). Metadata persists under `queue`; `it.file` / `it.thumb` hold name/size/type (+ the thumbnail's id); the File is fetched by id at upload time — from the bridge (`src: 'bridge'`, dropped on the panel) or from an in-page map (`src: 'page'`, picked in Studio's own dialog via the intercept, lost on reload).
- **One runner.** A `storage.session` lock `{ runnerTabId }` in the background; the runner tab's copy of the queue is authoritative while it runs.

**Tech Stack:** as Phase 2a. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` — "File intake", "Messaging", "Background · Notifications", "In-page UI", rollout row 2.

## Global Constraints

Identical to Phase 2a's **Global Constraints** and **Porting rules** (pin `d15ef87caaddb7a6d3187d2851b83a484c4bb9e7`, `port-check` must be `ok`, types-only edits plus listed substitutions, byte-identical ported test bodies, `L()` for shipped strings with the developer panel exempt, Shadow DOM for in-page UI, exact manifest permissions, strict TS, commands from `extension/`, the `port` shell function, commit trailer per agent environment, never stage `.claude/` dirs). Manual Studio checks: Task 5.

Every port task uses:
```bash
port() { node scripts/port-check.mjs --print "$@"; }
```

## File Structure

```
extension/
  scripts/port/
    dom.mjs page-notify.mjs video-duration.mjs queue-runner.mjs manual-fill.mjs quick-actions.mjs   NEW
  lib/
    notify.ts                 NEW  "queue finished" desktop notification (background side)
    runner-lock.ts            NEW  one Studio tab runs the queue (storage.session)
    messages.ts               MOD  notify, runner:*, files:delete, queue:*, fill:apply, diag:dialogInfo, queue:state/toast
    studio/
      dom.ts                  NEW  port: h(), ICONS, icon()
      page-toast.ts           NEW  the userscript's toast as a shadow-DOM island
      page-notify.ts          NEW  port: beep(), setTitleMark() + its re-apply interval
      page-ui.ts              NEW  PageUi port + setPageUi()
      video-duration.ts       NEW  port: videoDurationOnce()/videoDuration()
      queue-files.ts          NEW  Files by item id: bridge or page
      queue-runner.ts         NEW  port: the queue (addFiles … runQueue, interceptors) + glue
      manual-fill.ts          NEW  port: applyToOpenDialog() + the auto-fill poller
      quick-actions.ts        NEW  port: the bars under Studio's title/description (Shadow DOM)
      queue-store.ts          NEW  persist / restore the queue; unload guard
      queue-ops.ts            NEW  stop / remove / retry / clear done
      content-ui.ts           NEW  the content script's PageUi
      inject-spike.ts         DEL
  entrypoints/
    background.ts             MOD  notify, runner lock, files:delete
    studio.content.ts         MOD  full wiring; spike:inject removed
    sidepanel/index.html, main.ts  MOD  developer queue controls (the Phase 2 dev trigger)
  tests/
    page-notify.test.ts notify.test.ts runner-lock.test.ts queue-files.test.ts
    queue-runner.test.ts queue-store.test.ts queue-ops.test.ts   NEW
```

Userscript line map (pinned commit): `videoDurationOnce` 884–902, `videoDuration` 935–938, `uploadProg`/`pollUploadProgress` 1685–1691, queue 1716–2186 (start-dialog `ask()` 2112–2143), interceptors 2188–2216, manual fill 2218–2256, quick actions 2258–2418, `h` 2429–2441, `ICONS` 2443–2501, `icon` 2509–2522, `toast` 3194–3202 (+ CSS 2812–2818), `beep` 3240–3257, `notifyDone` 3258–3270, title mark 3271–3284, queue-tab buttons 3739–3800, progress tick 6360–6380.

### What each drawer call becomes

| Userscript call (where) | Phase 2 replacement |
|---|---|
| `updateItemUI(it)` (setItem, addFiles duration probe) | `ui.item(it)` → persist queue, release a done item's files, broadcast |
| `updateRunUI()` (setItem, runQueue) | `ui.run()` → `(n/N) ⬆` tab-title mark while running, persist, broadcast |
| `renderQueue()` (addFiles, runQueue) | `ui.queue()` → persist, broadcast |
| `onScheduleChange()` / `syncScheduleInput()` (refreshChanSched, uploadOne) | `ui.schedule()` → broadcast (`rev` bump; the panel re-reads settings) |
| `renderPresetPreview()` (applyToOpenDialog) | `ui.presetPreview()` → broadcast |
| `toast(msg)` (addFiles, runQueue, manual fill) | `ui.toast(msg)` → in-page toast + `queue:toast` to the panel + console |
| `openDrawer(tab)` (runQueue, interceptors) | `ui.openDrawer()` → `openPanel` message (best effort: needs a user gesture) |
| `notifyDone(title, text, ok)` (runQueue) | `ui.notifyDone()` → `settings.notify` gate, page `beep()`, `notify` message → background `chrome.notifications` |
| `setTitleMark(mark)` (runQueue) | `ui.setTitleMark()` → ported `setTitleMark` |
| `ask({...})` before a run (runQueue) | `ui.confirmStart()` → the `confirmed` flag of `queue:start` |
| `ask()` before Retry with a draft (UI) | the panel asks, then sends `queue:retry` |

---

### Task 1: In-page UI kit and the "queue finished" notification

**Files:**
- Create: `extension/scripts/port/dom.mjs`, `extension/scripts/port/page-notify.mjs`, `extension/lib/studio/dom.ts`, `extension/lib/studio/page-notify.ts`, `extension/lib/studio/page-toast.ts`, `extension/lib/notify.ts`
- Modify: `extension/lib/messages.ts`, `extension/entrypoints/background.ts`
- Test: `extension/tests/page-notify.test.ts`, `extension/tests/notify.test.ts`

**Interfaces:**
- Produces:
  - `lib/studio/dom.ts`: `h(tag: string, props?: Record<string, unknown>, ...kids: unknown[]): HTMLElement`, `icon(name: string, size?: number): SVGSVGElement` (ported, `ICONS` unchanged).
  - `lib/studio/page-notify.ts`: `beep(ok?: boolean): void`, `setTitleMark(mark: string): void`, `installTitleMark(): void` (the 1.5 s re-apply interval and the focus listener).
  - `lib/studio/page-toast.ts`: `pageToast(msg: string): void`.
  - `lib/messages.ts`: `interface QueueDoneNote { title: string; text: string; focused: boolean }`; `ProtocolMap.notify(n: QueueDoneNote): void`.
  - `lib/notify.ts`: `NOTIFY_ICON` (data URL), `sidePanelOpenIn(windowId): Promise<boolean>`, `notifyQueueDone(n, tab, panelOpen?): Promise<boolean>` (false = skipped), `openFromNotification(id: string): Promise<void>`. Notification ids are `queue:<tabId>`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/page-notify.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTitleMark } from '../lib/studio/page-notify';

afterEach(() => vi.unstubAllGlobals());

describe('setTitleMark', () => {
  it('puts one mark in front of the tab title and replaces it', () => {
    const doc = { title: 'Channel content - YouTube Studio' };
    vi.stubGlobal('document', doc);
    setTitleMark('(1/3) ⬆');
    expect(doc.title).toBe('(1/3) ⬆ Channel content - YouTube Studio');
    setTitleMark('✅');
    expect(doc.title).toBe('✅ Channel content - YouTube Studio');
    setTitleMark('');
    expect(doc.title).toBe('Channel content - YouTube Studio');
  });
});
```

`extension/tests/notify.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { NOTIFY_ICON, notifyQueueDone } from '../lib/notify';

beforeEach(() => { fakeBrowser.reset(); vi.restoreAllMocks(); });
const note = (focused: boolean) => ({ title: 'Upload finished ✅', text: 'Thai Beats · 2 done', focused });

describe('notifyQueueDone', () => {
  it('shows a notification for the Studio tab', async () => {
    const create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('queue:5');
    expect(await notifyQueueDone(note(false), { id: 5, windowId: 1 }, async () => true)).toBe(true);
    expect(create).toHaveBeenCalledWith('queue:5', {
      type: 'basic', iconUrl: NOTIFY_ICON, title: 'Upload finished ✅', message: 'Thai Beats · 2 done', silent: true,
    });
  });

  it('stays quiet when the user is looking at the tab with the panel open', async () => {
    const create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('');
    expect(await notifyQueueDone(note(true), { id: 5, windowId: 1 }, async () => true)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('still notifies a focused tab whose panel is closed', async () => {
    const create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('');
    expect(await notifyQueueDone(note(true), { id: 5, windowId: 1 }, async () => false)).toBe(true);
    expect(create).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/page-notify.test.ts tests/notify.test.ts`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Configs and extraction**

`extension/scripts/port/dom.mjs`:
```js
// lib/studio/dom.ts ← the userscript's h() and icon() (Trusted Types: createElement, no innerHTML)
export default {
  file: 'lib/studio/dom.ts',
  regions: ['2429-2441', '2443-2501', '2509-2522'],
  subs: [],
};
```
`extension/scripts/port/page-notify.mjs`:
```js
// lib/studio/page-notify.ts ← the in-page half of "แจ้งเตือนเมื่อคิวเสร็จ": the sound and the
// tab-title mark (notifyDone's desktop notification moves to the background: lib/notify.ts)
export default {
  file: 'lib/studio/page-notify.ts',
  regions: ['3240-3257', '3271-3284'],
  subs: [],
};
```
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ echo '// The userscript'"'"'s DOM helpers, used by the in-page UI (quick actions, toast).'
  echo '// @port-begin'
  port dom 2429-2441; port dom 2443-2501; port dom 2509-2522
  printf '// @port-end\n\nexport { h, icon };\n'; } > lib/studio/dom.ts
{ echo '// @port-begin'
  port page-notify 3240-3257; port page-notify 3271-3279
  printf '// @port-end\n\nexport function installTitleMark(): void {\n  // @port-begin\n'
  port page-notify 3280-3284
  printf '  // @port-end\n}\n\nexport { beep, setTitleMark };\n'; } > lib/studio/page-notify.ts
node scripts/port-check.mjs dom page-notify
```
Expected: `ok   dom (lib/studio/dom.ts, 83 lines)`, `ok   page-notify (lib/studio/page-notify.ts, 29 lines)`.

Add types until `tsc` is clean. Specifics: in `h`, `const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;` and `function h(tag: string, props: Record<string, any> = {}, ...kids: any[]): HTMLElement`; `const ICONS: Record<string, string> = {`; `icon(name: string, size = 16)` with `String(size)` **not** added (`setAttribute` accepts the number only after a cast: write `size as unknown as string`); `setTitleMark(mark: string)`.

- [ ] **Step 4: The in-page toast**

`extension/lib/studio/page-toast.ts`:
```ts
import { h, icon } from './dom';

// The userscript's toast (UI section: toast() + its .toast CSS), as a shadow-DOM island
// on Studio so messages from page features show even with the side panel closed.
const CSS = `
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);opacity:0;z-index:100002;display:flex;gap:10px;align-items:center;
  background:#111116;color:#f2f2f6;padding:11px 16px;border-radius:12px;border:1px solid #2a2a33;
  box-shadow:0 16px 40px -10px rgba(0,0,0,.6);transition:.22s cubic-bezier(.2,.8,.2,1);max-width:min(560px,90vw);pointer-events:none;
  font:13px/1.5 "IBM Plex Sans Thai","Leelawadee UI","Segoe UI",system-ui,sans-serif;letter-spacing:.005em}
.toast .ti{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;flex:0 0 auto;
  background:linear-gradient(135deg,#ff2d55,#ff6a3d);color:#fff}
.toast .ic{flex:0 0 auto;display:block}
.toast.show{opacity:1;transform:translate(-50%,0)}`;

let el: { box: HTMLElement; text: HTMLElement } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function mount() {
  const host = h('div', { id: 'ytup-toast' });
  const text = h('span');
  const box = h('div', { className: 'toast' }, h('span', { className: 'ti' }, icon('check', 13)), text);
  host.attachShadow({ mode: 'open' }).append(h('style', {}, CSS), box);
  document.documentElement.append(host);
  return { box, text };
}

export function pageToast(msg: string): void {
  if (!el?.box.isConnected) el = mount();
  const { box, text } = el;
  text.textContent = msg;
  box.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => box.classList.remove('show'), 3800);
}
```

- [ ] **Step 5: The background notification**

In `extension/lib/messages.ts` add above `export type ProtocolMap`:
```ts
export interface QueueDoneNote { title: string; text: string; focused: boolean }
```
and in `ProtocolMap`:
```ts
  // content → background: "queue finished" desktop notification
  notify(n: QueueDoneNote): void;
```

`extension/lib/notify.ts`:
```ts
import { browser } from 'wxt/browser';
import type { QueueDoneNote } from './messages';

// chrome.notifications needs an icon and the extension ships none yet: a 48 px red dot.
export const NOTIFY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAkUlEQVR42u3awRGAIAxEURuyHPsv5duCSoDNuod/ZebdIOHgvI7OVR/Iw6QADLYNQHHLAExuGoDFlQLYVAmAzQ0BEOkTALFeARDtHwDE8wbQJE8AzQpACkDTAggggAACCMADkLtQAAWAvMgUAJlKKAAymVMAtB/uWozXLRYcFismiyWfxZrVZtFt89XA5rPH1m6gmwOtMYiAEgAAAABJRU5ErkJggg==';

const PREFIX = 'queue:';

export const sidePanelOpenIn = async (windowId: number) =>
  (await browser.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).some((c) => c.windowId === windowId);

// "Queue finished" on the desktop — unless the user is already looking at that Studio
// tab with the side panel open (the userscript skipped it when its drawer was open).
export async function notifyQueueDone(
  n: QueueDoneNote,
  tab: { id?: number; windowId?: number } | undefined,
  panelOpen: (windowId: number) => Promise<boolean> = sidePanelOpenIn,
): Promise<boolean> {
  if (tab?.id === undefined) return false;
  if (n.focused && tab.windowId !== undefined && (await panelOpen(tab.windowId))) return false;
  await browser.notifications.create(PREFIX + tab.id, { type: 'basic', iconUrl: NOTIFY_ICON, title: n.title, message: n.text, silent: true });
  return true;
}

// A click brings that tab forward and opens the side panel there. sidePanel.open() goes
// first: it needs the click's user gesture.
export async function openFromNotification(id: string): Promise<void> {
  if (!id.startsWith(PREFIX)) return;
  const tabId = Number(id.slice(PREFIX.length));
  const opened = browser.sidePanel.open({ tabId }).catch((e) => console.warn('[ytup] open panel from notification', e));
  const tab = await browser.tabs.update(tabId, { active: true }).catch(() => undefined);
  if (tab?.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
  await browser.notifications.clear(id);
  await opened;
}
```

In `extension/entrypoints/background.ts` add `import { notifyQueueDone, openFromNotification } from '@/lib/notify';` and, after the `ensureMigrated` handler:
```ts

  onMessage('notify', async ({ data, sender }) => {
    await notifyQueueDone(data, sender.tab);
  });
  browser.notifications.onClicked.addListener((id) => void openFromNotification(id));
```

- [ ] **Step 6: Run the checks**

Run: `npx vitest run tests/page-notify.test.ts tests/notify.test.ts && node scripts/port-check.mjs dom page-notify && npm run check`
Expected: **1** + **3** tests pass; both configs `ok`; full suite **260**; `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add extension/scripts/port/dom.mjs extension/scripts/port/page-notify.mjs extension/lib/studio/dom.ts extension/lib/studio/page-notify.ts extension/lib/studio/page-toast.ts extension/lib/notify.ts extension/lib/messages.ts extension/entrypoints/background.ts extension/tests/page-notify.test.ts extension/tests/notify.test.ts
git commit -m "Port the in-page UI helpers and title mark; queue-finished notifications from the background

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One runner at a time (`lib/runner-lock.ts`)

The queue is now shared storage, so two Studio tabs could both run it and upload every video twice. The spec's lock: `storage.session` `{ runnerTabId }`, held by the running tab, released on stop or when the tab closes. A holder whose tab no longer exists doesn't count.

**Files:**
- Create: `extension/lib/runner-lock.ts`
- Modify: `extension/lib/messages.ts`, `extension/entrypoints/background.ts`
- Test: `extension/tests/runner-lock.test.ts`

**Interfaces:**
- Produces: `acquireRunner(tabId): Promise<boolean>` (true for the holder asking again), `releaseRunner(tabId): Promise<void>` (only the holder releases), `runnerElsewhere(tabId): Promise<boolean>`. Calls are serialized in the service worker. `ProtocolMap`: `'runner:acquire'(): boolean`, `'runner:release'(): void`, `'runner:elsewhere'(): boolean` (sender tab = asker).

- [ ] **Step 1: Write the failing test**

`extension/tests/runner-lock.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { acquireRunner, releaseRunner, runnerElsewhere } from '../lib/runner-lock';

beforeEach(() => fakeBrowser.reset());
const tab = async () => (await browser.tabs.create({ url: 'https://studio.youtube.com/' })).id!;

describe('runner lock', () => {
  it('lets one tab run at a time', async () => {
    const a = await tab();
    const b = await tab();
    expect(await acquireRunner(a)).toBe(true);
    expect(await acquireRunner(a)).toBe(true); // the holder may ask again
    expect(await acquireRunner(b)).toBe(false);
    expect(await runnerElsewhere(b)).toBe(true);
    expect(await runnerElsewhere(a)).toBe(false);
  });

  it('only the holder releases it', async () => {
    const a = await tab();
    const b = await tab();
    await acquireRunner(a);
    await releaseRunner(b);
    expect(await acquireRunner(b)).toBe(false);
    await releaseRunner(a);
    expect(await acquireRunner(b)).toBe(true);
  });

  it('a holder whose tab is gone frees the lock', async () => {
    const b = await tab();
    await acquireRunner(9999); // no such tab
    expect(await runnerElsewhere(b)).toBe(false);
    expect(await acquireRunner(b)).toBe(true);
  });

  it('two tabs asking at once: exactly one wins', async () => {
    const a = await tab();
    const b = await tab();
    const got = await Promise.all([acquireRunner(a), acquireRunner(b)]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/runner-lock.test.ts`
Expected: FAIL — cannot resolve `../lib/runner-lock`.

- [ ] **Step 3: Implement**

`extension/lib/runner-lock.ts`:
```ts
import { browser } from 'wxt/browser';

// One Studio tab runs the upload queue at a time. The holder's tab id lives in
// storage.session, so it survives the service worker being stopped and is gone when the
// browser closes. A holder whose tab no longer exists doesn't count.
const KEY = 'runnerTabId';

// Calls run one after another, so two tabs can't both see "free" and both take it.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

async function holder(): Promise<number | null> {
  const id = (await browser.storage.session.get(KEY))[KEY];
  if (typeof id !== 'number') return null;
  if (await browser.tabs.get(id).then((t) => !!t, () => false)) return id;
  await browser.storage.session.remove(KEY);
  return null;
}

export const acquireRunner = (tabId: number) =>
  serial(async () => {
    const h = await holder();
    if (h !== null && h !== tabId) return false;
    await browser.storage.session.set({ [KEY]: tabId });
    return true;
  });

export const releaseRunner = (tabId: number) =>
  serial(async () => {
    if ((await holder()) === tabId) await browser.storage.session.remove(KEY);
  });

export const runnerElsewhere = (tabId: number) =>
  serial(async () => {
    const h = await holder();
    return h !== null && h !== tabId;
  });
```

In `extension/lib/messages.ts` add to `ProtocolMap`:
```ts
  // content → background: the one-runner lock (the sender's tab is the asker)
  'runner:acquire'(): boolean;
  'runner:release'(): void;
  'runner:elsewhere'(): boolean;
```

In `extension/entrypoints/background.ts` add `import { acquireRunner, releaseRunner, runnerElsewhere } from '@/lib/runner-lock';` and, at the end of the `defineBackground` callback:
```ts

  // One Studio tab runs the queue at a time.
  const tabOf = (sender: { tab?: { id?: number } }) => {
    if (sender.tab?.id === undefined) throw new Error('runner lock: not sent from a tab');
    return sender.tab.id;
  };
  onMessage('runner:acquire', ({ sender }) => acquireRunner(tabOf(sender)));
  onMessage('runner:release', ({ sender }) => releaseRunner(tabOf(sender)));
  onMessage('runner:elsewhere', ({ sender }) => runnerElsewhere(tabOf(sender)));
  browser.tabs.onRemoved.addListener((tabId) => void releaseRunner(tabId));
```

- [ ] **Step 4: Run the checks**

Run: `npx vitest run tests/runner-lock.test.ts && npm run check`
Expected: **4** tests pass; full suite **264**; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/runner-lock.ts extension/lib/messages.ts extension/entrypoints/background.ts extension/tests/runner-lock.test.ts
git commit -m "Add the one-runner lock in the background

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The queue runner (`queue-runner.ts`, `queue-files.ts`, `page-ui.ts`, `video-duration.ts`)

**Files:**
- Create: `extension/scripts/port/video-duration.mjs`, `extension/scripts/port/queue-runner.mjs`
- Create: `extension/lib/studio/video-duration.ts`, `extension/lib/studio/page-ui.ts`, `extension/lib/studio/queue-files.ts`, `extension/lib/studio/queue-runner.ts`
- Modify: `extension/lib/messages.ts`, `extension/entrypoints/background.ts`
- Test: `extension/tests/queue-files.test.ts`, `extension/tests/queue-runner.test.ts`

**Interfaces:**
- Consumes: Phase 2a modules; `mp4Duration` (`lib/chapters.ts`); `checkTracklist`; `parseUploadPct` (`lib/activity.ts`); `visLabels` (`lib/presets.ts`); `locale` (`lib/i18n.ts`); `deleteHandle` (`lib/file-store.ts`).
- Produces:
  - `lib/studio/page-ui.ts`: `interface PageUi` (methods in the table above; `confirmStart(): Promise<boolean>`), `export let ui: PageUi` (a quiet no-op until set), `setPageUi(next: PageUi): void`.
  - `lib/studio/queue-files.ts`: `setBridge(b: { getFile(id: string): Promise<File> } | null)`, `pageFiles(list: ArrayLike<File>): QFile[]`, `bridgeFiles(ids: string[]): Promise<{ files: QFile[]; failed: { id: string; reason: string }[] }>`, `getQueueFile(id: string, src: FileSrc): Promise<File>` (errors are user-facing `L()` sentences), `dropFiles(refs: { id: string; src: FileSrc }[]): void`.
  - `lib/studio/queue-runner.ts`: types `FileSrc`, `FileMeta`, `FileRef`, `QFile`, `ItemStatus`, `UploadRecord`, `QueueItem`, `ClaimsHooks`, `StartSummary`; `fileMeta(f)`; `Claims` + `setClaims(c)`; `setRunnerLock({ acquire, release })`; every ported function (`queue`, `running`, `stopReq`, `uploadProg`, `pollUploadProgress`, `uploadBusy`, `STATUS`, `readText`, `saveMemo`, `restoreMemo`, `addFiles`, `assignNumbers`, `scheduleOn`, `stepMs`, `itemPublishAt`, `queueSlots`, `takenSlots`, `refreshChanSched`, `effectiveStart`, `startIsPast`, `scheduleProblem`, `fmtWhen`, `toLocalInput`, `itemVars`, `itemTracklist`, `setItem`, `uploadOne`, `dialogVideoId`, `getUploads`, `logUpload`, `uploadOf`, `uploadsCSV`, `downloadCSV`, `runQueue`, `isVideo`, `isTxt`, `isImg`, `baseKey`); new `installIntercept()`, `requestStop()`, `addQueued(files: QFile[])`, `startSummary(): Promise<StartSummary | { error: string }>`.
  - `ProtocolMap`: `'files:delete'(ids: string[]): void` (content → background).
- Decisions baked in (see the plan's report): `qid` is gone (ids are UUIDs from the panel or `pageFiles`); `queueMemo` / `saveMemo` / `restoreMemo` are ported unchanged (they still restore edits when the same file is re-added; `saveMemo` gets its caller with the Phase 3 edit messages); a thumbnail is fetched together with the video before the dialog opens, so a missing thumbnail file fails the item with its reason instead of silently skipping it.

- [ ] **Step 1: Write the failing tests**

`extension/tests/queue-files.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { bridgeFiles, dropFiles, getQueueFile, pageFiles, setBridge } from '../lib/studio/queue-files';

afterEach(() => { setBridge(null); vi.restoreAllMocks(); });

describe('queue files', () => {
  it('page files get unguessable ids and stay in this page', async () => {
    const [a] = pageFiles([new File(['v'], 'A.mp4')]);
    expect(a!.qid).toMatch(/^[0-9a-f-]{36}$/);
    expect(a!.src).toBe('page');
    expect(await getQueueFile(a!.qid, 'page')).toBe(a);
  });

  it('a page file lost to a reload says to add it again', async () => {
    await expect(getQueueFile('gone', 'page')).rejects.toThrow("Studio's own upload dialog");
  });

  it('bridge files come through the bridge by id', async () => {
    setBridge({ getFile: async (id) => new File(['v'], id + '.mp4') });
    const { files, failed } = await bridgeFiles(['x']);
    expect(files.map((f) => [f.name, f.qid, f.src])).toEqual([['x.mp4', 'x', 'bridge']]);
    expect(failed).toEqual([]);
  });

  it('turns bridge codes into sentences', async () => {
    setBridge({ getFile: async (id) => { throw new Error(id); } });
    await expect(getQueueFile('permission', 'bridge')).rejects.toThrow('Re-grant access');
    await expect(getQueueFile('missing', 'bridge')).rejects.toThrow('no longer available');
    await expect(getQueueFile('read', 'bridge')).rejects.toThrow('moved or renamed');
    await expect(getQueueFile('bridge not ready', 'bridge')).rejects.toThrow('(bridge not ready)');
    const { failed } = await bridgeFiles(['missing']);
    expect(failed).toEqual([{ id: 'missing', reason: 'This file is no longer available — add it again' }]);
  });

  it('dropping forgets page files and asks the background to delete stored handles', async () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    const [a] = pageFiles([new File(['v'], 'A.mp4')]);
    dropFiles([{ id: a!.qid, src: 'page' }, { id: 'h1', src: 'bridge' }]);
    await expect(getQueueFile(a!.qid, 'page')).rejects.toThrow();
    expect(send).toHaveBeenCalledWith('files:delete', ['h1']);
  });
});
```

`extension/tests/queue-runner.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import * as Q from '../lib/studio/queue-runner';
import { counters, save, settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// Duration probing needs a real <video>; it is not what these tests are about.
vi.mock('../lib/studio/video-duration', () => ({ videoDuration: async () => 0 }));

const calls: string[] = [];
const recorder: PageUi = {
  item: (it) => void calls.push(`item:${it.file.name}:${it.status}`),
  run: () => void calls.push('run'),
  queue: () => void calls.push('queue'),
  schedule: () => void calls.push('schedule'),
  presetPreview: () => void calls.push('presetPreview'),
  toast: (msg) => void calls.push(`toast:${msg}`),
  openDrawer: (tab) => void calls.push(`openDrawer:${tab ?? ''}`),
  notifyDone: (title) => void calls.push(`notifyDone:${title}`),
  setTitleMark: (mark) => void calls.push(`mark:${mark}`),
  confirmStart: async () => false,
};

let n = 0;
const qfile = (name: string, body = 'x', type = '') =>
  Object.assign(new File([body], name, { type }), { qid: `id-${++n}`, src: 'bridge' as const });

beforeEach(() => {
  vi.stubGlobal('document', makeDocument());
  vi.stubGlobal('location', { pathname: '/channel/UCabcdefghijklmn/videos' });
  setPageUi(recorder);
  Q.queue.splice(0);
  calls.length = 0;
  for (const k of Object.keys(counters)) delete counters[k];
  save('uploads', []);
  save('queueMemo', {});
});
afterEach(() => vi.unstubAllGlobals());

describe('addFiles', () => {
  it('queues videos in natural name order and pairs .txt / thumbnails by base name', async () => {
    await Q.addFiles([qfile('Mix 10.mp4'), qfile('Mix 2.mp4'), qfile('mix 2.txt', '00:00 A - B'), qfile('Mix 10.jpg', 'img', 'image/jpeg')]);
    expect(Q.queue.map((i) => i.file.name)).toEqual(['Mix 2.mp4', 'Mix 10.mp4']);
    const [two, ten] = Q.queue;
    expect(two!.txt).toBe('00:00 A - B');
    expect(two!.txtName).toBe('mix 2.txt');
    expect(ten!.thumb).toMatchObject({ name: 'Mix 10.jpg', src: 'bridge' });
    expect(ten!.thumb!.id).toMatch(/^id-/);
    expect(two!.id).toMatch(/^id-/);
    expect(two!.src).toBe('bridge');
    expect(two!.status).toBe('pending');
    expect(calls).toContain('toast:Added 2 video(s) · 1 .txt description file(s) · 1 thumbnail file(s)');
    expect(calls.at(-1)).toBe('queue');
  });

  it('skips a video already in the queue and flags one uploaded to this channel before', async () => {
    save('uploads', [{ file: 'Old.mp4', size: 1, channel: 'UCabcdefghijklmn', title: 'Old upload', videoId: 'abcdefghijk' }]);
    await Q.addFiles([qfile('Old.mp4')]);
    await Q.addFiles([qfile('Old.mp4')]);
    expect(Q.queue).toHaveLength(1);
    expect(Q.queue[0]!.prev).toMatchObject({ title: 'Old upload' });
    expect(calls.filter((c) => c.startsWith('toast:'))).toEqual([
      'toast:Added 1 video(s) · 1 already uploaded to this channel (red badge)',
      'toast:1 already in the queue',
    ]);
  });

  it('restores edits remembered for the same file', async () => {
    save('queueMemo', { 'Clip.mp4|1': { title: 'My title', t: Date.now() } });
    await Q.addFiles([qfile('Clip.mp4')]);
    expect(Q.queue[0]).toMatchObject({ title: 'My title', titleEdited: true });
  });
});

describe('assignNumbers', () => {
  it('numbers pending clips per preset after the saved counter', async () => {
    counters.trapsoul = 4;
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    Q.assignNumbers();
    expect(Q.queue.map((i) => i.n)).toEqual([5, 6]);
  });
});

describe('schedule slots', () => {
  afterEach(() => { vi.useRealTimers(); settings.schedule = { on: false, start: '', every: 1, unit: 'day' }; });

  it('spaces clips one step apart from the start time', async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 7, 6, 0) });
    settings.schedule = { on: true, start: '2026-10-07T08:00', every: 1, unit: 'day' };
    await Q.addFiles([qfile('A.mp4'), qfile('B.mp4')]);
    expect(Q.queue.map(Q.itemPublishAt)).toEqual([new Date(2026, 9, 7, 8, 0).getTime(), new Date(2026, 9, 8, 8, 0).getTime()]);
  });

  it('moves a start that is too soon to the first slot still allowed', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 7, 7, 50) });
    settings.schedule = { on: true, start: '2026-10-07T08:00', every: 1, unit: 'hour' };
    expect(Q.effectiveStart()).toBe(new Date(2026, 9, 7, 9, 0).getTime());
    expect(Q.startIsPast()).toBe(true);
  });
});

describe('runQueue', () => {
  it('says so when nothing is waiting', async () => {
    await Q.runQueue();
    expect(calls).toEqual(['toast:No videos waiting in the queue']);
  });

  it('does not start without a confirmation from the panel', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    calls.length = 0;
    await Q.runQueue(); // confirmStart answers false; settings.confirmStart is on by default
    expect(Q.running).toBe(false);
    expect(Q.queue[0]!.status).toBe('pending');
  });

  it('refuses a channel other than the locked one', async () => {
    await Q.addFiles([qfile('A.mp4')]);
    calls.length = 0;
    settings.lockChannel = { id: 'UCsomethingelse1', name: 'Other' };
    await Q.runQueue();
    settings.lockChannel = null;
    expect(calls).toEqual(['openDrawer:', 'toast:⛔ Currently on channel "UCabcdefghijklmn" but locked to "Other"']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/queue-files.test.ts tests/queue-runner.test.ts`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: `page-ui.ts`, the `files:delete` message, `queue-files.ts`**

`extension/lib/studio/page-ui.ts`:
```ts
import type { QueueItem } from './queue-runner';

// Everything the ported page code used to do to the userscript's drawer. The content
// script installs the real implementation (lib/studio/content-ui.ts: persist the queue,
// tell the side panel, in-page toast); tests install a recorder; until then nothing
// happens. Each method names the userscript function it replaces.
export interface PageUi {
  item(it: QueueItem): void; // updateItemUI(it)
  run(): void; // updateRunUI()
  queue(): void; // renderQueue()
  schedule(): void; // onScheduleChange() / syncScheduleInput()
  presetPreview(): void; // renderPresetPreview()
  toast(msg: string): void; // toast(msg)
  openDrawer(tab?: string): void; // openDrawer(tab)
  notifyDone(title: string, text: string, ok?: boolean): void; // notifyDone(...)
  setTitleMark(mark: string): void; // setTitleMark(mark)
  confirmStart(): Promise<boolean>; // the ask() before a run; answered in the side panel
}

const quiet: PageUi = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast() {}, openDrawer() {},
  notifyDone() {}, setTitleMark() {}, confirmStart: async () => false,
};

export let ui: PageUi = quiet;
export function setPageUi(next: PageUi): void {
  ui = next;
}
```

In `extension/lib/messages.ts` add to `ProtocolMap`:
```ts
  // content → background: forget stored file handles (the page can't reach the extension's IndexedDB)
  'files:delete'(ids: string[]): void;
```
In `extension/entrypoints/background.ts` add `import { deleteHandle } from '@/lib/file-store';` and, after the `ensureMigrated` handler:
```ts

  // The page has no access to the extension's IndexedDB; it asks here to forget handles.
  onMessage('files:delete', async ({ data: ids }) => {
    for (const id of ids) await deleteHandle(id);
  });
```

`extension/lib/studio/queue-files.ts`:
```ts
import { L } from '../i18n';
import { sendMessage } from '../messages';
import type { FileRef, FileSrc, QFile } from './queue-runner';

// Where a queue item's File comes from at upload time:
//   'bridge' — dropped on the side panel; its handle sits in the extension's IndexedDB
//              under the item id and is read through the file-bridge iframe.
//   'page'   — picked in Studio's own upload dialog (the intercept); kept in this page only.
const local = new Map<string, File>();
let bridge: { getFile(id: string): Promise<File> } | null = null;
export const setBridge = (b: typeof bridge) => { bridge = b; };

const tag = (file: File, qid: string, src: FileSrc): QFile => Object.assign(file, { qid, src });

export const pageFiles = (list: ArrayLike<File>): QFile[] =>
  Array.from(list, (f) => {
    const id = crypto.randomUUID(); // unguessable: see lib/file-bridge.ts
    local.set(id, f);
    return tag(f, id, 'page');
  });

// The side panel stored a handle per id; fetch them all, keep what could be read.
export async function bridgeFiles(ids: string[]): Promise<{ files: QFile[]; failed: { id: string; reason: string }[] }> {
  const files: QFile[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      files.push(tag(await getQueueFile(id, 'bridge'), id, 'bridge'));
    } catch (e) {
      failed.push({ id, reason: (e as Error).message });
    }
  }
  return { files, failed };
}

// The bridge answers with codes (lib/file-bridge.ts readHandle); the queue shows sentences.
function reason(code: string): string {
  if (code === 'missing') return L('ไม่พบไฟล์นี้แล้ว — เพิ่มไฟล์อีกครั้ง', 'This file is no longer available — add it again');
  if (code === 'permission') return L('ยังไม่ได้อนุญาตให้อ่านไฟล์ — กด "อนุญาตอีกครั้ง" ในแผงด้านข้าง', 'No permission to read this file — click "Re-grant access" in the side panel');
  if (code === 'read') return L('อ่านไฟล์ไม่ได้ (ถูกย้ายหรือเปลี่ยนชื่อ?) — เพิ่มไฟล์อีกครั้ง', 'Could not read this file (moved or renamed?) — add it again');
  return L(`ดึงไฟล์จากแผงด้านข้างไม่ได้ (${code})`, `Could not get the file from the side panel (${code})`);
}

export async function getQueueFile(id: string, src: FileSrc): Promise<File> {
  if (src === 'page') {
    const f = local.get(id);
    if (!f) throw new Error(L('ไฟล์นี้มาจากหน้าต่างอัปโหลดของ Studio และหายไปเมื่อโหลดหน้าใหม่ — เพิ่มไฟล์อีกครั้ง', "This file came from Studio's own upload dialog and was lost when the page reloaded — add it again"));
    return f;
  }
  if (!bridge) throw new Error(reason('bridge not ready'));
  try {
    return await bridge.getFile(id);
  } catch (e) {
    throw new Error(reason(e instanceof Error ? e.message : String(e)));
  }
}

// Forget files no queue item needs any more (the side panel's handles via the background).
export function dropFiles(refs: Pick<FileRef, 'id' | 'src'>[]): void {
  const ids: string[] = [];
  for (const r of refs) {
    if (r.src === 'page') local.delete(r.id);
    else ids.push(r.id);
  }
  if (ids.length) sendMessage('files:delete', ids).catch((e) => console.warn('[ytup] files:delete', e));
}
```

- [ ] **Step 4: Configs**

`extension/scripts/port/video-duration.mjs`:
```js
// lib/studio/video-duration.ts ← videoDurationOnce() / videoDuration() (mp4Duration is in lib/chapters.ts)
export default {
  file: 'lib/studio/video-duration.ts',
  regions: ['884-902', '935-938'],
  subs: [],
};
```
`extension/scripts/port/queue-runner.mjs`:
```js
// lib/studio/queue-runner.ts ← "คิวอัปโหลด" plus uploadProg / pollUploadProgress (they read
// `running`). Drawer UI calls go through the PageUi port (lib/studio/page-ui.ts), Files come
// from the bridge or the page by item id, and one Studio tab runs the queue at a time.
export default {
  file: 'lib/studio/queue-runner.ts',
  regions: ['1685-1691', '1716-2186', '2188-2216'],
  replaceLines: [
    // the start dialog moves to the side panel: queue:preflight → (panel asks) → queue:start(true)
    { lines: '2112-2143', to: '      const go = await ui.confirmStart();' },
  ],
  subs: [
    ['let qid = 0;', '', 1],
    ['{ id: ++qid, file, presetId: activeId,', '{ id: file.qid, src: file.src, file: fileMeta(file), presetId: activeId,', 1],
    ['if (it.ui) updateItemUI(it);', 'ui.item(it);', 1],
    ['it.thumb = file;', 'it.thumb = { id: file.qid, src: file.src, ...fileMeta(file) };', 1],
    ['toast(', 'ui.toast(', 5],
    ['renderQueue();', 'ui.queue();', 2],
    ['updateItemUI(it);', 'ui.item(it);', 1],
    ['updateRunUI();', 'ui.run();', 2],
    ["if (typeof onScheduleChange === 'function') onScheduleChange();", 'ui.schedule();', 1],
    ["if (typeof syncScheduleInput === 'function') syncScheduleInput();", 'ui.schedule();', 1],
    ['LOCALE', 'locale()', 2],
    ["'An upload dialog is still open. Close it, then start again'));",
      "'An upload dialog is still open. Close it, then start again'));\n    const file = await getQueueFile(it.id, it.src);\n    const thumbFile = settings.thumb && it.thumb ? await getQueueFile(it.thumb.id, it.thumb.src) : null;", 1],
    ['injectUploadFile(input, it.file)', 'injectUploadFile(input, file)', 1],
    ['setThumbnail(it.thumb, 3000)', 'setThumbnail(thumbFile, 3000)', 1],
    ['VIS[vis]', 'visLabels()[vis]', 1],
    ['openDrawer(', 'ui.openDrawer(', 3],
    ['    running = true;\n    stopReq = false;',
      "    if (!(await lock.acquire())) return ui.toast(L('มีแท็บ Studio อื่นกำลังอัปโหลดคิวอยู่', 'Another Studio tab is already running the queue'));\n    if (running) return;\n    running = true;\n    stopReq = false;", 1],
    ['      running = false;\n      assignNumbers();', '      running = false;\n      lock.release();\n      assignNumbers();', 1],
    ['notifyDone(', 'ui.notifyDone(', 1],
    ['setTitleMark(', 'ui.setTitleMark(', 1],
    ['addFiles(t.files);', 'addQueued(pageFiles(t.files));', 1],
    ['addFiles(files);', 'addQueued(pageFiles(files));', 1],
  ],
};
```

- [ ] **Step 5: Extract `video-duration.ts`**

```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ printf "import { mp4Duration } from '../chapters';\n\n// @port-begin\n"; port video-duration
  printf '// @port-end\n\nexport { videoDuration };\n'; } > lib/studio/video-duration.ts
```
Types: `videoDurationOnce(file: Blob, wait: number): Promise<number>`, `videoDuration(file: Blob): Promise<number>`, `const done = (d: number) =>`.

- [ ] **Step 6: Extract `queue-runner.ts`**

Write the head to `/tmp/qr-head.ts`, the middle to `/tmp/qr-mid.ts`, the tail to `/tmp/qr-tail.ts` exactly as below, then assemble.

Head:
```ts
import { parseUploadPct } from '../activity';
import { checkTracklist } from '../chapters';
import { DESC_MAX, IMG_EXT, SCHEDULE_MIN_LEAD, TITLE_MAX, TXT_EXT, VIDEO_EXT } from '../constants';
import { L, locale } from '../i18n';
import { visLabels } from '../presets';
import { makeTitle, pad, renderDesc, renderDescFull, renderTags } from '../template';
import { detailsOpen, fillDetails, getDialog, getTitleBox, isVisible, sleep, uploadDialogOpen, waitFor } from './automation';
import { buildVars, chanLabel, channelProblem, getChannel } from './channel';
import { ui } from './page-ui';
import { dropFiles, getQueueFile, pageFiles } from './queue-files';
import { setSchedule } from './schedule';
import { SEL } from './sel';
import { activeId, counters, load, presetById, presets, save, saveSettings, settings } from './state';
import { TXT } from './txt';
import {
  ackNoticeDialogs, closeAfterDialogs, closeStudioUploadDialog, dialogError, goToVisibility, injectingFile,
  injectUploadFile, openFilePicker, setThumbnail, thumbUnusable, uploadProgressText,
} from './upload-dialog';
import { videoDuration } from './video-duration';

export type FileSrc = 'bridge' | 'page';
export interface FileMeta { name: string; size: number; type: string }
export interface FileRef extends FileMeta { id: string; src: FileSrc }
// A File handed to addFiles(), tagged with its item / file-store id and where it lives.
export type QFile = File & { qid: string; src: FileSrc };
export const fileMeta = (f: File): FileMeta => ({ name: f.name, size: f.size, type: f.type });

export type ItemStatus = 'pending' | 'uploading' | 'review' | 'done' | 'error';
// One upload history row ('uploads', newest first, at most 1000).
export interface UploadRecord {
  date: string; channel: string; channelName: string; videoId: string; title: string; file: string; size: number;
  txt: string; description: string; publishAt: number | null; visibility: string;
}
// A queue item as stored in chrome.storage.local ('queue'). The userscript kept the File
// itself in `file` / `thumb`; here they hold name / size / type (plus the thumbnail's
// own id), and the File is fetched by id when the item uploads.
export interface QueueItem {
  id: string; // crypto.randomUUID(): also the file-store key, so it must stay unguessable
  src: FileSrc;
  file: FileMeta;
  presetId: string;
  n: number;
  title: string;
  titleEdited: boolean;
  status: ItemStatus;
  msg: string;
  txt: string;
  txtName: string;
  thumb: FileRef | null;
  duration: number;
  durState?: 'loading' | 'ok' | 'fail';
  prev?: UploadRecord | null; // the same file was uploaded to this channel before
  artists?: string;
  artistsEdited?: boolean;
  publishAt?: number | null;
  publishEdited?: boolean;
  publishFinal?: number;
  draftId?: string;
  videoId?: string;
}

// Scheduled videos already on the channel come from the copyright module's youtubei
// calls (Phase 4). Until it sets these hooks the queue only avoids its own items — what
// the userscript did when that module was missing.
export interface ClaimsHooks { listScheduled?: () => Promise<{ videoId: string; at: number }[] | null> }
export let Claims: ClaimsHooks | null = null;
export const setClaims = (c: ClaimsHooks | null) => { Claims = c; };

// One Studio tab runs the queue at a time (lib/runner-lock.ts, through the background).
let lock = { acquire: async () => true, release: () => {} };
export const setRunnerLock = (l: typeof lock) => { lock = l; };

// @port-begin
```
Middle:
```ts
// @port-end

export function installIntercept(): void {
  // @port-begin
```
Tail:
```ts
  // @port-end
}

// The drawer's Stop button set this directly.
export const requestStop = () => {
  stopReq = true;
};

const queueRefs = () => queue.flatMap((it) => [{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])]);

// addFiles(), then let go of files no item ended up using: a .txt once read, names that
// matched no video, a thumbnail another one replaced.
export async function addQueued(files: QFile[]): Promise<void> {
  const before = queueRefs();
  await addFiles(files);
  const kept = new Set(queueRefs().map((r) => r.id));
  dropFiles([...files.map((f) => ({ id: f.qid, src: f.src })), ...before].filter((r) => !kept.has(r.id)));
}

// What the userscript's start dialog showed (runQueue's ask()), as data: the side panel
// shows it and answers with queue:start(true).
export interface StartSummary {
  pendingN: number;
  channel: { id: string; name: string; avatar: string };
  times: number[]; // release times, earliest first; empty = released per preset
  vis: string; // the presets' visibilities
  noTxt: number;
  noThumb: number;
  badTime: { name: string; at: number }[];
  prevUp: { name: string; title: string }[];
  badTl: { name: string; error: string }[];
  needsConfirm: boolean;
}

export async function startSummary(): Promise<StartSummary | { error: string }> {
  const pendingN = queue.filter((i) => i.status === 'pending').length;
  if (!pendingN) return { error: L('ไม่มีคลิปที่รอคิว', 'No videos waiting in the queue') };
  const problem = channelProblem();
  if (problem) return { error: '⛔ ' + problem };
  assignNumbers();
  ui.queue();
  const pendingItems = queue.filter((i) => i.status === 'pending');
  const badTl = pendingItems.filter((i) => i.txt).map((i) => [i, itemTracklist(i)] as const).filter(([, tc]) => tc.errors.length);
  const badTime = pendingItems.filter((i) => scheduleProblem(itemPublishAt(i)));
  const prevUp = pendingItems.filter((i) => i.prev);
  await refreshChanSched(true);
  const ch = getChannel();
  return {
    pendingN,
    channel: { id: ch.id, name: chanLabel(ch), avatar: ch.avatar },
    times: pendingItems.map(itemPublishAt).filter((t): t is number => !!t).sort((a, b) => a - b),
    vis: [...new Set(pendingItems.map((i) => presetById(i.presetId).visibility || 'PRIVATE'))].join(', '),
    noTxt: pendingItems.filter((i) => !i.txt).length,
    noThumb: settings.thumb ? pendingItems.filter((i) => !i.thumb).length : 0,
    badTime: badTime.map((i) => ({ name: i.file.name, at: itemPublishAt(i) ?? 0 })),
    prevUp: prevUp.map((i) => ({ name: i.file.name, title: i.prev?.title || i.prev?.videoId || '' })),
    badTl: badTl.map(([i, tc]) => ({ name: i.file.name, error: tc.errors[0] ?? '' })),
    needsConfirm: !!(settings.confirmStart || badTl.length || badTime.length || prevUp.length),
  };
}

export {
  uploadProg, pollUploadProgress, queue, running, stopReq, uploadBusy, STATUS, isVideo, isTxt, isImg, baseKey, readText,
  saveMemo, restoreMemo, addFiles, assignNumbers, scheduleOn, stepMs, itemPublishAt, queueSlots, takenSlots,
  refreshChanSched, effectiveStart, startIsPast, scheduleProblem, fmtWhen, toLocalInput, itemVars, itemTracklist,
  setItem, uploadOne, dialogVideoId, getUploads, logUpload, uploadOf, uploadsCSV, downloadCSV, runQueue,
};
```
Assemble and check:
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat /tmp/qr-head.ts; port queue-runner 1685-1691; port queue-runner 1716-2186; cat /tmp/qr-mid.ts; port queue-runner 2188-2216; cat /tmp/qr-tail.ts; } > lib/studio/queue-runner.ts
node scripts/port-check.mjs queue-runner video-duration
```
Expected: `ok   queue-runner (lib/studio/queue-runner.ts, 422 lines)`, `ok   video-duration (lib/studio/video-duration.ts, 20 lines)`.

- [ ] **Step 7: Add types until `tsc` is clean**

About 100 errors before typing, almost all implicit `any`. In order: `const queue: QueueItem[] = [];`; `let uploadProg: { pct: number | null; text: string } | null = null;`; `let memoTimer: ReturnType<typeof setTimeout> | undefined;`; a `Memo` type `{ title?: string; artists?: string; publishAt?: number; presetId?: string; t: number }` for `load<Record<string, Memo>>('queueMemo', {})`; `const chanSched: { ch: string; at: number; list: { videoId: string; at: number }[]; loading: Promise<void> | null } = …`; `addFiles(fileList: ArrayLike<QFile>)`, `const it: QueueItem = {…}`; `itemPublishAt(it: QueueItem): number | null`; `queueSlots()`'s `new Map<QueueItem, number>()`; in `runQueue` the tracklist pairs as `[i, itemTracklist(i)] as const`; `catch (e: any)` in the run loop; `setThumbnail(thumbFile!, 3000)`; `presetById(i.presetId).visibility` is typed already; `getUploads = () => load<UploadRecord[]>('uploads', [])`; `logUpload(rec: Omit<UploadRecord, 'date' | 'channel' | 'channelName'>)`; `downloadCSV(rows: unknown[][], name: string)`; in the two interceptors type the listener parameter as `(e: any) =>` (rule 3: they read `e.target.files`, `e.target.closest?.(…)`, `e.dataTransfer?.files`), which needs no substitution.

Run: `npx tsc --noEmit && node scripts/port-check.mjs queue-runner video-duration`
Expected: clean; both `ok`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/queue-files.test.ts tests/queue-runner.test.ts && npm run check`
Expected: **5** + **9** tests pass; full suite **278**; `tsc` clean.

- [ ] **Step 9: Commit**

```bash
git add extension/scripts/port/video-duration.mjs extension/scripts/port/queue-runner.mjs extension/lib/studio/video-duration.ts extension/lib/studio/page-ui.ts extension/lib/studio/queue-files.ts extension/lib/studio/queue-runner.ts extension/lib/messages.ts extension/entrypoints/background.ts extension/tests/queue-files.test.ts extension/tests/queue-runner.test.ts
git commit -m "Port the upload queue runner behind a PageUi port; Files by item id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Manual fill and the quick-action bars

**Files:**
- Create: `extension/scripts/port/manual-fill.mjs`, `extension/scripts/port/quick-actions.mjs`, `extension/lib/studio/manual-fill.ts`, `extension/lib/studio/quick-actions.ts`

**Interfaces:**
- Produces: `lib/studio/manual-fill.ts`: `export let session`, `applyToOpenDialog(): Promise<void>`, `installManualFill(): void` (the 1 s auto-fill poller). `lib/studio/quick-actions.ts`: `installQuickActions(): void` (the 1 s poller that places the bars). The bars are hosts `div.ytp-qa` inserted after `ytcp-video-title` / `ytcp-video-description`, each with an open shadow root holding the userscript's bar and stylesheet (`html[dark]` rules become `:host-context(html[dark])`). Copy buttons use `navigator.clipboard.writeText` (a click is a user gesture on the Studio page; no new permission).

- [ ] **Step 1: Configs**

`extension/scripts/port/manual-fill.mjs`:
```js
// lib/studio/manual-fill.ts ← "โหมดอัปโหลดเองทีละไฟล์: เติมข้อมูลอัตโนมัติ"
export default {
  file: 'lib/studio/manual-fill.ts',
  regions: ['2218-2238', '2240-2256'],
  subs: [
    ['toast(', 'ui.toast(', 3],
    ['renderPresetPreview();', 'ui.presetPreview();', 1],
  ],
};
```
`extension/scripts/port/quick-actions.mjs`:
```js
// lib/studio/quick-actions.ts ← "ปุ่มลัดใต้ช่องชื่อ/คำอธิบายของ Studio"; the bars now live in Shadow DOM
export default {
  file: 'lib/studio/quick-actions.ts',
  regions: ['2258-2384', '2386-2402', '2404-2418'],
  subs: [
    ['GM_setClipboard(normText(getTitleBox(host)?.textContent));', 'void navigator.clipboard.writeText(normText(getTitleBox(host)?.textContent)).catch(() => {});', 1],
    ["GM_setClipboard(getDescBox(host)?.innerText || '');", "void navigator.clipboard.writeText(getDescBox(host)?.innerText || '').catch(() => {});", 1],
    ['GM_addStyle(`', 'const QA_CSS = (`', 1],
    ['html[dark] ', ':host-context(html[dark]) ', 8],
    ['tEl.after(qaTitleBar(host));', 'tEl.after(qaHost(qaTitleBar(host)));', 1],
    ['dEl.after(qaDescBar(host));', 'dEl.after(qaHost(qaDescBar(host)));', 1],
  ],
};
```

- [ ] **Step 2: Extract**

```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { normText } from '../collab';
import { L } from '../i18n';
import { makeTitle, renderDesc, renderTags } from '../template';
import { detailsOpen, fillDetails, getDetailsHost, getDialog, getTitleBox, onEditPage, sleep, uploadDialogOpen, waitFor } from './automation';
import { buildVars, channelProblem } from './channel';
import { ui } from './page-ui';
import { running } from './queue-runner';
import { active, counters, save, settings } from './state';
import { goToVisibility } from './upload-dialog';

// @port-begin
EOF
port manual-fill 2218-2238
cat <<'EOF'
// @port-end

export function installManualFill(): void {
  // @port-begin
EOF
port manual-fill 2240-2256
cat <<'EOF'
  // @port-end
}

export { session, applyToOpenDialog };
EOF
} > lib/studio/manual-fill.ts
{ cat <<'EOF'
import { checkTracklist, fixChapters } from '../chapters';
import { normText } from '../collab';
import { DESC_MAX, TITLE_MAX } from '../constants';
import { L } from '../i18n';
import { makeTitle, renderDesc, renderTags } from '../template';
import { fillDetails, getDescBox, getDetailsHost, getDialog, getTitleBox, isVisible, onEditPage, setEditable, setTags } from './automation';
import { buildVars } from './channel';
import { h, icon } from './dom';
import { session } from './manual-fill';
import { readText, running, uploadOf } from './queue-runner';
import { activeId, counters, presetById, presets, settings } from './state';

// @port-begin
EOF
port quick-actions 2258-2402
cat <<'EOF'
// @port-end

// Each bar sits right after Studio's field, inside a shadow root so Studio's CSS and
// ours stay apart. The host keeps the `ytp-qa` class the code above looks for.
function qaHost(bar: HTMLElement): HTMLElement {
  const host = h('div', { className: 'ytp-qa' });
  host.attachShadow({ mode: 'open' }).append(h('style', {}, QA_CSS), bar);
  return host;
}

export function installQuickActions(): void {
  // @port-begin
EOF
port quick-actions 2404-2418
cat <<'EOF'
  // @port-end
}
EOF
} > lib/studio/quick-actions.ts
node scripts/port-check.mjs manual-fill quick-actions
```
Expected: `ok   manual-fill (lib/studio/manual-fill.ts, 35 lines)`, `ok   quick-actions (lib/studio/quick-actions.ts, 146 lines)`.

- [ ] **Step 3: Add types until `tsc` is clean**

Specifics: `let session: { originalName: string; n: number } | null = null;`; `const qa = { presetId: '', txt: '', txtName: '', key: '' };` is inferred; host params `host: HTMLElement`; `qaSay(bar: HTMLElement & { _t?: ReturnType<typeof setTimeout> }, text: string, kind = '', undo: (() => void) | null = null)`; handlers `(e: any) =>` (they read `e.target.value` / `e.target.files`, rule 3); `qaBtn(ic: string, label: string, title: string, onclick: () => void)`.

Run: `npx tsc --noEmit && node scripts/port-check.mjs manual-fill quick-actions && npm run check`
Expected: clean; both `ok`; full suite still **278**.

- [ ] **Step 4: Commit**

```bash
git add extension/scripts/port/manual-fill.mjs extension/scripts/port/quick-actions.mjs extension/lib/studio/manual-fill.ts extension/lib/studio/quick-actions.ts
git commit -m "Port manual fill and the quick-action bars (Shadow DOM)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire it up — persistence, panel messages, dev trigger, exit check

**Files:**
- Create: `extension/lib/studio/queue-store.ts`, `extension/lib/studio/queue-ops.ts`, `extension/lib/studio/content-ui.ts`
- Modify: `extension/lib/messages.ts` (final), `extension/entrypoints/studio.content.ts` (final), `extension/entrypoints/sidepanel/index.html`, `extension/entrypoints/sidepanel/main.ts`
- Delete: `extension/lib/studio/inject-spike.ts`
- Test: `extension/tests/queue-store.test.ts`, `extension/tests/queue-ops.test.ts`

**Interfaces:**
- Produces:
  - `lib/studio/queue-store.ts`: `persistQueue(): void` (300 ms debounce → `save('queue', queue)`), `restoreQueue(markInterrupted: boolean): void` (items left `uploading`/`review` by a reload come back as `error` with "The page reloaded during the upload — check Content for a leftover draft, then retry"; afterwards follows external changes unless this tab is running), `installUnloadGuard(): void` (asks before leaving only while running or while page-sourced files are pending/error).
  - `lib/studio/queue-ops.ts`: `stopQueue()`, `removeItem(id)`, `retryItem(id)`, `clearDone()` — the queue tab's buttons.
  - `lib/studio/content-ui.ts`: `createContentUi(): PageUi & { setConfirmed(v: boolean): void; tick(): void }`.
  - Final `ProtocolMap` (below): side panel → content `queue:add(ids)`, `queue:preflight(): StartSummary | { error }`, `queue:start(confirmed)`, `queue:stop`, `queue:retry(id)`, `queue:remove(id)`, `queue:clearDone`, `fill:apply`, `diag:dialogInfo`; content → panel broadcasts `queue:state(QueueState)`, `queue:toast(msg)`; `spike:inject` removed.
  - Without a panel nothing listens for the broadcasts; sends fail silently.

- [ ] **Step 1: Write the failing tests**

`extension/tests/queue-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SCHEMA_VERSION } from '../lib/migrations';
import { queue, type QueueItem } from '../lib/studio/queue-runner';
import { persistQueue, restoreQueue } from '../lib/studio/queue-store';
import { flushState, initState } from '../lib/studio/state';

const item = (name: string, status: QueueItem['status'], extra: Partial<QueueItem> = {}): QueueItem => ({
  id: 'id-' + name, src: 'bridge', file: { name, size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});

beforeEach(async () => {
  fakeBrowser.reset();
  queue.splice(0);
  await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
});
afterEach(() => vi.useRealTimers());

describe('queue store', () => {
  it('restores the stored queue; an interrupted upload comes back as an error', async () => {
    await browser.storage.local.set({ queue: [item('A.mp4', 'done'), item('B.mp4', 'uploading', { draftId: 'abcdefghijk' }), item('C.mp4', 'pending')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    expect(queue.map((i) => i.status)).toEqual(['done', 'error', 'pending']);
    expect(queue[1]!.msg).toBe('The page reloaded during the upload — check Content for a leftover draft, then retry (abcdefghijk)');
  });

  it("leaves another tab's running upload alone", async () => {
    await browser.storage.local.set({ queue: [item('B.mp4', 'uploading')] });
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(false);
    expect(queue[0]!.status).toBe('uploading');
  });

  it('writes changes back, a moment later', async () => {
    vi.useFakeTimers();
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    queue.push(item('A.mp4', 'pending'));
    persistQueue();
    vi.advanceTimersByTime(300);
    await flushState();
    expect((await browser.storage.local.get('queue')).queue).toEqual([item('A.mp4', 'pending')]);
  });

  it('follows changes from elsewhere', async () => {
    await initState(async () => SCHEMA_VERSION);
    restoreQueue(true);
    await browser.storage.local.set({ queue: [item('Z.mp4', 'pending')] });
    expect(queue.map((i) => i.file.name)).toEqual(['Z.mp4']);
  });
});
```

`extension/tests/queue-ops.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as messages from '../lib/messages';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { clearDone, removeItem, retryItem, stopQueue } from '../lib/studio/queue-ops';
import * as Q from '../lib/studio/queue-runner';

const calls: string[] = [];
const ui = {
  item: () => {}, run: () => {}, queue: () => void calls.push('queue'), schedule: () => {}, presetPreview: () => {},
  toast: (m: string) => void calls.push(`toast:${m}`), openDrawer: () => {}, notifyDone: () => {}, setTitleMark: () => {},
  confirmStart: async () => false,
} satisfies PageUi;

const item = (id: string, status: Q.QueueItem['status'], extra: Partial<Q.QueueItem> = {}): Q.QueueItem => ({
  id, src: 'bridge', file: { name: id + '.mp4', size: 1, type: '' }, presetId: 'trapsoul', n: 0, title: '',
  titleEdited: false, status, msg: '', txt: '', txtName: '', thumb: null, duration: 0, ...extra,
});

beforeEach(() => {
  vi.restoreAllMocks();
  setPageUi(ui);
  calls.length = 0;
  Q.queue.splice(0);
});

describe('queue ops', () => {
  it('stop asks the run to end after the current video', () => {
    stopQueue();
    expect(Q.stopReq).toBe(true);
    expect(calls).toEqual(['toast:Will stop after the current video finishes']);
  });

  it('remove takes the item out and lets its files go', () => {
    const send = vi.spyOn(messages, 'sendMessage').mockResolvedValue(undefined);
    Q.queue.push(item('a', 'pending', { thumb: { id: 't', src: 'bridge', name: 'a.jpg', size: 1, type: '' } }), item('b', 'pending'));
    removeItem('a');
    expect(Q.queue.map((i) => i.id)).toEqual(['b']);
    expect(send).toHaveBeenCalledWith('files:delete', ['a', 't']);
    expect(calls).toEqual(['queue']);
  });

  it('retry puts a failed item back in line without its draft id', () => {
    Q.queue.push(item('a', 'error', { draftId: 'abcdefghijk' }));
    retryItem('a');
    expect(Q.queue[0]).toMatchObject({ status: 'pending', draftId: '' });
  });

  it('clear done removes finished items only', () => {
    Q.queue.push(item('a', 'done'), item('b', 'error'), item('c', 'done'));
    clearDone();
    expect(Q.queue.map((i) => i.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/queue-store.test.ts tests/queue-ops.test.ts`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: `queue-store.ts`, `queue-ops.ts`, `content-ui.ts`**

`extension/lib/studio/queue-store.ts`:
```ts
import { L } from '../i18n';
import { queue, running, type QueueItem } from './queue-runner';
import { load, onStored, save } from './state';

// The queue's items live in chrome.storage.local ('queue') so they survive reloads and
// channel switches; Files are fetched again by id when an item uploads.
const KEY = 'queue';
let timer: ReturnType<typeof setTimeout> | undefined;

export function persistQueue(): void {
  clearTimeout(timer);
  timer = setTimeout(() => save(KEY, queue), 300);
}

// A reload ends a run: an item that was uploading or waiting for Save may have left a
// draft in Studio, so it comes back as an error the user retries on purpose.
const interrupted = (it: QueueItem): QueueItem => ({
  ...it,
  status: 'error',
  msg: L('หน้าโหลดใหม่ระหว่างอัปโหลด — ดูใน Content ว่ามีฉบับร่างค้างไหม แล้วค่อยกดลองใหม่', 'The page reloaded during the upload — check Content for a leftover draft, then retry')
    + (it.draftId ? ` (${it.draftId})` : ''),
});

// markInterrupted is false while another Studio tab holds the runner lock: its item
// really is still uploading.
export function restoreQueue(markInterrupted: boolean): void {
  const items = load<QueueItem[]>(KEY, []);
  queue.splice(0, queue.length, ...items.map((it) => (markInterrupted && (it.status === 'uploading' || it.status === 'review') ? interrupted(it) : it)));
  // Another tab (or, in Phase 3, the side panel) changed the queue. The tab that is
  // running keeps its own copy: it is the one moving items along.
  onStored(KEY, (v) => {
    if (!running) queue.splice(0, queue.length, ...((v as QueueItem[] | undefined) ?? []));
  });
}

// The userscript asked before leaving whenever the queue had files, because the Files
// lived in the page. Now a reload only loses a run in progress and files picked in
// Studio's own upload dialog.
export function installUnloadGuard(): void {
  window.addEventListener('beforeunload', (e) => {
    if (running || queue.some((i) => (i.status === 'pending' || i.status === 'error') && i.src === 'page')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
```

`extension/lib/studio/queue-ops.ts`:
```ts
import { L } from '../i18n';
import { ui } from './page-ui';
import { dropFiles } from './queue-files';
import { assignNumbers, queue, requestStop, setItem, type QueueItem } from './queue-runner';

// What the userscript's queue tab buttons did to the queue (UI section "แท็บคิว",
// 3739–3800), without the drawer: the side panel sends these as messages.
const refsOf = (it: QueueItem) => [{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])];

export function stopQueue(): void {
  requestStop();
  ui.toast(L('จะหยุดหลังคลิปปัจจุบันเสร็จ', 'Will stop after the current video finishes'));
}

export function removeItem(id: string): void {
  const i = queue.findIndex((it) => it.id === id);
  if (i < 0) return;
  const [it] = queue.splice(i, 1);
  dropFiles(refsOf(it!));
  ui.queue();
}

// The panel asks first when the item left a draft in Studio (the userscript's ask()).
export function retryItem(id: string): void {
  const it = queue.find((x) => x.id === id);
  if (!it || it.status !== 'error') return;
  it.draftId = '';
  setItem(it, 'pending');
  assignNumbers();
  ui.queue();
}

export function clearDone(): void {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.status === 'done') queue.splice(i, 1);
  ui.queue();
}
```

`extension/lib/studio/content-ui.ts`:
```ts
import { L } from '../i18n';
import { sendMessage, type QueueState } from '../messages';
import { beep, setTitleMark } from './page-notify';
import { pageToast } from './page-toast';
import type { PageUi } from './page-ui';
import { dropFiles } from './queue-files';
import { pollUploadProgress, queue, running, stopReq, uploadProg } from './queue-runner';
import { persistQueue } from './queue-store';
import { settings } from './state';

// The PageUi the Studio content script runs with. What the userscript's drawer did is
// split three ways: the page keeps the tab-title mark, the sound and a toast; the queue
// is saved for the side panel to read; and a small live state is broadcast to it.
export function createContentUi() {
  let confirmed = false;
  let rev = 0;
  let last = '';
  const released = new Set<string>();
  const broadcast = () => {
    const s: QueueState = { running, stopping: running && stopReq, prog: uploadProg, rev };
    const sig = JSON.stringify(s);
    if (sig === last) return;
    last = sig;
    sendMessage('queue:state', s).catch(() => {}); // fails when no side panel is open
  };
  const changed = () => {
    rev++;
    persistQueue();
    broadcast();
  };
  const ui: PageUi & { setConfirmed(v: boolean): void; tick(): void } = {
    item(it) {
      // A finished item's files are no longer needed (spec: File intake, step 5).
      if (it.status === 'done' && !released.has(it.id)) {
        released.add(it.id);
        dropFiles([{ id: it.id, src: it.src }, ...(it.thumb ? [it.thumb] : [])]);
      }
      changed();
    },
    run() {
      // updateRunUI()'s one effect on the page: "(3/10) ⬆" in the tab title while running.
      const count = (s: string) => queue.filter((i) => i.status === s).length;
      const total = queue.length;
      if (running) setTitleMark(`(${Math.min(count('done') + count('error') + 1, total)}/${total}) ⬆`);
      changed();
    },
    queue: changed,
    schedule: changed,
    presetPreview: changed,
    toast(msg) {
      console.info('[ytup]', msg);
      pageToast(msg);
      sendMessage('queue:toast', msg).catch(() => {});
    },
    openDrawer() {
      sendMessage('openPanel', undefined).catch(() => {}); // needs a user gesture; best effort
    },
    notifyDone(title, text, ok = true) {
      if (!settings.notify) return;
      beep(ok);
      sendMessage('notify', { title, text, focused: document.hasFocus() }).catch((e) => console.warn('[ytup] notify', e));
    },
    setTitleMark,
    async confirmStart() {
      const ok = confirmed;
      confirmed = false;
      if (!ok) ui.toast(L('ยืนยันการอัปโหลดในแผงด้านข้างก่อน', 'Confirm the upload in the side panel first'));
      return ok;
    },
    setConfirmed(v) {
      confirmed = v;
    },
    // Every 0.8 s, like the userscript's progress tick.
    tick() {
      pollUploadProgress();
      broadcast();
    },
  };
  return ui;
}
```

- [ ] **Step 4: Final messages**

Replace `extension/lib/messages.ts` with:
```ts
import { defineExtensionMessaging } from '@webext-core/messaging';
import type { StartSummary } from './studio/queue-runner';

// What the side panel needs to follow a run live; the items themselves are in
// chrome.storage.local ('queue'). `rev` goes up whenever the page changed something the
// panel shows (items, numbering, schedule, counters), so the panel knows to re-read.
export interface QueueState {
  running: boolean;
  stopping: boolean;
  prog: { pct: number | null; text: string } | null;
  rev: number;
}

export interface QueueDoneNote { title: string; text: string; focused: boolean }

export type ProtocolMap = {
  // content → background
  openPanel(): void;
  ensureMigrated(): number;
  'files:delete'(ids: string[]): void;
  notify(n: QueueDoneNote): void;
  'runner:acquire'(): boolean;
  'runner:release'(): void;
  'runner:elsewhere'(): boolean;
  // side panel → content (the Studio tab)
  'queue:add'(ids: string[]): void;
  'queue:preflight'(): StartSummary | { error: string };
  'queue:start'(confirmed: boolean): void;
  'queue:stop'(): void;
  'queue:retry'(id: string): void;
  'queue:remove'(id: string): void;
  'queue:clearDone'(): void;
  'fill:apply'(): void;
  'diag:dialogInfo'(): unknown;
  // content → side panel (broadcast; nobody listens while the panel is closed)
  'queue:state'(s: QueueState): void;
  'queue:toast'(msg: string): void;
  // developer tools in the Phase 0 panel (removed with it in Phase 3)
  'spike:cfg'(): Record<string, unknown>;
  'dev:switchChannel'(t: { handle: string; next: string }): void;
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

- [ ] **Step 5: Final Studio content script; delete the spike injector**

```bash
git rm extension/lib/studio/inject-spike.ts
```
Replace `extension/entrypoints/studio.content.ts` with:
```ts
import { createChannelSwitch } from '@/lib/channel-switch';
import { createFileBridge } from '@/lib/file-bridge-client';
import { initI18n, L } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { createSyncStore } from '@/lib/sync-store';
import { refreshCfg } from '@/lib/studio/channel';
import { createContentUi } from '@/lib/studio/content-ui';
import { applyToOpenDialog, installManualFill } from '@/lib/studio/manual-fill';
import { installTitleMark } from '@/lib/studio/page-notify';
import { setPageUi } from '@/lib/studio/page-ui';
import { installQuickActions } from '@/lib/studio/quick-actions';
import { bridgeFiles, setBridge } from '@/lib/studio/queue-files';
import { clearDone, removeItem, retryItem, stopQueue } from '@/lib/studio/queue-ops';
import { addQueued, installIntercept, runQueue, setRunnerLock, startSummary } from '@/lib/studio/queue-runner';
import { installUnloadGuard, restoreQueue } from '@/lib/studio/queue-store';
import { initState } from '@/lib/studio/state';
import { diagnoseUploadDialog } from '@/lib/studio/upload-dialog';

// Spike FAB: tests whether a page click may open the side panel.
function mountFab() {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const b = document.createElement('button');
  b.textContent = 'UP';
  b.title = 'Open YouTube Upload Presets';
  b.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:44px;height:44px;border-radius:50%;border:0;background:#111;color:#fff;font:600 12px system-ui;cursor:pointer';
  b.onclick = () => {
    sendMessage('openPanel', undefined).catch((e) => console.warn('[ytup] openPanel failed', e));
  };
  root.append(b);
  document.documentElement.append(host);
}

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  async main() {
    await initI18n();

    // The same watchers as on www.youtube.com: invite links can land on Studio, and the
    // post-switch "Oops" recovery runs here.
    const env = browserEnv(await createSyncStore(INVITE_KEYS));
    const sw = createChannelSwitch(env);
    sw.watchChannelSwitcher();
    sw.recoverAfterSwitch();
    const invite = createInviteWatcher(env);
    invite.watchInvite();
    invite.armSpaPoll();
    onMessage('dev:switchChannel', ({ data }) => sw.switchToChannel({ handle: data.handle }, data.next));

    const main = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH);
    const readCfg = (keys: string[]) => main('getCfg', keys);
    onMessage('spike:cfg', () => readCfg(['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']));
    mountFab();

    try {
      await initState();
    } catch (e) {
      console.error('[ytup] page automation is off:', e);
      return;
    }
    await refreshCfg(readCfg);

    setBridge(createFileBridge(document));
    const ui = createContentUi();
    setPageUi(ui);
    setRunnerLock({
      acquire: () => sendMessage('runner:acquire', undefined).catch((e) => (console.error('[ytup] runner lock', e), false)),
      release: () => void sendMessage('runner:release', undefined).catch(() => {}),
    });
    const elsewhere = () => sendMessage('runner:elsewhere', undefined).catch(() => false);
    // A reload in the middle of a run leaves this tab's lock behind.
    await sendMessage('runner:release', undefined).catch(() => {});
    restoreQueue(!(await elsewhere()));

    // While another tab runs the queue, its writes would overwrite ours.
    const mayEdit = async () => {
      if (!(await elsewhere())) return true;
      ui.toast(L('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', 'Another Studio tab is running the queue — change the queue there'));
      return false;
    };
    onMessage('queue:add', async ({ data: ids }) => {
      if (!(await mayEdit())) return;
      const { files, failed } = await bridgeFiles(ids);
      if (failed.length) ui.toast(L(`เพิ่มไม่ได้ ${failed.length} ไฟล์: `, `Could not add ${failed.length} file(s): `) + failed[0]!.reason);
      if (files.length) await addQueued(files);
    });
    onMessage('queue:preflight', async () => {
      await refreshCfg(readCfg);
      return startSummary();
    });
    onMessage('queue:start', async ({ data: confirmed }) => {
      await refreshCfg(readCfg);
      ui.setConfirmed(confirmed);
      void runQueue(); // a run can take hours: answer now, report through queue:state
    });
    onMessage('queue:stop', () => stopQueue());
    onMessage('queue:retry', async ({ data: id }) => {
      if (await mayEdit()) retryItem(id);
    });
    onMessage('queue:remove', async ({ data: id }) => {
      if (await mayEdit()) removeItem(id);
    });
    onMessage('queue:clearDone', async () => {
      if (await mayEdit()) clearDone();
    });
    onMessage('fill:apply', () => applyToOpenDialog());
    onMessage('diag:dialogInfo', () => diagnoseUploadDialog());

    installIntercept();
    installManualFill();
    installQuickActions();
    installTitleMark();
    installUnloadGuard();
    setInterval(() => {
      try {
        ui.tick();
      } catch (e) {
        console.error('[ytup] progress', e);
      }
    }, 800);
  },
});
```

- [ ] **Step 6: The developer panel becomes the Phase 2 dev trigger**

Replace `extension/entrypoints/sidepanel/index.html` with:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>YouTube Upload Presets</title>
  </head>
  <body style="font: 13px system-ui; background: #111; color: #eee; margin: 12px">
    <h1 style="font-size: 15px">Upload Presets — developer panel</h1>
    <div id="drop" style="border: 2px dashed #555; border-radius: 10px; padding: 28px; text-align: center">
      Drop video / image / .txt files here
    </div>
    <p>
      <button id="cfg">Read ytcfg</button>
      <button id="regrant">Re-grant access</button>
      <button id="add">Add all to queue</button>
    </p>
    <ul id="files"></ul>
    <h2 style="font-size: 14px">Queue <span id="state" style="font-weight: 400; color: #aaa"></span></h2>
    <p>
      <button id="start">Start…</button>
      <button id="stop">Stop</button>
      <button id="clear">Clear done</button>
      <button id="fill">Apply preset to open dialog</button>
      <button id="diag">Dialog info</button>
    </p>
    <ol id="queue"></ol>
    <p>
      <input id="handle" placeholder="@handle" style="width: 140px" />
      <button id="switch">Switch channel</button>
    </p>
    <pre id="log" style="white-space: pre-wrap; font: 12px ui-monospace, monospace"></pre>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```
Replace `extension/entrypoints/sidepanel/main.ts` with:
```ts
import { browser } from 'wxt/browser';
import { deleteHandle, getHandle, listIds, putHandle } from '@/lib/file-store';
import { onMessage, sendMessage } from '@/lib/messages';
import type { QueueItem } from '@/lib/studio/queue-runner';

// Developer panel (Phase 0 spike, extended in Phase 2): drives the Studio tab's queue
// runner by message until the real side panel arrives in Phase 3. Exempt from L().
export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
export const log = (msg: string) => {
  $('#log').textContent = `${new Date().toLocaleTimeString()} ${msg}\n${$('#log').textContent}`;
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const button = (label: string, onclick: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = onclick;
  return b;
};

export async function studioTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('no active tab');
  return tab.id;
}
// Send to the Studio tab and log what happened.
async function toStudio(what: string, send: (tabId: number) => Promise<unknown>) {
  try {
    const r = await send(await studioTabId());
    if (r !== undefined) log(`${what}: ${JSON.stringify(r, null, 1)}`);
  } catch (e) {
    log(`${what}: ERROR ${errText(e)}`);
  }
}
const storedQueue = async () => ((await browser.storage.local.get('queue')) as { queue?: QueueItem[] }).queue ?? [];

$('#cfg').addEventListener('click', () => toStudio('ytcfg', (t) => sendMessage('spike:cfg', undefined, t)));

// Stored file handles (their keys become queue item ids).
async function renderFiles() {
  const list = $('#files');
  list.replaceChildren();
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (!h) continue;
    const li = document.createElement('li');
    li.textContent = `${h.name} · ${await h.queryPermission({ mode: 'read' })} `;
    li.append(button('Forget', async () => { await deleteHandle(id); await renderFiles(); }));
    list.append(li);
  }
}

const drop = $('#drop');
drop.addEventListener('dragover', (e) => e.preventDefault());
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  // getAsFileSystemHandle() must be called synchronously inside the drop event
  const pending = [...(e.dataTransfer?.items ?? [])]
    .filter((i) => i.kind === 'file')
    .map((i) => i.getAsFileSystemHandle());
  for (const h of await Promise.all(pending)) {
    if (h?.kind !== 'file') continue;
    await putHandle(crypto.randomUUID(), h as FileSystemFileHandle);
    log(`stored handle: ${h.name}`);
  }
  await renderFiles();
});

$('#regrant').addEventListener('click', async () => {
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (h) log(`${h.name}: ${await h.requestPermission({ mode: 'read' })}`);
  }
  await renderFiles();
});

// Handles no queue item uses yet go to the Studio tab's queue.
$('#add').addEventListener('click', async () => {
  const used = new Set((await storedQueue()).flatMap((it) => [it.id, it.thumb?.id]));
  const ids = (await listIds()).filter((id) => !used.has(id));
  log(`adding ${ids.length} file(s)`);
  await toStudio('queue:add', (t) => sendMessage('queue:add', ids, t));
});

// The confirmation the userscript showed before a run, as plain text.
$('#start').addEventListener('click', () =>
  toStudio('start', async (t) => {
    const s = await sendMessage('queue:preflight', undefined, t);
    if ('error' in s) return s.error;
    const when = s.times.length ? s.times.map((x) => new Date(x).toLocaleString()).join(' → ') : `per preset (${s.vis})`;
    const text = [
      `Upload ${s.pendingN} video(s) to ${s.channel.name} (${s.channel.id})`,
      `Release: ${when}`,
      s.noTxt ? `No .txt: ${s.noTxt}` : '',
      s.noThumb ? `No thumbnail: ${s.noThumb}` : '',
      ...s.badTime.map((x) => `Too soon: ${x.name} ${new Date(x.at).toLocaleString()}`),
      ...s.prevUp.map((x) => `Already uploaded: ${x.name} (${x.title})`),
      ...s.badTl.map((x) => `Tracklist: ${x.name}: ${x.error}`),
    ].filter(Boolean).join('\n');
    if (s.needsConfirm && !confirm(text)) return 'cancelled';
    log(text);
    await sendMessage('queue:start', true, t);
    return 'started';
  }),
);
$('#stop').addEventListener('click', () => toStudio('stop', (t) => sendMessage('queue:stop', undefined, t)));
$('#clear').addEventListener('click', () => toStudio('clear', (t) => sendMessage('queue:clearDone', undefined, t)));
$('#fill').addEventListener('click', () => toStudio('apply', (t) => sendMessage('fill:apply', undefined, t)));
$('#diag').addEventListener('click', () => toStudio('dialog info', (t) => sendMessage('diag:dialogInfo', undefined, t)));
$('#switch').addEventListener('click', () => {
  const handle = $<HTMLInputElement>('#handle').value.trim();
  if (handle) void toStudio('switch', (t) => sendMessage('dev:switchChannel', { handle, next: 'https://studio.youtube.com/' }, t));
});

// The queue as the Studio tab stored it.
async function renderQueue() {
  const list = $('#queue');
  list.replaceChildren();
  for (const it of await storedQueue()) {
    const li = document.createElement('li');
    li.textContent = `${it.file.name} [${it.status}] ${it.title} ${it.msg ? '— ' + it.msg : ''} `;
    if (it.status === 'error') {
      li.append(button('Retry', () => {
        if (it.draftId && !confirm(`Already uploaded as draft ${it.draftId}. Delete it in Content first. Retry?`)) return;
        void toStudio('retry', (t) => sendMessage('queue:retry', it.id, t));
      }));
    }
    li.append(button('Remove', () => void toStudio('remove', (t) => sendMessage('queue:remove', it.id, t))));
    list.append(li);
  }
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.queue) void renderQueue();
});

onMessage('queue:state', ({ data: s }) => {
  const p = s.prog ? ` · ${s.prog.pct === null ? '' : Math.round(s.prog.pct * 100) + '% '}${s.prog.text}` : '';
  $('#state').textContent = `${s.running ? (s.stopping ? 'stopping' : 'running') : 'idle'}${p}`;
});
onMessage('queue:toast', ({ data: msg }) => log(`toast: ${msg}`));

renderFiles();
renderQueue();
```

- [ ] **Step 7: Run every check and build**

Run: `npx vitest run tests/queue-store.test.ts tests/queue-ops.test.ts && npm run check && npm run port-check && npm run build`
Expected: **4** + **4** tests pass; full suite **286**; `tsc` clean; every config `ok`; build succeeds; `grep -rn "spike:inject\|inject-spike" lib entrypoints` prints nothing.

- [ ] **Step 8: Manual Studio check — the Phase 2 exit check (needs the logged-in Chrome profile)**

Reload the unpacked extension; **disable the userscript in Tampermonkey**. Use a test channel. Console filter `[ytup]`.
1. **Real upload, end to end.** Drop on the panel: `Clip 1.mp4`, `Clip 1.txt` (a 3-line tracklist from `0:00`), `Clip 1.jpg` (< 2 MB), `Clip 2.mp4`. Add all to queue → the queue list shows 2 items `[pending]` with titles; the `.txt` handle is forgotten (Files list). Start… → the summary text appears (confirm). Expected: Studio opens the upload dialog by itself, the bridge logs `#1 loaded and connected`, title/description/tags fill, `Clip 1` gets its thumbnail, Monetisation / Ad suitability / Visibility are handled per settings, Save is clicked, the item turns `[done]`, then `Clip 2` runs. Tab title shows `(1/2) ⬆` then `✅` (if the tab isn't focused). A desktop notification "Upload finished ✅" appears when the panel is closed or the tab is unfocused; clicking it focuses the tab. Both videos exist in Content with the right titles.
2. **Scheduling.** Settings: set `schedule: { on: true, start: <tomorrow 08:00>, every: 1, unit: 'day' }` (via DevTools `chrome.storage.local`), queue 2 clips, Start. Expected: both scheduled one day apart; `settings.schedule.start` moves to the slot after the last one.
3. **Reload survival.** Queue 2 clips, reload the Studio tab before Start. Expected: queue still listed `[pending]`; Start works (files come through the bridge again).
4. **Interrupted run.** Start a 2-clip queue, reload Studio while the first uploads. Expected: that item comes back `[error] The page reloaded during the upload — …`; Retry (confirm the draft prompt) re-queues it.
5. **Browser restart → re-grant.** Queue 1 clip, restart Chrome, open Studio + panel, Start. Expected: item errors with "No permission to read this file — click "Re-grant access"…"; Re-grant access → Retry → uploads.
6. **One runner.** Open a second Studio tab, Start there while tab 1 runs. Expected: toast "Another Studio tab is already running the queue".
7. **Intercept.** Open Studio's own upload dialog and pick 2 videos. Expected: the dialog closes, both appear in the queue (`src: page`), Start uploads them. Reloading with them pending asks "Leave site?".
8. **Manual fill.** Upload one file through Studio's own dialog. Expected: the details fill from the active preset by themselves; toast "Details filled in: …".
9. **Quick actions.** On the details page and on `/video/<id>/edit`: the bars appear under title and description (in a shadow root: Elements shows `div.ytp-qa` → `#shadow-root`), dark mode switches their colours, Preset title / Copy / Preset description / Load .txt / Fix chapters / Check chapters / Preset tags / Apply all work, Undo reverts.
10. **Dialog info.** With the details page open, Dialog info logs the diagnostic JSON with `version` = the manifest version.
Record pass/fail per item in the task report; any failure blocks Phase 3.

- [ ] **Step 9: Commit**

```bash
git add extension/lib/studio/queue-store.ts extension/lib/studio/queue-ops.ts extension/lib/studio/content-ui.ts extension/lib/messages.ts extension/entrypoints/studio.content.ts extension/entrypoints/sidepanel extension/tests/queue-store.test.ts extension/tests/queue-ops.test.ts
git commit -m "Run the upload queue from the Studio content script; developer panel drives it

Queue items persist in chrome.storage.local and fetch their Files through the
bridge by id; the run is confirmed in the panel (queue:preflight → queue:start);
one tab runs at a time. Removes the Phase 0 inject spike.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Phase 2 wrap-up

**Files:**
- Modify: `extension/README.md`

- [ ] **Step 1: Document the porting tool and the dev trigger**

In `extension/README.md`, under `## Develop`, add after the code block:
```md
Ported code is checked against the userscript at the pinned commit:
`npm run port-check` (configs in `scripts/port/`; `node scripts/port-check.mjs --print <name>`
prints the code a port starts from).

Until the Phase 3 side panel, the developer panel drives the Studio tab: drop files,
**Add all to queue**, **Start…**. Console lines from the extension start with `[ytup]`.
```
In `## Layout` add:
```md
- `lib/studio/` — page automation ported from the userscript (`port-check` keeps it honest);
  `page-ui.ts` is the seam between the runner and any UI
- `entrypoints/invite.content.ts` — www.youtube.com: channel switcher and invite accept
```

- [ ] **Step 2: Full verification**

From `extension/`: `npm run check && npm run port-check && npm run build`
Expected: 286 tests pass; all 14 configs `ok` (`automation channel channel-switch dom invite manual-fill page-notify queue-runner quick-actions schedule state studio-collab upload-dialog video-duration`); build succeeds.
From the repo root: `node --test test/*.test.mjs` → **144** pass; `git diff --stat d15ef87 -- . ':!extension' ':!docs/superpowers/plans'` → no output.

- [ ] **Step 3: Commit**

```bash
git add extension/README.md
git commit -m "Document port-check and the Phase 2 developer trigger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## What comes next (separate plans)

- **Phase 3:** React side panel. It talks to the runner only through the messages above plus queue edits (title / artists / preset / release time → the content script applies them and calls `saveMemo()` as the userscript's cards did), and a `schedule:taken` query for the channel's scheduled slots. Alt+P / Alt+digit shortcuts, the channel list (`channels` key), the "Reload this tab" banner for an invalidated extension context.
- **Phase 4:** `setClaims({ listScheduled })` from the youtubei module; collab-run (`collabStep`) uses `inviteCollaborators`; `showTracklistFix` in-page dialog.
