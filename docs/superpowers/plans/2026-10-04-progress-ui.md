# Progress UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make any running task visible from anywhere in the UI, and give the file upload real in-clip progress.

**Architecture:** One `activity()` model — a thin impure wrapper over a pure `activityFrom()` — picks by priority between the upload queue and `Claims.status()`. Four views read it: a new always-visible bar above the tab row, the FAB, the uploading clip's card, and the existing Claims card (unchanged). In-clip percentage comes from polling Studio's own progress string on the existing 800 ms tick.

**Tech Stack:** Plain ES2020 in a single Tampermonkey userscript. No build step. Tests are `node --test` with zero dependencies, using the slice harness in `test/harness.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-04-progress-ui-design.md`

## Global Constraints

- Single file: all script changes go in `youtube-upload-presets.user.js`. No new runtime files.
- Every user-visible string uses `L(th, en)` — Thai first, English second. Never a bare string.
- Studio selectors go in `SEL`; regexes matched against Studio's rendered text go in `TXT`. Never inline either.
- Pure functions live in their own `// ===== ... =====` section so `test/harness.mjs` can slice them. They may not touch `document`, `queue`, `settings`, or `GM_*`.
- Tests must pass with `node --test test/*.test.mjs`. Syntax gate: `node --check youtube-upload-presets.user.js`.
- `node --check` only catches syntax. After any step that deletes or renames a variable, grep for remaining references.
- Reuse existing CSS: `.tbx-bar` / `.tbx-bar.ind` (bar + indeterminate animation, keyframes `ytp-ind` at :2010) and the `--brand` / `--info` / `--ok` / `--warn` tokens.
- Do not modify `computeStatus()`'s behaviour or the Claims status card.
- Bump `@version` only in the final task.

### Deviation from the spec — confirm before Task 2

The spec's model has `task: 'upload' | 'scan' | 'trim' | 'ads' | 'collab'`. `computeStatus()` does not report which claims sub-task is running — it returns only a severity `kind` plus a distinct icon per task (🔍 scan, ✂️ trim, 💰 ads, 🤝 collab). Deriving the sub-type would mean changing `computeStatus()`, which the constraints forbid.

This plan therefore uses `task: 'upload' | 'claims'`. Nothing is lost: `tab` drives the click target and the icon already identifies the task on screen. If the five-value field is actually wanted, `computeStatus()` must return a `task` field and this plan needs one extra task.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `youtube-upload-presets.user.js` | everything at runtime | new pure section + model + 3 view updates + CSS |
| `test/harness.mjs` | slices pure blocks out of the script | add one slice, export two functions |
| `test/activity.test.mjs` | tests for the two pure functions | create |

New section `// ===== งานที่กำลังทำ (progress) =====` is inserted immediately before `// ===== Studio DOM automation =====`, holding `parseUploadPct` and `activityFrom`. This mirrors how `checkTracklist` already sits in its own pure section away from its caller, and gives the harness a stable slice boundary.

---

### Task 1: `parseUploadPct` — read a percentage out of Studio's progress string

**Files:**
- Modify: `youtube-upload-presets.user.js` (new section before `// ===== Studio DOM automation =====`, currently at :583)
- Modify: `test/harness.mjs:30-56` (add slice + exports)
- Create: `test/activity.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseUploadPct(text: string) => number | null` — a fraction in `0..1`, or `null` when the string carries no percentage. Clamped to `1`.

- [ ] **Step 1: Add the harness slice and exports**

In `test/harness.mjs`, after the line `const TRACKLIST = block('const parseTime =', 'function showTracklistFix');` add:

```js
// parseUploadPct reads TXT.uploadPct, so the registry has to be in scope too
const TXTREG = block('// ===== ข้อความที่ Studio แสดง =====', '// ===== ชื่อ element ของ Studio');
const ACTIVITY = block('// ===== งานที่กำลังทำ (progress) =====', '// ===== Studio DOM automation');
```

Then inside the `new Function(...)` template string, add `${TXTREG}` and `${ACTIVITY}` in that
order immediately after `${TRACKLIST}`, and add `parseUploadPct,` to the returned object
literal.

