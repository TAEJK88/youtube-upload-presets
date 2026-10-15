import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageUi, type PageUi } from '../lib/studio/page-ui';
import { rememberChannel, switchChannel } from '../lib/studio/channels';
import { setOtherTabRuns } from '../lib/studio/queue-runner';
import { load, save } from '../lib/studio/state';

const toasts: string[] = [];
const ui = {
  item() {}, run() {}, queue() {}, schedule() {}, presetPreview() {}, toast: (m: string) => void toasts.push(m),
  openDrawer() {}, notifyDone() {}, setTitleMark() {}, confirmStart: async () => false,
} satisfies PageUi;
const ch = (id: string, name: string, extra = {}) => ({ id, name, avatar: '', handle: '', ...extra });

beforeEach(() => {
  setPageUi(ui);
  toasts.length = 0;
  save('channels', []);
});
afterEach(() => vi.restoreAllMocks());

describe('rememberChannel (the drawer remembered every channel it saw)', () => {
  it('puts the current channel first, once', () => {
    save('channels', [ch('UC1', 'One')]);
    rememberChannel(ch('UC2', 'Two'));
    rememberChannel(ch('UC2', 'Two'));
    expect(load('channels', []).map((c: { id: string }) => c.id)).toEqual(['UC2', 'UC1']);
  });

  it('keeps a known handle when the page shows none, and skips a channel without a name', () => {
    save('channels', [ch('UC1', 'One', { handle: '@one' })]);
    rememberChannel(ch('UC1', 'One renamed'));
    expect(load('channels', [])).toEqual([ch('UC1', 'One renamed', { handle: '@one' })]);
    rememberChannel(ch('UC3', ''));
    expect(load('channels', [])).toHaveLength(1);
  });
});

describe('switchChannel', () => {
  const sw = { switchToChannel: vi.fn() };
  beforeEach(() => sw.switchToChannel.mockClear());

  it('goes through the channel switcher', () => {
    switchChannel(sw, { name: 'Two', handle: '@two', next: 'https://studio.youtube.com/channel/UC2' }, () => false);
    expect(sw.switchToChannel).toHaveBeenCalledWith({ name: 'Two', handle: '@two' }, 'https://studio.youtube.com/channel/UC2');
  });

  it('only continues to Studio', () => {
    expect(() => switchChannel(sw, { name: '', handle: '', next: 'https://evil.example/' }, () => false)).toThrow('Studio');
    expect(sw.switchToChannel).not.toHaveBeenCalled();
  });

  it('refuses look-alike hosts and malformed requests', () => {
    for (const next of ['https://studio.youtube.com.evil.example/', 'https://studio.youtube.com@evil.example/', 'http://studio.youtube.com/', 'https://studio.youtube.com:8443/', 'studio.youtube.com/']) {
      expect(() => switchChannel(sw, { name: 'Two', handle: '', next }, () => false)).toThrow('Studio');
    }
    for (const bad of [null, {}, { name: 'Two', handle: '', next: 1 }, { name: 2, handle: '', next: 'https://studio.youtube.com/' }]) {
      expect(() => switchChannel(sw, bad as never, () => false)).toThrow('malformed');
    }
    expect(sw.switchToChannel).not.toHaveBeenCalled();
  });

  it('not while the queue runs in this tab', () => {
    switchChannel(sw, { name: 'Two', handle: '', next: 'https://studio.youtube.com/' }, () => true);
    expect(sw.switchToChannel).not.toHaveBeenCalled();
    expect(toasts).toEqual(['Upload queue is still running — switching channels now would stop it']);
  });

  it('not while another Studio tab runs the queue either (the switch changes every tab)', () => {
    setOtherTabRuns(true);
    try {
      switchChannel(sw, { name: 'Two', handle: '', next: 'https://studio.youtube.com/' });
    } finally {
      setOtherTabRuns(false);
    }
    expect(sw.switchToChannel).not.toHaveBeenCalled();
    expect(toasts).toEqual(['Upload queue is still running — switching channels now would stop it']);
    switchChannel(sw, { name: 'Two', handle: '', next: 'https://studio.youtube.com/' });
    expect(sw.switchToChannel).toHaveBeenCalledOnce();
  });
});
