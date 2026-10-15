// Everything that must be true of the zip the team installs. Builds, zips and looks; publishes
// nothing. `npm run release:check` — run it on a clean tree, at the commit that will be tagged.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The manifest the release has (D31), written out here and never read from the build under
// test. A field that changes on purpose changes here in the same commit.
const EXPECT = {
  manifest_version: 3,
  name: 'YouTube Upload Presets',
  description: 'Bulk-upload videos to YouTube Studio with presets and scheduling, plus scan and trim copyright-claimed segments',
  permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'],
  host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
  action: { default_title: 'YouTube Upload Presets' },
  commands: { _execute_action: { suggested_key: { default: 'Alt+P' } } },
  web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
  background: { service_worker: 'background.js' },
  side_panel: { default_path: 'sidepanel.html' },
  content_scripts: [
    { matches: ['https://www.youtube.com/*'], js: ['content-scripts/invite.js'] },
    { matches: ['https://studio.youtube.com/*'], run_at: 'document_start', js: ['content-scripts/studio-main.js'], world: 'MAIN' },
    { matches: ['https://studio.youtube.com/*'], js: ['content-scripts/studio.js'] },
  ],
};
// Every top-level field of the manifest; `key` and `icons` join only when this build is meant to have them.
const FIELDS = ['version', ...Object.keys(EXPECT)];
const NEEDED = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'allow.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js'];
// What else a build holds: Vite's hashed scripts, and the stylesheet and font files. Nothing
// else is expected, so anything else is a problem (a deny-list would always be one name behind).
const BUILT = [/^chunks\/[^/.]+\.js$/, /^assets\/[^/.]+\.(css|woff2?)$/];
const ICONS = Object.fromEntries(['16', '32', '48', '128'].map((s) => [s, `icon/${s}.png`]));
// Git-ignored on purpose, and no source of the build: packages, build output, WXT's generated
// types, and two tools' own folders. Any other ignored file under extension/ could be built.
const NOT_SOURCE = ['node_modules', '.output', '.wxt', '.vitest', '.claude'];
// The same whatever order an object's keys come in; a list's order counts.
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const same = (a, b) => canon(a) === canon(b);

// opts.key / opts.icons: what this build is meant to have (calls 5 and 6). Both directions are
// checked: a key or icons that should be there and aren't, and ones that shouldn't and are.
export function inspect(files, manifest, pkgVersion, { key = false, icons = false } = {}) {
  const out = [];
  if (manifest.version !== pkgVersion) out.push(`manifest version ${manifest.version} is not package.json's ${pkgVersion}`);
  for (const k of FIELDS) if (!(k in manifest)) out.push(`the manifest has no ${k}`);
  for (const k of Object.keys(manifest)) if (!FIELDS.includes(k) && k !== 'key' && k !== 'icons') out.push(`the manifest has ${k}, which the release does not: ${JSON.stringify(manifest[k])}`);
  for (const [k, v] of Object.entries(EXPECT)) if (k in manifest && !same(manifest[k], v)) out.push(`manifest ${k} is ${JSON.stringify(manifest[k])}, expected ${JSON.stringify(v)}`);
  if (key !== (typeof manifest['key'] === 'string')) out.push(key ? 'the manifest has no key: the extension id would follow the folder' : 'the manifest has a key that wxt.config.ts does not set');
  if (icons && !same(manifest.icons ?? {}, ICONS)) out.push(`manifest icons are ${JSON.stringify(manifest.icons ?? {})}, expected ${JSON.stringify(ICONS)}`);
  if (!icons && manifest.icons !== undefined) out.push('the manifest has icons but public/icon/ is not complete');
  const needed = icons ? [...NEEDED, ...Object.values(ICONS)] : NEEDED;
  for (const f of files) if (!needed.includes(f) && !BUILT.some((re) => re.test(f))) out.push(`${f} must not be in the build`);
  for (const f of needed) if (!files.includes(f)) out.push(`${f} is missing from the build`);
  return out;
}

// The build must be of a commit, and of nothing else: WXT compiles every file under
// entrypoints/ and modules/ and copies every file under public/, whether git tracks it or not.
// `git(args)` runs git in extension/ and returns what it prints.
export function treeProblems(git) {
  const out = [];
  const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude).claude', ':(exclude).vitest']).trimEnd();
  if (dirty) out.push('uncommitted or untracked files under extension/ (commit or remove them):\n' + dirty);
  const ignored = git(['ls-files', '--others', '--ignored', '--exclude-standard', '--', '.', ...NOT_SOURCE.map((d) => `:(exclude)${d}`)]).trimEnd();
  if (ignored) out.push('git-ignored files under extension/ (remove them):\n' + ignored);
  return out;
}

// A real heading line `## <version> …`: not a deeper heading, not text inside a code block.
// A block ends at a line of its own fence character, at least as long, with nothing after it.
export function hasSection(changelog, version) {
  let fence = '';
  for (const line of changelog.split(/\r?\n/)) {
    const [, marks, rest] = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line) ?? [];
    if (fence) { if (marks?.startsWith(fence) && !rest.trim()) fence = ''; }
    else if (marks) fence = marks;
    else if (line.startsWith(`## ${version} `)) return true;
  }
  return false;
}

