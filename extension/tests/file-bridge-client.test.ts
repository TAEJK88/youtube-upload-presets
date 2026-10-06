import { describe, expect, it } from 'vitest';
import { FILE_CH, type FileOps } from '../lib/file-bridge';
import { mountFileBridge } from '../lib/file-bridge-client';
import { portEndpoint, rpcServe } from '../lib/rpc';

// Minimal fake iframe + Document: records the load listener and the
// MessagePort transferred via contentWindow.postMessage.
function fakeDoc() {
  let loadFn: (() => void) | undefined;
  let posted: { msg: unknown; transfer?: Transferable[] } | undefined;
  const frame = {
    style: {} as Record<string, string>,
    src: '',
    addEventListener: (ev: string, fn: () => void) => { if (ev === 'load') loadFn = fn; },
    contentWindow: {
      postMessage: (msg: unknown, _origin: string, transfer?: Transferable[]) => { posted = { msg, transfer }; },
    },
  };
  const doc = {
    createElement: () => frame,
    documentElement: { append: () => {} },
  } as unknown as Document;
  return { doc, fireLoad: () => loadFn?.(), port: () => posted?.transfer?.[0] as MessagePort | undefined };
}

describe('mountFileBridge', () => {
  it('rejects getFile with "bridge not ready" when the iframe never loads', async () => {
    const { doc } = fakeDoc();
    const bridge = mountFileBridge(doc, 30);
    await expect(bridge.getFile('x')).rejects.toThrow('bridge not ready');
  }, 1000);

  it('resolves getFile once the iframe loads and serves the request', async () => {
    const { doc, fireLoad, port } = fakeDoc();
    const bridge = mountFileBridge(doc, 30_000);
    fireLoad();
    const port2 = port();
    if (!port2) throw new Error('no port transferred');
    const stop = rpcServe<FileOps>(portEndpoint(port2), FILE_CH, {
      getFile: async (id) => new File(['abc'], id + '.mp4'),
    });
    const file = await bridge.getFile('clip');
    // Node 22 clones File as Blob over MessagePort, so check content instead of .name
    expect(await file.text()).toBe('abc');
    stop();
    port2.close();
  });
});
