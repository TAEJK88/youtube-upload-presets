import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The side panel must not load the Studio page's modules: lib/studio/state.ts there holds
// defaults that never sync, so panel code reading it would get silent wrong values.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = ['lib/studio/state.ts', 'lib/studio/queue-runner.ts', 'lib/claims/claims.ts', 'lib/claims/store.ts'];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null; // a package
  for (const ext of ['', '.ts', '.tsx', '/index.ts']) if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  return null;
}

// Value imports and re-exports only: `import type` is erased from the bundle.
function reachable(entry: string): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  const walk = (file: string, path: string[]) => {
    if (paths.has(file)) return;
    paths.set(file, path);
    const src = readFileSync(file, 'utf8');
    const specs = [
      ...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"]([^'"]+)['"]/gm),
      ...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm), // side-effect imports
    ];
    for (const m of specs) {
      const next = resolveImport(file, m[1]!);
      if (next) walk(next, [...path, relative(ROOT, file)]);
    }
  };
  walk(entry, []);
  return paths;
}

describe('side panel bundle', () => {
  it('does not import the Studio state, the queue runner or the copyright page code', () => {
    const paths = reachable(join(ROOT, 'entrypoints/sidepanel/main.tsx'));
    const hits = [...paths].filter(([f]) => FORBIDDEN.includes(relative(ROOT, f))).map(([f, p]) => [...p, relative(ROOT, f)].join(' → '));
    expect(paths.size).toBeGreaterThan(10); // the walk did find the panel's modules
    expect(hits).toEqual([]);
  });
});

describe('one copy of shared helpers (4a review m10)', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
  it('the "not connected" toast has one shared helper', () => {
    expect(read('entrypoints/sidepanel/save-failed.ts')).toMatch(/export const notConnected\b/);
  });
  it('the panel bus uses the lock module\'s studioTab', () => {
    const src = read('lib/panel/bus.ts');
    expect(src).toMatch(/import \{[^}]*\bstudioTab\b[^}]*\} from '\.\.\/runner-lock'/);
    expect(src).not.toMatch(/const studioTab\s*=/);
  });
  it('the "not connected" toast is said in one place', () => {
    const tabs = 'entrypoints/sidepanel/tabs/';
    const said = ['CopyrightTab.tsx', 'copyright/ClaimList.tsx', 'copyright/AdsView.tsx', 'copyright/CollabView.tsx', 'copyright/CopyrightSettings.tsx']
      .filter((f) => read(tabs + f).includes('This tab is not connected to the extension yet'));
    expect(said).toEqual([]);
  });
});
