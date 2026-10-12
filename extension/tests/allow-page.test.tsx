// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllowPage } from '../entrypoints/allow/AllowPage';
import { createHandles } from '../lib/file-handles';
import { setLang } from '../lib/i18n';
import { fakeChrome, type Answer } from './fake-files';

// allow.html in a tab of a fake Chrome that shows one question per requestPermission() call
// (tests/fake-files.ts). The page shows what queryPermission() says, never what was clicked.
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const BUTTON = 'Ask Chrome for file access';
const DONE = 'Every stored file is readable. You can close this tab.';
const LATER = 'If the side panel asks for file access again later, "Allow this time" was picked: open this page again and pick "Allow on every visit".';
const EMPTY = 'No video is stored yet. Chrome only asks about a real file: add a video to the queue in the side panel first, then come back to this page.';

// Files stored by a page that is gone, and the allow page open in a tab.
async function open(ids: string[], answers: Answer[] = []) {
  const chrome = fakeChrome();
  const adder = chrome.page();
  for (const id of ids) await adder.put(id, adder.pick(`/v/${id}.mp4`));
  adder.close();
  chrome.answers.push(...answers);
  const page = chrome.page('tab');
  const files = createHandles(page.load, page.list);
  render(<AllowPage files={files} stored={page.list} />);
  await flush();
  const button = () => screen.getByRole('button', { name: BUTTON }) as HTMLButtonElement;
  const click = () => page.click(async () => { fireEvent.click(button()); await flush(); });
  return { chrome, page, files, button, click };
}
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  setLang('en');
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the Allow file access page', () => {
  it('says what it is for and which of Chrome\'s buttons to pick, in English and in Thai', async () => {
    await open(['a']);
    expect(text()).toContain('Press the button below, and in Chrome\'s question pick "Allow on every visit".');
    expect(text()).toContain('You do this once');
    cleanup();
    setLang('th');
    await open(['a']);
    expect(text()).toContain('"Allow on every visit"');
    expect(screen.getByRole('button', { name: 'ขอสิทธิ์อ่านไฟล์จาก Chrome' })).toBeTruthy();
  });

  it('"Allow on every visit" on the first question: one question, every file readable, and the tab stays open', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const { chrome, button, click } = await open(['a', 'b', 'c'], ['always']);
    expect(text()).toContain('Readable: 0 of 3 stored file(s)');
    expect(text()).not.toContain(DONE);
    await click();
    expect(chrome.requests).toEqual(['/v/a.mp4']);
    expect(text()).toContain('Readable: 3 of 3 stored file(s)');
    expect(screen.getByRole('status').textContent).toContain(DONE);
    expect(screen.getByRole('status').textContent).toContain(LATER);
    expect(button().disabled).toBe(true); // nothing left to ask
    expect(close).not.toHaveBeenCalled();
    expect(vi.mocked(console.info).mock.calls.map((c) => c.join(' '))).toEqual(['[ytup] regrant a: prompt -> granted']);
  });

  it('dismissed questions: says how many files Chrome has not allowed, and the button stays', async () => {
    const { button, click } = await open(['a', 'b'], ['once', 'dismiss']);
    await click();
    expect(text()).toContain('Readable: 1 of 2 stored file(s)');
    expect(screen.getByRole('status').textContent).toContain('Chrome has not allowed 1 file(s) yet. Press the button again and pick "Allow on every visit".');
    expect(text()).not.toContain(DONE);
    expect(button().disabled).toBe(false);
  });

  it('before any click it does not say a question went unanswered', async () => {
    await open(['a', 'b']);
    expect(text()).not.toContain('has not allowed');
  });

  it('"Don\'t allow": says how to unblock, and with nothing left to ask the button is off', async () => {
    const { button, click } = await open(['a', 'b'], ['deny', 'once']);
    await click();
    expect(screen.getByRole('status').textContent).toContain('The browser blocked reading 1 file(s) — remove those videos from the queue and add the files again');
    expect(text()).not.toContain(DONE);
    expect(button().disabled).toBe(true);
  });

  it('files that are readable already: says so and asks nothing', async () => {
    const { chrome, page, files, button } = await open([]);
    const h = page.pick('/v/a.mp4'); // just dropped on the panel: readable
    await page.put('a', h);
    files.keep('a', h);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    expect(screen.getByRole('status').textContent).toContain(DONE);
    expect(button().disabled).toBe(true);
    expect(chrome.requests).toEqual([]);
  });

  it('no stored file: says to add a video first, the button is off, and it looks again when the tab is shown', async () => {
    const { chrome, button } = await open([]);
    expect(screen.getByRole('status').textContent).toBe(EMPTY);
    expect(button().disabled).toBe(true);
    fireEvent.click(button());
    await flush();
    expect(chrome.requests).toEqual([]);
    const other = chrome.page();
    await other.put('a', other.pick('/v/a.mp4'));
    other.close();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(text()).not.toContain(EMPTY);
    expect(text()).toContain('Readable: 0 of 1 stored file(s)');
    expect(button().disabled).toBe(false);
  });

  it('does not read the store again while Chrome\'s question is open: the click\'s own look is the one shown', async () => {
    const chrome = fakeChrome();
    const adder = chrome.page();
    await adder.put('a', adder.pick('/v/a.mp4'));
    adder.close();
    const page = chrome.page('tab');
    let answer = (_s: PermissionState) => {};
    const files = createHandles(async (id) => {
      const h = (await page.load(id))!;
      h.requestPermission = () => new Promise<PermissionState>((r) => { answer = r; });
      return h;
    }, page.list);
    const stored = vi.fn(page.list);
    render(<AllowPage files={files} stored={stored} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));
    await flush();
    expect((screen.getByRole('button', { name: BUTTON }) as HTMLButtonElement).disabled).toBe(true); // one question at a time
    stored.mockClear();
    window.dispatchEvent(new Event('focus')); // Chrome's question closing gives the focus back
    await flush();
    expect(stored).not.toHaveBeenCalled();
    await act(async () => answer('prompt'));
    await flush();
    expect(screen.getByRole('status').textContent).toContain('Chrome has not allowed 1 file(s) yet.');
    expect((screen.getByRole('button', { name: BUTTON }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a store that cannot be read is reported, not shown as empty', async () => {
    render(<AllowPage files={createHandles(async () => undefined, async () => [])} stored={() => Promise.reject(new Error('idb broke'))} />);
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('Could not read the stored files: Error: idb broke');
    expect(text()).not.toContain(EMPTY);
  });
});

describe('the allow page in the build', () => {
  const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  it("logs as 'allow', not as the panel", async () => {
    const dom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
    dom.setURL('chrome-extension://abc/allow.html');
    vi.resetModules();
    try {
      expect((await import('../entrypoints/sidepanel/crash-kit')).ctx).toBe('allow');
    } finally {
      dom.setURL('about:blank');
    }
  });
  it('its classes are in the shared stylesheet', () => {
    expect(src('entrypoints/sidepanel/style.css')).toMatch(/^@source '\.\.\/allow';/m);
  });
  it('is opened by the extension only: not web-accessible', () => {
    expect(src('wxt.config.ts')).toContain("web_accessible_resources: [{ resources: ['file-bridge.html'], matches: ['https://studio.youtube.com/*'] }]");
  });
});