Add ONLY `parseUploadPct` here. `activityFrom` does not exist until Task 2, and naming it in
the return object now would throw `activityFrom is not defined` when the harness builds.

`TXT` is a block of regex literals with no dependencies, so it slices cleanly on its own.

- [ ] **Step 2: Write the failing test**

Create `test/activity.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from './harness.mjs';

test('parseUploadPct reads the percentage out of Studio\'s English string', () => {
  assert.equal(S.parseUploadPct('Uploading 45% … 3 minutes left'), 0.45);
});

test('parseUploadPct reads the Thai string', () => {
  assert.equal(S.parseUploadPct('กำลังอัปโหลด 45% · เหลืออีก 3 นาที'), 0.45);
});

test('parseUploadPct returns null when there is no percentage', () => {
  assert.equal(S.parseUploadPct('Upload complete'), null);
  assert.equal(S.parseUploadPct(''), null);
  assert.equal(S.parseUploadPct(undefined), null);
});

test('parseUploadPct handles the endpoints', () => {
  assert.equal(S.parseUploadPct('0%'), 0);
  assert.equal(S.parseUploadPct('100%'), 1);
});

test('parseUploadPct clamps a nonsense value instead of exceeding 1', () => {
  assert.equal(S.parseUploadPct('250%'), 1);
});

test('parseUploadPct tolerates a space before the sign', () => {
  assert.equal(S.parseUploadPct('Uploading 7 %'), 0.07);
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --test test/activity.test.mjs`
Expected: FAIL — `harness: block start not found: // ===== งานที่กำลังทำ (progress) =====`

- [ ] **Step 4: Add the section and the function**

In `youtube-upload-presets.user.js`, immediately **before** the line `  // ===== Studio DOM automation =====`, insert:

```js
  // ===== งานที่กำลังทำ (progress) =====
  // ฟังก์ชันล้วนสองตัวสำหรับแถบความคืบหน้า — ห้ามแตะ DOM / queue / settings (test/ ตัดบล็อกนี้ไปเทสต์)

  // ดึงเปอร์เซ็นต์จากข้อความความคืบหน้าของ Studio เช่น "Uploading 45% … 3 minutes left"
  // คืน 0..1 หรือ null ถ้าไม่มีตัวเลขเปอร์เซ็นต์ (Studio เปลี่ยนรูปแบบ -> แถบถอยไปนับเป็นคลิป)
  function parseUploadPct(text) {
    const m = String(text || '').match(TXT.uploadPct);
    if (!m) return null;
    return Math.max(0, Math.min(1, +m[1] / 100));
  }

```

Then add to the `TXT` registry (the bilingual group, after the `uploadLimit` entry):

```js
    uploadPct: /(\d{1,3})\s*%/, // เปอร์เซ็นต์ในข้อความความคืบหน้าของ Studio
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test test/activity.test.mjs`
Expected: PASS, 6 tests

Run: `node --check youtube-upload-presets.user.js`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add youtube-upload-presets.user.js test/harness.mjs test/activity.test.mjs
git commit -m "Add parseUploadPct for Studio's upload progress string"
```

---

### Task 2: `activityFrom` — decide what is running

**Files:**
- Modify: `youtube-upload-presets.user.js` (the `// ===== งานที่กำลังทำ (progress) =====` section from Task 1)
- Modify: `test/activity.test.mjs`

**Interfaces:**
- Consumes: `parseUploadPct` from Task 1 (not called directly; its output arrives as `prog.pct`).
- Produces:

```
activityFrom(q, claims, prog) => null | {
  task: 'upload' | 'claims',
  icon: string,
  tab: 'queue' | 'claims',
  count: { at: number, of: number } | null,   // upload branch only
  title: string,                              // '' on the upload branch; the view fills it
  detail: string,
  progress: number | null                     // 0..1, null = indeterminate
}

q     = { running: boolean, inFlight: boolean, total: number, done: number, errors: number }
claims= computeStatus() output, or null
prog  = { pct: number|null, text: string } or null
```

- [ ] **Step 1: Export it from the harness**

In `test/harness.mjs`, add `activityFrom,` to the object returned by the `new Function(...)`
call, next to the `parseUploadPct,` that Task 1 added.

- [ ] **Step 2: Write the failing tests**

