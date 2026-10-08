import { normText } from '../collab';
import { L } from '../i18n';
import { makeTitle, renderDesc, renderTags } from '../template';
import { detailsOpen, fillDetails, getDetailsHost, getDialog, getTitleBox, onEditPage, sleep, uploadDialogOpen, waitFor } from './automation';
import { buildVars, channelProblem } from './channel';
import { ui } from './page-ui';
import { running } from './queue-runner';
import { active, counters, save, settings } from './state';
import { goToVisibility } from './upload-dialog';

// @port-begin
// ===== โหมดอัปโหลดเองทีละไฟล์: เติมข้อมูลอัตโนมัติ =====
let session: { originalName: string; n: number } | null = null;

async function applyToOpenDialog() {
  if (!detailsOpen()) return ui.toast(L('ยังไม่ได้เปิดหน้ากรอกรายละเอียดของ YouTube', 'YouTube details page is not open yet'));
  const p = active();
  if (!session) session = { originalName: normText(getTitleBox(getDetailsHost())!.textContent), n: 0 };
  session.n = session.n || (counters[p.id] || 0) + 1;
  const vars = buildVars(session.originalName, session.n, '', { preset: p });
  const title = makeTitle(p, vars);
  const tagsOk = await fillDetails({ title, description: renderDesc(p, vars), tags: renderTags(p, vars) });
  counters[p.id] = Math.max(counters[p.id] || 0, session.n);
  save('counters', counters);
  // หน้าแก้ไขคลิปไม่มีขั้น Next/การเปิดเผย — ข้ามไป แล้วเตือนให้กด Save ของ YouTube เอง
  if (settings.autoNext && !onEditPage()) await goToVisibility(p.visibility || 'PRIVATE');
  const note = tagsOk ? '' : L(' (หาช่องแท็กไม่เจอ)', ' (tags field not found)');
  ui.toast(onEditPage()
    ? L(`ใส่ข้อมูลแล้ว: ${title}${note} — กด Save ของ YouTube เพื่อบันทึก`, `Details filled in: ${title}${note} — press YouTube's Save to keep it`)
    : L(`ใส่ข้อมูลแล้ว: ${title}${note}`, `Details filled in: ${title}${note}`));
  ui.presetPreview();
}
// @port-end

// Returns a disposer, so the poller stops when the extension is reloaded under the page.
export function installManualFill(): () => void {
  // @port-begin
const poll = setInterval(async () => {
  if (running) return;
  if (!uploadDialogOpen()) {
    session = null;
    return;
  }
  if (session || !detailsOpen()) return;
  const s = (session = { originalName: '', n: 0 });
  const titleBox = getTitleBox(getDialog());
  s.originalName = (await waitFor(() => titleBox!.textContent!.trim(), 8000)) || '';
  const problem = channelProblem();
  if (problem) ui.toast(L('⚠️ ระวังอัปผิดช่อง: ', '⚠️ Possible wrong channel: ') + problem);
  if (session === s && settings.autoApply && !running && !problem) {
    await sleep(800);
    if (session === s) applyToOpenDialog();
  }
}, 1000);
  // @port-end
  return () => clearInterval(poll);
}

export { session, applyToOpenDialog };
