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
// bridge's own answers ('missing', 'permission', 'read'), which a new frame won't change.
const BRIDGE_DOWN = /^(bridge not ready|bridge removed|getFile: timed out)/;

interface Mount {
  n: number;
  frame: HTMLIFrameElement;
  port: MessagePort;
  call: ReturnType<typeof rpcClient<FileOps>>;
  loaded: Promise<void>; // never rejects: a frame that loads late still connects
  stopWatch: () => void;
}

export interface FileBridge {
  getFile(itemId: string): Promise<File>;
  dispose(): void;
}

export function createFileBridge(doc: Document, timeoutMs = 30_000): FileBridge {
  let mount: Mount | null = null;
  let seq = 0;

  function open(): Mount {
    const n = ++seq;
    const frame = doc.createElement('iframe');
    frame.src = browser.runtime.getURL('/file-bridge.html');
    frame.style.display = 'none';
    const { port1, port2 } = new MessageChannel();
    let connected = false;
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => {
        if (connected) return;
        connected = true;
        frame.contentWindow!.postMessage({ ch: CONNECT }, new URL(frame.src).origin, [port2]);
        log(`#${n} loaded and connected`);
        resolve();
      });
    });
    doc.documentElement.append(frame);
    log(`#${n} mounted`);
    let stopWatch = () => {};
    if (typeof MutationObserver === 'function') {
      const mo = new MutationObserver(() => {
        if (!frame.isConnected) {
          log(`#${n} removed from the DOM by the page`);
          mo.disconnect();
        }
      });
      mo.observe(doc.documentElement, { childList: true });
      stopWatch = () => mo.disconnect();
    }
    return { n, frame, port: port1, call: rpcClient<FileOps>(portEndpoint(port1), FILE_CH, timeoutMs), loaded, stopWatch };
  }

  function close(m: Mount, why: string) {
    log(`#${m.n} dropped (${why})`);
    m.stopWatch();
    m.call.dispose('bridge removed');
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
        log(`#${m.n} load timeout after ${timeoutMs} ms (in DOM: ${m.frame.isConnected})`);
        reject(new Error('bridge not ready'));
      }, timeoutMs);
    });
    try {
      await Promise.race([m.loaded, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getFile(itemId) {
      for (let attempt = 0; ; attempt++) {
        const m = current();
        try {
          await ready(m);
          return await m.call('getFile', itemId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // The last frame stays mounted: if it loads later, the next request uses it.
          if (attempt >= 1 || !BRIDGE_DOWN.test(msg)) throw e;
          close(m, msg);
        }
      }
    },
    dispose() {
      if (mount) close(mount, 'disposed');
    },
  };
}
