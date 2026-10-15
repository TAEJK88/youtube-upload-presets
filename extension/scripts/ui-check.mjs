// Two promises the side panel makes, checked:
// 1. Strings: every L('ไทย', 'English') call in shipping code is two string literals, so every
//    pair can be read (tests/panel-i18n.test.tsx renders them in Thai).
// 2. No style in the extension sets text below 12px: CSS font-size / font shorthand in any unit,
//    Tailwind text-[…] / font-[…] / text-(length:…) and --text-* theme tokens, inline JS and JSX
//    fontSize (quoted keys and brackets too). Comments are ignored. Sizes it can't resolve (calc,
//    var, vw, small keywords…) fail unless scripts/ui-allow.mjs lists them by file and line.
// Only the L helper of lib/i18n.ts is checked; any other L-style helper is out of scope.
// Every L( call in shipping code must be two string literals, or be listed in scripts/ui-allow.mjs.
// L itself may only be called directly: an alias, a member access (i18n.L, i18n['L'], i18n[`L`]),
// a tagged template or any other use of the name fails, and so does importing lib/i18n as a
// namespace (import * as / export * as), importing it dynamically (import(), require()) or
// indexing one of its bindings with a computed key, so no string can reach the UI around the
// check. A script with a syntax error fails. Scripts are parsed in process with @babel/parser
// (TypeScript and JSX by extension, plain JS otherwise), so comments and strings are
// never mistaken for calls. CSS and HTML comments are found by a small tokenizer that skips
// strings, url() and attribute values.
// Scanned: every top-level directory except node_modules, scripts, tests and dot-directories
// (.output, .wxt…); below the top, node_modules and *.test.* files are skipped anywhere.
//
//   node scripts/ui-check.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as babelParse } from '@babel/parser';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_TOP = new Set(['node_modules', 'scripts', 'tests']); // and every dot-directory
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|css|html|svg)$/;
const SCRIPT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const I18N = 'lib/i18n.ts'; // where L is defined
const MIN_PX = 12;

const slash = (p) => p.replaceAll('\\', '/'); // Windows separators

// JSX only in .jsx/.tsx; .cjs is a script, .js a script or a module by its content.
function parse(path, text) {
  const plugins = /\.tsx$/.test(path) ? ['typescript', 'jsx'] : /\.[mc]?ts$/.test(path) ? ['typescript'] : /\.jsx$/.test(path) ? ['jsx'] : [];
  const sourceType = path.endsWith('.cjs') ? 'script' : path.endsWith('.js') ? 'unambiguous' : 'module';
  return babelParse(text, { sourceType, plugins, errorRecovery: false, createParenthesizedExpressions: true });
}

// Visit every AST node with its ancestors (nearest first), in source order.
const NOT_CHILDREN = new Set(['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens']);
function walk(node, visit, parents = []) {
  visit(node, parents);
  const next = [node, ...parents];
  for (const k of Object.keys(node)) {
    if (NOT_CHILDREN.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, next); }
    else if (v && typeof v.type === 'string') walk(v, visit, next);
  }
}

// A string literal, or a template literal without ${}: its value; otherwise null.
const plain = (n) => n?.type === 'StringLiteral' ? n.value
  : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null;

// Does an import specifier name lib/i18n? @/ ~/ @@/ ~~/ are the extension root (WXT's aliases).
function isI18n(spec, from) {
  if (typeof spec !== 'string') return false;
  const alias = /^(@@|~~|@|~)\//.exec(spec);
  let p;
  if (alias) p = spec.slice(alias[0].length);
  else if (spec.startsWith('.')) p = posix.join(posix.dirname(from), spec);
  else return false;
  return posix.normalize(p).replace(/\.[mc]?[jt]s$/, '').replace(/\/index$/, '') === 'lib/i18n';
}

const namesL = (n) => ((n.type === 'Identifier' || n.type === 'JSXIdentifier') && n.name === 'L') || plain(n) === 'L';

