import type { ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { L } from '@/lib/i18n';
import { focusTab } from '@/lib/panel/target';
import { Icon } from '../Icon';
import { usePanel } from '../panel';

function Banner({ icon, text, children }: { icon: string; text: string; children?: ReactNode }) {
  return (
    <div className="mx-[18px] mt-3 flex items-center gap-2.5 rounded-[14px] border border-warn/40 bg-warn/[0.08] px-3 py-2.5 text-[13px]">
      <Icon name={icon} size={16} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1">{text}</span>
      {children}
    </div>
  );
}

// What the panel can't do right now, and the one action that fixes it.
export function Banners() {
  const { link, target, runner, elsewhere, refresh } = usePanel();
  const goToRunner = () => {
    if (runner) focusTab(runner).catch((e) => console.error('[ytup] go to runner tab failed', e)).finally(refresh);
  };
  return (
    <>
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
    </>
  );
}
