import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { parseBackup, type BackupImport } from '../lib/backup';
import { setLang } from '../lib/i18n';
import { backupFileName, exportBackup, importBackup, readImport } from '../lib/panel/backup-io';
import { writeBackupInOrder } from '../lib/store-writer';

beforeEach(() => {
  fakeBrowser.reset();
  setLang('en');
});

describe('backup export', () => {
  it('names the file by date and leaves the locked channel and language out', async () => {
    expect(backupFileName(new Date(2026, 9, 9))).toBe('yt-upload-presets-2026-10-09.json');
    await browser.storage.local.set({
      presets: [{ id: 'a', label: 'A', title: '{name}', description: '', tags: [], visibility: 'PRIVATE' }],
      settings: { producer: 'Me', lang: 'th', lockChannel: { id: 'UC1', name: 'X' } },
      counters: { a: 3 }, cfg: { ownNames: 'ME' },
    });
    const out = await exportBackup('5.0.0');
    expect(out.count).toBe(1);
    const back = parseBackup(out.json);
    expect(back.ok).toBe(true);
    const file = JSON.parse(out.json);
    expect(file).toMatchObject({ version: '5.0.0', activeId: 'a', counters: { a: 3 }, claimsCfg: { ownNames: 'ME' } });
    expect(file.settings).toMatchObject({ producer: 'Me' });
    expect(file.settings).not.toHaveProperty('lang');
    expect(file.settings).not.toHaveProperty('lockChannel');
    expect(file.settings).not.toHaveProperty('glass');
  });
});

describe('backup import', () => {
  const file = (over: Record<string, unknown> = {}) => JSON.stringify({
    app: 'yt-upload-presets', format: 1, activeId: 'b',
    presets: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    settings: { producer: 'Them', delay: 9, glass: 60 }, counters: { a: 7 }, ...over,
  });

  it('explains files it cannot use', () => {
    expect(readImport('{')).toEqual({ kind: 'error', message: "Can't read the file — it must be a .json file exported from this script" });
    expect(readImport('{"app":"other"}')).toEqual({ kind: 'error', message: 'This is not a YouTube Upload Presets backup file, or it is damaged' });
    expect(readImport(file({ format: 9 }))).toEqual({ kind: 'error', message: 'This backup is from a newer version of the script (format 9) — update the script first, then import again' });
  });

  it('sends the parsed file and the answer, nothing worked out from a copy of settings', async () => {
    const step = readImport(file());
    if (step.kind !== 'ask') throw new Error('expected ask');
    const write = vi.fn(async (_imp: BackupImport) => {});
    await importBackup(step.data, step.presets, false, write);
    expect(write).toHaveBeenCalledWith({ data: step.data, presets: step.presets, own: false });
  });

  it("someone else's file keeps your personal values; yours brings them", async () => {
    await browser.storage.local.set({ settings: { producer: 'Me', lang: 'th', lockChannel: { id: 'UC1', name: 'X' } }, counters: { a: 1 } });
    const step = readImport(file());
    if (step.kind !== 'ask') throw new Error('expected ask');
    const stored = async () => browser.storage.local.get(['settings', 'counters', 'activeId']);
    await importBackup(step.data, step.presets, false, writeBackupInOrder);
    let got = await stored();
    expect(got).toMatchObject({ activeId: 'b', settings: { producer: 'Me', delay: 9, lang: 'th', lockChannel: { id: 'UC1', name: 'X' } } });
    expect(got.counters).toEqual({ a: 1 }); // your EP numbers stay
    expect(got.settings).not.toHaveProperty('glass');
    await importBackup(step.data, step.presets, true, writeBackupInOrder);
    got = await stored();
    expect(got).toMatchObject({ settings: { producer: 'Them', lang: 'th' }, counters: { a: 7 } });
  });

  it('a failed write rejects (the tab says so)', async () => {
    const step = readImport(file());
    if (step.kind !== 'ask') throw new Error('expected ask');
    await expect(importBackup(step.data, step.presets, true, async () => { throw new Error('nope'); })).rejects.toThrow('nope');
  });
});
