// A very small DOM, just big enough to run the collab dialog code under node.
// It implements only what the userscript touches: tag/id/class selectors, the
// handful of attribute selectors in SEL, closest(), click(), textContent and
// getClientRects(). Anything beyond that is deliberately absent so the shim
// cannot quietly diverge from a real browser without the test noticing.

const SPACE = /\s+/;

class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = new Map();
    this.text = '';
    this.hidden = false;      // stands in for display:none
    this.onclick = null;
    this.disabled = false;
    this.style = { cssText: '' };
  }

  remove() {
    const sibs = this.parentNode && this.parentNode.children;
    if (sibs) sibs.splice(sibs.indexOf(this), 1);
    this.parentNode = null;
  }

  // --- tree
  append(...kids) {
    for (const k of kids) { k.parentNode = this; this.children.push(k); }
    return this;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n.isRoot === true;
  }
  get descendants() {
    const out = [];
    const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); });
    walk(this);
    return out;
  }

  // --- attributes
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get id() { return this.attrs.get('id') || ''; }
  set id(v) { this.attrs.set('id', v); }
  get className() { return this.attrs.get('class') || ''; }
  set className(v) { this.attrs.set('class', v); }

  // --- text
  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this.text;
  }
  set textContent(v) { this.children = []; this.text = String(v); }
  get innerText() { return this.textContent; }

  // --- layout: visible unless it or an ancestor is hidden
  getClientRects() {
    let n = this;
    while (n) { if (n.hidden) return []; n = n.parentNode; }
    return [{ width: 100, height: 20, left: 0, top: 0 }];
  }
  scrollIntoView() {}
  focus() { this.ownerRoot && (this.ownerRoot.activeElement = this); }
  select() {}

  // --- selectors
  matches(sel) { return sel.split(',').some((s) => matchOne(this, s.trim())); }
  closest(sel) {
    let n = this;
    while (n) { if (n.matches && n.matches(sel)) return n; n = n.parentNode; }
    return null;
  }
  querySelectorAll(sel) {
    const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
    return this.descendants.filter((e) => parts.some((p) => matchCompound(e, p)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

  // --- events
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatchEvent(ev) {
    // the script dispatches real `new Event(...)` objects, whose `target` is a
    // getter-only accessor — shadow it with an own property instead of assigning
    if (!ev.target) {
      try { ev.target = this; } catch { /* native Event */ }
      if (!ev.target) Object.defineProperty(ev, 'target', { value: this, configurable: true });
    }
    let n = this;
    while (n) {
      (n.listeners.get(ev.type) || []).forEach((fn) => fn.call(n, ev));
      if (ev.type === 'click' && n.onclick) n.onclick.call(n, ev);
      if (!ev.bubbles) break;
      n = n.parentNode;
    }
    return true;
  }
  click() { this.dispatchEvent({ type: 'click', bubbles: true }); }
}

// "tag#id.class[attr=\"v\"]" — descendant combinators are resolved by matchCompound
function matchOne(el, sel) {
  if (!sel) return false;
  const re = /^([a-z0-9-]+)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i;
  const m = sel.match(re);
  if (!m) return false;
  const [, tag, id, classes, attrs] = m;
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (id && el.id !== id.slice(1)) return false;
  for (const c of (classes.match(/\.[\w-]+/g) || [])) {
    if (!el.className.split(SPACE).includes(c.slice(1))) return false;
  }
  for (const a of (attrs.match(/\[[^\]]+\]/g) || [])) {
    const am = a.slice(1, -1).match(/^([\w-]+)(?:([~*^$]?=)"?([^"\]]*)"?)?$/);
    if (!am) return false;
    const [, name, op, want] = am;
    const have = el.getAttribute(name);
    if (have === null) return false;
    if (op === '=' && have !== want) return false;
    if (op === '*=' && !have.includes(want)) return false;
  }
  return true;
}

// supports "a b" (descendant) which SEL uses, e.g. ".collaborator .channel-name"
function matchCompound(el, sel) {
  const steps = sel.split(SPACE).filter(Boolean);
  if (!matchOne(el, steps[steps.length - 1])) return false;
  let n = el.parentNode;
  for (let i = steps.length - 2; i >= 0; i--) {
    while (n && !matchOne(n, steps[i])) n = n.parentNode;
    if (!n) return false;
    n = n.parentNode;
  }
  return true;
}

export function makeDocument() {
  const doc = new El('#document');
  doc.isRoot = true;
  const body = new El('body');
  doc.append(body);
  doc.body = body;
  doc.createElement = (tag) => { const e = new El(tag); e.ownerRoot = doc; return e; };
  doc.activeElement = null;
  // the script types with execCommand; model insertText/selectAll/delete on the focused input
  doc.execCommand = (cmd, _ui, value) => {
    const a = doc.activeElement;
    if (!a) return false;
    if (cmd === 'selectAll') { a.__selectedAll = true; return true; }
    if (cmd === 'insertText') { a.value = a.__selectedAll ? String(value) : (a.value || '') + value; a.__selectedAll = false; return true; }
    if (cmd === 'delete') { if (a.__selectedAll) a.value = ''; a.__selectedAll = false; return true; }
    return false;
  };
  return doc;
}

export { El };
