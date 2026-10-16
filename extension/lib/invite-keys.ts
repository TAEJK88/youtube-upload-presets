// Storage the invite watcher shares with the switch flow and the side panel (P5-invite-two-step).
// No imports: the panel reads these too.

// An invite link to open once the switch to its channel has landed: the switcher's `next` is
// the channel's own page, because a /collaboration/ link opened straight from the switch did not
// bring up the requests (seen 2026-10-15 on BLXD) while the same link opened from that page did.
export const INVITE_NEXT_KEY = 'inviteAfterSwitch';
// token: the one the switching tab keeps in its sessionStorage (lib/invite.ts)
export interface InviteNext { at: number; channel: string; link: string; token?: string }

// invitee channel id → inviter channel id → the videos seen accepted (videoId → time) and the
// last time a visit to the invite link found no request left (then everything invited before
// it is no longer waiting).
export const INVITE_ACCEPTED_KEY = 'inviteAccepted';
export interface InviteAcceptedPair { videos?: Record<string, number>; clearedAt?: number }
export type InviteAccepted = Record<string, Record<string, InviteAcceptedPair>>;

// /channel/<invitee>/collaboration/<inviter>, the link Studio's invite dialog gives.
export const COLLAB_LINK = /^https:\/\/studio\.youtube\.com\/channel\/(UC[\w-]{10,})\/collaboration\/(UC[\w-]{10,})\/?$/;
