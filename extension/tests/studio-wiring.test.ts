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

  // Call 7: while the Tampermonkey userscript is in the page this tab starts nothing. The
  // behaviour of each guard is tested in userscript-here.test.ts; these pin that it is applied.
  it('holds every start while the userscript is in the page', () => {
    expect(studio).toMatch(/onMessage\('queue:preflight', \(\) => \(userscriptHere\(\) \? \{ error: USERSCRIPT_HERE\(\) \} : startSummary\(\)\)\)/);
    expect(studio).toMatch(/onMessage\('queue:start', \(\{ data: seen \}\) => \{\s*if \(userscriptHere\(\)\) return void ui\.toast\(USERSCRIPT_HERE\(\)\);/);
    for (const m of ['trim', 'ads', 'collab']) expect(studio).toMatch(new RegExp(`onMessage\\('claims:${m}', \\(\\{ data \\}\\) => unlessUserscript\\(`));
    expect(studio).toMatch(/const unlessUserscript = <T,>\(run: \(\) => T\) => \(userscriptHere\(\) \? void ui\.toast\(USERSCRIPT_HERE\(\)\) : run\(\)\);/);
    expect(studio).toMatch(/acquire: heldAcquire\(\(\) => sendMessage\('runner:acquire', 'claims'\), userscriptHere, sayUserscript, releaseClaims, holdsClaims\),/);
    expect(studio).toMatch(/const holdsClaims = \(\) => sendMessage\('runner:holds', 'claims'\);/);
    expect(studio).toMatch(/const sayUserscript = sayOnce\(\(m\) => ui\.toast\(m\)\);/); // one page toast per load
    expect(studio).toMatch(/release: releaseClaims,/); // the same release the copyright module itself uses
    expect(studio).toMatch(/const releaseClaims = \(\) => void sendMessage\('runner:release', 'claims'\)\.catch\(\(\) => \{\}\);/);
    // no other way to a start or to the lock is left in the file
    expect(studio.match(/startSummary\(\)/g)).toHaveLength(1);
    expect(studio.match(/startFromPanel\(/g)).toHaveLength(1);
    expect(studio.match(/(trim|ads|collab)FromPanel\(/g)).toHaveLength(3);
    expect(studio.match(/'runner:acquire', 'claims'/g)).toHaveLength(1);
  });
  it('holds neither the tick, nor a scan, nor Stop', () => {
    expect(studio).toMatch(/^\s*claims\.tick\(\);$/m); // unconditional
    expect(studio).toMatch(/onMessage\('claims:scan', \(\{ data \}\) => void claims\.scan\(data\)\)/);
    expect(studio).toMatch(/onMessage\('claims:stop', \(\) => stopAll\(\)\)/);
    expect(studio).toMatch(/onMessage\('queue:stop', \(\) => \{\s*stopQueue\(\);/);
  });
  // What the watch does is tested in userscript-here.test.ts (userscriptWatch); here, that the
  // tick runs it with this tab's run, the stop after the current video (not abortRun: that would
  // leave a half-made draft), the same one toast as the lock's, and the panel's rev.
  it('watches for the userscript on every tick: tells the panel, and stops a queue that got started before it appeared', () => {
    expect(studio).toMatch(/const watchUserscript = userscriptWatch\(\{ running: \(\) => running, stop: requestStop, said: sayUserscript, changed: \(\) => ui\.schedule\(\) \}\);/);
    expect(studio).toMatch(/lockFollower\.tick\(\);\s*watchUserscript\(\);\s*\/\/ Its own try/); // in the interval, outside every try
    // The watch stops a run it finds running. That stop can't be lost: the run clears an old stop
    // request in the same synchronous step in which it becomes `running`, so no tick falls between.
    const runner = readFileSync(join(__dirname, '..', 'lib/studio/queue-runner.ts'), 'utf8');
    expect(runner).toMatch(/\n  running = true;\n  stopReq = false;\n/);
    expect(runner.match(/^\s+stopReq = false;/gm)).toHaveLength(1); // cleared nowhere else
  });

  // P5-row-progress-toast: content-ui's tick says it once on the page (content-ui.test.ts) and
  // throws again, so every failure still reaches the console and the debug log from here.
  it('ticks the progress in the 800 ms interval, in its own try, and logs each failure', () => {
    expect(studio).toMatch(/try \{\s*ui\.tick\(\);\s*\} catch \(e\) \{\s*console\.error\('\[ytup\] progress', e\);\s*\}/);
  });

  // P5-row-tab-choice (3294–3295): the Studio button opens the panel on the running task's tab, and
  // on the one it shows while nothing runs. activityFrom()'s tab is tested in activity.test.mjs.
  it("the Studio button asks for the running task's tab", () => {
    // activityTab() answers no tab when the model can't be built (fab.test.ts): the click still opens
    expect(studio).toContain('const fab = mountFab(() => ui.openDrawer(activityTab()));');
  });

  // review A-1: the FAB's update keeps its own try and console line, and says it once on the page
  // with the progress half (content-ui progressFailed, content-ui.test.ts).
  it('a failing FAB update is logged each time and said once with the progress toast', () => {
    expect(studio).toMatch(/try \{\s*fab\.update\(fabModel\(\)\);\s*\} catch \(e\) \{\s*console\.error\('\[ytup\] fab', e\);\s*ui\.progressFailed\(e\);\s*\}/);
  });
});
