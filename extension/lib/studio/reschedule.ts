import { listScheduled, startRescheduleRun } from '../claims/claims';
import { L } from '../i18n';
import type { RescheduleList, RescheduleResult } from '../messages';
import { scheduleProblem } from './queue-runner';

// Reschedule, the Tools tab's group: the panel lists the channel's scheduled videos (reschedule:list)
// and sends the picked ids with a new time for the earliest (reschedule:apply). This tab reads the
// channel afresh, works out every picked video's new time (the same offset: the gaps and each one's
// time of day stay) and starts the run (claims.ts startRescheduleRun), which sets each time through
// Studio's own Visibility dialog and Save, one video at a time behind the automation lock.
export type Slot = { videoId: string; title: string; at: number };
export type Moved = Slot & { to: number };
const MAX_IDS = 1000; // listScheduled reads at most 200 videos; anything longer is not the panel's

// Every slot moved by (start - earliest); throws the queue's own scheduleProblem when any is too soon.
export function shiftSlots(slots: Slot[], start: number): Moved[] {
  if (!slots.length || !Number.isFinite(start)) throw new Error(L('ไม่มีเวลาให้เลื่อน', 'Nothing to reschedule'));
  const offset = start - Math.min(...slots.map((s) => s.at));
  const moved = slots.map((s) => ({ ...s, to: s.at + offset }));
  const problem = moved.map((m) => scheduleProblem(m.to)).find(Boolean);
  if (problem) throw new Error(problem);
  return moved;
}

const readFailed = () => L('อ่านเวลาปล่อยปัจจุบันไม่ได้ ลองใหม่อีกครั้ง', "Couldn't read the current release times, try again");
const fresh = () => listScheduled().catch((e) => { console.warn('[ytup] reschedule read', e); return null; });

// reschedule:list — a failed read is an error, never an empty list (that would read "nothing scheduled").
export async function rescheduleList(): Promise<RescheduleList> {
  const videos = await fresh();
  return videos ? { videos } : { error: readFailed() };
}

// reschedule:apply — the panel sends each ticked video with the time it showed (`at`) and the new
// start the person confirmed. Panel-to-tab data: checked before anything is read or started. The
// fresh read must still hold every one of them at its shown time (±1 min), or nothing starts: the
// shift is from the times the person confirmed, never from ones they did not see (reviewer-1).
const SAME_TIME_MS = 60_000;
type Picked = { videoId: string; at: number };
const isPicked = (x: unknown): x is Picked => !!x && typeof x === 'object' && typeof (x as Picked).videoId === 'string' && typeof (x as Picked).at === 'number' && Number.isFinite((x as Picked).at);
export async function rescheduleApply(d: unknown): Promise<RescheduleResult> {
  const v = d as { items?: unknown; start?: unknown } | null;
  const items = v && typeof v === 'object' && Array.isArray(v.items) ? v.items : [];
  if (!items.length || items.length > MAX_IDS || !items.every(isPicked) || new Set(items.map((x) => x.videoId)).size !== items.length
    || typeof v?.start !== 'number' || !Number.isFinite(v.start)) {
    return { error: L('คำขอเลื่อนเวลาผิดรูปแบบ', 'Malformed reschedule request') };
  }
  const list = await fresh();
  if (!list) return { error: readFailed() };
  const slots: Slot[] = [];
  for (const p of items) {
    const now = list.find((s) => s.videoId === p.videoId);
    if (!now || Math.abs(now.at - p.at) > SAME_TIME_MS) return { error: L('เวลาปล่อยเปลี่ยนไปแล้ว อ่านรายการใหม่', 'The release times changed, reload the list') };
    slots.push({ videoId: p.videoId, title: now.title, at: p.at });
  }
  let moved: Moved[];
  try {
    moved = shiftSlots(slots, v.start);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const refused = await startRescheduleRun(moved.map((m) => ({ videoId: m.videoId, video: m.title, at: m.to })));
  if (refused) return { error: refused };
  return { started: moved.length };
}
