import { DESC_MAX } from './constants';
import { L } from './i18n';
import { pad } from './template';

// YouTube's chapter rules, checked on the description that will actually be uploaded:
// first stamp 0:00, at least 3, ascending, each ≥ 10 s, within the video length,
// and the description within 5000 characters (otherwise the end of the tracklist is cut).
export const fmtTs = (s: number) => { s = Math.round(s); const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (hh ? hh + ':' + pad(m) : m) + ':' + pad(x); };

export interface TracklistCheck { errors: string[]; warnings: string[]; count: number }

export function checkTracklist(description: string, fullLength: number, duration: number): TracklistCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stamps: { t: number; line: number; name: string }[] = [];
  description.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*[[(]?(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})\b[\])]?\s*[-–|.:]?\s*(.*)$/);
    if (!m) return;
    const [hh, mm, ss] = [m[1], m[2], m[3]].map((x) => (x === undefined ? 0 : +x)) as [number, number, number];
    if (ss > 59 || (m[1] !== undefined && mm > 59)) { errors.push(L(`บรรทัด ${i + 1}: เวลา "${line.trim().split(/\s/)[0]}" ไม่ถูกต้อง`, `Line ${i + 1}: invalid time "${line.trim().split(/\s/)[0]}"`)); return; }
    stamps.push({ t: hh * 3600 + mm * 60 + ss, line: i + 1, name: m[4]!.trim() });
  });
  if (fullLength > DESC_MAX) warnings.push(L(`คำอธิบายยาว ${fullLength} ตัวอักษร เกิน ${DESC_MAX} — ส่วนท้ายจะถูกตัด`, `Description is ${fullLength} characters, over ${DESC_MAX} — the end will be cut off`));
  if (!stamps.length) return { errors, warnings, count: 0 };
  if (stamps[0]!.t !== 0) errors.push(L(`timestamp แรกต้องเป็น 0:00 (ตอนนี้ ${fmtTs(stamps[0]!.t)})`, `First timestamp must be 0:00 (currently ${fmtTs(stamps[0]!.t)})`));
  if (stamps.length < 3) errors.push(L(`ต้องมีอย่างน้อย 3 timestamp (มี ${stamps.length})`, `Needs at least 3 timestamps (has ${stamps.length})`));
  for (let k = 1; k < stamps.length; k++) {
    const gap = stamps[k]!.t - stamps[k - 1]!.t;
    if (gap <= 0) errors.push(L(`บรรทัด ${stamps[k]!.line}: ${fmtTs(stamps[k]!.t)} ไม่ได้มาหลัง ${fmtTs(stamps[k - 1]!.t)}`, `Line ${stamps[k]!.line}: ${fmtTs(stamps[k]!.t)} doesn't come after ${fmtTs(stamps[k - 1]!.t)}`));
    else if (gap < 10) errors.push(L(`บรรทัด ${stamps[k - 1]!.line}: ช่วงยาวแค่ ${gap} วินาที (ต้อง ≥ 10)`, `Line ${stamps[k - 1]!.line}: chapter is only ${gap}s long (needs ≥ 10)`));
  }
  const last = stamps[stamps.length - 1]!;
  if (duration > 0) {
    const over = stamps.filter((s) => s.t >= duration);
    if (over.length) errors.push(L(`${over.length} timestamp เกินความยาวคลิป (${fmtTs(duration)}) เช่นบรรทัด ${over[0]!.line}: ${fmtTs(over[0]!.t)}`, `${over.length} timestamp(s) beyond the video length (${fmtTs(duration)}), e.g. line ${over[0]!.line}: ${fmtTs(over[0]!.t)}`));
    else if (duration - last.t < 10) errors.push(L(`ช่วงสุดท้ายยาวแค่ ${Math.floor(duration - last.t)} วินาที (ต้อง ≥ 10)`, `Last chapter is only ${Math.floor(duration - last.t)}s long (needs ≥ 10)`));
  }
  const seen = new Map<string, number>();
  for (const s of stamps) {
    const k = s.name.toLowerCase().replace(/\s+/g, ' ');
    if (k && seen.has(k)) warnings.push(L(`เพลงซ้ำ: "${s.name}" (บรรทัด ${seen.get(k)} และ ${s.line})`, `Duplicate song: "${s.name}" (lines ${seen.get(k)} and ${s.line})`));
    else if (k) seen.set(k, s.line);
  }
  return { errors, warnings, count: stamps.length };
}

// Fixes what can be fixed without guessing: first stamp not 0:00, and stamp lines out of
// order (only the times / stamp lines move; other text stays). Chapters under 10 s or past
// the end can't be fixed. changes empty = nothing fixable.
export function fixChapters(text: string): { text: string; changes: string[] } {
  const RE = /^(\s*[[(]?)((?:\d{1,2}:)?\d{1,3}:\d{1,2})(\b.*)$/;
  const lines = String(text).split('\n');
  const idx: number[] = [];
  lines.forEach((l, i) => { if (RE.test(l)) idx.push(i); });
  if (!idx.length) return { text, changes: [] };
  const secs = (l: string) => l.match(RE)![2]!.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
  const changes: string[] = [];
  const ts = idx.map((i) => lines[i]!);
  const sorted = [...ts].sort((a, b) => secs(a) - secs(b));
  if (sorted.some((l, k) => l !== ts[k])) {
    sorted.forEach((l, k) => { lines[idx[k]!] = l; });
    changes.push(L('เรียงบรรทัด timestamp ตามเวลา', 'Sorted the timestamp lines by time'));
  }
  const first = lines[idx[0]!]!;
  if (secs(first) !== 0) {
    const m = first.match(RE)!;
    lines[idx[0]!] = m[1]! + (m[2]!.split(':').length === 3 ? '0:00:00' : '0:00') + m[3];
    changes.push(L(`timestamp แรก ${m[2]} → 0:00`, `First timestamp ${m[2]} → 0:00`));
  }
  return { text: lines.join('\n'), changes };
}

// Duration straight from the MP4/MOV header (moov > mvhd) without a video player.
// Reads 16-byte box headers plus the moov box itself, so a 1.5 GB file is fast.
export async function mp4Duration(file: Blob): Promise<number> {
  const read = async (o: number, n: number) => new DataView(await file.slice(o, o + n).arrayBuffer());
  const type = (dv: DataView, p: number) => String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
  let off = 0;
  for (let guard = 0; off + 8 <= file.size && guard < 2000; guard++) {
    const hd = await read(off, 16);
    if (hd.byteLength < 8) break;
    let len = hd.getUint32(0);
    let hdr = 8;
    if (len === 1 && hd.byteLength >= 16) { len = Number(hd.getBigUint64(8)); hdr = 16; } else if (len === 0) len = file.size - off;
    if (len < hdr) break;
    if (type(hd, 0) === 'moov') {
      const mv = await read(off + hdr, Math.min(len - hdr, 64 << 20));
      for (let p = 0; p + 8 <= mv.byteLength;) {
        const l = mv.getUint32(p);
        if (type(mv, p) === 'mvhd') {
          const v1 = mv.getUint8(p + 8) === 1;
          const ts = mv.getUint32(p + (v1 ? 28 : 20));
          const du = v1 ? Number(mv.getBigUint64(p + 32)) : mv.getUint32(p + 24);
          return ts ? du / ts : 0;
        }
        if (l < 8) break;
        p += l;
      }
      return 0;
    }
    off += len;
  }
  return 0;
}
