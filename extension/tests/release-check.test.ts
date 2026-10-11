import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script
import { contentHash, inspect } from '../scripts/release-check.mjs';

const manifest = {
  manifest_version: 3, version: '5.0.0',
  permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'alarms', 'notifications'],
  host_permissions: ['https://studio.youtube.com/*', 'https://www.youtube.com/*', 'https://api.github.com/*'],
  web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }],
};
const files = ['manifest.json', 'background.js', 'sidepanel.html', 'debug.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt',
  'content-scripts/studio.js', 'content-scripts/studio-main.js', 'content-scripts/invite.js', 'chunks/a.js', 'assets/a.woff2'];
const icons = ['icon/16.png', 'icon/32.png', 'icon/48.png', 'icon/128.png'];

describe('release check', () => {
  it('passes the build as it is', () => expect(inspect(files, manifest, '5.0.0')).toEqual([]));
  it('names a version that differs from package.json', () =>
    expect(inspect(files, manifest, '5.0.1').join('\n')).toMatch(/version 5\.0\.0.*package\.json.*5\.0\.1/));
  it('names any permission, host or web-accessible file added or removed', () => {
    expect(inspect(files, { ...manifest, permissions: [...manifest.permissions, 'tabs'] }, '5.0.0').join('\n')).toMatch(/permissions/);
    expect(inspect(files, { ...manifest, host_permissions: manifest.host_permissions.slice(0, 2) }, '5.0.0').join('\n')).toMatch(/host_permissions/);
    expect(inspect(files, { ...manifest, web_accessible_resources: [{ resources: ['file-bridge.html', 'debug.html'], matches: ['<all_urls>'] }] }, '5.0.0').join('\n')).toMatch(/web_accessible/);
  });
  it('names a file that has no business in the zip', () => {
    for (const bad of ['chunks/a.js.map', '.vitest/x', '.claude/settings.json', 'tests/a.test.ts', 'stats.html', '.DS_Store', 'node_modules/x/index.js', 'ytup-extension-key.pem']) {
      expect(inspect([...files, bad], manifest, '5.0.0').join('\n'), bad).toContain(bad);
    }
  });
  it('names a file the extension needs that is not there', () => {
    for (const need of ['manifest.json', 'background.js', 'sidepanel.html', 'file-bridge.html', 'THIRD-PARTY-NOTICES.txt', 'content-scripts/studio.js']) {
      expect(inspect(files.filter((f) => f !== need), manifest, '5.0.0').join('\n'), need).toContain(need);
    }
  });
  it('the key: there when the config sets one, absent when it does not', () => {
    expect(inspect(files, manifest, '5.0.0', { key: true }).join('\n')).toMatch(/no key/);
    expect(inspect(files, { ...manifest, key: 'MIIB…' }, '5.0.0', { key: true })).toEqual([]);
    expect(inspect(files, { ...manifest, key: 'MIIB…' }, '5.0.0').join('\n')).toMatch(/has a key/);
  });
  it('the icons: all four sizes when public/icon/ has them, none otherwise', () => {
    const withIcons = { ...manifest, icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' } };
    expect(inspect([...files, ...icons], withIcons, '5.0.0', { icons: true })).toEqual([]);
    expect(inspect(files, manifest, '5.0.0', { icons: true }).join('\n')).toMatch(/manifest icons/);
    expect(inspect([...files, 'icon/16.png'], { ...manifest, icons: { 16: 'icon/16.png' } }, '5.0.0').join('\n')).toMatch(/not complete/);
  });
  it('the content hash depends on the files, not on their order', () => {
    const a = contentHash([{ path: 'b', sha256: '2' }, { path: 'a', sha256: '1' }]);
    expect(a.lines).toEqual(['1  a', '2  b']);
    expect(contentHash([{ path: 'a', sha256: '1' }, { path: 'b', sha256: '2' }]).hash).toBe(a.hash);
    expect(contentHash([{ path: 'a', sha256: '1' }, { path: 'b', sha256: '3' }]).hash).not.toBe(a.hash);
  });
});
