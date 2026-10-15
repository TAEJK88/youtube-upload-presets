import { useState, type Dispatch, type SetStateAction } from 'react';

// A list stays mounted after its run (a Tools sub-tab): a video the run just finished leaves the
// picks, so a second press does not run it again; one that failed stays ticked to retry (THAIB-1 review).
export function useDropFinished(
  results: Record<string, { state: string }>, finished: string,
  picked: ReadonlySet<string>, setPicked: Dispatch<SetStateAction<Set<string>>>,
): void {
  const [seen, setSeen] = useState(results);
  if (seen === results) return;
  const now = [...picked].filter((v) => results[v]?.state === finished && seen[v]?.state !== finished);
  setSeen(results);
  if (now.length) setPicked((p) => new Set([...p].filter((v) => !now.includes(v))));
}
