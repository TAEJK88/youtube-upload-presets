import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { L } from '@/lib/i18n';
import { followPanelTab, type PanelTab } from '@/lib/panel-tab';
import { Icon } from './Icon';
import { useClaims, usePanel } from './panel';
import { PaneBoundary } from './PaneBoundary';
import { ActivityBar } from './shell/ActivityBar';
import { Banners } from './shell/Banners';
import { ChannelBar } from './shell/ChannelBar';
import { CopyrightTab } from './tabs/CopyrightTab';
import { PresetsFooter, PresetsTab } from './tabs/PresetsTab';
import { QueueFooter } from './tabs/QueueFooter';
import { QueueTab, usePanelDrop } from './tabs/QueueTab';
import { SettingsTab } from './tabs/SettingsTab';

export type TabKey = PanelTab;
// The drawer's tabs, in its order (3317).
export const tabDefs = (): [TabKey, string, string][] => [
  ['queue', L('อัปโหลด', 'Upload'), 'queue'],
  ['presets', L('พรีเซ็ต', 'Presets'), 'layers'],
  ['claims', L('เครื่องมือ', 'Tools'), 'gear'],
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
  const { view, target } = usePanel();
  const { live } = useClaims();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0; // showTab(): each tab opens at its top
  }, [tab]);
  // openDrawer(tab) (3488): the bound Studio tab asked for a tab (its button during a run, a
  // multi-file pick in Studio's dialog) or its "queue finished" notification was clicked. Each
  // request is applied once, so the tab the user picks afterwards stays.
  const tabId = target?.tabId;
  const asked = useRef(0);
  useEffect(() => {
    if (tabId === undefined) return;
    return followPanelTab(tabId, (r) => {
      if (r.at === asked.current) return;
      asked.current = r.at;
      setTab(r.tab);
    });
  }, [tabId]);
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
            <TabsTrigger key={k} value={k} className="relative">
              <Icon name={ic} size={17} />
              {label}
              {k === 'queue' && total > 0 && (
                <span className="rounded-full bg-tint/[0.18] px-1.5 text-xs text-tint group-data-[state=active]:bg-on-fg">{total}</span>
              )}
              {/* a copyright run is active, in any tab (tabCount.claims, 6255): a dot in the corner, in the
                  label's colour; the four columns have no room for it beside the label */}
              {k === 'claims' && live?.busyRun && <span data-run="" className="absolute top-1 right-1 size-1.5 rounded-full bg-current" />}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* scroll-pb: a focused control scrolls clear of a sub-view's sticky footer (SubView) */}
        <div ref={body} data-pane-scroll="" className="min-h-0 flex-1 scroll-pb-28 overflow-y-auto px-[18px] pt-4 pb-[18px]">
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
