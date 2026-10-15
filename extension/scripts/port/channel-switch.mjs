// lib/channel-switch.ts ← "สลับช่องให้อัตโนมัติ" (without the two calls that armed it at load)
export default {
  file: 'lib/channel-switch.ts',
  regions: ['249-307', '310-339'],
  subs: [
    ['GM_getValue(', 'getValue(', 2],
    ['GM_setValue(', 'setValue(', 6],
    // P5-switch-home: when the clean URLs still say no permission, the Studio home page once
    ['if (!clean || (s.tries || 0) >= 2) {', `if (!clean || (s.tries || 0) >= 2) {
      const home = location.origin + '/';
      if ((s.tries || 0) < 3 && here !== home) {
        setValue(SWITCHED_KEY, { at: s.at, tries: 3, next: s.next || '' });
        say('still no permission after retrying — going to the Studio home page');
        location.href = home;
        return;
      }`, 1],
  ],
};
