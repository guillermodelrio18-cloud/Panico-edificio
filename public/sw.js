const CACHE = 'panico-v2';
const ASSETS = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/push.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── Recibir notificación push ──────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); } catch { data = { title: '🚨 Alerta', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:              data.body,
      icon:              data.icon || '/icons/icon-192.png',
      badge:             data.badge || '/icons/icon-72.png',
      tag:               'alerta-emergencia',
      renotify:          true,
      requireInteraction: true,
      silent:            false,
      vibrate:           [300, 100, 300, 100, 300],
      data:              data.data || {},
    })
  );
});

// ── Click en notificación ──────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});

// ── Renovación automática de suscripción ──────────────────────
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: e.oldSubscription?.options?.applicationServerKey,
    }).then(sub => {
      const key  = sub.getKey('p256dh');
      const auth = sub.getKey('auth');
      return fetch('/api/push/suscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
            auth:   btoa(String.fromCharCode(...new Uint8Array(auth))),
          },
        }),
      });
    })
  );
});
