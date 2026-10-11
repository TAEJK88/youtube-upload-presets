// Everything that must be true of the zip the team installs. Builds, zips and looks; publishes
// nothing. `npm run release:check` — run it on a clean tree, at the commit that will be tagged.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PERMS = ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'];
const HOSTS = ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'];
const WAR = [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }];
const NEEDED = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js'];
const BANNED = /(\.map$|\.test\.|^tests\/|(^|\/)\.[^/]+(\/|$)|^node_modules\/|^stats\.html$|\.pem$|\.ts$|\.tsx$)/;
const ICONS = ['16', '32', '48', '128'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// opts.key / opts.icons: what this build is meant to have (calls 5 and 6). Both directions are
// checked: a key or icons that should be there and aren't, and ones that shouldn't and are.
export function inspect(files, manifest, pkgVersion, { key = false, icons = false } = {}) {
  const out = [];
  if (manifest.version !== pkgVersion) out.push(`manifest version ${manifest.version} is not package.json's ${pkgVersion}`);
  if (!same(manifest.permissions, PERMS)) out.push(`permissions are ${JSON.stringify(manifest.permissions)}, expected ${JSON.stringify(PERMS)}`);
  if (!same(manifest.host_permissions, HOSTS)) out.push(`host_permissions are ${JSON.stringify(manifest.host_permissions)}, expected ${JSON.stringify(HOSTS)}`);
  if (!same(manifest.web_accessible_resources, WAR)) out.push(`web_accessible_resources are ${JSON.stringify(manifest.web_accessible_resources)}, expected ${JSON.stringify(WAR)}`);
  if (key !== (typeof manifest.key === 'string')) out.push(key ? 'the manifest has no key: the extension id would follow the folder' : 'the manifest has a key that wxt.config.ts does not set');
  const sizes = Object.keys(manifest.icons ?? {}).sort((a, b) => a - b);
  if (icons && !same(sizes, ICONS)) out.push(`manifest icons are ${JSON.stringify(sizes)}, expected ${JSON.stringify(ICONS)}`);
  if (icons) for (const s of ICONS) if (!files.includes(`icon/${s}.png`)) out.push(`icon/${s}.png is missing from the build`);
  if (!icons && sizes.length) out.push('the manifest has icons but public/icon/ is not complete');
  for (const f of files) if (BANNED.test(f)) out.push(`${f} must not be in the build`);
  for (const f of NEEDED) if (!files.includes(f)) out.push(`${f} is missing from the build`);
  return out;
}

// One hash for what is inside the build, whatever the zip's timestamps: the sha256 of every
// file, by path. Two builds with the same content hash are the same extension.
export function contentHash(entries) {
  const lines = [...entries].sort((a, b) => (a.path < b.path ? -1 : 1)).map((e) => `${e.sha256}  ${e.path}`);
  return { lines, hash: createHash('sha256').update(lines.join('\n')).digest('hex') };
}

const walk = (dir, root = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split(sep).join('/')]);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: EXT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function main() {
  const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf8'));
  const problems = [];
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no', '--', '.']).trim();
  if (dirty) problems.push('the working tree has uncommitted changes under extension/:\n' + dirty);
  // public/ is copied into the build as it is: an untracked file there would ship.
  const stray = run('git', ['ls-files', '--others', '--exclude-standard', '--', 'public']).trim();
  if (stray) problems.push('untracked files under public/ would be zipped:\n' + stray);
  run('npx', ['wxt', 'zip']); // builds first
  const out = join(EXT, '.output/chrome-mv3');
  const zip = join(EXT, `.output/${pkg.name}-${pkg.version}-chrome.zip`);
  const files = walk(out).sort();
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  problems.push(...inspect(files, manifest, pkg.version, {
    key: /^\s*key:/m.test(readFileSync(join(EXT, 'wxt.config.ts'), 'utf8')), // a line of its own: not `suggested_key:`
    icons: ICONS.every((s) => existsSync(join(EXT, `public/icon/${s}.png`))),
  }));
  const zipped = run('unzip', ['-Z1', zip]).split('\n').filter((l) => l && !l.endsWith('/')).sort();
  if (!same(zipped, files)) problems.push('the zip does not hold exactly the build folder\'s files');
  const log = join(EXT, 'CHANGELOG.md');
  if (!existsSync(log) || !readFileSync(log, 'utf8').includes(`## ${pkg.version} `)) problems.push(`CHANGELOG.md has no "## ${pkg.version} " section`);
  try { run('node', ['scripts/parity-check.mjs', '--release']); } catch { problems.push('parity-check --release failed (see above)'); }
  if (problems.length) {
    console.error(`release-check: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  const content = contentHash(files.map((f) => ({ path: f, sha256: sha(join(out, f)) })));
  writeFileSync(join(EXT, '.output/release-files.txt'), content.lines.join('\n') + '\n');
  console.log([
    `release-check: ok — ${files.length} files, ${(statSync(zip).size / 1024).toFixed(0)} KB`,
    `zip:        ${zip}`,
    `zip sha256: ${sha(zip)}   (this zip file)`,
    `content:    ${content.hash}   (the files inside, by path: the same for two builds of the same source; the list is .output/release-files.txt)`,
    `commit:     ${run('git', ['rev-parse', 'HEAD']).trim()}`,
    '',
    'To publish (the owner runs these; nothing here does):',
    `  git tag v${pkg.version} && git push --dry-run origin v${pkg.version} && git push origin v${pkg.version}`,
    `  gh release create v${pkg.version} "${zip}" --draft --title "v${pkg.version}" --notes-file <the CHANGELOG section saved to a file>`,
    '  then read the draft on GitHub and press Publish.',
  ].join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
