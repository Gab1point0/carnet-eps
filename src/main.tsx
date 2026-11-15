import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { useData } from './store/data';
import { startAutoSync } from './store/sync';
import { useVault } from './store/vault';
import { applyTheme, useUi } from './store/ui';
import { watchAppUpdates } from './lib/appUpdate';
import './styles.css';
import './pages.css';

applyTheme(useUi.getState().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

void Promise.all([useData.getState().load(), useVault.getState().load()]).then(() => startAutoSync());

// Mode hors ligne + installation sur l'écran d'accueil.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker indisponible', err));
    watchAppUpdates();
  });
}
