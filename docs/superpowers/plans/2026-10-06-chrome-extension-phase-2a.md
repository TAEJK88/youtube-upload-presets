# Chrome Extension — Phase 2a (Page automation: plumbing + Studio DOM library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the file bridge survive real Studio, give the content script a live, storage-backed copy of the userscript's state, and port every Studio DOM routine the queue runner needs (automation, collab invite, scheduling, upload dialog, channel detection) plus the invite-accept / channel-switch watchers — each one verified line-for-line against the userscript and driven by the ported DOM tests.

**Architecture:** Ported code is *extracted, not retyped*: `scripts/port-check.mjs --print` emits the pinned userscript text (with the substitutions listed in `scripts/port/<module>.mjs` applied), the implementer adds TypeScript types only, and `port-check` proves the type-stripped module equals the userscript plus those listed substitutions. Studio modules keep using bare `document` / `location` (tests swap them with `vi.stubGlobal`); the invite and channel-switch watchers keep the userscript's globals as an injected `env` (tests pass the fake DOM, fake clock and fake store exactly as `test/harness.mjs` did). Synchronous `GM_getValue`/`GM_setValue` become a `SyncStore`: an in-memory mirror of chosen `chrome.storage.local` keys that writes through and follows `storage.onChanged`.

**Tech Stack:** WXT 0.21.4, TypeScript 7.0.2 (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest 5.0.3 + `wxt/testing` fakeBrowser, `@webext-core/messaging` 4.0.0, Node 22 (`node:module` `stripTypeScriptTypes`).

**Spec:** `docs/superpowers/specs/2026-10-05-chrome-extension-design.md` (rollout row "2. Page automation").

**Why two plans:** Phase 2 ports ~1,750 userscript lines into 16 modules plus new runtime plumbing. 2a (this file) is everything that can be built and tested without the queue runner: the bridge fix, the porting tool, state, the DOM library and the www.youtube.com watchers. It ends with a real-Chrome check of the bridge diagnostics and invite / channel switch. **Phase 2b** (`docs/superpowers/plans/2026-10-06-chrome-extension-phase-2b.md`) ports the queue runner, manual fill and quick actions, wires them to the side panel by message, and ends with the spec's exit check (a real upload driven from a dev command). The boundary is clean: nothing in 2a imports anything 2b creates.

**Out of this plan:** Phase 2b (above); the React side panel (Phase 3); youtubei / copyright / `Claims.listScheduled` (Phase 4); the tracklist-fix dialog (`showTracklistFix`, userscript line 4980, lives in the copyright module → Phase 4).

## Global Constraints

- Node ≥ 22 (`node -v` shows v22.22.3 on this machine), npm, every dependency installed with `-E` (exact version). **Phase 2a adds no dependencies.**
- All new code lives under `extension/`. **Do not modify** `youtube-upload-presets.user.js`, `test/` or `README.md`'s userscript sections. The userscript keeps shipping until cutover.
- **Port, don't redesign:** ported code must behave exactly like the userscript at commit `d15ef87caaddb7a6d3187d2851b83a484c4bb9e7` (v4.27.1). The only allowed changes are TypeScript types and the substitutions listed in `extension/scripts/port/*.mjs`; `node scripts/port-check.mjs` must print `ok` for every config. If the userscript gets a bug fix while this plan is in progress, port it too and record it as a substitution with a comment naming the userscript commit.
- Every script-authored UI string that ships goes through `L(th, en)`. Tests run in English (the i18n default). The Phase 0 developer panel (`entrypoints/sidepanel/*`), the spike FAB and `[ytup]` console lines are exempt (user decision 2026-10-05).
- In-page UI lives in a Shadow DOM root (spec "In-page UI").
- Manifest permissions, exactly: `sidePanel`, `storage`, `alarms`, `notifications`. Host permissions, exactly: `https://studio.youtube.com/*`, `https://www.youtube.com/*`, `https://api.github.com/*`. (Unchanged in this plan.)
- TypeScript `strict` with `noUncheckedIndexedAccess`. New tests are `*.test.ts`. Ported tests are `*.test.mjs` whose bodies are **byte-identical** to the originals in `test/`; only the import header changes. `test/fake-dom.mjs`, `test/mock-studio.mjs` and `test/mock-invite.mjs` are copied into `extension/tests/` **unchanged**.
- Run every command from `extension/` unless a step says otherwise. Commands are written to work in both bash and zsh (no unquoted `$VAR` command strings — use the `port` shell function defined in Task 2).
- Every commit message ends with the `Co-Authored-By:` line your agent environment specifies (user decision 2026-10-05; the examples show `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Never stage `.claude/`, `extension/.claude/` or `test/.claude/`.
- **Manual Studio checks** (Tasks 1 and 10) need a logged-in YouTube Studio session in Chrome. The person running the plan does them, or an agent with browser access to that profile does.

### Porting rules (every task that ports userscript code)

1. Start from `port <config> [A-B]` output (Task 2 defines `port`). Never retype ported code.
2. Wrap ported text in `// @port-begin` / `// @port-end` lines (several blocks per file are fine; they must appear in the same order as the config's regions).
3. Then add **types only**: parameter / variable / return annotations, generic arguments (`querySelector<HTMLElement>(…)`), non-null `!`, `as T` **without adding parentheses**, `as const`, `catch (e: any)`. Explicit `any` is allowed only where the userscript relies on dynamic properties (`h()`'s `el[k] = v`, `e.target.value` in handlers) and in `catch`. Prefer real DOM types; declare small interfaces for stored records (examples given per task). No runtime checks, no reformatting of logic.
4. Copy comments as they are (they are part of the port; `port-check` ignores full-line comments but keep them).
5. Exports go **outside** the port blocks, as one `export { … }` list after the last block (or as `export` keywords — `port-check` ignores a leading `export`).
6. If TypeScript forces a change that type stripping can't erase (typically parentheses around an `as` cast), add it to the config's `subs` with the comment `// TS-forced: <reason>`. Every other `subs` entry must come from this plan. The reviewer checks each TS-forced entry.
7. Done means: `npx tsc --noEmit` clean, `node scripts/port-check.mjs <config>` prints `ok`, the task's tests pass.

## File Structure

```
extension/
  scripts/
    port-check.mjs            NEW  extract/verify ported code against the pinned userscript
    port/*.mjs                NEW  one config per ported module (regions + substitutions)
  lib/
    rpc.ts                    MOD  rpcClient(...).dispose()
    file-bridge-client.ts     MOD  createFileBridge(): lazy mount, remount once, diagnostics
    sync-store.ts             NEW  SyncStore: sync mirror of chrome.storage.local keys
    messages.ts               MOD  + ensureMigrated, dev:switchChannel
    channel-switch.ts         NEW  port 249–339: switchToChannel, switcher watcher, Oops recovery
    invite.ts                 NEW  port 234–247, 342–477: invite-accept watcher; browserEnv()
    studio/
      state.ts                NEW  live settings / presets / activeId / counters; load()/save()
      automation.ts           NEW  port: waitFor/pace/sleep, details host, fillDetails, DOM helpers
      collab.ts               NEW  port: inviteCollaborators()
      schedule.ts             NEW  port: date/time typing, setSchedule()
      upload-dialog.ts        NEW  port: thumbnail, monetisation/ad-suitability/visibility,
                                   notice dialogs, openFilePicker, injectUploadFile, diagnostics
      channel.ts              NEW  port: getChannel/chanLabel/channelProblem; refreshCfg(); buildVars()
  entrypoints/
    background.ts             MOD  ensureMigrated handler
    studio.content.ts         MOD  createFileBridge; state + invite/switch wiring
    invite.content.ts         NEW  www.youtube.com: switcher + invite watchers
    file-bridge/main.ts       MOD  one served channel at a time (teardown)
    sidepanel/index.html, main.ts  MOD  developer "Switch channel" control
  tests/
    fake-dom.mjs mock-studio.mjs mock-invite.mjs   (copied unchanged from ../test/)
    channel-switch.test.mjs invite-accept.test.mjs details-host.test.mjs collab-dialog.test.mjs  (ported)
    file-bridge-client.test.ts (rewritten) rpc.test.ts (+1) sync-store.test.ts state.test.ts
    schedule.test.ts upload-dialog.test.ts channel.test.ts   (new)
```

**Module cut vs. the spec's module table.** The spec cut by line ranges of v4.26.1. Here modules are cut so imports run one way (automation ← collab/schedule/upload-dialog ← channel/queue): the small shared DOM helpers that the userscript declares later (`isOff`, `clickIn`, `clickByText`, `shownDialog`, `setCategory`, `leafByText`, `clickableOf`, `radioByText`, `buttonByText`, `shown`, `byText`) move into `automation.ts`, and the spec's `schedule.ts` (old 1317–1626) is split into `schedule.ts` (typing dates) and `upload-dialog.ts` (everything else in that range plus the thumbnail and Details→Visibility steps). `uploadProg` / `pollUploadProgress` read `running`, so they go with the queue runner (Phase 2b).

Userscript line map used below (pinned commit, verified): invite helpers 234–247 · channel switch 249–340 · invite watcher 342–477 · `injectingFile` 585 · `presetById`/`active` 706–707 · automation 985–1099 · collab 1101–1206 · `setCategory`…`clickableOf` 1208–1223 · thumbnail 1225–1278 · Details→Visibility steps 1280–1381 · scheduling 1383–1506 · notice dialogs 1508–1545 · `shown`/`byText` 1547–1550 · picker/inject/diagnostics 1552–1683 · channel 1693–1714.

---

### Task 1: File bridge — lazy mount, remount once, diagnostics, teardown

On a real Studio tab the content script's FAB was present but the bridge iframe was **not** in the DOM after load (cause unknown). This task makes the bridge mount only when a file is first needed, replace a frame that is gone or never came up (once per request), recover when a frame loads after the timeout, and log every step with a `[ytup] file bridge:` prefix so a real-Chrome run shows what happens. It also closes the reviewer's open items: `rpcServe`'s unsubscribe was discarded (no teardown), the client never released its port, and a late load left the bridge dead.

**Files:**
- Modify: `extension/lib/rpc.ts`, `extension/lib/file-bridge-client.ts`, `extension/entrypoints/file-bridge/main.ts`, `extension/entrypoints/studio.content.ts`
- Test: `extension/tests/rpc.test.ts` (append), `extension/tests/file-bridge-client.test.ts` (rewrite)

**Interfaces:**
- Consumes: `CONNECT`, `FILE_CH`, `FileOps`, `isBridgeConnect` (`lib/file-bridge.ts`); `portEndpoint`, `rpcServe` (`lib/rpc.ts`).
- Produces:
  - `rpcClient<H>(ep, ch, timeoutMs?)` now returns the same call function **plus** `.dispose(reason?: string): void` — stops listening, rejects every waiting call with `Error(reason)` (default `'closed'`), rejects later calls immediately.
  - `lib/file-bridge-client.ts`: `interface FileBridge { getFile(itemId: string): Promise<File>; dispose(): void }`, `createFileBridge(doc: Document, timeoutMs = 30_000): FileBridge`. `mountFileBridge` is removed.
  - Error messages: `'bridge not ready'` (no frame loaded in time, after one fresh frame), bridge answers unchanged (`'missing'`, `'permission'`, `'read'`).
  - Console lines (`console.info`): `[ytup] file bridge: #<n> mounted`, `#<n> loaded and connected`, `#<n> load timeout after <ms> ms (in DOM: <bool>)`, `#<n> removed from the DOM by the page`, `#<n> dropped (<why>)`.

- [ ] **Step 1: Write the failing tests**

Append to `extension/tests/rpc.test.ts`:
```ts

describe('rpcClient dispose', () => {
  it('fails waiting calls at once and refuses new ones', async () => {
    const [a] = pair(); // nobody serves the other end
    const call = rpcClient<Ops>(a, 'test', 10_000);
    const t0 = Date.now();
    const waiting = call('add', 1, 2);
    call.dispose('bridge removed');
    await expect(waiting).rejects.toThrow('bridge removed');
    await expect(call('add', 1, 2)).rejects.toThrow('bridge removed');
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
```

Replace `extension/tests/file-bridge-client.test.ts` with:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_CH, type FileOps } from '../lib/file-bridge';
import { createFileBridge } from '../lib/file-bridge-client';
import { portEndpoint, rpcServe } from '../lib/rpc';

// A fake Document whose iframes record their load listener, the port handed over on
// connect, and whether they are still attached.
interface FakeFrame {
  src: string;
  style: Record<string, string>;
  attached: boolean;
  readonly isConnected: boolean;
  load(): void;
  port(): MessagePort | undefined;
  remove(): void;
  addEventListener(ev: string, fn: () => void): void;
  contentWindow: { postMessage(msg: unknown, origin: string, transfer?: Transferable[]): void };
}

function fakeDoc() {
  const frames: FakeFrame[] = [];
  const doc = {
    createElement: () => {
      let onLoad: (() => void) | undefined;
      let posted: Transferable[] | undefined;
      const f: FakeFrame = {
        src: '',
        style: {},
        attached: false,
        get isConnected() { return this.attached; },
        load: () => onLoad?.(),
        port: () => posted?.[0] as MessagePort | undefined,
        remove() { this.attached = false; },
        addEventListener: (ev, fn) => { if (ev === 'load') onLoad = fn; },
        contentWindow: { postMessage: (_m, _o, transfer) => { posted = transfer; } },
      };
      frames.push(f);
      return f;
    },
    documentElement: { append: (f: FakeFrame) => { f.attached = true; } },
  } as unknown as Document;
  return { doc, frames };
}

const ports: MessagePort[] = [];
// Serve getFile on a frame's port the way entrypoints/file-bridge/main.ts does.
function serve(f: FakeFrame, getFile: FileOps['getFile'] = async (id) => new File(['abc'], id + '.mp4')) {
  const p = f.port();
  if (!p) throw new Error('no port transferred');
  ports.push(p);
  rpcServe<FileOps>(portEndpoint(p), FILE_CH, { getFile });
}

beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { ports.splice(0).forEach((p) => p.close()); vi.restoreAllMocks(); });

describe('createFileBridge', () => {
  it('mounts nothing until the first file is needed', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 1000);
    expect(frames).toHaveLength(0);
    const got = bridge.getFile('clip');
    expect(frames).toHaveLength(1);
    frames[0]!.load();
    serve(frames[0]!);
    // Node 22 clones File as Blob over MessagePort, so check content instead of .name
    expect(await (await got).text()).toBe('abc');
    bridge.dispose();
  });

  it('tries one fresh frame, then rejects with "bridge not ready"', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 30);
    await expect(bridge.getFile('x')).rejects.toThrow('bridge not ready');
    expect(frames).toHaveLength(2);
    expect(frames[0]!.attached).toBe(false); // the dead one is removed
    expect(frames[1]!.attached).toBe(true); // the last one stays, in case it loads late
    bridge.dispose();
  });

  it('a frame that loads after the timeout still serves the next request', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 30);
    await expect(bridge.getFile('x')).rejects.toThrow('bridge not ready');
    frames[1]!.load();
    serve(frames[1]!);
    expect(await (await bridge.getFile('late')).text()).toBe('abc');
    expect(frames).toHaveLength(2); // no third frame
    bridge.dispose();
  });

  it('replaces a frame the page removed', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 1000);
    const first = bridge.getFile('a');
    frames[0]!.load();
    serve(frames[0]!);
    await first;
    frames[0]!.remove();
    const second = bridge.getFile('b');
    expect(frames).toHaveLength(2);
    frames[1]!.load();
    serve(frames[1]!);
    expect(await (await second).text()).toBe('abc');
    bridge.dispose();
  });

  it('does not retry an answer from the bridge', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 1000);
    const got = bridge.getFile('gone');
    frames[0]!.load();
    serve(frames[0]!, async () => { throw new Error('missing'); });
    await expect(got).rejects.toThrow('missing');
    expect(frames).toHaveLength(1);
    bridge.dispose();
  });

  it('logs what happened to each frame', async () => {
    const { doc } = fakeDoc();
    const bridge = createFileBridge(doc, 30);
    await expect(bridge.getFile('x')).rejects.toThrow();
    const lines = vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
    expect(lines).toEqual(expect.arrayContaining([
      '[ytup] file bridge: #1 mounted',
      '[ytup] file bridge: #1 load timeout after 30 ms (in DOM: true)',
      '[ytup] file bridge: #1 dropped (bridge not ready)',
      '[ytup] file bridge: #2 mounted',
    ]));
    bridge.dispose();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/rpc.test.ts tests/file-bridge-client.test.ts`
Expected: FAIL — `call.dispose is not a function`; `createFileBridge` is not exported.

- [ ] **Step 3: Add `dispose` to `rpcClient`**

In `extension/lib/rpc.ts`, inside `rpcClient`:
1. Change `ep.listen((d) => {` (the response listener) to `const unlisten = ep.listen((d) => {`.
2. Replace the block from `const prefix = Math.random()…` to the end of the function with:
```ts
  const prefix = Math.random().toString(36).slice(2);
  let seq = 0;
  let closed = '';
  const call = <K extends keyof H & string>(op: K, ...args: Parameters<H[K]>): Promise<Awaited<ReturnType<H[K]>>> =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new Error(closed));
      const id = `${prefix}-${++seq}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${op}: timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        ep.post({ ch, id, op, args });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  // Stops listening and fails every waiting call with `reason`, so a torn-down channel
  // never leaves a caller hanging until its timeout.
  const dispose = (reason = 'closed') => {
    closed = reason;
    unlisten();
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
  };
  return Object.assign(call, { dispose });
}
```

- [ ] **Step 4: Replace the bridge client**

`extension/lib/file-bridge-client.ts`:
```ts
import { browser } from 'wxt/browser';
import { CONNECT, FILE_CH, type FileOps } from './file-bridge';
import { portEndpoint, rpcClient } from './rpc';

// Content-script side: a hidden extension-origin iframe that reads the side panel's
// IndexedDB, reached over a private MessageChannel so page scripts never see the traffic.
//
// On a real Studio tab the iframe was seen missing from the DOM after load (cause not
// known yet), so the frame is mounted only when a file is first needed, a frame that is
// gone or never came up is replaced once per request, and every step is logged with a
// `[ytup] file bridge:` prefix to find out what removes it.

const log = (msg: string) => console.info('[ytup] file bridge: ' + msg);

// Errors meaning the bridge itself is unusable (worth one fresh frame), as opposed to the
// bridge's own answers ('missing', 'permission', 'read'), which a new frame won't change.
const BRIDGE_DOWN = /^(bridge not ready|bridge removed|getFile: timed out)/;

interface Mount {
  n: number;
  frame: HTMLIFrameElement;
  port: MessagePort;
  call: ReturnType<typeof rpcClient<FileOps>>;
  loaded: Promise<void>; // never rejects: a frame that loads late still connects
  stopWatch: () => void;
}

export interface FileBridge {
  getFile(itemId: string): Promise<File>;
  dispose(): void;
}

export function createFileBridge(doc: Document, timeoutMs = 30_000): FileBridge {
  let mount: Mount | null = null;
  let seq = 0;

  function open(): Mount {
    const n = ++seq;
    const frame = doc.createElement('iframe');
    frame.src = browser.runtime.getURL('/file-bridge.html');
    frame.style.display = 'none';
    const { port1, port2 } = new MessageChannel();
    let connected = false;
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => {
        if (connected) return;
        connected = true;
        frame.contentWindow!.postMessage({ ch: CONNECT }, new URL(frame.src).origin, [port2]);
        log(`#${n} loaded and connected`);
        resolve();
      });
    });
    doc.documentElement.append(frame);
    log(`#${n} mounted`);
    let stopWatch = () => {};
    if (typeof MutationObserver === 'function') {
      const mo = new MutationObserver(() => {
        if (!frame.isConnected) {
          log(`#${n} removed from the DOM by the page`);
          mo.disconnect();
        }
      });
      mo.observe(doc.documentElement, { childList: true });
      stopWatch = () => mo.disconnect();
    }
    return { n, frame, port: port1, call: rpcClient<FileOps>(portEndpoint(port1), FILE_CH, timeoutMs), loaded, stopWatch };
  }

  function close(m: Mount, why: string) {
    log(`#${m.n} dropped (${why})`);
    m.stopWatch();
    m.call.dispose('bridge removed');
    m.port.close();
    m.frame.remove();
    if (mount === m) mount = null;
  }

  function current(): Mount {
    if (mount && !mount.frame.isConnected) close(mount, 'no longer in the DOM');
    return (mount ??= open());
  }

  async function ready(m: Mount) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        log(`#${m.n} load timeout after ${timeoutMs} ms (in DOM: ${m.frame.isConnected})`);
        reject(new Error('bridge not ready'));
      }, timeoutMs);
    });
    try {
      await Promise.race([m.loaded, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getFile(itemId) {
      for (let attempt = 0; ; attempt++) {
        const m = current();
        try {
          await ready(m);
          return await m.call('getFile', itemId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // The last frame stays mounted: if it loads later, the next request uses it.
          if (attempt >= 1 || !BRIDGE_DOWN.test(msg)) throw e;
          close(m, msg);
        }
      }
    },
    dispose() {
      if (mount) close(mount, 'disposed');
    },
  };
}
```

- [ ] **Step 5: Serve one channel at a time in the bridge page**

Replace `extension/entrypoints/file-bridge/main.ts` with:
```ts
import { FILE_CH, isBridgeConnect, readHandle, type FileOps } from '@/lib/file-bridge';
import { getHandle } from '@/lib/file-store';
import { portEndpoint, rpcServe } from '@/lib/rpc';

// Anything running on Studio's origin in the parent frame can connect here; that's not
// a secret. What actually protects file access is that queue item ids are unguessable
// (see file-bridge.ts), so connecting alone doesn't let a page read anyone else's files.
// A new connect replaces the previous channel instead of serving both.
let current: { stop: () => void; port: MessagePort } | null = null;
window.addEventListener('message', (e) => {
  if (!isBridgeConnect(e, window.parent)) return;
  current?.stop();
  current?.port.close();
  const port = e.ports[0]!;
  const handlers: FileOps = { getFile: async (itemId) => readHandle(await getHandle(itemId)) };
  current = { stop: rpcServe(portEndpoint(port), FILE_CH, handlers), port };
});
```

- [ ] **Step 6: Use it in the content script**

In `extension/entrypoints/studio.content.ts` change the import `import { mountFileBridge } from '@/lib/file-bridge-client';` to `import { createFileBridge } from '@/lib/file-bridge-client';` and `const files = mountFileBridge(document);` to `const files = createFileBridge(document);`. Nothing else changes (the spike handler already calls `files.getFile(itemId)`).

- [ ] **Step 7: Run the checks**

Run: `npx vitest run tests/rpc.test.ts tests/file-bridge-client.test.ts && npm run check`
Expected: rpc **9** tests, file-bridge-client **6** tests pass; full suite **177** tests pass; `tsc` clean.

- [ ] **Step 8: Manual Studio check (needs the logged-in Chrome profile)**

Run `npm run build`, reload the unpacked extension (`.output/chrome-mv3`), open `https://studio.youtube.com/`, open DevTools → Console, filter `[ytup]`.
1. After load: **no** `file bridge` line (lazy). Elements panel: no `iframe[src*="file-bridge.html"]`.
2. Open the side panel, drop one small `.mp4`, open Studio's upload dialog (Create → Upload videos), click **Inject into Studio**. Expected console: `#1 mounted`, `#1 loaded and connected`; the spike log shows `PASS`.
3. Wait 2 minutes, then check Elements: is the iframe still there? If a `#1 removed from the DOM by the page` line appeared, note the time since load. Click Inject again: expected `#1 dropped (no longer in the DOM)`, `#2 mounted`, `#2 loaded and connected`, PASS.
4. Record the console lines in the commit message body (they are the diagnostic this task exists for).

- [ ] **Step 9: Commit**

```bash
git add extension/lib/rpc.ts extension/lib/file-bridge-client.ts extension/entrypoints/file-bridge/main.ts extension/entrypoints/studio.content.ts extension/tests/rpc.test.ts extension/tests/file-bridge-client.test.ts
git commit -m "Mount the file bridge on demand and replace a dead frame once

The bridge iframe was missing from Studio's DOM after load. It now mounts on the
first getFile, a frame that is gone or never loads is replaced once per request,
a frame that loads late still connects, and every step logs [ytup] file bridge.
rpcClient gains dispose(); the bridge page serves one channel at a time.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The porting tool (`scripts/port-check.mjs`)

**Files:**
- Create: `extension/scripts/port-check.mjs`, `extension/scripts/port/state.mjs`
- Modify: `extension/package.json` (script `port-check`)

**Interfaces:**
- Produces: `node scripts/port-check.mjs [name…]` (exit 0 = every named or every config `ok`), `node scripts/port-check.mjs --print <name> [A-B]` (prints the code a port starts from, de-indented 2 spaces). Config shape (`scripts/port/<name>.mjs`, default export): `{ file: string; regions: string[] /* 'A-B' */; replaceLines?: { lines: 'A-B'; to: string }[]; subs?: [from: string, to: string, count: number][] }`. `subs` are literal, applied in order to the joined regions; `count` is checked. `npm run port-check` runs every config.
- The shell helper every port task uses (paste once per shell session, works in bash and zsh):
  ```bash
  port() { node scripts/port-check.mjs --print "$@"; }
  ```

- [ ] **Step 1: Write the tool**

`extension/scripts/port-check.mjs`:
```js
// Proves a ported module is the userscript at the pinned commit, changed only by
// TypeScript types and by the substitutions listed in scripts/port/<name>.mjs.
//
//   node scripts/port-check.mjs                       check every config in scripts/port/
//   node scripts/port-check.mjs invite                check scripts/port/invite.mjs only
//   node scripts/port-check.mjs --print invite [A-B]  print the code a port starts from:
//                                                     all regions, or userscript lines A-B
//
// A config names the module file, the userscript line ranges it was cut from, and the
// edits made on top (`replaceLines`, then literal `subs` with their expected counts). The
// module marks the ported text with `// @port-begin` / `// @port-end` lines, any number
// of blocks, in source order. Both sides are compared after erasing TypeScript types
// (node:module stripTypeScriptTypes), whitespace, blank lines, full-line comments and a
// leading `export`.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'd15ef87caaddb7a6d3187d2851b83a484c4bb9e7'; // userscript v4.27.1
const SRC = execFileSync('git', ['show', `${PIN}:youtube-upload-presets.user.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n');

const load = async (name) => (await import(pathToFileURL(join(ROOT, 'scripts/port', name + '.mjs')).href)).default;

const isComment = (l) => /^\/\//.test(l) || /^\/\*.*\*\/$/.test(l);
const norm = (text) =>
  text.split('\n')
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l && !isComment(l))
    .map((l) => l.replace(/^export(?=const|let|function|async)/, ''));

// Userscript lines with `replaceLines` applied; replaced spans keep their numbering.
function sourceLines(cfg) {
  const lines = [...SRC];
  for (const r of cfg.replaceLines ?? []) {
    const [a, b] = r.lines.split('-').map(Number);
    for (let i = a; i <= b; i++) lines[i - 1] = i === a ? r.to : null;
  }
  return lines;
}
const slice = (lines, range) => {
  const [a, b] = range.split('-').map(Number);
  return lines.slice(a - 1, b).filter((l) => l !== null).join('\n');
};

function expected(cfg) {
  let text = cfg.regions.map((r) => slice(sourceLines(cfg), r)).join('\n');
  const errors = [];
  for (const [i, [from, to, count]] of (cfg.subs ?? []).entries()) {
    const found = text.split(from).length - 1;
    if (found !== count) errors.push(`subs[${i}] ${JSON.stringify(from)}: expected ${count}, found ${found}`);
    text = text.split(from).join(to);
  }
  return { text, errors };
}

function ported(file) {
  const js = stripTypeScriptTypes(readFileSync(join(ROOT, file), 'utf8'), { mode: 'strip' });
  const out = [];
  let inside = false;
  for (const l of js.split('\n')) {
    const t = l.trim();
    if (t === '// @port-begin') {
      if (inside) throw new Error(`${file}: nested @port-begin`);
      inside = true;
    } else if (t === '// @port-end') {
      if (!inside) throw new Error(`${file}: @port-end without @port-begin`);
      inside = false;
    } else if (inside) out.push(l);
  }
  if (inside) throw new Error(`${file}: missing @port-end`);
  if (!out.length) throw new Error(`${file}: no @port-begin / @port-end block`);
  return out.join('\n');
}

async function check(name) {
  const cfg = await load(name);
  const { text, errors } = expected(cfg);
  const a = norm(text);
  let b;
  try {
    b = norm(ported(cfg.file));
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    return false;
  }
  const at = [...Array(Math.max(a.length, b.length)).keys()].find((i) => a[i] !== b[i]);
  if (at !== undefined) {
    const from = Math.max(0, at - 2);
    const show = (xs) => xs.slice(from, at + 3).map((l, k) => `   ${from + k === at ? '>' : ' '} ${l ?? '<end>'}`).join('\n');
    errors.push(`first difference at normalized line ${at + 1}\n  expected (userscript + subs):\n${show(a)}\n  ported (${cfg.file}, types stripped):\n${show(b)}`);
  }
  console.log(`${errors.length ? 'FAIL' : 'ok  '} ${name} (${cfg.file}, ${a.length} lines)`);
  for (const e of errors) console.log('  ' + e);
  return errors.length === 0;
}

if (process.argv[2] === '--print') {
  const [, , , name, range] = process.argv;
  const cfg = await load(name);
  let text = range ? slice(sourceLines(cfg), range) : expected(cfg).text;
  if (range) for (const [from, to] of cfg.subs ?? []) text = text.split(from).join(to);
  process.stdout.write(text.replace(/^  /gm, '') + '\n');
} else {
  process.removeAllListeners('warning'); // stripTypeScriptTypes is flagged experimental on Node 22
  const names = process.argv.slice(2);
  const all = names.length ? names : readdirSync(join(ROOT, 'scripts/port')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
  let ok = true;
  for (const name of all) ok = (await check(name)) && ok;
  process.exit(ok ? 0 : 1);
}
```

In `extension/package.json` add to `"scripts"`: `"port-check": "node scripts/port-check.mjs"`.

The first config (used by Task 4) — `extension/scripts/port/state.mjs`:
```js
// lib/studio/state.ts ← presetById() / active() (the state they read is loaded by initState)
export default {
  file: 'lib/studio/state.ts',
  regions: ['706-707'],
  subs: [],
};
```

- [ ] **Step 2: Prove it reads the pinned source and fails on a missing module**

Run:
```bash
port() { node scripts/port-check.mjs --print "$@"; }
port state
node scripts/port-check.mjs state; echo "exit=$?"
```
Expected: `port state` prints exactly
```
const presetById = (id) => presets.find((p) => p.id === id) || presets[0];
const active = () => presetById(activeId);
```
and the check prints `FAIL state: ENOENT …lib/studio/state.ts…` with `exit=1` (the module arrives in Task 4).

- [ ] **Step 3: Commit**

```bash
git add extension/scripts extension/package.json
git commit -m "Add port-check: extract and verify ported code against the pinned userscript

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `SyncStore` — synchronous storage for ported code

**Files:**
- Create: `extension/lib/sync-store.ts`
- Test: `extension/tests/sync-store.test.ts`

**Interfaces:**
- Consumes: `save` (`lib/storage.ts`), `browser.storage` (`wxt/browser`).
- Produces (`lib/sync-store.ts`): `interface SyncStore { get<T>(key, fallback?): T; set(key, value): void; onChange(key, fn): () => void; flush(): Promise<void> }`, `createSyncStore(keys: string[]): Promise<SyncStore>`, `createMemoryStore(initial?: Record<string, unknown>): SyncStore`. Semantics: `get` returns a `structuredClone` (like `GM_getValue`); `set` updates the copy synchronously and writes through via `save()`; `onChange` fires only for changes made elsewhere; while an own write to a key is in flight, `onChanged` events for that key are ignored and the key is re-read once the write lands.

- [ ] **Step 1: Write the failing test**

`extension/tests/sync-store.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createMemoryStore, createSyncStore } from '../lib/sync-store';

beforeEach(() => fakeBrowser.reset());

describe('createSyncStore', () => {
  it('starts from what is stored, for the listed keys only', async () => {
    await browser.storage.local.set({ counters: { trapsoul: 3 }, other: 1 });
    const kv = await createSyncStore(['counters', 'uploads']);
    expect(kv.get('counters', {})).toEqual({ trapsoul: 3 });
    expect(kv.get('uploads', [])).toEqual([]);
    expect(kv.get('other', 'fallback')).toBe('fallback');
  });

  it('set() is visible at once and reaches storage', async () => {
    const kv = await createSyncStore(['activeId']);
    kv.set('activeId', 'lofi');
    expect(kv.get('activeId')).toBe('lofi');
    await kv.flush();
    expect((await browser.storage.local.get('activeId')).activeId).toBe('lofi');
  });

  it('hands out copies, like GM_getValue', async () => {
    const kv = await createSyncStore(['counters']);
    kv.set('counters', { a: 1 });
    kv.get<Record<string, number>>('counters').a = 99;
    expect(kv.get('counters')).toEqual({ a: 1 });
  });

  it('picks up changes made elsewhere and reports them', async () => {
    const kv = await createSyncStore(['settings']);
    const seen = vi.fn();
    kv.onChange('settings', seen);
    await browser.storage.local.set({ settings: { delay: 9 } });
    expect(kv.get('settings')).toEqual({ delay: 9 });
    expect(seen).toHaveBeenCalledWith({ delay: 9 });
  });

  it('does not report its own writes as changes', async () => {
    const kv = await createSyncStore(['counters']);
    const seen = vi.fn();
    kv.onChange('counters', seen);
    kv.set('counters', { a: 1 });
    kv.set('counters', { a: 2 });
    await kv.flush();
    expect(seen).not.toHaveBeenCalled();
    expect(kv.get('counters')).toEqual({ a: 2 });
  });

  it('a change made elsewhere during its own write wins once both land', async () => {
    const kv = await createSyncStore(['activeId']);
    const seen = vi.fn();
    kv.onChange('activeId', seen);
    kv.set('activeId', 'mine');
    await browser.storage.local.set({ activeId: 'theirs' });
    await kv.flush();
    expect(kv.get('activeId')).toBe('theirs');
    expect(seen).toHaveBeenCalledWith('theirs');
  });

  it('ignores keys it does not mirror', async () => {
    const kv = await createSyncStore(['a']);
    await browser.storage.local.set({ b: 1 });
    expect(kv.get('b', 0)).toBe(0);
  });
});

describe('createMemoryStore', () => {
  it('keeps values in memory and hands out copies', () => {
    const kv = createMemoryStore({ list: [1] });
    kv.get<number[]>('list').push(2);
    expect(kv.get('list')).toEqual([1]);
    kv.set('x', null);
    expect(kv.get('x', 'fallback')).toBe(null);
    expect(kv.get('missing', 'fallback')).toBe('fallback');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/sync-store.test.ts`
Expected: FAIL — cannot resolve `../lib/sync-store`.

- [ ] **Step 3: Implement**

`extension/lib/sync-store.ts`:
```ts
import { browser } from 'wxt/browser';
import { save } from './storage';

// The userscript read and wrote storage synchronously (GM_getValue / GM_setValue), and the
// ported page code still does. A SyncStore keeps a copy of chosen chrome.storage.local keys
// in memory: get() is synchronous, set() updates the copy at once and writes through, and
// changes made elsewhere (the side panel, another tab) flow back in via storage.onChanged.
export interface SyncStore {
  get<T>(key: string, fallback?: T): T;
  set(key: string, value: unknown): void;
  // Called when another context changed the key (never for this store's own writes).
  onChange(key: string, fn: (value: unknown) => void): () => void;
  // Resolves once every write issued so far has reached storage.
  flush(): Promise<void>;
}

// Like GM_getValue: every get() hands out a fresh copy, so callers can't edit the cache.
const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function createSyncStore(keys: string[]): Promise<SyncStore> {
  const stored = await browser.storage.local.get(keys);
  const cache = new Map<string, unknown>(Object.entries(stored).filter(([, v]) => v !== undefined));
  const listeners = new Map<string, Set<(v: unknown) => void>>();
  const inflight = new Map<string, number>(); // writes of ours not yet confirmed per key
  const stale = new Set<string>(); // keys that changed elsewhere while we were writing
  const writes = new Set<Promise<void>>();

  const apply = (key: string, value: unknown) => {
    if (same(cache.get(key), value)) return;
    if (value === undefined) cache.delete(key);
    else cache.set(key, value);
    for (const fn of listeners.get(key) ?? []) fn(copy(value));
  };

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (!keys.includes(key)) continue;
      // While our own write is in flight this event may be its echo or an older value;
      // re-read once the write lands instead of guessing.
      if (inflight.get(key)) stale.add(key);
      else apply(key, newValue);
    }
  });

  const settle = async (key: string) => {
    const left = (inflight.get(key) ?? 1) - 1;
    if (left) return void inflight.set(key, left);
    inflight.delete(key);
    if (!stale.delete(key)) return;
    const got = await browser.storage.local.get(key);
    if (!inflight.get(key)) apply(key, got[key]);
  };

  return {
    get: <T>(key: string, fallback?: T): T => (cache.has(key) ? copy(cache.get(key) as T) : (fallback as T)),
    set(key, value) {
      cache.set(key, copy(value));
      inflight.set(key, (inflight.get(key) ?? 0) + 1);
      const w = save(key, value)
        .catch((e) => console.error('[ytup] storage write', key, e))
        .then(() => settle(key));
      writes.add(w);
      void w.finally(() => writes.delete(w));
    },
    onChange(key, fn) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(fn);
      return () => listeners.get(key)?.delete(fn);
    },
    async flush() {
      while (writes.size) await Promise.all([...writes]);
    },
  };
}

// The same contract over a plain object: what the state module uses until initState()
// runs, and what tests use instead of chrome.storage.
export function createMemoryStore(initial: Record<string, unknown> = {}): SyncStore {
  const data = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  return {
    get: <T>(key: string, fallback?: T): T => (data.has(key) ? copy(data.get(key) as T) : (fallback as T)),
    set: (key, value) => void data.set(key, copy(value)),
    onChange: () => () => {},
    flush: async () => {},
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/sync-store.test.ts && npx tsc --noEmit`
Expected: PASS, **8 tests**; no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/sync-store.ts extension/tests/sync-store.test.ts
git commit -m "Add SyncStore: a synchronous, write-through mirror of chrome.storage keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Live state for the content script (`lib/studio/state.ts`)

The userscript kept `settings`, `presets`, `activeId` and `counters` in top-level variables and read storage synchronously. The ported code keeps doing both: this module holds the same values as live objects, gated on the migrations having run, kept in sync with `storage.onChanged`, and saved through the existing helpers.

**Files:**
- Create: `extension/lib/studio/state.ts`
- Modify: `extension/lib/messages.ts`, `extension/entrypoints/background.ts`
- Test: `extension/tests/state.test.ts`

**Interfaces:**
- Consumes: `getLang`, `setLang` (`lib/i18n.ts`); `SCHEMA_VERSION` (`lib/migrations.ts`); `defaultPresets`, `Preset` (`lib/presets.ts`); `defaultSettings`, `loadSettings`, `Settings` (`lib/settings.ts`); `load` (`lib/storage.ts`); `createMemoryStore`, `createSyncStore`, `SyncStore` (Task 3); `sendMessage` (`lib/messages.ts`).
- Produces (`lib/studio/state.ts`):
  - `STATE_KEYS: string[]` = `['settings', 'autoApply', 'autoNext', 'presets', 'activeId', 'counters', 'queueMemo', 'uploads', 'queue']`.
  - `load<T>(key, fallback): T` and `save(key, value): void` — the userscript's synchronous `load`/`save` (line 590–594), backed by the store.
  - `onStored(key, fn): () => void`, `flushState(): Promise<void>`.
  - Live objects: `settings: Settings`, `presets: Preset[]`, `counters: Record<string, number>`, and `export let activeId: string` (a primitive: importers read the live ES binding; only this module assigns it). Identity of the objects never changes; contents are replaced in place on external changes.
  - `saveSettings(): void` (zero-arg, like the userscript's), `presetById(id: string): Preset`, `active(): Preset` (ported 706–707).
  - `initState(ensureMigrated?: () => Promise<number>): Promise<void>` — rejects with `[ytup] storage schema is <v>, this build expects <SCHEMA_VERSION>` if storage isn't at this build's schema even after asking the background.
  - Before `initState()` everything works on defaults and an in-memory store (tests rely on this).
- `ProtocolMap` gains `ensureMigrated(): number` (content → background: waits for the startup migrations, answers `schemaVersion`).

- [ ] **Step 1: Write the failing test**

`extension/tests/state.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getLang, setLang } from '../lib/i18n';
import { SCHEMA_VERSION } from '../lib/migrations';
import { defaultPresets } from '../lib/presets';
import * as state from '../lib/studio/state';

const P = (id: string) => ({ ...defaultPresets()[0]!, id, label: id });
const current = () => Promise.resolve(SCHEMA_VERSION);

beforeEach(() => fakeBrowser.reset());
afterEach(() => setLang('en'));

describe('state before initState', () => {
  it('holds the userscript defaults and an in-memory store', () => {
    expect(state.settings.pace).toBe('slow');
    expect(state.presets.map((p) => p.id)).toEqual(defaultPresets().map((p) => p.id));
    expect(state.activeId).toBe('trapsoul');
    expect(state.load('uploads', [])).toEqual([]);
  });
});

describe('initState', () => {
  it('loads storage into the live objects', async () => {
    await browser.storage.local.set({
      schemaVersion: SCHEMA_VERSION, presets: [P('a'), P('b')], activeId: 'b',
      counters: { a: 2 }, settings: { delay: 9 },
    });
    await state.initState(current);
    expect(state.settings.delay).toBe(9);
    expect(state.settings.pace).toBe('slow'); // defaults still fill the gaps
    expect(state.presets.map((p) => p.id)).toEqual(['a', 'b']);
    expect(state.activeId).toBe('b');
    expect(state.counters).toEqual({ a: 2 });
    expect(state.presetById('nope').id).toBe('a');
    expect(state.active().id).toBe('b');
  });

  it('follows changes made elsewhere without replacing the objects', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, presets: [P('a')], counters: {} });
    await state.initState(current);
    const { settings, presets, counters } = state;
    await browser.storage.local.set({ settings: { delay: 5 }, presets: [P('x'), P('y')], activeId: 'y', counters: { x: 4 } });
    expect(state.settings).toBe(settings);
    expect(settings.delay).toBe(5);
    expect(state.presets).toBe(presets);
    expect(presets.map((p) => p.id)).toEqual(['x', 'y']);
    expect(state.activeId).toBe('y');
    expect(state.counters).toBe(counters);
    expect(counters).toEqual({ x: 4 });
  });

  it('save() writes through to chrome.storage', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
    await state.initState(current);
    state.counters.trapsoul = 7;
    state.save('counters', state.counters);
    state.settings.schedule.start = '2026-10-07T08:00';
    state.saveSettings();
    await state.flushState();
    const got = await browser.storage.local.get(['counters', 'settings']);
    expect(got.counters).toEqual({ trapsoul: 7 });
    expect((got.settings as { schedule: { start: string } }).schedule.start).toBe('2026-10-07T08:00');
  });

  it('asks the background to migrate when storage is behind', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION - 1 });
    const ensure = vi.fn(async () => {
      await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION });
      return SCHEMA_VERSION;
    });
    await state.initState(ensure);
    expect(ensure).toHaveBeenCalledOnce();
  });

  it('refuses to read storage it does not understand', async () => {
    await browser.storage.local.set({ schemaVersion: 1 });
    await expect(state.initState(async () => 1)).rejects.toThrow(`expects ${SCHEMA_VERSION}`);
  });

  it('applies the stored language and follows a change', async () => {
    await browser.storage.local.set({ schemaVersion: SCHEMA_VERSION, settings: { lang: 'th' } });
    await state.initState(current);
    expect(getLang()).toBe('th');
    await browser.storage.local.set({ settings: { lang: 'en' } });
    expect(getLang()).toBe('en');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/state.test.ts`
Expected: FAIL — cannot resolve `../lib/studio/state`.

- [ ] **Step 3: Add the message**

`extension/lib/messages.ts`:
```ts
import { defineExtensionMessaging } from '@webext-core/messaging';

export type ProtocolMap = {
  openPanel(): void;
  // content → background: wait for the startup migrations, answer the schemaVersion
  ensureMigrated(): number;
  // Phase 0 spike only — removed in Phase 2b
  'spike:cfg'(): Record<string, unknown>;
  'spike:inject'(itemId: string): { ok: boolean; detail: string };
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

- [ ] **Step 4: Write the state module**

Build it from the extraction (block = userscript 706–707):
```bash
port() { node scripts/port-check.mjs --print "$@"; }
port state
```
`extension/lib/studio/state.ts` — the two printed lines go between the markers, typed as shown:
```ts
import { getLang, setLang } from '../i18n';
import { sendMessage } from '../messages';
import { SCHEMA_VERSION } from '../migrations';
import { defaultPresets, type Preset } from '../presets';
import { defaultSettings, loadSettings, type Settings } from '../settings';
import { load as loadStored } from '../storage';
import { createMemoryStore, createSyncStore, type SyncStore } from '../sync-store';

// The userscript kept settings, presets, counters and activeId in top-level variables
// and read storage synchronously. The ported page code still does both, so this module
// holds the same values as live objects, mirrored from chrome.storage.local: edits made
// in the side panel show up here without a reload, and save() writes through.

// Every key the page code reads or writes with load() / save().
export const STATE_KEYS = ['settings', 'autoApply', 'autoNext', 'presets', 'activeId', 'counters', 'queueMemo', 'uploads', 'queue'];

// In memory until initState() runs, so modules work in tests without chrome.storage.
let kv: SyncStore = createMemoryStore();
export const load = <T>(key: string, fallback: T): T => kv.get(key, fallback);
export const save = (key: string, value: unknown): void => kv.set(key, value);
export const onStored = (key: string, fn: (value: unknown) => void) => kv.onChange(key, fn);
export const flushState = () => kv.flush();

export const settings: Settings = defaultSettings();
export const presets: Preset[] = defaultPresets();
// A primitive: importers read it through the live ES module binding.
export let activeId: string = presets[0]!.id;
export const counters: Record<string, number> = {};
export const saveSettings = () => save('settings', settings);

// @port-begin
export const presetById = (id: string): Preset => presets.find((p) => p.id === id) || presets[0]!;
export const active = () => presetById(activeId);
// @port-end

// Swap an object's contents but keep its identity (other modules hold references).
function replace(target: object, next: object) {
  for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
  Object.assign(target, next);
}
function refreshSettings() {
  // Same merge as the userscript: defaults (with the pre-settings autoApply/autoNext keys) ← stored
  const legacy = { autoApply: load('autoApply', true), autoNext: load('autoNext', false) };
  replace(settings, Object.assign(defaultSettings(legacy), load<Partial<Settings>>('settings', {})));
  if (settings.lang && settings.lang !== getLang()) setLang(settings.lang);
}
function refreshPresets() {
  presets.splice(0, presets.length, ...load('presets', defaultPresets()));
}
function refreshActiveId() {
  activeId = load('activeId', presets[0]!.id);
}
function refreshCounters() {
  replace(counters, load('counters', {}));
}

// Loads everything once the background's migrations have brought storage to this
// version. `ensureMigrated` is injectable for tests.
export async function initState(ensureMigrated = () => sendMessage('ensureMigrated', undefined)): Promise<void> {
  let v = await loadStored<number | null>('schemaVersion', null);
  if (v !== SCHEMA_VERSION) v = await ensureMigrated();
  if (v !== SCHEMA_VERSION) throw new Error(`[ytup] storage schema is ${v}, this build expects ${SCHEMA_VERSION}`);
  await loadSettings(); // stores the one-time defaults (glassV2, lang) exactly as the userscript did at load
  kv = await createSyncStore(STATE_KEYS);
  refreshSettings();
  refreshPresets();
  refreshActiveId();
  refreshCounters();
  for (const k of ['settings', 'autoApply', 'autoNext']) kv.onChange(k, refreshSettings);
  kv.onChange('presets', () => { refreshPresets(); refreshActiveId(); });
  kv.onChange('activeId', refreshActiveId);
  kv.onChange('counters', refreshCounters);
}
```

- [ ] **Step 5: Answer `ensureMigrated` in the background**

In `extension/entrypoints/background.ts`:
1. Add `import { load } from '@/lib/storage';`.
2. Replace `initI18n().then(runMigrations).catch((e) => console.error('[ytup] startup', e));` with `const ready = initI18n().then(runMigrations).catch((e) => console.error('[ytup] startup', e));`.
3. After the `openPanel` handler add:
```ts

  // Content scripts read stored data only once it is in this build's shape.
  onMessage('ensureMigrated', async () => {
    await ready;
    return load('schemaVersion', 0);
  });
```

- [ ] **Step 6: Run the checks**

Run: `npx vitest run tests/state.test.ts && node scripts/port-check.mjs state && npm run check`
Expected: **7** state tests pass; `ok   state (lib/studio/state.ts, 2 lines)`; full suite **192** tests pass; `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add extension/lib/studio/state.ts extension/lib/messages.ts extension/entrypoints/background.ts extension/tests/state.test.ts
git commit -m "Add live page state: settings, presets, activeId and counters mirrored from storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Studio DOM automation (`lib/studio/automation.ts`) + the details-host test

**Files:**
- Create: `extension/scripts/port/automation.mjs`, `extension/lib/studio/automation.ts`
- Create: `extension/tests/fake-dom.mjs` (copy), `extension/tests/details-host.test.mjs` (ported)

**Interfaces:**
- Consumes: `normText` (`lib/collab.ts`); `SEL`, `TXT`; `settings` (Task 4).
- Produces (`lib/studio/automation.ts`), all from the userscript, same signatures: `PACE` (typed `Record<string, number>` so tests can add a pace), `pace()`, `T(ms)`, `sleep(ms)`, `isVisible(el)`, `waitFor(fn, timeout?, step?)`, `getDialog()`, `getTitleBox(dlg)`, `getDescBox(dlg)`, `getDetailsHost()`, `onEditPage()`, `detailsOpen()`, `uploadDialogOpen()`, `findTagsInput(dlg)`, `setEditable(el, text)`, `setTags(dlg, tags)`, `fillDetails({ title, description, tags })`, `isOff(el)`, `clickIn(root, sel)`, `clickByText(root, re)`, `shownDialog(tag)`, `setCategory(dlg, text)`, `leafByText(root, re)`, `clickableOf(el)`, `radioByText(re)`, `buttonByText(root, re)`, `shown(el)`, `byText(sel, re)`. Uses the global `document`.

- [ ] **Step 1: Port the test first (header swap only) and copy the fake DOM**

```bash
cp ../test/fake-dom.mjs tests/fake-dom.mjs
{ cat <<'EOF'
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { detailsOpen, getDescBox, getDetailsHost, getDialog, getTitleBox, onEditPage } from '../lib/studio/automation';
import { makeDocument } from './fake-dom.mjs';

// harness.mjs evaluated these with `document` swapped for the fake one.
function makeDetails(doc) {
  vi.stubGlobal('document', doc);
  return { getDialog, getDetailsHost, getTitleBox, getDescBox, onEditPage, detailsOpen };
}
EOF
tail -n +5 ../test/details-host.test.mjs; } > tests/details-host.test.mjs
cmp tests/fake-dom.mjs ../test/fake-dom.mjs && diff <(tail -n +11 tests/details-host.test.mjs) <(tail -n +5 ../test/details-host.test.mjs) && echo bodies-identical
```
Expected: `bodies-identical`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/details-host.test.mjs`
Expected: FAIL — cannot resolve `../lib/studio/automation`.

- [ ] **Step 3: Write the config and extract the module**

`extension/scripts/port/automation.mjs`:
```js
// lib/studio/automation.ts ← "Studio DOM automation" (985-1099) plus the small DOM helpers
// the later sections share, pulled forward so the studio modules import in one direction.
export default {
  file: 'lib/studio/automation.ts',
  regions: ['985-1099', '1106-1115', '1129-1137', '1208-1223', '1280-1284', '1547-1550'],
  subs: [],
};
```
Build the file:
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { normText } from '../collab';
import { SEL } from './sel';
import { settings } from './state';
import { TXT } from './txt';

// @port-begin
EOF
port automation
cat <<'EOF'
// @port-end

export {
  PACE, pace, T, sleep, isVisible, waitFor, getDialog, getTitleBox, getDescBox, getDetailsHost, onEditPage,
  detailsOpen, uploadDialogOpen, findTagsInput, setEditable, setTags, fillDetails, isOff, clickIn, clickByText,
  shownDialog, setCategory, leafByText, clickableOf, radioByText, buttonByText, shown, byText,
};
EOF
} > lib/studio/automation.ts
node scripts/port-check.mjs automation
```
Expected: `ok   automation (lib/studio/automation.ts, 131 lines)`.

- [ ] **Step 4: Add types until `tsc` is clean**

Follow the porting rules. Specifics for this module:
- `const PACE: Record<string, number> = { normal: 1, slow: 1.6, slower: 2.5 };` (tests add `PACE.test`).
- `isVisible = (el: Element | null | undefined): el is Element`; `shown` the same shape.
- `waitFor<V>(fn: () => V, timeout = 10000, step = 200): Promise<V | null>`.
- Query results that are clicked or read as inputs: `querySelector<HTMLElement>` / `<HTMLInputElement>`; `textContent!` where the userscript calls `.trim()` on it directly.
- `fillDetails({ title, description, tags }: { title: string; description: string; tags: string[] }): Promise<boolean>`.
- `document.execCommand('selectAll', false, null)`: the DOM typings want `string | undefined` for the third argument; write `null as unknown as string` (type stripping leaves `null`, so no substitution is needed).

Run: `npx tsc --noEmit && node scripts/port-check.mjs automation`
Expected: no type errors; `ok   automation`.

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run tests/details-host.test.mjs`
Expected: PASS, **6 tests** (same count as `../test/details-host.test.mjs`).

- [ ] **Step 6: Commit**

```bash
git add extension/scripts/port/automation.mjs extension/lib/studio/automation.ts extension/tests/fake-dom.mjs extension/tests/details-host.test.mjs
git commit -m "Port the Studio DOM automation core and the details-host test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Collaborator invites (`lib/studio/collab.ts`) + the collab-dialog test

**Files:**
- Create: `extension/scripts/port/studio-collab.mjs`, `extension/lib/studio/collab.ts`
- Create: `extension/tests/mock-studio.mjs` (copy), `extension/tests/collab-dialog.test.mjs` (ported)

**Interfaces:**
- Consumes: `L`; `collabRowMatches`, `normText`, `InviteResult` (`lib/collab.ts`); `SEL`, `TXT`; `clickByText`, `clickIn`, `getDialog`, `isOff`, `isVisible`, `shownDialog`, `sleep`, `waitFor` (Task 5).
- Produces (`lib/studio/collab.ts`): `typeSearch(input: HTMLInputElement, text: string): Promise<void>`, `inviteCollaborators(handles: string[], dlg?: Element | null): Promise<InviteResult>`.

- [ ] **Step 1: Port the test (header swap only) and copy the mock**

```bash
cp ../test/mock-studio.mjs tests/mock-studio.mjs
{ cat <<'EOF'
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import * as C from '../lib/collab';
import { PACE } from '../lib/studio/automation';
import { inviteCollaborators } from '../lib/studio/collab';
import { settings } from '../lib/studio/state';
import { mockStudio } from './mock-studio.mjs';

// harness.mjs ran the dialog code against the mock's document at 1% of real time.
PACE.test = 0.01;
settings.pace = 'test';
function makeInviter(doc) {
  vi.stubGlobal('document', doc);
  return { inviteCollaborators };
}
EOF
tail -n +5 ../test/collab-dialog.test.mjs; } > tests/collab-dialog.test.mjs
cmp tests/mock-studio.mjs ../test/mock-studio.mjs && diff <(tail -n +16 tests/collab-dialog.test.mjs) <(tail -n +5 ../test/collab-dialog.test.mjs) && echo bodies-identical
```
Expected: `bodies-identical`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/collab-dialog.test.mjs`
Expected: FAIL — cannot resolve `../lib/studio/collab`.

- [ ] **Step 3: Write the config and extract**

`extension/scripts/port/studio-collab.mjs`:
```js
// lib/studio/collab.ts ← "Collaboration: เชิญช่องอื่นเป็นผู้ร่วมสร้าง" (its helpers live in automation.ts)
export default {
  file: 'lib/studio/collab.ts',
  regions: ['1101-1105', '1116-1128', '1139-1206'],
  subs: [],
};
```
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { collabRowMatches, normText, type InviteResult } from '../collab';
import { L } from '../i18n';
import { clickByText, clickIn, getDialog, isOff, isVisible, shownDialog, sleep, waitFor } from './automation';
import { SEL } from './sel';
import { TXT } from './txt';

// @port-begin
EOF
port studio-collab
cat <<'EOF'
// @port-end

export { typeSearch, inviteCollaborators };
EOF
} > lib/studio/collab.ts
node scripts/port-check.mjs studio-collab
```
Expected: `ok   studio-collab (lib/studio/collab.ts, 69 lines)`.

- [ ] **Step 4: Add types until `tsc` is clean**

Specifics: `const res: InviteResult = { links: [], errors: [], skipped: [], saved: null };`; `inviteCollaborators(handles: string[], dlg = getDialog())` with `dlg` typed `Element | null` and `dlg!` where the userscript dereferences it; `own = (b: Element) =>`; inputs as `HTMLInputElement`.

Run: `npx tsc --noEmit && node scripts/port-check.mjs studio-collab`
Expected: clean; `ok`.

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run tests/collab-dialog.test.mjs`
Expected: PASS, **12 tests** (same count as `../test/collab-dialog.test.mjs`).

- [ ] **Step 6: Commit**

```bash
git add extension/scripts/port/studio-collab.mjs extension/lib/studio/collab.ts extension/tests/mock-studio.mjs extension/tests/collab-dialog.test.mjs
git commit -m "Port the collaborator invite flow and the collab-dialog test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scheduling (`lib/studio/schedule.ts`)

**Files:**
- Create: `extension/scripts/port/schedule.mjs`, `extension/lib/studio/schedule.ts`
- Test: `extension/tests/schedule.test.ts` (new characterization tests)

**Interfaces:**
- Consumes: `L`; `pad` (`lib/template.ts`); `SEL`; `getDialog`, `isVisible`, `sleep`, `waitFor` (Task 5).
- Produces (`lib/studio/schedule.ts`): `studioLang(): string`, `typeInto(input: HTMLInputElement, text: string): Promise<void>`, `formatStudioDate(date: Date, sample: string): string`, `formatStudioTime(date: Date, sample?: string): string`, `parseClock(text: unknown): number | null`, `setSchedule(date: Date): Promise<string>` ('' = success, else the error text).

- [ ] **Step 1: Write the failing test**

`extension/tests/schedule.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatStudioDate, formatStudioTime, parseClock } from '../lib/studio/schedule';

