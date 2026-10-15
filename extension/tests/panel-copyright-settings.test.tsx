// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsContext, type ClaimsApi } from '../entrypoints/sidepanel/panel';
import { CopyrightSettings } from '../entrypoints/sidepanel/tabs/copyright/CopyrightSettings';
import { DEFAULTS } from '../lib/claims/core';
import type { ClaimsCfg } from '../lib/claims/types';
import { setLang } from '../lib/i18n';
import { toClaimsData } from '../lib/panel/claims-data';
import { settingsSections } from '../lib/panel/claims-settings';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: vi.fn() }));

beforeEach(() => vi.mocked(toast).mockClear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setLang('en');
});

const mockSend = async () => vi.spyOn(await import('../lib/messages'), 'sendMessage').mockResolvedValue(undefined as never);
// The view by itself (the home's button is another unit's): its data and the panel's log.
function show(cfg: Partial<ClaimsCfg> = {}) {
  const onCancel = vi.fn();
  const claims: ClaimsApi = { state: null, live: null, log: [], shown: null, addLog: vi.fn() };
  render(
    <ClaimsContext.Provider value={claims}>
      <CopyrightSettings data={toClaimsData('UC1', { cfg })} onCancel={onCancel} />
    </ClaimsContext.Provider>,
  );
  return { onCancel, addLog: claims.addLog };
}
const box = (name: string | RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const text = (name: string | RegExp) => screen.getByRole('textbox', { name }) as HTMLInputElement;

describe('settingsSections (SETTINGS 6259–6274)', () => {
  it('lists every setting once, in the userscript order', () => {
    const s = settingsSections();
    expect(s.map((x) => x.title)).toEqual(['Claims and trimming', 'Auto-pilot']);
    expect(s.map((x) => x.items.map((i) => i[0]))).toEqual([
      ['ownNames', 'autoSaveTrim', 'autoSaveManualTrim', 'followUpMinutes'],
      ['apEveryHours', 'apOnlyImpact', 'apSkipOwn', 'apMaxPct', 'apMaxPerCycle', 'apAdsOn'],
    ]);
    expect(s.flatMap((x) => x.items.map((i) => i[0])).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });
  it('is built when used, in the language of the moment', () => {
    setLang('th');
    expect(settingsSections()[0]!.title).toBe('Claim และการตัด');
    expect(settingsSections()[1]!.items[0]![1]).toBe('ทำงานทุก N ชั่วโมง');
  });
});

describe('Copyright settings (openSettings 6275–6307)', () => {
  it('shows every setting with its default: a checkbox for on/off, text for the rest', () => {
    show();
    expect(screen.getByRole('heading', { level: 3, name: 'Copyright settings' })).toBeTruthy();
    expect(text('Your own artist / label names').value).toBe('');
    expect(box('Fully automatic trim').checked).toBe(true);
    expect(box('When trimming manually: auto-click Save and Confirm changes').checked).toBe(false);
    expect(text('Check every N minutes').value).toBe('10');
    expect(text('Run every N hours').value).toBe('6');
    expect(box('Only claims that affect the video (no revenue / restricted / blocked)').checked).toBe(true);
    expect(box("Don't trim your own music (★)").checked).toBe(true);
    expect(text('Skip claims longer than N % of the video').value).toBe('25');
    expect(text('Max claims per cycle').value).toBe('10');
    expect(box('Also turn on ads for videos that have them off').checked).toBe(false);
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
    // the help texts
    expect(screen.getByText('Claims with these names are marked ★ your own music (comma-separated)')).toBeTruthy();
    expect(screen.getByText(/^Clicks Save in the trim editor → ticks "I acknowledge"/)).toBeTruthy();
    expect(screen.getByText(/^Better left off — if on, the script clicks Save 1.5 seconds/)).toBeTruthy();
    expect(screen.getByText('Videos with 2+ claims: how often to check whether the previous trim has finished')).toBeTruthy();
    expect(screen.getByText('Only videos turned off in settings, not ones YouTube marks as ineligible')).toBeTruthy();
  });

  it('shows what is stored over the defaults', () => {
    show({ ownNames: 'Me, My Label', apEveryHours: '12', autoSaveTrim: false, apAdsOn: true });
    expect(text('Your own artist / label names').value).toBe('Me, My Label');
    expect(text('Run every N hours').value).toBe('12');
    expect(box('Fully automatic trim').checked).toBe(false);
    expect(box('Also turn on ads for videos that have them off').checked).toBe(true);
  });

  it('Save writes every field as one merge of cfg, says so, and the form keeps what was saved', async () => {
    const send = await mockSend();
    const { onCancel } = show();
    fireEvent.change(text('Run every N hours'), { target: { value: '12' } });
    fireEvent.change(text('Your own artist / label names'), { target: { value: 'Me' } });
    fireEvent.click(box('Fully automatic trim'));
    fireEvent.click(box('Also turn on ads for videos that have them off'));
    expect(send).not.toHaveBeenCalled(); // nothing is written before Save
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Settings saved'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(text('Run every N hours').value).toBe('12');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'merge', key: 'cfg', entries: {
      ...DEFAULTS, apEveryHours: '12', ownNames: 'Me', autoSaveTrim: false, apAdsOn: true, // numbers stay text, as typed
    } });
    expect(toast).toHaveBeenCalledWith('Settings saved');
  });

  it('Reset to defaults asks twice, then empties cfg and logs it', async () => {
    const send = await mockSend();
    const { onCancel, addLog } = show({ apEveryHours: '12' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Click again to reset' }));
    // the form shows the defaults at once, not the stored cfg its write has not changed yet
    await waitFor(() => expect(text('Run every N hours').value).toBe(DEFAULTS.apEveryHours));
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeTruthy(); // disarmed
    expect(onCancel).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('claims:op', { op: 'set', key: 'cfg', value: {} });
    expect(addLog).toHaveBeenCalledWith('Copyright settings reset', 'ok');
  });

  it('Cancel leaves without writing', async () => {
    const send = await mockSend();
    const { onCancel } = show();
    fireEvent.change(text('Run every N hours'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('a write that fails says so and keeps the view open with what was typed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(await import('../lib/messages'), 'sendMessage').mockRejectedValue(new Error('gone'));
    const { onCancel, addLog } = show();
    fireEvent.change(text('Run every N hours'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't save (gone)", { id: 'save-failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'Click again to reset' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(toast).not.toHaveBeenCalledWith('Settings saved');
    expect(addLog).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(text('Run every N hours').value).toBe('12');
  });

  it('each help text is tied to its input, and an input without help names none (review m2)', () => {
    show();
    const help = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent;
    expect(help(text('Your own artist / label names'))).toBe('Claims with these names are marked ★ your own music (comma-separated)');
    expect(help(box('Fully automatic trim'))).toMatch(/^Clicks Save in the trim editor/);
    expect(help(box('When trimming manually: auto-click Save and Confirm changes'))).toMatch(/^Better left off — if on, the script clicks Save 1.5 seconds/);
    expect(help(text('Check every N minutes'))).toBe('Videos with 2+ claims: how often to check whether the previous trim has finished');
    expect(help(box('Also turn on ads for videos that have them off'))).toBe('Only videos turned off in settings, not ones YouTube marks as ineligible');
    for (const el of [text('Run every N hours'), text('Max claims per cycle'), box("Don't trim your own music (★)")]) expect(el.hasAttribute('aria-describedby')).toBe(false);
    const ids = [...screen.getAllByRole('checkbox'), ...screen.getAllByRole('textbox')].map((el) => el.getAttribute('aria-describedby')).filter(Boolean);
    expect(new Set(ids).size).toBe(5);
  });

  it('a second Save or Reset click while the write is on its way does nothing (review m3)', async () => {
    let done!: () => void;
    const send = vi.spyOn(await import('../lib/messages'), 'sendMessage').mockImplementation(() => new Promise<never>((r) => { done = r as () => void; }));
    const saving = show();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' })); // not armed either
    expect(send).toHaveBeenCalledTimes(1);
    done();
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Settings saved'));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Click again to reset' })).toBeNull();
    cleanup();

    send.mockClear();
    const resetting = show();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await screen.findByRole('button', { name: 'Click again to reset' });
    fireEvent.click(screen.getByRole('button', { name: 'Click again to reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Click again to reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(send).toHaveBeenCalledTimes(1);
    done();
    await waitFor(() => expect(resetting.addLog).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledTimes(1); // the first part's "saved", nothing new
  });

  it('in Thai', () => {
    setLang('th');
    show();
    expect(screen.getByRole('heading', { level: 3, name: 'ตั้งค่าลิขสิทธิ์' })).toBeTruthy();
    expect(box('ตัดอัตโนมัติทั้งหมด').checked).toBe(true);
    expect(text('จำนวน claim สูงสุดต่อรอบ').value).toBe('10');
    for (const name of ['คืนค่าเริ่มต้น', 'ยกเลิก', 'บันทึก']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });
});
