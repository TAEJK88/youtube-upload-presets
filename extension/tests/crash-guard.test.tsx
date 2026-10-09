// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';

// main.tsx's dependencies, each test choosing how they behave.
const startup = vi.hoisted(() => ({
  ensureMigrated: (): Promise<unknown> => Promise.resolve(5),
  initI18n: (): Promise<unknown> => Promise.resolve('en'),
}));
vi.mock('../lib/messages', async (orig) => ({
  ...(await orig<typeof import('../lib/messages')>()),
  sendMessage: vi.fn((type: string) => (type === 'ensureMigrated' ? startup.ensureMigrated() : new Promise(() => {}))),
}));
// The console wrapper is tested in debug-log.test.ts; here it would wrap the console spies.
vi.mock('../lib/debug-log', async (orig) => ({ ...(await orig<typeof import('../lib/debug-log')>()), installDebugCapture: vi.fn() }));
vi.mock('../lib/i18n', async (orig) => ({ ...(await orig<typeof import('../lib/i18n')>()), initI18n: vi.fn(() => startup.initI18n()) }));
// The tree main.tsx mounts: only what these tests need of it.
vi.mock('../entrypoints/sidepanel/panel', () => ({ PanelProvider: ({ children }: { children: unknown }) => children }));
vi.mock('../entrypoints/sidepanel/ask', () => ({ AskProvider: ({ children }: { children: unknown }) => children }));
let appThrows = false;
vi.mock('../entrypoints/sidepanel/App', () => ({
  App: () => {
    if (appThrows) throw new TypeError('ChannelBar exploded');
    return <p>panel ok</p>;
  },
}));

const guardMod = () => import('../entrypoints/sidepanel/crash-guard');

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
  appThrows = false;
  startup.ensureMigrated = () => Promise.resolve(5);
  startup.initI18n = () => Promise.resolve('en');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  cleanup();
  (await guardMod()).disposeCrashGuard();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const fallback = () => document.getElementById('ytup-crash');
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });

describe('side panel startup', () => {
  it('renders the panel and reaches the ready stage', async () => {
    await import('../entrypoints/sidepanel/main');
    await settle();
    expect(screen.getByText('panel ok')).toBeTruthy();
    expect((await guardMod()).currentStage()).toBe('ready');
    expect(fallback()).toBeNull();
  });

  it('a rejecting initI18n shows the fallback (not a blank panel), with the error and the stage', async () => {
    startup.initI18n = () => Promise.reject(new Error('storage exploded'));
    await import('../entrypoints/sidepanel/main');
    await settle();
    const f = fallback()!;
    expect(f).toBeTruthy();
    expect(f.getAttribute('role')).toBe('alert');
    expect(f.textContent).toContain('The extension hit an error');
    expect(f.querySelector('pre')!.textContent).toContain('storage exploded');
    expect(f.textContent).toContain('i18n');
    for (const name of ['Copy details', 'Open debug page', 'Reload panel']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('a hanging ensureMigrated trips the watchdog after 8 s, naming the stage', async () => {
    vi.useFakeTimers();
    startup.ensureMigrated = () => new Promise(() => {});
    await import('../entrypoints/sidepanel/main');
    await vi.advanceTimersByTimeAsync(7900);
    expect(fallback()).toBeNull();
    await vi.advanceTimersByTimeAsync(200);
    expect(fallback()!.textContent).toContain("The panel didn't start: still waiting for the background (ensureMigrated)…");
  });

  it('a render throw in the shell shows the RootBoundary fallback', async () => {
    appThrows = true;
    await import('../entrypoints/sidepanel/main');
    await settle();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The extension hit an error');
    expect(alert.textContent).toContain('ChannelBar exploded');
    expect(screen.getByRole('button', { name: 'Open debug page' })).toBeTruthy();
    expect(console.error).toHaveBeenCalledWith('[ytup] panel crashed', expect.any(TypeError), expect.anything());
  });
});

describe('the crash guard itself', () => {
  it('an uncaught error while #root is empty shows the fallback; once the panel is up it only logs', async () => {
    const g = await guardMod();
    window.dispatchEvent(Object.assign(new Event('error'), { error: new RangeError('early'), message: 'early' }));
    await settle();
    expect(fallback()!.textContent).toContain('RangeError: early');
    fallback()!.remove();
    document.getElementById('root')!.innerHTML = '<p>up</p>';
    g.stage('ready');
    window.dispatchEvent(Object.assign(new Event('error'), { error: new RangeError('late'), message: 'late' }));
    await settle();
    expect(fallback()).toBeNull();
  });

  it('the buttons: copy details, open the debug page, reload', async () => {
    const g = await guardMod();
    g.failStartup(new Error('nope'));
    const write = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy details' })));
    const text = write.mock.calls[0]![0] as string;
    for (const part of ['Error: nope', 'User agent:', 'Version:', 'Time:', 'Stage:']) expect(text).toContain(part);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open debug page' })));
    expect(create).toHaveBeenCalledWith({ url: browser.runtime.getURL('/debug.html') });
  });
});
