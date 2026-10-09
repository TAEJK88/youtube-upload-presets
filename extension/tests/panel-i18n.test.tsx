// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../entrypoints/sidepanel/App';
import { PresetsFooter } from '../entrypoints/sidepanel/tabs/PresetsTab';
import { setLang } from '../lib/i18n';
import { toPanelData } from '../lib/panel/data';
// @ts-expect-error -- untyped build script, shared with npm run ui-check
import { userscriptPairs } from '../scripts/ui-check.mjs';
// @ts-expect-error -- untyped list, shared with npm run ui-check
import extensionOnly from '../scripts/strings/extension-only.mjs';
import { fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

afterEach(() => {
  cleanup();
  setLang('en');
});

// The English side of the userscript's pairs (and the extension's own, extension-only.mjs) that
// differ from their Thai. A pair with ${} becomes a pattern (its literal text must hold a word,
// so '${}%' alone matches nothing).
type Pair = { th: string; en: string };
const pairs = [...(userscriptPairs() as Pair[]), ...(extensionOnly as Pair[])].filter((p) => p.th !== p.en);
const exact = new Set(pairs.filter((p) => !p.en.includes('${}')).map((p) => p.en.trim()).filter(Boolean));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = pairs
  .filter((p) => p.en.includes('${}') && /[A-Za-z]{3}/.test(p.en.replaceAll('${}', '')))
  .map((p) => ({ en: p.en, re: new RegExp('^' + p.en.trim().split('${}').map(esc).join('[\\s\\S]*') + '$') }));
const english = (s: string) => exact.has(s) || patterns.some((p) => p.re.test(s));

function leaks(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent!.trim();
    if (t && english(t)) out.push(t);
  }
  for (const el of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
    for (const a of ['title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute(a)?.trim();
      if (v && english(v)) out.push(`${a}="${v}"`);
    }
  }
  return out;
}

const AT = 1_900_000_000_000;
const items = [
  { status: 'pending', txt: '0:05 A - B\n3:00 C - D\n6:00 E - F', txtName: 'a.txt', tracklist: { errors: ['x'], warnings: [], count: 3 }, at: AT, artists: '' },
  { status: 'error', draftId: 'abcdefghijk', msg: 'x', thumb: { name: 'a.jpg', size: 1e5, type: 'image/jpeg' } },
  { status: 'uploading' }, { status: 'review' }, { status: 'done', videoId: 'abcdefghijk' },
] as Parameters<typeof viewWith>[0];
const schedule = { on: true, set: true, start: AT, late: true, times: [AT], skipped: 1, taken: [] };
// Thai first: the default presets are made in the current language, like the userscript's first run.
const thData = (over: Record<string, unknown> = {}) =>
  setLang('th') ?? toPanelData({ settings: { lang: 'th', schedule: { on: true, start: '2030-01-01T08:00', every: 1, unit: 'day' }, ...over } });

async function renderThai(api: ReturnType<typeof fakePanel>, live = fakeLive()) {
  setLang('th');
  const r = renderPanel(<><App /><PresetsFooter /></>, { ...api, lang: 'th' }, live);
  // Open what starts folded: the cards and the channel list.
  const expand = screen.queryByRole('button', { name: /ขยายทั้งหมด/ });
  if (expand) await act(async () => fireEvent.click(expand));
  return r.container;
}

describe('the panel in Thai', () => {
  it('shows no English string from the userscript: idle queue, every card state, schedule, presets, settings', async () => {
    const root = await renderThai(fakePanel({ data: thData(), view: viewWith(items, { schedule }) }));
    expect(screen.getByRole('button', { name: /ย่อทั้งหมด/ })).toBeTruthy(); // the cards are open
    expect(leaks(root)).toEqual([]);
    // The ask() dialog (Retry with a leftover draft) renders outside the container.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' })));
    expect(document.body.textContent).toContain('คลิปนี้อยู่ใน Studio แล้ว');
    expect(leaks(document.body)).toEqual([]);
  });

  it('…nor while running, with another tab running, or with a channel problem', async () => {
    const running = state({ running: true, prog: { i: 1, n: 3, pct: 40, label: 'x' } as never, channel: { ...state().channel, problem: 'x' } });
    const root = await renderThai(
      fakePanel({
        data: thData({ lockChannel: { id: 'UC9', name: 'Other' } }),
        view: viewWith(items, { schedule, current: 'i2', state: running }),
        elsewhere: true,
        runner: { tabId: 2, windowId: 1, title: 'Other Studio' } as never,
      }),
      fakeLive({ state: running, liveState: running }),
    );
    expect(root.textContent).toContain('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่'); // the runner-elsewhere banner
    expect(leaks(root)).toEqual([]);
  });

  it('…nor when the tab has no content script', async () => {
    const root = await renderThai(fakePanel({ data: thData(), link: 'noScript', view: null }));
    expect(root.textContent).toContain('โหลดแท็บนี้ใหม่');
    expect(leaks(root)).toEqual([]);
  });
});