// The `dependencies` of package.json that public/THIRD-PARTY-NOTICES.txt does not list. Only
// the list at the top of that file counts (the licence texts below the first ===== rule are
// full of ordinary words): a line `<name> <version>`, or `(<name>)` for a package that is
// named there without a version (the font), or the line that covers every @radix-ui/* package.
// The packages those packages bring in are still checked by hand (README "Licences").
export function unlisted(dependencies, notices) {
  const list = notices.split(/^={5,}$/m)[0];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const listed = (name, version) => new RegExp(`^\\s*${esc(name)} ${esc(version)}(\\s|$)`, 'm').test(list) || list.includes(`(${name})`);
  return Object.entries(dependencies).filter(([name, version]) => !listed(name, version) && !(name.startsWith('@radix-ui/') && list.includes('@radix-ui/*'))).map(([name]) => name);
}

// One hash for what is inside the build, whatever the zip's timestamps: the sha256 of every
// file, by path. Two builds with the same content hash are the same extension. The hash is
// taken over the pairs as JSON, so no path (one with a line break, say) can read as two files.
export function contentHash(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.sha256 < b.sha256 ? -1 : 1));
  return {
    lines: sorted.map((e) => `${e.sha256}  ${e.path}`),
    hash: createHash('sha256').update(JSON.stringify(sorted.map((e) => [e.path, e.sha256]))).digest('hex'),
  };
}

const walk = (dir, root = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split(sep).join('/')]);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: EXT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const hashes = (dir) => walk(dir).map((f) => ({ path: f, sha256: sha(join(dir, f)) }));

function main() {
  const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf8'));
  const problems = treeProblems((args) => run('git', args));
  const notNamed = unlisted(pkg.dependencies, readFileSync(join(EXT, 'public/THIRD-PARTY-NOTICES.txt'), 'utf8'));
  if (notNamed.length) problems.push(`public/THIRD-PARTY-NOTICES.txt does not list ${notNamed.join(', ')} (README "Licences")`);
  run('npx', ['wxt', 'zip']); // builds first
  const out = join(EXT, '.output/chrome-mv3');
  const zip = join(EXT, `.output/${pkg.name}-${pkg.version}-chrome.zip`);
  const files = walk(out).sort();
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  problems.push(...inspect(files, manifest, pkg.version, {
    key: /^\s*key:/m.test(readFileSync(join(EXT, 'wxt.config.ts'), 'utf8')), // a line of its own: not `suggested_key:`
    icons: Object.values(ICONS).every((f) => existsSync(join(EXT, 'public', f))),
  }));
  const zipped = run('unzip', ['-Z1', zip]).split('\n').filter((l) => l && !l.endsWith('/')).sort();
  if (!same(zipped, files)) problems.push('the zip does not hold exactly the build folder\'s files');
  // The content hash is of the zip's own entries, unpacked: what ships, not what it was made from.
  const unpacked = mkdtempSync(join(tmpdir(), 'ytup-release-'));
  let content;
  try {
    run('unzip', ['-q', zip, '-d', unpacked]);
    content = contentHash(hashes(unpacked));
  } finally { rmSync(unpacked, { recursive: true, force: true }); }
  if (!same(content.lines, contentHash(hashes(out)).lines)) problems.push('a file in the zip is not, byte for byte, the build folder\'s');
  const log = join(EXT, 'CHANGELOG.md');
  if (!existsSync(log) || !hasSection(readFileSync(log, 'utf8'), pkg.version)) problems.push(`CHANGELOG.md has no "## ${pkg.version} " section`);
  try { run('node', ['scripts/parity-check.mjs', '--release']); } catch { problems.push('parity-check --release failed (see above)'); }
  if (problems.length) {
    console.error(`release-check: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  writeFileSync(join(EXT, '.output/release-files.txt'), content.lines.join('\n') + '\n');
  console.log([
    `release-check: ok — ${files.length} files, ${(statSync(zip).size / 1024).toFixed(0)} KB`,
    `zip:        ${zip}`,
    `zip sha256: ${sha(zip)}   (this zip file)`,
    `content:    ${content.hash}   (the files inside the zip, by path: the same for two builds of the same source; the list is .output/release-files.txt)`,
    `commit:     ${run('git', ['rev-parse', 'HEAD']).trim()}`,
    '',
    'To publish (the owner runs these; nothing here does):',
    `  git tag v${pkg.version} && git push --dry-run origin v${pkg.version} && git push origin v${pkg.version}`,
    `  gh release create v${pkg.version} "${zip}" --draft --title "v${pkg.version}" --notes-file <the CHANGELOG section saved to a file>`,
    '  then read the draft on GitHub and press Publish.',
  ].join('\n'));
}

// realpath: started through a symlinked path, the two would differ and nothing would run.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
