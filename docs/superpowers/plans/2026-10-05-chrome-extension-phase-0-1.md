# Chrome Extension — Phase 0 (Spike) + Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the risky parts of the extension design in real Chrome (Phase 0), then stand up the tested, storage-backed core library the later phases build on (Phase 1).

**Architecture:** A WXT (Manifest V3) project in `extension/`. Phase 0 builds the permanent plumbing: side panel scoped to Studio tabs, a small postMessage RPC layer, a MAIN-world `ytcfg` reader, an IndexedDB file-handle store and an extension-origin bridge iframe. Throwaway spike UI drives it. Phase 1 ports the pure logic of the userscript (i18n, storage, presets, migrations, settings, template, chapters, tracklist, activity, collab matching, backup import/export) into typed modules, and ports the existing tests to Vitest.

**Tech Stack:** WXT (pinned), TypeScript (strict), Vitest + `wxt/testing`, `@webext-core/messaging`, `fake-indexeddb`, Node 22, npm.

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md`

**Out of this plan:** Phases 2–5 (page automation, React/shadcn side panel, copyright, cutover). Each gets its own plan after the Phase 0 results are in.

## Global Constraints

- Node ≥ 22 (`node -v` shows v22.22.3 on this machine), npm, every dependency installed with `-E` (exact version).
- All new code lives under `extension/`. **Do not modify** `youtube-upload-presets.user.js`, `test/` or `README.md`'s userscript sections. The userscript keeps shipping until cutover.
- **Port, don't redesign:** the logic in Phase 1 modules must behave exactly like the userscript at commit `79a79357d4aa7101d7ea2bde5bfeede5d8389724` (v4.26.1). Type annotations and the explicit `env` parameter of `buildVars` are the only allowed changes. If the userscript gets a bug fix while this plan is in progress, mirror it in the matching module.
- Every script-authored UI string goes through `L(th, en)`. Tests run in English (the i18n default).
- Manifest permissions, exactly: `sidePanel`, `storage`, `alarms`, `notifications`. Host permissions, exactly: `https://studio.youtube.com/*`, `https://www.youtube.com/*`, `https://api.github.com/*`.
- TypeScript `strict`. New tests are `*.test.ts`. Ported tests are `*.test.mjs` whose bodies are **byte-identical** to the originals in `test/`, except the async rewrite in Task 10. Only the import header changes.
- Run every command from `extension/` unless a step says otherwise.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **Manual Studio checks** (Tasks 3, 6, 7) need a logged-in YouTube Studio session in Chrome. The person running the plan does them, or an agent with browser access to that profile does.

## File Structure

```
extension/
  package.json              scripts, exact deps
  wxt.config.ts             manifest (permissions, hosts, action, web_accessible_resources)
  tsconfig.json             extends .wxt/tsconfig.json
  vitest.config.ts          WxtVitest plugin, tests/**/*
  .gitignore
  entrypoints/
    background.ts           side panel scoping, openPanel, startup migrations
    studio.content.ts       isolated-world Studio script (Phase 0: spike handlers + FAB)
    studio-main.content.ts  MAIN-world: serves getCfg over rpc
    sidepanel/index.html    Phase 0 spike panel (replaced by React in Phase 3)
    sidepanel/main.ts
    file-bridge/index.html  hidden iframe page: file handles → File
    file-bridge/main.ts
  lib/
    panel-scope.ts          isStudioUrl()
    rpc.ts                  request/response over postMessage or MessagePort
    main-ops.ts             MAIN-world channel name + op types
    messages.ts             @webext-core/messaging protocol
    fs-permissions.d.ts     File System Access permission typings
    file-store.ts           IndexedDB {itemId → FileSystemFileHandle}
    file-bridge.ts          channel names, FileOps, readHandle()
    file-bridge-client.ts   mountFileBridge() for the content script
    studio/inject-spike.ts  Phase 0 only: push a File into Studio's upload dialog
    i18n.ts                 L(), lang state, resolveLang(), initI18n()
    storage.ts              load()/save() over chrome.storage.local
    constants.ts            VARS, extensions, limits, visibilities
    studio/txt.ts           TXT table (verbatim)
    studio/sel.ts           SEL table (verbatim)
    collab.ts               pure collab/invite matching
    presets.ts              Preset type, defaultPresets(), visLabels()
    migrations.ts           schema migrations (async)
    settings.ts             Settings type, defaults, loadSettings()
    template.ts             template variables + rendering
    chapters.ts             chapter checks/fixes, mp4Duration()
    tracklist.ts            parseTime(), fixTracklist()
    activity.ts             parseUploadPct(), activityFrom()
    backup.ts               backup parse/apply/build/write
  tests/
    panel-scope.test.ts rpc.test.ts file-store.test.ts file-bridge.test.ts
    i18n.test.ts storage.test.ts settings.test.ts chapters-mp4.test.ts backup.test.ts
    template.test.mjs chapters.test.mjs tracklist.test.mjs activity.test.mjs
    collab.test.mjs migrations.test.mjs        (ported)
docs/superpowers/specs/2026-10-05-spike-results.md   (Task 7)
```

---

# Phase 0 — Spike

### Task 1: Scaffold WXT and scope the side panel to Studio tabs

**Files:**
- Create: `extension/package.json`, `extension/wxt.config.ts`, `extension/tsconfig.json`, `extension/vitest.config.ts`, `extension/.gitignore`
- Create: `extension/lib/panel-scope.ts`, `extension/entrypoints/background.ts`
- Create: `extension/entrypoints/sidepanel/index.html`, `extension/entrypoints/sidepanel/main.ts`
- Test: `extension/tests/panel-scope.test.ts`

**Interfaces:**
- Produces: `isStudioUrl(url?: string): boolean` (`lib/panel-scope.ts`); the `extension/` project with the `npm run check` and `npm run build` scripts every later task uses.

- [ ] **Step 1: Create the project files**

`extension/package.json`:
```json
{
  "name": "youtube-upload-presets-extension",
  "private": true,
  "version": "5.0.0",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "test": "vitest run",
    "check": "tsc --noEmit && vitest run",
    "postinstall": "wxt prepare"
  }
}
```

`extension/wxt.config.ts`:
```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YouTube Upload Presets',
    description: 'Bulk-upload videos to YouTube Studio with presets and scheduling, plus scan and trim copyright-claimed segments',
    permissions: ['sidePanel', 'storage', 'alarms', 'notifications'],
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
  "compilerOptions": { "strict": true, "noEmit": true }
}
```

`extension/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: { include: ['tests/**/*.test.{ts,mjs}'] },
});
```

`extension/.gitignore`:
```
node_modules
.output
.wxt
stats.html
```

- [ ] **Step 2: Install pinned dependencies**

Run:
```bash
cd extension
npm i -D -E wxt@latest typescript@latest vitest@latest fake-indexeddb@latest
npm i -E @webext-core/messaging@latest
```
Expected: installs succeed, `postinstall` runs `wxt prepare` and creates `.wxt/`. `package.json` shows versions with no `^`. If `wxt prepare` fails because there are no entrypoints yet, carry on: Step 5 creates them, and `npm run build` regenerates `.wxt/`.

- [ ] **Step 3: Write the failing test**

`extension/tests/panel-scope.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isStudioUrl } from '../lib/panel-scope';

describe('isStudioUrl', () => {
  it('accepts Studio pages', () => {
    expect(isStudioUrl('https://studio.youtube.com/')).toBe(true);
    expect(isStudioUrl('https://studio.youtube.com/channel/UCabc/videos/upload?d=ud')).toBe(true);
  });
  it('rejects other YouTube hosts and look-alikes', () => {
    expect(isStudioUrl('https://www.youtube.com/channel_switcher')).toBe(false);
    expect(isStudioUrl('https://studio.youtube.com.evil.example/')).toBe(false);
  });
  it('rejects missing or unparsable URLs', () => {
    expect(isStudioUrl(undefined)).toBe(false);
    expect(isStudioUrl('')).toBe(false);
    expect(isStudioUrl('not a url')).toBe(false);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run tests/panel-scope.test.ts`
Expected: FAIL — cannot resolve `../lib/panel-scope`.

- [ ] **Step 5: Implement**

`extension/lib/panel-scope.ts`:
```ts
// The side panel only makes sense next to YouTube Studio.
export function isStudioUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === 'studio.youtube.com';
  } catch {
    return false;
  }
}
```

`extension/entrypoints/background.ts`:
```ts
import { browser } from 'wxt/browser';
import { isStudioUrl } from '@/lib/panel-scope';

export default defineBackground(() => {
  // Toolbar icon opens the panel; the panel is off everywhere except Studio tabs.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  browser.sidePanel.setOptions({ enabled: false }).catch(console.error);

  const scope = (tabId: number, url?: string) =>
    browser.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: isStudioUrl(url) }).catch(console.error);

  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.url || info.status === 'complete') scope(tabId, tab.url);
  });
  browser.tabs.query({}).then((tabs) => tabs.forEach((t) => t.id !== undefined && scope(t.id, t.url)));
});
```

`extension/entrypoints/sidepanel/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>YouTube Upload Presets</title>
  </head>
  <body style="font: 13px system-ui; background: #111; color: #eee; margin: 12px">
    <h1 style="font-size: 15px">Upload Presets — spike</h1>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`extension/entrypoints/sidepanel/main.ts`:
```ts
// Phase 0 placeholder; Task 6 turns this into the spike panel.
export {};
```

- [ ] **Step 6: Run the checks and the build**

Run: `npm run check`
Expected: `tsc` reports nothing; Vitest shows `3 passed`.

Run:
```bash
npm run build && node -e "const m=JSON.parse(require('fs').readFileSync('.output/chrome-mv3/manifest.json','utf8'));console.log(JSON.stringify({p:m.permissions,h:m.host_permissions,sp:m.side_panel,a:!!m.action,war:m.web_accessible_resources}))"
```
Expected output (key order may differ):
```
{"p":["sidePanel","storage","alarms","notifications"],"h":["https://studio.youtube.com/*","https://www.youtube.com/*","https://api.github.com/*"],"sp":{"default_path":"sidepanel.html"},"a":true,"war":[{"resources":["file-bridge.html"],"matches":["https://studio.youtube.com/*"]}]}
```

- [ ] **Step 7: Commit**

```bash
git add extension
git commit -m "Scaffold the WXT extension; side panel only on Studio tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: RPC over postMessage and MessagePort

**Files:**
- Create: `extension/lib/rpc.ts`
- Test: `extension/tests/rpc.test.ts`

**Interfaces:**
- Produces (`lib/rpc.ts`):
  - `interface Endpoint { post(msg: unknown, transfer?: Transferable[]): void; listen(fn: (data: unknown) => void): () => void }`
  - `type Handlers = Record<string, (...args: any[]) => unknown>`
  - `rpcServe<H extends Handlers>(ep: Endpoint, ch: string, handlers: H): () => void`
  - `rpcClient<H extends Handlers>(ep: Endpoint, ch: string, timeoutMs?: number): <K extends keyof H & string>(op: K, ...args: Parameters<H[K]>) => Promise<Awaited<ReturnType<H[K]>>>`
  - `portEndpoint(port: MessagePort): Endpoint`
  - `windowEndpoint(win: Window, targetOrigin: string): Endpoint` (accepts only events whose `source === win`)
- Op maps must be declared with `type X = { ... }`, not `interface`. Interfaces don't satisfy the `Record` index signature.

- [ ] **Step 1: Write the failing test**

`extension/tests/rpc.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { portEndpoint, rpcClient, rpcServe, windowEndpoint, type Endpoint } from '../lib/rpc';

type Ops = {
  add(a: number, b: number): number;
  slow(): Promise<string>;
  boom(): never;
};

const open: MessagePort[] = [];
function pair(): [Endpoint, Endpoint] {
  const { port1, port2 } = new MessageChannel();
  open.push(port1, port2);
  return [portEndpoint(port1), portEndpoint(port2)];
}
afterEach(() => open.splice(0).forEach((p) => p.close()));

const handlers: Ops = {
  add: (a, b) => a + b,
  slow: () => new Promise((r) => setTimeout(() => r('late'), 50)),
  boom: () => { throw new Error('missing'); },
};

describe('rpc', () => {
  it('returns the handler result', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    const call = rpcClient<Ops>(a, 'test');
    expect(await call('add', 2, 3)).toBe(5);
  });

  it('awaits async handlers', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    expect(await rpcClient<Ops>(a, 'test')('slow')).toBe('late');
  });

  it('rejects with the handler error message', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    await expect(rpcClient<Ops>(a, 'test')('boom')).rejects.toThrow('missing');
  });

  it('ignores other channels and times out', async () => {
    const [a, b] = pair();
    rpcServe(b, 'other', handlers);
    await expect(rpcClient<Ops>(a, 'test', 30)('add', 1, 1)).rejects.toThrow('add: timed out after 30 ms');
  });

  it('keeps concurrent calls apart', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    const call = rpcClient<Ops>(a, 'test');
    expect(await Promise.all([call('slow'), call('add', 1, 2), call('add', 10, 20)])).toEqual(['late', 3, 30]);
  });

  it('windowEndpoint only hears messages whose source is the same window', () => {
    const target = new EventTarget() as unknown as Window;
    const heard: unknown[] = [];
    windowEndpoint(target, '*').listen((d) => heard.push(d));
    const fire = (data: unknown, source: unknown) =>
      (target as unknown as EventTarget).dispatchEvent(Object.assign(new Event('message'), { data, source }));
    fire('from-self', target);
    fire('from-iframe', {});
    expect(heard).toEqual(['from-self']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rpc.test.ts`
