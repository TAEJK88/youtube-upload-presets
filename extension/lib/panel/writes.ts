import { browser } from 'wxt/browser';
import { sendMessage } from '../messages';
import type { Preset } from '../presets';
import type { SettingsPatch } from '../settings';
import { save } from '../storage';
import type { StoredChannel } from '../studio/channels';

// Every write the panel makes. settings and counters go through the background (one writer,
// lib/store-writer.ts); presets and the default preset are the panel's own; the channel list
// is read-modify-written like the drawer did (Studio tabs add to it too).
export interface Writes {
  settings(patch: SettingsPatch): Promise<void>;
  counter(presetId: string, value: number): Promise<void>;
  activeId(id: string): Promise<void>;
  presets(list: Preset[]): Promise<void>;
  channels(fn: (list: StoredChannel[]) => StoredChannel[]): Promise<void>;
}

export const writes: Writes = {
  settings: (patch) => sendMessage('store:patch', { key: 'settings', patch }),
  counter: (presetId, value) => sendMessage('store:patch', { key: 'counters', patch: { [presetId]: value } }),
  activeId: (id) => save('activeId', id),
  presets: (list) => save('presets', list),
  async channels(fn) {
    const cur = (await browser.storage.local.get('channels')).channels;
    await save('channels', fn(Array.isArray(cur) ? (cur as StoredChannel[]) : []));
  },
};
