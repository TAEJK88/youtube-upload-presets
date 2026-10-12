// lib/claims/claims.ts ← the copyright module (the Claims IIFE, user.js 4592–6357) as page code:
// its closure's variables are this module's. Storage goes through the claims store (one writer:
// the background, D20); partial writes are ops (chMerge / chList / chRunItem) where the userscript
// read, changed and wrote a whole value. ytcfg is the copy refreshCfg made. The drawer UI is the
// side panel's (ClaimsUi). The tab lease (5043–5062) is the background's worker lease (isWorker)
// plus the automation lock before page changes (claimLock). uploadBusy() is claims.ts's own (4a T6).
// Left out: the modals and the pane (4851–4858, 4860–4936, 4980–5040, 5190–5251, 5289–5334,
// 5486–5546, 5672–5696, 5875–5904, 6182–6307: the Copyright tab), fixTracklist (lib/tracklist.ts),
// the pure helpers (core.ts) and the song reducers (songs.ts).
export default {
  file: 'lib/claims/claims.ts',
  regions: ['4605-4606', '4608-4614', '4617-4617', '4623-4629', '4633-4653', '4710-4759', '4761-4837', '5066-5066', '5254-5259',
    '5261-5287', '5337-5453', '5458-5465', '5467-5484', '5548-5647', '5650-5670', '5698-5739', '5742-5770', '5772-5820',
    '5823-5873', '5907-6104', '6107-6120', '6122-6170', '6174-6180', '6310-6354'],
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
    ['TRIM_LABEL = {', 'TRIM_LABEL = () => ({', 1],
    ["'⏳ Queued — will trim after the previous trim on this video finishes'),\n    };", "'⏳ Queued — will trim after the previous trim on this video finishes'),\n    });", 1],
    ['TRIM_LABEL[state]', 'TRIM_LABEL()[state]', 1],
    ['LOCALE', 'locale()', 4],
    ["toast(L('ยังตัดชุดก่อนไม่เสร็จ'", "cui.toast(L('ยังตัดชุดก่อนไม่เสร็จ'", 1],
    // one op per result instead of read-change-write of the whole object (D20)
    ["      const res = chGet('adsResults', {});\n      res[item.videoId] = { state, msg, date: new Date().toISOString() };\n      chSet('adsResults', res);\n      const run = getAdsRun();\n      if (run) { const it = run.items.find((x) => x.videoId === item.videoId); if (it) { it.state = state; it.msg = msg; } setAdsRun(run); }",
      "      chMerge('adsResults', { [item.videoId]: { state, msg, date: new Date().toISOString() } });\n      chRunItem('adsRun', 'videoId', item.videoId, state, msg);", 1],
    ["      const res = chGet('collabResults', {});\n      res[item.videoId] = { state, msg, date: new Date().toISOString() };\n      chSet('collabResults', res);\n      const run = getCollabRun();\n      if (run) { const it = run.items.find((x) => x.videoId === item.videoId); if (it) { it.state = state; it.msg = msg; } setCollabRun(run); }",
      "      chMerge('collabResults', { [item.videoId]: { state, msg, date: new Date().toISOString() } });\n      chRunItem('collabRun', 'videoId', item.videoId, state, msg);", 1],
    ["      const res = chGet('trimResults', {});\n      res[item.key] = { state, msg, date: new Date().toISOString() };\n      chSet('trimResults', res);\n      const run = getRun();\n      if (run && run.active) {\n        const it = run.items.find((x) => x.key === item.key);\n        if (it) { it.state = state; it.msg = msg; }\n        setRun(run);\n      }\n      if (state === 'saved' || state === 'gone') chSet('trimQueue', chGet('trimQueue', []).filter((k) => k !== item.key));",
      "      chMerge('trimResults', { [item.key]: { state, msg, date: new Date().toISOString() } });\n      chRunItem('trimRun', 'key', item.key, state, msg, true);\n      if (state === 'saved' || state === 'gone') chList('trimQueue', { del: [item.key] });", 1],
    ["const res = chGet('trimResults', {}); res[p.key] = { state: 'gone', msg: L('ปล่อยแล้ว', 'Released'), date: new Date().toISOString() }; chSet('trimResults', res);",
      "chMerge('trimResults', { [p.key]: { state: 'gone', msg: L('ปล่อยแล้ว', 'Released'), date: new Date().toISOString() } });", 1],
    ["if (r.links.length) chSet('collabLinks', Object.assign(collabLinks(), Object.fromEntries(r.links.map((x) => [x.handle, x.link]))));",
      "if (r.links.length) chMerge('collabLinks', Object.fromEntries(r.links.map((x) => [x.handle, x.link])));", 1],
    // Stop from another tab (or the panel) must not write back a stale copy of the run
    ['      run.active = false;\n      setRun(run);', "      run.active = false;\n      chMerge('trimRun', { active: false });", 1],
    ['      run.active = false;\n      setAdsRun(run);', "      run.active = false;\n      chMerge('adsRun', { active: false });", 1],
    ['      run.active = false;\n      setCollabRun(run);', "      run.active = false;\n      chMerge('collabRun', { active: false });", 1],
    // the cycle's times, without writing back an `on` the user may have switched off meanwhile
    ['setAP(Object.assign(getAP(), { next: Date.now() + hours * 3600e3, last: Date.now() }));', "chMerge('autopilot', { next: Date.now() + hours * 3600e3, last: Date.now() });", 1],
    ["(GM_getValue('settings') || {}).autoAcceptInvite === false", 'settings.autoAcceptInvite === false', 1],
    ["const mine = load('channels', []);", "const mine = loadState('channels', []);", 1],
    // a step that changes pages takes the automation lock first (D26)
    // (a Stop that landed while it waited for the lock ends the step before any page change)
    ['      trimBusy = true;\n', '      trimBusy = true;\n      if (!(await claimLock())) { setTrimStage(-1, lockWait()); trimBusy = false; return; }\n      if (!(getRun() || {}).active) { trimBusy = false; return; }\n', 1],
    ['      adsBusy = true;\n', '      adsBusy = true;\n      if (!(await claimLock())) { setAdsStage(-1, lockWait()); adsBusy = false; return; }\n      if (!(getAdsRun() || {}).active) { adsBusy = false; return; }\n', 1],
    ['      collabBusy = true;\n', '      collabBusy = true;\n      if (!(await claimLock())) { setCollabStage(-1, lockWait()); collabBusy = false; return; }\n      if (!(getCollabRun() || {}).active) { collabBusy = false; return; }\n', 1],
    // the ads and trim wait told the user to remove failed videos, which no longer hold a page change
    // back (P4-12): it names the ones that do, those still waiting in the queue
    ["L('⏸ รอคิวอัปโหลดว่างก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ค้าง/ผิดพลาดในคิวออก', '⏸ Waiting for the upload queue to clear (page change needed) — upload or remove stuck/failed videos from the queue')", "L('⏸ รอคิวอัปโหลดเสร็จก่อน (ต้องเปลี่ยนหน้า) — อัปหรือลบคลิปที่ยังรออยู่ในคิวออก', '⏸ Waiting for the upload queue to finish (page change needed) — upload or remove the videos still waiting in the queue')", 2],
    // while the Tampermonkey userscript is in the page the tick presses Save and Confirm for nobody:
    // the trim editor may be one the userscript's own review-mode run opened (Phase 5 call 7, review 1)
    ['if (!running2 && /\\/video\\/[^/]+\\/(claims|copyright)/.test(location.pathname)) {', 'if (!running2 && /\\/video\\/[^/]+\\/(claims|copyright)/.test(location.pathname) && !userscriptHere()) {', 1],
    // an item this page already settled is not done again while its write is late (store.ts: a
    // timed-out claims write may still land)
    ["const item = run.items.find((i) => i.state === 'pending');", "const item = run.items.find((i) => i.state === 'pending' && !isSettled(run, i));", 3],
    // the cycle reads ytcfg again before it scans (the cached copy may be from page load), and ends
    // if that names another channel than the one it started for
    ['const rows = await scanClaims({ show: false });', 'if (!(await freshCfg())) return;\n        const rows = await scanClaims({ show: false });', 1],
    // Task 0's two (they are in the config since then): counting songs without a copy; owner
    // names in a null-prototype map
    ['songs: Object.keys(getSongs()).length,', 'songs: songCount(),', 1],
    ['const owners = {};', 'const owners = Object.create(null);', 1],
    // the "Confirm changes" click watcher is installed by the content script, and removed with it
    ["    document.addEventListener('click', (e) => {", "    const installConfirmWatch = () => {\n    const ac = new AbortController();\n    document.addEventListener('click', (e) => {", 1],
    ['    }, true);', '    }, { capture: true, signal: ac.signal });\n    return () => ac.abort();\n    };', 1],
  ],
};
