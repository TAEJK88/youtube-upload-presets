// lib/claims/claims.ts ← the copyright module (the Claims IIFE, user.js 4592–6357) as page code:
// its closure's variables are this module's. Storage goes through the claims store (one writer,
// D20), ytcfg is the copy refreshCfg made, the drawer UI is the side panel's (ClaimsUi).
export default {
  file: 'lib/claims/claims.ts',
  // 4a: the channel, its keys, counts, the three scans, the run / follow-up / Auto-pilot getters
  // the status reads, the status card and the log. 4b grows it to the whole module.
  regions: ['4605-4606', '4617-4617', '4623-4629', '4633-4653', '4710-4759', '4761-4837', '5066-5066', '5254-5259', '5261-5287',
    '5458-5465', '5467-5484', '5654-5655', '5742-5743', '5770-5770', '5772-5773', '5823-5824', '5846-5846', '6107-6120', '6122-6170', '6174-6180'],
  replaceLines: [
    // the log box is the side panel's: the line goes there (claims:log)
    { lines: '6177-6179', to: '      cui.log(msg, type);' },
  ],
  subs: [
    // a video whose claim details can't be read is skipped, as before; they are counted, and the
    // scan's last line says how many (the 30 s limit and the answer check can fail them all)
    ["'err'); continue; }", "'err'); skipped++; continue; }", 1],
    ['const rows = [];', 'const rows = [];\n        skipped = 0;', 1],
    ['if (show) showClaims();', 'detailsSkipped(claimed.length);\n        if (show) showClaims();', 1],
    // the answer is page data: an owner id like `constructor` must not read a built-in as its name
    ['const owners = {};', 'const owners = Object.create(null);', 1],
    // counting the songs without a copy of the whole history (getCounts() runs every 3 s in every Studio tab)
    ['songs: Object.keys(getSongs()).length,', 'songs: songCount(),', 1],
    // the claim / ads / Collab lists are the side panel's views: it opens them when the scan ends
    ['if (show) showClaims();', "if (show) cui.show('claims');", 1],
    ['if (show) showAds();', "if (show) cui.show('ads');", 1],
    ['        showCollab();', "        cui.show('collab');", 1],
    // built when used, after initI18n() (as STATUS in queue-runner)
    ['const ADS_STEPS = [', 'const ADS_STEPS = () => [', 1],
    ['const COLLAB_STEPS = [', 'const COLLAB_STEPS = () => [', 1],
    ['const TRIM_STEPS = [', 'const TRIM_STEPS = () => [', 1],
    ['steps: ADS_STEPS,', 'steps: ADS_STEPS(),', 1],
    ['steps: COLLAB_STEPS,', 'steps: COLLAB_STEPS(),', 1],
    ['steps: TRIM_STEPS,', 'steps: TRIM_STEPS(),', 1],
  ],
};
