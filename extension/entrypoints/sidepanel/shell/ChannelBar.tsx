import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { L } from '@/lib/i18n';
import { channelUrl, lookupHandle, noHandle, parseChannelId, withChannel } from '@/lib/panel/channels';
import type { StoredChannel } from '@/lib/studio/channels';
import { cn } from '@/lib/utils';
import { IconButton } from '../fields';
import { Icon } from '../Icon';
import { openTab } from '../open-tab';
import { useLive, usePanel } from '../panel';
import { saveFailed } from '../save-failed';
import { ThemeToggle } from '../ThemeToggle';

// The drawer's channel bar (3326–3350, 3418–3440): where the queue uploads to, whether that
// is the locked channel, the lock button and the list of other channels. Its top row is the
// panel's header, so the theme toggle sits at its end.
export function ChannelBar() {
  const { data, view, write } = usePanel();
  const [listOpen, setListOpen] = useState(false);
  const c = view?.channel;
  const lock = data?.settings.lockChannel ?? null;
  const problem = c?.problem ?? '';
  const toggleLock = () => {
    if (lock) {
      return void write.settings({ lockChannel: null }).then(() => toast(L('ปลดล็อกช่องแล้ว', 'Channel unlocked')), saveFailed);
    }
    if (!c?.id) return void toast(L('ตรวจไม่พบรหัสช่อง ลองเข้าหน้า Dashboard หรือ Content ก่อน', 'Could not detect the channel ID. Open the Dashboard or Content page first'));
    const label = c.label;
    void write.settings({ lockChannel: { id: c.id, name: label } }).then(
      () => toast(L(`ล็อกไว้ที่ช่อง "${label}" แล้ว ถ้าสลับไปช่องอื่นจะอัปไม่ได้`, `Locked to channel "${label}". Uploads will be blocked on other channels`)),
      saveFailed,
    );
  };
  return (
    <>
      {/* A size container: below 380px of panel (344px of content box, inside the 18px padding)
          the lock pill drops its label, so the channel name keeps its room at Chrome's
          narrowest panel. The label stays as the pill's accessible name, and the title stays. */}
      <div className={cn('@container flex items-center gap-3 px-[18px] pt-4 pb-3', problem && 'bg-err/[0.09]')}>
        <div className="relative size-10 shrink-0">
          {c?.avatar
            ? <img src={c.avatar} alt="" className="size-10 rounded-full object-cover ring-2 ring-tint/25" />
            : <div className="grid size-10 place-items-center rounded-full bg-surface2 text-fg3 ring-2 ring-tint/25"><Icon name="tv" size={18} /></div>}
          <span className={cn('absolute -right-px -bottom-px size-3 rounded-full border-2 border-bg', problem ? 'bg-err' : 'bg-ok')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium tracking-[.04em] text-tint/60">{L('กำลังอัปไปที่ช่อง', 'Uploading to channel')}</div>
          <div className="truncate text-[15px] font-bold">{c?.label ?? '—'}</div>
          <div className={cn('truncate font-mono text-xs text-fg3', problem && 'font-sans font-semibold whitespace-normal text-err')}>{problem || c?.id || '—'}</div>
        </div>
        <IconButton icon="swap" title={L('ช่องอื่น ๆ · เปิดในแท็บใหม่', 'Other channels · open in a new tab')} className="rounded-full bg-tint/[0.08]" onClick={() => setListOpen((o) => !o)} />
        <button
          type="button"
          onClick={toggleLock}
          title={lock ? L(`ล็อกไว้ที่ "${lock.name}" · คลิกเพื่อปลดล็อก`, `Locked to "${lock.name}" · click to unlock`) : L('ล็อกให้อัปได้เฉพาะช่องนี้', 'Only allow uploads to this channel')}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-full border border-tint/[0.16] bg-tint/10 px-3.5 py-[7px] text-xs font-semibold whitespace-nowrap text-fg hover:bg-tint/[0.16]',
            '@max-[344px]:size-8 @max-[344px]:justify-center @max-[344px]:p-0',
            lock && !problem && 'border-fg3',
          )}
        >
          <Icon name={lock ? 'lock' : 'unlock'} size={14} />
          <span className="@max-[344px]:sr-only">{lock ? L('ล็อกแล้ว', 'Locked') : L('ล็อกช่อง', 'Lock channel')}</span>
        </button>
        <ThemeToggle className="rounded-full bg-tint/[0.08]" />
      </div>
      {listOpen && <ChannelList />}
    </>
  );
}

