import { defineExtensionMessaging } from '@webext-core/messaging';
import type { BackupImport } from './backup';
import type { ClaimsOp } from './claims/ops';
import type { ClaimsLogLine, ClaimsState, ClaimsView } from './claims/types';
import type { Job } from './runner-lock';
import type { StorePatch } from './store-writer';
import type { SwitchRequest } from './studio/channels';
import type { QueueEdit } from './studio/queue-edit';
import type { StartBinding, StartSummary } from './studio/queue-runner';
import type { ChannelView, QueueView } from './studio/queue-view';

// What the side panel needs to follow a run live; the items themselves are in
// chrome.storage.local ('queue'). `rev` goes up whenever the page changed something the
// panel shows (items, numbering, schedule, counters), so the panel knows to re-read.
export interface QueueState {
  running: boolean;
  stopping: boolean;
  prog: { pct: number | null; text: string } | null;
  rev: number;
  channel: ChannelView; // what the channel bar shows; a change makes the panel re-read
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
  // the one automation lock (D21; the sender's tab is the asker)
  'runner:acquire'(job: Job): boolean;
  'runner:release'(job: Job | 'all'): void;
  'runner:elsewhere'(job: Job | 'any'): boolean;
  'runner:holds'(job: Job): boolean;
  // the channel's copyright worker (the userscript's tab lease)
  'runner:worker'(d: { ch: string; force: boolean }): boolean;
  // settings / counters changes (lib/store-writer.ts); also sent by the side panel
  'store:patch'(p: StorePatch): void;
  // side panel → background: Settings → Import
  'backup:write'(imp: BackupImport): void;
  // copyright data writes, from Studio tabs and the side panel (lib/claims/ops.ts, D20)
  'claims:op'(op: ClaimsOp): void;
  // background → content (every Studio tab): the automation lock moved, ask again
  'runner:changed'(): void;
  // background → content (the channel's worker tab): its Auto-pilot alarm went off (D25)
  'claims:autopilot'(channelId: string): void;
  // side panel → content (the Studio tab)
  'queue:add'(ids: string[]): void;
  'queue:preflight'(): StartSummary | { error: string };
  'queue:start'(seen: StartBinding): void; // the summary's channel and items, as confirmed
  'queue:stop'(): void;
  'queue:retry'(id: string): void;
  'queue:remove'(id: string): void;
  'queue:clearDone'(): void;
  'queue:view'(): QueueView;
  'queue:edit'(e: QueueEdit): void;
  'channel:switch'(req: SwitchRequest): void;
  'fill:apply'(): void;
  'diag:dialogInfo'(): unknown;
  // side panel → content: the copyright module
  'claims:view'(): ClaimsState;
  'claims:scan'(what: 'claims' | 'ads' | 'collab'): void;
  'claims:trim'(keys: string[]): void; // openTrimConfirm(): the panel asked, the page starts; keys are videoId:claimId
  'claims:ads'(videoIds: string[]): void;
  'claims:collab'(d: { videoIds: string[]; handles: string[] }): void;
  'claims:stop'(): void;
  // content → side panel (broadcast; nobody listens while the panel is closed)
  'queue:state'(s: QueueState): void;
  'queue:toast'(msg: string): void;
  'claims:state'(s: ClaimsState): void;
  'claims:log'(l: ClaimsLogLine): void;
  'claims:show'(view: ClaimsView): void; // a scan this tab ran ended: open its list
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
