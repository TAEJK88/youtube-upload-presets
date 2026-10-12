import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { handles } from '@/lib/file-handles';
import { L } from '@/lib/i18n';
import { installBus, onFilesLost } from '@/lib/panel/bus';
import { needingGrant, queuedFileIds, stillLocked, type Lost } from '@/lib/panel/regrant';
import type { QueueView } from '@/lib/studio/queue-view';

// The banner's button (short: it shares a 320px panel with Re-grant) and Settings'.
export const allowAlwaysLabel = () => L('อนุญาตตลอดไป…', 'Always allow…');
export const allowFilesLabel = () => L('อนุญาตอ่านไฟล์ตลอดไป…', 'Always allow file access…');

// The "Allow file access" page (entrypoints/allow), in a normal tab: there Chrome can show
// its question with "Allow on every visit", which a side panel never shows. Nothing is asked
// here; the panel looks again when it is shown or focused, so the banner follows what was
// answered in that tab.
export function openAllowPage(): void {
  void Promise.resolve()
    .then(() => browser.tabs.create({ url: browser.runtime.getURL('/allow.html') }))
    .catch((e) => console.error('[ytup] open allow page', e));
}

export interface FileAccess {
  // Queued files without read access ('prompt', or 'denied': a blocked prompt). The banner
  // offers a re-grant for all of them.
  noAccess: Lost[];
  grantRev: number; // moves after each re-grant: cards read their previews again
  regrant(): void; // the banner's click
  // Start's click: looks again, asks the browser for what is at 'prompt', and says whether
  // the run can go: not while one of `reads` stays at 'prompt' (a denied file fails its own
  // item when it uploads).
  accessForStart(reads: string[]): Promise<boolean>;
}

// Read access to the queued files, as this panel sees it. Chrome can withdraw it at any time
// (lib/file-handles.ts), so one look when the queue changes is not enough: the panel looks
// again when it becomes visible, when a Studio tab says its bridge could not read a file,
// after every Re-grant click and when Start is pressed.
export function useFileAccess(view: QueueView | null, ours: (tabId: number | undefined) => boolean, refresh: () => void): FileAccess {
  const [found, setFound] = useState<Lost[]>([]);
  // What a Studio tab could not read. It shows in the banner whatever this panel's own look
  // says, until the next Re-grant click: the tab's toast and its item's message name that button.
  // (Or until this panel itself sees the file become readable again: the focus look below.)
  const [told, setTold] = useState<string[]>([]);
  const [grantRev, setRev] = useState(0);
  const ids = view ? queuedFileIds(view.items).join(',') : '';
  const queued = useRef<string[]>([]);
  const seq = useRef(0);
  const last = useRef<string[]>([]); // what the newest look found unreadable
  const look = useCallback(async () => {
    const n = ++seq.current;
    const l = await needingGrant(queued.current);
    if (n === seq.current) { // else a newer look started: this answer is stale
      last.current = l.map((x) => x.id);
      setFound(l);
    }
    return l;
  }, []);
  useEffect(() => {
    queued.current = ids ? ids.split(',') : [];
    void handles.prune(queued.current);
    void look();
  }, [ids, look]);
  useEffect(() => {
    const again = () => {
      if (document.visibilityState !== 'visible') return;
      const before = last.current;
      // Access given elsewhere meanwhile (the allow page, in its tab). Only files this panel
      // itself saw unreadable and now sees readable: a Studio tab's report about them is
      // answered, and cards read their previews again. A file only a tab reported stays.
      void look().then((l) => {
        const back = before.filter((id) => queued.current.includes(id) && !l.some((x) => x.id === id));
        if (!back.length) return;
        setTold((t) => t.filter((id) => !back.includes(id)));
        setRev((r) => r + 1);
      });
    };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
    };
  }, [look]);
  useEffect(() => {
    installBus();
    return onFilesLost((lostIds, tabId) => {
      if (!ours(tabId)) return;
      setTold((t) => [...new Set([...t, ...lostIds])]);
      void look();
    });
  }, [ours, look]);

  const noAccess = useMemo(() => {
    const now = ids ? ids.split(',') : [];
    const seen = new Set(found.map((x) => x.id));
    return [...found.filter((x) => now.includes(x.id)), ...told.filter((id) => now.includes(id) && !seen.has(id)).map((id): Lost => ({ id, state: 'prompt' }))];
  }, [ids, found, told]);
  const shown = useRef({ noAccess, told });
  useEffect(() => { shown.current = { noAccess, told }; }, [noAccess, told]);

  const regrant = useCallback(() => {
    const want = shown.current.noAccess.map((x) => x.id);
    const wasTold = shown.current.told;
    // requestPermission() goes out inside the click (handles.request's first step).
    void handles.request(want).then(async (asked) => {
      // A file the tab could not read while this panel could: the click had nothing to ask.
      const unread = asked.filter((a) => a.before === 'granted' && wasTold.includes(a.id));
      for (const a of unread) console.info(`[ytup] regrant ${a.id}: granted -> granted (a Studio tab could not read it)`);
      setTold((t) => t.filter((id) => !want.includes(id)));
      await look();
      setRev((r) => r + 1);
      refresh();
      const stuck = asked.filter((a) => a.after !== 'granted').length + unread.length;
      if (stuck) toast(stillLocked(stuck, asked.some((a) => a.after === 'prompt')));
    });
  }, [look, refresh]);

  const accessForStart = useCallback(async (reads: string[]) => {
    // requestPermission() goes out inside the click, before the preflight and its question.
    const asked = await handles.request(reads);
    await look(); // the banner and the Start gate show what is left
    if (asked.some((a) => a.before !== a.after)) setRev((r) => r + 1);
    const stuck = asked.filter((a) => a.after === 'prompt').length;
    if (stuck) toast(stillLocked(stuck, true));
    return !stuck;
  }, [look]);

  return useMemo(() => ({ noAccess, grantRev, regrant, accessForStart }), [noAccess, grantRev, regrant, accessForStart]);
}
