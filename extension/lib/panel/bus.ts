import type { ClaimsLogLine, ClaimsState, ClaimsView } from '../claims/types';
import { onMessage, type QueueState } from '../messages';
import { studioTab } from '../runner-lock';

// @webext-core/messaging allows one listener per message type in a context; the panel's
// components subscribe here instead. Every Studio tab broadcasts: the tab id tells them apart.
type Fn<T> = (data: T, tabId: number | undefined) => void;
const states = new Set<Fn<QueueState>>();
const toasts = new Set<Fn<string>>();
const claimStates = new Set<Fn<ClaimsState>>();
const claimLogs = new Set<Fn<ClaimsLogLine>>();
const claimShows = new Set<Fn<ClaimsView>>();
let installed = false;

// The copyright broadcasts (D24) are passed on only from a tab on Studio (the www.youtube.com
// content script never sends them), and only in the shape a Studio tab sends.
interface Sender { tab?: { id?: number; url?: string }; url?: string }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isLogLine = (v: unknown): v is ClaimsLogLine => isObj(v) && typeof v.at === 'number' && typeof v.msg === 'string' && typeof v.type === 'string';
const isView = (v: unknown): v is ClaimsView => v === 'claims' || v === 'ads' || v === 'collab';
function pass<T>(fns: Set<Fn<T>>, ok: (v: unknown) => v is T) {
  return ({ data, sender }: { data: unknown; sender: Sender }) => {
    const tabId = studioTab(sender);
    if (tabId == null || !ok(data)) return;
    for (const fn of fns) fn(data, tabId);
  };
}

export function installBus(): void {
  if (installed) return;
  installed = true;
  onMessage('queue:state', ({ data, sender }) => { for (const fn of states) fn(data, sender.tab?.id); });
  onMessage('queue:toast', ({ data, sender }) => { for (const fn of toasts) fn(data, sender.tab?.id); });
  onMessage('claims:state', pass(claimStates, (v): v is ClaimsState => isObj(v) && isObj(v.status)));
  onMessage('claims:log', pass(claimLogs, isLogLine));
  onMessage('claims:show', pass(claimShows, isView));
}

export const onQueueState = (fn: Fn<QueueState>) => (states.add(fn), () => void states.delete(fn));
export const onQueueToast = (fn: Fn<string>) => (toasts.add(fn), () => void toasts.delete(fn));
export const onClaimsState = (fn: Fn<ClaimsState>) => (claimStates.add(fn), () => void claimStates.delete(fn));
export const onClaimsLog = (fn: Fn<ClaimsLogLine>) => (claimLogs.add(fn), () => void claimLogs.delete(fn));
export const onClaimsShow = (fn: Fn<ClaimsView>) => (claimShows.add(fn), () => void claimShows.delete(fn));
