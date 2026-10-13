// iPad check-in app: the offline helper (service worker). It keeps a copy of the app itself on the iPad, so
// the app opens even when the venue's Wi-Fi is down. The guest list and check-ins already live on the iPad
// (shared/src/offlineCheckin.ts); this file only covers the app's own page, logo and icons.
//
// Network first: whenever there's a connection, the iPad gets the newest version and refreshes its copy.
// Offline, it uses the copy. Only this app's own files are kept: Supabase, the sync server (/api) and
// Google Fonts are never stored here, so no guest data ends up in this cache.
const CACHE = 'aafe-checkin-v1'
const SHELL = ['./', './brand/aafe-mark-orange.png', './checkin/manifest.webmanifest', './checkin/icon-180.png', './checkin/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aafe-checkin-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './' : req, copy)) }
        return res
      })
      .catch(() => caches.match(req.mode === 'navigate' ? './' : req).then((hit) => hit || caches.match('./'))),
  )
})
