import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import { applyViewportFixes } from './lib/viewport';

applyViewportFixes();

/**
 * Service worker: the new version activates right away (skipWaiting + clientsClaim
 * in vite.config.ts) and the page reloads into it. iPhone keeps installed apps alive
 * for a long time, so we also check for updates whenever the app comes back to the
 * foreground and once an hour.
 */
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => registration.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.setInterval(check, 60 * 60 * 1000);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
