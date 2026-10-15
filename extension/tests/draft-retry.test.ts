import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeUploadDialog, hiddenTabNote, openDraft } from '../lib/studio/draft-retry';
import { draftUrl } from '../lib/studio/sel';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { El, makeDocument } from './fake-dom.mjs';

// Closing Studio's upload dialog and opening a draft's dialog again (P5-draft-retry), on a
// small fake of the page. What Studio really does here was never seen in Chrome: these pin
// what the code does with the page it expects, and that it gives up without harm otherwise.
vi.mock('../lib/studio/automation', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/automation')>()),
  sleep: async () => {},
  waitFor: async (fn: () => unknown) => fn() || null,
}));
// The notice pop-ups ("Got it") have their own tests; the fake page has none.
vi.mock('../lib/studio/upload-dialog', async (orig) => ({
  ...(await orig<typeof import('../lib/studio/upload-dialog')>()),
  ackNoticeDialogs: () => false,
}));

type Node = InstanceType<typeof El> & { onclick: (() => void) | null; hidden: boolean };
const CH = 'UCabcdefghijklmn';
const ID = 'r9u2Pn0ve-g';
const HOME = `https://studio.youtube.com/channel/${CH}`;
const el = (tag: string, attrs: Record<string, string> = {}, text = ''): Node => {
  const e = new El(tag) as Node;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.text = text;
  return e;
};

let doc: ReturnType<typeof makeDocument>;
let paper: Node; // Studio's upload dialog: hidden = closed
let x: Node; // its X (the ytcp-button), and the button inside it
let inner: Node;
let shown = ''; // the video link the dialog shows
let pops: string[]; // the address at each "the address changed" told to Studio
let info: ReturnType<typeof vi.spyOn>;
const open = (id: string) => { paper.hidden = false; shown = id; };
const target = (over: Partial<Parameters<typeof openDraft>[0]> = {}) => ({ id: ID, channel: CH, shownId: () => shown, ...over });
const lines = () => info.mock.calls.map((c: unknown[]) => String(c[0]));

