import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { copyText, crashButtons, crashDetails, crashHeading, currentStage, errorDetail, openDebugPage, reloadPage, stageLine, type Stage } from './crash-kit';

// Around the whole tree, providers included: a render error anywhere outside a tab's own
// PaneBoundary (channel bar, banners, providers) shows this instead of a blank panel.
export class RootBoundary extends Component<{ children: ReactNode }, { error: unknown; stage: Stage } | { error: null }> {
  override state: { error: unknown; stage: Stage } | { error: null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('unknown render error'), stage: currentStage() };
  }

  override componentDidCatch(e: unknown, info: ErrorInfo) {
    console.error('[ytup] panel crashed', e, info.componentStack); // the debug log keeps it
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return <CrashView error={this.state.error} stage={this.state.stage} />;
  }
}

export function CrashView({ error, stage }: { error: unknown; stage: Stage }) {
  const b = crashButtons();
  const [copied, setCopied] = useState(false);
  return (
    <div role="alert" className="flex flex-col gap-2 p-4 text-[13px] text-fg">
      <h1 className="text-base font-semibold">{crashHeading()}</h1>
      <p>{stageLine(stage)}</p>
      <pre className="overflow-auto rounded-[8px] border border-tint/20 p-2 font-mono text-xs break-words whitespace-pre-wrap select-text">{errorDetail(error)}</pre>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copyText(crashDetails(error, stage)).then((ok) => setCopied(ok))}>{copied ? b.copied : b.copy}</Button>
        <Button size="sm" onClick={openDebugPage}>{b.debug}</Button>
        <Button size="sm" onClick={reloadPage}>{b.reload}</Button>
      </div>
    </div>
  );
}
