import { cachedCfg, chanLabel, getChannel } from '../studio/channel';
import { load, save } from './store';
import type { ClaimsCounts } from './types';
import { yti } from './youtubei';

// The userscript's copyright module (user.js 4592–6357) as page code: its closure's variables
// are this module's. Reads come from the claims store (lib/claims/store.ts); writes go to the
// background as ops (D20). ycfg is ytcfg as refreshCfg last copied it from the MAIN world.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ycfg = (k: string): any => cachedCfg(k);

// @port-begin
  function currentChannel(): string {
    const m = location.pathname.match(/\/channel\/(UC[\w-]{22})/);
    return ycfg('CHANNEL_ID') || (m && m[1]) || 'unknown';
  }
  const channelName = () => chanLabel(getChannel()) || currentChannel();
  const chGet = <T>(name: string, def: T, ch = currentChannel()): T => load(name + ':' + ch, def);
  const chSet = (name: string, val: unknown, ch = currentChannel()) => { invalidateCounts(); return save(name + ':' + ch, val); };
  const COUNTS_TTL = 3000;
  let countsAt = 0;
  let countsCache: ClaimsCounts | null = null;
  function invalidateCounts() { countsAt = 0; }
  async function listScheduled(): Promise<{ videoId: string; title: string; at: number }[] | null> {
    if (!ycfg('INNERTUBE_CONTEXT')) return null;
    const CH = currentChannel();
    const out: { videoId: string; title: string; at: number }[] = [];
    let tok: string | undefined, pages = 0;
    do {
      const body: Record<string, unknown> = {
        filter: { and: { operands: [{ channelIdIs: { value: CH } }, { videoOriginIs: { value: 'VIDEO_ORIGIN_UPLOAD' } }] } },
        order: 'VIDEO_ORDER_DISPLAY_TIME_DESC', pageSize: 50,
        mask: { videoId: true, title: true, scheduledPublishingDetails: { all: true } },
      };
      if (tok) body.pageToken = tok;
      const j = await yti('creator/list_creator_videos', body);
      for (const v of j.videos || []) {
        for (const sp of (v.scheduledPublishingDetails || {}).scheduledPublishings || []) {
          const at = (+sp.scheduledTimeSeconds || 0) * 1000;
          if (/SCHEDULED$/.test(sp.status || '') && at > Date.now()) out.push({ videoId: v.videoId, title: v.title || '', at });
        }
      }
      tok = j.nextPageToken;
      pages++;
    } while (tok && pages < 4);
    return out.sort((a, b) => a.at - b.at);
  }
// @port-end

export { currentChannel, channelName, chGet, chSet, listScheduled };
