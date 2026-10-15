// After the extension is reloaded or updated, the content scripts already running in open
// tabs are orphaned: every chrome.* call throws "Extension context invalidated". WXT tells
// them through ctx.onInvalidated; this collects what each one must stop by then.
export interface Invalidatable {
  readonly isInvalid: boolean;
  onInvalidated(cb: () => void): unknown;
}

export function stopOnInvalidated(ctx: Invalidatable, log: Pick<Console, 'info'> = console) {
  const teardowns: (() => void)[] = [];
  let stopped = false;
  const drain = () => {
    for (const fn of teardowns.splice(0).reverse()) {
      try {
        fn();
      } catch (e) {
        console.warn('[ytup] teardown failed', e);
      }
    }
  };
  ctx.onInvalidated(() => {
    if (stopped) return;
    stopped = true;
    drain();
    log.info('[ytup] extension reloaded — page automation stopped');
  });
  return {
    // Something to stop on invalidation; stopped at once if that already happened.
    add(fn: () => void) {
      teardowns.push(fn);
      if (stopped) drain();
    },
  };
}
