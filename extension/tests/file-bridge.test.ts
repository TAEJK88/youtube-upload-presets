import { describe, expect, it } from 'vitest';
import { CONNECT, isBridgeConnect, readHandle } from '../lib/file-bridge';

const handle = (perm: PermissionState, getFile: () => Promise<File>) =>
  ({ kind: 'file', name: 'clip.mp4', queryPermission: async () => perm, getFile }) as unknown as FileSystemFileHandle;

describe('readHandle', () => {
  it('rejects with "missing" when the item has no stored handle', async () => {
    await expect(readHandle(undefined)).rejects.toThrow('missing');
  });

  it('rejects with "permission" when read access is not granted', async () => {
    await expect(readHandle(handle('prompt', async () => new File([], 'x')))).rejects.toThrow('permission');
  });

  it('rejects with "read" when the file is gone or unreadable', async () => {
    const gone = handle('granted', async () => { throw new DOMException('A requested file could not be found', 'NotFoundError'); });
    await expect(readHandle(gone)).rejects.toThrow('read');
  });

  it('returns the File when granted', async () => {
    const f = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
    expect(await readHandle(handle('granted', async () => f))).toBe(f);
  });
});

describe('isBridgeConnect', () => {
  const parent = {} as Window;
  const port = {} as MessagePort;
  const event = (over: Partial<{ origin: string; source: unknown; data: unknown; ports: MessagePort[] }> = {}) =>
    ({ origin: 'https://studio.youtube.com', source: parent, data: { ch: CONNECT }, ports: [port], ...over }) as unknown as MessageEvent;

  it('accepts the valid case', () => {
    expect(isBridgeConnect(event(), parent)).toBe(true);
  });

  it('rejects the wrong origin', () => {
    expect(isBridgeConnect(event({ origin: 'https://evil.example' }), parent)).toBe(false);
  });

  it('rejects when the source is not the parent window', () => {
    expect(isBridgeConnect(event({ source: {} }), parent)).toBe(false);
  });

  it('rejects the wrong channel', () => {
    expect(isBridgeConnect(event({ data: { ch: 'nope' } }), parent)).toBe(false);
  });

  it('rejects a missing port', () => {
    expect(isBridgeConnect(event({ ports: [] }), parent)).toBe(false);
  });
});
