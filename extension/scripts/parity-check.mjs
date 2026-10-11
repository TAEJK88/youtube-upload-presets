// Parity with the userscript at PIN (v4.27.1). The inventory comes from the pinned source, so its
// ids never move: its named things (storage keys, settings, preset fields, switches, sections,
// variables, shortcuts, tabs, header lines), each port config, and every line of code that no
// port config covers. scripts/parity/rows/*.mjs must hold one row per item saying where it lives
// in the extension and what proves it, or why it is gone. Strings are ui-check's job, ported
// code port-check's.
//   node scripts/parity-check.mjs            structure: every item has one row, rows hold up
//   node scripts/parity-check.mjs --release  also: no `missing` row, PARITY.md is fresh; prints
//                                            every changed and dropped row for the owner to read
//   node scripts/parity-check.mjs --write    writes PARITY.md (not when a row has a problem)
//   node scripts/parity-check.mjs --seed     prints a `missing` row for every named item without one
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'd15ef87caaddb7a6d3187d2851b83a484c4bb9e7'; // userscript v4.27.1, as scripts/port-check.mjs
const STATUSES = ['same', 'changed', 'dropped', 'missing'];
export const MAX_LINES = 150; // one `lines` row is one feature, not a region
export const MAX_HANDLERS = 12;

