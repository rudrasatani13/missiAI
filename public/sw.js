const CACHE_NAME = 'missiai-pwa-cache-v1';

self.addEventListener('install', (event) => {
  // Skip wait to take over immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim clients to start intercepting requests immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch
  return;
});

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