// setSchedule() itself drives Studio's date picker and is checked by hand (Phase 2b).
// These pin the text it types and the way it reads Studio's answer back.
afterEach(() => vi.unstubAllGlobals());
const studioIn = (lang: string) => vi.stubGlobal('document', { documentElement: { lang } });

describe('parseClock', () => {
  it('reads 24-hour, 12-hour and Thai clock text as minutes after midnight', () => {
    expect(parseClock('08:00')).toBe(480);
    expect(parseClock('8:00')).toBe(480);
    expect(parseClock('8:00 AM')).toBe(480);
    expect(parseClock('7:30 PM')).toBe(1170);
    expect(parseClock('12:00 AM')).toBe(0);
    expect(parseClock('12:15 PM')).toBe(735);
    expect(parseClock('7:30 หลังเที่ยง')).toBe(1170);
    expect(parseClock('19.05')).toBe(1145);
  });
  it('returns null when there is no time', () => {
    expect(parseClock('')).toBe(null);
    expect(parseClock('soon')).toBe(null);
  });
});

describe('formatStudioTime', () => {
  const at = new Date(2026, 9, 7, 8, 5);
  it('copies the padding of a bare HH:MM sample', () => {
    expect(formatStudioTime(at, '19:00')).toBe('08:05');
    expect(formatStudioTime(at, '7:00')).toBe('8:05');
  });
  it("otherwise formats in Studio's language", () => {
    studioIn('en-US');
    expect(formatStudioTime(at, '7:00 PM')).toBe('8:05 AM');
  });
});

