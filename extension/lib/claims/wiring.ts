import { setClaims } from '../studio/queue-runner';
import { listScheduled } from './claims';
import { initClaimsStore } from './store';
import { setYoutubei } from './youtubei';

// The Studio content script's link from the copyright module to Studio's API (through the MAIN
// world), and from the queue's schedule to the channel's scheduled videos (refreshChanSched asked
// Claims.listScheduled, user.js 1899). Returns the undo for the content script's teardown.
export function wireClaims(call: (path: string, body: Record<string, unknown>) => Promise<unknown>): () => void {
  setYoutubei(call);
  setClaims({ listScheduled });
  return () => {
    setYoutubei(null);
    setClaims(null);
  };
}

// The copyright data failing to load (a storage read) turns the copyright module's data off, not
// the page automation: the content script logs it and goes on to the upload queue.
export async function loadClaimsData(init: () => Promise<void> = () => initClaimsStore()): Promise<boolean> {
  try {
    await init();
    return true;
  } catch (e) {
    console.error('[ytup] copyright data is off:', e);
    return false;
  }
}
