// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
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
import { claimsStateWith, fakeClaims, fakeLive, fakePanel, renderPanel, state, viewWith } from './panel-fake';

// The Re-grant banner asks IndexedDB for each queued handle's permission; the fake has none.
vi.mock('../lib/panel/regrant', async (orig) => ({ ...(await orig<typeof import('../lib/panel/regrant')>()), needingGrant: vi.fn(async () => []) }));
// The import question first asks the background whether a run holds the lock.
vi.mock('../lib/panel/target', async (orig) => ({ ...(await orig<typeof import('../lib/panel/target')>()), runnerTab: vi.fn(async () => null) }));

beforeEach(() => {
  vi.mocked(needingGrant).mockReset().mockResolvedValue([]);
  vi.mocked(runnerTab).mockReset().mockResolvedValue(null);
});
afterEach(async () => {
  cleanup();
  await fakeBrowser.storage.local.remove(['logOpen', 'claimScan:UC1', 'trimQueue:UC1', 'trimResults:UC1', 'songHistory', 'uploads',
    'adsScan:UC1', 'adsResults:UC1', 'collabScan:UC1', 'collabResults:UC1', 'collabLinks:UC1', 'collabHandles', 'cfg', 'updateCheck']);
  vi.restoreAllMocks(); // the update banner's manifest version
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
// (4496, 4500), Studio's own option names (4518, 4530), the CSV download buttons (4931, 5248),
// the Collab view's handles placeholder (5491), the Collab button (6195) and Auto-pilot (6210).
const SAME_IN_BOTH = new Set(['Language / ภาษา', 'English', 'Paid promotion', 'None of the above', '⬇ CSV', 'Collab', 'Auto-pilot', '@handle1, @handle2']);
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
// The presets' own text (user content; the defaults are the same in both languages), set by
// thData(): the literal pieces of each label, title, description line and tag (a template's
// {variables} and [[ ]] split it), and the artist names they fill in. Only a whole piece is
// exempt where it shows (a menu entry "1. 🌑 TrapSoul Mix", a filled-in title, a tag chip):
// not its words on their own anywhere else ("Tracklist" alone is a leak), nor JSON key names.
let presetTexts: string[] = [];
const presetPieces = (v: string) => v.split(/\{[^}]*\}|\[\[|\]\]|\n/).map((x) => x.trim()).filter((x) => /[A-Za-z]{2}/.test(x));
const withoutPresets = (s: string) =>
  presetTexts.reduce((t, v) => t.replace(new RegExp(`(?<![A-Za-z])${esc(v)}(?![A-Za-z])`, 'g'), ' '), s);
// A tooltip built of lines, each line a pair's Thai side (the "previously claimed" chip), is Thai too.
const latin = (s: string) =>
  (thai(s) || SAME_IN_BOTH.has(s) || s.split('\n').every((l) => thai(l.trim())) ? [] : words(withoutPresets(s)).filter((w) => !LATIN_OK.has(w)));

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
  { status: 'pending', txt: '0:05 ก - ข\n3:00 ค - ง\n6:00 จ - ฉ', txtName: 'a.txt', tracklist: { errors: ['x'], warnings: [], count: 3 }, at: AT, artists: '',
    claimed: [{ line: 'ก - ข', song: 'ข', artists: 'ก', times: 2 }, { line: 'ค - ง', song: 'ง', artists: 'ค', times: 1 }] },
  { status: 'error', draftId: '01234567890', msg: 'ผิด', thumb: { name: 'a.jpg', size: 1e5, type: 'image/jpeg' } },
  { status: 'uploading' }, { status: 'review' }, { status: 'done', videoId: '01234567890' },
].map((it, i) => ({ file: { name: `คลิป ${i + 1}.mp4`, size: 2e8, type: 'video/mp4' }, title: `ชื่อ ${i + 1}`, ...it })) as Parameters<typeof viewWith>[0];
const channel = { ...state().channel, name: 'ช่องฉัน', label: 'ช่องฉัน', handle: '@ฉัน' };
const schedule = { on: true, set: true, start: AT, late: true, times: [AT], skipped: 1, taken: [] };
// Thai first: the default presets are made in the current language, like the userscript's first run.
const thData = (over: Record<string, unknown> = {}) => {
  setLang('th');
  const d = toPanelData({ settings: { lang: 'th', schedule: { on: true, start: '2030-01-01T08:00', every: 1, unit: 'day' }, ...over } });
  presetTexts = d.presets
    .flatMap((p) => [p.label, p.title, p.description, ...p.tags].flatMap(presetPieces).concat(p.artistPriority ?? []))
    .sort((a, b) => b.length - a.length); // the longest first: a piece inside a longer one stays whole
  return d;
};
const thView = (over: Parameters<typeof viewWith>[1] = {}) => viewWith(items, { schedule, channel, state: state({ channel }), ...over });

