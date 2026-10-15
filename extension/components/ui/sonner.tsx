import { Toaster as Sonner } from 'sonner';
import { L } from '@/lib/i18n';
import { useTheme } from '@/lib/use-theme';

// The drawer's toast: bottom centre, black glass (white in the light theme), 3.8 s. Sonner
// names its region "Notifications alt+T" unless told otherwise; the hotkey part it adds itself.
export function Toaster() {
  return (
    <Sonner
      containerAriaLabel={L('การแจ้งเตือน', 'Notifications')}
      theme={useTheme()}
      position="bottom-center"
      duration={3800}
      toastOptions={{ style: { background: 'var(--raised)', border: '1px solid var(--raised-line)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: '13px' } }}
    />
  );
}