Append to `test/activity.test.mjs`:

```js
const IDLE_Q = { running: false, inFlight: false, total: 0, done: 0, errors: 0 };
const BUSY_CLAIMS = { kind: 'busy', icon: '✂️', title: 'Trimming claim 2 of 5', detail: 'some video', progress: 0.4 };

test('activityFrom returns null when nothing is running', () => {
  assert.equal(S.activityFrom(IDLE_Q, null, null), null);
});

test('activityFrom reports the upload while the queue runs', () => {
  const q = { running: true, inFlight: true, total: 12, done: 3, errors: 0 };
  const a = S.activityFrom(q, null, { pct: 0.45, text: 'Uploading 45%' });
  assert.equal(a.task, 'upload');
  assert.equal(a.tab, 'queue');
  assert.deepEqual(a.count, { at: 4, of: 12 });
  assert.equal(a.detail, 'Uploading 45%');
  assert.ok(Math.abs(a.progress - 0.2875) < 1e-9, `progress was ${a.progress}`);
});

test('activityFrom falls back to whole clips when the percentage is unreadable', () => {
  const q = { running: true, inFlight: true, total: 12, done: 3, errors: 0 };
  const a = S.activityFrom(q, null, { pct: null, text: '' });
  assert.equal(a.progress, 3 / 12);
  assert.equal(a.detail, '');
});

test('activityFrom counts errored clips in the title index but not the bar', () => {
  const q = { running: true, inFlight: true, total: 10, done: 2, errors: 3 };
  const a = S.activityFrom(q, null, { pct: null, text: '' });
  assert.deepEqual(a.count, { at: 6, of: 10 });
  assert.equal(a.progress, 2 / 10);
});

test('activityFrom lets the upload outrank a busy claims run', () => {
  const q = { running: true, inFlight: true, total: 2, done: 0, errors: 0 };
  assert.equal(S.activityFrom(q, BUSY_CLAIMS, null).task, 'upload');
});

test('activityFrom reports a claims run when the queue is idle', () => {
  const a = S.activityFrom(IDLE_Q, BUSY_CLAIMS, null);
  assert.equal(a.task, 'claims');
  assert.equal(a.tab, 'claims');
  assert.equal(a.icon, '✂️');
  assert.equal(a.title, 'Trimming claim 2 of 5');
  assert.equal(a.progress, 0.4);
  assert.equal(a.count, null);
});

test('activityFrom treats a waiting claims status as running', () => {
  const a = S.activityFrom(IDLE_Q, { kind: 'wait', icon: '⏳', title: 'Waiting', detail: '' }, null);
  assert.equal(a.task, 'claims');
  assert.equal(a.progress, null, 'no progress field means indeterminate');
});

test('activityFrom ignores idle and ok claims statuses', () => {
  assert.equal(S.activityFrom(IDLE_Q, { kind: 'idle', icon: '✓', title: 'Ready' }, null), null);
  assert.equal(S.activityFrom(IDLE_Q, { kind: 'ok', icon: '🤖', title: 'Auto-pilot is on' }, null), null);
});

test('activityFrom reports an in-flight clip even when running is false', () => {
  const q = { running: false, inFlight: true, total: 1, done: 0, errors: 0 };
  assert.equal(S.activityFrom(q, null, null).task, 'upload');
});

test('activityFrom gives indeterminate progress for an empty queue', () => {
  const q = { running: true, inFlight: false, total: 0, done: 0, errors: 0 };
  assert.equal(S.activityFrom(q, null, null).progress, null);
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --test test/activity.test.mjs`
Expected: FAIL — `activityFrom is not defined`

- [ ] **Step 4: Implement it**

In the `// ===== งานที่กำลังทำ (progress) =====` section, after `parseUploadPct`, add:

