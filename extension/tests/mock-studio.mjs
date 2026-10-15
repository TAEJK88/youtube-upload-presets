// A stand-in for Studio's collaborator dialog, built from the element names in SEL.
// `truth` records what was really persisted, independent of what the script reports —
// that gap is what the v4.11.0 bug lived in.
import { makeDocument } from './fake-dom.mjs';

const CHANNELS = [
  { handle: '@thaibeats', name: 'Thai Beats', subs: '1.2K subscribers' },
  { handle: '@thaibeatsofficial', name: 'Thai Beats Official', subs: '340 subscribers' },
  { handle: '@lofiproducer', name: 'Lofi Producer', subs: '88.1K subscribers' },
];

/**
 * @param save    'ok'      Save enables once a link exists (normal Studio)
 *                'stuck'   Save never enables (the state behind the silent failure)
 *                'noclose' Save is clickable but the dialog never closes
 * @param search  'input'   #search-input is the <input>
 *                'host'    #search-input is the paper-input wrapper
 * @param sep     separator Studio puts between the handle and the sub count
 * @param already handles already listed as collaborators
 */
export function mockStudio({ save = 'ok', search = 'input', sep = ' · ', already = [] } = {}) {
  const doc = makeDocument();
  const truth = { selected: [], linksCreated: [], savedHandles: [], blockedSaveClicks: 0, cancelled: false };
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
  const dialog = (tag) => {
    const host = el(tag);
    const paper = el('tp-yt-paper-dialog');
    host.append(paper);
    host.hidden = true;
    doc.body.append(host);
    return { host, paper, show: () => { host.hidden = false; }, hide: () => { host.hidden = true; } };
  };

  // the video details page — what collabStep passes in as `dlg`
  const page = el('ytcp-video-details-section');
  const collabBtn = ytBtn('collaboration-button', 'Invite a collaborator');
  page.append(collabBtn);
  doc.body.append(page);

  // --- collaborators dialog
  const cd = dialog('ytcp-video-collaborators-dialog');
  for (const h of already) {
    const rowEl = el('div', { class: 'collaborator' });
    rowEl.append(el('span', { class: 'channel-name' }, h));
    cd.paper.append(rowEl);
  }
  const searchWrap = el('tp-yt-paper-input');
  const searchInput = el('input', { type: 'text' });
  searchInput.value = '';
  (search === 'host' ? searchWrap : searchInput).setAttribute('id', 'search-input');
  searchWrap.append(searchInput);
  const results = el('div', { id: 'results' });
  const limit = el('div', { id: 'limit-reached-message' }, 'Invitation limit reached');
  limit.hidden = true;
  const saveBtn = ytBtn('save-button', 'Save');
  const cancelBtn = ytBtn('cancel-button', 'Cancel');
  saveBtn.setAttribute('aria-disabled', 'true');
  cd.paper.append(searchWrap, results, limit, cancelBtn, saveBtn);

  // --- manage + invite-link dialogs
  const md = dialog('ytcp-video-collaborator-manage-dialog');
  const createLink = ytBtn('create-link-button', 'Create link');
  md.paper.append(createLink);

  const ld = dialog('ytcp-video-collaborator-invite-link-dialog');
  const linkText = el('span', { class: 'invite-link' });
  const closeBtn = ytBtn('close-button', 'Close');
  ld.paper.append(linkText, closeBtn);

  // --- behaviour
  collabBtn.querySelector('button').onclick = () => cd.show();

  // Studio renders results off the real input's value, like Polymer does — so
  // `querySelector('#search-input').value = handle` on the wrapper does nothing.
  const render = () => {
    const q = String(searchInput.value || '').trim().toLowerCase();
    results.children = [];
    if (!q) return;
    for (const c of CHANNELS.filter((x) => x.handle.includes(q) || x.name.toLowerCase().includes(q))) {
      const row = el('tp-yt-paper-item', { role: 'option' });
      row.append(el('div', { id: 'channel-info' }, `${c.handle}${sep}${c.subs}`),
        el('div', { id: 'display-name' }, c.name));
      row.onclick = () => { truth.selected.push(c.handle); md.show(); };
      results.append(row);
    }
  };
  searchInput.addEventListener('input', render);

  createLink.querySelector('button').onclick = () => {
    const h = truth.selected[truth.selected.length - 1];
    linkText.textContent = `https://studio.youtube.com/video/abc/collaboration/${h.slice(1)}-TOKEN`;
    truth.linksCreated.push(h);
    ld.show();
    if (save !== 'stuck') saveBtn.removeAttribute('aria-disabled');
  };
  closeBtn.querySelector('button').onclick = () => { ld.hide(); md.hide(); };

  saveBtn.querySelector('button').onclick = () => {
    if (saveBtn.getAttribute('aria-disabled') === 'true') { truth.blockedSaveClicks++; return; }
    truth.savedHandles.push(...truth.linksCreated);
    if (save !== 'noclose') cd.hide();
  };
  cancelBtn.querySelector('button').onclick = () => { truth.cancelled = true; cd.hide(); };

  return { doc, page, truth };
}
