import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Studio content script can't be run here (defineContentScript, Studio's page). What it
// connects is tested in its own module; these pin the lines that connect it (final review I2).
const studio = readFileSync(join(__dirname, '..', 'entrypoints/studio.content.ts'), 'utf8');

describe('the Studio content script', () => {
  // queue-sync's watchLockLifecycle is tested with an abort of its own. A plain stop would let
  // the run save its stale copy over the other tab's results (R-M3; queue-abort.test.ts).
  it('aborts a run that lost the lock in the back/forward cache, rather than stopping it', () => {
    expect(studio).toMatch(/watchLockLifecycle\(window, \{[^}]*\babort: \(\) => abortRun\(new Error\(L\(/);
    expect(studio).toMatch(/watchLockLifecycle\(window, \{[^}]*\bstop: requestStop,/);
  });

  // disposeClaimsStore is tested in claims-store.test.ts: a teardown while the data loads drops
  // what it loaded, which only works when the teardown is registered before the load starts.
  it('registers the copyright store teardown before loading its data', () => {
    const dispose = studio.indexOf('stop.add(disposeClaimsStore);');
    expect(dispose).toBeGreaterThan(-1);
    expect(dispose).toBeLessThan(studio.indexOf('await loadClaimsData();'));
  });
});
