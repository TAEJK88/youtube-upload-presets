import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { getLang, setLang, watchLang } from '@/lib/i18n';
import { sendMessage, type ProtocolMap, type QueueState } from '@/lib/messages';
import { installBus, onQueueState, onQueueToast } from '@/lib/panel/bus';
import { readPanelData, watchPanelData, type PanelData } from '@/lib/panel/data';
import { activeStudioTab, runnerTab, watchRunner, watchTabs, type RunnerTab, type Target } from '@/lib/panel/target';
import { createViewSync, type LinkStatus } from '@/lib/panel/view-sync';
import { writes, type Writes } from '@/lib/panel/writes';
import type { QueueView } from '@/lib/studio/queue-view';

export type ToTab = <K extends keyof ProtocolMap>(type: K, data: Parameters<ProtocolMap[K]>[0]) => Promise<Awaited<ReturnType<ProtocolMap[K]>>>;
const toTab = (tabId: number): ToTab => (type, data) => sendMessage(type, data as never, tabId) as never;

export interface PanelApi {
  lang: string; // a change re-renders every consumer (L() is read while rendering)
  data: PanelData | null;
  target: Target | null; // the Studio tab active in this window
  link: LinkStatus;
  view: QueueView | null; // that tab's queue, as its runner sees it
  state: QueueState | null; // that tab's live state (newer than view.state)
  runner: RunnerTab | null; // the tab holding the runner lock, if any (may be the target)
  liveState: QueueState | null; // the running tab's live state, else the target's
  elsewhere: boolean; // another tab is running the queue
  send: ToTab; // to the target
  sendTo(tabId: number): ToTab;
  write: Writes;
  refresh(): void;
}

const noop = () => {};
export const PanelContext = createContext<PanelApi>({
  lang: 'en', data: null, target: null, link: 'noTab', view: null, state: null, runner: null, liveState: null, elsewhere: false,
  send: () => Promise.reject(new Error('no Studio tab')), sendTo: toTab, write: writes, refresh: noop,
});
export const usePanel = () => useContext(PanelContext);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [link, setLink] = useState<LinkStatus>('noTab');
  const [view, setView] = useState<QueueView | null>(null);
  const [states, setStates] = useState<ReadonlyMap<number, QueueState>>(new Map());
  const [runner, setRunner] = useState<RunnerTab | null>(null);
  const [lang, setLangState] = useState(getLang());
  const targetRef = useRef<Target | null>(null);
  const seen = useRef(new Map<number, string>()); // rev + channel per tab: re-read the view when it moves
  const sync = useMemo(
    () => createViewSync({ fetch: (id) => sendMessage('queue:view', undefined, id), onView: setView, onStatus: setLink }),
    [],
  );

  // Stored data, and the language with it.
  useEffect(() => {
    void readPanelData().then(setData);
    const offData = watchPanelData(setData);
    // L() reads the module's language: watchLang switches it the moment settings change,
    // and the new `lang` re-renders every usePanel() consumer.
    const offLang = watchLang(setLangState);
    const queueChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'queue' in changes) sync.poke();
    };
    browser.storage.onChanged.addListener(queueChanged);
    return () => {
      offData();
      offLang();
      browser.storage.onChanged.removeListener(queueChanged);
    };
  }, [sync]);
  useEffect(() => {
    const l = data?.settings.lang;
    if (l && l !== getLang()) setLang(l);
    if (l) setLangState(l);
    if (data) sync.poke(); // titles, numbers and times depend on presets / counters / settings
  }, [data, sync]);

  // Which tab.
  useEffect(() => {
    let alive = true;
    let windowId: number | undefined;
    let off = noop;
    const rebind = async () => {
      if (windowId === undefined) return;
      const t = await activeStudioTab(windowId);
      if (!alive) return;
      const changed = t?.tabId !== targetRef.current?.tabId;
      targetRef.current = t;
      setTarget(t);
      if (changed) sync.bind(t?.tabId ?? null);
    };
    void browser.windows.getCurrent().then((w) => {
      if (!alive || w.id === undefined) return;
      windowId = w.id;
      void rebind();
      off = watchTabs(w.id, (e) => {
        if (e === 'loading') return sync.loading();
        void rebind();
        if (e === 'loaded') sync.poke();
      });
    });
    return () => {
      alive = false;
      off();
      sync.dispose();
    };
  }, [sync]);

  // The runner lock.
  useEffect(() => {
    const update = () => void runnerTab().then(setRunner);
    update();
    return watchRunner(update);
  }, []);

  // Live state and toasts from the Studio tabs.
  useEffect(() => {
    installBus();
    const offState = onQueueState((s, tabId) => {
      if (tabId === undefined) return;
      setStates((m) => new Map(m).set(tabId, s));
      const sig = `${s.rev}|${JSON.stringify(s.channel)}`;
      if (tabId === targetRef.current?.tabId && seen.current.get(tabId) !== sig) sync.poke();
      seen.current.set(tabId, sig);
    });
    // Toasts from the bound tab only: a stop sent to another tab is announced by the panel
    // itself, naming that tab (3b), and that tab's own toasts show in its page.
    const offToast = onQueueToast((msg, tabId) => {
      if (tabId !== undefined && tabId === targetRef.current?.tabId) toast(msg);
    });
    // The drawer re-rendered the schedule every minute (times move past "15 minutes ahead").
    const minute = setInterval(() => sync.poke(), 60_000);
    return () => {
      offState();
      offToast();
      clearInterval(minute);
    };
  }, [sync]);

  const api = useMemo<PanelApi>(() => {
    const state = target ? states.get(target.tabId) ?? view?.state ?? null : null;
    const runnerState = runner ? states.get(runner.tabId) ?? null : null;
    return {
      lang, data, target, link, view, state, runner,
      liveState: runnerState ?? state,
      elsewhere: !!runner && runner.tabId !== target?.tabId,
      send: target ? toTab(target.tabId) : () => Promise.reject(new Error('no Studio tab')),
      sendTo: toTab,
      write: writes,
      refresh: () => sync.poke(),
    };
  }, [lang, data, target, link, view, states, runner, sync]);

  return <PanelContext.Provider value={api}>{children}</PanelContext.Provider>;
}
