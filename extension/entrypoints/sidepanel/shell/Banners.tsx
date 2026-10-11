import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';
import { needingGrant, queuedFileIds, regrant, type Lost } from '@/lib/panel/regrant';
import { focusTab } from '@/lib/panel/target';
import { USERSCRIPT_HERE } from '@/lib/studio/userscript-here';
import { updateAvailable, UPDATE_KEY, type UpdateInfo } from '@/lib/update-check';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

function Banner({ icon, text, children }: { icon: string; text: string; children?: ReactNode }) {
  return (
    <div role="status" className="mx-[18px] mt-3 flex items-center gap-2.5 rounded-[14px] border border-warn/40 bg-warn/[0.08] px-3 py-2.5 text-[13px]">
      <Icon name={icon} size={16} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1">{text}</span>
      {children}
    </div>
  );
}

// What the panel can't do right now, and the one action that fixes it.
export function Banners() {
  const { link, target, runner, elsewhere, busyElsewhere, view, refresh, setLost: share } = usePanel();
  // Queued files without read permission: back to 'prompt' after a browser restart (D18),
  // or 'denied' (a blocked prompt). The banner offers a re-grant for all of them; only the
  // 'prompt' ones are shared with Start (a denied file fails its own item when it uploads).
  const [lost, setLost] = useState<Lost[]>([]);
  const ids = view ? queuedFileIds(view.items).join(',') : '';
  useEffect(() => {
    let alive = true;
    void needingGrant(ids ? ids.split(',') : []).then((l) => { if (alive) setLost(l); });
    return () => { alive = false; };
  }, [ids]);
  const asked = (l: Lost[]) => l.filter((x) => x.state === 'prompt').map((x) => x.id);
  useEffect(() => { share(asked(lost)); }, [lost, share]);
  const regrantAll = () => {
    const ids = lost.map((x) => x.id);
    void regrant(ids).then(() => needingGrant(ids)).then((l) => { setLost(l); share(asked(l), true); refresh(); });
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
      {lost.length > 0 && (
        <Banner icon="lock" text={L('ไฟล์ในคิวต้องขออนุญาตอ่านอีกครั้งหลังเปิดเบราว์เซอร์ใหม่', 'Files in the queue need read access again after a browser restart')}>
          <Button size="sm" onClick={regrantAll}>{L(`อนุญาตอีกครั้ง (${lost.length} ไฟล์)`, `Re-grant access (${lost.length} files)`)}</Button>
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
        <Banner icon="shield" text={L('แท็บ Studio อื่นกำลังทำงานด้านลิขสิทธิ์อยู่ — รอให้เสร็จ หรือกดหยุดในแท็บลิขสิทธิ์', 'Another Studio tab is busy with copyright work — wait for it, or press Stop in the Copyright tab')}>
          <Button size="sm" onClick={goToRunner}>{L('ไปที่แท็บนั้น', 'Go to that tab')}</Button>
        </Banner>
      )}
      {update && (
        <Banner icon="download" text={L(`มีเวอร์ชันใหม่: ${update.latest} (ที่ใช้อยู่คือ ${browser.runtime.getManifest().version})`, `Update available: version ${update.latest} (you have ${browser.runtime.getManifest().version})`)}>
          <Button size="sm" onClick={() => void browser.tabs.create({ url: update.url }).catch((e) => console.error('[ytup] open release failed', e))}>{L('ดาวน์โหลดเวอร์ชันใหม่', 'Get the update')}</Button>
        </Banner>
      )}
    </>
  );
}
