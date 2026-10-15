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
// (node:module stripTypeScriptTypes), whitespace outside literals, blank lines, comments
// and a leading `export`. Literals (string, template, regex) are compared verbatim.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'd15ef87caaddb7a6d3187d2851b83a484c4bb9e7'; // userscript v4.27.1
let SRC;
const src = () => (SRC ??= execFileSync('git', ['show', `${PIN}:youtube-upload-presets.user.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n'));

const load = async (name) => (await import(pathToFileURL(join(ROOT, 'scripts/port', name + '.mjs')).href)).default;

// Normal form of a JS source text: one entry per logical line, as { text, line } where
// `line` is the source line (via `lineMap[i]` for text line i, else i + 1) the entry starts on.
// Comments are dropped and whitespace outside literals is erased (kept as one space only
// between two word characters, or between `+ +` / `- -`), a leading `export` is removed.
// String, template and regex literals are copied verbatim, so their whitespace, blank lines
// and `//` lines all count. Regex-vs-division is decided by the previous token (good enough
// for this codebase).
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do', 'yield', 'await']);
export function normalize(input, lineMap) {
  const t = input.replace(/\r\n?/g, '\n');
  const n = t.length;
  const lineAt = new Uint32Array(n + 1); // 0-based text line of each index
  for (let k = 0, ln = 0; k < n; k++) { lineAt[k] = ln; if (t[k] === '\n') ln++; }
  const srcLine = (idx) => lineMap?.[lineAt[Math.min(idx, n - 1)]] ?? lineAt[Math.min(idx, n - 1)] + 1;
  const out = [];
  let i = 0, buf = '', bufLine = 0, space = false, lastChar = '', lastWord = '', nested = 0;

  const flush = () => {
    if (buf) out.push({ text: buf.replace(/^export (?=const |let |function|async)/, ''), line: bufLine });
    buf = ''; space = false;
  };
  const put = (s, at, literal = false) => {
    if (!buf) bufLine = srcLine(at);
    else if (space && ((/[\w$]$/.test(buf) && /^[\w$]/.test(s)) || (/[+-]$/.test(buf) && buf.slice(-1) === s[0]))) buf += ' ';
    space = false;
    buf += s;
    if (literal) { lastChar = '"'; lastWord = ''; return; }
    lastChar = s.slice(-1);
    lastWord = /[\w$]/.test(lastChar) ? lastWord + s : '';
  };
  const regexAllowed = () => !lastChar || '([{,;:=!&|?+-*%<>~^'.includes(lastChar) || REGEX_AFTER_WORD.has(lastWord);
  const quoted = (q) => { // '…' or "…" starting at i; stops at an unescaped newline too
    let j = i + 1;
    while (j < n && t[j] !== q && t[j] !== '\n') j += t[j] === '\\' ? 2 : 1;
    return t.slice(i, (j = Math.min(j + (t[j] === q ? 1 : 0), n)));
  };
  const regex = () => { // /…/flags starting at i, or null when it does not close on this line
    let j = i + 1, cls = false;
    for (; j < n && t[j] !== '\n'; j++) {
      if (t[j] === '\\') j++;
      else if (t[j] === '[') cls = true;
      else if (t[j] === ']') cls = false;
      else if (t[j] === '/' && !cls) { while (/[a-z]/i.test(t[j + 1] ?? '')) j++; return t.slice(i, j + 1); }
    }
    return null;
  };

  function template() { // `…` starting at i, with ${…} holding code
    const at = i;
    let s = '`';
    i++;
    while (i < n && t[i] !== '`') {
      if (t[i] === '$' && t[i + 1] === '{') {
        s += '${'; i += 2;
        put(s, at, true); s = '';
        nested++; code(true); nested--;
      } else if (t[i] === '\\') { s += t.slice(i, i + 2); i += 2; }
      else s += t[i++];
    }
    put(s + (i < n ? '`' : ''), at, true);
    i++;
  }
  function code(inTemplate) { // until the `}` closing a template's ${ (inTemplate), else end of input
    let depth = 0;
    while (i < n) {
      const c = t[i], d = t[i + 1];
      if (c === '\n') { if (nested) put('\n', i); else flush(); i++; }
      else if (/\s/.test(c)) { space = true; i++; }
      else if (c === '/' && d === '/') { while (i < n && t[i] !== '\n') i++; }
      else if (c === '/' && d === '*') { const j = t.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; space = true; }
      else if (c === "'" || c === '"') { const s = quoted(c); put(s, i, true); i += s.length; }
      else if (c === '`') template();
      else if (c === '/' && regexAllowed() && regex()) { const s = regex(); put(s, i, true); i += s.length; }
      else {
        if (inTemplate && c === '{') depth++;
        else if (inTemplate && c === '}') {
          if (!depth) { put('}', i, true); i++; return; }
          depth--;
        }
        put(c, i); i++;
      }
    }
  }
  code(false);
  flush();
  return out;
}

// Compares two source texts after normalisation. Maps give the original line number of each
// text line (expectedMap: userscript lines; portedMap: lines of `file`).
export function compareText(expectedText, portedText, { expectedMap, portedMap, file = 'module' } = {}) {
  const a = normalize(expectedText, expectedMap), b = normalize(portedText, portedMap);
  const errors = [];
  if (!a.length) errors.push('expected side is empty: the userscript region normalises to zero lines (wrong line range?)');
  const at = [...Array(Math.max(a.length, b.length)).keys()].find((i) => a[i]?.text !== b[i]?.text);
  if (at !== undefined) {
    const from = Math.max(0, at - 2);
    const show = (xs) => xs.slice(from, at + 3).map((l, k) => `   ${from + k === at ? '>' : ' '} ${l ? `L${l.line}: ${l.text}` : '<end>'}`).join('\n');
    const where = [a[at] && `userscript line ${a[at].line}`, b[at] && `${file} line ${b[at].line}`].filter(Boolean).join(', ');
    errors.push(`first difference at normalized line ${at + 1} (${where})\n  expected (userscript + subs):\n${show(a)}\n  ported (${file}, types stripped):\n${show(b)}`);
  }
  return { a, b, errors };
}

// Userscript lines with `replaceLines` applied; replaced spans keep their numbering.
function sourceLines(cfg) {
  const lines = [...src()];
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

// Userscript text of the config's regions with subs applied, plus the userscript line of
// each text line (null when a sub changed the number of lines).
function expected(cfg) {
  const src = sourceLines(cfg);
  const parts = [], map = [];
  for (const range of cfg.regions) {
    const [from, to] = range.split('-').map(Number);
    for (let k = from; k <= to; k++) {
      if (src[k - 1] == null) continue;
      for (const part of src[k - 1].split('\n')) { parts.push(part); map.push(k); }
    }
  }
  let text = parts.join('\n');
  const errors = [];
  for (const [i, [from, to, count]] of (cfg.subs ?? []).entries()) {
    const found = text.split(from).length - 1;
    if (found !== count) errors.push(`subs[${i}] ${JSON.stringify(from)}: expected ${count}, found ${found}`);
    text = text.split(from).join(to);
  }
  return { text, map: text.split('\n').length === map.length ? map : undefined, errors };
}

function ported(file) {
  const js = stripTypeScriptTypes(readFileSync(join(ROOT, file), 'utf8'), { mode: 'strip' });
  const out = [], map = [];
  let inside = false;
  for (const [k, l] of js.split('\n').entries()) {
    const t = l.trim();
    if (t === '// @port-begin') {
      if (inside) throw new Error(`${file}: nested @port-begin`);
      inside = true;
    } else if (t === '// @port-end') {
      if (!inside) throw new Error(`${file}: @port-end without @port-begin`);
      inside = false;
    } else if (inside) { out.push(l); map.push(k + 1); }
  }
  if (inside) throw new Error(`${file}: missing @port-end`);
  if (!out.length) throw new Error(`${file}: no @port-begin / @port-end block`);
  return { text: out.join('\n'), map };
}

async function check(name) {
  let cfg, exp;
  try {
    cfg = await load(name);
    exp = expected(cfg);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    return false;
  }
  const errors = [...exp.errors];
  let count = 0, fatal;
  try {
    const mod = ported(cfg.file);
    const r = compareText(exp.text, mod.text, { expectedMap: exp.map, portedMap: mod.map, file: cfg.file });
    errors.push(...r.errors);
    count = r.a.length;
  } catch (e) {
    fatal = e.message;
  }
  if (fatal) console.log(`FAIL ${name}: ${fatal}`);
  else console.log(`${errors.length ? 'FAIL' : 'ok  '} ${name} (${cfg.file}, ${count} lines)`);
  for (const e of errors) console.log('  ' + e);
  return !fatal && errors.length === 0;
}

if (!process.argv[1] || import.meta.url !== pathToFileURL(process.argv[1]).href) {
  // imported (tests): export only
} else if (process.argv[2] === '--print') {
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
