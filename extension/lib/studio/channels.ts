import { L } from '../i18n';
import type { Channel } from './channel';
import { ui } from './page-ui';
import { otherTabRunning, running } from './queue-runner';
import { load, save } from './state';

// The drawer remembered every channel it was opened on (rememberChannel, UI section 3355),
// for the channel list. Read fresh each time: several Studio tabs write this list.
export interface StoredChannel { id: string; name: string; avatar: string; handle: string }

export function rememberChannel(c: Channel): void {
  if (!c.id || !c.name) return;
  const channels = load<StoredChannel[]>('channels', []);
  const old = channels.find((x) => x.id === c.id);
  if (old && old.name === c.name && old.avatar === c.avatar && old.handle === (c.handle || old.handle)) return;
  save('channels', [
    { id: c.id, name: c.name, avatar: c.avatar, handle: c.handle || old?.handle || '' },
    ...channels.filter((x) => x.id !== c.id),
  ]);
}

// The channel list's "Switch" (3391): through www.youtube.com/channel_switcher, which then
// continues to `next`. A message can come from any extension page, so `next` must be Studio.
// The drawer refused while the queue held files, because they lived in the page; the files
// now survive a channel switch, so only a run in progress is refused. A switch changes the
// channel of every Studio tab, so a run in another tab (the runner lock, as last polled)
// counts too.
export interface SwitchRequest { name: string; handle: string; next: string }

export function switchChannel(
  sw: { switchToChannel(t: { name?: string; handle?: string }, next: string): void },
  req: SwitchRequest,
  isRunning = () => running || otherTabRunning(),
): void {
  const next = studioUrl(req);
  if (isRunning()) return ui.toast(L('คิวอัปโหลดยังทำงานอยู่ — สลับช่องตอนนี้คิวจะหยุด', 'Upload queue is still running — switching channels now would stop it'));
  sw.switchToChannel({ name: req.name, handle: req.handle }, next);
}

// The message is untrusted data: plain strings, and `next` parses to an https URL on
// studio.youtube.com (a prefix test would also be fooled by a non-string).
function studioUrl(req: SwitchRequest): string {
  const r = req as Partial<Record<keyof SwitchRequest, unknown>> | null;
  if (typeof r?.name !== 'string' || typeof r.handle !== 'string' || typeof r.next !== 'string') {
    throw new Error('channel:switch: malformed request');
  }
  const u = URL.canParse(r.next) ? new URL(r.next) : null;
  if (u?.protocol !== 'https:' || u.host !== 'studio.youtube.com') throw new Error('channel:switch: next must be a Studio URL');
  return u.href;
}