```js
  // ตัดสินว่าตอนนี้มี "งาน" อะไรกำลังทำอยู่ — คืนอันเดียว หรือ null ถ้าว่าง
  //   q      = สรุปสถานะคิวอัปโหลด { running, inFlight, total, done, errors }
  //   claims = ผลจาก computeStatus() ของโมดูลลิขสิทธิ์ (หรือ null)
  //   prog   = { pct, text } ของคลิปที่กำลังอัป (หรือ null)
  // คิวอัปโหลดมาก่อนเสมอ: สแกน claim อ่านอย่างเดียวและทับซ้อนกับการอัปได้
  // แถบใช้ done เป็นฐาน (ความหมายเดียวกับแถบในแท็บคิว) คลิปที่ error ไม่ดันแถบ แต่ดันเลขลำดับ
  function activityFrom(q, claims, prog) {
    if (q.running || q.inFlight) {
      const pct = prog && typeof prog.pct === 'number' ? prog.pct : 0;
      return {
        task: 'upload',
        icon: '⬆',
        tab: 'queue',
        count: { at: q.done + q.errors + 1, of: q.total },
        title: '', // ผู้เรียกเติมข้อความผ่าน L() เพราะฟังก์ชันนี้ต้องล้วน
        detail: (prog && prog.text) || '',
        progress: q.total ? Math.min(1, (q.done + pct) / q.total) : null,
      };
    }
    // computeStatus() คืนสถานะตอนว่างด้วย ('พร้อม' / 'Auto-pilot เปิดอยู่') -> นับแค่ busy กับ wait
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

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test test/activity.test.mjs`
Expected: PASS, 16 tests

Run: `node --test test/*.test.mjs`
Expected: PASS, 77 tests, 0 fail

- [ ] **Step 6: Commit**

```bash
git add youtube-upload-presets.user.js test/activity.test.mjs test/harness.mjs
git commit -m "Add activityFrom to pick the single running task"
```

---

### Task 3: Wire the live model

**Files:**
- Modify: `youtube-upload-presets.user.js:1189` (after `uploadProgressText`) — add `uploadProg` + `pollUploadProgress`
- Modify: `youtube-upload-presets.user.js:4694` — add `status` to the Claims export
- Modify: `youtube-upload-presets.user.js` (after `updateRunUI`, near :2560) — add `activity()`

**Interfaces:**
- Consumes: `activityFrom` and `parseUploadPct` (Task 2, Task 1); `uploadProgressText()` at :1189; `computeStatus()` at :4463.
- Produces:
  - `uploadProg` — module-level `{ pct, text } | null`
  - `pollUploadProgress()` — refreshes `uploadProg`; call once per tick
  - `Claims.status()` — `computeStatus()`, exposed
  - `activity()` — the localized model, or `null`

- [ ] **Step 1: Add the poller**

Immediately **after** the closing `}` of `uploadProgressText()` (:1189-1192), insert:

```js
  // ความคืบหน้าของคลิปที่กำลังอัป · อัปเดตจาก tick ทุก 0.8 วินาที (uploadOne ไม่ต้องรู้เรื่องนี้)
  let uploadProg = null; // { pct: 0..1 | null, text: string }
  function pollUploadProgress() {
    if (!running) { uploadProg = null; return; }
    const text = uploadProgressText();
    uploadProg = { pct: parseUploadPct(text), text };
  }
```

- [ ] **Step 2: Expose the claims status**

Change :4694 from:

```js
    return { buildPane, tick, claimedSongsIn, fixTracklist, renderStatus };
```

to:

```js
    return { buildPane, tick, claimedSongsIn, fixTracklist, renderStatus, status: computeStatus };
```

- [ ] **Step 3: Add `activity()`**

Immediately **after** the closing `}` of `updateRunUI()` (the line after `tabCount.queue.textContent = total ? String(total) : '';`), insert:

```js
  // งานที่กำลังทำอยู่ตอนนี้ (อันเดียว) — null ถ้าว่าง · ดู activityFrom() สำหรับกติกาการเลือก
  function activity() {
    const count = (st) => queue.filter((i) => i.status === st).length;
    const q = {
      running,
      inFlight: queue.some((i) => i.status === 'uploading' || i.status === 'review'),
      total: queue.length,
      done: count('done'),
      errors: count('error'),
    };
    // โมดูลลิขสิทธิ์พังไม่ควรลาก UI ของคิวไปด้วย
    let claims = null;
    try { claims = Claims && Claims.status ? Claims.status() : null; } catch (e) { claims = null; }
    const a = activityFrom(q, claims, uploadProg);
    if (a && a.task === 'upload') {
      a.title = L(`กำลังอัปโหลด ${a.count.at}/${a.count.of}`, `Uploading ${a.count.at}/${a.count.of}`);
    }
    return a;
  }
```

