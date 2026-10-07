import { L } from '../i18n';
import { buildVars as buildVarsWith, type BuildOpts, type Vars } from '../template';
import { SEL } from './sel';
import { settings } from './state';

// ytcfg lives in the page's MAIN world. The content script copies what getChannel()
// needs into `cfg` (refreshCfg) so getChannel() stays synchronous, as in the userscript.
const cfg: Record<string, unknown> = {};
const mainWorld: { ytcfg?: { get(key: string): string | undefined } } = { ytcfg: { get: (key) => cfg[key] as string | undefined } };
export async function refreshCfg(read: (keys: string[]) => Promise<Record<string, unknown>>): Promise<void> {
  try {
    Object.assign(cfg, await read(['CHANNEL_ID']));
  } catch (e) {
    console.warn('[ytup] ytcfg', e);
  }
}

export interface Channel { id: string; name: string; avatar: string; handle: string }

// @port-begin
// ===== ช่องที่กำลังใช้งาน (กันอัปผิดช่อง) =====
function getChannel(): Channel {
  const W = mainWorld;
  const id = (location.pathname.match(/\/channel\/(UC[\w-]{10,})/) || [])[1] || (W.ytcfg && W.ytcfg.get('CHANNEL_ID')) || '';
  const nameEl = document.querySelector(SEL.channelName);
  const imgEl = document.querySelector<HTMLImageElement>(
    SEL.channelAvatar
  );
  // @handle: หน้าสลับช่องไม่มี UC id ในแถว ต้องใช้ handle เทียบ (ไม่เจอก็ถอยไปเทียบด้วยชื่อ)
  const hBox = document.querySelector(SEL.channelHandleBox);
  const handle = ((hBox && hBox.textContent) || '').match(/@[a-z0-9._-]+/i);
  return { id, name: nameEl ? nameEl.textContent.trim() : '', avatar: imgEl && imgEl.src ? imgEl.src : '', handle: handle ? handle[0] : '' };
}
const chanLabel = (c: Channel) => c.name || c.id || L('ไม่ทราบช่อง', 'Unknown channel');
// คืนค่า '' ถ้าอัปได้ หรือข้อความเตือนถ้าไม่ตรงกับช่องที่ล็อกไว้
function channelProblem() {
  const lock = settings.lockChannel;
  if (!lock) return '';
  const cur = getChannel();
  if (!cur.id) return L(`ตรวจไม่พบช่องปัจจุบัน (ล็อกไว้ที่ "${lock.name}")`, `Could not detect the current channel (locked to "${lock.name}")`);
  return cur.id === lock.id ? '' : L(`ตอนนี้อยู่ช่อง "${chanLabel(cur)}" แต่ล็อกไว้ที่ "${lock.name}"`, `Currently on channel "${chanLabel(cur)}" but locked to "${lock.name}"`);
}
// @port-end

// The userscript's buildVars() read the settings and the current channel itself; the
// template module takes them as env.
export const buildVars = (rawName: unknown, n: number | string, txt?: unknown, opt?: BuildOpts): Vars =>
  buildVarsWith(rawName, n, txt, opt, { year: settings.year, producer: settings.producer, channelName: getChannel().name });

export { chanLabel, channelProblem, getChannel };
