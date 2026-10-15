import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// browserEnv calls timers.clearInterval(id) as a method. The page's own clearInterval, handed
// over bare, is then called with `this` = the timers object: "TypeError: Illegal invocation",
// once per tick, and the invite watcher never stops.
// On Studio that tick is the post-switch Oops recovery: it threw before reloading the clean
// URL, so a channel switch stayed on "Oops, you don't have permission".
describe.each(['invite', 'studio'])('%s content script wiring', (name) => {
  it('wraps every timer it hands to browserEnv', () => {
    const src = readFileSync(new URL(`../entrypoints/${name}.content.ts`, import.meta.url), 'utf8');
    expect(src).toMatch(/clearInterval: \(id\) => clearInterval\(id\)/);
    expect(src).not.toMatch(/^\s*(setInterval|clearInterval|setTimeout),\s*$/m);
  });
});
