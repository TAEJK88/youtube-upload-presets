import { browser } from 'wxt/browser';
import { CONNECT, FILE_CH, type FileOps } from './file-bridge';
import { portEndpoint, rpcClient } from './rpc';

// Content-script side: mount the hidden bridge iframe and talk to it over a
// private MessageChannel, so page scripts never see the traffic.
export function mountFileBridge(doc: Document, timeoutMs = 30_000) {
  const frame = doc.createElement('iframe');
  frame.src = browser.runtime.getURL('/file-bridge.html');
  frame.style.display = 'none';
  const { port1, port2 } = new MessageChannel();
  const ready = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => {
      frame.contentWindow!.postMessage({ ch: CONNECT }, new URL(frame.src).origin, [port2]);
      resolve();
    }, { once: true });
  });
  doc.documentElement.append(frame);
  const call = rpcClient<FileOps>(portEndpoint(port1), FILE_CH, timeoutMs);
  return {
    async getFile(itemId: string): Promise<File> {
      await ready;
      return call('getFile', itemId);
    },
  };
}
