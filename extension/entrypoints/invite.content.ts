import { stopOnInvalidated } from '@/lib/content-lifecycle';
import { createChannelSwitch } from '@/lib/channel-switch';
import { initI18n } from '@/lib/i18n';
import { browserEnv, createInviteWatcher, INVITE_KEYS } from '@/lib/invite';
import { createSyncStore } from '@/lib/sync-store';

// www.youtube.com: pick the channel waiting on the channel switcher, and accept
// collaboration invites — all the userscript did outside Studio.
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  async main(ctx) {
    await initI18n();
    const stop = stopOnInvalidated(ctx);
    const store = await createSyncStore(INVITE_KEYS);
    stop.add(() => store.dispose());
    const env = browserEnv(store, {
      setInterval: (fn, ms) => ctx.setInterval(fn, ms),
      clearInterval,
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
