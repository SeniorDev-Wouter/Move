// Plain JS, out of src/ so no WebWorker types leak into tsconfig.

const CACHE_NAME = 'move-v1'
const QUEUE_CACHE_NAME = 'move-queue-v1'
const QUEUE_URL = '/__queued-actions__'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== QUEUE_CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
}

function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/')
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) || (await cache.match('/'))
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request)
    .then((response) => {
      cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || fetchPromise
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request))
  } else if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(staleWhileRevalidate(request))
  }
})

async function getQueuedActions() {
  const cache = await caches.open(QUEUE_CACHE_NAME)
  const match = await cache.match(QUEUE_URL)
  if (!match) return []
  return await match.json()
}

async function setQueuedActions(actions) {
  const cache = await caches.open(QUEUE_CACHE_NAME)
  await cache.put(QUEUE_URL, new Response(JSON.stringify(actions)))
}

async function enqueueAction(payload) {
  const actions = await getQueuedActions()
  actions.push(payload)
  await setQueuedActions(actions)
}

async function flushQueuedActions(client) {
  const actions = await getQueuedActions()
  if (actions.length === 0) return
  for (const payload of actions) {
    client.postMessage(payload)
  }
  await setQueuedActions([])
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const { occurrenceId, exerciseId } = data
  const action = event.action

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const payload = { type: 'reminder-action', action, exerciseId, occurrenceId }

      if (allClients.length > 0) {
        const client = allClients[0]
        if ('focus' in client) await client.focus()
        client.postMessage(payload)
        return
      }

      await enqueueAction(payload)
      await self.clients.openWindow('/')
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'client-ready') return
  const client = event.source
  if (!client) return
  event.waitUntil(flushQueuedActions(client))
})
