import { L } from '../i18n';
import { isVisible } from './automation';
import { h } from './dom';
import { ui } from './page-ui';
import { addDrafts, type DraftRow } from './queue-runner';
import { active } from './state';
import { SEL } from './sel';
import { TXT } from './txt';

// "Apply preset (N)" in the bar Studio shows over the Content list while rows are ticked: the
// ticked drafts go into the queue with the active preset, and each is then filled in, given its
// visibility or release time, and saved the way an uploaded file is (no file is uploaded). A
// ticked video that is not a draft (published, scheduled) is skipped, and said so.
const BUTTON_ID = 'ytup-apply-preset';
const LENGTH = /^\d{1,2}(?::\d{2}){1,2}$/; // the thumbnail's "58:26" or "1:02:03"

const seconds = (t: string) => t.split(':').reduce((s, x) => s * 60 + Number(x), 0);
// A row's video id: its links (a published video's) or its thumbnail address (a draft has no link).
const rowId = (row: Element) => {
  const a = [...row.querySelectorAll('a[href]')].map((x) => x.getAttribute('href') || '').find((href) => /\/video\/[\w-]{11}/.test(href));
  const img = [...row.querySelectorAll('img')].map((x) => x.getAttribute('src') || '').find((src) => /\/vi\/[\w-]{11}\//.test(src));
  return ((a || '').match(/\/video\/([\w-]{11})/) || (img || '').match(/\/vi\/([\w-]{11})\//) || [])[1] || '';
};
const isDraft = (row: Element) => [...row.querySelectorAll(SEL.button)].some((b) => TXT.editDraft.test((b.textContent || '').trim()));

// The ticked rows of the Content list: the drafts, and how many ticked rows are not drafts.
export function tickedRows(doc: Document = document): { drafts: DraftRow[]; others: number } {
  const ticked = [...doc.querySelectorAll(SEL.contentRow)].filter((r) => {
    const box = r.querySelector(SEL.rowCheckbox);
    return !!box && (box.hasAttribute('checked') || box.querySelector('[role=checkbox]')?.getAttribute('aria-checked') === 'true');
  });
  const drafts: DraftRow[] = [];
  let others = 0;
  for (const row of ticked) {
    const videoId = rowId(row);
    if (!videoId || !isDraft(row)) { others++; continue; }
    const length = [...row.querySelectorAll('*')].find((e) => !e.children.length && LENGTH.test((e.textContent || '').trim()));
    drafts.push({ videoId, title: (row.querySelector(SEL.rowTitle)?.textContent || '').trim() || videoId, duration: length ? seconds(length.textContent!.trim()) : 0 });
  }
  return { drafts, others };
}

function apply(doc: Document) {
  const { drafts, others } = tickedRows(doc);
  const added = drafts.length ? addDrafts(drafts) : 0;
  if (others) ui.toast(L(`ข้าม ${others} คลิปที่ไม่ใช่ฉบับร่าง`, `Skipped ${others} video(s) that are not drafts`));
  if (added) ui.openDrawer('queue'); // a click: the panel may open (a user gesture)
}

// Keeps the button in Studio's bar (Studio draws the bar again as the ticks change) and its count
// up to date. Returns a disposer, so it stops when the extension is reloaded under the page.
export function installDraftApply(doc: Document = document): () => void {
  const tick = () => {
    const bar = [...doc.querySelectorAll<HTMLElement>(SEL.bulkActions)].find(isVisible);
    const old = doc.getElementById(BUTTON_ID);
    const n = bar ? tickedRows(doc).drafts.length : 0;
    if (!bar || !n) return void old?.remove();
    const btn = old && bar.contains(old) ? old : bar.appendChild(h('button', {
      id: BUTTON_ID, type: 'button',
      style: 'margin:0 8px;padding:8px 14px;border:0;border-radius:18px;background:#3ea6ff;color:#0f0f0f;font:500 14px Roboto,Arial,sans-serif;cursor:pointer;white-space:nowrap',
      onclick: () => apply(doc),
    }));
    if (old && old !== btn) old.remove();
    const name = active().label;
    const label = L(`ใช้พรีเซ็ต (${n})`, `Apply preset (${n})`);
    const title = L(`ใส่ฉบับร่าง ${n} คลิปที่เลือกเข้าคิวด้วยพรีเซ็ต "${name}" แล้วกดเริ่มอัปโหลดในแผง`, `Queue the ${n} ticked draft(s) with preset "${name}", then press Start upload in the panel`);
    if (btn.textContent !== label) btn.textContent = label;
    if (btn.title !== title) btn.title = title;
  };
  const timer = setInterval(tick, 1000);
  return () => { clearInterval(timer); doc.getElementById(BUTTON_ID)?.remove(); };
}
