import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';
import { pickFiles } from '@/lib/panel/intake';
import { lostItems, matchLost, readPicked, relinkFiles, relinkSummary } from '@/lib/panel/relink';
import { focusTab } from '@/lib/panel/target';
import { USERSCRIPT_HERE } from '@/lib/studio/userscript-here';
import { updateAvailable, UPDATE_KEY, type UpdateInfo } from '@/lib/update-check';
import { cn } from '@/lib/utils';
import { allowAlwaysLabel, openAllowPage } from '../file-access';
import { Icon } from '../Icon';
import { openTab } from '../open-tab';
import { usePanel } from '../panel';

// `below`: the actions get a row of their own under the text (two buttons don't fit beside it).
function Banner({ icon, text, below, children }: { icon: string; text: string; below?: boolean; children?: ReactNode }) {
  return (
    <div role="status" className={cn('mx-[18px] mt-3 flex items-center gap-2.5 rounded-[14px] border border-warn/40 bg-warn/[0.08] px-3 py-2.5 text-[13px]', below && 'flex-wrap')}>
      <Icon name={icon} size={16} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1">{text}</span>
      {children}
    </div>
  );
}

// What the panel can't do right now, and the one action that fixes it.
export function Banners() {
  const { link, target, runner, elsewhere, busyElsewhere, view, refresh, noAccess, regrant, send } = usePanel();
  // Videos picked in Studio's own upload dialog whose files a reload took (lib/panel/relink.ts):
  // one pick for all of them.
  const lost = lostItems(view?.items ?? []);
  const readd = async () => {
    try {
      const picked = await pickFiles();
      if (!picked.length) return;
      const m = matchLost(lost, await readPicked(picked));
      if (m.pairs.length) await relinkFiles(m.pairs, (ids) => send('queue:edit', { op: 'relink', ids }));
      toast(relinkSummary(m.pairs.length, lost.length, m.missing, m.unused));
    } catch (e) {
      console.error('[ytup] re-add lost files', e);
      toast(L('เพิ่มไฟล์กลับไม่ได้: ', 'Could not re-add the files: ') + ((e as Error)?.message ?? String(e)));
    }
  };
  const goToRunner = () => {
    if (runner) focusTab(runner).catch((e) => console.error('[ytup] go to runner tab failed', e)).finally(refresh);
  };
  // A newer release on GitHub (lib/update-check.ts; the background asks once a day).
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    const read = () => void browser.storage.local.get(UPDATE_KEY)
      .then((got) => setUpdate(updateAvailable(got[UPDATE_KEY], browser.runtime.getManifest().version)))
      .catch(() => {});
    const changed = (changes: Record<string, unknown>, area: string) => { if (area === 'local' && UPDATE_KEY in changes) read(); };
    read();
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, []);
  return (
    <>
      {view?.userscript && <Banner icon="alert" text={USERSCRIPT_HERE()} />}
      {/* Queued files this browser no longer lets the extension read (file-access.ts). */}
      {noAccess.length > 0 && (
        <Banner below icon="lock" text={L('ไฟล์ในคิวต้องขออนุญาตอ่านอีกครั้ง — เบราว์เซอร์ถอนสิทธิ์ไปแล้ว', 'Files in the queue need read access again — the browser has withdrawn it')}>
          <div className="flex basis-full flex-wrap justify-end gap-2">
            <Button size="sm" onClick={regrant}>{L(`อนุญาตอีกครั้ง (${noAccess.length} ไฟล์)`, `Re-grant access (${noAccess.length} files)`)}</Button>
            {/* Once and for all: Chrome's "Allow on every visit", asked in a tab (entrypoints/allow). */}
            <Button size="sm" onClick={openAllowPage}>{allowAlwaysLabel()}</Button>
          </div>
        </Banner>
      )}
      {lost.length > 0 && (
        <Banner icon="upload" text={L(`${lost.length} ไฟล์หายไปเมื่อ Studio โหลดหน้าใหม่ — เป็นไฟล์ที่เลือกในหน้าต่างอัปโหลดของ Studio`, `${lost.length} files were lost when Studio reloaded — they came from Studio's own upload dialog`)}>
          <Button size="sm" onClick={() => void readd()}>{L('เพิ่มไฟล์กลับ', 'Re-add files')}</Button>
        </Banner>
      )}
      {link === 'noScript' && target && (
        <Banner icon="sync" text={L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab')}>
          <Button size="sm" onClick={() => void browser.tabs.reload(target.tabId).catch((e) => console.error('[ytup] reload failed', e))}>{L('โหลดแท็บนี้ใหม่', 'Reload this tab')}</Button>
        </Banner>
      )}
      {elsewhere && runner && (
        <Banner icon="upload" text={L('แท็บ Studio อื่นกำลังอัปโหลดคิวอยู่ — แก้คิวในแท็บนั้น', 'Another Studio tab is running the queue — change the queue there')}>
          <Button size="sm" onClick={goToRunner}>{L('ไปที่แท็บนั้น', 'Go to that tab')}</Button>
        </Banner>
      )}
      {!elsewhere && busyElsewhere && runner && (
        <Banner icon="shield" text={L('แท็บ Studio อื่นกำลังทำงานด้านลิขสิทธิ์อยู่ — รอให้เสร็จ หรือกดหยุดในแท็บเครื่องมือ', 'Another Studio tab is busy with copyright work — wait for it, or press Stop in the Tools tab')}>
          <Button size="sm" onClick={goToRunner}>{L('ไปที่แท็บนั้น', 'Go to that tab')}</Button>
        </Banner>
      )}
      {update && (
        <Banner icon="download" text={L(`มีเวอร์ชันใหม่: ${update.latest} (ที่ใช้อยู่คือ ${browser.runtime.getManifest().version})`, `Update available: version ${update.latest} (you have ${browser.runtime.getManifest().version})`)}>
          <Button size="sm" onClick={() => openTab(update.url)}>{L('ดาวน์โหลดเวอร์ชันใหม่', 'Get the update')}</Button>
        </Banner>
      )}
    </>
  );
}
