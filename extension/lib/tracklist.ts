export const parseTime = (t: string) => t.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);

// After trimming claimed segments: shift every timestamp back by what was cut before it,
// drop tracks that lost half or more of their length, and restart the first kept track at 00:00.
export function fixTracklist(text: unknown, segments: [number, number][], videoLength: number) {
  const segs: [number, number][] = [];
  for (const [a, b] of segments.map(([a, b]): [number, number] => [Math.max(0, a), Math.max(a, b)]).sort((x, y) => x[0] - y[0])) {
    const last = segs[segs.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else segs.push([a, b]);
  }
  const removedBefore = (t: number) => segs.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(t, b) - a), 0);
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const tracks: { idx: number; start: number; sep: string; rest: string; end: number }[] = [];
  lines.forEach((line, idx) => {
    const m = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(\s*[-–|]?\s*)(.*)$/);
    if (m) tracks.push({ idx, start: parseTime(m[1]!), sep: m[2]!, rest: m[3]!, end: 0 });
  });
  tracks.forEach((t, i) => { t.end = i + 1 < tracks.length ? tracks[i + 1]!.start : (videoLength || t.start); });
  const total = Math.max(0, (videoLength || 0) - removedBefore(videoLength || 0));
  const longFmt = total >= 3600 || tracks.some((t) => t.start >= 3600);
  const tf = (sec: number) => {
    sec = Math.max(0, Math.round(sec));
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return longFmt ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  const removed: string[] = [];
  const out: (string | null)[] = lines.slice();
  let firstKept = true;
  for (const t of tracks) {
    const dur = Math.max(0, t.end - t.start);
    const cut = removedBefore(t.end) - removedBefore(t.start);
    if (dur > 0 ? cut / dur >= 0.5 : false) {
      removed.push(t.rest);
      out[t.idx] = null;
      continue;
    }
    let ns = t.start - removedBefore(t.start);
    if (firstKept) { ns = 0; firstKept = false; } // chapters must start at 00:00
    out[t.idx] = tf(ns) + (t.sep || ' ') + t.rest;
  }
  return { text: out.filter((l) => l !== null).join('\n'), removed, kept: tracks.length - removed.length };
}
