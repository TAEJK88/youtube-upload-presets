// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../entrypoints/sidepanel/App';
import { PresetsFooter } from '../entrypoints/sidepanel/tabs/PresetsTab';
import { setLang } from '../lib/i18n';
import { toPanelData } from '../lib/panel/data';
import { needingGrant } from '../lib/panel/regrant';
import { runnerTab } from '../lib/panel/target';
import { mountFab, type FabModel } from '../lib/studio/fab';
import { showReloadBanner } from '../lib/studio/reload-banner';
// @ts-expect-error -- untyped build script, shared with npm run ui-check
import { userscriptPairs } from '../scripts/ui-check.mjs';
// @ts-expect-error -- untyped list, shared with npm run ui-check
import extensionOnly from '../scripts/strings/extension-only.mjs';
import { fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

// The Re-grant banner asks IndexedDB for each queued handle's permission; the fake has none.
vi.mock('../lib/panel/regrant', async (orig) => ({ ...(await orig<typeof import('../lib/panel/regrant')>()), needingGrant: vi.fn(async () => []) }));
// The import question first asks the background whether a run holds the lock.
vi.mock('../lib/panel/target', async (orig) => ({ ...(await orig<typeof import('../lib/panel/target')>()), runnerTab: vi.fn(async () => null) }));

beforeEach(() => {
  vi.mocked(needingGrant).mockReset().mockResolvedValue([]);
  vi.mocked(runnerTab).mockReset().mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  document.querySelector('#ytup-fab')?.remove();
  document.querySelector('#ytup-reload')?.remove();
  setLang('en');
});

// The userscript's pairs and the extension's own (extension-only.mjs). A pair with ${} becomes
// a pattern (its literal text must hold a word, so '${}%' alone matches nothing).
type Pair = { th: string; en: string };
const all = [...(userscriptPairs() as Pair[]), ...(extensionOnly as Pair[])];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matcher(pairs: Pair[], side: 'th' | 'en') {
  const exact = new Set(pairs.filter((p) => !p[side].includes('${}')).map((p) => p[side].trim()).filter(Boolean));
  const patterns = pairs
    .filter((p) => p[side].includes('${}') && /\p{L}{3}/u.test(p[side].replaceAll('${}', '')))
    .map((p) => new RegExp('^' + p[side].trim().split('${}').map(esc).join('[\\s\\S]*') + '$'));
  return (s: string) => exact.has(s) || patterns.some((re) => re.test(s));
}
// Check 1, known English: the English side of a pair whose Thai differs.
const english = matcher(all.filter((p) => p.th !== p.en), 'en');
const thai = matcher(all, 'th');

// Check 2, any English: check 1 can't see English that has no pair (a JSX literal, a library's
// default label, English built around a pair). So in Thai, no Latin word may show except:
// - in text that is the Thai side of a pair (reviewed with its pair: Thai keeps Studio's own
//   labels, such as "กด Save", in English);
// - in the presets' own text (user content; the defaults are the same in both languages);
// - in the literals the userscript shows in both languages (SAME_IN_BOTH);
// - the tokens below. Add one only with its reason. The fixtures here are Thai so they need none.
const LATIN_OK = new Set([
  'YouTube', 'Studio', 'Chapters', 'EP', 'UC', // names the Thai strings keep in English
  'Alt', // the shortcut chips (kbd) name the keys
]);
// Literals the userscript shows the same in both languages (no L()): its language picker
// (4496, 4500) and Studio's own option names (4518, 4530).
const SAME_IN_BOTH = new Set(['Language / ภาษา', 'English', 'Paid promotion', 'None of the above']);
const LATIN_IGNORE: RegExp[] = [
  /\{[a-z_0-9]+\}/g, // template variables: {n}, {title}, {track1}
  /\.(mp4|mov|txt|jpg|png|json)\b/gi, // file extensions
  /\bhttps?:\/\/\S+/g, // URLs
  /\b(alt|Alt)\+[A-Z0-9]\b/g, // keyboard shortcuts in a label (Sonner adds alt+T to its region's)
  /\b\d+(\.\d+)?\s?(MB|GB|kB|KB|px|ms|s|h|min)\b/g, // numbers with units
];
const words = (s: string) => {
  let t = s;
  for (const re of LATIN_IGNORE) t = t.replace(re, ' ');
  return t.match(/[A-Za-z]{2,}/g) ?? [];
};
let dataWords = new Set<string>(); // set by thData()
const latin = (s: string) => (thai(s) || SAME_IN_BOTH.has(s) ? [] : words(s).filter((w) => !LATIN_OK.has(w) && !dataWords.has(w)));

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-valuetext', 'aria-description'];
// Every text node and the attributes a screen reader or tooltip shows, in light and shadow DOM.
function texts(root: Node): string[] {
  const out: string[] = [];
  const walk = (r: Node) => {
    const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement?.closest('style,script')) continue;
      const t = n.textContent!.trim();
      if (t) out.push(t);
    }
    const els = r instanceof Element || r instanceof Document || r instanceof DocumentFragment ? r.querySelectorAll('*') : [];
    for (const el of els) {
      for (const a of ATTRS) {
        const v = el.getAttribute(a)?.trim();
        if (v) out.push(`${a}="${v}"`);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return out;
}
const leaks = (root: Node) => texts(root).filter((t) => english(t.replace(/^[\w-]+="(.*)"$/s, '$1')));
const latinLeaks = (root: Node) => texts(root).flatMap((t) => latin(t.replace(/^[\w-]+="(.*)"$/s, '$1')).map((w) => `${w} in ${t}`));
const clean = (root: Node) => {
  expect(leaks(root)).toEqual([]);
  expect(latinLeaks(root)).toEqual([]);
};

const AT = 1_900_000_000_000;
const items = [
  { status: 'pending', txt: '0:05 ก - ข\n3:00 ค - ง\n6:00 จ - ฉ', txtName: 'a.txt', tracklist: { errors: ['x'], warnings: [], count: 3 }, at: AT, artists: '' },
  { status: 'error', draftId: '01234567890', msg: 'ผิด', thumb: { name: 'a.jpg', size: 1e5, type: 'image/jpeg' } },
  { status: 'uploading' }, { status: 'review' }, { status: 'done', videoId: '01234567890' },
].map((it, i) => ({ file: { name: `คลิป ${i + 1}.mp4`, size: 2e8, type: 'video/mp4' }, title: `ชื่อ ${i + 1}`, ...it })) as Parameters<typeof viewWith>[0];
const channel = { ...state().channel, name: 'ช่องฉัน', label: 'ช่องฉัน', handle: '@ฉัน' };
const schedule = { on: true, set: true, start: AT, late: true, times: [AT], skipped: 1, taken: [] };
// Thai first: the default presets are made in the current language, like the userscript's first run.
const thData = (over: Record<string, unknown> = {}) => {
  setLang('th');
  const d = toPanelData({ settings: { lang: 'th', schedule: { on: true, start: '2030-01-01T08:00', every: 1, unit: 'day' }, ...over } });
  dataWords = new Set(words(JSON.stringify(d.presets)));
  return d;
};
const thView = (over: Parameters<typeof viewWith>[1] = {}) => viewWith(items, { schedule, channel, state: state({ channel }), ...over });

async function renderThai(api: ReturnType<typeof fakePanel>, live = fakeLive({ state: state({ channel }), liveState: state({ channel }) })) {
  setLang('th');
  const r = renderPanel(<><App /><PresetsFooter /></>, { ...api, lang: 'th' }, live);
  await act(async () => {}); // the Re-grant banner's permission check
  // Open what starts folded: the cards and the channel list.
  const expand = screen.queryByRole('button', { name: /ขยายทั้งหมด/ });
  if (expand) await act(async () => fireEvent.click(expand));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /ช่องอื่น ๆ/ })));
  return r.container;
}
const click = (name: string | RegExp) => act(async () => fireEvent.click(screen.getAllByRole('button', { name }).at(-1)!));
const dialog = () => screen.getByRole('dialog');
const cancel = () => act(async () => fireEvent.keyDown(dialog(), { key: 'Escape' }));

