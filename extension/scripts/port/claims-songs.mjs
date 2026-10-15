// lib/claims/songs.ts ← recordSongs / markSongTrimmed / importSongsCSV as reducers over the song
// history: the background runs them for the songs op (D20), so they take the history and the
// time as arguments and return what the userscript logged or toasted (the callers show it).
export default {
  file: 'lib/claims/songs.ts',
  regions: ['5069-5091', '5093-5103', '5137-5164'],
  subs: [
    ['function recordSongs(rows, chName) {\n      const db = getSongs();\n      const now = new Date().toISOString();', 'function recordSongs(db, rows, chName, now) {', 1],
    ["      setSongs(db);\n      if (added) log(L(`🎵 เพิ่มเพลงใหม่ ${added} เพลงในประวัติ`, `🎵 Added ${added} new songs to history`), 'ok');", '      return added;', 1],
    ['function markSongTrimmed(item) {\n      const db = getSongs();', 'function markSongTrimmed(db, item) {', 1],
    ['      }\n      setSongs(db);\n    }\n', '      }\n    }\n', 1],
    ['async function importSongsCSV(file) {\n      const rows = parseCSV(await file.text());', 'function importSongs(db, text, now) {\n      const rows = parseCSV(text);', 1],
    ["      if (col('song') < 0) return toast(L('ไฟล์นี้ไม่ใช่ CSV ประวัติเพลง (ต้องมีคอลัมน์ song)', 'This is not a song history CSV (needs a song column)'));\n      const db = getSongs();", "      if (col('song') < 0) return -1;", 1],
    ['new Date().toISOString().slice(0, 10)', 'now.slice(0, 10)', 2],
    ["      setSongs(db);\n      toast(L(`นำเข้าประวัติเพลง ${n} เพลงแล้ว`, `Imported ${n} songs into history`));\n      renderStatus();\n      refreshClaimWarnings();", '      return n;', 1],
    // importSongs runs on a file the user picked, in the panel (for the count) and in the background's one
    // writer. The userscript looked each column, claimant, type and video up by scanning (head.indexOf,
    // includes, Object.values(e.videos).some), which is quadratic: one row naming 20,000 videos took 27 s
    // (T8 review I2). Same result, looked up in maps kept for the length of one import:
    // - the header's columns, first of a repeated name as indexOf gave;
    ['const col = (n) => head.indexOf(n);', 'const cols = new Map(head.map((h, i) => [h, i]).reverse());\n      const col = (n) => cols.get(n) ?? -1;', 1],
    // - per song entry, what it holds already: claimants, types, and how many of its videos have each name
    //   (a count, because an imported video can replace another under the same key). `e.videos || {}`: a
    //   stored entry without videos fails only a row that names videos, as the userscript's scan did;
    ['let n = 0;', "let n = 0;\n      const seen = new Map();\n      const hadOf = (e) => {\n        let h = seen.get(e);\n        if (!h) {\n          h = { claimants: new Set(e.claimants), types: new Set(e.types), videos: new Map() };\n          for (const x of Object.values(e.videos || {})) h.videos.set(x.video, (h.videos.get(x.video) || 0) + 1);\n          seen.set(e, h);\n        }\n        return h;\n      };", 1],
    ["        g('claimants').split(';')", "        const had = hadOf(e);\n        const channel = g('channels').split(';')[0] || '';\n        g('claimants').split(';')", 1],
    ['if (!e.claimants.includes(c)) e.claimants.push(c);', 'if (!had.claimants.has(c)) { had.claimants.add(c); e.claimants.push(c); }', 1],
    ['if (!e.types.includes(c)) e.types.push(c);', 'if (!had.types.has(c)) { had.types.add(c); e.types.push(c); }', 1],
    ["if (!Object.values(e.videos).some((x) => x.video === v)) e.videos[k] = { video: v, channel: g('channels').split(';')[0] || '', status: 'claimed' };",
      "if (!had.videos.get(v)) {\n            const old = e.videos[k];\n            if (old) had.videos.set(old.video, had.videos.get(old.video) - 1);\n            e.videos[k] = { video: v, channel, status: 'claimed' };\n            had.videos.set(v, 1);\n          }", 1],
  ],
};
