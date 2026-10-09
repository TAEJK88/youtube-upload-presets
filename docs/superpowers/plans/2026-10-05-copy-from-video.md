# Copy-from-Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wherever a preset can be picked, the channel's top videos by views over the last 6 months can be picked instead. The script learns a template from the chosen video and uses it like a preset.

**Architecture:** A learned template is an object shaped like a preset, with the id `v:<videoId>`. It is stored per channel under the GM key `videoTemplates:<channelId>`. `presetById()` resolves `v:` ids first, so every existing render and upload path picks it up without changes. Two pure functions, `learnTemplate()` and `pickTopVideos()`, sit in the template block and are unit-tested. Two read-only Studio readers, `listTopVideos()` and `videoText()`, live in the `Claims` module next to `listScheduled()`. The UI work is new `<optgroup>`s in `presetOptions()`, a review dialog built on `ask()`, and a chip on each card.

**Tech Stack:** Single-file Tampermonkey userscript (`youtube-upload-presets.user.js`), Studio's internal `youtubei/v1/creator/*` API through the existing `yti()` helper, and zero-dependency `node --test` tests that slice blocks out of the script (`test/harness.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-05-copy-from-video-design.md`

## Global Constraints

- Every user-facing string goes through `L('ไทย', 'English')`. Studio text matching (`TXT`, `SEL`) does not change.
- Code comments are in Thai, matching the surrounding code.
- No new dependencies and no build step. The tests stay zero-dependency (`node --test test/*.test.mjs`).
- Studio API calls are read-only: `list_creator_videos` and `get_creator_videos` only.
- Video templates are never written into `presets`, never exported in the JSON backup, and never auto-selected.
- `Alt+1…9` keeps selecting real presets only.
- Release as **v4.28.0**. Run the tests before bumping `@version` (README rule).
- The harness slices code by anchor comments. Keep the anchors this plan names exactly as written: `// ===== หาพรีเซ็ตตาม id`, `// ===== template =====`, `// ===== ตรวจ tracklist`.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `youtube-upload-presets.user.js` | Modify | Everything: pure learner, lookup/storage, Studio readers, UI |
| `test/harness.mjs` | Modify | Export `learnTemplate`, `pickTopVideos`, `SIX_MONTHS`; new `makeLookup()` slice |
| `test/video-template.test.mjs` | Create | Tests for the learner, the top-video picker and the lookup |
| `README.md` | Modify | Short feature note |

Line numbers below are from v4.26.0 and shift as you edit. **Find each place by the quoted anchor text**, not by line number.

---

### Task 1: Confirm Studio's field names on a live page (read-only)

The rest of the plan assumes these response fields. Nobody has observed them yet:

| Call | Mask | Field the code reads |
|---|---|---|
| `creator/list_creator_videos` | `metrics: { all: true }` | `v.metrics.viewCount` (string) |
| `creator/list_creator_videos` | `timePublishedSeconds: true` | `v.timePublishedSeconds` (string, seconds) |
| `creator/list_creator_videos` | `privacy: true` | `v.privacy === 'VIDEO_PRIVACY_PUBLIC'` |
| `creator/get_creator_videos` | `description: true` | `v.description` (string) |
| `creator/get_creator_videos` | `tags: { all: true }` | `v.tags` (array) **or** `v.tags.tags` (array) |

**Files:** none. The results are recorded in a code comment in Task 4.

- [ ] **Step 1: Open Studio signed in to the target channel and run this in the DevTools console (top frame)**