Expected: FAIL — cannot resolve `../lib/rpc`.

- [ ] **Step 3: Implement**

`extension/lib/rpc.ts`:
```ts
// Request/response on top of postMessage. Used between the content script and
// the MAIN-world script (same window) and between the content script and the
// file-bridge iframe (MessagePort). Requests carry `op`, responses carry `ok`,
// so a side that hears its own traffic (same window) ignores it.

export interface Endpoint {
  post(msg: unknown, transfer?: Transferable[]): void;
  listen(fn: (data: unknown) => void): () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handlers = Record<string, (...args: any[]) => unknown>;

interface Req { ch: string; id: string; op: string; args: unknown[] }
type Res = { ch: string; id: string; ok: true; value: unknown } | { ch: string; id: string; ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const isReq = (ch: string, d: unknown): d is Req =>
  isObj(d) && d.ch === ch && typeof d.id === 'string' && typeof d.op === 'string' && Array.isArray(d.args);
const isRes = (ch: string, d: unknown): d is Res =>
  isObj(d) && d.ch === ch && typeof d.id === 'string' && typeof d.ok === 'boolean';

export function rpcServe<H extends Handlers>(ep: Endpoint, ch: string, handlers: H): () => void {
  return ep.listen(async (d) => {
    if (!isReq(ch, d) || !Object.hasOwn(handlers, d.op)) return;
    try {
      ep.post({ ch, id: d.id, ok: true, value: await handlers[d.op](...d.args) });
    } catch (e) {
      ep.post({ ch, id: d.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export function rpcClient<H extends Handlers>(ep: Endpoint, ch: string, timeoutMs = 10_000) {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  ep.listen((d) => {
    if (!isRes(ch, d)) return;
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    clearTimeout(p.timer);
    if (d.ok) p.resolve(d.value);
    else p.reject(new Error(d.error));
  });
  const prefix = Math.random().toString(36).slice(2);
  let seq = 0;
  return <K extends keyof H & string>(op: K, ...args: Parameters<H[K]>): Promise<Awaited<ReturnType<H[K]>>> =>
    new Promise((resolve, reject) => {
      const id = `${prefix}-${++seq}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${op}: timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      ep.post({ ch, id, op, args });
    });
}

export function portEndpoint(port: MessagePort): Endpoint {
  return {
    post: (msg, transfer = []) => port.postMessage(msg, transfer),
    listen(fn) {
      const h = (e: MessageEvent) => fn(e.data);
      port.addEventListener('message', h);
      port.start();
      return () => port.removeEventListener('message', h);
    },
  };
}

export function windowEndpoint(win: Window, targetOrigin: string): Endpoint {
  return {
    post: (msg, transfer = []) => win.postMessage(msg, targetOrigin, transfer),
    listen(fn) {
      const h = (e: Event) => {
        const m = e as MessageEvent;
        if (m.source === win) fn(m.data);
      };
      win.addEventListener('message', h);
      return () => win.removeEventListener('message', h);
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/rpc.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/rpc.ts extension/tests/rpc.test.ts
git commit -m "Add a small request/response layer over postMessage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: MAIN-world `ytcfg` reader and the typed message protocol

**Files:**
- Create: `extension/lib/main-ops.ts`, `extension/lib/messages.ts`
- Create: `extension/entrypoints/studio-main.content.ts`, `extension/entrypoints/studio.content.ts`
- Modify: `extension/entrypoints/sidepanel/index.html`, `extension/entrypoints/sidepanel/main.ts`

**Interfaces:**
- Consumes: `rpcServe`, `rpcClient`, `windowEndpoint` (Task 2).
- Produces:
  - `MAIN_CH = 'ytup:main'` and `type MainOps = { getCfg(keys: string[]): Record<string, unknown> }` (`lib/main-ops.ts`)
  - `ProtocolMap`, `sendMessage` and `onMessage` (`lib/messages.ts`). Phase 0 messages: `openPanel`, `spike:cfg`, `spike:inject`. The `spike:*` messages are deleted in the Phase 2 plan.

This task has no unit test of its own. The RPC is covered by Task 2, and the point here is real-Studio behavior.

- [ ] **Step 1: Write the shared definitions**

`extension/lib/main-ops.ts`:
```ts
// The MAIN-world script is the only code that can see Studio's own `ytcfg`.
// It exposes a deliberately tiny API over window.postMessage.
export const MAIN_CH = 'ytup:main';

export type MainOps = {
  getCfg(keys: string[]): Record<string, unknown>;
};
```

`extension/lib/messages.ts`:
```ts
import { defineExtensionMessaging } from '@webext-core/messaging';

export interface ProtocolMap {
  openPanel(): void;
  // Phase 0 spike only — removed in Phase 2
  'spike:cfg'(): Record<string, unknown>;
  'spike:inject'(itemId: string): { ok: boolean; detail: string };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

- [ ] **Step 2: Write the MAIN-world script**

`extension/entrypoints/studio-main.content.ts`:
```ts
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { rpcServe, windowEndpoint } from '@/lib/rpc';

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  world: 'MAIN',
  main() {
    const w = window as unknown as { ytcfg?: { get(k: string): unknown } };
    const handlers: MainOps = {
      getCfg: (keys) => Object.fromEntries(keys.map((k) => [k, w.ytcfg?.get(k)])),
    };
    rpcServe(windowEndpoint(window, window.location.origin), MAIN_CH, handlers);
  },
});
```

- [ ] **Step 3: Write the isolated-world Studio script**

`extension/entrypoints/studio.content.ts`:
```ts
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';

export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  main() {
    const main = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH);
    onMessage('spike:cfg', () =>
      main('getCfg', ['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']),
    );
  },
});
```

- [ ] **Step 4: Add the "Read ytcfg" button to the spike panel**

Replace `extension/entrypoints/sidepanel/index.html` body content (keep the `<head>`):
```html
  <body style="font: 13px system-ui; background: #111; color: #eee; margin: 12px">
    <h1 style="font-size: 15px">Upload Presets — spike</h1>
    <p><button id="cfg">Read ytcfg</button></p>
    <pre id="log" style="white-space: pre-wrap; font: 12px ui-monospace, monospace"></pre>
    <script type="module" src="./main.ts"></script>
  </body>
```

Replace `extension/entrypoints/sidepanel/main.ts`:
```ts
import { browser } from 'wxt/browser';
import { sendMessage } from '@/lib/messages';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
export const log = (msg: string) => {
  $('#log').textContent = `${new Date().toLocaleTimeString()} ${msg}\n${$('#log').textContent}`;
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function studioTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('no active tab');
  return tab.id;
}

$('#cfg').addEventListener('click', async () => {
  try {
    log(`ytcfg: ${JSON.stringify(await sendMessage('spike:cfg', undefined, await studioTabId()))}`);
  } catch (e) {
    log(`ytcfg: ERROR ${errText(e)}`);
  }
});
```

- [ ] **Step 5: Type-check and build**

Run: `npm run check && npm run build`
Expected: no type errors; tests pass; build succeeds. Confirm both content scripts are in the manifest:
```bash
node -e "const m=JSON.parse(require('fs').readFileSync('.output/chrome-mv3/manifest.json','utf8'));console.log(m.content_scripts.map(c=>c.matches[0]+' '+(c.world||'ISOLATED')).join('\n'))"
```
Expected:
```
https://studio.youtube.com/* MAIN
https://studio.youtube.com/* ISOLATED
```
(either order).

- [ ] **Step 6: Manual check in Studio**

1. `chrome://extensions` → Developer mode on → **Load unpacked** → choose `extension/.output/chrome-mv3`.
2. Open `https://studio.youtube.com`, click the extension's toolbar icon, and confirm the side panel opens.
3. Open any non-Studio tab (e.g. `https://example.com`) and click the icon. Expected: no panel.
4. Back on Studio, click **Read ytcfg**. Expected: a log line with `CHANNEL_ID` starting `UC`, and a non-empty `INNERTUBE_CONTEXT_CLIENT_VERSION`.

Write down the results; Task 7 records them.

- [ ] **Step 7: Commit**

```bash
git add extension
git commit -m "Read Studio's ytcfg from the MAIN world over rpc

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: IndexedDB file-handle store

**Files:**
- Create: `extension/lib/fs-permissions.d.ts`, `extension/lib/file-store.ts`
- Test: `extension/tests/file-store.test.ts`

**Interfaces:**
- Produces (`lib/file-store.ts`):
  - `putHandle(id: string, handle: FileSystemFileHandle): Promise<void>`
  - `getHandle(id: string): Promise<FileSystemFileHandle | undefined>`
  - `deleteHandle(id: string): Promise<void>`
  - `listIds(): Promise<string[]>`
- Produces typings: `FileSystemHandle.queryPermission`, `FileSystemHandle.requestPermission` and `DataTransferItem.getAsFileSystemHandle`.

- [ ] **Step 1: Write the failing test**

`extension/tests/file-store.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteHandle, getHandle, listIds, putHandle } from '../lib/file-store';

// Real FileSystemFileHandles only exist in Chrome; a plain cloneable object
// stands in for one here — the store only needs structured clone.
const fake = (name: string) => ({ kind: 'file', name }) as unknown as FileSystemFileHandle;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

describe('file-store', () => {
  it('returns undefined for an unknown id', async () => {
    expect(await getHandle('nope')).toBeUndefined();
  });

  it('stores and reads back a handle by item id', async () => {
    await putHandle('a', fake('clip01.mp4'));
    expect(await getHandle('a')).toEqual({ kind: 'file', name: 'clip01.mp4' });
  });

  it('lists ids and deletes', async () => {
    await putHandle('a', fake('a.mp4'));
    await putHandle('b', fake('b.mp4'));
    expect((await listIds()).sort()).toEqual(['a', 'b']);
    await deleteHandle('a');
    expect(await listIds()).toEqual(['b']);
  });

  it('overwrites an existing id', async () => {
    await putHandle('a', fake('old.mp4'));
    await putHandle('a', fake('new.mp4'));
    expect((await getHandle('a'))?.name).toBe('new.mp4');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/file-store.test.ts`
Expected: FAIL — cannot resolve `../lib/file-store`.

- [ ] **Step 3: Implement**

`extension/lib/fs-permissions.d.ts`:
```ts
// Chrome ships these File System Access APIs; TypeScript's DOM lib does not declare them yet.
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
}
```

`extension/lib/file-store.ts`:
```ts
// Dropped files are kept as FileSystemFileHandles (not copies) in the extension's
// IndexedDB, keyed by queue item id. The side panel writes them; the file-bridge
// iframe inside Studio reads them. Both are extension-origin pages.
const DB = 'ytup-files';
const STORE = 'handles';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Resolves when the transaction commits, so another page reading next sees the write.
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error ?? req.error); };
  });
}

export const putHandle = (id: string, handle: FileSystemFileHandle) =>
  run('readwrite', (s) => s.put(handle, id)).then(() => undefined);

export const getHandle = (id: string) =>
  run<FileSystemFileHandle | undefined>('readonly', (s) => s.get(id));

export const deleteHandle = (id: string) =>
  run('readwrite', (s) => s.delete(id)).then(() => undefined);

export const listIds = () =>
  run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((keys) => keys.map(String));
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/file-store.test.ts && npx tsc --noEmit`
Expected: PASS, 4 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/fs-permissions.d.ts extension/lib/file-store.ts extension/tests/file-store.test.ts
git commit -m "Keep dropped file handles in extension IndexedDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: File bridge iframe and its client

**Files:**
- Create: `extension/lib/file-bridge.ts`, `extension/lib/file-bridge-client.ts`
- Create: `extension/entrypoints/file-bridge/index.html`, `extension/entrypoints/file-bridge/main.ts`
- Test: `extension/tests/file-bridge.test.ts`

**Interfaces:**
- Consumes: `rpcServe`, `rpcClient`, `portEndpoint` (Task 2); `getHandle` (Task 4).
- Produces:
  - `FILE_CH = 'ytup:files'`, `CONNECT = 'ytup:file-bridge:connect'`, `type FileOps = { getFile(itemId: string): Promise<File> }` (`lib/file-bridge.ts`)
  - `readHandle(h: FileSystemFileHandle | undefined): Promise<File>` — rejects with `Error('missing' | 'permission' | 'read')`
  - `mountFileBridge(doc: Document, timeoutMs?: number): { getFile(itemId: string): Promise<File> }` (`lib/file-bridge-client.ts`)

- [ ] **Step 1: Write the failing test**

`extension/tests/file-bridge.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readHandle } from '../lib/file-bridge';

const handle = (perm: PermissionState, getFile: () => Promise<File>) =>
  ({ kind: 'file', name: 'clip.mp4', queryPermission: async () => perm, getFile }) as unknown as FileSystemFileHandle;