const all = (text, re, f = (m) => m[1]) => [...text.matchAll(re)].map(f);
const between = (text, a, b) => {
  const i = text.indexOf(a);
  const j = i < 0 ? -1 : text.indexOf(b, i);
  return i < 0 || j < 0 ? '' : text.slice(i, j);
};
export const span = (s) => { const [a, b = a] = String(s).split('-').map(Number); return [a, b]; };
const inAny = (n, spans) => spans.some(([a, b]) => n >= a && n <= b);
// A line that wires a user action: a property (`onclick: () =>`), an assignment (`n.onclick = …`)
// or addEventListener. These are `ui:<line>`; every other line of code is `code:<line>`.
const HANDLER = /\bon[a-z]+\s*[:=]\s*(?:\(|async\b|[A-Za-z_$][\w$.]*\s*[,;})])|addEventListener\(/;

// Line numbers that are code: not blank, not a // comment, not inside a /* */ block.
export function codeLines(text) {
  const out = [];
  let block = false;
  text.split('\n').forEach((raw, i) => {
    const l = raw.trim();
    if (block) { if (l.includes('*/')) block = false; return; }
    if (!l || l.startsWith('//')) return;
    if (l.startsWith('/*')) { if (!l.includes('*/')) block = true; return; }
    out.push(i + 1);
  });
  return out;
}

export function inventory(text, portRegions) {
  const header = between(text, '// ==UserScript==', '// ==/UserScript==');
  const keysOf = (block) => all(block, /^ {6}(\w+):/gm);
  const lines = text.split('\n');
  return [...new Set([
    ...all(header, /^\/\/ @(match|grant|run-at|updateURL)\s+(\S+)/gm, (m) => `header:${m[1]} ${m[2]}`),
    ...all(text, /\b(?:load|save)\('([^']+)'/g).map((k) => 'store:' + k),
    ...all(text, /const \w+_KEY = '([^']+)'/g).map((k) => 'store:' + k),
    ...all(text, /\blegacy: '([^']+)'/g).map((k) => 'store:' + k),
    ...all(text, /\bch(?:Get|Set)\('([^']+)'/g).map((k) => `store:${k}:<channel>`),
    ...(text.includes("'tabLock:'") ? ['store:tabLock:<channel>'] : []),
    ...all(text, /sessionStorage\.(?:get|set)Item\('([^']+)'/g).map((k) => 'session:' + k),
    ...keysOf(between(text, 'const settings = Object.assign(', 'const saveSettings')).map((k) => 'setting:' + k),
    ...keysOf(between(text, 'const DEFAULTS = {', 'const cfg = ()')).map((k) => 'cfg:' + k),
    ...keysOf(between(text, 'const DEFAULT_PRESETS = [', '\n  ];')).map((k) => 'preset:' + k),
    ...all(text, /\bsw\('(\w+)'/g).map((k) => 'switch:' + k),
    ...all(text, /\bsec\(L\('(?:[^'\\]|\\.)*', '((?:[^'\\]|\\.)*)'\)/g).map((k) => 'section:' + k.replace(/\\(.)/g, '$1')),
    ...all(text, /const VARS = \[([^\]]*)\]/g).flatMap((s) => all(s, /'(\w+)'/g)).map((k) => `var:{${k}}`),
    ...all(text, /e\.code === '(\w+)'/g).map((k) => 'key:Alt+' + k),
    ...(text.includes('/^Digit[1-9]$/') ? ['key:Alt+Digit1-9'] : []),
    ...all(text, /^\s*panes\.(\w+) = /gm).map((k) => 'tab:' + k),
    ...codeLines(text).filter((n) => !inAny(n, portRegions)).map((n) => (HANDLER.test(lines[n - 1]) ? 'ui:' : 'code:') + n),
  ])].sort();
}

const label = (r) => r.id ?? (r.lines ?? []).join(', ');
const list = (v) => (v === undefined ? [] : [].concat(v));
const isLine = (id) => id.startsWith('ui:') || id.startsWith('code:');
const lineOf = (id) => Number(id.slice(id.indexOf(':') + 1));
// What must be found in a named item's home: the key itself, or the section's English title.
function needle(id) {
  const m = id.match(/^(store|setting|cfg|preset|switch|section|var):(.+)$/);
  if (!m) return null;
  return m[2].replace(/:<channel>$/, '').replace(/^\{(.+)\}$/, '$1');
}
// A README or spec cite names a heading: all of it, or its leading words (MIN_HEADING characters
// or more, ending where a word ends). Text merely found inside a heading names nothing.
const MIN_HEADING = 10;
const namesHeading = (what, hs) => hs.some((h) => h === what || (what.length >= MIN_HEADING && h.startsWith(what) && !/\w/.test(h[what.length])));
// A home is a source file of the extension, a test a test file; neither may leave extension/.
const inside = (p) => !p.split('/').includes('..');
const isHome = (p) => inside(p) && (/^(lib|entrypoints|components|public)\/./.test(p) || p === 'wxt.config.ts');
const isTest = (p) => inside(p) && /^tests\/.+\.test\.tsx?$/.test(p);
// cite: '<kind>: <text>'. Each kind resolves against a tracked file.
function citeProblem(cite, c) {
  const m = /^(dropped\.mjs|extension-only\.mjs|README|spec|decision): (.+)$/.exec(cite ?? '');
  if (!m) return 'needs a cite of the form "dropped.mjs: <English>", "extension-only.mjs: <English>", "README: <heading>", "spec: <heading>" or "decision: <id>"';
  const [, kind, what] = m;
  const found =
    kind === 'dropped.mjs' ? c.dropped.has(what)
    : kind === 'extension-only.mjs' ? c.extensionOnly.has(what)
    : kind === 'README' ? namesHeading(what, c.readmeHeadings)
    : kind === 'spec' ? namesHeading(what, c.specHeadings)
    : c.decisions.has(what);
  return found ? null : `cite "${cite}" resolves to nothing`;
}

// ctx: { read(path) → text | null (a file under extension/), readmeItems: Set<number>, cites, release }
export function check(rows, inv, ctx) {
  const out = [];
  const known = new Set(inv);
  const hits = new Map(inv.map((id) => [id, 0]));
  const bump = (id) => hits.set(id, hits.get(id) + 1);
  for (const r of rows) {
    const name = label(r);
    if (!r.id && !r.lines?.length) { out.push('a row has neither id nor lines'); continue; }
    if (!STATUSES.includes(r.status)) out.push(`${name}: status must be one of ${STATUSES.join(' / ')}`);
    if (r.id && known.has(r.id)) bump(r.id);
    else if (r.id && !(r.manual && r.id.startsWith('feature:'))) out.push(`${name}: not in the inventory (a hand-listed row is manual: true with an id starting "feature:")`);
    if (r.lines) {
      const spans = r.lines.map(span);
      const lineIds = inv.filter(isLine);
      const covered = lineIds.filter((id) => inAny(lineOf(id), spans));
      covered.forEach(bump);
      if (!covered.length) out.push(`${name}: covers no line of the inventory`);
      r.lines.forEach((l, i) => {
        if (!/^\d+(-\d+)?$/.test(l) || spans[i][0] > spans[i][1]) out.push(`${name}: range "${l}" is not a line or <first>-<last>`);
        else if (covered.length && !lineIds.some((id) => inAny(lineOf(id), [spans[i]]))) out.push(`${name}: range "${l}" covers no line of the inventory`);
      });
      if (r.status !== 'missing') {
        if (!r.note?.trim()) out.push(`${name}: a lines row needs a note naming the one feature it covers`);
        const handlers = covered.filter((id) => id.startsWith('ui:')).length;
        if (covered.length > MAX_LINES) out.push(`${name}: ${covered.length} lines in one row (at most ${MAX_LINES}): split it by feature`);
        if (handlers > MAX_HANDLERS) out.push(`${name}: ${handlers} handler lines in one row (at most ${MAX_HANDLERS}): split it by feature`);
      }
    }
    if (r.status === 'same' || r.status === 'changed') {
      const homes = list(r.home);
      if (!homes.length) out.push(`${name}: ${r.status} needs a home (a file under extension/)`);
      const texts = homes.map((h) => [h, ctx.read(h)]);
      for (const [h, t] of texts) {
        if (!isHome(h)) out.push(`${name}: home ${h} is not a source file of the extension (lib/, entrypoints/, components/, public/ or wxt.config.ts)`);
        else if (t === null) out.push(`${name}: home ${h} does not exist`);
      }
      const key = r.id ? needle(r.id) : null;
      if (key && homes.length && !texts.some(([, t]) => t?.includes(key))) out.push(`${name}: "${key}" does not occur in its home`);
      for (const t of list(r.test)) {
        if (!isTest(t)) out.push(`${name}: test ${t} is not a test file (tests/….test.ts)`);
        else if (ctx.read(t) === null) out.push(`${name}: test ${t} does not exist`);
      }
      if (!list(r.readme).length && !list(r.test).length && !r.unseen?.trim()) out.push(`${name}: ${r.status} needs a proof: a README item (readme), a test file (test), or unseen: '<why nothing can be seen or tested>'`);
    }
    if (r.status === 'changed' || r.status === 'dropped') {
      const p = citeProblem(r.cite, ctx.cites);
      if (p) out.push(`${name}: ${r.status} ${p}`);
    }
    for (const n of list(r.readme)) if (!ctx.readmeItems.has(n)) out.push(`${name}: README item ${n} does not exist`);
    if (ctx.release && r.status === 'missing') out.push(`${name}: MISSING — port it, or record the owner's decision in scripts/parity/DECISIONS.md`);
  }
  for (const [id, n] of hits) {
    if (n === 0) out.push(`${id}: no row`);
    if (n > 1) out.push(`${id}: ${n} rows`);
  }
  return out;
}

const ORDER = { missing: 0, changed: 1, dropped: 2, same: 3 };
const proof = (r) => [list(r.readme).join(', '), ...list(r.test).map((t) => '`' + t + '`'), r.unseen ? 'not visible: ' + r.unseen : ''].filter(Boolean).join('; ');
export function render(rows) {
  const line = (r) => `| \`${label(r)}\` | ${r.status} | ${list(r.home).map((h) => '`' + h + '`').join(', ')} | ${[r.cite, r.note].filter(Boolean).join(' — ')} | ${proof(r)} |`;
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || label(a).localeCompare(label(b)));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return [
    '# Parity with the userscript v4.27.1',
    '',
    'Generated by `npm run parity -- --write` from `scripts/parity/rows/`. Do not edit by hand.',
    '',
    `${rows.length} rows: ${count('same')} same, ${count('changed')} changed on purpose, ${count('dropped')} dropped on purpose, ${count('missing')} missing.`,
    '',
    'The first column is the item in the pinned userscript; line numbers are lines of the file at `d15ef87`. Decisions are in `scripts/parity/DECISIONS.md`. "Proof" is the README exit-check item that shows it in Chrome, or the test that pins it.',
    '',
    '| Userscript | Status | In the extension | Why / note | Proof (README item, test) |',
    '|---|---|---|---|---|',
    ...sorted.map(line),
    '',
  ].join('\n');
}

