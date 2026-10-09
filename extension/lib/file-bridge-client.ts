import { browser } from 'wxt/browser';
import { CONNECT, FILE_CH, type FileOps } from './file-bridge';
import { portEndpoint, rpcClient } from './rpc';

// Content-script side: a hidden extension-origin iframe that reads the side panel's
// IndexedDB, reached over a private MessageChannel so page scripts never see the traffic.
//
// On a real Studio tab the iframe was seen missing from the DOM after load (cause not
// known yet), so the frame is mounted only when a file is first needed, a frame that is
// gone or never came up is replaced once per request, and every step is logged with a
// `[ytup] file bridge:` prefix to find out what removes it.

const log = (msg: string) => console.info('[ytup] file bridge: ' + msg);

// Errors meaning the bridge itself is unusable (worth one fresh frame), as opposed to the
// bridge's own answers ('missing', 'permission', 'denied', 'read'), which a new frame won't change.
const BRIDGE_DOWN = /^(bridge not ready|bridge removed|getFile: timed out)/;

interface Mount {
  n: number;
  sent: boolean; // connect posted to the frame
  frame: HTMLIFrameElement;
  port: MessagePort;
  call: ReturnType<typeof rpcClient<FileOps>>;
  loaded: Promise<void>; // resolves on the bridge's ack; never rejects: a frame that loads late still connects
  gone: Promise<never>; // rejects with 'bridge removed' once this mount is closed
  failGone: (e: Error) => void;
  stopWatch: () => void;
  closed: boolean; // close() ran: later calls for this mount do nothing
}

export interface FileBridge {
  getFile(itemId: string): Promise<File>;
  dispose(): void;
}

export interface FileBridgeOptions {
  MutationObserver?: typeof MutationObserver;
}

export function createFileBridge(doc: Document, timeoutMs = 30_000, opts: FileBridgeOptions = {}): FileBridge {
  let mount: Mount | null = null;
  let seq = 0;
  let disposed = false;
  const MO = opts.MutationObserver ?? globalThis.MutationObserver;

  function open(): Mount {
    const n = ++seq;
    const t0 = performance.now();
    const since = () => Math.round(performance.now() - t0);
    const frame = doc.createElement('iframe');
    frame.src = browser.runtime.getURL('/file-bridge.html');
    frame.style.display = 'none';
    const { port1, port2 } = new MessageChannel();
    let connected = false;
    let onAck = () => {};
    const loaded = new Promise<void>((resolve) => {
      onAck = resolve;
    });
    frame.addEventListener('load', () => {
      if (connected) return;
      connected = true;
      const tConnect = performance.now();
      port1.addEventListener('message', (e: MessageEvent) => {
        if (e.data?.ch !== FILE_CH || e.data.ack !== true) return;
        log(`#${n} connected (ack after ${Math.round(performance.now() - tConnect)} ms)`);
        onAck();
      });
      port1.start();
      frame.contentWindow!.postMessage({ ch: CONNECT }, new URL(frame.src).origin, [port2]);
      log(`#${n} loaded, connect sent`);
      m.sent = true;
    });
    doc.documentElement.append(frame);
    log(`#${n} mounted (readyState ${doc.readyState}, +${since()} ms)`);
    let failGone: (e: Error) => void = () => {};
    const gone = new Promise<never>((_, reject) => {
      failGone = reject;
    });
    gone.catch(() => {});
    const m: Mount = { sent: false, n, frame, port: port1, call: rpcClient<FileOps>(portEndpoint(port1), FILE_CH, timeoutMs), loaded, gone, failGone, stopWatch: () => {}, closed: false };
    if (typeof MO === 'function') {
      const mo = new MO(() => {
        if (!frame.isConnected) {
          log(`#${n} removed from the DOM by the page (+${since()} ms after mount, readyState ${doc.readyState})`);
          close(m, 'removed from the DOM');
        }
      });
      mo.observe(doc.documentElement, { childList: true });
      m.stopWatch = () => mo.disconnect();
    }
    return m;
  }

  function close(m: Mount, why: string) {
    if (m.closed) return;
    m.closed = true;
    log(`#${m.n} dropped (${why})`);
    m.stopWatch();
    m.call.dispose('bridge removed');
    m.failGone(new Error('bridge removed'));
    m.port.close();
    m.frame.remove();
    if (mount === m) mount = null;
  }

  function current(): Mount {
    if (mount && !mount.frame.isConnected) close(mount, 'no longer in the DOM');
    return (mount ??= open());
  }

  async function ready(m: Mount) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        log(m.sent
          ? `#${m.n} loaded but no ack \u2014 frame blocked?`
          : `#${m.n} load timeout after ${timeoutMs} ms (in DOM: ${m.frame.isConnected})`);
        reject(new Error('bridge not ready'));
      }, timeoutMs);
    });
    try {
      await Promise.race([m.loaded, m.gone, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getFile(itemId) {
      for (let attempt = 0; ; attempt++) {
        if (disposed) throw new Error('bridge disposed');
        const m = current();
        try {
          await ready(m);
          return await m.call('getFile', itemId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // The last frame stays mounted: if it loads later, the next request uses it.
          if (disposed) throw new Error('bridge disposed');
          if (attempt >= 1 || !BRIDGE_DOWN.test(msg)) throw e;
          close(m, msg);
        }
      }
    },
    dispose() {
      disposed = true;
      if (mount) close(mount, 'disposed');
    },
  };
}
