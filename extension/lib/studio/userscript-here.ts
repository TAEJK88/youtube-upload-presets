import { L } from '../i18n';

// The Tampermonkey userscript and the extension must not both drive one Studio page: each has
// its own queue and its own Auto-pilot. The userscript's root element is #ytp-root (user.js
// 3192). While it is in the page this tab starts no upload and no copyright run, and takes the
// automation lock for no copyright step; scans, the status and Stop go on (call 7).
export const userscriptHere = (doc: Document = document): boolean => !!doc.getElementById('ytp-root');
export const USERSCRIPT_HERE = () => L(
  'สคริปต์ Tampermonkey ยังเปิดอยู่ในแท็บนี้ — ปิดใน Tampermonkey แล้วโหลดแท็บนี้ใหม่ การอัปโหลด การตัด และ Auto-pilot จะรอจนกว่าจะปิด',
  'The Tampermonkey script is still on in this tab — turn it off in Tampermonkey, then reload this tab. Uploads, trims and Auto-pilot wait until then');

// The copyright module's way to the automation lock (setClaimsLock's `acquire`). Refused here,
// a step waits as it waits for another tab; the background is not asked. claimLock() takes a
// refusal as "the lock is not mine" and then never releases it, so a tab that already held the
// lock (a run begun before the userscript's root appeared, or kept across a reload) lets it go
// here, once per time the userscript is there. `said` tells the page why, once per page load.
// That release is a message nobody answers: 30 s later, at the next refusal, the tab asks whether
// it still holds the lock (`holds`), lets go again if so, and asks no more once the answer is no.
const RELEASE_CHECK_MS = 30_000;
export function heldAcquire(
  ask: () => Promise<boolean>, here: () => boolean = userscriptHere,
  said: (msg: string) => void = () => {}, release: () => void = () => {},
  holds: () => Promise<boolean> = async () => false,
): () => Promise<boolean> {
  let held = 0; // counts the times the userscript was found; 0 while it is not there
  let times = 0;
  let unsure = false;
  let checkAt = 0;
  let told = false;
  return async () => {
    if (!here()) { held = 0; return ask(); }
    if (!held) {
      held = ++times;
      release();
      unsure = true;
      checkAt = Date.now() + RELEASE_CHECK_MS;
    } else if (unsure && Date.now() >= checkAt) {
      const then = held;
      checkAt = Date.now() + RELEASE_CHECK_MS;
      // An answer that comes after the userscript went is dropped: the lock may be this tab's again.
      void holds().then((mine) => {
        if (held !== then) return;
        if (mine) release();
        else unsure = false;
      }, () => {});
    }
    if (!told) { told = true; said(USERSCRIPT_HERE()); }
    return false;
  };
}

// One page toast per page load, whichever guard speaks first.
export const sayOnce = (say: (msg: string) => void) => {
  let told = false;
  return (msg: string) => {
    if (told) return;
    told = true;
    say(msg);
  };
};

// For the content script's 800 ms tick. The userscript appends its root after this script may
// have answered a first queue:view, so a change is told to the panel at once (`changed`). It may
// also come after a Start got through (Tampermonkey injected late), while that run is going or
// while it is still on its way to running. So the stop follows the state, not the change: an
// upload run found going with the root in the page is asked to stop after its current video,
// once per run, and the page is told why. Every later Start is refused, so no other run is hit.
export function userscriptWatch(d: {
  here?: () => boolean; running(): boolean; stop(): void; said(msg: string): void; changed(): void;
}): () => void {
  const here = d.here ?? userscriptHere;
  let seen = false;
  let asked = false; // this run was asked to stop
  return () => {
    const h = here();
    if (!(h && d.running())) asked = false;
    else if (!asked) {
      asked = true;
      d.stop();
      d.said(USERSCRIPT_HERE());
    }
    if (h === seen) return;
    seen = h;
    d.changed();
  };
}