```js
(async () => {
  const c = (k) => ytcfg.get(k);
  const sap = document.cookie.match(/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/)[1];
  const ts = Math.floor(Date.now() / 1000);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sap} https://studio.youtube.com`)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const ctx = JSON.parse(JSON.stringify(c('INNERTUBE_CONTEXT')));
  const dc = c('DELEGATION_CONTEXT'); const pid = c('DELEGATED_SESSION_ID');
  ctx.user = Object.assign({}, ctx.user, dc ? { delegationContext: dc } : {}, pid ? { onBehalfOfUser: pid } : {});
  const call = async (path, body) => (await fetch(`/youtubei/v1/${path}?alt=json`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `SAPISIDHASH ${ts}_${hash}`, 'X-Origin': 'https://studio.youtube.com',
      'X-Goog-AuthUser': String(c('SESSION_INDEX') || 0), 'X-Youtube-Client-Name': String(c('INNERTUBE_CONTEXT_CLIENT_NAME')),
      'X-Youtube-Client-Version': c('INNERTUBE_CONTEXT_CLIENT_VERSION'), ...(pid ? { 'X-Goog-PageId': pid } : {}) },
    body: JSON.stringify({ context: ctx, ...body }),
  })).json();
  const list = await call('creator/list_creator_videos', {
    filter: { and: { operands: [{ channelIdIs: { value: c('CHANNEL_ID') } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
    order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 3,
    mask: { videoId: true, title: true, privacy: true, timePublishedSeconds: true, metrics: { all: true } },
  });
  console.log('LIST', JSON.stringify(list.videos || list, null, 1));
  const id = (list.videos || [])[0]?.videoId;
  const one = await call('creator/get_creator_videos', {
    failOnError: true, videoIds: [id],
    mask: { videoId: true, title: true, description: true, tags: { all: true }, timePublishedSeconds: true },
  });
  console.log('ONE', JSON.stringify(one.videos || one, null, 1));
})();
```

- [ ] **Step 2: Compare the output with the table above**

Expected: `LIST` has `privacy`, `timePublishedSeconds` and `metrics.viewCount` on each video, and `ONE` has `description` and `tags`.

If a field has a different name, or a mask key is rejected (the response is an `error` object with status 400), find the working name and **use it in place of the table's name** in these places:
- Task 2: the `map()` line in `pickTopVideos`, and the `vid()` fixture in the test.
- Task 4: the `mask` objects and the field reads in `listTopVideos` and `videoText`.

- [ ] **Step 3: Write down the confirmed shape**

Keep the confirmed field names and the date (e.g. "ต.ค. 2026") for the comment above `listTopVideos` in Task 4. This step has nothing to commit.

---

### Task 2: Pure learner and top-video picker

**Files:**
- Modify: `youtube-upload-presets.user.js`. Insert directly after the line `const renderDesc = (p, vars) => renderDescFull(p, vars).slice(0, DESC_MAX);` and before `// ===== ตรวจ tracklist ก่อนอัป`.
- Modify: `test/harness.mjs`, the `return { ... }` of the `build` function.
- Create: `test/video-template.test.mjs`

**Interfaces:**
- Consumes: `parseTracks(txt, priority)` (already in the template block).
- Produces:
  - `SIX_MONTHS`: number of ms (183 days).
  - `learnTemplate({ title, description, tags, publishedYear })` → `{ title, description, tags: string[], artistPriority: string[], artistMax: number, txt: string, warnings: string[] }`, where warnings ⊂ `['no-tracklist', 'static-title']`. `txt` is the source's tracklist (used as the preview sample).
  - `pickTopVideos(videos, now = Date.now(), n = 10)` → `[{ videoId, title, views: number, at: ms }]`, public videos only, published in the last 6 months, sorted by views descending.

- [ ] **Step 1: Export the new names from the harness**

In `test/harness.mjs`, change the `return` inside `build`:

```js
  return { pad, parseTracks, buildVars, render, clean, renderTitle, makeTitle,
           unknownVars, renderTags, renderDesc, parseTime, fixTracklist,
           fmtTs, checkTracklist, fixChapters, parseUploadPct, activityFrom,
           learnTemplate, pickTopVideos, SIX_MONTHS,
           VARS, TITLE_MAX, DESC_MAX };`
```

- [ ] **Step 2: Write the failing tests**

Create `test/video-template.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from './harness.mjs';

const Y = String(new Date().getFullYear());
const TL = [
  '0:00 SZA - Snooze',
  '3:21 Brent Faiyaz - Dead Man Walking',
  '6:40 SZA - Good Days (ft. Jacob Collier)',
  '10:15 Kehlani - Folded',
].join('\n');
const TRAPSOUL = {
  title: `TrapSoul Mix | SZA, Brent Faiyaz - Dark R&B Playlist ${Y}`,
  description: `TrapSoul Mix | SZA, Brent Faiyaz - Dark R&B Playlist ${Y}\n\nTracklist:\n${TL}\n\n#trapsoul #rnb`,
  tags: ['trapsoul', 'SZA', 'kehlani', `r&b playlist ${Y}`],
  publishedYear: Y,
};
// แปลงผลที่เรียนรู้ให้เป็นรูปแบบพรีเซ็ต แล้วเรนเดอร์ด้วยฟังก์ชันจริงของสคริปต์
const asPreset = (l) => ({ ...l, id: 'v:abc', label: 'x', visibility: 'PRIVATE' });
const renderWith = (l, file, txt) => {
  const p = asPreset(l);
  const vars = S.buildVars(file, 1, txt, { preset: p });
  return { title: S.makeTitle(p, vars), description: S.renderDesc(p, vars), tags: S.renderTags(p, vars) };
};

test('learnTemplate round-trips a TrapSoul video through its own tracklist', () => {
  const l = S.learnTemplate(TRAPSOUL);
  assert.equal(l.title, 'TrapSoul Mix[[ | {artists}]] - Dark R&B Playlist {year}');
  assert.equal(l.txt, TL);
  assert.deepEqual(l.warnings, []);
  const out = renderWith(l, 'clip01.mp4', l.txt);
  assert.equal(out.title, TRAPSOUL.title);
  assert.equal(out.description, TRAPSOUL.description);
});

test('a learned pattern fills in a new tracklist', () => {
  const l = S.learnTemplate(TRAPSOUL);
  const tl2 = '0:00 Kehlani - Folded\n3:00 Summer Walker - Girls Need Love\n6:00 Kehlani - Nights Like This';
  assert.equal(renderWith(l, 'clip07.mp4', tl2).title, `TrapSoul Mix | Kehlani, Summer Walker - Dark R&B Playlist ${Y}`);
});

test('the title artists become the priority and the artist count', () => {
  const l = S.learnTemplate(TRAPSOUL);
  assert.deepEqual(l.artistPriority, ['SZA', 'Brent Faiyaz']);
  assert.equal(l.artistMax, 2);
});

test('the tracklist heading goes into the optional block with {txt}', () => {
  assert.match(S.learnTemplate(TRAPSOUL).description, /\[\[Tracklist:\n\{txt\}\]\]/);
});

test('a clip without a .txt gets no dangling separators', () => {
  const out = renderWith(S.learnTemplate(TRAPSOUL), 'clip02.mp4', '');
  assert.equal(out.title, `TrapSoul Mix - Dark R&B Playlist ${Y}`);
  assert.equal(out.description, `TrapSoul Mix - Dark R&B Playlist ${Y}\n\n#trapsoul #rnb`);
});

test('artists at the start of the title take the separator after them', () => {
  const l = S.learnTemplate({ title: 'SZA, Kehlani | R&B Playlist (4 Songs)', description: TL, tags: [], publishedYear: '2025' });
  assert.equal(l.title, '[[{artists} | ]]R&B Playlist[[ ({trackcount} Songs)]]');
  assert.equal(renderWith(l, 'a.mp4', l.txt).title, 'SZA, Kehlani | R&B Playlist (4 Songs)');
  assert.equal(renderWith(l, 'b.mp4', '').title, 'R&B Playlist');
});

test('a type-beat title learns the quoted beat name and an optional BPM', () => {
  const l = S.learnTemplate({
    title: '[FREE] Thai Type Beat - "Midnight" | 140 BPM',
    description: '[FREE] Thai Type Beat - "Midnight"\nBPM: 140\nProd. by X',
    tags: ['type beat'], publishedYear: '2025',
  });
  assert.equal(l.title, '[FREE] Thai Type Beat - "{name}"[[ | {bpm} BPM]]');
  assert.equal(l.description, '[FREE] Thai Type Beat - "{name}"\n[[BPM: {bpm}]]\nProd. by X');
  assert.equal(renderWith(l, 'Midnight 140bpm.mp4', '').title, '[FREE] Thai Type Beat - "Midnight" | 140 BPM');
  assert.equal(renderWith(l, 'Sunrise.mp4', '').title, '[FREE] Thai Type Beat - "Sunrise"');
});

test('only the publish year or this year becomes {year}', () => {
  const l = S.learnTemplate({ title: 'Throwback 2019 Mix 2025', description: '', tags: ['mix 2019'], publishedYear: '2025' });
  assert.equal(l.title, 'Throwback 2019 Mix {year}');
  assert.deepEqual(l.tags, ['mix 2019']);
});

test('artist tags collapse into one {artists} tag', () => {
  assert.deepEqual(S.learnTemplate(TRAPSOUL).tags, ['trapsoul', '{artists}', 'r&b playlist {year}']);
});

test('no tracklist: artists stay as text and a warning is returned', () => {
  const l = S.learnTemplate({ title: 'Mix | SZA - Dark R&B', description: 'no stamps here', tags: ['SZA'], publishedYear: '2025' });
  assert.equal(l.title, 'Mix | SZA - Dark R&B');
  assert.deepEqual(l.tags, ['SZA']);
  assert.ok(l.warnings.includes('no-tracklist'));
});

test('a title with no variables is flagged', () => {
  assert.ok(S.learnTemplate({ title: 'Just a vlog', description: '', tags: [], publishedYear: '2025' }).warnings.includes('static-title'));
});

// ----- pickTopVideos -----
const NOW = Date.UTC(2026, 9, 5);
const DAY = 864e5;
// รูปแบบตาม list_creator_videos (ยืนยันชื่อ field ใน Task 1)
const vid = (id, views, daysAgo, privacy = 'VIDEO_PRIVACY_PUBLIC') => ({
  videoId: id, title: 'T ' + id, privacy,
  timePublishedSeconds: daysAgo == null ? '0' : String(Math.floor((NOW - daysAgo * DAY) / 1000)),
  metrics: { viewCount: String(views) },
});

test('pickTopVideos keeps public videos from the last 6 months, sorted by views', () => {
  const out = S.pickTopVideos([
    vid('a', 100, 10), vid('b', 900, 30), vid('old', 99999, 200),
    vid('priv', 5000, 5, 'VIDEO_PRIVACY_PRIVATE'), vid('draft', 7000, null), vid('c', 500, 170),
  ], NOW);
  assert.deepEqual(out.map((v) => v.videoId), ['b', 'c', 'a']);
  assert.deepEqual(out[0], { videoId: 'b', title: 'T b', views: 900, at: Math.floor((NOW - 30 * DAY) / 1000) * 1000 });
});

test('pickTopVideos returns at most n videos', () => {
  const many = Array.from({ length: 15 }, (_, i) => vid('v' + i, i, 1));
  const out = S.pickTopVideos(many, NOW);
  assert.equal(out.length, 10);
  assert.equal(out[0].videoId, 'v14');
});

test('pickTopVideos copes with an empty or missing list', () => {
  assert.deepEqual(S.pickTopVideos(undefined, NOW), []);
  assert.deepEqual(S.pickTopVideos([], NOW), []);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/video-template.test.mjs`
Expected: FAIL. Every test errors with `TypeError: S.learnTemplate is not a function` (or `S.pickTopVideos`). The harness itself fails first with `ReferenceError: learnTemplate is not defined` because Step 1 exports a name that doesn't exist yet. Both count as the expected failure.

- [ ] **Step 4: Implement the learner and the picker**

In `youtube-upload-presets.user.js`, insert after `const renderDesc = (p, vars) => renderDescFull(p, vars).slice(0, DESC_MAX);`:

```js

  // ===== เรียนรู้รูปแบบจากคลิปที่อัปแล้ว (pure) =====
  // ชื่อ/คำอธิบาย/แท็กของคลิปเดิม -> template: ส่วนที่เปลี่ยนทุกคลิป (tracklist, ศิลปิน, จำนวนเพลง, ปี, BPM, ชื่อบีท)
  // กลายเป็นตัวแปร ส่วนที่เหลือคงไว้ตามเดิม · ตัวแปรที่อาจว่างจะถูกครอบ [[ ]] พร้อมตัวคั่น (กฎเดียวกับพรีเซ็ตตั้งต้น)
  const SIX_MONTHS = 183 * 864e5;
  const TS_LINE = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}(?!\d)/;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SEP_BEFORE = /\s*[|\-–—:•·]\s*$/;
  const SEP_AFTER = /^\s*[|\-–—:•·]\s*/;
  // แทนทุกจุดที่เจอ run ด้วย {artists} พร้อมดึงตัวคั่นข้าง ๆ เข้า [[ ]] (คลิปไม่มี .txt จะไม่เหลือ " | " ค้าง)
  function wrapArtists(s, run) {
    const parts = s.split(run);
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const after = parts[i];
      const before = (out.match(SEP_BEFORE) || [''])[0];
      const next = before ? '' : (after.match(SEP_AFTER) || [''])[0];
      out = out.slice(0, out.length - before.length) + `[[${before}{artists}${next}]]` + after.slice(next.length);
    }
    return out;
  }
  function learnTemplate({ title = '', description = '', tags = [], publishedYear = '' }) {
    const warnings = [];
    const lines = String(description).replace(/\r\n/g, '\n').split('\n');
    // 1. tracklist = บรรทัดขึ้นต้นด้วยเวลาติดกัน ≥ 3 บรรทัด (เอาช่วงที่ยาวที่สุด)
    let best = null;
    for (let i = 0; i < lines.length;) {
      if (!TS_LINE.test(lines[i])) { i++; continue; }
      let j = i;
      while (j < lines.length && TS_LINE.test(lines[j])) j++;
      if (j - i >= 3 && (!best || j - i > best.n)) best = { at: i, n: j - i };
      i = j;
    }
    let desc = lines.join('\n');
    let txt = '';
    let artistList = [];
    let trackcount = '';
    if (best) {
      txt = lines.slice(best.at, best.at + best.n).join('\n');
      ({ artistList, trackcount } = parseTracks(txt));
      // หัวข้อที่ลงท้ายด้วย : เหนือ tracklist (เช่น "Tracklist:") ย้ายเข้า [[ ]] ด้วย
      const head = best.at > 0 && /:\s*$/.test(lines[best.at - 1]) ? best.at - 1 : best.at;
      const block = head < best.at ? `[[${lines[head]}\n{txt}]]` : '{txt}';
      desc = [...lines.slice(0, head), block, ...lines.slice(best.at + best.n)].join('\n');
    } else warnings.push('no-tracklist');

    // 2. ศิลปิน: ชื่อจาก tracklist ที่เรียงติดกันในชื่อคลิป (ยาวที่สุด) -> {artists}
    let t = String(title);
    let artistMax = 4;
    let artistPriority = [];
    if (artistList.length) {
      const name = `(?:${[...artistList].sort((a, b) => b.length - a.length).map(escRe).join('|')})`;
      const runRe = new RegExp(`(?<![\\p{L}\\p{N}])${name}(?:(?:, | x | & )${name})*(?![\\p{L}\\p{N}])`, 'giu');
      const run = [...t.matchAll(runRe)].sort((a, b) => b[0].length - a[0].length)[0];
      if (run) {
        const names = run[0].split(/, | x | & /);
        artistMax = names.length;
        artistPriority = names; // ลำดับเดิมของคลิปต้นแบบ -> ศิลปินที่ดึงยอดวิวขึ้นก่อน
        t = wrapArtists(t, run[0]);
        desc = wrapArtists(desc, run[0]);
      }
    }
    // 3. จำนวนเพลง เช่น "(12 Songs)" -> [[ ({trackcount} Songs)]]
    if (trackcount) {
      const countRe = new RegExp(`(\\s*\\()?(?<!\\d)${trackcount}(\\s*(?:songs?|tracks?|เพลง))(\\))?`, 'gi');
      const fill = (s) => s.replace(countRe, (_, open = '', unit, close = '') => `[[${open}{trackcount}${unit}${close}]]`);
      t = fill(t);
      desc = fill(desc);
    }
    // 4. ปี (เฉพาะปีที่เผยแพร่หรือปีนี้)  5. BPM
    const years = new Set([String(publishedYear), String(new Date().getFullYear())]);
    const yearize = (s) => s.replace(/(?<!\d)20\d\d(?!\d)/g, (y) => (years.has(y) ? '{year}' : y));
    const bpmize = (s) => s
      .replace(/\bBPM:\s*\d{2,3}(?!\d)/gi, '[[BPM: {bpm}]]')
      .replace(/(\s*[|\-–—:•·]\s*)?(?<![\d{])\d{2,3}\s*BPM\b/gi, (_, sep = '') => `[[${sep}{bpm} BPM]]`);
    t = bpmize(yearize(t));
    desc = bpmize(yearize(desc));
    // 6. ชื่อบีทในเครื่องหมายคำพูด เช่น "Midnight" -> "{name}" (ทั้งชื่อคลิปและคำอธิบาย)
    const q = t.match(/"([^"\n{}]{1,80})"|“([^”\n{}]{1,80})”/);
    if (q) {
      const named = q[0].replace(q[1] || q[2], '{name}');
      t = t.split(q[0]).join(named);
      desc = desc.split(q[0]).join(named);
    }
    if (!/\{\w+\}/.test(t)) warnings.push('static-title');
    // 7. แท็กที่เป็นชื่อศิลปิน -> {artists} อันเดียว
    const known = new Set(artistList.map((a) => a.toLowerCase()));
    const outTags = [];
    for (const tag of tags) {
      if (known.has(String(tag).toLowerCase())) { if (!outTags.includes('{artists}')) outTags.push('{artists}'); }
      else outTags.push(yearize(String(tag)));
    }
    return { title: t, description: desc, tags: outTags, artistPriority, artistMax, txt, warnings };
  }

  // คลิปสาธารณะใน 6 เดือนล่าสุด เรียงตามยอดวิว (รับรายการจาก list_creator_videos) -> [{ videoId, title, views, at }]
  function pickTopVideos(videos, now = Date.now(), n = 10) {
    return (videos || [])
      .map((v) => ({ videoId: v.videoId, title: v.title || '', views: +((v.metrics || {}).viewCount || 0), at: (+v.timePublishedSeconds || 0) * 1000, privacy: v.privacy }))
      .filter((v) => v.privacy === 'VIDEO_PRIVACY_PUBLIC' && v.at > 0 && now - v.at <= SIX_MONTHS)
      .sort((a, b) => b.views - a.views)
      .slice(0, n)
      .map(({ privacy, ...v }) => v);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/*.test.mjs`
Expected: PASS. All tests pass, including the existing suites, with `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add youtube-upload-presets.user.js test/harness.mjs test/video-template.test.mjs
git commit -m "Learn a template from an existing video's title, description and tags"
```

---

### Task 3: Video template storage and `presetById` lookup

**Files:**
- Modify: `youtube-upload-presets.user.js`. Replace the two lines `const presetById = (id) => presets.find((p) => p.id === id) || presets[0];` / `const active = () => presetById(activeId);`, which sit just before `// ===== template =====`.
- Modify: `youtube-upload-presets.user.js`, the preset editor. There are three `editId = activeId` spots (anchors below).
- Modify: `test/harness.mjs`. Add `makeLookup()`.
- Modify: `test/video-template.test.mjs`. Add the lookup tests.

**Interfaces:**
- Consumes: `getChannel()` (hoisted function, `.id`), `load(k, d)`, `save(k, v)`, `presets`, `activeId`.
- Produces:
  - `videoTemplates()` → `{ ['v:<videoId>']: template }` for the current channel (cached, reloaded when the channel id changes).
  - `saveVideoTemplates()` → writes the current channel's map to `videoTemplates:<channelId>`.
  - `isVideoId(id)` → boolean (`'v:'` prefix).
  - `presetById(id)` → the stored video template for `v:` ids, otherwise as before.
  - `ownId(id)` → `id` if it is a user preset, else `presets[0].id`.
  - Template shape stored: `{ id, label, title, description, tags, artistPriority, artistMax, visibility: 'PRIVATE', sampleTxt, warnings, source: { videoId, title, views } }`.

- [ ] **Step 1: Add the harness slice**

Append to `test/harness.mjs`:

```js
// ----- preset lookup (user presets + templates learned from a video) -----
// Sliced from the lookup anchor down to the template block; storage is a plain object.
const LOOKUP = block('// ===== หาพรีเซ็ตตาม id', '// ===== template =====');

export function makeLookup({ presets, store = {}, channelId = 'UCtest' }) {
  const ch = { id: channelId };
  const api = new Function(
    'presets', 'getChannel', 'load', 'save',
    `'use strict';
    let activeId = presets[0].id;
    ${LOOKUP}
    return { presetById, videoTemplates, saveVideoTemplates, isVideoId, ownId, active };`
  )(presets, () => ch, (k, d) => (k in store ? store[k] : d), (k, v) => { store[k] = v; });
  return { ...api, store, ch };
}
```

- [ ] **Step 2: Write the failing tests**

Append to `test/video-template.test.mjs` (and change its first import line to `import { S, makeLookup } from './harness.mjs';`):

```js
// ----- presetById / videoTemplates -----
const PRESETS = [{ id: 'trapsoul', label: 'TrapSoul' }, { id: 'playlist', label: 'Playlist' }];
const TPL = { id: 'v:abc', label: '📈 Top', title: '{artists}', description: '', tags: [] };

test('presetById resolves a stored video template', () => {
  const lk = makeLookup({ presets: PRESETS, store: { 'videoTemplates:UCtest': { 'v:abc': TPL } } });
  assert.equal(lk.presetById('v:abc'), TPL);
  assert.equal(lk.presetById('playlist').id, 'playlist');
});

test('presetById falls back to the first preset for a missing video template', () => {
  const lk = makeLookup({ presets: PRESETS });
  assert.equal(lk.presetById('v:gone').id, 'trapsoul');
  assert.equal(lk.presetById('nope').id, 'trapsoul');
});

test('video templates are kept per channel', () => {
  const store = { 'videoTemplates:UCone': { 'v:abc': TPL } };
  const lk = makeLookup({ presets: PRESETS, store, channelId: 'UCone' });
  assert.equal(lk.presetById('v:abc'), TPL);
  lk.ch.id = 'UCtwo';
  assert.equal(lk.presetById('v:abc').id, 'trapsoul');
  lk.videoTemplates()['v:xyz'] = { ...TPL, id: 'v:xyz' };
  lk.saveVideoTemplates();
  assert.deepEqual(Object.keys(store['videoTemplates:UCtwo']), ['v:xyz']);
  assert.deepEqual(Object.keys(store['videoTemplates:UCone']), ['v:abc']);
});

test('ownId keeps user presets and maps anything else to the first preset', () => {
  const lk = makeLookup({ presets: PRESETS });
  assert.equal(lk.ownId('playlist'), 'playlist');
  assert.equal(lk.ownId('v:abc'), 'trapsoul');
  assert.equal(lk.isVideoId('v:abc'), true);
  assert.equal(lk.isVideoId('trapsoul'), false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/video-template.test.mjs`
Expected: FAIL with `harness: block start not found: // ===== หาพรีเซ็ตตาม id`.

- [ ] **Step 4: Implement the lookup**

In `youtube-upload-presets.user.js`, replace:

```js
  const presetById = (id) => presets.find((p) => p.id === id) || presets[0];
  const active = () => presetById(activeId);
```

with:

```js
  // ===== หาพรีเซ็ตตาม id (พรีเซ็ตของผู้ใช้ หรือ 'v:<videoId>' = รูปแบบที่เรียนรู้จากคลิป) =====
  // รูปแบบจากคลิปเก็บแยกตามช่อง: videoTemplates:<channelId> -> { 'v:<videoId>': template } · ไม่อยู่ใน presets และไม่ส่งออกในไฟล์สำรอง
  let vtCache = { ch: null, map: {} };
  function videoTemplates() {
    const ch = getChannel().id;
    if (vtCache.ch !== ch) vtCache = { ch, map: load('videoTemplates:' + ch, {}) };
    return vtCache.map;
  }
  const saveVideoTemplates = () => save('videoTemplates:' + vtCache.ch, vtCache.map);
  const isVideoId = (id) => String(id || '').startsWith('v:');
  const presetById = (id) => (isVideoId(id) && videoTemplates()[id]) || presets.find((p) => p.id === id) || presets[0];
  const active = () => presetById(activeId);
  // แท็บพรีเซ็ตแก้ได้เฉพาะพรีเซ็ตของผู้ใช้ — ถ้าพรีเซ็ตหลักเป็นรูปแบบจากคลิป ให้เปิดพรีเซ็ตแรกแทน
  const ownId = (id) => (presets.some((p) => p.id === id) ? id : presets[0].id);

```

- [ ] **Step 5: Keep the preset editor on user presets**

The editor saves `presets`. If it opened a video template, edits would be silently lost. Make three replacements in `youtube-upload-presets.user.js`:

1. `let editId = activeId;` → `let editId = ownId(activeId);`
2. `if (!presets.some((p) => p.id === editId)) editId = activeId;` → `if (!presets.some((p) => p.id === editId)) editId = ownId(activeId);`
3. In the delete handler, `editId = activeId; renderPresetEditor(); refreshLabels(); renderQueue();` → `editId = ownId(activeId); renderPresetEditor(); refreshLabels(); renderQueue();`

- [ ] **Step 6: Run the tests and a syntax check**

Run: `node --test test/*.test.mjs && node --check youtube-upload-presets.user.js`
Expected: all tests PASS (`fail 0`), and `node --check` prints nothing (exit 0).

- [ ] **Step 7: Commit**

```bash
git add youtube-upload-presets.user.js test/harness.mjs test/video-template.test.mjs
git commit -m "Resolve v:<videoId> templates through presetById, stored per channel"
```

---

### Task 4: Studio readers, `listTopVideos()` and `videoText()`

**Files:**
- Modify: `youtube-upload-presets.user.js`, inside `Claims = (() => { ... })`. Insert directly after the `listScheduled()` function, which ends with `return out.sort((a, b) => a.at - b.at);\n    }`. Then extend the module's final `return { buildPane, tick, claimedSongsIn, fixTracklist, renderStatus, status: computeStatus, listScheduled };`.

**Interfaces:**
- Consumes: `yti(path, body)`, `ycfg(k)`, `currentChannel()` (all private to `Claims`), `pickTopVideos`, `SIX_MONTHS` (Task 2), and the field names confirmed in Task 1.
- Produces (on the `Claims` object):
  - `Claims.listTopVideos()` → `Promise<[{ videoId, title, views, at }] | null>`. `null` = Studio not ready yet.
  - `Claims.videoText(videoId)` → `Promise<{ title, description, tags: string[], publishedYear: string }>`. Throws on API error or a missing video.

- [ ] **Step 1: Add the readers**

Insert after the end of `listScheduled()`. Replace the date in the first comment with the one recorded in Task 1, and adjust the field names if Task 1 found different ones:

```js

    // คลิปยอดวิวสูงสุด 10 คลิปใน 6 เดือนล่าสุด (อ่านอย่างเดียว) -> [{ videoId, title, views, at }] · null = Studio ยังโหลดไม่เสร็จ
    // ตรวจกับ Studio จริง (ต.ค. 2026): metrics.viewCount, timePublishedSeconds, privacy = VIDEO_PRIVACY_PUBLIC
    // อ่านใหม่ไปเก่าแล้วหยุดเมื่อเลย 6 เดือน (คลิปร่าง/ตั้งเวลาไม่มีเวลาเผยแพร่ ข้ามไป ไม่ใช่จุดหยุด)
    async function listTopVideos() {
      if (!ycfg('INNERTUBE_CONTEXT')) return null;
      const CH = currentChannel();
      const vids = [];
      let tok, pages = 0;
      do {
        const body = {
          filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
          order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50,
          mask: { videoId: true, title: true, privacy: true, timePublishedSeconds: true, metrics: { all: true } },
        };
        if (tok) body.pageToken = tok;
        const j = await yti('creator/list_creator_videos', body);
        const got = j.videos || [];
        vids.push(...got);
        tok = j.nextPageToken;
        pages++;
        const lastAt = (+((got[got.length - 1] || {}).timePublishedSeconds) || 0) * 1000;
        if (lastAt && Date.now() - lastAt > SIX_MONTHS) break;
      } while (tok && pages < 10);
      return pickTopVideos(vids);
    }

    // ชื่อ คำอธิบาย และแท็กของคลิปเดียว (อ่านอย่างเดียว) — ใช้เรียนรู้รูปแบบ
    async function videoText(videoId) {
      const j = await yti('creator/get_creator_videos', {
        failOnError: true, videoIds: [videoId],
        mask: { videoId: true, title: true, description: true, tags: { all: true }, timePublishedSeconds: true },
      });
      const v = (j.videos || [])[0];
      if (!v) throw new Error(L('ไม่พบคลิปนี้ในช่อง', 'This video wasn\'t found on the channel'));
      const tags = Array.isArray(v.tags) ? v.tags : (v.tags && v.tags.tags) || [];
      const at = (+v.timePublishedSeconds || 0) * 1000;
      return { title: v.title || '', description: v.description || '', tags, publishedYear: at ? String(new Date(at).getFullYear()) : '' };
    }
```

- [ ] **Step 2: Export them**

Change the final return of the `Claims` module to:

```js
    return { buildPane, tick, claimedSongsIn, fixTracklist, renderStatus, status: computeStatus, listScheduled, listTopVideos, videoText };
```

- [ ] **Step 3: Run the tests and a syntax check**

Run: `node --test test/*.test.mjs && node --check youtube-upload-presets.user.js`
Expected: PASS (`fail 0`), and `node --check` exits 0.

- [ ] **Step 4: Commit**

```bash
git add youtube-upload-presets.user.js
git commit -m "Read the top videos of the last 6 months and one video's text from Studio"
```

---

### Task 5: Dropdown group, review dialog and card chip

**Files:**
- Modify: `youtube-upload-presets.user.js`:
  - CSS: after the line `#ytp-root .ask .ab b{color:var(--fg)}`
  - `function openDrawer(tab)`
  - `const defaultPresetSel = h('select', {`, its `onchange`
  - `function presetOptions(selected)`, replaced; the new helpers go right before it
  - the card's `const presetSel = h('select', {`, its `onchange`
  - `function updateItemUI(it)`, the chip list: insert right after `const kids = [];`

**Interfaces:**
- Consumes: `Claims.listTopVideos`, `Claims.videoText` (Task 4); `learnTemplate` (Task 2); `videoTemplates`, `saveVideoTemplates`, `isVideoId`, `presetById` (Task 3); existing `ask`, `toast`, `h`, `icon`, `buildVars`, `makeTitle`, `renderDesc`, `renderTags`, `refreshLabels`, `renderQueue`, `queue`, `presets`, `getChannel`, `LOCALE`.
- Produces: `topVids` state, `loadTopVideos(force)`, `choosePreset(sel, prev, apply)`, `reviewVideoTemplate(id, relearn)`, `fmtViews(n)`, `ellipsize(s, n)`, `REFRESH_TOP`.

- [ ] **Step 1: Add the dialog CSS**

After `#ytp-root .ask .ab b{color:var(--fg)}` add:

```css
    #ytp-root .ask .vt{white-space:normal;display:grid;gap:6px}
    #ytp-root .ask .vt input,#ytp-root .ask .vt textarea{width:100%;box-sizing:border-box}
    #ytp-root .ask .vt textarea{resize:vertical;font:inherit}
    #ytp-root .ask .vt-pv{white-space:pre-wrap;border:1px solid var(--line2);border-radius:10px;padding:8px 10px;max-height:180px;overflow:auto}
```

- [ ] **Step 2: Add the state, loader, picker and review dialog**

Insert directly before `function presetOptions(selected) {`:

```js
  // ----- คัดลอกรูปแบบจากคลิปที่อัปแล้ว -----
  // รายการคลิปยอดวิวสูงสุด 6 เดือน (โหลดตอนเปิดแผง เก็บไว้ทั้ง session แยกตามช่อง)
  // state: idle = ยังไม่ได้โหลด / Studio ยังไม่พร้อม · loading · ok · fail
  const REFRESH_TOP = '__refreshTop';
  let topVids = { ch: '', state: 'idle', list: [] };
  const fmtViews = (n) => new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const ellipsize = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  function loadTopVideos(force = false) {
    const ch = getChannel().id;
    if (!force && topVids.ch === ch && (topVids.state === 'ok' || topVids.state === 'loading')) return;
    if (!Claims || !Claims.listTopVideos) return;
    topVids = { ch, state: 'loading', list: [] };
    refreshLabels();
    Claims.listTopVideos()
      .then((list) => { if (topVids.ch === ch) topVids = { ch, state: list ? 'ok' : 'idle', list: list || [] }; })
      .catch((e) => { console.warn('[yt-upload-presets] listTopVideos', e); if (topVids.ch === ch) topVids = { ch, state: 'fail', list: [] }; })
      .finally(refreshLabels);
  }

  // หน้ารีวิวรูปแบบที่เรียนรู้จากคลิป: แก้ชื่อ/คำอธิบาย/แท็กได้ก่อนใช้ · คืนค่า true เมื่อบันทึกแล้ว
  // relearn = อ่านคลิปใหม่แล้วเรียนรู้ใหม่ (ไม่ใช้ของที่เก็บไว้)
  async function reviewVideoTemplate(id, relearn = false) {
    const store = videoTemplates();
    let tpl = !relearn && store[id];
    if (!tpl) {
      if (!Claims || !Claims.videoText) return false;
      let src;
      try { src = await Claims.videoText(id.slice(2)); }
      catch (e) {
        await ask({ title: L('อ่านข้อมูลคลิปไม่ได้', 'Couldn\'t read this video'), body: e.message, ok: L('ตกลง', 'OK') });
        return false;
      }
      const { warnings, txt, ...learned } = learnTemplate(src);
      const top = topVids.list.find((v) => 'v:' + v.videoId === id);
      tpl = { ...learned, id, label: '📈 ' + ellipsize(src.title, 40), visibility: 'PRIVATE', sampleTxt: txt, warnings,
        source: { videoId: id.slice(2), title: src.title, views: top ? top.views : 0 } };
    }
    const fTitle = h('input', { type: 'text', value: tpl.title });
    const fDesc = h('textarea', { rows: 6, value: tpl.description });
    const fTags = h('input', { type: 'text', value: tpl.tags.join(', ') });
    const pv = h('div', { className: 'vt-pv' });
    const draft = () => ({ ...tpl, title: fTitle.value, description: fDesc.value, tags: fTags.value.split(',').map((t) => t.trim()).filter(Boolean) });
    // ตัวอย่าง: ใช้คลิปแรกที่รอคิว ถ้าคิวว่างใช้ tracklist ของคลิปต้นแบบเอง
    const sample = queue.find((i) => i.status === 'pending');
    const showPreview = () => {
      const p = draft();
      const vars = sample
        ? buildVars(sample.file.name, sample.n || 1, sample.txt, { preset: p })
        : buildVars(L('ตัวอย่าง', 'Sample'), 1, tpl.sampleTxt || '', { preset: p });
      pv.replaceChildren(h('b', {}, makeTitle(p, vars)), '\n\n', renderDesc(p, vars).slice(0, 600), '\n\n', h('small', {}, renderTags(p, vars).join(', ')));
    };
    for (const f of [fTitle, fDesc, fTags]) f.addEventListener('input', showPreview);
    showPreview();
    const WARN = {
      'no-tracklist': L('ไม่พบ tracklist ในคำอธิบาย — ชื่อศิลปินยังเป็นข้อความตายตัว', 'No tracklist found in the description — artist names were kept as plain text'),
      'static-title': L('ชื่อคลิปไม่มีตัวแปร — ทุกคลิปจะได้ชื่อเดียวกัน', 'The title has no variables — every upload would get the same title'),
    };
    const body = h('div', { className: 'vt' },
      h('div', { className: 'mini' }, L(`จาก: ${tpl.source.title}`, `From: ${tpl.source.title}`),
        tpl.source.views ? ` · ${fmtViews(tpl.source.views)} ${L('วิว', 'views')}` : ''),
      (tpl.warnings || []).map((w) => h('div', { className: 'hint' }, icon('alert', 13), h('span', {}, WARN[w] || w))),
      h('div', { className: 'mini' }, L('ชื่อคลิป', 'Title')), fTitle,
      h('div', { className: 'mini' }, L('คำอธิบาย', 'Description')), fDesc,
      h('div', { className: 'mini' }, L('แท็ก (คั่นด้วย ,)', 'Tags (comma-separated)')), fTags,
      h('div', { className: 'mini' }, L('ตัวอย่าง', 'Preview')), pv);
    const r = await ask({
      title: L('ใช้รูปแบบจากคลิปนี้', 'Use this video\'s pattern'), body, ic: 'copy',
      ok: L('ใช้รูปแบบนี้', 'Use this pattern'), no: store[id] ? L('เรียนรู้ใหม่', 'Re-learn') : null,
    });
    if (r === false && store[id]) return reviewVideoTemplate(id, true);
    if (!r) return false;
    store[id] = draft();
    saveVideoTemplates();
    refreshLabels();
    return true;
  }

  // onchange ของ select พรีเซ็ต: id พรีเซ็ต / 'v:<videoId>' (ครั้งแรกเปิดหน้ารีวิวก่อน) / ปุ่มโหลดรายการใหม่
  async function choosePreset(sel, prev, apply) {
    const id = sel.value;
    sel.value = prev; // ยังไม่เปลี่ยนจนกว่าจะยืนยัน
    if (id === REFRESH_TOP) return loadTopVideos(true);
    if (isVideoId(id) && !videoTemplates()[id] && !(await reviewVideoTemplate(id))) return;
    apply(id);
  }
```

- [ ] **Step 3: Replace `presetOptions`**

Replace the whole function:

```js
  function presetOptions(selected) {
    return presets.map((p, i) => h('option', { value: p.id, selected: p.id === selected }, `${i + 1}. ${p.label}`));
  }
```

with:

```js
  function presetOptions(selected) {
    const mine = presets.map((p, i) => h('option', { value: p.id, selected: p.id === selected }, `${i + 1}. ${p.label}`));
    const vids = topVids.list.map((v, i) => h('option', { value: 'v:' + v.videoId, selected: 'v:' + v.videoId === selected },
      `${i ? '' : '⭐ '}${ellipsize(v.title, 48)} · ${fmtViews(v.views)}`));
    // รูปแบบที่เลือกไว้แต่หลุดจากรายการ 10 อันดับแล้ว -> ยังแสดงให้เห็นว่าการ์ดใช้อะไรอยู่
    const vt = isVideoId(selected) && videoTemplates()[selected];
    if (vt && !topVids.list.some((v) => 'v:' + v.videoId === selected)) vids.unshift(h('option', { value: selected, selected: true }, vt.label));
    const status = {
      loading: L('กำลังโหลด…', 'Loading…'),
      fail: L('โหลดรายการคลิปไม่ได้', 'Couldn\'t load videos'),
      ok: topVids.list.length ? '' : L('ไม่มีคลิปสาธารณะใน 6 เดือน', 'No public videos in the last 6 months'),
      idle: '',
    }[topVids.state];
    if (status) vids.push(h('option', { disabled: true }, status));
    if (topVids.state !== 'loading') vids.push(h('option', { value: REFRESH_TOP }, '↻ ' + (topVids.state === 'idle' ? L('โหลดรายการคลิป', 'Load videos') : L('โหลดใหม่', 'Refresh'))));
    return [
      h('optgroup', { label: L('พรีเซ็ต', 'Presets') }, mine),
      h('optgroup', { label: L('คัดลอกจากคลิป (6 เดือน, ยอดวิว)', 'Copy from video (last 6 mo, by views)') }, vids),
    ];
  }
```

- [ ] **Step 4: Route both selects through `choosePreset`**

In `const defaultPresetSel = h('select', {`, replace:

```js
    onchange: (e) => { activeId = e.target.value; save('activeId', activeId); refreshLabels(); },
```

with:

```js
    onchange: (e) => choosePreset(e.target, activeId, (id) => { activeId = id; save('activeId', activeId); refreshLabels(); }),
```

In the card's `const presetSel = h('select', {`, replace:

```js
      onchange: (e) => { it.presetId = e.target.value; it.titleEdited = false; renderQueue(); },
```

with:

```js
      onchange: (e) => choosePreset(e.target, it.presetId, (id) => { it.presetId = id; it.titleEdited = false; renderQueue(); }),
```

- [ ] **Step 5: Load the list when the panel opens**

In `function openDrawer(tab)`, add `loadTopVideos();` as the last line:

```js
  function openDrawer(tab) {
    root.classList.add('dopen');
    root.classList.toggle('dark', document.documentElement.hasAttribute('dark'));
    if (tab) showTab(tab);
    updateChannelUI();
    drawer.classList.add('open');
    loadTopVideos();
  }
```

- [ ] **Step 6: Add the card chip**

In `function updateItemUI(it)`, directly after `const kids = [];`, insert:

```js
    // การ์ดที่ใช้รูปแบบจากคลิป: ชิปบอกที่มา (คลิกเพื่อดู/แก้/เรียนรู้ใหม่) หรือเตือนเมื่อหารูปแบบไม่เจอ (เช่น สลับช่อง)
    if (isVideoId(it.presetId)) {
      const vt = videoTemplates()[it.presetId];
      if (!vt) kids.push(h('span', { className: 'chip bad', title: L('รูปแบบนี้เรียนรู้ไว้ในช่องอื่น หรือถูกลบไปแล้ว', 'This pattern was learned on another channel, or was removed') },
        icon('alert', 13), h('span', {}, L(`ไม่พบรูปแบบจากคลิป — ใช้ ${presets[0].label}`, `Video pattern missing — using ${presets[0].label}`))));
      else if (editable) kids.push(h('button', { className: 'chip', title: L('คลิกเพื่อดู/แก้รูปแบบ หรือเรียนรู้ใหม่', 'Click to review, edit or re-learn this pattern'), onclick: () => reviewVideoTemplate(it.presetId) },
        icon('copy', 13), h('span', {}, L(`รูปแบบจาก: ${ellipsize(vt.source.title, 36)}`, `Pattern from: ${ellipsize(vt.source.title, 36)}`))));
      else kids.push(h('span', { className: 'chip' }, icon('copy', 13), h('span', {}, ellipsize(vt.source.title, 36))));
    }
```

- [ ] **Step 7: Run the tests and a syntax check**

Run: `node --test test/*.test.mjs && node --check youtube-upload-presets.user.js`
Expected: PASS (`fail 0`), and `node --check` exits 0.

- [ ] **Step 8: Commit**

```bash
git add youtube-upload-presets.user.js
git commit -m "Pick an uploaded video in place of a preset, with a review dialog"
```

---

### Task 6: Live check, docs and release v4.27.0

**Files:**
- Modify: `youtube-upload-presets.user.js`, header line `// @version      4.26.0`
- Modify: `README.md`

- [ ] **Step 1: Live check in Studio**

Install the working copy in Tampermonkey (paste the file into the script editor) and open Studio on a channel with public uploads from the last 6 months. Check each item:

1. Open the panel. The "Copy from video" group shows "Loading…", then up to 10 videos sorted by views, with ⭐ on the first.
2. The default preset doesn't change on its own.
3. Pick the ⭐ video in a card's select. The review dialog shows the source title and views, learned fields with variables, and a preview.
4. Cancel. The card keeps its previous preset.
5. Pick it again and click **Use this pattern**. The card's title preview follows the pattern, and the "Pattern from: …" chip appears.
6. Click the chip. The dialog reopens with **Re-learn**. Re-learn fetches again.
7. Open the Presets tab. The editor shows a user preset, not the video template.
8. Upload one test clip as Private. The title, description and tags in Studio match the preview.
9. Reload the page. The card's select still shows the video pattern.
10. Settings → Backup / share → export. The JSON has no `videoTemplates`.

Expected: all 10 hold. If one fails, fix it in the task where that code lives, and re-run Steps 6 and 7 of that task.

- [ ] **Step 2: README note**

In `README.md`, after the paragraph that starts `After installing, set your producer name`, add:

```markdown
**Copy a pattern from a video.** Every preset dropdown also lists your top 10 public videos from the last
6 months by views (⭐ = most viewed). Picking one learns its title, description and tags as a template:
the tracklist, artists, track count, year, BPM and quoted beat name become variables, so each new upload
gets its own values in the same format. You review the learned pattern before it's used; it is stored per
channel and is not added to your preset list.
```

- [ ] **Step 3: Bump the version**

Change `// @version      4.26.0` to `// @version      4.27.0`.

- [ ] **Step 4: Final test run**

Run: `node --test test/*.test.mjs && node --check youtube-upload-presets.user.js`
Expected: PASS (`fail 0`), and `node --check` exits 0.

- [ ] **Step 5: Commit**

```bash
git add youtube-upload-presets.user.js README.md
git commit -m "Copy the pattern from a top video when uploading (v4.27.0)"
```
