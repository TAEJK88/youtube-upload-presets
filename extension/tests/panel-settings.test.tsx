// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { SettingsTab } from '../entrypoints/sidepanel/tabs/SettingsTab';
import { setLang } from '../lib/i18n';
import { importBackup } from '../lib/panel/backup-io';
import { toPanelData } from '../lib/panel/data';
import { runnerTab } from '../lib/panel/target';
import { RUNNER_HELD } from '../lib/runner-lock';
import { fakeLive, fakePanel, renderPanel, state } from './panel-fake';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));
vi.mock('../lib/panel/target', async (orig) => ({ ...(await orig<typeof import('../lib/panel/target')>()), runnerTab: vi.fn(async () => null) }));
vi.mock('../lib/panel/backup-io', async (orig) => ({ ...(await orig<typeof import('../lib/panel/backup-io')>()), importBackup: vi.fn(async () => {}) }));
beforeEach(() => {
  setLang('en');
  vi.mocked(toast).mockClear();
  vi.mocked(importBackup).mockReset().mockResolvedValue(undefined);
  vi.mocked(runnerTab).mockReset().mockResolvedValue(null);
});
afterEach(cleanup);

const flush = () => act(async () => {});

describe('settings tab', () => {
  it('Troubleshooting → Open debug page opens debug.html in a tab', async () => {
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    renderPanel(<SettingsTab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open debug page' })));
    expect(create).toHaveBeenCalledWith({ url: browser.runtime.getURL('/debug.html') });
    create.mockRestore();
  });

  it('switches write one key each', () => {
    const api = fakePanel();
    renderPanel(<SettingsTab />, api);
    fireEvent.click(screen.getByRole('switch', { name: /Notify when the queue finishes/ }));
    expect(api.write.settings).toHaveBeenCalledWith({ notify: false });
    fireEvent.click(screen.getByRole('switch', { name: /Press Next to the Visibility page/ }));
    expect(api.write.settings).toHaveBeenCalledWith({ autoNext: true });
  });

  it('a write that fails is said in the panel', async () => {
    const api = fakePanel();
    vi.mocked(api.write.settings).mockRejectedValueOnce(new Error('boom'));
    renderPanel(<SettingsTab />, api);
    fireEvent.click(screen.getByRole('switch', { name: /Notify when the queue finishes/ }));
    await flush();
    expect(toast).toHaveBeenCalledWith("Couldn't save (boom)", { id: 'save-failed' });
  });

  it('language changes at once', () => {
    const api = fakePanel();
    renderPanel(<SettingsTab />, api);
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / ภาษา' }), { target: { value: 'th' } });
    expect(api.write.settings).toHaveBeenCalledWith({ lang: 'th' });
  });

  it('text fields write trimmed; number fields on blur, clamped like the drawer', () => {
    const api = fakePanel({ data: toPanelData({ settings: { delay: 3 } }) });
    renderPanel(<SettingsTab />, api);
    fireEvent.change(screen.getByPlaceholderText('Mine'), { target: { value: 'Thai Beats ' } });
    expect(api.write.settings).toHaveBeenCalledWith({ producer: 'Thai Beats' });
    const delay = screen.getByRole('spinbutton', { name: /Pause between files/ });
    fireEvent.focus(delay);
    fireEvent.change(delay, { target: { value: '-4' } });
    expect(api.write.settings).not.toHaveBeenCalledWith({ delay: 0 });
    fireEvent.blur(delay);
    expect(api.write.settings).toHaveBeenCalledWith({ delay: 0 });
    const wait = screen.getByRole('spinbutton', { name: /Max thumbnail wait/ });
    fireEvent.focus(wait);
    fireEvent.change(wait, { target: { value: '' } });
    fireEvent.blur(wait);
    expect(api.write.settings).toHaveBeenCalledWith({ thumbWaitMin: 120 });
  });

  it('pace says which pace it is, once stored', async () => {
    const api = fakePanel();
    renderPanel(<SettingsTab />, api);
    fireEvent.change(screen.getByRole('combobox', { name: /Pace/ }), { target: { value: 'slower' } });
    expect(api.write.settings).toHaveBeenCalledWith({ pace: 'slower' });
    await flush();
    expect(toast).toHaveBeenCalledWith('Pace: Very slow (x2.5)');
    vi.mocked(toast).mockClear();
    vi.mocked(api.write.settings).mockRejectedValueOnce(new Error('boom'));
    fireEvent.change(screen.getByRole('combobox', { name: /Pace/ }), { target: { value: 'normal' } });
    await flush();
    expect(toast).toHaveBeenCalledWith("Couldn't save (boom)", { id: 'save-failed' });
    expect(toast).not.toHaveBeenCalledWith('Pace: Normal (x1)');
  });

  it('copies the upload dialog info from the Studio tab', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const api = fakePanel();
    vi.mocked(api.send).mockResolvedValueOnce({ version: '5.0.0' } as never);
    renderPanel(<SettingsTab />, api);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy upload dialog info' })));
    expect(api.send).toHaveBeenCalledWith('diag:dialogInfo', undefined);
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ version: '5.0.0' }, null, 1));
    expect(toast).toHaveBeenCalledWith('Troubleshooting info copied — paste it to the developer');
    vi.mocked(api.send).mockRejectedValueOnce(new Error('no Studio tab'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy upload dialog info' })));
    expect(toast).toHaveBeenCalledWith("Couldn't copy the upload dialog info (no Studio tab)");
    vi.unstubAllGlobals();
  });
});

