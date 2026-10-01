// Service worker (PLAN.md S7, S9): the app installs, opens offline, and shows the last data it
// loaded. Plain JavaScript, served as is from /sw.js.
//
// - Built assets (/assets/*, content-hashed): cache first. Each deploy adds new files, so the
//   shell cache keeps only the newest SHELL_LIMIT entries (old builds' files go first).
// - Page loads: network first, but after NAVIGATION_TIMEOUT_MS on a bad connection the cached
//   app shell is shown (the network answer still updates the cache). Offline: the app shell.
//   Every route is the same SPA page.
// - Database reads (Supabase REST GET): network first, with the last response as the offline
//   fallback. Writes are never cached and simply fail offline (the app shows its notice).
// - The MCP server (/api/*) is never touched.
const VERSION = 'v1'
const SHELL = `structured-shell-${VERSION}`
const DATA = `structured-data-${VERSION}`
const DATA_LIMIT = 300
const SHELL_LIMIT = 80
const NAVIGATION_TIMEOUT_MS = 3000

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('structured-') && key !== SHELL && key !== DATA)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return
    if (request.mode === 'navigate') {
      event.respondWith(navigate(request))
    } else if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(request, SHELL))
    } else {
      event.respondWith(networkFirst(request, SHELL))
    }
    return
  }
  if (url.pathname.startsWith('/rest/v1/')) event.respondWith(networkFirst(request, DATA))
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    await trim(cache, SHELL_LIMIT)
  }
  return response
}

/** A page load: the network if it answers in time, else the cached app shell. */
async function navigate(request) {
  const network = networkFirst(request, SHELL, '/index.html')
  const cache = await caches.open(SHELL)
  const shell = await cache.match('/index.html')
  if (!shell) return network
  const slow = new Promise((resolve) => setTimeout(() => resolve(shell), NAVIGATION_TIMEOUT_MS))
  return Promise.race([network.catch(() => shell), slow])
}

async function networkFirst(request, cacheName, key = request) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(key, response.clone())
      await trim(cache, cacheName === DATA ? DATA_LIMIT : SHELL_LIMIT)
    }
    return response
  } catch (error) {
    const hit = await cache.match(key)
    if (hit) return hit
    throw error
  }
}

/** Keeps a cache small: the oldest entries (least recently written) go first. */
async function trim(cache, limit) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key)
}
