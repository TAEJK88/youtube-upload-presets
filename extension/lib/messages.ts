import { defineExtensionMessaging } from '@webext-core/messaging';
import type { StartSummary } from './studio/queue-runner';

// What the side panel needs to follow a run live; the items themselves are in
// chrome.storage.local ('queue'). `rev` goes up whenever the page changed something the
// panel shows (items, numbering, schedule, counters), so the panel knows to re-read.
export interface QueueState {
  running: boolean;
  stopping: boolean;
  prog: { pct: number | null; text: string } | null;
  rev: number;
}

export interface QueueDoneNote { title: string; text: string; focused: boolean }

export type ProtocolMap = {
  // content → background
  openPanel(): void;
  // wait for the startup migrations, answer the schemaVersion
  ensureMigrated(): number;
  // forget stored file handles (the page can't reach the extension's IndexedDB)
  'files:delete'(ids: string[]): void;
  // "queue finished" desktop notification
  notify(n: QueueDoneNote): void;
  // the one-runner lock (the sender's tab is the asker)
  'runner:acquire'(): boolean;
  'runner:release'(): void;
  'runner:elsewhere'(): boolean;
  // side panel → content (the Studio tab)
  'queue:add'(ids: string[]): void;
  'queue:preflight'(): StartSummary | { error: string };
  'queue:start'(confirmed: boolean): void;
  'queue:stop'(): void;
  'queue:retry'(id: string): void;
  'queue:remove'(id: string): void;
  'queue:clearDone'(): void;
  'fill:apply'(): void;
  'diag:dialogInfo'(): unknown;
  // content → side panel (broadcast; nobody listens while the panel is closed)
  'queue:state'(s: QueueState): void;
  'queue:toast'(msg: string): void;
  // developer tools in the Phase 0 panel (removed with it in Phase 3)
  'spike:cfg'(): Record<string, unknown>;
  'dev:switchChannel'(t: { handle: string; next: string }): void;
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
