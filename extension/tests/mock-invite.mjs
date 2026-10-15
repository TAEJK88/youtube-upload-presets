// Stand-in for Studio's collaboration-request UI, built from the markup captured
// off a real invite page:
//   ytcp-video-collaborations-list-dialog > tp-yt-paper-dialog > ytcp-video-row[]
//     each row: a#thumbnail-anchor (click target) + a#video-title
//   accept modal: ytcp-button#confirm-button "Accept" / #deny-button "Decline"
// With a single request YouTube skips the list and opens the modal directly.
import { makeDocument } from './fake-dom.mjs';

export function mockInvitePage({ titles = ['Video A', 'Video B'], skipList = false, url, gapTicks = 0, deadList = false, loadTicks = 0, dropQuery = false } = {}) {
  const doc = makeDocument();
  const truth = { opened: [], accepted: [], declined: [], tooEarly: 0 };
  // loadTicks: the card and the list show up before what is in them has loaded (seen
  // live, 2026-10-15): a click in that time does nothing but make YouTube show an error
  let loading = 0;
  const el = (tag, attrs = {}, text) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const ytBtn = (id, label) => {
    const host = el('ytcp-button', { id });
    host.append(el('button', {}, label));
    return host;
  };

  // the content page behind the dialog — it has its own ytcp-video-row table and a
  // "Collaborations" tab, both of which previously fooled the watcher
  const page = el('div', { id: 'content' });
  page.append(el('tp-yt-paper-tab', {}, 'Collaborations'));
  for (const t of ['Unrelated upload 1', 'Unrelated upload 2']) {
    const r = el('ytcp-video-row');
    r.append(el('a', { id: 'video-title' }, t), el('a', { id: 'thumbnail-anchor' }, ''));
    r.onclick = () => { throw new Error('clicked a row in the main content table, not the dialog'); };
    page.append(r);
  }
  doc.body.append(page);

  // --- accept modal (created once, shown per request)
  const modalHost = el('ytcp-dialog');
  const modal = el('tp-yt-paper-dialog', { 'aria-label': 'collaboration-accept-dialog' });
  const viewBtn = ytBtn('view-channel-button', 'View channel');
  const denyBtn = ytBtn('deny-button', 'Decline');
  const acceptBtn = ytBtn('confirm-button', 'Accept');
  const details = el('div', { id: 'details' }, ''); // the video and channel, filled in once loaded
  modal.append(details, viewBtn, denyBtn, acceptBtn);
  modalHost.append(modal);
  modalHost.hidden = true;
  doc.body.append(modalHost);

  // --- request list
  const listHost = el('ytcp-video-collaborations-list-dialog');
  const listPaper = el('tp-yt-paper-dialog', { 'aria-label': 'collaborations-list-dialog' });
  listHost.append(listPaper);
  listHost.hidden = true;
  doc.body.append(listHost);

  let current = null;
  const remaining = [...titles];

  const openModal = (title) => { current = title; truth.opened.push(title); modalHost.hidden = false; loading = loadTicks; details.textContent = loading ? '' : title; };
  const closeModal = () => { current = null; modalHost.hidden = true; };

  const renderList = () => {
    listPaper.children = [];
    listPaper.append(el('h1', {}, 'Collaboration requests'));
    for (const t of remaining) {
      const row = el('ytcp-video-row', { tabindex: '-1' });
      const thumb = el('a', { id: 'thumbnail-anchor', href: '#' });
      thumb.onclick = () => { listHost.hidden = true; openModal(t); };
      row.append(thumb, el('a', { id: 'video-title' }, t));
      listPaper.append(row);
    }
    listHost.hidden = remaining.length === 0;
  };

  let held = 0;
  acceptBtn.onclick = () => {
    if (!current) return;
    if (loading > 0) { truth.tooEarly++; return; }
    truth.accepted.push(current);
    const i = remaining.indexOf(current);
    if (i >= 0) remaining.splice(i, 1);
    closeModal();
    // seen live 2026-10-15: once the card closes, YouTube's URL loses d=acd and inviterChannelId
    if (dropQuery) win.location.search = '';
    if (gapTicks) { held = gapTicks; listHost.hidden = true; } else renderList();
  };
  // called by the test clock each poll, so the stall is measured in polls
  let listLoading = 0;
  truth.pump = () => {
    if (loading > 0 && --loading === 0) details.textContent = current || '';
    if (held > 0 && --held === 0) renderList();
    if (listLoading > 0 && --listLoading === 0) renderList();
  };
  denyBtn.onclick = () => {
    if (!current) return;
    truth.declined.push(current);
    const i = remaining.indexOf(current);
    if (i >= 0) remaining.splice(i, 1);
    closeModal();
    renderList();
  };

  if (skipList) openModal(remaining[0]);
  else if (loadTicks) {
    // the list's frame first, its rows later; it has a close button like the errored one
    listPaper.append(el('h1', {}, 'Collaboration requests'));
    const x = el('ytcp-icon-button', { id: 'close-button' });
    x.onclick = () => { listHost.hidden = true; truth.closedDeadList = true; };
    listPaper.append(x);
    listHost.hidden = false;
    listLoading = loadTicks;
  } else renderList();
  // the live failure: an errored, row-less request list left floating over the card
  if (deadList) {
    listPaper.children = [];
    listPaper.append(el('h1', {}, 'Collaboration requests'), el('div', {}, 'Oops, something went wrong.'));
    const x = el('ytcp-icon-button', { id: 'close-button' });
    x.onclick = () => { listHost.hidden = true; truth.closedDeadList = true; };
    listPaper.append(x);
    listHost.hidden = false;
  }

  const u = new URL(url || 'https://studio.youtube.com/channel/UCcpMHMjwVRDTH1Bg7DWeYvA/videos/upload?d=acd&inviterChannelId=UCSd21ggmlMhbvaMT5IGxajA');
  const win = {
    location: { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, href: u.href, origin: u.origin },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    console: { info() {} },
  };
  return { doc, win, truth };
}