const headings = (md) => all(md, /^#{1,4} (.+)$/gm);
const entries = async (file) => new Set((await import(pathToFileURL(join(EXT, file)).href)).default.map((p) => p.en));

// The inventory of the pinned userscript, with the port configs as they are now. A port config
// that gains a region takes lines out of it (tests/parity-check.test.ts pins the count and hash).
export async function pinnedInventory() {
  const text = execFileSync('git', ['show', `${PIN}:youtube-upload-presets.user.js`], { cwd: join(EXT, '..'), encoding: 'utf8', maxBuffer: 1 << 26 });
  const portDir = join(EXT, 'scripts/port');
  const ports = readdirSync(portDir).filter((f) => f.endsWith('.mjs'));
  const regions = [];
  for (const f of ports) regions.push(...((await import(pathToFileURL(join(portDir, f)).href)).default.regions ?? []).map(span));
  return [...inventory(text, regions), ...ports.map((f) => 'port:' + f.replace(/\.mjs$/, ''))].sort();
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const inv = await pinnedInventory();
  const rowDir = join(EXT, 'scripts/parity/rows');
  const rows = [];
  for (const f of readdirSync(rowDir).filter((x) => x.endsWith('.mjs')).sort()) rows.push(...(await import(pathToFileURL(join(rowDir, f)).href)).default);
  if (args.has('--seed')) {
    const have = new Set(rows.map((r) => r.id));
    for (const id of inv) if (!have.has(id) && !isLine(id)) console.log(`  { id: ${JSON.stringify(id)}, status: 'missing', note: 'not looked at yet' },`);
    return;
  }
  const cache = new Map();
  const read = (p) => {
    if (!cache.has(p)) cache.set(p, statSync(join(EXT, p), { throwIfNoEntry: false })?.isFile() ? readFileSync(join(EXT, p), 'utf8') : null);
    return cache.get(p);
  };
  const readme = read('README.md') ?? '';
  const ctx = {
    read,
    readmeItems: new Set(all(readme, /^(\d+)\. \*\*/gm).map(Number)),
    release: args.has('--release'),
    cites: {
      dropped: await entries('scripts/strings/dropped.mjs'),
      extensionOnly: await entries('scripts/strings/extension-only.mjs'),
      readmeHeadings: headings(readme),
      specHeadings: headings(readFileSync(join(EXT, '../docs/superpowers/specs/2026-10-05-chrome-extension-design.md'), 'utf8')),
      decisions: new Set(all(read('scripts/parity/DECISIONS.md') ?? '', /^- \*\*([\w-]+)\*\*/gm)),
    },
  };
  const problems = check(rows, inv, ctx);
  const md = render(rows);
  if (args.has('--write')) { if (!problems.length) writeFileSync(join(EXT, 'PARITY.md'), md); } // never from rows that don't hold up
  else if (ctx.release && read('PARITY.md') !== md) problems.push('PARITY.md is missing or out of date: run `npm run parity -- --write`');
  if (problems.length) {
    console.error(`parity-check: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  if (ctx.release) {
    console.log('Changed or dropped on purpose — the owner reads this list before a release (README item 81):');
    for (const r of rows.filter((x) => x.status === 'changed' || x.status === 'dropped')) console.log(`  ${r.status.padEnd(7)} ${label(r)} — ${r.cite}${r.note ? ' — ' + r.note : ''}`);
  }
  console.log(`parity-check: ok (${inv.length} items, ${rows.length} rows, ${rows.filter((r) => r.status === 'missing').length} missing)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
