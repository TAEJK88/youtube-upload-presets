// The userscript is a single IIFE that builds DOM and calls GM_* at load time, so it
// cannot be imported. Instead we slice its pure blocks out of the source and evaluate
// them on their own with small stubs. Anchors are checked, so moving a block fails
// loudly here instead of silently skipping tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'youtube-upload-presets.user.js');
const SRC = readFileSync(FILE, 'utf8');
const LINES = SRC.split('\n');

function block(startsWith, endsBefore) {
  const a = LINES.findIndex((l) => l.trimStart().startsWith(startsWith));
  if (a < 0) throw new Error(`harness: block start not found: ${startsWith}`);
  const b = LINES.findIndex((l, i) => i > a && l.trimStart().startsWith(endsBefore));
  if (b < 0) throw new Error(`harness: block end not found: ${endsBefore}`);
  return LINES.slice(a, b).join('\n');
}

function constLine(name) {
  const m = SRC.match(new RegExp(`^\\s*const ${name} = .*$`, 'm'));
  if (!m) throw new Error(`harness: const not found: ${name}`);
  return m[0];
}

const TEMPLATE = block('// ===== template =====', '// ===== ตรวจ tracklist');
const CHAPTERS = block('const fmtTs =', 'function videoDuration');
const TRACKLIST = block('const parseTime =', 'function showTracklistFix');
// parseUploadPct reads TXT.uploadPct, so the registry has to be in scope too
const TXTREG = block('// ===== ข้อความที่ Studio แสดง =====', '// ===== ชื่อ element ของ Studio');
const ACTIVITY = block('// ===== งานที่กำลังทำ (progress) =====', '// ===== Studio DOM automation');

export const settings = { year: '', producer: '' };
export const channel = { name: 'Test Channel', id: 'UCtest' };
// the script writes every UI string as L(th, en); tests read the English side
const L = (th, en) => en;

const build = new Function(
  'settings',
  'getChannel',
  'L',
  `'use strict';
  ${constLine('VARS')}
  ${constLine('VIDEO_EXT')}
  ${constLine('TITLE_MAX')}
  ${constLine('DESC_MAX')}
  ${TEMPLATE}
  ${CHAPTERS}
  ${TRACKLIST}
  ${TXTREG}
  ${ACTIVITY}
  return { pad, parseTracks, buildVars, render, clean, renderTitle, makeTitle,
           unknownVars, renderTags, renderDesc, parseTime, fixTracklist,
           fmtTs, checkTracklist, fixChapters, parseUploadPct, activityFrom,
           VARS, TITLE_MAX, DESC_MAX };`
);

export const S = build(settings, () => channel, L);

const DEFAULTS_BLOCK = block('const DEFAULT_PRESETS = [', '];');
const STORAGE = block('// ===== storage =====', '// ===== ย้ายข้อมูลของเวอร์ชันเก่า');
const SCHEMA = block('// ===== ย้ายข้อมูลของเวอร์ชันเก่า', 'let presets = load(');

// Runs the storage migrations against a throwaway GM store and hands back what
// they wrote, so each test starts from a known install state.
export function migrate(initial = {}) {
  const store = { ...initial };
  const run = new Function(
    'GM_getValue',
    'GM_setValue',
    'console',
    'L',
    `'use strict';
    ${DEFAULTS_BLOCK}
    ];
    ${STORAGE}
    ${SCHEMA}
    return { presets: load('presets', structuredClone(DEFAULT_PRESETS)), DEFAULT_PRESETS };`
  );
  const out = run((k) => store[k], (k, v) => { store[k] = v; }, console, L);
  return { store, ...out };
}

// ----- collab (invite / accept) -----
// The matching and result-reporting rules are pure, so they are sliced out and
// tested without a DOM. Everything else in the collab flow talks to Studio.
const TXT_BLOCK = block('const TXT = {', '// ===== ชื่อ element ของ Studio =====');
const COLLAB = block('// ===== collab: การเทียบข้อความ', '// ===== รับคำเชิญสิทธิ์ช่องอัตโนมัติ');

