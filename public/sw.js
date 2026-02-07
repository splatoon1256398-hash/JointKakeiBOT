// Service Worker for Web Push Notifications

self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || '共同家計簿';
    const options = {
      body: data.body || '新しい通知があります',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'kakeibot-notification',
      data: {
        url: data.url || '/',
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Push event error:', e);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 既に開いているタブがあればフォーカス
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいタブを開く
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