describe('readHandle', () => {
  it('rejects with "missing" when the item has no stored handle', async () => {
    await expect(readHandle(undefined)).rejects.toThrow('missing');
  });

  it('rejects with "permission" when read access is not granted', async () => {
    await expect(readHandle(handle('prompt', async () => new File([], 'x')))).rejects.toThrow('permission');
  });

  it('rejects with "read" when the file is gone or unreadable', async () => {
    const gone = handle('granted', async () => { throw new DOMException('A requested file could not be found', 'NotFoundError'); });
    await expect(readHandle(gone)).rejects.toThrow('read');
  });

  it('returns the File when granted', async () => {
    const f = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
    expect(await readHandle(handle('granted', async () => f))).toBe(f);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/file-bridge.test.ts`
Expected: FAIL — cannot resolve `../lib/file-bridge`.

- [ ] **Step 3: Implement the shared part**

`extension/lib/file-bridge.ts`:
```ts
// A File can't travel over chrome.runtime messaging, and Studio's upload input
// needs a real File inside the Studio tab. The content script mounts a hidden
// extension-origin iframe (file-bridge.html) which can read the side panel's
// IndexedDB, and hands it a MessagePort to ask for files by queue item id.
export const FILE_CH = 'ytup:files';
export const CONNECT = 'ytup:file-bridge:connect';

export type FileOps = {
  getFile(itemId: string): Promise<File>;
};

// Error messages are codes the queue turns into user-facing text.
export async function readHandle(h: FileSystemFileHandle | undefined): Promise<File> {
  if (!h) throw new Error('missing');
  if ((await h.queryPermission({ mode: 'read' })) !== 'granted') throw new Error('permission');
  try {
    return await h.getFile();
  } catch {
    throw new Error('read');
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/file-bridge.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the bridge page and the client**

`extension/entrypoints/file-bridge/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>file bridge</title>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`extension/entrypoints/file-bridge/main.ts`:
```ts
import { CONNECT, FILE_CH, readHandle, type FileOps } from '@/lib/file-bridge';
import { getHandle } from '@/lib/file-store';
import { portEndpoint, rpcServe } from '@/lib/rpc';

// Only Studio's content script may connect; everything else is ignored.
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://studio.youtube.com' || e.data?.ch !== CONNECT || !e.ports[0]) return;
  const handlers: FileOps = { getFile: async (itemId) => readHandle(await getHandle(itemId)) };
  rpcServe(portEndpoint(e.ports[0]), FILE_CH, handlers);
});
```

`extension/lib/file-bridge-client.ts`:
```ts
import { browser } from 'wxt/browser';
import { CONNECT, FILE_CH, type FileOps } from './file-bridge';
import { portEndpoint, rpcClient } from './rpc';

// Content-script side: mount the hidden bridge iframe and talk to it over a
// private MessageChannel, so page scripts never see the traffic.
export function mountFileBridge(doc: Document, timeoutMs = 30_000) {
  const frame = doc.createElement('iframe');
  frame.src = browser.runtime.getURL('/file-bridge.html');
  frame.style.display = 'none';
  const { port1, port2 } = new MessageChannel();
  const ready = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => {
      frame.contentWindow!.postMessage({ ch: CONNECT }, new URL(frame.src).origin, [port2]);
      resolve();
    }, { once: true });
  });
  doc.documentElement.append(frame);
  const call = rpcClient<FileOps>(portEndpoint(port1), FILE_CH, timeoutMs);
  return {
    async getFile(itemId: string): Promise<File> {
      await ready;
      return call('getFile', itemId);
    },
  };
}
```

- [ ] **Step 6: Check and build**

Run: `npm run check && npm run build && ls .output/chrome-mv3/file-bridge.html`
Expected: everything passes; the file exists.

- [ ] **Step 7: Commit**

```bash
git add extension
git commit -m "Add the file-bridge iframe that turns stored handles into Files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Spike UI: drop on the panel, inject into Studio, re-grant, FAB

**Files:**
- Create: `extension/lib/studio/inject-spike.ts`
- Modify: `extension/entrypoints/studio.content.ts`, `extension/entrypoints/background.ts`
- Modify: `extension/entrypoints/sidepanel/index.html`, `extension/entrypoints/sidepanel/main.ts`

**Interfaces:**
- Consumes: `mountFileBridge` (Task 5); `putHandle`, `getHandle`, `deleteHandle`, `listIds` (Task 4); `sendMessage` and `onMessage` with `openPanel` and `spike:inject` (Task 3).
- Produces: nothing permanent. `inject-spike.ts`, the spike panel and the `spike:*` handlers are replaced in Phases 2–3.

This is spike code. It's verified by the manual checklist in Task 7, not by unit tests.

- [ ] **Step 1: Write the throwaway upload injector**

`extension/lib/studio/inject-spike.ts`:
```ts
// Phase 0 only. Method 1 of the userscript's injectUploadFile(): put the File
// into Studio's upload <input> and fire change. Phase 2 ports the real one.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function injectIntoUploadDialog(file: File): Promise<boolean> {
  const dlg = document.querySelector('ytcp-uploads-dialog');
  const input =
    dlg?.querySelector<HTMLInputElement>('input[type=file][name="Filedata"]') ??
    dlg?.querySelector<HTMLInputElement>('input[type=file]');
  if (!dlg || !input) throw new Error('Open Studio\'s upload dialog first (Create → Upload videos)');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  for (let i = 0; i < 40; i++) {
    if (dlg.querySelector('#title-textarea #textbox')) return true; // details step is showing
    await sleep(250);
  }
  return false;
}
```

- [ ] **Step 2: Wire the content script**

Replace `extension/entrypoints/studio.content.ts`:
```ts
import { mountFileBridge } from '@/lib/file-bridge-client';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { injectIntoUploadDialog } from '@/lib/studio/inject-spike';

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
  main() {
    const main = rpcClient<MainOps>(windowEndpoint(window, window.location.origin), MAIN_CH);
    const files = mountFileBridge(document);

    onMessage('spike:cfg', () =>
      main('getCfg', ['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']),
    );
    onMessage('spike:inject', async ({ data: itemId }) => {
      try {
        const t0 = performance.now();
        const file = await files.getFile(itemId);
        const ms = Math.round(performance.now() - t0);
        const ok = await injectIntoUploadDialog(file);
        return { ok, detail: `${file.name} · ${file.size} bytes · bridge ${ms} ms` };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    });
    mountFab();
  },
});
```

- [ ] **Step 3: Handle `openPanel` in the background**

In `extension/entrypoints/background.ts`, add the import at the top:
```ts
import { onMessage } from '@/lib/messages';
```
and add this as the last statement inside `defineBackground(() => { ... })`:
```ts
  onMessage('openPanel', async ({ sender }) => {
    if (sender.tab?.id !== undefined) await browser.sidePanel.open({ tabId: sender.tab.id });
  });
```

- [ ] **Step 4: Build the spike panel**

Replace the `<body>` of `extension/entrypoints/sidepanel/index.html`:
```html
  <body style="font: 13px system-ui; background: #111; color: #eee; margin: 12px">
    <h1 style="font-size: 15px">Upload Presets — spike</h1>
    <div id="drop" style="border: 2px dashed #555; border-radius: 10px; padding: 28px; text-align: center">
      Drop video / image / .txt files here
    </div>
    <p>
      <button id="cfg">Read ytcfg</button>
      <button id="regrant">Re-grant access</button>
    </p>
    <ul id="files"></ul>
    <pre id="log" style="white-space: pre-wrap; font: 12px ui-monospace, monospace"></pre>
    <script type="module" src="./main.ts"></script>
  </body>
```

Append to `extension/entrypoints/sidepanel/main.ts`:
```ts
import { deleteHandle, getHandle, listIds, putHandle } from '@/lib/file-store';

async function render() {
  const list = $('#files');
  list.replaceChildren();
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (!h) continue;
    const li = document.createElement('li');
    li.textContent = `${h.name} · ${await h.queryPermission({ mode: 'read' })} `;
    const inject = document.createElement('button');
    inject.textContent = 'Inject into Studio';
    inject.onclick = async () => {
      try {
        const r = await sendMessage('spike:inject', id, await studioTabId());
        log(`inject ${h.name}: ${r.ok ? 'PASS' : 'FAIL'} — ${r.detail}`);
      } catch (e) {
        log(`inject ${h.name}: ERROR ${errText(e)}`);
      }
    };
    const del = document.createElement('button');
    del.textContent = 'Remove';
    del.onclick = async () => { await deleteHandle(id); await render(); };
    li.append(inject, del);
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
  await render();
});

$('#regrant').addEventListener('click', async () => {
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (h) log(`${h.name}: ${await h.requestPermission({ mode: 'read' })}`);
  }
  await render();
});

render();
```
(`$`, `log`, `errText`, `studioTabId` and `sendMessage` are already defined and imported at the top of this file from Task 3. Move the new `import` line up with the other imports.)

- [ ] **Step 5: Check and build**

Run: `npm run check && npm run build`
Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add extension
git commit -m "Spike: drop files on the panel and inject them into Studio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Run the spike checklist and record the go/no-go

**Files:**
- Create: `docs/superpowers/specs/2026-10-05-spike-results.md`

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → reload **YouTube Upload Presets** (built in Task 6). Close and reopen any Studio tabs.

- [ ] **Step 2: Run each check in a logged-in Studio tab and note the result**

| # | Check | How | Pass when |
|---|---|---|---|
| 1 | Panel scope | Toolbar icon on Studio, then on example.com | Opens on Studio only |
| 2 | MAIN world | **Read ytcfg** | `CHANNEL_ID` = `UC…`, client version non-empty |
| 3 | Drop gives handles | Drop one ~1 GB `.mp4`, one `.jpg`, one `.txt` on the panel | 3 "stored handle" lines; each listed as `granted` |
| 4 | **Bridge sees panel storage** (partitioning risk) | In Studio: Create → Upload videos. In the panel: **Inject into Studio** on the `.mp4` | `PASS` and Studio moves to the details step; log shows the size and bridge time |
| 5 | Survives reload | Reload the Studio tab, reopen the upload dialog, inject again | `PASS` |
| 6 | Survives restart + re-grant | Quit Chrome fully, reopen, open Studio + panel | Items show `prompt`; injecting gives `FAIL — permission`; **Re-grant access** gives `granted` (note whether it took one click for all files or one per file); inject then gives `PASS` |
| 7 | FAB opens panel | Close the panel, click the **UP** button in Studio | Panel opens (if it doesn't, copy the console warning) |
| 8 | Moved file | Rename the `.txt` in Finder, then inject it | `FAIL — read` |

Do this in the user's real Chrome profile. Studio requires their login.

- [ ] **Step 3: Write the results document**

Create `docs/superpowers/specs/2026-10-05-spike-results.md` with a header, the table from Step 2 with an added **Result** column filled in from the observations, then this decision section, completed:

```markdown
## Decision

- File intake: **panel drop (spec option B)** if checks 3–6 passed; otherwise **page drop fallback** (spec "Risks" §1).
- Re-grant UX: <one click for all files | one click per file> — Phase 3 plan designs the button for this.
- FAB: <keep — check 7 passed | drop — toolbar icon only>.
- Notes: <anything surprising: timings, console errors, Studio behavior>.
```

Fill each `<…>` with what was actually observed. Leave none of them in.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-05-spike-results.md
git commit -m "Record Phase 0 spike results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Stop and report**

Report the decision to the user before starting Phase 1. Phase 1 doesn't depend on the outcome, but the user should know which path Phase 3 will take.

---

# Phase 1 — Foundation

### Task 8: i18n and storage

**Files:**
- Create: `extension/lib/i18n.ts`, `extension/lib/storage.ts`
- Test: `extension/tests/i18n.test.ts`, `extension/tests/storage.test.ts`

**Interfaces:**
- Produces (`lib/i18n.ts`): `type Lang = 'th' | 'en'`, `getLang(): Lang`, `setLang(l: Lang): void`, `L(th: string, en: string): string`, `locale(): 'en-GB' | 'th-TH'`, `resolveLang(settings: { lang?: unknown } | undefined, hasPresets: boolean): Lang`, `initI18n(): Promise<Lang>`. The default language is `'en'`.
- Produces (`lib/storage.ts`): `load<T>(key: string, fallback: T): Promise<T>` (returns `fallback` only when the key is absent) and `save(key: string, value: unknown): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`extension/tests/i18n.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getLang, initI18n, L, locale, resolveLang, setLang } from '../lib/i18n';

beforeEach(() => fakeBrowser.reset());
afterEach(() => setLang('en'));

describe('i18n', () => {
  it('defaults to English', () => {
    expect(getLang()).toBe('en');
    expect(L('ไทย', 'English')).toBe('English');
    expect(locale()).toBe('en-GB');
  });

  it('switches to Thai', () => {
    setLang('th');
    expect(L('ไทย', 'English')).toBe('ไทย');
    expect(locale()).toBe('th-TH');
  });

  it('resolveLang: a saved language wins', () => {
    expect(resolveLang({ lang: 'th' }, false)).toBe('th');
    expect(resolveLang({ lang: 'en' }, true)).toBe('en');
  });

  it('resolveLang: new installs start in English, installs from before v4.6.0 stay Thai', () => {
    expect(resolveLang(undefined, false)).toBe('en');
    expect(resolveLang({}, true)).toBe('th');
  });

  it('initI18n reads storage', async () => {
    await browser.storage.local.set({ settings: { lang: 'th' } });
    expect(await initI18n()).toBe('th');
    expect(getLang()).toBe('th');
  });
});
```

`extension/tests/storage.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { load, save } from '../lib/storage';

beforeEach(() => fakeBrowser.reset());

describe('storage', () => {
  it('returns the fallback for a missing key', async () => {
    expect(await load('presets', ['default'])).toEqual(['default']);
  });

  it('round-trips a value', async () => {
    await save('activeId', 'trapsoul');
    expect(await load('activeId', 'x')).toBe('trapsoul');
  });

  it('keeps falsy stored values instead of the fallback (GM_getValue semantics)', async () => {
    await save('flag', false);
    await save('n', 0);
    await save('nothing', null);
    expect(await load('flag', true)).toBe(false);
    expect(await load('n', 5)).toBe(0);
    expect(await load('nothing', 'x')).toBe(null);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/i18n.test.ts tests/storage.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`extension/lib/storage.ts`:
```ts
import { browser } from 'wxt/browser';

// Same contract as the userscript's load()/save() over GM_getValue/GM_setValue,
// now async over chrome.storage.local. Keys are unchanged.
export async function load<T>(key: string, fallback: T): Promise<T> {
  const got = await browser.storage.local.get(key);
  return got[key] === undefined ? fallback : (got[key] as T);
}

export const save = (key: string, value: unknown): Promise<void> => browser.storage.local.set({ [key]: value });
```

`extension/lib/i18n.ts`:
```ts
import { browser } from 'wxt/browser';

// Every UI string is written as L('ไทย', 'English').
export type Lang = 'th' | 'en';

let current: Lang = 'en';

export const getLang = (): Lang => current;
export const setLang = (l: Lang): void => { current = l; };
export const L = (th: string, en: string): string => (current === 'en' ? en : th);
export const locale = () => (current === 'en' ? 'en-GB' : 'th-TH');

// New installs start in English; installs from before v4.6.0 (presets saved, no language) stay Thai.
export function resolveLang(settings: { lang?: unknown } | undefined, hasPresets: boolean): Lang {
  const l = settings?.lang;
  if (l === 'th' || l === 'en') return l;
  return hasPresets ? 'th' : 'en';
}

// Each entrypoint awaits this before building any UI string.
export async function initI18n(): Promise<Lang> {
  const { settings, presets } = await browser.storage.local.get(['settings', 'presets']);
  setLang(resolveLang(settings as { lang?: unknown } | undefined, presets !== undefined));
  return current;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/i18n.test.ts tests/storage.test.ts && npx tsc --noEmit`
Expected: PASS, 8 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/i18n.ts extension/lib/storage.ts extension/tests/i18n.test.ts extension/tests/storage.test.ts
git commit -m "Port L() and load/save onto chrome.storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Studio tables, constants and collab matching

**Files:**
- Create: `extension/lib/studio/txt.ts`, `extension/lib/studio/sel.ts` (extracted verbatim)
- Create: `extension/lib/constants.ts`, `extension/lib/collab.ts`
- Test: `extension/tests/collab.test.mjs` (ported)

**Interfaces:**
- Consumes: `L` (Task 8).
- Produces:
  - `TXT` (`lib/studio/txt.ts`) and `SEL` (`lib/studio/sel.ts`), the same keys as the userscript.
  - `lib/constants.ts`: `VARS: string[]`, `VIDEO_EXT`, `TXT_EXT`, `IMG_EXT`, `THUMB_MAX`, `DESC_MAX = 5000`, `SCHEDULE_MIN_LEAD`, `TITLE_MAX = 100`, `type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC'`, `VISIBILITIES: Visibility[]`.
  - `lib/collab.ts`: `normText`, `parseHandles`, `collabRowMatches`, `acceptLabelMatches`, `switcherRowMatches`, `interface InviteResult`, `inviteOutcome`, `INVITE_URL`.

- [ ] **Step 1: Port the test first (header swap only)**

Run from `extension/`:
```bash
mkdir -p tests
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as collab from '../lib/collab';
import { TXT } from '../lib/studio/txt';

const C = { ...collab, TXT };
EOF
tail -n +4 ../test/collab.test.mjs; } > tests/collab.test.mjs
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/collab.test.mjs`
Expected: FAIL — cannot resolve `../lib/collab`.

- [ ] **Step 3: Extract the tables verbatim from the pinned commit**

Run from `extension/`:
```bash
mkdir -p lib/studio
SRC='git show 79a79357d4aa7101d7ea2bde5bfeede5d8389724:youtube-upload-presets.user.js'
{ echo "// Every regex matched against text Studio renders. Copied verbatim from the userscript (v4.26.1)."
  $SRC | sed -n '34,77p' | sed 's/^  //' | sed '1s/^const TXT/export const TXT/'; } > lib/studio/txt.ts
{ echo "// Every Studio selector. Copied verbatim from the userscript (v4.26.1)."
  $SRC | sed -n '81,177p' | sed 's/^  //' | sed '1s/^const SEL/export const SEL/' \
    | sed "s/monetRadio: (on) =>/monetRadio: (on: 'on' | 'off') =>/"; } > lib/studio/sel.ts
head -3 lib/studio/txt.ts; tail -1 lib/studio/txt.ts; head -3 lib/studio/sel.ts; tail -1 lib/studio/sel.ts
```
Expected: `txt.ts` starts with the comment then `export const TXT = {` and ends with `};`. `sel.ts` starts with the comment then `export const SEL = {` and ends with `};`.

- [ ] **Step 4: Write constants and collab**

`extension/lib/constants.ts`:
```ts
// Variables usable in title / description / tags (see template.ts).
export const VARS = ['name', 'bpm', 'n', 'date', 'year', 'filename', 'producer', 'txt', 'track1', 'trackcount', 'artists'];
export const VIDEO_EXT = /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|3gp|mpe?g)$/i;
export const TXT_EXT = /\.txt$/i;
export const IMG_EXT = /\.(jpe?g|png|gif|bmp|webp)$/i;
export const THUMB_MAX = 2 * 1024 * 1024; // YouTube accepts thumbnails up to 2 MB
export const DESC_MAX = 5000;
export const SCHEDULE_MIN_LEAD = 15 * 60 * 1000; // YouTube needs roughly 15 minutes of lead time
export const TITLE_MAX = 100;

export type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
export const VISIBILITIES: Visibility[] = ['PRIVATE', 'UNLISTED', 'PUBLIC'];
```

`extension/lib/collab.ts`:
```ts
import { L } from './i18n';
import { TXT } from './studio/txt';

// Text matching and result reporting for collab invites. No DOM here.
export const normText = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim();
export const parseHandles = (v: unknown) =>
  String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('@') ? s : '@' + s));

// A search row (#channel-info) has no fixed separator: "@handle", "@handle · 1.2K subscribers"
// and "@handle\n1.2K subscribers" all occur. The handle must end on a non-handle character,
// otherwise @thai would match @thaibeats.
export const collabRowMatches = (info: unknown, handle: unknown) => {
  const want = String(handle || '').toLowerCase();
  if (want.length < 2 || !want.startsWith('@')) return false;
  const got = normText(info).toLowerCase();
  if (!got.startsWith(want)) return false;
  const next = got.charAt(want.length);
  return next === '' || !/[a-z0-9._-]/.test(next);
};

// The accept button: check both aria-label and button text, whitespace collapsed.
export const acceptLabelMatches = (...labels: unknown[]) =>
  labels.some((l) => normText(l) && TXT.acceptInvite.test(normText(l)));

// Channel-switcher rows only have the name and @handle (no UC id), so match by handle
// on a word boundary — @thaibeats must not match @thaibeatsofficial.
export const switcherRowMatches = (rowText: unknown, handle: unknown, name: unknown) => {
  const t = normText(rowText);
  if (!t) return false;
  const h = String(handle || '').replace(/^@/, '').toLowerCase();
  if (h) return new RegExp('@' + h.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?![a-z0-9._-])', 'i').test(t);
  const n = normText(name).toLowerCase();
  return !!n && t.toLowerCase().startsWith(n);
};

export interface InviteResult {
  links: { handle: string; link: string }[];
  skipped: string[];
  errors: string[];
  // true = Save clicked and the dialog really closed, false = it didn't, null = nothing to save
  saved: boolean | null;
}

// "Done" must mean YouTube actually saved it.
export function inviteOutcome(res: InviteResult): { state: 'done' | 'failed'; msg: string } {
  const invited = res.links.map((x) => x.handle).join(', ');
  const parts = [
    res.links.length ? L(`เชิญ ${invited}`, `Invited ${invited}`) : '',
    res.skipped.length ? L(`มีอยู่แล้ว ${res.skipped.join(', ')}`, `Already added ${res.skipped.join(', ')}`) : '',
    ...res.errors,
  ].filter(Boolean);
  const persisted = res.links.length ? res.saved === true : true;
  const worked = persisted && (res.links.length || (res.skipped.length && !res.errors.length));
  return { state: worked ? 'done' : 'failed', msg: parts.join(' · ') || L('ไม่มีอะไรเปลี่ยน', 'Nothing changed') };
}

// Invite links redirect to /channel/<us>/videos/upload?d=acd&…&inviterChannelId=<owner>;
// the only trace left is in the query string.
export const INVITE_URL = /invit|collaborat|collab|permission|[?&]d=acd\b/i;
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run tests/collab.test.mjs && npx tsc --noEmit`
Expected: PASS, **34 tests** (same count as `test/collab.test.mjs`); no type errors.

- [ ] **Step 6: Commit**

```bash
git add extension/lib/studio extension/lib/constants.ts extension/lib/collab.ts extension/tests/collab.test.mjs
git commit -m "Port the Studio tables, constants and collab matching

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Presets and async migrations

**Files:**
- Create: `extension/lib/presets.ts`, `extension/lib/migrations.ts`
- Test: `extension/tests/migrations.test.mjs` (ported, async rewrite)

**Interfaces:**
- Consumes: `L` (Task 8); `load`, `save` (Task 8); `Visibility` (Task 9).
- Produces:
  - `lib/presets.ts`: `interface Preset { id: string; label: string; title: string; description: string; tags: string[]; visibility: Visibility; artistPriority?: string[]; artistMax?: number }`, `defaultPresets(): Preset[]` (a fresh array every call, labels in the current language), `visLabels(): Record<Visibility, string>`.
  - `lib/migrations.ts`: `fixLegacyTrapsoulTitles(list: Preset[]): Preset[]`, `MIGRATIONS`, `SCHEMA_VERSION` (= 4), `runMigrations(): Promise<void>`.

- [ ] **Step 1: Port the test with the async rewrite**

Run from `extension/`:
```bash
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { runMigrations } from '../lib/migrations';
import { defaultPresets } from '../lib/presets';
import { load } from '../lib/storage';

// Runs the migrations against a fresh fake chrome.storage and hands back what they wrote.
async function migrate(initial = {}) {
  fakeBrowser.reset();
  await browser.storage.local.set(initial);
  await runMigrations();
  const store = await browser.storage.local.get(null);
  return { store, presets: await load('presets', defaultPresets()), DEFAULT_PRESETS: defaultPresets() };
}
EOF
tail -n +4 ../test/migrations.test.mjs \
  | sed -E 's/= migrate\(/= await migrate(/; s/^test\((.*), \(\) => \{$/test(\1, async () => {/'; } > tests/migrations.test.mjs
grep -c "async () =>" tests/migrations.test.mjs; grep -c "await migrate(" tests/migrations.test.mjs
```
Expected: `8` async tests. The `await migrate(` count must equal the `migrate(` call count in `../test/migrations.test.mjs` (check with `grep -c "migrate(" ../test/migrations.test.mjs`, minus the import line).

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/migrations.test.mjs`
Expected: FAIL — cannot resolve `../lib/migrations`.

- [ ] **Step 3: Write presets**

`extension/lib/presets.ts`:
```ts
import type { Visibility } from './constants';
import { L } from './i18n';

export interface Preset {
  id: string;
  label: string;
  title: string;
  description: string;
  tags: string[];
  visibility: Visibility;
  artistPriority?: string[];
  artistMax?: number;
}

export const visLabels = (): Record<Visibility, string> => ({
  PRIVATE: L('🔒 ส่วนตัว', '🔒 Private'),
  UNLISTED: L('🔗 ไม่เป็นสาธารณะ', '🔗 Unlisted'),
  PUBLIC: L('🌐 สาธารณะ', '🌐 Public'),
});

// A function (not a constant) because the labels depend on the language, which is
// only known after initI18n(). Every call returns fresh objects.
// [[ ... ]] = optional block, dropped when any variable inside it is empty.
export const defaultPresets = (): Preset[] => [
  {
    id: 'trapsoul',
    label: '🌑 TrapSoul Mix',
    title: 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
    description: [
      'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
      '',
      '[[Tracklist:\n{txt}]]',
      '',
      '#trapsoul #rnb #rnbplaylist #darkrnb',
    ].join('\n'),
    tags: ['trapsoul', 'trapsoul mix', 'dark r&b', 'smokey r&b', 'r&b playlist', 'r&b playlist {year}', '{artists}'],
    visibility: 'PRIVATE',
    // Artists listed here sort first (only those present in the tracklist); the rest by track count.
    artistPriority: ['SZA', 'Chris Brown', 'Summer Walker', 'Bryson Tiller', 'Brent Faiyaz', 'Kehlani', 'Ella Mai', 'Nessy J.', 'BLXD'],
    artistMax: 4,
  },
  {
    id: 'playlist',
    label: '🎧 Playlist + Tracklist',
    title: '{artists} | R&B Playlist[[ ({trackcount} Songs)]]',
    description: '🎧 {artists}\n\nTracklist:\n{txt}\n\n#rnb #playlist #rnbplaylist',
    tags: ['rnb', 'r&b playlist', 'rnb playlist', '{artists}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'typebeat',
    label: '🔥 Type Beat (FREE)',
    title: '[FREE] Thai Type Beat - "{name}"[[ | {bpm} BPM]]',
    description: [
      '[FREE] Thai Type Beat - "{name}"',
      '[[BPM: {bpm}]]',
      'Prod. by {producer}',
      '',
      L('💰 ซื้อบีท / Lease: (ใส่ลิงก์)', '💰 Buy / lease this beat: (add link)'),
      L('📩 ติดต่องาน: (ใส่อีเมล)', '📩 Business inquiries: (add email)'),
      '',
      L('⚠️ ใช้ฟรีแบบไม่แสวงหากำไร ต้องให้เครดิต (prod. {producer})', '⚠️ Free for non-profit use only — credit required (prod. {producer})'),
      '',
      '#typebeat #thaibeat #freebeat',
    ].join('\n'),
    tags: ['type beat', 'thai type beat', 'free beat', 'thai beat', 'instrumental', '{name}', '{producer}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'lofi',
    label: '🌙 Lofi Chill',
    title: L('{name} 🌙 Thai Lofi Chill Beat สำหรับอ่านหนังสือ / ทำงาน', '{name} 🌙 Lofi Chill Beat to Study / Work To'),
    description: L('{name} — บีทชิล ๆ สำหรับอ่านหนังสือ ทำงาน หรือพักผ่อน ☕\n\nProd. by {producer}\n\n#lofi #chillbeats #thailofi', '{name} — chill beats to study, work or relax to ☕\n\nProd. by {producer}\n\n#lofi #chillbeats #studymusic'),
    tags: ['lofi', 'thai lofi', 'chill beat', 'study music', L('เพลงอ่านหนังสือ', 'music to study to'), '{producer}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'shorts',
    label: '📱 Shorts',
    title: '{name} 🔥 #shorts #thaibeat',
    description: '{name}[[ | {bpm} BPM]]\nProd. by {producer}\n\n#shorts #beat #producer',
    tags: ['shorts', 'beat', 'producer', 'thai beat'],
    visibility: 'PRIVATE',
  },
  {
    id: 'instrumental',
    label: '🎹 Instrumental',
    title: '{name} - Instrumental (Prod. {producer})',
    description: '{name} (Instrumental)\nProd. by {producer}\n© {year} {producer}',
    tags: ['instrumental', 'beat', '{name}', '{producer}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'series',
    label: L('📺 ทำบีทสด EP', '📺 Beat Making EP'),
    title: L('ทำบีทสด EP.{n} - {name}[[ ({bpm} BPM)]]', 'Making a Beat EP.{n} - {name}[[ ({bpm} BPM)]]'),
    description: L('ทำบีทสด EP.{n} — {name}\nอัปโหลดเมื่อ {date}\n\nProd. by {producer}', 'Making a Beat EP.{n} — {name}\nUploaded {date}\n\nProd. by {producer}'),
    tags: [L('ทำบีท', 'making beats'), 'beat making', 'cook up', 'producer', '{producer}'],
    visibility: 'PRIVATE',
  },
];
```

Verify the data against the source. It should match the userscript's `DEFAULT_PRESETS` once `const DEFAULT_PRESETS = [` becomes `export const defaultPresets = (): Preset[] => [`:
```bash
diff <(git show 79a79357d4aa7101d7ea2bde5bfeede5d8389724:youtube-upload-presets.user.js | sed -n '/^  const DEFAULT_PRESETS = \[/,/^  \];/p' | sed 's/^  //' | grep -v '^ *//' ) \
     <(sed -n '/^export const defaultPresets/,/^\];/p' lib/presets.ts | grep -v '^ *//')
```
Expected: exactly one difference, the first line (`const DEFAULT_PRESETS = [` vs `export const defaultPresets = (): Preset[] => [`).

- [ ] **Step 4: Write migrations**

`extension/lib/migrations.ts`:
```ts
import { defaultPresets, type Preset } from './presets';
import { load, save } from './storage';

// Old trapsoul preset: clips without a .txt got "TrapSoul Mix | - ..." → wrap {artists} in [[ ]].
export function fixLegacyTrapsoulTitles(list: Preset[]): Preset[] {
  for (const p of list || []) {
    if (!p || p.id !== 'trapsoul') continue;
    if (p.title === 'TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}') p.title = 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}';
    if (typeof p.description === 'string') {
      p.description = p.description
        .replace('TrapSoul Mix | {artists} - Dark & Smokey R&B Playlist {year}', 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}')
        .replace('Tracklist:\n{txt}', '[[Tracklist:\n{txt}]]')
        .replace('[[[[Tracklist:', '[[Tracklist:').replace('{txt}]]]]', '{txt}]]');
    }
  }
  return list;
}

// Append new steps only — SCHEMA_VERSION follows the list length.
// legacy = the flag name used before schemaVersion existed (flag set = step already done).
interface Migration { legacy?: string; run(): Promise<void> }

export const MIGRATIONS: Migration[] = [
  { // 1: add the Playlist preset for existing installs
    legacy: 'addedPlaylist',
    async run() {
      const list = await load('presets', defaultPresets());
      if (!list.some((x) => x.id === 'playlist')) await save('presets', [defaultPresets()[1], ...list]);
    },
  },
  { // 2: add the TrapSoul preset and make it the main one
    legacy: 'addedTrapsoul',
    async run() {
      const list = await load('presets', defaultPresets());
      if (!list.some((x) => x.id === 'trapsoul')) await save('presets', [defaultPresets()[0], ...list]);
      await save('activeId', 'trapsoul');
    },
  },
  { // 3: wrap {artists} / {txt} of the old trapsoul preset in [[ ]]
    async run() { await save('presets', fixLegacyTrapsoulTitles(await load('presets', defaultPresets()))); },
  },
  { // 4: producer / label names that used to be hard-coded become settings (v4.5.0)
    legacy: 'migratedOwnNames',
    async run() {
      const s = await load<Record<string, unknown>>('settings', {});
      if (s.producer === undefined) await save('settings', { ...s, producer: 'ThaiBeats' });
      const c = await load<Record<string, unknown>>('cfg', {});
      if (c.ownNames === undefined) await save('cfg', { ...c, ownNames: 'THAIBEATS, EXMGE' });
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function runMigrations(): Promise<void> {
  // A fresh install skips every step: its defaults are already right.
  const freshInstall = (await load<unknown>('presets', undefined)) === undefined;
  if (freshInstall) return save('schemaVersion', SCHEMA_VERSION);
  let from = await load<number | null>('schemaVersion', null);
  if (from === null) {
    // Installed before schemaVersion existed: read how far the old flags got.
    from = 0;
    for (const [i, m] of MIGRATIONS.entries()) if (m.legacy && (await load(m.legacy, false))) from = i + 1;
  }
  for (let i = from; i < MIGRATIONS.length; i++) {
    try { await MIGRATIONS[i].run(); } catch (e) { console.error('[Upload Studio] migration ' + (i + 1), e); }
  }
  await save('schemaVersion', SCHEMA_VERSION);
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run tests/migrations.test.mjs && npx tsc --noEmit`
Expected: PASS, **8 tests**; no type errors.

- [ ] **Step 6: Commit**

```bash
git add extension/lib/presets.ts extension/lib/migrations.ts extension/tests/migrations.test.mjs
git commit -m "Port default presets and the schema migrations (async)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Settings

**Files:**
- Create: `extension/lib/settings.ts`
- Test: `extension/tests/settings.test.ts`

**Interfaces:**
- Consumes: `load`, `save` (Task 8); `getLang`, `Lang` (Task 8).
- Produces (`lib/settings.ts`): `interface Schedule`, `interface Settings`, `defaultSettings(legacy?: { autoApply?: boolean; autoNext?: boolean }): Settings`, `loadSettings(): Promise<Settings>`, `saveSettings(s: Settings): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`extension/tests/settings.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLang } from '../lib/i18n';
import { defaultSettings, loadSettings } from '../lib/settings';

beforeEach(() => fakeBrowser.reset());
afterEach(() => setLang('en'));

describe('settings', () => {
  it('defaults match the userscript', () => {
    const s = defaultSettings();
    expect(s.autoApply).toBe(true);
    expect(s.autoNext).toBe(false);
    expect(s.pace).toBe('slow');
    expect(s.category).toBe('Music');
    expect(s.monetization).toBe('on');
    expect(s.lockChannel).toBe(null);
    expect(s.schedule).toEqual({ on: false, start: '', every: 1, unit: 'day' });
  });

  it('reads the pre-settings autoApply / autoNext keys', async () => {
    await browser.storage.local.set({ autoApply: false, autoNext: true });
    const s = await loadSettings();
    expect(s.autoApply).toBe(false);
    expect(s.autoNext).toBe(true);
  });

  it('stored values override defaults', async () => {
    await browser.storage.local.set({ settings: { producer: 'ThaiBeats', delay: 9, glassV2: true, lang: 'en' } });
    const s = await loadSettings();
    expect(s.producer).toBe('ThaiBeats');
    expect(s.delay).toBe(9);
  });

  it('moves the old 72% glass default to 82% once and records the language', async () => {
    setLang('th');
    await browser.storage.local.set({ settings: { glass: 72 } });
    const s = await loadSettings();
    expect(s.glass).toBe(82);
    expect(s.glassV2).toBe(true);
    expect(s.lang).toBe('th');
    const { settings } = await browser.storage.local.get('settings');
    expect(settings).toMatchObject({ glass: 82, glassV2: true, lang: 'th' });
  });

  it('leaves a user-chosen glass value alone', async () => {
    await browser.storage.local.set({ settings: { glass: 60 } });
    expect((await loadSettings()).glass).toBe(60);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL — cannot resolve `../lib/settings`.

- [ ] **Step 3: Implement**

`extension/lib/settings.ts`:
```ts
import { getLang, type Lang } from './i18n';
import { load, save } from './storage';

// First clip goes out at `start`, each next one `every` hours/days later.
export interface Schedule { on: boolean; start: string; every: number; unit: 'hour' | 'day' }

export interface Settings {
  autoApply: boolean; // manual single-file upload → fill in details
  autoNext: boolean; // click Next to the Visibility step
  autoSave: boolean; // queue mode: click Save
  thumb: boolean; // queue mode: upload the same-named image as thumbnail
  thumbWaitMin: number; // max minutes to wait for the upload before setting the thumbnail
  intercept: boolean; // route multi-file picks in Studio's dialog into the queue
  delay: number; // seconds to pause between files
  pace: 'normal' | 'slow' | 'slower'; // stretches every wait (x1 / x1.6 / x2.5)
  year: string; // {year}; empty = this year
  confirmStart: boolean; // confirm the channel before starting the queue
  category: string; // as Studio shows it; empty = don't set
  alteredContent: 'skip' | 'no' | 'yes'; // AI use
  paidPromotion: 'skip' | 'no' | 'yes';
  monetization: 'on' | 'off' | 'skip';
  adSuitability: 'none' | 'skip';
  producer: string; // {producer}; empty = current channel name
  lockChannel: { id: string; name: string } | null; // only allow uploads to this channel
  autoAcceptInvite: boolean;
  quickActions: boolean; // buttons under Studio's title/description
  glass: number; // panel opacity % (removed with the side panel in Phase 3)
  notify: boolean; // desktop notification + sound when the queue ends
  schedule: Schedule;
  glassV2?: boolean;
  lang?: Lang;
}

export const defaultSettings = (legacy: { autoApply?: boolean; autoNext?: boolean } = {}): Settings => ({
  autoApply: legacy.autoApply ?? true,
  autoNext: legacy.autoNext ?? false,
  autoSave: true,
  thumb: true,
  thumbWaitMin: 120,
  intercept: true,
  delay: 3,
  pace: 'slow',
  year: '',
  confirmStart: true,
  category: 'Music',
  alteredContent: 'skip',
  paidPromotion: 'no',
  monetization: 'on',
  adSuitability: 'none',
  producer: '',
  lockChannel: null,
  autoAcceptInvite: true,
  quickActions: true,
  glass: 82,
  notify: true,
  schedule: { on: false, start: '', every: 1, unit: 'day' },
});

export const saveSettings = (s: Settings) => save('settings', s);

export async function loadSettings(): Promise<Settings> {
  const [autoApply, autoNext, stored] = await Promise.all([
    load('autoApply', true),
    load('autoNext', false),
    load<Partial<Settings>>('settings', {}),
  ]);
  const s = Object.assign(defaultSettings({ autoApply, autoNext }), stored);
  let dirty = false;
  // Design B: 72% looked washed out → new default 82%, moved once if still on the old default
  if (!s.glassV2) {
    if (s.glass === 72) s.glass = 82;
    s.glassV2 = true;
    dirty = true;
  }
  if (s.lang === undefined) {
    s.lang = getLang();
    dirty = true;
  }
  if (dirty) await saveSettings(s);
  return s;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/settings.test.ts && npx tsc --noEmit`
Expected: PASS, 5 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/settings.ts extension/tests/settings.test.ts
git commit -m "Port settings defaults and load-time fix-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Template variables and rendering

**Files:**
- Create: `extension/lib/template.ts`
- Test: `extension/tests/template.test.mjs` (ported)

**Interfaces:**
- Consumes: `VARS`, `VIDEO_EXT`, `TITLE_MAX`, `DESC_MAX` (Task 9); `Preset` (Task 10).
- Produces (`lib/template.ts`): `pad`, `parseTracks(txt, priority?)`, `interface VarsEnv { year: string; producer: string; channelName: string }`, `interface BuildOpts { preset?: Partial<Preset>; artists?: string }`, `interface Vars`, `buildVars(rawName, n, txt?, opt?, env?)`, `render`, `clean`, `renderTitle`, `makeTitle`, `unknownVars`, `renderTags`, `renderDescFull`, `renderDesc`.
- **The one deliberate change from the userscript:** `buildVars` takes `env` as a 5th parameter instead of reading the global `settings` and `getChannel()`. `producer` becomes `env.producer || env.channelName`.

- [ ] **Step 1: Port the test (header swap only)**

Run from `extension/`:
```bash
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as T from '../lib/template';
import { DESC_MAX, TITLE_MAX } from '../lib/constants';

// The userscript read the global settings and the current channel; the module takes them as env.
const settings = { year: '', producer: '' };
const channel = { name: 'Test Channel' };
const S = {
  ...T,
  DESC_MAX,
  TITLE_MAX,
  buildVars: (rawName, n, txt, opt) =>
    T.buildVars(rawName, n, txt, opt, { year: settings.year, producer: settings.producer, channelName: channel.name }),
};
EOF
tail -n +4 ../test/template.test.mjs; } > tests/template.test.mjs
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/template.test.mjs`
Expected: FAIL — cannot resolve `../lib/template`.

- [ ] **Step 3: Implement**

`extension/lib/template.ts`:
```ts
import { DESC_MAX, TITLE_MAX, VARS, VIDEO_EXT } from './constants';
import type { Preset } from './presets';

export const pad = (x: number | string) => String(x).padStart(2, '0');

// Reads a tracklist: "01:03:05 Kehlani - Folded (Cover by BLXD)" → song + artists
export function parseTracks(txt: unknown, priority: string[] = []) {
  const tracks = String(txt || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*[-–|]?\s*/, '').replace(/^\d{1,3}\.\s*/, '').trim())
    .filter(Boolean);
  const count = new Map<string, { name: string; n: number; first: number }>(); // lower-case key → { name, n, first }
  const add = (raw: string) => {
    for (const a of raw.split(/\s+(?:x|ft\.?|feat\.?|&|and)\s+|,\s*/i)) {
      const name = a.replace(/^(?:ft\.?|feat\.?)\s+/i, '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const c = count.get(key) || { name, n: 0, first: count.size };
      c.n++;
      count.set(key, c);
    }
  };
  for (const t of tracks) {
    const [artistPart, ...rest] = t.split(/\s[-–]\s/);
    if (!rest.length) continue;
    add(artistPart);
    // featured artists in the song title, e.g. "Waiting On Me (ft. Brent Faiyaz)"
    const song = rest.join(' - ');
    const feat = song.match(/\((?:ft\.?|feat\.?)\s+([^)]+)\)/i) || song.match(/\s(?:ft\.?|feat\.?)\s*([^()]+)$/i);
    if (feat) add(feat[1]);
  }
  const prio = priority.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  const rank = (c: { name: string }) => {
    const i = prio.indexOf(c.name.toLowerCase());
    return i === -1 ? Infinity : i;
  };
  const artistList = [...count.values()]
    .sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.first - b.first)
    .map((c) => c.name);
  return { track1: tracks[0] || '', trackcount: tracks.length ? String(tracks.length) : '', artistList };
}

export interface VarsEnv { year: string; producer: string; channelName: string }
// preset = the preset in use (artistPriority / artistMax); artists = names typed on the queue card
export interface BuildOpts { preset?: Partial<Preset>; artists?: string }
export interface Vars {
  name: string; filename: string; bpm: string; n: string; date: string; year: string; producer: string;
  txt: string; track1: string; trackcount: string; artists: string;
  _artists: string[]; // internal: used to shorten titles that run over TITLE_MAX
  [k: string]: unknown;
}

export function buildVars(
  rawName: unknown, n: number | string, txt: unknown = '', opt: BuildOpts = {},
  env: VarsEnv = { year: '', producer: '', channelName: '' },
): Vars {
  const base = String(rawName || '').replace(VIDEO_EXT, '').trim();
  const bpm = (base.match(/(\d{2,3})\s*bpm/i) || [])[1] || '';
  const name = base
    .replace(/(\d{2,3})\s*bpm/gi, '')
    .replace(/_+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–|,.]+|[\s\-–|,.]+$/g, '');
  const d = new Date();
  const p = opt.preset || {};
  const { artistList, ...tr } = parseTracks(txt, p.artistPriority || []);
  const max = Math.max(1, Number(p.artistMax) || 4);
  const manual = (opt.artists || '').trim();
  const shown = manual ? [] : artistList.slice(0, max);
  return {
    name: name || base,
    filename: base,
    bpm,
    n: String(n),
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    year: String(env.year || d.getFullYear()),
    producer: env.producer || env.channelName,
    txt: String(txt || '').replace(/\r\n/g, '\n').trim(),
    ...tr,
    artists: manual || shown.join(', '),
    _artists: shown,
  };
}

export function render(tpl: unknown, vars: Record<string, unknown>): string {
  return String(tpl || '')
    .replace(/\[\[([\s\S]*?)\]\]/g, (_, inner: string) => {
      const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      return keys.every((k) => vars[k]) ? inner : '';
    })
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
    .replace(/\n{3,}/g, '\n\n');
}

// YouTube rejects < and > in titles and descriptions
export const clean = (s: unknown) => String(s).replace(/[<>]/g, '');
export const renderTitle = (tpl: unknown, vars: Record<string, unknown>) => clean(render(tpl, vars)).replace(/\s+/g, ' ').trim();

// Title over 100 characters → drop one artist at a time until it fits
export function makeTitle(p: Pick<Preset, 'title'>, vars: Vars): string {
  let t = renderTitle(p.title, vars);
  for (let k = vars._artists.length - 1; t.length > TITLE_MAX && k >= 1; k--) {
    t = renderTitle(p.title, { ...vars, artists: vars._artists.slice(0, k).join(', ') });
  }
  return t.slice(0, TITLE_MAX);
}

// render() leaves unknown variables in place ({artist} typo would reach YouTube) → warn in the preview
export const unknownVars = (p: Partial<Preset>) =>
  [...new Set([p.title || '', p.description || '', ...(p.tags || [])].join('\n').match(/\{\w+\}/g) || [])]
    .filter((v) => !VARS.includes(v.slice(1, -1)));

export const renderTags = (p: Partial<Preset>, vars: Record<string, unknown>) => [
  ...new Set(
    (p.tags || [])
      .flatMap((t) => render(t, vars).split(/,|\s+x\s+/i))
      .map((t) => clean(t).trim())
      .filter(Boolean),
  ),
];

// A preset without {txt} still gets the clip's .txt appended to the description
export function renderDescFull(p: Partial<Preset>, vars: Record<string, unknown>): string {
  let d = render(p.description, vars).trim();
  if (vars.txt && !/\{txt\}/.test(p.description || '')) d = d ? `${d}\n\n${vars.txt}` : String(vars.txt);
  return clean(d);
}
export const renderDesc = (p: Partial<Preset>, vars: Record<string, unknown>) => renderDescFull(p, vars).slice(0, DESC_MAX);
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/template.test.mjs && npx tsc --noEmit`
Expected: PASS, **26 tests**; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/template.ts extension/tests/template.test.mjs
git commit -m "Port template variables and rendering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Chapter checks and MP4 duration

**Files:**
- Create: `extension/lib/chapters.ts`
- Test: `extension/tests/chapters.test.mjs` (ported), `extension/tests/chapters-mp4.test.ts` (new)

**Interfaces:**
- Consumes: `L` (Task 8); `DESC_MAX` (Task 9); `pad` (Task 12).
- Produces (`lib/chapters.ts`): `fmtTs(s: number): string`, `interface TracklistCheck { errors: string[]; warnings: string[]; count: number }`, `checkTracklist(description: string, fullLength: number, duration: number): TracklistCheck`, `fixChapters(text: string): { text: string; changes: string[] }`, `mp4Duration(file: Blob): Promise<number>`.
- `videoDurationOnce` / `videoDuration` need the DOM `<video>` element, so they stay for Phase 2's content script.

- [ ] **Step 1: Port the test and write the new one**

Run from `extension/`:
```bash
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as S from '../lib/chapters';
EOF
tail -n +4 ../test/chapters.test.mjs; } > tests/chapters.test.mjs
```

`extension/tests/chapters-mp4.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mp4Duration } from '../lib/chapters';

function box(type: string, payload: Uint8Array): Uint8Array {
  const b = new Uint8Array(8 + payload.length);
  new DataView(b.buffer).setUint32(0, b.length);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  b.set(payload, 8);
  return b;
}
// mvhd version 0: version+flags, creation, modification, timescale, duration (4 bytes each)
function mvhd(timescale: number, duration: number): Uint8Array {
  const p = new Uint8Array(20);
  const dv = new DataView(p.buffer);
  dv.setUint32(12, timescale);
  dv.setUint32(16, duration);
  return box('mvhd', p);
}

describe('mp4Duration', () => {
  it('reads the duration from moov > mvhd', async () => {
    const file = new Blob([box('ftyp', new Uint8Array(8)), box('moov', mvhd(1000, 754_000))]);
    expect(await mp4Duration(file)).toBe(754);
  });

  it('finds moov after mdat (moov at the end of the file)', async () => {
    const file = new Blob([box('ftyp', new Uint8Array(8)), box('mdat', new Uint8Array(4096)), box('moov', mvhd(600, 1800))]);
    expect(await mp4Duration(file)).toBe(3);
  });

  it('returns 0 for a file that is not MP4', async () => {
    expect(await mp4Duration(new Blob(['just some text, not boxes']))).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/chapters.test.mjs tests/chapters-mp4.test.ts`
Expected: FAIL — cannot resolve `../lib/chapters`.

- [ ] **Step 3: Implement**

`extension/lib/chapters.ts`:
```ts
import { DESC_MAX } from './constants';
import { L } from './i18n';
import { pad } from './template';

// YouTube's chapter rules, checked on the description that will actually be uploaded:
// first stamp 0:00, at least 3, ascending, each ≥ 10 s, within the video length,
// and the description within 5000 characters (otherwise the end of the tracklist is cut).
export const fmtTs = (s: number) => { s = Math.round(s); const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (hh ? hh + ':' + pad(m) : m) + ':' + pad(x); };

export interface TracklistCheck { errors: string[]; warnings: string[]; count: number }

export function checkTracklist(description: string, fullLength: number, duration: number): TracklistCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stamps: { t: number; line: number; name: string }[] = [];
  description.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*[[(]?(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})\b[\])]?\s*[-–|.:]?\s*(.*)$/);
    if (!m) return;
    const [hh, mm, ss] = [m[1], m[2], m[3]].map((x) => (x === undefined ? 0 : +x));
    if (ss > 59 || (m[1] !== undefined && mm > 59)) { errors.push(L(`บรรทัด ${i + 1}: เวลา "${line.trim().split(/\s/)[0]}" ไม่ถูกต้อง`, `Line ${i + 1}: invalid time "${line.trim().split(/\s/)[0]}"`)); return; }
    stamps.push({ t: hh * 3600 + mm * 60 + ss, line: i + 1, name: m[4].trim() });
  });
  if (fullLength > DESC_MAX) warnings.push(L(`คำอธิบายยาว ${fullLength} ตัวอักษร เกิน ${DESC_MAX} — ส่วนท้ายจะถูกตัด`, `Description is ${fullLength} characters, over ${DESC_MAX} — the end will be cut off`));
  if (!stamps.length) return { errors, warnings, count: 0 };
  if (stamps[0].t !== 0) errors.push(L(`timestamp แรกต้องเป็น 0:00 (ตอนนี้ ${fmtTs(stamps[0].t)})`, `First timestamp must be 0:00 (currently ${fmtTs(stamps[0].t)})`));
  if (stamps.length < 3) errors.push(L(`ต้องมีอย่างน้อย 3 timestamp (มี ${stamps.length})`, `Needs at least 3 timestamps (has ${stamps.length})`));
  for (let k = 1; k < stamps.length; k++) {
    const gap = stamps[k].t - stamps[k - 1].t;
    if (gap <= 0) errors.push(L(`บรรทัด ${stamps[k].line}: ${fmtTs(stamps[k].t)} ไม่ได้มาหลัง ${fmtTs(stamps[k - 1].t)}`, `Line ${stamps[k].line}: ${fmtTs(stamps[k].t)} doesn't come after ${fmtTs(stamps[k - 1].t)}`));
    else if (gap < 10) errors.push(L(`บรรทัด ${stamps[k - 1].line}: ช่วงยาวแค่ ${gap} วินาที (ต้อง ≥ 10)`, `Line ${stamps[k - 1].line}: chapter is only ${gap}s long (needs ≥ 10)`));
  }
  const last = stamps[stamps.length - 1];
  if (duration > 0) {
    const over = stamps.filter((s) => s.t >= duration);
    if (over.length) errors.push(L(`${over.length} timestamp เกินความยาวคลิป (${fmtTs(duration)}) เช่นบรรทัด ${over[0].line}: ${fmtTs(over[0].t)}`, `${over.length} timestamp(s) beyond the video length (${fmtTs(duration)}), e.g. line ${over[0].line}: ${fmtTs(over[0].t)}`));
    else if (duration - last.t < 10) errors.push(L(`ช่วงสุดท้ายยาวแค่ ${Math.floor(duration - last.t)} วินาที (ต้อง ≥ 10)`, `Last chapter is only ${Math.floor(duration - last.t)}s long (needs ≥ 10)`));
  }
  const seen = new Map<string, number>();
  for (const s of stamps) {
    const k = s.name.toLowerCase().replace(/\s+/g, ' ');
    if (k && seen.has(k)) warnings.push(L(`เพลงซ้ำ: "${s.name}" (บรรทัด ${seen.get(k)} และ ${s.line})`, `Duplicate song: "${s.name}" (lines ${seen.get(k)} and ${s.line})`));
    else if (k) seen.set(k, s.line);
  }
  return { errors, warnings, count: stamps.length };
}

