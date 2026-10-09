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
    const before = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    if (/^\s*(\/\/|\/?\*)/.test(before) || /\s\/\/[^'"`]*$/.test(before)) continue; // in a comment
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
