import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import type { ClaimsLogLine, ClaimsState, ClaimsView } from '@/lib/claims/types';
import { getLang, L, setLang, watchLang } from '@/lib/i18n';
import { sendMessage, type ProtocolMap, type QueueState } from '@/lib/messages';
import { installBus, onClaimsLog, onClaimsShow, onClaimsState, onQueueState, onQueueToast } from '@/lib/panel/bus';
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
  runner: RunnerTab | null; // the tab holding the runner lock, if any (may be the target)
  elsewhere: boolean; // another tab is running the queue
  busyElsewhere: boolean; // another tab holds the lock for any job (the queue or copyright work)
  send: ToTab; // to the target
  sendTo(tabId: number): ToTab;
  write: Writes;
  refresh(): void;
  // Queued files whose read permission went back to 'prompt' (Banners finds them, as it is
  // always mounted): Start waits for the Re-grant when the run would read one of them
  // (QueueFooter, runReads), and cards read their previews again
  // once `grantRev` moves (bumped after each re-grant).
  lost: string[];
  grantRev: number;
  setLost(ids: string[], regranted?: boolean): void;
}

const noop = () => {};
export const PanelContext = createContext<PanelApi>({
  lang: 'en', data: null, target: null, link: 'noTab', view: null, runner: null, elsewhere: false, busyElsewhere: false,
  send: () => Promise.reject(new Error('no Studio tab')), sendTo: toTab, write: writes, refresh: noop,
  lost: [], grantRev: 0, setLost: noop,
});
export const usePanel = () => useContext(PanelContext);

// The progress that moves every ~0.8 s lives apart from PanelContext: only what calls
// useLive() re-renders with it, not every tab's contents.
export interface LiveApi {
  state: QueueState | null; // the bound tab's live state (newer than view.state)
  liveState: QueueState | null; // the live state of the tab running the queue, else the bound tab's
}
export const LiveContext = createContext<LiveApi>({ state: null, liveState: null });
export const useLive = () => useContext(LiveContext);

// The copyright module's live state (D24): the bound tab's, and the lock holder's while it runs a
// copyright job in another tab (like LiveApi for the queue). The log is kept here, newest first.
export interface ClaimsApi {
  state: ClaimsState | null; // the bound tab's
  live: ClaimsState | null; // the lock holder's while it runs a copyright job elsewhere, else `state`
  log: ClaimsLogLine[];
  shown: { view: ClaimsView; n: number } | null; // the bound tab finished a scan: open this list
  addLog(msg: string, type?: string): void; // a line the panel itself logs (Auto-pilot on/off)
}
export const ClaimsContext = createContext<ClaimsApi>({ state: null, live: null, log: [], shown: null, addLog: () => {} });
export const useClaims = () => useContext(ClaimsContext);
const LOG_MAX = 80; // logBox kept 80 lines (6179)

const sameRunner = (a: RunnerTab | null, b: RunnerTab | null) =>
  a === b || (!!a && !!b && a.tabId === b.tabId && a.windowId === b.windowId && a.title === b.title && a.jobs.join() === b.jobs.join());