// Fixes what can be fixed without guessing: first stamp not 0:00, and stamp lines out of
// order (only the times / stamp lines move; other text stays). Chapters under 10 s or past
// the end can't be fixed. changes empty = nothing fixable.
export function fixChapters(text: string): { text: string; changes: string[] } {
  const RE = /^(\s*[[(]?)((?:\d{1,2}:)?\d{1,3}:\d{1,2})(\b.*)$/;
  const lines = String(text).split('\n');
  const idx: number[] = [];
  lines.forEach((l, i) => { if (RE.test(l)) idx.push(i); });
  if (!idx.length) return { text, changes: [] };
  const secs = (l: string) => l.match(RE)![2].split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
  const changes: string[] = [];
  const ts = idx.map((i) => lines[i]);
  const sorted = [...ts].sort((a, b) => secs(a) - secs(b));
  if (sorted.some((l, k) => l !== ts[k])) {
    sorted.forEach((l, k) => { lines[idx[k]] = l; });
    changes.push(L('เรียงบรรทัด timestamp ตามเวลา', 'Sorted the timestamp lines by time'));
  }
  const first = lines[idx[0]];
  if (secs(first) !== 0) {
    const m = first.match(RE)!;
    lines[idx[0]] = m[1] + (m[2].split(':').length === 3 ? '0:00:00' : '0:00') + m[3];
    changes.push(L(`timestamp แรก ${m[2]} → 0:00`, `First timestamp ${m[2]} → 0:00`));
  }
  return { text: lines.join('\n'), changes };
}

// Duration straight from the MP4/MOV header (moov > mvhd) without a video player.
// Reads 16-byte box headers plus the moov box itself, so a 1.5 GB file is fast.
export async function mp4Duration(file: Blob): Promise<number> {
  const read = async (o: number, n: number) => new DataView(await file.slice(o, o + n).arrayBuffer());
  const type = (dv: DataView, p: number) => String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
  let off = 0;
  for (let guard = 0; off + 8 <= file.size && guard < 2000; guard++) {
    const hd = await read(off, 16);
    if (hd.byteLength < 8) break;
    let len = hd.getUint32(0);
    let hdr = 8;
    if (len === 1 && hd.byteLength >= 16) { len = Number(hd.getBigUint64(8)); hdr = 16; } else if (len === 0) len = file.size - off;
    if (len < hdr) break;
    if (type(hd, 0) === 'moov') {
      const mv = await read(off + hdr, Math.min(len - hdr, 64 << 20));
      for (let p = 0; p + 8 <= mv.byteLength;) {
        const l = mv.getUint32(p);
        if (type(mv, p) === 'mvhd') {
          const v1 = mv.getUint8(p + 8) === 1;
          const ts = mv.getUint32(p + (v1 ? 28 : 20));
          const du = v1 ? Number(mv.getBigUint64(p + 32)) : mv.getUint32(p + 24);
          return ts ? du / ts : 0;
        }
        if (l < 8) break;
        p += l;
      }
      return 0;
    }
    off += len;
  }
  return 0;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/chapters.test.mjs tests/chapters-mp4.test.ts && npx tsc --noEmit`
Expected: PASS, **20** ported + 3 new tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/chapters.ts extension/tests/chapters.test.mjs extension/tests/chapters-mp4.test.ts
git commit -m "Port chapter checks/fixes and the MP4 header reader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Tracklist trimming and activity

**Files:**
- Create: `extension/lib/tracklist.ts`, `extension/lib/activity.ts`
- Test: `extension/tests/tracklist.test.mjs`, `extension/tests/activity.test.mjs` (ported)

**Interfaces:**
- Consumes: `TXT` (Task 9).
- Produces:
  - `lib/tracklist.ts`: `parseTime(t: string): number`, `fixTracklist(text: unknown, segments: [number, number][], videoLength: number): { text: string; removed: string[]; kept: number }`.
  - `lib/activity.ts`: `parseUploadPct(text: unknown): number | null`, `interface QueueSummary`, `interface ClaimsStatus`, `interface UploadProgress`, `interface Activity`, `activityFrom(q, claims, prog): Activity | null`.

- [ ] **Step 1: Port both tests**

Run from `extension/`:
```bash
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as S from '../lib/tracklist';
EOF
tail -n +4 ../test/tracklist.test.mjs; } > tests/tracklist.test.mjs
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as S from '../lib/activity';
EOF
tail -n +4 ../test/activity.test.mjs; } > tests/activity.test.mjs
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/tracklist.test.mjs tests/activity.test.mjs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`extension/lib/tracklist.ts`:
```ts
export const parseTime = (t: string) => t.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);

// After trimming claimed segments: shift every timestamp back by what was cut before it,
// drop tracks that lost half or more of their length, and restart the first kept track at 00:00.
export function fixTracklist(text: unknown, segments: [number, number][], videoLength: number) {
  const segs: [number, number][] = [];
  for (const [a, b] of segments.map(([a, b]): [number, number] => [Math.max(0, a), Math.max(a, b)]).sort((x, y) => x[0] - y[0])) {
    const last = segs[segs.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else segs.push([a, b]);
  }
  const removedBefore = (t: number) => segs.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(t, b) - a), 0);
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const tracks: { idx: number; start: number; sep: string; rest: string; end: number }[] = [];
  lines.forEach((line, idx) => {
    const m = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(\s*[-–|]?\s*)(.*)$/);
    if (m) tracks.push({ idx, start: parseTime(m[1]), sep: m[2], rest: m[3], end: 0 });
  });
  tracks.forEach((t, i) => { t.end = i + 1 < tracks.length ? tracks[i + 1].start : (videoLength || t.start); });
  const total = Math.max(0, (videoLength || 0) - removedBefore(videoLength || 0));
  const longFmt = total >= 3600 || tracks.some((t) => t.start >= 3600);
  const tf = (sec: number) => {
    sec = Math.max(0, Math.round(sec));
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return longFmt ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  const removed: string[] = [];
  const out: (string | null)[] = lines.slice();
  let firstKept = true;
  for (const t of tracks) {
    const dur = Math.max(0, t.end - t.start);
    const cut = removedBefore(t.end) - removedBefore(t.start);
    if (dur > 0 ? cut / dur >= 0.5 : false) {
      removed.push(t.rest);
      out[t.idx] = null;
      continue;
    }
    let ns = t.start - removedBefore(t.start);
    if (firstKept) { ns = 0; firstKept = false; } // chapters must start at 00:00
    out[t.idx] = tf(ns) + (t.sep || ' ') + t.rest;
  }
  return { text: out.filter((l) => l !== null).join('\n'), removed, kept: tracks.length - removed.length };
}
```

`extension/lib/activity.ts`:
```ts
import { TXT } from './studio/txt';

// Two pure functions for the progress bar — no DOM, queue or settings here.

// Percentage out of Studio's progress text, e.g. "Uploading 45% … 3 minutes left".
// Returns 0..1, or null when there is no percentage (the bar falls back to counting clips).
export function parseUploadPct(text: unknown): number | null {
  const m = String(text || '').match(TXT.uploadPct);
  if (!m) return null;
  return Math.max(0, Math.min(1, +m[1] / 100));
}

export interface QueueSummary { running: boolean; inFlight: boolean; total: number; done: number; errors: number }
export interface ClaimsStatus { kind: string; icon?: string; title?: string; detail?: string; progress?: number }
export interface UploadProgress { pct?: number | null; text?: string }
export interface Activity {
  task: 'upload' | 'claims';
  icon: string;
  tab: 'queue' | 'claims';
  count: { at: number; of: number } | null;
  title: string;
  detail: string;
  progress: number | null;
}

// What is running right now — one task, or null when idle. The upload queue always wins:
// a claim scan is read-only and can overlap an upload. The bar is based on `done` (same as
// the Queue tab); errored clips don't move the bar but do move the counter.
export function activityFrom(q: QueueSummary, claims: ClaimsStatus | null, prog: UploadProgress | null): Activity | null {
  if (q.running || q.inFlight) {
    const pct = prog && typeof prog.pct === 'number' ? prog.pct : 0;
    return {
      task: 'upload',
      icon: '⬆',
      tab: 'queue',
      count: { at: q.done + q.errors + 1, of: q.total },
      title: '', // the caller fills this through L(), because this function must stay pure
      detail: (prog && prog.text) || '',
      progress: q.total ? Math.min(1, (q.done + pct) / q.total) : null,
    };
  }
  // computeStatus() also reports idle states ('ready' / 'Auto-pilot on') → only busy and wait count
  if (claims && (claims.kind === 'busy' || claims.kind === 'wait')) {
    return {
      task: 'claims',
      icon: claims.icon || '',
      tab: 'claims',
      count: null,
      title: claims.title || '',
      detail: claims.detail || '',
      progress: typeof claims.progress === 'number' ? claims.progress : null,
    };
  }
  return null;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/tracklist.test.mjs tests/activity.test.mjs && npx tsc --noEmit`
Expected: PASS, **11 + 16 tests**; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/tracklist.ts extension/lib/activity.ts extension/tests/tracklist.test.mjs extension/tests/activity.test.mjs
git commit -m "Port tracklist trimming and the activity model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Backup import and export

**Files:**
- Create: `extension/lib/backup.ts`
- Test: `extension/tests/backup.test.ts`

**Interfaces:**
- Consumes: `Preset` (Task 10); `fixLegacyTrapsoulTitles`, `SCHEMA_VERSION`, `runMigrations` (Task 10); `Settings`, `defaultSettings` (Task 11); `VISIBILITIES` (Task 9).
- Produces (`lib/backup.ts`):
  - `BACKUP_APP = 'yt-upload-presets'`, `BACKUP_FORMAT = 1`, `PERSONAL_SETTINGS = ['producer', 'schedule']`
  - `cleanPresets(list: unknown): Preset[] | null`
  - `parseBackup(text: string): ParsedBackup`, where `ParsedBackup = { ok: true; data: Record<string, unknown>; presets: Preset[] } | { ok: false; reason: 'json' | 'notBackup' | 'newerFormat'; format?: number }`
  - `applyBackup(data, presets, own: boolean, cur: { settings: Settings; cfg: Record<string, unknown> }): BackupWrites`
  - `writeBackup(w: BackupWrites): Promise<void>`
  - `buildBackup(state, version: string, now?: Date): BackupFile`
- Same rules as the userscript's `importBackup` / `exportBackup`. Phase 3 adds the confirm dialog and download link. **One addition:** `applyBackup` also writes `schemaVersion = SCHEMA_VERSION`, because the export comes from an already-migrated userscript. Without it, `runMigrations()` would treat the import as a pre-schema install and re-add the Playlist/TrapSoul presets.
- What doesn't carry over (same as today's backup): upload history, per-channel copyright data, locked channel, language.

