// The video lists' plain values, apart from VideoList.tsx so that module exports components only
// (React Fast Refresh swaps it in place then, instead of reloading the panel).

// Scanned rows from which a list starts compact.
export const COMPACT_FROM = 16;

// One tick on or off, for setPicked.
export const tick = (videoId: string, on: boolean) => (p: Set<string>) => {
  const n = new Set(p);
  if (on) n.add(videoId);
  else n.delete(videoId);
  return n;
};
