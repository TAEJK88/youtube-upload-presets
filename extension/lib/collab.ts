import { L } from './i18n';
import { TXT } from './studio/txt';

// Text matching and result reporting for collab invites. No DOM here.
export const normText = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim();
export const parseHandles = (v: unknown) =>
  String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('@') ? s : '@' + s));

// A search row (#channel-info) has no fixed separator: "@handle", "@handle · 1.2K subscribers"
// and "@handle\n1.2K subscribers" all occur. The handle must end on a non-handle character,
// otherwise @thai would match @thaibeats.
export const collabRowMatches = (info: unknown, handle: unknown) => {
  const want = String(handle || '').toLowerCase();
  if (want.length < 2 || !want.startsWith('@')) return false;
  const got = normText(info).toLowerCase();
  if (!got.startsWith(want)) return false;
  const next = got.charAt(want.length);
  return next === '' || !/[a-z0-9._-]/.test(next);
};

// The accept button: check both aria-label and button text, whitespace collapsed.
export const acceptLabelMatches = (...labels: unknown[]) =>
  labels.some((l) => normText(l) && TXT.acceptInvite.test(normText(l)));

// Channel-switcher rows only have the name and @handle (no UC id), so match by handle
// on a word boundary — @thaibeats must not match @thaibeatsofficial.
export const switcherRowMatches = (rowText: unknown, handle: unknown, name: unknown) => {
  const t = normText(rowText);
  if (!t) return false;
  const h = String(handle || '').replace(/^@/, '').toLowerCase();
  if (h) return new RegExp('@' + h.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?![a-z0-9._-])', 'i').test(t);
  const n = normText(name).toLowerCase();
  return !!n && t.toLowerCase().startsWith(n);
};

export interface InviteResult {
  links: { handle: string; link: string }[];
  skipped: string[];
  errors: string[];
  // true = Save clicked and the dialog really closed, false = it didn't, null = nothing to save
  saved: boolean | null;
}

// "Done" must mean YouTube actually saved it.
export function inviteOutcome(res: InviteResult): { state: 'done' | 'failed'; msg: string } {
  const invited = res.links.map((x) => x.handle).join(', ');
  const parts = [
    res.links.length ? L(`เชิญ ${invited}`, `Invited ${invited}`) : '',
    res.skipped.length ? L(`มีอยู่แล้ว ${res.skipped.join(', ')}`, `Already added ${res.skipped.join(', ')}`) : '',
    ...res.errors,
  ].filter(Boolean);
  const persisted = res.links.length ? res.saved === true : true;
  const worked = persisted && (res.links.length || (res.skipped.length && !res.errors.length));
  return { state: worked ? 'done' : 'failed', msg: parts.join(' · ') || L('ไม่มีอะไรเปลี่ยน', 'Nothing changed') };
}

// Invite links redirect to /channel/<us>/videos/upload?d=acd&…&inviterChannelId=<owner>;
// the only trace left is in the query string.
export const INVITE_URL = /invit|collaborat|collab|permission|[?&]d=acd\b/i;
