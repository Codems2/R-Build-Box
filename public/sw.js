/*
 * Service worker de R-Build Box.
 *
 * Objetivo: que la web sea instalable como app (PWA) y arranque rápido / sin
 * conexión mostrando el «shell» (index.html + JS/CSS). NUNCA cachea peticiones
 * a otros orígenes (Supabase, fuentes...) ni peticiones que no sean GET, para
 * no servir datos privados obsoletos ni romper la autenticación.
 */
const CACHE = 'rbuildbox-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no tocar Supabase u otros orígenes

  // Navegaciones (abrir la app): red primero, con index.html cacheado de reserva
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put('/index.html', net.clone());
          return net;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match('/index.html');
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Estáticos del propio dominio (JS/CSS/imagenes): stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((net) => {
          if (net && net.status === 200 && net.type === 'basic') cache.put(request, net.clone());
          return net;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
