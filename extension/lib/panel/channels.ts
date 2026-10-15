import { L } from '../i18n';
import type { StoredChannel } from '../studio/channels';

// The drawer's channel list helpers (3364–3375).
// The same Studio page, on another channel (or that channel's dashboard).
export function channelUrl(tabUrl: string, id: string): string {
  const p = new URL(tabUrl).pathname;
  return 'https://studio.youtube.com' + (/\/channel\/UC[\w-]+/.test(p) ? p.replace(/\/channel\/UC[\w-]+/, '/channel/' + id) : '/channel/' + id);
}

export const parseChannelId = (text: string): string => (text.match(/UC[\w-]{22}/) || [])[0] ?? '';

// A switch needs the channel's @handle (switcherRowMatches). Studio does not always show it,
// so a channel without one is looked up on its public page: channelMetadataRenderer has the
// channel's own externalId and vanityChannelUrl. '' = not found; the caller then refuses.
export function parseVanityHandle(html: string, id: string): string {
  if (!html.includes(`"externalId":"${id}"`)) return '';
  return (html.match(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"\\/?#]+)"/) || [])[1] ?? '';
}

export async function lookupHandle(id: string, get: typeof fetch = fetch): Promise<string> {
  try {
    const r = await get(`https://www.youtube.com/channel/${id}`, { credentials: 'omit' });
    return r.ok ? parseVanityHandle(await r.text(), id) : '';
  } catch (e) {
    console.warn('[ytup] handle lookup', id, e);
    return '';
  }
}

// Said in the page and in the panel when a channel has no @handle to switch by.
export const noHandle = (name: string) => L(
  `ไม่พบ @handle ของช่อง "${name}" จึงไม่สลับให้ (เลือกจากชื่ออาจสลับผิดช่อง) ใช้ปุ่ม Switch account ของ YouTube แทน`,
  `Couldn't find the @handle of "${name}", so not switching (picking by name could open the wrong channel). Use YouTube's own Switch account instead`,
);

export const withChannel = (list: StoredChannel[], id: string): StoredChannel[] =>
  list.some((x) => x.id === id) ? list : [...list, { id, name: '', avatar: '', handle: '' }];