describe('formatStudioDate', () => {
  const at = new Date(2026, 9, 7, 8, 5);
  it("formats in Studio's language with the Gregorian year", () => {
    studioIn('en-US');
    expect(formatStudioDate(at, 'Oct 2, 2026')).toBe('Oct 7, 2026');
  });
  it('switches to the Buddhist year when Studio shows one', () => {
    studioIn('th');
    expect(formatStudioDate(at, '2 ต.ค. 2569')).toBe('7 ต.ค. 2569');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/schedule.test.ts`
Expected: FAIL — cannot resolve `../lib/studio/schedule`.

- [ ] **Step 3: Write the config and extract**

`extension/scripts/port/schedule.mjs`:
```js
// lib/studio/schedule.ts ← "ตั้งเวลาปล่อย" (typing the release date/time into Studio)
export default {
  file: 'lib/studio/schedule.ts',
  regions: ['1383-1506'],
  subs: [],
};
```
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { L } from '../i18n';
import { pad } from '../template';
import { getDialog, isVisible, sleep, waitFor } from './automation';
import { SEL } from './sel';

// @port-begin
EOF
port schedule
cat <<'EOF'
// @port-end

export { studioLang, typeInto, formatStudioDate, formatStudioTime, parseClock, setSchedule };
EOF
} > lib/studio/schedule.ts
```

- [ ] **Step 4: Add types until `tsc` is clean, then check**

Specifics: `const norm = (x: unknown) =>`, `normDate` the same; `dlg!` where dereferenced; inputs `HTMLInputElement`.

Run: `npx tsc --noEmit && node scripts/port-check.mjs schedule && npx vitest run tests/schedule.test.ts`
Expected: clean; `ok   schedule (lib/studio/schedule.ts, 104 lines)`; PASS, **6 tests**.

- [ ] **Step 5: Commit**

```bash
git add extension/scripts/port/schedule.mjs extension/lib/studio/schedule.ts extension/tests/schedule.test.ts
git commit -m "Port the release-time scheduling routines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The upload dialog (`lib/studio/upload-dialog.ts`)

Thumbnail upload, the Monetisation / Ad suitability / Visibility steps, notice dialogs, opening the picker, injecting the File, and the "Copy upload dialog info" diagnostic. `injectingFile` (userscript line 585) lives here because both `setThumbnail` and `injectUploadFile` assign it; the queue's drop interceptor (2b) reads the live binding.

**Files:**
- Create: `extension/scripts/port/upload-dialog.mjs`, `extension/lib/studio/upload-dialog.ts`
- Test: `extension/tests/upload-dialog.test.ts` (new characterization tests)

**Interfaces:**
- Consumes: `browser` (`wxt/browser`); `THUMB_MAX`; `L`; `SEL`, `TXT`; `settings` (Task 4); `buttonByText`, `byText`, `clickableOf`, `detailsOpen`, `getDialog`, `isVisible`, `leafByText`, `shown`, `sleep`, `T`, `waitFor` (Task 5).
- Produces (`lib/studio/upload-dialog.ts`): `export let injectingFile: boolean`; `thumbUnusable(file: { name: string; size: number }): boolean`; `setThumbnail(file: File, wait?: number): Promise<string>`; `handleMonetisation(): Promise<boolean>`; `handleAdSuitability(): Promise<boolean>`; `goToVisibility(vis: string | null): Promise<boolean>`; `ackNoticeDialogs(): boolean`; `closeAfterDialogs(): void`; `closeStudioUploadDialog(): void`; `dialogError(): string`; `openFilePicker(): Promise<{ input?: HTMLInputElement; err?: string }>`; `injectUploadFile(input: HTMLInputElement, file: File): Promise<boolean>`; `diagnoseUploadDialog(): object`; `checkSelectors(): { missing: string[]; broken: string[] }`; `uploadProgressText(): string`.

- [ ] **Step 1: Write the failing test**

`extension/tests/upload-dialog.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEL } from '../lib/studio/sel';
import { checkSelectors, diagnoseUploadDialog, dialogError, setThumbnail, thumbUnusable, uploadProgressText } from '../lib/studio/upload-dialog';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// Most of this module drives Studio's real upload dialog and is checked by hand on
// Studio. These pin the parts that decide without it.
beforeEach(() => vi.stubGlobal('document', makeDocument()));
afterEach(() => vi.unstubAllGlobals());

const file = (name: string, size: number) => ({ name, size }) as File;

describe('thumbnails Studio will never take', () => {
  it('are over 2 MB or not JPG / PNG / GIF / BMP', () => {
    expect(thumbUnusable(file('a.jpg', 2 * 1024 * 1024))).toBe(false);
    expect(thumbUnusable(file('a.jpg', 2 * 1024 * 1024 + 1))).toBe(true);
    expect(thumbUnusable(file('a.webp', 10))).toBe(true);
    expect(thumbUnusable(file('a.PNG', 10))).toBe(false);
  });

  it('are refused with a reason before touching the page', async () => {
    expect(await setThumbnail(file('big.jpg', 3 * 1048576))).toBe('Thumbnail is larger than 2MB (3.0 MB)');
    expect(await setThumbnail(file('a.webp', 10))).toBe('Unsupported file type. Use JPG / PNG / GIF / BMP');
    expect(await setThumbnail(file('a.jpg', 10))).toBe('Upload dialog not found');
  });
});

describe('with no upload dialog open', () => {
  it('reports nothing in progress and no error', () => {
    expect(uploadProgressText()).toBe('');
    expect(dialogError()).toBe('');
  });

  it('the diagnostic says to open the details page first', () => {
    expect(diagnoseUploadDialog()).toEqual({
      error: 'Details page is not open yet — select a file in the upload dialog first, then try again',
    });
  });

  it('checkSelectors lists every SEL key as missing', () => {
    const { missing, broken } = checkSelectors();
    expect(broken).toEqual([]);
    expect(new Set(missing)).toEqual(new Set(Object.keys(SEL)));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/upload-dialog.test.ts`
Expected: FAIL — cannot resolve `../lib/studio/upload-dialog`.

- [ ] **Step 3: Write the config and extract**

`extension/scripts/port/upload-dialog.mjs`:
```js
// lib/studio/upload-dialog.ts ← thumbnail, the steps between Details and Visibility,
// notice dialogs, opening the picker, file injection and the dialog diagnostics.
export default {
  file: 'lib/studio/upload-dialog.ts',
  regions: ['585-585', '1225-1278', '1285-1381', '1508-1545', '1551-1683'],
  subs: [
    ["version: GM_info && GM_info.script ? GM_info.script.version : '',", 'version: browser.runtime.getManifest().version,', 1],
    ['[].concat(v)', '([]).concat(v)', 1], // TS-forced: `[]` is never[]; ([] as string[]) keeps its parentheses
  ],
};
```
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { browser } from 'wxt/browser';
import { THUMB_MAX } from '../constants';
import { L } from '../i18n';
import { buttonByText, byText, clickableOf, detailsOpen, getDialog, isVisible, leafByText, shown, sleep, T, waitFor } from './automation';
import { SEL } from './sel';
import { settings } from './state';
import { TXT } from './txt';

// @port-begin
EOF
port upload-dialog
cat <<'EOF'
// @port-end

export {
  injectingFile, thumbUnusable, setThumbnail, handleMonetisation, handleAdSuitability, goToVisibility, ackNoticeDialogs,
  closeAfterDialogs, closeStudioUploadDialog, dialogError, openFilePicker, injectUploadFile, diagnoseUploadDialog,
  checkSelectors, uploadProgressText,
};
EOF
} > lib/studio/upload-dialog.ts
```
After extraction, the `checkSelectors` line reads `… : ([]).concat(v)) {`; type it as `([] as string[]).concat(v)`.

- [ ] **Step 4: Add types until `tsc` is clean, then check**

Specifics: `thumbUnusable = (file: { name: string; size: number })`; `setThumbnail(file: File, wait = 6000): Promise<string>`; `goToVisibility(vis: string | null)`; `const out: { missing: string[]; broken: string[] } = …`; `catch (e: any)` is not needed (the `catch (e)` there doesn't use `e`).

Run: `npx tsc --noEmit && node scripts/port-check.mjs upload-dialog && npx vitest run tests/upload-dialog.test.ts`
Expected: clean; `ok   upload-dialog (lib/studio/upload-dialog.ts, 271 lines)`; PASS, **5 tests**.

- [ ] **Step 5: Commit**

```bash
git add extension/scripts/port/upload-dialog.mjs extension/lib/studio/upload-dialog.ts extension/tests/upload-dialog.test.ts
git commit -m "Port the upload dialog routines: thumbnail, visibility steps, picker and file injection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The current channel (`lib/studio/channel.ts`)

`getChannel()` read `ytcfg` synchronously through `unsafeWindow`. `ytcfg` is only reachable from the MAIN world (async RPC), so the content script copies `CHANNEL_ID` into a module cache (`refreshCfg`) and `getChannel()` stays synchronous; the URL path (`/channel/UC…`) is still read first, exactly as before. This module also owns the `buildVars()` the page code calls (the template module takes settings and the channel name as `env`).

**Files:**
- Create: `extension/scripts/port/channel.mjs`, `extension/lib/studio/channel.ts`
- Test: `extension/tests/channel.test.ts`

**Interfaces:**
- Consumes: `L`; `buildVars as buildVarsWith`, `BuildOpts`, `Vars` (`lib/template.ts`); `SEL`; `settings` (Task 4).
- Produces (`lib/studio/channel.ts`): `interface Channel { id: string; name: string; avatar: string; handle: string }`; `getChannel(): Channel`; `chanLabel(c: Channel): string`; `channelProblem(): string`; `refreshCfg(read: (keys: string[]) => Promise<Record<string, unknown>>): Promise<void>` (keeps the last value when the read fails); `buildVars(rawName: unknown, n: number | string, txt?: unknown, opt?: BuildOpts): Vars` = template `buildVars` with `{ year: settings.year, producer: settings.producer, channelName: getChannel().name }`.

- [ ] **Step 1: Write the failing test**

`extension/tests/channel.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVars, channelProblem, getChannel, refreshCfg } from '../lib/studio/channel';
import { settings } from '../lib/studio/state';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// A Studio page: the URL path plus the navigation drawer's name / handle / avatar.
function page(pathname: string, drawer?: { name: string; handle: string; avatar: string }) {
  const doc = makeDocument();
  if (drawer) {
    const nav = doc.createElement('ytcp-navigation-drawer');
    const name = doc.createElement('div');
    name.setAttribute('id', 'entity-name');
    name.textContent = ` ${drawer.name} `;
    const sub = doc.createElement('div');
    sub.setAttribute('id', 'entity-subtitle');
    sub.textContent = `Your channel ${drawer.handle}`;
    const av = doc.createElement('div');
    av.setAttribute('id', 'avatar');
    const img = doc.createElement('img');
    img.src = drawer.avatar;
    av.append(img);
    nav.append(name, sub, av);
    doc.body.append(nav);
  }
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { pathname });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  settings.lockChannel = null;
  settings.producer = '';
});

describe('getChannel', () => {
  it('takes the id from the URL and the rest from the navigation drawer', () => {
    page('/channel/UCabcdefghijklmn/videos/upload', { name: 'Thai Beats', handle: '@thaibeats', avatar: 'https://yt3/a.jpg' });
    expect(getChannel()).toEqual({ id: 'UCabcdefghijklmn', name: 'Thai Beats', avatar: 'https://yt3/a.jpg', handle: '@thaibeats' });
  });

  it('falls back to ytcfg CHANNEL_ID from the MAIN world, and keeps it if a later read fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    page('/');
    await refreshCfg(async (keys) => Object.fromEntries(keys.map((k) => [k, 'UCfromytcfg12345'])));
    expect(getChannel().id).toBe('UCfromytcfg12345');
    await refreshCfg(async () => { throw new Error('getCfg: timed out after 10000 ms'); });
    expect(getChannel().id).toBe('UCfromytcfg12345');
  });
});

describe('channelProblem', () => {
  it('is empty when no channel is locked or the lock matches', () => {
    page('/channel/UCabcdefghijklmn');
    expect(channelProblem()).toBe('');
    settings.lockChannel = { id: 'UCabcdefghijklmn', name: 'Thai Beats' };
    expect(channelProblem()).toBe('');
  });

  it('names both channels when they differ', () => {
    page('/channel/UCotherchannel99', { name: 'Other', handle: '@other', avatar: '' });
    settings.lockChannel = { id: 'UCabcdefghijklmn', name: 'Thai Beats' };
    expect(channelProblem()).toBe('Currently on channel "Other" but locked to "Thai Beats"');
  });
});

describe('buildVars', () => {
  it('uses the producer setting, else the current channel name', () => {
    page('/channel/UCabcdefghijklmn', { name: 'Thai Beats', handle: '@thaibeats', avatar: '' });
    expect(buildVars('Midnight 140bpm.mp4', 1).producer).toBe('Thai Beats');
    settings.producer = 'BLXD';
    expect(buildVars('Midnight 140bpm.mp4', 1).producer).toBe('BLXD');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/channel.test.ts`
Expected: FAIL — cannot resolve `../lib/studio/channel`.

- [ ] **Step 3: Write the config and extract**

`extension/scripts/port/channel.mjs`:
```js
// lib/studio/channel.ts ← "ช่องที่กำลังใช้งาน (กันอัปผิดช่อง)"; ytcfg now comes from the MAIN world
export default {
  file: 'lib/studio/channel.ts',
  regions: ['1693-1714'],
  subs: [
    ["const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;", 'const W = mainWorld;', 1],
  ],
};
```
```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { L } from '../i18n';
import { buildVars as buildVarsWith, type BuildOpts, type Vars } from '../template';
import { SEL } from './sel';
import { settings } from './state';

// ytcfg lives in the page's MAIN world. The content script copies what getChannel()
// needs into `cfg` (refreshCfg) so getChannel() stays synchronous, as in the userscript.
const cfg: Record<string, unknown> = {};
const mainWorld: { ytcfg?: { get(key: string): string | undefined } } = { ytcfg: { get: (key) => cfg[key] as string | undefined } };
export async function refreshCfg(read: (keys: string[]) => Promise<Record<string, unknown>>): Promise<void> {
  try {
    Object.assign(cfg, await read(['CHANNEL_ID']));
  } catch (e) {
    console.warn('[ytup] ytcfg', e);
  }
}

export interface Channel { id: string; name: string; avatar: string; handle: string }

// @port-begin
EOF
port channel
cat <<'EOF'
// @port-end

// The userscript's buildVars() read the settings and the current channel itself; the
// template module takes them as env.
export const buildVars = (rawName: unknown, n: number | string, txt?: unknown, opt?: BuildOpts): Vars =>
  buildVarsWith(rawName, n, txt, opt, { year: settings.year, producer: settings.producer, channelName: getChannel().name });

export { chanLabel, channelProblem, getChannel };
EOF
} > lib/studio/channel.ts
```

- [ ] **Step 4: Add types until `tsc` is clean, then check**

The three type edits this module needs: `function getChannel(): Channel {`, `document.querySelector<HTMLImageElement>(` for the avatar, `const chanLabel = (c: Channel) =>`.

Run: `npx tsc --noEmit && node scripts/port-check.mjs channel && npx vitest run tests/channel.test.ts`
Expected: clean; `ok   channel (lib/studio/channel.ts, 19 lines)`; PASS, **5 tests**.

- [ ] **Step 5: Commit**

```bash
git add extension/scripts/port/channel.mjs extension/lib/studio/channel.ts extension/tests/channel.test.ts
git commit -m "Port current-channel detection; ytcfg comes from the MAIN world

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Invite accept and channel switch (`lib/invite.ts`, `lib/channel-switch.ts`, `invite.content.ts`)

The userscript's first two sections ran on both hosts: on www.youtube.com they pick the channel waiting on the channel switcher and accept collaboration invites; on Studio they recover from the post-switch "Oops" page and accept invites that land there. Both are ported as factories over an `env` holding exactly the globals the userscript used (and `getValue`/`setValue` for `GM_getValue`/`GM_setValue`) — the same seam `test/harness.mjs` used, so the ported tests' bodies stay byte-identical. Production passes the real page and a `SyncStore`.

**Files:**
- Create: `extension/scripts/port/channel-switch.mjs`, `extension/scripts/port/invite.mjs`, `extension/lib/channel-switch.ts`, `extension/lib/invite.ts`, `extension/entrypoints/invite.content.ts`
- Modify: `extension/lib/messages.ts`, `extension/entrypoints/studio.content.ts`, `extension/entrypoints/sidepanel/index.html`, `extension/entrypoints/sidepanel/main.ts`
- Create: `extension/tests/mock-invite.mjs` (copy), `extension/tests/channel-switch.test.mjs`, `extension/tests/invite-accept.test.mjs` (ported)

**Interfaces:**
- Consumes: `normText`, `switcherRowMatches`, `acceptLabelMatches`, `INVITE_URL` (`lib/collab.ts`); `L`; `SEL`, `TXT`; `SyncStore`, `createSyncStore` (Task 3); `initState` (Task 4); `refreshCfg` (Task 9); `createFileBridge` (Task 1).
- Produces:
  - `lib/channel-switch.ts`: `SWITCH_KEY`, `SWITCHED_KEY`, `ACCEPT_ROUND_KEY`, `SWITCH_TTL`; `interface PendingSwitch { at: number; next: string; handle?: string; name?: string }`; `interface SwitchedMarker { at: number; tries: number; next: string }`; `interface SwitchEnv { document; location; setInterval; clearInterval; console: Pick<Console,'info'>; getValue<T>(key, fallback?): T; setValue(key, value): void }`; `createChannelSwitch(env: SwitchEnv) → { pendingSwitch, clearSwitch, switchToChannel(target: { handle?: string; name?: string }, next: string), watchChannelSwitcher(), recoverAfterSwitch() }`.
  - `lib/invite.ts`: `interface InviteEnv extends SwitchEnv { getComputedStyle(el): { visibility: string }; setTimeout(fn, ms): unknown }`; `createInviteWatcher(env: InviteEnv) → { inviteUrlNow(), watchInvite(), armSpaPoll() }`; `INVITE_KEYS = ['settings', SWITCH_KEY, SWITCHED_KEY, ACCEPT_ROUND_KEY]`; `browserEnv(kv: SyncStore): InviteEnv`.
  - `ProtocolMap` gains `'dev:switchChannel'(t: { handle: string; next: string }): void` (developer panel → Studio tab).
  - `entrypoints/invite.content.ts` on `https://www.youtube.com/*`.

- [ ] **Step 1: Port the two tests (header swap only) and copy the mock**

```bash
cp ../test/mock-invite.mjs tests/mock-invite.mjs
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createChannelSwitch } from '../lib/channel-switch';
import { makeDocument } from './fake-dom.mjs';

// harness.mjs evaluated the switcher with these globals swapped for fakes and armed
// both watchers; the module takes them as env instead.
function makeSwitcher(doc, win, store) {
  const sw = createChannelSwitch({
    document: doc, location: win.location, setInterval: win.setInterval, clearInterval: win.clearInterval,
    console: { info() {} },
    getValue: (k, d) => (k in store ? store[k] : d),
    setValue: (k, v) => { store[k] = v; },
  });
  sw.watchChannelSwitcher();
  sw.recoverAfterSwitch();
  return sw;
}
EOF
tail -n +5 ../test/channel-switch.test.mjs; } > tests/channel-switch.test.mjs
{ cat <<'EOF'
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createInviteWatcher } from '../lib/invite';
import { mockInvitePage } from './mock-invite.mjs';

// harness.mjs evaluated watchInvite with these globals swapped for fakes and armed it
// once; the module takes them as env instead. Its settings read always saw {}.
function makeWatcher(doc, win, store = {}) {
  const { watchInvite } = createInviteWatcher({
    document: doc, location: win.location, getComputedStyle: win.getComputedStyle,
    setInterval: win.setInterval, clearInterval: win.clearInterval,
    setTimeout: () => 0, // the note's auto-remove timer would keep node alive
    console: win.console,
    getValue: (k, d) => (k === 'settings' ? {} : (k in store ? store[k] : d)),
    setValue: (k, v) => { store[k] = v; },
  });
  watchInvite();
  return watchInvite;
}
EOF
tail -n +5 ../test/invite-accept.test.mjs; } > tests/invite-accept.test.mjs
cmp tests/mock-invite.mjs ../test/mock-invite.mjs \
  && diff <(tail -n +20 tests/channel-switch.test.mjs) <(tail -n +5 ../test/channel-switch.test.mjs) \
  && diff <(tail -n +21 tests/invite-accept.test.mjs) <(tail -n +5 ../test/invite-accept.test.mjs) && echo bodies-identical
```
Expected: `bodies-identical`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/channel-switch.test.mjs tests/invite-accept.test.mjs`
Expected: FAIL — cannot resolve `../lib/channel-switch` / `../lib/invite`.

- [ ] **Step 3: Configs**

`extension/scripts/port/channel-switch.mjs`:
```js
// lib/channel-switch.ts ← "สลับช่องให้อัตโนมัติ" (without the two calls that armed it at load)
export default {
  file: 'lib/channel-switch.ts',
  regions: ['249-307', '310-339'],
  subs: [
    ['GM_getValue(', 'getValue(', 2],
    ['GM_setValue(', 'setValue(', 6],
  ],
};
```
`extension/scripts/port/invite.mjs`:
```js
// lib/invite.ts ← the invite helpers (234-247; INVITE_URL comes from lib/collab.ts), the
// accept watcher (342-469) and the SPA re-arm poller (471-477)
export default {
  file: 'lib/invite.ts',
  regions: ['234-247', '342-469', '471-477'],
  subs: [
    ['GM_getValue(', 'getValue(', 2],
    ['GM_setValue(', 'setValue(', 3],
  ],
};
```

- [ ] **Step 4: Extract `lib/channel-switch.ts`**

```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { normText, switcherRowMatches } from './collab';
import { SEL } from './studio/sel';
import { TXT } from './studio/txt';

// A switch waiting to be picked on www.youtube.com/channel_switcher, and the marker
// left after picking (read by the post-switch Oops recovery on Studio).
export interface PendingSwitch { at: number; next: string; handle?: string; name?: string }
export interface SwitchedMarker { at: number; tries: number; next: string }

// What the switcher touches outside itself. The content scripts pass the real page
// (and the chrome.storage mirror for get/set); tests pass a fake DOM, clock and store.
export interface SwitchEnv {
  document: Document;
  location: Location;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  console: Pick<Console, 'info'>;
  getValue: <T>(key: string, fallback?: T) => T;
  setValue: (key: string, value: unknown) => void;
}

// @port-begin
EOF
port channel-switch 249-258
cat <<'EOF'
// @port-end

export function createChannelSwitch(env: SwitchEnv) {
  const { document, location, setInterval, clearInterval, console, getValue, setValue } = env;
  // @port-begin
EOF
port channel-switch 259-307
port channel-switch 310-339
cat <<'EOF'
  // @port-end
  return { pendingSwitch, clearSwitch, switchToChannel, watchChannelSwitcher, recoverAfterSwitch };
}
EOF
} > lib/channel-switch.ts
```
Then make these exact type edits (nothing else is needed for `tsc`):
- the four `const SWITCH_KEY…`, `SWITCHED_KEY`, `ACCEPT_ROUND_KEY`, `SWITCH_TTL` lines get `export `;
- `getValue(SWITCH_KEY, null)` → `getValue<PendingSwitch | null>(SWITCH_KEY, null)`;
- `function switchToChannel(target, next)` → `function switchToChannel(target: { handle?: string; name?: string }, next: string)`;
- both `const say = (m) =>` → `const say = (m: string) =>`;
- `const vis = (e) =>` → `const vis = (e: Element | null): e is Element =>`;
- `document.querySelector(SEL.switcherConfirm)` → `document.querySelector<HTMLElement>(SEL.switcherConfirm)`;
- `[...document.querySelectorAll(SEL.switcherItem)]` → `[...document.querySelectorAll<HTMLElement>(SEL.switcherItem)]`;
- `row.querySelector(SEL.switcherItemClick)` → `row.querySelector<HTMLElement>(SEL.switcherItemClick)`;
- `getValue(SWITCHED_KEY, null)` → `getValue<SwitchedMarker | null>(SWITCHED_KEY, null)`.

- [ ] **Step 5: Extract `lib/invite.ts`**

```bash
port() { node scripts/port-check.mjs --print "$@"; }
{ cat <<'EOF'
import { ACCEPT_ROUND_KEY, SWITCHED_KEY, SWITCH_KEY, type SwitchEnv } from './channel-switch';
import { acceptLabelMatches, INVITE_URL, normText } from './collab';
import { L } from './i18n';
import { SEL } from './studio/sel';
import type { SyncStore } from './sync-store';

export interface InviteEnv extends SwitchEnv {
  getComputedStyle: (el: Element) => { visibility: string };
  setTimeout: (fn: () => void, ms: number) => unknown;
}
interface AcceptRound { n: number; at: number }

export function createInviteWatcher(env: InviteEnv) {
  const { document, location, getComputedStyle, setInterval, clearInterval, setTimeout, console, getValue, setValue } = env;
  // @port-begin
EOF
port invite 234-247
port invite 342-469
cat <<'EOF'
  // @port-end
  // Studio is a SPA: the invite link often passes through other pages first.
  function armSpaPoll() {
    // @port-begin
EOF
port invite 471-477
cat <<'EOF'
    // @port-end
  }
  return { inviteUrlNow, watchInvite, armSpaPoll };
}

// The storage keys these watchers read and write synchronously.
export const INVITE_KEYS = ['settings', SWITCH_KEY, SWITCHED_KEY, ACCEPT_ROUND_KEY];

// The real page as an InviteEnv: the globals the userscript used, and a chrome.storage
// mirror in place of GM_getValue / GM_setValue.
export const browserEnv = (kv: SyncStore): InviteEnv => ({
  document,
  location,
  getComputedStyle: (el) => getComputedStyle(el),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  console,
  getValue: (key, fallback) => kv.get(key, fallback),
  setValue: (key, value) => kv.set(key, value),
});
EOF
} > lib/invite.ts
```
Exact type edits:
- `const inviteNote = (text, ok = true)` → `(text: string, ok = true)`;
- `function deepFind(root, sel, out = [])` → `function deepFind(root: ParentNode, sel: string, out: HTMLElement[] = []): HTMLElement[]`, and in it `root.querySelectorAll(sel)` → `root.querySelectorAll<HTMLElement>(sel)`;
- `(getValue('settings') || {})` → `(getValue<{ autoAcceptInvite?: boolean } | undefined>('settings') || {})`;
- `const say = (msg, ...rest)` → `(msg: string, ...rest: unknown[])`;
- `const visible = (el) =>` → `const visible = (el: Element | null | undefined): el is Element =>`;
- `const live = (b) =>` → `const live = (b: HTMLElement & { disabled?: boolean }) =>`;
- in `requestRow`: `host.querySelectorAll(SEL.inviteRequestRow)` → `host.querySelectorAll<HTMLElement>(SEL.inviteRequestRow)`;
- `const rowTitle = (r) =>` → `(r: Element) =>`;
- `getValue(ACCEPT_ROUND_KEY, null)` → `getValue<AcceptRound | null>(ACCEPT_ROUND_KEY, null)`;
- `dead.querySelector(SEL.dialogClose)` → `dead.querySelector<HTMLElement>(SEL.dialogClose)`;
- `row.querySelector(SEL.inviteRowOpen)` → `row.querySelector<HTMLElement>(SEL.inviteRowOpen)`.

Run: `npx tsc --noEmit && node scripts/port-check.mjs channel-switch invite`
Expected: clean; `ok   channel-switch (lib/channel-switch.ts, 72 lines)` and `ok   invite (lib/invite.ts, 117 lines)`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/channel-switch.test.mjs tests/invite-accept.test.mjs`
Expected: PASS, **12** + **18** tests (same counts as `../test/`).

- [ ] **Step 7: The www.youtube.com content script**

`extension/entrypoints/invite.content.ts`:
```ts
import { createChannelSwitch } from '@/lib/channel-switch';
import { initI18n } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { createSyncStore } from '@/lib/sync-store';

// www.youtube.com: pick the channel waiting on the channel switcher, and accept
// collaboration invites — all the userscript did outside Studio.
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  async main() {
    await initI18n();
    const env = browserEnv(await createSyncStore(INVITE_KEYS));
    const sw = createChannelSwitch(env);
    sw.watchChannelSwitcher();
    sw.recoverAfterSwitch();
    const invite = createInviteWatcher(env);
    invite.watchInvite();
    invite.armSpaPoll();
  },
});
```

- [ ] **Step 8: The Studio content script and the developer switch control**

In `extension/lib/messages.ts` add to `ProtocolMap` after `'spike:inject'…`:
```ts
  // developer panel → Studio tab: start a channel switch (the real trigger arrives in Phase 3)
  'dev:switchChannel'(t: { handle: string; next: string }): void;
```

Replace `extension/entrypoints/studio.content.ts` with:
```ts
import { createChannelSwitch } from '@/lib/channel-switch';
import { createFileBridge } from '@/lib/file-bridge-client';
import { initI18n } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { MAIN_CH, type MainOps } from '@/lib/main-ops';
import { onMessage, sendMessage } from '@/lib/messages';
import { rpcClient, windowEndpoint } from '@/lib/rpc';
import { createSyncStore } from '@/lib/sync-store';
import { refreshCfg } from '@/lib/studio/channel';
import { injectIntoUploadDialog } from '@/lib/studio/inject-spike';
import { initState } from '@/lib/studio/state';

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
    const files = createFileBridge(document);

    onMessage('spike:cfg', () =>
      readCfg(['CHANNEL_ID', 'DELEGATED_SESSION_ID', 'SESSION_INDEX', 'INNERTUBE_CONTEXT_CLIENT_VERSION']),
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

    try {
      await initState();
    } catch (e) {
      console.error('[ytup] page automation is off:', e);
      return;
    }
    await refreshCfg(readCfg);
    console.info('[ytup] state ready');
  },
});
```

In `extension/entrypoints/sidepanel/index.html`, add before `<pre id="log"…>`:
```html
    <p>
      <input id="handle" placeholder="@handle" style="width: 140px" />
      <button id="switch">Switch channel</button>
    </p>
```
In `extension/entrypoints/sidepanel/main.ts`, add after the `#regrant` listener:
```ts
$('#switch').addEventListener('click', async () => {
  const handle = $<HTMLInputElement>('#handle').value.trim();
  if (!handle) return;
  try {
    await sendMessage('dev:switchChannel', { handle, next: 'https://studio.youtube.com/' }, await studioTabId());
    log(`switching to ${handle}`);
  } catch (e) {
    log(`switch: ERROR ${errText(e)}`);
  }
});
```

- [ ] **Step 9: Run the checks and build**

Run: `npm run check && node scripts/port-check.mjs && npm run build`
Expected: full suite **256** tests pass; every config `ok`; the build lists `content-scripts/invite.js`, and `.output/chrome-mv3/manifest.json` has a `content_scripts` entry matching `https://www.youtube.com/*`.

- [ ] **Step 10: Manual check — invite accept and channel switch (needs the logged-in Chrome profile)**

Reload the unpacked extension. **Disable the userscript in Tampermonkey for this check** (both would click). DevTools console, filter `[YT Upload Presets]` / `[ytup]`.
1. Studio console shows `[ytup] state ready`.
2. **Switch to an owned channel:** in the side panel type another channel's `@handle` you own → Switch channel. Expected: the tab goes to `www.youtube.com/channel_switcher…`, console `switch: looking for @…`, `switch: switching to @…`, then Studio of that channel loads. If an "Oops, you don't have permission" page appears first, `switch: switched but the page says no permission — retrying on a clean URL` follows and the clean URL loads.
3. **Switch to a channel you only manage:** same; expected an extra `switch: confirming the manager-channel notice`.
4. **Invite accept:** open an "ACCEPT INVITATION" link from a collaboration email (or ask a teammate for a fresh invite link). Expected: `invite: watching …`, `invite: opening request 1: …`, `invite: accepting request 1`, the link reopens for the next request until none remain, then the in-page note "Invitation accepted" / "Accepted N collaboration requests".
5. Settings `autoAcceptInvite: false` (set it in DevTools of the panel: `chrome.storage.local.get('settings')`, then set with the flag) → reopening an invite link logs nothing from `invite:`.
Record pass/fail per step in the task report.

- [ ] **Step 11: Commit**

```bash
git add extension/scripts/port/channel-switch.mjs extension/scripts/port/invite.mjs extension/lib/channel-switch.ts extension/lib/invite.ts extension/lib/messages.ts extension/entrypoints/invite.content.ts extension/entrypoints/studio.content.ts extension/entrypoints/sidepanel extension/tests/mock-invite.mjs extension/tests/channel-switch.test.mjs extension/tests/invite-accept.test.mjs
git commit -m "Port invite accept and channel switch; run them on www.youtube.com and Studio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Phase 2a wrap-up

**Files:** none new.

- [ ] **Step 1: Full verification**

Run from `extension/`:
```bash
npm run check && npm run port-check && npm run build
```
Expected: 256 tests pass, `tsc` clean; `port-check` prints `ok` for `automation channel channel-switch invite schedule state studio-collab upload-dialog`; build succeeds.

Run from the repo root: `node --test test/*.test.mjs`
Expected: **144** pass (the userscript's own tests are untouched).

- [ ] **Step 2: Confirm nothing outside `extension/` and the plan changed**

Run from the repo root: `git diff --stat d15ef87 -- . ':!extension' ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 3: Hand over to Phase 2b**

No commit. Report: the Task 1 bridge console lines from real Studio, the Task 10 manual results, and any `// TS-forced` substitutions added.

---

## What Phase 2b builds on this

`state.ts` (`load`/`save`/live objects), `automation.ts`, `upload-dialog.ts` (`injectingFile` live binding), `schedule.ts`, `channel.ts` (`buildVars`, `getChannel`, `refreshCfg`), `createFileBridge`, `port-check`. Phase 2b: `docs/superpowers/plans/2026-10-06-chrome-extension-phase-2b.md`.
