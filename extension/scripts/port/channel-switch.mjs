// lib/channel-switch.ts ← "สลับช่องให้อัตโนมัติ" (without the two calls that armed it at load)
export default {
  file: 'lib/channel-switch.ts',
  regions: ['249-307', '310-339'],
  subs: [
    ['GM_getValue(', 'getValue(', 2],
    ['GM_setValue(', 'setValue(', 6],
  ],
};
