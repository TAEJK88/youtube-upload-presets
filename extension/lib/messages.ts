import { defineExtensionMessaging } from '@webext-core/messaging';

export interface QueueDoneNote { title: string; text: string; focused: boolean }

export type ProtocolMap = {
  openPanel(): void;
  // content → background: wait for the startup migrations, answer the schemaVersion
  ensureMigrated(): number;
  // Phase 0 spike only — removed in Phase 2b
  'spike:cfg'(): Record<string, unknown>;
  'spike:inject'(itemId: string): { ok: boolean; detail: string };
  // content → background: "queue finished" desktop notification
  notify(n: QueueDoneNote): void;
  // content → background: the one-runner lock (the sender's tab is the asker)
  'runner:acquire'(): boolean;
  'runner:release'(): void;
  'runner:elsewhere'(): boolean;
  // developer panel → Studio tab: start a channel switch (the real trigger arrives in Phase 3)
  'dev:switchChannel'(t: { handle: string; next: string }): void;
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
