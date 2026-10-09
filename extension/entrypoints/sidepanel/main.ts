import { browser } from 'wxt/browser';
import { deleteHandle, getHandle, listIds, putHandle } from '@/lib/file-store';
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

async function render() {
  const list = $('#files');
  list.replaceChildren();
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (!h) continue;
    const li = document.createElement('li');
    li.textContent = `${h.name} · ${await h.queryPermission({ mode: 'read' })} `;
    const inject = document.createElement('button');
    inject.textContent = 'Inject into Studio';
    inject.onclick = async () => {
      try {
        const r = await sendMessage('spike:inject', id, await studioTabId());
        log(`inject ${h.name}: ${r.ok ? 'PASS' : 'FAIL'} — ${r.detail}`);
      } catch (e) {
        log(`inject ${h.name}: ERROR ${errText(e)}`);
      }
    };
    const del = document.createElement('button');
    del.textContent = 'Remove';
    del.onclick = async () => { await deleteHandle(id); await render(); };
    li.append(inject, del);
    list.append(li);
  }
}

const drop = $('#drop');
drop.addEventListener('dragover', (e) => e.preventDefault());
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  // getAsFileSystemHandle() must be called synchronously inside the drop event
  const pending = [...(e.dataTransfer?.items ?? [])]
    .filter((i) => i.kind === 'file')
    .map((i) => i.getAsFileSystemHandle());
  for (const h of await Promise.all(pending)) {
    if (h?.kind !== 'file') continue;
    await putHandle(crypto.randomUUID(), h as FileSystemFileHandle);
    log(`stored handle: ${h.name}`);
  }
  await render();
});

$('#regrant').addEventListener('click', async () => {
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (h) log(`${h.name}: ${await h.requestPermission({ mode: 'read' })}`);
  }
  await render();
});

render();
