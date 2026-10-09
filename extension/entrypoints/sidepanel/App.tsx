import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';
import { usePanel } from './panel';
import { ActivityBar } from './shell/ActivityBar';
import { Banners } from './shell/Banners';
import { ChannelBar } from './shell/ChannelBar';
import { CopyrightTab } from './tabs/CopyrightTab';
import { QueueTab } from './tabs/QueueTab';

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
  presets: () => null, // Task 9
  claims: () => <CopyrightTab />,
  settings: () => null, // Task 8
};
const footers: Partial<Record<TabKey, () => ReactNode>> = {};

export function App() {
  const [tab, setTab] = useState<TabKey>('queue');
  // usePanel() also carries `lang`: a language change re-renders App, so the labels follow it.
  const { view } = usePanel();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0; // showTab(): each tab opens at its top
  }, [tab]);
  const total = view?.items.length ?? 0;
  return (
    <div className="flex h-dvh flex-col">
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
                <span className="rounded-full bg-white/[0.18] px-1.5 text-xs text-white group-data-[state=active]:bg-[#0b0b0c]">{total}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-4 pb-[18px]">
          {/* Kept mounted like the drawer's panes: edits and expanded cards survive a tab switch. */}
          {tabDefs().map(([k]) => (
            <TabsContent key={k} value={k} forceMount className="data-[state=inactive]:hidden">
              {panes[k]()}
            </TabsContent>
          ))}
        </div>
        {footers[tab]?.()}
      </Tabs>
      <Toaster />
    </div>
  );
}
