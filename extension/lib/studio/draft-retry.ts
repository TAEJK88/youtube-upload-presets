import { L } from '../i18n';
import { detailsOpen, isVisible, uploadDialogOpen, waitFor } from './automation';
import { draftUrl, SEL } from './sel';
import { TXT } from './txt';
import { ackNoticeDialogs, closeStudioUploadDialog } from './upload-dialog';

// Going on with a video whose file is already a draft in Studio (P5-draft-retry; the userscript
// asked for the draft to be deleted and uploaded the file again). The draft's own upload dialog
// is opened again inside the page, and the queue's usual code fills in what is left.
// NOTHING here was seen in Chrome: the selectors, the address and the words are in sel.ts / txt.ts
// marked unverified, every step logs one "[ytup] draft retry:" line, and a failure is an answer,
// not a throw: the caller then leaves the video as the error it was.
export const DRAFT_RETRIES = 2; // tries on the draft after a failure, within one run
export const DRAFT_RETRY_PAUSE_MS = 5000;

// Studio draws its pop-ups a frame later, and a tab in the background gets no frames: a guess at
// why a calendar would not open and a dialog would not close in a long run, so every line says it.
const hidden = () => document.visibilityState === 'hidden';
export const hiddenTabNote = () => (hidden() ? L(' (แท็บ Studio อยู่เบื้องหลัง)', ' (the Studio tab was in the background)') : '');
const say = (m: string) => console.info(`[ytup] draft retry: ${m} · tab ${hidden() ? 'hidden' : 'visible'}`);

const press = (b: HTMLElement) => (b.querySelector('button') || b).click();

// Should closing ask whether to keep the upload: the keeping answer is pressed, nothing else is.
function keepDraft(): void {
  const asks = [...document.querySelectorAll<HTMLElement>(SEL.anyDialog)].filter((d) => isVisible(d) && !d.closest(SEL.dialog));
  for (const d of asks) {
    const keep = [...d.querySelectorAll<HTMLElement>(SEL.button)].find((b) => isVisible(b) && TXT.keepDraft.test((b.textContent || '').trim()));
    if (keep) { say('closing asked: pressed the keep-draft answer'); return press(keep); }
  }
  if (asks.length) say(`closing: ${asks.length} other dialog(s) open, none with a keep-draft answer: "${(asks[0]!.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80)}"`);
}

// Closes Studio's upload dialog, the way its X does (an uploaded file stays a draft). The
// userscript pressed the X once and went on; a dialog that stayed open then failed every later
// video. Three tries: the X as before, then the button inside it. false = still open.
export async function closeUploadDialog(): Promise<boolean> {
  for (let k = 0; k < 3 && uploadDialogOpen(); k++) {
    ackNoticeDialogs();
    const inner = k ? [...document.querySelectorAll<HTMLElement>(`${SEL.dialog} ${SEL.closeDialogInner}`)].find(isVisible) : null;
    if (inner) inner.click();
    else closeStudioUploadDialog();
    if (await waitFor(() => !uploadDialogOpen(), 4000)) break;
    keepDraft();
    await waitFor(() => !uploadDialogOpen(), 3000);
  }
  const closed = !uploadDialogOpen();
  if (!closed) say('the upload dialog is still open after 3 tries at its X');
  return closed;
}

// The draft's row in the Content list, when the list is on the page and shows it.
function editDraftButton(id: string): HTMLElement | undefined {
  const row = [...document.querySelectorAll<HTMLElement>(SEL.contentRow)].find((r) => r.querySelector(`a[href*="${id}"], img[src*="${id}"]`));
  return row && [...row.querySelectorAll<HTMLElement>(SEL.button)].find((b) => isVisible(b) && TXT.editDraft.test((b.textContent || '').trim()));
}

// Studio is one page: its router is told the address changed, and nothing is loaded.
function route(url: string): void {
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  window.dispatchEvent(new CustomEvent('location-changed'));
}

export interface DraftTarget {
  id: string;
  channel: string;
  shownId: () => string; // the video the open upload dialog is for ('' = it shows no link yet)
}

// Opens the upload dialog of draft `id` on its details page. Returns '' when it is open and its
// video link is that draft's, else why not. Only a dialog that names this very video counts:
// details are never typed into a dialog that shows another video, or none.
export async function openDraft({ id, channel, shownId }: DraftTarget): Promise<string> {
  const shows = () => (detailsOpen() && uploadDialogOpen() ? shownId() : '');
  const back = location.href;
  const row = (b: HTMLElement | null | undefined) => (b ? (press(b), true) : false);
  const ways: [string, () => boolean | Promise<boolean>][] = [
    ['row', () => row(editDraftButton(id))],
    ['address', () => (channel ? (route(draftUrl(channel, id)), true) : false)],
    ['row', async () => row(await waitFor(() => editDraftButton(id), 5000))], // the list may be on the page only now
  ];
  for (const [way, go] of ways) {
    let went = false;
    try {
      went = await go();
    } catch (e) {
      say(`${id} by ${way}: ${(e as Error)?.message ?? e}`);
    }
    if (!went) { say(`${id} by ${way}: not possible here`); continue; }
    const got = await waitFor(shows, 15000);
    say(`${id} by ${way}: ${got === id ? 'its dialog is open' : got ? `Studio shows another video (${got})` : 'no dialog with its link after 15 s'}`);
    if (got === id) return '';
    if (uploadDialogOpen() && !(await closeUploadDialog())) break; // not this draft's: nothing is typed into it
    if (got) return L(`Studio เปิดวิดีโออื่น (${got}) แทนฉบับร่างนี้`, `Studio opened another video (${got}) instead of this draft`);
  }
  try {
    if (location.href !== back) { history.replaceState(null, '', back); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); }
  } catch (e) {
    say(`${id}: could not put the address back: ${(e as Error)?.message ?? e}`);
  }
  return L('เปิดฉบับร่างใน Studio ไม่ได้', 'Could not open the draft in Studio');
}
