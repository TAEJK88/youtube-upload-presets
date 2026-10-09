import type { StoredChannel } from '../studio/channels';

// The drawer's channel list helpers (3364–3375).
// The same Studio page, on another channel (or that channel's dashboard).
export function channelUrl(tabUrl: string, id: string): string {
  const p = new URL(tabUrl).pathname;
  return 'https://studio.youtube.com' + (/\/channel\/UC[\w-]+/.test(p) ? p.replace(/\/channel\/UC[\w-]+/, '/channel/' + id) : '/channel/' + id);
}

export const parseChannelId = (text: string): string => (text.match(/UC[\w-]{22}/) || [])[0] ?? '';

export const withChannel = (list: StoredChannel[], id: string): StoredChannel[] =>
  list.some((x) => x.id === id) ? list : [...list, { id, name: '', avatar: '', handle: '' }];