- [ ] **Step 4: Verify syntax and that nothing regressed**

Run: `node --check youtube-upload-presets.user.js`
Expected: no output

Run: `node --test test/*.test.mjs`
Expected: PASS, 77 tests

- [ ] **Step 5: Commit**

```bash
git add youtube-upload-presets.user.js
git commit -m "Wire the live activity model: upload poller and Claims.status"
```

---

### Task 4: The drawer activity bar

**Files:**
- Modify: `youtube-upload-presets.user.js:2042` area — declare `actBar` nodes near `const nav`
- Modify: `youtube-upload-presets.user.js:2135` — insert `actBar` into the `drawer` tree
- Modify: `youtube-upload-presets.user.js` — add `renderActivity()` after `activity()`
- Modify: `youtube-upload-presets.user.js:4698-4709` — call the new functions from the tick
- Modify: `youtube-upload-presets.user.js:1977` area — add CSS

**Interfaces:**
- Consumes: `activity()` (Task 3), `showTab(key)` at :2163.
- Produces: `renderActivity()` — updates the bar and (in Task 5) the FAB; safe to call every tick.

- [ ] **Step 1: Declare the bar**

Immediately **after** `const nav = h('div', { className: 'tabs' });` (:2042), insert:

```js
  // แถบงานที่กำลังทำ — อยู่เหนือแท็บ เห็นได้ทุกแท็บ · ซ่อนตอนว่าง
  const actIcon = h('span', { className: 'ai' });
  const actTitle = h('span', { className: 'at' });
  const actPct = h('span', { className: 'ap' });
  const actFill = h('i');
  const actBar = h('div', { className: 'act', hidden: true, onclick: () => showTab(actBar._tab || 'queue') },
    h('div', { className: 'arow' }, actIcon, actTitle, actPct),
    h('div', { className: 'tbx-bar' }, actFill)
  );
```

- [ ] **Step 2: Put it in the drawer**

Change :2135 from:

```js
    chanBar, chanList, nav, body, footWrap
```

to:

```js
    chanBar, chanList, actBar, nav, body, footWrap
```

- [ ] **Step 3: Add the renderer**

Immediately **after** the closing `}` of `activity()` (Task 3, Step 3), insert:

```js
  // วาดแถบงาน · ถูกเรียกทุก 0.8 วินาที -> ไม่มีอะไรเปลี่ยนก็ไม่แตะ DOM (แบบเดียวกับ updateChannelUI)
  // ฟังก์ชันนี้เป็นเจ้าของ fabBadge ทั้งตอนมีงานและตอนว่าง (updateRunUI ไม่แตะป้ายนี้แล้ว)
  let lastActSig = '';
  function renderActivity() {
    const a = activity();
    const pending = queue.filter((i) => i.status === 'pending').length;
    const total = queue.length;
    const pct = a && a.progress !== null ? Math.round(a.progress * 100) : null;
    // pending/total อยู่ในลายเซ็นด้วย ไม่งั้นตอนว่างป้าย FAB จะไม่อัปเดต
    const sig = JSON.stringify([a, pending, total]);
    if (sig === lastActSig) return;
    lastActSig = sig;
    actBar.hidden = !a;
    if (a) {
      actBar._tab = a.tab;
      actBar.title = a.detail || '';
      actIcon.textContent = a.icon;
      actTitle.textContent = a.title;
      actPct.textContent = pct === null ? '' : pct + '%';
      actFill.parentElement.classList.toggle('ind', pct === null);
      actFill.style.width = pct === null ? '' : pct + '%';
    }
  }
```

- [ ] **Step 4: Drive it from the tick and from every queue transition**

Change the tick body at :4698-4709 so the `try` block reads:

```js
    try {
      pollUploadProgress();
      Claims.tick();
      renderActivity();
    } catch (e) {
```

The tick alone would lag a status change by up to 800 ms, so also call it whenever the
queue moves. Add as the **last** line inside `updateRunUI()` (after
`tabCount.queue.textContent = total ? String(total) : '';`):

