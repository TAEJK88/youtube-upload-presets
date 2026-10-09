// Phase 0 only. Method 1 of the userscript's injectUploadFile(): put the File
// into Studio's upload <input> and fire change. Phase 2 ports the real one.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function injectIntoUploadDialog(file: File): Promise<boolean> {
  const dlg = document.querySelector('ytcp-uploads-dialog');
  const input =
    dlg?.querySelector<HTMLInputElement>('input[type=file][name="Filedata"]') ??
    dlg?.querySelector<HTMLInputElement>('input[type=file]');
  if (!dlg || !input) throw new Error('Open Studio\'s upload dialog first (Create → Upload videos)');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  for (let i = 0; i < 40; i++) {
    if (dlg.querySelector('#title-textarea #textbox')) return true; // details step is showing
    await sleep(250);
  }
  return false;
}
