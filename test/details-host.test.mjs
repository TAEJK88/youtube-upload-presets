import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDetails } from './harness.mjs';
import { makeDocument } from './fake-dom.mjs';

// Studio renders the same title/description fields on two surfaces. Captured from
// a real /video/<id>/edit page: no ytcp-uploads-dialog exists there, the fields sit
// inside ytcp-video-details-section, and the selectors are otherwise identical.
function build({ uploadDialog = false, editPage = false, hidden = false } = {}) {
  const doc = makeDocument();
  const fields = (parent) => {
    const t = doc.createElement('ytcp-social-suggestions-textbox');
    t.setAttribute('id', 'title-textarea');
    const tb = doc.createElement('div');
    tb.setAttribute('id', 'textbox');
    tb.textContent = 'Original clip name';
    t.append(tb);
    const d = doc.createElement('ytcp-social-suggestions-textbox');
    d.setAttribute('id', 'description-textarea');
    const db = doc.createElement('div');
    db.setAttribute('id', 'textbox');
    d.append(db);
    parent.append(t, d);
    if (hidden) parent.hidden = true;
  };
  if (uploadDialog) fields(doc.body.append(doc.createElement('ytcp-uploads-dialog')) && doc.body.children.at(-1));
  if (editPage) fields(doc.body.append(doc.createElement('ytcp-video-details-section')) && doc.body.children.at(-1));
  return { doc, api: makeDetails(doc) };
}

test('THE BUG: on the video edit page the details fields are found', () => {
  // v4.12.0 looked only for ytcp-uploads-dialog, so "Apply to open window" said
  // "YouTube details page is not open yet" while the details page was open
  const { api } = build({ editPage: true });
  assert.equal(api.getDialog(), null, 'there is no upload dialog on the edit page');
  assert.equal(api.getDetailsHost().tagName.toLowerCase(), 'ytcp-video-details-section');
  assert.ok(api.detailsOpen());
  assert.equal(api.getTitleBox(api.getDetailsHost()).textContent, 'Original clip name');
});

test('the upload dialog still wins when both are present', () => {
  const { api } = build({ uploadDialog: true, editPage: true });
  assert.equal(api.getDetailsHost().tagName.toLowerCase(), 'ytcp-uploads-dialog');
  assert.equal(api.onEditPage(), false);
});

test('the upload dialog alone still works', () => {
  const { api } = build({ uploadDialog: true });
  assert.equal(api.getDetailsHost().tagName.toLowerCase(), 'ytcp-uploads-dialog');
  assert.ok(api.detailsOpen());
  assert.equal(api.onEditPage(), false);
});

test('onEditPage is true only on the edit page', () => {
  assert.equal(build({ editPage: true }).api.onEditPage(), true);
  assert.equal(build({}).api.onEditPage(), false);
});

test('a page with neither surface reports the details page as not open', () => {
  const { api } = build({});
  assert.equal(api.getDetailsHost(), null);
  assert.equal(api.detailsOpen(), false);
});

test('a details section that is present but hidden does not count as open', () => {
  const { api } = build({ editPage: true, hidden: true });
  assert.equal(api.detailsOpen(), false, 'must not try to fill fields that are not rendered');
});
