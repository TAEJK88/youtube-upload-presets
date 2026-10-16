// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// A fake runtime port per connect(); the test drops and ticks them by hand.
const ports: { name: string; msg: (() => void)[]; gone: (() => void)[]; closed: boolean }[] = [];
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      connect: ({ name }: { name: string }) => {
        const p = { name, msg: [] as (() => void)[], gone: [] as (() => void)[], closed: false };
        ports.push(p);
        return {
          onMessage: { addListener: (fn: () => void) => p.msg.push(fn) },
          onDisconnect: { addListener: (fn: () => void) => p.gone.push(fn) },
          disconnect: () => { p.closed = true; },
        };
      },
    },
  },
}));
const { clearSteady, steadyInterval, TICK_PORT } = await import('../lib/steady-tick');

let hidden = true;
beforeEach(() => {
  ports.length = 0;
  hidden = true;
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const slowBase = () => {
  const fns: (() => void)[] = [];
  return { base: (fn: () => void) => { fns.push(fn); return fns.length; }, fire: () => fns.forEach((f) => f()) };
};

it('a hidden tab runs on the background\'s ticks', () => {
  const { base } = slowBase();
  const fn = vi.fn();
  const id = steadyInterval(base, fn, 1000);
  expect(ports.map((p) => p.name)).toEqual([TICK_PORT]);
  vi.advanceTimersByTime(1000);
  ports[0]!.msg.forEach((m) => m());
  expect(fn).toHaveBeenCalledTimes(1);
  clearSteady(id);
  expect(ports[0]!.closed).toBe(true);
});

it('a port the background drops while the tab is hidden is connected again', () => {
  const { base } = slowBase();
  const id = steadyInterval(base, () => {}, 1000);
  vi.advanceTimersByTime(6000);
  ports[0]!.gone.forEach((g) => g());
  expect(ports).toHaveLength(2);
  clearSteady(id);
});

it('a port dropped right away is not retried in a loop, the page timer tries again later', () => {
  const { base, fire } = slowBase();
  const id = steadyInterval(base, () => {}, 1000);
  ports[0]!.gone.forEach((g) => g());
  expect(ports).toHaveLength(1);
  fire();
  expect(ports).toHaveLength(2);
  clearSteady(id);
});

it('nothing connects once cleared', () => {
  const { base, fire } = slowBase();
  const id = steadyInterval(base, () => {}, 1000);
  clearSteady(id);
  fire();
  expect(ports).toHaveLength(1);
});
