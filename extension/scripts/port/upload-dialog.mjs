// lib/studio/upload-dialog.ts ← thumbnail, the steps between Details and Visibility,
// notice dialogs, opening the picker, file injection and the dialog diagnostics.
export default {
  file: 'lib/studio/upload-dialog.ts',
  regions: ['585-585', '1225-1278', '1285-1381', '1508-1545', '1551-1683'],
  subs: [
    ["version: GM_info && GM_info.script ? GM_info.script.version : '',", 'version: browser.runtime.getManifest().version,', 1],
    ['[].concat(v)', '([]).concat(v)', 1], // TS-forced: `[]` is never[]; ([] as string[]) keeps its parentheses
    ['p.getRootNode().host', '(p.getRootNode()).host', 1], // TS-forced: Node has no `host`; the ShadowRoot cast `(p.getRootNode() as ShadowRoot).host` keeps its parentheses
    ['String(i.src)', 'String((i).src)', 1], // TS-forced: `i` is an Element (from `all`); `String((i as HTMLImageElement).src)` keeps its parentheses
  ],
};
