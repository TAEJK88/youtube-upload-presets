import { afterEach, describe, expect, it } from 'vitest';
import { portEndpoint, rpcClient, rpcServe, windowEndpoint, type Endpoint } from '../lib/rpc';

type Ops = {
  add(a: number, b: number): number;
  slow(): Promise<string>;
  boom(): never;
};

const open: MessagePort[] = [];
function pair(): [Endpoint, Endpoint] {
  const { port1, port2 } = new MessageChannel();
  open.push(port1, port2);
  return [portEndpoint(port1), portEndpoint(port2)];
}
afterEach(() => open.splice(0).forEach((p) => p.close()));

const handlers: Ops = {
  add: (a, b) => a + b,
  slow: () => new Promise((r) => setTimeout(() => r('late'), 50)),
  boom: () => { throw new Error('missing'); },
};

describe('rpc', () => {
  it('returns the handler result', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    const call = rpcClient<Ops>(a, 'test');
    expect(await call('add', 2, 3)).toBe(5);
  });

  it('awaits async handlers', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    expect(await rpcClient<Ops>(a, 'test')('slow')).toBe('late');
  });

  it('rejects with the handler error message', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    await expect(rpcClient<Ops>(a, 'test')('boom')).rejects.toThrow('missing');
  });

  it('ignores other channels and times out', async () => {
    const [a, b] = pair();
    rpcServe(b, 'other', handlers);
    await expect(rpcClient<Ops>(a, 'test', 30)('add', 1, 1)).rejects.toThrow('add: timed out after 30 ms');
  });

  it('keeps concurrent calls apart', async () => {
    const [a, b] = pair();
    rpcServe(b, 'test', handlers);
    const call = rpcClient<Ops>(a, 'test');
    expect(await Promise.all([call('slow'), call('add', 1, 2), call('add', 10, 20)])).toEqual(['late', 3, 30]);
  });

  it('windowEndpoint only hears messages whose source is the same window', () => {
    const target = new EventTarget() as unknown as Window;
    const heard: unknown[] = [];
    windowEndpoint(target, '*').listen((d) => heard.push(d));
    const fire = (data: unknown, source: unknown) =>
      (target as unknown as EventTarget).dispatchEvent(Object.assign(new Event('message'), { data, source }));
    fire('from-self', target);
    fire('from-iframe', {});
    expect(heard).toEqual(['from-self']);
  });
});