// Is this mention of the name L allowed? Only as the callee of a call, in an unaliased import
// specifier, or as the declaration in lib/i18n.ts. A string 'L' (or `L`) counts where it names a
// binding: a computed member, a destructuring key, an import/export name.
function allowedRef(n, [p, gp], path) {
  if (n.type === 'Identifier') {
    if ((p.type === 'CallExpression' || p.type === 'OptionalCallExpression') && p.callee === n) return true;
    if (p.type === 'ImportSpecifier' && p.imported.type === 'Identifier' && p.imported.name === 'L' && p.local.name === 'L') return true;
    return path === I18N && p.type === 'VariableDeclarator' && p.id === n;
  }
  if (n.type === 'JSXIdentifier') return p.type === 'JSXAttribute' && p.name === n;
  if ((p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.property === n) return false;
  if (p.type === 'ObjectProperty' && p.key === n && gp?.type === 'ObjectPattern') return false;
  return !/^(Import|Export)\w*Specifier$/.test(p.type);
}

const REF = "L is used other than as a direct call L('…', '…')";
const NAMESPACE = 'lib/i18n may only be imported by name (import { L } from …), not as a namespace or dynamically';
const INDEXED = 'a binding imported from lib/i18n is indexed with a computed key';

// Every L( call (callee the identifier L) in each file: pairs of two literals, and the calls that
// aren't; every other mention of L, and every namespace or dynamic import or computed index of
// lib/i18n (refs); and the syntax error. Template literals compare with every ${…} replaced by
// ${}, so a variable renamed in the rebuild still matches.
export function parseCalls(files) {
  const out = new Map();
  for (const f of files) {
    const path = slash(f.path);
    const res = { pairs: [], dynamic: [], refs: [], syntax: [] };
    out.set(f.path, res);
    let ast;
    try { ast = parse(path, f.text); } catch (e) {
      if (!e.loc) throw e;
      res.syntax.push({ line: e.loc.line, message: e.message.replace(/\s*\(\d+:\d+\)$/, '') });
      continue;
    }
    const lines = f.text.split('\n');
    const ref = (n, why) => {
      const line = n.loc.start.line;
      if (!res.refs.some((r) => r.line === line && r.why === why)) res.refs.push({ line, why, text: lines[line - 1].trim().replace(/\s+/g, ' ') });
    };
    const bound = new Set(); // the local names of everything imported from lib/i18n
    for (const s of ast.program.body) if (s.type === 'ImportDeclaration' && isI18n(s.source.value, path)) for (const sp of s.specifiers) bound.add(sp.local.name);
    walk(ast.program, (n, parents) => {
      const p = parents[0];
      if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && n.callee.type === 'Identifier' && n.callee.name === 'L') {
        const line = n.loc.start.line;
        const [a, b] = n.arguments.map(literal);
        if (n.arguments.length === 2 && a !== null && b !== null) res.pairs.push({ th: a, en: b, line });
        else res.dynamic.push({ line, text: f.text.slice(n.start, n.end).replace(/\s+/g, ' ') });
      }
      if (p && namesL(n) && !allowedRef(n, parents, path)) ref(n, REF);
      // import * as I / export * as I from lib/i18n; import('…/i18n'), require('…/i18n')
      if ((n.type === 'ImportNamespaceSpecifier' || n.type === 'ExportNamespaceSpecifier') && isI18n(p.source?.value, path)) ref(n, NAMESPACE);
      if (n.type === 'ImportExpression' && isI18n(plain(n.source), path)) ref(n, NAMESPACE);
      if (n.type === 'CallExpression' && (n.callee.type === 'Import' || (n.callee.type === 'Identifier' && n.callee.name === 'require'))
        && isI18n(plain(n.arguments[0]), path)) ref(n, NAMESPACE);
      // x[k] on a binding from lib/i18n: only a plain literal key is known not to reach L
      if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') && n.computed && n.object.type === 'Identifier'
        && bound.has(n.object.name) && plain(n.property) === null && n.property.type !== 'NumericLiteral') ref(n, INDEXED);
    });
    res.refs.sort((x, y) => x.line - y.line);
  }
  return out;
}

const literal = (n) => n.type === 'StringLiteral' ? n.value
  : n.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked).join('${}') : null;

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

