// lib/studio/automation.ts ← "Studio DOM automation" (985-1099) plus the small DOM helpers
// the later sections share, pulled forward so the studio modules import in one direction.
export default {
  file: 'lib/studio/automation.ts',
  regions: ['985-1099', '1106-1115', '1129-1137', '1208-1223', '1280-1284', '1547-1550'],
  subs: [
    // TS-forced: isVisible() is a type guard, so its false branch narrows `el` to never; the cast needs parentheses
    ["[...el.querySelectorAll('*')].some(", "[...(el).querySelectorAll('*')].some(", 1],
  ],
};