- [ ] **Step 1: Write the failing test**

`extension/tests/backup.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyBackup, buildBackup, parseBackup, writeBackup } from '../lib/backup';
import { runMigrations, SCHEMA_VERSION } from '../lib/migrations';
import type { Preset } from '../lib/presets';
import { defaultSettings } from '../lib/settings';

beforeEach(() => fakeBrowser.reset());

const mine: Preset = { id: 'mine', label: 'Mine', title: '{name}', description: '', tags: ['a'], visibility: 'PUBLIC' };
const exported = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'yt-upload-presets', format: 1, version: '4.26.1', exportedAt: '2026-10-05T00:00:00.000Z',
    presets: [mine], activeId: 'mine', counters: { mine: 7, bad: 'x' },
    settings: { producer: 'Them', delay: 5, pace: 'slower', lockChannel: { id: 'UC1', name: 'X' }, lang: 'th', bogus: 1, notify: 'yes',
      schedule: { on: true, start: '2026-10-06T10:00', every: '3', unit: 'week' } },
    claimsCfg: { ownNames: 'THEIR LABEL', apEveryHours: '12', nested: { no: 1 } },
    ...over,
  });
const cur = () => ({ settings: { ...defaultSettings(), producer: 'Me', lang: 'en' as const }, cfg: { ownNames: 'MY LABEL' } });

describe('parseBackup', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, reason: 'json' });
  });
  it('rejects JSON that is not our backup', () => {
    expect(parseBackup('{"app":"other","presets":[]}')).toEqual({ ok: false, reason: 'notBackup' });
    expect(parseBackup(exported({ presets: [{ id: 'x' }] }))).toEqual({ ok: false, reason: 'notBackup' });
  });
  it('rejects a newer format', () => {
    expect(parseBackup(exported({ format: 2 }))).toEqual({ ok: false, reason: 'newerFormat', format: 2 });
  });
  it('cleans presets', () => {
    const r = parseBackup(exported({ presets: [{ id: 'p', label: 'P', tags: ['t', 3], visibility: 'NOPE', artistMax: '0' }] }));
    expect(r.ok && r.presets[0]).toMatchObject({ title: '{name}', description: '', tags: ['t'], artistPriority: [], artistMax: 4, visibility: 'PRIVATE' });
  });
});

describe('applyBackup', () => {
  const parsed = () => { const r = parseBackup(exported()); if (!r.ok) throw new Error('fixture'); return r; };

  it('someone else\'s file: general settings only, personal values kept', () => {
    const { data, presets } = parsed();
    const w = applyBackup(data, presets, false, cur());
    expect(w.presets.map((p) => p.id)).toEqual(['mine']);
    expect(w.activeId).toBe('mine');
    expect(w.schemaVersion).toBe(SCHEMA_VERSION);
    expect(w.settings).toMatchObject({ producer: 'Me', delay: 5, pace: 'slower', lang: 'en', lockChannel: null });
    expect(w.settings?.schedule).toEqual(defaultSettings().schedule);
    expect(w.settings).not.toHaveProperty('bogus');
    expect(w.settings?.notify).toBe(true); // wrong type in the file is ignored
    expect(w.cfg).toEqual({ ownNames: 'MY LABEL', apEveryHours: '12' });
    expect(w.counters).toBeUndefined();
  });

  it('my own file: personal values too, schedule sanitized, counters filtered', () => {
    const { data, presets } = parsed();
    const w = applyBackup(data, presets, true, cur());
    expect(w.settings?.producer).toBe('Them');
    expect(w.settings?.schedule).toEqual({ on: true, start: '2026-10-06T10:00', every: 3, unit: 'day' });
    expect(w.cfg?.ownNames).toBe('THEIR LABEL');
    expect(w.counters).toEqual({ mine: 7 });
  });

  it('falls back to the first preset when activeId is unknown', () => {
    const r = parseBackup(exported({ activeId: 'gone' }));
    if (!r.ok) throw new Error('fixture');
    expect(applyBackup(r.data, r.presets, false, cur()).activeId).toBe('mine');
  });
});

describe('writeBackup', () => {
  it('writes the keys and later migrations leave the imported presets alone', async () => {
    const r = parseBackup(exported());
    if (!r.ok) throw new Error('fixture');
    await writeBackup(applyBackup(r.data, r.presets, true, cur()));
    await runMigrations();
    const got = await browser.storage.local.get(['presets', 'activeId', 'schemaVersion']);
    expect((got.presets as Preset[]).map((p) => p.id)).toEqual(['mine']);
    expect(got.activeId).toBe('mine');
    expect(got.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('buildBackup', () => {
  it('round-trips through parseBackup and leaves out the locked channel and language', () => {
    const settings = { ...defaultSettings(), producer: 'Me', lockChannel: { id: 'UC1', name: 'X' }, lang: 'th' as const };
    const file = buildBackup({ presets: [mine], activeId: 'mine', counters: { mine: 2 }, settings, cfg: { ownNames: 'MY' } }, '5.0.0', new Date('2026-10-05T00:00:00Z'));
    expect(file).toMatchObject({ app: 'yt-upload-presets', format: 1, version: '5.0.0', exportedAt: '2026-10-05T00:00:00.000Z' });
    expect(file.settings).not.toHaveProperty('lockChannel');
    expect(file.settings).not.toHaveProperty('lang');
    const r = parseBackup(JSON.stringify(file));
    expect(r.ok && r.presets).toEqual([{ ...mine, artistPriority: [], artistMax: 4 }]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/backup.test.ts`
