// lib/main-youtubei.ts ← authHeader + yti (Studio's /youtubei/v1 calls), run in the MAIN world:
// they need ytcfg and the page's cookies. The "not signed in" sentence is said by the tab.
export default {
  file: 'lib/main-youtubei.ts',
  regions: ['4655-4661', '4663-4683'],
  subs: [
    ["throw new Error(L('ไม่ได้ล็อกอิน (ไม่พบคุกกี้ SAPISID)', 'Not signed in (SAPISID cookie not found)'));", 'throw new Error(NO_SAPISID);', 1],
  ],
};
