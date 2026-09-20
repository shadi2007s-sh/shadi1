/* Register the app-shell service worker when served from a secure context. */
(() => {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch(error => console.warn('[SanaPWA] service worker registration failed', error));
  }, { once: true });
})();
