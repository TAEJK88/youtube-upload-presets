// FIRST: the same crash guard as the side panel (it logs as 'allow' here).
import { failStartup, stage } from '../sidepanel/crash-guard';
import '@/lib/theme'; // NEXT: the panel's theme, before first paint
import '../sidepanel/style.css';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@/lib/i18n';
import { RootBoundary } from '../sidepanel/RootBoundary';
import { AllowPage } from './AllowPage';

function Ready() {
  useEffect(() => stage('ready'), []);
  return null;
}

// No ensureMigrated: the page needs only the stored files.
async function main() {
  stage('i18n');
  await initI18n().catch((e) => console.error('[ytup] allow page i18n', e));
  stage('render');
  createRoot(document.getElementById('root')!).render(
    <RootBoundary>
      <AllowPage />
      <Ready />
    </RootBoundary>,
  );
}
main().catch(failStartup);
