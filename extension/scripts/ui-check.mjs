// Two promises the side panel rebuild makes, checked:
// 1. Strings: every L('ไทย', 'English') pair the extension ships is one the userscript had at
//    the pinned commit, or is listed in scripts/strings/extension-only.mjs with the reason it
//    is new. With --coverage, every pair of the userscript's drawer UI (lines DRAWER) is used
//    somewhere in the extension, or is listed in scripts/strings/dropped.mjs with the reason
//    the panel no longer shows it.
// 2. No style in the extension sets text below 12px: CSS font-size / font shorthand in any unit,
//    Tailwind text-[…] / font-[…] / text-(length:…) and --text-* theme tokens, inline JS and JSX
//    fontSize (quoted keys and brackets too). Comments are ignored. Sizes it can't resolve (calc,
//    var, vw, small keywords…) fail unless scripts/ui-allow.mjs lists them by file and line.
// Every L( call in shipping code must be two string literals, or be listed in scripts/ui-allow.mjs.
// L itself may only be called directly: an alias, a member access (i18n.L), a tagged template or
// any other use of the name fails, so no string can reach the UI around the check. A script with
// a syntax error fails. Scripts are parsed in process with TypeScript 5.9 (the typescript5
// devDependency; the userscript as JS), so comments and strings are never mistaken for calls.
//
//   node scripts/ui-check.mjs [--coverage]
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript5';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'd15ef87caaddb7a6d3187d2851b83a484c4bb9e7'; // userscript v4.27.1, as scripts/port-check.mjs
export const DRAWER = [2428, 4586]; // "===== UI =====" up to the copyright module (Phase 4)
const US_PAIRS = { total: 790, unique: 725 }; // what the userscript at PIN yields; anything else means the parser drifted
const SOURCE_DIRS = ['lib', 'entrypoints', 'components', 'assets', 'public'];
const SKIP_DIRS = new Set(['scripts', 'tests', '__tests__', 'node_modules']);
const SCRIPT = /\.(ts|tsx|js|mjs|jsx)$/;
const I18N = 'lib/i18n.ts'; // where L is defined
const MIN_PX = 12;
const { SyntaxKind } = ts;

const KIND = { '.ts': ts.ScriptKind.TS, '.tsx': ts.ScriptKind.TSX, '.jsx': ts.ScriptKind.JSX };
const parse = (path, text) => ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, KIND[extname(path)] ?? ts.ScriptKind.JS);

const isL = (n) => (n.kind === SyntaxKind.Identifier || n.kind === SyntaxKind.StringLiteral) && n.text === 'L';

// Is this mention of the name L allowed? Only as the callee of a call, in an unaliased import
// specifier, or as the declaration in lib/i18n.ts. String 'L' counts where it names a binding.
function allowedRef(n, path) {
  const p = n.parent;
  if (n.kind === SyntaxKind.StringLiteral) {
    if (p.kind === SyntaxKind.ElementAccessExpression) return p.argumentExpression !== n;
    return ![SyntaxKind.BindingElement, SyntaxKind.ImportSpecifier, SyntaxKind.ExportSpecifier].includes(p.kind) || p.propertyName !== n;
  }
  if (p.kind === SyntaxKind.CallExpression && p.expression === n) return true;
  if (p.kind === SyntaxKind.ImportSpecifier && !p.propertyName) return true;
  return path === I18N && p.kind === SyntaxKind.VariableDeclaration && p.name === n;
}

