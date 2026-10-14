// The failed videos of a queue, by what "Resume drafts" (P5-draft-retry) can do with them. Used
// by the side panel for its button and its count, and by the Studio tab that puts them back in line.
// - resumable: its file is a draft in Studio, and no other card names that draft
// - shared: its draft id is on another card too (what builds before the draft-retry fix stored
//   when a dialog stayed open): which card it belongs to cannot be told, so none resumes it
// - plain: no draft id; it needs its file uploaded, which a card's Retry does
interface Card { status: string; draftId?: string }
export function failedByDraft<T extends Card>(items: T[]): { resumable: T[]; shared: T[]; plain: T[] } {
  const failed = items.filter((i) => i.status === 'error');
  const elsewhere = (it: T) => items.some((x) => x !== it && x.draftId === it.draftId);
  return {
    resumable: failed.filter((i) => i.draftId && !elsewhere(i)),
    shared: failed.filter((i) => i.draftId && elsewhere(i)),
    plain: failed.filter((i) => !i.draftId),
  };
}
