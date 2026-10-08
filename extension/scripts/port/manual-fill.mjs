// lib/studio/manual-fill.ts ← "โหมดอัปโหลดเองทีละไฟล์: เติมข้อมูลอัตโนมัติ"
export default {
  file: 'lib/studio/manual-fill.ts',
  regions: ['2218-2238', '2240-2256'],
  subs: [
    ['toast(', 'ui.toast(', 3],
    ['renderPresetPreview();', 'ui.presetPreview();', 1],
    // installManualFill() returns a disposer that clears the poller
    ['setInterval(async () => {', 'const poll = setInterval(async () => {', 1],
  ],
};
