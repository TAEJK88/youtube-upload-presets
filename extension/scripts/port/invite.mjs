// lib/invite.ts ← the invite helpers (234-247; INVITE_URL comes from lib/collab.ts), the
// accept watcher (342-469) and the SPA re-arm poller (471-477)
export default {
  file: 'lib/invite.ts',
  regions: ['234-247', '342-469', '471-477'],
  subs: [
    ['GM_getValue(', 'getValue(', 2],
    ['GM_setValue(', 'setValue(', 3],
  ],
};
