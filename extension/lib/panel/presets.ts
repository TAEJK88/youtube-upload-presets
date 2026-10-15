import { L } from '../i18n';
import { defaultPresets, type Preset } from '../presets';

// The drawer's preset buttons (4296–4314) and field parsing (bind() 4195–4218).
const idAt = (now: number) => 'p' + now.toString(36);

export const newPreset = (now = Date.now()): Preset => ({
  id: idAt(now), label: L('✨ พรีเซ็ตใหม่', '✨ New preset'), title: '{name}', description: '', tags: [], visibility: 'PRIVATE',
});

export function duplicatePreset(p: Preset, now = Date.now()): Preset {
  const d = { ...structuredClone(p), id: idAt(now) };
  d.label += L(' (สำเนา)', ' (copy)');
  return d;
}

// null: the last preset can't go. Queued items on the deleted preset move to the default
// preset in the Studio tab (lib/studio/queue-edit.ts followStoredChanges).
export function deletePreset(list: Preset[], id: string, activeId: string): { presets: Preset[]; activeId: string } | null {
  if (list.length < 2) return null;
  const presets = list.filter((p) => p.id !== id);
  return { presets, activeId: presets.some((p) => p.id === activeId) ? activeId : presets[0]!.id };
}

export function resetPresets(): { presets: Preset[]; activeId: string } {
  const presets = defaultPresets();
  return { presets, activeId: presets[0]!.id };
}

export const splitList = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean);
export const artistMaxOf = (text: string) => Math.max(1, parseInt(text, 10) || 4);
// "Next EP" shows counter + 1; the counter is what the next number follows.
export const epCounter = (text: string) => Math.max(1, parseInt(text, 10) || 1) - 1;
