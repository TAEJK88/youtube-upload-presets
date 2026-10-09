// lib/claims/core.ts ← the copyright module's pure helpers: settings defaults, formatting,
// claimInfo, the song key and parseCSV, and the tracklist check against claimed songs
// (which takes the song history as an argument instead of reading it).
export default {
  file: 'lib/claims/core.ts',
  regions: ['4593-4604', '4685-4691', '4694-4707', '5065-5065', '5117-5136', '5167-5187'],
  subs: [
    ['function claimedSongsIn(txt) {', 'function claimedSongsIn(txt, songs) {', 1],
    ['const db = Object.values(getSongs());', 'const db = Object.values(songs);', 1],
  ],
};
