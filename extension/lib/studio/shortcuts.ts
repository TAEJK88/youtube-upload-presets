import { L } from '../i18n';
import { ui } from './page-ui';
import { presets, setActiveId } from './state';

// The userscript's keyboard shortcuts in Studio (6386–6403): Alt+P opens the panel (the
// side panel can't be closed from a page, so it no longer toggles), Alt+1…9 picks the
// default preset. Returns a disposer.
export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    // Typing in a field: let it type (on a Mac, Option+P / Option+digit types a special character)
    const t = e.target as HTMLElement | null;
    if (/Mac/i.test(navigator.platform) && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.code === 'KeyP') {
      ui.openDrawer();
      e.preventDefault();
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const p = presets[Number(e.code.slice(5)) - 1];
      if (p) {
        setActiveId(p.id);
        ui.toast(L(`พรีเซ็ตหลัก: ${p.label}`, `Main preset: ${p.label}`));
        e.preventDefault();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
