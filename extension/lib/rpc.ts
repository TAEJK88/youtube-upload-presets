// Request/response on top of postMessage. Used between the content script and
// the MAIN-world script (same window) and between the content script and the
// file-bridge iframe (MessagePort). Requests carry `op`, responses carry `ok`,
// so a side that hears its own traffic (same window) ignores it.

export interface Endpoint {
  post(msg: unknown, transfer?: Transferable[]): void;
  listen(fn: (data: unknown) => void): () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handlers = Record<string, (...args: any[]) => unknown>;

interface Req { ch: string; id: string; op: string; args: unknown[] }
type Res = { ch: string; id: string; ok: true; value: unknown } | { ch: string; id: string; ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const isReq = (ch: string, d: unknown): d is Req =>
  isObj(d) && d.ch === ch && typeof d.id === 'string' && typeof d.op === 'string' && Array.isArray(d.args);
const isRes = (ch: string, d: unknown): d is Res =>
  isObj(d) && d.ch === ch && typeof d.id === 'string' && typeof d.ok === 'boolean';

export function rpcServe<H extends Handlers>(ep: Endpoint, ch: string, handlers: H): () => void {
  return ep.listen(async (d) => {
    if (!isReq(ch, d) || !Object.hasOwn(handlers, d.op)) return;
    try {
      ep.post({ ch, id: d.id, ok: true, value: await (handlers[d.op] as (...args: unknown[]) => unknown)(...d.args) });
    } catch (e) {
      ep.post({ ch, id: d.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export function rpcClient<H extends Handlers>(ep: Endpoint, ch: string, timeoutMs = 10_000) {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  ep.listen((d) => {
    if (!isRes(ch, d)) return;
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    clearTimeout(p.timer);
    if (d.ok) p.resolve(d.value);
    else p.reject(new Error(d.error));
  });
  const prefix = Math.random().toString(36).slice(2);
  let seq = 0;
  return <K extends keyof H & string>(op: K, ...args: Parameters<H[K]>): Promise<Awaited<ReturnType<H[K]>>> =>
    new Promise((resolve, reject) => {
      const id = `${prefix}-${++seq}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${op}: timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        ep.post({ ch, id, op, args });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
}

export function portEndpoint(port: MessagePort): Endpoint {
  return {
    post: (msg, transfer = []) => port.postMessage(msg, transfer),
    listen(fn) {
      const h = (e: MessageEvent) => fn(e.data);
      port.addEventListener('message', h);
      port.start();
      return () => port.removeEventListener('message', h);
    },
  };
}

export function windowEndpoint(win: Window, targetOrigin: string): Endpoint {
  return {
    post: (msg, transfer = []) => win.postMessage(msg, targetOrigin, transfer),
    listen(fn) {
      const h = (e: Event) => {
        const m = e as MessageEvent;
        if (m.source === win) fn(m.data);
      };
      win.addEventListener('message', h);
      return () => win.removeEventListener('message', h);
    },
  };
}
