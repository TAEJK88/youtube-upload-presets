import './style.css';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@/lib/i18n';
import { sendMessage } from '@/lib/messages';
import { App } from './App';
import { AskProvider } from './ask';
import { PanelProvider } from './panel';

async function main() {
  // Like the content script: read storage only once the background's migrations have run.
  await sendMessage('ensureMigrated', undefined).catch((e) => console.error('[ytup] ensureMigrated', e));
  await initI18n();
  createRoot(document.getElementById('root')!).render(
    <PanelProvider>
      <AskProvider>
        <App />
      </AskProvider>
    </PanelProvider>,
  );
}
void main();
