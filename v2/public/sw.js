// Retire the old cache-first reference shell during the console migration.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('firefighter-v2-shell-')) await caches.delete(key);
  await self.clients.claim();
  await self.registration.unregister();
})()));
