import { TXT } from './studio/txt';

// Two pure functions for the progress bar — no DOM, queue or settings here.

// Percentage out of Studio's progress text, e.g. "Uploading 45% … 3 minutes left".
// Returns 0..1, or null when there is no percentage (the bar falls back to counting clips).
export function parseUploadPct(text: unknown): number | null {
  const m = String(text || '').match(TXT.uploadPct);
  if (!m) return null;
  return Math.max(0, Math.min(1, +m[1]! / 100));
}

export interface QueueSummary { running: boolean; inFlight: boolean; total: number; done: number; errors: number }
export interface ClaimsStatus { kind: string; icon?: string; title?: string; detail?: string; progress?: number }
export interface UploadProgress { pct?: number | null; text?: string }
export interface Activity {
  task: 'upload' | 'claims';
  icon: string;
  tab: 'queue' | 'claims';
  count: { at: number; of: number } | null;
  title: string;
  detail: string;
  progress: number | null;
}

// What is running right now — one task, or null when idle. The upload queue always wins:
// a claim scan is read-only and can overlap an upload. The bar is based on `done` (same as
// the Queue tab); errored clips don't move the bar but do move the counter.
export function activityFrom(q: QueueSummary, claims: ClaimsStatus | null, prog: UploadProgress | null): Activity | null {
  if (q.running || q.inFlight) {
    const pct = prog && typeof prog.pct === 'number' ? prog.pct : 0;
    return {
      task: 'upload',
      icon: '⬆',
      tab: 'queue',
      count: { at: q.done + q.errors + 1, of: q.total },
      title: '', // the caller fills this through L(), because this function must stay pure
      detail: (prog && prog.text) || '',
      progress: q.total ? Math.min(1, (q.done + pct) / q.total) : null,
    };
  }
  // computeStatus() also reports idle states ('ready' / 'Auto-pilot on') → only busy and wait count
  if (claims && (claims.kind === 'busy' || claims.kind === 'wait')) {
    return {
      task: 'claims',
      icon: claims.icon || '',
      tab: 'claims',
      count: null,
      title: claims.title || '',
      detail: claims.detail || '',
      progress: typeof claims.progress === 'number' ? claims.progress : null,
    };
  }
  return null;
}
