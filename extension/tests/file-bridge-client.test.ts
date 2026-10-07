import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_CH, type FileOps } from '../lib/file-bridge';
import { createFileBridge } from '../lib/file-bridge-client';
import { portEndpoint, rpcServe } from '../lib/rpc';

// A fake Document whose iframes record their load listener, the port handed over on
// connect, and whether they are still attached.
interface FakeFrame {
  src: string;
  style: Record<string, string>;
  attached: boolean;
  readonly isConnected: boolean;
  load(): void;
  port(): MessagePort | undefined;
  remove(): void;
  addEventListener(ev: string, fn: () => void): void;
  contentWindow: { postMessage(msg: unknown, origin: string, transfer?: Transferable[]): void };
}

function fakeDoc() {
  const frames: FakeFrame[] = [];
  const doc = {
    createElement: () => {
      let onLoad: (() => void) | undefined;
      let posted: Transferable[] | undefined;
      const f: FakeFrame = {
        src: '',
        style: {},
        attached: false,
        get isConnected() { return this.attached; },
        load: () => onLoad?.(),
        port: () => posted?.[0] as MessagePort | undefined,
        remove() { this.attached = false; },
        addEventListener: (ev, fn) => { if (ev === 'load') onLoad = fn; },
        contentWindow: { postMessage: (_m, _o, transfer) => { posted = transfer; } },
      };
      frames.push(f);
      return f;
    },
    documentElement: { append: (f: FakeFrame) => { f.attached = true; } },
  } as unknown as Document;
  return { doc, frames };
}

const ports: MessagePort[] = [];
// Serve getFile on a frame's port the way entrypoints/file-bridge/main.ts does.
function serve(f: FakeFrame, getFile: FileOps['getFile'] = async (id) => new File(['abc'], id + '.mp4')) {
  const p = f.port();
  if (!p) throw new Error('no port transferred');
  ports.push(p);
  rpcServe<FileOps>(portEndpoint(p), FILE_CH, { getFile });
}

beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { ports.splice(0).forEach((p) => p.close()); vi.restoreAllMocks(); });

describe('createFileBridge', () => {
  it('mounts nothing until the first file is needed', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 1000);
    expect(frames).toHaveLength(0);
    const got = bridge.getFile('clip');
    expect(frames).toHaveLength(1);
    frames[0]!.load();
    serve(frames[0]!);
    // Node 22 clones File as Blob over MessagePort, so check content instead of .name
    expect(await (await got).text()).toBe('abc');
    bridge.dispose();
  });

  it('tries one fresh frame, then rejects with "bridge not ready"', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 30);
    await expect(bridge.getFile('x')).rejects.toThrow('bridge not ready');
    expect(frames).toHaveLength(2);
    expect(frames[0]!.attached).toBe(false); // the dead one is removed
    expect(frames[1]!.attached).toBe(true); // the last one stays, in case it loads late
    bridge.dispose();
  });

  it('a frame that loads after the timeout still serves the next request', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 30);
    await expect(bridge.getFile('x')).rejects.toThrow('bridge not ready');
    frames[1]!.load();
    serve(frames[1]!);
    expect(await (await bridge.getFile('late')).text()).toBe('abc');
    expect(frames).toHaveLength(2); // no third frame
    bridge.dispose();
  });

  it('replaces a frame the page removed', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 1000);
    const first = bridge.getFile('a');
    frames[0]!.load();
    serve(frames[0]!);
    await first;
    frames[0]!.remove();
    const second = bridge.getFile('b');
    expect(frames).toHaveLength(2);
    frames[1]!.load();
    serve(frames[1]!);
    expect(await (await second).text()).toBe('abc');
    bridge.dispose();
  });

  it('does not retry an answer from the bridge', async () => {
    const { doc, frames } = fakeDoc();
    const bridge = createFileBridge(doc, 1000);
    const got = bridge.getFile('gone');
    frames[0]!.load();
    serve(frames[0]!, async () => { throw new Error('missing'); });
    await expect(got).rejects.toThrow('missing');
    expect(frames).toHaveLength(1);
    bridge.dispose();
  });

  it('logs what happened to each frame', async () => {
    const { doc } = fakeDoc();
    const bridge = createFileBridge(doc, 30);
    await expect(bridge.getFile('x')).rejects.toThrow();
    const lines = vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
    expect(lines).toEqual(expect.arrayContaining([
      '[ytup] file bridge: #1 mounted',
      '[ytup] file bridge: #1 load timeout after 30 ms (in DOM: true)',
      '[ytup] file bridge: #1 dropped (bridge not ready)',
      '[ytup] file bridge: #2 mounted',
    ]));
    bridge.dispose();
  });
});