```js
    renderActivity(); // ทางเดียว: renderActivity ไม่เรียก updateRunUI กลับ
  }
```

`setItem()` already calls `updateRunUI()`, so every item transition is covered. The call
is strictly one-directional — `renderActivity` must never call `updateRunUI`, or this
recurses forever.

- [ ] **Step 5: Add the CSS**

Immediately **after** the `.tbx-bar.ind i` rule (:1977), insert:

```css
    #ytp-root .act{padding:9px 14px;border-bottom:1px solid var(--line);background:var(--surface);cursor:pointer}
    #ytp-root .act:hover{background:var(--surface2)}
    #ytp-root .act .arow{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600}
    #ytp-root .act .at{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ytp-root .act .ap{color:var(--fg3);font-variant-numeric:tabular-nums}
    #ytp-root .act .tbx-bar{margin-top:6px}
```

- [ ] **Step 6: Verify**

Run: `node --check youtube-upload-presets.user.js`
Expected: no output

Run: `node --test test/*.test.mjs`
Expected: PASS, 77 tests

- [ ] **Step 7: Commit**

```bash
git add youtube-upload-presets.user.js
git commit -m "Add the always-visible activity bar above the drawer tabs"
```

---

### Task 5: FAB indicator and the uploading clip's bar

**Files:**
- Modify: `youtube-upload-presets.user.js` — extend `renderActivity()` (Task 4) to drive the FAB
- Modify: `youtube-upload-presets.user.js:2552-2557` — stop `updateRunUI` fighting over `fabBadge`
- Modify: `youtube-upload-presets.user.js:2338` + `:2409` — add a bar to the clip card
- Modify: `youtube-upload-presets.user.js:2447` area — show it in `updateItemUI`
- Modify: `youtube-upload-presets.user.js:1706` area — FAB ring CSS
- Modify: `youtube-upload-presets.user.js:4` — bump `@version` to `4.12.0`

**Interfaces:**
- Consumes: `activity()`, `renderActivity()`, `uploadProg` (Tasks 3-4).
- Produces: nothing new.

- [ ] **Step 1: Drive the FAB from the model**

In `renderActivity()`, immediately **after** the closing `}` of the `if (a) { ... }` block
and before the function's own closing `}`, insert:

```js
    // FAB: มีงาน = ไอคอน + เปอร์เซ็นต์ และมีเส้นความคืบหน้าที่ขอบล่าง · ว่าง = จำนวนคลิปที่รอ
    fab.classList.toggle('busy', !!a);
    fab.style.setProperty('--p', pct === null ? 0 : pct);
    fabBadge.hidden = !a && !total;
    if (a) fabBadge.textContent = pct === null ? a.icon : `${a.icon} ${pct}%`;
    else fabBadge.textContent = String(pending || total);
```

- [ ] **Step 2: Hand the badge over completely**

`updateRunUI` also writes `fabBadge`, which would fight the line above. Delete both of its
writes. Change :2556-2557 from:

```js
    fabBadge.hidden = !total;
    fabBadge.textContent = running ? `${done}/${total}` : String(pending || total);
```

to:

```js
    // ป้าย FAB เป็นของ renderActivity() ทั้งตอนมีงานและตอนว่าง
```

`done` and `errors` are still used elsewhere in `updateRunUI`, so leave their declarations
alone — only the two `fabBadge` lines go.

Verify: `grep -n 'fabBadge' youtube-upload-presets.user.js`
Expected: the declaration at :2030 plus exactly two hits inside `renderActivity()`.

- [ ] **Step 3: Add the bar to the clip card**

Change :2338 from:

```js
    const msg = h('div', { className: 'msg' }, msgIcon, msgTxt);
```

to:

```js
    const msg = h('div', { className: 'msg' }, msgIcon, msgTxt);
    const upFill = h('i');
    const upBar = h('div', { className: 'tbx-bar', hidden: true }, upFill);
```

Change :2397 from:

```js
      msg,
      attachInput
```

to:

```js
      upBar,
      msg,
      attachInput
```

Change :2409 to add the two nodes to the `it.ui` object — insert `upBar, upFill,` immediately after `msg, msgTxt, msgIcon,`.