Expected: FAIL — cannot resolve `../lib/backup`.

- [ ] **Step 3: Implement**

`extension/lib/backup.ts`:
```ts
import { browser } from 'wxt/browser';
import { VISIBILITIES, type Visibility } from './constants';
import { fixLegacyTrapsoulTitles, SCHEMA_VERSION } from './migrations';
import type { Preset } from './presets';
import type { Settings } from './settings';

// Backup file = presets + settings, JSON. Same format as the userscript's
// Settings → Backup / share, so a userscript export imports here unchanged.
// Excluded: locked channel, language, upload history, copyright history.
// Personal values (producer, schedule, own artist names, EP numbers) are only
// imported when the user confirms the file is their own.
export const BACKUP_APP = 'yt-upload-presets';
export const BACKUP_FORMAT = 1; // bump when older versions can no longer read the file fully
export const PERSONAL_SETTINGS = ['producer', 'schedule'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// Normalise presets from a file (wrong types would break the panel).
export function cleanPresets(list: unknown): Preset[] | null {
  if (!Array.isArray(list) || !list.length) return null;
  const ids = new Set<string>();
  const out: Preset[] = [];
  for (const p of list) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id || typeof p.label !== 'string' || ids.has(p.id)) return null;
    ids.add(p.id);
    out.push({
      ...(p as unknown as Preset),
      title: typeof p.title === 'string' ? p.title : '{name}',
      description: typeof p.description === 'string' ? p.description : '',
      tags: strList(p.tags),
      artistPriority: strList(p.artistPriority),
      artistMax: Math.max(1, parseInt(String(p.artistMax), 10) || 4),
      visibility: VISIBILITIES.includes(p.visibility as Visibility) ? (p.visibility as Visibility) : 'PRIVATE',
    });
  }
  return out;
}

export type ParsedBackup =
  | { ok: true; data: Record<string, unknown>; presets: Preset[] }
  | { ok: false; reason: 'json' | 'notBackup' | 'newerFormat'; format?: number };

export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'json' }; }
  const presets = isObj(data) && data.app === BACKUP_APP ? cleanPresets(data.presets) : null;
  if (!isObj(data) || !presets) return { ok: false, reason: 'notBackup' };
  const format = Number(data.format) || 1;
  if (format > BACKUP_FORMAT) return { ok: false, reason: 'newerFormat', format };
  return { ok: true, data, presets };
}

export interface BackupWrites {
  presets: Preset[];
  activeId: string;
  schemaVersion: number;
  settings?: Settings;
  cfg?: Record<string, unknown>;
  counters?: Record<string, number>;
}

export function applyBackup(
  data: Record<string, unknown>, presets: Preset[], own: boolean,
  cur: { settings: Settings; cfg: Record<string, unknown> },
): BackupWrites {
  const w: BackupWrites = {
    presets: fixLegacyTrapsoulTitles(presets),
    activeId: presets.some((p) => p.id === data.activeId) ? (data.activeId as string) : presets[0].id,
    // the file comes from an already-migrated install
    schemaVersion: SCHEMA_VERSION,
  };
  if (isObj(data.settings)) {
    const base = cur.settings as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(data.settings)) {
      if (!(k in base) || k === 'lockChannel' || k === 'lang' || (!own && PERSONAL_SETTINGS.includes(k))) continue;
      if (k === 'schedule') {
        if (isObj(v)) next.schedule = { ...cur.settings.schedule, on: !!v.on, start: typeof v.start === 'string' ? v.start : '', every: Math.max(1, parseInt(String(v.every), 10) || 1), unit: v.unit === 'hour' ? 'hour' : 'day' };
        continue;
      }
      if (typeof v === typeof base[k]) next[k] = v; // the type must match the current value
    }
    w.settings = next as unknown as Settings;
  }
  if (isObj(data.claimsCfg)) {
    const c = { ...cur.cfg };
    for (const [k, v] of Object.entries(data.claimsCfg)) {
      if (!own && k === 'ownNames') continue;
      if (['string', 'boolean', 'number'].includes(typeof v)) c[k] = v;
    }
    w.cfg = c;
  }
  if (own && isObj(data.counters)) {
    w.counters = Object.fromEntries(Object.entries(data.counters).filter(([, v]) => Number.isFinite(v))) as Record<string, number>;
  }
  return w;
}

export const writeBackup = (w: BackupWrites): Promise<void> =>
  browser.storage.local.set(Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined)));

export interface BackupFile {
  app: string; format: number; version: string; exportedAt: string;
  presets: Preset[]; activeId: string; counters: Record<string, number>;
  settings: Partial<Settings>; claimsCfg: Record<string, unknown>;
}

export function buildBackup(
  s: { presets: Preset[]; activeId: string; counters: Record<string, number>; settings: Settings; cfg: Record<string, unknown> },
  version: string, now = new Date(),
): BackupFile {
  const settings: Partial<Settings> = { ...s.settings };
  delete settings.lockChannel;
  delete settings.lang;
  return {
    app: BACKUP_APP, format: BACKUP_FORMAT, version, exportedAt: now.toISOString(),
    presets: s.presets, activeId: s.activeId, counters: s.counters, settings, claimsCfg: s.cfg,
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/backup.test.ts && npx tsc --noEmit`
Expected: PASS, 9 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/backup.ts extension/tests/backup.test.ts
git commit -m "Port backup import/export; imported data skips old migrations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Run migrations at startup, document the dev loop, full check

