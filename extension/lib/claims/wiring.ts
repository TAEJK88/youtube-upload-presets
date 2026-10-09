import { setClaims } from '../studio/queue-runner';
import { listScheduled } from './claims';
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
