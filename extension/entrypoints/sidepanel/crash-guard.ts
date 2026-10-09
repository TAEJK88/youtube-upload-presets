import { installDebugCapture } from '@/lib/debug-log';
import { crashDetails, ctx, currentStage, ID, render, resetStage, rootEmpty, stuckLine, uncaught, WATCHDOG_MS } from './crash-kit';

export { currentStage, failStartup, stage } from './crash-kit';

// The panel is never blank. main.tsx imports this module FIRST (ES modules evaluate in
// import order), so it is listening before anything else can fail: an import that throws
// while evaluating, a startup step that rejects, or one that never ends.
// - An uncaught error or rejection while #root is empty shows a fallback (plain DOM, inline
//   styles: React or the stylesheet may be what broke). Once the panel is up, an error React
//   didn't catch unmounts the tree, #root empties, and the fallback shows then; anything else
//   only goes to the debug log, so a stray rejection doesn't cover a working panel.
// - A watchdog: #root still empty WATCHDOG_MS after load shows the fallback naming the stage
//   main.tsx reported last (stage()).
// The debug page (debug.html) uses the same guard. The pieces it shares with the React
// boundaries are in crash-kit.ts.
let disposers: (() => void)[] = [];

export function installCrashGuard(): void {
  installDebugCapture(ctx, { target: window }); // logs every error below, too
  const onError = (ev: Event) => {
    const e = ev as ErrorEvent;
    uncaught(e.error ?? e.message);
  };
  const onRejection = (ev: Event) => uncaught((ev as PromiseRejectionEvent).reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  const dog = setTimeout(() => {
    if (currentStage() === 'ready' || !rootEmpty() || document.getElementById(ID)) return;
    const s = currentStage();
    render(stuckLine(s), stuckLine(s), crashDetails(new Error(stuckLine(s)), s));
  }, WATCHDOG_MS);
  disposers.push(() => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    clearTimeout(dog);
  });
}

// Tests: undo installCrashGuard().
export function disposeCrashGuard(): void {
  for (const d of disposers) d();
  disposers = [];
  resetStage();
  document.getElementById(ID)?.remove();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installCrashGuard();
