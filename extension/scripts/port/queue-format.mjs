// lib/queue-format.ts ← the queue's pure helpers (STATUS, file kinds, readText, fmtWhen,
// toLocalInput), ported a second time beside lib/studio/queue-runner.ts so the side panel
// can use them without importing the runner and the Studio state behind it.
export default {
  file: 'lib/queue-format.ts',
  regions: ['1725-1735', '1738-1743', '1928-1934'],
  subs: [
    // STATUS is built when used, after initI18n() (as in queue-runner.mjs)
    ['const STATUS = {', 'const STATUS = () => ({', 1],
    ["    error: [L('ผิดพลาด', 'Error'), 'err'],\n  };", "    error: [L('ผิดพลาด', 'Error'), 'err'],\n  });", 1],
    ['LOCALE', 'locale()', 2],
  ],
};