export const C = new Function(
  'L',
  `'use strict';
  ${TXT_BLOCK}
  ${COLLAB}
  ${constLine('INVITE_URL')}
  return { normText, collabRowMatches, acceptLabelMatches, switcherRowMatches, inviteOutcome, parseHandles, TXT, INVITE_URL };`
)(L);

// ----- the collab dialog flow, driven against a fake DOM -----
// inviteCollaborators() is the part that actually talks to Studio, so the pure
// slices above cannot cover it. test/fake-dom.mjs is just big enough to run it.
const COLLAB_DOM = block('// ===== Collaboration:', '// เลือกหมวดหมู่');
const SEL_BLOCK = block('const SEL = {', '// ===== collab: การเทียบข้อความ');
const UTIL_BLOCK = block('const sleep =', 'const getDialog ='); // sleep / isVisible / waitFor

export function makeInviter(doc, { pace = 0.01 } = {}) {
  const run = new Function(
    'L', 'document', 'T',
    `'use strict';
    ${TXT_BLOCK}
    ${SEL_BLOCK}
    ${UTIL_BLOCK}
    ${COLLAB}
    ${COLLAB_DOM}
    return { inviteCollaborators, parseHandles, SEL };`
  );
  return run(L, doc, (ms) => ms * pace);
}

// ----- the accept-invite watcher, driven against a fake DOM -----
// Sliced from `let inviteWatching` down to the SPA re-arm poller below it.
const WATCH = block('let inviteWatching = false;', '// Studio เปลี่ยนหน้าแบบ SPA');
const INVITE_HELPERS = block('// ลิงก์คำเชิญ /channel/', 'let inviteWatching = false;');

export function makeWatcher(doc, win, store = {}) {
  const run = new Function(
    'L', 'document', 'location', 'getComputedStyle', 'setInterval', 'clearInterval', 'setTimeout', 'console', 'GM_getValue', 'GM_setValue',
    `'use strict';
    ${TXT_BLOCK}
    ${SEL_BLOCK}
    ${COLLAB}
    ${INVITE_HELPERS}
    ${WATCH}
    return watchInvite;`
  );
  // the toast's auto-remove timer is irrelevant here and would keep node alive
  return run(L, doc, win.location, win.getComputedStyle, win.setInterval, win.clearInterval,
    () => 0, win.console,
    (k, d) => (k === 'settings' ? {} : (k in store ? store[k] : d)),
    (k, v) => { store[k] = v; });
}

// ----- which surface the details fields live on -----
// The same title/description selectors appear in the upload dialog and on the
// /video/<id>/edit page; this picks whichever is present.
const DETAILS_HOST = block('const getDialog =', 'const findTagsInput =');

export function makeDetails(doc) {
  return new Function(
    'document', 'isVisible',
    `'use strict';
    ${SEL_BLOCK}
    ${DETAILS_HOST}
    return { getDialog, getDetailsHost, getTitleBox, getDescBox, onEditPage, detailsOpen };`
  )(doc, (el) => !!el && el.isConnected && el.getClientRects().length > 0);
}

// ----- the channel switcher -----
const SWITCHER = block('// ===== สลับช่องให้อัตโนมัติ', 'let inviteWatching = false;');

export function makeSwitcher(doc, win, store) {
  return new Function(
    'L', 'document', 'location', 'setInterval', 'clearInterval', 'console',
    'GM_getValue', 'GM_setValue',
    `'use strict';
    ${TXT_BLOCK}
    ${SEL_BLOCK}
    ${COLLAB}
    ${SWITCHER}
    return { watchChannelSwitcher, switchToChannel, recoverAfterSwitch };`
  )(L, doc, win.location, win.setInterval, win.clearInterval, { info() {} },
    (k, d) => (k in store ? store[k] : d), (k, v) => { store[k] = v; });
}
