import { defineExtensionMessaging } from '@webext-core/messaging';

export type ProtocolMap = {
  openPanel(): void;
  // Phase 0 spike only — removed in Phase 2
  'spike:cfg'(): Record<string, unknown>;
  'spike:inject'(itemId: string): { ok: boolean; detail: string };
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
