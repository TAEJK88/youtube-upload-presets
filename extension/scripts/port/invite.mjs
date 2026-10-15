// lib/invite.ts ← the invite helpers (234-247; INVITE_URL comes from lib/collab.ts), the
// accept watcher (342-469) and the SPA re-arm poller (471-477)
export default {
  file: 'lib/invite.ts',
  regions: ['234-247', '342-469', '471-477'],
  subs: [
    ['GM_getValue(', 'getValue(', 2],
    ['GM_setValue(', 'setValue(', 3],
    // P5-invite-settle: the watcher's lines reach the debug log
    ["'[YT Upload Presets] invite: '", "'[ytup] invite: '", 1],
    // P5-invite-settle: the same card, row or empty list must be seen for a few polls before
    // it is clicked or closed, so YouTube has loaded what is in it
    ['let lastAction = 0;', `let lastAction = 0;
    const SETTLE = 3;
    const SETTLE_CARD = 5;
    const SETTLE_DEAD = 8;
    let seenKey = '';
    let seenFor = 0;`, 1],
    ['if (Date.now() - lastAction < 2500) return;', `const dead = deadList();
      const b = acceptBtn();
      const row = b ? null : requestRow();
      const key = dead ? 'dead' : b ? 'accept:' + normText((b.closest(SEL.inviteContainer) || document.body).textContent) : row ? 'row:' + rowTitle(row) : '';
      if (key !== seenKey) { seenKey = key; seenFor = 0; }
      seenFor++;
      if (Date.now() - lastAction < 2500) return;`, 1],
    [`      const dead = deadList();
      if (dead) {`, `      if (dead) {
        if (seenFor < SETTLE_DEAD) return;`, 1],
    [`      const b = acceptBtn();
      if (b) {`, `      if (b) {
        if (seenFor < SETTLE_CARD) return;`, 1],
    [`      const row = requestRow();
      if (row) {`, `      if (row) {
        if (seenFor < SETTLE) return;`, 1],
  ],
};