describe('the panel in Thai', () => {
  it('shows no English: idle queue, every card state, channel list, schedule, presets, settings', async () => {
    const root = await renderThai(fakePanel({ data: thData(), view: thView() }));
    expect(screen.getByRole('button', { name: /ย่อทั้งหมด/ })).toBeTruthy(); // the cards are open
    expect(screen.getByPlaceholderText(/UC/)).toBeTruthy(); // the channel list is open
    clean(document.body); // with what renders outside the container
    expect(root.textContent).toContain('ช่องฉัน');
  });

  it('…nor in the five questions: Retry, Start (with every warning), delete and reset preset, import', async () => {
    const api = fakePanel({ data: thData({ confirmStart: true }), view: thView() });
    vi.mocked(api.send).mockImplementation((async (type: string) =>
      type === 'queue:preflight'
        ? {
          pendingN: 6, channel: { id: 'UC1', name: 'ช่องฉัน', avatar: '' }, ids: ['i0'], editRev: 1, times: [AT, AT + 864e5], vis: 'PRIVATE',
          noTxt: 1, noThumb: 2, needsConfirm: true,
          badTime: Array.from({ length: 6 }, (_, i) => ({ name: `คลิป ${i}.mp4`, at: AT })),
          prevUp: [{ name: 'คลิป 1.mp4', title: 'ชื่อเก่า' }],
          badTl: [{ name: 'คลิป 1.mp4', error: 'บรรทัด 2' }],
        }
        : undefined) as never);
    await renderThai(api);

    await click('ลองใหม่'); // Retry with a leftover draft
    expect(dialog().textContent).toContain('คลิปนี้อยู่ใน Studio แล้ว');
    clean(document.body);
    await cancel();

    await click(/เริ่มอัปโหลด 1 คลิป/);
    expect(dialog().textContent).toContain('เคยอัปขึ้นช่องนี้แล้ว 1 คลิป');
    expect(dialog().textContent).toContain('… และอีก 1 คลิป');
    clean(document.body);
    await cancel();

    await click('ลบ');
    expect(dialog().textContent).toContain('ลบพรีเซ็ต');
    clean(document.body);
    await cancel();

    await click('คืนค่าเริ่มต้น');
    expect(dialog().textContent).toContain('คืนค่าพรีเซ็ตทั้งหมด?');
    clean(document.body);
    await cancel();

    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('input[type=file][accept*=json]')!;
      const backup = JSON.stringify({ app: 'yt-upload-presets', format: 1, presets: [{ id: 'a', label: 'ก' }] });
      fireEvent.change(input, { target: { files: [new File([backup], 'b.json', { type: 'application/json' })] } });
    });
    expect(dialog().textContent).toContain('นำเข้าพรีเซ็ต 1 รายการ');
    clean(document.body);
  });

  it('…nor while running, with another tab running, or with a channel problem', async () => {
    const problem = { ...channel, problem: 'ช่องไม่ตรง' };
    const running = state({ running: true, prog: { i: 1, n: 3, pct: 40, label: 'x' } as never, channel: problem });
    const root = await renderThai(
      fakePanel({
        data: thData({ lockChannel: { id: 'UC9', name: 'ช่องอื่น' } }),
        view: thView({ current: 'i2', state: running, channel: problem }),
        elsewhere: true,
        runner: { tabId: 2, windowId: 1, title: 'สตูดิโออื่น' } as never,
      }),
      fakeLive({ state: running, liveState: running }),
    );
    expect(root.textContent).toContain('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่'); // the runner-elsewhere banner
    clean(document.body);
  });

  it('…nor when the tab has no content script', async () => {
    const root = await renderThai(fakePanel({ data: thData(), link: 'noScript', view: null }));
    expect(root.textContent).toContain('โหลดแท็บนี้ใหม่');
    clean(document.body);
  });

  it('…nor with the Re-grant banner (queued files lost read permission)', async () => {
    vi.mocked(needingGrant).mockResolvedValue([{ id: 'i0', state: 'prompt' }, { id: 'i1', state: 'prompt' }]);
    const root = await renderThai(fakePanel({ data: thData(), view: thView() }));
    expect(root.textContent).toContain('อนุญาตอีกครั้ง (2 ไฟล์)');
    clean(document.body);
  });
});

describe('the page UI in Thai', () => {
  const model = (over: Partial<FabModel> = {}): FabModel => ({
    channel: 'ช่องฉัน', problem: '', locked: true, preset: 'พรีเซ็ต', activity: null, pending: 2, total: 3, ...over,
  });

  it('the FAB: before its first update, idle, running, with a channel problem', () => {
    setLang('th');
    const fab = mountFab(() => {});
    clean(document.documentElement);
    fab.update(model());
    expect(document.querySelector('#ytup-fab')!.shadowRoot!.textContent).toContain('ช่องฉัน');
    clean(document.documentElement);
    fab.update(model({ activity: { task: 'upload', icon: '⬆', tab: 'queue', count: { at: 1, of: 2 }, title: '', detail: '', progress: 0.25 } }));
    clean(document.documentElement);
    fab.update(model({ problem: 'ช่องไม่ตรง' }));
    clean(document.documentElement);
    fab.remove();
  });

  it('the reload banner', () => {
    setLang('th');
    const host = showReloadBanner(() => {});
    expect(host.shadowRoot!.textContent).toContain('โหลดแท็บนี้ใหม่');
    clean(document.documentElement);
  });
});
