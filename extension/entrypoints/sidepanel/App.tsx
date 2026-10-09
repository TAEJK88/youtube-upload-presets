import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';
import { usePanel } from './panel';
import { PaneBoundary } from './PaneBoundary';
import { ActivityBar } from './shell/ActivityBar';
import { Banners } from './shell/Banners';
import { ChannelBar } from './shell/ChannelBar';
import { CopyrightTab } from './tabs/CopyrightTab';
import { PresetsFooter, PresetsTab } from './tabs/PresetsTab';
import { QueueFooter } from './tabs/QueueFooter';
import { QueueTab, usePanelDrop } from './tabs/QueueTab';
import { SettingsTab } from './tabs/SettingsTab';

export type TabKey = 'queue' | 'presets' | 'claims' | 'settings';
// The drawer's tabs, in its order (3317).
export const tabDefs = (): [TabKey, string, string][] => [
  ['queue', L('อัปโหลด', 'Upload'), 'queue'],
  ['presets', L('พรีเซ็ต', 'Presets'), 'layers'],
  ['claims', L('ลิขสิทธิ์', 'Copyright'), 'shield'],
  ['settings', L('ตั้งค่า', 'Settings'), 'sliders'],
];

const panes: Record<TabKey, () => ReactNode> = {
  queue: () => <QueueTab />,
  presets: () => <PresetsTab />,
  claims: () => <CopyrightTab />,
  settings: () => <SettingsTab />,
};
const footers: Partial<Record<TabKey, () => ReactNode>> = { queue: () => <QueueFooter />, presets: () => <PresetsFooter /> };

export function App() {
  const [tab, setTab] = useState<TabKey>('queue');
  // usePanel() also carries `lang`: a language change re-renders App, so the labels follow it.
  const { view } = usePanel();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0; // showTab(): each tab opens at its top
  }, [tab]);
  const total = view?.items.length ?? 0;
  const drop = usePanelDrop(() => setTab('queue')); // onPanelDrop(): showTab('queue')
  return (
    <div className="flex h-dvh flex-col" {...drop.handlers}>
      <ChannelBar />
      <Banners />
      <ActivityBar onGo={setTab} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-[18px] mt-3">
          {tabDefs().map(([k, label, ic]) => (
            <TabsTrigger key={k} value={k}>
              <Icon name={ic} size={17} />
              {label}
              {k === 'queue' && total > 0 && (
                <span className="rounded-full bg-tint/[0.18] px-1.5 text-xs text-tint group-data-[state=active]:bg-on-fg">{total}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-4 pb-[18px]">
          {/* Kept mounted like the drawer's panes: edits and expanded cards survive a tab switch. */}
          {tabDefs().map(([k]) => (
            <TabsContent key={k} value={k} forceMount className="data-[state=inactive]:hidden">
              <PaneBoundary>{panes[k]()}</PaneBoundary>
            </TabsContent>
          ))}
        </div>
        {footers[tab] && <PaneBoundary key={tab}>{footers[tab]()}</PaneBoundary>}
      </Tabs>
      <Toaster />
      {drop.dropping && (
        <div className="pointer-events-none fixed inset-2 z-40 grid place-items-center rounded-[16px] border-2 border-dashed border-fg2 bg-bg/60 text-[15px] font-semibold text-fg">
          {L('วางเพื่อเพิ่มเข้าคิว', 'Drop to add to the queue')}
        </div>
      )}
    </div>
  );
}