// Every L( call (callee the identifier L) in each file: pairs of two literals, and the calls that
// aren't; every other mention of L (refs); and the first syntax error. Template literals compare
// with every ${…} replaced by ${}, so a variable renamed in the rebuild still matches.
export function parseCalls(files) {
  const out = new Map();
  for (const f of files) {
    const sf = parse(f.path, f.text);
    const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
    const res = { pairs: [], dynamic: [], refs: [], syntax: [] };
    out.set(f.path, res);
    const d = sf.parseDiagnostics[0];
    if (d) { res.syntax.push({ line: lineOf(d.start), message: ts.flattenDiagnosticMessageText(d.messageText, ' ') }); continue; }
    const lines = f.text.split('\n');
    const visit = (n) => {
      if (n.kind === SyntaxKind.CallExpression && n.expression.kind === SyntaxKind.Identifier && n.expression.text === 'L') {
        const line = lineOf(n.getStart(sf));
        const [a, b] = n.arguments.map(literal);
        if (n.arguments.length === 2 && a !== null && b !== null) res.pairs.push({ th: a, en: b, line });
        else res.dynamic.push({ line, text: n.getText(sf).replace(/\s+/g, ' ') });
      }
      if (isL(n) && !allowedRef(n, f.path)) {
        const line = lineOf(n.getStart(sf));
        if (!res.refs.some((r) => r.line === line)) res.refs.push({ line, text: lines[line - 1].trim().replace(/\s+/g, ' ') });
      }
      n.forEachChild(visit);
    };
    visit(sf);
  }
  return out;
}

function literal(n) {
  if (n.kind === SyntaxKind.StringLiteral || n.kind === SyntaxKind.NoSubstitutionTemplateLiteral) return n.text;
  if (n.kind === SyntaxKind.TemplateExpression) return n.head.text + n.templateSpans.map((s) => '${}' + s.literal.text).join('');
  return null;
}

function lineFinder(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') starts.push(k + 1);
  return (idx) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= idx) lo = m; else hi = m - 1; }
    return lo + 1;
  };
}

// The L('…', '…') pairs of one source; `name` picks the language (.tsx, .ts, .js…).
export const extractPairs = (text, name = 'source.tsx') => parseCalls([{ path: name, text }]).get(name).pairs;

export const pairKey = (p) => p.th + '\u0000' + p.en;
const show = (p) => `L(${JSON.stringify(p.th)}, ${JSON.stringify(p.en)})`;

