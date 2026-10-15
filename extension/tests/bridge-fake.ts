import { vi } from 'vitest';
import type { Access } from '../lib/file-handles';

// The page's file bridge (lib/file-bridge-client.ts) for the queue's tests: `getFile` as
// given, every file readable at Start unless `access` says otherwise.
export const fakeBridge = (getFile: (id: string) => Promise<File>, access: (id: string) => Access = () => 'granted') =>
  ({ getFile, hold: vi.fn(async (ids: string[]) => ids.map(access)), release: vi.fn() });