const walkDir = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (!statSync(p).isDirectory()) return [p];
  return f === 'node_modules' ? [] : walkDir(p);
});
export const sourceFiles = (root = ROOT) =>
  readdirSync(root).filter((d) => !d.startsWith('.') && !SKIP_TOP.has(d) && statSync(join(root, d)).isDirectory())
    .flatMap((d) => walkDir(join(root, d)))
    .filter((p) => SOURCE.test(p) && !/\.d\.[mc]?ts$/.test(p) && !/\.test\./.test(basename(p)))
    .map((p) => ({ path: relative(root, p).split(sep).join('/'), text: readFileSync(p, 'utf8') }));

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

// CSS /* */ comments between `from` and `to`, skipping strings and unquoted url(…).
function cssComments(t, from, to, blank) {
  let i = from;
  while (i < to) {
    const c = t[i];
    if (c === '"' || c === "'") { // a string ends at its quote or an unescaped newline
      for (i++; i < to && t[i] !== c && t[i] !== '\n'; i++) if (t[i] === '\\') i++;
      i++;
    } else if (c === '/' && t[i + 1] === '*') {
      const e = t.indexOf('*/', i + 2);
      const stop = e < 0 || e + 2 > to ? to : e + 2;
      blank(i, stop);
      i = stop;
    } else if (/^url\(\s*[^\s"']/i.test(t.slice(i, i + 64)) && !/[\w-]/.test(t[i - 1] ?? '')) {
      const e = t.indexOf(')', i);
      i = e < 0 || e > to ? to : e + 1;
    } else i++;
  }
}

// HTML/SVG <!-- --> comments outside tags; inside a tag, quoted attribute values are skipped; a
// <style> element's text is CSS, a <script> element's is left alone.
function htmlComments(t, blank) {
  const lower = t.toLowerCase();
  let i = 0;
  while (i < t.length) {
    if (t.startsWith('<!--', i)) {
      const e = t.indexOf('-->', i + 4);
      const stop = e < 0 ? t.length : e + 3;
      blank(i, stop);
      i = stop;
    } else if (t[i] === '<' && /[a-z]/i.test(t[i + 1] ?? '')) {
      const name = /^[a-z][^\s/>]*/i.exec(t.slice(i + 1, i + 64))[0].toLowerCase();
      let j = i + 1;
      while (j < t.length && t[j] !== '>') {
        if (t[j] === '"' || t[j] === "'") { const e = t.indexOf(t[j], j + 1); j = e < 0 ? t.length : e + 1; } else j++;
      }
      i = j + 1;
      if (name === 'style' || name === 'script') {
        const close = lower.indexOf('</' + name, i);
        const stop = close < 0 ? t.length : close;
        if (name === 'style') cssComments(t, i, stop, blank);
        i = stop;
      }
    } else i++;
  }
}

// The text with its comments blanked out (newlines kept, so offsets and lines still match):
// scripts by @babel/parser (a script that doesn't parse is read whole; parseCalls reports it),
// CSS and HTML/SVG by the tokenizers above.
export function stripComments(text, name = 'source.css') {
  const out = text.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  if (SCRIPT.test(name)) {
    let ast = null;
    try { ast = parse(slash(name), text); } catch {}
    for (const c of ast?.comments ?? []) blank(c.start, c.end);
  } else if (/\.(html|svg)$/.test(name)) htmlComments(text, blank);
  else cssComments(text, 0, text.length, blank);
  return out.join('');
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

export function check({ files, allow = { dynamicCalls: [], sizes: [] } }) {
  const errors = [];
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
      for (const r of c.refs) errors.push(`${f.path}:${r.line} ${r.why}: ${r.text}`);
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
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = check({
    files: sourceFiles(),
    allow: (await import(pathToFileURL(join(ROOT, 'scripts/ui-allow.mjs')).href)).default,
  });
  for (const e of errors) console.error(e);
  console.log(errors.length ? `ui-check: ${errors.length} problem(s)` : 'ui-check: ok');
  process.exit(errors.length ? 1 : 0);
}
