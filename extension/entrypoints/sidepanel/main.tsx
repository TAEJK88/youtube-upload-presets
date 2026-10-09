// FIRST: the crash guard listens before any other module evaluates (see crash-guard.ts).
import { failStartup, stage } from './crash-guard';
import './theme'; // NEXT: <html data-theme> before first paint
import './style.css';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@/lib/i18n';
import { sendMessage } from '@/lib/messages';
import { App } from './App';
import { AskProvider } from './ask';
import { PanelProvider } from './panel';
import { RootBoundary } from './RootBoundary';

// Tells the guard the tree committed (the watchdog stands down).
function Ready() {
  useEffect(() => stage('ready'), []);
  return null;
}

async function main() {
  // Like the content script: read storage only once the background's migrations have run.
  // If the background never answers, the guard's watchdog says so.
  stage('migrating');
  await sendMessage('ensureMigrated', undefined).catch((e) => console.error('[ytup] ensureMigrated', e));
  stage('i18n');
  await initI18n();
  stage('render');
  createRoot(document.getElementById('root')!).render(
    <RootBoundary>
      <PanelProvider>
        <AskProvider>
          <App />
        </AskProvider>
      </PanelProvider>
      <Ready />
    </RootBoundary>,
  );
}
main().catch(failStartup);
