const CACHE_NAME = 'missiai-pwa-cache-v2';

self.addEventListener('install', (event) => {
  // Skip wait to take over immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches and claim clients immediately
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// No fetch handler — let the browser handle all requests natively.
// A no-op fetch handler causes overhead during navigation and can
// interfere with Next.js chunk loading after deployments.

self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json()
      event.waitUntil(
        self.registration.showNotification(data.title || 'MissiAI', {
          body: data.body,
          icon: '/images/logo-symbol.png',
          badge: '/images/logo-symbol.png',
        })
      )
    } catch {
      event.waitUntil(
        self.registration.showNotification('MissiAI', {
          body: event.data.text(),
          icon: '/images/logo-symbol.png',
        })
      )
    }
  }
});
