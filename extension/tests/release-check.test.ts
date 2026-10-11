import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script
import { contentHash, hasSection, inspect, treeProblems, unlisted } from '../scripts/release-check.mjs';

// The manifest the build writes today, field for field.
const manifest = {
  manifest_version: 3, name: 'YouTube Upload Presets', description: 'Bulk-upload videos', version: '5.0.0',
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
const files = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js', 'chunks/a.js', 'assets/a.woff2', 'assets/a.woff', 'assets/a.css'];
const icons = ['icon/16.png', 'icon/32.png', 'icon/48.png', 'icon/128.png'];
const iconMap = { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' };
const problems = (m: object, f = files, opts?: object) => inspect(f, m, '5.0.0', opts).join('\n');

describe('release check', () => {
  it('passes the build as it is', () => expect(inspect(files, manifest, '5.0.0')).toEqual([]));
  it('names a version that differs from package.json', () =>
    expect(inspect(files, manifest, '5.0.1').join('\n')).toMatch(/version 5\.0\.0.*package\.json.*5\.0\.1/));
  it('names any permission, host or web-accessible file added or removed', () => {
    expect(problems({ ...manifest, permissions: [...manifest.permissions, 'tabs'] })).toMatch(/permissions/);
    expect(problems({ ...manifest, host_permissions: manifest.host_permissions.slice(0, 2) })).toMatch(/host_permissions/);
    expect(problems({ ...manifest, web_accessible_resources: [{ resources: ['file-bridge.html', 'debug.html'], matches: ['<all_urls>'] }] })).toMatch(/web_accessible/);
  });
  it('names any manifest field the release does not have', () => {
    const extra = {
      optional_permissions: ['tabs', 'history'], optional_host_permissions: ['<all_urls>'],
      content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval' https://example.com" },
      externally_connectable: { matches: ['<all_urls>'] }, oauth2: { client_id: 'x', scopes: [] },
      update_url: 'https://example.com/updates.xml', options_page: 'options.html',
    };
    for (const [k, v] of Object.entries(extra)) expect(problems({ ...manifest, [k]: v }), k).toContain(k);
  });
  it('names a manifest field that is gone', () => {
    for (const k of Object.keys(manifest)) {
      const { [k as keyof typeof manifest]: _, ...rest } = manifest;
      expect(problems(rest), k).toContain(k);
    }
  });
  it('names a changed manifest version, background, side panel, shortcut or toolbar button', () => {
    expect(problems({ ...manifest, manifest_version: 2 })).toMatch(/manifest_version/);
    expect(problems({ ...manifest, background: { service_worker: 'other.js' } })).toMatch(/background/);
    expect(problems({ ...manifest, background: { ...manifest.background, type: 'module' } })).toMatch(/background/);
    expect(problems({ ...manifest, side_panel: { default_path: 'debug.html' } })).toMatch(/side_panel/);
    expect(problems({ ...manifest, commands: { ...manifest.commands, other: { description: 'x' } } })).toMatch(/commands/);
    expect(problems({ ...manifest, action: { ...manifest.action, default_popup: 'debug.html' } })).toMatch(/action/);
  });
  it('names a content script that is wider, extra, gone, or no longer in the page\'s own world', () => {
    const [invite, main, studio] = manifest.content_scripts;
    const cases = [
      manifest.content_scripts.map((c) => ({ ...c, matches: ['<all_urls>'] })),
      [...manifest.content_scripts, { matches: ['<all_urls>'], js: ['content-scripts/evil.js'] }],
      [invite, studio],
      [invite, { ...main, world: undefined }, studio],
      [invite, { ...main, run_at: 'document_idle' }, studio],
      [invite, main, { ...studio, js: ['content-scripts/studio.js', 'chunks/a.js'] }],
      [invite, main, { ...studio, all_frames: true }],
    ];
    for (const c of cases) expect(problems({ ...manifest, content_scripts: c }), JSON.stringify(c)).toMatch(/content_scripts/);
  });
  it('does not mind the order of the keys inside a manifest field', () => {
    const [invite, , studio] = manifest.content_scripts;
    const reordered = { world: 'MAIN', js: ['content-scripts/studio-main.js'], run_at: 'document_start', matches: ['https://studio.youtube.com/*'] };
    expect(inspect(files, { ...manifest, content_scripts: [invite, reordered, studio] }, '5.0.0')).toEqual([]);
  });
  it('names a file that has no business in the zip', () => {
    const bad = ['chunks/a.js.map', '.vitest/x', '.claude/settings.json', 'tests/a.test.ts', 'stats.html', '.DS_Store', 'node_modules/x/index.js', 'ytup-extension-key.pem',
      // one for each kind of thing, alone: source, a test, a test folder
      'chunks/a.ts', 'chunks/a.tsx', 'chunks/a.test.js', 'tests/a.js',
      // the wrong case, a key under another name, nested folders, packages, pages and scripts nobody listed
      'sub/KEY.PEM', 'key.pem.bak', 'private.key', 'id_rsa', 'prod.env', 'sub/tests/a.js', 'a.spec.js', '__tests__/a.js', 'sub/node_modules/x/i.js',
      'sub/stats.html', 'a.crx', 'a.zip', 'package.json', 'README.md', 'evil.html', 'content-scripts/evil.js', 'Manifest.json', 'chunks/sub/a.js',
      'assets/a.svg', 'assets/a.js', 'backup/notes.txt', 'assets/.hidden', 'assets/.a.css', 'icon/16.png', 'icon/64.png'];
    for (const b of bad) expect(inspect([...files, b], manifest, '5.0.0').join('\n'), b).toContain(b);
  });
  it('names a file the extension needs that is not there', () => {
    for (const need of ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
      'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js']) {
      expect(inspect(files.filter((f) => f !== need), manifest, '5.0.0').join('\n'), need).toContain(need);
    }
  });
  it('the key: there when the config sets one, absent when it does not', () => {
    expect(inspect(files, manifest, '5.0.0', { key: true }).join('\n')).toMatch(/no key/);
    expect(inspect(files, { ...manifest, key: 'MIIB…' }, '5.0.0', { key: true })).toEqual([]);
    expect(inspect(files, { ...manifest, key: 'MIIB…' }, '5.0.0').join('\n')).toMatch(/has a key/);
  });
  it('the icons: all four sizes when public/icon/ has them, none otherwise', () => {
    const withIcons = { ...manifest, icons: iconMap };
    expect(inspect([...files, ...icons], withIcons, '5.0.0', { icons: true })).toEqual([]);
    expect(inspect(files, manifest, '5.0.0', { icons: true }).join('\n')).toMatch(/manifest icons/);
    expect(inspect([...files, 'icon/16.png'], { ...manifest, icons: { 16: 'icon/16.png' } }, '5.0.0').join('\n')).toMatch(/not complete/);
  });
  it('the icons: each size points at its own file, and each file is in the build', () => {
    const withIcons = { ...manifest, icons: iconMap };
    expect(problems({ ...manifest, icons: { ...iconMap, 48: 'assets/a.woff2' } }, [...files, ...icons], { icons: true })).toMatch(/manifest icons/);
    for (const gone of icons) {
      expect(problems(withIcons, [...files, ...icons.filter((f) => f !== gone)], { icons: true }), gone).toContain(`${gone} is missing`);
    }
    expect(problems(withIcons, [...files, ...icons, 'icon/64.png'], { icons: true })).toContain('icon/64.png');
  });
  it('the content hash depends on the files, not on their order', () => {
    const a = contentHash([{ path: 'b', sha256: '2' }, { path: 'a', sha256: '1' }]);
    expect(a.lines).toEqual(['1  a', '2  b']);
    expect(contentHash([{ path: 'a', sha256: '1' }, { path: 'b', sha256: '2' }]).hash).toBe(a.hash);
    expect(contentHash([{ path: 'a', sha256: '1' }, { path: 'b', sha256: '3' }]).hash).not.toBe(a.hash);
  });
  it('the content hash: no two different lists share one', () => {
    // a path with a line break in it must not read as two files
    expect(contentHash([{ path: 'a\n2  b', sha256: '1' }]).hash).not.toBe(contentHash([{ path: 'a', sha256: '1' }, { path: 'b', sha256: '2' }]).hash);
    const twice = [{ path: 'a', sha256: '2' }, { path: 'a', sha256: '1' }];
    expect(contentHash(twice).hash).toBe(contentHash([...twice].reverse()).hash);
  });
  it('the CHANGELOG section is a heading line of its own', () => {
    expect(hasSection('# Changelog\n\n## 5.0.0 — unreleased\n\n- x\n', '5.0.0')).toBe(true);
    expect(hasSection('# Changelog\r\n\r\n## 5.0.0 — unreleased\r\n', '5.0.0')).toBe(true);
    expect(hasSection('# Changelog\n\n### 5.0.0 notes\n', '5.0.0')).toBe(false);
    expect(hasSection('see ## 5.0.0 — unreleased\n', '5.0.0')).toBe(false);
    expect(hasSection('# Changelog\n\n```md\n## 5.0.0 — unreleased\n```\n', '5.0.0')).toBe(false);
    expect(hasSection('~~~\n## 5.0.0 — x\n~~~\n\n## 5.0.0 — unreleased\n', '5.0.0')).toBe(true);
    expect(hasSection('## 5.0.01 — x\n## 5x0y0 — x\n## 5.0.0\n', '5.0.0')).toBe(false);
  });
  it('a dependency the notices file does not name', () => {
    const notices = '   Packaged by Fontsource (@fontsource/ibm-plex-sans-thai).\n   react-dom 19.3.0     MIT   C\n   radix-ui 1.7.0   MIT   D\n';
    expect(unlisted({ 'react-dom': '19.3.0', 'radix-ui': '1.7.0', '@fontsource/ibm-plex-sans-thai': '5.3.0' }, notices)).toEqual([]);
    // `react` is not named by the react-dom line, nor `radix` by radix-ui
    expect(unlisted({ react: '19.3.0', 'react-dom': '19.3.0', radix: '1.0.0', 'left-pad': '1.0.0' }, notices)).toEqual(['react', 'radix', 'left-pad']);
    expect(unlisted({ '@radix-ui/react-tabs': '1.0.0' }, notices)).toEqual(['@radix-ui/react-tabs']);
    expect(unlisted({ '@radix-ui/react-tabs': '1.0.0' }, notices + '   D covers the @radix-ui/* packages that radix-ui bundles\n')).toEqual([]);
  });
  it('the tree: nothing uncommitted, untracked or git-ignored may be built', () => {
    const asked: string[][] = [];
    const git = (answers: Record<string, string>) => (args: string[]) => { asked.push(args); return answers[args[0]!] ?? ''; };
    expect(treeProblems(git({}))).toEqual([]);
    expect(treeProblems(git({ status: ' M lib/notify.ts\n?? entrypoints/evil.content.ts\n' })).join('\n')).toMatch(/lib\/notify\.ts[\s\S]*entrypoints\/evil\.content\.ts/);
    expect(treeProblems(git({ 'ls-files': 'public/backup/notes.txt\n' })).join('\n')).toContain('public/backup/notes.txt');
    // untracked files are asked for, one by one; ignored ones in every folder the build reads
    const status = asked.find((a) => a[0] === 'status')!, ignored = asked.find((a) => a[0] === 'ls-files')!;
    expect(status).toContain('--untracked-files=all');
    expect(status).not.toContain('--untracked-files=no');
    expect(ignored).toEqual(expect.arrayContaining(['--others', '--ignored', '--exclude-standard', 'public', 'entrypoints', 'lib', 'components', 'assets']));
  });
});
