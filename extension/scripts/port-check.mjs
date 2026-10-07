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
