import { browser } from 'wxt/browser';
import { L } from '../i18n';
import { sendMessage } from '../messages';
import { NOTIFY_ICON } from '../notify';
import { leasedTab, workerOf } from '../runner-lock';
import { isChannelId, splitKey } from './keys';

// Auto-pilot on chrome.alarms (spec "Background", D25). The service worker can't drive the page:
// one one-shot alarm per channel at its next cycle (autopilot:<ch>.next) wakes the channel's worker
// tab (4a D21), whose tick then starts the cycle as the userscript's did (6328). Armed only for a
// cycle in the future, and never twice for the same time: a channel that stays due (no Studio tab,
// or the tab waits for the upload queue) is the tab's own tick's job, not a service worker that
// wakes every 30 s. With no Studio tab nothing runs; the next tab on that channel starts the cycle.
export const AP_ALARM = 'ap:';
export const AP_NOTE = 'apdue:';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function armAutopilot(ch: string, value: unknown, now = Date.now()): Promise<void> {
  const name = AP_ALARM + ch;
  // 'unknown' is no channel (a key an older build may have left): never armed.
  const next = ch !== 'unknown' && isObj(value) && value.on === true ? Number(value.next) || 0 : 0;
  const cur = await browser.alarms.get(name);
  if (next <= now) {
    if (cur) await browser.alarms.clear(name);
    return;
  }
  if (cur?.scheduledTime === next) return;
  await browser.alarms.create(name, { when: next });
  // A new cycle: the last one started or ran, so its "is due" notice is out of date.
  await browser.notifications.clear(AP_NOTE + ch).catch(() => {});
}

// At service worker start. It reads all of storage once to find the autopilot:<ch> keys (they
// can't be named up front); changes after that go key by key (registerAutopilotAlarms).
export async function syncAutopilotAlarms(now = Date.now()): Promise<void> {
  const on = new Set<string>();
  for (const [k, v] of Object.entries(await browser.storage.local.get(null))) {
    const s = splitKey(k);
    if (s?.name !== 'autopilot' || !s.ch) continue;
    on.add(AP_ALARM + s.ch);
    await armAutopilot(s.ch, v, now);
  }
  for (const a of await browser.alarms.getAll()) {
    if (a.name.startsWith(AP_ALARM) && !on.has(a.name)) await browser.alarms.clear(a.name);
  }
}

// The alarm went off: tell the channel's worker tab, or the tab its lease names when the lease
// is stale (a tab hidden for 5 minutes has its timers slowed and renews late; a message still
// reaches it at once, and the tab asks for the lease afresh before it ticks). No such tab, or no
// live script in it (one opened before the extension loaded): nothing runs until a tab ticks.
export async function nudgeAutopilot(alarmName: string, send: typeof sendMessage = sendMessage): Promise<boolean> {
  const ch = alarmName.slice(AP_ALARM.length);
  const tabId = (await workerOf(ch)) ?? (await leasedTab(ch));
  if (tabId === null) return false;
  try {
    await send('claims:autopilot', ch, tabId);
    return true;
  } catch {
    return false;
  }
}

// "Auto-pilot is due" (user request, call 33): the alarm went off and no Studio tab could run the
// cycle. Once per channel and due `next`, kept in storage.local so no restart repeats it. Not
// for a channel whose Auto-pilot is off (an alarm that outlived a switch-off).
export const NOTIFIED_KEY = 'apNotified';
const LATE = 60_000;

export async function notifyAutopilotDue(ch: string, next: number): Promise<boolean> {
  const got = await browser.storage.local.get([NOTIFIED_KEY, 'claimScan:' + ch, 'autopilot:' + ch]);
  const ap = got['autopilot:' + ch];
  if (!isObj(ap) || ap.on !== true) return false;
  const seen = isObj(got[NOTIFIED_KEY]) ? got[NOTIFIED_KEY] : {};
  if (seen[ch] === next) return false;
  await browser.storage.local.set({ [NOTIFIED_KEY]: { ...seen, [ch]: next } });
  const scan = got['claimScan:' + ch];
  const name = (isObj(scan) && typeof scan.channelName === 'string' && scan.channelName) || ch;
  await browser.notifications.create(AP_NOTE + ch, {
    type: 'basic', iconUrl: NOTIFY_ICON, silent: true,
    title: L('Auto-pilot ถึงรอบแล้ว', 'Auto-pilot is due'),
    message: L(`ไม่มีแท็บ YouTube Studio ของช่อง ${name} เปิดอยู่ — คลิกเพื่อเปิด แล้ว Auto-pilot จะสแกนและตัดให้`, `No YouTube Studio tab for ${name} is open — click to open one and Auto-pilot will scan and trim`),
  });
  return true;
}

// The click opens Studio on that channel in a new tab: tabs.create needs no `tabs` permission.
// (No existing tab to focus: the notification only exists when no Studio tab could run the cycle.)
// The new tab's first tick on that channel starts the due cycle. With no Chrome window open
// (macOS) tabs.create fails: a new window then, which needs no permission either.
export async function openFromAutopilotNote(id: string): Promise<boolean> {
  if (!id.startsWith(AP_NOTE)) return false;
  const ch = id.slice(AP_NOTE.length);
  const url = isChannelId(ch) && ch !== 'unknown' ? `https://studio.youtube.com/channel/${ch}` : 'https://studio.youtube.com/';
  await browser.tabs.create({ url })
    .catch(() => browser.windows.create({ url }))
    .catch((e) => console.error('[ytup] open Studio from notification', e));
  await browser.notifications.clear(id).catch(() => {});
  return true;
}

// Called once from the background, at its top level (MV3 listeners). `send` is for the tests.
export function registerAutopilotAlarms(send: typeof sendMessage = sendMessage): void {
  browser.alarms.onAlarm.addListener((a) => {
    if (!a.name.startsWith(AP_ALARM)) return;
    const ch = a.name.slice(AP_ALARM.length);
    // a.scheduledTime is the cycle's `next`: the alarm was armed at exactly that time. An alarm
    // more than LATE after it means Chrome was closed past the cycle: a restored Studio tab is
    // probably still loading and starts the cycle on its own tick, so no notice (call 36).
    const late = Date.now() - a.scheduledTime > LATE;
    void nudgeAutopilot(a.name, send)
      .then((reached) => (reached || late ? false : notifyAutopilotDue(ch, a.scheduledTime)))
      .catch((e) => console.error('[ytup] autopilot nudge', e));
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      const s = splitKey(k);
      if (s?.name === 'autopilot' && s.ch) void armAutopilot(s.ch, newValue).catch((e) => console.error('[ytup] autopilot alarm', e));
    }
  });
}
