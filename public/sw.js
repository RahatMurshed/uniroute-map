// UniRoute Service Worker for Push Notifications

self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'UniRoute 🚌';
  const options = {
    body: data.body || 'Bus update',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'uniroute-alert',
    renotify: true,
    data: {
      url: data.url || '/map'
    }
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/map')
  );
});