beforeEach(() => {
  doc = makeDocument();
  paper = el('tp-yt-paper-dialog');
  x = el('ytcp-button', { id: 'ytcp-uploads-dialog-close-button' });
  inner = el('button', { 'aria-label': 'Close' });
  x.append(inner);
  paper.append(x, el('div', { id: 'title-textarea' }).append(el('div', { id: 'textbox' })));
  paper.hidden = true;
  doc.body.append(el('ytcp-uploads-dialog').append(paper));
  shown = '';
  pops = [];
  vi.stubGlobal('document', Object.assign(doc, { visibilityState: 'visible' }));
  const location = { href: HOME };
  vi.stubGlobal('location', location);
  const go = (_s: unknown, _t: string, url: string) => { location.href = new URL(url, HOME).href; };
  vi.stubGlobal('history', { pushState: vi.fn(go), replaceState: vi.fn(go) });
  vi.stubGlobal('PopStateEvent', class { type = 'popstate'; });
  vi.stubGlobal('window', { dispatchEvent: (e: { type: string }) => { if (e.type === 'popstate') pops.push(location.href); } });
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('closing the upload dialog', () => {
  it('a dialog that is not open needs nothing', async () => {
    const click = vi.fn();
    x.onclick = click;
    expect(await closeUploadDialog()).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it('presses its X, as before', async () => {
    paper.hidden = false;
    x.onclick = () => { paper.hidden = true; };
    expect(await closeUploadDialog()).toBe(true);
  });

  it('an X that did nothing: the button inside it is pressed next', async () => {
    paper.hidden = false;
    const outer = vi.fn();
    x.addEventListener('click', (e: { target: unknown }) => { if (e.target === x) outer(); });
    inner.onclick = () => { paper.hidden = true; };
    expect(await closeUploadDialog()).toBe(true);
    expect(outer).toHaveBeenCalledTimes(1); // the first try, the userscript's
  });

  it('a question about the upload: only the keeping answer is pressed, never the discarding one', async () => {
    paper.hidden = false;
    const discard = vi.fn();
    const ask = el('ytcp-dialog');
    const keep = el('ytcp-button', {}, 'Save as draft');
    keep.onclick = () => { paper.hidden = true; };
    const no = el('ytcp-button', {}, 'Discard');
    no.onclick = discard;
    doc.body.append(ask.append(no, keep));
    expect(await closeUploadDialog()).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    expect(lines()).toEqual(['[ytup] draft retry: closing asked: pressed the keep-draft answer · tab visible']);
  });

  it('a question with no keeping answer is left alone and logged with its words', async () => {
    paper.hidden = false;
    const discard = vi.fn();
    const no = el('ytcp-button', {}, 'Discard upload');
    no.onclick = discard;
    doc.body.append(el('ytcp-dialog').append(no));
    expect(await closeUploadDialog()).toBe(false);
    expect(discard).not.toHaveBeenCalled();
    expect(lines()[0]).toBe('[ytup] draft retry: closing: 1 other dialog(s) open, none with a keep-draft answer: "Discard upload" · tab visible');
  });

  it('still open after three tries: says so, and the log says when the tab was hidden', async () => {
    paper.hidden = false;
    const clicks = vi.fn();
    x.addEventListener('click', clicks);
    doc.visibilityState = 'hidden';
    expect(await closeUploadDialog()).toBe(false);
    expect(clicks).toHaveBeenCalledTimes(3);
    expect(lines()).toEqual(['[ytup] draft retry: the upload dialog is still open after 3 tries at its X · tab hidden']);
    expect(hiddenTabNote()).toBe(' (the Studio tab was in the background)');
    doc.visibilityState = 'visible';
    expect(hiddenTabNote()).toBe('');
  });
});

describe("opening a draft's dialog again", () => {
  const row = (id: string, button = 'Edit draft') => {
    const b = el('ytcp-button', {}, button);
    const r = el('ytcp-video-row').append(el('a', { href: `/video/${id}/edit` }), b);
    doc.body.append(r);
    return b;
  };

  it("by the draft's own row in the Content list, when it is on the page: nothing is told to the router", async () => {
    row('otherVideo1').onclick = () => open('otherVideo1');
    row(ID).onclick = () => open(ID);
    expect(await openDraft(target())).toBe('');
    expect(shown).toBe(ID);
    expect(history.pushState).not.toHaveBeenCalled();
    expect(lines()).toEqual([`[ytup] draft retry: ${ID} by row: its dialog is open · tab visible`]);
  });

  it('a row with no "Edit draft" button is not clicked', async () => {
    const other = vi.fn();
    row(ID, 'Options').onclick = other;
    await openDraft(target());
    expect(other).not.toHaveBeenCalled();
  });

  it("else by the draft's address, told to Studio's router without a page load", async () => {
    vi.stubGlobal('window', { dispatchEvent: (e: { type: string }) => { if (e.type === 'popstate') { pops.push(location.href); open(ID); } } });
    expect(await openDraft(target())).toBe('');
    expect(draftUrl(CH, ID)).toBe(`/channel/${CH}/videos/upload?d=ud&udvid=${ID}`);
    expect(history.pushState).toHaveBeenCalledWith(null, '', draftUrl(CH, ID));
    expect(pops).toEqual([`https://studio.youtube.com${draftUrl(CH, ID)}`]);
    expect(history.replaceState).not.toHaveBeenCalled(); // the address stays the draft's
    expect(lines()).toEqual([
      `[ytup] draft retry: ${ID} by row: not possible here · tab visible`,
      `[ytup] draft retry: ${ID} by address: its dialog is open · tab visible`,
    ]);
  });

  it('the address only brought the Content list: the row there is used', async () => {
    vi.stubGlobal('window', { dispatchEvent: (e: { type: string }) => { if (e.type === 'popstate' && !pops.length) { pops.push('list'); row(ID).onclick = () => open(ID); } } });
    expect(await openDraft(target())).toBe('');
    expect(lines().at(-1)).toBe(`[ytup] draft retry: ${ID} by row: its dialog is open · tab visible`);
  });

  it('nothing opens: says so, puts the address back, and each way has its log line', async () => {
    expect(await openDraft(target())).toBe('Could not open the draft in Studio');
    expect(location.href).toBe(HOME);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', HOME);
    expect(pops).toHaveLength(2); // there, and back
    expect(lines()).toEqual([
      `[ytup] draft retry: ${ID} by row: not possible here · tab visible`,
      `[ytup] draft retry: ${ID} by address: no dialog with its link after 15 s · tab visible`,
      `[ytup] draft retry: ${ID} by row: not possible here · tab visible`,
    ]);
  });

  it('no channel id: no address is made up', async () => {
    expect(await openDraft(target({ channel: '' }))).toBe('Could not open the draft in Studio');
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it('a dialog for another video is closed, and nothing more is tried', async () => {
    x.onclick = () => { paper.hidden = true; };
    row(ID).onclick = () => open('otherVideo1');
    expect(await openDraft(target())).toBe('Studio opened another video (otherVideo1) instead of this draft');
    expect(paper.hidden).toBe(true);
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it('a dialog that shows no video link does not count as the draft', async () => {
    x.onclick = () => { paper.hidden = true; };
    row(ID).onclick = () => open('');
    expect(await openDraft(target())).toBe('Could not open the draft in Studio');
    expect(paper.hidden).toBe(true); // closed again: nothing is typed into it
  });

  it('a way that throws is logged and the next one is tried', async () => {
    vi.mocked(history.pushState).mockImplementation(() => { throw new Error('SecurityError'); });
    expect(await openDraft(target())).toBe('Could not open the draft in Studio');
    expect(lines()).toContain(`[ytup] draft retry: ${ID} by address: SecurityError · tab visible`);
  });
});
