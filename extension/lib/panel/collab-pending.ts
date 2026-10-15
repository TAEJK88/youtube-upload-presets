import type { ResultEntry } from '../claims/types';
import { COLLAB_LINK, type InviteAccepted } from '../invite-keys';

// P5-invite-two-step: which invited channels have not accepted each video yet. YouTube gives one
// invite link per pair of channels, not per video; what the invite watcher saw accepted (or a
// visit that found no request left) is in inviteAccepted.
export interface InviteWait { handle: string; accepted: boolean }

// The handles a "done" result invited: its first part, "Invited @a, @b" / "เชิญ @a, @b".
export function invitedHandles(res: ResultEntry | undefined): string[] {
  if (!res || res.state !== 'done') return [];
  const first = String(res.msg || '').split(' · ')[0] ?? '';
  if (!/^(Invited|เชิญ) /.test(first)) return [];
  return first.match(/@[\w.\-]+/g) || [];
}

export const inviteeOf = (link: string | undefined): string => (link?.match(COLLAB_LINK) || [])[1] ?? '';

export function inviteWaits(ch: string, videoId: string, res: ResultEntry | undefined, links: Record<string, string>, accepted: InviteAccepted): InviteWait[] {
  const when = Date.parse(res?.date ?? '') || 0;
  return invitedHandles(res).map((handle) => {
    const link = Object.entries(links).find(([h]) => h.toLowerCase() === handle.toLowerCase())?.[1];
    const pair = accepted[inviteeOf(link)]?.[ch];
    return { handle, accepted: !!pair && (!!pair.videos?.[videoId] || (pair.clearedAt ?? 0) > when) };
  });
}

// handle → how many videos still wait for it, over every result.
export function waitingByHandle(ch: string, results: Record<string, ResultEntry>, links: Record<string, string>, accepted: InviteAccepted): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [videoId, res] of Object.entries(results)) {
    for (const w of inviteWaits(ch, videoId, res, links, accepted)) if (!w.accepted) out[w.handle] = (out[w.handle] ?? 0) + 1;
  }
  return out;
}
