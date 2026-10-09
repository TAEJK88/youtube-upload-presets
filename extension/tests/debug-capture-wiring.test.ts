import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every context with extension APIs logs into the debug log from its first line; the
// MAIN-world script has no extension APIs and can't.
const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
// The entrypoint's first import (comments before it allowed).
const firstImport = (text: string) => text.match(/^(?:\/\/[^\n]*\n|\s)*(import [^\n]*)/)?.[1] ?? '';

describe('debug capture is installed first in each context', () => {
  // Background and content scripts: a side-effect-only module imported first installs the capture
  // at the top level, before the other imports evaluate, so their evaluation errors are logged too.
  // (WXT strips side-effect-only imports when it loads an entrypoint at build time for its options.)
  it.each([
    ['entrypoints/background.ts', 'background', "installDebugCapture('background', { target: self });"],
    ['entrypoints/studio.content.ts', 'studio', "installDebugCapture('studio', { target: window, ownFilesOnly: true });"],
    ['entrypoints/invite.content.ts', 'invite', "installDebugCapture('invite', { target: window, ownFilesOnly: true });"],
  ])('%s: through lib/debug-capture/%s.ts, imported first', (entry, ctx, call) => {
    expect(firstImport(src(entry)).startsWith(`import '@/lib/debug-capture/${ctx}';`)).toBe(true);
    expect(src(`lib/debug-capture/${ctx}.ts`)).toContain(call);
    expect(src(entry)).not.toContain('installDebugCapture');
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
