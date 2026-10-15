import { Component, type ReactNode } from 'react';
import { L } from '@/lib/i18n';
import { crashButtons, openDebugPage } from './crash-kit';

// A render error in one tab (or its footer) shows a line there instead of unmounting the
// whole panel: React drops the entire tree when nothing catches it.
export class PaneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(e: unknown) {
    console.error('[ytup] panel render error', e);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p role="alert" className="rounded-[10px] border border-warn/35 bg-warn/[0.1] px-2.5 py-2 text-xs text-warn">
        {L('แท็บนี้เกิดข้อผิดพลาด — ปิดแล้วเปิดแผงด้านข้างใหม่', 'This tab hit an error — close and reopen the side panel')}{' '}
        <button type="button" className="underline underline-offset-2" onClick={openDebugPage}>{crashButtons().debug}</button>
      </p>
    );
  }
}
