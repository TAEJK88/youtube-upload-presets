// lib/studio/queue-runner.ts ← "คิวอัปโหลด" plus uploadProg / pollUploadProgress (they read
// `running`). Drawer UI calls go through the PageUi port (lib/studio/page-ui.ts), Files come
// from the bridge or the page by item id, and one Studio tab runs the queue at a time.
export default {
  file: 'lib/studio/queue-runner.ts',
  regions: ['1685-1691', '1716-2186', '2188-2216'],
  replaceLines: [
    // the start dialog moves to the side panel: queue:preflight → (panel asks) → queue:start(true)
    { lines: '2112-2143', to: '      const go = await ui.confirmStart();' },
  ],
  subs: [
    ['let qid = 0;', '', 1],
    ['{ id: ++qid, file, presetId: activeId,', '{ id: file.qid, src: file.src, file: fileMeta(file), presetId: activeId,', 1],
    ['if (it.ui) updateItemUI(it);', 'ui.item(it);', 1],
    ['it.thumb = file;', 'it.thumb = { id: file.qid, src: file.src, ...fileMeta(file) };', 1],
    ['toast(', 'ui.toast(', 5],
    ['renderQueue();', 'ui.queue();', 2],
    ['updateItemUI(it);', 'ui.item(it);', 1],
    ['updateRunUI();', 'ui.run();', 2],
    ["if (typeof onScheduleChange === 'function') onScheduleChange();", 'ui.schedule();', 1],
    ["if (typeof syncScheduleInput === 'function') syncScheduleInput();", 'ui.schedule();', 1],
    ['LOCALE', 'locale()', 2],
    // the Files are fetched by id; a thumbnail that can't be read says it was the thumbnail
    ["'An upload dialog is still open. Close it, then start again'));",
      "'An upload dialog is still open. Close it, then start again'));\n    const file = await getQueueFile(it.id, it.src);\n    const thumbFile = settings.thumb && it.thumb ? await getThumbFile(it.thumb) : null;", 1],
    ['injectUploadFile(input, it.file)', 'injectUploadFile(input, file)', 1],
    ['setThumbnail(it.thumb, 3000)', 'setThumbnail(thumbFile, 3000)', 1],
    ['VIS[vis]', 'visLabels()[vis]', 1],
    ['openDrawer(', 'ui.openDrawer(', 3],
    ['    running = true;\n    stopReq = false;',
      "    if (!(await lock.acquire())) return ui.toast(L('มีแท็บ Studio อื่นกำลังอัปโหลดคิวหรือทำงานด้านลิขสิทธิ์อยู่', 'Another Studio tab is already running the queue or copyright work'));\n    if (running) return;\n    running = true;\n    stopReq = false;", 1],
    ['      running = false;\n      assignNumbers();', '      running = false;\n      lock.release();\n      assignNumbers();', 1],
    ['notifyDone(', 'ui.notifyDone(', 1],
    ['setTitleMark(', 'ui.setTitleMark(', 1],
    ['addFiles(t.files);', 'addQueued(pageFiles(t.files));', 1],
    ['addFiles(files);', 'addQueued(pageFiles(files));', 1],
    // installIntercept() returns a disposer: the two capture listeners go with an AbortSignal
    ['    },\n    true\n  );', '    },\n    { capture: true, signal }\n  );', 2],
    // STATUS is built when used, after initI18n() (it was built at import, so always English)
    ['const STATUS = {', 'const STATUS = () => ({', 1],
    ["    error: [L('ผิดพลาด', 'Error'), 'err'],\n  };", "    error: [L('ผิดพลาด', 'Error'), 'err'],\n  });", 1],
    // while another Studio tab runs the queue (cached flag; a listener can't await), Studio keeps its own picks
    ['if (!settings.intercept || !(t instanceof HTMLInputElement)', 'if (!settings.intercept || otherTabRuns || !(t instanceof HTMLInputElement)', 1],
    ['if (injectingFile || !settings.intercept || !e.target', 'if (injectingFile || !settings.intercept || otherTabRuns || !e.target', 1],
    // uploadCurrent() marks the item being processed (Remove refuses it) around uploadOne()
    ['await uploadOne(it);', 'await uploadCurrent(it);', 1],
    // the schedule refresh before a start waits START_SCHED_WAIT_MS at most (youtubei calls take up to 30 s)
    ['await refreshChanSched(true);', 'await refreshForStart();', 1],
  ],
};