**Files:**
- Modify: `extension/entrypoints/background.ts`
- Create: `extension/README.md`

**Interfaces:**
- Consumes: `initI18n` (Task 8), `runMigrations` (Task 10).

- [ ] **Step 1: Run migrations when the service worker starts**

In `extension/entrypoints/background.ts`, add these imports:
```ts
import { initI18n } from '@/lib/i18n';
import { runMigrations } from '@/lib/migrations';
```
and add this as the first statement inside `defineBackground(() => { ... })`:
```ts
  // Language first: default preset labels written by migrations depend on it. Idempotent per schemaVersion.
  initI18n().then(runMigrations).catch((e) => console.error('[ytup] startup', e));
```

- [ ] **Step 2: Write the extension README**

`extension/README.md`:
````markdown
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
````

- [ ] **Step 3: Full verification**

Run: `npm run check && npm run build`
Expected: no type errors; every test file passes. Count: panel-scope 3, rpc 6, file-store 4, file-bridge 4, i18n 5, storage 3, collab 34, migrations 8, settings 5, template 26, chapters 20, chapters-mp4 3, tracklist 11, activity 16, backup 9 = **157 tests**. The build succeeds.

Also confirm the legacy suite is untouched and still green (run from the repo root):
```bash
cd .. && node --test test/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# pass 144` and `# fail 0`.

