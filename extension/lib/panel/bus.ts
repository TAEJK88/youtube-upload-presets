import { onMessage, type QueueState } from '../messages';

// @webext-core/messaging allows one listener per message type in a context; the panel's
// components subscribe here instead. Every Studio tab broadcasts: the tab id tells them apart.
type Fn<T> = (data: T, tabId: number | undefined) => void;
const states = new Set<Fn<QueueState>>();
const toasts = new Set<Fn<string>>();
let installed = false;

export function installBus(): void {
  if (installed) return;
  installed = true;
  onMessage('queue:state', ({ data, sender }) => { for (const fn of states) fn(data, sender.tab?.id); });
  onMessage('queue:toast', ({ data, sender }) => { for (const fn of toasts) fn(data, sender.tab?.id); });
}

export const onQueueState = (fn: Fn<QueueState>) => (states.add(fn), () => void states.delete(fn));
export const onQueueToast = (fn: Fn<string>) => (toasts.add(fn), () => void toasts.delete(fn));
