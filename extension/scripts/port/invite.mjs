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
    // P5-invite-two-step: acceptingV notes the accepted video, GIVE_UP ends a reopen round sooner
    ['let lastAction = 0;', `let lastAction = 0;
    let acceptingV = '';
    const meAtStart = (location.pathname.match(/\\/channel\\/(UC[\\w-]{10,})/) || [])[1];
    const inviterAtStart = new URLSearchParams(location.search).get('inviterChannelId') || (location.pathname.match(/\\/collaboration\\/(UC[\\w-]{10,})/) || [])[1];
    const SETTLE = 3;
    const SETTLE_CARD = 5;
    const SETTLE_DEAD = 8;
    const prevRound = getValue(ACCEPT_ROUND_KEY, null);
    const GIVE_UP = prevRound && Date.now() - prevRound.at < 300000 ? 60 : 180;
    let seenKey = '';
    let seenFor = 0;`, 1],
    ['if (Date.now() - lastAction < 2500) return;', `const dead = deadList();
      const b = acceptBtn();
      const row = b ? null : requestRow();
      const key = dead ? 'dead' : b ? 'accept:' + normText((b.closest(SEL.inviteContainer) || document.body).textContent) : row ? 'row:' + rowTitle(row) : '';
      if (key !== seenKey) { seenKey = key; seenFor = 0; }
      seenFor++;
      const vNow = new URLSearchParams(location.search).get('v') || '';
      if (acceptingV && vNow !== acceptingV) { noteInvites(meAtStart, inviterAtStart, acceptingV); acceptingV = ''; }
      if (Date.now() - lastAction < 2500) return;`, 1],
    // P5-invite-two-step: the poll keeps its pace in a hidden tab; the accepted video and a visit
    // that found none left are noted for the Collab list
    ['const timer = setInterval(() => {\n      if (++tries > 180) {', 'const timer = steady(() => {\n      if (++tries > GIVE_UP) {', 1],
    ["else say('gave up — no collaboration request appeared in 180s (already accepted, or signed in as the wrong channel?)');",
      "else {\n        noteInvites(meAtStart, inviterAtStart, null);\n        say(`gave up — no collaboration request appeared in ${GIVE_UP}s (already accepted, or signed in as the wrong channel?)`);\n      }", 1],
    ['say(`accepting request ${done}`, b);', 'say(`accepting request ${done}`, b);\n        acceptingV = vNow;', 1],
    [`      const dead = deadList();
      if (dead) {`, `      if (dead) {
        if (seenFor < SETTLE_DEAD) return;`, 1],
    [`      const b = acceptBtn();
      if (b) {`, `      if (b) {
        if (seenFor < SETTLE_CARD) return;`, 1],
    [`      const row = requestRow();
      if (row) {`, `      if (row) {
        if (seenFor < SETTLE) return;`, 1],
    // P5-invite-settle: YouTube drops inviterChannelId once the card closes; use the one seen at the start
    ["const me = (location.pathname.match(/\\/channel\\/(UC[\\w-]{10,})/) || [])[1];", "const me = (location.pathname.match(/\\/channel\\/(UC[\\w-]{10,})/) || [])[1] || meAtStart;", 1],
    ["const inviter = new URLSearchParams(location.search).get('inviterChannelId');", "const inviter = new URLSearchParams(location.search).get('inviterChannelId') || inviterAtStart;", 1],
  ],
};
