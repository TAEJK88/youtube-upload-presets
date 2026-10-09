import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every context with extension APIs logs into the debug log from its first line; the
// MAIN-world script has no extension APIs and can't.
const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
// The first statement of the entrypoint's main(): installDebugCapture('<ctx>'…
const firstInMain = (text: string) => text.match(/main\([^)]*\)\s*\{\s*([^\n]*)/)?.[1] ?? '';

describe('debug capture is installed first in each context', () => {
  it('background (on self)', () => {
    expect(src('entrypoints/background.ts')).toMatch(/defineBackground\(\(\) => \{\s*installDebugCapture\('background', \{ target: self \}\);/);
  });
  it('Studio and www.youtube.com content scripts (their own files only)', () => {
    expect(firstInMain(src('entrypoints/studio.content.ts'))).toBe("installDebugCapture('studio', { target: window, ownFilesOnly: true });");
    expect(firstInMain(src('entrypoints/invite.content.ts'))).toBe("installDebugCapture('invite', { target: window, ownFilesOnly: true });");
  });
  it('the file bridge', () => {
    expect(src('entrypoints/file-bridge/main.ts')).toMatch(/^(import [^\n]*\n)+\ninstallDebugCapture\('bridge', \{ target: window \}\);/);
  });
  it('side panel and debug page: through the crash guard, imported first', () => {
    expect(src('entrypoints/sidepanel/crash-guard.ts')).toContain('installDebugCapture(ctx, { target: window })');
    expect(src('entrypoints/sidepanel/main.tsx')).toMatch(/^(\/\/[^\n]*\n)*import \{[^}]*\} from '\.\/crash-guard';/);
    expect(src('entrypoints/debug/main.tsx')).toMatch(/^(\/\/[^\n]*\n)*import \{[^}]*\} from '\.\.\/sidepanel\/crash-guard';/);
  });
  it('not the MAIN-world script (no extension APIs there)', () => {
    expect(src('entrypoints/studio-main.content.ts')).not.toContain('installDebugCapture');
  });
});
