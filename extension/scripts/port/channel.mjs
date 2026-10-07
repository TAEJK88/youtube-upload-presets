// lib/studio/channel.ts ← "ช่องที่กำลังใช้งาน (กันอัปผิดช่อง)"; ytcfg now comes from the MAIN world
export default {
  file: 'lib/studio/channel.ts',
  regions: ['1693-1714'],
  subs: [
    ["const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;", 'const W = mainWorld;', 1],
  ],
};
