import { browser } from 'wxt/browser';
import { buildBackup, parseBackup, type BackupImport } from '../backup';
import { L } from '../i18n';
import { sendMessage } from '../messages';
import { defaultPresets, type Preset } from '../presets';
import { loadSettings } from '../settings';
import { load } from '../storage';
import { pad } from '../template';

// Settings → Back up / share (UI section 4375–4462), without the page: the file is built
// from storage, and an import goes to the background, which turns it into writes in order
// with every other settings change (store-writer), against what storage holds then, and
// runs later migrations on it.
export const backupFileName = (d = new Date()) => `yt-upload-presets-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;

export async function exportBackup(version = browser.runtime.getManifest().version): Promise<{ name: string; json: string; count: number }> {
  const presets = await load<Preset[]>('presets', defaultPresets());
  const file = buildBackup({
    presets,
    activeId: await load('activeId', presets[0]?.id ?? ''),
    counters: await load<Record<string, number>>('counters', {}),
    settings: await loadSettings(),
    cfg: await load<Record<string, unknown>>('cfg', {}),
  }, version);
  return { name: backupFileName(), json: JSON.stringify(file, null, 2), count: presets.length };
}

export type ImportStep =
  | { kind: 'error'; message: string }
  | { kind: 'ask'; data: Record<string, unknown>; presets: Preset[] };

export function readImport(text: string): ImportStep {
  const r = parseBackup(text);
  if (r.ok) return { kind: 'ask', data: r.data, presets: r.presets };
  if (r.reason === 'json') return { kind: 'error', message: L('อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .json ที่ส่งออกจากสคริปต์นี้', 'Can\'t read the file — it must be a .json file exported from this script') };
  if (r.reason === 'notBackup') return { kind: 'error', message: L('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ YouTube Upload Presets หรือข้อมูลเสียหาย', 'This is not a YouTube Upload Presets backup file, or it is damaged') };
  const fmt = r.format;
  return { kind: 'error', message: L(
    `ไฟล์สำรองนี้มาจากสคริปต์เวอร์ชันใหม่กว่า (format ${fmt}) — อัปเดตสคริปต์ก่อนแล้วนำเข้าอีกครั้ง`,
    `This backup is from a newer version of the script (format ${fmt}) — update the script first, then import again`) };
}

// The panel sends the parsed file and the user's answer; applyBackup runs in the background
// (store-writer writeBackupInOrder), never here against a copy of settings that may be stale.
export async function importBackup(
  data: Record<string, unknown>, presets: Preset[], own: boolean,
  write: (imp: BackupImport) => Promise<void> = (imp) => sendMessage('backup:write', imp),
): Promise<void> {
  await write({ data, presets, own });
}
