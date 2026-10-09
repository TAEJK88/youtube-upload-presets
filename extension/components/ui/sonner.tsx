import { Toaster as Sonner } from 'sonner';
import { L } from '@/lib/i18n';

// The drawer's toast: bottom centre, black glass, 3.8 s. Sonner names its region
// "Notifications alt+T" unless told otherwise; the hotkey part it adds itself.
export function Toaster() {
  return (
    <Sonner
      containerAriaLabel={L('การแจ้งเตือน', 'Notifications')}
      theme="dark"
      position="bottom-center"
      duration={3800}
      toastOptions={{ style: { background: '#0f0f12', border: '1px solid rgba(255,255,255,.12)', color: '#f4f4f5', fontFamily: 'inherit', fontSize: '13px' } }}
    />
  );
}
