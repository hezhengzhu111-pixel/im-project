// IM Messenger Service Worker
// Version: 1.0.0

const CACHE_NAME = 'im-messenger-v1';
const RUNTIME_CACHE = 'im-runtime-v1';
const IMAGE_CACHE = 'im-images-v1';
const API_CACHE = 'im-api-v1';

// App shell files to precache
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/main.dart.js',
  '/flutter.js',
  '/flutter_bootstrap.js',
  '/flutter_service_worker.js',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // CanvasKit files
  '/canvaskit/canvaskit.js',
  '/canvaskit/canvaskit.wasm',
  // Assets
  '/assets/AssetManifest.bin.json',
  '/assets/FontManifest.json',
  '/assets/NOTICES',
];

// Install event - precache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return cacheNames.filter((cacheName) => !currentCaches.includes(cacheName));
    }).then((cachesToDelete) => {
      return Promise.all(cachesToDelete.map((cacheToDelete) => {
        console.log('[SW] Deleting old cache:', cacheToDelete);
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim())
  );
});

// Fetch event - apply caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - NetworkFirst strategy
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Image and avatar requests - CacheFirst strategy
  if (isImageRequest(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Static assets - StaleWhileRevalidate
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // Navigation requests - NetworkFirst with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, CACHE_NAME)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Default - NetworkFirst
  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

// Check if request is for an image
function isImageRequest(url) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];
  const pathname = url.pathname.toLowerCase();

  // Check file extension
  if (imageExtensions.some(ext => pathname.endsWith(ext))) {
    return true;
  }

  // Check if it's an avatar or image upload path
  if (pathname.includes('/avatar/') ||
      pathname.includes('/upload/') ||
      pathname.includes('/image/') ||
      pathname.includes('/media/')) {
    return true;
  }

  return false;
}

// Check if request is for a static asset
function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot'];
  const pathname = url.pathname.toLowerCase();

  return staticExtensions.some(ext => pathname.endsWith(ext)) ||
         pathname.startsWith('/assets/') ||
         pathname.startsWith('/canvaskit/');
}

// NetworkFirst strategy - try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Return a custom offline response for API requests
    if (request.url.includes('/api/') || request.url.includes('/v1/')) {
      return new Response(
        JSON.stringify({
          error: 'offline',
          message: '网络已断开，请检查网络连接后重试'
        }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'application/json' })
        }
      );
    }
    throw error;
  }
}

// CacheFirst strategy - try cache, fall back to network
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return a placeholder for failed image requests
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="#eee" width="100" height="100"/><text fill="#999" x="50" y="50" text-anchor="middle" dy=".3em"> offline </text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

// StaleWhileRevalidate strategy - return cache immediately, update in background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Clear specific caches on demand
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    const cacheName = event.data.cache;
    if (cacheName) {
      caches.delete(cacheName).then(() => {
        console.log('[SW] Cache cleared:', cacheName);
      });
    }
  }
});
