// Decommissioned service worker.
//
// The app no longer uses service worker caching. This file must remain at the
// old registration URL so browsers with the previous worker can update to this
// version, clear stale app-shell caches, unregister, and return all requests to
// the network.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));

    await self.clients.claim();
    await self.registration.unregister();

    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window',
    });

    await Promise.all(
      clients.map((client, index) => client.navigate(resetUrl(client.url, index))),
    );
  })());
});

function resetUrl(rawUrl, index) {
  const url = new URL(rawUrl);
  url.searchParams.set('v', '20260531-sw-reset');
  url.searchParams.set('ts', `${Date.now()}-${index}`);
  return url.href;
}
