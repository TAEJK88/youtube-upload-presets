import '@/lib/debug-capture/invite'; // FIRST: the debug page shows what goes wrong below
import { stopOnInvalidated } from '@/lib/content-lifecycle';
import { createChannelSwitch } from '@/lib/channel-switch';
import { initI18n, watchLang } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { createSyncStore } from '@/lib/sync-store';

// www.youtube.com: pick the channel waiting on the channel switcher, and accept
// collaboration invites — all the userscript did outside Studio.
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  async main(ctx) {
    await initI18n();
    const stop = stopOnInvalidated(ctx);
    stop.add(watchLang());
    const store = await createSyncStore(INVITE_KEYS);
    stop.add(() => store.dispose());
    const env = browserEnv(store, {
      setInterval: (fn, ms) => ctx.setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id),
      setTimeout: (fn, ms) => ctx.setTimeout(fn, ms),
    });
    const sw = createChannelSwitch(env);
    sw.watchChannelSwitcher();
    sw.recoverAfterSwitch();
    const invite = createInviteWatcher(env);
    invite.watchInvite();
    invite.armSpaPoll();
  },
});
