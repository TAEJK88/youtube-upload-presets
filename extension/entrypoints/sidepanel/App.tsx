import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { L } from '@/lib/i18n';
import { Icon } from './Icon';
import { Banners } from './shell/Banners';

export type TabKey = 'queue' | 'presets' | 'claims' | 'settings';
// The drawer's tabs, in its order (3317).
export const tabDefs = (): [TabKey, string, string][] => [
  ['queue', L('อัปโหลด', 'Upload'), 'queue'],
  ['presets', L('พรีเซ็ต', 'Presets'), 'layers'],
  ['claims', L('ลิขสิทธิ์', 'Copyright'), 'shield'],
  ['settings', L('ตั้งค่า', 'Settings'), 'sliders'],
];

export function App() {
  const [tab, setTab] = useState<TabKey>('queue');
  return (
    <div className="flex h-dvh flex-col">
      <Banners />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-[18px] mt-3">
          {tabDefs().map(([k, label, ic]) => (
            <TabsTrigger key={k} value={k}>
              <Icon name={ic} size={17} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-4 pb-[18px]">
          {tabDefs().map(([k]) => <TabsContent key={k} value={k} />)}
        </div>
      </Tabs>
      <Toaster />
    </div>
  );
}