// The drawer's channel list (3379–3405): this tab's channel opens in a new tab; another
// channel goes through the channel switcher, which affects every Studio tab.
function ChannelList() {
  const { data, view, target, send, write, elsewhere } = usePanel();
  const { liveState } = useLive();
  const [text, setText] = useState('');
  const channels = data?.channels ?? [];
  const cur = view?.channel.id ?? '';
  const add = () => {
    const id = parseChannelId(text);
    if (!id) return void toast(L('ไม่พบรหัสช่อง (ขึ้นต้นด้วย UC และยาว 24 ตัว)', 'No channel ID found (starts with UC, 24 characters)'));
    void write.channels((list) => withChannel(list, id)).then(() => setText(''), saveFailed);
  };
  // The tab refuses too (its own toast shows in the page); asking here first says so in the
  // panel. Files waiting in the queue survive a switch, so only a run (in any tab) blocks it.
  // The switcher picks by @handle only: a channel without one is looked up and remembered,
  // and is not switched to when the lookup finds none.
  const switchTo = async (c: StoredChannel) => {
    if (!target) return;
    if (liveState?.running || elsewhere) return void toast(L('คิวอัปโหลดยังทำงานอยู่ — สลับช่องตอนนี้คิวจะหยุด', 'Upload queue is still running — switching channels now would stop it'));
    let handle = c.handle ?? '';
    if (!handle) {
      handle = await lookupHandle(c.id);
      if (!handle) return void toast(noHandle(c.name || c.id));
      void write.channels((list) => list.map((x) => (x.id === c.id ? { ...x, handle } : x))).catch(saveFailed);
    }
    send('channel:switch', { name: c.name, handle, next: channelUrl(target.url, c.id) }).catch((e: unknown) => {
      console.error('[ytup] channel:switch failed', e);
      toast(L(`สลับช่องไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't switch channels (${(e as Error)?.message ?? e})`));
    });
  };
  return (
    <div className="mx-4 mb-3 rounded-[12px] border border-line p-2">
      {channels.length ? channels.map((c) => (
        <div key={c.id} className="flex items-center gap-2 px-0.5 py-1">
          {c.avatar ? <img src={c.avatar} alt="" className="size-[22px] rounded-full" /> : <Icon name="tv" size={16} />}
          <div className="min-w-0 flex-1 truncate" title={c.id}>
            <b>{c.name || c.id}</b>
            {c.id === cur && <small className="text-fg3">{L(' · ช่องนี้', ' · this tab')}</small>}
          </div>
          {c.id === cur ? (
            <Button size="sm" title={L('เปิดช่องนี้ในแท็บใหม่', 'Open this channel in a new tab')} disabled={!target}
              onClick={() => target && openTab(channelUrl(target.url, c.id))}>
              <Icon name="ext" size={13} />{L('แท็บใหม่', 'New tab')}
            </Button>
          ) : (
            <Button size="sm" title={L('สลับไปช่องนี้ (มีผลกับทุกแท็บ Studio)', 'Switch to this channel (affects every Studio tab)')} disabled={!target}
              onClick={() => void switchTo(c)}>
              <Icon name="swap" size={13} />{L('สลับไปช่องนี้', 'Switch')}
            </Button>
          )}
          <IconButton icon="x" title={L('เอาออกจากรายการ', 'Remove from list')} onClick={() => void write.channels((list) => list.filter((x) => x.id !== c.id)).catch(saveFailed)} />
        </div>
      )) : (
        <small className="text-fg3">{L('ยังไม่มีช่องในรายการ — เข้า Studio ของแต่ละช่องครั้งหนึ่ง สคริปต์จะจำให้เอง หรือใส่รหัสช่องด้านล่าง', 'No channels yet — open each channel in Studio once and the script remembers it, or add a channel ID below')}</small>
      )}
      <div className="mt-2 flex gap-1.5">
        <Input value={text} placeholder={L('รหัสช่อง UC… หรือลิงก์ช่อง', 'Channel ID UC… or channel link')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <Button size="sm" className="h-9" onClick={add}><Icon name="plus" size={13} />{L('เพิ่ม', 'Add')}</Button>
      </div>
    </div>
  );
}
