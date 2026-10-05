import { browser } from 'wxt/browser';
import { sendMessage } from '@/lib/messages';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
export const log = (msg: string) => {
  $('#log').textContent = `${new Date().toLocaleTimeString()} ${msg}\n${$('#log').textContent}`;
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function studioTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('no active tab');
  return tab.id;
}

$('#cfg').addEventListener('click', async () => {
  try {
    log(`ytcfg: ${JSON.stringify(await sendMessage('spike:cfg', undefined, await studioTabId()))}`);
  } catch (e) {
    log(`ytcfg: ERROR ${errText(e)}`);
  }
});
