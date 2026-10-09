import { Toaster as Sonner } from 'sonner';

// The drawer's toast: bottom centre, black glass, 3.8 s.
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      duration={3800}
      toastOptions={{ style: { background: '#0f0f12', border: '1px solid rgba(255,255,255,.12)', color: '#f4f4f5', fontFamily: 'inherit', fontSize: '13px' } }}
    />
  );
}
