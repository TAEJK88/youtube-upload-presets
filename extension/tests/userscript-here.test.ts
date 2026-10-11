// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { heldAcquire, userscriptHere } from '../lib/studio/userscript-here';

afterEach(() => { document.body.innerHTML = ''; });
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
  it('asks again as soon as the userscript is gone', async () => {
    let here = true;
    const ask = vi.fn(async () => true);
    const acquire = heldAcquire(ask, () => here, () => {});
    expect(await acquire()).toBe(false);
    here = false;
    expect(await acquire()).toBe(true);
  });
});
