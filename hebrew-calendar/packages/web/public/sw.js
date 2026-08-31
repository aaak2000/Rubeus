/**
 * Service worker — notifications only.
 *
 * Deliberately not a caching worker: a calendar that serves a stale day from
 * cache is worse than one that waits for the network. Its whole job is to be
 * awake when a push arrives.
 */

self.addEventListener('install', () => {
  // Take over straight away rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload should still surface something rather than nothing.
  }
  const title = data.title || 'יומן עברי';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // Same tag replaces rather than stacks, so a re-sent reminder does not
      // pile up on the lock screen.
      tag: data.tag || 'hcal',
      dir: 'rtl',
      lang: 'he',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab if there is one — opening a second copy of the app
      // is a small rudeness that adds up.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
