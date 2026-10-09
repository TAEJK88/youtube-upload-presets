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
  ],
};
