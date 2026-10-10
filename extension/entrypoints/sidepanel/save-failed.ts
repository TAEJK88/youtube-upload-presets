import { toast } from 'sonner';
import { L } from '@/lib/i18n';

// A store write that failed: logged, and said in the panel (the write is a message to the
// background, which can reject; the drawer wrote synchronously).
export const saveFailed = (e: unknown) => {
  console.error('[ytup] store write failed', e);
  toast(L(`บันทึกไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't save (${(e as Error)?.message ?? e})`), { id: 'save-failed' }); // one toast, not one per keystroke
};

// The Studio tab didn't take a message (no live script there, or it is reloading).
export const notConnected = (e: unknown): void => {
  console.error('[ytup] tab not connected', e);
  toast(L('แท็บนี้ยังไม่ได้เชื่อมกับส่วนขยาย — โหลดแท็บนี้ใหม่', 'This tab is not connected to the extension yet — reload this tab'), { id: 'not-connected' });
};
