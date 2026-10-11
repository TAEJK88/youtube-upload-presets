// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { heldAcquire, sayOnce, userscriptHere, userscriptWatch } from '../lib/studio/userscript-here';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });
const addRoot = () => { const r = document.createElement('div'); r.id = 'ytp-root'; document.body.append(r); return r; };

describe('userscriptHere', () => {
  it("is true only while the userscript's root element is in the page", () => {
    expect(userscriptHere()).toBe(false);
    const root = addRoot();
    expect(userscriptHere()).toBe(true);
    root.remove();
    expect(userscriptHere()).toBe(false);
  });
  it("the extension's own elements do not count", () => {
    const qa = document.createElement('div');
    qa.className = 'ytp-qa';
    document.body.append(qa);
    expect(userscriptHere()).toBe(false);
  });
});

describe('heldAcquire', () => {
  it('asks the background as before when the userscript is not there', async () => {
    const ask = vi.fn(async () => true);
    expect(await heldAcquire(ask, () => false)()).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it('answers false without asking while it is there, and says why once per page load', async () => {
    const ask = vi.fn(async () => true);
    const said = vi.fn();
    let here = true;
    const acquire = heldAcquire(ask, () => here, said);
    expect(await acquire()).toBe(false);
    expect(await acquire()).toBe(false);
    expect(ask).not.toHaveBeenCalled(); // the lock is not asked for
    expect(said).toHaveBeenCalledTimes(1);
    expect(said.mock.calls[0]![0]).toContain('The Tampermonkey script is still on in this tab');
    here = false; await acquire(); here = true; await acquire(); // gone and back: not said again on this page
    expect(said).toHaveBeenCalledTimes(1);
  });
  // R1: claimLock() takes a refusal as "not mine" and never lets go by itself (settleLock returns
  // on !lockMine). A tab that held the lock when the userscript appeared would keep it until closed.
  it('a tab that held the lock lets it go on the first refusal, once', async () => {
    let here = true;
    const release = vi.fn();
    const acquire = heldAcquire(async () => true, () => here, () => {}, release);
    await acquire();
    await acquire();
    await acquire();
    expect(release).toHaveBeenCalledTimes(1);
    here = false; // the script was turned off: the lock is asked for and taken again
    expect(await acquire()).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    here = true; // and on again: let go again
    await acquire();
    expect(release).toHaveBeenCalledTimes(2);
  });
  // Review 5: that one release is a message nobody answers. If it was lost, the background would
  // keep the job for this tab until it reloads; so the tab asks, and lets go again if need be.
  it('checks 30 s later that the lock really went, lets go again if not, and stops asking once it has', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const release = vi.fn();
    const answers = [true, false];
    const holds = vi.fn(async () => answers.shift() ?? false);
    const acquire = heldAcquire(async () => true, () => true, () => {}, release, holds);
    await acquire();
    vi.advanceTimersByTime(29_000);
    await acquire();
    expect(holds).not.toHaveBeenCalled(); // not a message at every refusal
    vi.advanceTimersByTime(1_000);
    await acquire();
    await acquire();
    expect(holds).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(2); // still held: the first release was lost
    vi.advanceTimersByTime(30_000);
    await acquire();
    await Promise.resolve();
    expect(holds).toHaveBeenCalledTimes(2); // now it went
    expect(release).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(300_000);
    await acquire();
    expect(holds).toHaveBeenCalledTimes(2); // sure: nothing more is asked
  });
  it('a check that fails is asked again; a tab that never held the lock sends one check and no more', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const release = vi.fn();
    let fail = true;
    const holds = vi.fn(async () => { if (fail) throw new Error('no answer'); return false; });
    const acquire = heldAcquire(async () => true, () => true, () => {}, release, holds);
    await acquire();
    for (let i = 0; i < 2; i++) { vi.advanceTimersByTime(30_000); await acquire(); await Promise.resolve(); await Promise.resolve(); }
    expect(holds).toHaveBeenCalledTimes(2);
    fail = false;
    for (let i = 0; i < 3; i++) { vi.advanceTimersByTime(30_000); await acquire(); await Promise.resolve(); await Promise.resolve(); }
    expect(holds).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('an answer that comes after the userscript went releases nothing: the lock may be this tab\'s again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let here = true;
    const release = vi.fn();
    let answer!: (v: boolean) => void;
    const acquire = heldAcquire(async () => true, () => here, () => {}, release, () => new Promise<boolean>((r) => { answer = r; }));
    await acquire();
    vi.advanceTimersByTime(30_000);
    await acquire(); // the check is on its way
    here = false;
    expect(await acquire()).toBe(true); // the script was turned off: the lock is taken for a step
    answer(true);
    await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('asks again as soon as the userscript is gone', async () => {
    let here = true;
    const ask = vi.fn(async () => true);
    const acquire = heldAcquire(ask, () => here, () => {});
    expect(await acquire()).toBe(false);
    here = false;
    expect(await acquire()).toBe(true);
  });
});

describe('sayOnce', () => {
  it('lets the first message through and no other', () => {
    const say = vi.fn();
    const once = sayOnce(say);
    once('a');
    once('b');
    expect(say.mock.calls).toEqual([['a']]);
  });
});

// Review 2: Tampermonkey may inject the userscript after this tab took a Start. The 800 ms tick
// sees the root appear; a queue that runs by then stops after its current video.
describe('userscriptWatch', () => {
  const setup = (running: boolean) => {
    const d = { here: false, running, stop: vi.fn(), said: vi.fn(), changed: vi.fn() };
    const tick = userscriptWatch({ here: () => d.here, running: () => d.running, stop: d.stop, said: d.said, changed: d.changed });
    return { d, tick };
  };
  it('does nothing while nothing changes', () => {
    const { d, tick } = setup(true);
    tick();
    tick();
    expect(d.changed).not.toHaveBeenCalled();
    expect(d.stop).not.toHaveBeenCalled();
  });
  it('the userscript appears during an upload run: the run is asked to stop, once, with the reason; the panel is told', () => {
    const { d, tick } = setup(true);
    d.here = true;
    tick();
    tick();
    tick();
    expect(d.stop).toHaveBeenCalledTimes(1);
    expect(d.said.mock.calls).toEqual([[expect.stringContaining('The Tampermonkey script is still on in this tab')]]);
    expect(d.changed).toHaveBeenCalledTimes(1);
  });
  it('it appears while no run is going: the panel is told, nothing is stopped or said', () => {
    const { d, tick } = setup(false);
    d.here = true;
    tick();
    expect(d.changed).toHaveBeenCalledTimes(1);
    expect(d.stop).not.toHaveBeenCalled();
    expect(d.said).not.toHaveBeenCalled();
    d.running = true; // a run that is going later is not this function's to stop: no Start gets through by then
    tick();
    expect(d.stop).not.toHaveBeenCalled();
  });
  it('it goes: the panel is told, a run is left alone', () => {
    const { d, tick } = setup(true);
    d.here = true;
    tick();
    d.here = false;
    tick();
    expect(d.changed).toHaveBeenCalledTimes(2);
    expect(d.stop).toHaveBeenCalledTimes(1);
  });
  it('reads the page itself when not told how', () => {
    const changed = vi.fn();
    const tick = userscriptWatch({ running: () => false, stop() {}, said() {}, changed });
    addRoot();
    tick();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
