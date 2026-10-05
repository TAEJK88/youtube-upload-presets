import { getLang, type Lang } from './i18n';
import { load, save } from './storage';

// First clip goes out at `start`, each next one `every` hours/days later.
export interface Schedule { on: boolean; start: string; every: number; unit: 'hour' | 'day' }

export interface Settings {
  autoApply: boolean; // manual single-file upload → fill in details
  autoNext: boolean; // click Next to the Visibility step
  autoSave: boolean; // queue mode: click Save
  thumb: boolean; // queue mode: upload the same-named image as thumbnail
  thumbWaitMin: number; // max minutes to wait for the upload before setting the thumbnail
  intercept: boolean; // route multi-file picks in Studio's dialog into the queue
  delay: number; // seconds to pause between files
  pace: 'normal' | 'slow' | 'slower'; // stretches every wait (x1 / x1.6 / x2.5)
  year: string; // {year}; empty = this year
  confirmStart: boolean; // confirm the channel before starting the queue
  category: string; // as Studio shows it; empty = don't set
  alteredContent: 'skip' | 'no' | 'yes'; // AI use
  paidPromotion: 'skip' | 'no' | 'yes';
  monetization: 'on' | 'off' | 'skip';
  adSuitability: 'none' | 'skip';
  producer: string; // {producer}; empty = current channel name
  lockChannel: { id: string; name: string } | null; // only allow uploads to this channel
  autoAcceptInvite: boolean;
  quickActions: boolean; // buttons under Studio's title/description
  glass: number; // panel opacity % (removed with the side panel in Phase 3)
  notify: boolean; // desktop notification + sound when the queue ends
  schedule: Schedule;
  glassV2?: boolean;
  lang?: Lang;
}

export const defaultSettings = (legacy: { autoApply?: boolean; autoNext?: boolean } = {}): Settings => ({
  autoApply: legacy.autoApply ?? true,
  autoNext: legacy.autoNext ?? false,
  autoSave: true,
  thumb: true,
  thumbWaitMin: 120,
  intercept: true,
  delay: 3,
  pace: 'slow',
  year: '',
  confirmStart: true,
  category: 'Music',
  alteredContent: 'skip',
  paidPromotion: 'no',
  monetization: 'on',
  adSuitability: 'none',
  producer: '',
  lockChannel: null,
  autoAcceptInvite: true,
  quickActions: true,
  glass: 82,
  notify: true,
  schedule: { on: false, start: '', every: 1, unit: 'day' },
});

export const saveSettings = (s: Settings) => save('settings', s);

export async function loadSettings(): Promise<Settings> {
  const [autoApply, autoNext, stored] = await Promise.all([
    load('autoApply', true),
    load('autoNext', false),
    load<Partial<Settings>>('settings', {}),
  ]);
  const s = Object.assign(defaultSettings({ autoApply, autoNext }), stored);
  let dirty = false;
  // Design B: 72% looked washed out → new default 82%, moved once if still on the old default
  if (!s.glassV2) {
    if (s.glass === 72) s.glass = 82;
    s.glassV2 = true;
    dirty = true;
  }
  if (s.lang === undefined) {
    s.lang = getLang();
    dirty = true;
  }
  if (dirty) await saveSettings(s);
  return s;
}