export function userscriptPairs() {
  const text = execFileSync('git', ['show', `${PIN}:youtube-upload-presets.user.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const res = parseCalls([{ path: 'userscript.js', text }]).get('userscript.js');
  if (res.syntax.length) throw new Error(`ui-check: the userscript does not parse (line ${res.syntax[0].line}: ${res.syntax[0].message})`);
  return res.pairs;
}

// The userscript must yield exactly the pairs it always has; a parser change that loses or
// invents pairs would otherwise pass every check silently.
export function canary(pairs) {
  const unique = new Set(pairs.map(pairKey)).size;
  if (pairs.length === US_PAIRS.total && unique === US_PAIRS.unique) return [];
  return [`userscript canary: expected ${US_PAIRS.total} L() pairs (${US_PAIRS.unique} unique) at the pinned commit, got ${pairs.length} (${unique} unique) — the parser or the pin changed`];
}

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (!statSync(p).isDirectory()) return [p];
  return SKIP_DIRS.has(f) ? [] : walk(p);
});
export const sourceFiles = (root = ROOT) =>
  SOURCE_DIRS.flatMap((d) => { try { return walk(join(root, d)); } catch { return []; } })
    .filter((p) => /\.(ts|tsx|js|mjs|jsx|css|html|svg)$/.test(p) && !p.endsWith('.d.ts'))
    .map((p) => ({ path: relative(root, p), text: readFileSync(p, 'utf8') }));

// ---- font sizes ----
const UNITS = { px: 1, rem: 16, em: 16, '%': 0.16, pt: 4 / 3, pc: 16 }; // rem/em/% resolved at 16px
const BIG_ENOUGH = new Set(['medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'larger', 'inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const SHORTHAND_SKIP = /^(normal|italic|oblique|[+-]?[\d.]+deg|bold|bolder|lighter|\d+|small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps|(ultra-|extra-|semi-)?(condensed|expanded))$/;
const MATH = /^(calc|clamp|min|max)\(/;
const NUMBER_UNIT = /^[+-]?(\d+\.?\d*|\.\d+)[a-z%]+$/;

// { px } for a length (a bare number is px), { ok } for a keyword at least 12px, {} if unknown.
function measure(v) {
  if (BIG_ENOUGH.has(v)) return { ok: true };
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|rem|em|%|pt|pc)?$/.exec(v);
  return m ? { px: Math.round(+m[1] * UNITS[m[2] ?? 'px'] * 100) / 100 } : {};
}

// The value after a property's colon: a quoted string's content, or text up to the end of the
// declaration (`whole`) or of the first token. Skips whitespace and newlines first.
function readValue(t, i, whole) {
  while (/\s/.test(t[i] ?? '')) i++;
  const q = t[i];
  if (q === '{') { // a JSX prop, fontSize={11}: judge what the braces hold
    let j = i, depth = 0;
    for (; j < t.length; j++) if (t[j] === '{') depth++; else if (t[j] === '}' && !--depth) break;
    return readValue(t.slice(i + 1, j), 0, whole);
  }
  if (q === '"' || q === "'" || q === '`') {
    const end = t.indexOf(q, i + 1);
    return t.slice(i + 1, end < 0 ? undefined : end).trim();
  }
  let j = i, depth = 0;
  while (j < t.length) {
    const c = t[j];
    if (c === '$' && t[j + 1] === '{') { const e = t.indexOf('}', j); j = e < 0 ? t.length : e + 1; continue; }
    if (c === '(') depth++;
    else if (c === ')') { if (!depth) break; depth--; }
    else if (!depth && (/[;{}"'`<>!]/.test(c) || (!whole && /[\s,]/.test(c)))) break;
    j++;
  }
  return t.slice(i, j).trim();
}

// Split at whitespace outside parentheses.
function tokens(v) {
  const out = [];
  let cur = '', depth = 0;
  for (const c of v) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (!depth && /\s/.test(c)) { if (cur) out.push(cur); cur = ''; } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function shorthandSize(v) {
  if (BIG_ENOUGH.has(v)) return null;
  for (const tok of tokens(v)) {
    if (SHORTHAND_SKIP.test(tok)) continue;
    return tok.split('/')[0] || v;
  }
  return v;
}

// The text with its comments blanked out (newlines kept, so offsets and lines still match):
// scripts by the TypeScript parser, CSS /* */, HTML/SVG <!-- --> and /* */.
export function stripComments(text, name = 'source.css') {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  if (!SCRIPT.test(name)) {
    const out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
    return /\.(html|svg)$/.test(name) ? out.replace(/<!--[\s\S]*?-->/g, blank) : out;
  }
  const sf = parse(name, text);
  const ranges = new Map();
  const visit = (n) => {
    if (n.kind === SyntaxKind.JsxText) return; // its text is content, not trivia
    // the trivia before each token: comments on the token's own line first, then the rest
    for (const r of [...ts.getTrailingCommentRanges(text, n.pos) ?? [], ...ts.getLeadingCommentRanges(text, n.pos) ?? []]) ranges.set(r.pos, r.end);
    for (const c of n.getChildren(sf)) visit(c);
  };
  visit(sf);
  let out = text;
  for (const [pos, end] of ranges) out = out.slice(0, pos) + blank(out.slice(pos, end)) + out.slice(end);
  return out;
}

// Text below 12px, or whose size can't be resolved (px absent then): { line, value, px?, token? }.
// Case-insensitive; a value may sit on the line after its property; comments don't count.
// `name` picks how comments are read (.css by default).
export function smallText(text, name) {
  const t = stripComments(text, name).toLowerCase();
  const lineOf = lineFinder(t);
  const out = [];
  const judge = (at, value, extra) => {
    if (!value) return;
    const r = measure(value);
    if (r.ok || (r.px !== undefined && r.px >= MIN_PX)) return;
    out.push({ at, line: lineOf(at), value, ...(r.px !== undefined ? { px: r.px } : {}), ...extra });
  };
  // CSS, HTML/SVG attributes, JS styles: font-size: / fontSize: / .fontSize = / font-size="…",
  // quoted keys ('font-size': / "fontSize":), brackets (style["fontSize"] =) and JSX (fontSize={11})
  const SET = String.raw`['"\x60]?\s*\]?\s*(?::|=(?!=))`;
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\w$-])font-?size` + SET, 'g'))) judge(m.index, readValue(t, m.index + m[0].length, false));
  for (const m of t.matchAll(/setproperty\(\s*['"`]font-size['"`]\s*,/g)) judge(m.index, readValue(t, m.index + m[0].length, false));
  // font shorthand (CSS, ctx.font = …), the size after any style/variant/weight/stretch keywords
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\w$-])font` + SET, 'g'))) {
    const v = readValue(t, m.index + m[0].length, true);
    if (v) judge(m.index, shorthandSize(v));
  }
  // Tailwind arbitrary values, any variant prefix: text-[…], font-[…], with or without length:
  for (const m of t.matchAll(/(?<![\w-])(text|font)-\[([^\]\s]+)\]/g)) {
    let v = m[2];
    const hinted = v.startsWith('length:');
    if (hinted) v = v.slice(7);
    else if (/^[a-z-]+:/.test(v)) continue; // color:, family-name:, …
    const isSize = hinted || MATH.test(v) || (m[1] === 'text' ? /^[+-]?(\d|\.\d)/.test(v) : NUMBER_UNIT.test(v));
    if (isSize) judge(m.index, v);
  }
  // Tailwind v4 text-(length:--x): a size from a variable, which can't be verified (text-(--x) is a colour)
  for (const m of t.matchAll(/(?<![\w-])(text|font)-\(length:([^)\s]+)\)/g)) judge(m.index, m[2]);
  // Theme tokens (Tailwind v4 --text-*): a token below 12px makes its text-* class too small.
  // Only lengths and calc()-style values are sizes; --text-muted: #666 is a colour.
  for (const m of t.matchAll(/(?<![\w-])--text-([a-z0-9]+(?:-[a-z0-9]+)*)\s*:/g)) {
    const v = readValue(t, m.index + m[0].length, false);
    if (/^[+-]?(\d|\.\d)/.test(v) || MATH.test(v)) judge(m.index, v, { token: m[1] });
  }
  return out.sort((a, b) => a.at - b.at).map(({ at, ...f }) => f);
}

const noReason = (e) => typeof e.why !== 'string' || !e.why.trim();

export function check({ coverage = false, files, us, extOnly, dropped, allow = { dynamicCalls: [], sizes: [] } }) {
  const errors = [];
  const known = new Set(us.map(pairKey));
  const listed = new Set(extOnly.map(pairKey));
  const used = new Set();

  // The lists themselves: a reason each, no repeats; extension-only pairs are new, dropped ones are old.
  const validate = (list, name, isUs) => {
    const seen = new Set();
    for (const p of list) {
      if (noReason(p)) errors.push(`scripts/strings/${name}: ${show(p)} needs a reason (why)`);
      if (seen.has(pairKey(p))) errors.push(`scripts/strings/${name} lists ${show(p)} twice`);
      seen.add(pairKey(p));
      if (isUs && known.has(pairKey(p))) errors.push(`scripts/strings/${name}: ${show(p)} is a userscript pair — remove it`);
      if (!isUs && !known.has(pairKey(p))) errors.push(`scripts/strings/${name}: ${show(p)} is not a userscript pair`);
    }
  };
  validate(extOnly, 'extension-only.mjs', true);
  validate(dropped, 'dropped.mjs', false);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  for (const e of allow.dynamicCalls) if (noReason(e)) errors.push(`scripts/ui-allow.mjs dynamicCalls entry needs a reason (why): ${e.file}:${e.line} ${e.call}`);
  for (const e of allow.sizes) if (noReason(e)) errors.push(`scripts/ui-allow.mjs sizes entry needs a reason (why): ${e.file}:${e.line} ${e.value}`);
  const usedAllow = new Set();

  const scripts = files.filter((f) => SCRIPT.test(f.path));
  const calls = parseCalls(scripts);
  const sizes = new Map(files.map((f) => [f.path, smallText(f.text, f.path)]));
  const tokens = new Map(); // theme token → its definition, when below 12px or unknown
  for (const [path, found] of sizes) for (const s of found) if (s.token) tokens.set(s.token, { ...s, path });

  for (const f of files) {
    const c = calls.get(f.path);
    if (c) {
      for (const e of c.syntax) errors.push(`${f.path}:${e.line} syntax error: ${e.message}`);
      for (const r of c.refs) errors.push(`${f.path}:${r.line} L is used other than as a direct call L('…', '…'): ${r.text}`);
      for (const p of c.pairs) {
        used.add(pairKey(p));
        if (!known.has(pairKey(p)) && !listed.has(pairKey(p))) {
          errors.push(`${f.path}:${p.line} not in the userscript: ${show(p)} — add it to scripts/strings/extension-only.mjs with a reason, or use the userscript's pair`);
        }
      }
      for (const d of c.dynamic) {
        const ok = allow.dynamicCalls.find((e) => e.file === f.path && e.line === d.line && norm(e.call) === d.text);
        if (ok) usedAllow.add(ok);
        else errors.push(`${f.path}:${d.line} L() needs two string literals: ${d.text}`);
      }
    }
    for (const s of sizes.get(f.path)) {
      const ok = allow.sizes.find((e) => e.file === f.path && e.line === s.line && e.value.toLowerCase() === s.value);
      if (ok) { usedAllow.add(ok); continue; }
      const size = /^[\d.]+(px)?$/.test(s.value) ? `${s.px}px` : `${s.value} (${s.px}px)`;
      errors.push(s.px !== undefined
        ? `${f.path}:${s.line} text is ${size}: the minimum is ${MIN_PX}px`
        : `${f.path}:${s.line} text size ${s.value} cannot be verified as at least ${MIN_PX}px — use a fixed size, or list it in scripts/ui-allow.mjs sizes with a reason`);
    }
    if (tokens.size) {
      const t = stripComments(f.text, f.path).toLowerCase();
      const lineOf = lineFinder(t);
      for (const m of t.matchAll(/(?<![\w-])text-([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-])/g)) {
        const def = tokens.get(m[1]);
        if (def) errors.push(`${f.path}:${lineOf(m.index)} text-${m[1]} is ${def.px !== undefined ? `${def.px}px` : def.value} (${def.path}): the minimum is ${MIN_PX}px`);
      }
    }
  }
  for (const e of [...allow.dynamicCalls, ...allow.sizes]) {
    if (usedAllow.has(e)) continue;
    errors.push(e.call !== undefined
      ? `scripts/ui-allow.mjs dynamicCalls lists a call no source has: ${e.file}:${e.line} ${e.call}`
      : `scripts/ui-allow.mjs sizes lists a size no source has: ${e.file}:${e.line} ${e.value}`);
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
  const us = userscriptPairs();
  const errors = [...canary(us), ...check({
    coverage: process.argv.includes('--coverage'),
    files: sourceFiles(),
    us,
    extOnly: await load('extension-only.mjs'),
    dropped: await load('dropped.mjs'),
    allow: (await import(pathToFileURL(join(ROOT, 'scripts/ui-allow.mjs')).href)).default,
  })];
  for (const e of errors) console.error(e);
  console.log(errors.length ? `ui-check: ${errors.length} problem(s)` : 'ui-check: ok');
  process.exit(errors.length ? 1 : 0);
}
