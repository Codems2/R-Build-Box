import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import './index.css';

// Captura temprana del evento de instalación (puede dispararse antes de que
// monte React); lo guardamos para que el botón «Instalar» lo use luego.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as unknown as { __bip?: Event }).__bip = e;
  window.dispatchEvent(new Event('bip-ready'));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Registra el service worker para poder instalar la web como app (PWA).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sin SW la web sigue funcionando, solo no será instalable */
    });
  });
}
