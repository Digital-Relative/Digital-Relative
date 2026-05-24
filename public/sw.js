// Digital Relative — Service Worker v1
// Handles: push notifications, basic offline shell caching

const CACHE_NAME = 'dr-shell-v1'
const SHELL = ['/', '/manifest.json', '/favicon.svg']

// ── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: network-first for all requests (vault data must be fresh) ─────────
// Only serve from cache on full offline failure for the app shell
self.addEventListener('fetch', event => {
  // Only intercept same-origin GET requests
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request).then(r => r || caches.match('/')))
  )
})

// ── Push: show notification ──────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Digital Relative', body: 'You have a new notification', url: '/' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/favicon.svg',
      badge:   '/favicon.svg',
      tag:     data.tag || 'dr-notification',
      data:    { url: data.url },
      requireInteraction: data.requireInteraction || false,
      vibrate: [200, 100, 200],
    })
  )
})

// ── Notification click: open/focus the app ───────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windows => {
        // Focus existing window if open
        const existing = windows.find(w => w.url.includes(self.location.origin))
        if (existing) return existing.focus().then(w => w.navigate(url))
        return clients.openWindow(url)
      })
  )
})
