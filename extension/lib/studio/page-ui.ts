import type { QueueItem } from './queue-runner';

// Everything the ported page code used to do to the userscript's drawer. The content
// script installs the real implementation (lib/studio/content-ui.ts: persist the queue,
// tell the side panel, in-page toast); tests install a recorder; until then nothing
// happens. Each method names the userscript function it replaces.
export interface PageUi {
  item(it: QueueItem): void; // updateItemUI(it)
  run(): void; // updateRunUI()
  queue(): void; // renderQueue()
  schedule(): void; // onScheduleChange() / syncScheduleInput()
  presetPreview(): void; // renderPresetPreview()
  toast(msg: string): void; // toast(msg)
  openDrawer(tab?: string): void; // openDrawer(tab)
  notifyDone(title: string, text: string, ok?: boolean): void; // notifyDone(...)
  setTitleMark(mark: string): void; // setTitleMark(mark)
  confirmStart(): Promise<boolean>; // the ask() before a run; answered in the side panel
}

const quiet: PageUi = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast() {}, openDrawer() {},
  notifyDone() {}, setTitleMark() {}, confirmStart: async () => false,
};

export let ui: PageUi = quiet;
export function setPageUi(next: PageUi): void {
  ui = next;
}
