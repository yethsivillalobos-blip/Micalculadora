// Service Worker de la Calculadora de Precio de Venta Global (Beta)
// Estrategia:
//  - App shell (html, manifest, iconos): cache-first, para que abra instantáneo y offline.
//  - Tailwind CDN / Google Fonts (externos): cache-first con actualización en segundo plano
//    (stale-while-revalidate), así la app no se queda "sin estilos" sin conexión.
//  - API de tasas de cambio (open.er-api.com): siempre network-only. Nunca se cachea,
//    porque una tasa vieja podría ser engañosa; si falla, la propia app ya maneja
//    el modo "usando tasa manual/local".

const CACHE_VERSION = 'pv-global-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isExchangeRateApi(url) {
  return url.hostname.includes('open.er-api.com');
}

function isExternalAsset(url) {
  return (
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Nunca cachear la API de tasas de cambio: siempre red.
  if (isExchangeRateApi(url)) {
    return; // deja que el navegador la maneje normalmente
  }

  // 2. Tailwind CDN y Google Fonts: cache-first + revalidación en segundo plano.
  if (isExternalAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((response) => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Resto del app shell (mismo origen): cache-first, cae a red si no está cacheado.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
