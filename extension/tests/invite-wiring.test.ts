import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// browserEnv calls timers.clearInterval(id) as a method. The page's own clearInterval, handed
// over bare, is then called with `this` = the timers object: "TypeError: Illegal invocation",
// once per tick, and the invite watcher never stops.
describe('invite content script wiring', () => {
  it('wraps every timer it hands to browserEnv', () => {
    const src = readFileSync(new URL('../entrypoints/invite.content.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/clearInterval: \(id\) => clearInterval\(id\)/);
    expect(src).not.toMatch(/^\s*(setInterval|clearInterval|setTimeout),\s*$/m);
  });
});
