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
export function heldAcquire(
  ask: () => Promise<boolean>, here: () => boolean = userscriptHere,
  said: (msg: string) => void = () => {}, release: () => void = () => {},
): () => Promise<boolean> {
  let held = false;
  let told = false;
  return async () => {
    if (!here()) { held = false; return ask(); }
    if (!held) { held = true; release(); }
    if (!told) { told = true; said(USERSCRIPT_HERE()); }
    return false;
  };
}