export function PanelProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [link, setLink] = useState<LinkStatus>('noTab');
  const [view, setView] = useState<QueueView | null>(null);
  const [states, setStates] = useState<ReadonlyMap<number, QueueState>>(new Map());
  const [runner, setRunner] = useState<RunnerTab | null>(null);
  const runnerId = runner?.tabId;
  const targetId = target?.tabId;
  const [lang, setLangState] = useState(getLang());
  const targetRef = useRef<Target | null>(null);
  const runnerRef = useRef<number | undefined>(undefined);
  useEffect(() => { runnerRef.current = runnerId; }, [runnerId]);
  const seen = useRef(new Map<number, string>()); // rev + channel per tab: re-read the view when it moves
  const linkRef = useRef<LinkStatus>('noTab');
  const sync = useMemo(
    () => createViewSync({
      fetch: (id) => sendMessage('queue:view', undefined, id),
      onView: setView,
      onStatus: (s) => { linkRef.current = s; setLink(s); },
      onError: (e) => toast(L(`อ่านคิวจากแท็บ Studio ไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't read the queue from the Studio tab (${(e as Error)?.message ?? e})`)),
    }),
    [],
  );

  // Stored data, and the language with it.
  useEffect(() => {
    void readPanelData().then(setData).catch((e) => console.error('[ytup] read panel data failed', e));
    const offData = watchPanelData(setData);
    // L() reads the module's language: watchLang switches it the moment settings change,
    // and the new `lang` re-renders every usePanel() consumer.
    const offLang = watchLang(setLangState);
    const queueChanged = (changes: Record<string, unknown>, area: string) => {
      // songHistory: the cards' "previously claimed" chips (refreshClaimWarnings, 5188)
      if (area === 'local' && ('queue' in changes || 'songHistory' in changes)) sync.poke();
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

  const runnerSeq = useRef(0);
  const updateRunner = useCallback(() => {
    const seq = ++runnerSeq.current;
    void runnerTab().then((next) => {
      if (seq !== runnerSeq.current) return; // a newer check started: this answer is stale
      setRunner((prev) => (sameRunner(prev, next) ? prev : next));
    }).catch((e) => console.error('[ytup] runner tab failed', e));
  }, []);

  // Which tab.
  useEffect(() => {
    let alive = true;
    let windowId: number | undefined;
    let off = noop;
    const rebind = async () => {
      if (windowId === undefined) return;
      const t = await activeStudioTab(windowId).catch((e) => (console.error('[ytup] active Studio tab failed', e), null));
      if (!alive) return;
      const changed = t?.tabId !== targetRef.current?.tabId;
      targetRef.current = t;
      setTarget(t);
      if (changed) {
        sync.bind(t?.tabId ?? null);
        updateRunner();
      }
    };
    void browser.windows.getCurrent().then((w) => {
      if (!alive || w.id === undefined) return;
      windowId = w.id;
      void rebind();
      off = watchTabs(w.id, (e) => {
        if (e === 'loading') return sync.loading();
        void rebind();
        if (e === 'loaded') sync.loaded(); // not 'titled': a title change is no new document
      });
    });
    return () => {
      alive = false;
      off();
      sync.dispose();
      targetRef.current = null;
    };
  }, [sync, updateRunner]);

  // The runner lock, re-checked when its tab navigates away or closes.
  useEffect(() => {
    updateRunner();
    return watchRunner(updateRunner);
  }, [updateRunner]);

  // Live state and toasts from the Studio tabs.
  useEffect(() => {
    installBus();
    const offState = onQueueState((s, tabId) => {
      if (tabId === undefined) return;
      if (tabId !== targetRef.current?.tabId && tabId !== runnerRef.current) return;
      setStates((m) => new Map(m).set(tabId, s));
      const sig = `${s.rev}|${JSON.stringify(s.channel)}`;
      // Not linked yet: a reloaded page's first broadcast can look just like the old page's.
      if (tabId === targetRef.current?.tabId && (seen.current.get(tabId) !== sig || linkRef.current !== 'ok')) sync.poke();
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

  // Only the bound tab's and the runner's states are kept (closed or other tabs are pruned).
  useEffect(() => {
    setStates((m) => {
      const keep = [...m.keys()].filter((id) => id === targetId || id === runnerId);
      return keep.length === m.size ? m : new Map(keep.map((id) => [id, m.get(id)!]));
    });
  }, [targetId, runnerId]);

  // The copyright module's state per tab (the bound one and the lock holder), its log and the
  // list a finished scan asks to open.
  const [claimStates, setClaimStates] = useState<ReadonlyMap<number, ClaimsState>>(new Map());
  const [log, setLog] = useState<ClaimsLogLine[]>([]);
  const [shown, setShown] = useState<ClaimsApi['shown']>(null);
  const addLog = useCallback((msg: string, type = '') => setLog((l) => [{ at: Date.now(), msg, type }, ...l].slice(0, LOG_MAX)), []);
  // The bound tab's copyright state at bind time (later changes come as broadcasts).
  useEffect(() => {
    if (targetId === undefined || link !== 'ok') return;
    let alive = true;
    void sendMessage('claims:view', undefined, targetId)
      .then((s) => { if (alive && s) setClaimStates((m) => new Map(m).set(targetId, s)); })
      .catch((e) => console.error('[ytup] claims:view failed', e));
    return () => { alive = false; };
  }, [targetId, link]);
  useEffect(() => {
    installBus();
    const ours = (tabId: number | undefined): tabId is number => tabId !== undefined && (tabId === targetRef.current?.tabId || tabId === runnerRef.current);
    const offState = onClaimsState((s, tabId) => { if (ours(tabId)) setClaimStates((m) => new Map(m).set(tabId, s)); });
    const offLog = onClaimsLog((l, tabId) => { if (ours(tabId)) setLog((cur) => [l, ...cur].slice(0, LOG_MAX)); });
    const offShow = onClaimsShow((view, tabId) => {
      if (tabId !== undefined && tabId === targetRef.current?.tabId) setShown((s) => ({ view, n: (s?.n ?? 0) + 1 }));
    });
    return () => { offState(); offLog(); offShow(); };
  }, []);
  // Like `states`: only the bound tab's and the runner's are kept.
  useEffect(() => {
    setClaimStates((m) => {
      const keep = [...m.keys()].filter((id) => id === targetId || id === runnerId);
      return keep.length === m.size ? m : new Map(keep.map((id) => [id, m.get(id)!]));
    });
  }, [targetId, runnerId]);
  const runsClaims = !!runner?.jobs.includes('claims');
  const claims = useMemo<ClaimsApi>(() => {
    const state = targetId !== undefined ? claimStates.get(targetId) ?? null : null;
    const holder = runnerId !== undefined && runnerId !== targetId && runsClaims ? claimStates.get(runnerId) ?? null : null;
    return { state, live: holder ?? state, log, shown, addLog };
  }, [claimStates, targetId, runnerId, runsClaims, log, shown, addLog]);

  const [grant, setGrant] = useState<{ lost: string[]; rev: number }>({ lost: [], rev: 0 });
  const setLost = useCallback((ids: string[], regranted = false) => {
    setGrant((g) => {
      const same = g.lost.length === ids.length && g.lost.every((id, i) => id === ids[i]);
      return same && !regranted ? g : { lost: same ? g.lost : ids, rev: g.rev + (regranted ? 1 : 0) };
    });
  }, []);

  // The holder's queue state is the live one only while it runs the queue (not copyright work).
  const runsQueue = !!runner?.jobs.includes('queue');
  const live = useMemo<LiveApi>(() => {
    const state = targetId !== undefined ? states.get(targetId) ?? view?.state ?? null : null;
    const runnerState = runnerId !== undefined && runsQueue ? states.get(runnerId) ?? null : null;
    return { state, liveState: runnerState ?? state };
  }, [states, targetId, runnerId, runsQueue, view]);

  const api = useMemo<PanelApi>(() => {
    return {
      lang, data, target, link, view, runner,
      elsewhere: !!runner && runner.tabId !== target?.tabId && runner.jobs.includes('queue'),
      busyElsewhere: !!runner && runner.tabId !== target?.tabId,
      send: target ? toTab(target.tabId) : () => Promise.reject(new Error('no Studio tab')),
      sendTo: toTab,
      write: writes,
      refresh: () => { sync.poke(); updateRunner(); },
      lost: grant.lost,
      grantRev: grant.rev,
      setLost,
    };
  }, [lang, data, target, link, view, runner, sync, updateRunner, grant, setLost]);

  return (
    <PanelContext.Provider value={api}>
      <LiveContext.Provider value={live}>
        <ClaimsContext.Provider value={claims}>{children}</ClaimsContext.Provider>
      </LiveContext.Provider>
    </PanelContext.Provider>
  );
}