- [ ] **Step 4: Smoke-test the startup migration**

Reload the unpacked extension in `chrome://extensions`. Click **service worker** → Console, then run:
```js
chrome.storage.local.get(null).then(console.log)
```
Expected: `{schemaVersion: 4}` on a fresh profile, and no `[ytup] startup` error.

- [ ] **Step 5: Commit**

```bash
git add extension
git commit -m "Run migrations on startup; document the extension dev loop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## What comes next (separate plans)

| Plan | Starts after | Covers |
|---|---|---|
| Phase 2 — Page automation | This plan + spike decision | Port `sleep/waitFor/pace`, upload dialog automation, schedule, collab DOM flow, invite/channel-switch (`invite.content.ts`), quick actions, manual-fill, queue runner driven by the file bridge; move `collab-dialog`, `invite-accept`, `details-host` tests; delete `spike:*` and `inject-spike.ts` |
| Phase 3 — Side panel | Phase 2 | React 19 + Tailwind v4 + shadcn/ui setup, black-glass theme, Queue (with re-grant UX from the spike), Schedule, Presets, Settings + Backup |
| Phase 4 — Copyright | Phase 3 | youtubei calls (decide MAIN vs content-script fetch), scan, trim, autopilot on `chrome.alarms`, Copyright tab |
| Phase 5 — Cutover | Phase 4 | Parity checklist, GitHub Release zip, update-check banner, final userscript notice |