// The Copyright tab as a Studio tab in Thai feeds it: the language warning, counts, the card and
// the activity log (its lines are made by the page, in the page's language).
const thCounts = { hasScan: true, scanDate: '', claims: 2, claimVideos: 1, songs: 3, hasAdsScan: false, adsTodo: 0 };
const thClaims = (status = { icon: '✓', kind: 'idle', title: 'พร้อม', detail: 'กด "สแกน claim" เพื่อเช็กช่องนี้' }, over: Parameters<typeof claimsStateWith>[0] = {}) =>
  fakeClaims({
    state: claimsStateWith({ channelName: 'ช่องฉัน', english: false, counts: thCounts, status, ...over }),
    log: [{ at: AT, msg: 'สแกนเสร็จ ✓ ช่องฉัน: 2 claim ใน 1 คลิป', type: 'ok' }],
  });

async function renderThai(api: ReturnType<typeof fakePanel>, live = fakeLive({ state: state({ channel }), liveState: state({ channel }) }), claims = thClaims()) {
  setLang('th');
  await fakeBrowser.storage.local.set({ logOpen: true }); // the activity log starts open
  const r = renderPanel(<><App /><PresetsFooter /></>, { ...api, lang: 'th' }, live, claims);
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
    // the Copyright tab: the Studio-language warning, the card, the counts, the open log
    expect(root.textContent).toContain('Studio ตั้งเป็นภาษาไทยอยู่');
    expect(screen.getByText('พร้อม')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'รายการ claim (2)', hidden: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'เพลงที่เคยโดน (3)', hidden: true })).toBeTruthy();
    expect(await screen.findByText(/สแกนเสร็จ ✓ ช่องฉัน/)).toBeTruthy();
    expect(root.textContent).toContain('2 เพลงเคยโดน claim'); // the queue card's chip, its tooltip one line per song
    expect(root.querySelector('[title^="เพลงใน tracklist ที่เคยโดน claim:"]')!.getAttribute('title')!.split('\n')).toHaveLength(3);
    clean(document.body); // with what renders outside the container
    expect(root.textContent).toContain('ช่องฉัน');
  });

  it('…nor in the five questions: Retry, Start (with every warning), delete and reset preset, import', async () => {
    const api = fakePanel({ data: thData({ confirmStart: true }), view: thView() });
    vi.mocked(api.send).mockImplementation((async (type: string) =>
      type === 'queue:preflight'
        ? {
          pendingN: 6, channel: { id: 'UC1', name: 'ช่องฉัน', avatar: '' }, ids: ['i0'], editRev: 1, sig: 's', times: [AT, AT + 864e5], vis: 'PRIVATE',
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
    await cancel();

    // A move file from the last userscript version: what "My file" adds, and the language it sets.
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('input[type=file][accept*=json]')!;
      const d = '2026-10-01T00:00:00.000Z';
      const moveFile = JSON.stringify({ app: 'yt-upload-presets', format: 1, presets: [{ id: 'a', label: 'ก' }],
        move: { lang: 'th', uploads: [{ date: d, channel: 'UC1', file: 'a.mp4' }, { date: d, channel: 'UC1', file: 'b.mp4' }], channels: [{ id: 'UC2', name: 'สอง' }] } });
      fireEvent.change(input, { target: { files: [new File([moveFile], 'm.json', { type: 'application/json' })] } });
    });
    expect(dialog().textContent).toContain('พรีเซ็ตและการตั้งค่าเดิมในเครื่องนี้จะถูกแทนที่ (ช่องที่ล็อกไว้ไม่เปลี่ยน)');
    expect(dialog().textContent).toContain('เมื่อเลือก "ไฟล์ของฉัน" ไฟล์นี้จะเพิ่มประวัติการอัปโหลด 2 รายการ และช่อง 1 ช่องจากสคริปต์ Tampermonkey และเปลี่ยนภาษาของแผงเป็น ไทย');
    expect(dialog().textContent).not.toContain('และภาษาไม่เปลี่ยน');
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
        runner: { tabId: 2, windowId: 1, title: 'สตูดิโออื่น', jobs: ['queue'] } as never,
      }),
      fakeLive({ state: running, liveState: running }),
      // a trim run's card: steps and their detail, and no buttons
      thClaims({ icon: '✂', kind: 'busy', title: 'กำลังตัด 1 / 2', detail: 'ชื่อ 1', progress: 0.5, steps: ['เปิดคลิป', 'ตัด', 'บันทึก'], stepIdx: 1, stepDetail: 'รอหน้าตัดต่อ' } as never, { busyRun: true }),
    );
    expect(root.textContent).toContain('● ตัด');
    expect(screen.queryByRole('button', { name: /สแกน claim/, hidden: true })).toBe(null);
    expect(root.textContent).toContain('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่'); // the runner-elsewhere banner
    clean(document.body);
  });

  it('…nor in the Copyright tab\'s views: the claim list in every result state, the tracklist editor and picker, the claimed songs', async () => {
    const row = (n: number, over: Record<string, unknown> = {}) => ({
      videoId: 'v' + (n < 3 ? 1 : n), video: `มิกซ์ ${n}`, privacy: 'สาธารณะ', length: 600, claimId: 'c' + n, song: `เพลง ${n}`, artists: 'ศิลปิน', label: 'ค่าย',
      claimant: 'ผู้ถือสิทธิ์', type: 'เสียง', status: '', impact: 'บล็อก', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: '', own: false,
      hasImpact: true, publishAt: 0, ...over,
    });
    const states = ['pending', 'saved', 'gone', 'failed', 'skipped', 'later'];
    const res = (state: string) => ({ state, msg: 'ข้อความ', date: '' });
    await fakeBrowser.storage.local.set({
      'claimScan:UC1': { date: '2026-10-01T00:00:00Z', total: 9, channel: 'UC1', channelName: 'ช่องฉัน', rows: [
        row(1, { own: true, claimedSec: 400, publishAt: AT }), row(2, { canTrim: false, impact: '', segments: [] }), ...states.map((_, i) => row(i + 3)),
      ] },
      'trimQueue:UC1': ['v1:c1'],
      'trimResults:UC1': Object.fromEntries(states.map((st, i) => [`v${i + 3}:c${i + 3}`, res(st)])),
      songHistory: {
        ก: { title: 'เพลง 1', artists: 'ศิลปิน', label: 'ค่าย', claimants: ['ผู้ถือสิทธิ์'], types: ['เสียง'], firstSeen: '2026-01-01T00:00:00Z', lastSeen: '2026-01-02T00:00:00Z',
          videos: { v1: { video: 'มิกซ์ 1', channel: 'ช่องฉัน', status: 'trimmed' } }, trimmed: 1 },
        ข: { title: 'เพลง 2', artists: '', label: '', claimants: [], types: [], firstSeen: '2026-01-01T00:00:00Z', lastSeen: '2026-01-02T00:00:00Z', videos: {}, trimmed: 0 },
      },
      uploads: [{ videoId: 'v1', txt: '00:00 ก - ข\n01:00 ค - ง\n01:20 จ - ฉ' }],
    });
    const root = await renderThai(fakePanel({ data: thData(), view: thView() }));
    const tap = (name: string | RegExp) => act(async () => fireEvent.click(screen.getAllByRole('button', { name, hidden: true }).at(-1)!));
    const pane = () => root.querySelector('[role=tabpanel][id$=claims]')!;
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'รายการ claim (2)', hidden: true }) as HTMLButtonElement).disabled).toBe(false));

    await tap('รายการ claim (2)');
    expect(pane().textContent).toContain('8 claim ใน 7 คลิป (จากทั้งหมด 9)');
    expect(pane().textContent).toContain('1 รายการดูเหมือนเป็นเพลงของคุณเอง');
    for (const t of ['⏳ รอ', '✅ ตัดแล้ว', '✅ claim หายไปแล้ว', '❌ ไม่สำเร็จ', '⏭ ข้าม', '⏳ รอคิว', 'ไม่มีผลกระทบ', 'ไม่มีตัวเลือก Trim', '★ เพลงของคุณเอง', '⏰ ตั้งเวลาปล่อย', '(67% ของคลิป)']) {
      expect(pane().textContent).toContain(t);
    }
    clean(document.body);

    await tap('📝 tracklist หลังตัด'); // the last video's: no upload history
    expect(pane().textContent).toContain('ติ๊กช่วงที่ถูกตัด');
    clean(document.body);
    await tap('ปิด');

    await tap('แก้ tracklist');
    expect(pane().textContent).toContain('ต้องวาง tracklist เอง');
    await vi.waitFor(() => expect(pane().textContent).toContain('มี tracklist จากประวัติการอัป'));
    clean(document.body);
    await tap(/มิกซ์ 2/); // video v1: from upload history, a range ticked
    await act(async () => {});
    await act(async () => fireEvent.click(pane().querySelector('input[type=checkbox]')!));
    expect(pane().textContent).toContain('ดึง tracklist จากประวัติการอัปโหลด');
    expect(pane().textContent).toContain('ตัด 1 ช่วง · ลบ 1 เพลง: ค - ง · เหลือ 2 เพลง');
    clean(document.body);
    await tap('ปิด');

    await tap('เพลงที่เคยโดน (3)');
    expect(pane().textContent).toContain('2 เพลง');
    expect(pane().textContent).toContain('✂ ตัดแล้ว 1');
    await tap('ลบออกจากประวัติ'); // armed: "Sure?"
    await tap('ลบทั้งหมด');
    expect(pane().textContent).toContain('แน่ใจ?');
    expect(pane().textContent).toContain('กดอีกครั้งเพื่อลบทั้งหมด');
    clean(document.body);
    await act(async () => fireEvent.change(pane().querySelector('input[type=text], input:not([type])')!, { target: { value: 'ไม่มี' } }));
    expect(pane().textContent).toContain('ไม่พบเพลงที่ค้นหา');
    expect(pane().textContent).toContain('0 จาก 2 เพลง');
    clean(document.body);
  });

  it('…nor in what 4b added: the trim question (every warning, both modes), the Auto-pilot question, Ads, Collab, Copyright settings', async () => {
    const row = (n: number, over: Record<string, unknown> = {}) => ({
      videoId: 'v' + n, video: `มิกซ์ ${n}`, privacy: 'สาธารณะ', length: 600, claimId: 'c' + n, song: `เพลง ${n}`, artists: 'ศิลปิน', label: 'ค่าย',
      claimant: 'ผู้ถือสิทธิ์', type: 'เสียง', status: '', impact: 'บล็อก', segments: [[60, 90]], claimedSec: 30, canTrim: true, options: '', own: false,
      hasImpact: true, publishAt: 0, ...over,
    });
    const vid = (n: number, over: Record<string, unknown> = {}) => ({ videoId: 'v' + n, video: `มิกซ์ ${n}`, privacy: 'สาธารณะ', length: 600, ...over });
    const date = '2026-10-01T00:00:00Z';
    await fakeBrowser.storage.local.set({
      'claimScan:UC1': { date, total: 2, channel: 'UC1', channelName: 'ช่องฉัน', rows: [row(1, { own: true }), row(2)] },
      'trimQueue:UC1': ['v1:c1', 'v2:c2'],
      'adsScan:UC1': { date, total: 9, rows: [vid(1), vid(2, { ineligible: true }), vid(3), vid(4)] },
      'adsResults:UC1': { v3: { state: 'on', msg: '' }, v4: { state: 'failed', msg: 'บันทึกไม่ได้' } },
      'collabScan:UC1': { date, total: 3, rows: [vid(1), vid(2), vid(3)] },
      'collabResults:UC1': { v1: { state: 'done', msg: 'เชิญแล้ว' }, v2: { state: 'failed', msg: 'หาช่องไม่เจอ' } },
      'collabLinks:UC1': { '@เพื่อน': 'https://studio.youtube.com/invite/x' },
      collabHandles: '@เพื่อน',
    });
    // The tab runs the upload queue: the question's third warning (Studio in Thai is the second).
    const root = await renderThai(fakePanel({ data: thData(), view: thView() }), undefined, thClaims(undefined, { uploadBusy: true }));
    const tap = (name: string | RegExp) => act(async () => fireEvent.click(screen.getAllByRole('button', { name, hidden: true }).at(-1)!));
    const pane = () => root.querySelector('[role=tabpanel][id$=claims]')!;
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'รายการ claim (2)', hidden: true }) as HTMLButtonElement).disabled).toBe(false));

    await tap('รายการ claim (2)');
    await tap('✂ ตัดที่เลือก (2)');
    expect(dialog().textContent).toContain('ตัด 2 claim ใน 2 คลิป?');
    expect(dialog().textContent).toContain('⚡ อัตโนมัติทั้งหมด');
    expect(dialog().textContent).toContain('1 รายการเป็น claim บนเพลงของคุณเอง');
    expect(dialog().textContent).toContain('Studio ไม่ได้ตั้งเป็นภาษาอังกฤษ');
    expect(dialog().textContent).toContain('คิวอัปโหลดยังมีไฟล์อยู่');
    clean(document.body);
    await cancel();
    await act(async () => { await fakeBrowser.storage.local.set({ cfg: { autoSaveTrim: false } }); }); // review mode
    await tap('✂ ตัดที่เลือก (2)');
    await vi.waitFor(() => expect(dialog().textContent).not.toContain('⚡ อัตโนมัติทั้งหมด'));
    clean(document.body);
    await cancel();
    await tap('ปิด');

    await act(async () => fireEvent.click(screen.getByRole('switch', { name: 'Auto-pilot', hidden: true })));
    expect(dialog().textContent).toContain('เปิด Auto-pilot ให้ช่อง ช่องฉัน?');
    expect(dialog().querySelectorAll('li').length).toBeGreaterThan(2); // the rules
    clean(document.body);
    await cancel();

    await tap(/โฆษณาปิดอยู่/);
    expect(pane().textContent).toContain('💰 คลิปที่ปิดโฆษณา — ช่องฉัน');
    for (const t of ['4 จาก 9 คลิป', '⚠ YouTube แจ้งว่าไม่มีสิทธิ์', 'ปิดโฆษณาไว้ (ตั้งค่า)', '✅ เปิดแล้ว', '❌ บันทึกไม่ได้', '💰 เปิดโฆษณา (']) expect(pane().textContent).toContain(t);
    clean(document.body);
    await tap('ปิด');
    await act(async () => { await fakeBrowser.storage.local.set({ 'adsScan:UC1': { date, total: 9, rows: [] } }); });
    await tap(/โฆษณาปิดอยู่/);
    await vi.waitFor(() => expect(pane().textContent).toContain('🎉 ทุกคลิปเปิดโฆษณาแล้ว'));
    clean(document.body);
    await tap('ปิด');

    await tap('Collab');
    expect(pane().textContent).toContain('🤝 Collab — ช่องฉัน');
    for (const t of ['ช่องที่จะเชิญ', 'ลิงก์คำเชิญ (ส่งให้อีกฝ่าย)', '@เพื่อน: https://', '✅ เชิญแล้ว', '❌ หาช่องไม่เจอ', '🤝 เชิญ (0 คลิป)']) expect(pane().textContent).toContain(t);
    clean(document.body);
    await tap('ปิด');
    await act(async () => { await fakeBrowser.storage.local.set({ 'collabScan:UC1': { date, total: 0, rows: [] } }); });
    await tap('Collab');
    await vi.waitFor(() => expect(pane().textContent).toContain('ช่องนี้ยังไม่มีคลิป'));
    clean(document.body);
    await tap('ปิด');

    await tap('ตั้งค่าลิขสิทธิ์');
    expect(pane().querySelectorAll('input').length).toBe(10);
    expect(pane().textContent).toContain('ตั้งค่าลิขสิทธิ์');
    clean(document.body);
    await tap('คืนค่าเริ่มต้น'); // armed: it asks once more
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

  it('…nor with the update banner (a newer release on GitHub)', async () => {
    // fakeBrowser's own getManifest throws, and the banner then never shows.
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '5.0.0' } as never);
    await fakeBrowser.storage.local.set({ updateCheck: { at: 1, latest: '9.9.9', url: 'https://github.com/TAEJK88/youtube-upload-presets/releases/tag/v9.9.9' } });
    const root = await renderThai(fakePanel({ data: thData(), view: thView() }));
    await act(async () => {}); // the banner's storage read
    expect(root.textContent).toContain('มีเวอร์ชันใหม่: 9.9.9 (ที่ใช้อยู่คือ 5.0.0)');
    expect(screen.getByRole('button', { name: 'ดาวน์โหลดเวอร์ชันใหม่' })).toBeTruthy();
    clean(document.body);
  });

  it('…nor with the userscript banner (the Tampermonkey script is still on in the tab)', async () => {
    const root = await renderThai(fakePanel({ data: thData(), view: thView({ userscript: true }) }));
    expect(root.textContent).toContain('สคริปต์ Tampermonkey ยังเปิดอยู่ในแท็บนี้ — ปิดใน Tampermonkey แล้วโหลดแท็บนี้ใหม่');
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
