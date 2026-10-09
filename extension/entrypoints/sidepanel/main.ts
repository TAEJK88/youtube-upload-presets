import { browser } from 'wxt/browser';
import { deleteHandle, getHandle, listIds, putHandle } from '@/lib/file-store';
import { onMessage, sendMessage } from '@/lib/messages';
import type { QueueItem } from '@/lib/studio/queue-runner';

// Developer panel (Phase 0 spike, extended in Phase 2): drives the Studio tab's queue
// runner by message until the real side panel arrives in Phase 3. Exempt from L().
export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
export const log = (msg: string) => {
  $('#log').textContent = `${new Date().toLocaleTimeString()} ${msg}\n${$('#log').textContent}`;
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const button = (label: string, onclick: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = onclick;
  return b;
};

export async function studioTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('no active tab');
  return tab.id;
}
// Send to the Studio tab and log what happened.
async function toStudio(what: string, send: (tabId: number) => Promise<unknown>) {
  try {
    const r = await send(await studioTabId());
    if (r !== undefined) log(`${what}: ${JSON.stringify(r, null, 1)}`);
  } catch (e) {
    log(`${what}: ERROR ${errText(e)}`);
  }
}
const storedQueue = async () => ((await browser.storage.local.get('queue')) as { queue?: QueueItem[] }).queue ?? [];

// Stored file handles (their keys become queue item ids).
async function renderFiles() {
  const list = $('#files');
  list.replaceChildren();
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (!h) continue;
    const li = document.createElement('li');
    li.textContent = `${h.name} · ${await h.queryPermission({ mode: 'read' })} `;
    li.append(button('Forget', async () => { await deleteHandle(id); await renderFiles(); }));
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
  await renderFiles();
});

$('#regrant').addEventListener('click', async () => {
  for (const id of await listIds()) {
    const h = await getHandle(id);
    if (h) log(`${h.name}: ${await h.requestPermission({ mode: 'read' })}`);
  }
  await renderFiles();
});

// Handles no queue item uses yet go to the Studio tab's queue.
$('#add').addEventListener('click', async () => {
  const used = new Set((await storedQueue()).flatMap((it) => [it.id, it.thumb?.id]));
  const ids = (await listIds()).filter((id) => !used.has(id));
  log(`adding ${ids.length} file(s)`);
  await toStudio('queue:add', (t) => sendMessage('queue:add', ids, t));
});

// The confirmation the userscript showed before a run, as plain text.
$('#start').addEventListener('click', () =>
  toStudio('start', async (t) => {
    const s = await sendMessage('queue:preflight', undefined, t);
    if ('error' in s) return s.error;
    const when = s.times.length ? s.times.map((x) => new Date(x).toLocaleString()).join(' → ') : `per preset (${s.vis})`;
    const text = [
      `Upload ${s.pendingN} video(s) to ${s.channel.name} (${s.channel.id})`,
      `Release: ${when}`,
      s.noTxt ? `No .txt: ${s.noTxt}` : '',
      s.noThumb ? `No thumbnail: ${s.noThumb}` : '',
      ...s.badTime.map((x) => `Too soon: ${x.name} ${new Date(x.at).toLocaleString()}`),
      ...s.prevUp.map((x) => `Already uploaded: ${x.name} (${x.title})`),
      ...s.badTl.map((x) => `Tracklist: ${x.name}: ${x.error}`),
    ].filter(Boolean).join('\n');
    if (s.needsConfirm && !confirm(text)) return 'cancelled';
    log(text);
    await sendMessage('queue:start', { channelId: s.channel.id, ids: s.ids, editRev: s.editRev }, t);
    return 'started';
  }),
);
$('#stop').addEventListener('click', () => toStudio('stop', (t) => sendMessage('queue:stop', undefined, t)));
$('#clear').addEventListener('click', () => toStudio('clear', (t) => sendMessage('queue:clearDone', undefined, t)));
$('#fill').addEventListener('click', () => toStudio('apply', (t) => sendMessage('fill:apply', undefined, t)));
$('#diag').addEventListener('click', () => toStudio('dialog info', (t) => sendMessage('diag:dialogInfo', undefined, t)));

// The queue as the Studio tab stored it.
async function renderQueue() {
  const list = $('#queue');
  list.replaceChildren();
  for (const it of await storedQueue()) {
    const li = document.createElement('li');
    li.textContent = `${it.file.name} [${it.status}] ${it.title} ${it.msg ? '— ' + it.msg : ''} `;
    if (it.status === 'error') {
      li.append(button('Retry', () => {
        if (it.draftId && !confirm(`Already uploaded as draft ${it.draftId}. Delete it in Content first. Retry?`)) return;
        void toStudio('retry', (t) => sendMessage('queue:retry', it.id, t));
      }));
    }
    if (it.status !== 'uploading' && it.status !== 'review') li.append(button('Remove', () => void toStudio('remove', (t) => sendMessage('queue:remove', it.id, t))));
    list.append(li);
  }
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.queue) void renderQueue();
});

onMessage('queue:state', ({ data: s }) => {
  const p = s.prog ? ` · ${s.prog.pct === null ? '' : Math.round(s.prog.pct * 100) + '% '}${s.prog.text}` : '';
  $('#state').textContent = `${s.running ? (s.stopping ? 'stopping' : 'running') : 'idle'}${p}`;
});
onMessage('queue:toast', ({ data: msg }) => log(`toast: ${msg}`));

renderFiles();
renderQueue();
