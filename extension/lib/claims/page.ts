import { L } from '../i18n';
import { sendMessage } from '../messages';
import { cachedCfg } from '../studio/channel';
import { claimsState, log, startScan, type ClaimsUi } from './claims';
import { setWriteFailed } from './store';

// The Studio content script's side of the copyright module: what the drawer's pane did, sent to
// the side panel instead (D24). A broadcast fails when no panel is open; that is fine.
export function createClaimsPage(d: {
  send?: typeof sendMessage;
  toast(msg: string): void;
  refreshCfg(): Promise<void>; // ytcfg again (INNERTUBE_CONTEXT arrives after the page script runs)
}) {
  const send = d.send ?? sendMessage;
  let last = '';
  let cfgAt = 0;
  let live = true;
  const broadcast = () => {
    if (!live) return;
    const s = claimsState();
    const sig = JSON.stringify(s);
    if (sig === last) return;
    last = sig;
    send('claims:state', s).catch(() => {});
  };
  const ui: ClaimsUi = {
    show: (view) => void (live && send('claims:show', view).catch(() => {})),
    status: broadcast,
    log: (msg, type) => void (live && send('claims:log', { at: Date.now(), msg, type }).catch(() => {})),
    toast: (msg) => d.toast(msg),
  };
  // A copyright write the background refused or didn't answer (store.ts): the tab's copy went back
  // to what is stored, so a scan that just said "complete" is not what the panel shows. Said where
  // the action started: a toast, on the page and in the panel, and an error line in the activity log.
  setWriteFailed((_key, e) => {
    const msg = L(`บันทึกไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't save (${(e as Error)?.message ?? e})`);
    log(msg, 'err');
    d.toast(msg);
  });
  return {
    ui,
    // Every 0.8 s (the userscript's tick, 6361): until Studio has its context, read ytcfg again
    // every 10 s; then the state, if it changed.
    tick() {
      if (!cachedCfg('INNERTUBE_CONTEXT') && Date.now() - cfgAt > 10_000) {
        cfgAt = Date.now();
        void d.refreshCfg().catch(() => {});
      }
      broadcast();
    },
    // claims:scan: ytcfg is read again first. cachedCfg() is a copy from startup, the last tick
    // or a queue start; the scan's "Studio hasn't finished loading" check and its channel use it.
    async scan(what: unknown) {
      if (what !== 'claims' && what !== 'ads' && what !== 'collab') return;
      await d.refreshCfg().catch((e) => console.warn('[ytup] ytcfg before a scan', e));
      if (live) startScan(what);
    },
    dispose() {
      live = false;
      setWriteFailed(null);
    },
  };
}