describe('settings tab: import', () => {
  const backup = JSON.stringify({ app: 'yt-upload-presets', format: 1, presets: [{ id: 'a', label: 'Alpha' }] });
  const pick = (text = backup) => act(async () => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    fireEvent.change(input, { target: { files: [new File([text], 'b.json', { type: 'application/json' })] } });
  });

  it('asks whose file it is, and sends the answer', async () => {
    renderPanel(<SettingsTab />, fakePanel());
    await pick();
    expect(screen.getByRole('dialog').textContent).toContain('Alpha');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: "Someone else's" })));
    expect(importBackup).toHaveBeenCalledWith(expect.objectContaining({ app: 'yt-upload-presets' }), [expect.objectContaining({ id: 'a' })], false);
    expect(toast).toHaveBeenCalledWith('Imported 1 presets');
  });

  it('dismissing the question imports nothing', async () => {
    renderPanel(<SettingsTab />, fakePanel());
    await pick();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('a file it cannot use is explained', async () => {
    renderPanel(<SettingsTab />, fakePanel());
    await pick('{');
    expect(toast).toHaveBeenCalledWith("Can't read the file — it must be a .json file exported from this script");
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refused only while a run is in progress (here or in another tab)', async () => {
    renderPanel(<SettingsTab />, fakePanel(), fakeLive({ liveState: state({ running: true }) }));
    await pick();
    expect(toast).toHaveBeenCalledWith('Stop the queue before importing');
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    vi.mocked(toast).mockClear();
    vi.mocked(runnerTab).mockResolvedValue({ tabId: 9, windowId: 1, title: 'Other', jobs: ['queue'] });
    renderPanel(<SettingsTab />, fakePanel());
    await pick();
    expect(toast).toHaveBeenCalledWith('Stop the queue before importing');
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('the background refusing it (a run holds the lock) says so', async () => {
    vi.mocked(importBackup).mockRejectedValueOnce(new Error(RUNNER_HELD));
    renderPanel(<SettingsTab />, fakePanel());
    await pick();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'My file' })));
    expect(toast).toHaveBeenCalledWith('Stop the queue before importing');
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("Couldn't import"));
  });

  it('a run that started while asking still refuses it', async () => {
    renderPanel(<SettingsTab />, fakePanel());
    await pick();
    vi.mocked(runnerTab).mockResolvedValue({ tabId: 9, windowId: 1, title: 'Other', jobs: ['queue'] });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'My file' })));
    expect(importBackup).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Stop the queue before importing');
  });

  it('a failed import is said, with no success toast', async () => {
    vi.mocked(importBackup).mockRejectedValueOnce(new Error('disk full'));
    renderPanel(<SettingsTab />, fakePanel());
    await pick();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'My file' })));
    expect(toast).toHaveBeenCalledWith("Couldn't import (disk full)");
    expect(toast).not.toHaveBeenCalledWith('Imported 1 presets');
  });
});
