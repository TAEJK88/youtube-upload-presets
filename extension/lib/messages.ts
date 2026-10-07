import { defineExtensionMessaging } from '@webext-core/messaging';

export type ProtocolMap = {
  openPanel(): void;
  // content → background: wait for the startup migrations, answer the schemaVersion
  ensureMigrated(): number;
  // Phase 0 spike only — removed in Phase 2b
  'spike:cfg'(): Record<string, unknown>;
  'spike:inject'(itemId: string): { ok: boolean; detail: string };
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