- [ ] **Step 4: Show it in `updateItemUI`**

Immediately **after** `u.msg.hidden = !it.msg;` (:2447), insert:

```js
    // แถบความคืบหน้าของคลิปที่กำลังอัปอยู่ (เปอร์เซ็นต์จาก Studio) · อ่านไม่ได้ = ซ่อน
    const pct = it.status === 'uploading' && uploadProg ? uploadProg.pct : null;
    u.upBar.hidden = pct === null;
    if (pct !== null) u.upFill.style.width = Math.round(pct * 100) + '%';
```

- [ ] **Step 5: Keep the card's bar moving**

`updateItemUI` only runs when the item changes. In `renderActivity()`, immediately **after** `lastActSig = sig;`, insert:

```js
    // การ์ดของคลิปที่กำลังอัปต้องขยับตามด้วย (updateItemUI เรียกเฉพาะตอนสถานะเปลี่ยน)
    const up = queue.find((i) => i.status === 'uploading');
    if (up && up.ui) updateItemUI(up);
```

- [ ] **Step 6: Add the FAB progress-line CSS**

`.fab` is a rounded rectangle with a flat `background:#0e0e12` (:1699), not a circle, so a
conic ring would cover the whole button. Use a 3px line inset along the bottom edge
instead — it layers over the background colour and is clipped by the existing
`border-radius:16px`.

Immediately **after** the `.fab .badge` rule (:1706-1707), insert:

```css
    #ytp-root .fab.busy{background-image:linear-gradient(90deg,var(--brand) calc(var(--p,0) * 1%),var(--surface2) 0);
      background-repeat:no-repeat;background-size:calc(100% - 16px) 3px;background-position:8px calc(100% - 5px)}
```

`--p` is set as a unitless number, so `calc(var(--p) * 1%)` resolves to a percentage.

- [ ] **Step 7: Bump the version**

Change :4 from `// @version      4.11.0` to `// @version      4.12.0`.

- [ ] **Step 8: Verify everything**

Run: `node --check youtube-upload-presets.user.js`
Expected: no output

Run: `node --test test/*.test.mjs`
Expected: PASS, 77 tests, 0 fail

Run: `grep -n 'uploadProg\|activityFrom\|parseUploadPct\|renderActivity\|actBar' youtube-upload-presets.user.js`
Expected: every reference resolves to a declaration in this plan — no typos. `node --check` cannot catch a misspelled identifier.

- [ ] **Step 9: Manual check in the browser**

This is the only way to test the DOM side; the suite covers the pure functions only.

1. Reload Studio with the script installed.
2. Queue two small clips and press start. Confirm: the bar appears above the tabs, shows "Uploading 1/2" with a percentage that moves, the uploading card grows its own bar, and the FAB shows a ring plus percentage with the drawer shut.
3. Switch to the Presets tab mid-upload. The bar must stay visible.
4. Click the bar. It must jump to the Queue tab.
5. Let the queue finish. Bar and ring must disappear and the FAB badge return to a plain count.
6. With the queue empty, run a claim scan. The bar must show the scan with its 🔍 icon and route to the Claims tab when clicked.

- [ ] **Step 10: Commit**

```bash
git add youtube-upload-presets.user.js
git commit -m "Show upload progress on the FAB and the uploading clip's card (v4.12.0)"
```

---

## Risks

- **Recursion between the two renderers.** `updateRunUI()` calls `renderActivity()` (Task 4 Step 4) and `renderActivity()` owns `fabBadge` outright (Task 5 Steps 1-2), so the dependency runs one way only. If a later change makes `renderActivity` call `updateRunUI`, it recurses forever. The code comment at Task 4 Step 4 says so.
- **`JSON.stringify([a, pending, total])` as the signature** runs every tick. The payload is a handful of shallow fields, cheaper than the DOM work it avoids, and matches the `renderStatus` guard already in the file.
- **`updateItemUI` re-entry.** `renderActivity` calls `updateItemUI(up)` (Task 5 Step 5) and `setItem` calls both `updateItemUI` and `updateRunUI`. `updateItemUI` does not call `updateRunUI`, so the chain terminates. Do not add such a call.
